import { describe, it, expect } from 'vitest'
import { COURSES, courseBySlug } from './courses'
import { buildLayout } from './layout'
import { approachOdds } from './odds'
import type { BallState, Conditions } from './types'

/**
 * The course-level rough-severity dial (`CourseSpec.rough`, see types.ts).
 *
 * The contract these tests pin is the one that makes the dial safe to use:
 * it taxes the shot FROM the rough, and it does nothing else. In particular
 * it must never manufacture a penalty stroke — penal rough costs you the
 * birdie look, not the ball. If you want gorse to eat a ball, that is a
 * separate change to shot resolution, and this test should fail loudly rather
 * than let it arrive by accident.
 */

const COND: Conditions = { wind: 12, greens: 'Firm', difficulty: 8 }
const ball = (pos: number, lie: BallState['lie']): BallState => ({ pos, lie, side: 'center' })

/** A tagged course and an untagged one, same par, for A/B comparison. */
const PENAL = 'royal-portrush-dunluce'
const PLAIN = 'royal-troon'

function looks(slug: string, lie: BallState['lie']) {
  const course = courseBySlug(slug)!
  const spec = course.holes.find((h) => h.par === 4)!
  const layout = buildLayout(slug, spec, COND)
  const o = approachOdds(layout, COND, ball(layout.length - 150, lie), 'normal', 'standard').odds
  return {
    birdieLook: o.kickin + o.makeable,
    green: o.kickin + o.makeable + o.lag,
    penalty: o.water,
    sum: o.holeout + o.kickin + o.makeable + o.lag + o.fringe + o.sand + o.water,
  }
}

describe('course-level rough severity', () => {
  it('tags a course only with a known severity, and labels only tagged courses', () => {
    for (const c of COURSES) {
      if (c.rough !== undefined) expect(['normal', 'penal', 'severe'], c.slug).toContain(c.rough)
      // a rough label without a severity would be copy the odds never earn
      if (c.roughLabel) expect(c.rough && c.rough !== 'normal', `${c.slug} labels rough it doesn't tag`).toBe(true)
    }
  })

  it('carries the course severity down onto every hole layout', () => {
    const course = courseBySlug(PENAL)!
    expect(course.rough).toBe('penal')
    for (const spec of course.holes) {
      expect(buildLayout(PENAL, spec, COND).rough, `hole ${spec.number}`).toBe('penal')
    }
    // untagged courses stay undefined — that's what keeps them bit-identical
    expect(buildLayout(PLAIN, courseBySlug(PLAIN)!.holes[0], COND).rough).toBeUndefined()
    // unknown slugs (tests use fakes) must not throw or invent a severity
    expect(buildLayout('not-a-course', courseBySlug(PLAIN)!.holes[0], COND).rough).toBeUndefined()
  })

  it('costs birdie looks from the rough — and ONLY from the rough', () => {
    const penalRough = looks(PENAL, 'rough')
    const plainRough = looks(PLAIN, 'rough')
    expect(penalRough.birdieLook).toBeLessThan(plainRough.birdieLook)
    expect(penalRough.green).toBeLessThan(plainRough.green)

    // the fairway is untouched by the dial: a tagged course's fairway look is
    // in the same band as an untagged one (small gaps are hole length/SI)
    const penalFairway = looks(PENAL, 'fairway')
    const plainFairway = looks(PLAIN, 'fairway')
    expect(Math.abs(penalFairway.birdieLook - plainFairway.birdieLook)).toBeLessThan(0.06)
  })

  it('never turns rough into a penalty — no drop zone, on any tagged course', () => {
    for (const c of COURSES) {
      if (!c.rough || c.rough === 'normal') continue
      for (const spec of c.holes) {
        const layout = buildLayout(c.slug, spec, COND)
        // a hole with real water can penalise a MISS; assert on holes that
        // have no water at all, where any penalty could only come from the dial
        if (layout.zones.some((z) => z.kind === 'water' || z.kind === 'ocean')) continue
        const o = approachOdds(layout, COND, ball(Math.max(0, layout.length - 150), 'rough'), 'normal', 'standard').odds
        expect(o.water, `${c.slug}:${spec.number} penalty from rough`).toBe(0)
      }
    }
  })

  it('still hits plenty of greens from penal rough — punishing, not unplayable', () => {
    const { green, sum } = looks(PENAL, 'rough')
    expect(green).toBeGreaterThan(0.35)
    expect(sum).toBeCloseTo(1, 6)
  })
})

/**
 * The junk floor's NAME (`CourseSpec.junkLabel`, see types.ts).
 *
 * `longOdds` gives every shot a floor of trouble even where its landing window
 * reaches no mapped hazard — a wild swing finds something on ground nobody drew
 * a polygon for. That slice lands in the `trees` bucket and resolves to a
 * `trees` lie. On a parkland course that is a fair fiction. On a course with no
 * trees mapped ANYWHERE it is a false statement: the game announced "In the
 * trees", and the map, having no grove to put the ball in, drew it sitting on
 * the fairway. Whistling Straits shipped like that.
 *
 * So: a course with no trees/deeprough zones on any hole has to say what its
 * junk actually is. This is the same copy/geometry contract the course-import
 * process enforces on `signature` strings — the difference is that here it is
 * the ENGINE naming a feature rather than the course tuple, which is exactly
 * how it went unnoticed.
 */
describe('the junk floor names something the course actually has', () => {
  it('every course with no trees anywhere gives its junk a name', () => {
    for (const c of COURSES) {
      const hasTrees = c.holes.some((spec) =>
        buildLayout(c.slug, spec, COND).zones.some((z) => z.kind === 'trees' || z.kind === 'deeprough'),
      )
      if (hasTrees) continue
      expect(
        c.junkLabel ?? c.roughLabel,
        `${c.slug} has no trees on any hole, so a junk-floor lie would claim one — set junkLabel`,
      ).toBeTruthy()
    }
  })

  it('resolves the label per hole: real trees win, then the course, then the default', () => {
    for (const c of COURSES) {
      for (const spec of c.holes) {
        const layout = buildLayout(c.slug, spec, COND)
        const treed = layout.zones.some((z) => z.kind === 'trees' || z.kind === 'deeprough')
        if (treed) expect(layout.junkLabel, `${c.slug}:${spec.number}`).toBe('trees')
        else expect(layout.junkLabel, `${c.slug}:${spec.number}`).toBe(c.junkLabel ?? c.roughLabel ?? 'trees')
      }
    }
    // unknown slugs (tests use fakes) still get a usable word, never undefined
    expect(buildLayout('not-a-course', COURSES[0].holes[0], COND).junkLabel).toBe('trees')
  })
})
