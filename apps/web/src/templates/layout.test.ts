import { describe, expect, it } from 'vitest'
import { coverCrop, tile } from './layout'

describe('tile', () => {
  const wide = { x: 0, y: 0, w: 1200, h: 600 }
  it('keeps total area for any group size', () => {
    for (let n = 1; n <= 6; n++) {
      const area = tile(wide, n).reduce((a, r) => a + r.w * r.h, 0)
      expect(area).toBeCloseTo(1200 * 600)
    }
  })
  it('puts two people side by side in a wide slot', () => {
    expect(tile(wide, 2).map((r) => r.y)).toEqual([0, 0])
  })
  it('stacks two people in a tall slot', () => {
    expect(tile({ x: 0, y: 0, w: 400, h: 800 }, 2).map((r) => r.x)).toEqual([0, 0])
  })
})

describe('coverCrop', () => {
  it('crops a 16:9 source to a square', () => {
    const c = coverCrop(1600, 900, { x: 0, y: 0, w: 100, h: 100 })
    expect(c.sw).toBeCloseTo(900)
    expect(c.sh).toBeCloseTo(900)
    expect(c.sx).toBeCloseTo(350)
  })
})
