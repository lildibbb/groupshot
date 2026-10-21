import type { ActivityId } from '@groupshot/protocol'

export interface ChoiceQuestion {
  prompt: string
  choices: string[]
  correct?: number
}

export const inSync: ChoiceQuestion[] = [
  {
    prompt: 'It’s Sunday morning. Which one?',
    choices: ['Pancakes out', 'Slow coffee at home', 'A long walk first', 'Sleep until noon'],
  },
  { prompt: 'Pick a trip.', choices: ['Beach week', 'City break', 'Cabin in the woods', 'Road trip, no plan'] },
  {
    prompt: 'Movie night rule?',
    choices: ['I pick, you suffer', 'Take turns', 'Rewatch a favourite', 'Scroll for an hour, then sleep'],
  },
  { prompt: 'Which snack wins?', choices: ['Salty', 'Sweet', 'Spicy', 'Whatever is closest'] },
  {
    prompt: 'A free hour. You…',
    choices: ['Call someone you miss', 'Make something', 'Go outside', 'Do absolutely nothing'],
  },
  {
    prompt: 'Pick a superpower.',
    choices: ['Teleport', 'Pause time', 'Talk to animals', 'Always know the right thing to say'],
  },
  {
    prompt: 'Best way to celebrate?',
    choices: ['Big loud dinner', 'Quiet night in', 'Surprise trip', 'A handwritten card'],
  },
  { prompt: 'Which one are you?', choices: ['Early bird', 'Night owl', 'Depends on the day', 'Always tired'] },
]

export const iqDuel: ChoiceQuestion[] = [
  { prompt: 'What comes next: 2, 6, 12, 20, ?', choices: ['28', '30', '32', '36'], correct: 1 },
  {
    prompt: 'All Bloops are Razzies, and all Razzies are Lazzies. Are all Bloops Lazzies?',
    choices: ['Yes', 'No', 'Only some', 'Can’t tell'],
    correct: 0,
  },
  {
    prompt: 'A bat and a ball cost $1.10. The bat costs $1.00 more than the ball. The ball costs…',
    choices: ['10¢', '5¢', '15¢', '1¢'],
    correct: 1,
  },
  { prompt: 'Which one doesn’t belong?', choices: ['Apple', 'Banana', 'Carrot', 'Grape'], correct: 2 },
  { prompt: 'How many months have 28 days?', choices: ['1', '2', '12', '6'], correct: 2 },
  { prompt: 'Which capital letter looks the same in a mirror?', choices: ['B', 'A', 'F', 'R'], correct: 1 },
  { prompt: 'What comes next: 1, 1, 2, 3, 5, 8, ?', choices: ['11', '12', '13', '15'], correct: 2 },
  {
    prompt: 'A train leaves at 3:15 and the trip takes 2h 50m. It arrives at…',
    choices: ['5:55', '6:05', '6:15', '5:45'],
    correct: 1,
  },
]

export const ourFuture: ChoiceQuestion[] = [
  {
    prompt: 'In five years, where do we mostly live?',
    choices: ['A big city', 'A small town', 'By the sea', 'We keep moving'],
  },
  {
    prompt: 'Our someday home has…',
    choices: ['A huge kitchen', 'A garden', 'A tiny cosy loft', 'A spare room for guests'],
  },
  {
    prompt: 'How often should we all meet up in person?',
    choices: ['Every month', 'Every season', 'Twice a year', 'As often as we can afford'],
  },
  {
    prompt: 'The first big thing we do together?',
    choices: ['Travel somewhere far', 'Start a project', 'Adopt a pet', 'Just have a very long dinner'],
  },
  {
    prompt: 'Money talk, honestly:',
    choices: ['Save for something big', 'Spend on experiences', 'Keep a safety buffer', 'Figure it out as we go'],
  },
  {
    prompt: 'A good week looks like…',
    choices: ['Packed and social', 'Quiet and slow', 'Half and half', 'Different every time'],
  },
  {
    prompt: 'Our group tradition should be…',
    choices: ['A yearly trip', 'A weekly call', 'A shared photo strip', 'A letter on every birthday'],
  },
  {
    prompt: 'In ten years, this group is…',
    choices: ['Famous at something small', 'Rich in time', 'Surrounded by friends', 'Exactly where we are, happier'],
  },
]

