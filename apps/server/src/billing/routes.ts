import { Hono } from 'hono'
import type { Analytics } from '../analytics'
import type { Db } from '../db'
import type { FlagStore } from '../flags'
import { RateLimiter } from '../limits'
import type { BlobStore } from '../storage'
import { Billplz, type BillplzConfig } from './billplz'
import { formatRm } from './plans'
import type { Billing, Order, Provider } from './service'
import { authorize, parseTip, type SociabuzzConfig } from './sociabuzz'

export interface ManualConfig {
  qrImageUrl: string
  payee: string
}

export interface BusinessConfig {
  webUrl: string
  apiUrl: string
  billplz?: BillplzConfig
  sociabuzz?: SociabuzzConfig
  manual?: ManualConfig
}

export interface BusinessDeps {
  db: Db
  billing: Billing
  analytics: Analytics
  flags: FlagStore
  config: BusinessConfig
  durable: BlobStore
  clientIp: (c: { req: { header(name: string): string | undefined }; env?: { ip?: string } }) => string
  now?: () => number
  fetcher?: typeof fetch
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const KIOSK_SEAT_MS = 5 * 60_000

export function providers(config: BusinessConfig): Provider[] {
  return [
    ...(config.billplz ? (['billplz'] as const) : []),
    ...(config.manual ? (['manual'] as const) : []),
    ...(config.sociabuzz ? (['sociabuzz'] as const) : []),
  ]
}

function publicOrder(o: Order) {
  return {
    id: o.id,
    plan: o.plan,
    provider: o.provider,
    amount: o.amount_sen,
    amountLabel: formatRm(o.amount_sen),
    code: o.code,
    status: o.status,
    label: o.label,
    createdAt: o.created_at,
    paidAt: o.paid_at,
    licenseKey: o.status === 'paid' ? o.license_key : null,
  }
}

async function formFields(req: Request) {
  const type = req.headers.get('content-type') ?? ''
  if (type.includes('application/json')) return (await req.json()) as Record<string, string>
  const form = await req.formData()
  const out: Record<string, string> = {}
  for (const [k, v] of form) if (typeof v === 'string') out[k] = v
  return out
}

export function createBusinessRoutes(deps: BusinessDeps) {
  const { billing, analytics, flags, config, db } = deps
  const now = deps.now ?? Date.now
  const app = new Hono<{ Bindings: { ip?: string } }>()
  const checkoutLimiter = new RateLimiter(10, 10 * 60_000, now)
  const claimLimiter = new RateLimiter(10, 60 * 60_000, now)
  const billplz = config.billplz ? new Billplz(config.billplz, deps.fetcher) : null

  async function settleBill(billId: string, source: string, raw: string) {
    const order = billing.byProviderRef('billplz', billId)
    if (!order) {
      billing.logWebhook({
        provider: 'billplz',
        externalId: null,
        ok: false,
        outcome: `${source}: unknown bill ${billId}`,
        body: raw,
      })
      return { ok: false as const, reason: 'unknown bill' }
    }
    const bill = await billplz!.getBill(billId)
    const paidAmount = bill.paid_amount ?? bill.amount
    if (!bill.paid || bill.state !== 'paid') {
      billing.logWebhook({
        provider: 'billplz',
        ok: false,
        outcome: `${source}: bill state ${bill.state}`,
        orderId: order.id,
        body: raw,
      })
      return { ok: false as const, reason: 'not paid' }
    }
    if (paidAmount !== order.amount_sen) {
      billing.logWebhook({
        provider: 'billplz',
        ok: false,
        outcome: `${source}: amount ${paidAmount} != ${order.amount_sen}`,
        orderId: order.id,
        body: raw,
      })
      return { ok: false as const, reason: 'amount mismatch' }
    }
    billing.logWebhook({
      provider: 'billplz',
      externalId: billId,
      ok: true,
      outcome: `${source}: paid`,
      orderId: order.id,
      body: raw,
    })
    return { ok: true as const, order: billing.markPaid(order.id, `Billplz ${billId}`)! }
  }

  app.get('/api/flags', (c) => c.json(flags.get(), 200, { 'cache-control': 'public, max-age=30' }))

  app.get('/api/billing/plans', (c) =>
    c.json({
      plans: billing.plans.map((p) => ({ ...p, priceLabel: formatRm(p.priceSen) })),
      providers: providers(config),
      checkoutPaused: flags.get().checkoutPaused,
    }),
  )

  app.post('/api/billing/checkout', async (c) => {
    if (flags.get().checkoutPaused) return c.json({ error: 'Checkout is paused for a moment. Try again later.' }, 503)
    if (!checkoutLimiter.hit(deps.clientIp(c))) return c.json({ error: 'Too many checkouts. Try again soon.' }, 429)
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const plan = billing.plan(String(body.plan ?? ''))
    const provider = String(body.provider ?? '') as Provider
    const email = String(body.email ?? '')
      .trim()
      .slice(0, 120)
    const name = String(body.name ?? '')
      .trim()
      .slice(0, 80)
    const label = String(body.label ?? '')
      .trim()
      .slice(0, 60)
    if (!plan) return c.json({ error: 'Pick a plan.' }, 400)
    if (!providers(config).includes(provider)) return c.json({ error: 'That payment method is not available.' }, 400)
    if (!EMAIL.test(email)) return c.json({ error: 'Enter the email your key should go to.' }, 400)
    if (!name) return c.json({ error: 'Enter your name.' }, 400)

    let created: Awaited<ReturnType<Billing['createOrder']>>
    try {
      created = await billing.createOrder({ plan, provider, email, name, label })
    } catch (e) {
      return c.json({ error: (e as Error).message }, 503)
    }
    const { order, token } = created
    const back = `${config.webUrl}/billing/return?order=${order.id}`

    if (provider === 'billplz') {
      try {
        const bill = await billplz!.createBill({
          email,
          name,
          amountSen: order.amount_sen,
          description: `Groupshot ${plan.name}${label ? ` for ${label}` : ''}`,
          callbackUrl: `${config.apiUrl}/api/billing/webhook/billplz`,
          redirectUrl: back,
          reference: order.code,
        })
        billing.setProviderRef(order.id, bill.id)
        return c.json({ order: publicOrder(order), token, redirectUrl: bill.url }, 201)
      } catch (e) {
        billing.setStatus(order.id, 'failed', (e as Error).message)
        return c.json({ error: 'The payment page could not be opened. Try again or pick another method.' }, 502)
      }
    }
    if (provider === 'sociabuzz') {
      return c.json(
        {
          order: publicOrder(order),
          token,
          pay: { url: config.sociabuzz!.pageUrl, code: order.code, min: plan.sociabuzzMin },
        },
        201,
      )
    }
    return c.json(
      {
        order: publicOrder(order),
        token,
        pay: {
          qrImageUrl: config.manual!.qrImageUrl,
          payee: config.manual!.payee,
          amountLabel: formatRm(order.amount_sen),
        },
      },
      201,
    )
  })

  app.get('/api/billing/orders/:id', async (c) => {
    const id = c.req.param('id')
    if (!(await billing.canRead(id, c.req.header('x-order-token') ?? '')))
      return c.json({ error: 'No such order.' }, 404)
    return c.json(publicOrder(billing.get(id)!))
  })

  app.post('/api/billing/orders/:id/billplz-return', async (c) => {
    const id = c.req.param('id')
    if (!billplz || !(await billing.canRead(id, c.req.header('x-order-token') ?? ''))) {
      return c.json({ error: 'No such order.' }, 404)
    }
    const fields = (await c.req.json().catch(() => ({}))) as Record<string, string>
    const order = billing.get(id)!
    if (order.status === 'paid') return c.json(publicOrder(order))
    if (!(await billplz.verify(fields)) || fields['billplz[id]'] !== order.provider_ref) {
      return c.json({ error: 'That payment link did not check out.' }, 400)
    }
    if (fields['billplz[paid]'] !== 'true') return c.json(publicOrder(order))
    const result = await settleBill(order.provider_ref!, 'redirect', JSON.stringify(fields)).catch(() => null)
    return c.json(publicOrder(result?.ok ? result.order : billing.get(id)!))
  })

  app.post('/api/billing/orders/:id/claim', async (c) => {
    const id = c.req.param('id')
    if (!claimLimiter.hit(deps.clientIp(c))) return c.json({ error: 'Too many tries. Try again later.' }, 429)
    if (!(await billing.canRead(id, c.req.header('x-order-token') ?? '')))
      return c.json({ error: 'No such order.' }, 404)
    const { reference } = (await c.req.json().catch(() => ({}))) as { reference?: string }
    if (!reference?.trim()) return c.json({ error: 'Enter the reference from your banking or TNG receipt.' }, 400)
    const result = billing.claim(id, reference.trim())
    if ('error' in result) return c.json({ error: result.error }, 409)
    return c.json(publicOrder(result.order))
  })

  app.post('/api/billing/webhook/billplz', async (c) => {
    if (!billplz) return c.text('not configured', 404)
    const fields = await formFields(c.req.raw)
    const raw = JSON.stringify(fields)
    if (!(await billplz.verify(fields))) {
      billing.logWebhook({ provider: 'billplz', ok: false, outcome: 'bad signature', body: raw })
      return c.text('bad signature', 401)
    }
    if (fields.paid !== 'true') {
      billing.logWebhook({
        provider: 'billplz',
        ok: false,
        outcome: `callback: ${fields.state ?? 'unpaid'}`,
        body: raw,
      })
      return c.text('OK')
    }
    try {
      await settleBill(fields.id ?? '', 'callback', raw)
    } catch (e) {
      billing.logWebhook({
        provider: 'billplz',
        ok: false,
        outcome: `verify failed: ${(e as Error).message}`,
        body: raw,
      })
      return c.text('retry', 503)
    }
    return c.text('OK')
  })

  app.post('/api/billing/webhook/sociabuzz', async (c) => {
    const sb = config.sociabuzz
    if (!sb) return c.text('not configured', 404)
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const raw = JSON.stringify(body ?? {})
    const denied = authorize(sb, { query: c.req.query('key'), header: (n) => c.req.header(n) }, body ?? {})
    if (denied || !body) {
      billing.logWebhook({ provider: 'sociabuzz', ok: false, outcome: denied ?? 'not json', body: raw })
      return c.text('unauthorized', 401)
    }
    const tip = parseTip(body)
    const reply = () => c.text(process.env.SOCIABUZZ_TEST_RESPONSE ?? 'OK')
    const order = tip.orderCode ? billing.byCode(tip.orderCode) : null
    if (order?.provider !== 'sociabuzz') {
      billing.logWebhook({
        provider: 'sociabuzz',
        ok: false,
        outcome: tip.orderCode ? `unknown code ${tip.orderCode}` : 'no order code in message',
        body: raw,
      })
      return reply()
    }
    const plan = billing.plan(order.plan)!
    if (tip.currency !== plan.sociabuzzMin.currency || tip.amount < plan.sociabuzzMin.amount) {
      billing.logWebhook({
        provider: 'sociabuzz',
        ok: false,
        outcome: `amount ${tip.amount} ${tip.currency} below ${plan.sociabuzzMin.amount} ${plan.sociabuzzMin.currency}`,
        orderId: order.id,
        body: raw,
      })
      return reply()
    }
    if (order.status !== 'paid' && order.status !== 'pending') {
      billing.logWebhook({
        provider: 'sociabuzz',
        ok: false,
        outcome: `order is ${order.status}`,
        orderId: order.id,
        body: raw,
      })
      return reply()
    }
    if (
      !billing.logWebhook({
        provider: 'sociabuzz',
        externalId: tip.id,
        ok: true,
        outcome: 'paid',
        orderId: order.id,
        body: raw,
      })
    ) {
      return reply()
    }
    billing.markPaid(order.id, `SociaBuzz ${tip.id ?? ''} ${tip.supporter}`.trim())
    return reply()
  })

  app.get('/api/license/:key', (c) => {
    const l = billing.license(c.req.param('key'))
    const active = billing.active(c.req.param('key'))
    if (!l) return c.json({ error: 'That key was not found. Check it against your receipt email.' }, 404)
    const plan = billing.plan(l.plan)
    return c.json({
      key: l.key,
      valid: Boolean(active),
      reason: l.revoked ? 'revoked' : active ? null : 'expired',
      plan: l.plan,
      planName: plan?.name ?? l.plan,
      label: l.label,
      expiresAt: l.expires_at,
      kiosks: plan?.kiosks ?? 1,
      keepDays: plan?.keepDays ?? 1,
    })
  })

  app.get('/api/license/:key/gallery', (c) => {
    const l = billing.license(c.req.param('key'))
    if (!l) return c.json({ error: 'That key was not found.' }, 404)
    const rows = db
      .query<{ keep_id: string; type: string; created_at: number }, [string]>(
        'SELECT keep_id, type, created_at FROM gallery WHERE license_key = ? ORDER BY created_at DESC LIMIT 1000',
      )
      .all(l.key)
    const items = rows.map((r) => ({
      id: r.keep_id,
      type: r.type,
      createdAt: r.created_at,
      url: `/api/keep/${r.keep_id}`,
    }))
    if (c.req.query('format') === 'csv') {
      const lines = [
        'id,type,created_at,url',
        ...items.map((i) => `${i.id},${i.type},${new Date(i.createdAt).toISOString()},${config.apiUrl}${i.url}`),
      ]
      return c.body(lines.join('\n'), 200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="groupshot-${l.key}.csv"`,
      })
    }
    return c.json({ items })
  })

  app.get('/api/license/:key/kiosks', (c) => {
    const l = billing.license(c.req.param('key'))
    if (!l) return c.json({ error: 'That key was not found.' }, 404)
    return c.json({
      kiosks: db
        .query<{ id: string; name: string; last_seen: number; sessions: number; version: string }, [string]>(
          'SELECT id, name, last_seen, sessions, version FROM kiosks WHERE license_key = ? ORDER BY last_seen DESC',
        )
        .all(l.key),
    })
  })

  app.post('/api/kiosk/heartbeat', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const id = String(body.id ?? '')
      .replace(/[^a-z0-9-]/gi, '')
      .slice(0, 40)
    if (!id) return c.json({ error: 'missing id' }, 400)
    const name = String(body.name ?? 'Kiosk').slice(0, 40)
    const version = String(body.version ?? '').slice(0, 20)
    const sessions = Math.max(0, Math.min(100_000, Number(body.sessions) || 0))
    const key = typeof body.license === 'string' ? body.license : null
    const active = billing.active(key)
    let licensed = Boolean(active)
    let reason: string | null = key && !active ? 'This key is expired or revoked.' : null
    if (active) {
      const { n } = db
        .query<{ n: number }, [string, string, number]>(
          'SELECT COUNT(*) AS n FROM kiosks WHERE license_key = ? AND id != ? AND last_seen > ?',
        )
        .get(active.key, id, now() - KIOSK_SEAT_MS)!
      if (n >= active.plan.kiosks) {
        licensed = false
        reason = `This key already runs ${active.plan.kiosks} kiosks.`
      }
    }
    db.query(
      `INSERT INTO kiosks (id, license_key, name, version, last_seen, sessions) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET license_key = excluded.license_key, name = excluded.name,
         version = excluded.version, last_seen = excluded.last_seen, sessions = excluded.sessions`,
    ).run(id, licensed ? active!.key : null, name, version, now(), sessions)
    return c.json({
      licensed,
      reason,
      label: licensed ? active!.label : '',
      expiresAt: licensed ? active!.expires_at : null,
    })
  })

  const beaconLimiter = new RateLimiter(120, 60 * 60_000, now)
  app.post('/api/beacon', async (c) => {
    if (!beaconLimiter.hit(deps.clientIp(c))) return c.body(null, 204)
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const mode = ['solo', 'room', 'kiosk'].includes(String(body.mode)) ? String(body.mode) : 'solo'
    const template = typeof body.template === 'string' ? body.template : undefined
    analytics.track('frames', { template, mode })
    if (mode === 'solo' || mode === 'kiosk') analytics.track(mode)
    return c.body(null, 204)
  })

  return app
}
