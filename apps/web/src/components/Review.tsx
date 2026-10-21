import { missingFrames, missingRounds, type Session, type UploadState } from '@groupshot/protocol'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl, deleteKept, type Kept, keepOnline } from '@/lib/api'
import { composeVideoStrip, fromSprite } from '@/lib/clip'
import { composeGif, composeImage } from '@/lib/compose'
import { saveMemory } from '@/lib/memories'
import { composePrintSheet, PAPERS, type PaperId } from '@/lib/print'
import { buildRecap, recapLines } from '@/lib/session-recap'
import { uploadKey } from '@/lib/store'
import { getTemplate } from '@/templates'
import { PrinterAnimation, printerState } from './PrinterAnimation'
import { QrCode } from './QrCode'

interface Props {
  session: Session
  me: string
  names: Record<string, string>
  roomCode?: string
  localShots: Record<string, Blob>
  localClips?: Record<string, ImageBitmap[]>
  uploads?: Record<string, UploadState>
  uploadError?: string | null
  canRestart: boolean
  presentIds?: string[]
  onAgain: () => void
  onRetake?: (rounds: number[]) => void
  onRetryUploads?: () => void
}

const panel = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.1 } },
}
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 34 } },
} as const

const bitmapCache = new Map<string, Promise<ImageBitmap | null>>()

function bitmapFromUrl(url: string) {
  let p = bitmapCache.get(url)
  if (!p) {
    p = fetch(apiUrl(url), { signal: AbortSignal.timeout(25_000) })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => createImageBitmap(b))
      .catch(() => {
        bitmapCache.delete(url)
        return null
      })
    bitmapCache.set(url, p)
  }
  return p
}

