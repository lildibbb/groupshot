import { describe, expect, it } from 'bun:test'
import { PREP_MS, type ServerMessage, UPLOAD_GRACE_MS } from '@groupshot/protocol'
import { createApp } from './app'
import { AWAY_MS, MAX_ROOM_UPLOADS, RoomRegistry, type Socket } from './rooms'
import { type BlobStore, MemoryBlobStore } from './storage'

function fakeSocket() {
  const inbox: ServerMessage[] = []
  let closed = false
  const socket: Socket = {
    send: (d) => inbox.push(JSON.parse(d)),
    close: () => {
      closed = true
    },
  }
  return { socket, inbox, last: () => inbox.at(-1), closed: () => closed }
}

const jpeg = () => new Uint8Array(8)

function setup(opts: { shots?: number; blobs?: BlobStore } = {}) {
  let now = 1_000_000
  const clock = {
    get: () => now,
    advance: (ms: number) => {
      now += ms
    },
  }
  const reg = new RoomRegistry(clock.get, opts.blobs)
  const room = reg.create()
  const hostSock = fakeSocket()
  const host = reg.join(room, hostSock.socket, 'Ana')!
  const guestSock = fakeSocket()
  const guest = reg.join(room, guestSock.socket, 'Ben')!
  reg.handle(room, host, JSON.stringify({ type: 'settings', settings: { shots: opts.shots ?? 2 } }))
  reg.handle(room, host, JSON.stringify({ type: 'start' }))
  return { reg, room, host, guest, hostSock, guestSock, clock, sid: room.state.session!.id }
}

describe('uploads', () => {
  it('writes the blob before broadcasting its url', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const inner = new MemoryBlobStore()
    const slow: BlobStore = {
      put: async (...args) => {
        await gate
        return inner.put(...args)
      },
      get: (k) => inner.get(k),
      delete: (k) => inner.delete(k),
      deletePrefix: (p) => inner.deletePrefix(p),
      sweep: () => inner.sweep(),
    }
    const { reg, room, host, guestSock, sid } = setup({ blobs: slow })
    const before = guestSock.inbox.length
    const pending = reg.addShot(room, host.token, sid, 0, jpeg(), 'image/jpeg')
    await Promise.resolve()
    expect(guestSock.inbox.length).toBe(before)
    expect(room.state.session!.shots[0]![host.id]).toBeUndefined()
    release()
    const result = await pending
    expect(result).toHaveProperty('url')
    const key = (result as { url: string }).url.replace('/api/shots/', '')
    expect(await inner.get(key)).not.toBeNull()
    expect(guestSock.inbox.length).toBe(before + 1)
  })

  it('rejects bad rounds, wrong types, and uploads after the grace period', async () => {
    const { reg, room, host, sid, clock } = setup()
    expect(await reg.addShot(room, host.token, sid, Number.NaN, jpeg(), 'image/jpeg')).toMatchObject({ status: 400 })
    expect(await reg.addShot(room, host.token, sid, 7, jpeg(), 'image/jpeg')).toMatchObject({ status: 400 })
    expect(await reg.addShot(room, host.token, sid, 0, jpeg(), 'video/webm')).toMatchObject({ status: 415 })
    expect(await reg.addShot(room, host.token, sid, 0, jpeg(), 'image/png', 'clip')).toMatchObject({ status: 400 })
    expect(await reg.addShot(room, host.token, 'other', 0, jpeg(), 'image/jpeg')).toMatchObject({ status: 409 })
    expect(await reg.addShot(room, host.token, sid, 0, new Uint8Array(0), 'image/jpeg')).toMatchObject({
      status: 400,
    })
    clock.advance(PREP_MS + UPLOAD_GRACE_MS + 60_000)
    expect(await reg.addShot(room, host.token, sid, 0, jpeg(), 'image/jpeg')).toMatchObject({ status: 410 })
  })

  it('caps uploads per session and resets the budget on a new start', async () => {
    const { reg, room, host, sid } = setup()
    for (let i = 0; i < MAX_ROOM_UPLOADS; i++) await reg.addShot(room, host.token, sid, 0, jpeg(), 'image/gif')
    expect(await reg.addShot(room, host.token, sid, 0, jpeg(), 'image/jpeg')).toMatchObject({ status: 429 })
    reg.handle(room, host, JSON.stringify({ type: 'reset' }))
    reg.handle(room, host, JSON.stringify({ type: 'start' }))
    const next = room.state.session!.id
    expect(await reg.addShot(room, host.token, next, 0, jpeg(), 'image/jpeg')).toHaveProperty('url')
  })

  it('drops a write that lands after the room reset', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const inner = new MemoryBlobStore()
    const slow: BlobStore = {
      put: async (...a) => {
        await gate
        return inner.put(...a)
      },
      get: (k) => inner.get(k),
      delete: (k) => inner.delete(k),
      deletePrefix: (p) => inner.deletePrefix(p),
      sweep: () => inner.sweep(),
    }
    const { reg, room, host, sid } = setup({ blobs: slow })
    const pending = reg.addShot(room, host.token, sid, 0, jpeg(), 'image/jpeg')
    reg.handle(room, host, JSON.stringify({ type: 'reset' }))
    release()
    expect(await pending).toMatchObject({ status: 409 })
    expect(inner.size.items).toBe(0)
  })
})

