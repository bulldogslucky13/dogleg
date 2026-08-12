import type { CourseRecord } from './leaderboard'

/**
 * Record churn: how much the wall moved lately. Counts the STANDING records
 * whose `set_at` falls inside the window, and how many of those were set in
 * daily play (they wear the crown). Null in, null out — an unreachable board
 * says nothing; a quiet week returns zeros and the line stays down.
 *
 * Say what this can support, because the copy has to match it: the record
 * tables keep one row per course, so this is a count of COURSES whose record
 * on the wall right now is younger than the window — not a count of
 * record-breaking events. Two things follow, and both are why the line reads
 * "records set in the past week" rather than "changed hands":
 *
 * - A course whose record fell three times this week counts once. The earlier
 *   two rows no longer exist to be counted.
 * - A first claim on a recordless course, and a holder lowering their own
 *   record, both refresh `set_at` without the record changing hands.
 *
 * An honest handoff count needs a record-event history the referee doesn't
 * write today. If one ever lands, this is the function to rewrite — and the
 * copy in HomeScreen with it.
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
