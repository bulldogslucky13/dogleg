import type { Conditions, CourseSpec, HazardZone, HoleLayout, HoleSpec } from './types'
import { rngFromString } from './rng'
import { OSM_GEOMETRY, OSM_BEND } from './geometry'
import { courseBySlug } from './courses'

/**
 * Does this course have a tree anywhere? Answered WITHOUT `buildLayout`, which
 * would recurse: imported holes are read straight off `OSM_GEOMETRY`, and the
 * procedural generator below plants a tree line on every hole that isn't an
 * ocean hole. Lets a tree-lined course still say "trees" on a hole whose
 * corridor happens to have no grove drawn — a fair fiction on a course that
 * really is wooded, and a lie on one that isn't.
 */
function courseHasTrees(course: CourseSpec | undefined, courseSlug: string): boolean {
  if (!course) return true // unknown slug (tests use fakes): keep the historical word
  return course.holes.some((spec) => {
    const real = OSM_GEOMETRY[`${courseSlug}:${spec.number}`]
    return real ? real.zones.some((z) => z.kind === 'trees') : spec.hazard !== 'ocean'
  })
}

/**
 * What to call a bad lie on ground this hole has no polygon for — the `trees`
 * bucket's junk floor (see `CourseSpec.junkLabel`). Copy only; `buildLayout`
 * resolves it once so no caller has to look a course up.
 *
 * `deeprough` deliberately does NOT earn the word "trees": gorse, scrub and hay
 * are the whole reason this exists, and calling them trees is the bug, not the
 * fix. So the course's own word outranks the fiction — Portrush's `roughLabel`
 * now reaches its deep-rough holes, which it didn't when any vegetation zone
 * short-circuited to "trees".
 */
function resolveJunkLabel(zones: HazardZone[], course: CourseSpec | undefined, courseSlug: string): string {
  if (zones.some((z) => z.kind === 'trees')) return 'trees' // the map is drawing trees here
  const named = course?.junkLabel ?? course?.roughLabel
  if (named) return named
  if (zones.some((z) => z.kind === 'deeprough')) return 'deep rough'
  // a course with no trees at all must have named its junk — rough.test.ts
  return courseHasTrees(course, courseSlug) ? 'trees' : 'junk'
}

/**
 * Generate the geometric layout for a hole. Deterministic per course+hole.
 * Zones live on a 1-D line from tee (0) to pin (length), with a side.
 * The SVG map and the odds engine both consume this — single source of truth.
 *
 * Real OSM-imported geometry (`geometry.ts`) wins when present; otherwise the
 * layout is synthesized procedurally from par/yards/dogleg/hazard below.
 *
 * `cond` is optional round context: when the round's conditions carry a pin
 * for this hole (par 3s only), it rides on the layout so the odds engine and
 * the map read the same flag. Geometry itself never varies with conditions.
 */
export function buildLayout(courseSlug: string, spec: HoleSpec, cond?: Conditions): HoleLayout {
  const pin = spec.par === 3 ? cond?.pins?.[spec.number] : undefined
  const gust = cond?.gusts?.[spec.number]
  // Course-level rough severity rides down onto every hole so the odds engine
  // never has to look a course up. Unknown slugs (tests use fakes) get
  // undefined = 'normal' = the historical numbers.
  const course = courseBySlug(courseSlug)
  const rough = course?.rough
  const roughLabel = course?.roughLabel
  const scenery = course?.scenery
  const real = OSM_GEOMETRY[`${courseSlug}:${spec.number}`]
  if (real) {
    return {
      spec,
      length: real.length,
      zones: real.zones,
      fairwayFrom: real.fairwayFrom,
      fairwayTo: real.fairwayTo,
      greenDepth: real.greenDepth,
      bend: OSM_BEND[`${courseSlug}:${spec.number}`],
      bailout: real.bailout,
      pin,
      gust,
      rough,
      roughLabel,
      scenery,
      junkLabel: resolveJunkLabel(real.zones, course, courseSlug),
    }
  }

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
    return { spec, length: L, zones, fairwayFrom: 0, fairwayTo: 0, greenDepth, pin, gust, rough, roughLabel, scenery, junkLabel: resolveJunkLabel(zones, course, courseSlug) }
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

  return { spec, length: L, zones, fairwayFrom, fairwayTo, greenDepth, rough, roughLabel, scenery, junkLabel: resolveJunkLabel(zones, course, courseSlug) }
}

/**
 * A bunker close enough to the green to play as *greenside* sand — it guards the
 * green rather than being a fairway carry (`cross`) or a lateral miss
 * (`left`/`right`). True when the bunker reaches the green front (within 8 yд)
 * and is compact (≤45 yд), so long waste bunkers that merely run up to the green
 * (e.g. Harbour Town 5's 82-yд z8) stay what they are.
 *
 * Distance-derived on purpose: the zone keeps its real `side` so the map still
 * draws it on the correct side of the green; only the odds treat it as
 * greenside (a middling weight — see `hazardShares` in odds.ts). Read by both
 * the odds engine and the referee via the same buildLayout output, so client
 * and validator stay in agreement.
 */
export function isGreenside(zone: HazardZone, length: number, greenDepth: number): boolean {
  if (zone.kind !== 'bunker') return false
  const greenFront = length - greenDepth / 2
  return zone.to >= greenFront - 8 && zone.to - zone.from <= 45
}

/** How far from the green a ball still plays as a splash rather than a swing. */
export const GREENSIDE_SAND_YD = 30

/**
 * Does a ball resting in `zone` play as GREENSIDE sand (splash it out, the
 * `shortgame` stage and `shortOdds`' sand table) or as a full shot from a
 * bunker (an `approach` with a `sand` lie)?
 *
 * `isGreenside` alone is not enough, because it describes the ZONE and this
 * question is about the BALL. Harbour Town 5's 82-yд waste runs right up to
 * the green but is too long to count as greenside — correct for weighting the
 * hazard, wrong for a ball that finishes in its last few yards. Before this
 * existed, exactly that lie showed "Bunker shot · 8 yards to go" with a full
 * approach's three options, when from eight yards you obviously splash it.
 *
 * Shared by `resolveApproach` and grade.ts's `nextVApproachSand` — the resolver
 * and the model MUST agree about which sand is which, or the model prices a
 * splash and the player plays a swing, and the telescoping identity turns the
 * difference into phantom luck. Same reasoning as `secondGoMode` being shared
 * rather than re-derived.
 */
export function playsAsGreensideSand(zone: HazardZone, pos: number, length: number, greenDepth: number): boolean {
  return isGreenside(zone, length, greenDepth) || length - pos <= GREENSIDE_SAND_YD
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
