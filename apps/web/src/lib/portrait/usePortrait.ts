import { useEffect, useState } from 'react'
import { PortraitEngine } from './engine'

export type PortraitState = 'off' | 'loading' | 'ready' | 'error'

export function usePortrait(
  stream: MediaStream | null,
  enabled: boolean,
  hd: boolean,
  light: string | null,
  mirror = false,
) {
  const [engine, setEngine] = useState<PortraitEngine | null>(null)
  const [state, setState] = useState<PortraitState>('off')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    setEngine(null)
    if (!stream || !enabled) return setState('off')
    setState('loading')
    let alive = true
    let made: PortraitEngine | null = null
    const startupTimer = window.setTimeout(() => {
      if (alive) setState('error')
    }, 45_000)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.setAttribute('aria-hidden', 'true')
    Object.assign(video.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '2px',
      height: '2px',
      opacity: '0',
      pointerEvents: 'none',
    })
    document.body.appendChild(video)
    video.srcObject = stream
    void video.play().catch((error) => {
      console.warn('[portrait] camera playback failed', error)
      if (alive) setState('error')
    })
    const ready = new Promise<void>((resolve) => {
      if (video.readyState >= 2 && video.videoWidth) return resolve()
      video.addEventListener('loadeddata', () => resolve(), { once: true })
    })
    Promise.race([
      ready,
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Camera frame timed out')), 12_000)),
    ])
      .then(() => {
        if (!alive) return null
        return PortraitEngine.create(video, { hd })
      })
      .then((e) => {
        if (!e) return
        made = e
        if (!alive) return e.close()
        e.start(() => {
          if (!alive) return
          window.clearTimeout(startupTimer)
          setEngine(e)
          setState('ready')
        })
      })
      .catch((error) => {
        console.warn('[portrait] could not start the cutout', error)
        if (alive) {
          window.clearTimeout(startupTimer)
          setState('error')
        }
      })
    return () => {
      alive = false
      window.clearTimeout(startupTimer)
      made?.close()
      video.srcObject = null
      video.remove()
    }
  }, [stream, enabled, hd, retry])

  useEffect(() => engine?.setLight(light), [engine, light])
  useEffect(() => engine?.setMirror(mirror), [engine, mirror])

  return { engine, state, retry: () => setRetry((n) => n + 1) }
}
