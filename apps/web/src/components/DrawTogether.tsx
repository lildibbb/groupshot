import type { Peer, RoomState, Stroke } from '@groupshot/protocol'
import { useEffect, useRef, useState } from 'react'
import { onDraw, useBooth } from '@/lib/store'

type Activity = NonNullable<RoomState['activity']>

const COLORS = ['#131317', '#e5484d', '#f5a524', '#30a46c', '#3e63dd', '#8e4ec6']
const SIZES = [4, 10, 22]
const CHUNK = 8

export function DrawTogether({
  activity,
  isHost,
  onEnd,
  onReturn,
}: {
  activity: Activity
  peers: Peer[]
  isHost: boolean
  onEnd: () => void
  onReturn: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const log = useRef<Stroke[]>([])
  const [color, setColor] = useState(COLORS[0]!)
  const [size, setSize] = useState(SIZES[1]!)
  const [eraser, setEraser] = useState(false)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const replay = () => {
      const dpr = window.devicePixelRatio || 1
      el.width = el.clientWidth * dpr
      el.height = el.clientHeight * dpr
      const ctx = el.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, el.width, el.height)
      for (const s of log.current) paint(el, s)
    }
    replay()
    const ro = new ResizeObserver(replay)
    ro.observe(el)
    const off = onDraw((e) => {
      if (e.type === 'draw-clear') {
        log.current = []
        replay()
      } else {
        log.current.push(e.stroke)
        paint(el, e.stroke)
      }
    })
    return () => {
      ro.disconnect()
      off()
    }
  }, [])

  function clear() {
    log.current = []
    const el = canvas.current!
    const ctx = el.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, el.width, el.height)
    useBooth.getState().clearCanvas()
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const id = crypto.randomUUID().slice(0, 8)
    const box = el.getBoundingClientRect()
    const at = (ev: { clientX: number; clientY: number }) => [
      Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width)),
      Math.min(1, Math.max(0, (ev.clientY - box.top) / box.height)),
    ]
    let pts = at(e)
    const stroke = (p: number[]): Stroke => ({
      id,
      color: eraser ? '#ffffff' : color,
      width: eraser ? 28 : size,
      pts: p,
    })
    const flush = () => {
      if (pts.length < 4) return
      const s = stroke(pts)
      log.current.push(s)
      useBooth.getState().sendStroke(s)
      pts = pts.slice(-2)
    }
    const move = (ev: PointerEvent) => {
      const [x, y] = at(ev)
      paint(el, stroke([...pts.slice(-2), x!, y!]))
      pts.push(x!, y!)
      if (pts.length >= CHUNK * 2) flush()
    }
    const up = () => {
      if (pts.length === 2) pts.push(pts[0]! + 0.001, pts[1]!)
      flush()
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  function save() {
    canvas.current?.toBlob((b) => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = 'groupshot-drawing.png'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    })
  }

  return (
    <section className="quiz-panel" aria-labelledby="draw-title">
      <header className="quiz-header">
        <div>
          <p className="stamp muted">Draw together · everyone’s pen is live</p>
          <h1 id="draw-title" className="display">
            One canvas
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-quiet btn-sm" onClick={save}>
            Save PNG
          </button>
          {isHost && activity.phase !== 'ended' && (
            <button type="button" className="btn-quiet btn-sm" onClick={onEnd}>
              End drawing
            </button>
          )}
        </div>
      </header>
      {activity.phase === 'ended' ? (
        <div className="quiz-result" role="status">
          <h2>Pens down</h2>
          <button type="button" className="btn-secondary" onClick={onReturn}>
            Back to the booth
          </button>
        </div>
      ) : (
        <>
          <div className="draw-tools" role="toolbar" aria-label="Pen">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="draw-color"
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                aria-pressed={!eraser && color === c}
                onClick={() => {
                  setColor(c)
                  setEraser(false)
                }}
              />
            ))}
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className="tag"
                aria-pressed={!eraser && size === s}
                onClick={() => {
                  setSize(s)
                  setEraser(false)
                }}
              >
                <i className="draw-dot" style={{ width: s / 2 + 4, height: s / 2 + 4 }} />
                <span className="sr-only">Size {s}</span>
              </button>
            ))}
            <button type="button" className="tag" aria-pressed={eraser} onClick={() => setEraser((v) => !v)}>
              Eraser
            </button>
            <button type="button" className="tag" onClick={clear}>
              Clear for everyone
            </button>
          </div>
          <canvas
            ref={canvas}
            className="draw-canvas"
            onPointerDown={onPointerDown}
            aria-label="Shared drawing canvas"
          />
        </>
      )}
    </section>
  )
}

function paint(el: HTMLCanvasElement, s: Stroke) {
  const ctx = el.getContext('2d')
  if (!ctx || s.pts.length < 4) return
  const dpr = window.devicePixelRatio || 1
  ctx.strokeStyle = s.color
  ctx.lineWidth = s.width * dpr * (el.clientWidth / 800)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(s.pts[0]! * el.width, s.pts[1]! * el.height)
  for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i]! * el.width, s.pts[i + 1]! * el.height)
  ctx.stroke()
}
