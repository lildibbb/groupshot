import { useEffect, useRef, useState } from 'react'

export function useSampleCamera(frame: number) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const source = useRef<{ image: HTMLImageElement; canvas: HTMLCanvasElement } | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = source.current
      s?.canvas.getContext('2d')?.drawImage(s.canvas, 0, 0)
    }, 100)
    return () => {
      window.clearInterval(id)
      for (const track of stream?.getTracks() ?? []) track.stop()
    }
  }, [stream])
  useEffect(() => {
    const s = source.current
    if (!s) return
    const { width: w, height: h } = s.canvas
    s.canvas.getContext('2d')?.drawImage(s.image, (frame % 2) * w, (Math.floor(frame / 2) % 2) * h, w, h, 0, 0, w, h)
  }, [frame])
  async function start() {
    setLoading(true)
    setError('')
    try {
      const image = new Image()
      image.src = '/assets/pose-contact-sheet.webp'
      await image.decode()
      if (!alive.current) return
      const canvas = document.createElement('canvas')
      canvas.width = image.width / 2
      canvas.height = image.height / 2
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
      source.current = { image, canvas }
      setStream(canvas.captureStream(10))
    } catch {
      if (alive.current) setError('Sample photos couldn’t load. Try again or turn on your camera.')
    } finally {
      if (alive.current) setLoading(false)
    }
  }
  return { stream, start, loading, error, stop: () => setStream(null) }
}
