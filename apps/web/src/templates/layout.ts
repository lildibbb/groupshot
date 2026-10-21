import type { Rect } from './types'

export function stack(x: number, y: number, w: number, slotH: number, n: number, gap: number): Rect[] {
  return Array.from({ length: n }, (_, i) => ({ x, y: y + i * (slotH + gap), w, h: slotH }))
}

export function grid(x: number, y: number, w: number, h: number, cols: number, rows: number, gap: number): Rect[] {
  const cw = (w - gap * (cols - 1)) / cols
  const ch = (h - gap * (rows - 1)) / rows
  const out: Rect[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) out.push({ x: x + c * (cw + gap), y: y + r * (ch + gap), w: cw, h: ch })
  return out
}

export function tile(slot: Rect, n: number): Rect[] {
  if (n <= 1) return [slot]
  const wide = slot.w / slot.h >= 1
  let cols: number
  if (n === 2) cols = wide ? 2 : 1
  else if (n === 3) cols = wide ? 3 : 1
  else if (n === 4) cols = 2
  else cols = wide ? 3 : 2
  const rows = Math.ceil(n / cols)
  const th = slot.h / rows
  const out: Rect[] = []
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, n - r * cols)
    const tw = slot.w / inRow
    for (let c = 0; c < inRow; c++) out.push({ x: slot.x + c * tw, y: slot.y + r * th, w: tw, h: th })
  }
  return out
}

export function coverCrop(sw: number, sh: number, dst: Rect) {
  const scale = Math.max(dst.w / sw, dst.h / sh)
  const cw = dst.w / scale
  const ch = dst.h / scale
  return { sx: (sw - cw) / 2, sy: Math.max(0, (sh - ch) * 0.4), sw: cw, sh: ch }
}
