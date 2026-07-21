import { buildLayout } from '../engine/layout'
import { dailySalt, practiceSetup, localDateKey, type DailySetup } from '../engine/daily'
import { startHole, playShot, type HoleInPlay } from '../engine/resolve'
import { rngFromString, skip, type Rng } from '../engine/rng'
import type { CharacterId, Choice, Conditions, HoleResult, HoleScore, Stage } from '../engine/types'
import { courseBySlug } from '../engine/courses'
import { EMPTY_FORTUNE, encodeFortune, splitFortune, type FortuneState } from '../engine/fortune'
import { decisionsFromScores, destinyPlan, fortuneOddsFor, setupFromSeed } from '../engine/replay'
import { track } from '../lib/analytics'

export const AGGRESSIVE_BUDGET = 8

export interface RoundState {
  mode: 'daily' | 'practice'
  seed: string
  courseSlug: string
  cond: Conditions
  /** playstyle picked at the first tee; optional so pre-feature saves keep working */
  character?: CharacterId
  puzzleNumber: number
  dateKey: string
  currentHole: number
  scores: (HoleScore | null)[]
  aggressiveLeft: number
  rolls: number
  complete: boolean
  hole: SerializedHole | null
}

interface SerializedHole {
  stage: Stage
  ball: HoleInPlay['ball']
  strokes: number
  penalties: number
  shots: HoleInPlay['shots']
  status: HoleInPlay['status']
  score?: HoleScore
}

export interface HistoryEntry {
  dateKey: string
  puzzleNumber: number
  courseSlug: string
  toPar: number
  results: HoleResult[]
  character?: CharacterId
}

const ROUND_KEY = 'dogleg:round:v1'
const HISTORY_KEY = 'dogleg:history:v1'
const UI_MODE_KEY = 'dogleg:uimode'

/** Move any legacy `bp:*` saves (the Break Par-era prefix) to the `dogleg:*`
 * keys so nobody loses their streak or history. Idempotent; runs before every
 * read rather than once at import so a stubbed storage in tests still sees it. */
export function migrateLegacyStorage(): void {
  try {
    migrateKey('bp:round:v1', ROUND_KEY, reconcileRounds)
    migrateKey('bp:history:v1', HISTORY_KEY, reconcileHistory)
  } catch {
    /* private mode etc. */
  }
}

function migrateKey(legacy: string, current: string, reconcile: (legacyRaw: string, currentRaw: string) => string): void {
  const raw = localStorage.getItem(legacy)
  if (raw === null) return
  const existing = localStorage.getItem(current)
  localStorage.setItem(current, existing === null ? raw : reconcile(raw, existing))
  localStorage.removeItem(legacy)
}

/** Both keys populated means an old-bundle tab kept writing `bp:*` after a new
 * tab migrated: union the histories by day (current wins ties) so neither tab's
 * completed rounds are lost. */
function reconcileHistory(legacyRaw: string, currentRaw: string): string {
  try {
    const cur = JSON.parse(currentRaw) as HistoryEntry[]
    const have = new Set(cur.map((e) => e.dateKey))
    const legacy = (JSON.parse(legacyRaw) as HistoryEntry[]).filter((e) => !have.has(e.dateKey))
    if (!legacy.length) return currentRaw
    return JSON.stringify([...cur, ...legacy].sort((a, b) => a.dateKey.localeCompare(b.dateKey)))
  } catch {
    return currentRaw
  }
}

/** Same round saved under both keys: keep whichever tab got further (rolls only
 * grow). Unrelated rounds: the `dogleg:*` one is the user's latest, keep it. */
function reconcileRounds(legacyRaw: string, currentRaw: string): string {
  try {
    const cur = JSON.parse(currentRaw) as RoundState
    const legacy = JSON.parse(legacyRaw) as RoundState
    const sameRound = cur.seed === legacy.seed && cur.mode === legacy.mode && cur.dateKey === legacy.dateKey
    return sameRound && legacy.rolls > cur.rolls ? legacyRaw : currentRaw
  } catch {
    return currentRaw
  }
}

export type UiMode = 'modern' | 'classic'

// ---------------------------------------------------------------------------

