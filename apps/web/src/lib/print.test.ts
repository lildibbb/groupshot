import { describe, expect, it } from 'vitest'
import { templates } from '@/templates'
import { cropMarks, PAPERS, type PaperId, printLayout } from './print'

describe('printLayout', () => {
  it('prints a classic strip at true 2x6 inch size, two per sheet', () => {
    const l = printLayout('letter', { w: 600, h: 1800 })
    expect(l.scale).toBe(1)
    expect(l.copies).toHaveLength(2)
    expect(l.copies[0]).toMatchObject({ w: 600, h: 1800 })
    expect(l.copies[0]!.y).toBe(l.copies[1]!.y)
  })

  it('stacks wide strips', () => {
    const l = printLayout('a4', { w: 1920, h: 1080 })
    expect(l.copies).toHaveLength(2)
    expect(l.copies[0]!.x).toBe(l.copies[1]!.x)
    expect(l.copies[1]!.y).toBeGreaterThan(l.copies[0]!.y + l.copies[0]!.h)
  })

  it('keeps every template inside the margins on both papers, deterministically', () => {
    for (const paper of Object.keys(PAPERS) as PaperId[]) {
      for (const t of templates) {
        const a = printLayout(paper, t.size)
        expect(printLayout(paper, t.size)).toEqual(a)
        expect(a.scale).toBeLessThanOrEqual(1)
        expect(a.copies.length).toBeGreaterThanOrEqual(1)
        for (const c of a.copies) {
          expect(c.x).toBeGreaterThanOrEqual(150 - 1)
          expect(c.y).toBeGreaterThanOrEqual(150 - 1)
          expect(c.x + c.w).toBeLessThanOrEqual(a.paper.w - 150 + 1)
          expect(c.y + c.h).toBeLessThanOrEqual(a.paper.h - 150 + 1)
        }
        const [first, second] = a.copies
        if (first && second) {
          const overlap =
            first.x < second.x + second.w &&
            second.x < first.x + first.w &&
            first.y < second.y + second.h &&
            second.y < first.y + first.h
          expect(overlap).toBe(false)
        }
      }
    }
  })

  it('uses 300 dpi sheet sizes', () => {
    expect(PAPERS.letter).toMatchObject({ w: 2550, h: 3300 })
    expect(PAPERS.a4).toMatchObject({ w: 2480, h: 3508 })
  })
})

describe('cropMarks', () => {
  it('draws two marks per corner, outside the strip', () => {
    const r = { x: 100, y: 100, w: 600, h: 1800 }
    const marks = cropMarks(r)
    expect(marks).toHaveLength(8)
    for (const [x1, y1, x2, y2] of marks) {
      const inside = (x: number, y: number) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h
      expect(inside(x1, y1)).toBe(false)
      expect(inside(x2, y2)).toBe(false)
    }
  })
})