function stamp(d = new Date()) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
}

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export function Review({
  session,
  me,
  names,
  roomCode,
  localShots,
  localClips = {},
  uploads = {},
  uploadError,
  canRestart,
  presentIds,
  onAgain,
  onRetake,
  onRetryUploads,
}: Props) {
  const reduce = useReducedMotion()
  const t = getTemplate(session.settings.templateId)
  const [rounds, setRounds] = useState<(ImageBitmap | null)[][] | null>(null)
  const [caption, setCaption] = useState('')
  const [memoryTitle, setMemoryTitle] = useState('')
  const [memoryNote, setMemoryNote] = useState('')
  const [preview, setPreview] = useState<{ url: string; blob: Blob; caption: string } | null>(null)
  const [busy, setBusy] = useState<'gif' | 'share' | 'link' | 'print' | 'save' | 'revoke' | null>(null)
  const [link, setLink] = useState<Kept | null>(null)
  const [copied, setCopied] = useState(false)
  const [paper, setPaper] = useState<PaperId>(() => (/^en-(US|CA)|es-MX/.test(navigator.language) ? 'letter' : 'a4'))
  const [acceptIncomplete, setAcceptIncomplete] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)
  const [composeError, setComposeError] = useState('')
  const [retry, setRetry] = useState(0)
  const date = useMemo(() => stamp(), [])
  const peopleNames = session.peerIds.map((id) => names[id] ?? 'Friend')
  const shotsKey = JSON.stringify(session.shots)
  const output = session.settings.output ?? 'photo'
  const wantsVideo = output !== 'photo'
  const clipsKey = JSON.stringify(session.clips ?? [])
  const [view, setView] = useState<'video' | 'photo'>(wantsVideo ? 'video' : 'photo')
  const [video, setVideo] = useState<{ url: string; blob: Blob } | null>(null)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoError, setVideoError] = useState('')
  const [clips, setClips] = useState<(ImageBitmap[] | null)[][] | null>(null)

  useEffect(() => {
    if (!wantsVideo) return
    let live = true
    Promise.all(
      session.shots.map((_, i) =>
        Promise.all(
          session.peerIds.map((id) => {
            const local = id === me ? localClips[`${session.id}:${i}`] : undefined
            if (local) return Promise.resolve(local)
            const url = session.clips?.[i]?.[id]
            if (!url) return Promise.resolve(null)
            return fetch(apiUrl(url))
              .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
              .then(fromSprite)
              .catch(() => null)
          }),
        ),
      ),
    ).then((c) => live && setClips(c))
    return () => {
      live = false
    }
  }, [wantsVideo, session.id, clipsKey, me, localClips, session.peerIds, session.shots])

  useEffect(() => {
    let live = true
    const own = new Map<string, Promise<ImageBitmap>>()
    Promise.all(
      session.shots.map((slot, i) =>
        Promise.all(
          session.peerIds.map((id) => {
            const local = id === me ? localShots[`${session.id}:${i}`] : undefined
            if (local) {
              const k = `${session.id}:${i}`
              if (!own.has(k)) own.set(k, createImageBitmap(local))
              return own.get(k) as Promise<ImageBitmap>
            }
            const url = slot[id]
            return url && url !== 'local' ? bitmapFromUrl(url) : Promise.resolve(null)
          }),
        ),
      ),
    ).then((r) => live && setRounds(r))
    return () => {
      live = false
    }
  }, [session.id, shotsKey, me, localShots, session.peerIds, session.shots])

  const input = useMemo(
    () => (rounds ? { rounds, caption, date, names: peopleNames, scene: session.settings.scene } : null),
    [rounds, caption, date, peopleNames.join('|'), session.settings.scene],
  )
  const last = useRef<string | null>(null)
  const lastVideo = useRef<string | null>(null)

  useEffect(() => {
    if (!wantsVideo || !input || !clips) return
    let live = true
    setVideoProgress(0)
    setVideoError('')
    setVideo(null)
    const id = setTimeout(() => {
      void composeVideoStrip(t, input, clips, output as 'boomerang' | 'live', (p) => live && setVideoProgress(p))
        .then((blob) => {
          if (!live) return
          const url = URL.createObjectURL(blob)
          if (lastVideo.current) URL.revokeObjectURL(lastVideo.current)
          lastVideo.current = url
          setVideo({ url, blob })
        })
        .catch((err: Error) => {
          if (live) {
            setNote(err.message)
            setVideoError(err.message)
          }
        })
    }, 400)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [wantsVideo, input, clips, t, output])

  useEffect(() => {
    if (!input) return
    let live = true
    setComposeError('')
    const id = setTimeout(() => {
      void composeImage(t.id, input)
        .then((blob) => {
          if (!live) return
          const url = URL.createObjectURL(blob)
          if (last.current) URL.revokeObjectURL(last.current)
          last.current = url
          setPreview({ url, blob, caption: input.caption })
        })
        .catch(() => live && setComposeError('The photo couldn’t be developed. Try again.'))
    }, 200)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [input, t.id, retry])

  useEffect(
    () => () => {
      if (last.current) URL.revokeObjectURL(last.current)
      if (lastVideo.current) URL.revokeObjectURL(lastVideo.current)
    },
    [],
  )

  const base = `groupshot-${t.id}-${Date.now().toString(36)}`
  const previewReady = Boolean(preview && preview.caption === caption && !composeError)
  const developmentState = printerState({
    collecting: view === 'video' && wantsVideo ? !clips : !rounds,
    failed: Boolean(view === 'video' && wantsVideo ? videoError : composeError),
    ready: view === 'video' && wantsVideo ? Boolean(video) : previewReady,
  })

  const gaps = missingFrames(session)
  const missing = gaps.length
  const present = new Set(presentIds ?? session.peerIds)
  const retakeRounds = missingRounds({ ...session, peerIds: session.peerIds.filter((id) => present.has(id)) })
  const incomplete = missing > 0
  const unlocked = !incomplete || acceptIncomplete
  const recap = useMemo(() => buildRecap({ session, names, templateName: t.name }), [session, names, t.name, shotsKey])

  const mine = roomCode ? session.shots.map((_, i) => uploads[uploadKey('photo', session.id, i)]).filter(Boolean) : []
  const failedUploads = mine.filter((u) => u === 'failed').length
  const sending = mine.filter((u) => u === 'pending' || u === 'uploading').length

  useEffect(() => {
    if (!incomplete) {
      setAcceptIncomplete(false)
      setConfirming(false)
    }
  }, [incomplete])

  async function saveGif() {
    if (!input) return
    setBusy('gif')
    setNote('')
    try {
      download(await composeGif(t.id, input), `${base}.gif`)
    } catch (err) {
      setNote((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function share() {
    if (!preview) return
    const file = new File([preview.blob], `${base}.png`, { type: 'image/png' })
    if (!navigator.canShare?.({ files: [file] })) return download(preview.blob, file.name)
    setBusy('share')
    await navigator.share({ files: [file], title: 'Our groupshot' }).catch(() => {})
    setBusy(null)
  }

  async function makeLink() {
    const blob = view === 'video' && video ? video.blob : preview?.blob
    if (!blob) return
    setBusy('link')
    setNote('')
    try {
      const kept = await keepOnline(blob, roomCode)
      setLink(kept)
      const ok = await navigator.clipboard
        ?.writeText(kept.url)
        .then(() => true)
        .catch(() => false)
      setCopied(Boolean(ok))
    } catch (err) {
      setNote((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function revokeLink() {
    if (!link) return
    setBusy('revoke')
    setNote('')
    try {
      await deleteKept(link.id, link.deleteToken)
      setLink(null)
      setNote('Link deleted. Anyone who opens it now sees that it expired.')
    } catch (err) {
      setNote((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function printSheet() {
    if (!preview) return
    setBusy('print')
    setNote('')
    try {
      download(await composePrintSheet(preview.blob, paper), `${base}-${paper}.jpg`)
    } catch (err) {
      setNote((err as Error).message || 'The print sheet couldn’t be made. Try again.')
    } finally {
      setBusy(null)
    }
  }

  async function keepMemory() {
    if (!preview) return
    setBusy('save')
    setNote('')
    try {
      const title = memoryTitle.trim() || `${t.name} · ${date}`
      await saveMemory({
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        title,
        caption: caption.trim(),
        note: memoryNote.trim(),
        participants: peopleNames,
        templateId: t.id,
        image: preview.blob,
        recap,
        ...(link ? { shareLink: link } : {}),
      })
      setSaved(true)
    } catch (err) {
      setNote((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const gapList = gaps.map((g) => `frame ${g.round + 1} (${names[g.peerId] ?? 'Friend'})`)

  return (
    <div className="slot-wrap">
      <div className="slot-machine">
        <PrinterAnimation state={developmentState} />
        <div className="slot-mouth" aria-hidden="true" />
        <div className="slot-output">
          {view === 'video' && wantsVideo ? (
            video ? (
              <video
                src={video.url}
                className="clip-video"
                autoPlay
                loop
                muted
                playsInline
                aria-label={`${t.name} video of ${peopleNames.join(', ')}`}
              />
            ) : (
              <div className="grid aspect-[3/4] w-64 max-w-full place-items-center p-4 text-center muted" role="status">
                {clips ? (
                  <span className="grid gap-3 justify-items-center">
                    <span className="progress" style={{ '--p': videoProgress } as React.CSSProperties} />
                    Rolling the film… {Math.round(videoProgress * 100)}%
                  </span>
                ) : (
                  'Collecting everyone’s clips…'
                )}
              </div>
            )
          ) : preview ? (
            <img
              src={preview.url}
              alt={`${t.name} of ${peopleNames.join(', ')}`}
              className="printed-photo print-feed-once"
            />
          ) : (
            <div className="grid aspect-[3/4] w-64 max-w-full place-items-center p-4 text-center muted">
              {composeError || 'Putting your moments together…'}
            </div>
          )}
        </div>
        {composeError && (
          <div role="alert" className="grid justify-items-center gap-3">
            <p>{composeError}</p>
            <button type="button" className="btn-secondary" onClick={() => setRetry((n) => n + 1)}>
              Develop again
            </button>
          </div>
        )}
      </div>

      <motion.aside className="slot-panel" variants={panel} initial={reduce ? false : 'hidden'} animate="show">
        <motion.h2 variants={item} className="display">
          {incomplete ? 'Almost there' : 'That’s a keeper'}
        </motion.h2>
        <motion.p variants={item}>
          {incomplete
            ? `${missing} frame${missing === 1 ? '' : 's'} didn’t make it, so ${missing === 1 ? 'that spot is' : 'those spots are'} blank.`
            : 'Add a caption, then save it or send it to the group.'}
        </motion.p>

        <AnimatePresence initial={false}>
          {incomplete && (
            <motion.section
              key="gaps"
              className="gap-card"
              aria-labelledby="gaps-title"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="gap-card-inner">
                <h3 id="gaps-title" className="stamp">
                  Missing
                </h3>
                <ul className="gap-list">
                  {gaps.map((g) => (
                    <li key={`${g.round}-${g.peerId}`}>
                      <span className="gap-frame">{g.round + 1}</span>
                      {names[g.peerId] ?? 'Friend'}
                      {g.peerId === me ? ' (you)' : ''}
                    </li>
                  ))}
                </ul>
                {canRestart && onRetake ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!retakeRounds.length}
                    onClick={() => onRetake(retakeRounds)}
                  >
                    Fill missing frames
                  </button>
                ) : (
                  <p className="caption">The host can reshoot just the missing frames. Everything else stays.</p>
                )}
                {canRestart && (
                  <p className="caption">
                    Reshoots frame{retakeRounds.length === 1 ? '' : 's'} {retakeRounds.map((r) => r + 1).join(', ')}{' '}
                    only. Frames that already came out are kept.
                  </p>
                )}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {roomCode && mine.length > 0 && (
          <motion.div variants={item} className="upload-row" role="status" aria-live="polite">
            <span className="stamp muted">Your photos</span>
            <span className="upload-pills" aria-hidden="true">
              {session.shots.map((_, i) => {
                const key = uploadKey('photo', session.id, i)
                const u = uploads[key]
                return u ? <i key={key} data-state={u} /> : null
              })}
            </span>
            <span className="caption">
              {failedUploads ? `${failedUploads} didn’t upload` : sending ? `Sending ${sending}…` : 'All sent'}
            </span>
            {failedUploads > 0 && onRetryUploads && (
              <button type="button" className="btn-secondary btn-sm" onClick={onRetryUploads}>
                Retry upload
              </button>
            )}
          </motion.div>
        )}
        {failedUploads > 0 && uploadError && (
          <p className="caption" role="alert">
            {uploadError} Your photos are still on this device, so nothing needs reshooting.
          </p>
        )}

        <motion.label variants={item} className="field">
          <span className="label">Caption on the strip</span>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={t.caption} maxLength={48} />
        </motion.label>
        <motion.label variants={item} className="field">
          <span className="label">Name this memory</span>
          <input
            value={memoryTitle}
            onChange={(e) => setMemoryTitle(e.target.value)}
            placeholder={`${t.name} · ${date}`}
            maxLength={60}
          />
        </motion.label>
        <motion.label variants={item} className="field">
          <span className="label">A note for later</span>
          <textarea
            value={memoryNote}
            onChange={(e) => setMemoryNote(e.target.value)}
            rows={3}
            maxLength={240}
            placeholder="Add a short note"
          />
        </motion.label>
        {wantsVideo && (
          <motion.fieldset variants={item} className="output-switch" aria-label="Show">
            <button
              type="button"
              aria-pressed={view === 'video'}
              onClick={() => {
                setView('video')
                setLink(null)
              }}
            >
              <span aria-hidden="true">▶</span> Video strip
            </button>
            <button
              type="button"
              aria-pressed={view === 'photo'}
              onClick={() => {
                setView('photo')
                setLink(null)
              }}
            >
              <span aria-hidden="true">◉</span> Photo strip
            </button>
          </motion.fieldset>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {!unlocked ? (
            <motion.div
              key="locked"
              className="grid gap-3"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              {confirming ? (
                <div
                  className="confirm"
                  role="alertdialog"
                  aria-labelledby="confirm-title"
                  aria-describedby="confirm-body"
                >
                  <b id="confirm-title">Share it with blank spaces?</b>
                  <p id="confirm-body" className="caption">
                    {gapList.length <= 3 ? gapList.join(', ') : `${gapList.length} frames`} will show as empty.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      autoFocus
                      onClick={() => {
                        setAcceptIncomplete(true)
                        setConfirming(false)
                      }}
                    >
                      Use it anyway
                    </button>
                    <button type="button" className="btn-quiet btn-sm" onClick={() => setConfirming(false)}>
                      Wait for the retake
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="btn-secondary" onClick={() => setConfirming(true)}>
                  Share incomplete strip…
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="actions"
              className="grid gap-3"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              {view === 'video' && wantsVideo ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!video}
                  onClick={() =>
                    video && download(video.blob, `${base}.${video.blob.type.includes('mp4') ? 'mp4' : 'webm'}`)
                  }
                >
                  {video ? 'Download video' : 'Rolling…'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!previewReady}
                  onClick={() => preview && download(preview.blob, `${base}.png`)}
                >
                  Download strip
                </button>
              )}
              <button
                type="button"
                className="btn-secondary"
                disabled={!previewReady || busy === 'save' || saved}
                onClick={keepMemory}
              >
                {saved ? 'Kept on this device ✓' : busy === 'save' ? 'Saving…' : 'Keep on this device'}
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" className="btn-secondary" disabled={!input || busy === 'gif'} onClick={saveGif}>
                  {busy === 'gif' ? 'Making GIF…' : 'GIF'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!previewReady || busy === 'share'}
                  onClick={share}
                >
                  Share
                </button>
              </div>
              <div className="print-row">
                <fieldset className="output-switch" aria-label="Paper size">
                  {(Object.keys(PAPERS) as PaperId[]).map((id) => (
                    <button key={id} type="button" aria-pressed={paper === id} onClick={() => setPaper(id)}>
                      {PAPERS[id].label}
                    </button>
                  ))}
                </fieldset>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!previewReady || busy === 'print'}
                  onClick={printSheet}
                >
                  {busy === 'print' ? 'Laying out…' : 'Download print sheet'}
                </button>
              </div>
              {!link && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!previewReady || busy === 'link'}
                  onClick={makeLink}
                >
                  {busy === 'link' ? 'Uploading…' : 'Get a link (24h)'}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {link && (
            <motion.section
              key={link.id}
              className="link-card"
              aria-label="Share link"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              <QrCode value={link.url} label="QR code for the share link" size={148} />
              <div className="grid gap-2 content-start">
                <p className="caption" role="status">
                  {copied ? 'Link copied. ' : ''}Anyone with the link or code can see it until{' '}
                  {new Date(link.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} tomorrow.
                </p>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    navigator.clipboard
                      ?.writeText(link.url)
                      .then(() => setCopied(true))
                      .catch(() => setCopied(false))
                  }
                >
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" className="btn-quiet btn-sm" disabled={busy === 'revoke'} onClick={revokeLink}>
                  {busy === 'revoke' ? 'Deleting…' : 'Delete link now'}
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {note && (
            <motion.p
              key={note}
              className="notice"
              role="alert"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {note}
              <button type="button" onClick={() => setNote('')}>
                Dismiss
              </button>
            </motion.p>
          )}
          {saved && (
            <motion.p
              key="saved"
              className="notice notice-ok"
              role="status"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              Saved in this browser. Find it under Saved strips on the home page.
            </motion.p>
          )}
        </AnimatePresence>

        <motion.section variants={item} className="recap" aria-labelledby="recap-title">
          <h3 id="recap-title" className="stamp muted">
            This sitting
          </h3>
          <dl>
            {recapLines(recap).map((l) => (
              <div key={l.label}>
                <dt>{l.label}</dt>
                <dd>{l.value}</dd>
              </div>
            ))}
          </dl>
        </motion.section>

        <motion.div variants={item} className="border-t border-hairline pt-5">
          {canRestart ? (
            <button type="button" className="btn-secondary w-full" onClick={onAgain}>
              Shoot again
            </button>
          ) : (
            <p className="text-sm">The host can start another round whenever you’re ready.</p>
          )}
        </motion.div>
      </motion.aside>
    </div>
  )
}
