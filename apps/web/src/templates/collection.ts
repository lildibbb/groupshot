import { grid, stack } from './layout'
import { F, type Template } from './types'

const editions = [
  {
    id: 'cherry-notes',
    name: 'Cherry Notes',
    bg: '#f7e4e5',
    ink: '#982e41',
    caption: 'a little love, on film',
    tag: 'strip',
  },
  {
    id: 'matcha-date',
    name: 'Matcha Date',
    bg: '#e3e8d7',
    ink: '#344b36',
    caption: 'our kind of afternoon',
    tag: 'strip',
  },
  { id: 'blue-hour', name: 'Blue Hour', bg: '#dae5ef', ink: '#233d67', caption: 'stay a little longer', tag: 'grid' },
  { id: 'ribbon-club', name: 'Ribbon Club', bg: '#f5e9ed', ink: '#7c354f', caption: 'tied together', tag: 'grid' },
  {
    id: 'midnight-duo',
    name: 'Midnight Duo',
    bg: '#242127',
    ink: '#f4ebdd',
    caption: 'just the two of us',
    tag: 'strip',
  },
  {
    id: 'weekend-post',
    name: 'Weekend Post',
    bg: '#f0e5cc',
    ink: '#65442e',
    caption: 'a weekend worth keeping',
    tag: 'wide',
  },
] as const

export const collection: Template[] = editions.map((e) => ({
  ...e,
  blurb:
    e.tag === 'strip'
      ? 'Four moments on a keepsake strip.'
      : e.tag === 'grid'
        ? 'Four frames, one shared memory.'
        : 'Two scenes from your weekend.',
  size: e.tag === 'strip' ? { w: 600, h: 1800 } : e.tag === 'grid' ? { w: 1200, h: 1400 } : { w: 1500, h: 1000 },
  slots:
    e.tag === 'strip'
      ? stack(40, 90, 520, 360, 4, 22)
      : e.tag === 'grid'
        ? grid(60, 130, 1080, 1080, 2, 2, 24)
        : grid(50, 90, 1400, 700, 2, 1, 30),
  empty: e.bg,
  swatch: [e.bg, e.ink],
  decorate(ctx, { w, h, caption, date }) {
    ctx.fillStyle = e.ink
    ctx.textAlign = 'center'
    ctx.font = `700 22px ${F.mono}`
    ctx.fillText('GROUPSHOT / MEMORY CLUB', w / 2, 52)
    ctx.font = `italic 400 ${e.tag === 'strip' ? 35 : 52}px ${F.serif}`
    ctx.fillText(caption, w / 2, h - (e.tag === 'strip' ? 112 : 100), w - 100)
    ctx.font = `400 20px ${F.mono}`
    ctx.fillText(date, w / 2, h - 48)
    if (e.id === 'ribbon-club') {
      ctx.strokeStyle = e.ink
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.ellipse(w / 2 - 25, 85, 30, 12, 0.4, 0, Math.PI * 2)
      ctx.ellipse(w / 2 + 25, 85, 30, 12, -0.4, 0, Math.PI * 2)
      ctx.moveTo(w / 2, 85)
      ctx.lineTo(w / 2 - 22, 115)
      ctx.moveTo(w / 2, 85)
      ctx.lineTo(w / 2 + 22, 115)
      ctx.stroke()
    }
  },
}))
