/**
 * SMOKE TESTS — full-game sanity, run in CI on every pull request.
 *
 * These play entire rounds through the same store API the UI uses
 * (newRound → applyChoice → advanceHole) rather than poking engine
 * internals, so a regression anywhere in the pipeline — course data,
 * layout, odds, shot resolution, round state, persistence — fails here.
 *
 * If you add a feature (new course, new character, new stage, new
 * persistence key), extend this suite so the new surface is exercised.
 * See CLAUDE.md § Smoke tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { track } from './lib/analytics'
import { CHARACTERS } from './engine/characters'
import { COURSES, courseBySlug } from './engine/courses'
import { dailySetup, forecastSetup, practiceSetup, shareText, type DailySetup } from './engine/daily'
import { gradeCopy, gradeRound } from './engine/grade'
import { setupFromSeed } from './engine/replay'
import type { Choice } from './engine/types'
import {
  AGGRESSIVE_BUDGET,
  advanceHole,
  applyChoice,
  buildRecap,
  holeInPlay,
  newRound,
  roundToPar,
  usesBudget,
  type RoundState,
} from './state/store'

// track() is a no-op without a PostHog key, so stub it to assert on the calls
vi.mock('./lib/analytics', () => ({ track: vi.fn(), initAnalytics: vi.fn() }))

/** Play a full 18 through the store exactly like the UI does. */
function playRound(state: RoundState, pick: (s: RoundState) => Choice): RoundState {
  let s = state
  let guard = 0
  while (!s.complete) {
    if (guard++ > 18 * 25) throw new Error(`round did not finish (stuck on hole ${s.currentHole + 1})`)
    if (s.hole?.stage === 'done') {
      s = advanceHole(s)
      continue
    }
    const before = s
    s = applyChoice(s, pick(s))
    // applyChoice returning the same object means the choice was rejected —
    // a smoke round should never wedge on an illegal choice
    if (s === before) throw new Error(`choice rejected on hole ${s.currentHole + 1} at stage ${s.hole?.stage}`)
  }
  return s
}

const normalPolicy = (): Choice => 'normal'

/** Spends the aggressive budget early to exercise the budget bookkeeping. */
const aggressivePolicy = (s: RoundState): Choice => {
  const stage = s.hole?.stage
  if (stage && usesBudget(stage) && s.aggressiveLeft > 0) return 'aggressive'
  return 'normal'
}

function expectCompleteAndSane(s: RoundState): void {
  expect(s.complete).toBe(true)
  expect(s.scores).toHaveLength(18)
  expect(s.scores.every((sc) => sc !== null)).toBe(true)
  const course = courseBySlug(s.courseSlug)!
  for (let i = 0; i < 18; i++) {
    const sc = s.scores[i]!
    // 1..(par+5): the engine caps blowups well before double digits
    expect(sc.strokes).toBeGreaterThanOrEqual(1)
    expect(sc.strokes).toBeLessThanOrEqual(course.holes[i].par + 5)
    expect(sc.penalties).toBeGreaterThanOrEqual(0)
  }
  expect(s.aggressiveLeft).toBeGreaterThanOrEqual(0)
  expect(s.aggressiveLeft).toBeLessThanOrEqual(AGGRESSIVE_BUDGET)
  expect(Number.isFinite(roundToPar(s))).toBe(true)
}

describe('smoke: every course is playable start to finish', () => {
  it('completes a full round on all courses (characters rotated across courses)', () => {
    COURSES.forEach((course, i) => {
      const character = CHARACTERS[i % CHARACTERS.length].id
      const setup = practiceSetup(course.slug, 'smoke')
      const done = playRound(newRound(setup, 'practice', character), normalPolicy)
      expectCompleteAndSane(done)
    })
  })

  it('completes an aggressive round with every character and drains the budget', () => {
    for (const c of CHARACTERS) {
      const setup = practiceSetup(COURSES[0].slug, `smoke-agg-${c.id}`)
      const done = playRound(newRound(setup, 'practice', c.id), aggressivePolicy)
      expectCompleteAndSane(done)
      expect(done.aggressiveLeft).toBe(0)
    }
  })

  it('completes a characterless round (pre-character saves must keep working)', () => {
    const setup = practiceSetup(COURSES[1].slug, 'smoke-nochar')
    expectCompleteAndSane(playRound(newRound(setup, 'practice'), normalPolicy))
  })
})

