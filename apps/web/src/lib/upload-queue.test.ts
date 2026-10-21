import { describe, expect, it } from 'vitest'
import { createUploadQueue, type JobState, PermanentUploadError } from './upload-queue'

const noSleep = () => Promise.resolve()

function track() {
  const log: string[] = []
  const states: Record<string, JobState[]> = {}
  const onState = (key: string) => (s: JobState) => {
    states[key] = [...(states[key] ?? []), s]
  }
  return { log, states, onState }
}

describe('upload queue', () => {
  it('runs a job once and reports it uploaded', async () => {
    const q = createUploadQueue({ sleep: noSleep })
    const t = track()
    await q.enqueue({ key: 'a', run: async () => void t.log.push('a'), onState: t.onState('a') })
    expect(t.log).toEqual(['a'])
    expect(t.states.a).toEqual(['queued', 'uploading', 'uploaded'])
    expect(q.pending()).toBe(0)
  })

  it('retries transient failures with exponential backoff', async () => {
    const waits: number[] = []
    const q = createUploadQueue({ retryDelayMs: 100, sleep: async (ms) => void waits.push(ms) })
    let calls = 0
    const t = track()
    await q.enqueue({
      key: 'a',
      run: async () => {
        if (++calls < 3) throw new Error('offline')
      },
      onState: t.onState('a'),
    })
    expect(calls).toBe(3)
    expect(waits).toEqual([100, 200])
    expect(t.states.a?.at(-1)).toBe('uploaded')
  })

  it('parks a job after three failed attempts and retries it on demand', async () => {
    const q = createUploadQueue({ sleep: noSleep })
    let calls = 0
    let online = false
    const t = track()
    await q.enqueue({
      key: 'a',
      run: async () => {
        calls++
        if (!online) throw new Error('offline')
      },
      onState: t.onState('a'),
    })
    expect(calls).toBe(3)
    expect(t.states.a?.at(-1)).toBe('failed')
    expect(q.failedKeys()).toEqual(['a'])
    online = true
    await q.retry('a')
    expect(calls).toBe(4)
    expect(t.states.a?.at(-1)).toBe('uploaded')
    expect(q.failedKeys()).toEqual([])
  })

  it('stops retrying permanent errors', async () => {
    const q = createUploadQueue({ sleep: noSleep })
    let calls = 0
    await q.enqueue({
      key: 'a',
      run: async () => {
        calls++
        throw new PermanentUploadError('session over')
      },
    })
    expect(calls).toBe(1)
    expect(q.failedKeys()).toEqual(['a'])
  })

  it('runs jobs one at a time, in order', async () => {
    const q = createUploadQueue({ sleep: noSleep })
    const log: string[] = []
    let inFlight = 0
    const job = (key: string) => ({
      key,
      run: async () => {
        inFlight++
        expect(inFlight).toBe(1)
        log.push(`start ${key}`)
        await new Promise((r) => setTimeout(r, 1))
        log.push(`end ${key}`)
        inFlight--
      },
    })
    void q.enqueue(job('photo-0'))
    void q.enqueue(job('clip-0'))
    await q.enqueue(job('photo-1'))
    expect(log).toEqual(['start photo-0', 'end photo-0', 'start clip-0', 'end clip-0', 'start photo-1', 'end photo-1'])
  })

  it('ignores a duplicate key while it is queued or running', async () => {
    const q = createUploadQueue({ sleep: noSleep })
    let calls = 0
    const job = { key: 'a', run: async () => void calls++ }
    void q.enqueue(job)
    void q.enqueue(job)
    await q.enqueue(job)
    expect(calls).toBe(1)
  })

  it('cancels queued jobs and drops the result of a running one', async () => {
    const q = createUploadQueue({ sleep: noSleep })
    const t = track()
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    let ranB = false
    void q.enqueue({ key: 'a', run: () => gate, onState: t.onState('a') })
    void q.enqueue({
      key: 'b',
      run: async () => {
        ranB = true
      },
      onState: t.onState('b'),
    })
    q.cancel('b')
    q.cancel('a')
    release()
    await q.idle()
    expect(ranB).toBe(false)
    expect(t.states.a).toEqual(['queued', 'uploading'])
    expect(q.pending()).toBe(0)
  })

  it('clear empties the queue and the failed list', async () => {
    const q = createUploadQueue({ sleep: noSleep })
    await q.enqueue({
      key: 'a',
      run: async () => {
        throw new Error('x')
      },
    })
    q.clear()
    expect(q.failedKeys()).toEqual([])
  })
})
