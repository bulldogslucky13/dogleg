import { courseBySlug } from './courses'
import { dailyConditions, courseForPuzzle, practiceConditions, puzzleNumberForDateKey } from './daily'
import { buildLayout } from './layout'
import { playShot, startHole } from './resolve'
import { rngFromString } from './rng'
import type { CharacterId, Choice, Conditions, CourseSpec, HoleResult, HoleScore } from './types'

// Re-exported so it reaches the edge function through engine.mjs: the referee
// derives the expected salt with the exact same code the client seeds with.
export { dailySalt } from './daily'

/**
 * Deterministic round replay — the backbone of leaderboard score validation.
 *
 * A submitted round is just its seed, character, and per-hole decision lists.
 * Everything else (conditions, layouts, dice) derives from the seed, so the
 * server re-runs the exact round and computes the score itself. A submission
 * that doesn't parse, overspends the aggressive budget, or has the wrong
 * decision shape is rejected — and the score is whatever the engine says,
 * never what the client claims.
 */

const AGGRESSIVE_BUDGET = 8

export interface SeedInfo {
  mode: 'daily' | 'practice'
  course: CourseSpec
  cond: Conditions
  /** daily only */
  dateKey?: string
  puzzleNumber?: number
  /** daily only: the per-player dice salt, if the seed carried one. Callers
   * that trust the score MUST check this against `dailySalt(playerId, dateKey)`
   * — a free-floating salt is a licence to grind for luck. */
  salt?: string
}

/** Reconstruct the full round setup from a seed string, or null if invalid.
 * Daily seeds may carry a per-player dice salt (`round:date:slug:salt`) —
 * the salt changes the rolls, never the course or conditions. Verifying that
 * the salt belongs to the submitting player is the caller's job; see
 * `dailySalt` and the submit-round function. */
export function setupFromSeed(seed: string): SeedInfo | null {
  const daily = /^round:(\d{4}-\d{2}-\d{2}):([a-z0-9-]+?)(?::([a-z0-9]+))?$/.exec(seed)
  if (daily) {
    const [, dateKey, slug, salt] = daily
    const n = puzzleNumberForDateKey(dateKey)
    const course = courseForPuzzle(n)
    if (course.slug !== slug) return null // seed names a course that isn't that day's rotation
    return { mode: 'daily', course, cond: dailyConditions(dateKey, course), dateKey, puzzleNumber: n, salt }
  }
  const practice = /^practice:([a-z0-9-]+):/.exec(seed)
  if (practice) {
    const course = courseBySlug(practice[1])
    if (!course) return null
    return { mode: 'practice', course, cond: practiceConditions(seed, course) }
  }
  return null
}

export type ReplayOutcome =
  | { ok: true; strokes: number; toPar: number; results: HoleResult[]; scores: HoleScore[]; info: SeedInfo }
  | { ok: false; error: string }

/** Re-run a full round from its seed and decisions. Mirrors the client store's
 * rng usage exactly: one stream from the seed, consumed shot by shot. */
export function replayRound(seed: string, character: CharacterId | undefined, decisions: Choice[][]): ReplayOutcome {
  const info = setupFromSeed(seed)
  if (!info) return { ok: false, error: 'invalid seed' }
  if (!Array.isArray(decisions) || decisions.length !== 18) return { ok: false, error: 'need 18 holes of decisions' }

  const rng = rngFromString(seed)
  const scores: HoleScore[] = []
  let aggressiveLeft = AGGRESSIVE_BUDGET

  for (let i = 0; i < 18; i++) {
    const spec = info.course.holes[i]
    const layout = buildLayout(info.course.slug, spec)
    const h = startHole(layout, info.cond, character)
    const holeChoices = decisions[i]
    if (!Array.isArray(holeChoices) || holeChoices.length === 0 || holeChoices.length > 20) {
      return { ok: false, error: `hole ${i + 1}: bad decision list` }
    }
    for (const choice of holeChoices) {
      if (choice !== 'safe' && choice !== 'normal' && choice !== 'aggressive') {
        return { ok: false, error: `hole ${i + 1}: unknown choice` }
      }
      if (h.stage === 'done') return { ok: false, error: `hole ${i + 1}: decisions past the cup` }
      const budgeted = h.stage === 'tee' || h.stage === 'second' || h.stage === 'approach'
      if (choice === 'aggressive' && budgeted) {
        if (aggressiveLeft <= 0) return { ok: false, error: `hole ${i + 1}: aggressive over budget` }
        aggressiveLeft -= 1
      }
      playShot(h, choice, rng)
    }
    if (h.stage !== 'done' || !h.score) return { ok: false, error: `hole ${i + 1}: round left unfinished` }
    scores.push(h.score)
  }

  const par = info.course.holes.reduce((s, hole) => s + hole.par, 0)
  const strokes = scores.reduce((s, sc) => s + sc.strokes, 0)
  return { ok: true, strokes, toPar: strokes - par, results: scores.map((s) => s.result), scores, info }
}

/** The submission payload a finished client round produces: choices per hole,
 * in the exact order they were played. */
export function decisionsFromScores(scores: (HoleScore | null)[]): Choice[][] | null {
  if (scores.length !== 18 || scores.some((s) => !s)) return null
  return scores.map((s) => s!.shots.map((shot) => shot.choice))
}
