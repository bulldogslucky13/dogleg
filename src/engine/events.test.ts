import { describe, expect, it } from 'vitest'
import { courseBySlug } from './courses'
import { majorConditions } from './daily'
import { splitFortune, encodeFortune, EMPTY_FORTUNE } from './fortune'
import { buildLayout } from './layout'
import { destinyPlan, fortuneOddsFor, replayRound, setupFromSeed } from './replay'
import { rngFromString } from './rng'
import { playShot, startHole } from './resolve'
import type { CharacterId, Choice } from './types'
import {
  activeEvent,
  CUP_POINTS,
  CUP_SEASON_START,
  cupPoints,
  dayOfEvent,
  DOGLEG_CUP,
  EVENT_DAYS,
  eventDateKeys,
  eventForKey,
  eventPlayable,
  majorSeedBase,
  nextEvent,
  paysPoints,
} from './events'

/** the first confirmed, playable event — the calendar must always hold one
 * for these tests to exercise the live path */
const live = DOGLEG_CUP.find(eventPlayable)!

describe('the DogLeg Cup calendar is well-formed', () => {
  it('keys are unique and every entry declares a status', () => {
    const keys = new Set(DOGLEG_CUP.map((e) => e.key))
    expect(keys.size).toBe(DOGLEG_CUP.length)
    for (const e of DOGLEG_CUP) expect(['confirmed', 'placeholder']).toContain(e.status)
  })

  it('every event starts on a Thursday — four rounds through Sunday', () => {
    for (const e of DOGLEG_CUP) {
      const [y, m, d] = e.start.split('-').map(Number)
      expect(new Date(y, m - 1, d).getDay(), `${e.key} starts ${e.start}`).toBe(4)
      expect(eventDateKeys(e)).toHaveLength(EVENT_DAYS)
    }
  })

  it('no two events share a date — the Cup never double-books a weekend', () => {
    const seen = new Map<string, string>()
    for (const e of DOGLEG_CUP) {
      for (const day of eventDateKeys(e)) {
        expect(seen.get(day), `${e.key} overlaps ${seen.get(day)} on ${day}`).toBeUndefined()
        seen.set(day, e.key)
      }
    }
  })

  it("every CONFIRMED event's course is actually in the library", () => {
    for (const e of DOGLEG_CUP) {
      if (e.status !== 'confirmed') continue
      expect(courseBySlug(e.courseSlug), `${e.key} confirmed but ${e.courseSlug} missing`).toBeTruthy()
    }
  })

  it('there is at least one playable event to launch the Cup with', () => {
    expect(live).toBeTruthy()
  })

  it('the DogLeg Cup Championship is live: a major exhibition on the game\'s own course', () => {
    const flagship = eventForKey('the-dogleg-2026')!
    expect(flagship.major).toBe(true)
    expect(flagship.exhibition).toBe(true)
    expect(flagship.start).toBe('2026-08-27')
    // the course shipped with the calendar entry — the week is ON
    expect(courseBySlug('the-dogleg')?.name).toBe('TPC DogLeg at Barksdale')
    expect(eventPlayable(flagship)).toBe(true)
    expect(activeEvent(flagship.start)?.event.key).toBe('the-dogleg-2026')
    // …and it stays a guest: never in the daily rotation
    expect(courseBySlug('the-dogleg')?.par3Course).toBeUndefined()
  })

  it('the launch weeks are exhibitions; the points season starts Sept 3 and pays', () => {
    const bellerive = eventForKey('bellerive-2026')!
    expect(bellerive.exhibition).toBe(true)
    expect(paysPoints(bellerive)).toBe(false)
    expect(paysPoints(eventForKey('the-dogleg-2026')!)).toBe(false)
    // every event from the season opener on pays points
    for (const e of DOGLEG_CUP) {
      if (e.start >= CUP_SEASON_START) expect(paysPoints(e), `${e.key} should pay points`).toBe(true)
    }
    expect(eventForKey('pinehurst-no2-2026')!.start).toBe(CUP_SEASON_START)
  })

  it('the fall/winter season runs weekly with no dark Thursdays through the PGA pickup', () => {
    // Sept 3 through Jan 14: our own schedule, one event every seven days,
    // all confirmed on owned courses. The chain breaks only at Jan 21 (the
    // real tour pickup), where imports take over.
    const season = DOGLEG_CUP.filter((e) => e.start >= CUP_SEASON_START && e.start <= '2027-01-14')
    expect(season.length).toBe(20)
    for (const e of season) expect(eventPlayable(e), `${e.key} must be live for the streak`).toBe(true)
    for (let i = 1; i < season.length; i++) {
      const prev = eventDateKeys(season[i - 1])
      // Sunday's horn to the next Thursday's first tee: four days, no skips
      const gap = (Date.parse(season[i].start) - Date.parse(prev[3])) / 86_400_000
      expect(gap, `${season[i - 1].key} → ${season[i].key}`).toBe(4)
    }
  })
})

