import { describe, it, expect } from 'vitest'
import type { HazardZone } from './types'
import { isGreenside } from './layout'
import { OSM_GEOMETRY } from './geometry'

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
