import { describe, it, expect } from 'vitest'
import { OSM_GEOMETRY, OSM_BEND } from './geometry'
import { buildLayout } from './layout'
import { COURSES } from './courses'

const specFor = (slug: string, hole: number) =>
  COURSES.find((c) => c.slug === slug)!.holes[hole - 1]

describe('OSM_BEND cosmetic dogleg profiles', () => {
  it('every bend profile keys a real imported hole', () => {
    for (const key of Object.keys(OSM_BEND)) {
      expect(OSM_GEOMETRY[key], `${key} has a bend but no geometry`).toBeTruthy()
    }
  })

  it('profiles are integer samples that start and end on the chord', () => {
    for (const [key, bend] of Object.entries(OSM_BEND)) {
      expect(bend.length, `${key}`).toBeGreaterThanOrEqual(3)
      expect(bend.every((v) => Number.isInteger(v)), `${key} non-integer`).toBe(true)
      // endpoints ride the straight tee→pin chord by construction
      expect(bend[0], `${key} tee`).toBe(0)
      expect(bend[bend.length - 1], `${key} pin`).toBe(0)
      // only holes that actually bend are persisted (else render straight)
      const max = bend.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
      expect(max, `${key} too flat to persist`).toBeGreaterThanOrEqual(8)
    }
  })

  it('buildLayout carries the bend onto a bended hole and omits it on a straight one', () => {
    // 16 is a pronounced dogleg (has a profile); 14 is a straight par 3 (none)
    expect(OSM_BEND['harbour-town:16']).toBeTruthy()
    expect(OSM_BEND['harbour-town:14']).toBeUndefined()
    expect(buildLayout('harbour-town', specFor('harbour-town', 16)).bend).toEqual(
      OSM_BEND['harbour-town:16'],
    )
    expect(buildLayout('harbour-town', specFor('harbour-town', 14)).bend).toBeUndefined()
    // a procedural (non-OSM) course never carries a bend
    expect(buildLayout('carnoustie', specFor('carnoustie', 1)).bend).toBeUndefined()
  })
})
