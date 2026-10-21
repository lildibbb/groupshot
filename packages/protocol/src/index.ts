import { z } from 'zod'
import { ACTIVITY_IDS, MAX_ROUNDS, MAX_TEXT_ANSWER } from './games'

export * from './games'

export const MAX_SHOTS = 6
export const MAX_ACTIVITY_CHOICES = 4

export const TIMER_OPTIONS = [3, 5, 10] as const
export const FILTER_IDS = [
  'none',
  'mono',
  'warm',
  'cool',
  'film',
  'vivid',
  'chrome',
  'ice',
  'lime',
  'faded',
  'noir',
  'cross',
  'disposable',
  'instant',
  'safelight',
] as const
export const SCENE_IDS = ['original', 'studio', 'blue', 'curtain'] as const
export type Scene = (typeof SCENE_IDS)[number]
export const OUTPUT_IDS = ['photo', 'boomerang', 'live'] as const
export type Output = (typeof OUTPUT_IDS)[number]

export const ROOM_CODE_PATTERN = /^[A-Z]{4,6}-\d{2}$/

export const SettingsSchema = z.object({
  templateId: z.string().min(1).max(40),
  timer: z.union([z.literal(3), z.literal(5), z.literal(10)]),
  shots: z.number().int().min(1).max(MAX_SHOTS),
  gap: z.number().int().min(1).max(10),
  filter: z.enum(FILTER_IDS),
  scene: z.enum(SCENE_IDS).default('original'),
  output: z.enum(OUTPUT_IDS).default('photo'),
})
export type Settings = z.infer<typeof SettingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  templateId: 'classic-strip',
  timer: 3,
  shots: 4,
  gap: 2,
  filter: 'none',
  scene: 'original',
  output: 'photo',
}

export const CAMERA_STATES = ['off', 'preparing', 'ready', 'missing'] as const
export type CameraState = (typeof CAMERA_STATES)[number]

export const UploadStateSchema = z.enum(['pending', 'uploading', 'uploaded', 'failed'])
export type UploadState = z.infer<typeof UploadStateSchema>

export const PeerSchema = z.object({
  id: z.string(),
  name: z.string(),
  ready: z.boolean(),
  joinedAt: z.number(),
  camera: z.enum(CAMERA_STATES).optional(),
})
export type Peer = z.infer<typeof PeerSchema>

export const SessionSchema = z.object({
  id: z.string(),
  fireAts: z.array(z.number()),
  settings: SettingsSchema,
  peerIds: z.array(z.string()),
  shots: z.array(z.record(z.string(), z.string())),
  clips: z.array(z.record(z.string(), z.string())).optional(),
  retakeRounds: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(MAX_SHOTS - 1),
    )
    .optional(),
  attempt: z.number().int().min(0).optional(),
})
export type Session = z.infer<typeof SessionSchema>

const ChoiceAnswersSchema = z.record(
  z.string(),
  z
    .number()
    .int()
    .min(0)
    .max(MAX_ACTIVITY_CHOICES - 1),
)
const TextAnswersSchema = z.record(z.string(), z.string().max(MAX_TEXT_ANSWER))

export const RoomStateSchema = z.object({
  code: z.string(),
  hostId: z.string(),
  peers: z.array(PeerSchema),
  settings: SettingsSchema,
  session: SessionSchema.nullable(),
  away: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  activity: z
    .object({
      id: z.enum(ACTIVITY_IDS),
      phase: z.enum(['answer', 'reveal', 'ended']),
      round: z
        .number()
        .int()
        .min(0)
        .max(MAX_ROUNDS - 1),
      peerIds: z.array(z.string()),
      targetId: z.string(),
      submittedPeerIds: z.array(z.string()),
      answers: ChoiceAnswersSchema.optional(),
      texts: TextAnswersSchema.optional(),
      history: z
        .array(z.object({ answers: ChoiceAnswersSchema.optional(), texts: TextAnswersSchema.optional() }))
        .max(MAX_ROUNDS)
        .optional(),
    })
    .nullable(),
})
export type RoomState = z.infer<typeof RoomStateSchema>

export const StrokeSchema = z.object({
  id: z.string().max(24),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().min(1).max(48),
  pts: z.array(z.number().min(0).max(1)).max(400),
})
export type Stroke = z.infer<typeof StrokeSchema>

