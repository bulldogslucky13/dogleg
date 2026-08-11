import { localDateKey } from '../engine/daily'
import { seasonForDate } from '../engine/season'

/**
 * The record ledger — the local half of the "record stolen" loop, for BOTH
 * boards: the all-time course records and the current season's records.
 *
 * The server already has the truth (course_records: one holder per course,
 * strictly-better beats only; season_records: the same per season), and
 * anyone can read it. So a "notification" doesn't need backend machinery at
 * all: each device remembers which records it holds, compares against the
 * server on app open, and notices the theft itself. That covers every named
 * player — even ones who never synced an email — and stays honest: a record
 * only falls when a named round actually posts.
 *
 * Season entries are stamped with their season key, and the stamp is a
 * lifetime: when the season rolls over, held season records went in the
 * books (that's the awards ceremony's moment, not a theft) and stolen ones
 * expired at the horn (the chase is over, nothing to win back). Both are
 * dropped silently on the first sync of the new season — a rollover must
 * never read as a wave of steals.
 *
 * Web push doesn't exist in this app yet; when it does, the same ledger
 * diff is the payload.
 */

export interface HeldRecord {
  toPar: number
  since: number
}

export interface StolenRecord {
  /** the thief's clubhouse name */
  by: string
  theirToPar: number
  /** what the record was when it was ours */
  myToPar: number
  at: number
  /** dateKey of the last day this fall was surfaced — max one per course per day */
  notifiedOn: string
  dismissed: boolean
}

/** which board an entry lives on ('both' only appears in merged presentation) */
export type RecordScope = 'alltime' | 'season'

export interface RecordLedger {
  v: 2
  /** all-time course records */
  held: Record<string, HeldRecord>
  stolen: Record<string, StolenRecord>
  /**
   * Courses whose record we took BACK, and how many times each.
   *
   * `held` and `stolen` are mutually exclusive by construction — winning a
   * record deletes its steal entry, and adopting one under our name does the
   * same — so a reclaim leaves no trace in either map and cannot be derived
   * from the ledger after the fact. It is counted at the moment it happens
   * instead, and kept forever. (Anything reading reclaims off the two maps is
   * reading a set that is always empty.)
   */
  reclaimed: Record<string, number>
  /** the season boards — every entry stamped with the season it belongs to */
  heldSeason: Record<string, HeldRecord & { seasonKey: string }>
  stolenSeason: Record<string, StolenRecord & { seasonKey: string }>
}

// the storage key predates the season shelf and deliberately stays put —
// renaming it would orphan every device's held records; the payload's `v`
// carries the real version
const LEDGER_KEY = 'dogleg:records:v1'

export function loadLedger(): RecordLedger {
  try {
    const raw = localStorage.getItem(LEDGER_KEY)
    if (raw) {
      const j = JSON.parse(raw) as {
        v?: number
        held?: RecordLedger['held']
        stolen?: RecordLedger['stolen']
        reclaimed?: RecordLedger['reclaimed']
        heldSeason?: RecordLedger['heldSeason']
        stolenSeason?: RecordLedger['stolenSeason']
      }
      // `reclaimed` and the season shelf both post-date the ledger: an older
      // document starts a zero tally and empty shelves rather than inventing
      // history it never recorded
      if (j?.v === 1 || j?.v === 2) {
        return {
          v: 2,
          held: j.held ?? {},
          stolen: j.stolen ?? {},
          reclaimed: j.reclaimed ?? {},
          heldSeason: j.heldSeason ?? {},
          stolenSeason: j.stolenSeason ?? {},
        }
      }
    }
  } catch {
    /* fall through */
  }
  return { v: 2, held: {}, stolen: {}, reclaimed: {}, heldSeason: {}, stolenSeason: {} }
}

export function saveLedger(ledger: RecordLedger): void {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger))
  } catch {
    /* private mode */
  }
}

/**
 * An all-time record round of ours was confirmed by the referee. Returns the
 * steal entry when this was a RECLAIM — a course that had been stolen from
 * us — so the caller can fire the celebration.
 */
export function recordWon(courseSlug: string, toPar: number, now = Date.now()): StolenRecord | null {
  const ledger = loadLedger()
  const wasStolen = ledger.stolen[courseSlug] ?? null
  // the take-back is recorded HERE because the next line destroys the evidence
  if (wasStolen) ledger.reclaimed[courseSlug] = (ledger.reclaimed[courseSlug] ?? 0) + 1
  delete ledger.stolen[courseSlug]
  ledger.held[courseSlug] = { toPar, since: now }
  saveLedger(ledger)
  return wasStolen
}

/**
 * The season-board twin of recordWon. A steal entry from an EARLIER season is
 * dead history, not a reclaim — that chase ended at the horn — so it's
 * dropped without being returned.
 */
