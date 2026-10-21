import type { Db } from './db'

export interface Flags {
  announcement: string
  roomsPaused: boolean
  checkoutPaused: boolean
}

const DEFAULTS: Flags = { announcement: '', roomsPaused: false, checkoutPaused: false }

export class FlagStore {
  private cache: Flags

  constructor(private db: Db) {
    this.cache = { ...DEFAULTS }
    for (const row of db.query<{ key: string; value: string }, []>('SELECT key, value FROM flags').all()) {
      if (row.key in DEFAULTS) (this.cache as unknown as Record<string, unknown>)[row.key] = JSON.parse(row.value)
    }
  }

  get(): Flags {
    return { ...this.cache }
  }

  set(patch: Partial<Flags>) {
    const next = { ...this.cache }
    if (typeof patch.announcement === 'string') next.announcement = patch.announcement.trim().slice(0, 200)
    if (typeof patch.roomsPaused === 'boolean') next.roomsPaused = patch.roomsPaused
    if (typeof patch.checkoutPaused === 'boolean') next.checkoutPaused = patch.checkoutPaused
    const upsert = this.db.query(
      'INSERT INTO flags (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    )
    this.db.transaction(() => {
      for (const [k, v] of Object.entries(next)) upsert.run(k, JSON.stringify(v))
    })()
    this.cache = next
    return this.get()
  }
}
