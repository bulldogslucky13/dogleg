import { courseBySlug } from './courses'
import { dailyConditions, courseForPuzzle, practiceConditions, puzzleNumberForDateKey } from './daily'
import { destinyDue, fortuneShotOdds, splitFortune, type FortuneState, type MomentKind } from './fortune'
import { buildLayout } from './layout'
import { playShot, startHole } from './resolve'
import { rngFromString } from './rng'
import type { CharacterId, Choice, Conditions, CourseSpec, HoleResult, HoleScore } from './types'

// Re-exported so it reaches the edge function through engine.mjs: the referee
// derives the expected salt with the exact same code the client seeds with.
export { dailySalt } from './daily'
// re-exported for the server bundle's fortune verification: the referee
// recomputes days-since-last-ace/albatross from posted cards, which takes
// the course's pars to tell an ace (eagle on a par 3) from a plain eagle
export { FORTUNE_CONFIG, destinyDue } from './fortune'
export { courseBySlug } from './courses'

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
  /** ace/albatross counters carried by the seed; null for pre-fortune seeds */
  fortune: FortuneState | null
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
 * `dailySalt` and the submit-round function. Either mode may also carry a
 * trailing fortune segment (`:f…`); conditions always derive from the seed
 * WITHOUT that tail, so the pick screen and the round agree. */
export function setupFromSeed(seed: string): SeedInfo | null {
  const { base, fortune } = splitFortune(seed)
  const daily = /^round:(\d{4}-\d{2}-\d{2}):([a-z0-9-]+?)(?::([a-z0-9]+))?$/.exec(base)
  if (daily) {
    const [, dateKey, slug, salt] = daily
    const n = puzzleNumberForDateKey(dateKey)
    const course = courseForPuzzle(n)
    if (course.slug !== slug) return null // seed names a course that isn't that day's rotation
    return { mode: 'daily', course, cond: dailyConditions(dateKey, course), fortune, dateKey, puzzleNumber: n, salt }
  }
  const practice = /^practice:([a-z0-9-]+):/.exec(base)
  if (practice) {
    const course = courseBySlug(practice[1])
    if (!course) return null
    return { mode: 'practice', course, cond: practiceConditions(base, course), fortune }
  }
  return null
}

/**
 * Round-scope destiny plan, identical on client and server: when a track's
 * counter has crossed its threshold, the round's FIRST qualifying shot
 * (par-3 tee for the ace, par-5 go-attempt for the albatross) holes out.
 */
export interface DestinyPlan {
  ace: boolean
  albatross: boolean
}

export function destinyPlan(info: SeedInfo): DestinyPlan {
  if (!info.fortune) return { ace: false, albatross: false }
  const due = destinyDue(info.mode, info.fortune)
  return { ace: due.ace, albatross: due.albatross }
}

/** The per-shot probability boosts that DO flow through the honest odds. */
export function fortuneOddsFor(info: SeedInfo): { acePerShot: number; albPerShot: number } | undefined {
  if (!info.fortune) return undefined
  return fortuneShotOdds(info.mode, info.fortune)
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

  // dice ignore the fortune tail — see roundRng in the store for why
  const rng = rngFromString(splitFortune(seed).base)
  const scores: HoleScore[] = []
  let aggressiveLeft = AGGRESSIVE_BUDGET
  const plan = destinyPlan(info)
  const fOdds = fortuneOddsFor(info)

  for (let i = 0; i < 18; i++) {
    const spec = info.course.holes[i]
    const layout = buildLayout(info.course.slug, spec)
    const h = startHole(layout, info.cond, character, fOdds)
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
      // destiny: the round's first qualifying shot of a due track holes out
      let destiny: MomentKind | undefined
      if (plan.ace && spec.par === 3 && h.ball.lie === 'tee') {
        destiny = 'ace'
        plan.ace = false
      } else if (plan.albatross && h.stage === 'second' && choice === 'aggressive') {
        destiny = 'albatross'
        plan.albatross = false
      }
      playShot(h, choice, rng, destiny)
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
