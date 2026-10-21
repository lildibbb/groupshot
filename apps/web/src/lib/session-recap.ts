import { missingFrames, type Output, type Session } from '@groupshot/protocol'

export interface SessionRecap {
  version: 1
  participants: string[]
  templateId: string
  templateName: string
  shots: number
  framesExpected: number
  framesCompleted: number
  output: Output
  retakes: number
  date: string
}

const OUTPUT_LABEL: Record<Output, string> = { photo: 'Photo strip', boomerang: 'Boomerang', live: 'Live clip' }

export function buildRecap(input: {
  session: Session
  names: Record<string, string>
  templateName: string
  now?: Date
}): SessionRecap {
  const { session, names } = input
  const expected = session.shots.length * session.peerIds.length
  return {
    version: 1,
    participants: session.peerIds.map((id) => names[id]?.trim() || 'Guest'),
    templateId: session.settings.templateId,
    templateName: input.templateName,
    shots: session.shots.length,
    framesExpected: expected,
    framesCompleted: expected - missingFrames(session).length,
    output: session.settings.output ?? 'photo',
    retakes: session.attempt ?? 0,
    date: (input.now ?? new Date()).toISOString(),
  }
}

export function recapLines(r: SessionRecap): { label: string; value: string }[] {
  const people = r.participants.length
  return [
    { label: 'People', value: `${people} · ${r.participants.join(', ')}` },
    { label: 'Frame', value: r.templateName },
    { label: 'Made', value: OUTPUT_LABEL[r.output] },
    { label: 'Shots', value: `${r.shots} round${r.shots === 1 ? '' : 's'}` },
    { label: 'Frames in', value: `${r.framesCompleted} of ${r.framesExpected}` },
    ...(r.retakes ? [{ label: 'Retakes', value: String(r.retakes) }] : []),
    {
      label: 'Date',
      value: new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    },
  ]
}

export function isRecap(value: unknown): value is SessionRecap {
  const r = value as SessionRecap
  return (
    Boolean(r) &&
    r.version === 1 &&
    Array.isArray(r.participants) &&
    r.participants.every((p) => typeof p === 'string') &&
    typeof r.templateName === 'string' &&
    Number.isInteger(r.shots) &&
    Number.isInteger(r.framesExpected) &&
    Number.isInteger(r.framesCompleted) &&
    ['photo', 'boomerang', 'live'].includes(r.output) &&
    typeof r.date === 'string'
  )
}
