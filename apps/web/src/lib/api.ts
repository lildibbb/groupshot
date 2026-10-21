import { PermanentUploadError } from './upload-queue'

const licenseKey = () => {
  try {
    return localStorage.getItem('groupshot.license')
  } catch {
    return null
  }
}

const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export const apiUrl = (path: string) => `${base}${path}`

export function wsUrl(path: string) {
  const origin = base || location.origin
  return origin.replace(/^http/, 'ws') + path
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
  return body as T
}

export const createRoom = () => fetch(apiUrl('/api/rooms'), { method: 'POST' }).then((r) => json<{ code: string }>(r))

export const getRoom = (code: string) =>
  fetch(apiUrl(`/api/rooms/${encodeURIComponent(code)}`)).then((r) => json<{ code: string; people: number }>(r))

export function isPermanentStatus(status: number) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

export async function uploadShot(
  code: string,
  token: string,
  session: string,
  round: number,
  blob: Blob,
  kind: 'photo' | 'clip' = 'photo',
) {
  const q = new URLSearchParams({ session, round: String(round), kind })
  const res = await fetch(apiUrl(`/api/rooms/${code}/shots?${q}`), {
    method: 'POST',
    headers: { 'x-peer-token': token, 'content-type': blob.type },
    body: blob,
  })
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (res.ok || (res.status === 409 && body.url)) return { url: body.url ?? '' }
  const message = body.error ?? `Upload failed (${res.status})`
  throw isPermanentStatus(res.status) ? new PermanentUploadError(message) : new Error(message)
}

export function normalizeCode(input: string): string | null {
  const fromLink = input.match(/\/r\/([A-Za-z]+-\d{2})/)?.[1]
  const raw = (fromLink ?? input).trim().toUpperCase().replace(/\s+/g, '-')
  return /^[A-Z]{4,6}-\d{2}$/.test(raw) ? raw : null
}

export interface Kept {
  id: string
  url: string
  expiresAt: number
  deleteToken: string
}

export function keepOnline(blob: Blob, room?: string) {
  const q = room && room !== 'SOLO' ? `?room=${encodeURIComponent(room)}` : ''
  return fetch(apiUrl(`/api/keep${q}`), {
    method: 'POST',
    headers: { 'content-type': blob.type, ...(licenseKey() ? { 'x-license': licenseKey()! } : {}) },
    body: blob,
  })
    .then((r) => json<Kept>(r))
    .then((k) => ({ ...k, url: new URL(apiUrl(k.url), location.origin).href }))
}

export async function deleteKept(id: string, deleteToken: string) {
  const res = await fetch(apiUrl(`/api/keep/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: { 'x-delete-token': deleteToken },
  })
  if (res.status === 204 || res.status === 404) return
  await json(res)
}
