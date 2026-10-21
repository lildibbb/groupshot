type Signal = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }

import { apiUrl } from './api'

const STATIC_ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  ...(import.meta.env.VITE_TURN_URL
    ? [
        {
          urls: import.meta.env.VITE_TURN_URL as string,
          username: import.meta.env.VITE_TURN_USER as string,
          credential: import.meta.env.VITE_TURN_PASS as string,
        },
      ]
    : []),
]

let ice: RTCIceServer[] = STATIC_ICE
let iceLoad: Promise<void> | null = null

function loadIce() {
  iceLoad ??= fetch(apiUrl('/api/ice'), { signal: AbortSignal.timeout(4000) })
    .then((r) => (r.ok ? (r.json() as Promise<{ iceServers?: RTCIceServer[] }>) : null))
    .then((body) => {
      if (body?.iceServers?.length) ice = [...STATIC_ICE, ...body.iceServers]
    })
    .catch(() => {})
  return iceLoad
}

export class Mesh {
  private pcs = new Map<
    string,
    { pc: RTCPeerConnection; polite: boolean; makingOffer: boolean; ignoreOffer: boolean; queue: Promise<void> }
  >()
  private stream: MediaStream | null = null

  constructor(
    private me: string,
    private send: (to: string, data: Signal) => void,
    private onStream: (peerId: string, stream: MediaStream | null) => void,
  ) {}

  setStream(stream: MediaStream | null) {
    this.stream = stream
    for (const { pc } of this.pcs.values()) this.attach(pc)
  }

  private attach(pc: RTCPeerConnection) {
    const track = this.stream?.getVideoTracks()[0] ?? null
    const video = pc
      .getTransceivers()
      .filter((t) => t.currentDirection !== 'stopped' && t.receiver.track.kind === 'video')
    if (!video.length) {
      if (track && this.stream) pc.addTrack(track, this.stream)
      return
    }
    for (const t of video) {
      if (t.sender.track !== track) void t.sender.replaceTrack(track).catch(() => {})
      if (!track) continue
      if (t.direction === 'recvonly') t.direction = 'sendrecv'
      else if (t.direction === 'inactive') t.direction = 'sendonly'
    }
  }

  sync(peerIds: string[]) {
    this.latest = peerIds
    void loadIce().then(() => this.syncNow(this.latest))
  }

  private latest: string[] = []

  private syncNow(peerIds: string[]) {
    const wanted = new Set(peerIds.filter((id) => id !== this.me))
    for (const id of this.pcs.keys()) if (!wanted.has(id)) this.drop(id)
    for (const id of wanted) if (!this.pcs.has(id)) this.open(id)
  }

  private open(id: string) {
    const pc = new RTCPeerConnection({ iceServers: ice })
    const entry = { pc, polite: this.me < id, makingOffer: false, ignoreOffer: false, queue: Promise.resolve() }
    this.pcs.set(id, entry)

    const track = this.stream?.getVideoTracks()[0]
    if (track && this.stream) pc.addTrack(track, this.stream)
    else pc.addTransceiver('video', { direction: 'sendrecv' })

    pc.ontrack = (e) => this.onStream(id, e.streams[0] ?? new MediaStream([e.track]))
    pc.onicecandidate = (e) => e.candidate && this.send(id, { candidate: e.candidate.toJSON() })
    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true
        await pc.setLocalDescription()
        if (pc.localDescription) this.send(id, { sdp: pc.localDescription.toJSON() })
      } finally {
        entry.makingOffer = false
      }
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce()
    }
  }

  handle(from: string, data: Signal) {
    if (!this.pcs.has(from)) this.open(from)
    const entry = this.pcs.get(from)
    if (!entry) return Promise.resolve()
    entry.queue = entry.queue.then(() => this.apply(entry, from, data))
    return entry.queue
  }

  private async apply(
    entry: { pc: RTCPeerConnection; polite: boolean; makingOffer: boolean; ignoreOffer: boolean },
    from: string,
    data: Signal,
  ) {
    const { pc, polite } = entry
    try {
      if (data.sdp) {
        const collision = data.sdp.type === 'offer' && (entry.makingOffer || pc.signalingState !== 'stable')
        entry.ignoreOffer = !polite && collision
        if (entry.ignoreOffer) return
        await pc.setRemoteDescription(data.sdp)
        if (data.sdp.type === 'offer') {
          this.attach(pc)
          await pc.setLocalDescription()
          if (pc.localDescription) this.send(from, { sdp: pc.localDescription.toJSON() })
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate)
        } catch (err) {
          if (!entry.ignoreOffer) throw err
        }
      }
    } catch (err) {
      console.warn('[mesh]', err)
    }
  }

  private drop(id: string) {
    this.pcs.get(id)?.pc.close()
    this.pcs.delete(id)
    this.onStream(id, null)
  }

  close() {
    for (const id of [...this.pcs.keys()]) this.drop(id)
  }
}
