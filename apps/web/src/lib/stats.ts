import { useEffect, useState } from 'react'
import { apiUrl } from './api'

export interface Stats {
  strips: number
  photos: number
  clips: number
  shared: number
  games: number
  live: { rooms: number; people: number }
}

export function useStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | undefined
    const fetchOnce = () =>
      fetch(apiUrl('/api/stats'))
        .then((r) => (r.ok ? r.json() : null))
        .then((s: Stats | null) => s && setStats(s))
        .catch(() => {})
    if (!('EventSource' in window)) {
      void fetchOnce()
      poll = setInterval(fetchOnce, 10_000)
      return () => clearInterval(poll)
    }
    const source = new EventSource(apiUrl('/api/stats/live'))
    source.addEventListener('stats', (e) => setStats(JSON.parse((e as MessageEvent).data)))
    source.onerror = () => {
      void fetchOnce()
    }
    return () => source.close()
  }, [])
  return stats
}