const name = z.string().trim().min(1).max(24)

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), name }),
  z.object({ type: z.literal('rename'), name }),
  z.object({ type: z.literal('ready'), ready: z.boolean() }),
  z.object({ type: z.literal('settings'), settings: SettingsSchema.partial() }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('reset') }),
  z.object({
    type: z.literal('retake'),
    rounds: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(MAX_SHOTS - 1),
      )
      .min(1)
      .max(MAX_SHOTS),
  }),
  z.object({ type: z.literal('transfer-host'), to: z.string().min(1).max(24) }),
  z.object({ type: z.literal('camera'), state: z.enum(CAMERA_STATES) }),
  z.object({ type: z.literal('activity-start'), activity: z.enum(ACTIVITY_IDS) }),
  z.object({
    type: z.literal('activity-answer'),
    round: z
      .number()
      .int()
      .min(0)
      .max(MAX_ROUNDS - 1),
    choice: z
      .number()
      .int()
      .min(0)
      .max(MAX_ACTIVITY_CHOICES - 1),
  }),
  z.object({
    type: z.literal('activity-submit'),
    round: z
      .number()
      .int()
      .min(0)
      .max(MAX_ROUNDS - 1),
    text: z.string().trim().min(1).max(MAX_TEXT_ANSWER),
  }),
  z.object({ type: z.literal('activity-next') }),
  z.object({ type: z.literal('activity-end') }),
  z.object({ type: z.literal('cursor'), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  z.object({ type: z.literal('draw'), stroke: StrokeSchema }),
  z.object({ type: z.literal('draw-clear') }),
  z.object({ type: z.literal('signal'), to: z.string(), data: z.unknown() }),
  z.object({ type: z.literal('ping'), t: z.number() }),
])
export type ClientMessage = z.infer<typeof ClientMessageSchema>

export type ServerMessage =
  | { type: 'welcome'; you: string; token: string; room: RoomState; resumed?: boolean }
  | { type: 'room'; room: RoomState }
  | { type: 'signal'; from: string; data: unknown }
  | { type: 'cursor'; id: string; x: number; y: number }
  | { type: 'draw'; from: string; stroke: Stroke }
  | { type: 'draw-clear'; from: string }
  | { type: 'pong'; t: number; server: number }
  | { type: 'error'; code: ErrorCode; message: string }

export type ErrorCode = 'ROOM_FULL' | 'NOT_HOST' | 'BAD_MESSAGE' | 'NOT_FOUND' | 'BUSY'

export const UPLOAD_GRACE_MS = 120_000

export const PREP_MS = 600

export function scheduleShots(now: number, s: Pick<Settings, 'timer' | 'shots' | 'gap'>): number[] {
  const first = now + PREP_MS + s.timer * 1000
  return Array.from({ length: s.shots }, (_, i) => first + i * s.gap * 1000)
}

export function isSessionComplete(session: Session): boolean {
  return missingFrames(session).length === 0
}

export interface MissingFrame {
  round: number
  peerId: string
}

export function missingFrames(session: Pick<Session, 'shots' | 'peerIds'>): MissingFrame[] {
  const out: MissingFrame[] = []
  session.shots.forEach((round, i) => {
    for (const peerId of session.peerIds) if (!round[peerId]) out.push({ round: i, peerId })
  })
  return out
}

export function missingRounds(session: Pick<Session, 'shots' | 'peerIds'>): number[] {
  return [...new Set(missingFrames(session).map((m) => m.round))]
}

export function sessionEndsAt(session: Pick<Session, 'fireAts'>): number {
  return session.fireAts.reduce((max, at) => Math.max(max, at), 0)
}

export function planRetake(now: number, session: Session, rounds: number[]): Session | null {
  const wanted = new Set(missingRounds(session))
  const targets = [...new Set(rounds)].filter((r) => wanted.has(r)).sort((a, b) => a - b)
  if (!targets.length) return null
  const s = session.settings
  const times = scheduleShots(now, { timer: s.timer, gap: s.gap, shots: targets.length })
  const fireAts = [...session.fireAts]
  targets.forEach((round, i) => {
    fireAts[round] = times[i]!
  })
  return { ...session, fireAts, retakeRounds: targets, attempt: (session.attempt ?? 0) + 1 }
}
