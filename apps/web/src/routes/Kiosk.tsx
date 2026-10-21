import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useBlocker } from 'react-router'
import { getLicense, heartbeat, saveLicense } from '@/lib/business'
import { hashPin, IDLE_CHOICES, type KioskConfig, kioskId, loadConfig, onStripDone, saveConfig } from '@/lib/kiosk'
import { useSeo } from '@/lib/seo'
import { useBooth } from '@/lib/store'
import '@/business.css'

const Booth = lazy(() => import('./Booth'))
const VERSION = import.meta.env.VITE_APP_VERSION ?? 'web'
const WARN_SECONDS = 12

type Screen = 'attract' | 'run'

export default function Kiosk() {
  useSeo({ title: 'Kiosk', path: '/kiosk', noindex: true })
  const [config, setConfig] = useState<KioskConfig | null>(loadConfig)
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const original = link?.getAttribute('href')
    link?.setAttribute('href', '/kiosk.webmanifest')
    return () => {
      if (original) link?.setAttribute('href', original)
    }
  }, [])
  if (!config) {
    return (
      <div className="kiosk">
        <Setup
          onSave={(c) => {
            saveConfig(c)
            saveLicense(c.license)
            setConfig(c)
          }}
        />
      </div>
    )
  }
  return (
    <Running
      config={config}
      onExit={() => {
        saveConfig(null)
        setConfig(null)
      }}
    />
  )
}