export function newRound(
  setup: DailySetup,
  mode: 'daily' | 'practice',
  character?: CharacterId,
  playerId?: string,
): RoundState {
  const course = setup.course
  const layout = buildLayout(course.slug, course.holes[0])
  const hole = startHole(layout, setup.cond, character)
  // Daily seeds get a per-player salt: same course, same conditions for
  // everyone, but your OWN dice — so watching someone's replay can't be
  // copied shot-for-shot into your daily. (Practice seeds are unique already.)
  //
  // Derived from the player id, never random: the referee recomputes it and
  // rejects anything else, so there is exactly one salt you can play under.
  // A random salt would have let anyone grind offline for a lucky round. The
  // id itself is server-minted — anonymous players get one minted silently at
  // app start (see ensureIdentity), so they roll their own dice too. Only a
  // player the backend has never seen (offline, mint failed) falls back to
  // the unsalted canonical seed — shared dice, but zero freedom to grind.
  //
  // Both modes then carry the player's fortune counters as a seed tail, so
  // ace/albatross odds and destiny replay identically on the server.
  const salt = mode === 'daily' && playerId ? dailySalt(playerId, setup.dateKey) : null
  // A setup seed is a base seed, but be idempotent if handed one that already
  // carries a fortune tail (e.g. a round seed fed back in) — strip it before
  // re-appending, or the seed grows a second `:f…` tail that won't parse.
  const baseSeed = splitFortune(setup.seed).base
  const fortuneTail = `:${encodeFortune(fortuneFor(mode))}`
  return {
    mode,
    seed: (salt ? `${baseSeed}:${salt}` : baseSeed) + fortuneTail,
    courseSlug: course.slug,
    cond: setup.cond,
    character,
    puzzleNumber: setup.puzzleNumber,
    dateKey: setup.dateKey,
    currentHole: 0,
    scores: Array(18).fill(null),
    aggressiveLeft: AGGRESSIVE_BUDGET,
    rolls: 0,
    complete: false,
    hole: serializeHole(hole),
  }
}

export function startPracticeRound(slug: string, character?: CharacterId): RoundState {
  return newRound(practiceSetup(slug, `${Date.now()}`), 'practice', character)
}

function serializeHole(h: HoleInPlay): SerializedHole {
  return {
    stage: h.stage,
    ball: h.ball,
    strokes: h.strokes,
    penalties: h.penalties,
    shots: h.shots,
    status: h.status,
    score: h.score,
  }
}

/** Rebuild the live HoleInPlay (layout is derived, everything else persisted). */
export function holeInPlay(state: RoundState): HoleInPlay {
  const course = courseBySlug(state.courseSlug)!
  const spec = course.holes[state.currentHole]
  const layout = buildLayout(course.slug, spec)
  const info = setupFromSeed(state.seed)
  const fOdds = info ? fortuneOddsFor(info) : undefined
  const s = state.hole ?? serializeHole(startHole(layout, state.cond, state.character, fOdds))
  // clone mutable pieces: playShot mutates, and React may re-run state updaters
  return { layout, cond: state.cond, character: state.character, fortuneOdds: fOdds, ...s, ball: { ...s.ball }, shots: [...s.shots] }
}

function roundRng(state: RoundState): { rng: Rng; consumed: () => number } {
  // Dice are keyed on the seed WITHOUT the fortune tail. The tail is
  // client-kept state; if it fed the rng, varying it would reroll the round —
  // the exact grind the per-player salt exists to prevent. Stripped here and
  // in replayRound identically, so the referee sees the same dice.
  const base = rngFromString(splitFortune(state.seed).base)
  skip(base, state.rolls)
  let n = 0
  const rng: Rng = () => {
    n++
    return base()
  }
  return { rng, consumed: () => n }
}

export function usesBudget(stage: Stage): boolean {
  return stage === 'tee' || stage === 'second' || stage === 'approach'
}

/** Apply a decision immutably; returns the next round state. */
export function applyChoice(state: RoundState, choice: Choice): RoundState {
  if (state.complete || !state.hole || state.hole.stage === 'done') return state
  const h = holeInPlay(state)
  if (choice === 'aggressive' && usesBudget(h.stage) && state.aggressiveLeft <= 0) return state

  const { rng, consumed } = roundRng(state)
  const budgetSpent = choice === 'aggressive' && usesBudget(h.stage) ? 1 : 0
  playShot(h, choice, rng, destinyFor(state, h, choice))

  const next: RoundState = {
    ...state,
    rolls: state.rolls + consumed(),
    aggressiveLeft: state.aggressiveLeft - budgetSpent,
    hole: serializeHole(h),
    scores: state.scores.slice(),
  }
  if (h.stage === 'done' && h.score) {
    next.scores[state.currentHole] = h.score
  }
  return next
}

