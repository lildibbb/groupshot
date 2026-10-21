import { useEffect, useState } from 'react'
import { composeImage } from '@/lib/compose'
import { getTemplate } from '@/templates'

const cache = new Map<string, Promise<string>>()
const samplePhotos = new Map<string, Promise<ImageBitmap[]>>()
const soloFrames = new Set(['cherry-notes', 'polaroid', 'magazine', 'blue-hour', 'receipt', 'wanted', 'weekend-post'])

function loadSamplePhotos(id: string) {
  const url = `/assets/${soloFrames.has(id) ? 'solo' : 'pose'}-contact-sheet.webp`
  const cached = samplePhotos.get(url)
  if (cached) return cached
  const photos = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error('Sample photo unavailable')
      return r.blob()
    })
    .then(createImageBitmap)
    .then(async (image) => {
      const w = Math.floor(image.width / 2)
      const h = Math.floor(image.height / 2)
      const photos = await Promise.all(
        Array.from({ length: 4 }, (_, i) => createImageBitmap(image, (i % 2) * w, Math.floor(i / 2) * h, w, h)),
      )
      image.close()
      return photos
    })
  samplePhotos.set(url, photos)
  return photos
}

function thumbUrl(id: string, sample: boolean) {
  const key = `${id}:${sample}`
  let p = cache.get(key)
  if (!p) {
    const t = getTemplate(id)
    p = (sample ? loadSamplePhotos(id) : Promise.resolve([]))
      .then((photos) =>
        composeImage(
          id,
          {
            rounds: sample ? t.slots.map((_, i) => [photos[i % 4]!]) : [],
            caption: '',
            date: 'MEMORIES TO KEEP',
            names: ['you', 'them'],
          },
          {
            scale: (sample ? 700 : 240) / Math.max(t.size.w, t.size.h),
            type: 'image/jpeg',
          },
        ),
      )
      .then((b) => URL.createObjectURL(b))
    cache.set(key, p)
  }
  return p
}

export function TemplateThumb({
  id,
  className = '',
  sample = false,
}: {
  id: string
  className?: string
  sample?: boolean
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const t = getTemplate(id)
  useEffect(() => {
    let live = true
    setFailed(false)
    void thumbUrl(id, sample)
      .then((u) => live && setSrc(u))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [id, sample])
  return (
    <div
      className={`template-thumb ${className}`}
      style={{ aspectRatio: `${t.size.w} / ${t.size.h}`, background: t.swatch[0] }}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-contain" decoding="async" />
      ) : failed ? (
        <span className="template-thumb-error" role="status">
          Preview unavailable
        </span>
      ) : (
        <span className="template-thumb-loading" role="status">
          Loading preview…
        </span>
      )}
    </div>
  )
}