export function seasonRecordWon(
  courseSlug: string,
  toPar: number,
  seasonKey: string,
  now = Date.now(),
): StolenRecord | null {
  const ledger = loadLedger()
  const prior = ledger.stolenSeason[courseSlug] ?? null
  const wasStolen = prior && prior.seasonKey === seasonKey ? prior : null
  delete ledger.stolenSeason[courseSlug]
  ledger.heldSeason[courseSlug] = { toPar, since: now, seasonKey }
  saveLedger(ledger)
  return wasStolen
}

/** The server's view of one record, as the leaderboard fetchers return it. */
export interface ServerRecord {
  player_name: string
  to_par: number
}

/** Clubhouse names are case-insensitively unique (players_name_ci), and the
 * boards deliberately publish names, never player ids — so the name IS the
 * public identity this ledger keys on. */
function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}

/**
 * The reconcile pass both boards share: adopt server records bearing our
 * name, turn a held record under a new holder into a steal event, and keep a
 * stolen record's facts fresh while only re-surfacing it on a new day.
 *
 * Rate limiting lives here: a course already surfaced today keeps its
 * dismissed state even if the record changed hands again — the rivalry
 * pulls players back daily, it doesn't ping them hourly. On a later day,
 * a fresh change re-surfaces once.
 *
 * Mutates the two maps in place; `stamp` is spread into every entry this
 * pass creates (the season shelf uses it to carry the season key).
 */
type Stamp = { seasonKey?: string }

function reconcile(
  held: Record<string, HeldRecord & Stamp>,
  stolen: Record<string, StolenRecord & Stamp>,
  server: Map<string, ServerRecord>,
  myName: string,
  now: number,
  today: string,
  stamp: Stamp,
  /** fires when a stolen entry flips back to our name — the all-time caller
   * counts it into the forever reclaim tally; the season shelf passes nothing
   * (Repo Man's semantics predate seasons and stay all-time) */
  onReclaim?: (slug: string) => void,
): void {
  // adopt records bearing our name this device doesn't know about yet
  // (set on another device, or set before the ledger existed)
  for (const [slug, rec] of server) {
    if (sameName(rec.player_name, myName) && !held[slug]) {
      held[slug] = { toPar: rec.to_par, since: now, ...stamp }
    }
  }

  for (const [slug, heldRec] of Object.entries(held)) {
    const rec = server.get(slug)
    if (!rec) continue // record vanished server-side; keep our claim
    if (sameName(rec.player_name, myName)) {
      // still ours — track our own improvements
      held[slug] = { ...heldRec, toPar: rec.to_par }
      continue
    }
    // ties never steal (the referee only replaces on strictly better), so a
    // different holder always means a genuinely better round took it
    delete held[slug]
    stolen[slug] = {
      by: rec.player_name,
      theirToPar: rec.to_par,
      myToPar: heldRec.toPar,
      at: now,
      notifiedOn: today,
      dismissed: false,
      ...stamp,
    }
  }

  // a stolen record may keep moving between other players — keep the card's
  // facts fresh, but only re-surface it on a new day
  for (const [slug, stolenRec] of Object.entries(stolen)) {
    const rec = server.get(slug)
    if (!rec) continue
    if (sameName(rec.player_name, myName)) {
      // reclaimed under our name (a win posted on another device) — the
      // adoption pass above already put it back in `held`; drop the stale
      // steal so chasing()/pendingSteals() stop flagging a record we hold
      onReclaim?.(slug)
      delete stolen[slug]
      continue
    }
    if (rec.player_name !== stolenRec.by || rec.to_par !== stolenRec.theirToPar) {
      const newDay = stolenRec.notifiedOn !== today
      stolen[slug] = {
        ...stolenRec,
        by: rec.player_name,
        theirToPar: rec.to_par,
        dismissed: newDay ? false : stolenRec.dismissed,
        notifiedOn: newDay ? today : stolenRec.notifiedOn,
      }
    }
  }
}

/**
 * Reconcile the all-time shelf against the server's course records. Returns
 * the ledger (already saved).
 */
export function syncLedger(
  server: Map<string, ServerRecord>,
  myName: string | null,
  now = Date.now(),
  today = localDateKey(),
): RecordLedger {
  const ledger = loadLedger()
  if (!myName) return ledger
  reconcile(ledger.held, ledger.stolen, server, myName, now, today, {}, (slug) => {
    // reclaimed under our name on ANOTHER device — this diff is the other
    // device's recordWon() reaching us, and the last moment the take-back is
    // visible. Count it into the forever-tally (Repo Man reads it).
    ledger.reclaimed[slug] = (ledger.reclaimed[slug] ?? 0) + 1
  })
  saveLedger(ledger)
  return ledger
}