describe('event scheduling', () => {
  it('dayOfEvent maps the window Thursday=1 … Sunday=4 and nothing else', () => {
    const days = eventDateKeys(live)
    days.forEach((key, i) => expect(dayOfEvent(live, key)).toBe(i + 1))
    expect(dayOfEvent(live, '2020-01-02')).toBeNull()
  })

  it('activeEvent finds a live round day and skips placeholders', () => {
    const hit = activeEvent(eventDateKeys(live)[2])
    expect(hit?.event.key).toBe(live.key)
    expect(hit?.day).toBe(3)
    // an arbitrary quiet Monday schedules nothing
    expect(activeEvent('2026-08-10')).toBeNull()
  })

  it('nextEvent teases the soonest playable event after a date', () => {
    const dayBefore = (() => {
      const [y, m, d] = live.start.split('-').map(Number)
      const t = new Date(y, m - 1, d - 1)
      return `${t.getFullYear()}-${`${t.getMonth() + 1}`.padStart(2, '0')}-${`${t.getDate()}`.padStart(2, '0')}`
    })()
    expect(nextEvent(dayBefore)?.key).toBe(live.key)
    // placeholders never tease
    for (const e of DOGLEG_CUP) {
      if (nextEvent('2026-01-01')?.key === e.key) expect(eventPlayable(e)).toBe(true)
    }
  })
})

describe('cup points', () => {
  it('pays the published podium and never goes up as you finish worse', () => {
    expect(cupPoints(1)).toBe(500)
    expect(cupPoints(1, true)).toBe(600) // a major win
    expect(cupPoints(2)).toBe(300)
    expect(cupPoints(10)).toBe(CUP_POINTS[9])
    let prev = Number.POSITIVE_INFINITY
    for (let rank = 1; rank <= 60; rank++) {
      const pts = cupPoints(rank)
      expect(pts).toBeLessThanOrEqual(prev)
      expect(pts).toBeGreaterThanOrEqual(5) // an eligible finish always scores
      prev = pts
    }
    expect(cupPoints(0)).toBe(0)
    expect(cupPoints(1.5)).toBe(0)
  })
})

describe('major conditions — the published firming-up arc', () => {
  const course = courseBySlug(live.courseSlug)!
  const dateKey = live.start

  it('is deterministic: same event, date, and day deal the same course', () => {
    expect(majorConditions(live.key, dateKey, 2, course)).toEqual(majorConditions(live.key, dateKey, 2, course))
  })

  it('wind stiffens a notch a day, Sunday +3 over the same draw', () => {
    const thu = majorConditions(live.key, dateKey, 1, course)
    const sun = majorConditions(live.key, dateKey, 4, course)
    expect(sun.wind).toBe(thu.wind + 3)
  })

  it('the weekend plays a point harder, clamped to 10', () => {
    const thu = majorConditions(live.key, dateKey, 1, course)
    const sat = majorConditions(live.key, dateKey, 3, course)
    expect(sat.difficulty).toBe(Math.min(10, thu.difficulty + 1))
  })

  it("Sunday's greens firm up one step and never soften", () => {
    const order = ['Slow', 'Medium', 'Firm', 'Fast']
    const thu = majorConditions(live.key, dateKey, 1, course)
    const sun = majorConditions(live.key, dateKey, 4, course)
    expect(order.indexOf(sun.greens)).toBeGreaterThanOrEqual(order.indexOf(thu.greens))
  })
})