describe('retakes', () => {
  it('reshoots only the rounds with missing frames and keeps completed ones', async () => {
    const { reg, room, host, guest, hostSock, guestSock, sid, clock } = setup()
    await reg.addShot(room, host.token, sid, 0, jpeg(), 'image/jpeg')
    await reg.addShot(room, guest.token, sid, 0, jpeg(), 'image/jpeg')
    await reg.addShot(room, host.token, sid, 1, jpeg(), 'image/jpeg')
    const firstRound = { ...room.state.session!.shots[0] }
    const oldFire = room.state.session!.fireAts[0]

    reg.handle(room, host, JSON.stringify({ type: 'retake', rounds: [1] }))
    expect(hostSock.last()).toMatchObject({ type: 'error', code: 'BUSY' })

    clock.advance(20_000)
    reg.handle(room, guest, JSON.stringify({ type: 'retake', rounds: [1] }))
    expect(guestSock.last()).toMatchObject({ code: 'NOT_HOST' })
    reg.handle(room, host, JSON.stringify({ type: 'retake', rounds: [0, 1] }))
    const s = room.state.session!
    expect(s.id).toBe(sid)
    expect(s.retakeRounds).toEqual([1])
    expect(s.fireAts[0]).toBe(oldFire!)
    expect(s.fireAts[1]).toBe(clock.get() + PREP_MS + 3000)
    expect(s.shots[0]).toEqual(firstRound)
    expect(s.peerIds).toEqual([host.id, guest.id])

    expect(await reg.addShot(room, guest.token, sid, 1, jpeg(), 'image/jpeg')).toHaveProperty('url')
    expect(await reg.addShot(room, host.token, sid, 1, jpeg(), 'image/jpeg')).toMatchObject({ status: 409 })
  })
})

describe('reconnects and hosts', () => {
  it('hands the host to the oldest remaining member and lets the host transfer it', () => {
    const reg = new RoomRegistry()
    const room = reg.create()
    const a = reg.join(room, fakeSocket().socket, 'Ana')!
    const b = reg.join(room, fakeSocket().socket, 'Ben')!
    const cSock = fakeSocket()
    const c = reg.join(room, cSock.socket, 'Cy')!
    reg.handle(room, a, JSON.stringify({ type: 'transfer-host', to: c.id }))
    expect(room.hostId).toBe(c.id)
    expect(cSock.last()).toMatchObject({ type: 'room', room: { hostId: c.id } })
    reg.handle(room, a, JSON.stringify({ type: 'transfer-host', to: b.id }))
    expect(room.hostId).toBe(c.id)
    reg.leave(room, c.id)
    expect(room.hostId).toBe(a.id)
  })

  it('gives a dropped member their seat and frames back with their token', async () => {
    const { reg, room, host, guest, sid, clock } = setup()
    await reg.addShot(room, guest.token, sid, 0, jpeg(), 'image/jpeg')
    reg.leave(room, guest.id)
    expect(room.state.session!.peerIds).toEqual([host.id])
    expect(reg.snapshot(room).away).toEqual([{ id: guest.id, name: 'Ben' }])

    const back = fakeSocket()
    const again = reg.join(room, back.socket, 'Ben', guest.token)!
    expect(again.id).toBe(guest.id)
    expect(back.inbox[0]).toMatchObject({ type: 'welcome', you: guest.id, resumed: true })
    expect(room.state.session!.peerIds).toContain(guest.id)
    expect(room.state.session!.shots[0]![guest.id]).toBeDefined()
    expect(reg.snapshot(room).away).toEqual([])

    reg.leave(room, guest.id)
    clock.advance(AWAY_MS + 1)
    const late = reg.join(room, fakeSocket().socket, 'Ben', guest.token)!
    expect(late.id).not.toBe(guest.id)
  })

  it('swaps in a new socket for a live member and ignores the stale close', () => {
    const reg = new RoomRegistry()
    const room = reg.create()
    const oldSock = fakeSocket()
    const a = reg.join(room, oldSock.socket, 'Ana')!
    const newSock = fakeSocket()
    const same = reg.join(room, newSock.socket, 'Ana', a.token)!
    expect(same.id).toBe(a.id)
    expect(oldSock.closed()).toBe(true)
    reg.leave(room, a.id, oldSock.socket)
    expect(room.members.has(a.id)).toBe(true)
    reg.leave(room, a.id, newSock.socket)
    expect(room.members.has(a.id)).toBe(false)
  })

  it('reports each camera state and clears ready when the camera drops', () => {
    const reg = new RoomRegistry()
    const room = reg.create()
    reg.join(room, fakeSocket().socket, 'Ana')
    const b = reg.join(room, fakeSocket().socket, 'Ben')!
    reg.handle(room, b, JSON.stringify({ type: 'camera', state: 'ready' }))
    reg.handle(room, b, JSON.stringify({ type: 'ready', ready: true }))
    expect(reg.snapshot(room).peers[1]).toMatchObject({ camera: 'ready', ready: true })
    reg.handle(room, b, JSON.stringify({ type: 'camera', state: 'missing' }))
    expect(reg.snapshot(room).peers[1]).toMatchObject({ camera: 'missing', ready: false })
  })

  it('closes an empty room after its TTL and deletes its frames', async () => {
    const { reg, room, host, guest, sid, clock } = setup()
    await reg.addShot(room, host.token, sid, 0, jpeg(), 'image/jpeg')
    reg.leave(room, host.id)
    reg.leave(room, guest.id)
    clock.advance(1000 * 60 * 60 * 7)
    reg.sweep()
    await Promise.resolve()
    expect(reg.get(room.code)).toBeUndefined()
    expect((reg.blobs as MemoryBlobStore).size.items).toBe(0)
  })
})

