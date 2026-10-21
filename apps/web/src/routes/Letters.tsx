import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Coin } from '@/components/Coin'
import { Shell } from '@/components/Shell'
import { markTried } from '@/lib/path'

interface Letter {
  id: string
  to: string
  body: string
  openAt: number
  createdAt: number
}

const KEY = 'groupshot.letters'
const DAY = 86_400_000

function load(): Letter[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? (list as Letter[]) : []
  } catch {
    return []
  }
}

function store(list: Letter[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {}
}

const PRESETS = [
  { label: '1 week', days: 7 },
  { label: '1 month', days: 30 },
  { label: '6 months', days: 182 },
  { label: '1 year', days: 365 },
]

export default function Letters() {
  const [letters, setLetters] = useState(load)
  const [to, setTo] = useState('The group')
  const [body, setBody] = useState('')
  const [days, setDays] = useState(30)
  const [now, setNow] = useState(Date.now())
  const [opened, setOpened] = useState<string | null>(null)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  function seal(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    const next = [
      {
        id: crypto.randomUUID(),
        to: to.trim() || 'The group',
        body: body.trim(),
        openAt: Date.now() + days * DAY,
        createdAt: Date.now(),
      },
      ...letters,
    ]
    setLetters(next)
    store(next)
    setBody('')
    markTried('letters')
  }

  function remove(id: string) {
    const next = letters.filter((l) => l.id !== id)
    setLetters(next)
    store(next)
  }

  return (
    <Shell right={<Link to="/memories">Saved strips</Link>}>
      <section className="letters">
        <div className="letters-head">
          <Coin id="letters" size={72} />
          <div>
            <p className="stamp muted">Time capsule</p>
            <h1 className="display">Letters to the future</h1>
            <p className="muted max-w-[44ch]">
              Write something now. It stays sealed on this device until the day you pick.
            </p>
          </div>
        </div>
        <form className="letter-form" onSubmit={seal}>
          <div className="field">
            <label htmlFor="letter-to">To</label>
            <input id="letter-to" value={to} maxLength={40} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="letter-body">Letter</label>
            <textarea
              id="letter-body"
              value={body}
              maxLength={2000}
              rows={6}
              placeholder="Remember the night we…"
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <fieldset className="chips">
            <legend className="stamp muted">Open in</legend>
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                className="tag"
                aria-pressed={days === p.days}
                onClick={() => setDays(p.days)}
              >
                {p.label}
              </button>
            ))}
          </fieldset>
          <button type="submit" className="btn-primary justify-self-start" disabled={!body.trim()}>
            Seal the letter
          </button>
        </form>

        <ul className="letter-list">
          {letters.map((l) => {
            const ready = now >= l.openAt
            const left = Math.ceil((l.openAt - now) / DAY)
            return (
              <li key={l.id} className="letter" data-sealed={!ready || undefined}>
                <div className="letter-top">
                  <span className="stamp muted">
                    To {l.to} · written {new Date(l.createdAt).toLocaleDateString()}
                  </span>
                  <span className="stamp">
                    {ready ? 'Ready to open' : `Opens in ${left} day${left === 1 ? '' : 's'}`}
                  </span>
                </div>
                {ready && opened === l.id ? (
                  <p className="letter-body">{l.body}</p>
                ) : (
                  <div className="letter-seal" aria-hidden="true" />
                )}
                <div className="flex flex-wrap gap-2">
                  {ready && opened !== l.id && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setOpened(l.id)}>
                      Open it
                    </button>
                  )}
                  <button type="button" className="btn-quiet btn-sm" onClick={() => remove(l.id)}>
                    Throw away
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </Shell>
  )
}