/** Fires as each hole is scored, so an abandoned round still shows how far it
 * got — round_completed alone can't tell "quit on 14" from "never teed off". */
function trackHoleCompleted(state: RoundState): void {
  const score = state.hole?.score
  if (!score) return
  const spec = courseBySlug(state.courseSlug)!.holes[state.currentHole]
  track('hole_completed', {
    mode: state.mode,
    course: state.courseSlug,
    puzzle_number: state.puzzleNumber,
    character: state.character,
    hole_number: spec.number,
    par: spec.par,
    strokes: score.strokes,
    result: score.result,
    hole_to_par: score.strokes - spec.par,
    running_to_par: roundToPar(state), // applyChoice already banked this hole's score
    aggressive_used: AGGRESSIVE_BUDGET - state.aggressiveLeft,
  })
}

export function advanceHole(state: RoundState): RoundState {
  if (!state.hole?.score) return state
  trackHoleCompleted(state)
  if (state.currentHole >= 17) {
    return { ...state, complete: true }
  }
  const course = courseBySlug(state.courseSlug)!
  const idx = state.currentHole + 1
  const layout = buildLayout(course.slug, course.holes[idx])
  const info = setupFromSeed(state.seed)
  const hole = startHole(layout, state.cond, state.character, info ? fortuneOddsFor(info) : undefined)
  return { ...state, currentHole: idx, hole: serializeHole(hole) }
}

export function roundToPar(state: RoundState): number {
  const course = courseBySlug(state.courseSlug)!
  return state.scores.reduce((sum, s, i) => (s ? sum + s.strokes - course.holes[i].par : sum), 0)
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function saveRound(state: RoundState | null): void {
  try {
    if (!state) localStorage.removeItem(ROUND_KEY)
    else localStorage.setItem(ROUND_KEY, JSON.stringify(state))
  } catch {
    /* private mode etc. */
  }
}

export function loadRound(): RoundState | null {
  migrateLegacyStorage()
  try {
    const raw = localStorage.getItem(ROUND_KEY)
    if (!raw) return null
    const state = JSON.parse(raw) as RoundState
    if (!courseBySlug(state.courseSlug)) return null
    // a stale daily from a previous day is dead
    if (state.mode === 'daily' && state.dateKey !== localDateKey()) return null
    return state
  } catch {
    return null
  }
}

/** Union server-fetched rounds into local history by day (local wins ties —
 * the device that played the round holds the authoritative entry). Persists
 * and returns the merged list so streaks/records pick the new days up. */
export function mergeHistory(remote: HistoryEntry[]): HistoryEntry[] {
  const local = loadHistory()
  const have = new Set(local.map((e) => e.dateKey))
  const fresh = remote.filter((e) => !have.has(e.dateKey))
  if (!fresh.length) return local
  const merged = [...local, ...fresh].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(merged))
  } catch {
    /* private mode */
  }
  return merged
}

/** True when an unfinished daily on this device is for a day the (synced)
 * history already shows as completed — e.g. the round was played to the end
 * on another device. Such a round is stale: resuming it would let the player
 * replay a day the account has already posted. */
export function supersededDaily(round: RoundState | null, history: HistoryEntry[]): boolean {
  return !!round && !round.complete && round.mode === 'daily' && history.some((e) => e.dateKey === round.dateKey)
}

export function loadHistory(): HistoryEntry[] {
  migrateLegacyStorage()
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : []
  } catch {
    return []
  }
}

export function loadUiMode(): UiMode {
  try {
    return localStorage.getItem(UI_MODE_KEY) === 'classic' ? 'classic' : 'modern'
  } catch {
    return 'modern' // storage blocked: fall back instead of failing the first render
  }
}

export function saveUiMode(mode: UiMode): void {
  try {
    localStorage.setItem(UI_MODE_KEY, mode)
  } catch {
    /* storage blocked: the toggle still works for this session */
  }
}

