/**
 * The season calendar — fixed, North American, Eastern Time.
 *
 * Four seasons by calendar month, rolling over at 00:00 America/New_York on
 * the 1st of Feb / May / Aug / Nov (EST and EDT handled by asking the
 * timezone database, never by hardcoding an offset):
 *
 *   Feb Mar Apr → Spring · May Jun Jul → Summer · Aug Sep Oct → Fall
 *   Nov Dec Jan → Off Season (keyed to the year it STARTS: January 2027
 *   belongs to Off Season 2026)
 *
 * The names are cosmetic theming; every player worldwide is on the same
 * season by ET date. Season identity always carries the year ("Summer
 * 2026") for the archive.
 *
 * This module is shared VERBATIM with the referee (re-exported through the
 * validator bundle): the season a round belongs to is stamped server-side at
 * submission time from this same logic, which is what makes rollover
 * reliable with nobody online — a season's rows simply stop changing when
 * submissions start carrying the next key. Nothing here touches scoring,
 * fortunes, or rng.
 */

export interface Season {
  /** sortable archival identity, e.g. '2026-q2-summer' */
  key: string
  slug: 'spring' | 'summer' | 'fall' | 'off'
  /** display name, e.g. 'Summer Season' */
  name: string
  /** archival label, e.g. 'Summer 2026' */
  label: string
  year: number
  /** epoch ms of the season's first instant (00:00 ET on the 1st) */
  startsAt: number
  /** epoch ms of the NEXT season's first instant — exclusive end */
  endsAt: number
}

const SEASONS = [
  { slug: 'spring', name: 'Spring Season', startMonth: 1, q: 1 }, // Feb
  { slug: 'summer', name: 'Summer Season', startMonth: 4, q: 2 }, // May
  { slug: 'fall', name: 'Fall Season', startMonth: 7, q: 3 }, // Aug
  { slug: 'off', name: 'Off Season', startMonth: 10, q: 4 }, // Nov
] as const

/** calendar date parts of an instant, as seen from Eastern Time */
export function etDateParts(d: Date): { year: number; month: number; day: number } {
  // en-CA formats as YYYY-MM-DD — stable to parse, immune to locale order
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
  const [y, m, day] = s.split('-').map(Number)
  return { year: y, month: m - 1, day }
}

/** epoch ms of 00:00 America/New_York on the 1st of the given month —
 * found by asking the tz database which UTC offset that wall-clock uses
 * (5h in EST, 4h in EDT), never by assuming one */
export function etMidnightUtc(year: number, month: number): number {
  for (const offset of [5, 4]) {
    const candidate = Date.UTC(year, month, 1, offset)
    const p = etDateParts(new Date(candidate))
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        hour12: false,
      }).format(new Date(candidate)),
    )
    if (p.year === year && p.month === month && p.day === 1 && hour % 24 === 0) return candidate
  }
  // unreachable for America/New_York (offset is always 4 or 5)
  return Date.UTC(year, month, 1, 5)
}

/** the season an instant belongs to, by its ET calendar date */
export function seasonForDate(d: Date = new Date()): Season {
  const { year, month } = etDateParts(d)
  // January belongs to the Off Season that STARTED the previous November
  const anchorYear = month === 0 ? year - 1 : year
  const spec =
    month === 0
      ? SEASONS[3]
      : (SEASONS.slice()
          .reverse()
          .find((s) => s.startMonth <= month) ?? SEASONS[3])
  const startsAt = etMidnightUtc(anchorYear, spec.startMonth)
  const endMonth = spec.startMonth + 3
  const endsAt = etMidnightUtc(endMonth > 11 ? anchorYear + 1 : anchorYear, endMonth % 12)
  return {
    key: `${anchorYear}-q${spec.q}-${spec.slug}`,
    slug: spec.slug,
    name: spec.name,
    label: `${spec.slug === 'off' ? 'Off Season' : spec.name.replace(' Season', '')} ${anchorYear}`,
    year: anchorYear,
    startsAt,
    endsAt,
  }
}

/** the season immediately before the given one (for rollover recaps) */
export function previousSeason(season: Season): Season {
  return seasonForDate(new Date(season.startsAt - 1))
}

/** "12 days" / "31 hours" / "44 minutes" until the season turns */
export function seasonCountdown(season: Season, now: number = Date.now()): string {
  const ms = Math.max(0, season.endsAt - now)
  const minutes = Math.ceil(ms / 60_000)
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.ceil(ms / 3_600_000)
  if (hours <= 48) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.ceil(ms / 86_400_000)
  return `${days} day${days === 1 ? '' : 's'}`
}

/** the season's last calendar day, as ET sees it — e.g. 'October 31' */
export function seasonEndLabel(season: Season): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
  }).format(new Date(season.endsAt - 1))
}
