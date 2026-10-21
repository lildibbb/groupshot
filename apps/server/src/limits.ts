export class RateLimiter {
  private hits = new Map<string, number[]>()

  constructor(
    private max: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}

  hit(key: string): boolean {
    const cutoff = this.now() - this.windowMs
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff)
    if (recent.length >= this.max) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(this.now())
    this.hits.set(key, recent)
    return true
  }

  sweep() {
    const cutoff = this.now() - this.windowMs
    for (const [key, times] of this.hits) {
      if (!times.some((t) => t > cutoff)) this.hits.delete(key)
    }
  }
}
