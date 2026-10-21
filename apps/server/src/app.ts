import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import { type Analytics, deviceClass } from './analytics'
import type { Billing } from './billing/service'
import type { Db } from './db'
import { RateLimiter } from './limits'
import { MAX_SHOT_BYTES, type RoomRegistry } from './rooms'

export const KEEP_TTL_MS = 1000 * 60 * 60 * 24
export const MAX_KEEP_BYTES = 20 * 1024 * 1024
const KEEP_TYPES = /^(image\/(png|jpeg|webp|gif)|video\/(webm|mp4))$/
const INLINE_TYPES = /^(image\/(png|jpeg|webp|gif)|video\/(webm|mp4))$/

export interface AppOptions {
  now?: () => number
  roomLimit?: { max: number; windowMs: number }
  keepLimit?: { max: number; windowMs: number }
  corsOrigin?: string
  trustProxy?: boolean
  roomsPaused?: () => boolean
  business?: { billing: Billing; analytics: Analytics; db: Db }
}

export type Env = { Bindings: { ip?: string } }

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function mediaHeaders(type: string, cache: string) {
  return {
    'content-type': type,
    'cache-control': cache,
    'x-content-type-options': 'nosniff',
    'content-disposition': INLINE_TYPES.test(type) ? 'inline' : 'attachment',
  }
}

