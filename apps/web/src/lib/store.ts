import {
  type ActivityId,
  type CameraState,
  type ClientMessage,
  DEFAULT_SETTINGS,
  planRetake,
  type RoomState,
  type ServerMessage,
  type Settings,
  type Stroke,
  scheduleShots,
  type UploadState,
} from '@groupshot/protocol'
import { create } from 'zustand'
import { getTemplate } from '@/templates'
import { uploadShot, wsUrl } from './api'
import { Mesh } from './mesh'
import { forgetRoom, savedRoom, saveRoom, touchRoom } from './rejoin'
import { createUploadQueue, type JobState } from './upload-queue'

export const SOLO_ID = 'me'

export const uploadKey = (kind: 'photo' | 'clip', sessionId: string, round: number) => `${kind}:${sessionId}:${round}`

const UPLOAD_STATES: Record<JobState, UploadState> = {
  queued: 'pending',
  uploading: 'uploading',
  uploaded: 'uploaded',
  failed: 'failed',
}

type Status = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'closed'

interface BoothState {
  mode: 'solo' | 'room'
  status: Status
  error: string | null
  me: string
  room: RoomState | null
  remoteStreams: Record<string, MediaStream>
  localShots: Record<string, Blob>
  localClips: Record<string, ImageBitmap[]>
  offset: number
  cursors: Record<string, { x: number; y: number; at: number }>
  uploads: Record<string, UploadState>
  uploadError: string | null

  joinSolo(name: string): void
  connect(code: string, name: string): void
  rejoin(): void
  leave(): void
  setLocalStream(stream: MediaStream | null): void
  updateSettings(patch: Partial<Settings>): void
  setReady(ready: boolean): void
  rename(name: string): void
  start(): void
  reset(): void
  startActivity(activity: ActivityId): void
  answerActivity(round: number, choice: number): void
  submitActivityText(round: number, text: string): void
  sendCursor(x: number, y: number): void
  sendStroke(stroke: Stroke): void
  clearCanvas(): void
  nextActivity(): void
  endActivity(): void
  submitShot(sessionId: string, round: number, blob: Blob): void
  submitClip(sessionId: string, round: number, frames: ImageBitmap[], sprite: Blob): void
  retryUploads(): void
  retake(rounds: number[]): void
  transferHost(peerId: string): void
  setCamera(state: CameraState): void
  clearError(): void
}

export type DrawEvent = { type: 'draw'; from: string; stroke: Stroke } | { type: 'draw-clear'; from: string }
const drawListeners = new Set<(e: DrawEvent) => void>()
export function onDraw(fn: (e: DrawEvent) => void) {
  drawListeners.add(fn)
  return () => {
    drawListeners.delete(fn)
  }
}

let ws: WebSocket | null = null
let mesh: Mesh | null = null
let token = ''
let localStream: MediaStream | null = null
let retry = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined
let wanted: { code: string; name: string } | null = null
let lastCamera: CameraState = 'off'
const offsets: number[] = []
const uploads = createUploadQueue()

function send(msg: ClientMessage) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

export const serverNow = () => Date.now() + useBooth.getState().offset

