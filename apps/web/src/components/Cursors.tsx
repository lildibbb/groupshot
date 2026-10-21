import type { Peer } from '@groupshot/protocol'
import { useEffect, useState } from 'react'
import { useBooth } from '@/lib/store'

const SEND_MS = 50
const IDLE_MS = 5000
const HUES = ['#e5484d', '#3e63dd', '#30a46c', '#f5a524', '#8e4ec6', '#12a594']

export function Cursors({ peers, me }: { peers: Peer[]; me: string }) {
  const cursors = useBooth((s) => s.cursors)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    let last = 0
    const move = (e: PointerEvent) => {
      const t = performance.now()
      if (t - last < SEND_MS) return
      last = t
      useBooth.getState().sendCursor(e.clientX / window.innerWidth, e.clientY / window.innerHeight)
    }
    window.addEventListener('pointermove', move, { passive: true })
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.removeEventListener('pointermove', move)
      clearInterval(tick)
    }
  }, [])

  return (
    <div className="cursors" aria-hidden="true">
      {peers.map((p, i) => {
        const c = cursors[p.id]
        if (p.id === me || !c || now - c.at > IDLE_MS) return null
        return (
          <div
            key={p.id}
            className="cursor"
            style={
              { left: `${c.x * 100}%`, top: `${c.y * 100}%`, '--hue': HUES[i % HUES.length] } as React.CSSProperties
            }
          >
            <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true">
              <path d="M1 1l15 8-7 2-3 7z" fill="var(--hue)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            <span>{p.name}</span>
          </div>
        )
      })}
    </div>
  )
}
