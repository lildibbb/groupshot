import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { MannequinScene } from '@/lib/mannequin'

const mannequin = () => import('@/lib/mannequin')

import { ShuffleIcon } from './Icons'

type Who = 'Solo' | 'Together' | 'Solo or together'

export interface Pose {
  title: string
  tip: string
  type: Who
  photo: number | null
}

export const poses: Pose[] = [
  {
    title: 'Double peace',
    tip: 'Bring two peace signs up beside your cheeks and tilt your head toward the middle.',
    type: 'Solo or together',
    photo: 0,
  },
  {
    title: 'Overhead heart',
    tip: 'Curve both arms over your head into a heart. With a friend, each of you makes one half.',
    type: 'Together',
    photo: 1,
  },
  {
    title: 'Album cover',
    tip: 'Turn one shoulder to the lens and drop your chin a little. Keep a straight face.',
    type: 'Solo or together',
    photo: 2,
  },
  {
    title: 'Blurry goodbye',
    tip: 'Wave right in front of the lens and laugh. Keep your face visible behind your hand.',
    type: 'Solo or together',
    photo: 3,
  },
  {
    title: 'Cheek heart',
    tip: 'Cross your thumb and index finger into a tiny heart beside one cheek. Look straight in.',
    type: 'Solo',
    photo: null,
  },
  {
    title: 'Tiny face frame',
    tip: 'Make an L with each hand and hold one above and one below your face, like a viewfinder.',
    type: 'Solo',
    photo: null,
  },
  {
    title: 'Back to back',
    tip: 'Turn toward opposite edges of the frame, then look back at the camera over your shoulder.',
    type: 'Together',
    photo: null,
  },
  {
    title: 'The side-eye',
    tip: 'Face forward but look toward your friend’s side of the frame. Hold it until someone laughs.',
    type: 'Together',
    photo: null,
  },
  {
    title: 'Flower cheeks',
    tip: 'Open both palms under your chin with your wrists together, like petals around your face.',
    type: 'Solo',
    photo: null,
  },
  {
    title: 'Four moods',
    tip: 'Change your face at every countdown: smiling, surprised, serious, then laughing.',
    type: 'Solo or together',
    photo: null,
  },
  {
    title: 'Squish in',
    tip: 'Everyone press cheeks together toward the middle of the frame. Closer than feels normal.',
    type: 'Together',
    photo: null,
  },
  {
    title: 'Chin on fists',
    tip: 'Rest your chin on both fists and lean slightly toward the lens. Big eyes.',
    type: 'Solo',
    photo: null,
  },
]

export function posesFor(people: number) {
  return poses
    .map((pose, index) => ({ pose, index }))
    .filter(({ pose }) => pose.type === 'Solo or together' || pose.type === (people > 1 ? 'Together' : 'Solo'))
    .map((p) => p.index)
}

export function shuffled<T>(items: T[], random = Math.random) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function PoseReference({ index, prefer = 'model' }: { index: number; prefer?: 'photo' | 'model' }) {
  const pose = poses[index % poses.length]!
  if (pose.photo !== null && prefer === 'photo')
    return (
      <div
        role="img"
        aria-label={`Example photo: ${pose.title}`}
        className="pose-photo"
        style={{ backgroundPosition: `${pose.photo % 2 ? 100 : 0}% ${pose.photo > 1 ? 100 : 0}%` }}
      />
    )
  return <PoseStill index={index % poses.length} />
}

function PoseStill({ index }: { index: number }) {
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    mannequin()
      .then((m) => m.poseStill(index))
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [index])
  const title = poses[index]!.title
  if (failed) return <div className="pose-model pose-model-text">{title}</div>
  return (
    <div className="pose-model">{src && <img src={src} alt={`3D figure doing: ${title}`} draggable={false} />}</div>
  )
}

const MOODS = ['smile', 'open', 'flat', 'smile'] as const