export const useBooth = create<BoothState>((set, get) => {
  function syncClock() {
    offsets.length = 0
    for (let i = 0; i < 5; i++) setTimeout(() => send({ type: 'ping', t: Date.now() }), i * 150)
  }

  function open() {
    if (!wanted) return
    const { code, name } = wanted
    set({ status: retry ? 'reconnecting' : 'connecting' })
    const resume = token || savedRoom(code)?.token || ''
    const q = new URLSearchParams({ name })
    if (resume) q.set('resume', resume)
    const socket = new WebSocket(wsUrl(`/ws/${code}?${q}`))
    ws = socket

    socket.onopen = () => {
      retry = 0
      syncClock()
    }
    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as ServerMessage
      switch (msg.type) {
        case 'welcome':
          token = msg.token
          saveRoom({ code, name, token })
          if (lastCamera !== 'off') send({ type: 'camera', state: lastCamera })
          if (!msg.resumed) uploads.clear()
          else void uploads.retryAll()
          mesh?.close()
          mesh = new Mesh(
            msg.you,
            (to, data) => send({ type: 'signal', to, data }),
            (id, stream) =>
              set((s) => {
                const next = { ...s.remoteStreams }
                if (stream) next[id] = stream
                else delete next[id]
                return { remoteStreams: next }
              }),
          )
          mesh.setStream(localStream)
          mesh.sync(msg.room.peers.map((p) => p.id))
          set({ me: msg.you, room: msg.room, status: 'live', error: null })
          return
        case 'room':
          touchRoom()
          mesh?.sync(msg.room.peers.map((p) => p.id))
          set((s) => {
            const here = new Set(msg.room.peers.map((p) => p.id))
            return {
              room: msg.room,
              cursors: Object.fromEntries(Object.entries(s.cursors).filter(([id]) => here.has(id))),
            }
          })
          return
        case 'cursor':
          set((s) => ({ cursors: { ...s.cursors, [msg.id]: { x: msg.x, y: msg.y, at: Date.now() } } }))
          return
        case 'draw':
        case 'draw-clear':
          for (const fn of drawListeners) fn(msg)
          return
        case 'signal':
          void mesh?.handle(msg.from, msg.data as never)
          return
        case 'pong': {
          const now = Date.now()
          offsets.push(msg.server - (msg.t + now) / 2)
          const sorted = [...offsets].sort((a, b) => a - b)
          set({ offset: sorted[Math.floor(sorted.length / 2)] ?? 0 })
          return
        }
        case 'error':
          set({ error: msg.message })
          if (msg.code === 'ROOM_FULL') wanted = null
          return
      }
    }
    socket.onclose = (e) => {
      if (ws !== socket) return
      ws = null
      mesh?.close()
      mesh = null
      set({ remoteStreams: {} })
      if (e.code === 4000) {
        wanted = null
        set({ status: 'closed', error: 'You joined this room from another tab, so this one stepped out.' })
        return
      }
      if (!wanted || e.code === 4001 || e.code === 4004) {
        set({ status: 'closed' })
        if (e.code === 4004) {
          forgetRoom()
          set({ error: 'That room has closed. Start a new one?' })
        }
        return
      }
      retry++
      if (retry > 6) {
        set({ status: 'closed', error: 'Lost the connection to the booth. Check your internet and rejoin.' })
        return
      }
      set({ status: 'reconnecting' })
      retryTimer = setTimeout(open, Math.min(8000, 500 * 2 ** retry))
    }
  }

  function enqueueUpload(code: string, kind: 'photo' | 'clip', sessionId: string, round: number, blob: Blob) {
    const key = uploadKey(kind, sessionId, round)
    void uploads.enqueue({
      key,
      run: async () => {
        await uploadShot(code, token, sessionId, round, blob, kind)
      },
      onState: (state, err) =>
        set((s) => ({
          uploads: { ...s.uploads, [key]: UPLOAD_STATES[state] },
          uploadError: state === 'failed' ? (err?.message ?? 'Upload failed.') : s.uploadError,
        })),
    })
  }

  function patchSolo(fn: (room: RoomState) => RoomState) {
    const room = get().room
    if (room) set({ room: fn(room) })
  }

  return {
    mode: 'solo',
    status: 'idle',
    error: null,
    me: SOLO_ID,
    room: null,
    remoteStreams: {},
    localShots: {},
    localClips: {},
    offset: 0,
    cursors: {},
    uploads: {},
    uploadError: null,

    joinSolo(name) {
      get().leave()
      set({
        mode: 'solo',
        status: 'live',
        me: SOLO_ID,
        offset: 0,
        room: {
          code: 'SOLO',
          hostId: SOLO_ID,
          peers: [{ id: SOLO_ID, name, ready: true, joinedAt: Date.now() }],
          settings: {
            ...DEFAULT_SETTINGS,
            scene: 'original',
            shots: getTemplate(DEFAULT_SETTINGS.templateId).slots.length,
          },
          session: null,
          activity: null,
        },
      })
    },

    connect(code, name) {
      get().leave()
      wanted = { code, name }
      retry = 0
      set({ mode: 'room', error: null, room: null })
      open()
    },

    rejoin() {
      const saved = savedRoom()
      if (!wanted && saved) wanted = { code: saved.code, name: saved.name }
      if (!wanted || ws) return
      clearTimeout(retryTimer)
      retry = 0
      set({ error: null })
      open()
    },

    leave() {
      wanted = null
      token = ''
      clearTimeout(retryTimer)
      uploads.clear()
      const socket = ws
      ws = null
      socket?.close()
      mesh?.close()
      mesh = null
      set({
        status: 'idle',
        room: null,
        remoteStreams: {},
        localShots: {},
        localClips: {},
        cursors: {},
        uploads: {},
        uploadError: null,
      })
    },

    setLocalStream(stream) {
      localStream = stream
      mesh?.setStream(stream)
    },

    updateSettings(patch) {
      if (patch.templateId) patch.shots = getTemplate(patch.templateId).slots.length
      if (get().mode === 'solo') patchSolo((r) => ({ ...r, settings: { ...r.settings, ...patch } }))
      else send({ type: 'settings', settings: patch })
    },

    setReady(ready) {
      if (get().mode === 'room') send({ type: 'ready', ready })
    },

    rename(name) {
      if (get().mode === 'solo') patchSolo((r) => ({ ...r, peers: r.peers.map((p) => ({ ...p, name })) }))
      else send({ type: 'rename', name })
    },

    start() {
      if (get().mode === 'room') return send({ type: 'start' })
      patchSolo((r) => ({
        ...r,
        session: {
          id: crypto.randomUUID().slice(0, 8),
          fireAts: scheduleShots(Date.now(), r.settings),
          settings: r.settings,
          peerIds: [SOLO_ID],
          shots: Array.from({ length: r.settings.shots }, () => ({})),
        },
      }))
    },

    reset() {
      uploads.clear()
      set({ localShots: {}, localClips: {}, uploads: {}, uploadError: null })
      if (get().mode === 'room') return send({ type: 'reset' })
      patchSolo((r) => ({ ...r, session: null }))
    },

    startActivity(activity) {
      if (get().mode === 'room') send({ type: 'activity-start', activity })
    },

    answerActivity(round, choice) {
      if (get().mode === 'room') send({ type: 'activity-answer', round, choice })
    },

    submitActivityText(round, text) {
      if (get().mode === 'room') send({ type: 'activity-submit', round, text })
    },

    sendCursor(x, y) {
      if (get().mode === 'room') send({ type: 'cursor', x, y })
    },

    sendStroke(stroke) {
      if (get().mode === 'room') send({ type: 'draw', stroke })
    },

    clearCanvas() {
      if (get().mode === 'room') send({ type: 'draw-clear' })
    },

    nextActivity() {
      if (get().mode === 'room') send({ type: 'activity-next' })
    },

    endActivity() {
      if (get().mode === 'room') send({ type: 'activity-end' })
    },

    submitShot(sessionId, round, blob) {
      set((s) => ({ localShots: { ...s.localShots, [`${sessionId}:${round}`]: blob } }))
      const { mode, room, me } = get()
      if (mode === 'solo') {
        return patchSolo((r) => {
          if (!r.session || r.session.id !== sessionId) return r
          const shots = r.session.shots.map((slot, i) => (i === round ? { ...slot, [me]: 'local' } : slot))
          return { ...r, session: { ...r.session, shots } }
        })
      }
      if (!room) return
      enqueueUpload(room.code, 'photo', sessionId, round, blob)
    },

    submitClip(sessionId, round, frames, sprite) {
      set((s) => ({ localClips: { ...s.localClips, [`${sessionId}:${round}`]: frames } }))
      const { mode, room } = get()
      if (mode === 'solo' || !room) return
      enqueueUpload(room.code, 'clip', sessionId, round, sprite)
    },

    retryUploads() {
      set({ uploadError: null })
      void uploads.retryAll()
    },

    retake(rounds) {
      if (get().mode === 'room') return send({ type: 'retake', rounds })
      patchSolo((r) => {
        const next = r.session && planRetake(Date.now(), r.session, rounds)
        return next ? { ...r, session: next } : r
      })
    },

    transferHost(peerId) {
      if (get().mode === 'room') send({ type: 'transfer-host', to: peerId })
    },

    setCamera(state) {
      if (state === lastCamera) return
      lastCamera = state
      if (get().mode === 'room') send({ type: 'camera', state })
    },

    clearError: () => set({ error: null }),
  }
})
