import type { Analytics } from '../analytics'
import type { Db } from '../db'
import type { Plan } from './plans'

export type Provider = 'billplz' | 'sociabuzz' | 'manual'
export type OrderStatus = 'pending' | 'review' | 'paid' | 'failed' | 'expired' | 'rejected'

export interface Order {
  id: string
  plan: Plan['id']
  provider: Provider
  amount_sen: number
  currency: string
  email: string
  name: string
  label: string
  code: string
  status: OrderStatus
  provider_ref: string | null
  claim_ref: string | null
  license_key: string | null
  note: string
  created_at: number
  paid_at: number | null
}

export interface License {
  key: string
  plan: Plan['id']
  order_id: string | null
  email: string
  label: string
  created_at: number
  expires_at: number
  revoked: number
}

export const ORDER_TTL_MS = 1000 * 60 * 60 * 48

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randomCode(n: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(n))
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

export async function sha256(text: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const newLicenseKey = () => `GSB-${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`

export class Billing {
  constructor(
    private db: Db,
    readonly plans: Plan[],
    private analytics?: Analytics,
    private now: () => number = Date.now,
  ) {}

  plan(id: string) {
    return this.plans.find((p) => p.id === id)
  }

  private uniqueManualAmount(base: number) {
    const open = new Set(
      this.db
        .query<{ amount_sen: number }, [number]>(
          `SELECT amount_sen FROM orders WHERE provider = 'manual' AND status IN ('pending','review') AND created_at > ?`,
        )
        .all(this.now() - ORDER_TTL_MS)
        .map((r) => r.amount_sen),
    )
    const free = Array.from({ length: 99 }, (_, i) => base + i + 1).filter((a) => !open.has(a))
    if (!free.length) return null
    return free[Math.floor(Math.random() * free.length)]!
  }

  async createOrder(input: { plan: Plan; provider: Provider; email: string; name: string; label: string }) {
    const amount = input.provider === 'manual' ? this.uniqueManualAmount(input.plan.priceSen) : input.plan.priceSen
    if (amount === null) throw new Error('Too many open transfers right now. Try again in a few minutes.')
    const id = crypto.randomUUID().replaceAll('-', '').slice(0, 20)
    const token = crypto.randomUUID().replaceAll('-', '')
    let code = `GS-${randomCode(6)}`
    while (this.db.query('SELECT 1 FROM orders WHERE code = ?').get(code)) code = `GS-${randomCode(6)}`
    const order: Order = {
      id,
      plan: input.plan.id,
      provider: input.provider,
      amount_sen: amount,
      currency: 'MYR',
      email: input.email,
      name: input.name,
      label: input.label,
      code,
      status: 'pending',
      provider_ref: null,
      claim_ref: null,
      license_key: null,
      note: '',
      created_at: this.now(),
      paid_at: null,
    }
    this.db
      .query(
        `INSERT INTO orders (id, access, plan, provider, amount_sen, currency, email, name, label, code, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        await sha256(token),
        order.plan,
        order.provider,
        order.amount_sen,
        order.currency,
        order.email,
        order.name,
        order.label,
        order.code,
        order.status,
        order.created_at,
      )
    this.analytics?.track('checkouts', { plan: order.plan, provider: order.provider })
    return { order, token }
  }

  get(id: string) {
    return this.db.query<Order, [string]>('SELECT * FROM orders WHERE id = ?').get(id)
  }

  byCode(code: string) {
    return this.db.query<Order, [string]>('SELECT * FROM orders WHERE code = ?').get(code.toUpperCase())
  }

  byProviderRef(provider: Provider, ref: string) {
    return this.db
      .query<Order, [string, string]>('SELECT * FROM orders WHERE provider = ? AND provider_ref = ?')
      .get(provider, ref)
  }

  async canRead(id: string, token: string) {
    const row = this.db.query<{ access: string }, [string]>('SELECT access FROM orders WHERE id = ?').get(id)
    return Boolean(row && token && row.access === (await sha256(token)))
  }

  setProviderRef(id: string, ref: string) {
    this.db.query('UPDATE orders SET provider_ref = ? WHERE id = ?').run(ref, id)
  }

  claim(id: string, reference: string) {
    const order = this.get(id)
    if (order?.provider !== 'manual') return { error: 'No such transfer.' as const }
    if (order.status !== 'pending' && order.status !== 'review')
      return { error: 'This order is already closed.' as const }
    this.db.query(`UPDATE orders SET status = 'review', claim_ref = ? WHERE id = ?`).run(reference.slice(0, 64), id)
    return { order: this.get(id)! }
  }

  markPaid(id: string, note = '') {
    return this.db.transaction(() => {
      const order = this.get(id)
      if (!order) return null
      if (order.status === 'paid' && order.license_key) return order
      const plan = this.plan(order.plan)
      if (!plan) return null
      const t = this.now()
      const key = newLicenseKey()
      this.db
        .query(
          'INSERT INTO licenses (key, plan, order_id, email, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(key, plan.id, order.id, order.email, order.label, t, t + plan.days * 86_400_000)
      this.db
        .query(`UPDATE orders SET status = 'paid', paid_at = ?, license_key = ?, note = ? WHERE id = ?`)
        .run(t, key, note.slice(0, 200), id)
      this.analytics?.track('paid', { plan: plan.id, provider: order.provider })
      return this.get(id)
    })()
  }

  setStatus(id: string, status: Exclude<OrderStatus, 'paid'>, note = '') {
    this.db
      .query(`UPDATE orders SET status = ?, note = ? WHERE id = ? AND status != 'paid'`)
      .run(status, note.slice(0, 200), id)
    return this.get(id)
  }

  comp(plan: Plan, email: string, label: string, days = plan.days) {
    const t = this.now()
    const key = newLicenseKey()
    this.db
      .query('INSERT INTO licenses (key, plan, email, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(key, plan.id, email, label, t, t + days * 86_400_000)
    return this.license(key)!
  }

  license(key: string) {
    return this.db.query<License, [string]>('SELECT * FROM licenses WHERE key = ?').get(key.trim().toUpperCase())
  }

  active(key: string | undefined | null) {
    if (!key) return null
    const l = this.license(key)
    if (!l || l.revoked || l.expires_at < this.now()) return null
    return { ...l, plan: this.plan(l.plan)! }
  }

  extend(key: string, days: number) {
    this.db
      .query('UPDATE licenses SET expires_at = MAX(expires_at, ?) + ? WHERE key = ?')
      .run(this.now(), days * 86_400_000, key)
    return this.license(key)
  }

  revoke(key: string, revoked = true) {
    this.db.query('UPDATE licenses SET revoked = ? WHERE key = ?').run(revoked ? 1 : 0, key)
    return this.license(key)
  }

  expireStale() {
    this.db
      .query(`UPDATE orders SET status = 'expired' WHERE status = 'pending' AND created_at < ?`)
      .run(this.now() - ORDER_TTL_MS)
  }

  logWebhook(entry: {
    provider: Provider
    externalId?: string | null
    ok: boolean
    outcome: string
    orderId?: string
    body: string
  }) {
    try {
      this.db
        .query(
          'INSERT INTO webhooks (provider, received_at, external_id, ok, outcome, order_id, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          entry.provider,
          this.now(),
          entry.externalId ?? null,
          entry.ok ? 1 : 0,
          entry.outcome,
          entry.orderId ?? null,
          entry.body.slice(0, 8000),
        )
      return true
    } catch {
      return false
    }
  }

  orders(filter: { status?: string; provider?: string; limit?: number } = {}) {
    return this.db
      .query<Order, [string, string, number]>(
        `SELECT * FROM orders WHERE (?1 = '' OR status = ?1) AND (?2 = '' OR provider = ?2)
         ORDER BY created_at DESC LIMIT ?3`,
      )
      .all(filter.status ?? '', filter.provider ?? '', Math.min(filter.limit ?? 100, 500))
  }

  licenses(limit = 200) {
    return this.db.query<License, [number]>('SELECT * FROM licenses ORDER BY created_at DESC LIMIT ?').all(limit)
  }

  webhooks(limit = 100) {
    return this.db
      .query<
        {
          id: number
          provider: string
          received_at: number
          external_id: string | null
          ok: number
          outcome: string
          order_id: string | null
          body: string
        },
        [number]
      >('SELECT * FROM webhooks ORDER BY id DESC LIMIT ?')
      .all(limit)
  }

  revenueDaily(days: number) {
    const t = this.now()
    const start = t - (days - 1) * 86_400_000
    const rows = this.db
      .query<{ d: string; sen: number }, [number]>(
        `SELECT strftime('%Y-%m-%d', paid_at / 1000, 'unixepoch') AS d, SUM(amount_sen) AS sen
         FROM orders WHERE status = 'paid' AND paid_at >= ? GROUP BY d`,
      )
      .all(start - 86_400_000)
    const map = new Map(rows.map((r) => [r.d, r.sen]))
    return Array.from({ length: days }, (_, i) => {
      const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10)
      return { date, value: map.get(date) ?? 0 }
    })
  }

  counts() {
    return this.db
      .query<{ status: string; n: number }, []>('SELECT status, COUNT(*) AS n FROM orders GROUP BY status')
      .all()
      .reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = r.n
        return acc
      }, {})
  }
}
