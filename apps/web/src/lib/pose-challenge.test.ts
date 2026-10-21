import { describe, expect, it } from 'vitest'
import { scheduledRoundAt } from './pose-challenge'

describe('scheduledRoundAt', () => {
  it('keeps each participant on the same prompt according to shared shot times', () => {
    const fireAts = [3000, 5000, 7000]
    expect(scheduledRoundAt(fireAts, 1000)).toBe(0)
    expect(scheduledRoundAt(fireAts, 3000)).toBe(1)
    expect(scheduledRoundAt(fireAts, 9000)).toBe(2)
  })

  it('returns a safe index when no shot times exist', () => {
    expect(scheduledRoundAt([], 1000)).toBe(0)
  })
})
