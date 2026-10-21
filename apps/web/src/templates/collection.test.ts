import { MAX_PEERS, MAX_SHOTS } from '@groupshot/protocol'
import { describe, expect, it } from 'vitest'
import { getTemplate, templates } from './index'
import { tile } from './layout'
import { type Ctx, type DrawInfo, OCCASIONS } from './types'

function recordingCtx() {
  const calls: string[] = []
  const gradient = { addColorStop: (...a: unknown[]) => calls.push(`stop ${JSON.stringify(a)}`) }
  const target: Record<string | symbol, unknown> = {}
  const ctx = new Proxy(target, {
    get(_, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 18 })
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient
      if (key in target) return target[key]
      return (...args: unknown[]) => {
        calls.push(`${String(key)} ${JSON.stringify(args)}`)
      }
    },
    set(_, key, value) {
      target[key] = value
      calls.push(`${String(key)}=${JSON.stringify(value)}`)
      return true
    },
  })
  return { ctx: ctx as unknown as Ctx, calls }
}

function render(id: string, info: Partial<DrawInfo> = {}) {
  const t = getTemplate(id)
  const { ctx, calls } = recordingCtx()
  const full: DrawInfo = {
    w: t.size.w,
    h: t.size.h,
    slots: t.slots,
    caption: 'our caption',
    date: 'OCT 20, 2026',
    names: ['Ana', 'Ben', 'Cy'],
    ...info,
  }
  t.background?.(ctx, full)
  t.decorate?.(ctx, full)
  return calls
}

describe('exportable frame collection', () => {
  it('has unique IDs and supports the capture protocol for every frame', () => {
    expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length)
    for (const template of templates) {
      expect(template.slots.length).toBeGreaterThan(0)
      expect(template.slots.length).toBeLessThanOrEqual(MAX_SHOTS)
      for (const slot of template.slots) {
        expect(slot.x).toBeGreaterThanOrEqual(0)
        expect(slot.y).toBeGreaterThanOrEqual(0)
        expect(slot.w).toBeGreaterThan(0)
        expect(slot.h).toBeGreaterThan(0)
        expect(slot.x + slot.w).toBeLessThanOrEqual(template.size.w)
        expect(slot.y + slot.h).toBeLessThanOrEqual(template.size.h)
      }
    }
  })

  it('gives every frame an empty fill and picker metadata', () => {
    for (const t of templates) {
      expect(t.empty).toMatch(/^#/)
      expect(t.occasions?.length).toBeGreaterThan(0)
      for (const o of t.occasions ?? []) expect(OCCASIONS).toContain(o)
      const [min, max] = t.people ?? [0, 0]
      expect(min).toBeGreaterThanOrEqual(1)
      expect(max).toBeLessThanOrEqual(MAX_PEERS)
      expect(min).toBeLessThanOrEqual(max)
    }
  })

  it('draws the same thing every time for the same input', () => {
    for (const t of templates) expect(render(t.id)).toEqual(render(t.id))
  })

  it('fits six people inside every slot', () => {
    for (const t of templates) {
      for (const slot of t.slots) {
        const tiles = tile(slot, MAX_PEERS)
        expect(tiles).toHaveLength(MAX_PEERS)
        for (const r of tiles) {
          expect(r.x).toBeGreaterThanOrEqual(slot.x - 0.001)
          expect(r.y).toBeGreaterThanOrEqual(slot.y - 0.001)
          expect(r.x + r.w).toBeLessThanOrEqual(slot.x + slot.w + 0.001)
          expect(r.y + r.h).toBeLessThanOrEqual(slot.y + slot.h + 0.001)
        }
      }
    }
  })
})

describe('session-derived templates', () => {
  const texts = (calls: string[]) => calls.filter((c) => c.startsWith('fillText')).join('\n')

  it('receipt only lists real counts, names and the date', () => {
    const out = texts(render('receipt', { names: ['Ana', 'Ben'] }))
    expect(out).toContain('"PEOPLE"')
    expect(out).toContain('"2"')
    expect(out).toContain('"FRAMES"')
    expect(out).toContain('"3"')
    expect(out).toContain('"PHOTOS"')
    expect(out).toContain('"6"')
    expect(out).toContain('ANA · BEN')
    expect(out).toContain('OCT 20, 2026')
    expect(out).not.toMatch(/PRICELESS|FLASH|GOOD ANGLE/)
  })

  it('comic strip puts the names in the title and the caption in the bubble', () => {
    const out = texts(render('comic-strip', { caption: 'pow' }))
    expect(out).toContain('ANA, BEN & CY')
    expect(out).toContain('"POW"')
    expect(out).toContain('3 PANELS')
  })

  it('yearbook takes its year from the session date', () => {
    const out = texts(render('yearbook'))
    expect(out).toContain('Class of 2026')
    expect(out).toContain('Ana, Ben & Cy')
    expect(texts(render('yearbook', { date: 'no year' }))).toContain('The Class Photo')
  })

  it('handles a solo sitting with no names', () => {
    for (const id of ['receipt', 'comic-strip', 'yearbook']) expect(() => render(id, { names: [] })).not.toThrow()
  })
})
