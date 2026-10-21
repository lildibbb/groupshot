import { grid, stack } from './layout'
import { F, type Template } from './types'

export const studioEditions: Template[] = [
  {
    id: 'red-thread',
    name: 'Red Thread',
    tag: 'strip',
    blurb: 'A ribbon, four frames, and a note to keep.',
    size: { w: 600, h: 1800 },
    slots: stack(48, 150, 504, 340, 4, 22),
    bg: '#f4eee4',
    empty: '#d8cec0',
    caption: 'always, us',
    swatch: ['#f4eee4', '#963f39'],
    decorate(ctx, { w, h, caption, date }) {
      ctx.strokeStyle = '#963f39'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.ellipse(270, 65, 34, 18, 0.4, 0, Math.PI * 2)
      ctx.ellipse(330, 65, 34, 18, -0.4, 0, Math.PI * 2)
      ctx.moveTo(300, 65)
      ctx.bezierCurveTo(280, 80, 310, 110, 260, 120)
      ctx.moveTo(300, 65)
      ctx.bezierCurveTo(320, 80, 290, 110, 340, 120)
      ctx.stroke()
      ctx.fillStyle = '#963f39'
      ctx.textAlign = 'center'
      ctx.font = `400 44px ${F.serif}`
      ctx.fillText(caption, w / 2, h - 110, w - 96)
      ctx.font = `400 18px ${F.mono}`
      ctx.fillText(date, w / 2, h - 55, w - 96)
    },
  },
  {
    id: 'contact-club',
    name: 'Contact Club',
    tag: 'grid',
    blurb: 'An editor’s contact sheet, in ink blue.',
    size: { w: 1200, h: 1400 },
    slots: grid(50, 150, 1100, 1050, 2, 2, 36),
    bg: '#23344c',
    empty: '#a2adba',
    caption: 'the good takes',
    swatch: ['#23344c', '#efe9dd'],
    decorate(ctx, { w, h, caption, date, slots }) {
      ctx.fillStyle = '#efe9dd'
      ctx.textAlign = 'left'
      ctx.font = `700 56px ${F.display}`
      ctx.fillText('CONTACT CLUB', 50, 95)
      ctx.font = `400 18px ${F.mono}`
      slots.forEach((s, i) => {
        ctx.fillText(`0${i + 1} / GS`, s.x, s.y - 10)
      })
      ctx.textAlign = 'center'
      ctx.font = `400 44px ${F.serif}`
      ctx.fillText(caption, w / 2, h - 105, w - 100)
      ctx.font = `400 20px ${F.mono}`
      ctx.fillText(date, w / 2, h - 50)
    },
  },
  {
    id: 'after-hours',
    name: 'After Hours',
    tag: 'strip',
    blurb: 'Black-and-white portraits on silver stock.',
    size: { w: 620, h: 1750 },
    slots: stack(45, 130, 530, 435, 3, 28),
    bg: '#d9d9d5',
    empty: '#b3b4b1',
    tone: 'mono',
    caption: 'one more before we go',
    swatch: ['#d9d9d5', '#252c32'],
    decorate(ctx, { w, h, caption, date }) {
      ctx.fillStyle = '#252c32'
      ctx.textAlign = 'center'
      ctx.font = `700 46px ${F.display}`
      ctx.fillText('AFTER HOURS', w / 2, 82)
      ctx.font = `400 36px ${F.serif}`
      ctx.fillText(caption, w / 2, h - 135, w - 90)
      ctx.font = `400 19px ${F.mono}`
      ctx.fillText(date, w / 2, h - 75)
    },
  },
  {
    id: 'airmail',
    name: 'Air Mail',
    tag: 'wide',
    blurb: 'From different cities, with love.',
    size: { w: 1500, h: 1000 },
    slots: [{ x: 70, y: 130, w: 1360, h: 650 }],
    bg: '#eee8d9',
    empty: '#c8c1b2',
    caption: 'distance looks good on us',
    swatch: ['#eee8d9', '#243a55'],
    background(ctx, { w, h }) {
      for (let x = 0; x < w; x += 80) {
        ctx.fillStyle = x % 160 ? '#243a55' : '#a34337'
        ctx.fillRect(x, 0, 40, 18)
        ctx.fillRect(x, h - 18, 40, 18)
      }
    },
    decorate(ctx, { w, caption, date }) {
      ctx.fillStyle = '#243a55'
      ctx.textAlign = 'center'
      ctx.font = `700 32px ${F.mono}`
      ctx.fillText('GROUPSHOT / PAR AVION', w / 2, 85)
      ctx.font = `400 58px ${F.serif}`
      ctx.fillText(caption, w / 2, 875, w - 140)
      ctx.font = `400 22px ${F.mono}`
      ctx.fillText(date, w / 2, 940)
    },
  },
]
