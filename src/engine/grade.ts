/**
 * Round grading: split every stroke into decision quality (skill) and luck.
 *
 * Model: Q(s,c) = expected strokes-to-finish-the-hole from state s if the
 * player takes choice c right now (one bucket-weighted step, then the best
 * continuation). V(s) = min over feasible choices of Q(s,c), 0 once holed
 * out. decisionLoss = how much worse the actual pick was than the best pick
 * available (always >= 0). luck = how the ACTUAL outcome compared to what
 * the choice was worth on average (+ means the bounce was unlucky).
 *
 * Telescoping identity per hole: Σ(decisionLoss + luck) = actualStrokes −
 * V(holeStart) exactly (see docs/GRADING.md for the derivation). Destiny
 * (the forced ace/albatross holeout — see fortune.ts) is pulled out of luck
 * into its own destinyBonus term so a manufactured miracle doesn't read as
 * "you got lucky on your reads."
 *
 * Pure engine module: no UI, no store, no network. replay.ts must not import
 * this file (grade.ts depends on replay.ts's seed/destiny helpers, never the
 * other way around).
 */
import type {
  ApproachOdds,
  BallState,
  CharacterId,
  Choice,
  Conditions,
  HazardZone,
  HoleLayout,
  HoleScore,
  Lie,
  LongOdds,
  Odds,
  PuttOdds,
  ShortOdds,
  ShotRecord,
  Stage,
} from './types'
import { courseBySlug } from './courses'
import { buildLayout } from './layout'
import {
  approachOdds,
  longOdds,
  puttOdds,
  shortOdds,
  type ApproachMode,
  type ApproachOddsDetail,
  type FortuneShotOdds,
  type LongOddsDetail,
  type ZoneShare,
} from './odds'
import { AGGRESSIVE_BUDGET, destinyPlan, fortuneOddsFor, setupFromSeed } from './replay'

const CHOICES: Choice[] = ['safe', 'normal', 'aggressive']

// ---------------------------------------------------------------------------
// Frozen contract (Agent B's UI/store imports these verbatim)
// ---------------------------------------------------------------------------

export interface GradeInput {
  seed: string
  courseSlug: string
  cond: Conditions
  character?: CharacterId
  scores: (HoleScore | null)[]
}

export interface ShotGrade {
  shotIndex: number
  stage: Stage
  choice: Choice
  bestChoice: Choice
  evChosen: number
  evBest: number
  decisionLoss: number
  luck: number
  destiny: boolean
}

export interface HoleGrade {
  holeIndex: number
  par: number
  strokes: number
  expectedBest: number
  decisionLoss: number
  luck: number
  destinyBonus: number
  shots: ShotGrade[]
}

export interface RoundGrade {
  holes: HoleGrade[]
  decisionLoss: number
  luck: number
  destinyBonus: number
  expectedBestToPar: number
  actualToPar: number
  skillToPar: number
  decidedLike: number
}

export interface GradeCopy {
  headline: string
  decisionLine: string
  luckLine: string
}

// ---------------------------------------------------------------------------
// Gauss-Legendre 5-point quadrature (used to integrate putt EV over a
// uniform feet range instead of collapsing it to a single mean distance)
// ---------------------------------------------------------------------------

const GAUSS5_NODES = [0, -0.5384693101056831, 0.5384693101056831, -0.9061798459386640, 0.9061798459386640]
const GAUSS5_WEIGHTS = [0.5688888888888889, 0.4786286704993665, 0.4786286704993665, 0.2369268850561891, 0.2369268850561891]

function gauss5Average(lo: number, hi: number, f: (x: number) => number): number {
  const mid = (lo + hi) / 2
  const half = (hi - lo) / 2
  let sum = 0
  for (let i = 0; i < 5; i++) sum += GAUSS5_WEIGHTS[i] * f(mid + half * GAUSS5_NODES[i])
  return sum / 2
}

// ---------------------------------------------------------------------------
// Leaf value functions (putt / short game) — closed forms, no further
// recursion, so they're safe to call from anywhere without a depth budget.
// ---------------------------------------------------------------------------

function vPutt(cond: Conditions, feet: number, character: CharacterId | undefined): number {
  let best = Infinity
  for (const c of CHOICES) {
    const o = puttOdds(cond, feet, c, character)
    const q = o.one * 1 + o.two * 2 + o.three * 3
    if (q < best) best = q
  }
  return best
}

