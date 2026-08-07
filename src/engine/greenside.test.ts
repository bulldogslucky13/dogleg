import { describe, it, expect } from 'vitest'
import type { Choice, HazardZone } from './types'
import { buildLayout, isGreenside } from './layout'
import { OSM_GEOMETRY } from './geometry'
import { splitFortune } from './fortune'
import { aceEligible, playShot, startHole, waterDropPos, WATER_DROP_APPROACH, WATER_DROP_LONG } from './resolve'
import { rngFromString } from './rng'
import { destinyPlan, fortuneOddsFor, replayRound, setupFromSeed } from './replay'

/** Mirrors replay.ts's loop (destiny + budget) so the decision list replays. */
function genDecisions(seed: string, policy: () => Choice): Choice[][] {
  const info = setupFromSeed(seed)!
  const rng = rngFromString(splitFortune(seed).base)
  const plan = destinyPlan(info)
  const fOdds = fortuneOddsFor(info)
  const decisions: Choice[][] = []
  let aggLeft = 8
  for (let i = 0; i < 18; i++) {
    const layout = buildLayout(info.course.slug, info.course.holes[i], info.cond)
    const h = startHole(layout, info.cond, undefined, fOdds)
    const holeChoices: Choice[] = []
    let guard = 0
    while (h.stage !== 'done' && guard++ < 20) {
      const budgeted = h.stage === 'tee' || h.stage === 'second' || h.stage === 'approach'
      let choice = policy()
      if (choice === 'aggressive' && budgeted && aggLeft <= 0) choice = 'normal'
      if (choice === 'aggressive' && budgeted) aggLeft--
      let destiny: 'ace' | 'albatross' | undefined
      if (plan.ace && aceEligible(h, choice)) {
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

const bunker = (from: number, to: number): HazardZone => ({ id: 'z', kind: 'bunker', from, to, side: 'cross' })

describe('isGreenside — which bunkers play as greenside sand', () => {
  // a 500-yд hole with a 20-yд green: green front is at 490
  it('flags compact bunkers reaching the green', () => {
    expect(isGreenside(bunker(470, 490), 500, 20)).toBe(true) // front bunker, span 20
    expect(isGreenside(bunker(500, 520), 500, 20)).toBe(true) // beside/behind the green
  })

  it('excludes long waste bunkers even when they run up to the green', () => {
    expect(isGreenside(bunker(408, 490), 500, 20)).toBe(false) // 82-yд span → waste, not greenside
  })

  it('excludes fairway bunkers well short of the green', () => {
    expect(isGreenside(bunker(250, 314), 538, 20)).toBe(false)
  })

  it('never flags a non-bunker', () => {
    expect(isGreenside({ id: 'z', kind: 'water', from: 470, to: 490, side: 'cross' }, 500, 20)).toBe(false)
  })

  it('matches the Harbour Town 5 audit: the 82-yд waste (z8) is NOT greenside, the green bunker (z9) is', () => {
    const h5 = OSM_GEOMETRY['harbour-town:5']
    const z8 = h5.zones.find((z) => z.from === 436 && z.to === 518)!
    const z9 = h5.zones.find((z) => z.from === 518 && z.to === 538)!
    expect(isGreenside(z8, h5.length, h5.greenDepth)).toBe(false)
    expect(isGreenside(z9, h5.length, h5.greenDepth)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The ball is in the bunker it says it's in.
//
// `HoleMap` anchors the ball sprite to `BallState.zoneId`. When an approach
// found sand, the resolver used to pick a zone from `missShares` and then
// ignore it, pinning the ball greenside whatever it had picked — so on a hole
// whose only greenside bunker is right (lacc-north:13), a left FAIRWAY bunker
// winning the roll produced `side: 'left'` with no anchor, and the map drew the
// ball on bare grass beside the green under a "Greenside bunker" banner.
//
// These are the invariants that make that unrepresentable. They run over real
// rounds on real geometry rather than a fixture, because the bug needed a
// specific zone layout to show up at all.
// ---------------------------------------------------------------------------
describe('a sand lie is always in a real bunker', () => {
  const SLUGS = ['lacc-north', 'shinnecock-hills', 'oakmont', 'pine-valley', 'doral-blue-monster', 'harbour-town']

  it('every sand ball sits inside the zone it claims, and never moves backwards', () => {
    let sandLies = 0
    let fairwayBunkers = 0
    let unanchored = 0
    for (const slug of SLUGS) {
      for (const policy of ['safe', 'normal', 'aggressive'] as const) {
        for (let i = 0; i < 12; i++) {
          const seed = `practice:${slug}:sand-${policy}-${i}`
          const info = setupFromSeed(seed)!
          const decisions = genDecisions(seed, () => policy)
          const outcome = replayRound(seed, undefined, decisions)
          expect(outcome.ok).toBe(true)
          if (!outcome.ok) continue
          for (const [h, score] of outcome.scores.entries()) {
            if (!score) continue
            const layout = buildLayout(info.course.slug, info.course.holes[h], info.cond)
            let prev = 0
            for (const shot of score.shots) {
              const b = shot.after
              if (b.lie === 'sand') {
                sandLies++
                // an anchored ball is inside the zone it points at
                if (b.zoneId) {
                  const z = layout.zones.find((x) => x.id === b.zoneId)
                  expect(z, `${slug}:${h + 1} zoneId ${b.zoneId} not in layout`).toBeTruthy()
                  expect(z!.kind).toBe('bunker')
                  expect(b.pos, `${slug}:${h + 1} ball ${b.pos} outside ${z!.from}-${z!.to}`).toBeGreaterThanOrEqual(z!.from)
                  expect(b.pos).toBeLessThanOrEqual(z!.to)
                  if (!isGreenside(z!, layout.length, layout.greenDepth)) fairwayBunkers++
                }
                // an UNANCHORED sand lie only ever happens greenside, where the
                // map's own greenside placement is the right answer
                if (!b.zoneId) {
                  unanchored++
                  expect(layout.length - b.pos).toBeLessThanOrEqual(45)
                }
                // landing in the chosen zone must never walk the ball BACK down
                // the hole — a zone only has to END ahead of us to be reachable,
                // so its near edge can sit behind the ball (resolve.ts clamps).
                expect(b.pos, `${slug}:${h + 1} sand landed behind the ball`).toBeGreaterThanOrEqual(prev - 0.001)
              }
              // balls past the green legitimately come back (a long miss, a
              // water drop), so only forward progress INTO sand is asserted
              if (b.lie !== 'green') prev = Math.min(b.pos, layout.length)
            }
          }
        }
      }
    }
    // the scenario has to actually occur, or the assertions above prove nothing
    expect(sandLies).toBeGreaterThan(50)
    expect(fairwayBunkers).toBeGreaterThan(0)
    // THE ONE THAT GUARDS THE BUG. Every assertion above also held before the
    // fix, because the old resolver dropped `zoneId` whenever its pick didn't
    // contain the ball rather than drawing it in the wrong place. What it did
    // instead was leave a THIRD of all sand lies with no anchor — 261 of 782
    // across this exact sample — and HoleMap's greenside fallback then drew
    // each on whichever side the ball claimed, which on a hole like
    // lacc-north:13 (one greenside bunker, on the right) is bare grass off the
    // LEFT edge of the green under a "Greenside bunker" banner. Now the ball
    // lands in the bunker the roll chose, so the fallback is reached only when
    // there was no reachable sand to land in at all: 1 of 796 here.
    expect(unanchored / sandLies).toBeLessThan(0.02)
  }, 30000)
})

// ---------------------------------------------------------------------------
// Water drops land where the ball went in.
//
// Same failure shape as the sand lies above, one stage earlier: both the tee
// shot and the approach picked which lake the ball found and then dropped it
// somewhere unrelated — a fixed `length - 44` on approaches, a fraction of the
// drive window off the tee. Laterals are ~80% of water outcomes, so the lake
// the roll named sat 47 yd (approach) and 39 yd (long) from the ball on
// average. Unlike the sand bug this never lied to the GRADE model — resolve.ts
// and grade.ts shared the same wrong formula — so nothing caught it. These
// tests pin the rule itself, which is now the one function both callers use.
// ---------------------------------------------------------------------------
describe('waterDropPos', () => {
  const lateral = (from: number, to: number): HazardZone => ({ id: 'w', kind: 'water', from, to, side: 'left' })
  const cross = (from: number, to: number): HazardZone => ({ id: 'w', kind: 'water', from, to, side: 'cross' })

  it('drops a lateral penalty inside the lake it actually found', () => {
    // 500-yд hole, ball at 200, lake 260-320 → drop in the middle of it
    expect(waterDropPos(lateral(260, 320), 200, 500, WATER_DROP_APPROACH)).toBe(290)
    // the old formula ignored the lake entirely and always said 456
    expect(waterDropPos(lateral(260, 320), 200, 500, WATER_DROP_APPROACH)).not.toBe(500 - 44)
  })

  it('drops a cross penalty short of the hazard it had to carry', () => {
    expect(waterDropPos(cross(260, 320), 200, 500, WATER_DROP_APPROACH)).toBe(250)
  })

  it('never drops nearer the hole than the stage floor', () => {
    // a lake running to the green would otherwise drop the ball on the green
    expect(waterDropPos(lateral(480, 500), 400, 500, WATER_DROP_APPROACH)).toBe(500 - 35)
    expect(waterDropPos(lateral(480, 500), 400, 500, WATER_DROP_LONG)).toBe(500 - 30)
    // …but the floor must not drag a ball BACKWARDS when it was already nearer
    // the green than the floor. This is whistling-straits:7 — a 221-yд par 3
    // played from 188, which the old formula dropped at 177.
    expect(waterDropPos(lateral(190, 215), 188, 221, WATER_DROP_APPROACH)).toBeGreaterThanOrEqual(188)
  })

  it('never drops behind where the shot was played from', () => {
    // lake starts behind the ball: only the reachable part counts
    const p = waterDropPos(lateral(100, 300), 250, 500, WATER_DROP_APPROACH)
    expect(p).toBeGreaterThanOrEqual(250)
    // and the long game additionally makes the ball travel
    expect(waterDropPos(lateral(0, 300), 0, 500, WATER_DROP_LONG)).toBeGreaterThanOrEqual(30)
  })

  it('falls back to the historical fixed drop when no zone won the roll', () => {
    expect(waterDropPos(null, 200, 500, WATER_DROP_APPROACH)).toBe(500 - 44)
  })

  it('never moves the ball backwards over real rounds', () => {
    let drops = 0
    for (const slug of ['doral-blue-monster', 'tpc-sawgrass', 'whistling-straits', 'harbour-town']) {
      for (const policy of ['normal', 'aggressive'] as const) {
        for (let i = 0; i < 10; i++) {
          const seed = `practice:${slug}:water-${policy}-${i}`
          const info = setupFromSeed(seed)!
          const outcome = replayRound(seed, undefined, genDecisions(seed, () => policy))
          if (!outcome.ok) continue
          for (const [h, score] of outcome.scores.entries()) {
            if (!score) continue
            const layout = buildLayout(info.course.slug, info.course.holes[h], info.cond)
            let prev = 0
            for (const shot of score.shots) {
              if (shot.outcome === 'water') {
                drops++
                expect(shot.after.pos, `${slug}:${h + 1} water drop went backwards`).toBeGreaterThanOrEqual(prev)
                expect(shot.after.pos, `${slug}:${h + 1} water drop past the floor`).toBeLessThanOrEqual(layout.length - 30)
              }
              if (shot.after.lie !== 'green') prev = Math.min(shot.after.pos, layout.length)
            }
          }
        }
      }
    }
    expect(drops).toBeGreaterThan(20)
  }, 30000)
})
