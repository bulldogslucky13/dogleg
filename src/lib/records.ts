import { localDateKey } from '../engine/daily'

/**
 * The course-record ledger — the local half of the "record stolen" loop.
 *
 * The server already has the truth (course_records: one holder per course,
 * strictly-better beats only), and anyone can read it. So a "notification"
 * doesn't need backend machinery at all: each device remembers which records
 * it holds, compares against the server on app open, and notices the theft
 * itself. That covers every named player — even ones who never synced an
 * email — and stays honest: a record only falls when a named round actually
 * posts.
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

export interface RecordLedger {
  v: 1
  held: Record<string, HeldRecord>
  stolen: Record<string, StolenRecord>
}

const LEDGER_KEY = 'dogleg:records:v1'

export function loadLedger(): RecordLedger {
  try {
    const raw = localStorage.getItem(LEDGER_KEY)
    if (raw) {
      const j = JSON.parse(raw) as RecordLedger
      if (j?.v === 1) return { v: 1, held: j.held ?? {}, stolen: j.stolen ?? {} }
    }
  } catch {
    /* fall through */
  }
  return { v: 1, held: {}, stolen: {} }
}

export function saveLedger(ledger: RecordLedger): void {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger))
  } catch {
    /* private mode */
  }
}

/**
 * A record round of ours was confirmed by the referee. Returns the steal
 * entry when this was a RECLAIM — a course that had been stolen from us —
 * so the caller can fire the celebration.
 */
export function recordWon(courseSlug: string, toPar: number, now = Date.now()): StolenRecord | null {
  const ledger = loadLedger()
  const wasStolen = ledger.stolen[courseSlug] ?? null
  delete ledger.stolen[courseSlug]
  ledger.held[courseSlug] = { toPar, since: now }
  saveLedger(ledger)
  return wasStolen
}

/** The server's view of one course record, as fetchCourseRecords returns it. */
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
 * Reconcile the ledger against the server's records. Any held record now
 * showing a different holder became a steal event; our own better rounds
 * just update the held score. Returns the ledger (already saved).
 *
 * Rate limiting lives here: a course already surfaced today keeps its
 * dismissed state even if the record changed hands again — the rivalry
 * pulls players back daily, it doesn't ping them hourly. On a later day,
 * a fresh change re-surfaces once.
 */
export function syncLedger(
  server: Map<string, ServerRecord>,
  myName: string | null,
  now = Date.now(),
  today = localDateKey(),
): RecordLedger {
  const ledger = loadLedger()
  if (!myName) return ledger

  // adopt records bearing our name this device doesn't know about yet
  // (set on another device, or set before the ledger existed)
  for (const [slug, rec] of server) {
    if (sameName(rec.player_name, myName) && !ledger.held[slug]) {
      ledger.held[slug] = { toPar: rec.to_par, since: now }
    }
  }

  for (const [slug, held] of Object.entries(ledger.held)) {
    const rec = server.get(slug)
    if (!rec) continue // course record vanished server-side; keep our claim
    if (sameName(rec.player_name, myName)) {
      // still ours — track our own improvements
      ledger.held[slug] = { toPar: rec.to_par, since: held.since }
      continue
    }
    // ties never steal (the referee only replaces on strictly better), so a
    // different holder always means a genuinely better round took it
    delete ledger.held[slug]
    ledger.stolen[slug] = {
      by: rec.player_name,
      theirToPar: rec.to_par,
      myToPar: held.toPar,
      at: now,
      notifiedOn: today,
      dismissed: false,
    }
  }

  // a stolen record may keep moving between other players — keep the card's
  // facts fresh, but only re-surface it on a new day
  for (const [slug, stolen] of Object.entries(ledger.stolen)) {
    const rec = server.get(slug)
    if (!rec) continue
    if (sameName(rec.player_name, myName)) {
      // reclaimed under our name (a win posted on another device) — the
      // adoption pass above already put it back in `held`; drop the stale
      // steal so chasing()/pendingSteals() stop flagging a record we hold
      delete ledger.stolen[slug]
      continue
    }
    if (rec.player_name !== stolen.by || rec.to_par !== stolen.theirToPar) {
      const newDay = stolen.notifiedOn !== today
      ledger.stolen[slug] = {
        ...stolen,
        by: rec.player_name,
        theirToPar: rec.to_par,
        dismissed: newDay ? false : stolen.dismissed,
        notifiedOn: newDay ? today : stolen.notifiedOn,
      }
    }
  }

  saveLedger(ledger)
  return ledger
}

/** Steal events awaiting the player's attention, newest first. */
export function pendingSteals(ledger = loadLedger()): Array<{ courseSlug: string } & StolenRecord> {
  return Object.entries(ledger.stolen)
    .filter(([, s]) => !s.dismissed)
    .map(([courseSlug, s]) => ({ courseSlug, ...s }))
    .sort((a, b) => b.at - a.at)
}

/** Dismiss every pending steal card (the banner is one surface, one ✕). */
export function dismissSteals(today = localDateKey()): void {
  const ledger = loadLedger()
  for (const s of Object.values(ledger.stolen)) {
    s.dismissed = true
    s.notifiedOn = today
  }
  saveLedger(ledger)
}

/** The record this player is chasing on a course, if one was stolen from them. */
export function chasing(courseSlug: string, ledger = loadLedger()): StolenRecord | null {
  return ledger.stolen[courseSlug] ?? null
}