export function createApp(registry: RoomRegistry, opts: AppOptions = {}) {
  const now = opts.now ?? Date.now
  const roomLimiter = new RateLimiter(opts.roomLimit?.max ?? 20, opts.roomLimit?.windowMs ?? 10 * 60_000, now)
  const keepLimiter = new RateLimiter(opts.keepLimit?.max ?? 40, opts.keepLimit?.windowMs ?? 60 * 60_000, now)
  const keepTokens = new Map<string, { hash: string; expiresAt: number }>()

  const app = new Hono<Env>()
  app.use('/api/*', cors({ origin: opts.corsOrigin ?? '*', exposeHeaders: ['retry-after'] }))

  const clientIp = (c: { req: { header(name: string): string | undefined }; env?: { ip?: string } }) => {
    if (opts.trustProxy) {
      const forwarded = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      if (forwarded) return forwarded
    }
    return c.env?.ip || 'unknown'
  }

  function sweep() {
    const t = now()
    for (const [id, k] of keepTokens) if (k.expiresAt < t) keepTokens.delete(id)
    roomLimiter.sweep()
    keepLimiter.sweep()
    biz?.billing.expireStale()
  }

  const snapshot = () => ({ ...registry.stats.totals(), live: registry.live() })

  app.get('/api/health', (c) => c.json({ ok: true, rooms: registry.rooms.size }))

  const biz = opts.business
  app.post('/api/rooms', (c) => {
    if (opts.roomsPaused?.())
      return c.json({ error: 'Shared rooms are paused for maintenance. Solo mode is still available.' }, 503)
    if (!roomLimiter.hit(clientIp(c))) {
      return c.json({ error: 'Too many new rooms from this network. Try again in a few minutes.' }, 429, {
        'retry-after': '120',
      })
    }
    const room = registry.create()
    biz?.analytics.track('rooms', {
      device: deviceClass(c.req.header('user-agent')),
      country: c.req.header('cf-ipcountry'),
    })
    return c.json({ code: room.code }, 201)
  })

  app.get('/api/rooms/:code', (c) => {
    const room = registry.get(c.req.param('code'))
    if (!room) return c.json({ error: 'No room with that code.' }, 404)
    return c.json({ code: room.code, people: room.members.size })
  })

  app.post('/api/rooms/:code/shots', async (c) => {
    const room = registry.get(c.req.param('code'))
    if (!room) return c.json({ error: 'No room with that code.' }, 404)
    const declared = Number(c.req.header('content-length') ?? 0)
    if (declared > MAX_SHOT_BYTES) return c.json({ error: 'Shot too large.' }, 413)
    const token = c.req.header('x-peer-token') ?? ''
    const session = c.req.query('session') ?? ''
    const round = Number(c.req.query('round'))
    const kind = c.req.query('kind') === 'clip' ? 'clip' : 'photo'
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    const result = await registry.addShot(room, token, session, round, bytes, c.req.header('content-type') ?? '', kind)
    if ('error' in result) return c.json({ error: result.error, url: result.url }, result.status)
    return c.json(result, 201)
  })

  app.get('/api/shots/:code/:id', async (c) => {
    const shot = await registry.blobs.get(`${c.req.param('code').toUpperCase()}/${c.req.param('id')}`)
    if (!shot) return c.notFound()
    return c.body(shot.bytes, 200, mediaHeaders(shot.type, 'private, max-age=3600'))
  })

  app.post('/api/keep', async (c) => {
    const type = c.req.header('content-type') ?? ''
    if (!KEEP_TYPES.test(type)) return c.json({ error: 'Images or short videos only.' }, 415)
    const declared = Number(c.req.header('content-length') ?? 0)
    if (declared > MAX_KEEP_BYTES) return c.json({ error: 'File too large.' }, 413)
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (!bytes.byteLength) return c.json({ error: 'Empty file.' }, 400)
    if (bytes.byteLength > MAX_KEEP_BYTES) return c.json({ error: 'File too large.' }, 413)
    const tooMany = { error: 'Too many share links for now. Try again later.' }
    if (!keepLimiter.hit(clientIp(c))) return c.json(tooMany, 429, { 'retry-after': '600' })
    if (!registry.allowKeep(c.req.query('room'))) return c.json(tooMany, 429)
    const id = crypto.randomUUID().replaceAll('-', '').slice(0, 16)
    const deleteToken = crypto.randomUUID().replaceAll('-', '')
    const license = biz?.billing.active(c.req.header('x-license'))
    const ttl = license ? license.plan.keepDays * 86_400_000 : KEEP_TTL_MS
    const expiresAt = now() + ttl
    await registry.blobs.put(`${license ? 'pro' : 'keep'}/${id}`, bytes, type, ttl)
    if (license && biz) {
      biz.db
        .query('INSERT INTO gallery (license_key, keep_id, type, created_at) VALUES (?, ?, ?, ?)')
        .run(license.key, id, type, now())
    }
    keepTokens.set(id, { hash: await sha256(deleteToken), expiresAt })
    registry.stats.bump(type.startsWith('video/') ? 'clips' : 'shared')
    return c.json({ id, url: `/api/keep/${id}`, expiresAt, deleteToken }, 201)
  })

  app.get('/api/keep/:id', async (c) => {
    const id = c.req.param('id')
    const item = (await registry.blobs.get(`keep/${id}`)) ?? (await registry.blobs.get(`pro/${id}`))
    if (!item) return c.json({ error: 'This link has expired.' }, 404)
    return c.body(item.bytes, 200, mediaHeaders(item.type, 'public, max-age=3600'))
  })

  app.delete('/api/keep/:id', async (c) => {
    const id = c.req.param('id')
    const stored = keepTokens.get(id)
    if (!stored || stored.expiresAt < now()) return c.json({ error: 'This link has already expired.' }, 404)
    const given = c.req.header('x-delete-token') ?? ''
    if (!given || !safeEqual(await sha256(given), stored.hash)) {
      return c.json({ error: 'That link can only be deleted from the device that made it.' }, 403)
    }
    keepTokens.delete(id)
    await registry.blobs.delete(`keep/${id}`)
    await registry.blobs.delete(`pro/${id}`)
    biz?.db.query('DELETE FROM gallery WHERE keep_id = ?').run(id)
    return c.body(null, 204)
  })

  app.get('/api/stats', (c) => c.json(snapshot()))

  app.get('/api/stats/live', (c) =>
    streamSSE(c, async (stream) => {
      let dirty = true
      const off = registry.stats.onChange(() => {
        dirty = true
      })
      let lastLive = ''
      stream.onAbort(() => {
        off()
      })
      while (!stream.aborted) {
        const snap = snapshot()
        const live = JSON.stringify(snap.live)
        if (dirty || live !== lastLive) {
          dirty = false
          lastLive = live
          await stream.writeSSE({ event: 'stats', data: JSON.stringify(snap) })
        } else await stream.writeSSE({ event: 'ping', data: '' })
        await stream.sleep(1000)
      }
    }),
  )

  return { app, sweep, clientIp }
}
