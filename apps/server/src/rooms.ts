import {
  type CameraState,
  ClientMessageSchema,
  DEFAULT_SETTINGS,
  GAMES,
  isSessionComplete,
  MAX_PEERS,
  MAX_SHOTS,
  type Peer,
  planRetake,
  type RoomState,
  roundCount,
  type ServerMessage,
  SettingsSchema,
  scheduleShots,
  sessionEndsAt,
  UPLOAD_GRACE_MS,
} from '@groupshot/protocol'
import { type BlobStore, MemoryBlobStore, MemoryStats } from './storage'

export interface Socket {
  send(data: string): void
  close(code?: number, reason?: string): void
}

interface Member extends Peer {
  token: string
  socket: Socket
}

interface Away {
  id: string
  name: string
  joinedAt: number
  leftAt: number
}

export interface Room {
  code: string
  hostId: string
  members: Map<string, Member>
  state: Omit<RoomState, 'peers' | 'hostId' | 'code'>
  activityAnswers: Record<string, number>
  activityTexts: Record<string, string>
  touchedAt: number
  away: Map<string, Away>
  usage: { requests: number; bytes: number }
  keeps: number
}

const WORDS = [
  'SNAP',
  'POSE',
  'FLASH',
  'GRIN',
  'BLINK',
  'CHEEK',
  'SMIRK',
  'WINK',
  'DISCO',
  'PEACE',
  'MANGO',
  'LEMON',
  'TACO',
  'PIXEL',
  'COMET',
  'GLOW',
]
const ROOM_TTL_MS = 1000 * 60 * 60 * 6
export const MAX_SHOT_BYTES = 4 * 1024 * 1024
export const AWAY_MS = 90_000
export const MAX_ROOM_UPLOADS = MAX_PEERS * MAX_SHOTS * 2 * 3
export const MAX_ROOM_UPLOAD_BYTES = 96 * 1024 * 1024
export const MAX_KEEPS_PER_ROOM = 24
const PHOTO_TYPES = /^image\/(jpeg|webp|png)$/
const CLIP_SPRITE_TYPES = /^image\/(jpeg|webp|png)$/

export type UploadResult =
  | { url: string }
  | { error: string; status: 400 | 401 | 409 | 410 | 413 | 415 | 429; url?: string }

export class RoomRegistry {
  rooms = new Map<string, Room>()

  constructor(
    private now: () => number = Date.now,
    readonly blobs: BlobStore = new MemoryBlobStore(),
    readonly stats = new MemoryStats(),
  ) {}

  live() {
    let people = 0
    let rooms = 0
    for (const room of this.rooms.values()) {
      if (!room.members.size) continue
      rooms++
      people += room.members.size
    }
    return { rooms, people }
  }

  create(): Room {
    let code: string
    do {
      const word = WORDS[Math.floor(Math.random() * WORDS.length)]
      code = `${word}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`
    } while (this.rooms.has(code))
    const room: Room = {
      code,
      hostId: '',
      members: new Map(),
      state: { settings: { ...DEFAULT_SETTINGS }, session: null, activity: null },
      activityAnswers: {},
      activityTexts: {},
      touchedAt: this.now(),
      away: new Map(),
      usage: { requests: 0, bytes: 0 },
      keeps: 0,
    }
    this.rooms.set(code, room)
    return room
  }

  get(code: string) {
    return this.rooms.get(code.toUpperCase())
  }

  sweep() {
    const cutoff = this.now() - ROOM_TTL_MS
    for (const [code, room] of this.rooms) {
      if (room.members.size === 0 && room.touchedAt < cutoff) {
        this.rooms.delete(code)
        void this.blobs.deletePrefix(`${code}/`)
      }
    }
  }

  snapshot(room: Room): RoomState {
    this.pruneAway(room)
    return {
      code: room.code,
      hostId: room.hostId,
      peers: [...room.members.values()].map(({ id, name, ready, joinedAt, camera }) => ({
        id,
        name,
        ready,
        joinedAt,
        camera,
      })),
      away: [...room.away.values()].map(({ id, name }) => ({ id, name })),
      ...room.state,
    }
  }

  private pruneAway(room: Room) {
    const cutoff = this.now() - AWAY_MS
    for (const [token, a] of room.away) if (a.leftAt < cutoff) room.away.delete(token)
  }

  broadcast(room: Room, msg: ServerMessage) {
    const data = JSON.stringify(msg)
    for (const m of room.members.values()) m.socket.send(data)
  }

  private sync(room: Room) {
    room.touchedAt = this.now()
    this.broadcast(room, { type: 'room', room: this.snapshot(room) })
  }