function nextVPuttLook(cond: Conditions, character: CharacterId | undefined, choice: Choice, kind: 'makeable' | 'lag'): number {
  let lo: number
  let span: number
  if (kind === 'makeable') {
    lo = 5
    span = choice === 'aggressive' ? 8 : 13
  } else {
    lo = 24
    span = choice === 'safe' ? 22 : 32
  }
  return gauss5Average(lo, lo + span, (feet) => vPutt(cond, feet, character))
}

/** Non-sand short game: strokes map is closed-form (every bucket is terminal). */
function vShortgameClosed(layout: HoleLayout, cond: Conditions, lie: Lie): number {
  let best = Infinity
  for (const c of CHOICES) {
    const o = shortOdds(layout, cond, { pos: layout.length - 10, lie, side: 'center' }, c)
    const q = o.holeout * 1 + o.updown * 2 + o.twochip * 3 + o.blowup * 4 + o.disaster * 5
    if (q < best) best = q
  }
  return best
}

/** Greenside sand: stillin loops back into the same decision, across kicks out
 * to the fringe. Value-iterate to the fixed point (shortOdds doesn't depend on
 * position, only lie/conditions/choice, so this is a single number per hole). */
function vSandFixedPoint(layout: HoleLayout, cond: Conditions): number {
  const sandBall: BallState = { pos: layout.length - 10, lie: 'sand', side: 'center' }
  const byChoice = new Map<Choice, ShortOdds>(CHOICES.map((c) => [c, shortOdds(layout, cond, sandBall, c)]))
  const vFringe = vShortgameClosed(layout, cond, 'fringe')
  let v = 0
  for (let it = 0; it < 30; it++) {
    let best = Infinity
    for (const c of CHOICES) {
      const o = byChoice.get(c)!
      const q =
        o.holeout * 1 + o.updown * 2 + o.twochip * 3 + o.blowup * 4 + o.disaster * 5 + o.stillin * (1 + v) + o.across * (1 + vFringe)
      if (q < best) best = q
    }
    v = best
  }
  return v
}

// ---------------------------------------------------------------------------
// Odds dispatch mirroring resolve.ts's oddsFor/approachMode, parameterized on
// a reconstructed (stage, ball) instead of a live HoleInPlay.
// ---------------------------------------------------------------------------

function approachModeFor(par: number, ball: BallState, layout: HoleLayout): ApproachMode {
  if (par === 3 && ball.lie === 'tee') return 'par3tee'
  const dist = layout.length - ball.pos
  if (dist <= 115 && (ball.lie === 'fairway' || ball.lie === 'dialed')) return 'wedge'
  return 'standard'
}

type DetailResult = { kind: 'long'; detail: LongOddsDetail } | { kind: 'approach'; detail: ApproachOddsDetail }

function detailFor(
  par: number,
  stage: Stage,
  ball: BallState,
  layout: HoleLayout,
  cond: Conditions,
  choice: Choice,
  character: CharacterId | undefined,
  fOdds: FortuneShotOdds | undefined,
): DetailResult {
  if (stage === 'tee') return { kind: 'long', detail: longOdds(layout, cond, ball, choice, 'tee', character) }
  if (stage === 'second') {
    if (choice === 'aggressive') return { kind: 'approach', detail: approachOdds(layout, cond, ball, choice, 'go', character, fOdds) }
    return { kind: 'long', detail: longOdds(layout, cond, ball, choice, 'layup', character) }
  }
  const mode = approachModeFor(par, ball, layout)
  return { kind: 'approach', detail: approachOdds(layout, cond, ball, choice, mode, character, fOdds) }
}

// ---------------------------------------------------------------------------
// Continuation state builders — deterministic MEAN positions per bucket,
// mirroring resolve.ts's drop formulas with jitter fixed at its mean (0).
// Water/sand (long game) and water (approach) drops depend on which hazard
// zone was involved, so those are exact probability-weighted mixtures over
// zoneShares rather than a single collapsed state.
// ---------------------------------------------------------------------------

