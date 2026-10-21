import { describe, expect, it } from 'bun:test'
import type { ServerMessage } from '@groupshot/protocol'
import { RoomRegistry, type Socket } from './rooms'

function fakeSocket() {
  const inbox: ServerMessage[] = []
  const socket: Socket = { send: (d) => inbox.push(JSON.parse(d)), close: () => {} }
  return { socket, inbox, last: () => inbox.at(-1) }
}

describe('RoomRegistry', () => {
  it('makes the first joiner host and hands off when they leave', () => {
    const reg = new RoomRegistry()
    const room = reg.create()
    const a = reg.join(room, fakeSocket().socket, 'Ana')!
    const b = reg.join(room, fakeSocket().socket, 'Ben')!
    expect(room.hostId).toBe(a.id)
    reg.leave(room, a.id)
    expect(room.hostId).toBe(b.id)
  })

  it('only lets the host start, and schedules every shot', () => {
    let now = 1000
    const reg = new RoomRegistry(() => now)
    const room = reg.create()
    const host = reg.join(room, fakeSocket().socket, 'Ana')!
    const guestSock = fakeSocket()
    const guest = reg.join(room, guestSock.socket, 'Ben')!
    reg.handle(room, guest, JSON.stringify({ type: 'start' }))
    expect(guestSock.last()).toMatchObject({ type: 'error', code: 'NOT_HOST' })
    reg.handle(room, host, JSON.stringify({ type: 'start' }))
    expect(room.state.session?.fireAts).toHaveLength(4)
    expect(room.state.session?.peerIds).toEqual([host.id, guest.id])
    now += 1
  })

  it('accepts shots only with a valid token', async () => {
    const reg = new RoomRegistry()
    const room = reg.create()
    const host = reg.join(room, fakeSocket().socket, 'Ana')!
    reg.handle(room, host, JSON.stringify({ type: 'start' }))
    const sid = room.state.session!.id
    expect(await reg.addShot(room, 'nope', sid, 0, new Uint8Array(4), 'image/jpeg')).toMatchObject({ status: 401 })
    expect(await reg.addShot(room, host.token, sid, 0, new Uint8Array(4), 'image/jpeg')).toHaveProperty('url')
    expect(room.state.session!.shots[0]![host.id]).toBeDefined()
  })

  it('caps rooms at six', () => {
    const reg = new RoomRegistry()
    const room = reg.create()
    for (let i = 0; i < 6; i++) reg.join(room, fakeSocket().socket, `P${i}`)
    const seventh = fakeSocket()
    expect(reg.join(room, seventh.socket, 'Late')).toBeNull()
    expect(seventh.last()).toMatchObject({ code: 'ROOM_FULL' })
  })

  it('keeps quiz choices private until all room members have answered, then reveals them', () => {
    const reg = new RoomRegistry()
    const room = reg.create()
    const host = reg.join(room, fakeSocket().socket, 'Ana')!
    const guest = reg.join(room, fakeSocket().socket, 'Ben')!

    reg.handle(room, host, JSON.stringify({ type: 'activity-start', activity: 'know-me' }))
    expect(room.state.activity).toMatchObject({ phase: 'answer', targetId: host.id, submittedPeerIds: [] })

    reg.handle(room, host, JSON.stringify({ type: 'activity-answer', round: 0, choice: 1 }))
    expect(room.state.activity).toMatchObject({ phase: 'answer', submittedPeerIds: [host.id] })
    expect(room.state.activity).not.toHaveProperty('answers')

    reg.handle(room, guest, JSON.stringify({ type: 'activity-answer', round: 0, choice: 2 }))
    expect(room.state.activity).toMatchObject({
      phase: 'reveal',
      answers: { [host.id]: 1, [guest.id]: 2 },
    })
  })

  it('rotates quiz targets and ends after each room member has answered for themselves', () => {
    const reg = new RoomRegistry()
    const room = reg.create()
    const host = reg.join(room, fakeSocket().socket, 'Ana')!
    const guest = reg.join(room, fakeSocket().socket, 'Ben')!

    reg.handle(room, host, JSON.stringify({ type: 'activity-start', activity: 'know-me' }))
    for (const member of [host, guest])
      reg.handle(room, member, JSON.stringify({ type: 'activity-answer', round: 0, choice: 0 }))
    reg.handle(room, host, JSON.stringify({ type: 'activity-next' }))
    expect(room.state.activity).toMatchObject({ phase: 'answer', round: 1, targetId: guest.id })
    for (const member of [host, guest])
      reg.handle(room, member, JSON.stringify({ type: 'activity-answer', round: 1, choice: 3 }))
    reg.handle(room, host, JSON.stringify({ type: 'activity-next' }))
    expect(room.state.activity?.phase).toBe('ended')
  })

  it('stops the active quiz if a participant leaves', () => {
    const reg = new RoomRegistry()
    const room = reg.create()
    const host = reg.join(room, fakeSocket().socket, 'Ana')!
    reg.join(room, fakeSocket().socket, 'Ben')!
    reg.handle(room, host, JSON.stringify({ type: 'activity-start', activity: 'know-me' }))
    reg.leave(room, host.id)
    expect(room.state.activity?.phase).toBe('ended')
  })

  it('advances conversation cards on the host signal and ends after the full deck', () => {
    const reg = new RoomRegistry()
    const room = reg.create()
    const host = reg.join(room, fakeSocket().socket, 'Ana')!
    reg.join(room, fakeSocket().socket, 'Ben')!

    reg.handle(room, host, JSON.stringify({ type: 'activity-start', activity: 'conversation-cards' }))
    expect(room.state.activity).toMatchObject({ id: 'conversation-cards', round: 0, phase: 'answer' })
    for (let i = 0; i < 6; i++) reg.handle(room, host, JSON.stringify({ type: 'activity-next' }))
    expect(room.state.activity?.phase).toBe('ended')
  })

  function startGame(game: string) {
    const reg = new RoomRegistry()
    const room = reg.create()
    const hostSock = fakeSocket()
    const host = reg.join(room, hostSock.socket, 'Ana')!
    const guestSock = fakeSocket()
    const guest = reg.join(room, guestSock.socket, 'Ben')!
    reg.handle(room, host, JSON.stringify({ type: 'activity-start', activity: game }))
    return { reg, room, host, guest, hostSock, guestSock }
  }

  it('reveals typed answers together and records the round in history', () => {
    const { reg, room, host, guest } = startGame('honest-cards')
    reg.handle(room, host, JSON.stringify({ type: 'activity-submit', round: 0, text: 'tacos' }))
    expect(room.state.activity?.texts).toBeUndefined()
    reg.handle(room, guest, JSON.stringify({ type: 'activity-submit', round: 0, text: 'ramen' }))
    expect(room.state.activity).toMatchObject({
      phase: 'reveal',
      texts: { [host.id]: 'tacos', [guest.id]: 'ramen' },
    })
    expect(room.state.activity?.history).toHaveLength(1)
  })

  it('rejects the wrong answer type for a game', () => {
    const { reg, room, host, hostSock } = startGame('honest-cards')
    reg.handle(room, host, JSON.stringify({ type: 'activity-answer', round: 0, choice: 1 }))
    expect(hostSock.last()).toMatchObject({ type: 'error', code: 'BUSY' })
    expect(room.state.activity?.submittedPeerIds).toEqual([])
  })

  it('runs choice games for their full deck, then ends', () => {
    const { reg, room, host, guest } = startGame('in-sync')
    for (let round = 0; round < 8; round++) {
      reg.handle(room, host, JSON.stringify({ type: 'activity-answer', round, choice: 0 }))
      reg.handle(room, guest, JSON.stringify({ type: 'activity-answer', round, choice: round % 4 }))
      expect(room.state.activity?.phase).toBe('reveal')
      reg.handle(room, host, JSON.stringify({ type: 'activity-next' }))
    }
    expect(room.state.activity?.phase).toBe('ended')
    expect(room.state.activity?.history).toHaveLength(8)
  })

  it('rotates the spotlight in truth or dare and lets the host end any game', () => {
    const { reg, room, host, guest } = startGame('truth-or-dare')
    expect(room.state.activity?.targetId).toBe(host.id)
    reg.handle(room, host, JSON.stringify({ type: 'activity-next' }))
    expect(room.state.activity?.targetId).toBe(guest.id)
    reg.handle(room, host, JSON.stringify({ type: 'activity-end' }))
    expect(room.state.activity?.phase).toBe('ended')
  })

  it('relays cursors to everyone but the sender, and strokes only during draw-together', () => {
    const { reg, room, host, hostSock, guestSock } = startGame('draw-together')
    const before = hostSock.inbox.length
    reg.handle(room, host, JSON.stringify({ type: 'cursor', x: 0.2, y: 0.4 }))
    expect(hostSock.inbox.length).toBe(before)
    expect(guestSock.last()).toMatchObject({ type: 'cursor', id: host.id, x: 0.2, y: 0.4 })
    const stroke = { id: 's', color: '#ff7ba3', width: 6, pts: [0.1, 0.1, 0.2, 0.2] }
    reg.handle(room, host, JSON.stringify({ type: 'draw', stroke }))
    expect(guestSock.last()).toMatchObject({ type: 'draw', from: host.id })
    reg.handle(room, host, JSON.stringify({ type: 'activity-end' }))
    const seen = guestSock.inbox.length
    reg.handle(room, host, JSON.stringify({ type: 'draw', stroke }))
    expect(guestSock.inbox.length).toBe(seen)
  })

  it('counts photos once each and strips when a session completes', async () => {
    const reg = new RoomRegistry()
    const room = reg.create()
    const host = reg.join(room, fakeSocket().socket, 'Ana')!
    reg.handle(room, host, JSON.stringify({ type: 'settings', settings: { shots: 1 } }))
    reg.handle(room, host, JSON.stringify({ type: 'start' }))
    const sid = room.state.session!.id
    await reg.addShot(room, host.token, sid, 0, new Uint8Array(4), 'image/jpeg')
    expect(await reg.addShot(room, host.token, sid, 0, new Uint8Array(4), 'image/jpeg')).toMatchObject({
      status: 409,
      url: expect.stringContaining('/api/shots/'),
    })
    expect(reg.stats.totals()).toMatchObject({ photos: 1, strips: 1 })
    expect(reg.live()).toEqual({ rooms: 1, people: 1 })
  })

  it('keeps clip sprites beside photos when the room shoots video', async () => {
    const reg = new RoomRegistry()
    const room = reg.create()
    const host = reg.join(room, fakeSocket().socket, 'Ana')!
    reg.handle(room, host, JSON.stringify({ type: 'settings', settings: { output: 'boomerang', shots: 1 } }))
    reg.handle(room, host, JSON.stringify({ type: 'start' }))
    const sid = room.state.session!.id
    expect(await reg.addShot(room, host.token, sid, 0, new Uint8Array(4), 'image/png', 'clip')).toHaveProperty('url')
    expect(room.state.session!.clips![0]![host.id]).toContain('-clip')
    expect(room.state.session!.shots[0]![host.id]).toBeUndefined()
    expect(reg.stats.totals().photos).toBe(0)
  })
})