function PoseLive({ index }: { index: number }) {
  const host = useRef<HTMLDivElement>(null)
  const stage = useRef<{ scene: MannequinScene; kick: () => void } | null>(null)
  const reduce = useReducedMotion()
  const [failed, setFailed] = useState(false)
  const latest = useRef(index)
  latest.current = index

  useEffect(() => {
    const el = host.current!
    let renderer: import('three').WebGLRenderer
    let alive = true
    let raf = 0
    let cleanup = () => {}
    void Promise.all([import('three'), mannequin()]).then(([THREE, { MannequinScene }]) => {
      if (!alive) return
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
      } catch {
        setFailed(true)
        return
      }
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      el.appendChild(renderer.domElement)
      const scene = new MannequinScene()
      const resize = () => {
        const w = el.clientWidth || 240
        renderer.setSize(w, Math.round((w * 3) / 4), false)
        renderer.domElement.style.width = '100%'
        renderer.domElement.style.height = 'auto'
        kick()
      }
      let visible = true
      let drag: number | null = null
      let spin = -14
      let spinTarget = -14
      let started = performance.now()
      const tick = (now: number) => {
        raf = 0
        if (!visible) return
        const moving = scene.step()
        const t = (now - started) / 1000
        const sway = reduce || drag !== null ? 0 : Math.sin(t * 1.6) * 16 * Math.max(0, 1 - t / 6)
        spin += (spinTarget + sway - spin) * 0.15
        scene.spin = spin
        renderer.render(scene.scene, scene.camera)
        if (moving || Math.abs(spinTarget + sway - spin) > 0.05 || (t < 6 && !reduce)) raf = requestAnimationFrame(tick)
      }
      const kick = () => {
        raf ||= requestAnimationFrame(tick)
      }
      const down = (e: PointerEvent) => {
        drag = e.clientX
        el.setPointerCapture(e.pointerId)
      }
      const move = (e: PointerEvent) => {
        if (drag === null) return
        spinTarget += (e.clientX - drag) * 0.6
        drag = e.clientX
        kick()
      }
      const up = () => {
        drag = null
        window.setTimeout(() => {
          spinTarget = -14
          kick()
        }, 1500)
      }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
      const io = new IntersectionObserver(([entry]) => {
        visible = Boolean(entry?.isIntersecting)
        if (visible) kick()
      })
      io.observe(el)
      const ro = new ResizeObserver(resize)
      ro.observe(el)
      stage.current = {
        scene,
        kick: () => {
          started = performance.now()
          kick()
        },
      }
      scene.pose(latest.current, true)
      resize()
      cleanup = () => {
        io.disconnect()
        ro.disconnect()
        el.removeEventListener('pointerdown', down)
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', up)
        renderer.dispose()
        renderer.domElement.remove()
      }
    })
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      cleanup()
      stage.current = null
    }
  }, [reduce])

  useEffect(() => {
    const s = stage.current
    if (!s) return
    s.scene.pose(index)
    s.kick()
    if (poses[index]?.title !== 'Four moods') return
    let i = 0
    const id = window.setInterval(() => {
      s.scene.mood(MOODS[++i % MOODS.length]!)
      s.kick()
    }, 900)
    return () => window.clearInterval(id)
  }, [index])

  const title = poses[index]!.title
  if (failed) return <PoseStill index={index} />
  return (
    <div
      ref={host}
      className="pose-model pose-live"
      role="img"
      aria-label={`3D figure doing: ${title}. Drag to turn it.`}
    >
      <span className="pose-drag stamp" aria-hidden="true">
        drag to turn
      </span>
    </div>
  )
}

export function PoseCoach({
  plan,
  taken,
  shooting,
  onShuffle,
  synchronized = false,
}: {
  plan: number[]
  taken: number
  shooting: boolean
  onShuffle: () => void
  synchronized?: boolean
}) {
  const index = plan[Math.min(taken, plan.length - 1)] ?? 0
  const pose = poses[index]!
  return (
    <section className="coach" aria-label={synchronized ? 'Shared pose challenge' : 'Pose coach'}>
      <div className="coach-head">
        <h2>
          {synchronized
            ? 'Shared pose challenge'
            : shooting
              ? `Pose ${Math.min(taken + 1, plan.length)}`
              : 'First pose'}
        </h2>
        {synchronized ? (
          <span className="stamp muted">Same prompt order</span>
        ) : (
          <button type="button" className="tag" disabled={shooting} onClick={onShuffle}>
            <ShuffleIcon /> Surprise me
          </button>
        )}
      </div>
      <div className="coach-body">
        <PoseLive index={index} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${index}-${taken}`}
            className="grid gap-2 content-start"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <span className="stamp muted">{pose.type}</span>
            <h3>{pose.title}</h3>
            <p>{pose.tip}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
