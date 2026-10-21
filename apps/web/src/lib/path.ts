import type { StopId } from './activities'

const KEY = 'groupshot.tried'
const listeners = new Set<() => void>()
let cache: string | null = null
let parsed: StopId[] = []

function read(): StopId[] {
  try {
    const raw = localStorage.getItem(KEY) ?? '[]'
    if (raw !== cache) {
      cache = raw
      const list: unknown = JSON.parse(raw)
      parsed = Array.isArray(list) ? list.filter((x): x is StopId => typeof x === 'string') : []
    }
  } catch {}
  return parsed
}

export function markTried(id: StopId) {
  const list = read()
  if (list.includes(id)) return
  try {
    localStorage.setItem(KEY, JSON.stringify([...list, id]))
  } catch {
    parsed = [...list, id]
  }
  for (const l of listeners) l()
}
