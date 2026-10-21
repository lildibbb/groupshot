import { extname, join, normalize } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.wasm', '.txt', '.map'])
const FINGERPRINTED = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/

interface Cached {
  mtime: number
  gzip?: Uint8Array
  br?: Uint8Array
}
const cache = new Map<string, Cached>()

function cacheControl(path: string) {
  if (path.endsWith('.html') || path === '/') return 'no-cache'
  if (FINGERPRINTED.test(path)) return 'public, max-age=31536000, immutable'
  return 'public, max-age=604800'
}

function compress(file: Bun.BunFile, path: string, bytes: Uint8Array, accept: string) {
  if (!COMPRESSIBLE.has(extname(path)) || bytes.byteLength < 1024) return null
  let entry = cache.get(path)
  if (!entry || entry.mtime !== file.lastModified) {
    entry = { mtime: file.lastModified }
    cache.set(path, entry)
  }
  if (/\bbr\b/.test(accept)) {
    entry.br ??= brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })
    return { body: entry.br, encoding: 'br' }
  }
  if (/\bgzip\b/.test(accept)) {
    entry.gzip ??= gzipSync(bytes, { level: 6 })
    return { body: entry.gzip, encoding: 'gzip' }
  }
  return null
}

export function createStaticHandler(root: string) {
  const index = Bun.file(join(root, 'index.html'))
  return async function serve(req: Request): Promise<Response | null> {
    if (req.method !== 'GET' && req.method !== 'HEAD') return null
    const path = decodeURIComponent(new URL(req.url).pathname)
    if (path.startsWith('/api/') || path.startsWith('/ws/')) return null
    const clean = normalize(path)
    if (clean.includes('..')) return new Response('Bad path', { status: 400 })
    let file = Bun.file(join(root, clean))
    let served = clean
    if (clean.endsWith('/') || !(await file.exists())) {
      if (extname(clean) && !clean.endsWith('/')) return new Response('Not found', { status: 404 })
      file = index
      served = '/index.html'
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const headers: Record<string, string> = {
      'content-type': file.type,
      'cache-control': cacheControl(served),
      vary: 'accept-encoding',
      'x-content-type-options': 'nosniff',
    }
    const packed = compress(file, served, bytes, req.headers.get('accept-encoding') ?? '')
    if (packed) headers['content-encoding'] = packed.encoding
    const body = (packed?.body ?? bytes) as Uint8Array<ArrayBuffer>
    headers['content-length'] = String(body.byteLength)
    return new Response(req.method === 'HEAD' ? null : body, { headers })
  }
}
