import type { Scene } from '@groupshot/protocol'
import { coverCrop, tile } from '@/templates/layout'
import type { Ctx, DrawInfo, Template } from '@/templates/types'
import { type AssetBitmaps, loadAssets } from './assets'
import { drawScene, personRects } from './scene'

export interface ComposeInput {
  rounds: (ImageBitmap | null)[][]
  caption: string
  date: string
  names: string[]
  scene?: Scene
  assets?: AssetBitmaps
}

export async function prepareComposition(t: Template, input: ComposeInput): Promise<ComposeInput> {
  if (input.assets) return input
  const assets = await loadAssets([
    t.backgroundAsset,
    t.stampAsset,
    t.propAsset,
    t.frameAsset,
    ...(t.extraAssets ?? []),
    input.scene === 'studio' ? 'scene-studio' : undefined,
  ])
  return { ...input, assets }
}

const TONES = { mono: 'grayscale(1) contrast(1.1)', sepia: 'sepia(.85) contrast(1.05)' }

export function drawTemplate(ctx: Ctx, t: Template, input: ComposeInput, scale = 1) {
  const { w, h } = t.size
  ctx.save()
  ctx.scale(scale, scale)
  const info: DrawInfo = {
    w,
    h,
    slots: t.slots,
    caption: input.caption.trim() || t.caption,
    date: input.date,
    names: input.names,
    assets: input.assets,
  }
  ctx.fillStyle = t.bg
  ctx.fillRect(0, 0, w, h)
  t.background?.(ctx, info)
  const background = t.backgroundAsset && input.assets?.[t.backgroundAsset]
  if (background) ctx.drawImage(background, 0, 0, w, h)

  t.slots.forEach((slot, i) => {
    const people = input.rounds[i] ?? []
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(slot.x, slot.y, slot.w, slot.h, t.radius ?? 0)
    ctx.clip()
    ctx.fillStyle = t.empty
    ctx.fillRect(slot.x, slot.y, slot.w, slot.h)
    if (t.tone) ctx.filter = TONES[t.tone]
    const shared = input.scene && input.scene !== 'original'
    if (shared) drawScene(ctx, slot, input.scene!, input.assets?.['scene-studio'])
    const tiles = shared ? personRects(slot, Math.max(1, people.length)) : tile(slot, Math.max(1, people.length))
    tiles.forEach((r, j) => {
      const img = people[j]
      if (!img) return
      if (!shared) {
        const c = coverCrop(img.width, img.height, r)
        ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, r.x, r.y, r.w, r.h)
        return
      }
      const raw = Math.abs(img.width / img.height - r.w / r.h) > 0.03
      if (raw) {
        const c = coverCrop(img.width, img.height, r)
        ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, r.x, r.y, r.w, r.h)
        return
      }
      ctx.save()
      ctx.shadowColor = 'rgba(20, 18, 24, .28)'
      ctx.shadowBlur = r.h * 0.05
      ctx.shadowOffsetY = r.h * 0.015
      ctx.drawImage(img, r.x, r.y, r.w, r.h)
      ctx.restore()
    })
    ctx.filter = 'none'
    ctx.fillStyle = t.bg
    for (const r of shared ? [] : tiles) {
      if (r.x > slot.x) ctx.fillRect(r.x - 1.5, r.y, 3, r.h)
      if (r.y > slot.y) ctx.fillRect(r.x, r.y - 1.5, r.w, 3)
    }
    ctx.restore()
  })

  t.decorate?.(ctx, info)
  ctx.restore()
}
