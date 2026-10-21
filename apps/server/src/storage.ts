export interface StoredBlob {
  bytes: Uint8Array<ArrayBuffer>
  type: string
  createdAt: number
  expiresAt: number
}

export interface BlobStore {
  put(key: string, bytes: Uint8Array<ArrayBuffer>, type: string, ttlMs: number): Promise<void>
  get(key: string): Promise<StoredBlob | null>
  delete(key: string): Promise<void>
  deletePrefix(prefix: string): Promise<void>
  sweep(): Promise<void>
}

export class MemoryBlobStore implements BlobStore {
  private items = new Map<string, StoredBlob>()
  private bytes = 0

  constructor(
    private maxBytes = 512 * 1024 * 1024,
    private now: () => number = Date.now,
  ) {}

  get size() {
    return { items: this.items.size, bytes: this.bytes }
  }

  async put(key: string, bytes: Uint8Array<ArrayBuffer>, type: string, ttlMs: number) {
    await this.delete(key)
    const at = this.now()
    this.items.set(key, { bytes, type, createdAt: at, expiresAt: at + ttlMs })
    this.bytes += bytes.byteLength
    for (const [k, v] of this.items) {
      if (this.bytes <= this.maxBytes) break
      this.items.delete(k)
      this.bytes -= v.bytes.byteLength
    }
  }

  async get(key: string) {
    const item = this.items.get(key)
    if (!item) return null
    if (item.expiresAt < this.now()) {
      await this.delete(key)
      return null
    }
    this.items.delete(key)
    this.items.set(key, item)
    return item
  }

  async delete(key: string) {
    const item = this.items.get(key)
    if (!item) return
    this.items.delete(key)
    this.bytes -= item.bytes.byteLength
  }

  async deletePrefix(prefix: string) {
    for (const key of [...this.items.keys()]) if (key.startsWith(prefix)) await this.delete(key)
  }

  async sweep() {
    const now = this.now()
    for (const [key, item] of [...this.items]) if (item.expiresAt < now) await this.delete(key)
  }
}

export interface Totals {
  strips: number
  photos: number
  clips: number
  shared: number
  games: number
}

export interface StatsStore {
  bump(key: keyof Totals, by?: number): void
  totals(): Totals
}

export class MemoryStats implements StatsStore {
  private t: Totals = { strips: 0, photos: 0, clips: 0, shared: 0, games: 0 }
  private listeners = new Set<() => void>()

  bump(key: keyof Totals, by = 1) {
    this.t[key] += by
    for (const l of this.listeners) l()
  }

  totals() {
    return { ...this.t }
  }

  onChange(fn: () => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export class DiskBlobStore implements BlobStore {
  constructor(
    private dir: string,
    private now: () => number = Date.now,
  ) {}

  private path(key: string) {
    if (!/^[A-Za-z0-9/_-]+$/.test(key) || key.includes('..')) throw new Error('bad key')
    return `${this.dir}/${key}`
  }

  async put(key: string, bytes: Uint8Array<ArrayBuffer>, type: string, ttlMs: number) {
    const at = this.now()
    const meta = { type, createdAt: at, expiresAt: at + ttlMs }
    await Bun.write(this.path(key), bytes, { createPath: true })
    await Bun.write(`${this.path(key)}.json`, JSON.stringify(meta))
  }

  async get(key: string) {
    const file = Bun.file(this.path(key))
    const metaFile = Bun.file(`${this.path(key)}.json`)
    if (!(await metaFile.exists()) || !(await file.exists())) return null
    const meta = (await metaFile.json()) as Omit<StoredBlob, 'bytes'>
    if (meta.expiresAt < this.now()) {
      await this.delete(key)
      return null
    }
    return { ...meta, bytes: new Uint8Array(await file.arrayBuffer()) }
  }

  async delete(key: string) {
    const { unlink } = await import('node:fs/promises')
    await unlink(this.path(key)).catch(() => {})
    await unlink(`${this.path(key)}.json`).catch(() => {})
  }

  private async exists() {
    return (await import('node:fs/promises')).stat(this.dir).then(
      (s) => s.isDirectory(),
      () => false,
    )
  }

  async deletePrefix(prefix: string) {
    if (!(await this.exists())) return
    for await (const name of new Bun.Glob(`${prefix}*.json`).scan({ cwd: this.dir })) {
      await this.delete(name.slice(0, -5))
    }
  }

  async sweep() {
    if (!(await this.exists())) return
    const t = this.now()
    for await (const name of new Bun.Glob('**/*.json').scan({ cwd: this.dir })) {
      const meta = (await Bun.file(`${this.dir}/${name}`)
        .json()
        .catch(() => null)) as { expiresAt?: number } | null
      if (!meta || (meta.expiresAt ?? 0) < t) await this.delete(name.slice(0, -5))
    }
  }
}

export interface R2Options {
  accountId: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  maxAgeMs?: number
  proMaxAgeMs?: number
}

export class R2BlobStore implements BlobStore {
  private client: Bun.S3Client
  private maxAgeMs: number
  private proMaxAgeMs: number

  constructor(
    opts: R2Options,
    private now: () => number = Date.now,
  ) {
    this.maxAgeMs = opts.maxAgeMs ?? 24 * 60 * 60 * 1000
    this.proMaxAgeMs = opts.proMaxAgeMs ?? 30 * 24 * 60 * 60 * 1000
    this.client = new Bun.S3Client({
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
      bucket: opts.bucket,
      endpoint: `https://${opts.accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
    })
  }

  private key(key: string) {
    if (!/^[A-Za-z0-9/_-]+$/.test(key) || key.includes('..')) throw new Error('bad key')
    return key
  }

  private ageFor(key: string) {
    return key.startsWith('pro/') ? this.proMaxAgeMs : this.maxAgeMs
  }

  async put(key: string, bytes: Uint8Array<ArrayBuffer>, type: string) {
    await this.client.write(this.key(key), bytes, { type })
  }

  async get(key: string) {
    const file = this.client.file(this.key(key))
    const stat = await file.stat().catch(() => null)
    if (!stat) return null
    const createdAt = stat.lastModified.getTime()
    const expiresAt = createdAt + this.ageFor(key)
    if (expiresAt < this.now()) {
      await this.delete(key)
      return null
    }
    return { bytes: new Uint8Array(await file.arrayBuffer()), type: stat.type, createdAt, expiresAt }
  }

  async delete(key: string) {
    await this.client.delete(this.key(key)).catch(() => {})
  }

  async deletePrefix(prefix: string) {
    let startAfter: string | undefined
    for (;;) {
      const page = await this.client.list({ prefix, startAfter, maxKeys: 500 })
      const keys = page.contents?.map((o) => o.key) ?? []
      await Promise.all(keys.map((k) => this.delete(k)))
      if (!page.isTruncated || !keys.length) return
      startAfter = keys.at(-1)
    }
  }

  async sweep() {
    const t = this.now()
    let startAfter: string | undefined
    for (;;) {
      const page = await this.client.list({ startAfter, maxKeys: 500 })
      const objects = page.contents ?? []
      await Promise.all(
        objects
          .filter((o) => o.lastModified && new Date(o.lastModified).getTime() < t - this.ageFor(o.key))
          .map((o) => this.delete(o.key)),
      )
      if (!page.isTruncated || !objects.length) return
      startAfter = objects.at(-1)?.key
    }
  }
}