function nextVLong(
  par: number,
  layout: HoleLayout,
  cond: Conditions,
  character: CharacterId | undefined,
  fOdds: FortuneShotOdds | undefined,
  stage: Stage,
  ball: BallState,
  window: [number, number],
  zoneShares: ZoneShare[],
  bucket: 'dialed' | 'fairway' | 'rough' | 'sand' | 'trees' | 'water',
  depth: number,
  waterDepth: number,
  memo: Map<string, number>,
): number {
  const L = layout.length
  const [wFrom, wTo] = window
  const mid = (wFrom + wTo) / 2
  const nextStage: Stage = par === 5 && stage === 'tee' ? 'second' : 'approach'
  const go = (pos: number, lie: Lie) => vOf(par, layout, cond, character, fOdds, nextStage, { pos, lie, side: 'center' }, depth + 1, waterDepth, memo)

  // dialed/fairway/rough land across a real jitter spread (resolve.ts's
  // `jitter(rng, spread)`), and downstream approach odds are non-linear in
  // distance (the wedge cutoff, the distance taper) — collapsing to the mean
  // position understates difficulty (Jensen's gap), so integrate over the
  // spread with the same 5-point quadrature used for putt distance.
  if (bucket === 'dialed') return gauss5Average(mid + 8 - 4, mid + 8 + 4, (pos) => go(Math.min(pos, L - 25), 'dialed'))
  if (bucket === 'fairway') return gauss5Average(mid - 10, mid + 10, (pos) => go(Math.min(pos, L - 25), 'fairway'))
  if (bucket === 'rough') return gauss5Average(mid - 16, mid + 16, (pos) => go(Math.min(pos, L - 25), 'rough'))
  if (bucket === 'sand') {
    const list = zoneShares.filter((s) => s.bucket === 'sand')
    if (!list.length) return go(Math.min(mid, L - 20), 'sand')
    const total = list.reduce((s, z) => s + z.share, 0) || 1
    return list.reduce((acc, z) => acc + (z.share / total) * go(Math.min((z.zone.from + z.zone.to) / 2, L - 20), 'sand'), 0)
  }
  if (bucket === 'trees') {
    // position formula is zone-invariant in resolve.ts; mixture collapses to one value
    return go(Math.min(wFrom, L - 40), 'trees')
  }
  // water
  const list = zoneShares.filter((s) => s.bucket === 'water')
  const calcPos = (z: HazardZone | null) => {
    const raw = z && z.side === 'cross' ? Math.max(ball.pos + 30, z.from - 8) : Math.max(ball.pos + 40, mid * 0.8)
    return Math.min(raw, L - 30)
  }
  if (!list.length) return go(calcPos(null), 'rough')
  const total = list.reduce((s, z) => s + z.share, 0) || 1
  return list.reduce((acc, z) => acc + (z.share / total) * go(calcPos(z.zone), 'rough'), 0)
}

function nextVApproachWater(
  par: number,
  layout: HoleLayout,
  cond: Conditions,
  character: CharacterId | undefined,
  fOdds: FortuneShotOdds | undefined,
  ball: BallState,
  missShares: ZoneShare[],
  depth: number,
  waterDepth: number,
  memo: Map<string, number>,
): number {
  const L = layout.length
  const list = missShares.filter((s) => s.bucket === 'water')
  const calcPos = (z: HazardZone | null) => {
    const raw = z && z.side === 'cross' ? Math.max(ball.pos, z.from - 10) : L - 44
    return Math.min(raw, L - 35)
  }
  const valueAt = (pos: number): number => {
    if (waterDepth >= 3) {
      // recursion depth cap: a water hazard that keeps eating shots is
      // approximated as a missed green from here on — documented in
      // docs/GRADING.md rather than chased to true convergence.
      return vShortgameClosed(layout, cond, 'fringe')
    }
    return vOf(par, layout, cond, character, fOdds, 'approach', { pos, lie: 'fairway', side: 'center' }, depth + 1, waterDepth + 1, memo)
  }
  if (!list.length) return valueAt(calcPos(null))
  const total = list.reduce((s, z) => s + z.share, 0) || 1
  return list.reduce((acc, z) => acc + (z.share / total) * valueAt(calcPos(z.zone)), 0)
}

// ---------------------------------------------------------------------------
// Q / V core
// ---------------------------------------------------------------------------

/** Q(s,c). When `facedOverride` is given, bucket probabilities come from the
 * persisted odds the player actually saw (step one); otherwise they're
 * recomputed fresh (every continuation level). Geometry (window/zoneShares)
 * always comes from a fresh call — it's honest resulting-state math, not
 * something the player "saw" as a probability. */
