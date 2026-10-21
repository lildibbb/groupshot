import type { Scene } from '@groupshot/protocol'
import type { Ctx, Rect } from '@/templates/types'

export const SCENES: { id: Scene; name: string; color: string; light: string | null }[] = [
  { id: 'studio', name: 'White studio', color: 'linear-gradient(#ffffff, #e9e6e1)', light: '#fff4e414' },
  { id: 'blue', name: 'Sky room', color: 'linear-gradient(#cfe2ff, #9fc0ee)', light: '#d6e6ff1f' },
  { id: 'curtain', name: 'Cherry curtain', color: 'linear-gradient(#e2546b, #8f1f37)', light: '#ff6f8a1c' },
  { id: 'original', name: 'My background', color: 'linear-gradient(#56606b, #2b323a)', light: null },
]

export const sceneLight = (scene: Scene) => SCENES.find((s) => s.id === scene)?.light ?? null

export const PORTRAIT_ASPECT = 3 / 4

export function personRects(slot: Rect, count: number): Rect[] {
  const n = Math.max(1, count)
  const rows = n <= 3 ? [n] : [Math.floor(n / 2), Math.ceil(n / 2)]
  const out: Rect[] = []
  rows.forEach((inRow, r) => {
    const back = rows.length === 2 && r === 0
    const rowH = slot.h * (rows.length === 2 ? (back ? 0.8 : 0.86) : 1)
    const w = Math.min(rowH * PORTRAIT_ASPECT, (slot.w / inRow) * 1.5)
    const h = w / PORTRAIT_ASPECT
    const step = Math.min(slot.w / inRow, w * 0.85)
    const x0 = slot.x + (slot.w - step * inRow) / 2
    const y = slot.y + slot.h - h - (back ? slot.h * 0.16 : 0)
    for (let i = 0; i < inRow; i++) out.push({ x: x0 + (i + 0.5) * step - w / 2, y, w, h })
  })
  return out
}

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export function drawScene(ctx: Ctx, rect: Rect, scene: Scene, studio?: ImageBitmap) {
  const { x, y, w, h } = rect
  if (scene === 'studio' && studio) {
    const scale = Math.max(w / studio.width, h / studio.height)
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    ctx.drawImage(
      studio,
      x + (w - studio.width * scale) / 2,
      y + (h - studio.height * scale) / 2,
      studio.width * scale,
      studio.height * scale,
    )
    ctx.restore()
    return
  }
  if (scene === 'blue') return skyRoom(ctx, rect)
  if (scene === 'curtain') return cherryCurtain(ctx, rect)
  const wall = ctx.createLinearGradient(x, y, x, y + h)
  wall.addColorStop(0, '#fbfaf8')
  wall.addColorStop(0.68, '#efece7')
  wall.addColorStop(1, '#ddd8d0')
  ctx.fillStyle = wall
  ctx.fillRect(x, y, w, h)
  const key = ctx.createRadialGradient(x + w * 0.32, y + h * 0.18, 0, x + w * 0.32, y + h * 0.18, Math.max(w, h) * 0.75)
  key.addColorStop(0, '#ffffffcc')
  key.addColorStop(1, '#ffffff00')
  ctx.fillStyle = key
  ctx.fillRect(x, y, w, h)
  const vignette = ctx.createRadialGradient(
    x + w / 2,
    y + h / 2,
    Math.min(w, h) * 0.35,
    x + w / 2,
    y + h / 2,
    Math.max(w, h) * 0.8,
  )
  vignette.addColorStop(0, '#00000000')
  vignette.addColorStop(1, '#0000001c')
  ctx.fillStyle = vignette
  ctx.fillRect(x, y, w, h)
}

function skyRoom(ctx: Ctx, { x, y, w, h }: Rect) {
  const sky = ctx.createLinearGradient(x, y, x, y + h)
  sky.addColorStop(0, '#bcd6fb')
  sky.addColorStop(1, '#eaf2ff')
  ctx.fillStyle = sky
  ctx.fillRect(x, y, w, h)
  const rand = seeded(7)
  ctx.fillStyle = '#ffffffd9'
  for (let i = 0; i < 7; i++) {
    const cx = x + rand() * w
    const cy = y + rand() * h * 0.7
    const r = Math.min(w, h) * (0.05 + rand() * 0.07)
    ctx.beginPath()
    for (const [dx, dy, k] of [
      [0, 0, 1],
      [r * 0.9, r * 0.15, 0.8],
      [-r * 0.9, r * 0.2, 0.75],
      [r * 0.4, -r * 0.45, 0.8],
    ] as const) {
      ctx.moveTo(cx + dx + r * k, cy + dy)
      ctx.arc(cx + dx, cy + dy, r * k, 0, Math.PI * 2)
    }
    ctx.fill()
  }
}

function cherryCurtain(ctx: Ctx, { x, y, w, h }: Rect) {
  const base = ctx.createLinearGradient(x, y, x, y + h)
  base.addColorStop(0, '#c63a52')
  base.addColorStop(1, '#7d1b31')
  ctx.fillStyle = base
  ctx.fillRect(x, y, w, h)
  const folds = 14
  for (let i = 0; i < folds; i++) {
    const fx = x + (i * w) / folds
    const fold = ctx.createLinearGradient(fx, y, fx + w / folds, y)
    fold.addColorStop(0, '#00000030')
    fold.addColorStop(0.45, '#ffffff1a')
    fold.addColorStop(1, '#00000030')
    ctx.fillStyle = fold
    ctx.fillRect(fx, y, w / folds, h)
  }
  const rand = seeded(3)
  for (let i = 0; i < 16; i++) {
    const bx = x + ((i + 0.5) * w) / 16
    const by = y + h * (0.06 + Math.sin((i / 15) * Math.PI) * 0.06)
    const glow = ctx.createRadialGradient(bx, by, 0, bx, by, Math.min(w, h) * 0.05)
    glow.addColorStop(0, '#fff6d8')
    glow.addColorStop(0.25, `#ffe08a${rand() > 0.5 ? 'cc' : '99'}`)
    glow.addColorStop(1, '#ffe08a00')
    ctx.fillStyle = glow
    ctx.fillRect(bx - w * 0.06, by - w * 0.06, w * 0.12, w * 0.12)
  }
}
