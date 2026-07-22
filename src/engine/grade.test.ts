import { describe, expect, it } from 'vitest'
import { COURSES } from './courses'
import { buildLayout } from './layout'
import { splitFortune } from './fortune'
import type { FortuneShotOdds } from './odds'
import { oddsFor, playShot, startHole, type HoleInPlay } from './resolve'
import { rngFromString } from './rng'
import { destinyPlan, fortuneOddsFor, replayRound, setupFromSeed } from './replay'
import { evaluateChoice, gradeCopy, gradeRound, type GradeInput, type RoundGrade } from './grade'
import type { BallState, CharacterId, Choice, Stage } from './types'

const CHOICES: Choice[] = ['safe', 'normal', 'aggressive']

// ---------------------------------------------------------------------------
// Round generation helpers — mirror replay.ts's loop (destiny + budget) so a
// policy-driven simulation produces a decision list that replayRound (and
// therefore gradeRound) will reproduce exactly.
// ---------------------------------------------------------------------------

type Policy = (h: HoleInPlay, aggLeft: number) => Choice

function genDecisions(seed: string, character: CharacterId | undefined, policy: Policy): Choice[][] {
  const info = setupFromSeed(seed)
  if (!info) throw new Error(`bad seed: ${seed}`)
  const rng = rngFromString(splitFortune(seed).base)
  const plan = destinyPlan(info)
  const fOdds = fortuneOddsFor(info)
  const decisions: Choice[][] = []
  let aggLeft = 8
  for (let i = 0; i < 18; i++) {
    const spec = info.course.holes[i]
    const layout = buildLayout(info.course.slug, spec, info.cond)
    const h = startHole(layout, info.cond, character, fOdds)
    const holeChoices: Choice[] = []
    let guard = 0
    while (h.stage !== 'done' && guard++ < 20) {
      const budgeted = h.stage === 'tee' || h.stage === 'second' || h.stage === 'approach'
      let choice = policy(h, aggLeft)
      if (choice === 'aggressive' && budgeted && aggLeft <= 0) choice = 'normal'
      if (choice === 'aggressive' && budgeted) aggLeft--
      let destiny: 'ace' | 'albatross' | undefined
      if (plan.ace && spec.par === 3 && h.ball.lie === 'tee') {
        destiny = 'ace'
        plan.ace = false
      } else if (plan.albatross && h.stage === 'second' && choice === 'aggressive' && h.strokes === 1) {
        destiny = 'albatross'
        plan.albatross = false
      }
      holeChoices.push(choice)
      playShot(h, choice, rng, destiny)
    }
    decisions.push(holeChoices)
  }
  return decisions
}

function buildInput(seed: string, character: CharacterId | undefined, policy: Policy): GradeInput {
  const info = setupFromSeed(seed)!
  const decisions = genDecisions(seed, character, policy)
  const outcome = replayRound(seed, character, decisions)
  if (!outcome.ok) throw new Error(`replay failed: ${outcome.error}`)
  return { seed, courseSlug: info.course.slug, cond: info.cond, character, scores: outcome.scores }
}

const allSafe: Policy = () => 'safe'
const allNormal: Policy = () => 'normal'
const aggressiveEarly: Policy = () => 'aggressive'
const mixed: Policy = (h) => {
  const si = h.layout.spec.strokeIndex
  if (h.stage === 'putt') return h.ball.puttFeet && h.ball.puttFeet <= 10 ? 'aggressive' : 'normal'
  if (h.stage === 'shortgame') return 'normal'
  return si <= 6 ? 'safe' : si >= 14 ? 'aggressive' : 'normal'
}
/** Greedy by the model's own Q, honest about the budget it's actually playing
 * under. Two things a real player (and the model's own V, which "ignores
 * budget" by design — see docs/GRADING.md) both have to reckon with:
 *  - never claim a choice you can't actually still make (budget exhausted).
 *  - a scarce, round-wide resource shouldn't be spent on a marginal edge —
 *    only take "aggressive" over the best alternative when it's CLEARLY
 *    better (0.2 strokes), so the 8 slots land on the handful of decisions
 *    (a par-5 go-for-it, mostly) where they're actually worth the most,
 *    rather than being front-loaded onto whatever borderline tee shot comes
 *    first. A policy that spends the budget on every marginal edge would
 *    systematically run past a budget-blind V's baseline — that's the
 *    approximation the model documents, not a bug to chase out of it. */
