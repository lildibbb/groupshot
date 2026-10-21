import type { FaceDetector, ImageSegmenter } from '@mediapipe/tasks-vision'
import { confidenceAlpha, fileset, loadSegmenter } from '../segmentation'
import { type FrameSample, type PortraitDiagnostics, summarizeFrames } from './diagnostics'
import { detectFaces, type Face, loadFaceDetector } from './face'
import { GL } from './gl'
import { hdSupported, Matting } from './rvm'

export const PORTRAIT_W = 720
export const PORTRAIT_H = 960
export const PACKED_RATIO = (PORTRAIT_W * 2) / PORTRAIT_H

const FACE_HEIGHT = 0.19
const EYE_LINE = 0.4
const FAST_MAX_W = 480
const MASK_SMOOTHING = 0.25
const MIN_EVERY = 1
const MAX_EVERY = 4
const SEGMENT_BUDGET_MS = 10
const FACE_EVERY = 10
const PACK_MS = 1000 / 24
const GPU_FAILURES = 3

const FINAL = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform sampler2D video; uniform sampler2D mask;
uniform vec2 srcSize; uniform vec2 outSize; uniform vec2 maskTexel; uniform float scale; uniform vec2 offset;
uniform float mode; uniform vec3 gain; uniform vec4 tint;
vec3 at(vec2 s) { return texture(video, vec2(s.x, 1. - s.y)).rgb; }
void main() {
  vec2 outPx = vec2(uv.x, 1. - uv.y) * outSize;
  vec2 src = (outPx - offset) / scale / srcSize;
  if (src.x < 0. || src.x > 1. || src.y < 0. || src.y > 1.) { o = vec4(0.); return; }
  vec3 c = at(src);
  float a;
  if (mode > 1.5) a = texture(mask, src).r;
  else {
    float centre = texture(mask, src).r;
    if (centre < .02) a = 0.;
    else if (centre > .98) a = 1.;
    else {
      float sum = 0.; float wsum = 0.;
      for (int y = -2; y <= 2; y++)
        for (int x = -2; x <= 2; x++) {
          vec2 d = vec2(float(x), float(y)) * 1.5;
          vec2 s = src + d * maskTexel;
          vec3 dc = at(s) - c;
          float w = exp(-dot(d, d) * .1 - dot(dc, dc) * 90.);
          sum += texture(mask, s).r * w;
          wsum += w;
        }
      a = sum / wsum;
    }
    a = smoothstep(.42, .78, a);
  }
  a *= smoothstep(0., .1, uv.x) * smoothstep(1., .9, uv.x);
  c = clamp(c * gain, 0., 1.);
  c = mix(c, tint.rgb, tint.a);
  o = vec4(c, a);
}`

type Mode = 'hd' | 'fast'
type FrameSource = HTMLVideoElement | HTMLCanvasElement

function parseTint(hex: string | null): [number, number, number, number] {
  if (!hex) return [0, 0, 0, 0]
  const n = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16) / 255
  return [n(1), n(3), n(5), hex.length > 7 ? n(7) : 0.1]
}

export class PortraitEngine {
  canvas: HTMLCanvasElement
  private gl: GL | null
  private ctx2d: CanvasRenderingContext2D | null = null
  private videoTex: WebGLTexture | null = null
  private maskTex: WebGLTexture | null = null
  private maskCanvas: HTMLCanvasElement | null = null
  private segmentationFrame: HTMLCanvasElement | null = null
  private maskPixels: ImageData | null = null
  private segmenter: ImageSegmenter | null = null
  private matting: Matting | null = null
  private trusted = 0
  private seen = 0
  private stillMatting: Promise<Matting | null> | null = null
  private faces: FaceDetector | null = null
  private fast: Uint8Array | null = null
  private fastSize = { w: 0, h: 0 }
  private mask: Uint8Array | null = null
  private maskSize = { w: 0, h: 0 }
  private smooth: Float32Array | null = null
  private frame = 0
  private clock = 0
  private raf = 0
  private alive = true
  private tint: [number, number, number, number] = [0, 0, 0, 0]
  private gain: [number, number, number] = [1, 1, 1]
  private view = { scale: 0, x: 0, y: 0 }
  private stats = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  private packCanvas: HTMLCanvasElement | null = null
  private silhouette: HTMLCanvasElement | null = null
  private ready = false
  private videoFrameCallback: number | null = null
  private diagnosticsOn = false
  private frameSamples: FrameSample[] = []
  private segmentationMs = 0
  private segmentCost = 0
  private segmentEvery = 3
  private failures = 0
  private onCpu = false
  private packedAt = 0
  private mirrorOut = false

  private constructor(private video: HTMLVideoElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = PORTRAIT_W
    this.canvas.height = PORTRAIT_H
    let gl: GL | null = null
    try {
      gl = new GL(this.canvas, { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true })
    } catch {}
    this.gl = gl
    if (gl) {
      this.videoTex = gl.texture()
      this.maskTex = gl.texture()
    } else {
      this.canvas = document.createElement('canvas')
      this.canvas.width = PORTRAIT_W
      this.canvas.height = PORTRAIT_H
      this.ctx2d = this.canvas.getContext('2d')
      if (!this.ctx2d) throw new Error('Canvas 2D unavailable')
    }
    this.stats.canvas.width = 48
    this.stats.canvas.height = 36
  }

  static async create(video: HTMLVideoElement, { hd = false } = {}) {
    const engine = new PortraitEngine(video)
    const canDraw = Boolean(engine.gl)
    let segmenter: ImageSegmenter
    try {
      segmenter = await loadSegmenter()
    } catch (gpuError) {
      const { vision, fileset: fs } = await fileset()
      segmenter = await vision.ImageSegmenter.createFromOptions(fs, {
        baseOptions: { modelAssetPath: '/models/selfie_segmenter.tflite', delegate: 'CPU' },
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      }).catch(() => {
        throw gpuError
      })
    }
    engine.segmenter = segmenter
    void loadFaceDetector()
      .then((faces) => {
        if (engine.alive) engine.faces = faces
        else faces.close()
      })
      .catch(() => {})
    if (hd && canDraw && hdSupported()) {
      void Matting.load('webgpu')
        .then((matting) => {
          if (engine.alive) engine.matting = matting
          else matting.close()
        })
        .catch(() => {})
    }
    if (canDraw) engine.prepareStill()
    return engine
  }

  get mode(): Mode {
    return this.gl && this.matting && this.trusted >= 3 ? 'hd' : 'fast'
  }

  setMirror(on: boolean) {
    this.mirrorOut = on
  }

  setLight(hex: string | null) {
    this.tint = parseTint(hex)
  }

  setDiagnosticsEnabled(enabled: boolean) {
    this.diagnosticsOn = enabled
    this.frameSamples = []
    this.segmentationMs = 0
  }

  diagnostics(): PortraitDiagnostics {
    return summarizeFrames(this.frameSamples, this.segmentationMs)
  }

  start(onReady: () => void) {
    const renderFrame = () => {
      if (!this.alive) return
      const started = this.diagnosticsOn ? performance.now() : 0
      try {
        if (this.render() && !this.ready) {
          this.ready = true
          onReady()
        }
      } catch (error) {
        console.warn('[portrait] frame render failed', error)
      } finally {
        if (this.diagnosticsOn) {
          const at = performance.now()
          this.frameSamples.push({ at, ms: at - started })
          if (this.frameSamples.length > 60) this.frameSamples.shift()
        }
      }
    }
    const video = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: (now: number) => void) => number
      cancelVideoFrameCallback?: (id: number) => void
    }
    if (video.requestVideoFrameCallback) {
      const loop = () => {
        if (!this.alive) return
        renderFrame()
        this.videoFrameCallback = video.requestVideoFrameCallback!(loop)
      }
      renderFrame()
      this.videoFrameCallback = video.requestVideoFrameCallback(loop)
      return
    }
    const loop = () => {
      if (!this.alive) return
      renderFrame()
      this.raf = requestAnimationFrame(loop)
    }
    loop()
  }

  private render() {
    const { video } = this
    if (!video.videoWidth || video.readyState < 2) return false
    this.clock = Math.max(this.clock + 1, performance.now())
    const now = this.clock
    this.frame++
    const updateMask = this.frame === 1 || this.frame % this.segmentEvery === 1

    const live = this.matting
    if (updateMask) {
      const started = performance.now()
      this.segmentFast(now)
      const ms = performance.now() - started
      this.segmentCost = this.segmentCost ? this.segmentCost * 0.8 + ms * 0.2 : ms
      this.segmentEvery = Math.min(MAX_EVERY, Math.max(MIN_EVERY, Math.ceil(this.segmentCost / SEGMENT_BUDGET_MS) + 1))
      if (this.diagnosticsOn) this.segmentationMs = ms
    }
    if (live && updateMask) live.step(video)
    if (live?.alpha && live.version !== this.seen) {
      this.seen = live.version
      if (this.trusted < 3) this.verify(live)
    }
    if (this.mode === 'hd' && live?.alpha) {
      this.mask = live.alpha
      this.maskSize = { w: live.width, h: live.height }
    } else if (this.fast) {
      this.mask = this.fast
      this.maskSize = this.fastSize
    }
    if (!this.mask) return false
    if (this.faces && this.frame % FACE_EVERY === 1) this.reframe(detectFaces(this.faces, video, now))
    else if (!this.view.scale) this.reframe(null)
    if (this.frame % 15 === 1) this.measureLight()
    const supportsVideoFrames = 'requestVideoFrameCallback' in video
    if (supportsVideoFrames || this.frame === 1 || this.frame % 2 === 1) {
      this.draw(video, video.videoWidth, video.videoHeight, this.mask, this.maskSize, this.mode === 'hd')
      const t = performance.now()
      if (t - this.packedAt >= PACK_MS) {
        this.packedAt = t
        this.pack()
      }
    }
    return true
  }

  private draw(
    source: FrameSource,
    width: number,
    height: number,
    mask: Uint8Array,
    size: { w: number; h: number },
    hd: boolean,
  ) {
    const { gl, videoTex, maskTex } = this
    if (!gl || !videoTex || !maskTex) return this.draw2d(source, width, height, mask, size)
    gl.upload(videoTex, source)
    gl.uploadMask(maskTex, mask, size.w, size.h)
    gl.pass(
      'final',
      FINAL,
      null,
      { video: videoTex, mask: maskTex },
      {
        srcSize: [width, height],
        outSize: [PORTRAIT_W, PORTRAIT_H],
        maskTexel: [1 / size.w, 1 / size.h],
        scale: this.view.scale,
        offset: [this.view.x, this.view.y],
        mode: hd ? 2 : 1,
        gain: this.gain,
        tint: this.tint,
      },
    )
  }

  private draw2d(source: FrameSource, width: number, height: number, mask: Uint8Array, size: { w: number; h: number }) {
    const ctx = this.ctx2d
    const { scale, x, y } = this.view
    if (!ctx || !scale) return
    const w = width * scale
    const h = height * scale
    const gain = (this.gain[0]! + this.gain[1]! + this.gain[2]!) / 3
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, PORTRAIT_W, PORTRAIT_H)
    ctx.filter = gain > 0.02 ? `brightness(${gain.toFixed(3)})` : 'none'
    ctx.drawImage(source, x, y, w, h)
    ctx.filter = 'none'
    ctx.imageSmoothingQuality = 'high'
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(this.maskImage(mask, size), x, y, w, h)
    const [r, g, b, a] = this.tint
    if (a > 0) {
      ctx.globalCompositeOperation = 'source-atop'
      ctx.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`
      ctx.fillRect(0, 0, PORTRAIT_W, PORTRAIT_H)
    }
    const edge = PORTRAIT_W * 0.1
    ctx.globalCompositeOperation = 'destination-in'
    const left = ctx.createLinearGradient(0, 0, edge, 0)
    left.addColorStop(0, 'rgba(0, 0, 0, 0)')
    left.addColorStop(1, 'rgba(0, 0, 0, 1)')
    ctx.fillStyle = left
    ctx.fillRect(0, 0, edge, PORTRAIT_H)
    const right = ctx.createLinearGradient(PORTRAIT_W - edge, 0, PORTRAIT_W, 0)
    right.addColorStop(0, 'rgba(0, 0, 0, 1)')
    right.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = right
    ctx.fillRect(PORTRAIT_W - edge, 0, edge, PORTRAIT_H)
    ctx.globalCompositeOperation = 'source-over'
  }

  private maskImage(mask: Uint8Array, size: { w: number; h: number }) {
    if (!this.maskCanvas) this.maskCanvas = document.createElement('canvas')
    const canvas = this.maskCanvas
    if (canvas.width !== size.w || canvas.height !== size.h) {
      canvas.width = size.w
      canvas.height = size.h
      this.maskPixels = null
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    if (!this.maskPixels) this.maskPixels = ctx.createImageData(size.w, size.h)
    const image = this.maskPixels
    const px = image.data
    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      px[p] = 255
      px[p + 1] = 255
      px[p + 2] = 255
      px[p + 3] = mask[i]!
    }
    ctx.putImageData(image, 0, 0)
    return canvas
  }

  private verify(live: Matting) {
    if (!this.fast || !live.alpha) return
    if (agreement(live.alpha, live.width, live.height, this.fast, this.fastSize.w, this.fastSize.h) > 0.6)
      this.trusted++
    else {
      console.warn('[portrait] live HD matte disagrees with the fast mask; using the fast cutout')
      live.close()
      this.matting = null
      this.trusted = 0
    }
  }

  private prepareStill() {
    this.stillMatting ??= (async () => {
      if (hdSupported()) {
        const gpu = await Matting.load('webgpu').catch(() => null)
        if (gpu) return gpu
      }
      return Matting.load('wasm').catch(() => null)
    })()
  }

  async still(timeout = 6000): Promise<HTMLCanvasElement> {
    const snapshot = document.createElement('canvas')
    snapshot.width = this.video.videoWidth
    snapshot.height = this.video.videoHeight
    snapshot.getContext('2d')!.drawImage(this.video, 0, 0)
    const copy = (from: HTMLCanvasElement) => {
      const out = document.createElement('canvas')
      out.width = PORTRAIT_W
      out.height = PORTRAIT_H
      out.getContext('2d')!.drawImage(from, 0, 0)
      return out
    }
    const fallback = copy(this.canvas)
    if (!this.gl || !this.stillMatting) return fallback
    const late = new Promise<null>((r) => setTimeout(() => r(null), timeout))
    const result = await Promise.race([
      this.stillMatting.then((m) => m?.still(snapshot, snapshot.width, snapshot.height).catch(() => null) ?? null),
      late,
    ])
    if (!result || !this.alive) return fallback
    this.draw(snapshot, snapshot.width, snapshot.height, result.alpha, { w: result.w, h: result.h }, true)
    return copy(this.canvas)
  }

  async captureStill(mirror: boolean, filter: string) {
    return this.capture(mirror, filter, await this.still())
  }

  capture(mirror: boolean, filter: string, from: HTMLCanvasElement = this.canvas) {
    const out = document.createElement('canvas')
    out.width = from.width
    out.height = from.height
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D unavailable')
    if (mirror) {
      ctx.translate(out.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.filter = filter
    ctx.drawImage(from, 0, 0)
    return out
  }

  private segmentFast(now: number) {
    const segmenter = this.segmenter
    if (!segmenter || !this.video.videoWidth) return
    const source = this.segmentationFrame ?? document.createElement('canvas')
    this.segmentationFrame ??= source
    const width = Math.min(FAST_MAX_W, this.video.videoWidth)
    const height = Math.max(1, Math.round((width * this.video.videoHeight) / this.video.videoWidth))
    if (source.width !== width || source.height !== height) {
      source.width = width
      source.height = height
    }
    source.getContext('2d')?.drawImage(this.video, 0, 0, width, height)
    try {
      this.segmentWith(segmenter, source, now)
      this.failures = 0
    } catch (error) {
      if (++this.failures >= GPU_FAILURES && !this.onCpu) {
        console.warn('[portrait] GPU segmentation keeps failing; switching to CPU', error)
        this.onCpu = true
        this.segmenter = null
        segmenter.close()
        void loadSegmenter('CPU').then((cpu) => {
          if (this.alive) this.segmenter = cpu
          else cpu.close()
        })
      }
    }
  }

  private segmentWith(segmenter: ImageSegmenter, source: HTMLCanvasElement, now: number) {
    segmenter.segmentForVideo(source, now, (result) => {
      const m = result.confidenceMasks?.[0]
      if (!m) return
      const values = m.getAsFloat32Array()
      if (!this.smooth || this.smooth.length !== values.length) this.smooth = new Float32Array(values)
      if (!this.fast || this.fast.length !== values.length) this.fast = new Uint8Array(values.length)
      for (let i = 0; i < values.length; i++) {
        const v = this.smooth[i]! * MASK_SMOOTHING + values[i]! * (1 - MASK_SMOOTHING)
        this.smooth[i] = v
        this.fast[i] = this.gl ? Math.round(v * 255) : confidenceAlpha(v)
      }
      this.fastSize = { w: m.width, h: m.height }
    })
  }

  private reframe(faces: Face[] | null) {
    const vw = this.video.videoWidth
    const vh = this.video.videoHeight
    const fill = PORTRAIT_H / vh
    let scale = fill
    let x = (PORTRAIT_W - vw * fill) / 2
    let y = 0
    if (faces?.length) {
      const height = Math.max(...faces.map((f) => f.height))
      const left = Math.min(...faces.map((f) => f.x)) - height * 1.5
      const right = Math.max(...faces.map((f) => f.x)) + height * 1.5
      const eyeY = faces.reduce((sum, f) => sum + f.eyeY, 0) / faces.length
      scale = Math.min((FACE_HEIGHT * PORTRAIT_H) / height, PORTRAIT_W / (right - left))
      scale = Math.min(fill * 2.2, Math.max(fill * 0.6, scale))
      x = PORTRAIT_W / 2 - ((left + right) / 2) * scale
      y = EYE_LINE * PORTRAIT_H - eyeY * scale
      if (y + vh * scale < PORTRAIT_H) y = PORTRAIT_H - vh * scale
    }
    const k = this.view.scale ? 0.18 : 1
    this.view.scale += (scale - this.view.scale) * k
    this.view.x += (x - this.view.x) * k
    this.view.y += (y - this.view.y) * k
  }

  private measureLight() {
    if (!this.mask) return
    const ctx = this.stats
    const { width: w, height: h } = ctx.canvas
    ctx.drawImage(this.video, 0, 0, w, h)
    const px = ctx.getImageData(0, 0, w, h).data
    const { w: mw, h: mh } = this.maskSize
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const a = this.mask[Math.floor((yy / h) * mh) * mw + Math.floor((xx / w) * mw)]! / 255
        if (a < 0.6) continue
        const i = (yy * w + xx) * 4
        r += px[i]!
        g += px[i + 1]!
        b += px[i + 2]!
        n++
      }
    if (n < 40) return
    r /= n * 255
    g /= n * 255
    b /= n * 255
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    const exposure = Math.min(1.25, Math.max(0.85, 0.42 / Math.max(lum, 0.05)))
    const grey = (r + g + b) / 3
    const wb = (c: number) => Math.min(1.12, Math.max(0.9, Math.sqrt(grey / Math.max(c, 0.02))))
    const target: [number, number, number] = [exposure * wb(r), exposure * wb(g), exposure * wb(b)]
    this.gain = this.gain.map((v, i) => v + (target[i]! - v) * 0.35) as [number, number, number]
  }

  private pack() {
    const canvas = this.packCanvas
    const silhouette = this.silhouette
    if (!canvas || !silhouette) return
    const sc = silhouette.getContext('2d')!
    sc.globalCompositeOperation = 'source-over'
    sc.clearRect(0, 0, PORTRAIT_W, PORTRAIT_H)
    if (this.mirrorOut) {
      sc.save()
      sc.translate(PORTRAIT_W, 0)
      sc.scale(-1, 1)
    }
    sc.drawImage(this.canvas, 0, 0)
    if (this.mirrorOut) sc.restore()
    sc.globalCompositeOperation = 'source-in'
    sc.fillStyle = '#fff'
    sc.fillRect(0, 0, PORTRAIT_W, PORTRAIT_H)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (this.mirrorOut) {
      ctx.save()
      ctx.translate(PORTRAIT_W, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(this.canvas, 0, 0)
    if (this.mirrorOut) ctx.restore()
    ctx.drawImage(silhouette, PORTRAIT_W, 0)
  }

  packedStream() {
    if (!this.packCanvas) {
      this.packCanvas = document.createElement('canvas')
      this.packCanvas.width = PORTRAIT_W * 2
      this.packCanvas.height = PORTRAIT_H
      this.silhouette = document.createElement('canvas')
      this.silhouette.width = PORTRAIT_W
      this.silhouette.height = PORTRAIT_H
    }
    return this.packCanvas.captureStream(24)
  }

  close() {
    this.alive = false
    cancelAnimationFrame(this.raf)
    const video = this.video as HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void }
    if (this.videoFrameCallback !== null) video.cancelVideoFrameCallback?.(this.videoFrameCallback)
    this.gl?.gl.getExtension('WEBGL_lose_context')?.loseContext()
    this.gl = null
    this.segmenter?.close()
    this.faces?.close()
    this.matting?.close()
    void this.stillMatting?.then((m) => m?.close())
  }
}

export function agreement(a: Uint8Array, aw: number, ah: number, b: Uint8Array, bw: number, bh: number) {
  let both = 0
  let either = 0
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 64; x++) {
      const pa = a[Math.floor((y / 48) * ah) * aw + Math.floor((x / 64) * aw)]! > 127
      const pb = b[Math.floor((y / 48) * bh) * bw + Math.floor((x / 64) * bw)]! > 127
      if (pa && pb) both++
      if (pa || pb) either++
    }
  return either ? both / either : 1
}