function trackRoundCompleted(state: RoundState, streaks: Streaks): void {
  track('round_completed', {
    mode: state.mode,
    course: state.courseSlug,
    puzzle_number: state.puzzleNumber,
    character: state.character,
    to_par: roundToPar(state),
    aggressive_used: AGGRESSIVE_BUDGET - state.aggressiveLeft,
    current_streak: streaks.dayStreak,
    best_streak: streaks.bestStreak,
  })
}

export function recordResult(state: RoundState): HistoryEntry[] {
  // fortune counters march on every completed round, both modes — dedup'd by
  // seed so re-rendering the result screen can't double-count a round
  updateFortuneAfterRound(state)
  const history = loadHistory()
  if (state.mode !== 'daily') {
    trackRoundCompleted(state, computeStreaks(history))
    return history
  }
  if (history.some((e) => e.dateKey === state.dateKey)) return history
  const entry: HistoryEntry = {
    dateKey: state.dateKey,
    puzzleNumber: state.puzzleNumber,
    courseSlug: state.courseSlug,
    toPar: roundToPar(state),
    results: state.scores.map((s) => s?.result ?? 'triple'),
    character: state.character,
  }
  const next = [...history, entry].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  trackRoundCompleted(state, computeStreaks(next))
  return next
}

// ---------------------------------------------------------------------------
// Derived stats
// ---------------------------------------------------------------------------

export interface CharacterRecord {
  id: CharacterId
  played: number
  avgToPar: number
  bestToPar: number
}

/** Daily-round record per character, for the "which player is best" argument. */
export function characterRecords(history: HistoryEntry[]): CharacterRecord[] {
  const acc = new Map<CharacterId, { n: number; total: number; best: number }>()
  for (const e of history) {
    if (!e.character) continue
    const r = acc.get(e.character) ?? { n: 0, total: 0, best: Number.POSITIVE_INFINITY }
    r.n += 1
    r.total += e.toPar
    r.best = Math.min(r.best, e.toPar)
    acc.set(e.character, r)
  }
  return [...acc.entries()].map(([id, r]) => ({ id, played: r.n, avgToPar: r.total / r.n, bestToPar: r.best }))
}

export interface RoundRecap {
  best: { hole: number; result: HoleResult } | null
  /** worst over-par hole; null means a clean card */
  worst: { hole: number; result: HoleResult } | null
  aggressiveUsed: number
  penalties: number
  /** longest one-putt in feet, if any */
  longestMake: number | null
}

/** The story of a finished round, computed from its shot records. */
export function buildRecap(state: RoundState): RoundRecap | null {
  if (!state.complete) return null
  const course = courseBySlug(state.courseSlug)
  if (!course) return null
  let best: RoundRecap['best'] = null
  let bestDiff = 99
  let worst: RoundRecap['worst'] = null
  let worstDiff = 0
  let penalties = 0
  let longestMake: number | null = null
  state.scores.forEach((s, i) => {
    if (!s) return
    const diff = s.strokes - course.holes[i].par
    if (diff < bestDiff) {
      bestDiff = diff
      best = { hole: course.holes[i].number, result: s.result }
    }
    if (diff > worstDiff) {
      worstDiff = diff
      worst = { hole: course.holes[i].number, result: s.result }
    }
    penalties += s.penalties
    s.shots.forEach((shot, j) => {
      if (shot.stage === 'putt' && shot.outcome === 'one') {
        const feet = j > 0 ? (s.shots[j - 1].after.puttFeet ?? null) : null
        if (feet !== null && (longestMake === null || feet > longestMake)) longestMake = feet
      }
    })
  })
  return { best, worst, aggressiveUsed: AGGRESSIVE_BUDGET - state.aggressiveLeft, penalties, longestMake }
}

export interface Streaks {
  dayStreak: number
  bestStreak: number
  bestToPar: number | null
  played: number
  brokePar: number
}