function Setup({ onSave }: { onSave: (c: KioskConfig) => void }) {
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [idle, setIdle] = useState(90)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="kiosk-setup">
      <h1 className="display biz-h2">Set up this kiosk</h1>
      <p className="caption">
        You need a Business key.{' '}
        <Link className="link-plain" to="/business">
          Get one here
        </Link>
        .
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          try {
            const info = await getLicense(key)
            if (!info.valid)
              throw new Error(info.reason === 'revoked' ? 'That key was revoked.' : 'That key has expired.')
            onSave({
              license: info.key,
              name: name.trim() || info.label || 'Photo booth',
              pinHash: await hashPin(pin),
              idleSeconds: idle,
            })
          } catch (err) {
            setError((err as Error).message)
            setBusy(false)
          }
        }}
      >
        <div className="field">
          <label htmlFor="k-key">License key</label>
          <input
            id="k-key"
            className="code-input"
            autoCapitalize="characters"
            placeholder="GSB-XXXX-XXXX-XXXX"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
          />
        </div>
        <div className="field">
          <label htmlFor="k-name">Name on the start screen</label>
          <input
            id="k-name"
            maxLength={40}
            placeholder="Aina & Daniel's wedding"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="k-pin">Exit PIN (4 to 8 digits)</label>
          <input
            id="k-pin"
            inputMode="numeric"
            autoComplete="off"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          />
        </div>
        <fieldset className="field">
          <legend className="label">Reset after this long without a touch</legend>
          <div className="seg-row">
            {IDLE_CHOICES.map((s) => (
              <button key={s} type="button" className="tag" aria-pressed={idle === s} onClick={() => setIdle(s)}>
                {s} seconds
              </button>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={busy || key.trim().length < 6 || pin.length < 4}>
          {busy ? 'Checking key…' : 'Save and start'}
        </button>
      </form>
    </div>
  )
}

function Running({ config, onExit }: { config: KioskConfig; onExit: () => void }) {
  const [screen, setScreen] = useState<Screen>('attract')
  const [round, setRound] = useState(0)
  const [pinOpen, setPinOpen] = useState(false)
  const [warn, setWarn] = useState<number | null>(null)
  const [locked, setLocked] = useState<string | null>(null)
  const sessions = useRef(0)
  const lastTouch = useRef(Date.now())
  const wake = useRef<WakeLockSentinel | null>(null)

  const reset = useCallback(() => {
    setWarn(null)
    setScreen('attract')
    setRound((n) => n + 1)
  }, [])

  const blocker = useBlocker(({ nextLocation }) => !nextLocation.pathname.startsWith('/kiosk'))
  useEffect(() => {
    if (blocker.state === 'blocked') {
      blocker.reset()
      reset()
    }
  }, [blocker.state])

  useEffect(() => {
    let live = true
    const beat = () =>
      heartbeat({
        id: kioskId(),
        license: config.license,
        name: config.name,
        sessions: sessions.current,
        version: String(VERSION),
      })
        .then((r) => live && setLocked(r.licensed ? null : (r.reason ?? 'This key cannot run a kiosk right now.')))
        .catch(() => {})
    void beat()
    const t = setInterval(beat, 60_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [config.license, config.name])

  useEffect(() => onStripDone(() => (sessions.current += 1)), [])

  useEffect(() => {
    if (screen !== 'run') return
    void navigator.wakeLock
      ?.request('screen')
      .then((l) => {
        wake.current = l
      })
      .catch(() => {})
    return () => {
      void wake.current?.release().catch(() => {})
      wake.current = null
    }
  }, [screen])

  useEffect(() => {
    if (screen !== 'run') return
    const touch = () => {
      lastTouch.current = Date.now()
      setWarn(null)
    }
    touch()
    const events = ['pointerdown', 'keydown', 'touchstart'] as const
    for (const e of events) window.addEventListener(e, touch, { passive: true })
    const off = useBooth.subscribe(() => {
      lastTouch.current = Date.now()
    })
    const timer = setInterval(() => {
      const quiet = (Date.now() - lastTouch.current) / 1000
      if (quiet >= config.idleSeconds + WARN_SECONDS) reset()
      else if (quiet >= config.idleSeconds) setWarn(Math.ceil(config.idleSeconds + WARN_SECONDS - quiet))
    }, 1000)
    return () => {
      for (const e of events) window.removeEventListener(e, touch)
      off()
      clearInterval(timer)
    }
  }, [screen, config.idleSeconds, reset])

  function start() {
    void document.documentElement.requestFullscreen?.().catch(() => {})
    setScreen('run')
  }

  async function leave() {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
    setPinOpen(false)
    onExit()
  }

  if (locked) {
    return (
      <div className="kiosk">
        <div className="kiosk-locked" role="alert">
          <h1 className="display biz-h2">This kiosk is paused</h1>
          <p>{locked}</p>
          <button type="button" className="btn-secondary" onClick={() => setPinOpen(true)}>
            Host options
          </button>
        </div>
        {pinOpen && <PinDialog hash={config.pinHash} onCancel={() => setPinOpen(false)} onOk={leave} />}
      </div>
    )
  }

  return (
    <div
      className="kiosk"
      onClickCapture={(e) => {
        const link = (e.target as HTMLElement).closest('a[href]')
        if (link && screen === 'run') {
          e.preventDefault()
          e.stopPropagation()
          reset()
        }
      }}
    >
      {screen === 'attract' ? (
        <div className="kiosk-attract">
          <p className="stamp">Groupshot</p>
          <h1 className="display">{config.name}</h1>
          <p>Take a photo strip, then scan the code to keep it.</p>
          <button type="button" className="btn-primary kiosk-start" onClick={start}>
            Touch to start
          </button>
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="kiosk-attract">
              <p>Setting up the booth…</p>
            </div>
          }
        >
          <Booth key={round} mode="solo" />
        </Suspense>
      )}
      <button type="button" className="kiosk-corner" aria-label="Host options" onClick={() => setPinOpen(true)} />
      {warn !== null && (
        <div className="kiosk-banner" role="alert">
          <span>Still there? Starting over in {warn}s</span>
          <button type="button" className="btn-quiet btn-sm" onClick={() => (lastTouch.current = Date.now())}>
            Keep going
          </button>
        </div>
      )}
      {pinOpen && <PinDialog hash={config.pinHash} onCancel={() => setPinOpen(false)} onOk={leave} />}
    </div>
  )
}

function PinDialog({ hash, onOk, onCancel }: { hash: string; onOk: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState('')
  const [bad, setBad] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  return (
    <div className="kiosk-modal" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby="pin-h">
        <h2 id="pin-h" className="display biz-h2">
          Host PIN
        </h2>
        <form
          className="field"
          onSubmit={async (e) => {
            e.preventDefault()
            if ((await hashPin(pin)) === hash) onOk()
            else {
              setBad(true)
              setPin('')
            }
          }}
        >
          <label htmlFor="pin">Enter the exit PIN to leave kiosk mode</label>
          <input
            ref={input}
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => {
              setBad(false)
              setPin(e.target.value.replace(/\D/g, '').slice(0, 8))
            }}
          />
          {bad && (
            <p className="form-error" role="alert">
              That PIN is not right.
            </p>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <button type="submit" className="btn-primary btn-sm" disabled={pin.length < 4}>
              Leave kiosk mode
            </button>
            <button type="button" className="btn-quiet btn-sm" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