function computeQ(
  par: number,
  layout: HoleLayout,
  cond: Conditions,
  character: CharacterId | undefined,
  fOdds: FortuneShotOdds | undefined,
  stage: Stage,
  ball: BallState,
  choice: Choice,
  facedOverride: Odds | undefined,
  depth: number,
  waterDepth: number,
  memo: Map<string, number>,
): number {
  if (stage === 'putt') {
    const o = (facedOverride as PuttOdds | undefined) ?? puttOdds(cond, ball.puttFeet ?? 20, choice, character)
    return o.one * 1 + o.two * 2 + o.three * 3
  }
  if (stage === 'shortgame') {
    const o = (facedOverride as ShortOdds | undefined) ?? shortOdds(layout, cond, ball, choice)
    let q = o.holeout * 1 + o.updown * 2 + o.twochip * 3 + o.blowup * 4 + o.disaster * 5
    if (o.stillin > 0) q += o.stillin * (1 + vSandFixedPoint(layout, cond))
    if (o.across > 0) q += o.across * (1 + vShortgameClosed(layout, cond, 'fringe'))
    return q
  }

  const dr = detailFor(par, stage, ball, layout, cond, choice, character, fOdds)
  if (dr.kind === 'long') {
    const o = (facedOverride as LongOdds | undefined) ?? dr.detail.odds
    let q = 0
    for (const b of ['dialed', 'fairway', 'rough', 'sand', 'trees', 'water'] as const) {
      const p = o[b]
      if (p <= 0) continue
      const delta = b === 'water' ? 2 : 1
      const nv = nextVLong(par, layout, cond, character, fOdds, stage, ball, dr.detail.window, dr.detail.zoneShares, b, depth, waterDepth, memo)
      q += p * (delta + nv)
    }
    return q
  }

  const o = (facedOverride as ApproachOdds | undefined) ?? dr.detail.odds
  let q = o.holeout * 1 + o.kickin * 2
  if (o.makeable > 0) q += o.makeable * (1 + nextVPuttLook(cond, character, choice, 'makeable'))
  if (o.lag > 0) q += o.lag * (1 + nextVPuttLook(cond, character, choice, 'lag'))
  if (o.fringe > 0) q += o.fringe * (1 + vShortgameClosed(layout, cond, 'fringe'))
  if (o.sand > 0) q += o.sand * (1 + vSandFixedPoint(layout, cond))
  if (o.water > 0) q += o.water * (2 + nextVApproachWater(par, layout, cond, character, fOdds, ball, dr.detail.missShares, depth, waterDepth, memo))
  return q
}

/** V(s) = min over choices of Q(s,c), budget-free (documented approximation —
 * see docs/GRADING.md). Memoized per hole; `waterDepth` is part of the key
 * since the depth-capped approximation genuinely changes the value. */
function vOf(
  par: number,
  layout: HoleLayout,
  cond: Conditions,
  character: CharacterId | undefined,
  fOdds: FortuneShotOdds | undefined,
  stage: Stage | 'done',
  ball: BallState,
  depth: number,
  waterDepth: number,
  memo: Map<string, number>,
): number {
  if (stage === 'done') return 0
  if (depth > 12) return 0 // safety net; real chains never get this deep
  const key = `${stage}|${ball.lie}|${Math.round(ball.pos)}|${ball.puttFeet !== undefined ? Math.round(ball.puttFeet) : 'x'}|${waterDepth}`
  const cached = memo.get(key)
  if (cached !== undefined) return cached
  let best = Infinity
  for (const c of CHOICES) {
    const q = computeQ(par, layout, cond, character, fOdds, stage, ball, c, undefined, depth, waterDepth, memo)
    if (q < best) best = q
  }
  memo.set(key, best)
  return best
}

// ---------------------------------------------------------------------------
// Δ (actual strokes added) from the recorded outcome — never from
// strokesAfter, per the model.
// ---------------------------------------------------------------------------

