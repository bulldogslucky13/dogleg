import { describe, it, expect } from 'vitest'
import { OSM_GEOMETRY } from '../engine/geometry'
import { hazardRuns, zonesAdjacent } from './HoleMap'

describe('hazardRuns — maximal connected components', () => {
  it('never leaves two separate runs that are adjacent (a bridge must coalesce them)', () => {
    for (const [key, geo] of Object.entries(OSM_GEOMETRY)) {
      const runs = hazardRuns(geo.zones)
      for (let i = 0; i < runs.length; i++) {
        for (let j = i + 1; j < runs.length; j++) {
          const stillBridged = runs[i].some((a) => runs[j].some((b) => zonesAdjacent(a, b)))
          expect(stillBridged, `${key}: runs ${i} and ${j} are adjacent but not merged`).toBe(false)
        }
      }
    }
  })

  it('every zone lands in exactly one run and none are dropped', () => {
    for (const geo of Object.values(OSM_GEOMETRY)) {
      const mergeable = geo.zones.filter((z) => z.kind === 'bunker' || z.kind === 'water')
      const ids = hazardRuns(geo.zones).flat().map((z) => z.id)
      expect(new Set(ids).size).toBe(ids.length) // no duplicates
      expect(ids.sort()).toEqual(mergeable.map((z) => z.id).sort()) // exactly the mergeable set
    }
  })

  it("harbour-town:17 wraps its greenside bunker into one run (z6 + z8 bridged by cross z9)", () => {
    const runs = hazardRuns(OSM_GEOMETRY['harbour-town:17'].zones)
    const withZ6 = runs.find((r) => r.some((z) => z.id === 'z6'))!
    expect(withZ6.some((z) => z.id === 'z8'), 'z8 should share z6’s run').toBe(true)
    expect(withZ6.some((z) => z.id === 'z9'), 'the z9 bridge should be in it').toBe(true)
  })
})
