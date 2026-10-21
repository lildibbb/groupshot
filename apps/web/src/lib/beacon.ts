import { isSessionComplete } from '@groupshot/protocol'
import { apiUrl } from './api'
import { useBooth } from './store'

export function startBeacon() {
  const reported = new Set<string>()
  return useBooth.subscribe((s) => {
    const session = s.room?.session
    if (s.mode !== 'solo' || !session || reported.has(session.id) || !isSessionComplete(session)) return
    reported.add(session.id)
    const kiosk = location.pathname.startsWith('/kiosk')
    const body = JSON.stringify({ mode: kiosk ? 'kiosk' : 'solo', template: s.room?.settings.templateId })
    try {
      navigator.sendBeacon(apiUrl('/api/beacon'), new Blob([body], { type: 'application/json' }))
    } catch {}
  })
}
