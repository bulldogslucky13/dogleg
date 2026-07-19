import { describe, expect, it } from 'vitest'
import { COURSES } from './courses'
import { buildLayout, reachableZones } from './layout'
import { longOdds, approachOdds, puttOdds, shortOdds } from './odds'
import { startHole, playShot, oddsFor, type HoleInPlay } from './resolve'
import { rngFromString } from './rng'
import type { Choice, Conditions } from './types'

const CONDS: Conditions[] = [
  { wind: 5, greens: 'Medium', difficulty: 4 },
  { wind: 12, greens: 'Fast', difficulty: 7 },
  { wind: 22, greens: 'Fast', difficulty: 10 },
]
const CHOICES: Choice[] = ['safe', 'normal', 'aggressive']

const sum = (o: Record<string, number>, keys: string[]) => keys.reduce((s, k) => s + o[k], 0)

describe('course data', () => {
  it('every course has 18 holes, a valid SI permutation, sane yardages', () => {
    for (const c of COURSES) {
      expect(c.holes).toHaveLength(18)
      const sis = [...c.holes.map((h) => h.strokeIndex)].sort((a, b) => a - b)
      expect(sis).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
      const par = c.holes.reduce((s, h) => s + h.par, 0)
      expect(par).toBeGreaterThanOrEqual(70)
      expect(par).toBeLessThanOrEqual(73)
      // bounds cover real championship extremes (e.g. Augusta's 520yd 4th,
      // Chambers Bay's convertible par 4s, Payne's Valley's 653yd 13th)
      for (const h of c.holes) {
        if (h.par === 3) expect(h.yards).toBeGreaterThanOrEqual(100)
        if (h.par === 3) expect(h.yards).toBeLessThanOrEqual(300)
        if (h.par === 4) expect(h.yards).toBeGreaterThanOrEqual(280)
        if (h.par === 4) expect(h.yards).toBeLessThanOrEqual(620)
        if (h.par === 5) expect(h.yards).toBeGreaterThanOrEqual(460)
        if (h.par === 5) expect(h.yards).toBeLessThanOrEqual(700)
      }
    }
  })
})