  join(room: Room, socket: Socket, name: string, resume?: string): Member | null {
    if (resume) {
      const live = [...room.members.values()].find((m) => m.token === resume)
      if (live) {
        const stale = live.socket
        live.socket = socket
        live.name = name
        stale.close(4000, 'replaced')
        send(socket, { type: 'welcome', you: live.id, token: live.token, room: this.snapshot(room), resumed: true })
        this.sync(room)
        return live
      }
      this.pruneAway(room)
      const away = room.away.get(resume)
      if (away && room.members.size < MAX_PEERS) {
        room.away.delete(resume)
        const member: Member = {
          id: away.id,
          token: resume,
          name,
          ready: false,
          joinedAt: away.joinedAt,
          camera: 'off',
          socket,
        }
        room.members.set(member.id, member)
        if (!room.hostId || !room.members.has(room.hostId)) room.hostId = member.id
        const session = room.state.session
        if (session && !session.peerIds.includes(member.id)) {
          const contributed = session.shots.some((r) => r[member.id])
          if (contributed || !this.isFinished(room)) session.peerIds = [...session.peerIds, member.id]
        }
        send(socket, { type: 'welcome', you: member.id, token: member.token, room: this.snapshot(room), resumed: true })
        this.sync(room)
        return member
      }
    }
    if (room.members.size >= MAX_PEERS) {
      send(socket, { type: 'error', code: 'ROOM_FULL', message: `This room already has ${MAX_PEERS} people.` })
      socket.close(4001, 'room full')
      return null
    }
    const member: Member = {
      id: crypto.randomUUID().slice(0, 8),
      token: crypto.randomUUID(),
      name,
      ready: false,
      joinedAt: this.now(),
      camera: 'off',
      socket,
    }
    room.members.set(member.id, member)
    if (!room.hostId || !room.members.has(room.hostId)) room.hostId = member.id
    send(socket, { type: 'welcome', you: member.id, token: member.token, room: this.snapshot(room) })
    this.sync(room)
    return member
  }

  leave(room: Room, memberId: string, socket?: Socket) {
    const member = room.members.get(memberId)
    if (!member || (socket && member.socket !== socket)) return
    room.members.delete(memberId)
    room.away.set(member.token, { id: member.id, name: member.name, joinedAt: member.joinedAt, leftAt: this.now() })
    if (room.hostId === memberId) {
      const next = [...room.members.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0]
      room.hostId = next?.id ?? ''
    }
    const session = room.state.session
    if (session?.peerIds.includes(memberId)) {
      session.peerIds = session.peerIds.filter((id) => id !== memberId)
    }
    if (room.state.activity && room.state.activity.phase !== 'ended') {
      room.state.activity = { ...room.state.activity, phase: 'ended' }
      room.activityAnswers = {}
      room.activityTexts = {}
    }
    this.sync(room)
  }

