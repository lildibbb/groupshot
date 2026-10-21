import type { Db } from './db'
import { MemoryStats, type Totals } from './storage'

export const METRICS = [
  'rooms',
  'joins',
  'solo',
  'kiosk',
  'strips',
  'photos',
  'clips',
  'shared',
  'games',
  'frames',
  'checkouts',
  'paid',
] as const
export type Metric = (typeof METRICS)[number]

const DIMS = ['template', 'device', 'country', 'mode', 'plan', 'provider'] as const
export type Dim = (typeof DIMS)[number]

const DAY_RETENTION = 400
const HOUR_RETENTION = 72

const day = (t: number) => `d:${new Date(t).toISOString().slice(0, 10)}`
const hour = (t: number) => `h:${new Date(t).toISOString().slice(0, 13)}`

export function deviceClass(ua: string | undefined): 'phone' | 'tablet' | 'desktop' | 'unknown' {
  if (!ua) return 'unknown'
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return 'tablet'
  if (/Mobi|iPhone|Android/i.test(ua)) return 'phone'
  return 'desktop'
}

const clean = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32)

export class Analytics {
  private bumpStmt
  constructor(
    private db: Db,
    private now: () => number = Date.now,
  ) {
    this.bumpStmt = db.query(
      `INSERT INTO counters (bucket, metric, dim, n) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (bucket, metric, dim) DO UPDATE SET n = n + ?4`,
    )
  }

  track(metric: Metric, dims: Partial<Record<Dim, string | undefined>> = {}, by = 1) {
    const t = this.now()
    const d = day(t)
    const h = hour(t)
    this.db.transaction(() => {
      this.bumpStmt.run(d, metric, '', by)
      this.bumpStmt.run(h, metric, '', by)
      for (const [dim, value] of Object.entries(dims)) {
        if (!value || !DIMS.includes(dim as Dim)) continue
        this.bumpStmt.run(d, metric, `${dim}=${clean(value)}`, by)
      }
    })()
  }

  daily(metric: Metric, days: number) {
    const t = this.now()
    const keys = Array.from({ length: days }, (_, i) => day(t - (days - 1 - i) * 86_400_000))
    const rows = this.db
      .query<{ bucket: string; n: number }, [string, string, string]>(
        `SELECT bucket, n FROM counters WHERE metric = ?1 AND dim = '' AND bucket BETWEEN ?2 AND ?3`,
      )
      .all(metric, keys[0]!, keys.at(-1)!)
    const map = new Map(rows.map((r) => [r.bucket, r.n]))
    return keys.map((k) => ({ date: k.slice(2), value: map.get(k) ?? 0 }))
  }

  hourly(metric: Metric, hours = 24) {
    const t = this.now()
    const keys = Array.from({ length: hours }, (_, i) => hour(t - (hours - 1 - i) * 3_600_000))
    const rows = this.db
      .query<{ bucket: string; n: number }, [string, string, string]>(
        `SELECT bucket, n FROM counters WHERE metric = ?1 AND dim = '' AND bucket BETWEEN ?2 AND ?3`,
      )
      .all(metric, keys[0]!, keys.at(-1)!)
    const map = new Map(rows.map((r) => [r.bucket, r.n]))
    return keys.map((k) => ({ hour: k.slice(2), value: map.get(k) ?? 0 }))
  }

  breakdown(metric: Metric, dim: Dim, days: number, limit = 8) {
    const t = this.now()
    return this.db
      .query<{ key: string; value: number }, [string, string, string, string, number]>(
        `SELECT substr(dim, length(?2) + 2) AS key, SUM(n) AS value FROM counters
         WHERE metric = ?1 AND dim LIKE ?2 || '=%' AND bucket BETWEEN ?3 AND ?4
         GROUP BY dim ORDER BY value DESC LIMIT ?5`,
      )
      .all(metric, dim, day(t - (days - 1) * 86_400_000), day(t), limit)
  }

  sum(metric: Metric, days: number) {
    return this.daily(metric, days).reduce((a, b) => a + b.value, 0)
  }

  prune() {
    const t = this.now()
    this.db
      .query(`DELETE FROM counters WHERE bucket LIKE 'd:%' AND bucket < ?`)
      .run(day(t - DAY_RETENTION * 86_400_000))
    this.db
      .query(`DELETE FROM counters WHERE bucket LIKE 'h:%' AND bucket < ?`)
      .run(hour(t - HOUR_RETENTION * 3_600_000))
  }
}

export class RecordingStats extends MemoryStats {
  constructor(private analytics: Analytics) {
    super()
    for (const key of ['strips', 'photos', 'clips', 'shared', 'games'] as const) {
      const n = analytics.sum(key, 400)
      if (n) super.bump(key, n)
    }
  }

  override bump(key: keyof Totals, by = 1) {
    super.bump(key, by)
    this.analytics.track(key, {}, by)
  }
}
