import { courseBySlug } from '../engine/courses'
import type { CharacterId, HoleResult } from '../engine/types'
import { loadArchive, loadHistory, type HistoryEntry, type RoundState } from './store'

/**
 * The round log — one lightweight entry per completed round, forever.
 *
 * This is the middle storage tier: heavier than the daily history (it keeps
 * per-hole results for practice rounds too), far lighter than the archive
 * (no decision lists, so nothing here ever needs pruning — a thousand rounds
 * is ~200KB). Every lifetime stat, the handicap window, and every scorecard
 * in the Locker computes FROM this log, so the numbers can't drift out of
 * sync with a separately-maintained counter.
 *
 * Local-first by design: anonymous players accumulate everything here, and
 * the whole log is one versioned JSON document (`dogleg:roundlog:v1`) that
 * can be shipped to a server-side account wholesale when the player syncs.
 */

export interface LoggedRound {
  /** the round's seed — unique id, and the key back into the replay archive.
   * Rounds recovered from pre-log daily history get a synthetic `hist:` id. */
  seed: string
  mode: 'daily' | 'practice'
  courseSlug: string
  character?: CharacterId
  dateKey: string
  playedAt: number
  toPar: number
  strokes: number
  /** per-hole scorecard, hole 1-18 */
  results: HoleResult[]
  /** actual per-hole strokes, hole 1-18. Only freshly logged rounds carry it;
   * rounds recovered from daily history (results only) omit it and fall back to
   * result+par. Needed because the engine collapses every diff ≥ 3 into
   * 'triple', so a blow-up hole can't be reconstructed from its result alone. */
  strokesByHole?: number[]
}

const LOG_KEY = 'dogleg:roundlog:v1'

interface StoredLog {
  v: 1
  rounds: LoggedRound[]
}

/** strokes over/under par each result category represents */
const RESULT_TO_PAR: Record<HoleResult, number> = {
  albatross: -3,
  eagle: -2,
  birdie: -1,
  par: 0,
  bogey: 1,
  double: 2,
  triple: 3,
}

function coursePars(slug: string): number[] {
  return courseBySlug(slug)?.holes.map((h) => h.par) ?? Array(18).fill(4)
}

export function holeStrokes(result: HoleResult, par: number): number {
  return par + RESULT_TO_PAR[result]
}

function readLog(): StoredLog | null {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    if (!raw) return null
    const j = JSON.parse(raw) as StoredLog
    return Array.isArray(j?.rounds) ? j : null
  } catch {
    return null
  }
}

function writeLog(log: StoredLog): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log))
  } catch {
    /* private mode / quota */
  }
}

/**
 * Load the log, seeding it on first read from everything still derivable:
 * the daily history (every daily ever, kept forever) and the current archive
 * (recent + record rounds, both modes). Practice rounds that were already
 * pruned before the log existed are gone and start from zero — flagged and
 * accepted at build time; the log ships one day post-launch, so in practice
 * nothing is lost.
 */
export function loadRoundLog(): LoggedRound[] {
  const existing = readLog()
  if (existing) return existing.rounds
  const rounds: LoggedRound[] = []
  const seen = new Set<string>()
  for (const r of loadArchive()) {
    const entry: LoggedRound = {
      seed: r.seed,
      mode: r.mode,
      courseSlug: r.courseSlug,
      character: r.character,
      dateKey: r.dateKey,
      playedAt: r.playedAt,
      toPar: r.toPar,
      strokes: r.strokes,
      results: r.results,
    }
    rounds.push(entry)
    seen.add(`${r.mode}:${r.dateKey}`)
    seen.add(r.seed)
  }
  for (const h of loadHistory()) {
    // a daily already covered by an archived copy keeps the richer entry
    if (seen.has(`daily:${h.dateKey}`)) continue
    const pars = coursePars(h.courseSlug)
    const [y, m, d] = h.dateKey.split('-').map(Number)
    rounds.push({
      seed: `hist:${h.dateKey}`,
      mode: 'daily',
      courseSlug: h.courseSlug,
      character: h.character,
      dateKey: h.dateKey,
      playedAt: new Date(y, m - 1, d, 12).getTime(),
      toPar: h.toPar,
      strokes: pars.reduce((s, p) => s + p, 0) + h.toPar,
      results: h.results,
    })
  }
  rounds.sort((a, b) => a.playedAt - b.playedAt)
  writeLog({ v: 1, rounds })
  return rounds
}

/**
 * Fold freshly-synced daily history into the log. Account sync (#32) can
 * deliver dailies from other devices long after the log first seeded, and
 * the stats must count them — the log is the single source the numbers
 * compute from, so it absorbs what sync learns. Dedupes by daily dateKey.
 */
