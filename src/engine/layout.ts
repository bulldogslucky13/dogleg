import type { HazardZone, HoleLayout, HoleSpec } from './types'
import { rngFromString } from './rng'

/**
 * Generate the geometric layout for a hole. Deterministic per course+hole.
 * Zones live on a 1-D line from tee (0) to pin (length), with a side.
 * The SVG map and the odds engine both consume this — single source of truth.
 */
export function buildLayout(courseSlug: string, spec: HoleSpec): HoleLayout {
  const rng = rngFromString(`${courseSlug}:${spec.number}:${spec.par}:${spec.yards}:layout`)
  const L = spec.yards
  const zones: HazardZone[] = []
  const greenDepth = 28 + Math.round(rng() * 8)

  // challenge side: the inside of a dogleg is where aggressive lines flirt with trouble
  const challengeSide: 'left' | 'right' =
    spec.dogleg === 'L' ? 'left' : spec.dogleg === 'R' ? 'right' : rng() < 0.5 ? 'left' : 'right'
  const offSide: 'left' | 'right' = challengeSide === 'left' ? 'right' : 'left'

  let id = 0
  const add = (z: Omit<HazardZone, 'id'>) => zones.push({ ...z, id: `z${++id}` })

  const driveZone = Math.min(240 + rng() * 40, L - 90) // where tee shots land on 4s/5s

  if (spec.par === 3) {
    // par 3: only greenside features (and a carry hazard for water/ocean holes)
    if (spec.hazard === 'water' || spec.hazard === 'ocean') {
      const island = spec.island ?? false
      if (island || rng() < 0.55) {
        // cross water short of the green
        add({ kind: spec.hazard === 'ocean' ? 'ocean' : 'water', from: Math.max(20, L - 90 - rng() * 40), to: L - greenDepth / 2 - 4, side: 'cross' })
      } else {
        add({ kind: spec.hazard === 'ocean' ? 'ocean' : 'water', from: L - 55, to: L + 25, side: challengeSide })
      }
      add({ kind: 'bunker', from: L - 18, to: L - 4, side: offSide })
    } else if (spec.hazard === 'sand') {
      add({ kind: 'bunker', from: L - 20, to: L - 4, side: 'left' })
      add({ kind: 'bunker', from: L - 16, to: L - 2, side: 'right' })
      if (rng() < 0.5) add({ kind: 'bunker', from: L - 34, to: L - 20, side: 'cross' })
    }
    return { spec, length: L, zones, fairwayFrom: 0, fairwayTo: 0, greenDepth }
  }

  // --- par 4 / par 5 ---
  const fairwayFrom = 140 + Math.round(rng() * 25)
  const fairwayTo = L - greenDepth / 2 - 2

  if (spec.hazard === 'ocean') {
    // cliff line down one whole side
    add({ kind: 'ocean', from: Math.max(60, driveZone - 120), to: L + 20, side: challengeSide })
    add({ kind: 'bunker', from: driveZone - 12, to: driveZone + 18, side: offSide })
    add({ kind: 'bunker', from: L - 22, to: L - 6, side: offSide })
  } else if (spec.hazard === 'water') {
    const roll = rng()
    if (roll < 0.4) {
      // pond pinching the drive zone on the challenge side
      add({ kind: 'water', from: driveZone - 35, to: driveZone + 45, side: challengeSide })
      add({ kind: 'bunker', from: L - 20, to: L - 5, side: offSide })
    } else if (roll < 0.75) {
      // greenside pond
      add({ kind: 'water', from: L - 42, to: L + 12, side: challengeSide })
      add({ kind: 'bunker', from: driveZone - 10, to: driveZone + 15, side: offSide })
    } else {
      // creek crossing short of the green (layup decision on 5s)
      add({ kind: 'water', from: L - 110, to: L - 88, side: 'cross' })
      add({ kind: 'bunker', from: L - 20, to: L - 6, side: challengeSide })
    }
    if (spec.par === 5 && rng() < 0.4) {
      add({ kind: 'water', from: driveZone + 60, to: driveZone + 110, side: challengeSide })
    }
  } else if (spec.hazard === 'sand') {
    add({ kind: 'bunker', from: driveZone - 15, to: driveZone + 20, side: challengeSide })
    if (rng() < 0.5) add({ kind: 'bunker', from: driveZone + 25, to: driveZone + 55, side: offSide })
    add({ kind: 'bunker', from: L - 24, to: L - 6, side: rng() < 0.5 ? challengeSide : offSide })
    if (rng() < 0.35) add({ kind: 'bunker', from: L - 30, to: L - 16, side: 'cross' })
  }

  // tree lines / deep stuff border most non-links holes
  if (spec.hazard !== 'ocean') {
    add({ kind: 'trees', from: fairwayFrom, to: fairwayTo - 30, side: offSide })
    // never stack trees on top of a water zone occupying the same flank
    const waterOnChallenge = zones.some(
      (z) => (z.kind === 'water' || z.kind === 'ocean') && z.side === challengeSide,
    )
    if (!waterOnChallenge && (spec.hazard !== 'water' || rng() < 0.5)) {
      add({ kind: 'trees', from: fairwayFrom + 40, to: fairwayTo - 60, side: challengeSide })
    }
  } else {
    add({ kind: 'deeprough', from: fairwayFrom, to: fairwayTo - 40, side: offSide })
  }

  return { spec, length: L, zones, fairwayFrom, fairwayTo, greenDepth }
}

/** Zones that overlap [from,to] on the given side reach. Zones fully behind `ballPos` never count. */
export function reachableZones(
  layout: HoleLayout,
  ballPos: number,
  from: number,
  to: number,
): { zone: HazardZone; overlap: number }[] {
  const res: { zone: HazardZone; overlap: number }[] = []
  for (const zone of layout.zones) {
    if (zone.to <= ballPos + 2) continue // strictly behind the ball: impossible to reach
    const lo = Math.max(from, zone.from)
    const hi = Math.min(to, zone.to)
    if (hi <= lo) continue
    const overlap = (hi - lo) / Math.max(1, to - from)
    res.push({ zone, overlap })
  }
  return res
}
