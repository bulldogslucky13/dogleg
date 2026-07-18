import { describe, expect, it } from 'vitest'
import { CHARACTERS } from './characters'
import { COURSES } from './courses'
import { buildLayout } from './layout'
import { approachOdds, longOdds, puttOdds } from './odds'
import { playShot, startHole } from './resolve'
import { rngFromString } from './rng'
import type { CharacterId, Choice, Conditions } from './types'

const CONDS: Conditions[] = [
  { wind: 5, greens: 'Medium', difficulty: 4 },
  { wind: 12, greens: 'Fast', difficulty: 7 },
  { wind: 22, greens: 'Fast', difficulty: 10 },
]
const CHOICES: Choice[] = ['safe', 'normal', 'aggressive']
const IDS: CharacterId[] = ['fairway', 'dart', 'greens']

const sum = (o: Record<string, number>, keys: string[]) => keys.reduce((s, k) => s + o[k], 0)

describe('character invariants', () => {
  it('all distributions still sum to 1 with every character', () => {
    for (const c of COURSES.slice(0, 3)) {
      for (const spec of c.holes) {
        const layout = buildLayout(c.slug, spec)
        for (const cond of CONDS) {
          for (const ch of CHOICES) {
            for (const id of IDS) {
              if (spec.par !== 3) {
                const lo = longOdds(layout, cond, { pos: 0, lie: 'tee', side: 'center' }, ch, 'tee', id)
                expect(sum(lo.odds as never, ['dialed', 'fairway', 'rough', 'sand', 'trees', 'water'])).toBeCloseTo(1, 6)
              }
              const ap = approachOdds(layout, cond, { pos: layout.length - 160, lie: 'fairway', side: 'center' }, ch, 'standard', id)
              expect(sum(ap.odds as never, ['holeout', 'kickin', 'makeable', 'lag', 'fringe', 'sand', 'water'])).toBeCloseTo(1, 6)
              for (const feet of [5, 12, 20, 30, 50]) {
                const po = puttOdds(cond, feet, ch, id)
                expect(po.one + po.two + po.three).toBeCloseTo(1, 6)
              }
            }
          }
        }
      }
    }
  })

  it('each character strictly improves its own specialty', () => {
    for (const c of COURSES.slice(0, 3)) {
      const spec = c.holes.find((h) => h.par === 4)!
      const layout = buildLayout(c.slug, spec)
      for (const cond of CONDS) {
        for (const ch of CHOICES) {
          const tee = { pos: 0, lie: 'tee', side: 'center' } as const
          const plainTee = longOdds(layout, cond, tee, ch, 'tee').odds
          const buffTee = longOdds(layout, cond, tee, ch, 'tee', 'fairway').odds
          expect(buffTee.dialed + buffTee.fairway).toBeGreaterThan(plainTee.dialed + plainTee.fairway)

          const appr = { pos: layout.length - 160, lie: 'fairway', side: 'center' } as const
          const plainAp = approachOdds(layout, cond, appr, ch, 'standard').odds
          const buffAp = approachOdds(layout, cond, appr, ch, 'standard', 'dart').odds
          expect(buffAp.kickin + buffAp.makeable).toBeGreaterThan(plainAp.kickin + plainAp.makeable)

          for (const feet of [8, 15, 30]) {
            const plainPutt = puttOdds(cond, feet, ch)
            const buffPutt = puttOdds(cond, feet, ch, 'greens')
            expect(buffPutt.one).toBeGreaterThan(plainPutt.one)
            expect(buffPutt.three).toBeLessThanOrEqual(plainPutt.three)
          }
        }
      }
    }
  })

  it('the lag cap survives the Greens Keeper buff', () => {
    const fast: Conditions = { wind: 10, greens: 'Fast', difficulty: 8 }
    const lag = puttOdds(fast, 55, 'safe', 'greens')
    expect(lag.three).toBeLessThanOrEqual(0.09)
  })

  it('safe tee shots stay bankable for the Fairway Finder in brutal conditions', () => {
    const brutal: Conditions = { wind: 25, greens: 'Fast', difficulty: 10 }
    for (const c of COURSES) {
      for (const spec of c.holes) {
        if (spec.par === 3) continue
        const layout = buildLayout(c.slug, spec)
        const lo = longOdds(layout, brutal, { pos: 0, lie: 'tee', side: 'center' }, 'safe', 'tee', 'fairway')
        expect(lo.odds.sand + lo.odds.trees + lo.odds.water).toBeLessThanOrEqual(0.045)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Monte Carlo balance: each character ≈ 1 stroke per round, none dominant
// ---------------------------------------------------------------------------

interface SimResult {
  toPar: number
  birdiesOrBetter: number
}

function simRound(courseIdx: number, cond: Conditions, seed: string, character?: CharacterId): SimResult {
  const course = COURSES[courseIdx]
  const rng = rngFromString(seed)
  let toPar = 0
  let birdiesOrBetter = 0
  let aggLeft = 8
  for (const spec of course.holes) {
    const layout = buildLayout(course.slug, spec)
    const h = startHole(layout, cond, character)
    let guard = 0
    while (h.stage !== 'done' && guard++ < 20) {
      // same "smart mixed" shape as the main calibration
      const si = spec.strokeIndex
      let ch: Choice =
        h.stage === 'putt'
          ? (h.ball.puttFeet ?? 20) <= 12
            ? 'aggressive'
            : (h.ball.puttFeet ?? 20) <= 20
              ? 'normal'
              : 'safe'
          : si <= 4
            ? 'safe'
            : 'normal'
      const usesBudget = h.stage === 'tee' || h.stage === 'second' || h.stage === 'approach'
      if (usesBudget && aggLeft > 0 && (si >= 13 || spec.par === 5)) ch = 'aggressive'
      if (ch === 'aggressive' && usesBudget) {
        if (aggLeft <= 0) ch = 'normal'
        else aggLeft--
      }
      playShot(h, ch, rng)
    }
    toPar += h.score!.strokes - spec.par
    if (h.score!.strokes - spec.par <= -1) birdiesOrBetter++
  }
  return { toPar, birdiesOrBetter }
}

describe('character balance (Monte Carlo)', () => {
  // Sample EVERY course K times (not `i % length`) so the field is identical for
  // baseline and each character regardless of array order — the measured shift is
  // the character's real effect, not an artifact of the daily rotation order.
  const K = 10
  const N = COURSES.length * K

  interface Dist {
    avgToPar: number
    brokePct: number
    avgBirdies: number
    /** dream rounds: -5 or better */
    hotRoundPct: number
    best: number
  }

  function distribution(character?: CharacterId): Dist {
    let total = 0
    let broke = 0
    let birdies = 0
    let hot = 0
    let best = 99
    for (let c = 0; c < COURSES.length; c++) {
      const course = COURSES[c]
      const cond: Conditions = { wind: course.wind, greens: course.greens, difficulty: course.difficulty }
      for (let k = 0; k < K; k++) {
        const r = simRound(c, cond, `charsim:${course.slug}:${k}`, character)
        total += r.toPar
        birdies += r.birdiesOrBetter
        if (r.toPar < 0) broke++
        if (r.toPar <= -5) hot++
        best = Math.min(best, r.toPar)
      }
    }
    return {
      avgToPar: total / N,
      brokePct: (broke / N) * 100,
      avgBirdies: birdies / N,
      hotRoundPct: (hot / N) * 100,
      best,
    }
  }

  it('every character is a real but modest edge (~1 stroke), and no one dominates or breaks the game', () => {
    const base = distribution(undefined)
    const gains: Record<string, number> = {}
    // eslint-disable-next-line no-console
    console.log('[characters] baseline:', JSON.stringify(base, (_k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)))
    for (const spec of CHARACTERS) {
      const d = distribution(spec.id)
      gains[spec.id] = base.avgToPar - d.avgToPar
      // eslint-disable-next-line no-console
      console.log(`[characters] ${spec.id}:`, JSON.stringify(d, (_k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)))

      // the edge is real but modest…
      expect(gains[spec.id], `${spec.name} gain`).toBeGreaterThan(0.35)
      expect(gains[spec.id], `${spec.name} gain`).toBeLessThan(1.9)
      // …and it cannot stat-pad the game into a birdie-fest:
      // even the strongest character leaves the course winning most rounds against
      // a near-optimal bot (real players, who are worse, break par far less)
      expect(d.brokePct, `${spec.name} break-par rate`).toBeLessThan(55)
      // and the character's break-par *shift* over the same characterless bot stays modest
      expect(d.brokePct - base.brokePct, `${spec.name} break-par shift`).toBeLessThan(14)
      // birdies stay golf-shaped: well under one extra per round
      expect(d.avgBirdies, `${spec.name} birdies/round`).toBeLessThan(base.avgBirdies + 1)
      // dream rounds (-5 or better) get likelier but never common
      expect(d.hotRoundPct, `${spec.name} -5-or-better rate`).toBeLessThan(18)
      // the all-birdie fantasy (-18) stays a fantasy
      expect(d.best, `${spec.name} best simulated round`).toBeGreaterThan(-15)
    }
    const vals = Object.values(gains)
    expect(Math.max(...vals) - Math.min(...vals), 'spread between best and worst character').toBeLessThan(0.9)
  })
})
