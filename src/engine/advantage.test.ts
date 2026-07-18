import { describe, expect, it } from 'vitest'
import { approachAdvantage, longAdvantage, puttAdvantage } from './advantage'
import { COURSES } from './courses'
import { buildLayout } from './layout'
import type { BallState, Conditions } from './types'

const cond: Conditions = { wind: 12, greens: 'Fast', difficulty: 7 }
const layout = buildLayout(COURSES[0].slug, COURSES[0].holes.find((h) => h.par === 4)!)
const tee: BallState = { pos: 0, lie: 'tee', side: 'center' }
const approach: BallState = { pos: layout.length - 150, lie: 'fairway', side: 'center' }

describe('advantage detection is honest', () => {
  it('only the matching character gets the callout', () => {
    // a fairway hit off the tee: fires for the Fairway Finder, nobody else
    expect(longAdvantage(layout, cond, tee, 'normal', 'fairway', 'fairway')).not.toBeNull()
    expect(longAdvantage(layout, cond, tee, 'normal', 'dart', 'fairway')).toBeNull()
    expect(longAdvantage(layout, cond, tee, 'normal', 'greens', 'fairway')).toBeNull()
    expect(longAdvantage(layout, cond, tee, 'normal', undefined, 'fairway')).toBeNull()

    // a stuffed approach: fires for the Dart Thrower only
    expect(approachAdvantage(layout, cond, approach, 'normal', 'standard', 'dart', 'kickin')).not.toBeNull()
    expect(approachAdvantage(layout, cond, approach, 'normal', 'standard', 'fairway', 'kickin')).toBeNull()

    // a made putt: fires for the Greens Keeper only
    expect(puttAdvantage(cond, 22, 'normal', 'greens', 'one')).not.toBeNull()
    expect(puttAdvantage(cond, 22, 'normal', 'dart', 'one')).toBeNull()
  })

  it('never fires on a bad or neutral outcome', () => {
    expect(longAdvantage(layout, cond, tee, 'normal', 'fairway', 'rough')).toBeNull()
    expect(longAdvantage(layout, cond, tee, 'normal', 'fairway', 'water')).toBeNull()
    expect(approachAdvantage(layout, cond, approach, 'normal', 'standard', 'dart', 'lag')).toBeNull()
    expect(approachAdvantage(layout, cond, approach, 'normal', 'standard', 'dart', 'fringe')).toBeNull()
    expect(puttAdvantage(cond, 22, 'normal', 'greens', 'two')).toBeNull()
    expect(puttAdvantage(cond, 22, 'normal', 'greens', 'three')).toBeNull()
  })

  it('reports a positive, honest edge that matches the recomputed odds gap', () => {
    const adv = longAdvantage(layout, cond, tee, 'normal', 'fairway', 'fairway')!
    expect(adv.id).toBe('fairway')
    expect(adv.stat).toMatch(/^\+\d+%/)
    expect(parseInt(adv.stat.slice(1), 10)).toBeGreaterThanOrEqual(3)

    const putt = puttAdvantage(cond, 30, 'normal', 'greens', 'one')!
    expect(putt.note).toContain('30-footer')
    expect(parseInt(putt.stat.slice(1), 10)).toBeGreaterThanOrEqual(3)
  })
})
