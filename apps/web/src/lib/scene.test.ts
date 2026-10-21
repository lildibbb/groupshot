import { describe, expect, it } from 'vitest'
import { getTemplate } from '@/templates'
import type { Ctx } from '@/templates/types'
import { drawTemplate } from './compose-core'
import { personRects } from './scene'
import { confidenceAlpha } from './segmentation'

describe('shared-room composition', () => {
  it('stands people on one floor with overlapping shoulders, in stable order', () => {
    const slot = { x: 40, y: 80, w: 900, h: 600 }
    for (let count = 1; count <= 6; count++) {
      const people = personRects(slot, count)
      expect(people).toHaveLength(count)
      expect(people.every((p) => p.y >= slot.y && p.y + p.h <= slot.y + slot.h + 0.001)).toBe(true)
      expect(people.every((p) => p.w > 0 && p.h > 0)).toBe(true)
      if (count > 1) expect(people[0]!.x + people[0]!.w).toBeGreaterThanOrEqual(people[1]!.x - 0.001)
      expect(people.every((p) => Math.abs(p.w / p.h - 0.75) < 0.001)).toBe(true)
      const front = people.at(-1)!
      expect(front.y + front.h).toBeCloseTo(slot.y + slot.h)
    }
  })
  it('keeps backgrounds transparent, people opaque and edges soft', () => {
    expect(confidenceAlpha(0)).toBe(0)
    expect(confidenceAlpha(0.35)).toBe(0)
    expect(confidenceAlpha(0.525)).toBe(128)
    expect(confidenceAlpha(0.7)).toBe(255)
    expect(confidenceAlpha(1)).toBe(255)
  })
  it('draws a continuous scene without tile dividers and preserves absent guest positions', () => {
    const images: number[][] = []
    const fills: number[][] = []
    const ctx = new Proxy(
      {},
      {
        get: (_, key) =>
          key === 'drawImage'
            ? (...args: unknown[]) => images.push((args.length === 5 ? args.slice(1) : args.slice(5)) as number[])
            : key === 'fillRect'
              ? (...args: number[]) => fills.push(args)
              : key === 'createLinearGradient' || key === 'createRadialGradient'
                ? () => ({ addColorStop() {} })
                : () => {},
        set: () => true,
      },
    ) as Ctx
    const template = { ...getTemplate('airmail'), background: undefined, decorate: undefined }
    const image = { width: 600, height: 600 } as ImageBitmap
    drawTemplate(ctx, template, { rounds: [[image, null, image]], caption: '', date: '', names: [], scene: 'studio' })
    expect(images).toHaveLength(2)
    const positions = personRects(template.slots[0]!, 3)
    expect(images[1]![0]).toBe(positions[2]!.x)
    expect(fills.some((r) => r[2] === 3 || r[3] === 3)).toBe(false)
  })
})

describe('HD matte check', () => {
  it('trusts a matte that matches the fast mask and rejects one that does not', async () => {
    const { agreement } = await import('./portrait/engine')
    const left = new Uint8Array(64 * 48).map((_, i) => (i % 64 < 32 ? 255 : 0))
    const right = new Uint8Array(64 * 48).map((_, i) => (i % 64 >= 32 ? 255 : 0))
    expect(agreement(left, 64, 48, left, 64, 48)).toBe(1)
    expect(agreement(left, 64, 48, right, 64, 48)).toBe(0)
  })
})