const UNPACK = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform sampler2D packed;
void main() {
  float edge = 1. / float(textureSize(packed, 0).x);
  vec3 c = texture(packed, vec2(min(uv.x * .5, .5 - edge), uv.y)).rgb;
  float raw = texture(packed, vec2(max(.5 + uv.x * .5, .5 + edge), uv.y)).r;
  float a = smoothstep(.06, .94, raw);
  vec3 straight = raw > .004 ? min(c / raw, 1.) : vec3(0.);
  o = vec4(straight * a, a);
}`

const UNPACK_LOW = 360
const UNPACK_LOW_H = 480

const smoothstep = (t: number) => {
  const x = Math.min(1, Math.max(0, (t - 0.06) / 0.88))
  return x * x * (3 - 2 * x)
}

export class Unpacker {
  canvas: HTMLCanvasElement
  private gl: GL | null
  private tex: WebGLTexture | null = null
  private ctx2d: CanvasRenderingContext2D | null = null
  private frame: HTMLCanvasElement | null = null
  private framePixels: ImageData | null = null
  private packed: HTMLCanvasElement | null = null
  private raf = 0
  private vfc: number | null = null
  private closed = false

  constructor(private video: HTMLVideoElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = PORTRAIT_W
    this.canvas.height = PORTRAIT_H
    let gl: GL | null = null
    try {
      gl = new GL(this.canvas, { premultipliedAlpha: true, alpha: true })
    } catch {}
    this.gl = gl
    if (gl) this.tex = gl.texture()
    else {
      this.canvas = document.createElement('canvas')
      this.canvas.width = PORTRAIT_W
      this.canvas.height = PORTRAIT_H
      this.ctx2d = this.canvas.getContext('2d')
    }
  }

  start() {
    const draw = () => {
      if (!this.video.videoWidth) return
      const { gl, tex } = this
      if (gl && tex) {
        gl.upload(tex, this.video)
        gl.pass('unpack', UNPACK, null, { packed: tex })
      } else this.draw2d()
    }
    const video = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number
    }
    if (video.requestVideoFrameCallback) {
      const loop = () => {
        if (this.closed) return
        draw()
        this.vfc = video.requestVideoFrameCallback!(loop)
      }
      this.vfc = video.requestVideoFrameCallback(loop)
      return
    }
    const loop = () => {
      draw()
      this.raf = requestAnimationFrame(loop)
    }
    loop()
  }

  private draw2d() {
    const ctx = this.ctx2d
    if (!ctx) return
    this.packed ??= Object.assign(document.createElement('canvas'), {
      width: UNPACK_LOW * 2,
      height: UNPACK_LOW_H,
    })
    this.frame ??= Object.assign(document.createElement('canvas'), {
      width: UNPACK_LOW,
      height: UNPACK_LOW_H,
    })
    const packedCtx = this.packed.getContext('2d', { willReadFrequently: true })!
    packedCtx.drawImage(this.video, 0, 0, this.packed.width, this.packed.height)
    const src = packedCtx.getImageData(0, 0, this.packed.width, this.packed.height).data
    const frameCtx = this.frame.getContext('2d')!
    if (this.framePixels?.width !== UNPACK_LOW) this.framePixels = frameCtx.createImageData(UNPACK_LOW, UNPACK_LOW_H)
    const dst = this.framePixels.data
    const stride = this.packed.width * 4
    const half = UNPACK_LOW * 4
    for (let y = 0; y < UNPACK_LOW_H; y++) {
      for (let x = 0; x < UNPACK_LOW; x++) {
        const o = y * half + x * 4
        const i = y * stride + x * 4
        const raw = src[i + half]! / 255
        const a = smoothstep(raw)
        if (a < 0.004) {
          dst[o] = 0
          dst[o + 1] = 0
          dst[o + 2] = 0
          dst[o + 3] = 0
          continue
        }
        dst[o] = Math.min(255, src[i]! / raw)
        dst[o + 1] = Math.min(255, src[i + 1]! / raw)
        dst[o + 2] = Math.min(255, src[i + 2]! / raw)
        dst[o + 3] = Math.round(a * 255)
      }
    }
    frameCtx.putImageData(this.framePixels, 0, 0)
    ctx.clearRect(0, 0, PORTRAIT_W, PORTRAIT_H)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(this.frame, 0, 0, PORTRAIT_W, PORTRAIT_H)
  }

  close() {
    this.closed = true
    cancelAnimationFrame(this.raf)
    const video = this.video as HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void }
    if (this.vfc !== null) video.cancelVideoFrameCallback?.(this.vfc)
    this.gl?.gl.getExtension('WEBGL_lose_context')?.loseContext()
    this.gl = null
  }
}

export function isPacked(video: HTMLVideoElement) {
  return video.videoWidth > 0 && Math.abs(video.videoWidth / video.videoHeight - PACKED_RATIO) < 0.03
}
