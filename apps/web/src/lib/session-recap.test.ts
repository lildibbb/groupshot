import { DEFAULT_SETTINGS, type Session } from '@groupshot/protocol'
import { describe, expect, it } from 'vitest'
import { buildRecap, isRecap, recapLines } from './session-recap'

const now = new Date('2026-10-20T18:00:00Z')

function session(over: Partial<Session> = {}): Session {
  return {
    id: 's',
    fireAts: [1, 2],
    settings: { ...DEFAULT_SETTINGS, shots: 2 },
    peerIds: ['a', 'b'],
    shots: [
      { a: 'x', b: 'y' },
      { a: 'x', b: 'y' },
    ],
    ...over,
  }
}

describe('buildRecap', () => {
  it('reports only facts from a complete photo session', () => {
    const r = buildRecap({ session: session(), names: { a: 'Ana', b: 'Ben' }, templateName: 'Classic Strip', now })
    expect(r).toEqual({
      version: 1,
      participants: ['Ana', 'Ben'],
      templateId: 'classic-strip',
      templateName: 'Classic Strip',
      shots: 2,
      framesExpected: 4,
      framesCompleted: 4,
      output: 'photo',
      retakes: 0,
      date: now.toISOString(),
    })
    expect(isRecap(r)).toBe(true)
  })

  it('falls back to Guest for empty names', () => {
    const r = buildRecap({ session: session(), names: { a: '  ' }, templateName: 'T', now })
    expect(r.participants).toEqual(['Guest', 'Guest'])
  })

  it('counts missing frames and retakes', () => {
    const r = buildRecap({
      session: session({ shots: [{ a: 'x' }, {}], attempt: 1 }),
      names: { a: 'Ana', b: 'Ben' },
      templateName: 'T',
      now,
    })
    expect(r.framesCompleted).toBe(1)
    expect(r.framesExpected).toBe(4)
    expect(recapLines(r).find((l) => l.label === 'Retakes')?.value).toBe('1')
  })

  it('names video outputs', () => {
    const r = buildRecap({
      session: session({ settings: { ...DEFAULT_SETTINGS, output: 'boomerang' } }),
      names: {},
      templateName: 'T',
      now,
    })
    expect(r.output).toBe('boomerang')
    expect(recapLines(r).find((l) => l.label === 'Made')?.value).toBe('Boomerang')
  })

  it('rejects malformed recaps', () => {
    expect(isRecap({ version: 2 })).toBe(false)
    expect(isRecap(null)).toBe(false)
  })
})