export const honestCards: string[] = [
  'Something small that made you smile this week.',
  'Something you’d tell this group that nobody else knows.',
  'Your most useless talent.',
  'What did you need more of last month?',
  'A memory you’d replay if you could.',
  'One thing about the group you’d never change.',
]

export const riddles: { prompt: string; answers: string[] }[] = [
  { prompt: 'What has keys but can’t open locks?', answers: ['piano', 'keyboard'] },
  { prompt: 'The more you take, the more you leave behind. What am I?', answers: ['footstep', 'footprint', 'step'] },
  { prompt: 'What gets wetter the more it dries?', answers: ['towel'] },
  { prompt: 'I speak without a mouth and hear without ears. What am I?', answers: ['echo'] },
  { prompt: 'What can you catch but never throw?', answers: ['cold'] },
  { prompt: 'What has hands but can’t clap?', answers: ['clock', 'watch'] },
]

export const truthOrDare: { kind: 'truth' | 'dare'; text: string }[] = [
  { kind: 'truth', text: 'What’s the last thing you searched for on your phone?' },
  { kind: 'dare', text: 'Show the last photo in your camera roll, no editing.' },
  { kind: 'truth', text: 'Which of us would survive longest in a zombie film?' },
  { kind: 'dare', text: 'Do your best impression of someone in this call.' },
  { kind: 'truth', text: 'What’s a small habit you’re a little embarrassed about?' },
  { kind: 'dare', text: 'Hold a silly face until the next person laughs.' },
  { kind: 'truth', text: 'What’s the best compliment you’ve ever got?' },
  { kind: 'dare', text: 'Sing the chorus of the last song you listened to.' },
]

export const colorTargets: { h: number; s: number; l: number }[] = [
  { h: 340, s: 85, l: 65 },
  { h: 210, s: 80, l: 55 },
  { h: 150, s: 60, l: 45 },
  { h: 45, s: 95, l: 55 },
  { h: 270, s: 60, l: 60 },
]

export const knowMe: ChoiceQuestion[] = [
  {
    prompt: 'What would you pick for a free evening?',
    choices: ['Try a new restaurant', 'Stay in and watch something', 'Go for a walk', 'Call a friend'],
  },
  { prompt: 'Pick a small treat.', choices: ['Coffee', 'Something sweet', 'A new book', 'A long nap'] },
  { prompt: 'Choose a day out.', choices: ['The beach', 'A museum', 'A busy market', 'Staying home'] },
  { prompt: 'Which road-trip role would you take?', choices: ['DJ', 'Navigator', 'Snack keeper', 'Driver'] },
  {
    prompt: 'What sounds best after a long week?',
    choices: ['See live music', 'Cook something new', 'Take a slow morning', 'Meet friends'],
  },
  {
    prompt: 'Choose a tiny adventure.',
    choices: ['A train to somewhere new', 'A late-night diner', 'A scenic detour', 'A bookshop visit'],
  },
]

export const choiceDecks: Partial<Record<ActivityId, ChoiceQuestion[]>> = {
  'know-me': knowMe,
  'in-sync': inSync,
  'iq-duel': iqDuel,
  'our-future': ourFuture,
}

export function riddleCorrect(round: number, text: string | undefined) {
  if (!text) return false
  const said = text.toLowerCase().replace(/[^a-z ]/g, ' ')
  return Boolean(riddles[round]?.answers.some((a) => said.includes(a)))
}

export function hsl({ h, s, l }: { h: number; s: number; l: number }) {
  return `hsl(${h} ${s}% ${l}%)`
}

function toRgb({ h, s, l }: { h: number; s: number; l: number }) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return 255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
  }
  return [f(0), f(8), f(4)] as const
}

export function colorScore(target: { h: number; s: number; l: number }, guess: { h: number; s: number; l: number }) {
  const [a, b] = [toRgb(target), toRgb(guess)]
  const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  return Math.max(0, Math.round(100 - (dist / Math.hypot(255, 255, 255)) * 160))
}

export function parseColor(text: string | undefined) {
  const [h, s, l] = (text ?? '').split(',').map(Number)
  if (h === undefined || s === undefined || l === undefined || [h, s, l].some((n) => Number.isNaN(n))) return null
  return { h, s, l }
}