function greedyPolicy(character: CharacterId | undefined, fOdds: FortuneShotOdds | undefined): Policy {
  const AGGRESSIVE_MARGIN = 0.2
  return (h, aggLeft) => {
    const budgeted = h.stage === 'tee' || h.stage === 'second' || h.stage === 'approach'
    const feasible: Choice[] = budgeted && aggLeft <= 0 ? ['safe', 'normal'] : CHOICES
    const q = new Map<Choice, number>()
    for (const c of feasible) {
      q.set(c, evaluateChoice(h.layout.spec.par, h.layout, h.cond, character, fOdds, h.stage as Stage, h.ball, c))
    }
    let best: Choice = feasible[0]
    let bestQ = Infinity
    for (const c of feasible) {
      const v = q.get(c)!
      if (v < bestQ) {
        bestQ = v
        best = c
      }
    }
    if (budgeted && best === 'aggressive') {
      const runnerUp = Math.min(...feasible.filter((c) => c !== 'aggressive').map((c) => q.get(c)!))
      if (runnerUp - bestQ < AGGRESSIVE_MARGIN) {
        best = feasible.filter((c) => c !== 'aggressive').reduce((a, b) => (q.get(a)! <= q.get(b)! ? a : b))
      }
    }
    return best
  }
}

const PRACTICE_SLUGS = COURSES.slice(0, 10).map((c) => c.slug)
function practiceSeed(slugIdx: number, tag: string): string {
  return `practice:${PRACTICE_SLUGS[slugIdx % PRACTICE_SLUGS.length]}:${tag}`
}

// ---------------------------------------------------------------------------
// 1. Determinism
// ---------------------------------------------------------------------------

describe('gradeRound: determinism', () => {
  it('grading the same round twice is bit-for-bit identical', () => {
    const input = buildInput(practiceSeed(0, 'det'), 'dart', mixed)
    const a = gradeRound(input)
    const b = gradeRound(input)
    expect(a).not.toBeNull()
    expect(a).toEqual(b)
  })
})

