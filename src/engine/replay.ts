import { courseBySlug } from './courses'
import { dailyConditions, courseForPuzzle, practiceConditions, puzzleNumberForDateKey } from './daily'
import { destinyDue, fortuneEligible, fortuneShotOdds, splitFortune, type FortuneState, type MomentKind } from './fortune'
import { buildLayout } from './layout'
import { playShot, startHole, type HoleInPlay } from './resolve'
import { rngFromString } from './rng'
import type { CharacterId, Choice, Conditions, CourseSpec, HoleResult, HoleScore, Stage } from './types'

// Re-exported so it reaches the edge function through engine.mjs: the referee
// derives the expected salt with the exact same code the client seeds with.
export { dailySalt } from './daily'
// re-exported for the server bundle's fortune verification: the referee
// recomputes days-since-last-ace/albatross from posted cards, which takes
// the course's pars to tell an ace (eagle on a par 3) from a plain eagle
export { FORTUNE_CONFIG, destinyDue, fortuneEligible } from './fortune'
export { courseBySlug } from './courses'
// the referee stamps every submission's season from the SAME calendar the
// client displays — one implementation, bundled into engine.mjs
export { seasonForDate, type Season } from './season'

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

export const AGGRESSIVE_BUDGET = 8

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
  // every historical practice prefix parses forever; the prefix itself is the
  // conditions version (practiceConditions gates pin/gust draws on it) — see
  // the conditions-versioning note in daily.ts
  const practice = /^practice2?:([a-z0-9-]+):/.exec(base)
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
  // Par-3 short courses sit outside fortune entirely: eighteen ace chances a
  // round would let a due destiny be cashed on the cheapest tee in the game.
  // Aces there are pure odds — see the par-3 paragraph in fortune.ts.
  if (!info.fortune || !fortuneEligible(info.course)) return { ace: false, albatross: false }
  const due = destinyDue(info.mode, info.fortune)
  return { ace: due.ace, albatross: due.albatross }
}

