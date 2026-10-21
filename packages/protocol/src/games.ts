export const MAX_PEERS = 6
export const MAX_ROUNDS = 10

export const ACTIVITY_IDS = [
  'know-me',
  'conversation-cards',
  'honest-cards',
  'in-sync',
  'truth-or-dare',
  'riddle-night',
  'iq-duel',
  'color-match',
  'our-future',
  'draw-together',
] as const
export type ActivityId = (typeof ACTIVITY_IDS)[number]

export type GameKind = 'quiz' | 'cards' | 'choice' | 'text' | 'draw'

export const GAMES: Record<ActivityId, { kind: GameKind; rounds: number }> = {
  'know-me': { kind: 'quiz', rounds: MAX_PEERS },
  'conversation-cards': { kind: 'cards', rounds: MAX_PEERS },
  'honest-cards': { kind: 'text', rounds: 6 },
  'in-sync': { kind: 'choice', rounds: 8 },
  'truth-or-dare': { kind: 'cards', rounds: 8 },
  'riddle-night': { kind: 'text', rounds: 6 },
  'iq-duel': { kind: 'choice', rounds: 8 },
  'color-match': { kind: 'text', rounds: 5 },
  'our-future': { kind: 'choice', rounds: 8 },
  'draw-together': { kind: 'draw', rounds: 1 },
}

export const MAX_TEXT_ANSWER = 200

export function roundCount(id: ActivityId, peers: number): number {
  return id === 'know-me' ? Math.min(peers, MAX_PEERS) : GAMES[id].rounds
}