function deltaForShot(shot: ShotRecord): number {
  if (shot.stage === 'putt') {
    return shot.outcome === 'one' ? 1 : shot.outcome === 'two' ? 2 : 3
  }
  if (shot.stage === 'shortgame') {
    switch (shot.outcome) {
      case 'holeout':
        return 1
      case 'updown':
        return 2
      case 'twochip':
        return 3
      case 'blowup':
        return 4
      case 'disaster':
        return 5
      default: // stillin, across — one swing each
        return 1
    }
  }
  const isApproachKind = shot.stage === 'approach' || (shot.stage === 'second' && shot.choice === 'aggressive')
  if (isApproachKind) {
    switch (shot.outcome) {
      case 'holeout':
        return 1
      case 'kickin':
        return 2
      case 'water':
        return 2
      default: // makeable, lag, fringe, sand
        return 1
    }
  }
  // long game: tee, or a non-aggressive second
  return shot.outcome === 'water' ? 2 : 1
}

// ---------------------------------------------------------------------------
// gradeRound
// ---------------------------------------------------------------------------

export function gradeRound(input: GradeInput): RoundGrade | null {
  if (!input || !Array.isArray(input.scores)) return null
  if (input.scores.some((s) => !s || !Array.isArray(s.shots) || s.shots.length === 0)) return null
  const course = courseBySlug(input.courseSlug)
  if (!course || input.scores.length !== course.holes.length) return null

  const info = setupFromSeed(input.seed)
  const fOdds = info ? fortuneOddsFor(info) : undefined
  const plan = info ? destinyPlan(info) : { ace: false, albatross: false }
  const character = input.character
  const cond = input.cond

  let aggLeft = AGGRESSIVE_BUDGET
  const holeGrades: HoleGrade[] = []
  let totalDecisionLoss = 0
  let totalLuck = 0
  let totalDestinyBonus = 0
  let expectedBestToPar = 0
  let actualToPar = 0

  for (let h = 0; h < course.holes.length; h++) {
    const spec = course.holes[h]
    const layout = buildLayout(course.slug, spec, cond)
    const score = input.scores[h]!
    const shots = score.shots
    const n = shots.length
    const memo = new Map<string, number>()

    const shotGrades: ShotGrade[] = []
    let holeDecisionLoss = 0
    let holeLuck = 0
    let holeDestinyBonus = 0

    // Pass 1: per-shot Q from faced odds, budget-aware feasibility, threading
    // the round-wide aggressive budget in real play order. This produces one
    // canonical V per real checkpoint (checkpointV[k] = V(state before shot
    // k); checkpointV[n] = 0, terminal).
    const checkpointV = new Array<number>(n + 1)
    checkpointV[n] = 0
    const perShot: { evChosen: number; evBest: number; bestChoice: Choice; decisionLoss: number; delta: number }[] = []
    let prevBall: BallState = { pos: 0, lie: 'tee', side: 'center' }
    for (let k = 0; k < n; k++) {
      const shot = shots[k]
      // a loaded round is only parsed, never validated — stale or corrupted
      // storage must make the round ungradeable, not crash the result flow
      if (!shot || !shot.stage || !shot.choice || !shot.after || !shot.faced) return null
      if (CHOICES.some((c) => !shot.faced[c]?.odds)) return null
      const stageK = shot.stage
      const ballK = prevBall
      const budgeted = stageK === 'tee' || stageK === 'second' || stageK === 'approach'
      const aggFeasible = !(budgeted && aggLeft <= 0)
      const feasible: Choice[] = aggFeasible ? CHOICES : ['safe', 'normal']

      const qByChoice: Record<Choice, number> = { safe: 0, normal: 0, aggressive: 0 }
      for (const c of CHOICES) {
        qByChoice[c] = computeQ(spec.par, layout, cond, character, fOdds, stageK, ballK, c, shot.faced[c].odds, 0, 0, memo)
      }
      let bestChoice: Choice = feasible[0]
      let evBest = qByChoice[feasible[0]]
      for (const c of feasible) {
        if (qByChoice[c] < evBest) {
          evBest = qByChoice[c]
          bestChoice = c
        }
      }
      const evChosen = qByChoice[shot.choice]
      const decisionLoss = Math.max(0, evChosen - evBest)

      checkpointV[k] = evBest
      perShot.push({ evChosen, evBest, bestChoice, decisionLoss, delta: deltaForShot(shot) })

      prevBall = shot.after
      if (shot.choice === 'aggressive' && budgeted) aggLeft -= 1
    }

    // Pass 2: luck is the residual against the SAME checkpointV used as the
    // next shot's own baseline — this is what makes the telescoping sum
    // exact rather than approximately exact.
    let strokesBefore = 0
    for (let k = 0; k < n; k++) {
      const shot = shots[k]
      const { evChosen, evBest, bestChoice, decisionLoss, delta } = perShot[k]
      const luckRaw = delta + checkpointV[k + 1] - evChosen

      let isDestiny = false
      if (plan.ace && spec.par === 3 && k === 0 && shot.outcome === 'holeout') {
        isDestiny = true
        plan.ace = false
      } else if (plan.albatross && shot.stage === 'second' && shot.choice === 'aggressive' && strokesBefore === 1 && shot.outcome === 'holeout') {
        isDestiny = true
        plan.albatross = false
      }

      shotGrades.push({
        shotIndex: k,
        stage: shot.stage,
        choice: shot.choice,
        bestChoice,
        evChosen,
        evBest,
        decisionLoss,
        luck: isDestiny ? 0 : luckRaw,
        destiny: isDestiny,
      })
      holeDecisionLoss += decisionLoss
      if (isDestiny) holeDestinyBonus += luckRaw
      else holeLuck += luckRaw

      strokesBefore += delta
    }

    const expectedBest = checkpointV[0]

    holeGrades.push({
      holeIndex: h,
      par: spec.par,
      strokes: score.strokes,
      expectedBest,
      decisionLoss: holeDecisionLoss,
      luck: holeLuck,
      destinyBonus: holeDestinyBonus,
      shots: shotGrades,
    })
    totalDecisionLoss += holeDecisionLoss
    totalLuck += holeLuck
    totalDestinyBonus += holeDestinyBonus
    expectedBestToPar += expectedBest - spec.par
    actualToPar += score.strokes - spec.par
  }

  const skillToPar = actualToPar - totalLuck - totalDestinyBonus
  // malformed odds values (wrong types, missing buckets) surface as NaN in
  // the sums — an ungradeable round, not one worth showing
  if (![totalDecisionLoss, totalLuck, totalDestinyBonus, expectedBestToPar, skillToPar].every(Number.isFinite)) return null
  return {
    holes: holeGrades,
    decisionLoss: totalDecisionLoss,
    luck: totalLuck,
    destinyBonus: totalDestinyBonus,
    expectedBestToPar,
    actualToPar,
    skillToPar,
    decidedLike: Math.round(skillToPar),
  }
}

