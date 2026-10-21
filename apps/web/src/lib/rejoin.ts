export interface SavedRoom {
  code: string
  name: string
  token: string
  at: number
}

const KEY = 'gs:room'
export const REJOIN_WINDOW_MS = 90_000

export function savedRoom(code?: string): SavedRoom | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as SavedRoom
    if (typeof saved?.code !== 'string' || typeof saved.token !== 'string') return null
    if (code && saved.code !== code) return null
    return saved
  } catch {
    return null
  }
}

export function seatLikelyHeld(saved: SavedRoom, now = Date.now()) {
  return now - saved.at < REJOIN_WINDOW_MS
}

export function saveRoom(room: Omit<SavedRoom, 'at'>, now = Date.now()) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...room, at: now }))
  } catch {}
}

export function touchRoom(now = Date.now()) {
  const saved = savedRoom()
  if (saved) saveRoom(saved, now)
}

export function forgetRoom() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {}
}
