import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useStats } from '@/lib/stats'

function Digits({ value, min = 5 }: { value: number; min?: number }) {
  const reduce = useReducedMotion()
  const text = String(value).padStart(min, '0')
  return (
    <span className="flip" aria-hidden="true">
      {[...text].map((d, i) => (
        <span key={`${text.length - i}`} className="flip-tile">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={d}
              initial={reduce ? false : { rotateX: -90, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              exit={reduce ? undefined : { rotateX: 90, opacity: 0 }}
              transition={{ duration: 0.28 }}
            >
              {d}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  )
}

export function LiveCounter() {
  const stats = useStats()
  if (!stats) return null
  return (
    <div className="live-counter" aria-live="polite">
      <div>
        <Digits value={stats.strips} />
        <span className="stamp">strips printed</span>
        <span className="sr-only">{stats.strips} strips printed</span>
      </div>
      <div>
        <span className="live-dot" aria-hidden="true" />
        <span className="stamp">
          {stats.live.people} {stats.live.people === 1 ? 'person' : 'people'} in {stats.live.rooms}{' '}
          {stats.live.rooms === 1 ? 'booth' : 'booths'} now
        </span>
      </div>
    </div>
  )
}