describe('gradeRound: malformed input', () => {
  it('returns null instead of throwing when a shot record is corrupted', () => {
    // stale/partially-corrupted localStorage rounds are parsed but never
    // validated — grading must degrade to "ungradeable", not crash the
    // end-of-round flow (analytics + result screen)
    const base = buildInput(practiceSeed(0, 'det'), 'dart', mixed)
    const corrupt = (mutate: (s: Record<string, unknown>) => void) => {
      const input = JSON.parse(JSON.stringify(base)) as typeof base
      mutate(input.scores[4]!.shots[0] as unknown as Record<string, unknown>)
      return gradeRound(input)
    }
    expect(corrupt((s) => delete s.faced)).toBeNull()
    expect(corrupt((s) => delete (s.faced as Record<string, unknown>).aggressive)).toBeNull()
    expect(corrupt((s) => ((s.faced as Record<string, { odds?: unknown }>).safe.odds = undefined))).toBeNull()
    expect(corrupt((s) => delete s.after)).toBeNull()
    expect(corrupt((s) => delete s.stage)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. Identity (telescoping)
// ---------------------------------------------------------------------------

describe('gradeRound: telescoping identity', () => {
  const characters: (CharacterId | undefined)[] = [undefined, 'fairway', 'dart', 'greens']
  const policies: [string, Policy][] = [
    ['all-safe', allSafe],
    ['all-normal', allNormal],
    ['mixed', mixed],
  ]

  it('actual strokes == expectedBest + decisionLoss + luck + destinyBonus, per hole and round', () => {
    let n = 0
    for (let i = 0; i < 30; i++) {
      const character = characters[i % characters.length]
      const [, policy] = policies[i % policies.length]
      const seed = practiceSeed(i, `identity-${i}`)
      const input = buildInput(seed, character, policy)
      const g = gradeRound(input)
      expect(g).not.toBeNull()
      const grade = g as RoundGrade
      n++

      for (const hole of grade.holes) {
        const rhs = hole.expectedBest + hole.decisionLoss + hole.luck + hole.destinyBonus
        expect(Math.abs(hole.strokes - rhs)).toBeLessThan(1e-9)
      }
      const roundRhs = grade.expectedBestToPar + grade.decisionLoss + grade.luck + grade.destinyBonus
      expect(Math.abs(grade.actualToPar - roundRhs)).toBeLessThan(1e-9)
    }
    expect(n).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// 3. Dominance
// ---------------------------------------------------------------------------

describe('gradeRound: dominance', () => {
  it('decisionLoss is never negative, bestChoice always has zero loss, putt EV matches the closed form', () => {
    for (let i = 0; i < 8; i++) {
      const input = buildInput(practiceSeed(i, `dom-${i}`), i % 2 ? 'greens' : undefined, mixed)
      const grade = gradeRound(input)!
      for (const hole of grade.holes) {
        for (const shot of hole.shots) {
          expect(shot.decisionLoss).toBeGreaterThanOrEqual(0)
          if (shot.choice === shot.bestChoice) {
            expect(shot.decisionLoss).toBe(0)
          }
          if (shot.stage === 'putt') {
            const score = input.scores[hole.holeIndex]!
            const rec = score.shots[shot.shotIndex]
            const o = rec.faced[rec.choice].odds as { one: number; two: number; three: number }
            expect(shot.evChosen).toBeCloseTo(o.one * 1 + o.two * 2 + o.three * 3, 9)
          }
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Destiny
// ---------------------------------------------------------------------------

describe('gradeRound: destiny', () => {
  it('a forced ace is flagged, pulled out of luck into a negative destinyBonus, identity still exact', () => {
    const seed = 'round:2026-07-19:pebble-beach:f150.0.0.0.0'
    const input = buildInput(seed, undefined, allNormal)
    const grade = gradeRound(input)!
    expect(grade.destinyBonus).toBeLessThan(0)

    let found = false
    for (const hole of grade.holes) {
      for (const shot of hole.shots) {
        if (shot.destiny) {
          found = true
          expect(shot.luck).toBe(0)
        }
      }
      const rhs = hole.expectedBest + hole.decisionLoss + hole.luck + hole.destinyBonus
      expect(Math.abs(hole.strokes - rhs)).toBeLessThan(1e-9)
    }
    expect(found).toBe(true)
    const roundRhs = grade.expectedBestToPar + grade.decisionLoss + grade.luck + grade.destinyBonus
    expect(Math.abs(grade.actualToPar - roundRhs)).toBeLessThan(1e-9)
  })

  it('a forced albatross (aggressive go-for-it) is flagged the same way', () => {
    const seed = 'round:2026-07-19:pebble-beach:f0.0.150.0.0'
    const input = buildInput(seed, undefined, aggressiveEarly)
    const grade = gradeRound(input)!
    expect(grade.destinyBonus).toBeLessThan(0)
    const flagged = grade.holes.flatMap((h) => h.shots).filter((s) => s.destiny)
    expect(flagged.length).toBe(1)
    expect(flagged[0].luck).toBe(0)
  })

  it('a non-firing plan reports zero destinyBonus', () => {
    const input = buildInput(practiceSeed(2, 'no-destiny'), undefined, allNormal)
    const grade = gradeRound(input)!
    expect(grade.destinyBonus).toBe(0)
    for (const hole of grade.holes) {
      expect(hole.destinyBonus).toBe(0)
      for (const shot of hole.shots) expect(shot.destiny).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// 5. Budget
// ---------------------------------------------------------------------------

describe('gradeRound: budget', () => {
  it('once the aggressive budget is exhausted, no budgeted bestChoice is aggressive', () => {
    const input = buildInput(practiceSeed(3, 'budget'), undefined, aggressiveEarly)
    const grade = gradeRound(input)!
    let aggPlays = 0
    let sawExhaustion = false
    for (const hole of grade.holes) {
      for (const shot of hole.shots) {
        const budgeted = shot.stage === 'tee' || shot.stage === 'second' || shot.stage === 'approach'
        if (aggPlays >= 8 && budgeted) {
          sawExhaustion = true
          expect(shot.bestChoice).not.toBe('aggressive')
        }
        if (budgeted && shot.choice === 'aggressive') aggPlays++
      }
    }
    expect(aggPlays).toBeGreaterThanOrEqual(8)
    expect(sawExhaustion).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 6. Drift guard — recomputed step-one odds vs. what was actually faced
// ---------------------------------------------------------------------------

describe('gradeRound: drift guard', () => {
  it('recomputed step-one odds match the persisted faced odds bucket-by-bucket', () => {
    const seed = practiceSeed(4, 'drift')
    const character: CharacterId = 'fairway'
    const decisions = genDecisions(seed, character, mixed)
    const outcome = replayRound(seed, character, decisions)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const info = setupFromSeed(seed)!
    const fOdds = fortuneOddsFor(info)

    for (let hIdx = 0; hIdx < 18; hIdx++) {
      const spec = info.course.holes[hIdx]
      const layout = buildLayout(info.course.slug, spec, info.cond)
      let ball: BallState = { pos: 0, lie: 'tee', side: 'center' }
      const shots = outcome.scores[hIdx].shots
      for (const shot of shots) {
        const fake = {
          layout,
          cond: info.cond,
          character,
          fortuneOdds: fOdds,
          stage: shot.stage,
          ball,
        } as unknown as HoleInPlay
        for (const c of CHOICES) {
          const recomputed = oddsFor(fake, c) as unknown as Record<string, number>
          const faced = shot.faced[c].odds as unknown as Record<string, number>
          for (const key of Object.keys(faced)) {
            if (key === 'kind') continue
            expect(recomputed[key]).toBeCloseTo(faced[key], 10)
          }
        }
        ball = shot.after
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 7. Copy — dice ban + headline formatting
// ---------------------------------------------------------------------------

describe('gradeCopy', () => {
  function fakeGrade(overrides: Partial<RoundGrade>): RoundGrade {
    return {
      holes: [],
      decisionLoss: 0,
      luck: 0,
      destinyBonus: 0,
      expectedBestToPar: 0,
      actualToPar: 0,
      skillToPar: 0,
      decidedLike: 0,
      ...overrides,
    }
  }

  it('never mentions dice, in any bucket', () => {
    const luckValues = [-3, -1, 0, 1, 3]
    const decisionValues = [0, 1, 2, 4]
    for (const luck of luckValues) {
      for (const decisionLoss of decisionValues) {
        for (const destinyBonus of [0, -1]) {
          const g = fakeGrade({ luck, decisionLoss, destinyBonus, actualToPar: 2, decidedLike: -1 })
          const copy = gradeCopy(g)
          expect(copy.headline).not.toMatch(/dice/i)
          expect(copy.decisionLine).not.toMatch(/dice/i)
          expect(copy.luckLine).not.toMatch(/dice/i)
        }
      }
    }
  })

  it('headline formats +/-/E correctly', () => {
    expect(gradeCopy(fakeGrade({ actualToPar: 2, decidedLike: -1 })).headline).toBe(
      'You shot +2, but you decided like a -1 player.',
    )
    expect(gradeCopy(fakeGrade({ actualToPar: 0, decidedLike: 0 })).headline).toBe(
      'You shot E, but you decided like a E player.',
    )
    expect(gradeCopy(fakeGrade({ actualToPar: -3, decidedLike: -3 })).headline).toBe(
      'You shot -3, but you decided like a -3 player.',
    )
  })
})

// ---------------------------------------------------------------------------
// 8. Monte Carlo calibration
// ---------------------------------------------------------------------------

describe('gradeRound: calibration (Monte Carlo)', () => {
  const N = 200

  it('greedy-by-Q policy plays close to its own expected-best baseline', () => {
    let sumDiff = 0
    let sumLoss = 0
    let shotCount = 0
    for (let i = 0; i < N; i++) {
      const seed = practiceSeed(i, `greedy-${i}`)
      const info = setupFromSeed(seed)!
      const fOdds = fortuneOddsFor(info)
      const input = buildInput(seed, undefined, greedyPolicy(undefined, fOdds))
      const grade = gradeRound(input)!
      sumDiff += grade.actualToPar - grade.expectedBestToPar
      for (const hole of grade.holes) {
        for (const shot of hole.shots) {
          sumLoss += shot.decisionLoss
          shotCount++
        }
      }
    }
    const meanDiff = sumDiff / N
    const meanLoss = sumLoss / shotCount
    // eslint-disable-next-line no-console
    console.log('[grade calibration] greedy-by-Q:', JSON.stringify({ meanDiff, meanLoss, shotCount }))
    expect(Math.abs(meanDiff)).toBeLessThan(0.7)
    expect(meanLoss).toBeLessThan(0.1)
  }, 30000)

  it('all-normal policy has near-zero average luck', () => {
    let sumLuck = 0
    for (let i = 0; i < N; i++) {
      const seed = practiceSeed(i, `allnorm-${i}`)
      const input = buildInput(seed, undefined, allNormal)
      const grade = gradeRound(input)!
      sumLuck += grade.luck
    }
    const meanLuck = sumLuck / N
    // eslint-disable-next-line no-console
    console.log('[grade calibration] all-normal:', JSON.stringify({ meanLuck }))
    expect(Math.abs(meanLuck)).toBeLessThan(0.6)
  }, 20000)
})





