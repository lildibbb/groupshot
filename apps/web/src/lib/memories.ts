import { isRecap, type SessionRecap } from './session-recap'

export interface Memory {
  id: string
  createdAt: number
  title: string
  caption: string
  note: string
  participants: string[]
  templateId: string
  image: Blob
  recap?: SessionRecap
  shareLink?: { id: string; url: string; expiresAt: number; deleteToken: string }
}

const DB_NAME = 'groupshot-memories'
const STORE = 'memories'
const DB_VERSION = 1

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('This browser cannot save memories on this device.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Could not open saved memories.'))
    request.onblocked = () => reject(new Error('Close another Groupshot tab to finish updating saved memories.'))
  })
}

export async function saveMemory(memory: Memory): Promise<void> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(memory)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(new Error('Could not save this strip. Check available browser storage and try again.'))
    }
    tx.onabort = () => {
      db.close()
      reject(new Error('Saving this strip was cancelled.'))
    }
  })
}

export async function listMemories(): Promise<Memory[]> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).getAll()
    request.onsuccess = () => resolve((request.result as Memory[]).sort((a, b) => b.createdAt - a.createdAt))
    request.onerror = () => reject(new Error('Could not load saved memories.'))
    tx.oncomplete = () => db.close()
    tx.onerror = () => {
      db.close()
      reject(new Error('Could not load saved memories.'))
    }
  })
}

export async function deleteMemory(id: string): Promise<void> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(new Error('Could not delete this memory. Try again.'))
    }
    tx.onabort = () => {
      db.close()
      reject(new Error('Deleting this memory was cancelled.'))
    }
  })
}

export async function saveMemories(memories: Memory[]): Promise<{ added: number; skipped: number }> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    let added = 0
    const keys = store.getAllKeys()
    keys.onsuccess = () => {
      const existing = new Set(keys.result as string[])
      for (const m of memories) {
        if (existing.has(m.id)) continue
        store.put(m)
        added++
      }
    }
    tx.oncomplete = () => {
      db.close()
      resolve({ added, skipped: memories.length - added })
    }
    tx.onerror = () => {
      db.close()
      reject(new Error('Could not import these memories. Check available browser storage and try again.'))
    }
    tx.onabort = () => {
      db.close()
      reject(new Error('Importing was cancelled. Nothing was added.'))
    }
  })
}

export const MANIFEST_FORMAT = 'groupshot-memories'
export const MANIFEST_VERSION = 1
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024
export const MAX_IMPORT_MEMORIES = 500
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
const ID = /^[A-Za-z0-9_-]{1,64}$/
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

export class MemoryImportError extends Error {}

interface ManifestEntry {
  id: string
  createdAt: number
  title: string
  caption: string
  note: string
  participants: string[]
  templateId: string
  recap?: SessionRecap
  image: { type: string; data: string }
}

function toBase64(bytes: Uint8Array) {
  let out = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) out += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(out)
}

function fromBase64(data: string) {
  const raw = atob(data)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export function sniffImage(bytes: Uint8Array): (typeof IMAGE_TYPES)[number] | null {
  const at = (i: number, ...b: number[]) => b.every((v, j) => bytes[i + j] === v)
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png'
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif'
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp'
  return null
}

export async function serializeMemories(memories: Memory[], now = new Date()): Promise<string> {
  const entries: ManifestEntry[] = []
  for (const m of memories) {
    const bytes = new Uint8Array(await m.image.arrayBuffer())
    entries.push({
      id: m.id,
      createdAt: m.createdAt,
      title: m.title,
      caption: m.caption,
      note: m.note,
      participants: m.participants,
      templateId: m.templateId,
      ...(m.recap ? { recap: m.recap } : {}),
      image: { type: m.image.type || sniffImage(bytes) || 'image/png', data: toBase64(bytes) },
    })
  }
  return JSON.stringify({
    format: MANIFEST_FORMAT,
    version: MANIFEST_VERSION,
    exportedAt: now.toISOString(),
    memories: entries,
  })
}

const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max

export function parseMemoryManifest(text: string): Memory[] {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch {
    throw new MemoryImportError('That file isn’t a Groupshot export.')
  }
  const d = doc as { format?: unknown; version?: unknown; memories?: unknown }
  if (!d || d.format !== MANIFEST_FORMAT) throw new MemoryImportError('That file isn’t a Groupshot export.')
  if (d.version !== MANIFEST_VERSION) {
    throw new MemoryImportError('This export comes from a different version of Groupshot and can’t be read here.')
  }
  if (!Array.isArray(d.memories)) throw new MemoryImportError('This export has no memories in it.')
  if (d.memories.length > MAX_IMPORT_MEMORIES) {
    throw new MemoryImportError(`Exports can hold up to ${MAX_IMPORT_MEMORIES} memories.`)
  }
  const seen = new Set<string>()
  return d.memories.map((raw, i) => {
    const e = raw as ManifestEntry
    const where = `Memory ${i + 1}`
    if (!e || !str(e.id, 64) || !ID.test(e.id)) throw new MemoryImportError(`${where} has an invalid id.`)
    if (seen.has(e.id)) throw new MemoryImportError(`${where} repeats an id that’s already in this file.`)
    seen.add(e.id)
    if (!Number.isFinite(e.createdAt) || e.createdAt < 0) throw new MemoryImportError(`${where} has no valid date.`)
    if (!str(e.title, 120) || !str(e.caption, 120) || !str(e.note, 1000) || !str(e.templateId, 40)) {
      throw new MemoryImportError(`${where} is missing its title or details.`)
    }
    if (!Array.isArray(e.participants) || e.participants.length > 12 || !e.participants.every((p) => str(p, 40))) {
      throw new MemoryImportError(`${where} has an invalid list of people.`)
    }
    if (e.recap !== undefined && !isRecap(e.recap)) throw new MemoryImportError(`${where} has an unreadable recap.`)
    const img = e.image
    if (!img || !IMAGE_TYPES.includes(img.type as (typeof IMAGE_TYPES)[number])) {
      throw new MemoryImportError(`${where} isn’t a PNG, JPEG, WebP or GIF image.`)
    }
    if (typeof img.data !== 'string' || !BASE64.test(img.data) || img.data.length % 4 !== 0) {
      throw new MemoryImportError(`${where} has a damaged image.`)
    }
    if ((img.data.length / 4) * 3 > MAX_IMAGE_BYTES) throw new MemoryImportError(`${where} is too large to import.`)
    const bytes = fromBase64(img.data)
    if (sniffImage(bytes) !== img.type) throw new MemoryImportError(`${where} doesn’t contain the image it claims to.`)
    return {
      id: e.id,
      createdAt: e.createdAt,
      title: e.title,
      caption: e.caption,
      note: e.note,
      participants: e.participants,
      templateId: e.templateId,
      ...(e.recap ? { recap: e.recap } : {}),
      image: new Blob([bytes], { type: img.type }),
    }
  })
}

export async function importMemoriesFile(file: Blob) {
  if (file.size > MAX_IMPORT_BYTES) throw new MemoryImportError('That file is too large to import.')
  const memories = parseMemoryManifest(await file.text())
  return saveMemories(memories)
}
