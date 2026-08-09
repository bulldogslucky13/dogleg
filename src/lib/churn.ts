import type { CourseRecord } from './leaderboard'

/**
 * Record churn: how much the wall moved lately. Counts records whose current
 * holder took them inside the window, and how many of those fell in daily
 * play (they wear the crown). Null in, null out — an unreachable board says
 * nothing; a quiet week returns zeros and the line stays down.
 */
export interface Churn {
  total: number
  daily: number
}

export function recordChurn(
  recs: Map<string, Pick<CourseRecord, 'set_at' | 'mode'>> | null,
  now = Date.now(),
  windowDays = 7,
): Churn | null {
  if (!recs) return null
  const cutoff = now - windowDays * 86_400_000
  let total = 0
  let daily = 0
  for (const rec of recs.values()) {
    if (!rec.set_at) continue
    const t = Date.parse(rec.set_at)
    if (Number.isNaN(t) || t < cutoff) continue
    total++
    if (rec.mode === 'daily') daily++
  }
  return { total, daily }
}
