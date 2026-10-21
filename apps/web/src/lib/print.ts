export const DPI = 300
export const PAPERS = {
  letter: { id: 'letter', label: 'US Letter', w: 2550, h: 3300 },
  a4: { id: 'a4', label: 'A4', w: 2480, h: 3508 },
} as const
export type PaperId = keyof typeof PAPERS

export interface Placed {
  x: number
  y: number
  w: number
  h: number
}

export interface PrintLayout {
  paper: (typeof PAPERS)[PaperId]
  scale: number
  copies: Placed[]
}

const MARGIN = 150
const GUTTER = 120
const MAX_SCALE = 1

export function printLayout(paperId: PaperId, strip: { w: number; h: number }): PrintLayout {
  const paper = PAPERS[paperId]
  const aw = paper.w - MARGIN * 2
  const ah = paper.h - MARGIN * 2
  const single = Math.min(MAX_SCALE, aw / strip.w, ah / strip.h)
  const tall = strip.h >= strip.w
  const pair = tall
    ? Math.min(MAX_SCALE, (aw - GUTTER) / 2 / strip.w, ah / strip.h)
    : Math.min(MAX_SCALE, aw / strip.w, (ah - GUTTER) / 2 / strip.h)
  const two = pair >= single * 0.6
  const scale = round(two ? pair : single)
  const w = Math.round(strip.w * scale)
  const h = Math.round(strip.h * scale)
  const copies: Placed[] = []
  if (!two) copies.push({ x: Math.round((paper.w - w) / 2), y: Math.round((paper.h - h) / 2), w, h })
  else if (tall) {
    const x0 = Math.round((paper.w - (w * 2 + GUTTER)) / 2)
    const y = Math.round((paper.h - h) / 2)
    copies.push({ x: x0, y, w, h }, { x: x0 + w + GUTTER, y, w, h })
  } else {
    const x = Math.round((paper.w - w) / 2)
    const y0 = Math.round((paper.h - (h * 2 + GUTTER)) / 2)
    copies.push({ x, y: y0, w, h }, { x, y: y0 + h + GUTTER, w, h })
  }
  return { paper, scale, copies }
}

const round = (n: number) => Math.round(n * 1000) / 1000

export function cropMarks(r: Placed, len = 60, gap = 18): [number, number, number, number][] {
  const out: [number, number, number, number][] = []
  for (const [cx, sx] of [
    [r.x, -1],
    [r.x + r.w, 1],
  ] as const) {
    for (const [cy, sy] of [
      [r.y, -1],
      [r.y + r.h, 1],
    ] as const) {
      out.push([cx + sx * gap, cy, cx + sx * (gap + len), cy])
      out.push([cx, cy + sy * gap, cx, cy + sy * (gap + len)])
    }
  }
  return out
}

export async function composePrintSheet(strip: Blob, paperId: PaperId): Promise<Blob> {
  const image = await createImageBitmap(strip)
  try {
    const layout = printLayout(paperId, { w: image.width, h: image.height })
    const canvas = document.createElement('canvas')
    canvas.width = layout.paper.w
    canvas.height = layout.paper.h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser can’t draw the print sheet.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.strokeStyle = '#8a8a94'
    ctx.lineWidth = 3
    for (const c of layout.copies) {
      ctx.drawImage(image, c.x, c.y, c.w, c.h)
      ctx.beginPath()
      for (const [x1, y1, x2, y2] of cropMarks(c)) {
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
      }
      ctx.stroke()
    }
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob(
        (b) => (b ? res(b) : rej(new Error('The print sheet couldn’t be saved. Try again.'))),
        'image/jpeg',
        0.95,
      ),
    )
  } finally {
    image.close()
  }
}
