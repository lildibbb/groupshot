import { describe, expect, it } from 'vitest'
import { sequence } from './clip'

describe('sequence', () => {
  it('plays a boomerang forward then back without doubling the ends', () => {
    expect(sequence(4, 'boomerang')).toEqual([0, 1, 2, 3, 2, 1])
  })
  it('plays a live clip straight through', () => {
    expect(sequence(3, 'live')).toEqual([0, 1, 2])
  })
})
