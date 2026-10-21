import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { createAdminRoutes } from '../admin'
import { Analytics } from '../analytics'
import { openDb } from '../db'
import { FlagStore } from '../flags'
import { RoomRegistry } from '../rooms'
import { MemoryBlobStore } from '../storage'
import { signatureSource, verifySignature } from './billplz'
import { DEFAULT_PLANS } from './plans'
import { type BusinessConfig, createBusinessRoutes } from './routes'
import { Billing } from './service'
import { ORDER_CODE, parseTip } from './sociabuzz'

async function hmacHex(key: string, text: string) {
  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function setup(over: Partial<BusinessConfig> = {}, fetcher?: typeof fetch) {
  let now = Date.UTC(2026, 9, 21, 12)
  const clock = () => now
  const db = openDb()
  const analytics = new Analytics(db, clock)
  const billing = new Billing(db, DEFAULT_PLANS, analytics, clock)
  const flags = new FlagStore(db)
  const config: BusinessConfig = {
    webUrl: 'https://gs.test',
    apiUrl: 'https://gs.test',
    billplz: { apiKey: 'k', collectionId: 'c', xSignatureKey: 'sig-key' },
    sociabuzz: { urlKey: 'urlkey', token: 'tok', tokenHeader: 'x-webhook-token', pageUrl: 'https://sociabuzz.com/me' },
    manual: { qrImageUrl: '/qr.png', payee: 'Groupshot' },
    ...over,
  }
  const deps = {
    db,
    billing,
    analytics,
    flags,
    config,
    durable: new MemoryBlobStore(),
    clientIp: () => '1.1.1.1',
    now: clock,
    fetcher,
  }
  const registry = new RoomRegistry(clock)
  const app = new Hono()
  app.route('/', createBusinessRoutes(deps))
  app.route('/', createAdminRoutes(registry, { ...deps, adminToken: 'admin-secret', startedAt: now }))
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  return { app, db, billing, post, advance: (ms: number) => (now += ms) }
}

const buyer = { email: 'a@b.my', name: 'Aina', label: 'Wedding' }

describe('billplz signature', () => {
  it('builds the sorted pipe-joined source from the docs example', () => {
    const fields = {
      id: 'zq0tm2wc',
      collection_id: 'yhx5t1pp',
      paid: 'true',
      state: 'paid',
      amount: '100',
      paid_amount: '100',
      due_at: '2018-9-27',
      email: '',
      mobile: '',
      name: 'TESTER',
      url: 'http://www.billplz-sandbox.com/bills/zq0tm2wc',
      paid_at: '2018-09-27 15:15:09 +0800',
      x_signature: 'ignored',
    }
    expect(signatureSource(fields)).toBe(
      'amount100|collection_idyhx5t1pp|due_at2018-9-27|email|idzq0tm2wc|mobile|nameTESTER|paid_amount100|paid_at2018-09-27 15:15:09 +0800|paidtrue|statepaid|urlhttp://www.billplz-sandbox.com/bills/zq0tm2wc',
    )
  })

  it('accepts a correct signature and rejects a tampered one', async () => {
    const fields: Record<string, string> = { id: 'b1', paid: 'true', amount: '4900' }
    const x_signature = await hmacHex('sig-key', signatureSource(fields))
    expect(await verifySignature({ ...fields, x_signature }, 'sig-key')).toBe(true)
    expect(await verifySignature({ ...fields, amount: '1', x_signature }, 'sig-key')).toBe(false)
    expect(await verifySignature({ ...fields, x_signature }, 'other-key')).toBe(false)
    expect(await verifySignature(fields, 'sig-key')).toBe(false)
  })
})

describe('billplz checkout and callback', () => {
  function billplzFetch(state: { paid: boolean; paidAmount?: number }) {
    return (async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST')
        return Response.json({
          id: 'bill1',
          url: 'https://billplz.test/bills/bill1',
          paid: false,
          state: 'due',
          amount: 4900,
        })
      return Response.json({
        id: 'bill1',
        url: '',
        paid: state.paid,
        state: state.paid ? 'paid' : 'due',
        amount: 4900,
        paid_amount: state.paidAmount ?? 4900,
      })
    }) as typeof fetch
  }

  async function signed(fields: Record<string, string>) {
    return { ...fields, x_signature: await hmacHex('sig-key', signatureSource(fields)) }
  }

  it('issues a license once, even when the callback is retried', async () => {
    const t = setup({}, billplzFetch({ paid: true }))
    const res = await t.post('/api/billing/checkout', { plan: 'event', provider: 'billplz', ...buyer })
    expect(res.status).toBe(201)
    const { order, redirectUrl } = (await res.json()) as { order: { id: string }; redirectUrl: string }
    expect(redirectUrl).toContain('billplz.test')
    const cb = await signed({ id: 'bill1', paid: 'true', state: 'paid', amount: '4900', paid_amount: '4900' })
    for (let i = 0; i < 3; i++) {
      const r = await t.app.request('/api/billing/webhook/billplz', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cb),
      })
      expect(r.status).toBe(200)
    }
    expect(t.billing.get(order.id)?.status).toBe('paid')
    expect(t.billing.licenses()).toHaveLength(1)
  })

  it('rejects an unsigned callback without paying anything', async () => {
    const t = setup({}, billplzFetch({ paid: true }))
    await t.post('/api/billing/checkout', { plan: 'event', provider: 'billplz', ...buyer })
    const r = await t.post('/api/billing/webhook/billplz', { id: 'bill1', paid: 'true', x_signature: 'deadbeef' })
    expect(r.status).toBe(401)
    expect(t.billing.licenses()).toHaveLength(0)
  })

  it('does not trust a signed callback that Billplz itself says is unpaid', async () => {
    const t = setup({}, billplzFetch({ paid: false }))
    await t.post('/api/billing/checkout', { plan: 'event', provider: 'billplz', ...buyer })
    const cb = await signed({ id: 'bill1', paid: 'true', state: 'paid', amount: '4900' })
    await t.post('/api/billing/webhook/billplz', cb)
    expect(t.billing.licenses()).toHaveLength(0)
  })

  it('does not pay out when the paid amount differs from the price', async () => {
    const t = setup({}, billplzFetch({ paid: true, paidAmount: 100 }))
    await t.post('/api/billing/checkout', { plan: 'event', provider: 'billplz', ...buyer })
    const cb = await signed({ id: 'bill1', paid: 'true', state: 'paid', amount: '100' })
    await t.post('/api/billing/webhook/billplz', cb)
    expect(t.billing.licenses()).toHaveLength(0)
  })
})

