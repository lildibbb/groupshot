import { isSessionComplete } from '@groupshot/protocol'
import { useBooth } from './store'

export interface KioskConfig {
  license: string
  name: string
  pinHash: string
  idleSeconds: number
}

const CONFIG = 'groupshot.kiosk'
const ID = 'groupshot.kiosk.id'

export const IDLE_CHOICES = [45, 90, 180]

export function loadConfig(): KioskConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(CONFIG) ?? 'null') as KioskConfig | null
    return c?.license && c.pinHash ? c : null
  } catch {
    return null
  }
}

export function saveConfig(c: KioskConfig | null) {
  try {
    if (c) localStorage.setItem(CONFIG, JSON.stringify(c))
    else localStorage.removeItem(CONFIG)
  } catch {}
}

export function kioskId() {
  try {
    let id = localStorage.getItem(ID)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(ID, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

export async function hashPin(pin: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`groupshot-kiosk:${pin}`))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function onStripDone(fn: () => void) {
  const seen = new Set<string>()
  return useBooth.subscribe((s) => {
    const session = s.room?.session
    if (s.mode === 'solo' && session && !seen.has(session.id) && isSessionComplete(session)) {
      seen.add(session.id)
      fn()
    }
  })
}
