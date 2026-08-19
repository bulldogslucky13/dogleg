import type { CourseRecord } from './leaderboard'

/**
 * The hunt: which season records are actually within reach right now.
 *
 * A course counts when its season record is OPEN (nobody has posted one this
 * season) or STANDING BUT BEATABLE (at or above the attainable threshold —
 * the same design dial the course filters use). Courses whose record the
 * player already holds are their trophies, not their targets.
 *
 * Null in, null out: an unreachable board must not pretend to know (the same
 * never-pretend rule the season list follows). An EMPTY map is knowledge —
 * every course is open — and hunts fine.
 */
export interface Hunt {
  /** courses with a takeable season record (open + beatable) */
  total: number
  open: number
  /** the softest standing beatable record, for the copy — null if all open */
  worst: number | null
}

export function seasonHunt(
  recs: Map<string, Pick<CourseRecord, 'player_id' | 'to_par'>> | null,
  courseSlugs: string[],
  myId: string | null,
  attainableToPar: number,
): Hunt | null {
  if (!recs) return null
  let open = 0
  let beatable = 0
  let worst: number | null = null
  for (const slug of courseSlugs) {
    const rec = recs.get(slug)
    if (!rec) {
      open++
      continue
    }
    // by id, not name — clubhouse names are shared (see supabase/schema.sql),
    // and a namesake's trophy is still a target
    if (myId && rec.player_id === myId) continue
    if (rec.to_par >= attainableToPar) {
      beatable++
      worst = worst === null ? rec.to_par : Math.max(worst, rec.to_par)
    }
  }
  return { total: open + beatable, open, worst }
}
