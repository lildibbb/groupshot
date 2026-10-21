import { GAMES } from '@groupshot/protocol'
import { describe, expect, it } from 'vitest'
import {
  choiceDecks,
  colorScore,
  colorTargets,
  honestCards,
  parseColor,
  riddleCorrect,
  riddles,
  truthOrDare,
} from './game-content'

describe('game content', () => {
  it('has a card for every round the server will run', () => {
    expect(honestCards.length).toBeGreaterThanOrEqual(GAMES['honest-cards'].rounds)
    expect(riddles.length).toBeGreaterThanOrEqual(GAMES['riddle-night'].rounds)
    expect(truthOrDare.length).toBeGreaterThanOrEqual(GAMES['truth-or-dare'].rounds)
    expect(colorTargets.length).toBeGreaterThanOrEqual(GAMES['color-match'].rounds)
    for (const id of ['in-sync', 'iq-duel', 'our-future'] as const) {
      expect(choiceDecks[id]?.length).toBeGreaterThanOrEqual(GAMES[id].rounds)
    }
  })

  it('keeps every choice list within what the protocol allows', () => {
    for (const deck of Object.values(choiceDecks))
      for (const q of deck ?? []) expect(q.choices.length).toBeLessThanOrEqual(4)
  })

  it('marks a correct answer on every IQ question', () => {
    for (const q of choiceDecks['iq-duel'] ?? []) expect(q.choices[q.correct ?? -1]).toBeDefined()
  })

  it('accepts riddle answers with extra words and rejects wrong ones', () => {
    expect(riddleCorrect(0, 'A piano!')).toBe(true)
    expect(riddleCorrect(0, 'a door')).toBe(false)
    expect(riddleCorrect(1, 'footsteps')).toBe(true)
    expect(riddleCorrect(0, undefined)).toBe(false)
  })

  it('scores identical colours 100 and opposite colours low', () => {
    const t = { h: 200, s: 80, l: 50 }
    expect(colorScore(t, t)).toBe(100)
    expect(colorScore(t, { h: 20, s: 80, l: 50 })).toBeLessThan(30)
  })

  it('parses a submitted colour and rejects junk', () => {
    expect(parseColor('210,80,55')).toEqual({ h: 210, s: 80, l: 55 })
    expect(parseColor('nope')).toBeNull()
    expect(parseColor(undefined)).toBeNull()
  })
})
