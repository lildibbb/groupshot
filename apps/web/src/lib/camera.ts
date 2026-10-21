import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus =
  | 'idle'
  | 'asking'
  | 'live'
  | 'denied'
  | 'missing'
  | 'busy'
  | 'insecure'
  | 'unsupported'
  | 'unsupported-constraints'
  | 'ended'

export type CameraProblem = Exclude<CameraStatus, 'idle' | 'asking' | 'live'>

export const cameraMessages: Record<Exclude<CameraStatus, 'live'>, string> = {
  idle: 'Your camera is off.',
  asking: 'Your browser is asking for camera access…',
  denied: 'Camera access is blocked. Allow it in your browser’s site settings, then try again.',
  missing: 'We couldn’t find a camera on this device. Plug one in, then try again.',
  busy: 'Another app or tab is using your camera. Close it (video calls are the usual suspect), then try again.',
  insecure: 'Cameras only work on secure pages. Open this booth with an https:// link.',
  unsupported: 'This browser can’t share a camera here. Try a recent Chrome, Safari or Firefox.',
  'unsupported-constraints': 'Your camera couldn’t match the booth’s video settings. Try again for a simpler mode.',
  ended: 'Your camera stopped. Your system or another app may have taken it.',
}

export const cameraHints: Partial<Record<CameraProblem, string>> = {
  denied: 'Look for the camera icon in the address bar.',
  busy: 'Quit the other app, then tap Try again.',
  ended: 'Tap Try again to turn it back on. Your photos so far are safe.',
  'unsupported-constraints': 'We’ll retry with basic settings.',
}

export function classifyCameraError(err: unknown): CameraProblem {
  const name = (err as { name?: string } | null)?.name ?? ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'missing'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy'
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'unsupported-constraints'
    case 'TypeError':
      return 'unsupported'
    default:
      return 'denied'
  }
}

export function cameraPrecheck(env: { secure: boolean; hasGetUserMedia: boolean }): CameraProblem | null {
  if (!env.secure) return 'insecure'
  if (!env.hasGetUserMedia) return 'unsupported'
  return null
}

const IDEAL: MediaTrackConstraints = {
  facingMode: 'user',
  width: { ideal: 1280 },
  height: { ideal: 960 },
  frameRate: { ideal: 30, max: 30 },
}

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [paused, setPaused] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const basic = useRef(false)

  const release = useCallback(() => {
    for (const t of streamRef.current?.getTracks() ?? []) {
      t.onended = null
      t.stop()
    }
    streamRef.current = null
  }, [])

  const stop = useCallback(() => {
    release()
    setStream(null)
    setStatus('idle')
  }, [release])

  const start = useCallback(async () => {
    const problem = cameraPrecheck({
      secure: globalThis.isSecureContext !== false,
      hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
    })
    if (problem) return setStatus(problem)
    setStatus('asking')
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: basic.current ? { facingMode: 'user' } : IDEAL,
        audio: false,
      })
      release()
      for (const track of s.getVideoTracks()) {
        track.onended = () => {
          if (streamRef.current !== s) return
          streamRef.current = null
          setStream(null)
          setStatus('ended')
        }
      }
      streamRef.current = s
      setStream(s)
      setStatus('live')
    } catch (err) {
      const kind = classifyCameraError(err)
      if (kind === 'unsupported-constraints') basic.current = true
      setStatus(kind)
    }
  }, [release])

  useEffect(() => {
    const onVisibility = () => {
      const hidden = document.visibilityState === 'hidden'
      setPaused(hidden)
      if (hidden) return
      const track = streamRef.current?.getVideoTracks()[0]
      if (streamRef.current && (!track || track.readyState === 'ended')) {
        streamRef.current = null
        setStream(null)
        setStatus('ended')
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => release, [release])

  return { stream, status, paused, start, stop }
}

export async function captureFrame(
  video: HTMLVideoElement | HTMLCanvasElement,
  opts: { mirror: boolean; filter: string },
): Promise<Blob> {
  const cutout = video instanceof HTMLCanvasElement
  const w = cutout ? video.width : video.videoWidth
  const h = cutout ? video.height : video.videoHeight
  if (!w || !h) throw new Error('Camera frame not ready')
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  if (opts.mirror) {
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
  }
  ctx.filter = cutout ? 'none' : opts.filter
  ctx.drawImage(video, 0, 0, w, h)
  const encode = (type: string, quality: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality))
  const blob = cutout ? await encode('image/webp', 0.9) : await encode('image/jpeg', 0.9)
  if (!blob) throw new Error('capture failed')
  return blob
}