describe('sociabuzz', () => {
  it('finds the order code wherever it sits in the message', () => {
    expect('thanks GS-ABC234!'.match(ORDER_CODE)?.[0]).toBe('GS-ABC234')
    const tip = parseTip({
      id: 7,
      amount: '180.000',
      currency: 'idr',
      message: 'order gs-abc234 thx',
      supporter: 'Aina',
    })
    expect(tip).toMatchObject({ id: '7', amount: 180000, currency: 'IDR', orderCode: 'GS-ABC234' })
  })

  async function open(t: ReturnType<typeof setup>) {
    const res = await t.post('/api/billing/checkout', { plan: 'event', provider: 'sociabuzz', ...buyer })
    return (await res.json()) as { order: { id: string; code: string } }
  }
  const hook = (t: ReturnType<typeof setup>, body: unknown, key = 'urlkey', headers: Record<string, string> = {}) =>
    t.post(`/api/billing/webhook/sociabuzz?key=${key}`, body, headers)

  it('pays an order from a matching tip, once', async () => {
    const t = setup()
    const { order } = await open(t)
    const tip = { id: 'tx1', amount: 200000, currency: 'IDR', message: `Order ${order.code}` }
    expect((await hook(t, tip)).status).toBe(200)
    await hook(t, tip)
    expect(t.billing.get(order.id)?.status).toBe('paid')
    expect(t.billing.licenses()).toHaveLength(1)
  })

  it('ignores a wrong url key, a wrong token and a tip that is too small', async () => {
    const t = setup()
    const { order } = await open(t)
    const tip = { id: 'tx2', amount: 200000, currency: 'IDR', message: order.code }
    expect((await hook(t, tip, 'nope')).status).toBe(401)
    expect((await hook(t, tip, 'urlkey', { 'x-webhook-token': 'wrong' })).status).toBe(401)
    await hook(t, { ...tip, id: 'tx3', amount: 5000 })
    expect(t.billing.get(order.id)?.status).toBe('pending')
  })

  it('keeps unmatched tips in the log for the admin to attach', async () => {
    const t = setup()
    await hook(t, { id: 'tx9', amount: 200000, currency: 'IDR', message: 'no code here' })
    expect(t.billing.webhooks()[0]?.outcome).toContain('no order code')
  })
})

