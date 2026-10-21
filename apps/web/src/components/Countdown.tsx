import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { serverNow } from '@/lib/store'

interface Props {
  fireAts: number[]
  taken: number
  muted: boolean
  onTick: () => void
  label?: string
}

export function Countdown({ fireAts, taken, muted, onTick, label }: Props) {
  const [left, setLeft] = useState<number | null>(null)
  const last = useRef<number | null>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const now = serverNow()
      const next = fireAts.find((t) => t > now)
      const secs = next === undefined ? null : Math.ceil((next - now) / 1000)
      if (secs !== last.current) {
        last.current = secs
        setLeft(secs)
        if (secs !== null && secs <= 3 && !muted) onTick()
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [fireAts, muted, onTick])

  if (left === null) return null
  return (
    <div className="countdown" aria-live="assertive">
      <span className="countdown-label stamp">
        {label ?? `Shot ${Math.min(taken + 1, fireAts.length)} of ${fireAts.length}`}
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={left}
          className="countdown-num"
          initial={reduce ? false : { scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={reduce ? undefined : { scale: 0.7, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        >
          {left}
        </motion.span>
      </AnimatePresence>
      <motion.span
        key={`bar-${left}`}
        className="countdown-bar"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: reduce ? 0 : 1, ease: 'linear' }}
      />
    </div>
  )
}

export function Flash({ at }: { at: number }) {
  if (!at) return null
  return (
    <>
      <motion.div
        key={at}
        className="flash-layer"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
      />
      <motion.div
        key={`ring-${at}`}
        className="strobe-ring"
        initial={{ opacity: 0.9, scale: 0.6 }}
        animate={{ opacity: 0, scale: 2.4 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      />
    </>
  )
}
