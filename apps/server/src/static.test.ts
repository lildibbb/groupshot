import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStaticHandler } from './static'

let root = ''
let serve: ReturnType<typeof createStaticHandler>
const get = (path: string, headers: Record<string, string> = {}) => serve(new Request(`http://x${path}`, { headers }))

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'web-'))
  await mkdir(join(root, 'assets'))
  await Bun.write(join(root, 'index.html'), '<!doctype html><div id=root></div>'.repeat(60))
  await Bun.write(join(root, 'assets/app-abcdef12.js'), 'console.log(1);'.repeat(200))
  serve = createStaticHandler(root)
})
afterAll(() => rm(root, { recursive: true }))

test('app routes fall back to the shell, uncached', async () => {
  const res = (await get('/r/SNAP-42'))!
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('no-cache')
})

test('missing files 404 instead of returning the shell', async () => {
  expect((await get('/assets/nope-12345678.js'))!.status).toBe(404)
})

test('fingerprinted files are immutable and brotli-compressed when asked', async () => {
  const res = (await get('/assets/app-abcdef12.js', { 'accept-encoding': 'gzip, br' }))!
  expect(res.headers.get('cache-control')).toContain('immutable')
  expect(res.headers.get('content-encoding')).toBe('br')
  expect(Number(res.headers.get('content-length'))).toBeLessThan(3000)
})

test('api and websocket paths are left to the app', async () => {
  expect(await get('/api/health')).toBeNull()
  expect(await get('/ws/SNAP-42')).toBeNull()
})
