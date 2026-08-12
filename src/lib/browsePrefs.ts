/**
 * Unlimited-play browse preferences — the course list's sort and filter
 * configuration, remembered across sessions.
 *
 * A player who curates the list (favorites only, hard courses, beatable
 * records first) shouldn't rebuild that view every time they reopen
 * unlimited mode. The whole configuration persists here: the record-type
 * toggle, every filter, and the sort.
 *
 * Local now, portable later — same contract as the round log and favorites:
 * one versioned `dogleg:` key that an account sync can ship wholesale.
 * Loading SANITIZES field by field, so a value from a future bundle (or a
 * removed option) degrades to that field's default instead of poisoning the
 * rest of the saved view.
 */

export type RecType = 'season' | 'alltime'
export type PlayedFilter = 'all' | 'unplayed' | 'played'
export type RatingFilter = 'any' | 'easy' | 'mid' | 'hard'
export type RecordFilter = 'any' | 'open' | 'attainable' | 'mine' | 'notmine'
export type CourseSort = 'tour' | 'easiest' | 'hardest' | 'beatable' | 'recent' | 'favorites'

export interface BrowsePrefs {
  recType: RecType
  played: PlayedFilter
  rating: RatingFilter
  record: RecordFilter
  favsOnly: boolean
  sort: CourseSort
}

export const DEFAULT_BROWSE_PREFS: BrowsePrefs = {
  recType: 'season',
  played: 'all',
  rating: 'any',
  record: 'any',
  favsOnly: false,
  sort: 'tour',
}

const KEY = 'dogleg:course-browse:v1'

const one = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

export function loadBrowsePrefs(): BrowsePrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_BROWSE_PREFS
    const j = JSON.parse(raw) as Partial<BrowsePrefs>
    return {
      recType: one(j.recType, ['season', 'alltime'], DEFAULT_BROWSE_PREFS.recType),
      played: one(j.played, ['all', 'unplayed', 'played'], DEFAULT_BROWSE_PREFS.played),
      rating: one(j.rating, ['any', 'easy', 'mid', 'hard'], DEFAULT_BROWSE_PREFS.rating),
      record: one(j.record, ['any', 'open', 'attainable', 'mine', 'notmine'], DEFAULT_BROWSE_PREFS.record),
      favsOnly: j.favsOnly === true,
      sort: one(j.sort, ['tour', 'easiest', 'hardest', 'beatable', 'recent', 'favorites'], DEFAULT_BROWSE_PREFS.sort),
    }
  } catch {
    return DEFAULT_BROWSE_PREFS
  }
}

export function saveBrowsePrefs(p: BrowsePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* private mode / quota — the view still works, it just won't be remembered */
  }
}
