import { useEffect, useState } from 'react'
import { getFlags } from '@/lib/business'

const SEEN = 'groupshot.announcement'

export function Announcement() {
  const [text, setText] = useState('')
  useEffect(() => {
    if (/^\/(admin|kiosk)/.test(location.pathname)) return
    getFlags()
      .then((f) => {
        let seen = ''
        try {
          seen = sessionStorage.getItem(SEEN) ?? ''
        } catch {}
        if (f.announcement && f.announcement !== seen) setText(f.announcement)
      })
      .catch(() => {})
  }, [])
  if (!text) return null
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 16px',
        background: 'var(--color-ink)',
        color: 'var(--color-white)',
        fontSize: 14,
      }}
    >
      <span>{text}</span>
      <button
        type="button"
        className="btn-quiet btn-sm"
        onClick={() => {
          try {
            sessionStorage.setItem(SEEN, text)
          } catch {}
          setText('')
        }}
      >
        Dismiss
      </button>
    </div>
  )
}