describe('manual DuitNow / TNG', () => {
  it('gives every open transfer its own amount and needs an admin to approve', async () => {
    const t = setup()
    const amounts = new Set<number>()
    let first: { order: { id: string }; token: string } | null = null
    for (let i = 0; i < 10; i++) {
      const r = (await (
        await t.post('/api/billing/checkout', { plan: 'event', provider: 'manual', ...buyer })
      ).json()) as {
        order: { id: string; amount: number }
        token: string
      }
      amounts.add(r.order.amount)
      first ??= r
    }
    expect(amounts.size).toBe(10)
    expect([...amounts].every((a) => a > 4900 && a <= 4999)).toBe(true)

    const { order, token } = first!
    const claim = await t.post(
      `/api/billing/orders/${order.id}/claim`,
      { reference: 'TNG123' },
      { 'x-order-token': token },
    )
    expect(((await claim.json()) as { status: string }).status).toBe('review')
    expect(t.billing.licenses()).toHaveLength(0)

    const login = (await (await t.post('/api/admin/login', { token: 'admin-secret' })).json()) as { session: string }
    const auth = { authorization: `Bearer ${login.session}` }
    expect((await t.post(`/api/admin/orders/${order.id}/approve`, {})).status).toBe(401)
    expect((await t.post(`/api/admin/orders/${order.id}/approve`, {}, auth)).status).toBe(200)
    const read = await t.app.request(`/api/billing/orders/${order.id}`, { headers: { 'x-order-token': token } })
    expect(((await read.json()) as { licenseKey: string }).licenseKey).toMatch(/^GSB-/)
  })

  it('does not show an order to someone without its token', async () => {
    const t = setup()
    const { order } = (await (
      await t.post('/api/billing/checkout', { plan: 'event', provider: 'manual', ...buyer })
    ).json()) as {
      order: { id: string }
    }
    expect((await t.app.request(`/api/billing/orders/${order.id}`)).status).toBe(404)
    expect(
      (await t.app.request(`/api/billing/orders/${order.id}`, { headers: { 'x-order-token': 'guess' } })).status,
    ).toBe(404)
  })
})

describe('licenses and kiosks', () => {
  it('expires, and limits how many kiosks run on one key', async () => {
    const t = setup()
    const plan = DEFAULT_PLANS.find((p) => p.id === 'event')!
    const lic = t.billing.comp(plan, 'a@b.my', 'Test')
    const beat = async (id: string) =>
      (await (await t.post('/api/kiosk/heartbeat', { id, license: lic.key, name: id })).json()) as { licensed: boolean }
    expect((await beat('k1')).licensed).toBe(true)
    expect((await beat('k2')).licensed).toBe(true)
    expect((await beat('k3')).licensed).toBe(false)
    t.advance(6 * 60_000)
    expect((await beat('k3')).licensed).toBe(true)
    t.advance(plan.days * 86_400_000)
    expect((await beat('k3')).licensed).toBe(false)
    expect(t.billing.active(lic.key)).toBeNull()
  })

  it('stops a revoked key', () => {
    const t = setup()
    const lic = t.billing.comp(DEFAULT_PLANS[0]!, 'a@b.my', '')
    t.billing.revoke(lic.key)
    expect(t.billing.active(lic.key)).toBeNull()
  })
})

describe('admin auth', () => {
  it('requires the token and rate limits guesses', async () => {
    const t = setup()
    expect((await t.app.request('/api/admin/overview')).status).toBe(401)
    for (let i = 0; i < 5; i++) expect((await t.post('/api/admin/login', { token: 'wrong' })).status).toBe(401)
    expect((await t.post('/api/admin/login', { token: 'admin-secret' })).status).toBe(429)
  })

  it('serves the overview to a signed-in admin', async () => {
    const t = setup()
    const { session } = (await (await t.post('/api/admin/login', { token: 'admin-secret' })).json()) as {
      session: string
    }
    const res = await t.app.request('/api/admin/overview?days=7', { headers: { authorization: `Bearer ${session}` } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { live: unknown }).live).toBeDefined()
  })
})
