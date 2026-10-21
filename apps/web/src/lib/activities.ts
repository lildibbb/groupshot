import type { ActivityId } from '@groupshot/protocol'

type SoonId = 'snap-hunt' | 'lab' | 'escape-room' | 'watch-along' | 'worlds'
export type StopId = ActivityId | 'photobooth' | 'scrapbook' | 'letters' | SoonId

export type StopMode = 'room' | 'solo' | 'page' | 'soon'

export interface PathStop {
  id: StopId
  name: string
  blurb: string
  mode: StopMode
  to?: string
  badge?: 'New' | 'Popular'
}

export interface Chapter {
  id: string
  eyebrow: string
  title: string
  stops: PathStop[]
}

export const chapters: Chapter[] = [
  {
    id: 'start',
    eyebrow: 'Roll 01',
    title: 'First shots',
    stops: [
      {
        id: 'photobooth',
        name: 'Photobooth',
        blurb: 'One countdown, every camera. Everyone gets the same strip.',
        mode: 'solo',
        badge: 'Popular',
      },
      {
        id: 'know-me',
        name: 'Know me',
        blurb: 'Guess what each person would pick, then reveal together.',
        mode: 'room',
      },
      {
        id: 'in-sync',
        name: 'In sync',
        blurb: 'Eight picks, no peeking. See who in the group thinks alike.',
        mode: 'room',
      },
      {
        id: 'honest-cards',
        name: 'Honest cards',
        blurb: 'Write your answer in private. Everyone’s cards flip at once.',
        mode: 'room',
      },
    ],
  },
  {
    id: 'play',
    eyebrow: 'Roll 02',
    title: 'Party mode',
    stops: [
      {
        id: 'draw-together',
        name: 'Draw together',
        blurb: 'One canvas, everyone’s pen. Watch the lines show up live.',
        mode: 'room',
        badge: 'New',
      },
      {
        id: 'truth-or-dare',
        name: 'Truth or dare',
        blurb: 'The spotlight moves round the room, one card at a time.',
        mode: 'room',
      },
      {
        id: 'conversation-cards',
        name: 'Conversation cards',
        blurb: 'A shared deck of small questions to talk through.',
        mode: 'room',
      },
    ],
  },
  {
    id: 'night',
    eyebrow: 'Roll 03',
    title: 'Game night',
    stops: [
      {
        id: 'riddle-night',
        name: 'Riddle night',
        blurb: 'Lock in your answer, then see who cracked it.',
        mode: 'room',
      },
      { id: 'iq-duel', name: 'IQ duel', blurb: 'Quick questions, scores hidden until the very end.', mode: 'room' },
      {
        id: 'color-match',
        name: 'Color match',
        blurb: 'Memorise a colour for four seconds, then rebuild it from memory.',
        mode: 'room',
      },
    ],
  },
  {
    id: 'long',
    eyebrow: 'Roll 04',
    title: 'The long run',
    stops: [
      {
        id: 'our-future',
        name: 'Group plans',
        blurb: 'Eight “someday” questions. See where the group’s plans line up.',
        mode: 'room',
      },
      {
        id: 'letters',
        name: 'Letters to the future',
        blurb: 'Write something now. It stays sealed until the date you pick.',
        mode: 'page',
        to: '/letters',
        badge: 'New',
      },
    ],
  },
  {
    id: 'keep',
    eyebrow: 'Roll 05',
    title: 'Keep it',
    stops: [
      {
        id: 'scrapbook',
        name: 'Scrapbook',
        blurb: 'Every strip you saved, on this device.',
        mode: 'page',
        to: '/memories',
      },
    ],
  },
  {
    id: 'soon',
    eyebrow: 'Roll 06',
    title: 'Undeveloped',
    stops: [
      { id: 'snap-hunt', name: 'Snap hunt', blurb: 'A timed scavenger hunt, proven with photos.', mode: 'soon' },
      { id: 'escape-room', name: 'Escape room', blurb: 'Clues on one side, locks on the other.', mode: 'soon' },
      { id: 'lab', name: 'The lab', blurb: 'Small science puzzles, solo or as a team.', mode: 'soon' },
      { id: 'watch-along', name: 'Watch-alongs', blurb: 'Press play at the same moment.', mode: 'soon' },
      { id: 'worlds', name: '3D worlds', blurb: 'Somewhere else to be, together.', mode: 'soon' },
    ],
  },
]

export const stops: PathStop[] = chapters.flatMap((c) => c.stops)
export const playableStops = stops.filter((s) => s.mode !== 'soon')

export function findStop(id: string) {
  return stops.find((s) => s.id === id)
}

export const activities: { id: ActivityId; name: string; detail: string }[] = stops
  .filter((s): s is PathStop & { id: ActivityId } => s.mode === 'room')
  .map((s) => ({ id: s.id, name: s.name, detail: s.blurb }))
