import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Logo } from '@/components/Logo'
import { deleteKept } from '@/lib/api'
import {
  deleteMemory,
  importMemoriesFile,
  listMemories,
  type Memory,
  saveMemory,
  serializeMemories,
} from '@/lib/memories'
import { recapLines } from '@/lib/session-recap'

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

type Flash = { tone: 'ok' | 'error'; text: string }

export default function Memories() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState<Flash | null>(null)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const reduce = useReducedMotion()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setMemories(await listMemories())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(memory: Memory) {
    setDeleting(memory.id)
    setFlash(null)
    try {
      if (memory.shareLink && memory.shareLink.expiresAt > Date.now()) {
        await deleteKept(memory.shareLink.id, memory.shareLink.deleteToken).catch(() => {})
      }
      await deleteMemory(memory.id)
      setMemories((saved) => saved.filter((m) => m.id !== memory.id))
    } catch (err) {
      setFlash({ tone: 'error', text: (err as Error).message })
    } finally {
      setDeleting(null)
      setConfirmDelete(null)
    }
  }

  async function revoke(memory: Memory) {
    if (!memory.shareLink) return
    setFlash(null)
    try {
      await deleteKept(memory.shareLink.id, memory.shareLink.deleteToken)
      const next = { ...memory, shareLink: undefined }
      await saveMemory(next)
      setMemories((saved) => saved.map((m) => (m.id === memory.id ? next : m)))
      setFlash({ tone: 'ok', text: 'Share link deleted.' })
    } catch (err) {
      setFlash({ tone: 'error', text: (err as Error).message })
    }
  }

  async function exportAll() {
    setBusy('export')
    setFlash(null)
    try {
      const text = await serializeMemories(memories)
      const day = new Date().toISOString().slice(0, 10)
      download(new Blob([text], { type: 'application/json' }), `memories-${day}.groupshot.json`)
      setFlash({ tone: 'ok', text: `Exported ${memories.length} memor${memories.length === 1 ? 'y' : 'ies'}.` })
    } catch (err) {
      setFlash({ tone: 'error', text: (err as Error).message || 'Export failed. Try again.' })
    } finally {
      setBusy(null)
    }
  }

  async function importFile(file: File) {
    setBusy('import')
    setFlash(null)
    try {
      const { added, skipped } = await importMemoriesFile(file)
      await load()
      const parts = [`Added ${added} memor${added === 1 ? 'y' : 'ies'}.`]
      if (skipped) parts.push(`${skipped} ${skipped === 1 ? 'was' : 'were'} already here.`)
      setFlash({ tone: 'ok', text: parts.join(' ') })
    } catch (err) {
      setFlash({ tone: 'error', text: `${(err as Error).message} Nothing was imported.` })
    } finally {
      setBusy(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <main className="memories-page">
      <header className="site-header">
        <Logo />
        <Link to="/" className="btn-secondary btn-sm">
          Back to Groupshot
        </Link>
      </header>
      <section aria-labelledby="memories-title">
        <div className="memories-heading">
          <div>
            <p className="stamp muted">Saved on this device</p>
            <h1 id="memories-title" className="display">
              Your photo shelf
            </h1>
          </div>
          <div className="memories-tools">
            <p className="muted">Strips stay in this browser until you delete them. Export a backup to move them.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={!memories.length || busy !== null}
                onClick={() => void exportAll()}
              >
                {busy === 'export' ? 'Exporting…' : 'Export memories'}
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={busy !== null}
                onClick={() => fileInput.current?.click()}
              >
                {busy === 'import' ? 'Importing…' : 'Import memories'}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                tabIndex={-1}
                aria-label="Choose a Groupshot export file"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void importFile(file)
                }}
              />
            </div>
          </div>
        </div>

        <AnimatePresence>
          {flash && (
            <motion.div
              key={flash.text}
              className={`notice ${flash.tone === 'ok' ? 'notice-ok' : ''}`}
              role={flash.tone === 'ok' ? 'status' : 'alert'}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <span>{flash.text}</span>
              <button type="button" onClick={() => setFlash(null)}>
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {loading && (
          <div role="status" className="memory-skeletons" aria-label="Loading saved strips">
            {[0, 1, 2].map((i) => (
              <div key={i} className="memory-skeleton" />
            ))}
          </div>
        )}
        {error && (
          <div className="notice" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}
        {!loading && !error && memories.length === 0 && (
          <motion.div className="memory-empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <h2>No strips saved yet</h2>
            <p>After a sitting, choose “Keep on this device” to add its finished strip here, or import a backup.</p>
            <Link to="/solo" className="btn-primary">
              Take a photo
            </Link>
          </motion.div>
        )}
        {memories.length > 0 && (
          <ul className="memory-list" aria-label="Saved photo strips">
            <AnimatePresence initial={!reduce}>
              {memories.map((memory, i) => (
                <motion.li
                  className="memory-item"
                  key={memory.id}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.04 } }}
                  exit={{ opacity: 0, x: -24, transition: { duration: 0.2 } }}
                >
                  <MemoryImage memory={memory} />
                  <div className="memory-copy">
                    <h2>{memory.title}</h2>
                    <p className="stamp muted">{new Date(memory.createdAt).toLocaleDateString()}</p>
                    <p>{memory.participants.join(', ')}</p>
                    {memory.caption && <p className="muted">{memory.caption}</p>}
                    {memory.note && <p className="memory-note">{memory.note}</p>}
                    {memory.recap && (
                      <details className="memory-recap">
                        <summary>Sitting details</summary>
                        <dl>
                          {recapLines(memory.recap).map((l) => (
                            <div key={l.label}>
                              <dt>{l.label}</dt>
                              <dd>{l.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}
                    {memory.shareLink && memory.shareLink.expiresAt > Date.now() && (
                      <p className="caption">
                        Shared until {new Date(memory.shareLink.expiresAt).toLocaleString()} ·{' '}
                        <button type="button" className="underline" onClick={() => void revoke(memory)}>
                          delete link
                        </button>
                      </p>
                    )}
                  </div>
                  <div className="memory-actions">
                    {confirmDelete === memory.id ? (
                      <motion.div
                        className="confirm-inline"
                        role="group"
                        aria-label={`Delete ${memory.title}?`}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        <span className="text-sm">Delete from this browser?</span>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          autoFocus
                          disabled={deleting === memory.id}
                          onClick={() => void remove(memory)}
                        >
                          {deleting === memory.id ? 'Removing…' : 'Delete'}
                        </button>
                        <button type="button" className="btn-quiet btn-sm" onClick={() => setConfirmDelete(null)}>
                          Keep
                        </button>
                      </motion.div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() =>
                            download(memory.image, `groupshot-${memory.id}.${memory.image.type.split('/')[1] || 'png'}`)
                          }
                        >
                          Download
                        </button>
                        <button type="button" className="btn-quiet btn-sm" onClick={() => setConfirmDelete(memory.id)}>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </main>
  )
}

function MemoryImage({ memory }: { memory: Memory }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const next = URL.createObjectURL(memory.image)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [memory.image])
  return (
    <motion.img
      src={url || undefined}
      alt={`${memory.title}, ${memory.participants.join(', ')}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: url ? 1 : 0 }}
    />
  )
}
