export type JobState = 'queued' | 'uploading' | 'uploaded' | 'failed'

export interface UploadJob {
  key: string
  run: () => Promise<void>
  onState?: (state: JobState, error?: Error) => void
}

export interface QueueOptions {
  maxAttempts?: number
  retryDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

export class PermanentUploadError extends Error {}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function createUploadQueue(options: QueueOptions = {}) {
  const maxAttempts = options.maxAttempts ?? 3
  const retryDelayMs = options.retryDelayMs ?? 600
  const sleep = options.sleep ?? realSleep
  const queue: UploadJob[] = []
  const failed = new Map<string, UploadJob>()
  const cancelled = new Set<string>()
  let active: string | null = null
  let draining: Promise<void> | null = null

  async function attempt(job: UploadJob) {
    let lastError: Error | undefined
    for (let n = 0; n < maxAttempts; n++) {
      if (cancelled.has(job.key)) return
      if (n > 0) await sleep(retryDelayMs * 2 ** (n - 1))
      if (cancelled.has(job.key)) return
      try {
        await job.run()
        if (!cancelled.has(job.key)) job.onState?.('uploaded')
        return
      } catch (err) {
        lastError = err as Error
        if (err instanceof PermanentUploadError) break
      }
    }
    if (cancelled.has(job.key)) return
    failed.set(job.key, job)
    job.onState?.('failed', lastError)
  }

  async function drain() {
    while (queue.length) {
      const job = queue.shift()!
      if (cancelled.has(job.key)) {
        cancelled.delete(job.key)
        continue
      }
      active = job.key
      job.onState?.('uploading')
      await attempt(job)
      cancelled.delete(job.key)
      active = null
    }
    draining = null
  }

  function kick() {
    draining ??= drain()
    return draining
  }

  function has(key: string) {
    return active === key || queue.some((j) => j.key === key)
  }

  function requeue(key: string) {
    const job = failed.get(key)
    if (!job) return
    failed.delete(key)
    queue.push(job)
    job.onState?.('queued')
  }

  return {
    enqueue(job: UploadJob) {
      if (has(job.key)) return kick()
      cancelled.delete(job.key)
      failed.delete(job.key)
      queue.push(job)
      job.onState?.('queued')
      return kick()
    },
    retry(key: string) {
      requeue(key)
      return kick()
    },
    retryAll() {
      for (const key of [...failed.keys()]) requeue(key)
      return kick()
    },
    cancel(key: string) {
      const i = queue.findIndex((j) => j.key === key)
      if (i >= 0) queue.splice(i, 1)
      failed.delete(key)
      if (active === key) cancelled.add(key)
    },
    clear() {
      queue.length = 0
      failed.clear()
      if (active) cancelled.add(active)
    },
    pending: () => queue.length + (active ? 1 : 0),
    failedKeys: () => [...failed.keys()],
    idle: () => draining ?? Promise.resolve(),
  }
}
