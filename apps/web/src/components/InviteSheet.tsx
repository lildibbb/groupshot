import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { SignalAnimation } from './SignalAnimation'

export function InviteSheet({ code, onClose }: { code: string; onClose: () => void }) {
  const link = `${location.origin}/r/${code}`
  const [qr, setQr] = useState('')
  const [qrError, setQrError] = useState(false)
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialog.current?.showModal()
    let live = true
    setQr('')
    setQrError(false)
    void QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#1a1a1f', light: '#ffffff' } })
      .then((url) => {
        if (live) setQr(url)
      })
      .catch(() => {
        if (live) setQrError(true)
      })
    return () => {
      live = false
    }
  }, [link])

  async function copy(what: 'link' | 'code') {
    try {
      await navigator.clipboard.writeText(what === 'link' ? link : code)
      setCopied(what)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied(null)
    }
  }

  const canShare = typeof navigator.share === 'function'

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="invite"
      aria-labelledby="invite-title"
    >
      <div className="invite-body">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-2">
            <h2 id="invite-title" className="display">
              Get them in the frame
            </h2>
            <p className="muted">Up to 6 people. They need the code or the link.</p>
          </div>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="btn-secondary btn-sm"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <button type="button" onClick={() => copy('code')} className="code-card">
          <span className="stamp muted">Room code · {copied === 'code' ? 'copied' : 'tap to copy'}</span>
          <b>{code}</b>
        </button>

        <div className="flex items-center gap-5">
          {qr ? (
            <img src={qr} alt={`QR code linking to room ${code}`} className="size-32 shrink-0 rounded-xl" />
          ) : (
            <div className="size-32 shrink-0 rounded-xl bg-pearl" />
          )}
          <div className="text-sm muted">
            <SignalAnimation state={qrError ? 'error' : qr ? 'ready' : 'connecting'} />
            <p role="status">
              {qrError
                ? 'QR code unavailable. Share the link or room code instead.'
                : qr
                  ? 'On another phone? Point its camera at the code to join.'
                  : 'Preparing the QR code…'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary flex-1" onClick={() => copy('link')}>
            {copied === 'link' ? 'Link copied' : 'Copy invite link'}
          </button>
          {canShare && (
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() =>
                navigator
                  .share({ title: 'Jump in my photo booth', text: `Room ${code}, get in here`, url: link })
                  .catch(() => {})
              }
            >
              Share
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}
