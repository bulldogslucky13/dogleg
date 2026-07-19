import { buildLayout } from '../engine/layout'
import { practiceSetup, localDateKey, type DailySetup } from '../engine/daily'
import { startHole, playShot, type HoleInPlay } from '../engine/resolve'
import { rngFromString, skip, type Rng } from '../engine/rng'
import type { CharacterId, Choice, Conditions, HoleResult, HoleScore, Stage } from '../engine/types'
import { courseBySlug } from '../engine/courses'
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

/** Keys from before the rename off the Break Par-era `bp:` prefix. */
const LEGACY_KEYS: ReadonlyArray<readonly [legacy: string, current: string]> = [
  ['bp:round:v1', ROUND_KEY],
  ['bp:history:v1', HISTORY_KEY],
]

/** Copy any legacy `bp:*` saves to the `dogleg:*` keys (then drop the old keys)
 * so nobody loses their streak or history. Idempotent; runs before every read
 * rather than once at import so a stubbed storage in tests still sees it. */
export function migrateLegacyStorage(): void {
  try {
    for (const [legacy, current] of LEGACY_KEYS) {
      const raw = localStorage.getItem(legacy)
      if (raw === null) continue
      if (localStorage.getItem(current) === null) localStorage.setItem(current, raw)
      localStorage.removeItem(legacy)
    }
  } catch {
    /* private mode etc. */
  }
}

export type UiMode = 'modern' | 'classic'

// ---------------------------------------------------------------------------

export function newRound(setup: DailySetup, mode: 'daily' | 'practice', character?: CharacterId): RoundState {
  const course = setup.course
  const layout = buildLayout(course.slug, course.holes[0])
  const hole = startHole(layout, setup.cond, character)
  return {
    mode,
    seed: setup.seed,
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
  const s = state.hole ?? serializeHole(startHole(layout, state.cond, state.character))
  // clone mutable pieces: playShot mutates, and React may re-run state updaters
  return { layout, cond: state.cond, character: state.character, ...s, ball: { ...s.ball }, shots: [...s.shots] }
}

function roundRng(state: RoundState): { rng: Rng; consumed: () => number } {
  const base = rngFromString(state.seed)
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
  playShot(h, choice, rng)

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

export function advanceHole(state: RoundState): RoundState {
  if (!state.hole?.score) return state
  if (state.currentHole >= 17) {
    return { ...state, complete: true }
  }
  const course = courseBySlug(state.courseSlug)!
  const idx = state.currentHole + 1
  const layout = buildLayout(course.slug, course.holes[idx])
  const hole = startHole(layout, state.cond, state.character)
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
