// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { COURSES } from '../engine/courses'
import type { HoleResult } from '../engine/types'
import {
  aceHoles,
  currentHandicap,
  formatAverage,
  formatHandicap,
  fortuneRounds,
  holeStrokes,
  lifetimeStats,
  loadRoundLog,
  type LoggedRound,
} from './stats'
import { hasFortuneMoment, pruneArchive, type ArchivedRound } from './store'

const COURSE = COURSES[0]
const PAR3 = COURSE.holes.findIndex((h) => h.par === 3)
const PAR5 = COURSE.holes.findIndex((h) => h.par === 5)

function allPars(): HoleResult[] {
  return Array(18).fill('par')
}

function logged(overrides: Partial<LoggedRound>): LoggedRound {
  const results = overrides.results ?? allPars()
  const toPar = results.reduce((s, r, i) => s + (holeStrokes(r, COURSE.holes[i].par) - COURSE.holes[i].par), 0)
  return {
    seed: overrides.seed ?? `t:${Math.random()}`,
    mode: 'practice',
    courseSlug: COURSE.slug,
    dateKey: '2026-07-20',
    playedAt: 1_000,
    toPar,
    strokes: COURSE.holes.reduce((s, h) => s + h.par, 0) + toPar,
    results,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('the round log seeds itself from what pre-log storage still holds', () => {
  it('recovers dailies from history and rounds from the archive, deduped', () => {
    const history = [
      { dateKey: '2026-07-18', puzzleNumber: 1, courseSlug: COURSE.slug, toPar: 3, results: allPars().map((r, i) => (i === 0 ? 'triple' : r)), character: 'dart' },
      { dateKey: '2026-07-19', puzzleNumber: 2, courseSlug: COURSE.slug, toPar: 0, results: allPars() },
    ]
    localStorage.setItem('dogleg:history:v1', JSON.stringify(history))
    const archived: ArchivedRound[] = [
      {
        seed: 'round:2026-07-19:x:salt',
        mode: 'daily',
        courseSlug: COURSE.slug,
        dateKey: '2026-07-19',
        toPar: 0,
        strokes: 71,
        results: allPars(),
        decisions: Array(18).fill(['normal']),
        playedAt: 500,
      },
      {
        seed: 'practice:x:1',
        mode: 'practice',
        courseSlug: COURSE.slug,
        dateKey: '2026-07-19',
        toPar: -2,
        strokes: 69,
        results: allPars().map((r, i) => (i < 2 ? 'birdie' : r)),
        decisions: Array(18).fill(['normal']),
        playedAt: 600,
      },
    ]
    localStorage.setItem('dogleg:archive:v1', JSON.stringify(archived))

    const log = loadRoundLog()
    // 2 archived + 1 history-only daily; the archived copy of 07-19 wins
    expect(log).toHaveLength(3)
    expect(log.filter((r) => r.dateKey === '2026-07-19' && r.mode === 'daily')).toHaveLength(1)
    expect(log.find((r) => r.dateKey === '2026-07-19' && r.mode === 'daily')!.seed).toBe('round:2026-07-19:x:salt')
    // the history-seeded entry derived its strokes from results + pars
    const hist = log.find((r) => r.seed === 'hist:2026-07-18')!
    expect(hist.strokes).toBe(COURSE.holes.reduce((s, h) => s + h.par, 0) + 3)
    // seeding persists — a second load returns the stored log, not a re-seed
    localStorage.setItem('dogleg:history:v1', '[]')
    expect(loadRoundLog()).toHaveLength(3)
  })
})

describe('fortune detection from stored results', () => {
  it('an eagle on a par 3 is a hole in one; an albatross is itself', () => {
    const withAce = allPars()
    withAce[PAR3] = 'eagle'
    const withAlb = allPars()
    withAlb[PAR5] = 'albatross'
    const plainEagle = allPars()
    plainEagle[PAR5] = 'eagle'

    expect(aceHoles(logged({ results: withAce }))).toEqual([PAR3 + 1])
    expect(aceHoles(logged({ results: plainEagle }))).toEqual([])
    expect(hasFortuneMoment(COURSE.slug, withAce)).toBe(true)
    expect(hasFortuneMoment(COURSE.slug, withAlb)).toBe(true)
    expect(hasFortuneMoment(COURSE.slug, plainEagle)).toBe(false)

    const log = [logged({ results: withAce, playedAt: 1 }), logged({ results: withAlb, playedAt: 2 }), logged({ playedAt: 3 })]
    expect(fortuneRounds('ace', log)).toHaveLength(1)
    expect(fortuneRounds('albatross', log)).toHaveLength(1)
    expect(fortuneRounds('albatross', log)[0].holes).toEqual([PAR5 + 1])
  })

  it('fortune rounds are pinned by pruneArchive like records', () => {
    const withAce = allPars()
    withAce[PAR3] = 'eagle'
    const mk = (seed: string, playedAt: number, results = allPars()): ArchivedRound => ({
      seed,
      mode: 'practice',
      courseSlug: COURSE.slug,
      dateKey: '2026-07-20',
      toPar: results === withAce ? -2 : 5 + playedAt, // the ace round is NOT the course PR guard: give others worse scores
      strokes: 80,
      results,
      decisions: Array(18).fill(['normal']),
      playedAt,
    })
    // the ace round is oldest and not a PR (a better round exists), yet survives
    const rounds = [mk('ace-round', 0, withAce), ...Array.from({ length: 15 }, (_, i) => mk(`r${i}`, i + 1))]
    rounds.push({ ...mk('best', 99), toPar: -5 }) // PR holder
    const kept = pruneArchive(rounds)
    expect(kept.some((r) => r.seed === 'ace-round')).toBe(true)
  })
})

describe('lifetime stats computed from the log', () => {
  it('distribution, best/worst, and average come straight from entries', () => {
    const good = allPars().map((r, i) => (i < 3 ? 'birdie' : r)) // -3
    const bad = allPars().map((r, i) => (i < 2 ? 'triple' : i < 4 ? 'double' : i < 7 ? 'bogey' : r)) // 3+3+2+2+1+1+1 = +13
    const log = [
      logged({ seed: 'a', results: good, playedAt: 1 }),
      logged({ seed: 'b', results: bad, playedAt: 2 }),
      logged({ seed: 'c', playedAt: 3 }), // even
    ]
    const s = lifetimeStats(log)
    expect(s.rounds).toBe(3)
    expect(s.distribution.birdie).toBe(3)
    expect(s.distribution.triple).toBe(2)
    expect(s.distribution.double).toBe(2)
    expect(s.distribution.bogey).toBe(3)
    expect(s.distribution.par).toBe(15 + 11 + 18)
    expect(s.best!.seed).toBe('a')
    expect(s.worst!.seed).toBe('b')
    expect(s.averageToPar).toBeCloseTo((-3 + 13 + 0) / 3)
  })
})

describe('current handicap — best 10 of the last 30', () => {
  const withToPar = (toPar: number, playedAt: number): LoggedRound => {
    // encode toPar via bogeys/birdies so results stay consistent
    const results = allPars().map((r, i) => (i < Math.abs(toPar) ? (toPar > 0 ? 'bogey' : 'birdie') : r)) as HoleResult[]
    return logged({ results, playedAt })
  }

  it('is not established under 10 rounds, with a countdown', () => {
    const h = currentHandicap([withToPar(1, 1), withToPar(2, 2)])
    expect(h).toEqual({ established: false, roundsToGo: 8 })
  })

  it('between 10 and 30 rounds it takes the best 10 of what exists', () => {
    // 12 rounds: toPar 1..12 → best ten are 1..10, average 5.5
    const log = Array.from({ length: 12 }, (_, i) => withToPar(i + 1, i))
    const h = currentHandicap(log)
    expect(h.established).toBe(true)
    if (h.established) expect(h.value).toBeCloseTo(5.5)
  })

  it('beyond 30 rounds, older rounds fall out of the window entirely', () => {
    // 30 recent rounds all +8, then one ancient -10 masterpiece: the window
    // must ignore the masterpiece — handicap reflects current form
    const log = [withToPar(-10, 0), ...Array.from({ length: 30 }, (_, i) => withToPar(8, i + 1))]
    const h = currentHandicap(log)
    expect(h.established).toBe(true)
    if (h.established) expect(h.value).toBeCloseTo(8)
  })

  it('one great recent round visibly improves it', () => {
    const base = Array.from({ length: 15 }, (_, i) => withToPar(6, i))
    const before = currentHandicap(base)
    const after = currentHandicap([...base, withToPar(-4, 99)])
    if (before.established && after.established) {
      expect(after.value).toBeLessThan(before.value)
    } else {
      throw new Error('handicap should be established')
    }
  })

  it('formats per golf convention: plus handicaps for under-par averages', () => {
    expect(formatHandicap(-1.24)).toBe('+1.2')
    expect(formatHandicap(12.37)).toBe('12.4')
    expect(formatHandicap(0)).toBe('0.0')
    expect(formatAverage(3.42)).toBe('+3.4')
    expect(formatAverage(-1.2)).toBe('−1.2')
    expect(formatAverage(0)).toBe('E')
  })
})
