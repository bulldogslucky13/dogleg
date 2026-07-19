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
import { describe, expect, it } from 'vitest'
import { CHARACTERS } from './engine/characters'
import { COURSES, courseBySlug } from './engine/courses'
import { dailySetup, practiceSetup, shareText, type DailySetup } from './engine/daily'
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
    const setup = dailySetup(new Date(2026, 6, 25))
    const a = playRound(newRound(setup, 'daily', 'dart'), aggressivePolicy)
    const b = playRound(newRound(setup, 'daily', 'dart'), aggressivePolicy)
    expect(b.scores).toEqual(a.scores)
    expect(roundToPar(b)).toBe(roundToPar(a))
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
  })
})