  handle(room: Room, member: Member, raw: string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return send(member.socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Not JSON.' })
    }
    const result = ClientMessageSchema.safeParse(parsed)
    if (!result.success) {
      return send(member.socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Unknown message.' })
    }
    const msg = result.data
    const isHost = room.hostId === member.id
    const hostOnly = () =>
      send(member.socket, { type: 'error', code: 'NOT_HOST', message: 'Only the host can do that.' })

    switch (msg.type) {
      case 'ping':
        return send(member.socket, { type: 'pong', t: msg.t, server: this.now() })
      case 'hello':
      case 'rename':
        member.name = msg.name
        return this.sync(room)
      case 'ready':
        member.ready = msg.ready
        return this.sync(room)
      case 'camera':
        member.camera = msg.state as CameraState
        if (msg.state !== 'ready') member.ready = false
        return this.sync(room)
      case 'transfer-host': {
        if (!isHost) return hostOnly()
        if (!room.members.has(msg.to) || msg.to === member.id) {
          return send(member.socket, { type: 'error', code: 'NOT_FOUND', message: 'That person is not in the room.' })
        }
        room.hostId = msg.to
        return this.sync(room)
      }
      case 'retake': {
        if (!isHost) return hostOnly()
        const session = room.state.session
        if (!session || this.now() <= sessionEndsAt(session)) {
          return send(member.socket, { type: 'error', code: 'BUSY', message: 'Wait for the current photos to finish.' })
        }
        const next = planRetake(this.now(), session, msg.rounds)
        if (!next) {
          return send(member.socket, { type: 'error', code: 'BUSY', message: 'Those frames are already filled.' })
        }
        room.state.session = next
        return this.sync(room)
      }
      case 'settings': {
        if (!isHost) return hostOnly()
        const next = SettingsSchema.safeParse({ ...room.state.settings, ...msg.settings })
        if (next.success) room.state.settings = next.data
        return this.sync(room)
      }
      case 'start': {
        if (!isHost) return hostOnly()
        if (room.state.activity && room.state.activity.phase !== 'ended') {
          return send(member.socket, {
            type: 'error',
            code: 'BUSY',
            message: 'Finish the current activity before starting a photo round.',
          })
        }
        if (room.state.session && !this.isFinished(room)) {
          return send(member.socket, { type: 'error', code: 'BUSY', message: 'A countdown is already running.' })
        }
        const settings = room.state.settings
        void this.blobs.deletePrefix(`${room.code}/`)
        room.usage = { requests: 0, bytes: 0 }
        room.state.session = {
          id: crypto.randomUUID().slice(0, 8),
          fireAts: scheduleShots(this.now(), settings),
          settings,
          peerIds: [...room.members.keys()],
          shots: Array.from({ length: settings.shots }, () => ({})),
          clips: settings.output === 'photo' ? undefined : Array.from({ length: settings.shots }, () => ({})),
        }
        for (const m of room.members.values()) m.ready = false
        return this.sync(room)
      }
      case 'reset':
        if (!isHost) return hostOnly()
        room.state.session = null
        void this.blobs.deletePrefix(`${room.code}/`)
        return this.sync(room)
      case 'activity-start': {
        if (!isHost) return hostOnly()
        if (room.members.size < 2) {
          return send(member.socket, {
            type: 'error',
            code: 'BUSY',
            message: 'Invite at least one friend before starting a game.',
          })
        }
        if (room.state.session && !this.isFinished(room)) {
          return send(member.socket, {
            type: 'error',
            code: 'BUSY',
            message: 'Finish the photo round before starting an activity.',
          })
        }
        if (room.state.activity && room.state.activity.phase !== 'ended') {
          return send(member.socket, { type: 'error', code: 'BUSY', message: 'An activity is already running.' })
        }
        const peerIds = [...room.members.keys()]
        room.activityAnswers = {}
        room.activityTexts = {}
        this.stats.bump('games')
        room.state.activity = {
          id: msg.activity,
          phase: 'answer',
          round: 0,
          peerIds,
          targetId: peerIds[0]!,
          submittedPeerIds: [],
          history: [],
        }
        return this.sync(room)
      }
      case 'activity-answer':
      case 'activity-submit': {
        const activity = room.state.activity
        const kind = activity ? GAMES[activity.id].kind : null
        const accepts = msg.type === 'activity-answer' ? kind === 'quiz' || kind === 'choice' : kind === 'text'
        if (!activity || !accepts || activity.phase !== 'answer') {
          return send(member.socket, {
            type: 'error',
            code: 'BUSY',
            message: 'This game is not taking answers right now.',
          })
        }
        if (activity.round !== msg.round || !activity.peerIds.includes(member.id)) {
          return send(member.socket, {
            type: 'error',
            code: 'BAD_MESSAGE',
            message: 'That answer does not match the current round.',
          })
        }
        if (activity.submittedPeerIds.includes(member.id)) {
          return send(member.socket, { type: 'error', code: 'BUSY', message: 'Your answer is already in.' })
        }
        if (msg.type === 'activity-answer') room.activityAnswers[member.id] = msg.choice
        else room.activityTexts[member.id] = msg.text
        const submittedPeerIds = [...activity.submittedPeerIds, member.id]
        if (submittedPeerIds.length === activity.peerIds.length) {
          const revealed =
            msg.type === 'activity-answer'
              ? { answers: { ...room.activityAnswers } }
              : { texts: { ...room.activityTexts } }
          room.state.activity = {
            ...activity,
            phase: 'reveal',
            submittedPeerIds,
            ...revealed,
            history: [...(activity.history ?? []), revealed],
          }
        } else {
          room.state.activity = { ...activity, submittedPeerIds }
        }
        return this.sync(room)
      }
      case 'activity-next': {
        if (!isHost) return hostOnly()
        const activity = room.state.activity
        const kind = activity ? GAMES[activity.id].kind : null
        const waitsForReveal = kind === 'quiz' || kind === 'choice' || kind === 'text'
        if (
          !activity ||
          kind === 'draw' ||
          activity.phase === 'ended' ||
          (waitsForReveal ? activity.phase !== 'reveal' : activity.phase !== 'answer')
        ) {
          return send(member.socket, {
            type: 'error',
            code: 'BUSY',
            message: 'Wait for everyone to answer before moving on.',
          })
        }
        const nextRound = activity.round + 1
        if (nextRound >= roundCount(activity.id, activity.peerIds.length)) {
          room.state.activity = { ...activity, phase: 'ended' }
        } else {
          room.activityAnswers = {}
          room.activityTexts = {}
          const rotates = kind === 'quiz' || activity.id === 'truth-or-dare'
          room.state.activity = {
            id: activity.id,
            phase: 'answer',
            round: nextRound,
            peerIds: activity.peerIds,
            targetId: rotates ? activity.peerIds[nextRound % activity.peerIds.length]! : activity.targetId,
            submittedPeerIds: [],
            history: activity.history,
          }
        }
        return this.sync(room)
      }
      case 'activity-end': {
        if (!isHost) return hostOnly()
        const activity = room.state.activity
        if (!activity || activity.phase === 'ended') return
        room.state.activity = { ...activity, phase: 'ended' }
        room.activityAnswers = {}
        room.activityTexts = {}
        return this.sync(room)
      }
      case 'cursor':
        return this.relay(room, member.id, { type: 'cursor', id: member.id, x: msg.x, y: msg.y })
      case 'draw':
      case 'draw-clear': {
        if (room.state.activity?.id !== 'draw-together' || room.state.activity.phase === 'ended') return
        return this.relay(
          room,
          member.id,
          msg.type === 'draw'
            ? { type: 'draw', from: member.id, stroke: msg.stroke }
            : { type: 'draw-clear', from: member.id },
        )
      }
      case 'signal': {
        const target = room.members.get(msg.to)
        if (target) send(target.socket, { type: 'signal', from: member.id, data: msg.data })
        return
      }
    }
  }

  private relay(room: Room, fromId: string, msg: ServerMessage) {
    const data = JSON.stringify(msg)
    for (const m of room.members.values()) if (m.id !== fromId) m.socket.send(data)
  }

  private isFinished(room: Room) {
    const s = room.state.session
    if (!s) return true
    return this.now() > sessionEndsAt(s) + UPLOAD_GRACE_MS || isSessionComplete(s)
  }

  async addShot(
    room: Room,
    token: string,
    sessionId: string,
    round: number,
    bytes: Uint8Array<ArrayBuffer>,
    type: string,
    kind: 'photo' | 'clip' = 'photo',
  ): Promise<UploadResult> {
    const member = [...room.members.values()].find((m) => m.token === token)
    if (!member) return { error: 'Unknown peer.', status: 401 }
    const session = room.state.session
    if (!session || session.id !== sessionId) return { error: 'Session is over.', status: 409 }
    if (!Number.isInteger(round) || round < 0) return { error: 'Bad round.', status: 400 }
    const slots = kind === 'clip' ? session.clips : session.shots
    if (!slots) return { error: 'This session does not take clips.', status: 400 }
    const slot = slots[round]
    if (!slot) return { error: 'Bad round.', status: 400 }
    if (this.now() > sessionEndsAt(session) + UPLOAD_GRACE_MS) {
      return { error: 'Too late for this session.', status: 410 }
    }
    if (room.usage.requests >= MAX_ROOM_UPLOADS) {
      return { error: 'This room has uploaded too much. Start a new round.', status: 429 }
    }
    room.usage.requests++
    if (!bytes.byteLength) return { error: 'Empty upload.', status: 400 }
    if (bytes.byteLength > MAX_SHOT_BYTES) return { error: 'Shot too large.', status: 413 }
    if (kind === 'photo' && !PHOTO_TYPES.test(type)) return { error: 'Photos must be JPEG, PNG or WebP.', status: 415 }
    if (kind === 'clip' && !CLIP_SPRITE_TYPES.test(type)) {
      return { error: 'Clip sprites must be JPEG, PNG or WebP.', status: 415 }
    }
    const existing = slot[member.id]
    if (existing) return { error: 'Already uploaded.', status: 409, url: existing }
    if (room.usage.bytes + bytes.byteLength > MAX_ROOM_UPLOAD_BYTES) {
      return { error: 'This room has uploaded too much. Start a new round.', status: 429 }
    }

    const id = `${room.code}-${session.id}-${round}-${member.id}${kind === 'clip' ? '-clip' : ''}`
    const key = `${room.code}/${id}`
    await this.blobs.put(key, bytes, type, ROOM_TTL_MS)
    if (room.state.session?.id !== session.id) {
      await this.blobs.delete(key)
      return { error: 'Session is over.', status: 409 }
    }
    const current = (kind === 'clip' ? room.state.session?.clips : room.state.session?.shots)?.[round]
    if (!current) return { error: 'Session is over.', status: 409 }
    if (current[member.id]) return { error: 'Already uploaded.', status: 409, url: current[member.id] }
    room.usage.bytes += bytes.byteLength
    current[member.id] = `/api/shots/${room.code}/${id}`
    if (kind === 'photo') {
      this.stats.bump('photos')
      const live = room.state.session!
      if (isSessionComplete(live)) this.stats.bump('strips', live.peerIds.length)
    }
    this.sync(room)
    return { url: current[member.id]! }
  }

  allowKeep(code: string | undefined) {
    if (!code) return true
    const room = this.get(code)
    if (!room) return true
    if (room.keeps >= MAX_KEEPS_PER_ROOM) return false
    room.keeps++
    return true
  }
}

function send(socket: Socket, msg: ServerMessage) {
  socket.send(JSON.stringify(msg))
}
