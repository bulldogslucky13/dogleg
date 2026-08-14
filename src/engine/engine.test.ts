import { describe, expect, it } from 'vitest'
import { COURSES } from './courses'
import { buildLayout, reachableZones } from './layout'
import { longOdds, approachOdds, puttOdds, shortOdds, driveWindow } from './odds'
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
      // Chambers Bay's convertible par 4s, Payne's Valley's 653yd 13th).
      // The par-3 ceiling is 335 for LACC North's 7th, which measures 330 off
      // the Tournament tee this course ships (284 for the 2023 U.S. Open, the
      // third-longest par 3 in that championship's history). It was raised
      // from 300 when that hole's par was corrected from 4 — the club card,
      // OSM's par tag and the U.S. Open card all say 3 — so the bound was
      // wrong about the world rather than the data being wrong. Keep it snug:
      // it exists to catch a par transcribed onto the wrong hole.
      // The floor is 95 for Cabot Links' 14th, the shortest hole in the
      // library: the club card says 102 and the real centreline measures 99,
      // a 3-yd gap that is ordinary tee-box variance rather than a bad import.
      for (const h of c.holes) {
        if (h.par === 3) expect(h.yards).toBeGreaterThanOrEqual(95)
        if (h.par === 3) expect(h.yards).toBeLessThanOrEqual(335)
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

  // The map draws its aim ribbon from `longOdds(...).window`, so a safe window
  // sitting mostly in a penalty crossing is the picture and the number
  // disagreeing: safe's trouble bucket is floored by TEE_BASE (that is the
  // "stays bankable" contract two brackets down), so it keeps reporting ~1.5%
  // water however wet the band is. kiawah-ocean:16 reported 1.7% water and 59%
  // FAIRWAY for a band lying in 206 yards of marsh, and drew the ribbon in the
  // lake; whispering-pines 14/18 and seminole 2/15 shipped the same way.
  //
  // Asserted on the window longOdds RETURNS, not on driveWindow(), because that
  // is both what the map draws and what the odds are computed from. Checked for
  // every character, since the Fairway Finder's +16 yd carry shifts the band and
  // was what hid three of these from a stricter first version of this test.
  // `normal`/`aggressive` are deliberately not asserted: they carry no floor and
  // report 8-31% water on these same holes, which is real risk, honestly priced.
  it('a safe tee shot is never aimed mostly at water', () => {
    const cond: Conditions = { wind: 12, greens: 'Firm', difficulty: 8 }
    for (const c of COURSES) {
      for (const spec of c.holes) {
        if (spec.par === 3) continue // par 3s tee off through the approach path
        const layout = buildLayout(c.slug, spec)
        for (const character of [undefined, 'fairway', 'dart', 'greens'] as const) {
          const { window } = longOdds(
            layout,
            cond,
            { pos: 0, lie: 'tee', side: 'center' },
            'safe',
            'tee',
            character as never,
          )
          const width = window[1] - window[0]
          for (const z of layout.zones) {
            if (z.side !== 'cross' || (z.kind !== 'water' && z.kind !== 'ocean')) continue
            const overlap = Math.min(window[1], z.to) - Math.max(window[0], z.from)
            expect(
              overlap,
              `${c.slug}:${spec.number} safe/${character ?? 'standard'} aims [${window[0]}-${window[1]}], ${Math.round((overlap / width) * 100)}% inside ${z.kind} ${z.from}-${z.to}`,
            ).toBeLessThanOrEqual(width / 2)
          }
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
        // This bracket compares the two shots' TROUBLE odds, which only means
        // something while aggressive is flying at something. On a hole whose
        // hazards all sit SHORT of the driving zone, the aggressive window
        // clears them into empty ground and falls back to the junk floor,
        // while safe lands among them — so the ratio inverts on geometry, not
        // because the odds have gone soft. Seminole's 6th is the case that
        // found it: sand flanks 197-251 where a stock safe drive finishes and
        // 251-312 is completely clean (verified against every bunker polygon
        // within 80 yd of the centreline, and against imagery).
        //
        // Deliberately narrow — it needs the aggressive window to reach
        // NOTHING while the safe window reaches something, which is 6 holes of
        // the library (carnoustie 2/9, cypress-point 6, whistling-straits 10,
        // oakmont 7, seminole 6); five of those clear the ratio anyway. Those
        // holes still have to keep safe bankable in absolute terms, which is
        // the property this bracket exists to protect, so they are asserted
        // against the same cap the brutal-conditions test uses rather than
        // skipped. Do NOT widen this to "aggressive reaches less than safe" —
        // that would excuse exactly the phantom-hazard imports the bracket is
        // meant to catch.
        const aggWindow = driveWindow('aggressive', 0, layout)
        const safeWindow = driveWindow('safe', 0, layout)
        const aggClear =
          reachableZones(layout, 0, aggWindow[0], aggWindow[1]).length === 0 &&
          reachableZones(layout, 0, safeWindow[0], safeWindow[1]).length > 0
        for (const cond of CONDS) {
          const ball = { pos: 0, lie: 'tee', side: 'center' } as const
          const safe = longOdds(layout, cond, ball, 'safe', 'tee').odds
          const agg = longOdds(layout, cond, ball, 'aggressive', 'tee').odds
          const badSafe = safe.sand + safe.trees + safe.water
          const badAgg = agg.sand + agg.trees + agg.water
          if (aggClear) expect(badSafe).toBeLessThanOrEqual(0.045)
          else expect(badAgg).toBeGreaterThanOrEqual(badSafe * 2.5)
        }
      }
    }
  })

  // The two invariants above cover every par-3's opening shot too, EXCEPT this
  // one: a bail-out par 3 (see `Bailout` in types.ts) opens as a LAYUP (mode
  // 'layup'), not a tee shot, so `if (spec.par === 3) continue` skips it
  // entirely above. Unlike a procedural par-5 layup — whose safe window gets an
  // automatic runtime pull-back off any cross hazard it detects (odds.ts,
  // longOdds's non-bailout branch) — a bail-out's hand-authored safe/normal
  // windows get no such check; nothing else here catches one a future course
  // places badly. This is that same "safe stays safe" contract, extended.
  it('a bail-out par 3\'s safe lay-up stays bankable, and the flag attempt is meaningfully riskier', () => {
    const brutal: Conditions = { wind: 25, greens: 'Fast', difficulty: 10 }
    for (const c of COURSES) {
      for (const spec of c.holes) {
        const layout = buildLayout(c.slug, spec)
        if (!layout.bailout) continue
        const ball = { pos: 0, lie: 'tee', side: 'center' } as const
        const safe = longOdds(layout, brutal, ball, 'safe', 'layup').odds
        const badSafe = safe.sand + safe.trees + safe.water
        expect(badSafe).toBeLessThanOrEqual(0.045)
        expect(safe.water).toBeLessThanOrEqual(0.02)

        const agg = approachOdds(layout, brutal, ball, 'aggressive', 'par3tee').odds
        const badAgg = agg.water + agg.sand
        expect(badAgg).toBeGreaterThanOrEqual(badSafe * 2.5)
      }
    }
  })

  it('a safe lay-up always actually advances the ball', () => {
    // Regression: the stay-short-of-a-crossing rule used to pull the lay-up
    // window behind ANY qualifying cross hazard without checking the result
    // still went forward. A crossing sitting just ahead of the ball collapsed
    // the shot into a nudge — 13 yd on whistling-straits:2, and -5 yd
    // (backwards!) on harbour-town:15. Sweep every plausible lay-up position
    // on every par 5, not just one drive: the failure only appears when the
    // ball happens to stop just behind a crossing.
    const cond: Conditions = { wind: 14, greens: 'Fast', difficulty: 9 }
    for (const c of COURSES) {
      for (const spec of c.holes) {
        if (spec.par !== 5) continue
        const layout = buildLayout(c.slug, spec)
        for (let pos = Math.round(layout.length * 0.3); pos <= Math.round(layout.length * 0.62); pos += 5) {
          const ball = { pos, lie: 'fairway', side: 'center' } as const
          const [from, to] = longOdds(layout, cond, ball, 'safe', 'layup').window
          const advance = (from + to) / 2 - pos
          expect(advance, `${c.slug}:${spec.number} safe lay-up from ${pos}`).toBeGreaterThanOrEqual(40)
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

  it('longer approaches always offer a worse birdie look from the same lie', () => {
    for (const c of COURSES) {
      for (const spec of c.holes.filter((h) => h.par !== 3)) {
        const layout = buildLayout(c.slug, spec)
        for (const cond of CONDS) {
          for (const ch of CHOICES) {
            let prev = Infinity
            for (const dist of [90, 130, 170, 210, 250]) {
              if (dist > layout.length - 20) continue
              const ball = { pos: layout.length - dist, lie: 'fairway', side: 'center' } as const
              const o = approachOdds(layout, cond, ball, ch, 'standard').odds
              const good = o.holeout + o.kickin + o.makeable
              expect(good, `${c.slug} #${spec.number} ${ch} ${dist}yd`).toBeLessThan(prev)
              prev = good
            }
          }
        }
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