/** Parse a YYYY-MM-DD key as a *local* date (new Date(str) would parse UTC and shift a day). */
function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function computeStreaks(history: HistoryEntry[]): Streaks {
  if (!history.length) return { dayStreak: 0, bestStreak: 0, bestToPar: null, played: 0, brokePar: 0 }
  const days = history.map((h) => h.dateKey)
  const set = new Set(days)
  let best = 0
  let run = 0
  const d0 = parseKey(days[0])
  const today = parseKey(localDateKey())
  for (let d = new Date(d0); d.getTime() <= today.getTime(); d.setDate(d.getDate() + 1)) {
    const key = localDateKey(d)
    if (set.has(key)) {
      run++
      best = Math.max(best, run)
    } else {
      run = 0
    }
  }
  // current streak counts back from today (or yesterday if today unplayed)
  let cur = 0
  const cursor = new Date(today)
  if (!set.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (set.has(localDateKey(cursor))) {
    cur++
    cursor.setDate(cursor.getDate() - 1)
  }
  return {
    dayStreak: cur,
    bestStreak: best,
    bestToPar: Math.min(...history.map((h) => h.toPar)),
    played: history.length,
    brokePar: history.filter((h) => h.toPar < 0).length,
  }
}

// ---------------------------------------------------------------------------
// Round archive — the raw material for "My rounds" and replays
// ---------------------------------------------------------------------------

export interface ArchivedRound {
  seed: string
  mode: 'daily' | 'practice'
  courseSlug: string
  character?: CharacterId
  dateKey: string
  toPar: number
  strokes: number
  results: HoleResult[]
  /** the round's full decision list — enough to replay it forever */
  decisions: Choice[][]
  /** confirmed by the server: this round took the course record */
  courseRecord?: boolean
  playedAt: number
}

const ARCHIVE_KEY = 'dogleg:archive:v1'

export function loadArchive(): ArchivedRound[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY)
    return raw ? (JSON.parse(raw) as ArchivedRound[]) : []
  } catch {
    return []
  }
}

function saveArchive(rounds: ArchivedRound[]): void {
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(rounds))
  } catch {
    /* private mode / quota */
  }
}

/** An ace (par-3 eagle — that IS a hole in one) or an albatross anywhere in
 * the round. These are the trophy moments the Locker features. */
export function hasFortuneMoment(courseSlug: string, results: HoleResult[]): boolean {
  const pars = courseBySlug(courseSlug)?.holes.map((h) => h.par) ?? []
  return results.some((r, i) => r === 'albatross' || (r === 'eagle' && pars[i] === 3))
}

/**
 * Retention: the 10 most recent rounds always stay. Beyond that, a round
 * lives forever if it's your personal best on its course (PR), a confirmed
 * course record, or holds a fortune moment (ace/albatross) — trophies don't
 * age out, so their replays stay watchable from the Locker.
 */
export function pruneArchive(rounds: ArchivedRound[]): ArchivedRound[] {
  const byNewest = [...rounds].sort((a, b) => b.playedAt - a.playedAt)
  const keep = new Set<ArchivedRound>(byNewest.slice(0, 10))
  const bestByCourse = new Map<string, ArchivedRound>()
  for (const r of byNewest) {
    const best = bestByCourse.get(r.courseSlug)
    if (!best || r.toPar < best.toPar) bestByCourse.set(r.courseSlug, r)
  }
  for (const r of bestByCourse.values()) keep.add(r)
  for (const r of byNewest) if (r.courseRecord || hasFortuneMoment(r.courseSlug, r.results)) keep.add(r)
  return byNewest.filter((r) => keep.has(r))
}

/** Archive a finished round (call once, when it completes). */
export function archiveRound(state: RoundState): void {
  if (!state.complete) return
  const decisions = decisionsFromScores(state.scores)
  if (!decisions) return
  const entry: ArchivedRound = {
    seed: state.seed,
    mode: state.mode,
    courseSlug: state.courseSlug,
    character: state.character,
    dateKey: state.dateKey,
    toPar: roundToPar(state),
    strokes: state.scores.reduce((s, sc) => s + (sc?.strokes ?? 0), 0),
    results: state.scores.map((s) => s?.result ?? 'triple'),
    decisions,
    playedAt: Date.now(),
  }
  const current = loadArchive()
  // bump the lifetime tally only for genuinely new rounds (and seed the
  // counter from pre-feature data BEFORE this round joins the archive)
  if (!current.some((r) => r.seed === entry.seed)) bumpLifetimeRounds(state)
  saveArchive(pruneArchive([entry, ...current.filter((r) => r.seed !== entry.seed)]))
}

// ---------------------------------------------------------------------------
// Lifetime tally — survives archive pruning
// ---------------------------------------------------------------------------

const LIFETIME_KEY = 'dogleg:lifetime:v1'