describe('http', () => {
  function http(opts: Parameters<typeof createApp>[1] = {}) {
    const reg = new RoomRegistry()
    const { app } = createApp(reg, opts)
    const call = (path: string, init?: RequestInit, ip = '1.1.1.1') => app.request(path, init, { ip })
    return { reg, call }
  }

  it('limits room creation per address', async () => {
    const { call } = http({ roomLimit: { max: 2, windowMs: 60_000 } })
    expect((await call('/api/rooms', { method: 'POST' })).status).toBe(201)
    expect((await call('/api/rooms', { method: 'POST' })).status).toBe(201)
    const blocked = await call('/api/rooms', { method: 'POST' })
    expect(blocked.status).toBe(429)
    expect(await blocked.json()).toMatchObject({ error: expect.stringContaining('Too many') })
    expect((await call('/api/rooms', { method: 'POST' }, '2.2.2.2')).status).toBe(201)
  })

  it('serves kept media with safe headers and deletes it only with the token', async () => {
    const { call } = http()
    const made = await call('/api/keep', { method: 'POST', headers: { 'content-type': 'image/png' }, body: jpeg() })
    expect(made.status).toBe(201)
    const { id, url, deleteToken } = (await made.json()) as { id: string; url: string; deleteToken: string }
    const got = await call(url)
    expect(got.headers.get('x-content-type-options')).toBe('nosniff')
    expect(got.headers.get('content-disposition')).toBe('inline')

    expect((await call(`/api/keep/${id}`, { method: 'DELETE' })).status).toBe(403)
    const wrong = { method: 'DELETE', headers: { 'x-delete-token': 'nope' } }
    expect((await call(`/api/keep/${id}`, wrong)).status).toBe(403)
    const right = { method: 'DELETE', headers: { 'x-delete-token': deleteToken } }
    expect((await call(`/api/keep/${id}`, right)).status).toBe(204)
    expect((await call(url)).status).toBe(404)
    expect((await call(`/api/keep/${id}`, right)).status).toBe(404)
  })

  it('rejects unsupported keep types and limits keep links per address', async () => {
    const { call } = http({ keepLimit: { max: 1, windowMs: 60_000 } })
    const html = { method: 'POST', headers: { 'content-type': 'text/html' }, body: jpeg() }
    expect((await call('/api/keep', html)).status).toBe(415)
    const png = () => ({ method: 'POST', headers: { 'content-type': 'image/png' }, body: jpeg() })
    expect((await call('/api/keep', png())).status).toBe(201)
    expect((await call('/api/keep', png())).status).toBe(429)
  })

  it('returns stable status codes for shot uploads', async () => {
    const { reg, call } = http()
    const room = reg.create()
    const host = reg.join(room, fakeSocket().socket, 'Ana')!
    reg.handle(room, host, JSON.stringify({ type: 'start' }))
    const sid = room.state.session!.id
    const post = (type: string) =>
      call(`/api/rooms/${room.code}/shots?session=${sid}&round=0`, {
        method: 'POST',
        headers: { 'x-peer-token': host.token, 'content-type': type },
        body: jpeg(),
      })
    expect((await post('text/plain')).status).toBe(415)
    expect((await post('image/jpeg')).status).toBe(201)
    const dup = await post('image/jpeg')
    expect(dup.status).toBe(409)
    expect(await dup.json()).toMatchObject({ url: expect.stringContaining('/api/shots/') })
    const shot = await call(`/api/shots/${room.code}/${room.code}-${sid}-0-${host.id}`)
    expect(shot.status).toBe(200)
    expect(shot.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
