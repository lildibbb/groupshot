/// <reference lib="webworker" />
import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import { type ComposeInput, drawTemplate } from '@/lib/compose-core'
import { type FontSpec, loadFonts } from '@/lib/fonts'
import { getTemplate } from '@/templates'

export type WorkerRequest =
  | { kind: 'fonts'; specs: FontSpec[]; base: string }
  | {
      kind: 'compose'
      id: number
      templateId: string
      input: ComposeInput
      type: 'image/png' | 'image/jpeg'
      scale: number
    }
  | { kind: 'gif'; id: number; templateId: string; input: ComposeInput }

export type WorkerResponse = { id: number; blob: Blob } | { id: number; error: string }

declare const self: DedicatedWorkerGlobalScope & { fonts?: FontFaceSet }

let fontsReady: Promise<void> = Promise.resolve()

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.kind === 'fonts') {
    fontsReady = loadFonts(self.fonts, msg.specs, msg.base)
    return
  }
  try {
    await fontsReady
    const t = getTemplate(msg.templateId)
    const blob = msg.kind === 'compose' ? await compose(t, msg.input, msg.type, msg.scale) : gif(t, msg.input)
    self.postMessage({ id: msg.id, blob } satisfies WorkerResponse)
  } catch (err) {
    self.postMessage({ id: msg.id, error: String(err) } satisfies WorkerResponse)
  }
}

async function compose(t: ReturnType<typeof getTemplate>, input: ComposeInput, type: string, scale: number) {
  const canvas = new OffscreenCanvas(Math.round(t.size.w * scale), Math.round(t.size.h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  drawTemplate(ctx, t, input, scale)
  return canvas.convertToBlob({ type, quality: 0.92 })
}

function gif(t: ReturnType<typeof getTemplate>, input: ComposeInput) {
  const scale = Math.min(1, 540 / t.size.w)
  const w = Math.round(t.size.w * scale)
  const h = Math.round(t.size.h * scale)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2d context unavailable')
  const enc = GIFEncoder()
  const rounds = input.rounds.length ? input.rounds : [[]]
  const frames = rounds.length > 1 ? [...rounds, ...rounds.slice(1, -1).reverse()] : rounds
  for (const round of frames) {
    drawTemplate(ctx, t, { ...input, rounds: t.slots.map(() => round) }, scale)
    const { data } = ctx.getImageData(0, 0, w, h)
    const palette = quantize(data, 256)
    enc.writeFrame(applyPalette(data, palette), w, h, { palette, delay: 450 })
  }
  enc.finish()
  return new Blob([enc.bytes().slice()], { type: 'image/gif' })
}
