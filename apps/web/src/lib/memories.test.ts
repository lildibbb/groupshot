import { describe, expect, it } from 'vitest'
import {
  MANIFEST_FORMAT,
  type Memory,
  MemoryImportError,
  parseMemoryManifest,
  serializeMemories,
  sniffImage,
} from './memories'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9])

function memory(over: Partial<Memory> = {}): Memory {
  return {
    id: 'm1',
    createdAt: 1_700_000_000_000,
    title: 'Friday',
    caption: 'the gang',
    note: 'after dinner',
    participants: ['Ana', 'Ben'],
    templateId: 'classic-strip',
    image: new Blob([PNG], { type: 'image/png' }),
    ...over,
  }
}

async function manifest(memories: Memory[]) {
  return JSON.parse(await serializeMemories(memories)) as { memories: Record<string, unknown>[] }
}

describe('memory export', () => {
  it('round-trips metadata and image bytes', async () => {
    const recap = {
      version: 1 as const,
      participants: ['Ana', 'Ben'],
      templateId: 'classic-strip',
      templateName: 'Classic Strip',
      shots: 4,
      framesExpected: 8,
      framesCompleted: 8,
      output: 'photo' as const,
      retakes: 0,
      date: '2026-10-20T00:00:00.000Z',
    }
    const src = [memory({ recap }), memory({ id: 'm2', image: new Blob([JPEG], { type: 'image/jpeg' }) })]
    const back = parseMemoryManifest(await serializeMemories(src))
    expect(back.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(back[0]).toMatchObject({ title: 'Friday', participants: ['Ana', 'Ben'], recap })
    expect(new Uint8Array(await back[0]!.image.arrayBuffer())).toEqual(PNG)
    expect(back[1]!.image.type).toBe('image/jpeg')
  })

  it('never writes share-link tokens into the file', async () => {
    const text = await serializeMemories([
      memory({ shareLink: { id: 'k', url: 'https://x/api/keep/k', expiresAt: 1, deleteToken: 'secret-token' } }),
    ])
    expect(text).not.toContain('secret-token')
    expect(text).not.toContain('shareLink')
  })
})

describe('memory import validation', () => {
  it('rejects other files and other versions', async () => {
    expect(() => parseMemoryManifest('not json')).toThrow(MemoryImportError)
    expect(() => parseMemoryManifest(JSON.stringify({ format: 'other', version: 1, memories: [] }))).toThrow(
      /isn’t a Groupshot export/,
    )
    expect(() => parseMemoryManifest(JSON.stringify({ format: MANIFEST_FORMAT, version: 2, memories: [] }))).toThrow(
      /different version/,
    )
  })

  it('rejects unsupported or mislabelled images', async () => {
    const m = await manifest([memory()])
    const svg = { ...m, memories: [{ ...m.memories[0], image: { type: 'image/svg+xml', data: btoa('<svg/>') } }] }
    expect(() => parseMemoryManifest(JSON.stringify({ format: MANIFEST_FORMAT, version: 1, ...svg }))).toThrow(
      /PNG, JPEG/,
    )
    const lie = { ...m, memories: [{ ...m.memories[0], image: { type: 'image/jpeg', data: btoa('hello!') } }] }
    expect(() => parseMemoryManifest(JSON.stringify({ format: MANIFEST_FORMAT, version: 1, ...lie }))).toThrow(
      /doesn’t contain/,
    )
  })

  it('rejects duplicate and invalid ids in one file, so nothing is partly written', async () => {
    const text = await serializeMemories([memory(), memory()])
    expect(() => parseMemoryManifest(text)).toThrow(/repeats an id/)
    const bad = await manifest([memory()])
    bad.memories[0]!.id = '../evil'
    expect(() => parseMemoryManifest(JSON.stringify({ format: MANIFEST_FORMAT, version: 1, ...bad }))).toThrow(
      /invalid id/,
    )
  })

  it('rejects missing metadata', async () => {
    const m = await manifest([memory()])
    delete m.memories[0]!.title
    expect(() => parseMemoryManifest(JSON.stringify({ format: MANIFEST_FORMAT, version: 1, ...m }))).toThrow(/title/)
  })

  it('sniffs real image signatures', () => {
    expect(sniffImage(PNG)).toBe('image/png')
    expect(sniffImage(JPEG)).toBe('image/jpeg')
    expect(sniffImage(new Uint8Array([1, 2, 3]))).toBeNull()
  })
})
