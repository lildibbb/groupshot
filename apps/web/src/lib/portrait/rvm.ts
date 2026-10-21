import type * as Ort from 'onnxruntime-web'
import ortWasm from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm?url'

type Session = Ort.InferenceSession
const INPUT_W = 512
const INPUT_H = 384
const STILL_LONG_SIDE = 768

export function hdSupported() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export class Matting {
  private rec: Ort.Tensor[] = []
  private canvas = new OffscreenCanvas(INPUT_W, INPUT_H)
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
  private input = new Float32Array(3 * INPUT_W * INPUT_H)
  private busy = false
  alpha: Uint8Array | null = null
  version = 0
  readonly width = INPUT_W
  readonly height = INPUT_H

  private constructor(
    private ort: typeof Ort,
    private session: Session,
  ) {
    this.reset()
  }

  static async load(provider: 'webgpu' | 'wasm' = 'webgpu') {
    if (provider === 'webgpu' && !hdSupported()) throw new Error('WebGPU unavailable')
    const ort = await import('onnxruntime-web/webgpu')
    ort.env.wasm.wasmPaths = { wasm: ortWasm }
    const session = await ort.InferenceSession.create('/models/rvm_mobilenetv3_fp32.onnx', {
      executionProviders: [provider],
      graphOptimizationLevel: 'all',
    })
    return new Matting(ort, session)
  }

  reset() {
    const zero = () => new this.ort.Tensor('float32', new Float32Array(1), [1, 1, 1, 1])
    this.rec = [zero(), zero(), zero(), zero()]
  }

  private toInput(source: CanvasImageSource) {
    this.ctx.drawImage(source, 0, 0, INPUT_W, INPUT_H)
    const px = this.ctx.getImageData(0, 0, INPUT_W, INPUT_H).data
    const plane = INPUT_W * INPUT_H
    for (let i = 0; i < plane; i++) {
      this.input[i] = px[i * 4]! / 255
      this.input[i + plane] = px[i * 4 + 1]! / 255
      this.input[i + plane * 2] = px[i * 4 + 2]! / 255
    }
    return new this.ort.Tensor('float32', this.input, [1, 3, INPUT_H, INPUT_W])
  }

  async still(source: CanvasImageSource, srcW: number, srcH: number) {
    const w = Math.max(64, Math.round((STILL_LONG_SIDE * Math.min(1, srcW / srcH)) / 8) * 8)
    const h = Math.max(64, Math.round((STILL_LONG_SIDE * Math.min(1, srcH / srcW)) / 8) * 8)
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(source, 0, 0, w, h)
    const px = ctx.getImageData(0, 0, w, h).data
    const plane = w * h
    const input = new Float32Array(3 * plane)
    for (let i = 0; i < plane; i++) {
      input[i] = px[i * 4]! / 255
      input[i + plane] = px[i * 4 + 1]! / 255
      input[i + plane * 2] = px[i * 4 + 2]! / 255
    }
    const zero = () => new this.ort.Tensor('float32', new Float32Array(1), [1, 1, 1, 1])
    const out = await this.session.run({
      src: new this.ort.Tensor('float32', input, [1, 3, h, w]),
      r1i: zero(),
      r2i: zero(),
      r3i: zero(),
      r4i: zero(),
      downsample_ratio: new this.ort.Tensor('float32', new Float32Array([0.5]), [1]),
    })
    const pha = out.pha!.data as Float32Array
    const alpha = new Uint8Array(pha.length)
    for (let i = 0; i < pha.length; i++) alpha[i] = Math.max(0, Math.min(255, pha[i]! * 255))
    return { alpha, w, h }
  }

  step(video: HTMLVideoElement) {
    if (this.busy || !video.videoWidth) return
    this.busy = true
    const src = this.toInput(video)
    const { Tensor } = this.ort
    const feeds = {
      src,
      r1i: this.rec[0]!,
      r2i: this.rec[1]!,
      r3i: this.rec[2]!,
      r4i: this.rec[3]!,
      downsample_ratio: new Tensor('float32', new Float32Array([0.5]), [1]),
    }
    this.session
      .run(feeds)
      .then((out) => {
        this.rec = [out.r1o!, out.r2o!, out.r3o!, out.r4o!]
        const pha = out.pha!.data as Float32Array
        const alpha = this.alpha?.length === pha.length ? this.alpha : new Uint8Array(pha.length)
        for (let i = 0; i < pha.length; i++) alpha[i] = Math.max(0, Math.min(255, pha[i]! * 255))
        this.alpha = alpha
        this.version++
      })
      .catch((err) => {
        console.warn('[matting]', err)
        this.reset()
      })
      .finally(() => {
        this.busy = false
      })
  }

  close() {
    void this.session.release()
  }
}
