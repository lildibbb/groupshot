import { expect, test } from 'bun:test'
import { createIceRoutes } from './ice'

const turn = { iceServers: [{ urls: ['turn:turn.cloudflare.com:3478'], username: 'u', credential: 'c' }] }

test('without keys it returns no servers so the client keeps plain STUN', async () => {
  const app = createIceRoutes({})
  expect(await (await app.request('/api/ice')).json()).toEqual({ iceServers: [] })
})

test('it fetches credentials once and reuses them', async () => {
  let calls = 0
  const app = createIceRoutes({
    keyId: 'k',
    apiToken: 't',
    fetch: (async () => {
      calls++
      return Response.json(turn)
    }) as unknown as typeof fetch,
  })
  expect(await (await app.request('/api/ice')).json()).toEqual(turn)
  await app.request('/api/ice')
  expect(calls).toBe(1)
})

test('an upstream failure degrades to no servers instead of an error', async () => {
  const app = createIceRoutes({
    keyId: 'k',
    apiToken: 't',
    fetch: (async () => new Response('no', { status: 500 })) as unknown as typeof fetch,
  })
  const res = await app.request('/api/ice')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ iceServers: [] })
})
