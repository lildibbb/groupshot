import { apiUrl } from './api'

export interface Plan {
  id: 'event' | 'studio'
  name: string
  priceSen: number
  priceLabel: string
  days: number
  kiosks: number
  keepDays: number
  features: string[]
  sociabuzzMin: { amount: number; currency: string }
}

export type ProviderId = 'billplz' | 'sociabuzz' | 'manual'

export interface PublicOrder {
  id: string
  plan: Plan['id']
  provider: ProviderId
  amount: number
  amountLabel: string
  code: string
  status: 'pending' | 'review' | 'paid' | 'failed' | 'expired' | 'rejected'
  label: string
  createdAt: number
  paidAt: number | null
  licenseKey: string | null
}

export interface Checkout {
  order: PublicOrder
  token: string
  redirectUrl?: string
  pay?: {
    url?: string
    code?: string
    min?: Plan['sociabuzzMin']
    qrImageUrl?: string
    payee?: string
    amountLabel?: string
  }
}

export interface LicenseInfo {
  key: string
  valid: boolean
  reason: string | null
  plan: Plan['id']
  planName: string
  label: string
  expiresAt: number
  kiosks: number
  keepDays: number
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
  return body as T
}

const send = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

export const getPlans = () =>
  fetch(apiUrl('/api/billing/plans')).then((r) =>
    json<{ plans: Plan[]; providers: ProviderId[]; checkoutPaused: boolean }>(r),
  )

export const checkout = (input: { plan: string; provider: ProviderId; email: string; name: string; label: string }) =>
  send('/api/billing/checkout', input).then((r) => json<Checkout>(r))

export const getOrder = (id: string, token: string) =>
  fetch(apiUrl(`/api/billing/orders/${id}`), { headers: { 'x-order-token': token } }).then((r) => json<PublicOrder>(r))

export const claimTransfer = (id: string, token: string, reference: string) =>
  send(`/api/billing/orders/${id}/claim`, { reference }, { 'x-order-token': token }).then((r) => json<PublicOrder>(r))

export const confirmBillplzReturn = (id: string, token: string, params: Record<string, string>) =>
  send(`/api/billing/orders/${id}/billplz-return`, params, { 'x-order-token': token }).then((r) => json<PublicOrder>(r))

export const getLicense = (key: string) =>
  fetch(apiUrl(`/api/license/${encodeURIComponent(key.trim())}`)).then((r) => json<LicenseInfo>(r))

export const getGallery = (key: string) =>
  fetch(apiUrl(`/api/license/${encodeURIComponent(key)}/gallery`)).then((r) =>
    json<{ items: { id: string; type: string; createdAt: number; url: string }[] }>(r),
  )

export const galleryCsvUrl = (key: string) => apiUrl(`/api/license/${encodeURIComponent(key)}/gallery?format=csv`)

export const heartbeat = (body: {
  id: string
  license: string | null
  name: string
  sessions: number
  version: string
}) =>
  send('/api/kiosk/heartbeat', body).then((r) =>
    json<{ licensed: boolean; reason: string | null; label: string; expiresAt: number | null }>(r),
  )

export const getFlags = () =>
  fetch(apiUrl('/api/flags')).then((r) =>
    json<{ announcement: string; roomsPaused: boolean; checkoutPaused: boolean }>(r),
  )

const LICENSE_KEY = 'groupshot.license'
const ORDER_KEY = 'groupshot.order'

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export const savedLicense = () => safe(() => localStorage.getItem(LICENSE_KEY), null)
export const saveLicense = (key: string | null) =>
  safe(() => (key ? localStorage.setItem(LICENSE_KEY, key) : localStorage.removeItem(LICENSE_KEY)), undefined)

export const savedOrder = () =>
  safe(() => JSON.parse(localStorage.getItem(ORDER_KEY) ?? 'null') as { id: string; token: string } | null, null)
export const saveOrder = (o: { id: string; token: string } | null) =>
  safe(() => (o ? localStorage.setItem(ORDER_KEY, JSON.stringify(o)) : localStorage.removeItem(ORDER_KEY)), undefined)
