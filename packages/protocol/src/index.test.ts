import { describe, expect, it } from 'vitest'
import {
  ClientMessageSchema,
  GAMES,
  isSessionComplete,
  MAX_SHOTS,
  missingFrames,
  missingRounds,
  PREP_MS,
  planRetake,
  roundCount,
  type Session,
  scheduleShots,
  sessionEndsAt,
} from './index'

describe('scheduleShots', () => {
  it('spaces shots by gap after the timer', () => {
    expect(scheduleShots(0, { timer: 3, shots: 3, gap: 2 })).toEqual([PREP_MS + 3000, PREP_MS + 5000, PREP_MS + 7000])
  })
})

describe('ClientMessageSchema', () => {
  it('rejects empty names', () => {
    expect(ClientMessageSchema.safeParse({ type: 'hello', name: '  ' }).success).toBe(false)
  })
  it('accepts partial settings', () => {
    expect(ClientMessageSchema.safeParse({ type: 'settings', settings: { timer: 5 } }).success).toBe(true)
  })
  it('bounds activity answers to valid rounds and choices', () => {
    expect(ClientMessageSchema.safeParse({ type: 'activity-answer', round: 0, choice: 3 }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ type: 'activity-answer', round: 10, choice: 0 }).success).toBe(false)
    expect(ClientMessageSchema.safeParse({ type: 'activity-answer', round: 0, choice: 4 }).success).toBe(false)
  })
})

describe('activity-submit', () => {
  it('needs non-empty text within the cap', () => {
    expect(ClientMessageSchema.safeParse({ type: 'activity-submit', round: 0, text: 'a' }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ type: 'activity-submit', round: 0, text: '  ' }).success).toBe(false)
    expect(ClientMessageSchema.safeParse({ type: 'activity-submit', round: 0, text: 'x'.repeat(201) }).success).toBe(
      false,
    )
  })
})

describe('shared canvas and cursors', () => {
  it('keeps cursors and strokes inside the canvas', () => {
    expect(ClientMessageSchema.safeParse({ type: 'cursor', x: 0.5, y: 1.2 }).success).toBe(false)
    const stroke = { id: 's1', color: '#ff7ba3', width: 6, pts: [0.1, 0.2, 0.3, 0.4] }
    expect(ClientMessageSchema.safeParse({ type: 'draw', stroke }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ type: 'draw', stroke: { ...stroke, color: 'red' } }).success).toBe(false)
  })
})

describe('roundCount', () => {
  it('follows the room size for know-me and the deck for everything else', () => {
    expect(roundCount('know-me', 3)).toBe(3)
    expect(roundCount('in-sync', 2)).toBe(GAMES['in-sync'].rounds)
  })
})

describe('isSessionComplete', () => {
  it('needs every peer in every round', () => {
    const base = { id: 's', fireAts: [], settings: {} as never, peerIds: ['a', 'b'] }
    expect(isSessionComplete({ ...base, shots: [{ a: 'x', b: 'y' }] })).toBe(true)
    expect(isSessionComplete({ ...base, shots: [{ a: 'x' }] })).toBe(false)
  })
})

describe('retakes', () => {
  const settings = {
    templateId: 't',
    timer: 3 as const,
    shots: 3,
    gap: 2,
    filter: 'none' as const,
    scene: 'original' as const,
    output: 'photo' as const,
  }
  const session: Session = {
    id: 's',
    fireAts: [1000, 3000, 5000],
    settings,
    peerIds: ['a', 'b'],
    shots: [{ a: 'a0', b: 'b0' }, { a: 'a1' }, { b: 'b2' }],
  }

  it('lists missing frames in round order', () => {
    expect(missingFrames(session)).toEqual([
      { round: 1, peerId: 'b' },
      { round: 2, peerId: 'a' },
    ])
    expect(missingRounds(session)).toEqual([1, 2])
  })

  it('only reschedules the selected incomplete rounds and never changes peerIds', () => {
    const next = planRetake(10_000, session, [1])!
    expect(next.retakeRounds).toEqual([1])
    expect(next.peerIds).toEqual(['a', 'b'])
    expect(next.fireAts[0]).toBe(1000)
    expect(next.fireAts[2]).toBe(5000)
    expect(next.fireAts[1]).toBe(10_000 + PREP_MS + 3000)
    expect(next.shots).toEqual(session.shots)
    expect(next.attempt).toBe(1)
    expect(sessionEndsAt(next)).toBe(next.fireAts[1])
  })

  it('ignores complete or out-of-range rounds', () => {
    expect(planRetake(0, session, [0])).toBeNull()
    expect(planRetake(0, session, [0, 2, 9])?.retakeRounds).toEqual([2])
  })

  it('stays incomplete while a selected retake frame is absent', () => {
    const next = planRetake(0, session, [1, 2])!
    expect(isSessionComplete(next)).toBe(false)
    const filled = { ...next, shots: [session.shots[0]!, { a: 'a1', b: 'b1' }, { b: 'b2' }] }
    expect(isSessionComplete(filled)).toBe(false)
    expect(isSessionComplete({ ...filled, shots: [...filled.shots.slice(0, 2), { a: 'a2', b: 'b2' }] })).toBe(true)
  })

  it('validates retake and host-transfer messages', () => {
    expect(ClientMessageSchema.safeParse({ type: 'retake', rounds: [1] }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ type: 'retake', rounds: [] }).success).toBe(false)
    expect(ClientMessageSchema.safeParse({ type: 'retake', rounds: [MAX_SHOTS] }).success).toBe(false)
    expect(ClientMessageSchema.safeParse({ type: 'transfer-host', to: 'abc' }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ type: 'camera', state: 'ready' }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ type: 'camera', state: 'on' }).success).toBe(false)
  })
})