/**
 * Reconcile the season shelf against the CURRENT season's records. Entries
 * stamped with an earlier season expire here first, silently: a held record
 * went in the books at the horn and a stolen one can no longer be won back.
 * Only then does the ordinary diff run, so a rollover never reads as theft.
 */
export function syncSeasonLedger(
  server: Map<string, ServerRecord>,
  seasonKey: string,
  myName: string | null,
  now = Date.now(),
  today = localDateKey(),
): RecordLedger {
  const ledger = loadLedger()
  if (!myName) return ledger
  for (const [slug, rec] of Object.entries(ledger.heldSeason)) {
    if (rec.seasonKey !== seasonKey) delete ledger.heldSeason[slug]
  }
  for (const [slug, rec] of Object.entries(ledger.stolenSeason)) {
    if (rec.seasonKey !== seasonKey) delete ledger.stolenSeason[slug]
  }
  reconcile(ledger.heldSeason, ledger.stolenSeason, server, myName, now, today, { seasonKey })
  saveLedger(ledger)
  return ledger
}

/** One steal event, tagged with the board it happened on. A round that takes
 * both boards at once surfaces as ONE event with scope 'both' — same thief,
 * same score, one card. */
export interface PendingSteal extends StolenRecord {
  courseSlug: string
  scope: RecordScope | 'both'
}

/**
 * Steal events awaiting the player's attention, newest first.
 *
 * Season entries are filtered by season HERE as well as expired in
 * syncSeasonLedger, and the redundancy is the point: this function is read
 * synchronously at mount, before any fetch, and the sync that would expire a
 * stale entry needs a network round trip, a clubhouse name, and a live
 * server. Offline, signed out, or on a failed fetch it never runs at all —
 * so without this filter a rollover would flash last season's thefts on
 * every open and, in those cases, keep flashing them forever. A season that
 * has ended is not a chase, whatever the shelf still holds.
 */
export function pendingSteals(ledger = loadLedger(), seasonKey = seasonForDate().key): PendingSteal[] {
  const alltime = Object.entries(ledger.stolen)
    .filter(([, s]) => !s.dismissed)
    .map(([courseSlug, s]) => ({ courseSlug, scope: 'alltime' as const, ...s }))
  const season = Object.entries(ledger.stolenSeason)
    .filter(([, s]) => !s.dismissed && s.seasonKey === seasonKey)
    .map(([courseSlug, s]) => ({ courseSlug, scope: 'season' as const, ...s }))
  // one better round routinely takes both boards from the same holder — that
  // is one theft, not two cards
  const merged: PendingSteal[] = []
  for (const a of alltime) {
    const twin = season.find(
      (s) => s.courseSlug === a.courseSlug && sameName(s.by, a.by) && s.theirToPar === a.theirToPar,
    )
    merged.push(twin ? { ...a, scope: 'both' } : a)
  }
  for (const s of season) {
    const absorbed = merged.some((m) => m.scope === 'both' && m.courseSlug === s.courseSlug)
    if (!absorbed) merged.push(s)
  }
  return merged.sort((a, b) => b.at - a.at)
}

/** Dismiss every pending steal card (the banner is one surface, one ✕). */
export function dismissSteals(today = localDateKey()): void {
  const ledger = loadLedger()
  for (const s of [...Object.values(ledger.stolen), ...Object.values(ledger.stolenSeason)]) {
    s.dismissed = true
    s.notifiedOn = today
  }
  saveLedger(ledger)
}

/** The ALL-TIME record this player is chasing on a course, if one was stolen
 * from them. (The ghost logic keys on this — the ghost races the all-time
 * record, never the season one.) */
export function chasing(courseSlug: string, ledger = loadLedger()): StolenRecord | null {
  return ledger.stolen[courseSlug] ?? null
}

/** The CURRENT season's stolen record on a course, if any. An entry from an
 * earlier season is dead history, never a chase. */
export function chasingSeason(
  courseSlug: string,
  seasonKey: string,
  ledger = loadLedger(),
): StolenRecord | null {
  const s = ledger.stolenSeason[courseSlug] ?? null
  return s && s.seasonKey === seasonKey ? s : null
}

/** Which board the ghost should race by default on this course: the season
 * board when a season record was stolen from this player and the all-time
 * one wasn't ("win it back" should race the thing being won back) — the
 * all-time board in every other case, including both-stolen (the bigger
 * prize; a round beating the all-time score beats the season score too). */
export function defaultChaseBoard(courseSlug: string, seasonKey: string, ledger = loadLedger()): RecordScope {
  return !chasing(courseSlug, ledger) && chasingSeason(courseSlug, seasonKey, ledger) ? 'season' : 'alltime'
}
