import { describe, expect, it } from 'vitest'
import { qrMatrix, qrPath } from './qr'

describe('qr', () => {
  it('encodes a url locally into a square matrix with finder patterns', () => {
    const m = qrMatrix('https://groupshot.app/api/keep/abcdef0123456789')
    expect(m.dark).toHaveLength(m.size * m.size)
    expect(m.size).toBeGreaterThanOrEqual(21)
    for (let i = 0; i < 7; i++) {
      expect(m.dark[i]).toBe(true)
      expect(m.dark[i * m.size]).toBe(true)
    }
  })

  it('is deterministic and adds a quiet zone', () => {
    const a = qrPath(qrMatrix('hello'), 2)
    const b = qrPath(qrMatrix('hello'), 2)
    expect(a).toEqual(b)
    expect(a.view).toBe(qrMatrix('hello').size + 4)
    expect(a.d.startsWith('M2 2')).toBe(true)
  })
})
