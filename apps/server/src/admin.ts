import { Hono } from 'hono'
import { type Analytics, METRICS, type Metric } from './analytics'
import { timingSafeEqual } from './billing/billplz'
import type { BusinessDeps } from './billing/routes'
import { sha256 } from './billing/service'
import { RateLimiter } from './limits'
import type { RoomRegistry } from './rooms'
import { MemoryBlobStore } from './storage'

export const ADMIN_SESSION_MS = 12 * 60 * 60_000

async function hmac(secret: string, text: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(
    /[+/=]/g,
    (m) => ({ '+': '-', '/': '_', '=': '' })[m]!,
  )
}

export function createAdminRoutes(
  registry: RoomRegistry,
  deps: BusinessDeps & { adminToken: string; startedAt: number },
) {
  const { billing, analytics, flags, db } = deps
  const now = deps.now ?? Date.now
  const loginLimiter = new RateLimiter(5, 15 * 60_000, now)
  const secret = `admin-session:${deps.adminToken}`
  const app = new Hono<{ Bindings: { ip?: string } }>()

  async function issue() {
    const exp = now() + ADMIN_SESSION_MS
    return `${exp}.${await hmac(secret, String(exp))}`
  }

  async function valid(header: string | undefined) {
    const token = header?.replace(/^Bearer\s+/i, '') ?? ''
    const [exp, sig] = token.split('.')
    if (!exp || !sig || Number(exp) < now()) return false
    return timingSafeEqual(await hmac(secret, exp), sig)
  }

  app.post('/api/admin/login', async (c) => {
    if (!deps.adminToken) return c.json({ error: 'Set ADMIN_TOKEN on the server to use the dashboard.' }, 503)
    if (!loginLimiter.hit(deps.clientIp(c))) return c.json({ error: 'Too many tries. Wait 15 minutes.' }, 429)
    const { token } = (await c.req.json().catch(() => ({}))) as { token?: string }
    const ok = token && timingSafeEqual(await sha256(token), await sha256(deps.adminToken))
    if (!ok) return c.json({ error: 'That token is not right.' }, 401)
    return c.json({ session: await issue(), expiresAt: now() + ADMIN_SESSION_MS })
  })

  app.use('/api/admin/*', async (c, next) => {
    if (c.req.path === '/api/admin/login') return next()
    if (!(await valid(c.req.header('authorization')))) return c.json({ error: 'Sign in again.' }, 401)
    c.header('cache-control', 'no-store')
    await next()
  })

  const days = (v: string | undefined, fallback = 30) => Math.min(Math.max(Number(v) || fallback, 1), 365)

  function window(a: Analytics, metric: Metric, n: number) {
    const series = a.daily(metric, n * 2)
    const sum = (xs: { value: number }[]) => xs.reduce((s, x) => s + x.value, 0)
    return { current: sum(series.slice(n)), previous: sum(series.slice(0, n)) }
  }

  app.get('/api/admin/overview', (c) => {
    const n = days(c.req.query('days'), 7)
    const blobs = registry.blobs instanceof MemoryBlobStore ? registry.blobs.size : null
    const mem = process.memoryUsage()
    const revenue = billing.revenueDaily(n * 2)
    const rev = (xs: { value: number }[]) => xs.reduce((s, x) => s + x.value, 0)
    return c.json({
      live: registry.live(),
      totals: registry.stats.totals(),
      windowDays: n,
      metrics: Object.fromEntries(
        (['rooms', 'joins', 'strips', 'frames', 'solo', 'kiosk', 'shared', 'games', 'checkouts', 'paid'] as const).map(
          (m) => [m, window(analytics, m, n)],
        ),
      ),
      revenueSen: { current: rev(revenue.slice(n)), previous: rev(revenue.slice(0, n)) },
      orders: billing.counts(),
      server: {
        uptimeMs: now() - deps.startedAt,
        rssBytes: mem.rss,
        heapBytes: mem.heapUsed,
        blobs,
        roomsInMemory: registry.rooms.size,
        version: process.env.APP_VERSION ?? 'dev',
      },
    })
  })

  app.get('/api/admin/series', (c) => {
    const n = days(c.req.query('days'))
    const wanted = (c.req.query('metrics') ?? 'rooms,strips,frames,shared')
      .split(',')
      .filter((m): m is Metric => (METRICS as readonly string[]).includes(m))
    return c.json({
      days: n,
      series: Object.fromEntries(wanted.map((m) => [m, analytics.daily(m, n)])),
      revenue: billing.revenueDaily(n),
    })
  })

  app.get('/api/admin/hourly', (c) =>
    c.json({
      joins: analytics.hourly('joins', 24),
      frames: analytics.hourly('frames', 24),
      rooms: analytics.hourly('rooms', 24),
    }),
  )

  app.get('/api/admin/breakdown', (c) => {
    const n = days(c.req.query('days'))
    return c.json({
      templates: analytics.breakdown('frames', 'template', n, 10),
      modes: analytics.breakdown('frames', 'mode', n),
      devices: analytics.breakdown('joins', 'device', n),
      countries: analytics.breakdown('rooms', 'country', n, 10),
      providers: analytics.breakdown('paid', 'provider', n),
    })
  })

  app.get('/api/admin/rooms', (c) =>
    c.json({
      rooms: [...registry.rooms.values()]
        .map((r) => ({
          code: r.code,
          people: r.members.size,
          names: [...r.members.values()].map((m) => m.name),
          away: r.away.size,
          template: r.state.settings.templateId,
          shooting: Boolean(r.state.session),
          activity: r.state.activity?.id ?? null,
          touchedAt: r.touchedAt,
          uploadedBytes: r.usage.bytes,
          keeps: r.keeps,
        }))
        .sort((a, b) => b.people - a.people || b.touchedAt - a.touchedAt),
    }),
  )

  app.delete('/api/admin/rooms/:code', async (c) => {
    const room = registry.get(c.req.param('code'))
    if (!room) return c.json({ error: 'No room with that code.' }, 404)
    for (const m of room.members.values()) m.socket.close(4003, 'closed by the host of this site')
    registry.rooms.delete(room.code)
    await registry.blobs.deletePrefix(`${room.code}/`)
    return c.body(null, 204)
  })

  app.get('/api/admin/orders', (c) =>
    c.json({
      orders: billing.orders({ status: c.req.query('status'), provider: c.req.query('provider'), limit: 300 }),
    }),
  )

  app.post('/api/admin/orders/:id/approve', async (c) => {
    const { note } = (await c.req.json().catch(() => ({}))) as { note?: string }
    const order = billing.get(c.req.param('id'))
    if (!order) return c.json({ error: 'No such order.' }, 404)
    if (['rejected', 'failed'].includes(order.status) && !note) {
      return c.json({ error: 'This order was closed. Add a note to approve it anyway.' }, 409)
    }
    return c.json({ order: billing.markPaid(order.id, note ?? 'approved by admin') })
  })

  app.post('/api/admin/orders/:id/reject', async (c) => {
    const { note } = (await c.req.json().catch(() => ({}))) as { note?: string }
    const order = billing.get(c.req.param('id'))
    if (!order) return c.json({ error: 'No such order.' }, 404)
    if (order.status === 'paid')
      return c.json({ error: 'Paid orders cannot be rejected. Revoke the key instead.' }, 409)
    return c.json({ order: billing.setStatus(order.id, 'rejected', note ?? '') })
  })

  app.get('/api/admin/licenses', (c) => c.json({ licenses: billing.licenses() }))

  app.post('/api/admin/licenses', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      plan?: string
      email?: string
      label?: string
      days?: number
    }
    const plan = billing.plan(body.plan ?? '')
    if (!plan) return c.json({ error: 'Pick a plan.' }, 400)
    const d = Math.min(Math.max(Number(body.days) || plan.days, 1), 366)
    return c.json(
      { license: billing.comp(plan, (body.email ?? '').slice(0, 120), (body.label ?? '').slice(0, 60), d) },
      201,
    )
  })

  app.post('/api/admin/licenses/:key/extend', async (c) => {
    const { days: d } = (await c.req.json().catch(() => ({}))) as { days?: number }
    const n = Math.min(Math.max(Number(d) || 0, 1), 366)
    const l = billing.extend(c.req.param('key'), n)
    return l ? c.json({ license: l }) : c.json({ error: 'No such key.' }, 404)
  })

  app.post('/api/admin/licenses/:key/revoke', async (c) => {
    const { revoked } = (await c.req.json().catch(() => ({}))) as { revoked?: boolean }
    const l = billing.revoke(c.req.param('key'), revoked !== false)
    return l ? c.json({ license: l }) : c.json({ error: 'No such key.' }, 404)
  })

  app.get('/api/admin/webhooks', (c) => c.json({ webhooks: billing.webhooks(150) }))

  app.post('/api/admin/webhooks/:id/attach', async (c) => {
    const { orderId } = (await c.req.json().catch(() => ({}))) as { orderId?: string }
    const hook = billing.webhooks(500).find((w) => w.id === Number(c.req.param('id')))
    const order = orderId ? (billing.get(orderId) ?? billing.byCode(orderId)) : null
    if (!hook || !order) return c.json({ error: 'Pick an order by id or GS- code.' }, 404)
    db.query('UPDATE webhooks SET order_id = ?, outcome = outcome || ? WHERE id = ?').run(
      order.id,
      ' (matched by admin)',
      hook.id,
    )
    return c.json({ order: billing.markPaid(order.id, `matched webhook #${hook.id}`) })
  })

  app.get('/api/admin/kiosks', (c) =>
    c.json({
      kiosks: db
        .query<
          {
            id: string
            license_key: string | null
            name: string
            version: string
            last_seen: number
            sessions: number
          },
          []
        >('SELECT * FROM kiosks ORDER BY last_seen DESC LIMIT 200')
        .all(),
    }),
  )

  app.get('/api/admin/flags', (c) => c.json(flags.get()))
  app.put('/api/admin/flags', async (c) => c.json(flags.set((await c.req.json().catch(() => ({}))) as object)))

  return app
}