/** Completed rounds, ever. Seeded once for pre-counter players from what's
 * still visible: daily history (kept forever) + archived practice rounds. */
export function lifetimeRounds(): number {
  try {
    const raw = localStorage.getItem(LIFETIME_KEY)
    if (raw !== null) return Math.max(0, Number(raw) || 0)
    const seeded = loadHistory().length + loadArchive().filter((r) => r.mode === 'practice').length
    localStorage.setItem(LIFETIME_KEY, String(seeded))
    return seeded
  } catch {
    return 0
  }
}

/** Count the round being archived. On the very first bump the counter seeds
 * from pre-feature data — but recordResult has already written THIS daily
 * into history by the time we run, so the seed must exclude it or the
 * player's first counted daily lands as 2. */
function bumpLifetimeRounds(state: RoundState): void {
  try {
    const raw = localStorage.getItem(LIFETIME_KEY)
    if (raw === null) {
      const history = loadHistory().filter((e) => !(state.mode === 'daily' && e.dateKey === state.dateKey))
      const seeded = history.length + loadArchive().filter((r) => r.mode === 'practice').length
      localStorage.setItem(LIFETIME_KEY, String(seeded + 1))
      return
    }
    localStorage.setItem(LIFETIME_KEY, String(lifetimeRounds() + 1))
  } catch {
    /* private mode */
  }
}

/** The server confirmed a course record for this round — pin it forever. */
export function markArchiveRecord(seed: string): void {
  const rounds = loadArchive()
  const hit = rounds.find((r) => r.seed === seed)
  if (!hit) return
  hit.courseRecord = true
  saveArchive(pruneArchive(rounds))
}

// ---------------------------------------------------------------------------
// Fortune counters — the player's march toward an ace / albatross
// ---------------------------------------------------------------------------

const FORTUNE_KEY = 'dogleg:fortune:v1'
const FORTUNE_LAST_KEY = 'dogleg:fortune:last'

/** Only PRACTICE counters are stored — daily counters are derived from
 * posted dailies on demand (see postedDailyCounters), because the referee
 * verifies daily claims against its daily_scores table and would reject
 * anything local-only rounds inflated. */
interface StoredFortune {
  p: { ace: number; aceK: number; alb: number; albK: number }
}

function loadStoredFortune(): StoredFortune {
  try {
    const raw = localStorage.getItem(FORTUNE_KEY)
    if (raw) {
      const j = JSON.parse(raw) as StoredFortune
      if (j?.p) return { p: j.p }
    }
  } catch {
    /* fall through */
  }
  return { p: { ace: 0, aceK: 0, alb: 0, albK: 0 } }
}

function saveStoredFortune(f: StoredFortune): void {
  try {
    localStorage.setItem(FORTUNE_KEY, JSON.stringify(f))
  } catch {
    /* private mode */
  }
}

/** The fortune snapshot a new round bakes into its seed. */
export function fortuneFor(mode: 'daily' | 'practice'): FortuneState {
  if (mode === 'daily') {
    // Every daily claim — streak AND the ace/albatross counters — is derived
    // from dailies this device actually POSTED, and only for a NAMED
    // identity: the referee verifies all of them against its daily_scores
    // table, so anything local-only rounds inflated would be rejected, not
    // boosted. Board loyalty is what's rewarded.
    if (!hasNamedIdentity()) return { ...EMPTY_FORTUNE }
    const { ace, alb } = postedDailyCounters()
    return { ...EMPTY_FORTUNE, ace, alb, streak: postedStreak() }
  }
  const sf = loadStoredFortune()
  return { ace: sf.p.ace, aceK: sf.p.aceK, alb: sf.p.alb, albK: sf.p.albK, streak: 0 }
}

/** Read the clubhouse identity's name directly (key owned by lib/leaderboard)
 * — a value import from there would cycle back into this module. */
function hasNamedIdentity(): boolean {
  try {
    const raw = localStorage.getItem('dogleg:player:v1')
    return raw ? !!(JSON.parse(raw) as { name?: string | null }).name : false
  } catch {
    return false
  }
}

/** Streak as the referee can verify it: consecutive POSTED dailies ending
 * yesterday, plus today's round (the one this claim is being baked into).
 * The posted set is written by lib/leaderboard on successful submission. */
