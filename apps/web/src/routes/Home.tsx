import {
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { LiveCounter } from '@/components/LiveCounter'
import { Logo } from '@/components/Logo'
import { PoseReference, poses } from '@/components/PoseGuide'
import { TemplateThumb } from '@/components/TemplateThumb'
import { activities } from '@/lib/activities'
import { createRoom, normalizeCode } from '@/lib/api'
import { type AssetId, resolveAsset } from '@/lib/assets'
import { listMemories } from '@/lib/memories'
import { sound } from '@/lib/sound'
import { templates } from '@/templates'
import './home.css'

const categories = [
  { id: 'all', name: 'All frames' },
  { id: 'strip', name: 'Photo strips' },
  { id: 'grid', name: 'Collages' },
  { id: 'single', name: 'One good shot' },
  { id: 'wide', name: 'Postcards' },
]

const textureUrl = (id: AssetId) => {
  const path = resolveAsset(id)?.runtimePath
  return path ? `url(${path})` : 'none'
}
const textures = {
  '--film': textureUrl('texture-film-edge'),
  '--paper': textureUrl('texture-thermal-paper'),
} as React.CSSProperties

const BOOTH = [
  {
    title: 'One room for everyone',
    detail: 'Each camera cuts its person out and stands them in White studio, Sky room or Cherry curtain.',
  },
  { title: 'Live video', detail: 'See everyone while you line up the shot, up to six people.' },
  {
    title: 'Synced shutter',
    detail: 'Every camera fires on the same beat, wherever it is. A pose to copy before each one.',
  },
  {
    title: 'Strips, GIFs, prints',
    detail: 'Download the full-resolution PNG, a looping GIF, a print sheet, or a link that lasts a day.',
  },
  { title: 'Phones welcome', detail: 'Safari and Chrome on any phone. No app, no account.' },
  {
    title: 'Games for after',
    detail: 'Know me, truth or dare, draw together and more, once the strip prints.',
  },
]

export default function Home() {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [code, setCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [category, setCategory] = useState('all')
  const hero = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] })
  const cardY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -140])

  async function openRoom(play?: string) {
    sound.unlock()
    setCreating(true)
    setCreateError('')
    try {
      const room = await createRoom()
      navigate(`/r/${room.code}${play ? `?play=${play}` : ''}`)
    } catch {
      setCreateError('Couldn’t open a shared booth. Try again, or open the solo booth.')
      setCreating(false)
    }
  }

  function join(e: React.FormEvent) {
    e.preventDefault()
    const c = normalizeCode(code)
    if (!c) return setJoinError('Codes look like SNAP-42. Check your invite and try again.')
    sound.unlock()
    navigate(`/r/${c}`)
  }

  const featured = ['y2k-chrome-bubble', 'y2k-lime-signal', 'y2k-disc-portrait'].filter((id) =>
    templates.some((t) => t.id === id),
  )

  return (
    <div className="lp" style={textures}>
      <section ref={hero} className="lp-hero" aria-labelledby="hero-title">
        <header className="lp-header lp-wrap">
          <Logo />
          <nav aria-label="Main">
            <a href="#how" className="lp-nav-wide">
              How it works
            </a>
            <a href="#frames" className="lp-nav-wide">
              Frames
            </a>
            <a href="#play" className="lp-nav-wide">
              Play
            </a>
            <Link to="/letters" className="lp-nav-mid">
              Letters
            </Link>
            <Link to="/memories">Saved strips</Link>
          </nav>
        </header>

        <div className="lp-hero-stage">
          <Reel progress={scrollYProgress} />
          <motion.div
            className="lp-hero-card"
            style={{ y: cardY }}
            initial={reduce ? false : { opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22, delay: 0.15 }}
          >
            <h1 id="hero-title" className="lp-title">
              Same frame, <mark>different places.</mark>
            </h1>
            <p className="lp-lede">A photo booth for friends who live far apart. One code, one room, the same strip.</p>
            <div className="lp-start-actions">
              <button type="button" className="lp-btn lp-btn-ink" onClick={() => openRoom()} disabled={creating}>
                {creating ? 'Opening…' : 'Open a shared booth'}
              </button>
              <Link to="/solo" className="lp-btn lp-btn-line">
                Shoot solo
              </Link>
            </div>
            {createError && (
              <p role="alert" className="notice">
                {createError}
              </p>
            )}
            <form onSubmit={join} noValidate className="field">
              <label htmlFor="code">Got a code from a friend?</label>
              <div className="join-row">
                <input
                  className="code-input"
                  id="code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value)
                    setJoinError('')
                  }}
                  placeholder="SNAP-42"
                  autoComplete="off"
                  autoCapitalize="characters"
                  aria-invalid={Boolean(joinError)}
                  aria-describedby={joinError ? 'code-error' : undefined}
                />
                <button type="submit" className="lp-btn lp-btn-quiet">
                  Join
                </button>
              </div>
              {joinError && (
                <p id="code-error" role="alert" className="text-sm font-semibold text-signal">
                  {joinError}
                </p>
              )}
            </form>
            <p className="stamp lp-hero-facts">Up to 6 people · In your browser · No account</p>
          </motion.div>
        </div>
        <div className="lp-hero-foot">
          <LiveCounter />
        </div>
        <Wave fill="var(--color-ink)" back="#13131740" />
      </section>

      <section id="how" className="lp-film" aria-labelledby="how-title">
        <div className="lp-wrap">
          <div className="lp-film-head">
            <h2 id="how-title">One sitting, start to finish</h2>
            <p>Everything happens in the browser. Nobody installs anything or makes an account.</p>
          </div>
          <ol className="lp-frames">
            <Step n={1} title="Send the code">
              <p>Open a booth and share its code or QR. Friends join from any browser, up to six of you.</p>
            </Step>
            <Step n={2} title="Stand in one room">
              <p>
                Each phone cuts its person out on that device. Everyone lands side by side on the same backdrop, under
                the same light.
              </p>
            </Step>
            <Step n={3} title="Count down together">
              <p>The booth picks the shutter time, so every camera fires on the same beat. One pose per frame.</p>
            </Step>
            <Step n={4} title="Everyone gets the strip">
              <p>The strip develops on every phone at full resolution. Download it, print it, or send a link.</p>
            </Step>
          </ol>
        </div>
        <Wave fill="var(--color-white)" back="#ffffff33" />
      </section>

      <section id="frames" className="lp-section" aria-labelledby="frames-title">
        <div className="lp-wrap lp-band">
          <Reveal className="lp-head">
            <h2 id="frames-title">Pick your paper</h2>
            <p>
              {templates.length} frames, from four-pose strips to postcards. Pick one now or switch inside the booth.
              The chrome ones are new.
            </p>
          </Reveal>
          {featured.length > 0 && (
            <div className="lp-featured">
              {featured.map((id, i) => {
                const t = templates.find((x) => x.id === id)!
                return (
                  <motion.div
                    key={id}
                    className={`lp-featured-item f${i}`}
                    initial={reduce ? false : { opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '0px 0px -10% 0px' }}
                    transition={{ duration: 0.6, delay: i * 0.1, ease: [0.2, 0.8, 0.2, 1] }}
                  >
                    <Depth speed={[30, -24, 44][i] ?? 0}>
                      <Link to={`/solo?template=${t.id}`} aria-label={`Use ${t.name}, ${t.slots.length} shots`}>
                        <TemplateThumb id={t.id} sample />
                        <span className="lp-featured-name">{t.name}</span>
                      </Link>
                    </Depth>
                  </motion.div>
                )
              })}
            </div>
          )}
          <fieldset className="lp-filter" aria-label="Filter frames">
            {categories.map((c) => (
              <button
                type="button"
                key={c.id}
                className="tag"
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.name}
              </button>
            ))}
          </fieldset>
          <ul className="lp-frame-grid">
            {templates
              .filter((t) => category === 'all' || t.tag === category)
              .map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/solo?template=${t.id}`}
                    className="lp-frame"
                    aria-label={`Use ${t.name}, ${t.slots.length} shots`}
                  >
                    <div className="lp-frame-preview">
                      <TemplateThumb id={t.id} sample />
                    </div>
                    <div className="lp-frame-meta">
                      <h3>{t.name}</h3>
                      <span className="stamp">
                        {t.slots.length} shot{t.slots.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <p>{t.blurb}</p>
                  </Link>
                </li>
              ))}
          </ul>
          <p className="stamp lp-note">Previews use generated sample photos.</p>
        </div>
        <Wave fill="var(--lp-ice)" back="#cfeaff99" />
      </section>

      <section className="lp-booth" aria-labelledby="booth-title">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <h2 id="booth-title">What’s in the booth</h2>
          </Reveal>
          <div className="lp-models">
            <ul>
              {BOOTH.map((item) => (
                <li key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Wave fill="var(--color-white)" back="#ffffff80" />
      </section>

      <section id="play" className="lp-wrap lp-band lp-play" aria-labelledby="play-title">
        <div className="lp-play-copy">
          <Reveal>
            <h2 id="play-title">Stay on after the photo</h2>
          </Reveal>
          <p className="lp-muted">
            Every room has games for the call after the strip prints. Pick one and the booth opens with it queued.
          </p>
          <ul className="lp-games">
            {activities.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => openRoom(a.id)} disabled={creating}>
                  <b>{a.name}</b>
                  <span>{a.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Keep busy={creating} onRoom={() => openRoom()} />

      <section className="lp-coach" aria-labelledby="poses-title">
        <Wave fill="var(--color-white)" back="#ffffff40" top />
        <div className="lp-wrap lp-coach-grid">
          <Reveal className="lp-coach-copy">
            <h2 id="poses-title">The booth tells you how to pose</h2>
            <p>
              Every sitting deals a random set of poses that fit how many of you are in the frame. The next one shows
              beside the camera with a picture to copy, and changes after every shot.
            </p>
            <Link to="/solo" className="lp-btn lp-btn-light">
              Try the pose coach
            </Link>
          </Reveal>
          <div className="lp-coach-cards">
            {[0, 4, 1, 8].map((i, n) => (
              <Depth key={i} speed={n % 2 ? -40 : 40}>
                <figure className="print">
                  <PoseReference index={i} prefer={i % 2 ? 'photo' : 'model'} />
                  <figcaption>{poses[i]!.title}</figcaption>
                </figure>
              </Depth>
            ))}
          </div>
        </div>
        <Wave fill="var(--color-white)" back="#ffffff33" />
      </section>

      <section className="lp-wrap lp-band" aria-labelledby="faq-title">
        <Reveal className="lp-head">
          <h2 id="faq-title">Good to know</h2>
        </Reveal>
        <dl className="lp-faq">
          <div>
            <dt>Where does my video go?</dt>
            <dd>
              Live video goes straight between your browsers. Photos pass through the server so everyone gets the same
              strip, and are deleted six hours after the room empties.
            </dd>
          </div>
          <div>
            <dt>What if someone’s connection drops?</dt>
            <dd>
              Their booth reconnects on its own. If they’re back within a minute and a half, they keep their spot and
              the photos they already took.
            </dd>
          </div>
          <div>
            <dt>Does it work on phones?</dt>
            <dd>
              Yes, in Safari and Chrome. Cameras need a secure page, so share the https link rather than a local
              address.
            </dd>
          </div>
          <div>
            <dt>Who sees the cutout?</dt>
            <dd>
              The cutout runs on your own device. In a shared room, the other guests see your cut-out video, never your
              room.
            </dd>
          </div>
        </dl>
      </section>

      <footer className="lp-footer">
        <Wave fill="var(--color-white)" back="#ffffff99" top />
        <div className="lp-wrap lp-footer-row">
          <div className="lp-footer-brand">
            <Logo />
            <p>Made for people in different places. One day you’ll do this in the same room.</p>
          </div>
          <nav aria-label="Footer">
            <Link to="/solo">Solo booth</Link>
            <Link to="/memories">Saved strips</Link>
            <Link to="/letters">Letters</Link>
            <a href="#hero-title">Back to the top</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}

const photo = (sheet: 'pose' | 'solo', cell: number) => ({
  backgroundImage: `url(/assets/${sheet}-contact-sheet.webp)`,
  backgroundPosition: `${cell % 2 ? 100 : 0}% ${cell > 1 ? 100 : 0}%`,
})
const FRAMES: ['pose' | 'solo', number][] = [
  ['pose', 0],
  ['solo', 1],
  ['pose', 1],
  ['solo', 2],
  ['pose', 2],
  ['solo', 0],
  ['pose', 3],
  ['solo', 3],
]

const PRINTS: {
  kind: 'photo' | 'strip'
  x: number
  y: number
  w: string
  rot: number
  depth: number
  wide?: boolean
  sheet?: 'pose' | 'solo'
  cell?: number
  template?: string
}[] = [
  { kind: 'photo', x: 2, y: 2, w: 'clamp(120px,15vw,220px)', rot: -8, depth: 16, sheet: 'solo', cell: 1 },
  {
    kind: 'strip',
    x: 13,
    y: 52,
    w: 'clamp(60px,6.5vw,100px)',
    rot: 7,
    depth: 22,
    template: 'classic-strip',
    wide: true,
  },
  { kind: 'photo', x: 4, y: 72, w: 'clamp(120px,14vw,210px)', rot: 5, depth: 12, sheet: 'pose', cell: 3, wide: true },
  { kind: 'photo', x: 78, y: 4, w: 'clamp(120px,14vw,210px)', rot: 6, depth: 14, sheet: 'pose', cell: 1 },
  { kind: 'strip', x: 82, y: 40, w: 'clamp(60px,6.5vw,100px)', rot: -6, depth: 20, template: 'red-thread', wide: true },
  { kind: 'photo', x: 76, y: 74, w: 'clamp(120px,15vw,220px)', rot: -5, depth: 10, sheet: 'solo', cell: 2 },
]

function Reel({ progress }: { progress: MotionValue<number> }) {
  const reduce = useReducedMotion()
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const sx = useSpring(px, { stiffness: 60, damping: 18 })
  const sy = useSpring(py, { stiffness: 60, damping: 18 })
  useEffect(() => {
    if (reduce || !window.matchMedia('(pointer: fine)').matches) return
    const move = (e: PointerEvent) => {
      px.set(e.clientX / window.innerWidth - 0.5)
      py.set(e.clientY / window.innerHeight - 0.5)
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [reduce, px, py])
  const left = useTransform(progress, [0, 1], [0, reduce ? 0 : -260])
  const right = useTransform(progress, [0, 1], [0, reduce ? 0 : 260])
  const strip = (dir: 'a' | 'b' | 'c', order: typeof FRAMES, x: MotionValue<number>) => (
    <div className={`lp-strip ${dir}`}>
      <motion.div style={{ x }}>
        <div className="lp-strip-track">
          {[...order, ...order].map(([sheet, cell], i) => (
            <span key={i} className="lp-strip-frame" style={photo(sheet, cell)} />
          ))}
        </div>
      </motion.div>
    </div>
  )
  return (
    <div className="lp-reel" aria-hidden="true">
      {strip('a', FRAMES, left)}
      {strip('b', [...FRAMES].reverse(), right)}
      {strip('c', [...FRAMES.slice(4), ...FRAMES.slice(0, 4)], left)}
      {PRINTS.map((p, i) => (
        <ReelPrint key={`${p.kind}-${p.x}-${p.y}`} p={p} index={i} sx={sx} sy={sy} reduce={Boolean(reduce)} />
      ))}
    </div>
  )
}

function ReelPrint({
  p,
  index,
  sx,
  sy,
  reduce,
}: {
  p: (typeof PRINTS)[number]
  index: number
  sx: MotionValue<number>
  sy: MotionValue<number>
  reduce: boolean
}) {
  const x = useTransform(sx, (v) => v * -p.depth)
  const y = useTransform(sy, (v) => v * -p.depth)
  return (
    <motion.div
      className={`lp-print ${p.wide ? 'wide' : ''}`}
      style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.w, x, y }}
      initial={reduce ? false : { opacity: 0, scale: 1.3, rotate: p.rot * 2.5 }}
      animate={{ opacity: 1, scale: 1, rotate: p.rot }}
      transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.25 + index * 0.08 }}
      whileHover={reduce ? undefined : { scale: 1.06, rotate: 0, zIndex: 5 }}
    >
      {p.kind === 'photo' && (
        <div className="print">
          <span className="lp-print-photo" style={photo(p.sheet!, p.cell!)} />
        </div>
      )}
      {p.kind === 'strip' && (
        <div className="lp-print-strip">
          <TemplateThumb id={p.template!} sample />
        </div>
      )}
    </motion.div>
  )
}

function Wave({ fill, back, top = false }: { fill: string; back: string; top?: boolean }) {
  return (
    <div className={`lp-wave ${top ? 'top' : ''}`} aria-hidden="true" style={{ color: fill }}>
      <svg
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        className="back"
        style={{ color: back }}
        aria-hidden="true"
      >
        <path d="M0 64C180 24 360 24 540 56s360 64 540 40 270-56 360-48V120H0z" />
      </svg>
      <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="front" aria-hidden="true">
        <path d="M0 84c160-36 320-52 520-24s380 60 560 36 260-48 360-40V120H0z" />
      </svg>
    </div>
  )
}

function Depth({ speed, className, children }: { speed: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : speed, reduce ? 0 : -speed])
  return (
    <motion.div ref={ref} className={className} style={{ y }}>
      {children}
    </motion.div>
  )
}

function Reveal({ className, children }: { className?: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  )
}

function Keep({ busy, onRoom }: { busy: boolean; onRoom: () => void }) {
  const [saved, setSaved] = useState<{ id: string; url: string; title: string }[] | null>(null)
  useEffect(() => {
    let urls: string[] = []
    let alive = true
    listMemories()
      .then((list) => {
        if (!alive) return
        const top = list.slice(0, 3).map((m) => ({ id: m.id, url: URL.createObjectURL(m.image), title: m.title }))
        urls = top.map((m) => m.url)
        setSaved(top)
      })
      .catch(() => alive && setSaved([]))
    return () => {
      alive = false
      for (const u of urls) URL.revokeObjectURL(u)
    }
  }, [])
  return (
    <section id="keep" className="lp-keep" aria-labelledby="keep-title">
      <div className="lp-wrap lp-keep-grid">
        <div className="lp-keep-copy">
          <Reveal>
            <h2 id="keep-title">Keep it somewhere</h2>
          </Reveal>
          <p>
            Strips you keep stay on this device, in your scrapbook, with a note and the people in them. Write a letter
            for later while you’re at it.
          </p>
          <div className="lp-keep-actions">
            <Link to="/memories" className="lp-btn lp-btn-ink">
              Open your scrapbook
            </Link>
            <Link to="/solo" className="lp-btn lp-btn-line">
              Shoot a page
            </Link>
            <button type="button" className="link-plain" disabled={busy} onClick={onRoom}>
              {busy ? 'Opening…' : 'or fill one with friends'}
            </button>
          </div>
          <ul className="lp-keep-links">
            <li>
              <Link to="/solo">Solo sitting</Link>
            </li>
            <li>
              <Link to="/letters">Letters to the future</Link>
            </li>
          </ul>
        </div>
        <Depth speed={40} className="lp-shelf">
          {saved?.length ? (
            <div className="lp-shelf-strips">
              {saved.map((m) => (
                <img key={m.id} src={m.url} alt={m.title} />
              ))}
            </div>
          ) : (
            saved && <p className="stamp">Your first strip goes here</p>
          )}
        </Depth>
      </div>
    </section>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.li
      className="lp-step"
      initial={reduce ? false : { opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.55, delay: (n - 1) * 0.08, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <span className="stamp lp-step-n">Frame {String(n).padStart(2, '0')}</span>
      <h3>{title}</h3>
      {children}
    </motion.li>
  )
}