/** The per-shot probability boosts that DO flow through the honest odds. */
export function fortuneOddsFor(info: SeedInfo): { acePerShot: number; albPerShot: number } | undefined {
  if (!info.fortune || !fortuneEligible(info.course)) return undefined
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
  const holeCount = info.course.holes.length
  if (!Array.isArray(decisions) || decisions.length !== holeCount) {
    return { ok: false, error: `need ${holeCount} holes of decisions` }
  }

  // dice ignore the fortune tail — see roundRng in the store for why
  const rng = rngFromString(splitFortune(seed).base)
  const scores: HoleScore[] = []
  let aggressiveLeft = AGGRESSIVE_BUDGET
  const plan = destinyPlan(info)
  const fOdds = fortuneOddsFor(info)

  for (let i = 0; i < holeCount; i++) {
    const spec = info.course.holes[i]
    const layout = buildLayout(info.course.slug, spec, info.cond)
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
      // destiny: the round's first qualifying shot of a due track holes out.
      // An albatross attempt only qualifies while the shot is still FOR 2
      // (h.strokes === 1): after a tee-shot penalty the "go" would finish as
      // an eagle, so it neither fires nor spends the guarantee — the plan
      // stays live for the next clean chance.
      let destiny: MomentKind | undefined
      if (plan.ace && spec.par === 3 && h.ball.lie === 'tee') {
        destiny = 'ace'
        plan.ace = false
      } else if (plan.albatross && h.stage === 'second' && choice === 'aggressive' && h.strokes === 1) {
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
  if (scores.length === 0 || scores.some((s) => !s)) return null
  return scores.map((s) => s!.shots.map((shot) => shot.choice))
}

// ---------------------------------------------------------------------------
// Clubhouse decision stats (Layer 2) — one row per (hole, stage) actually
// played, for daily_hole_choices
// ---------------------------------------------------------------------------

export interface ChoiceRow {
  hole: number
  stage: Stage
  choice: Choice
}

/** One row per (hole, stage) a validated round actually played: the FIRST
 * shot at that stage, in play order — a multi-putt hole's putt row is the
 * OPENING putt's choice, and re-entering approach after a penalty doesn't
 * mint a second row. `hole` is 1-based (scores[i] => hole i+1), matching the
 * daily_hole_choices schema. Defensive against null entries (the array type
 * some callers hold, e.g. an in-progress round's scores, permits them) even
 * though a validated replay's `scores` is always fully populated. */
export function choiceRowsFromReplay(scores: (HoleScore | null | undefined)[]): ChoiceRow[] {
  const rows: ChoiceRow[] = []
  scores.forEach((score, i) => {
    if (!score) return
    const seenStages = new Set<Stage>()
    for (const shot of score.shots) {
      if (seenStages.has(shot.stage)) continue
      seenStages.add(shot.stage)
      rows.push({ hole: i + 1, stage: shot.stage, choice: shot.choice })
    }
  })
  return rows
}

// ---------------------------------------------------------------------------
// Viewable replays — the same determinism, frame by frame
// ---------------------------------------------------------------------------

export interface ReplayFrame {
  /** 0-17 */
  holeIndex: number
  /** snapshot after this many shots on the hole (0 = standing on the tee) */
  shotIndex: number
  hole: HoleInPlay
  /** running to-par BEFORE this hole plus strokes so far on it */
  runningToPar: number
}

function snapshot(h: HoleInPlay): HoleInPlay {
  return { ...h, ball: { ...h.ball }, shots: [...h.shots], status: { ...h.status } }
}

/** Every viewable moment of a round: tee frame + one frame per decision. */
export function replayFrames(seed: string, character: CharacterId | undefined, decisions: Choice[][]): ReplayFrame[] | null {
  const outcome = replayRound(seed, character, decisions)
  if (!outcome.ok) return null
  const info = outcome.info
  // re-run, capturing states this time (cheap: one extra pass). Fortune is
  // mirrored exactly as in replayRound — the dice ignore the fortune tail, the
  // shot odds carry the boosts, and a due track's first qualifying shot holes
  // out — or the frames diverge from the validated score.
  const rng = rngFromString(splitFortune(seed).base)
  const plan = destinyPlan(info)
  const fOdds = fortuneOddsFor(info)
  const frames: ReplayFrame[] = []
  let runToPar = 0
  for (let i = 0; i < info.course.holes.length; i++) {
    const spec = info.course.holes[i]
    const layout = buildLayout(info.course.slug, spec, info.cond)
    const h = startHole(layout, info.cond, character, fOdds)
    frames.push({ holeIndex: i, shotIndex: 0, hole: snapshot(h), runningToPar: runToPar })
    decisions[i].forEach((choice, j) => {
      let destiny: MomentKind | undefined
      if (plan.ace && spec.par === 3 && h.ball.lie === 'tee') {
        destiny = 'ace'
        plan.ace = false
      } else if (plan.albatross && h.stage === 'second' && choice === 'aggressive' && h.strokes === 1) {
        destiny = 'albatross'
        plan.albatross = false
      }
      playShot(h, choice, rng, destiny)
      frames.push({ holeIndex: i, shotIndex: j + 1, hole: snapshot(h), runningToPar: runToPar })
    })
    runToPar += h.score!.strokes - spec.par
  }
  return frames
}

export interface ReplayPayload {
  seed: string
  character?: CharacterId
  decisions: Choice[][]
  /** optional display name of who played it */
  name?: string
}

const CHOICE_CHAR: Record<Choice, string> = { safe: 's', normal: 'n', aggressive: 'a' }
const CHAR_CHOICE: Record<string, Choice> = { s: 'safe', n: 'normal', a: 'aggressive' }

/** Compact, URL-safe replay code: share a round as pure data. */
export function encodeReplay(p: ReplayPayload): string {
  const d = p.decisions.map((hole) => hole.map((c) => CHOICE_CHAR[c]).join('')).join('-')
  const raw = JSON.stringify({ v: 1, s: p.seed, c: p.character ?? '', d, n: p.name ?? '' })
  // btoa is fine: the payload is ASCII except possibly the name — escape it
  const b64 = btoa(unescape(encodeURIComponent(raw)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeReplay(code: string): ReplayPayload | null {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/')
    const raw = decodeURIComponent(escape(atob(b64)))
    const j = JSON.parse(raw) as { v: number; s: string; c: string; d: string; n?: string }
    if (j.v !== 1 || typeof j.s !== 'string' || typeof j.d !== 'string') return null
    const decisions = j.d.split('-').map((hole) => hole.split('').map((ch) => CHAR_CHOICE[ch]))
    // hole count varies by course (par-3 shorts run 9/10); replayRound checks the exact length
    if (decisions.length < 1 || decisions.length > 18 || decisions.some((h) => h.some((c) => !c))) return null
    const character = j.c === 'fairway' || j.c === 'dart' || j.c === 'greens' ? j.c : undefined
    return { seed: j.s, character, decisions, name: j.n || undefined }
  } catch {
    return null
  }
}
