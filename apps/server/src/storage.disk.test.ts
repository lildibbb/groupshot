import { describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DiskBlobStore } from './storage'

const bytes = (n: number) => new Uint8Array(n).fill(7)

describe('DiskBlobStore', () => {
  it('sweeping or clearing before anything was stored is a no-op, not a crash', async () => {
    const store = new DiskBlobStore(join(tmpdir(), `gs-never-created-${crypto.randomUUID()}`))
    await store.sweep()
    await store.deletePrefix('ROOM-01/')
    expect(await store.get('keep/abc')).toBeNull()
  })

  it('stores, expires and removes blobs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gs-disk-'))
    let now = 1000
    const store = new DiskBlobStore(dir, () => now)
    await store.put('keep/a1', bytes(4), 'image/png', 500)
    await store.put('SNAP-42/shot', bytes(2), 'image/jpeg', 5000)
    expect((await store.get('keep/a1'))?.bytes.byteLength).toBe(4)
    now += 600
    await store.sweep()
    expect(await store.get('keep/a1')).toBeNull()
    expect(await store.get('SNAP-42/shot')).not.toBeNull()
    await store.deletePrefix('SNAP-42/')
    expect(await store.get('SNAP-42/shot')).toBeNull()
    await rm(dir, { recursive: true })
  })

  it('refuses keys that could escape the folder', async () => {
    const store = new DiskBlobStore(join(tmpdir(), 'gs-x'))
    await expect(store.put('../evil', bytes(1), 'image/png', 1000)).rejects.toThrow()
  })
})