describe('smoke: the daily is valid and deterministic for every course in rotation', () => {
  it('produces a sane, stable setup for each of the next 49 days', () => {
    // one day per course: the rotation is COURSES[(n - 1) % COURSES.length]
    for (let d = 0; d < COURSES.length; d++) {
      const date = new Date(2026, 6, 19 + d)
      const a = dailySetup(date)
      const b = dailySetup(date)
      expect(b).toEqual(a) // same date → identical daily for everyone
      expect(courseBySlug(a.course.slug)).toBe(a.course)
      expect(a.cond.wind).toBeGreaterThanOrEqual(3)
      expect(a.cond.difficulty).toBeGreaterThanOrEqual(1)
      expect(a.cond.difficulty).toBeLessThanOrEqual(10)
      expect(a.puzzleNumber).toBeGreaterThanOrEqual(1)
      expect(a.seed).toContain(a.dateKey)
    }
  })

  it('replaying the same seed with the same choices gives the identical round', () => {
    // dailies carry a per-player dice salt, so pin the seed to test determinism:
    // the SAME seed must always replay identically…
    const setup = dailySetup(new Date(2026, 6, 25))
    const first = newRound(setup, 'daily', 'dart', 'player-aaa')
    const a = playRound(first, aggressivePolicy)
    const b = playRound({ ...newRound(setup, 'daily', 'dart', 'player-aaa'), seed: first.seed }, aggressivePolicy)
    expect(b.scores).toEqual(a.scores)
    expect(roundToPar(b)).toBe(roundToPar(a))
  })

  it('two players get their own dice on the same daily (replays are not copyable)', () => {
    const setup = dailySetup(new Date(2026, 6, 25))
    // Dice are per *identity*, not per round: the salt is derived from the
    // player id so the referee can recompute it. Two identities, one strategy.
    // Anonymous players hold a server-minted id too, so this covers them.
    const a = playRound(newRound(setup, 'daily', 'dart', 'player-aaa'), aggressivePolicy)
    const b = playRound(newRound(setup, 'daily', 'dart', 'player-bbb'), aggressivePolicy)
    expect(a.seed).not.toBe(b.seed)
    const sameOutcome = JSON.stringify(a.scores) === JSON.stringify(b.scores)
    expect(sameOutcome).toBe(false)
  })

  it('the same player gets the same daily dice twice — no rerolling by replaying', () => {
    const setup = dailySetup(new Date(2026, 6, 25))
    // Salts are derived, not drawn. Restarting the daily must not deal a new
    // hand, or a player could reroll until the round went their way.
    expect(newRound(setup, 'daily', 'dart', 'player-aaa').seed).toBe(
      newRound(setup, 'daily', 'dart', 'player-aaa').seed,
    )
    // and a player whose identity mint never landed (offline) plays the one
    // canonical daily seed — checked via the parser so a growing seed format
    // doesn't fake a pass
    expect(setupFromSeed(newRound(setup, 'daily', 'dart').seed)!.salt).toBeUndefined()
  })
})

describe('smoke: tomorrow\'s forecast previews the exact daily that will land', () => {
  it('forecastSetup(D) equals dailySetup(tomorrow), by calendar day not +24h', () => {
    // include a month boundary and a year boundary, plus a plain mid-month day
    const dates = [
      new Date(2026, 6, 25), // plain day
      new Date(2026, 6, 31), // month boundary (Jul → Aug)
      new Date(2026, 11, 31), // year boundary (Dec 31 → Jan 1)
      new Date(2027, 1, 28), // Feb 28 → Mar 1 (2027 is not a leap year)
    ]
    for (const d of dates) {
      const tomorrow = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      tomorrow.setDate(tomorrow.getDate() + 1)

      const forecast = forecastSetup(d)
      const actualTomorrow = dailySetup(tomorrow)
      expect(forecast).toEqual(actualTomorrow)

      // it must differ from today's own daily, and carry a real course + conditions
      const today = dailySetup(d)
      expect(forecast.dateKey).not.toBe(today.dateKey)
      expect(forecast.course).toBeTruthy()
      expect(forecast.cond.wind).toBeGreaterThanOrEqual(3)
      expect(forecast.cond.difficulty).toBeGreaterThanOrEqual(1)
      expect(forecast.cond.difficulty).toBeLessThanOrEqual(10)
    }
  })
})

describe('smoke: a round survives the save/load JSON round-trip mid-hole', () => {
  it('resumes from serialized state and finishes with the same result as an uninterrupted round', () => {
    const setup = practiceSetup(COURSES[2].slug, 'smoke-save')
    const start = () => newRound(setup, 'practice', 'greens')

    // uninterrupted reference round
    const straight = playRound(start(), normalPolicy)

    // same round, but serialize/deserialize after every single choice —
    // this is what saveRound/loadRound do around localStorage
    let s = start()
    let guard = 0
    while (!s.complete) {
      if (guard++ > 18 * 25) throw new Error('resumed round did not finish')
      s = JSON.parse(JSON.stringify(s)) as RoundState
      s = s.hole?.stage === 'done' ? advanceHole(s) : applyChoice(s, 'normal')
    }
    expect(s.scores).toEqual(straight.scores)
  })

  it('rebuilds a live hole from persisted state without mutating the save', () => {
    const setup = practiceSetup(COURSES[3].slug, 'smoke-rebuild')
    let s = newRound(setup, 'practice', 'fairway')
    s = applyChoice(s, 'normal')
    const frozen = JSON.stringify(s)
    const h = holeInPlay(s)
    h.ball.pos += 100 // mutating the rebuilt hole must not leak into state
    expect(JSON.stringify(s)).toBe(frozen)
  })
})

