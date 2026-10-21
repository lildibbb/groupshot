import { collection } from './collection'
import { studioEditions } from './editions'
import { grid, stack } from './layout'
import { type Ctx, F, type Template } from './types'

function text(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = 'center',
) {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(s, x, y)
}

function fitText(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  maxW: number,
  size: number,
  family: string,
  color: string,
  weight = '700',
) {
  let px = size
  ctx.font = `${weight} ${px}px ${family}`
  while (ctx.measureText(s).width > maxW && px > 10) {
    px -= 2
    ctx.font = `${weight} ${px}px ${family}`
  }
  text(ctx, s, x, y, ctx.font, color)
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}

function star(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    const rr = i % 2 === 0 ? r : r * 0.28
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
}

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}

export const templates: Template[] = [
  ...studioEditions,
  ...collection,
  {
    id: 'classic-strip',
    name: 'Classic Strip',
    blurb: 'Four frames, white border, the mall booth classic.',
    tag: 'strip',
    size: { w: 600, h: 1800 },
    slots: stack(40, 40, 520, 370, 4, 24),
    bg: '#fbfaf7',
    empty: '#e6e1d8',
    caption: 'the gang',
    swatch: ['#fbfaf7', '#141114'],
    decorate(ctx, { w, h, caption, date }) {
      fitText(ctx, caption, w / 2, h - 108, w - 80, 44, F.display, '#141114')
      text(ctx, date, w / 2, h - 62, `500 22px ${F.mono}`, '#7b7378')
    },
  },
  {
    id: 'film-roll',
    name: 'Film Roll',
    blurb: 'Sprocket holes and frame numbers on black stock.',
    tag: 'strip',
    size: { w: 640, h: 1900 },
    slots: stack(90, 90, 460, 380, 4, 50),
    bg: '#121012',
    empty: '#2a2528',
    caption: 'GS 400',
    swatch: ['#121012', '#ff9b3d'],
    background(ctx, { w, h }) {
      ctx.fillStyle = '#f2ece4'
      for (let y = 30; y < h - 20; y += 56) {
        ctx.beginPath()
        ctx.roundRect(24, y, 34, 26, 5)
        ctx.roundRect(w - 58, y, 34, 26, 5)
        ctx.fill()
      }
    },
    decorate(ctx, { slots, caption, h, w }) {
      slots.forEach((s, i) => {
        ctx.save()
        ctx.translate(s.x - 12, s.y + s.h / 2)
        ctx.rotate(-Math.PI / 2)
        text(ctx, `${caption}  ▸ ${i + 1}A`, 0, 0, `700 18px ${F.mono}`, '#ff9b3d')
        ctx.restore()
      })
      text(ctx, '◂ GROUPSHOT SAFETY FILM ▸', w / 2, h - 40, `700 18px ${F.mono}`, '#ff9b3d')
    },
  },
  {
    id: 'polaroid',
    name: 'Instant',
    blurb: 'One square shot, thick chin, room for a note.',
    tag: 'single',
    size: { w: 1000, h: 1200 },
    slots: [{ x: 60, y: 60, w: 880, h: 880 }],
    bg: '#f6f1e7',
    empty: '#ddd5c6',
    caption: 'remember this one',
    swatch: ['#f6f1e7', '#3b2f2a'],
    decorate(ctx, { w, caption, date }) {
      fitText(ctx, caption, w / 2, 1060, w - 120, 64, F.serif, '#3b2f2a', '400')
      text(ctx, date, w / 2, 1130, `400 24px ${F.mono}`, '#9a8f84')
    },
  },
  {
    id: 'grid-four',
    name: 'Four Square',
    blurb: 'A clean 2×2 grid. Goes with everything.',
    tag: 'grid',
    size: { w: 1200, h: 1320 },
    slots: grid(48, 48, 1104, 1104, 2, 2, 24),
    bg: '#ffffff',
    empty: '#ececec',
    radius: 18,
    caption: 'four for four',
    swatch: ['#ffffff', '#ff5a36'],
    decorate(ctx, { caption, date }) {
      fitText(ctx, caption, 600, 1220, 1104, 52, F.display, '#141114', '800')
      text(ctx, date, 600, 1280, `500 24px ${F.mono}`, '#b73119')
    },
  },
  {
    id: 'postcard',
    name: 'Postcard',
    blurb: 'Greetings from wherever everyone is right now.',
    tag: 'wide',
    size: { w: 1500, h: 1000 },
    slots: [{ x: 50, y: 50, w: 860, h: 900 }],
    bg: '#f3ead8',
    empty: '#d9cdb5',
    caption: 'wish you were here (you were)',
    swatch: ['#f3ead8', '#c8432b'],
    decorate(ctx, { caption, date, names }) {
      ctx.strokeStyle = '#b9ab90'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(960, 120)
      ctx.lineTo(960, 880)
      ctx.stroke()
      ctx.strokeStyle = '#c8432b'
      ctx.lineWidth = 6
      ctx.setLineDash([10, 8])
      ctx.strokeRect(1280, 90, 160, 190)
      ctx.setLineDash([])
      text(ctx, 'GS', 1360, 205, `800 64px ${F.display}`, '#c8432b')
      text(ctx, 'Greetings', 1000, 400, `italic 400 72px ${F.serif}`, '#2d2419', 'left')
      ctx.font = `400 34px ${F.serif}`
      wrap(ctx, caption, 1000, 480, 440, 46, '#2d2419')
      ctx.strokeStyle = '#b9ab90'
      ctx.lineWidth = 2
      for (let y = 700; y <= 880; y += 60) {
        ctx.beginPath()
        ctx.moveTo(1000, y)
        ctx.lineTo(1440, y)
        ctx.stroke()
      }
      text(ctx, `from ${joinNames(names)}`, 1000, 690, `500 26px ${F.mono}`, '#6e604c', 'left')
      text(ctx, date, 1000, 870, `500 24px ${F.mono}`, '#6e604c', 'left')
    },
  },
  {
    id: 'newspaper',
    name: 'Front Page',
    blurb: 'Breaking news: you all showed up.',
    tag: 'single',
    size: { w: 1200, h: 1600 },
    slots: [{ x: 70, y: 420, w: 1060, h: 820 }],
    bg: '#ebe6dc',
    empty: '#cfc8bb',
    tone: 'mono',
    caption: 'Local friends look great, sources confirm',
    swatch: ['#ebe6dc', '#1a1a1a'],
    decorate(ctx, { w, caption, date, names }) {
      text(ctx, 'The Daily Groupshot', w / 2, 170, `400 112px ${F.serif}`, '#1a1a1a')
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(70, 200, w - 140, 6)
      ctx.fillRect(70, 252, w - 140, 2)
      text(ctx, date.toUpperCase(), 70, 238, `700 22px ${F.mono}`, '#1a1a1a', 'left')
      text(ctx, 'LATE EDITION · FREE', w - 70, 238, `700 22px ${F.mono}`, '#1a1a1a', 'right')
      fitText(ctx, caption, w / 2, 370, w - 140, 76, F.display, '#1a1a1a', '800')
      text(ctx, `Pictured: ${joinNames(names)}.`, 70, 1290, `italic 400 30px ${F.serif}`, '#333', 'left')
      ctx.font = `400 22px ${F.serif}`
      const filler = 'Witnesses describe the scene as "honestly iconic." More on page 2, which does not exist.'
      wrap(ctx, filler, 70, 1350, w - 140, 32, '#444')
    },
  },
  {
    id: 'magazine',
    name: 'Cover Story',
    blurb: 'Full-bleed photo with a masthead to match.',
    tag: 'single',
    size: { w: 1200, h: 1600 },
    slots: [{ x: 0, y: 0, w: 1200, h: 1600 }],
    bg: '#000000',
    empty: '#333',
    caption: 'The Friendship Issue',
    swatch: ['#ff2d55', '#ffffff'],
    decorate(ctx, { w, h, caption, date, names }) {
      ctx.fillStyle = 'rgba(0,0,0,.35)'
      ctx.fillRect(0, h - 380, w, 380)
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,.4)'
      ctx.shadowBlur = 20
      fitText(ctx, 'SQUAD', w / 2, 260, w - 80, 300, F.display, '#ff2d55', '800')
      ctx.restore()
      text(ctx, date.toUpperCase(), w / 2, 320, `700 26px ${F.mono}`, '#fff')
      fitText(ctx, caption, 60 + (w - 120) / 2, h - 230, w - 120, 84, F.display, '#fff', '800')
      fitText(ctx, `Starring ${joinNames(names)}`, w / 2, h - 160, w - 120, 40, F.serif, '#fff', '400')
      text(ctx, 'EXCLUSIVE · NO ONE BLINKED (MOSTLY)', w / 2, h - 90, `700 24px ${F.mono}`, '#ffd54a')
    },
  },
  {
    id: 'arcade',
    name: 'Arcade',
    blurb: 'Insert coin. Four rounds, pixel border, high score.',
    tag: 'grid',
    size: { w: 1200, h: 1400 },
    slots: grid(80, 220, 1040, 1040, 2, 2, 40),
    bg: '#1b0f3a',
    empty: '#2e1d5e',
    caption: 'HIGH SCORE',
    swatch: ['#1b0f3a', '#3cf2ff'],
    background(ctx, { w, h }) {
      ctx.fillStyle = '#251552'
      for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 2)
    },
    decorate(ctx, { w, h, slots, caption, names }) {
      fitText(ctx, caption.toUpperCase(), w / 2, 120, w - 160, 56, F.pixel, '#3cf2ff', '400')
      text(ctx, `${String(names.length * 2500).padStart(6, '0')} PTS`, w / 2, 175, `400 26px ${F.pixel}`, '#ffd54a')
      ctx.fillStyle = '#ff3cac'
      for (const s of slots) {
        for (let i = 0; i < s.w; i += 16) {
          ctx.fillRect(s.x + i, s.y - 12, 10, 8)
          ctx.fillRect(s.x + i, s.y + s.h + 4, 10, 8)
        }
      }
      text(ctx, `PLAYERS ${names.length} · PRESS START`, w / 2, h - 60, `400 24px ${F.pixel}`, '#fff')
    },
  },
  {
    id: 'y2k',
    name: 'Y2K Sparkle',
    blurb: 'Chrome gradients and too many stars, on purpose.',
    tag: 'strip',
    size: { w: 600, h: 1700 },
    slots: stack(50, 130, 500, 400, 3, 40),
    bg: '#c6b5ff',
    empty: '#b3a2ef',
    radius: 30,
    caption: 'besties 4 ever',
    swatch: ['#ff9de2', '#8be8ff'],
    background(ctx, { w, h }) {
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, '#ff9de2')
      g.addColorStop(0.5, '#c6b5ff')
      g.addColorStop(1, '#8be8ff')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    },
    decorate(ctx, { w, h, caption, date }) {
      const r = rng(7)
      for (let i = 0; i < 22; i++) star(ctx, r() * w, r() * h, 8 + r() * 18, i % 3 ? '#ffffff' : '#fff36b')
      ctx.save()
      ctx.shadowColor = '#ff3cac'
      ctx.shadowOffsetX = 4
      ctx.shadowOffsetY = 4
      fitText(ctx, caption, w / 2, 95, w - 60, 56, F.display, '#ffffff', '800')
      ctx.restore()
      text(ctx, `✦ ${date} ✦`, w / 2, h - 50, `700 24px ${F.mono}`, '#3b1d6e')
    },
  },
  {
    id: 'wanted',
    name: 'Wanted',
    blurb: 'For crimes against boredom. Sepia, naturally.',
    tag: 'single',
    size: { w: 1100, h: 1500 },
    slots: [{ x: 120, y: 330, w: 860, h: 700 }],
    bg: '#e9d6ad',
    empty: '#cdb88c',
    tone: 'sepia',
    caption: 'for being way too much fun',
    swatch: ['#e9d6ad', '#4a2e16'],
    background(ctx, { w, h }) {
      const r = rng(3)
      ctx.fillStyle = 'rgba(120,80,30,.08)'
      for (let i = 0; i < 400; i++) ctx.fillRect(r() * w, r() * h, 3 + r() * 6, 3 + r() * 6)
    },
    decorate(ctx, { w, caption, names }) {
      ctx.strokeStyle = '#4a2e16'
      ctx.lineWidth = 10
      ctx.strokeRect(40, 40, w - 80, 1420)
      text(ctx, 'WANTED', w / 2, 250, `400 190px ${F.serif}`, '#4a2e16')
      fitText(
        ctx,
        joinNames(names).toUpperCase() || 'THE USUAL SUSPECTS',
        w / 2,
        1120,
        w - 200,
        64,
        F.display,
        '#4a2e16',
        '800',
      )
      fitText(ctx, caption, w / 2, 1200, w - 200, 40, F.serif, '#4a2e16', '400')
      text(ctx, 'REWARD', w / 2, 1320, `400 72px ${F.serif}`, '#4a2e16')
      text(ctx, 'ONE (1) GROUP CHAT SHOUTOUT', w / 2, 1385, `700 28px ${F.mono}`, '#4a2e16')
    },
  },
  {
    id: 'cinema',
    name: 'Widescreen',
    blurb: 'Two scenes, letterboxed, like the trailer.',
    tag: 'wide',
    size: { w: 1920, h: 1080 },
    slots: [
      { x: 60, y: 170, w: 880, h: 740 },
      { x: 980, y: 170, w: 880, h: 740 },
    ],
    bg: '#0a0a0a',
    empty: '#1d1d1d',
    caption: 'coming soon to a group chat near you',
    swatch: ['#0a0a0a', '#ffd54a'],
    decorate(ctx, { w, h, caption, date, slots }) {
      slots.forEach((s, i) => {
        text(ctx, `SCENE 0${i + 1}`, s.x, s.y - 24, `700 26px ${F.mono}`, '#ffd54a', 'left')
      })
      text(ctx, date, w - 60, 146, `700 26px ${F.mono}`, '#777', 'right')
      fitText(ctx, caption, w / 2, h - 70, w - 200, 60, F.display, '#fff', '800')
    },
  },
  {
    id: 'receipt',
    name: 'Receipt',
    blurb: 'Itemised proof of a good time. Thermal paper look.',
    tag: 'strip',
    size: { w: 640, h: 1900 },
    slots: stack(60, 200, 520, 380, 3, 30),
    bg: '#fafafa',
    empty: '#ddd',
    tone: 'mono',
    caption: 'THANK YOU, COME AGAIN',
    swatch: ['#fafafa', '#222'],
    decorate(ctx, { w, h, caption, date, names, slots }) {
      text(ctx, 'GROUPSHOT', w / 2, 90, `700 40px ${F.mono}`, '#222')
      text(ctx, date, w / 2, 140, `700 22px ${F.mono}`, '#555')
      let y = 1430
      const line = (l: string, r: string) => {
        text(ctx, l, 60, y, `700 24px ${F.mono}`, '#222', 'left')
        text(ctx, r, w - 60, y, `700 24px ${F.mono}`, '#222', 'right')
        y += 40
      }
      const people = Math.max(1, names.length)
      line('PEOPLE', String(people))
      line('FRAMES', String(slots.length))
      line('PHOTOS', String(people * slots.length))
      if (names.length) {
        fitText(ctx, names.join(' · ').toUpperCase(), w / 2, y + 4, w - 120, 20, F.mono, '#555', '400')
        y += 40
      }
      ctx.fillStyle = '#222'
      ctx.setLineDash([8, 6])
      ctx.strokeStyle = '#222'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(60, y - 16)
      ctx.lineTo(w - 60, y - 16)
      ctx.stroke()
      ctx.setLineDash([])
      fitText(ctx, caption, w / 2, y + 34, w - 120, 26, F.mono, '#222')
      const r = rng(11)
      let x = 80
      ctx.fillStyle = '#222'
      while (x < w - 80) {
        const bw = 2 + Math.floor(r() * 6)
        ctx.fillRect(x, h - 150, bw, 90)
        x += bw + 2 + Math.floor(r() * 5)
      }
    },
  },
  {
    id: 'comic-strip',
    name: 'Comic Strip',
    blurb: 'Three panels, halftone dots, your caption in the bubble.',
    tag: 'wide',
    size: { w: 1800, h: 820 },
    slots: grid(48, 150, 1704, 560, 3, 1, 30),
    bg: '#fff8e1',
    empty: '#f1e2b3',
    caption: 'meanwhile, in the group chat…',
    swatch: ['#ffd23f', '#131317'],
    background(ctx, { w, h }) {
      ctx.fillStyle = '#f6c945'
      for (let y = 8; y < h; y += 18) {
        for (let x = (y / 18) % 2 ? 17 : 8; x < w; x += 18) {
          ctx.beginPath()
          ctx.arc(x, y, 3.2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    },
    decorate(ctx, { w, h, slots, caption, date, names }) {
      ctx.fillStyle = '#131317'
      ctx.fillRect(48, 34, w - 96, 90)
      const title = names.length ? `THE ADVENTURES OF ${joinNames(names).toUpperCase()}` : 'THE ADVENTURES CONTINUE'
      fitText(ctx, title, w / 2, 96, w - 160, 52, F.display, '#ffd23f', '800')
      ctx.lineWidth = 10
      ctx.strokeStyle = '#131317'
      ctx.lineJoin = 'round'
      for (const s of slots) ctx.strokeRect(s.x, s.y, s.w, s.h)
      const first = slots[0]!
      const bw = Math.min(first.w - 60, 470)
      const bx = first.x + 24
      const by = first.y + 22
      ctx.font = `700 30px ${F.display}`
      const lines = wrapLines(ctx, caption.toUpperCase(), bw - 48).slice(0, 3)
      const bh = 34 + lines.length * 38
      ctx.fillStyle = '#ffffff'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.roundRect(bx, by, bw, bh, 26)
      ctx.moveTo(bx + 70, by + bh - 2)
      ctx.lineTo(bx + 60, by + bh + 40)
      ctx.lineTo(bx + 120, by + bh - 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(bx + 72, by + bh - 6, 46, 8)
      for (const [i, l] of lines.entries()) {
        text(ctx, l, bx + bw / 2, by + 48 + i * 38, `700 30px ${F.display}`, '#131317')
      }
      slots.forEach((s, i) => {
        ctx.fillStyle = '#131317'
        ctx.fillRect(s.x + s.w - 74, s.y + s.h - 50, 74, 50)
        text(ctx, String(i + 1), s.x + s.w - 37, s.y + s.h - 13, `800 34px ${F.display}`, '#ffd23f')
      })
      text(ctx, date, 48, h - 46, `700 22px ${F.mono}`, '#131317', 'left')
      text(ctx, `${slots.length} PANELS`, w - 48, h - 46, `700 22px ${F.mono}`, '#131317', 'right')
    },
  },
  {
    id: 'yearbook',
    name: 'Yearbook',
    blurb: 'Class photo page with your names and a senior quote.',
    tag: 'grid',
    size: { w: 1200, h: 1560 },
    slots: grid(80, 250, 1040, 1000, 2, 2, 28),
    bg: '#f3eee2',
    empty: '#dcd3bf',
    radius: 6,
    caption: 'we were here',
    swatch: ['#f3eee2', '#1f3a5f'],
    background(ctx, { w, h }) {
      ctx.fillStyle = '#1f3a5f'
      ctx.fillRect(0, 0, w, 16)
      ctx.fillRect(0, h - 16, w, 16)
    },
    decorate(ctx, { w, h, slots, caption, date, names }) {
      const year = date.match(/\d{4}/)?.[0] ?? ''
      text(ctx, 'GROUPSHOT YEARBOOK', w / 2, 90, `700 22px ${F.mono}`, '#8a7d62')
      fitText(ctx, year ? `Class of ${year}` : 'The Class Photo', w / 2, 190, w - 160, 92, F.serif, '#1f3a5f', '400')
      ctx.strokeStyle = '#1f3a5f'
      ctx.lineWidth = 3
      for (const s of slots) ctx.strokeRect(s.x - 8, s.y - 8, s.w + 16, s.h + 16)
      ctx.fillStyle = '#1f3a5f'
      ctx.fillRect(80, 1292, w - 160, 2)
      fitText(ctx, joinNames(names) || 'Everyone', w / 2, 1352, w - 160, 40, F.display, '#1f3a5f', '700')
      fitText(ctx, `“${caption}”`, w / 2, 1420, w - 200, 40, F.serif, '#3d3a33', 'italic 400')
      text(ctx, date, w / 2, h - 60, `500 22px ${F.mono}`, '#8a7d62')
    },
  },
  {
    id: 'party-six',
    name: 'Party Six',
    blurb: 'Six frames and confetti for the big nights.',
    tag: 'grid',
    size: { w: 1200, h: 1800 },
    slots: grid(60, 60, 1080, 1560, 2, 3, 24),
    bg: '#141114',
    empty: '#2b252b',
    radius: 14,
    caption: 'what a night',
    swatch: ['#141114', '#ffd54a'],
    background(ctx, { w, h }) {
      const r = rng(5)
      const colors = ['#ff5a36', '#ffd54a', '#5ee0b0', '#8be8ff', '#ff9de2']
      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = colors[i % colors.length] as string
        ctx.save()
        ctx.translate(r() * w, r() * h)
        ctx.rotate(r() * Math.PI)
        ctx.fillRect(-6, -2, 12, 5)
        ctx.restore()
      }
    },
    decorate(ctx, { w, caption, date }) {
      fitText(ctx, caption, w / 2, 1700, w - 120, 58, F.display, '#ffd54a', '800')
      text(ctx, date, w / 2, 1760, `700 24px ${F.mono}`, '#f7f2ea')
    },
  },
]

function wrapLines(ctx: Ctx, s: string, maxW: number) {
  const out: string[] = []
  let line = ''
  for (const word of s.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxW && line) {
      out.push(line)
      line = word
    } else line = next
  }
  if (line) out.push(line)
  return out
}

function wrap(ctx: Ctx, s: string, x: number, y: number, maxW: number, lh: number, color: string) {
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  let line = ''
  for (const word of s.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxW && line) {
      ctx.fillText(line, x, y)
      line = word
      y += lh
    } else line = next
  }
  if (line) ctx.fillText(line, x, y)
}