describe('major seeds — the referee grammar', () => {
  const seed = majorSeedBase(live, live.start)

  it('parses into mode major with the event, day, and arc conditions', () => {
    const info = setupFromSeed(seed)!
    expect(info.mode).toBe('major')
    expect(info.eventKey).toBe(live.key)
    expect(info.eventDay).toBe(1)
    expect(info.course.slug).toBe(live.courseSlug)
    expect(info.dateKey).toBe(live.start)
    expect(info.cond).toEqual(majorConditions(live.key, live.start, 1, info.course))
  })

  it('carries a per-player salt exactly like the daily', () => {
    const salted = setupFromSeed(`${seed}:a1b2c3d4`)!
    expect(salted.salt).toBe('a1b2c3d4')
    // the salt changes the dice, never the course or conditions
    expect(salted.cond).toEqual(setupFromSeed(seed)!.cond)
  })

  it('rejects an unknown event, a wrong course, and a date outside the window', () => {
    expect(setupFromSeed(`major:not-a-real-event:${live.start}:${live.courseSlug}`)).toBeNull()
    expect(setupFromSeed(`major:${live.key}:${live.start}:pebble-beach`)).toBeNull()
    expect(setupFromSeed(`major:${live.key}:2020-01-02:${live.courseSlug}`)).toBeNull()
  })

  it('fortune is inert on Cup rounds — no destiny, no boosts, tail or not', () => {
    const tailed = setupFromSeed(`${seed}:${encodeFortune({ ...EMPTY_FORTUNE, ace: 9999, alb: 9999 })}`)!
    expect(destinyPlan(tailed)).toEqual({ ace: false, albatross: false })
    expect(fortuneOddsFor(tailed)).toBeUndefined()
    expect(destinyPlan(setupFromSeed(seed)!)).toEqual({ ace: false, albatross: false })
  })

  it('a full Cup round replays deterministically, referee-style', () => {
    // generate decisions by walking the engine exactly the way replayRound
    // does (one rng stream, shot by shot) — then hand them to the referee
    const play = (character?: CharacterId): { decisions: Choice[][]; toPar: number } => {
      const info = setupFromSeed(seed)!
      const rng = rngFromString(splitFortune(seed).base)
      const decisions: Choice[][] = []
      let strokes = 0
      let par = 0
      for (const spec of info.course.holes) {
        const layout = buildLayout(info.course.slug, spec, info.cond)
        const h = startHole(layout, info.cond, character)
        const hole: Choice[] = []
        let guard = 0
        while (h.stage !== 'done' && guard++ < 25) {
          playShot(h, 'normal', rng)
          hole.push('normal')
        }
        decisions.push(hole)
        strokes += h.score!.strokes
        par += spec.par
      }
      return { decisions, toPar: strokes - par }
    }
    const mine = play('dart')
    const outcome = replayRound(seed, 'dart', mine.decisions)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.toPar).toBe(mine.toPar)
      expect(outcome.info.mode).toBe('major')
      expect(outcome.scores).toHaveLength(courseBySlug(live.courseSlug)!.holes.length)
    }
    // and the same seed + decisions replay to the same card, every time
    const again = replayRound(seed, 'dart', mine.decisions)
    expect(again.ok && again.toPar).toBe(mine.toPar)
  })
})
