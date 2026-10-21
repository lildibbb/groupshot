import { describe, expect, it } from 'bun:test'
import { MemoryBlobStore, MemoryStats } from './storage'

const bytes = (n: number) => new Uint8Array(n)

describe('MemoryBlobStore', () => {
  it('evicts the least recently used item past the byte budget', async () => {
    const store = new MemoryBlobStore(10)
    await store.put('a', bytes(4), 'image/png', 1000)
    await store.put('b', bytes(4), 'image/png', 1000)
    await store.get('a')
    await store.put('c', bytes(4), 'image/png', 1000)
    expect(await store.get('b')).toBeNull()
    expect(await store.get('a')).not.toBeNull()
    expect(store.size.bytes).toBe(8)
  })

  it('expires items after their TTL', async () => {
    let now = 0
    const store = new MemoryBlobStore(100, () => now)
    await store.put('a', bytes(1), 'image/png', 50)
    now = 51
    expect(await store.get('a')).toBeNull()
    expect(store.size.items).toBe(0)
  })

  it('deletes by prefix', async () => {
    const store = new MemoryBlobStore()
    await store.put('ROOM-1/x', bytes(1), 'image/png', 1000)
    await store.put('ROOM-2/x', bytes(1), 'image/png', 1000)
    await store.deletePrefix('ROOM-1/')
    expect(store.size.items).toBe(1)
  })
})

describe('MemoryStats', () => {
  it('counts and notifies', () => {
    const stats = new MemoryStats()
    let calls = 0
    stats.onChange(() => calls++)
    stats.bump('strips')
    stats.bump('photos', 4)
    expect(stats.totals()).toMatchObject({ strips: 1, photos: 4 })
    expect(calls).toBe(2)
  })
})