export function absorbHistory(entries: HistoryEntry[]): void {
  const rounds = loadRoundLog()
  const seen = new Set(rounds.filter((r) => r.mode === 'daily').map((r) => r.dateKey))
  let added = false
  for (const h of entries) {
    if (seen.has(h.dateKey)) continue
    const pars = coursePars(h.courseSlug)
    const [y, m, d] = h.dateKey.split('-').map(Number)
    rounds.push({
      seed: `hist:${h.dateKey}`,
      mode: 'daily',
      courseSlug: h.courseSlug,
      character: h.character,
      dateKey: h.dateKey,
      playedAt: new Date(y, m - 1, d, 12).getTime(),
      toPar: h.toPar,
      strokes: pars.reduce((s, p) => s + p, 0) + h.toPar,
      results: h.results,
    })
    seen.add(h.dateKey)
    added = true
  }
  if (added) {
    rounds.sort((a, b) => a.playedAt - b.playedAt)
    writeLog({ v: 1, rounds })
  }
}

/** Append a just-completed round (call once at completion, like archiveRound). */
export function logRound(state: RoundState): void {
  if (!state.complete) return
  const rounds = loadRoundLog()
  if (rounds.some((r) => r.seed === state.seed)) return
  rounds.push({
    seed: state.seed,
    mode: state.mode,
    courseSlug: state.courseSlug,
    character: state.character,
    dateKey: state.dateKey,
    playedAt: Date.now(),
    toPar: state.scores.reduce((s, sc, i) => s + ((sc?.strokes ?? 0) - coursePars(state.courseSlug)[i]), 0),
    strokes: state.scores.reduce((s, sc) => s + (sc?.strokes ?? 0), 0),
    results: state.scores.map((s) => s?.result ?? 'triple'),
    strokesByHole: state.scores.map((s) => s?.strokes ?? 0),
  })
  writeLog({ v: 1, rounds })
}

// ---------------------------------------------------------------------------
// Fortune queries — which logged rounds hold the trophies
// ---------------------------------------------------------------------------

/** Hole numbers (1-18) where this round holed out in one: an eagle on a
 * par 3 IS a hole-in-one by definition — no separate flag needed. */
export function aceHoles(round: LoggedRound): number[] {
  const pars = coursePars(round.courseSlug)
  const holes: number[] = []
  round.results.forEach((r, i) => {
    if (r === 'eagle' && pars[i] === 3) holes.push(i + 1)
  })
  return holes
}

/** Hole numbers (1-18) where this round scored an albatross. */
export function albatrossHoles(round: LoggedRound): number[] {
  const holes: number[] = []
  round.results.forEach((r, i) => {
    if (r === 'albatross') holes.push(i + 1)
  })
  return holes
}

export interface FortuneRound {
  round: LoggedRound
  /** the hole(s) it happened on, 1-18 */
  holes: number[]
}

/** Every logged round with the given moment, newest first. */
export function fortuneRounds(kind: 'ace' | 'albatross', log = loadRoundLog()): FortuneRound[] {
  const pick = kind === 'ace' ? aceHoles : albatrossHoles
  return log
    .map((round) => ({ round, holes: pick(round) }))
    .filter((f) => f.holes.length > 0)
    .sort((a, b) => b.round.playedAt - a.round.playedAt)
}

// ---------------------------------------------------------------------------
// Lifetime stats + handicap — computed from the log, never counted separately
// ---------------------------------------------------------------------------

export interface LifetimeStats {
  rounds: number
  /** per-hole result counts across every logged round */
  distribution: Record<HoleResult, number>
  aces: number
  albatrosses: number
  /** worst round by score vs par (null with an empty log) */
  worst: LoggedRound | null
  /** best round by score vs par */
  best: LoggedRound | null
  /** average round score vs par — null with an empty log */
  averageToPar: number | null
}

export function lifetimeStats(log = loadRoundLog()): LifetimeStats {
  const distribution: Record<HoleResult, number> = {
    albatross: 0,
    eagle: 0,
    birdie: 0,
    par: 0,
    bogey: 0,
    double: 0,
    triple: 0,
  }
  let aces = 0
  let albatrosses = 0
  let worst: LoggedRound | null = null
  let best: LoggedRound | null = null
  let toParSum = 0
  for (const r of log) {
    for (const res of r.results) distribution[res] += 1
    aces += aceHoles(r).length
    albatrosses += albatrossHoles(r).length
    if (!worst || r.toPar > worst.toPar) worst = r
    if (!best || r.toPar < best.toPar) best = r
    toParSum += r.toPar
  }
  return {
    rounds: log.length,
    distribution,
    aces,
    albatrosses,
    worst,
    best,
    averageToPar: log.length ? toParSum / log.length : null,
  }
}

/** 18-hole-equivalent rounds needed to establish (a 9-hole card is half a
 * round — WHS establishes by holes played, so two nines make an eighteen) */
