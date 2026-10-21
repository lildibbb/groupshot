import { apiUrl } from './api'

const SESSION = 'groupshot.admin'

function stored() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION) ?? 'null') as { session: string; expiresAt: number } | null
  } catch {
    return null
  }
}

export const isSignedIn = () => {
  const s = stored()
  return Boolean(s && s.expiresAt > Date.now())
}

export function signOut() {
  try {
    sessionStorage.removeItem(SESSION)
  } catch {}
}

export class AuthError extends Error {}

export async function signIn(token: string) {
  const res = await fetch(apiUrl('/api/admin/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const body = (await res.json().catch(() => ({}))) as { session?: string; expiresAt?: number; error?: string }
  if (!res.ok || !body.session) throw new Error(body.error ?? 'Could not sign in.')
  try {
    sessionStorage.setItem(SESSION, JSON.stringify({ session: body.session, expiresAt: body.expiresAt }))
  } catch {}
}

export async function adminFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(apiUrl(`/api/admin${path}`), {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${stored()?.session ?? ''}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (res.status === 401) {
    signOut()
    throw new AuthError('Your session ended. Sign in again.')
  }
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
  return body as T
}

export interface Delta {
  current: number
  previous: number
}
export interface Overview {
  live: { rooms: number; people: number }
  totals: Record<string, number>
  windowDays: number
  metrics: Record<string, Delta>
  revenueSen: Delta
  orders: Record<string, number>
  server: {
    uptimeMs: number
    rssBytes: number
    heapBytes: number
    blobs: { items: number; bytes: number } | null
    roomsInMemory: number
    version: string
  }
}
export interface DayPoint {
  date: string
  value: number
}
export interface Series {
  days: number
  series: Record<string, DayPoint[]>
  revenue: DayPoint[]
}
export interface Breakdown {
  templates: { key: string; value: number }[]
  modes: { key: string; value: number }[]
  devices: { key: string; value: number }[]
  countries: { key: string; value: number }[]
  providers: { key: string; value: number }[]
}
export interface AdminRoom {
  code: string
  people: number
  names: string[]
  away: number
  template: string
  shooting: boolean
  activity: string | null
  touchedAt: number
  uploadedBytes: number
  keeps: number
}
export interface AdminOrder {
  id: string
  plan: string
  provider: string
  amount_sen: number
  email: string
  name: string
  label: string
  code: string
  status: string
  claim_ref: string | null
  license_key: string | null
  note: string
  created_at: number
  paid_at: number | null
}
export interface AdminLicense {
  key: string
  plan: string
  email: string
  label: string
  created_at: number
  expires_at: number
  revoked: number
}
export interface AdminWebhook {
  id: number
  provider: string
  received_at: number
  ok: number
  outcome: string
  order_id: string | null
  body: string
}
export interface AdminKiosk {
  id: string
  license_key: string | null
  name: string
  version: string
  last_seen: number
  sessions: number
}
export interface Flags {
  announcement: string
  roomsPaused: boolean
  checkoutPaused: boolean
}