describe('smoke: hole-level analytics track progress through the round', () => {
  beforeEach(() => {
    vi.mocked(track).mockClear()
  })

  /** The hole_completed payloads emitted so far, in order. */
  const holeEvents = (): Record<string, unknown>[] =>
    vi
      .mocked(track)
      .mock.calls.filter(([event]) => event === 'hole_completed')
      .map(([, props]) => (props ?? {}) as Record<string, unknown>)

  it('emits one hole_completed per hole, in order, with a running score', () => {
    const setup = practiceSetup(COURSES[4].slug, 'smoke-analytics')
    const done = playRound(newRound(setup, 'practice', 'dart'), normalPolicy)
    const events = holeEvents()

    expect(events).toHaveLength(18)
    expect(events.map((e) => e.hole_number)).toEqual(setup.course.holes.map((h) => h.number))

    events.forEach((e, i) => {
      const spec = setup.course.holes[i]
      expect(e.mode).toBe('practice')
      expect(e.course).toBe(setup.course.slug)
      expect(e.character).toBe('dart')
      expect(e.par).toBe(spec.par)
      expect(e.strokes).toBe(done.scores[i]!.strokes)
      expect(e.result).toBe(done.scores[i]!.result)
      expect(e.hole_to_par).toBe(done.scores[i]!.strokes - spec.par)
    })

    // the last hole's running total is the final score — this is the property
    // the drop-off-by-hole reporting leans on
    expect(events[17].running_to_par).toBe(roundToPar(done))
  })

  it('stops emitting where an abandoned round stopped', () => {
    const setup = practiceSetup(COURSES[5].slug, 'smoke-abandon')
    let s = newRound(setup, 'practice', 'greens')
    // walk off after finishing the 5th hole
    while (s.currentHole < 5) {
      s = s.hole?.stage === 'done' ? advanceHole(s) : applyChoice(s, 'normal')
    }

    const events = holeEvents()
    expect(events).toHaveLength(5)
    expect(events.map((e) => e.hole_number)).toEqual([1, 2, 3, 4, 5])
    expect(s.complete).toBe(false)
  })
})

describe('smoke: a finished round produces its result artifacts', () => {
  it('builds a recap and a well-formed share card', () => {
    const setup: DailySetup = dailySetup(new Date(2026, 6, 20))
    const done = playRound(newRound(setup, 'daily', 'dart'), aggressivePolicy)

    const recap = buildRecap(done)
    expect(recap).not.toBeNull()
    expect(recap!.aggressiveUsed).toBe(AGGRESSIVE_BUDGET)
    expect(recap!.best).not.toBeNull()

    const results = done.scores.map((sc) => sc!.result)
    const card = shareText(setup, results, roundToPar(done), 'dart')
    expect(card).toContain(`DOGLEG #${setup.puzzleNumber}`)
    expect(card).toContain(setup.course.name)
    expect(card).toContain('Dart Thrower')

    // the streak rides on the result line — but only when it's a brag:
    // 0 and 1 day streaks are omitted entirely, not shared as "1-day streak"
    expect(shareText(setup, results, roundToPar(done), 'dart', 12)).toContain('· 12-day streak')
    expect(shareText(setup, results, roundToPar(done), 'dart', 1)).not.toContain('streak')
    expect(shareText(setup, results, roundToPar(done), 'dart', 0)).not.toContain('streak')
    expect(card).not.toContain('streak')
  })

  it('grades the round — the caddie report identity, determinism, and copy', () => {
    const setup: DailySetup = dailySetup(new Date(2026, 6, 20))
    const done = playRound(newRound(setup, 'daily', 'dart'), aggressivePolicy)

    const grade = gradeRound(done)
    expect(grade).not.toBeNull()
    expect(grade!.decisionLoss).toBeGreaterThanOrEqual(0)
    // actualToPar decomposes exactly into expected-best + decision loss + luck + destiny
    expect(
      Math.abs(grade!.actualToPar - (grade!.expectedBestToPar + grade!.decisionLoss + grade!.luck + grade!.destinyBonus)),
    ).toBeLessThan(1e-9)

    // grading is a pure function of the finished round — same input, same output
    const again = gradeRound(done)
    expect(again).toEqual(grade)

    const copy = gradeCopy(grade!)
    expect(copy.headline.length).toBeGreaterThan(0)
    expect(copy.decisionLine.length).toBeGreaterThan(0)
    expect(copy.luckLine.length).toBeGreaterThan(0)
    expect(copy.headline).not.toMatch(/dice/i)
    expect(copy.decisionLine).not.toMatch(/dice/i)
    expect(copy.luckLine).not.toMatch(/dice/i)
  })
})