function postedStreak(): number {
  try {
    const keys = postedDays()
    let run = 0
    const cursor = parseKey(localDateKey())
    for (;;) {
      cursor.setDate(cursor.getDate() - 1)
      if (!keys.has(localDateKey(cursor))) break
      run++
    }
    return run + 1
  } catch {
    return 0
  }
}

function postedDays(): Set<string> {
  const raw = localStorage.getItem('dogleg:posted:v1')
  return new Set(raw ? (JSON.parse(raw) as string[]) : [])
}

/** Daily ace/albatross counters as the referee can verify them: posted
 * dailies since the last POSTED daily that contained the moment. An ace is
 * an eagle result on a par 3; an albatross result on a par 5 is the 2. */
function postedDailyCounters(): { ace: number; alb: number } {
  try {
    const posted = postedDays()
    const rows = loadHistory()
      .filter((e) => posted.has(e.dateKey))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
    let ace = 0
    let alb = 0
    let aceDone = false
    let albDone = false
    for (const e of rows) {
      const course = courseBySlug(e.courseSlug)
      const hasAce = !!course && e.results.some((r, i) => r === 'eagle' && course.holes[i]?.par === 3)
      const hasAlb = !!course && e.results.some((r, i) => r === 'albatross' && course.holes[i]?.par === 5)
      if (!aceDone) {
        if (hasAce) aceDone = true
        else ace++
      }
      if (!albDone) {
        if (hasAlb) albDone = true
        else alb++
      }
      if (aceDone && albDone) break
    }
    return { ace, alb }
  } catch {
    return { ace: 0, alb: 0 }
  }
}

/** Mirror of replayRound's destiny rule: the round's FIRST qualifying shot
 * of a due track holes out. Must stay in lockstep with the engine. */
function destinyFor(state: RoundState, h: HoleInPlay, choice: Choice): 'ace' | 'albatross' | undefined {
  const info = setupFromSeed(state.seed)
  if (!info) return undefined
  const plan = destinyPlan(info)
  const course = courseBySlug(state.courseSlug)
  if (!course) return undefined
  const spec = course.holes[state.currentHole]
  if (plan.ace && spec.par === 3 && h.ball.lie === 'tee') {
    const earlierPar3 = course.holes.slice(0, state.currentHole).some((hh) => hh.par === 3)
    if (!earlierPar3) return 'ace'
  }
  // an albatross attempt only qualifies while the shot is still FOR 2 —
  // after a tee penalty the go would finish as an eagle, so it neither
  // fires nor spends the guarantee (mirrors replayRound exactly)
  if (plan.albatross && h.stage === 'second' && choice === 'aggressive' && h.strokes === 1) {
    const earlierGo = state.scores
      .slice(0, state.currentHole)
      .some((sc) =>
        sc?.shots.some(
          (sh) => sh.stage === 'second' && sh.choice === 'aggressive' && sc.shots[0]?.strokesAfter === 1,
        ),
      )
    if (!earlierGo) return 'albatross'
  }
  return undefined
}

/** Did a finished round contain the moments? (An ace is 1 stroke on a par 3;
 * an albatross is 2 on a par 5.) */
export function roundMoments(state: RoundState): { ace: boolean; albatross: boolean } {
  const course = courseBySlug(state.courseSlug)
  if (!course) return { ace: false, albatross: false }
  return {
    ace: state.scores.some((sc, i) => !!sc && course.holes[i].par === 3 && sc.strokes === 1),
    albatross: state.scores.some((sc, i) => !!sc && course.holes[i].par === 5 && sc.strokes === 2),
  }
}

function updateFortuneAfterRound(state: RoundState): void {
  if (!state.complete) return
  // daily counters are DERIVED from posted dailies, never accumulated
  // locally — see postedDailyCounters
  if (state.mode !== 'practice') return
  try {
    // a round counts once, however many times the result screen re-records it
    if (localStorage.getItem(FORTUNE_LAST_KEY) === state.seed) return
    localStorage.setItem(FORTUNE_LAST_KEY, state.seed)
  } catch {
    return
  }
  const { ace, albatross } = roundMoments(state)
  const sf = loadStoredFortune()
  if (ace) {
    sf.p.ace = 0
    sf.p.aceK += 1
  } else sf.p.ace += 1
  if (albatross) {
    sf.p.alb = 0
    sf.p.albK += 1
  } else sf.p.alb += 1
  saveStoredFortune(sf)
}
