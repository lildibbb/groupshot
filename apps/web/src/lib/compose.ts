import { getTemplate } from '@/templates'
import type { WorkerRequest, WorkerResponse } from '@/workers/compose.worker'
import ComposeWorker from '@/workers/compose.worker?worker'
import { type ComposeInput, drawTemplate, prepareComposition } from './compose-core'
import { FONT_SPECS, loadFonts } from './fonts'

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, (r: WorkerResponse) => void>()
const supportsWorker = typeof OffscreenCanvas !== 'undefined' && typeof Worker !== 'undefined'
let mainFonts: Promise<void> | null = null

function getWorker() {
  if (worker) return worker
  worker = new ComposeWorker()
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    pending.get(e.data.id)?.(e.data)
    pending.delete(e.data.id)
  }
  worker.postMessage({ kind: 'fonts', specs: FONT_SPECS, base: location.href } satisfies WorkerRequest)
  return worker
}

type Job = Extract<WorkerRequest, { id: number }>
type JobInput = Job extends infer J ? (J extends Job ? Omit<J, 'id'> : never) : never

function call(req: JobInput): Promise<Blob> {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, (r) => ('error' in r ? reject(new Error(r.error)) : resolve(r.blob)))
    getWorker().postMessage({ ...req, id } as WorkerRequest)
  })
}

export function warmCompositor() {
  if (supportsWorker) getWorker()
}

export async function composeImage(
  templateId: string,
  input: ComposeInput,
  opts: { scale?: number; type?: 'image/png' | 'image/jpeg' } = {},
) {
  const scale = opts.scale ?? 1
  const type = opts.type ?? 'image/png'
  input = await prepareComposition(getTemplate(templateId), input)
  if (supportsWorker) return call({ kind: 'compose', templateId, input, type, scale })
  mainFonts ??= loadFonts(document.fonts, FONT_SPECS, location.href)
  await mainFonts
  const t = getTemplate(templateId)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(t.size.w * scale)
  canvas.height = Math.round(t.size.h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  drawTemplate(ctx, t, input, scale)
  return new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), type, 0.92),
  )
}

export async function composeGif(templateId: string, input: ComposeInput) {
  if (!supportsWorker) return Promise.reject(new Error('GIF export needs a newer browser.'))
  input = await prepareComposition(getTemplate(templateId), input)
  return call({ kind: 'gif', templateId, input })
}