export const HANDICAP_MIN_ROUNDS = 10
export const HANDICAP_WINDOW = 30
export const HANDICAP_BEST_OF = 10

/** WHS 2024 minimum rateable length, prorated: 750 yards per 9 holes. A
 * course shorter than this can't hold a Course Rating, so its scores are
 * never acceptable for handicap purposes. Of the par-3 library that rules
 * out only The Swing (770 yards over TEN holes — under the bar); Cobblestone
 * Creek (1479/9) and Palm Beach (2572/18) both rate, and their scores count
 * like any other — USGA dropped the old 1,500/3,000-yard minimums in 2024
 * precisely so par-3 courses feed handicaps. */
const MIN_RATED_YARDS_PER_NINE = 750

/** WHS 2024 expected score: a 9-hole card no longer waits to be paired with
 * a second nine — it becomes an 18-hole differential immediately by adding
 * the player's *expected* differential for the unplayed nine, which the USGA
 * models as 0.52 × index + 1.2 (an average nine is a touch worse than half
 * the potential-based index). Prorated per unplayed hole for 10–17s. */
const EXPECTED_PER_NINE_SLOPE = 0.52
const EXPECTED_PER_NINE_BASE = 1.2

export type Handicap =
  | { established: false; roundsToGo: number }
  | { established: true; value: number }

/** Whether a round's score is acceptable for the handicap: at least nine
 * holes played, on a course long enough to be rated (see the yardage floor
 * above). Ineligible rounds still live in the log and every other stat —
 * they just never touch the handicap window or the establishment count. */
export function handicapEligible(round: Pick<LoggedRound, 'courseSlug' | 'results'>): boolean {
  if (round.results.length < 9) return false
  const course = courseBySlug(round.courseSlug)
  if (!course) return true
  const yards = course.holes.reduce((s, h) => s + h.yards, 0)
  return yards >= (course.holes.length / 9) * MIN_RATED_YARDS_PER_NINE
}

/** A round's 18-hole-equivalent score vs par: full rounds count raw; short
 * rounds (9–17 holes) get the expected score for the holes not played,
 * scaled off the player's index — the WHS 2024 treatment. */
function differential18(round: LoggedRound, index: number): number {
  const holes = round.results.length
  if (holes >= 18) return round.toPar
  const unplayed = 18 - holes
  return round.toPar + (unplayed / 9) * (EXPECTED_PER_NINE_SLOPE * index + EXPECTED_PER_NINE_BASE)
}

/**
 * Best-10-of-last-30, WHS-flavored: the 30 most recent acceptable rounds,
 * the 10 best of those by 18-hole-equivalent score vs par, averaged.
 * Reflects potential, not lifetime history — one great round visibly
 * improves it. Established at 10 full rounds' worth of holes; between 10
 * and 30 the best 10 come from what exists.
 *
 * Short rounds follow the WHS 2024 rules: they convert to 18-hole
 * differentials via the expected score (no waiting to pair two nines — that
 * rule died Jan 2024), and the expected score depends on the very index this
 * window defines, so the computation runs to a fixed point. It converges
 * fast: each short round feeds back at most 0.52 of the index.
 */
export function currentHandicap(log = loadRoundLog()): Handicap {
  const acceptable = log.filter(handicapEligible)
  const equivalents = acceptable.reduce((s, r) => s + r.results.length / 18, 0)
  if (equivalents < HANDICAP_MIN_ROUNDS) {
    return { established: false, roundsToGo: Math.ceil(HANDICAP_MIN_ROUNDS - equivalents) }
  }
  const window = [...acceptable].sort((a, b) => b.playedAt - a.playedAt).slice(0, HANDICAP_WINDOW)
  let value = 0
  for (let i = 0; i < 30; i++) {
    const bestTen = window
      .map((r) => differential18(r, value))
      .sort((a, b) => a - b)
      .slice(0, HANDICAP_BEST_OF)
    const next = bestTen.reduce((s, v) => s + v, 0) / bestTen.length
    const settled = Math.abs(next - value) < 0.001
    value = next
    if (settled) break
  }
  return { established: true, value }
}

/** Golf convention: a better-than-scratch (under par) handicap reads as a
 * "plus" handicap — "+1.2" means 1.2 under. Over par reads plain: "12.4". */
export function formatHandicap(value: number): string {
  const rounded = Math.round(value * 10) / 10
  if (rounded < 0) return `+${Math.abs(rounded).toFixed(1)}`
  return rounded.toFixed(1)
}

/** Average round score formatted like the game talks about scores: vs par. */
export function formatAverage(avg: number): string {
  const rounded = Math.round(avg * 10) / 10
  if (rounded > 0) return `+${rounded.toFixed(1)}`
  if (rounded < 0) return `−${Math.abs(rounded).toFixed(1)}`
  return 'E'
}
