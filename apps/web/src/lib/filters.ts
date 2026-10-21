import type { Settings } from '@groupshot/protocol'

type FilterId = Settings['filter']

export const FILTERS: { id: FilterId; label: string; css: string }[] = [
  { id: 'none', label: 'Natural', css: 'none' },
  { id: 'mono', label: 'B&W', css: 'grayscale(1) contrast(1.15)' },
  { id: 'warm', label: 'Golden', css: 'sepia(.25) saturate(1.25) brightness(1.04)' },
  { id: 'cool', label: 'Cool', css: 'saturate(.9) hue-rotate(-12deg) brightness(1.05)' },
  { id: 'film', label: 'Film', css: 'contrast(1.1) saturate(.85) sepia(.15)' },
  { id: 'vivid', label: 'Pop', css: 'saturate(1.6) contrast(1.08)' },
  { id: 'chrome', label: 'Chrome', css: 'grayscale(.55) contrast(1.25) brightness(1.08) hue-rotate(-8deg)' },
  { id: 'ice', label: 'Ice', css: 'saturate(.75) hue-rotate(-18deg) brightness(1.1) contrast(1.04)' },
  { id: 'lime', label: 'Lime', css: 'sepia(.2) hue-rotate(40deg) saturate(1.35) brightness(1.05)' },
  { id: 'faded', label: 'Faded', css: 'contrast(.82) saturate(.7) brightness(1.1) sepia(.12)' },
  { id: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.5) brightness(.92)' },
  { id: 'cross', label: 'Cross', css: 'contrast(1.2) saturate(1.4) hue-rotate(-10deg) sepia(.1)' },
  { id: 'disposable', label: 'Flash', css: 'brightness(1.12) contrast(1.15) saturate(1.3) sepia(.08)' },
  { id: 'instant', label: 'Instant', css: 'sepia(.22) saturate(.85) contrast(.95) brightness(1.06)' },
  { id: 'safelight', label: 'Darkroom', css: 'sepia(1) saturate(2.2) hue-rotate(-28deg) contrast(1.1)' },
]

export const filterCss = (id: FilterId) => FILTERS.find((f) => f.id === id)?.css ?? 'none'
