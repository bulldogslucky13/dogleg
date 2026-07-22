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
import { castLinesForHole, castRound } from './engine/cast'
import { CHARACTERS } from './engine/characters'
import { COURSES, PAR3_COURSES, courseBySlug, playRatingFor } from './engine/courses'
import { PLAY_RATINGS } from './engine/playRatings'
import { courseForPuzzle, dailySetup, forecastSetup, practiceSetup, shareText, type DailySetup } from './engine/daily'
import { gradeCopy, gradeRound } from './engine/grade'
import { decisionsFromScores, destinyPlan, fortuneOddsFor, replayRound, setupFromSeed } from './engine/replay'
import { approachOdds } from './engine/odds'
import { pinChip } from './engine/resolve'
import { buildLayout } from './engine/layout'
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
  const course = courseBySlug(s.courseSlug)!
  // round length is the course's real hole count (par-3 shorts run 9/10)
  expect(s.scores).toHaveLength(course.holes.length)
  expect(s.scores.every((sc) => sc !== null)).toBe(true)
  for (let i = 0; i < course.holes.length; i++) {
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

describe('smoke: par-3 short courses play start to finish at their real length', () => {
  it('completes a full round on every par-3 course (9-, 10-, and 18-hole)', () => {
    PAR3_COURSES.forEach((course, i) => {
      const character = CHARACTERS[i % CHARACTERS.length].id
      const setup = practiceSetup(course.slug, 'smoke-par3')
      const done = playRound(newRound(setup, 'practice', character), normalPolicy)
      expectCompleteAndSane(done)
      expect(done.scores).toHaveLength(course.holes.length)
      expect(course.holes.every((h) => h.par === 3)).toBe(true)
    })
  })

  it('validates by replay at its real hole count (the referee path)', () => {
    for (const course of PAR3_COURSES) {
      const setup = practiceSetup(course.slug, 'smoke-par3-replay')
      const done = playRound(newRound(setup, 'practice', 'dart'), normalPolicy)
      const decisions = decisionsFromScores(done.scores)
      expect(decisions).not.toBeNull()
      const replay = replayRound(done.seed, 'dart', decisions!)
      expect(replay.ok).toBe(true)
      if (replay.ok) expect(replay.toPar).toBe(roundToPar(done))
    }
  })

  it('never enters the daily rotation', () => {
    for (let n = 1; n <= 2 * COURSES.length; n++) {
      expect(courseForPuzzle(n).par3Course).toBeUndefined()
    }
  })

  it('fortune stays out of the shorts: no destiny, no boosts — even with a monster drought', () => {
    // counters far past every practice threshold: a normal course would owe destiny…
    const bigCourse = setupFromSeed('practice:pebble-beach:x:f5000.0.5000.0.0')!
    expect(destinyPlan(bigCourse)).toEqual({ ace: true, albatross: true })
    expect(fortuneOddsFor(bigCourse)).toBeDefined()
    // …but a par-3 short never pays it, and never boosts the per-shot odds
    for (const course of PAR3_COURSES) {
      const info = setupFromSeed(`practice:${course.slug}:x:f5000.0.5000.0.0`)!
      expect(destinyPlan(info)).toEqual({ ace: false, albatross: false })
      expect(fortuneOddsFor(info)).toBeUndefined()
    }
  })

  it('conditions carry pins for every par 3 and gusts only on the shorts', () => {
    // shorts: every hole has a pin and a gust, both deterministic per seed
    for (const course of PAR3_COURSES) {
      const cond = practiceSetup(course.slug, 'smoke-cond').cond
      const again = practiceSetup(course.slug, 'smoke-cond').cond
      expect(again).toEqual(cond)
      for (const h of course.holes) {
        expect(cond.pins?.[h.number]).toBeDefined()
        expect(typeof cond.gusts?.[h.number]).toBe('number')
      }
    }
    // rotation courses: pins on par 3s only, never gusts
    const daily = dailySetup().cond
    const course = dailySetup().course
    for (const h of course.holes) {
      if (h.par === 3) expect(daily.pins?.[h.number]).toBeDefined()
      else expect(daily.pins?.[h.number]).toBeUndefined()
    }
    expect(daily.gusts).toBeUndefined()
  })

  it('a finished short-course round counts its deuces; big courses stay null', () => {
    const done = playRound(newRound(practiceSetup('the-swing', 'smoke-deuce'), 'practice', 'dart'), normalPolicy)
    const recap = buildRecap(done)!
    const expected = done.scores.filter((s) => s?.strokes === 2).length
    expect(recap.deuces).toBe(expected)
    const big = playRound(newRound(practiceSetup('pebble-beach', 'smoke-deuce'), 'practice', 'dart'), normalPolicy)
    expect(buildRecap(big)!.deuces).toBeNull()
  })
})

describe('smoke: pin positions are an honest risk/reward axis on par-3 tees', () => {
  const spec = { number: 1, par: 3, yards: 150, strokeIndex: 9, dogleg: 'S', hazard: 'sand' } as const
  const cond = { wind: 10, greens: 'Medium', difficulty: 5 } as const
  const ball = { pos: 0, lie: 'tee', side: 'center' } as const

  function oddsWithPin(tier: 'open' | 'middle' | 'tucked', choice: 'safe' | 'normal' | 'aggressive') {
    const pinned = { ...cond, pins: { 1: { tier, side: 'center' as const } } }
    const layout = buildLayout('pin-smoke', { ...spec }, pinned)
    expect(layout.pin?.tier).toBe(tier)
    return approachOdds(layout, pinned, { ...ball }, choice, 'par3tee').odds
  }

  it('every pin tier still sums to 1 for every choice', () => {
    for (const tier of ['open', 'middle', 'tucked'] as const) {
      for (const choice of ['safe', 'normal', 'aggressive'] as const) {
        const o = oddsWithPin(tier, choice)
        const total = o.holeout + o.kickin + o.makeable + o.lag + o.fringe + o.sand + o.water
        expect(total).toBeCloseTo(1, 6)
      }
    }
  })

  it('a tucked pin pays the hunt and shelters the bail; holeout (ace) odds never move', () => {
    const aggTucked = oddsWithPin('tucked', 'aggressive')
    const aggMiddle = oddsWithPin('middle', 'aggressive')
    const safeTucked = oddsWithPin('tucked', 'safe')
    const safeMiddle = oddsWithPin('middle', 'safe')
    // hunting a tucked flag: closer looks AND more trouble
    expect(aggTucked.kickin).toBeGreaterThan(aggMiddle.kickin)
    expect(aggTucked.fringe + aggTucked.sand + aggTucked.water).toBeGreaterThan(
      aggMiddle.fringe + aggMiddle.sand + aggMiddle.water,
    )
    // bailing to the fat side: fewer looks, safer miss profile
    expect(safeTucked.kickin).toBeLessThan(safeMiddle.kickin)
    expect(safeTucked.fringe + safeTucked.sand + safeTucked.water).toBeLessThanOrEqual(
      safeMiddle.fringe + safeMiddle.sand + safeMiddle.water + 1e-9,
    )
    // the ace math is pin-proof (the par-3 course tuning depends on this)
    expect(aggTucked.holeout).toBeCloseTo(aggMiddle.holeout, 10)
  })

  it('the pin-framing chip names the flag and the trouble around it', () => {
    // this procedural sand par 3 grows greenside bunkers on three sides
    // (deterministic layout seed), so the tucked-left flag reads as surrounded
    const pinned = { ...cond, pins: { 1: { tier: 'tucked' as const, side: 'left' as const } } }
    const layout = buildLayout('pin-smoke', { ...spec }, pinned)
    expect(pinChip(layout)).toBe('Sucker pin left · trouble all around')
    // same flag with trouble only on its own side: the short-side warning
    const oneSide = { ...layout, zones: layout.zones.filter((z) => z.side === 'left') }
    expect(pinChip(oneSide)).toBe('Sucker pin left · short-sided')
    // no pin (par 4s, pre-pin saves): nothing to say
    expect(pinChip(buildLayout('pin-smoke', { ...spec }))).toBeNull()
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

  it('every course has a display Play Rating in 1..10 (generated table covers rotation)', () => {
    // The badge reads playRatingFor(slug); the generated table must cover every
    // course in the rotation, and the value must be a sane 1..10. This is the
    // display-only rating, kept separate from the engine's `difficulty` knob.
    for (const c of [...COURSES, ...PAR3_COURSES]) {
      expect(PLAY_RATINGS, `missing Play Rating for ${c.slug} — run pnpm gen:ratings`).toHaveProperty(c.slug)
      const r = playRatingFor(c.slug)
      expect(Number.isInteger(r)).toBe(true)
      expect(r).toBeGreaterThanOrEqual(1)
      expect(r).toBeLessThanOrEqual(10)
    }
    // Falls back to base difficulty for an unknown slug rather than throwing.
    expect(playRatingFor('no-such-course')).toBeGreaterThanOrEqual(1)
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

describe('smoke: the clubhouse cast is deterministic, choices-only, for every course', () => {
  it('is stable, seed-tail-proof, and produces a line per character on every hole', () => {
    const AGG_BUDGET = 8
    for (const course of COURSES) {
      const setup = dailySetup(new Date(2026, 6, 19)) // any daily conditions object will do
      const seed = `round:2026-07-19:${course.slug}`
      const cast = castRound({ course, cond: setup.cond, seed })
      // same seed → identical cast, every time
      const again = castRound({ course, cond: setup.cond, seed })
      expect(again).toEqual(cast)
      // a fortune tail must never change the cast — the cast never mirrors any player's dice
      const withTail = castRound({ course, cond: setup.cond, seed: `${seed}:f3.1.0.0.5` })
      expect(withTail).toEqual(cast)

      expect(cast).toHaveLength(CHARACTERS.length)
      const budgetLeft: Record<string, number> = Object.fromEntries(CHARACTERS.map((c) => [c.id, AGG_BUDGET]))
      for (let h = 0; h < 18; h++) {
        // every hole yields a line per character, and the lines name the character
        const lines = castLinesForHole(cast, h)
        expect(lines).toHaveLength(CHARACTERS.length)
        lines.forEach((line, i) => {
          expect(line).toContain(CHARACTERS[i].name)
          expect(line.length).toBeGreaterThan(0)
        })
      }
      // aggressive budget (8, tee/second/approach only) is never overspent across the round
      for (const entry of cast) {
        let spent = 0
        for (const holeShots of entry.holes) {
          for (const shot of holeShots) {
            const budgeted = shot.stage === 'tee' || shot.stage === 'second' || shot.stage === 'approach'
            if (shot.choice === 'aggressive' && budgeted) spent += 1
          }
        }
        expect(spent).toBeLessThanOrEqual(budgetLeft[entry.characterId])
      }
    }
  })

  it('benches the Fairway Finder on par-3 courses and keeps the lines honest', () => {
    for (const course of PAR3_COURSES) {
      const setup = practiceSetup(course.slug, 'smoke-cast-par3')
      const cast = castRound({ course, cond: setup.cond, seed: setup.seed })
      // same roster the pick screen offers: dart + greens, no zero-edge NPC
      expect(cast.map((c) => c.characterId)).toEqual(['dart', 'greens'])
      for (let h = 0; h < course.holes.length; h++) {
        const lines = castLinesForHole(cast, h)
        expect(lines).toHaveLength(2)
        for (const line of lines) {
          expect(line).not.toContain('Fairway Finder')
          // a charged putt is never described as flag-hunting, and the opener
          // on a one-shotter is always the shot into the green
          expect(line).not.toContain('flag-hunting again')
        }
      }
    }
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

  it('grades the round — the swing coach report identity, determinism, and copy', () => {
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

describe('smoke: signature flavor + island geometry decoupling', () => {
  const base = { number: 8, par: 3, yards: 150, strokeIndex: 4, dogleg: 'S', hazard: 'water' } as const

  it('island geometry follows the explicit flag, never the signature prose', () => {
    // island:true always rings the green with cross water
    const flagged = buildLayout('t', { ...base, island: true })
    expect(flagged.zones.some((z) => z.kind === 'water' && z.side === 'cross')).toBe(true)

    // geometry must ignore the signature string entirely: identical spec with
    // and without flavor prose yields byte-identical zones (the old regex is gone)
    const withProse = buildLayout('t', { ...base, island: true, signature: 'All carry to the island — no bailout' })
    expect(JSON.stringify(withProse.zones)).toBe(JSON.stringify(flagged.zones))
  })

  it('signatures survive the store pipeline onto the live hole', () => {
    // Sawgrass 17, the marquee island hole, carries both the flag and the flavor
    const sawgrass = courseBySlug('tpc-sawgrass')!
    const h17 = sawgrass.holes[16]
    expect(h17.island).toBe(true)
    expect(h17.signature).toBeTruthy()
    // the exact string the UI pill reads comes straight off the built layout
    expect(buildLayout(sawgrass.slug, h17).spec.signature).toBe(h17.signature)
  })

  it('every signature is well-formed and on-tone (no dice/odds talk)', () => {
    const withSig = [...COURSES, ...PAR3_COURSES].flatMap((c) => c.holes.filter((h) => h.signature))
    expect(withSig.length).toBeGreaterThan(20)
    for (const h of withSig) {
      expect(h.signature!.length).toBeGreaterThan(4)
      expect(h.signature!.length).toBeLessThan(90)
      expect(h.signature!).not.toMatch(/\bdice\b|\bodds\b|\brng\b/i)
    }
  })
})
