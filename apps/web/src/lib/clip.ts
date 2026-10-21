import type { Output } from '@groupshot/protocol'
import type { Template } from '@/templates/types'
import { type ComposeInput, drawTemplate, prepareComposition } from './compose-core'

export const CLIP_FRAMES = 12
export const CLIP_FPS = 10
const COLS = 4
const FW = 270
const FH = 360

export function videoSupported() {
  return typeof MediaRecorder !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype
}

export async function recordBurst(
  source: HTMLVideoElement | HTMLCanvasElement,
  opts: { mirror: boolean; filter: string },
): Promise<ImageBitmap[]> {
  const cutout = source instanceof HTMLCanvasElement
  const sw = cutout ? source.width : source.videoWidth
  const sh = cutout ? source.height : source.videoHeight
  if (!sw || !sh) throw new Error('Camera frame not ready')
  const scale = Math.max(FW / sw, FH / sh)
  const canvas = document.createElement('canvas')
  canvas.width = FW
  canvas.height = FH
  const ctx = canvas.getContext('2d')!
  const frames: ImageBitmap[] = []
  for (let i = 0; i < CLIP_FRAMES; i++) {
    const at = performance.now()
    ctx.clearRect(0, 0, FW, FH)
    ctx.save()
    if (opts.mirror) {
      ctx.translate(FW, 0)
      ctx.scale(-1, 1)
    }
    ctx.filter = cutout ? 'none' : opts.filter
    ctx.drawImage(source, (FW - sw * scale) / 2, (FH - sh * scale) / 2, sw * scale, sh * scale)
    ctx.restore()
    frames.push(await createImageBitmap(canvas))
    await new Promise((r) => setTimeout(r, Math.max(0, 1000 / CLIP_FPS - (performance.now() - at))))
  }
  return frames
}

export function toSprite(frames: ImageBitmap[], alpha: boolean): Promise<Blob> {
  const rows = Math.ceil(frames.length / COLS)
  const canvas = document.createElement('canvas')
  canvas.width = FW * COLS
  canvas.height = FH * rows
  const ctx = canvas.getContext('2d')!
  for (const [i, f] of frames.entries()) ctx.drawImage(f, (i % COLS) * FW, Math.floor(i / COLS) * FH)
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('clip pack failed'))), alpha ? 'image/png' : 'image/jpeg', 0.85),
  )
}

export async function fromSprite(blob: Blob): Promise<ImageBitmap[]> {
  const sheet = await createImageBitmap(blob)
  const cols = Math.max(1, Math.round(sheet.width / FW))
  const rows = Math.max(1, Math.round(sheet.height / FH))
  const out: ImageBitmap[] = []
  for (let i = 0; i < Math.min(CLIP_FRAMES, cols * rows); i++)
    out.push(await createImageBitmap(sheet, (i % cols) * FW, Math.floor(i / cols) * FH, FW, FH))
  sheet.close()
  return out
}

function pickType() {
  for (const t of [
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ])
    if (MediaRecorder.isTypeSupported(t)) return t
  return ''
}

export function sequence(n: number, mode: Exclude<Output, 'photo'>) {
  const fwd = Array.from({ length: n }, (_, i) => i)
  return mode === 'boomerang' ? [...fwd, ...fwd.slice(1, -1).reverse()] : fwd
}

export async function composeVideoStrip(
  t: Template,
  base: ComposeInput,
  clips: (ImageBitmap[] | null)[][],
  mode: Exclude<Output, 'photo'>,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  if (!videoSupported()) throw new Error('This browser cannot record video.')
  base = await prepareComposition(t, base)
  const scale = Math.min(1, 1280 / Math.max(t.size.w, t.size.h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round((t.size.w * scale) / 2) * 2
  canvas.height = Math.round((t.size.h * scale) / 2) * 2
  const ctx = canvas.getContext('2d')!
  const order = sequence(CLIP_FRAMES, mode)
  const loops = mode === 'boomerang' ? 3 : 2
  const frameAt = (k: number): ComposeInput => ({
    ...base,
    rounds: base.rounds.map((people, i) =>
      people.map((still, j) => {
        const c = clips[i]?.[j]
        return c?.length ? (c[order[k % order.length]! % c.length] ?? still) : still
      }),
    ),
  })
  drawTemplate(ctx, t, frameAt(0), scale)
  const stream = canvas.captureStream(CLIP_FPS)
  const type = pickType()
  const recorder = new MediaRecorder(stream, { mimeType: type || undefined, videoBitsPerSecond: 4_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: (type || 'video/webm').split(';')[0] }))
  })
  recorder.start()
  const steps = order.length * loops
  for (let k = 0; k < steps; k++) {
    const at = performance.now()
    drawTemplate(ctx, t, frameAt(k), scale)
    onProgress?.((k + 1) / steps)
    await new Promise((r) => setTimeout(r, Math.max(0, 1000 / CLIP_FPS - (performance.now() - at))))
  }
  recorder.stop()
  for (const tr of stream.getTracks()) tr.stop()
  return done
}
