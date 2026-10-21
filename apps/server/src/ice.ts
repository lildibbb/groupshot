import { Hono } from 'hono'

export interface IceConfig {
  keyId?: string
  apiToken?: string
  fetch?: typeof fetch
  now?: () => number
}

const TTL_S = 60 * 60 * 24
const REUSE_MS = 1000 * 60 * 60 * 6

export function createIceRoutes(config: IceConfig) {
  const app = new Hono()
  const get = config.fetch ?? fetch
  const now = config.now ?? Date.now
  let cached: { at: number; iceServers: unknown[] } | null = null

  app.get('/api/ice', async (c) => {
    if (!config.keyId || !config.apiToken) return c.json({ iceServers: [] })
    if (!cached || now() - cached.at > REUSE_MS) {
      const res = await get(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${config.keyId}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${config.apiToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ ttl: TTL_S }),
        },
      ).catch(() => null)
      if (!res?.ok) return c.json({ iceServers: [] })
      const body = (await res.json().catch(() => null)) as { iceServers?: unknown[] } | null
      if (!body?.iceServers?.length) return c.json({ iceServers: [] })
      cached = { at: now(), iceServers: body.iceServers }
    }
    return c.json({ iceServers: cached.iceServers }, 200, { 'cache-control': 'private, max-age=600' })
  })
  return app
}