describe('odds invariants', () => {
  it('all distributions sum to 1 for every hole/condition/choice', () => {
    for (const c of COURSES) {
      for (const spec of c.holes) {
        const layout = buildLayout(c.slug, spec)
        for (const cond of CONDS) {
          for (const ch of CHOICES) {
            if (spec.par !== 3) {
              const lo = longOdds(layout, cond, { pos: 0, lie: 'tee', side: 'center' }, ch, 'tee')
              expect(sum(lo.odds as never, ['dialed', 'fairway', 'rough', 'sand', 'trees', 'water'])).toBeCloseTo(1, 6)
            }
            const ap = approachOdds(layout, cond, { pos: layout.length - 160, lie: 'fairway', side: 'center' }, ch, 'standard')
            expect(sum(ap.odds as never, ['holeout', 'kickin', 'makeable', 'lag', 'fringe', 'sand', 'water'])).toBeCloseTo(1, 6)
            const so = shortOdds(layout, cond, { pos: layout.length - 12, lie: 'fringe', side: 'left' }, ch)
            expect(sum(so as never, ['holeout', 'updown', 'twochip', 'blowup', 'disaster', 'stillin', 'across'])).toBeCloseTo(1, 6)
            const sandO = shortOdds(layout, cond, { pos: layout.length - 12, lie: 'sand', side: 'left' }, ch)
            expect(sum(sandO as never, ['holeout', 'updown', 'twochip', 'blowup', 'disaster', 'stillin', 'across'])).toBeCloseTo(1, 6)
            for (const feet of [5, 12, 20, 30, 50]) {
              const po = puttOdds(cond, feet, ch)
              expect(po.one + po.two + po.three).toBeCloseTo(1, 6)
            }
          }
        }
      }
    }
  })

  it('zones fully behind the ball are never reachable', () => {
    for (const c of COURSES) {
      for (const spec of c.holes) {
        const layout = buildLayout(c.slug, spec)
        for (const zone of layout.zones) {
          const ballPast = zone.to + 5
          const reach = reachableZones(layout, ballPast, 0, layout.length + 50)
          expect(reach.find((r) => r.zone.id === zone.id)).toBeUndefined()
        }
      }
    }
  })

  it('water odds are zero once the ball is past every water zone', () => {
    const cyp = COURSES.find((c) => c.slug === 'cypress-hollow')!
    for (const spec of cyp.holes) {
      const layout = buildLayout(cyp.slug, spec)
      const waterMax = Math.max(0, ...layout.zones.filter((z) => z.kind === 'water' || z.kind === 'ocean').map((z) => z.to))
      if (waterMax <= 0 || waterMax >= layout.length - 10) continue
      const pos = Math.min(waterMax + 4, layout.length - 15)
      for (const cond of CONDS) {
        for (const ch of CHOICES) {
          const ap = approachOdds(layout, cond, { pos, lie: 'fairway', side: 'center' }, ch, 'standard')
          expect(ap.odds.water).toBe(0)
        }
      }
    }
  })

  it('safe tee shots stay bankable even in brutal conditions', () => {
    const brutal: Conditions = { wind: 25, greens: 'Fast', difficulty: 10 }
    for (const c of COURSES) {
      for (const spec of c.holes) {
        if (spec.par === 3) continue
        const layout = buildLayout(c.slug, spec)
        const lo = longOdds(layout, brutal, { pos: 0, lie: 'tee', side: 'center' }, 'safe', 'tee')
        const bad = lo.odds.sand + lo.odds.trees + lo.odds.water
        expect(bad).toBeLessThanOrEqual(0.045)
        expect(lo.odds.water).toBeLessThanOrEqual(0.02)
      }
    }
  })

  it('safe is always meaningfully safer than aggressive off the tee', () => {
    for (const c of COURSES) {
      for (const spec of c.holes) {
        if (spec.par === 3) continue
        const layout = buildLayout(c.slug, spec)
        for (const cond of CONDS) {
          const ball = { pos: 0, lie: 'tee', side: 'center' } as const
          const safe = longOdds(layout, cond, ball, 'safe', 'tee').odds
          const agg = longOdds(layout, cond, ball, 'aggressive', 'tee').odds
          const badSafe = safe.sand + safe.trees + safe.water
          const badAgg = agg.sand + agg.trees + agg.water
          expect(badAgg).toBeGreaterThanOrEqual(badSafe * 2.5)
        }
      }
    }
  })

  it('lag putting caps three-putt risk, charge does not', () => {
    const fast: Conditions = { wind: 10, greens: 'Fast', difficulty: 8 }
    const lag = puttOdds(fast, 55, 'safe')
    expect(lag.three).toBeLessThanOrEqual(0.09)
    const charge = puttOdds(fast, 55, 'aggressive')
    expect(charge.three).toBeGreaterThan(0.25)
  })

  it('distance moves the needle: makes fall and 3-putts climb as putts get longer', () => {
    for (const cond of CONDS) {
      for (const ch of CHOICES) {
        let prev = puttOdds(cond, 4, ch)
        for (let feet = 6; feet <= 60; feet += 2) {
          const po = puttOdds(cond, feet, ch)
          expect(po.one).toBeLessThan(prev.one)
          expect(po.three).toBeGreaterThanOrEqual(prev.three)
          prev = po
        }
        // the climb is real, not just monotone-flat
        expect(puttOdds(cond, 45, ch).three).toBeGreaterThan(puttOdds(cond, 10, ch).three)
      }
    }
  })

  it('3-putt risk is capped even for a charge from downtown on glass', () => {
    const fast: Conditions = { wind: 10, greens: 'Fast', difficulty: 8 }
    for (const ch of CHOICES) {
      for (const feet of [45, 55, 60]) {
        expect(puttOdds(fast, feet, ch).three).toBeLessThanOrEqual(0.401)
      }
    }
    // short putts are nearly 3-putt-proof, and tap-in charges are near-automatic
    expect(puttOdds(fast, 4, 'aggressive').three).toBeLessThanOrEqual(0.005)
    expect(puttOdds(fast, 5, 'aggressive').one).toBeGreaterThan(0.8)
  })

  it('punch short game cannot blow up', () => {
    const brutal: Conditions = { wind: 25, greens: 'Fast', difficulty: 10 }
    for (const c of COURSES.slice(0, 2)) {
      const layout = buildLayout(c.slug, c.holes[0])
      const so = shortOdds(layout, brutal, { pos: layout.length - 10, lie: 'fringe', side: 'left' }, 'safe')
      expect(so.blowup + so.disaster).toBeLessThanOrEqual(0.03)
    }
  })

  it('greenside sand: normatively out, rarely stuck, almost never across', () => {
    for (const c of COURSES.slice(0, 3)) {
      const layout = buildLayout(c.slug, c.holes[0])
      for (const cond of CONDS) {
        const ball = { pos: layout.length - 10, lie: 'sand', side: 'left' } as const
        const safe = shortOdds(layout, cond, ball, 'safe')
        const normal = shortOdds(layout, cond, ball, 'normal')
        const agg = shortOdds(layout, cond, ball, 'aggressive')
        // the blast-out always escapes (>=95%) and essentially never flies the green
        expect(safe.stillin).toBeLessThanOrEqual(0.05)
        expect(safe.across).toBeLessThanOrEqual(0.015)
        // normatively out and on/around the green — the flop trades some of that for saves
        expect(safe.holeout + safe.updown + safe.twochip).toBeGreaterThanOrEqual(0.85)
        expect(normal.holeout + normal.updown + normal.twochip).toBeGreaterThanOrEqual(0.72)
        expect(agg.holeout + agg.updown + agg.twochip).toBeGreaterThanOrEqual(0.6)
        // flying the green is possible but rare even for the flop
        expect(agg.across).toBeGreaterThan(0)
        expect(agg.across).toBeLessThanOrEqual(0.12)
      }
    }
  })

  it('fairway bunkers are easier to escape cleanly than trees', () => {
    for (const c of COURSES.slice(0, 3)) {
      for (const spec of c.holes.filter((h) => h.par !== 3).slice(0, 4)) {
        const layout = buildLayout(c.slug, spec)
        for (const cond of CONDS) {
          for (const ch of CHOICES) {
            const ball = { pos: 250, side: 'left' } as const
            const sand = approachOdds(layout, cond, { ...ball, lie: 'sand' }, ch, 'standard')
            const trees = approachOdds(layout, cond, { ...ball, lie: 'trees' }, ch, 'standard')
            expect(sand.odds.fringe + sand.odds.sand + sand.odds.water).toBeLessThan(
              trees.odds.fringe + trees.odds.sand + trees.odds.water,
            )
          }
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Monte Carlo calibration
// ---------------------------------------------------------------------------

type Policy = (h: HoleInPlay, aggressiveLeft: number) => Choice

const allSafe: Policy = () => 'safe'
const allNormal: Policy = () => 'normal'
const smart: Policy = (h, aggLeft) => {
  const si = h.layout.spec.strokeIndex
  const par = h.layout.spec.par
  if (h.stage === 'putt') {
    const feet = h.ball.puttFeet ?? 20
    return feet <= 12 ? 'aggressive' : feet <= 20 ? 'normal' : 'safe'
  }
  if (h.stage === 'shortgame') return 'normal'
  if ((h.stage === 'tee' || h.stage === 'second' || h.stage === 'approach') && aggLeft > 0 && (si >= 13 || par === 5)) {
    const anyOdds = oddsFor(h, 'aggressive')
    if (anyOdds.kind === 'long' || anyOdds.kind === 'approach') {
      const pen = anyOdds.kind === 'long' ? anyOdds.water : anyOdds.water
      if (pen < 0.06) return 'aggressive'
    }
  }
  if (si <= 4) return 'safe'
  return 'normal'
}

function simRound(courseIdx: number, cond: Conditions, seed: string, policy: Policy): { toPar: number; penalties: number; doubles: number } {
  const course = COURSES[courseIdx]
  const rng = rngFromString(seed)
  let toPar = 0
  let penalties = 0
  let doubles = 0
  let aggLeft = 8
  for (const spec of course.holes) {
    const layout = buildLayout(course.slug, spec)
    const h = startHole(layout, cond)
    let guard = 0
    while (h.stage !== 'done' && guard++ < 20) {
      const usesBudget = h.stage === 'tee' || h.stage === 'second' || h.stage === 'approach'
      let ch = policy(h, aggLeft)
      if (ch === 'aggressive' && usesBudget && aggLeft <= 0) ch = 'normal'
      if (ch === 'aggressive' && usesBudget) aggLeft--
      playShot(h, ch, rng)
    }
    toPar += h.score!.strokes - spec.par
    penalties += h.score!.penalties
    if (h.score!.strokes - spec.par >= 2) doubles++
  }
  return { toPar, penalties, doubles }
}

describe('calibration (Monte Carlo)', () => {
  const N = 400

  function stats(policy: Policy, label: string) {
    let broke = 0
    let total = 0
    let pen = 0
    let dbl = 0
    for (let i = 0; i < N; i++) {
      const courseIdx = i % COURSES.length
      const course = COURSES[courseIdx]
      const cond: Conditions = { wind: course.wind, greens: course.greens, difficulty: course.difficulty }
      const r = simRound(courseIdx, cond, `sim:${label}:${i}`, policy)
      if (r.toPar < 0) broke++
      total += r.toPar
      pen += r.penalties
      dbl += r.doubles
    }
    const res = { brokePct: (broke / N) * 100, avgToPar: total / N, avgPenalties: pen / N, avgDoubles: dbl / N }
    // eslint-disable-next-line no-console
    console.log(`[calibration] ${label}:`, JSON.stringify(res))
    return res
  }

  it('all-safe grinds out mid-over-par rounds and almost never blows up', () => {
    const r = stats(allSafe, 'all-safe')
    expect(r.avgToPar).toBeGreaterThan(1)
    expect(r.avgToPar).toBeLessThan(6)
    expect(r.avgPenalties).toBeLessThan(0.6)
    expect(r.avgDoubles).toBeLessThan(0.8)
    expect(r.brokePct).toBeLessThan(16)
  })

  it('all-normal hovers around par-ish with real variance', () => {
    const r = stats(allNormal, 'all-normal')
    expect(r.avgToPar).toBeGreaterThan(-2)
    expect(r.avgToPar).toBeLessThan(7)
  })

  it('a smart mixed policy breaks par a satisfying-but-rare share of rounds', () => {
    const r = stats(smart, 'smart')
    expect(r.brokePct).toBeGreaterThan(12)
    expect(r.brokePct).toBeLessThan(45)
  })
})