const META: Record<string, Pick<Template, 'occasions' | 'people'>> = {
  'red-thread': { occasions: ['date'], people: [2, 2] },
  'contact-club': { occasions: ['friends'], people: [1, 4] },
  'after-hours': { occasions: ['party', 'friends'], people: [2, 6] },
  airmail: { occasions: ['family', 'friends'], people: [1, 6] },
  'cherry-notes': { occasions: ['date'], people: [1, 2] },
  'matcha-date': { occasions: ['date'], people: [2, 2] },
  'blue-hour': { occasions: ['date', 'friends'], people: [1, 3] },
  'ribbon-club': { occasions: ['friends', 'family'], people: [2, 4] },
  'midnight-duo': { occasions: ['date'], people: [2, 2] },
  'weekend-post': { occasions: ['family', 'friends'], people: [2, 6] },
  'classic-strip': { occasions: ['friends', 'date', 'party'], people: [1, 4] },
  'film-roll': { occasions: ['friends'], people: [1, 4] },
  polaroid: { occasions: ['date', 'family'], people: [1, 3] },
  'grid-four': { occasions: ['friends', 'family'], people: [1, 6] },
  postcard: { occasions: ['family'], people: [1, 6] },
  newspaper: { occasions: ['milestone', 'party'], people: [1, 6] },
  magazine: { occasions: ['milestone'], people: [1, 3] },
  arcade: { occasions: ['party', 'friends'], people: [2, 6] },
  y2k: { occasions: ['friends', 'party'], people: [1, 4] },
  wanted: { occasions: ['party'], people: [1, 3] },
  cinema: { occasions: ['friends', 'milestone'], people: [2, 6] },
  receipt: { occasions: ['party', 'friends'], people: [1, 6] },
  'comic-strip': { occasions: ['friends', 'party'], people: [1, 6] },
  yearbook: { occasions: ['milestone', 'friends'], people: [2, 6] },
  'party-six': { occasions: ['party', 'milestone'], people: [3, 6] },
}
for (const t of templates) Object.assign(t, META[t.id] ?? { occasions: ['friends'], people: [1, 6] })

const byId = new Map(templates.map((t) => [t.id, t]))
export const getTemplate = (id: string) => byId.get(id) ?? (templates[0] as Template)
export type { Template }
