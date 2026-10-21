export function scheduledRoundAt(fireAts: number[], now: number) {
  const next = fireAts.findIndex((at) => at > now)
  return next < 0 ? Math.max(0, fireAts.length - 1) : next
}