/** Test/tooling hook: Q(s,c) using freshly recomputed odds (no faced
 * override) — not part of the frozen UI contract, but handy for building a
 * greedy-by-Q policy in calibration tests. */
export function evaluateChoice(
  par: number,
  layout: HoleLayout,
  cond: Conditions,
  character: CharacterId | undefined,
  fOdds: FortuneShotOdds | undefined,
  stage: Stage,
  ball: BallState,
  choice: Choice,
): number {
  return computeQ(par, layout, cond, character, fOdds, stage, ball, choice, undefined, 0, 0, new Map())
}

// ---------------------------------------------------------------------------
// gradeCopy
// ---------------------------------------------------------------------------

function fmtToPar(n: number): string {
  const r = Math.round(n)
  if (r === 0) return 'E'
  return r > 0 ? `+${r}` : `${r}`
}

export function gradeCopy(g: RoundGrade): GradeCopy {
  const headline = `You shot ${fmtToPar(g.actualToPar)}, but you decided like a ${fmtToPar(g.decidedLike)} player.`

  const luck = g.luck
  let luckLine: string
  if (luck <= -1.5) luckLine = 'The golf gods owed you one — and paid up.'
  else if (luck <= -0.5) luckLine = 'A few kind bounces went your way.'
  else if (luck < 0.5) luckLine = 'An honest day — the course played it straight.'
  else if (luck < 1.5) luckLine = "A couple of lip-outs that just wouldn't drop."
  else luckLine = 'We all have off days — try getting better sleep.'
  if (g.destinyBonus < 0) luckLine += ' And when the golf gods finally cashed in your patience, they cashed in big.'

  const dl = g.decisionLoss
  const decisionLine =
    dl < 0.5
      ? 'Coach-approved. Barely a stroke left on the table.'
      : dl < 1.5
        ? 'A couple of loose calls, nothing shameful.'
        : dl < 3
          ? 'The scorecard flatters the game plan.'
          : "The course didn't beat you — the game plan did."

  return { headline, decisionLine, luckLine }
}
