import { describe, expect, it } from 'vitest'
import { isPermanentStatus, normalizeCode } from './api'

describe('normalizeCode', () => {
  it.each([
    ['snap-42', 'SNAP-42'],
    ['  Snap 42 ', 'SNAP-42'],
    ['https://groupshot.app/r/PIXEL-07?x=1', 'PIXEL-07'],
    ['nope', null],
    ['SNAP-4', null],
  ])('%s → %s', (input, out) => expect(normalizeCode(input)).toBe(out))
})

describe('isPermanentStatus', () => {
  it.each([
    [400, true],
    [409, true],
    [410, true],
    [413, true],
    [408, false],
    [429, false],
    [500, false],
    [503, false],
  ])('%i → %s', (status, permanent) => expect(isPermanentStatus(status)).toBe(permanent))
})
