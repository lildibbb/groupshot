import type { AssetBitmaps, AssetId } from '@/lib/assets'

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface DrawInfo {
  w: number
  h: number
  slots: Rect[]
  caption: string
  date: string
  names: string[]
  assets?: AssetBitmaps
}

export type TemplateTag = 'strip' | 'grid' | 'single' | 'wide'

export const OCCASIONS = ['friends', 'date', 'party', 'family', 'milestone'] as const
export type Occasion = (typeof OCCASIONS)[number]

export const SERIES = ['film', 'y2k'] as const
export type Series = (typeof SERIES)[number]

export interface Template {
  id: string
  name: string
  blurb: string
  tag: TemplateTag
  size: { w: number; h: number }
  slots: Rect[]
  bg: string
  empty: string
  radius?: number
  tone?: 'mono' | 'sepia'
  caption: string
  swatch: [string, string]
  occasions?: Occasion[]
  people?: [number, number]
  backgroundAsset?: AssetId
  stampAsset?: AssetId
  propAsset?: AssetId
  frameAsset?: AssetId
  extraAssets?: AssetId[]
  series?: Series
  background?: (ctx: Ctx, info: DrawInfo) => void
  decorate?: (ctx: Ctx, info: DrawInfo) => void
}

export const F = {
  display: '"GS Display", system-ui, sans-serif',
  serif: '"GS Serif", Georgia, serif',
  pixel: '"GS Pixel", monospace',
  mono: '"GS Mono", ui-monospace, monospace',
} as const
