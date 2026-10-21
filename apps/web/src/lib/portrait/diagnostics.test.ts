import { describe, expect, it } from 'vitest'
import { summarizeFrames } from './diagnostics'

describe('summarizeFrames', () => {
  it('reports frame rate and mean render time across the sample window', () => {
    expect(
      summarizeFrames(
        [
          { at: 0, ms: 8 },
          { at: 50, ms: 12 },
          { at: 100, ms: 10 },
        ],
        22,
      ),
    ).toEqual({ fps: 20, frameMs: 10, segmentationMs: 22 })
  })

  it('returns zero fps when fewer than two timestamps are available', () => {
    expect(summarizeFrames([{ at: 10, ms: 4 }], 0)).toEqual({ fps: 0, frameMs: 4, segmentationMs: 0 })
  })
})
