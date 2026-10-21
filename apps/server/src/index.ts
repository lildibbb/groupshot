import { mkdir } from 'node:fs/promises'
import { ROOM_CODE_PATTERN } from '@groupshot/protocol'
import type { ServerWebSocket } from 'bun'
import { createAdminRoutes } from './admin'
import { Analytics, deviceClass } from './analytics'
import { createApp } from './app'
import { loadPlans } from './billing/plans'
import { createBusinessRoutes } from './billing/routes'
import { Billing } from './billing/service'
import { openDb } from './db'
import { FlagStore } from './flags'
import { createIceRoutes } from './ice'
import { RoomRegistry } from './rooms'
import { createStaticHandler } from './static'
import { DiskBlobStore, R2BlobStore } from './storage'

interface WsData {
  code: string
  name: string
  resume?: string
  memberId?: string
}

const dataDir = process.env.DATA_DIR ?? './data'
await mkdir(dataDir, { recursive: true })
const db = openDb(`${dataDir}/groupshot.sqlite`)
const analytics = new Analytics(db)
const flags = new FlagStore(db)
const startedAt = Date.now()
const durable =
  process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
    ? new R2BlobStore({
        accountId: process.env.R2_ACCOUNT_ID,
        bucket: process.env.R2_BUCKET,
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      })
    : new DiskBlobStore(`${dataDir}/blobs`)
const serveWeb = process.env.WEB_DIST ? createStaticHandler(process.env.WEB_DIST) : null
const registry = new RoomRegistry(Date.now, durable)
const billing = new Billing(db, loadPlans(), analytics)
const { app, sweep, clientIp } = createApp(registry, {
  corsOrigin: process.env.CORS_ORIGIN,
  trustProxy: process.env.TRUST_PROXY === '1',
  roomsPaused: () => flags.get().roomsPaused,
  business: { billing, analytics, db },
})
const businessConfig = {
  webUrl: process.env.WEB_URL ?? 'http://localhost:5173',
  apiUrl: process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 8787}`,
  billplz:
    process.env.BILLPLZ_API_KEY && process.env.BILLPLZ_COLLECTION_ID && process.env.BILLPLZ_X_SIGNATURE_KEY
      ? {
          apiKey: process.env.BILLPLZ_API_KEY,
          collectionId: process.env.BILLPLZ_COLLECTION_ID,
          xSignatureKey: process.env.BILLPLZ_X_SIGNATURE_KEY,
          sandbox: process.env.BILLPLZ_SANDBOX === '1',
        }
      : undefined,
  sociabuzz:
    process.env.SOCIABUZZ_URL_KEY && process.env.SOCIABUZZ_PAGE_URL
      ? {
          urlKey: process.env.SOCIABUZZ_URL_KEY,
          token: process.env.SOCIABUZZ_TOKEN,
          tokenHeader: process.env.SOCIABUZZ_TOKEN_HEADER ?? 'x-webhook-token',
          pageUrl: process.env.SOCIABUZZ_PAGE_URL,
        }
      : undefined,
  manual:
    process.env.TNG_QR_IMAGE_URL && process.env.TNG_PAYEE
      ? { qrImageUrl: process.env.TNG_QR_IMAGE_URL, payee: process.env.TNG_PAYEE }
      : undefined,
}
const deps = {
  db,
  billing,
  analytics,
  flags,
  config: businessConfig,
  durable,
  adminToken: process.env.ADMIN_TOKEN ?? '',
  startedAt,
  clientIp,
}
const business = createBusinessRoutes(deps)
const admin = createAdminRoutes(registry, deps)
app.route('/', createIceRoutes({ keyId: process.env.CF_TURN_KEY_ID, apiToken: process.env.CF_TURN_API_TOKEN }))
app.route('/', business)
app.route('/', admin)
const guarded = (name: string, job: () => unknown) =>
  Promise.resolve()
    .then(job)
    .catch((err) => console.error(`sweep: ${name} failed`, err))
setInterval(() => {
  registry.sweep()
  void guarded('blobs', () => registry.blobs.sweep())
  if (durable !== registry.blobs) void guarded('durable', () => durable.sweep())
  void guarded('analytics', () => analytics.prune())
  void guarded('app', sweep)
}, 60_000)

const port = Number(process.env.PORT ?? 8787)

Bun.serve<WsData>({
  port,
  hostname: process.env.HOST ?? '0.0.0.0',
  idleTimeout: 60,
  async fetch(req, server) {
    const url = new URL(req.url)
    const match = url.pathname.match(/^\/ws\/([A-Za-z]+-\d{2})$/)
    if (match?.[1]) {
      const code = match[1].toUpperCase()
      if (!ROOM_CODE_PATTERN.test(code) || !registry.get(code)) {
        return new Response('No room with that code.', { status: 404 })
      }
      const name = (url.searchParams.get('name') ?? 'Guest').trim().slice(0, 24) || 'Guest'
      const resume = url.searchParams.get('resume')?.slice(0, 64) || undefined
      if (server.upgrade(req, { data: { code, name, resume } })) {
        if (!resume) {
          analytics.track('joins', { device: deviceClass(req.headers.get('user-agent') ?? undefined) })
        }
        return
      }
      return new Response('Upgrade failed', { status: 400 })
    }
    return (await serveWeb?.(req)) ?? app.fetch(req, { ip: server.requestIP(req)?.address })
  },
  websocket: {
    open(ws: ServerWebSocket<WsData>) {
      const room = registry.get(ws.data.code)
      if (!room) return ws.close(4004, 'gone')
      ws.data.memberId = registry.join(room, ws, ws.data.name, ws.data.resume)?.id
    },
    message(ws, raw) {
      const room = registry.get(ws.data.code)
      const member = ws.data.memberId ? room?.members.get(ws.data.memberId) : undefined
      if (room && member && member.socket === ws) registry.handle(room, member, String(raw))
    },
    close(ws) {
      const room = registry.get(ws.data.code)
      if (room && ws.data.memberId) registry.leave(room, ws.data.memberId, ws)
    },
  },
})

console.log(`groupshot server on :${port}`)
