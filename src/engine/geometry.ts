import type { Bailout, HazardZone } from './types'

/**
 * Real per-hole geometry imported from OpenStreetMap and frozen as static data.
 * See `scripts/import-osm.ts` for how these are generated (build-time only —
 * nothing here touches the network at runtime).
 *
 * Keyed by `${courseSlug}:${holeNumber}`. When an entry exists, `buildLayout`
 * uses it verbatim instead of synthesizing geometry procedurally; the odds
 * engine and the SVG map both read the result, so client and referee stay in
 * agreement as long as the validator function is redeployed (see CLAUDE.md).
 *
 * Data © OpenStreetMap contributors, ODbL. Attribution required.
 */
export interface OsmHoleGeometry {
  length: number
  zones: HazardZone[]
  fairwayFrom: number
  fairwayTo: number
  greenDepth: number
  /** par 3s that dogleg round their hazard to a lay-up. See `Bailout` in
   * types.ts. Hand-authored from measured imagery, never imported. */
  bailout?: Bailout
}

/**
 * Cosmetic dogleg profiles, keyed by `${courseSlug}:${holeNumber}` — the signed
 * lateral deviation (yards, >0 = golfer-left) of the real OSM centreline from
 * the straight tee→pin chord, sampled at 13 evenly-spaced fractions (endpoints
 * ~0). The SVG map bends the hole to this so it turns where it really turns, and
 * the "Dogleg left/right" chip reads its direction — both OVERRIDING the
 * hand-set `HoleSpec.dogleg` flag, which shipped backwards on several holes.
 *
 * Map-only: the odds engine is 1-D and never reads this, so adding/removing a
 * profile is NOT odds- or replay-affecting (no ENGINE_VERSION bump). Generated
 * by `pnpm import:osm <course> <hole>` (see scripts/README.md, freeze process)
 * — only holes that actually bend (|max| ≥ 8 yд) are persisted; the rest render
 * straight. © OpenStreetMap contributors, ODbL.
 */
export const OSM_BEND: Record<string, number[]> = {
  // Harbour Town Golf Links — real centreline curvature. Note how the signs
  // correct the tuple flags: 5/8/15 bend LEFT (tuple said R), 6 bends RIGHT
  // (tuple said L), 2 is a right dogleg the "straight" flag missed.
  'harbour-town:2': [0, 6, 12, 18, 24, 28, 31, 32, 31, 27, 23, 15, 0],
  'harbour-town:3': [0, -3, -7, -10, -13, -17, -19, -20, -20, -19, -14, -7, 0],
  'harbour-town:5': [0, -14, -29, -43, -55, -63, -65, -58, -43, -30, -18, -9, 0],
  'harbour-town:6': [0, 6, 12, 17, 23, 29, 33, 36, 36, 34, 25, 12, 0],
  'harbour-town:8': [0, -9, -18, -27, -37, -44, -49, -51, -49, -43, -29, -14, 0],
  'harbour-town:9': [0, -1, -3, -4, -5, -6, -7, -8, -9, -9, -8, -4, 0],
  'harbour-town:10': [0, -6, -12, -18, -23, -29, -33, -35, -35, -32, -23, -12, 0],
  'harbour-town:11': [0, -3, -6, -9, -12, -14, -16, -18, -18, -17, -13, -6, 0],
  'harbour-town:12': [0, 5, 11, 16, 22, 27, 31, 34, 34, 31, 24, 12, 0],
  'harbour-town:13': [0, -3, -6, -9, -13, -16, -18, -20, -20, -19, -15, -8, 0],
  'harbour-town:15': [0, -6, -12, -18, -24, -30, -35, -40, -44, -46, -43, -29, 0],
  'harbour-town:16': [0, -10, -20, -29, -39, -49, -58, -64, -67, -66, -53, -27, 0],
  'harbour-town:18': [0, -4, -8, -13, -17, -21, -23, -25, -25, -22, -16, -8, 0],

  // Carnoustie — Championship — real centreline curvature. Signs contradict
  // the tuple's dogleg flag on more holes than they confirm: 2 bends LEFT
  // (tuple said R), 4 bends LEFT 42 yd (tuple said S), 5 bends LEFT (tuple
  // said R), 7 bends RIGHT (tuple said S), 9 bends LEFT right at the 8-yd
  // persistence threshold (tuple said R), 11 bends LEFT (tuple said S), 15
  // bends RIGHT (tuple said S), 18 bends RIGHT (tuple said S). Only 3 (L),
  // 6 (L), 12 (L), and 14 (R) agree with their flag.
  'carnoustie:2': [0, 5, 10, 14, 19, 22, 24, 24, 21, 18, 12, 6, 0],
  'carnoustie:3': [0, 7, 12, 18, 23, 27, 29, 30, 28, 23, 15, 8, 0],
  'carnoustie:4': [0, 9, 18, 27, 34, 40, 42, 41, 37, 30, 20, 10, 0],
  'carnoustie:5': [0, 8, 17, 25, 33, 39, 43, 44, 43, 38, 27, 14, 0],
  'carnoustie:6': [0, 2, 2, 3, 4, 4, 5, 7, 10, 15, 19, 16, 0],
  'carnoustie:7': [0, -2, -4, -6, -9, -10, -11, -11, -10, -8, -5, -3, 0],
  'carnoustie:9': [0, 6, 8, 8, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  'carnoustie:11': [0, 5, 10, 14, 18, 21, 22, 23, 22, 20, 14, 7, 0],
  'carnoustie:12': [0, 4, 8, 8, 6, 7, 11, 16, 15, 9, 4, 1, 0],
  'carnoustie:14': [0, -7, -14, -22, -29, -34, -38, -38, -36, -31, -20, -10, 0],
  'carnoustie:15': [0, -6, -13, -19, -26, -30, -33, -33, -30, -25, -17, -8, 0],
  'carnoustie:18': [0, -2, -3, -5, -6, -7, -8, -8, -7, -6, -4, -2, 0],

  // Royal Portrush — Dunluce — real centreline curvature. Lateral yards are
  // unaffected by the tee-end shift applied to the zones (see OSM_GEOMETRY),
  // so these are the raw import values. Signs correct the tuple again: 5 and
  // 10 bend LEFT hard (tuple said R and S), 11 and 18 bend LEFT (tuple said L
  // and S), 8 and 9 bend RIGHT (tuple said S and R), 15 bends RIGHT (tuple
  // said L). 10's 75-yd bend is the Himalayas dogleg.
  'royal-portrush-dunluce:2': [0, -10, -20, -30, -38, -43, -45, -43, -38, -29, -20, -10, 0],
  'royal-portrush-dunluce:4': [0, -6, -12, -18, -24, -28, -30, -30, -26, -21, -14, -7, 0],
  'royal-portrush-dunluce:5': [0, 14, 29, 43, 55, 63, 66, 61, 53, 43, 29, 15, 0],
  'royal-portrush-dunluce:6': [0, 1, 3, 4, 5, 7, 7, 8, 8, 7, 5, 2, 0],
  'royal-portrush-dunluce:8': [0, -10, -20, -30, -39, -44, -46, -45, -40, -31, -20, -10, 0],
  'royal-portrush-dunluce:9': [0, -8, -15, -23, -30, -34, -35, -33, -30, -23, -15, -8, 0],
  'royal-portrush-dunluce:10': [0, 13, 26, 39, 52, 63, 71, 75, 72, 64, 48, 25, 0],
  'royal-portrush-dunluce:11': [0, 8, 15, 23, 30, 35, 38, 38, 35, 28, 19, 9, 0],
  'royal-portrush-dunluce:14': [0, -1, -3, -4, -6, -7, -8, -9, -9, -8, -6, -3, 0],
  'royal-portrush-dunluce:15': [0, -9, -17, -26, -34, -42, -47, -49, -48, -42, -28, -14, 0],
  'royal-portrush-dunluce:18': [0, 11, 21, 32, 43, 51, 57, 57, 53, 44, 30, 15, 0],
  // Oakmont Country Club — real centreline curvature. Lateral yards, so the
  // tee-end shift does not apply.
  'oakmont:1': [0, -1, -2, -3, -5, -6, -7, -7, -8, -8, -7, -4, 0],
  'oakmont:4': [0, 13, 26, 39, 51, 57, 59, 57, 50, 39, 26, 13, 0],
  'oakmont:8': [0, -3, -6, -9, -12, -15, -18, -21, -22, -22, -18, -9, 0],
  'oakmont:11': [0, 2, 3, 5, 7, 9, 10, 11, 11, 10, 7, 4, 0],
  'oakmont:12': [0, 5, 11, 16, 22, 26, 29, 30, 29, 26, 17, 9, 0],
  'oakmont:14': [0, -1, -2, -4, -5, -6, -7, -8, -8, -7, -6, -3, 0],
  'oakmont:15': [0, 2, 4, 5, 7, 9, 10, 10, 9, 8, 5, 3, 0],
  'oakmont:16': [0, 1, 2, 4, 5, 6, 7, 8, 8, 8, 7, 4, 0],
  'oakmont:17': [0, -4, -8, -12, -16, -20, -24, -28, -30, -28, -22, -11, 0],

  // Cypress Point — real centreline curvature. Lateral yards are unaffected by
  // the tee-end shift applied to the zones (see OSM_GEOMETRY), so these are the
  // raw import values. Signs correct the tuple again: 2, 5 and 6 bend RIGHT
  // (tuple said S, S and R), 8, 12 and 14 bend LEFT (tuple said L, L and R),
  // 17 bends LEFT (tuple said L). 12's 61-yd bend and 5's 70-yd are the two
  // real doglegs; 9's 9-yd sits right on the persistence threshold.
  'cypress-point:1': [0, 2, 4, 6, 9, 11, 12, 14, 14, 13, 10, 5, 0],
  'cypress-point:2': [0, -11, -21, -32, -41, -47, -49, -47, -41, -32, -23, -13, 0],
  'cypress-point:4': [0, 1, 3, 4, 6, 7, 8, 9, 9, 8, 6, 3, 0],
  'cypress-point:5': [0, -15, -29, -44, -57, -66, -70, -68, -59, -47, -34, -18, 0],
  'cypress-point:6': [0, -10, -21, -31, -41, -48, -52, -53, -50, -43, -34, -21, 0],
  'cypress-point:8': [0, 6, 12, 18, 24, 29, 35, 39, 41, 41, 35, 18, 0],
  'cypress-point:9': [0, -1, -2, -4, -5, -6, -7, -8, -9, -9, -9, -6, 0],
  'cypress-point:10': [0, 4, 8, 11, 15, 18, 20, 20, 19, 16, 12, 7, 0],
  'cypress-point:11': [0, 3, 6, 10, 13, 15, 17, 18, 17, 15, 10, 5, 0],
  'cypress-point:12': [0, 10, 21, 31, 42, 52, 58, 61, 60, 52, 35, 18, 0],
  'cypress-point:14': [0, 4, 8, 12, 16, 19, 22, 24, 25, 23, 18, 9, 0],
  // 16 is the one hand-authored profile in this map. Its OSM centreline is a
  // straight tee→pin chord across the cove, which is the line you play only if
  // you take the hole on; the hole itself doglegs RIGHT round the water to the
  // bail-out, peaking ~55 yd golfer-left of the chord at the corner (~165 yd,
  // the middle of the measured landing area). Positive = golfer-left = the
  // path bows left = "Dogleg right" on the chip, per the sign note above.
  'cypress-point:16': [0, 10, 20, 29, 37, 44, 49, 53, 55, 54, 43, 24, 0],
  'cypress-point:17': [0, 7, 14, 21, 28, 36, 40, 43, 43, 39, 28, 14, 0],
  'cypress-point:18': [0, 3, 6, 10, 13, 16, 18, 20, 20, 18, 14, 7, 0],
  // Whistling Straits — Straits — real centreline curvature. Lateral yards,
  // so the tee-end shift applied to the zones (see OSM_GEOMETRY) does not
  // apply. Signs correct a tuple that shipped 15 of 18 holes as 'S': 5 and 11
  // are the two big Dye swings (109 and 82 yd), and 1, 6, 8, 10, 13 and 14
  // all turn hard enough to earn a chip the tuple never gave them. 16 shipped
  // BACKWARDS (tuple 'R', the centreline bends left), and 15's tuple 'L' is a
  // real but gentle 11-yd lean that stays under the 20-yd chip threshold.
  'whistling-straits:1': [0, -6, -12, -18, -24, -29, -33, -34, -33, -29, -20, -10, 0],
  'whistling-straits:2': [0, 3, 6, 9, 11, 14, 16, 16, 16, 14, 10, 5, 0],
  'whistling-straits:4': [0, -4, -8, -12, -15, -18, -21, -21, -20, -17, -12, -6, 0],
  'whistling-straits:5': [0, 21, 42, 63, 84, 100, 109, 104, 81, 46, 14, -1, 0],
  'whistling-straits:6': [0, 4, 9, 13, 18, 22, 26, 28, 29, 28, 24, 12, 0],
  'whistling-straits:8': [0, 8, 17, 25, 33, 39, 44, 45, 42, 36, 24, 12, 0],
  'whistling-straits:9': [0, 2, 5, 7, 10, 12, 14, 15, 15, 14, 11, 5, 0],
  'whistling-straits:10': [0, -8, -16, -24, -32, -40, -45, -50, -50, -47, -35, -18, 0],
  'whistling-straits:11': [0, 17, 34, 51, 66, 77, 82, 78, 62, 47, 31, 16, 0],
  'whistling-straits:13': [0, 6, 13, 19, 26, 30, 33, 33, 31, 26, 17, 9, 0],
  'whistling-straits:14': [0, -6, -13, -19, -26, -32, -38, -42, -43, -42, -35, -17, 0],
  'whistling-straits:15': [0, 2, 4, 6, 8, 10, 11, 11, 11, 9, 6, 3, 0],
  'whistling-straits:16': [0, -6, -11, -17, -22, -28, -33, -39, -45, -48, -43, -24, 0],
  'whistling-straits:18': [0, -10, -20, -31, -41, -49, -55, -56, -54, -47, -31, -16, 0],
  // TPC Potomac — 12 of 18 turn hard enough to persist, 10 the big one at
  // 92 yd. Reading these against the tuple (positive bend ⇒ dogleg RIGHT — the
  // path bows opposite the turn, see the chip note in ui/panels.tsx): 2, 6 and
  // 10 shipped BACKWARDS, and 4 and 7 are real ≥20-yd doglegs the tuple calls
  // straight. 8, 13, 14, 15 and 16 lean under the 20-yd chip threshold and
  // only bend the drawn hole. Exactly why the bend overrides the flag.
  'tpc-potomac:1': [0, 8, 15, 23, 30, 38, 42, 46, 46, 41, 30, 15, 0],
  'tpc-potomac:2': [0, 11, 22, 33, 43, 49, 51, 47, 36, 25, 16, 8, 0],
  'tpc-potomac:4': [0, -4, -7, -11, -14, -18, -20, -22, -22, -20, -15, -8, 0],
  'tpc-potomac:6': [0, 8, 15, 23, 30, 36, 40, 41, 40, 35, 23, 12, 0],
  'tpc-potomac:7': [0, 5, 10, 15, 20, 24, 27, 28, 28, 24, 17, 9, 0],
  'tpc-potomac:8': [0, -3, -5, -8, -10, -13, -14, -15, -14, -12, -9, -4, 0],
  'tpc-potomac:10': [0, -17, -35, -52, -67, -80, -88, -92, -90, -80, -62, -32, 0],
  'tpc-potomac:11': [0, -12, -25, -37, -49, -57, -63, -63, -57, -46, -31, -15, 0],
  'tpc-potomac:13': [0, 1, 2, 3, 5, 6, 7, 8, 8, 8, 7, 4, 0],
  'tpc-potomac:14': [0, 3, 5, 8, 10, 13, 15, 16, 17, 16, 14, 7, 0],
  'tpc-potomac:15': [0, 3, 5, 8, 10, 13, 15, 15, 15, 14, 10, 5, 0],
  'tpc-potomac:16': [0, -2, -4, -7, -9, -11, -12, -12, -11, -9, -6, -3, 0],

  // Seminole — 10 of 18 bend hard enough to persist. 3 is the big one (75 yd
  // left), with 15 and 16 close behind; 18 turns 50 yd right into the home
  // green. The eight straight holes include all four par 3s.
  'seminole:1': [0, 2, 5, 7, 9, 11, 14, 15, 17, 17, 16, 11, 0],
  'seminole:2': [0, -2, -4, -6, -8, -10, -12, -13, -14, -14, -12, -6, 0],
  'seminole:3': [0, 13, 26, 40, 53, 65, 72, 75, 73, 63, 42, 21, 0],
  'seminole:6': [0, -3, -7, -10, -13, -16, -18, -18, -17, -14, -9, -5, 0],
  'seminole:7': [0, 2, 4, 5, 7, 9, 10, 11, 11, 11, 9, 4, 0],
  'seminole:9': [0, -3, -7, -10, -13, -17, -19, -20, -20, -18, -14, -7, 0],
  'seminole:12': [0, 2, 4, 6, 8, 10, 11, 13, 13, 12, 9, 5, 0],
  'seminole:15': [0, 10, 20, 30, 40, 50, 56, 60, 60, 53, 37, 19, 0],
  'seminole:16': [0, 10, 21, 31, 41, 50, 56, 58, 56, 49, 33, 16, 0],
  'seminole:18': [0, -8, -16, -24, -32, -40, -46, -50, -50, -46, -35, -17, 0],

  // Kings Creek CC (see OSM_GEOMETRY note)
  'kings-creek:1': [0, -1, -2, -4, -5, -6, -7, -8, -8, -8, -6, -3, 0],
  'kings-creek:2': [0, -3, -7, -10, -13, -17, -20, -22, -23, -23, -20, -10, 0],
  'kings-creek:4': [0, 6, 11, 17, 22, 28, 31, 33, 33, 29, 20, 10, 0],
  'kings-creek:5': [0, 8, 16, 24, 32, 38, 43, 43, 40, 34, 23, 11, 0],
  'kings-creek:7': [0, -5, -11, -16, -21, -25, -27, -28, -26, -23, -18, -11, 0],
  'kings-creek:9': [0, -12, -23, -35, -46, -56, -64, -68, -68, -60, -47, -25, 0],
  'kings-creek:13': [0, -5, -9, -14, -19, -23, -26, -27, -27, -24, -17, -9, 0],
  'kings-creek:14': [0, 4, 8, 13, 17, 21, 24, 26, 27, 25, 20, 10, 0],
  'kings-creek:15': [0, 3, 6, 8, 11, 14, 16, 17, 17, 15, 11, 6, 0],
  'kings-creek:16': [0, 2, 5, 7, 10, 12, 14, 16, 16, 14, 11, 6, 0],
  'kings-creek:18': [0, -24, -48, -72, -96, -116, -131, -138, -129, -103, -74, -39, 0],
}

export const OSM_GEOMETRY: Record<string, OsmHoleGeometry> = {
  // hole 1 — opener
  'tpc-sawgrass:1': {
    length: 427,
    fairwayFrom: 149,
    fairwayTo: 415,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 106, to: 258, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 216, to: 280, side: 'right' },
      { id: 'z3', kind: 'water', from: 280, to: 388, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 350, to: 386, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 386, to: 427, side: 'left' },
      { id: 'z6', kind: 'water', from: 388, to: 427, side: 'cross' },
    ],
  },
  // hole 2 — par 5 — HAND-AUTHORED. OSM's coarse centreline cut the dogleg
  // corner through the big shared lake, giving a phantom "water off the tee"
  // the importer couldn't distinguish from a real carry. Rebuilt from the real
  // hole instead: fairway traps up the right, the pond to their right nearer
  // the green, and greenside sand — with the false tee water dropped.
  'tpc-sawgrass:2': {
    length: 536,
    fairwayFrom: 188,
    fairwayTo: 523,
    greenDepth: 22,
    zones: [
      { id: 'z1', kind: 'bunker', from: 300, to: 430, side: 'right' }, // waste bunker up the right
      { id: 'z2', kind: 'water', from: 402, to: 486, side: 'right' }, // pond right, closer to the green
      { id: 'z3', kind: 'bunker', from: 452, to: 500, side: 'right' }, // approach bunker right
      { id: 'z4', kind: 'bunker', from: 512, to: 536, side: 'left' }, // greenside left
      { id: 'z5', kind: 'bunker', from: 514, to: 536, side: 'right' }, // greenside right
    ],
  },
  // hole 3 — par 3
  'tpc-sawgrass:3': {
    length: 181,
    fairwayFrom: 63,
    fairwayTo: 169,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 72, to: 124, side: 'cross' },
      { id: 'z2', kind: 'water', from: 124, to: 176, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 126, to: 140, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 140, to: 150, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 152, to: 181, side: 'left' },
    ],
  },
  // hole 4
  'tpc-sawgrass:4': {
    length: 392,
    fairwayFrom: 137,
    fairwayTo: 380,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 144, side: 'right' },
      { id: 'z2', kind: 'water', from: 144, to: 162, side: 'cross' },
      { id: 'z3', kind: 'water', from: 162, to: 258, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 162, to: 174, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 174, to: 300, side: 'right' },
      { id: 'z6', kind: 'water', from: 334, to: 358, side: 'right' },
      { id: 'z7', kind: 'water', from: 358, to: 374, side: 'cross' },
      { id: 'z8', kind: 'water', from: 374, to: 392, side: 'left' },
    ],
  },
  // hole 5
  'tpc-sawgrass:5': {
    length: 463,
    fairwayFrom: 162,
    fairwayTo: 451,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 82, side: 'right' },
      { id: 'z2', kind: 'water', from: 82, to: 168, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 164, to: 188, side: 'left' },
      { id: 'z4', kind: 'water', from: 168, to: 314, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 188, to: 224, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 224, to: 314, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 314, to: 320, side: 'cross' },
      { id: 'z8', kind: 'bunker', from: 320, to: 368, side: 'left' },
      { id: 'z9', kind: 'water', from: 330, to: 388, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 372, to: 428, side: 'right' },
    ],
  },
  // hole 6
  'tpc-sawgrass:6': {
    length: 390,
    fairwayFrom: 137,
    fairwayTo: 378,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 18, to: 64, side: 'left' },
      { id: 'z2', kind: 'water', from: 64, to: 72, side: 'cross' },
      { id: 'z3', kind: 'water', from: 72, to: 80, side: 'right' },
      { id: 'z4', kind: 'water', from: 84, to: 102, side: 'left' },
      { id: 'z5', kind: 'water', from: 102, to: 120, side: 'cross' },
      { id: 'z6', kind: 'water', from: 120, to: 362, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 140, to: 156, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 156, to: 180, side: 'cross' },
      { id: 'z9', kind: 'bunker', from: 180, to: 272, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 344, to: 350, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 356, to: 362, side: 'right' },
      { id: 'z12', kind: 'bunker', from: 368, to: 376, side: 'left' },
    ],
  },
  // hole 7
  'tpc-sawgrass:7': {
    length: 450,
    fairwayFrom: 158,
    fairwayTo: 438,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 4, side: 'right' },
      { id: 'z2', kind: 'water', from: 50, to: 74, side: 'left' },
      { id: 'z3', kind: 'water', from: 74, to: 158, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 150, to: 192, side: 'right' },
      { id: 'z5', kind: 'water', from: 158, to: 334, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 192, to: 210, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 210, to: 328, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 264, to: 270, side: 'cross' },
      { id: 'z9', kind: 'bunker', from: 328, to: 384, side: 'cross' },
      { id: 'z10', kind: 'water', from: 342, to: 410, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 384, to: 446, side: 'right' },
      { id: 'z12', kind: 'water', from: 410, to: 446, side: 'cross' },
      { id: 'z13', kind: 'water', from: 446, to: 450, side: 'left' },
    ],
  },
  // hole 8 — long par 3
  'tpc-sawgrass:8': {
    length: 237,
    fairwayFrom: 83,
    fairwayTo: 225,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 10, to: 24, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 208, to: 218, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 218, to: 230, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 224, to: 232, side: 'left' },
    ],
  },
  // hole 9 — par 5
  'tpc-sawgrass:9': {
    length: 577,
    fairwayFrom: 202,
    fairwayTo: 565,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 18, to: 90, side: 'right' },
      { id: 'z2', kind: 'water', from: 136, to: 348, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 154, to: 198, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 210, to: 234, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 244, to: 266, side: 'right' },
      { id: 'z6', kind: 'water', from: 348, to: 364, side: 'cross' },
      { id: 'z7', kind: 'water', from: 364, to: 452, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 456, to: 546, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 564, to: 577, side: 'left' },
    ],
  },
  // hole 10
  'tpc-sawgrass:10': {
    length: 410,
    fairwayFrom: 144,
    fairwayTo: 398,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 50, to: 54, side: 'right' },
      { id: 'z2', kind: 'water', from: 54, to: 78, side: 'cross' },
      { id: 'z3', kind: 'water', from: 78, to: 88, side: 'left' },
      { id: 'z4', kind: 'water', from: 88, to: 108, side: 'cross' },
      { id: 'z5', kind: 'water', from: 108, to: 202, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 110, to: 114, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 114, to: 166, side: 'cross' },
      { id: 'z8', kind: 'bunker', from: 166, to: 284, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 306, to: 310, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 310, to: 322, side: 'cross' },
      { id: 'z11', kind: 'bunker', from: 322, to: 406, side: 'right' },
    ],
  },
  // hole 11 — par 5 — OMITTED (procedural fallback). Its imported aggressive
  // tee-landing zone comes out clean, so the hole failed the engine's "safe is
  // meaningfully safer than aggressive" design invariant (engine.test.ts) —
  // likely the coarse centreline dropping the left water past the driving zone.
  // Do NOT loosen the test to ship it; re-import with a finer line to restore.
  // hole 12 — driveable par 4
  'tpc-sawgrass:12': {
    length: 335,
    fairwayFrom: 117,
    fairwayTo: 323,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 52, to: 66, side: 'right' },
      { id: 'z2', kind: 'water', from: 66, to: 116, side: 'cross' },
      { id: 'z3', kind: 'water', from: 116, to: 166, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 176, to: 294, side: 'left' },
      { id: 'z5', kind: 'water', from: 246, to: 335, side: 'left' },
    ],
  },
  // hole 13 — par 3
  'tpc-sawgrass:13': {
    length: 176,
    fairwayFrom: 62,
    fairwayTo: 164,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 18, to: 58, side: 'left' },
      { id: 'z2', kind: 'water', from: 58, to: 92, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 86, to: 142, side: 'right' },
      { id: 'z4', kind: 'water', from: 92, to: 176, side: 'left' },
    ],
  },
  // hole 14
  'tpc-sawgrass:14': {
    length: 470,
    fairwayFrom: 165,
    fairwayTo: 458,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 58, side: 'left' },
      { id: 'z2', kind: 'water', from: 58, to: 140, side: 'cross' },
      { id: 'z3', kind: 'water', from: 140, to: 384, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 158, to: 190, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 190, to: 214, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 214, to: 368, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 368, to: 396, side: 'cross' },
      { id: 'z8', kind: 'bunker', from: 396, to: 448, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 448, to: 460, side: 'cross' },
      { id: 'z10', kind: 'bunker', from: 460, to: 470, side: 'left' },
    ],
  },
  // hole 15
  'tpc-sawgrass:15': {
    length: 461,
    fairwayFrom: 161,
    fairwayTo: 449,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 62, to: 78, side: 'left' },
      { id: 'z2', kind: 'water', from: 78, to: 196, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 214, to: 322, side: 'right' },
      { id: 'z4', kind: 'water', from: 358, to: 426, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 360, to: 380, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 380, to: 461, side: 'left' },
    ],
  },
  // hole 16 — reachable par 5 — water right
  'tpc-sawgrass:16': {
    length: 521,
    fairwayFrom: 182,
    fairwayTo: 509,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 6, to: 74, side: 'left' },
      { id: 'z2', kind: 'water', from: 74, to: 120, side: 'cross' },
      { id: 'z3', kind: 'water', from: 120, to: 152, side: 'right' },
      { id: 'z4', kind: 'water', from: 152, to: 168, side: 'cross' },
      { id: 'z5', kind: 'water', from: 168, to: 184, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 228, to: 264, side: 'right' },
      { id: 'z7', kind: 'water', from: 360, to: 521, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 456, to: 480, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 518, to: 521, side: 'left' },
    ],
  },
  // hole 17 — the island green 17th
  'tpc-sawgrass:17': {
    length: 138,
    fairwayFrom: 48,
    fairwayTo: 126,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 12, to: 16, side: 'left' },
      { id: 'z2', kind: 'water', from: 16, to: 138, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 128, to: 132, side: 'right' },
    ],
  },
  // hole 18 — water all down the left
  'tpc-sawgrass:18': {
    length: 446,
    fairwayFrom: 156,
    fairwayTo: 434,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 102, side: 'left' },
      { id: 'z2', kind: 'water', from: 102, to: 132, side: 'cross' },
      { id: 'z3', kind: 'water', from: 132, to: 446, side: 'left' },
    ],
  },
  // Augusta National — Amen Corner, 11th (pond left of the green)
  'augusta-national:11': {
    length: 530,
    fairwayFrom: 186,
    fairwayTo: 517,
    greenDepth: 22,
    zones: [{ id: 'z1', kind: 'water', from: 486, to: 530, side: 'left' }],
  },
  // Augusta National — Golden Bell, the par-3 12th over Rae's Creek
  'augusta-national:12': {
    length: 156,
    fairwayFrom: 55,
    fairwayTo: 144,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 48, to: 58, side: 'left' },
      { id: 'z2', kind: 'water', from: 74, to: 118, side: 'left' },
      { id: 'z3', kind: 'water', from: 118, to: 138, side: 'cross' },
      { id: 'z4', kind: 'water', from: 138, to: 156, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 144, to: 146, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 146, to: 148, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 148, to: 152, side: 'right' },
    ],
  },
  // Pebble Beach — the cliffside par-3 7th, the Pacific down the whole right
  'pebble-beach:7': {
    length: 109,
    fairwayFrom: 38,
    fairwayTo: 97,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'ocean', from: 0, to: 109, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 0, to: 6, side: 'left' },
      { id: 'z3', kind: 'deeprough', from: 68, to: 76, side: 'right' },
      { id: 'z4', kind: 'deeprough', from: 84, to: 94, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 84, to: 104, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 92, to: 100, side: 'right' },
      { id: 'z7', kind: 'deeprough', from: 94, to: 109, side: 'cross' },
      { id: 'z8', kind: 'bunker', from: 104, to: 109, side: 'left' },
    ],
  },
  // Pebble Beach — the 8th, the Pacific down the whole right along the cliff
  'pebble-beach:8': {
    length: 423,
    fairwayFrom: 148,
    fairwayTo: 411,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'ocean', from: 0, to: 423, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 0, to: 14, side: 'left' },
      { id: 'z3', kind: 'deeprough', from: 268, to: 282, side: 'left' },
      { id: 'z4', kind: 'deeprough', from: 312, to: 376, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 368, to: 380, side: 'left' },
      { id: 'z6', kind: 'deeprough', from: 376, to: 423, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 396, to: 412, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 412, to: 423, side: 'right' },
    ],
  },

  // ---------------------------------------------------------------------
  // Par-3 short courses. Zones imported from OSM (see COURSE_GEO in
  // scripts/import-osm.ts), then SCALED so each hole's length equals the
  // club's published scorecard yardage — the card is the source of truth
  // for distance, OSM for geography. fairwayFrom/To are 0 by the par-3
  // convention (no fairway corridor on a one-shotter).
  // ---------------------------------------------------------------------
  // hole 1 — scorecard 167 yd (OSM centreline 164 yd, zones scaled to card)
  'palm-beach-par-3:1': {
    length: 167,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 167, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 49, to: 67, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 134, to: 147, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 161, to: 167, side: 'left' },
    ],
  },
  // hole 2 — scorecard 126 yd (OSM centreline 121 yd, zones scaled to card)
  'palm-beach-par-3:2': {
    length: 126,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 96, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 8, to: 123, side: 'left' },
    ],
  },
  // hole 3 — scorecard 196 yd (OSM centreline 187 yd, zones scaled to card)
  'palm-beach-par-3:3': {
    length: 196,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 17, to: 55, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 73, to: 92, side: 'left' },
      { id: 'z3', kind: 'water', from: 82, to: 196, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 105, to: 196, side: 'left' },
    ],
  },
  // hole 4 — scorecard 211 yd (OSM centreline 209 yd, zones scaled to card)
  'palm-beach-par-3:4': {
    length: 211,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'ocean', from: 0, to: 211, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 0, to: 6, side: 'cross' },
      { id: 'z3', kind: 'water', from: 2, to: 160, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 6, to: 113, side: 'left' },
    ],
  },
  // hole 5 — scorecard 176 yd (OSM centreline 169 yd, zones scaled to card)
  'palm-beach-par-3:5': {
    length: 176,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'ocean', from: 0, to: 176, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 42, to: 65, side: 'right' },
    ],
  },
  // hole 6 — scorecard 128 yd (OSM centreline 121 yd, zones scaled to card)
  'palm-beach-par-3:6': {
    length: 128,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'ocean', from: 0, to: 128, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 0, to: 19, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 23, to: 66, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 66, to: 85, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 85, to: 128, side: 'left' },
    ],
  },
  // hole 7 — scorecard 108 yd (OSM centreline 103 yd, zones scaled to card)
  'palm-beach-par-3:7': {
    length: 108,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'ocean', from: 0, to: 108, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 0, to: 13, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 13, to: 48, side: 'cross' },
    ],
  },
  // hole 8 — scorecard 133 yd (OSM centreline 125 yd, zones scaled to card)
  'palm-beach-par-3:8': {
    length: 133,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'ocean', from: 0, to: 133, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 0, to: 30, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 30, to: 64, side: 'right' },
    ],
  },
  // hole 9 — scorecard 81 yd (OSM centreline 74 yd, zones scaled to card)
  'palm-beach-par-3:9': {
    length: 81,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 55, to: 63, side: 'right' },
    ],
  },
  // hole 10 — scorecard 112 yd (OSM centreline 107 yd, zones scaled to card)
  'palm-beach-par-3:10': {
    length: 112,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 10, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 75, to: 112, side: 'right' },
    ],
  },
  // hole 11 — scorecard 108 yd (OSM centreline 100 yd, zones scaled to card)
  'palm-beach-par-3:11': {
    length: 108,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 91, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 86, to: 97, side: 'cross' },
    ],
  },
  // hole 12 — scorecard 126 yd (OSM centreline 117 yd, zones scaled to card)
  'palm-beach-par-3:12': {
    length: 126,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 24, side: 'cross' },
      { id: 'z2', kind: 'bunker', from: 24, to: 126, side: 'right' },
    ],
  },
  // hole 13 — scorecard 171 yd (OSM centreline 118 yd, zones scaled to card)
  'palm-beach-par-3:13': {
    length: 171,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 6, side: 'right' },
    ],
  },
  // hole 14 — scorecard 129 yd (OSM centreline 126 yd, zones scaled to card)
  'palm-beach-par-3:14': {
    length: 129,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
    ],
  },
  // hole 15 — scorecard 156 yd (OSM centreline 147 yd, zones scaled to card)
  'palm-beach-par-3:15': {
    length: 156,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 53, to: 68, side: 'left' },
      { id: 'z2', kind: 'water', from: 68, to: 108, side: 'cross' },
      { id: 'z3', kind: 'water', from: 108, to: 156, side: 'left' },
    ],
  },
  // hole 16 — scorecard 117 yd (OSM centreline 112 yd, zones scaled to card)
  'palm-beach-par-3:16': {
    length: 117,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 61, to: 117, side: 'left' },
    ],
  },
  // hole 17 — scorecard 148 yd (OSM centreline 144 yd, zones scaled to card)
  'palm-beach-par-3:17': {
    length: 148,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 105, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 0, to: 29, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 45, to: 72, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 72, to: 109, side: 'right' },
    ],
  },
  // hole 18 — scorecard 179 yd (OSM centreline 158 yd, zones scaled to card)
  'palm-beach-par-3:18': {
    length: 179,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 68, to: 127, side: 'right' },
    ],
  },
  // hole 1 — scorecard 176 yd (OSM centreline 159 yd, zones scaled to card)
  'cobblestone-creek:1': {
    length: 176,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 122, to: 133, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 151, to: 157, side: 'right' },
    ],
  },
  // hole 2 — scorecard 150 yd (OSM centreline 154 yd, zones scaled to card)
  'cobblestone-creek:2': {
    length: 150,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 22,
    zones: [
      { id: 'z1', kind: 'bunker', from: 144, to: 150, side: 'right' },
    ],
  },
  // hole 3 — scorecard 168 yd (OSM centreline 171 yd, zones scaled to card)
  'cobblestone-creek:3': {
    length: 168,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 151, to: 168, side: 'left' },
    ],
  },
  // hole 4 — scorecard 225 yd (OSM centreline 228 yd, zones scaled to card)
  'cobblestone-creek:4': {
    length: 225,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 132, to: 138, side: 'left' },
      { id: 'z2', kind: 'water', from: 138, to: 156, side: 'cross' },
      { id: 'z3', kind: 'water', from: 156, to: 172, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 199, to: 211, side: 'left' },
    ],
  },
  // hole 5 — scorecard 108 yd (OSM centreline 159 yd, zones scaled to card)
  'cobblestone-creek:5': {
    length: 108,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
    ],
  },
  // hole 6 — scorecard 150 yd (OSM centreline 154 yd, zones scaled to card)
  'cobblestone-creek:6': {
    length: 150,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 19, to: 43, side: 'left' },
      { id: 'z2', kind: 'water', from: 43, to: 103, side: 'cross' },
      { id: 'z3', kind: 'water', from: 103, to: 150, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 105, to: 111, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 115, to: 140, side: 'left' },
    ],
  },
  // hole 7 — scorecard 185 yd (OSM centreline 184 yd, zones scaled to card)
  'cobblestone-creek:7': {
    length: 185,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 157, to: 161, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 177, to: 183, side: 'right' },
    ],
  },
  // hole 8 — scorecard 92 yd (OSM centreline 95 yd, zones scaled to card)
  'cobblestone-creek:8': {
    length: 92,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 72, to: 77, side: 'left' },
    ],
  },
  // hole 9 — scorecard 225 yd (OSM centreline 229 yd, zones scaled to card)
  'cobblestone-creek:9': {
    length: 225,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 153, to: 163, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 198, to: 212, side: 'left' },
    ],
  },
  // ---------------------------------------------------------------------
  // Harbour Town Golf Links — imported from OSM (see COURSE_GEO), QA'd
  // hole-by-hole against satellite imagery (ProVisualizer 2D planner).
  // Hand edits: hole 4's greenside bunkers (OSM rings collapse behind the
  // green, so the rasterizer drops them) and hole 18's marsh relabelled
  // water → ocean (Calibogue Sound, matching the course tuple's hazard).
  // ---------------------------------------------------------------------
  // hole 1 — opener — pond crossing in front of the tee, greenside bunker left
  'harbour-town:1': {
    length: 407,
    fairwayFrom: 142,
    fairwayTo: 395,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 14, to: 36, side: 'left' },
      { id: 'z2', kind: 'water', from: 36, to: 52, side: 'cross' },
      { id: 'z3', kind: 'water', from: 52, to: 60, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 374, to: 404, side: 'left' },
    ],
  },
  // hole 2 — par 5 — waste sand up the right at the green
  'harbour-town:2': {
    length: 501,
    fairwayFrom: 175,
    fairwayTo: 489,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 188, to: 200, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 232, to: 274, side: 'left' },
      { id: 'z3', kind: 'water', from: 346, to: 370, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 386, to: 500, side: 'right' },
    ],
  },
  // hole 3 — big bunker short-left of the green, pond right at the putting surface
  // (OSM centreline 436 yd, zones scaled to the 469 yd Heritage-tee scorecard)
  'harbour-town:3': {
    length: 469,
    fairwayFrom: 165,
    fairwayTo: 456,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 34, to: 43, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 65, to: 80, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 226, to: 387, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 417, to: 456, side: 'left' },
      { id: 'z5', kind: 'water', from: 454, to: 469, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 463, to: 469, side: 'right' },
    ],
  },
  // hole 4 — par 3 over the lagoon left
  'harbour-town:4': {
    length: 192,
    fairwayFrom: 67,
    fairwayTo: 180,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 30, to: 70, side: 'right' },
      { id: 'z2', kind: 'water', from: 70, to: 76, side: 'cross' },
      { id: 'z3', kind: 'water', from: 76, to: 110, side: 'left' },
      { id: 'z4', kind: 'water', from: 110, to: 152, side: 'cross' },
      { id: 'z5', kind: 'water', from: 152, to: 192, side: 'left' },
      { id: 'z6', kind: 'water', from: 170, to: 178, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 176, to: 192, side: 'right' },
    ],
  },
  // hole 5 — par 5 — lagoon down the left, sand everywhere at the green
  'harbour-town:5': {
    length: 538,
    fairwayFrom: 188,
    fairwayTo: 526,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 202, to: 486, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 220, to: 238, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 250, to: 314, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 262, to: 270, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 336, to: 358, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 368, to: 400, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 424, to: 436, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 436, to: 518, side: 'cross' },
      { id: 'z9', kind: 'bunker', from: 518, to: 538, side: 'left' },
    ],
  },
  // hole 6 — pond right of the landing zone, waste crossing the layup
  'harbour-town:6': {
    length: 412,
    fairwayFrom: 144,
    fairwayTo: 400,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 32, to: 70, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 162, to: 236, side: 'left' },
      { id: 'z3', kind: 'water', from: 182, to: 234, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 236, to: 290, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 290, to: 320, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 376, to: 390, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 402, to: 412, side: 'left' },
    ],
  },
  // hole 7 — par 3 — water then the famous sand ring around the green
  'harbour-town:7': {
    length: 196,
    fairwayFrom: 69,
    fairwayTo: 184,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 18, to: 126, side: 'right' },
      { id: 'z2', kind: 'water', from: 126, to: 142, side: 'cross' },
      { id: 'z3', kind: 'water', from: 142, to: 196, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 142, to: 154, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 154, to: 196, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 174, to: 188, side: 'right' },
    ],
  },
  // hole 8 — dogleg left — ponds left, greenside sand both sides
  'harbour-town:8': {
    length: 467,
    fairwayFrom: 163,
    fairwayTo: 455,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 8, to: 28, side: 'right' },
      { id: 'z2', kind: 'water', from: 246, to: 288, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 318, to: 374, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 376, to: 384, side: 'left' },
      { id: 'z5', kind: 'water', from: 380, to: 467, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 438, to: 460, side: 'left' },
    ],
  },
  // hole 9 — short par 4 — the light-bulb pot bunker fronting the green
  'harbour-town:9': {
    length: 326,
    fairwayFrom: 114,
    fairwayTo: 314,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 312, to: 322, side: 'cross' },
    ],
  },
  // hole 10 — the lake down the entire left of the corridor
  'harbour-town:10': {
    length: 447,
    fairwayFrom: 156,
    fairwayTo: 435,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 90, to: 100, side: 'left' },
      { id: 'z2', kind: 'water', from: 106, to: 376, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 430, to: 436, side: 'right' },
    ],
  },
  // hole 11 — long waste bunker left through the approach
  'harbour-town:11': {
    length: 434,
    fairwayFrom: 152,
    fairwayTo: 422,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 90, to: 114, side: 'right' },
      { id: 'z2', kind: 'water', from: 192, to: 224, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 260, to: 382, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 412, to: 432, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 432, to: 434, side: 'cross' },
    ],
  },
  // hole 12 — lagoon left off the tee, waste bunker left beyond it
  'harbour-town:12': {
    length: 425,
    fairwayFrom: 149,
    fairwayTo: 413,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 128, to: 168, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 178, to: 290, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 404, to: 412, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 412, to: 420, side: 'cross' },
    ],
  },
  // hole 13 — the horseshoe bunker wrapping the green
  'harbour-town:13': {
    length: 370,
    fairwayFrom: 130,
    fairwayTo: 358,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 214, to: 266, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 266, to: 280, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 280, to: 312, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 330, to: 340, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 340, to: 364, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 364, to: 370, side: 'right' },
    ],
  },
  // hole 14 — par 3 — pond short and left of the green
  'harbour-town:14': {
    length: 188,
    fairwayFrom: 66,
    fairwayTo: 176,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 116, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 32, to: 72, side: 'right' },
      { id: 'z3', kind: 'water', from: 116, to: 168, side: 'cross' },
      { id: 'z4', kind: 'water', from: 168, to: 188, side: 'right' },
    ],
  },
  // hole 15 — par 5 — lagoon left of the layup, waste right at the green
  'harbour-town:15': {
    length: 577,
    fairwayFrom: 202,
    fairwayTo: 565,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 222, to: 246, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 246, to: 260, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 260, to: 270, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 270, to: 334, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 334, to: 452, side: 'left' },
      { id: 'z6', kind: 'water', from: 446, to: 562, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 488, to: 548, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 548, to: 577, side: 'cross' },
    ],
  },
  // hole 16 — the giant waste bunker inside the dogleg left
  // (OSM centreline 409 yd, zones scaled to the 434 yd Heritage-tee scorecard)
  'harbour-town:16': {
    length: 434,
    fairwayFrom: 152,
    fairwayTo: 421,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 248, to: 297, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 297, to: 354, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 333, to: 340, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 354, to: 369, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 369, to: 410, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 410, to: 416, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 424, to: 434, side: 'right' },
    ],
  },
  // hole 17 — par 3 — marsh left and crossing, the long bunker wrapping the green
  // (OSM centreline 214 yd, zones scaled to the 185 yd Heritage-tee scorecard)
  'harbour-town:17': {
    length: 185,
    fairwayFrom: 65,
    fairwayTo: 175,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 2, to: 19, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 38, to: 41, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 41, to: 48, side: 'left' },
      { id: 'z4', kind: 'water', from: 43, to: 57, side: 'left' },
      { id: 'z5', kind: 'water', from: 57, to: 102, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 78, to: 128, side: 'right' },
      { id: 'z7', kind: 'water', from: 102, to: 185, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 128, to: 166, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 131, to: 138, side: 'cross' },
      { id: 'z10', kind: 'bunker', from: 166, to: 178, side: 'cross' },
      { id: 'z11', kind: 'bunker', from: 175, to: 185, side: 'left' },
    ],
  },
  // hole 18 — the lighthouse hole. Calibogue Sound / marsh runs the ENTIRE
  // left side tee-to-green and wraps behind the green; trees line the right,
  // no water crosses the corridor. HAND-AUTHORED from imagery: the OSM
  // centreline hugs the marsh edge, so the importer read the diagonal as
  // full-width `cross` bands on both sides — wrong. Honest model is one
  // continuous left ocean hazard, a short marsh carry off the tee, and the
  // greenside bunker up the right.
  'harbour-town:18': {
    length: 470,
    fairwayFrom: 165,
    fairwayTo: 458,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'ocean', from: 0, to: 470, side: 'left' }, // the Sound down the entire left, wrapping behind the green
      { id: 'z2', kind: 'trees', from: 150, to: 400, side: 'right' }, // live-oak treeline framing the right of the corridor
      { id: 'z3', kind: 'bunker', from: 414, to: 454, side: 'right' },
    ],
  },
  // ---------------------------------------------------------------------
  // PGA Frisco — The Swing. HAND-AUTHORED: OSM maps Fields Ranch East/West
  // but not the 10-hole Swing short course, so these are drawn from the
  // published scorecard lengths + aerial imagery of the heavily-bunkered
  // layout. Replace with a real import if OSM ever grows the course.
  // ---------------------------------------------------------------------
  'the-swing:1': { length: 75, fairwayFrom: 0, fairwayTo: 0, greenDepth: 24, zones: [
    { id: 'z1', kind: 'bunker', from: 55, to: 68, side: 'cross' },
    { id: 'z2', kind: 'bunker', from: 62, to: 75, side: 'left' },
  ] },
  'the-swing:2': { length: 77, fairwayFrom: 0, fairwayTo: 0, greenDepth: 24, zones: [
    { id: 'z1', kind: 'bunker', from: 60, to: 72, side: 'right' },
    { id: 'z2', kind: 'bunker', from: 66, to: 77, side: 'left' },
  ] },
  'the-swing:3': { length: 88, fairwayFrom: 0, fairwayTo: 0, greenDepth: 26, zones: [
    { id: 'z1', kind: 'bunker', from: 64, to: 76, side: 'cross' },
    { id: 'z2', kind: 'bunker', from: 74, to: 88, side: 'right' },
  ] },
  'the-swing:4': { length: 70, fairwayFrom: 0, fairwayTo: 0, greenDepth: 22, zones: [
    { id: 'z1', kind: 'bunker', from: 52, to: 64, side: 'left' },
    { id: 'z2', kind: 'bunker', from: 58, to: 70, side: 'right' },
  ] },
  'the-swing:5': { length: 103, fairwayFrom: 0, fairwayTo: 0, greenDepth: 26, zones: [
    { id: 'z1', kind: 'bunker', from: 72, to: 86, side: 'cross' },
    { id: 'z2', kind: 'bunker', from: 84, to: 98, side: 'left' },
    { id: 'z3', kind: 'bunker', from: 90, to: 103, side: 'right' },
  ] },
  'the-swing:6': { length: 77, fairwayFrom: 0, fairwayTo: 0, greenDepth: 24, zones: [] },
  'the-swing:7': { length: 69, fairwayFrom: 0, fairwayTo: 0, greenDepth: 22, zones: [
    { id: 'z1', kind: 'bunker', from: 50, to: 62, side: 'right' },
    { id: 'z2', kind: 'bunker', from: 58, to: 69, side: 'left' },
  ] },
  'the-swing:8': { length: 71, fairwayFrom: 0, fairwayTo: 0, greenDepth: 22, zones: [
    { id: 'z1', kind: 'bunker', from: 54, to: 66, side: 'cross' },
    { id: 'z2', kind: 'bunker', from: 62, to: 71, side: 'right' },
  ] },
  'the-swing:9': { length: 64, fairwayFrom: 0, fairwayTo: 0, greenDepth: 22, zones: [] },
  'the-swing:10': { length: 76, fairwayFrom: 0, fairwayTo: 0, greenDepth: 24, zones: [
    { id: 'z1', kind: 'bunker', from: 58, to: 70, side: 'left' },
    { id: 'z2', kind: 'bunker', from: 64, to: 76, side: 'right' },
  ] },

  // ---------------------------------------------------------------------
  // Carnoustie — Championship. Imported from OSM (see COURSE_GEO in
  // scripts/import-osm.ts). White-tee scorecard verified against courses.ts
  // (par/HCP/yardage all match) before import; QA'd hole-by-hole against
  // ProVisualizer satellite imagery.
  //
  // The burns are hand-laid: the importer only ingests `natural=water`
  // polygons and coastline, but Carnoustie's burns are OSM `waterway=stream`
  // LINESTRINGS, invisible to it. Their zones below were computed by
  // intersecting the tagged Barry Burn / Jockie's Burn ways with each hole's
  // centreline (same arc-length yardstick as the importer, scaled to the
  // card where the hole is), then verified against imagery. Crossings a few
  // dozen yards off the tee that no real swing faces (holes 1, 2, 6, 11,
  // 18's tee-front) are deliberately omitted — the tpc-sawgrass:2 precedent.
  // ---------------------------------------------------------------------
  // hole 1 — Cup — scorecard 401 yd (OSM centreline 379 yd, zones scaled to card)
  'carnoustie:1': {
    length: 401,
    fairwayFrom: 141,
    fairwayTo: 388,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 265, to: 275, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 347, to: 360, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 385, to: 394, side: 'right' },
    ],
  },
  // hole 2 — Gulley — scorecard 435 yd (OSM centreline 405 yd, zones scaled to card)
  'carnoustie:2': {
    length: 435,
    fairwayFrom: 153,
    fairwayTo: 418,
    greenDepth: 28,
    zones: [
      { id: 'z1', kind: 'bunker', from: 165, to: 174, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 217, to: 221, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 221, to: 228, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 228, to: 232, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 361, to: 380, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 391, to: 397, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 404, to: 410, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 427, to: 434, side: 'left' },
    ],
  },
  // hole 3 — Jockie's Burn — bunkers down the left; z4 + z5 are hand fixes:
  // the greenside sand the raster dropped (visible short-left of the green
  // in imagery; card flags 'sand'), and the hole's namesake burn hugging the
  // green front (waterway crossing computed at 317 yd — the pitch must carry
  // it, exactly the shot the hole is famous for)
  'carnoustie:3': {
    length: 344,
    fairwayFrom: 120,
    fairwayTo: 330,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'bunker', from: 46, to: 60, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 210, to: 214, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 234, to: 248, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 302, to: 314, side: 'left' },
      { id: 'z5', kind: 'water', from: 314, to: 321, side: 'cross' },
    ],
  },
  // hole 4 — Hillocks — scorecard 375 yd (OSM centreline 405 yd, zones scaled
  // to card); z3 is a hand fix: the burn/ditch left of the driving zone
  // (visible as open water in imagery, and the card's 'water' flag) runs as a
  // `waterway` linestring the importer can't see — laid from its OSM way,
  // scaled 164–275 raw → 152–255
  'carnoustie:4': {
    length: 375,
    fairwayFrom: 131,
    fairwayTo: 364,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 6, to: 9, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 30, to: 39, side: 'right' },
      { id: 'z3', kind: 'water', from: 152, to: 255, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 176, to: 181, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 211, to: 219, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 244, to: 248, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 304, to: 309, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 343, to: 348, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 361, to: 365, side: 'right' },
    ],
  },
  // hole 5 — Brae — bunkers flank the corridor, greenside sand left; z4 is a
  // hand fix: Jockie's Burn cuts across the approach (waterway crossing
  // computed at 272 yd, the dark band visible mid-approach in imagery) —
  // going for it in two brings the burn into play
  'carnoustie:5': {
    length: 379,
    fairwayFrom: 133,
    fairwayTo: 367,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 90, to: 96, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 206, to: 220, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 224, to: 232, side: 'right' },
      { id: 'z4', kind: 'water', from: 269, to: 276, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 318, to: 326, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 350, to: 356, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 368, to: 379, side: 'left' },
    ],
  },
  // hole 6 — Hogan's Alley — scorecard 520 yd (OSM centreline 573 yd, zones scaled to card)
  'carnoustie:6': {
    length: 520,
    fairwayFrom: 182,
    fairwayTo: 509,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 20, to: 33, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 82, to: 85, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 223, to: 245, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 269, to: 281, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 495, to: 499, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 514, to: 519, side: 'right' },
    ],
  },
  // hole 7 — Plantation — bunkers both sides, greenside sand right
  'carnoustie:7': {
    length: 400,
    fairwayFrom: 140,
    fairwayTo: 388,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 2, to: 6, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 32, to: 50, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 202, to: 210, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 254, to: 264, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 360, to: 368, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 382, to: 386, side: 'right' },
    ],
  },
  // hole 8 — Short — scorecard 167 yd (OSM centreline 155 yd, zones scaled to card)
  'carnoustie:8': {
    length: 167,
    fairwayFrom: 58,
    fairwayTo: 154,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 151, to: 162, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 162, to: 166, side: 'left' },
    ],
  },
  // hole 9 — Railway — scorecard 416 yd (OSM centreline 465 yd, zones scaled to card)
  'carnoustie:9': {
    length: 416,
    fairwayFrom: 146,
    fairwayTo: 404,
    greenDepth: 22,
    zones: [
      { id: 'z1', kind: 'bunker', from: 7, to: 16, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 227, to: 233, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 378, to: 383, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 394, to: 399, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 408, to: 415, side: 'left' },
    ],
  },
  // hole 10 — South America — bunkers right and left through the corridor;
  // z4 is a hand fix: the Barry Burn crosses just short of the green
  // (waterway crossing computed at 385 yd) — the long approach must carry it
  'carnoustie:10': {
    length: 443,
    fairwayFrom: 155,
    fairwayTo: 431,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 206, to: 230, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 252, to: 262, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 274, to: 284, side: 'left' },
      { id: 'z4', kind: 'water', from: 382, to: 390, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 420, to: 426, side: 'left' },
    ],
  },
  // hole 11 — John Philp — z4 + z5 are hand fixes: the greenside pair the
  // raster dropped (sand visible flanking the green front in imagery; card
  // flags 'sand'). The import also painted a right-side bunker at 226–236
  // that sits 35 yd off the centreline in OSM — outwith the corridor a
  // pushed shot actually samples (its neighbours kept below are 14–15 yd
  // off) — removed as over-painting; with it, safe layups read dishonestly
  // sandy. z4 is the gorse bank flanking the long-left of the drive, plainly
  // visible in imagery but absent from OSM (no natural=scrub polygons here
  // at all — same source gap as harbour-town:18's trees): bombing driver
  // flirts with the whins, the shorter safe line stays out of them. The
  // Barry Burn's crossing here is a 59-yd tee-front carry no real swing
  // faces — omitted per the block note above
  'carnoustie:11': {
    length: 368,
    fairwayFrom: 129,
    fairwayTo: 356,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 52, to: 56, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 218, to: 222, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 248, to: 260, side: 'left' },
      { id: 'z4', kind: 'deeprough', from: 265, to: 330, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 338, to: 350, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 342, to: 354, side: 'right' },
    ],
  },
  // hole 12 — Southward Ho — bunkers off the tee and at the turn; z1 is a
  // hand fix: the burn channel runs tight down the right of the tee shot
  // (waterway parallel ~10 yd off the line for the first 199 yd, revetted
  // walls visible in imagery — the card's 'water' flag)
  'carnoustie:12': {
    length: 489,
    fairwayFrom: 171,
    fairwayTo: 477,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 40, to: 198, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 40, to: 52, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 62, to: 78, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 114, to: 122, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 160, to: 164, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 270, to: 284, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 442, to: 452, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 456, to: 464, side: 'left' },
    ],
  },
  // hole 13 — Whins — scorecard 161 yd (OSM centreline 148 yd, zones scaled to card)
  'carnoustie:13': {
    length: 161,
    fairwayFrom: 57,
    fairwayTo: 148,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 4, to: 11, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 126, to: 135, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 157, to: 161, side: 'cross' },
    ],
  },
  // hole 14 — Spectacles — scorecard 476 yd (OSM centreline 509 yd, zones
  // scaled to card); QA: 10 zones, the most of any hole here — worth a
  // closer look against imagery
  'carnoustie:14': {
    length: 476,
    fairwayFrom: 166,
    fairwayTo: 464,
    greenDepth: 22,
    zones: [
      { id: 'z1', kind: 'bunker', from: 2, to: 7, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 56, to: 64, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 75, to: 84, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 232, to: 247, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 251, to: 256, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 271, to: 281, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 395, to: 400, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 402, to: 410, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 438, to: 441, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 449, to: 456, side: 'right' },
    ],
  },
  // hole 15 — Lucky Slap — bunkers right through the middle, one greenside left
  'carnoustie:15': {
    length: 459,
    fairwayFrom: 161,
    fairwayTo: 447,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 78, to: 86, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 228, to: 234, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 262, to: 268, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 404, to: 414, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 428, to: 434, side: 'left' },
    ],
  },
  // hole 16 — Barry Burn — QA: only 3 bunkers came through for a hole the
  // card calls heavily bunkered, and (per the block note above) the burn
  // that gives the hole its name never shows up as a hazard at all
  'carnoustie:16': {
    length: 235,
    fairwayFrom: 82,
    fairwayTo: 221,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'bunker', from: 190, to: 194, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 204, to: 208, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 210, to: 216, side: 'right' },
    ],
  },
  // hole 17 — Island — scorecard 433 yd (OSM centreline 456 yd, zones scaled
  // to card). The Barry Burn's double loop is hand-laid from its waterway
  // (crossings computed at 96/135/165/259 yd): z3/z4 are the near loop whose
  // second arm guards the island fairway — so fairwayFrom moves 152 → 170,
  // the fairway genuinely starts past the burn, keeping the carry honest —
  // z6 is the far arm drives can run into, and z5 is the burn wrapping the
  // island's right edge. The 96-yd tee-front crossing is omitted per the
  // block note above. z1/z2 looked like the README's phantom-cross artifact
  // but imagery confirms the sandy waste really does spread across the line
  // short of the burn — kept as imported.
  'carnoustie:17': {
    length: 433,
    fairwayFrom: 170,
    fairwayTo: 422,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 47, to: 78, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 78, to: 84, side: 'cross' },
      { id: 'z3', kind: 'water', from: 131, to: 139, side: 'cross' },
      { id: 'z4', kind: 'water', from: 161, to: 169, side: 'cross' },
      { id: 'z5', kind: 'water', from: 213, to: 343, side: 'right' },
      { id: 'z6', kind: 'water', from: 255, to: 263, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 273, to: 281, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 380, to: 387, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 393, to: 405, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 414, to: 420, side: 'right' },
    ],
  },
  // hole 18 — Home — scorecard 444 yd (OSM centreline 486 yd, zones scaled
  // to card). The Barry Burn is hand-laid from its waterway (crossings
  // computed at 19/171/407 yd): z1 is the burn hugging the right of the
  // tee-shot corridor, z2 the mid-fairway crossing — fairwayFrom moves
  // 155 → 176 so the fairway starts past it and the carry stays honest —
  // and z4 the famous green-front crossing (~13 yd short of the putting
  // surface) where Opens slip away. The 19-yd tee-front crossing is omitted
  // per the block note above.
  'carnoustie:18': {
    length: 444,
    fairwayFrom: 176,
    fairwayTo: 431,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'water', from: 30, to: 243, side: 'right' },
      { id: 'z2', kind: 'water', from: 166, to: 176, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 265, to: 301, side: 'right' },
      { id: 'z4', kind: 'water', from: 403, to: 411, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 424, to: 428, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 429, to: 444, side: 'right' },
    ],
  },

  // ---------------------------------------------------------------------
  // Royal Portrush — Dunluce Links. OSM for shape, the club's Open
  // Championship card for distance (par 71, 7,344 yd).
  //
  // TEE-END SHIFT, not scale: every OSM centreline starts at a members' tee
  // pad short of the Open tee, so the missing yardage is entirely at the tee
  // end — zones are SHIFTED by (card - import), never stretched. Verified on
  // 14, where the import ran 67 yd short: shifting predicts sand at 253 R /
  // 333 L and the imagery shows ~246 / ~330; scaling predicted 217 / 310 and
  // is plainly wrong. Greenside features stay greenside under a shift.
  //
  // Hand deviations from the raw import, each read off ProVisualizer's 2D
  // planner (see scripts/README.md step 4). OSM has Portrush's fairway sand
  // but drops most green complexes:
  //   3   — greenside bunker front-left added; import returned zero zones.
  //   13  — Feathered Bed's ring of six added (front-cross + both flanks);
  //         import returned only phantom cross bunkers under the tee.
  //   16  — Calamity Corner: the 2-yd greenside "bunker" was a green-edge
  //         artifact (the green has no sand) and is dropped; the ravine down
  //         the right — the hole's entire defense — is hand-laid as
  //         deeprough. Locke's Hollow LEFT is a bail-out, so it stays clean.
  //   17  — two greenside bunkers added; import had none.
  //   4/10/13/17 — sand beside the tee (inside 75 yd) dropped; nothing is in
  //         play there and two of them imported as `cross` bands under the
  //         tee, the phantom-cross artifact.
  //
  // NOT modelled as zones: gorse and dune rough. OSM has no scrub polygons
  // here (checked `natural=scrub|heath`, `golf=rough`: one grassland way and
  // nothing else), and inventing 18 holes of gorse extents would be authoring
  // the course rather than importing it (step 0). It is carried instead as
  // `rough: 'penal'` on the course — a severity dial that needs no geometry.
  // See the `Rough` note in types.ts. The Atlantic is likewise
  // absent on purpose — it sits ~52 yd THROUGH the 5th green and beside the
  // 6th tee, never lateral, and the 1-D model has no honest way to say
  // "long is dead". Both are documented gaps, not oversights.
  // ---------------------------------------------------------------------
  'royal-portrush-dunluce:1': {
    length: 421,
    fairwayFrom: 154,
    fairwayTo: 409,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 274, to: 280, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 300, to: 308, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 386, to: 392, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 412, to: 416, side: 'left' },
    ],
  },
  'royal-portrush-dunluce:2': {
    length: 574,
    fairwayFrom: 209,
    fairwayTo: 561,
    greenDepth: 22,
    zones: [
      { id: 'z1', kind: 'bunker', from: 250, to: 258, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 268, to: 288, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 314, to: 322, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 458, to: 466, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 476, to: 484, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 546, to: 552, side: 'right' },
    ],
  },
  'royal-portrush-dunluce:3': {
    length: 177,
    fairwayFrom: 65,
    fairwayTo: 165,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 144, to: 154, side: 'left' },
    ],
  },
  'royal-portrush-dunluce:4': {
    length: 482,
    fairwayFrom: 171,
    fairwayTo: 470,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 250, to: 256, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 278, to: 284, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 354, to: 358, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 360, to: 364, side: 'left' },
    ],
  },
  'royal-portrush-dunluce:5': {
    length: 374,
    fairwayFrom: 132,
    fairwayTo: 357,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'bunker', from: 324, to: 328, side: 'right' },
    ],
  },
  'royal-portrush-dunluce:6': {
    length: 194,
    fairwayFrom: 76,
    fairwayTo: 182,
    greenDepth: 20,
    zones: [],
  },
  'royal-portrush-dunluce:7': {
    length: 592,
    fairwayFrom: 212,
    fairwayTo: 580,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 265, to: 281, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 315, to: 321, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 517, to: 523, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 555, to: 559, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 579, to: 583, side: 'right' },
    ],
  },
  'royal-portrush-dunluce:8': {
    length: 434,
    fairwayFrom: 156,
    fairwayTo: 422,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 269, to: 277, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 305, to: 311, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 419, to: 425, side: 'right' },
    ],
  },
  'royal-portrush-dunluce:9': {
    length: 432,
    fairwayFrom: 154,
    fairwayTo: 418,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'bunker', from: 246, to: 252, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 300, to: 306, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 376, to: 380, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 382, to: 386, side: 'left' },
    ],
  },
  'royal-portrush-dunluce:10': {
    length: 447,
    fairwayFrom: 157,
    fairwayTo: 434,
    greenDepth: 22,
    zones: [],
  },
  'royal-portrush-dunluce:11': {
    length: 474,
    fairwayFrom: 178,
    fairwayTo: 462,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 463, to: 471, side: 'left' },
    ],
  },
  'royal-portrush-dunluce:12': {
    length: 532,
    fairwayFrom: 188,
    fairwayTo: 520,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 244, to: 254, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 288, to: 294, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 318, to: 324, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 440, to: 448, side: 'left' },
    ],
  },
  'royal-portrush-dunluce:13': {
    length: 194,
    fairwayFrom: 72,
    fairwayTo: 182,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 163, to: 172, side: 'cross' },
      { id: 'z2', kind: 'bunker', from: 176, to: 192, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 178, to: 192, side: 'right' },
    ],
  },
  'royal-portrush-dunluce:14': {
    length: 473,
    fairwayFrom: 209,
    fairwayTo: 461,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 253, to: 259, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 313, to: 321, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 333, to: 341, side: 'left' },
    ],
  },
  'royal-portrush-dunluce:15': {
    length: 426,
    fairwayFrom: 157,
    fairwayTo: 414,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 258, to: 264, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 296, to: 300, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 398, to: 402, side: 'left' },
    ],
  },
  'royal-portrush-dunluce:16': {
    length: 236,
    fairwayFrom: 93,
    fairwayTo: 224,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'deeprough', from: 70, to: 215, side: 'right' },
    ],
  },
  'royal-portrush-dunluce:17': {
    length: 408,
    fairwayFrom: 146,
    fairwayTo: 396,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 388, to: 400, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 396, to: 406, side: 'right' },
    ],
  },
  'royal-portrush-dunluce:18': {
    length: 474,
    fairwayFrom: 178,
    fairwayTo: 462,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 297, to: 307, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 399, to: 403, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 405, to: 409, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 445, to: 453, side: 'right' },
    ],
  },

  // ---------------------------------------------------------------------
  // Oakmont Country Club. OSM for shape, the club's Championship card for
  // distance (par 70, 7,427 yd). Tee-end SHIFT, not scale — see the Royal
  // Portrush block above and freeze-process step 1. Note the shift is signed
  // here: 1, 8 and 9 import LONGER than the card and shift backwards.
  //
  // Oakmont is exceptionally well mapped (357 OSM features, ~180 bunkers), so
  // unlike Portrush almost nothing needed hand-authoring. The QA pass was
  // mostly about the phantom-cross artifact, which this course triggers hard:
  // fairways threading between bunker complexes make the lateral rake read a
  // flank as a full-width carry.
  //
  // Deviations from the raw import, all applied by rule and spot-checked
  // against ProVisualizer's 2D planner:
  //   - 15 `cross` bands that OVERLAP a same-yardage left/right zone were
  //     converted to that flank. The signature is the documented one, and the
  //     Church Pews prove it: the same physical complex sits between 3 and 4,
  //     and the test independently reads it `left` on 3 and `right` on 4 —
  //     which is exactly the real geography, and matches the imagery. A
  //     54-yd and a 56-yd "carry" were the two halves of one bunker you
  //     play ALONGSIDE, never over.
  //   - 2 `cross` bands overlapping BOTH flanks (13, 14) were dropped: the
  //     centreline threads between two complexes the flank zones already
  //     model, and Oakmont has essentially no forced carries — it is a ground
  //     game course, so inventing one would be the dishonest direction.
  //   - 23 `cross` bands with no flanking zone were KEPT as real carries.
  //   - 12 zones inside 75 yd of the tee dropped (tee-complex sand).
  //   - hole 17 came back with a single zone; the drivable par 4's big left
  //     complex (~218-273) and its greenside sand are hand-laid from imagery.
  //
  // Rough is NOT modelled here: Oakmont's hay is uniform, not patches, and
  // rides as `rough: 'severe'` on the course. See the `Rough` note in types.ts.
  // ---------------------------------------------------------------------
  'oakmont:1': {
    length: 482,
    fairwayFrom: 164,
    fairwayTo: 468,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'bunker', from: 66, to: 98, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 120, to: 166, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 246, to: 252, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 254, to: 260, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 274, to: 282, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 284, to: 290, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 294, to: 300, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 302, to: 310, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 312, to: 340, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 448, to: 464, side: 'left' },
    ],
  },
  'oakmont:2': {
    length: 346,
    fairwayFrom: 123,
    fairwayTo: 334,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 193, to: 261, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 295, to: 303, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 325, to: 343, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 343, to: 346, side: 'right' },
    ],
  },
  'oakmont:3': {
    length: 467,
    fairwayFrom: 183,
    fairwayTo: 452,
    greenDepth: 26,
    zones: [
      // The Church Pews — the ladder of sand up the left, and the hole's
      // signature line names it, so it draws as the real thing (see ZoneStyle).
      { id: 'z1', kind: 'bunker', from: 220, to: 324, side: 'left', style: 'pews' },
      { id: 'z2', kind: 'bunker', from: 334, to: 346, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 414, to: 452, side: 'right' },
    ],
  },
  'oakmont:4': {
    length: 612,
    fairwayFrom: 234,
    fairwayTo: 599,
    greenDepth: 22,
    zones: [
      { id: 'z1', kind: 'bunker', from: 149, to: 153, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 163, to: 171, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 235, to: 267, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 267, to: 281, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 285, to: 305, side: 'left' },
      // The Church Pews again, seen from the 4th. LEFT here too, not right:
      // 3 and 4 run antiparallel with the Pews between them, so the same sand
      // is on the golfer's left from both tees. The importer had this zone as
      // a `cross` band and the flank-overlap rule converted it to `right`,
      // which imagery disproves — a reminder that the rule resolves the
      // artifact but not necessarily the side. Verified against ProVisualizer.
      { id: 'z6', kind: 'bunker', from: 305, to: 363, side: 'left', style: 'pews' },
      { id: 'z7', kind: 'bunker', from: 373, to: 421, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 519, to: 531, side: 'cross' },
      { id: 'z9', kind: 'bunker', from: 531, to: 551, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 561, to: 595, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 595, to: 612, side: 'left' },
    ],
  },
  'oakmont:5': {
    length: 410,
    fairwayFrom: 160,
    fairwayTo: 398,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 91, to: 123, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 135, to: 165, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 249, to: 285, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 263, to: 267, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 287, to: 309, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 331, to: 339, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 353, to: 361, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 391, to: 395, side: 'cross' },
      { id: 'z9', kind: 'bunker', from: 395, to: 410, side: 'right' },
    ],
  },
  'oakmont:6': {
    length: 203,
    fairwayFrom: 72,
    fairwayTo: 191,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 76, to: 84, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 166, to: 176, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 176, to: 196, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 196, to: 200, side: 'right' },
    ],
  },
  'oakmont:7': {
    length: 487,
    fairwayFrom: 176,
    fairwayTo: 473,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'trees', from: 13, to: 223, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 167, to: 187, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 315, to: 353, side: 'right' },
      { id: 'z4', kind: 'trees', from: 463, to: 487, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 465, to: 479, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 479, to: 487, side: 'left' },
    ],
  },
  'oakmont:8': {
    length: 293,
    fairwayFrom: 101,
    fairwayTo: 281,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 41, to: 89, side: 'right' },
      { id: 'z2', kind: 'trees', from: 201, to: 229, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 211, to: 293, side: 'left' },
    ],
  },
  'oakmont:9': {
    length: 471,
    fairwayFrom: 160,
    fairwayTo: 450,
    greenDepth: 38,
    zones: [
      { id: 'z1', kind: 'bunker', from: 170, to: 188, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 190, to: 196, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 218, to: 236, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 240, to: 248, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 258, to: 266, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 280, to: 290, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 332, to: 354, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 354, to: 364, side: 'cross' },
      { id: 'z9', kind: 'bunker', from: 366, to: 378, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 400, to: 418, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 418, to: 432, side: 'cross' },
      { id: 'z12', kind: 'bunker', from: 432, to: 444, side: 'right' },
    ],
  },
  'oakmont:10': {
    length: 460,
    fairwayFrom: 161,
    fairwayTo: 448,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 208, to: 222, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 226, to: 232, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 232, to: 242, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 242, to: 258, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 262, to: 268, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 268, to: 280, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 280, to: 286, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 296, to: 302, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 430, to: 436, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 436, to: 442, side: 'cross' },
      { id: 'z11', kind: 'bunker', from: 452, to: 460, side: 'right' },
    ],
  },
  'oakmont:11': {
    length: 398,
    fairwayFrom: 153,
    fairwayTo: 386,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 243, to: 295, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 363, to: 373, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 373, to: 381, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 383, to: 397, side: 'cross' },
    ],
  },
  'oakmont:12': {
    length: 663,
    fairwayFrom: 255,
    fairwayTo: 650,
    greenDepth: 22,
    zones: [
      { id: 'z1', kind: 'bunker', from: 114, to: 120, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 120, to: 134, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 136, to: 150, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 150, to: 166, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 166, to: 172, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 286, to: 290, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 290, to: 312, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 324, to: 328, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 328, to: 338, side: 'cross' },
      { id: 'z10', kind: 'bunker', from: 492, to: 544, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 524, to: 530, side: 'right' },
      { id: 'z12', kind: 'bunker', from: 544, to: 550, side: 'cross' },
      { id: 'z13', kind: 'bunker', from: 598, to: 606, side: 'left' },
      { id: 'z14', kind: 'bunker', from: 642, to: 658, side: 'cross' },
      { id: 'z15', kind: 'bunker', from: 658, to: 663, side: 'right' },
    ],
  },
  'oakmont:13': {
    length: 186,
    fairwayFrom: 70,
    fairwayTo: 174,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 99, to: 107, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 151, to: 155, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 161, to: 165, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 177, to: 183, side: 'right' },
    ],
  },
  'oakmont:14': {
    length: 381,
    fairwayFrom: 160,
    fairwayTo: 367,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'bunker', from: 189, to: 197, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 219, to: 239, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 239, to: 245, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 245, to: 251, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 265, to: 273, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 277, to: 291, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 297, to: 303, side: 'cross' },
      { id: 'z8', kind: 'bunker', from: 323, to: 329, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 329, to: 333, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 353, to: 363, side: 'cross' },
      { id: 'z11', kind: 'bunker', from: 363, to: 381, side: 'left' },
    ],
  },
  'oakmont:15': {
    length: 509,
    fairwayFrom: 192,
    fairwayTo: 495,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'bunker', from: 21, to: 77, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 93, to: 121, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 129, to: 133, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 143, to: 193, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 285, to: 299, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 341, to: 347, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 447, to: 509, side: 'right' },
    ],
  },
  'oakmont:16': {
    length: 237,
    fairwayFrom: 91,
    fairwayTo: 225,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 55, to: 85, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 193, to: 199, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 209, to: 225, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 229, to: 237, side: 'left' },
    ],
  },
  'oakmont:17': {
    length: 317,
    fairwayFrom: 114,
    fairwayTo: 305,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 218, to: 273, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 296, to: 317, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 303, to: 317, side: 'left' },
    ],
  },
  'oakmont:18': {
    length: 505,
    fairwayFrom: 188,
    fairwayTo: 493,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 55, to: 95, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 253, to: 283, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 297, to: 325, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 335, to: 343, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 407, to: 415, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 415, to: 421, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 421, to: 429, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 465, to: 471, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 471, to: 491, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 491, to: 503, side: 'left' },
    ],
  },

  // ---------------------------------------------------------------------
  // Cypress Point Club. OSM for shape, the club's published Blue card for
  // distance (par 72, 6,553 yd). Tee-end SHIFT, not scale — see the Royal
  // Portrush block above and freeze-process step 1. The shift is signed here:
  // 7, 11, 15 and 16 import LONGER than the card and shift backwards. Sixteen
  // of eighteen land within 12 yd of the card; only 8 (+27) and 17 (+23) are
  // real tee-pad gaps.
  //
  // Cypress is well mapped (292 OSM features, 107 bunkers, all 18 centrelines,
  // and a 366-node mainland coastline), so most of the QA pass was the two
  // documented artifact modes plus three hand fixes read off ProVisualizer's
  // 3D planner:
  //   1  — greenDepth 45 -> 20 and fairwayTo 392 -> 405. The centreline clips
  //        the practice putting green beside the 1st tee (way 1138134210 sits
  //        on the line 28-54 yd), so the importer's green span ran 28 -> 415
  //        and pinned the 45-yd ceiling. The real green is way 1138132397, on
  //        the line 399-415.
  //   16  — THE hole, and the straight import could not say what it is. Rebuilt
  //        as a bail-out dogleg — see the block on the entry itself, and
  //        `Bailout` in types.ts. (The raw import read `cross 28-102` then
  //        `right 102-202`: a 74-yd poke on a 232-yd par 3, because OSM's
  //        coastline is drawn at the high-water rock line and the reef across
  //        the cove came back as land.)
  //   17  — the +23 tee-end shift opened a clean 0-23 gap in front of a tee
  //        that sits on the cliff edge; the Pacific is down the right from the
  //        first yard, so the ocean zone is extended back to 0.
  // Applied by rule, in the house style: 11 zones wholly inside 75 yd of the
  // tee dropped (tee-complex sand; ocean is exempt, on 15/16/17 the Pacific
  // starts at the tee and IS the hole), 7 `cross` bands overlapping a
  // same-yardage flank folded into that flank, and 2 overlapping BOTH flanks
  // dropped.
  //
  // One rule is new here, and it is the Oakmont cross rule pointed at the green
  // instead of the fairway: a `cross` band that runs INTO the green (3, 10, 11,
  // 13) is a greenside bunker ring rasterised as a full-width carry. You cannot
  // carry the green you are trying to hit, and every other course in this file
  // models greenside sand as flanks. Where one flank adjoins, the band folds
  // into it (3 and 11 right, 13 left); where both do, the ring is already
  // modelled and the overlap is dropped (10). Left as `cross`, the four of them
  // together cost the greedy-by-Q calibration ~0.02 strokes a round — the odds
  // invariants' quieter cousin catching the same class of lie.
  //
  // NOT modelled as zones: the Monterey cypress groves beyond the two `trees`
  // polygons OSM actually carries (1, 14). Inventing tree extents for the
  // inland holes would be authoring the course rather than importing it
  // (step 0). The dunes and ice plant are likewise absent — ice plant is a
  // strong candidate for the `rough: 'penal'` dial that Portrush carries for
  // its gorse (see the `Rough` note in types.ts), but that is a difficulty
  // decision, not an import, so it is left unset and flagged here rather than
  // slipped in with the geometry.
  // ---------------------------------------------------------------------
  'cypress-point:1': {
    length: 417,
    fairwayFrom: 147,
    fairwayTo: 405,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 265, to: 311, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 359, to: 381, side: 'left' },
      { id: 'z3', kind: 'trees', from: 369, to: 417, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 381, to: 387, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 387, to: 399, side: 'right' },
    ],
  },
  'cypress-point:2': {
    length: 555,
    fairwayFrom: 196,
    fairwayTo: 543,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 391, to: 405, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 405, to: 421, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 421, to: 425, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 509, to: 555, side: 'left' },
    ],
  },
  'cypress-point:3': {
    length: 156,
    fairwayFrom: 55,
    fairwayTo: 144,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 90, to: 98, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 98, to: 108, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 120, to: 152, side: 'right' },
    ],
  },
  'cypress-point:4': {
    length: 390,
    fairwayFrom: 137,
    fairwayTo: 378,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 154, to: 160, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 160, to: 210, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 280, to: 306, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 350, to: 358, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 358, to: 370, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 370, to: 378, side: 'left' },
    ],
  },
  'cypress-point:5': {
    length: 487,
    fairwayFrom: 176,
    fairwayTo: 475,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 167, to: 191, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 241, to: 249, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 249, to: 271, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 325, to: 361, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 421, to: 459, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 469, to: 477, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 477, to: 487, side: 'left' },
    ],
  },
  'cypress-point:6': {
    length: 523,
    fairwayFrom: 184,
    fairwayTo: 511,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 66, to: 78, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 170, to: 214, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 316, to: 350, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 426, to: 456, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 456, to: 462, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 462, to: 474, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 504, to: 523, side: 'left' },
    ],
  },
  'cypress-point:7': {
    length: 170,
    fairwayFrom: 56,
    fairwayTo: 158,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 117, to: 125, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 125, to: 133, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 133, to: 165, side: 'right' },
    ],
  },
  'cypress-point:8': {
    length: 356,
    fairwayFrom: 142,
    fairwayTo: 344,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 311, to: 353, side: 'left' },
    ],
  },
  'cypress-point:9': {
    length: 292,
    fairwayFrom: 104,
    fairwayTo: 280,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 35, to: 79, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 251, to: 259, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 263, to: 285, side: 'left' },
    ],
  },
  'cypress-point:10': {
    length: 477,
    fairwayFrom: 167,
    fairwayTo: 465,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 68, to: 104, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 118, to: 152, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 272, to: 302, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 384, to: 414, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 450, to: 457, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 457, to: 474, side: 'right' },
    ],
  },
  'cypress-point:11': {
    length: 437,
    fairwayFrom: 145,
    fairwayTo: 425,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 86, to: 118, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 142, to: 172, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 280, to: 284, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 284, to: 312, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 312, to: 318, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 400, to: 436, side: 'right' },
    ],
  },
  'cypress-point:12': {
    length: 408,
    fairwayFrom: 151,
    fairwayTo: 396,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 78, to: 118, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 214, to: 224, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 226, to: 240, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 258, to: 264, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 356, to: 398, side: 'left' },
    ],
  },
  'cypress-point:13': {
    length: 388,
    fairwayFrom: 136,
    fairwayTo: 376,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 326, to: 346, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 356, to: 388, side: 'left' },
    ],
  },
  'cypress-point:14': {
    length: 394,
    fairwayFrom: 142,
    fairwayTo: 382,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 48, to: 78, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 136, to: 178, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 264, to: 288, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 312, to: 334, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 352, to: 366, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 366, to: 372, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 372, to: 392, side: 'left' },
      { id: 'z8', kind: 'trees', from: 380, to: 394, side: 'right' },
    ],
  },
  'cypress-point:15': {
    length: 137,
    fairwayFrom: 45,
    fairwayTo: 125,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'ocean', from: 0, to: 51, side: 'right' },
      { id: 'z2', kind: 'ocean', from: 51, to: 99, side: 'cross' },
      { id: 'z3', kind: 'ocean', from: 99, to: 137, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 103, to: 111, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 123, to: 127, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 131, to: 137, side: 'left' },
    ],
  },
  // The 16th is laid out along the line the hole is PLAYED, not the tee→pin
  // chord — it is a dogleg right round the cove, and the two lines cross very
  // different amounts of Pacific. Measured off the OSM coastline and the golf
  // polygons, straight-line from the tee to every playable point:
  //   • the near corner of the bail-out (left, ~110 yd out) — a 135-yd shot
  //     over ~106 yd of water
  //   • up the bail-out toward the corner (~180 yd out) — a 190-yd shot, still
  //     ~110 yd of water but far less room, because the cove bites in as you
  //     near the turn (lines that cut it carry 150-158)
  //   • the green — a 230-yd shot over ~192 yd of water, nearly all of it
  // So: the carry crosses the fairway completely off the tee, and past it the
  // cove runs down the INSIDE (right) of the dogleg all the way to the green.
  // That single fact is what prices the three options honestly — a lay-up
  // pushed further up overlaps more of it, and the shot at the flag is over it
  // the whole way. `bailout` names the two lay-up bands; see types.ts.
  'cypress-point:16': {
    length: 232,
    fairwayFrom: 106,
    fairwayTo: 210,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'ocean', from: 14, to: 106, side: 'cross' },
      { id: 'z2', kind: 'ocean', from: 106, to: 204, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 204, to: 213, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 213, to: 226, side: 'right' },
      { id: 'z5', kind: 'ocean', from: 224, to: 232, side: 'left' },
    ],
    bailout: { side: 'left', safe: [104, 138], normal: [150, 196] },
  },
  'cypress-point:17': {
    length: 391,
    fairwayFrom: 152,
    fairwayTo: 379,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'ocean', from: 0, to: 79, side: 'right' },
      { id: 'z2', kind: 'ocean', from: 79, to: 135, side: 'cross' },
      { id: 'z3', kind: 'ocean', from: 135, to: 391, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 283, to: 287, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 287, to: 295, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 305, to: 317, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 317, to: 323, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 357, to: 387, side: 'left' },
    ],
  },
  'cypress-point:18': {
    length: 343,
    fairwayFrom: 121,
    fairwayTo: 331,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 123, to: 129, side: 'cross' },
      { id: 'z2', kind: 'bunker', from: 129, to: 139, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 149, to: 165, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 205, to: 235, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 235, to: 239, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 239, to: 255, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 255, to: 279, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 307, to: 319, side: 'cross' },
      { id: 'z9', kind: 'bunker', from: 319, to: 329, side: 'left' },
    ],
  },

  // ---- Whistling Straits — Straits (Sheboygan, WI) ----
  // Pete Dye's lakefront links, imported from OSM way 205111637. Lengths are
  // the club's BLACK card via BlueGolf (`whistlingstraitsstra`): par 72,
  // 7790 yd, 77.2/152 — the only tee set BlueGolf publishes for the Straits.
  // OSM's centrelines are drawn from a middle tee (7441 yd all in), so every
  // hole is SHIFTED at the tee end by (card - import), never scaled, per the
  // freeze process. Tee pads in the data corroborate the shift: 12 has a pad
  // 28 yd back for a +29 gap, 16 one 23 yd back for +23, and 1 one 92 yd back
  // for its +85 — the largest shift in this map, and the reason 1's sand
  // starts at 87 yd rather than 2.
  //
  // The 1383 bunkers OSM maps here are not an artifact — this is the course
  // with "a thousand bunkers", and the zone counts (up to 29 on a hole) are
  // the hole honestly reported. Lake Michigan is tagged natural=water rather
  // than natural=coastline, so it imports as `water` and is KEPT that way:
  // `ocean` carries a heavier severity in the odds (1.1 vs 1.0), and a Great
  // Lake is not the sea. QA against the measured lake distance cleared 9 and
  // 18, whose cards flag water that never comes into play (9's lake starts
  // 80 yd right at the tee and recedes to 475; 18's sits beside the tee only,
  // 29 yd out and past 100 by the time a drive lands) — both are correct with
  // no water zones. 17 was the one real miss; see its note below.
  // hole 1 — Outward Bound
  'whistling-straits:1': {
    length: 493,
    fairwayFrom: 228,
    fairwayTo: 481,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 87, to: 95, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 111, to: 125, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 125, to: 135, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 151, to: 169, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 187, to: 191, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 191, to: 219, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 193, to: 209, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 219, to: 313, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 313, to: 323, side: 'cross' },
      { id: 'z10', kind: 'bunker', from: 323, to: 341, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 341, to: 347, side: 'cross' },
      { id: 'z12', kind: 'bunker', from: 347, to: 365, side: 'right' },
      { id: 'z13', kind: 'bunker', from: 365, to: 385, side: 'cross' },
      { id: 'z14', kind: 'bunker', from: 385, to: 409, side: 'left' },
      { id: 'z15', kind: 'bunker', from: 421, to: 435, side: 'right' },
      { id: 'z16', kind: 'bunker', from: 435, to: 483, side: 'left' },
      { id: 'z17', kind: 'bunker', from: 443, to: 457, side: 'cross' },
    ],
  },
  // hole 2 — Cross Country
  'whistling-straits:2': {
    length: 597,
    fairwayFrom: 214,
    fairwayTo: 585,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 11, to: 17, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 27, to: 55, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 59, to: 95, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 95, to: 173, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 97, to: 113, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 113, to: 151, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 133, to: 137, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 163, to: 171, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 173, to: 187, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 187, to: 233, side: 'cross' },
      { id: 'z11', kind: 'bunker', from: 233, to: 251, side: 'left' },
      { id: 'z12', kind: 'bunker', from: 251, to: 285, side: 'cross' },
      { id: 'z13', kind: 'bunker', from: 265, to: 273, side: 'left' },
      { id: 'z14', kind: 'bunker', from: 285, to: 297, side: 'left' },
      { id: 'z15', kind: 'bunker', from: 297, to: 325, side: 'cross' },
      { id: 'z16', kind: 'bunker', from: 313, to: 319, side: 'left' },
      { id: 'z17', kind: 'bunker', from: 325, to: 337, side: 'right' },
      { id: 'z18', kind: 'bunker', from: 375, to: 381, side: 'right' },
      { id: 'z19', kind: 'bunker', from: 401, to: 431, side: 'right' },
      { id: 'z20', kind: 'bunker', from: 455, to: 459, side: 'left' },
      { id: 'z21', kind: 'bunker', from: 461, to: 487, side: 'right' },
      { id: 'z22', kind: 'bunker', from: 477, to: 483, side: 'cross' },
      { id: 'z23', kind: 'bunker', from: 483, to: 523, side: 'left' },
      { id: 'z24', kind: 'bunker', from: 529, to: 545, side: 'right' },
      { id: 'z25', kind: 'bunker', from: 557, to: 571, side: 'right' },
      { id: 'z26', kind: 'bunker', from: 571, to: 575, side: 'left' },
      { id: 'z27', kind: 'bunker', from: 587, to: 591, side: 'left' },
      { id: 'z28', kind: 'bunker', from: 591, to: 597, side: 'right' },
      { id: 'z29', kind: 'bunker', from: 593, to: 597, side: 'cross' },
    ],
  },
  // hole 3 — O'Man
  'whistling-straits:3': {
    length: 188,
    fairwayFrom: 69,
    fairwayTo: 176,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 21, to: 27, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 53, to: 61, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 71, to: 75, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 95, to: 113, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 121, to: 131, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 133, to: 139, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 139, to: 147, side: 'cross' },
      { id: 'z8', kind: 'bunker', from: 155, to: 188, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 157, to: 177, side: 'cross' },
      { id: 'z10', kind: 'bunker', from: 169, to: 181, side: 'right' },
      { id: 'z11', kind: 'water', from: 173, to: 188, side: 'left' },
    ],
  },
  // hole 4 — Glory
  'whistling-straits:4': {
    length: 494,
    fairwayFrom: 182,
    fairwayTo: 482,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 14, to: 20, side: 'cross' },
      { id: 'z2', kind: 'water', from: 14, to: 46, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 50, to: 84, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 86, to: 96, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 110, to: 256, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 162, to: 168, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 262, to: 270, side: 'cross' },
      { id: 'z8', kind: 'bunker', from: 270, to: 308, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 278, to: 282, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 282, to: 294, side: 'cross' },
      { id: 'z11', kind: 'bunker', from: 308, to: 346, side: 'cross' },
      { id: 'z12', kind: 'bunker', from: 346, to: 354, side: 'left' },
      { id: 'z13', kind: 'bunker', from: 388, to: 396, side: 'right' },
      { id: 'z14', kind: 'bunker', from: 408, to: 492, side: 'left' },
      { id: 'z15', kind: 'bunker', from: 430, to: 436, side: 'cross' },
    ],
  },
  // hole 5 — Snake
  'whistling-straits:5': {
    length: 603,
    fairwayFrom: 244,
    fairwayTo: 591,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 63, to: 89, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 93, to: 151, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 159, to: 167, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 161, to: 171, side: 'cross' },
      { id: 'z5', kind: 'water', from: 161, to: 219, side: 'cross' },
      { id: 'z6', kind: 'water', from: 219, to: 375, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 249, to: 285, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 325, to: 347, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 347, to: 373, side: 'cross' },
      { id: 'z10', kind: 'bunker', from: 359, to: 363, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 373, to: 517, side: 'right' },
      { id: 'z12', kind: 'water', from: 399, to: 603, side: 'left' },
      { id: 'z13', kind: 'bunker', from: 557, to: 573, side: 'right' },
      { id: 'z14', kind: 'bunker', from: 583, to: 603, side: 'right' },
    ],
  },
  // hole 6 — Gremlin's Ear
  'whistling-straits:6': {
    length: 409,
    fairwayFrom: 152,
    fairwayTo: 397,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 16, to: 22, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 26, to: 42, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 42, to: 48, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 52, to: 118, side: 'cross' },
      { id: 'z5', kind: 'water', from: 92, to: 130, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 96, to: 104, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 120, to: 124, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 134, to: 148, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 148, to: 190, side: 'cross' },
      { id: 'z10', kind: 'bunker', from: 190, to: 266, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 202, to: 210, side: 'cross' },
      { id: 'z12', kind: 'bunker', from: 282, to: 338, side: 'right' },
      { id: 'z13', kind: 'bunker', from: 292, to: 296, side: 'left' },
      { id: 'z14', kind: 'bunker', from: 362, to: 398, side: 'right' },
      { id: 'z15', kind: 'bunker', from: 402, to: 406, side: 'left' },
    ],
  },
  // hole 7 — Shipwreck
  'whistling-straits:7': {
    length: 221,
    fairwayFrom: 77,
    fairwayTo: 209,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 221, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 47, to: 53, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 65, to: 81, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 93, to: 103, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 131, to: 165, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 167, to: 171, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 187, to: 191, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 191, to: 199, side: 'cross' },
      { id: 'z9', kind: 'bunker', from: 199, to: 221, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 213, to: 217, side: 'left' },
    ],
  },
  // hole 8 — On the Rocks
  'whistling-straits:8': {
    length: 506,
    fairwayFrom: 190,
    fairwayTo: 494,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 20, to: 102, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 20, to: 36, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 122, to: 130, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 130, to: 144, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 154, to: 164, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 172, to: 188, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 198, to: 222, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 224, to: 234, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 234, to: 238, side: 'cross' },
      { id: 'z10', kind: 'bunker', from: 238, to: 286, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 296, to: 304, side: 'right' },
      { id: 'z12', kind: 'bunker', from: 308, to: 344, side: 'left' },
      { id: 'z13', kind: 'bunker', from: 360, to: 384, side: 'left' },
      { id: 'z14', kind: 'bunker', from: 384, to: 388, side: 'cross' },
      { id: 'z15', kind: 'bunker', from: 426, to: 430, side: 'right' },
      { id: 'z16', kind: 'bunker', from: 432, to: 464, side: 'left' },
      { id: 'z17', kind: 'bunker', from: 460, to: 466, side: 'cross' },
      { id: 'z18', kind: 'bunker', from: 482, to: 506, side: 'right' },
    ],
  },
  // hole 9 — Down and Dirty
  'whistling-straits:9': {
    length: 442,
    fairwayFrom: 154,
    fairwayTo: 430,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 11, side: 'cross' },
      { id: 'z2', kind: 'bunker', from: 1, to: 5, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 11, to: 159, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 15, to: 19, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 137, to: 169, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 169, to: 173, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 187, to: 193, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 215, to: 267, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 259, to: 265, side: 'cross' },
      { id: 'z10', kind: 'bunker', from: 281, to: 309, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 313, to: 317, side: 'left' },
      { id: 'z12', kind: 'bunker', from: 329, to: 349, side: 'left' },
      { id: 'z13', kind: 'bunker', from: 365, to: 411, side: 'left' },
      { id: 'z14', kind: 'bunker', from: 413, to: 417, side: 'right' },
      { id: 'z15', kind: 'bunker', from: 423, to: 429, side: 'cross' },
      { id: 'z16', kind: 'bunker', from: 429, to: 442, side: 'left' },
    ],
  },
  // hole 10 — Voyageur
  'whistling-straits:10': {
    length: 391,
    fairwayFrom: 147,
    fairwayTo: 379,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 190, to: 196, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 238, to: 244, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 318, to: 332, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 368, to: 386, side: 'left' },
    ],
  },
  // hole 11 — Sand Box
  'whistling-straits:11': {
    length: 645,
    fairwayFrom: 239,
    fairwayTo: 633,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 30, to: 52, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 64, to: 76, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 102, to: 108, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 142, to: 162, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 186, to: 210, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 202, to: 212, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 230, to: 290, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 304, to: 352, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 356, to: 418, side: 'cross' },
      { id: 'z10', kind: 'bunker', from: 390, to: 398, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 412, to: 432, side: 'left' },
      { id: 'z12', kind: 'bunker', from: 432, to: 438, side: 'right' },
      { id: 'z13', kind: 'bunker', from: 452, to: 460, side: 'right' },
      { id: 'z14', kind: 'bunker', from: 462, to: 476, side: 'cross' },
      { id: 'z15', kind: 'bunker', from: 476, to: 516, side: 'right' },
      { id: 'z16', kind: 'bunker', from: 544, to: 548, side: 'right' },
      { id: 'z17', kind: 'bunker', from: 548, to: 616, side: 'cross' },
      { id: 'z18', kind: 'bunker', from: 574, to: 588, side: 'right' },
      { id: 'z19', kind: 'bunker', from: 620, to: 645, side: 'right' },
    ],
  },
  // hole 12 — Pop Up
  'whistling-straits:12': {
    length: 163,
    fairwayFrom: 76,
    fairwayTo: 151,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 29, to: 137, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 151, to: 157, side: 'right' },
    ],
  },
  // hole 13 — Cliff Hanger
  'whistling-straits:13': {
    length: 402,
    fairwayFrom: 148,
    fairwayTo: 390,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 11, to: 101, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 21, to: 25, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 45, to: 51, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 75, to: 79, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 105, to: 115, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 139, to: 149, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 171, to: 179, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 189, to: 391, side: 'right' },
      { id: 'z9', kind: 'water', from: 329, to: 402, side: 'right' },
    ],
  },
  // hole 14 — Widow's Watch
  'whistling-straits:14': {
    length: 396,
    fairwayFrom: 147,
    fairwayTo: 384,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 209, to: 213, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 281, to: 309, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 309, to: 325, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 315, to: 329, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 341, to: 345, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 345, to: 349, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 349, to: 367, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 369, to: 396, side: 'right' },
    ],
  },
  // hole 15 — Grand Strand
  'whistling-straits:15': {
    length: 503,
    fairwayFrom: 177,
    fairwayTo: 489,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'bunker', from: 4, to: 40, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 16, to: 22, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 40, to: 74, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 50, to: 60, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 76, to: 82, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 96, to: 102, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 104, to: 130, side: 'cross' },
      { id: 'z8', kind: 'bunker', from: 124, to: 154, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 156, to: 174, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 174, to: 242, side: 'cross' },
      { id: 'z11', kind: 'bunker', from: 184, to: 188, side: 'left' },
      { id: 'z12', kind: 'bunker', from: 204, to: 210, side: 'left' },
      { id: 'z13', kind: 'bunker', from: 214, to: 218, side: 'right' },
      { id: 'z14', kind: 'bunker', from: 226, to: 250, side: 'left' },
      { id: 'z15', kind: 'bunker', from: 250, to: 310, side: 'right' },
      { id: 'z16', kind: 'bunker', from: 298, to: 332, side: 'cross' },
      { id: 'z17', kind: 'bunker', from: 332, to: 338, side: 'left' },
      { id: 'z18', kind: 'bunker', from: 368, to: 386, side: 'left' },
      { id: 'z19', kind: 'bunker', from: 390, to: 394, side: 'cross' },
      { id: 'z20', kind: 'bunker', from: 422, to: 464, side: 'left' },
      { id: 'z21', kind: 'bunker', from: 438, to: 444, side: 'cross' },
      { id: 'z22', kind: 'bunker', from: 454, to: 496, side: 'cross' },
      { id: 'z23', kind: 'bunker', from: 464, to: 472, side: 'right' },
      { id: 'z24', kind: 'bunker', from: 484, to: 498, side: 'right' },
    ],
  },
  // hole 16 — Endless Bite
  'whistling-straits:16': {
    length: 568,
    fairwayFrom: 214,
    fairwayTo: 556,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 23, to: 65, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 113, to: 137, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 161, to: 169, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 169, to: 189, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 189, to: 255, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 249, to: 275, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 257, to: 263, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 267, to: 281, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 295, to: 301, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 307, to: 317, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 319, to: 323, side: 'left' },
      { id: 'z12', kind: 'bunker', from: 323, to: 369, side: 'cross' },
      { id: 'z13', kind: 'bunker', from: 341, to: 345, side: 'right' },
      { id: 'z14', kind: 'bunker', from: 355, to: 399, side: 'right' },
      { id: 'z15', kind: 'bunker', from: 381, to: 389, side: 'cross' },
      { id: 'z16', kind: 'bunker', from: 401, to: 411, side: 'left' },
      { id: 'z17', kind: 'bunker', from: 441, to: 449, side: 'left' },
      { id: 'z18', kind: 'bunker', from: 467, to: 473, side: 'left' },
      { id: 'z19', kind: 'bunker', from: 485, to: 497, side: 'left' },
      { id: 'z20', kind: 'bunker', from: 501, to: 521, side: 'right' },
      { id: 'z21', kind: 'bunker', from: 503, to: 509, side: 'cross' },
      { id: 'z22', kind: 'bunker', from: 523, to: 541, side: 'left' },
      { id: 'z23', kind: 'bunker', from: 541, to: 547, side: 'right' },
      { id: 'z24', kind: 'bunker', from: 547, to: 551, side: 'cross' },
      { id: 'z25', kind: 'bunker', from: 551, to: 561, side: 'left' },
    ],
  },
  // hole 17 — Pinched Nerve — z6 is a hand fix. The card and the hole's own
  // copy call this a par 3 played along the water, but the raw import found
  // NO water at all: Lake Michigan is natural=water here, so it only gets the
  // importer's 50-yd corridor (the coastline half-plane with its 160-yd reach
  // is what carries the sea at Pebble/Portrush/Cypress). Measured off the
  // centreline, the lake runs down the left the whole way and tightens
  // steadily — 91 yd out at the tee, 60 by 160 yd, 47 at the green — so it
  // clears the corridor until the last few yards and merged away to nothing.
  // z6 restores it over the stretch it sits within ~60 yd, which is the part
  // a pulled tee shot on a 249-yd par 3 can actually reach; the tee-end half,
  // 70-91 yd off the line, is deliberately left out rather than painting the
  // lake tight to a hole it does not really squeeze until the green.
  'whistling-straits:17': {
    length: 249,
    fairwayFrom: 90,
    fairwayTo: 237,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 24, to: 30, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 46, to: 70, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 112, to: 124, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 148, to: 162, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 150, to: 182, side: 'cross' },
      { id: 'z6', kind: 'water', from: 160, to: 249, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 172, to: 214, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 214, to: 232, side: 'cross' },
      { id: 'z9', kind: 'bunker', from: 216, to: 240, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 242, to: 246, side: 'cross' },
      { id: 'z11', kind: 'bunker', from: 246, to: 249, side: 'left' },
    ],
  },
  // hole 18 — Dyeabolical
  'whistling-straits:18': {
    length: 520,
    fairwayFrom: 206,
    fairwayTo: 508,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 109, to: 151, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 233, to: 355, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 245, to: 249, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 261, to: 269, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 293, to: 301, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 315, to: 323, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 363, to: 377, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 389, to: 393, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 473, to: 477, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 499, to: 509, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 503, to: 520, side: 'cross' },
      { id: 'z12', kind: 'bunker', from: 513, to: 519, side: 'left' },
    ],
  },

  // ---------------------------------------------------------------------
  // TPC Potomac at Avenel Farm (OSM relation 357652 — note OSM misspells it
  // "Avanel Farm"). Card: the club's GOLD tees, par 70, 7139 yd, 75.5/146.
  // The shipped tuple already matched the card on par AND stroke index for
  // all 18, so nothing there needed correcting; only hole 17's yardage was
  // stale (190 vs the card's 222) and that auto-reconciles off `length`.
  // OSM tags hole 15 par=5 — the card says par 4 (490 yd, HCP 4) and the
  // card wins; OSM is ground truth for shape only.
  //
  // Every hole was shifted (never scaled) so `length` equals the card, per
  // the freeze process; shifts were -13..+8 except hole 17 at +24, whose
  // centreline is drawn from a pad ~24 yd ahead of the GOLD tee. All 18
  // centrelines were verified to start on a `golf=tee` polygon and end on a
  // `golf=green`, so no hole is drawn to the wrong pad.
  //
  // The property drains through a handful of very large water polygons (the
  // biggest, way/743755556, is ~4 acres) shared between holes, which drives
  // two of the artifact modes below.
  // ---------------------------------------------------------------------

  // hole 1 — z7/z8 are a hand fix. The raw import split the greenside sand
  // into right + `cross` + left, but OSM has exactly two bunkers here
  // (way/743682561 right, way/743682562 left) that merely overlap in the
  // sampling corridor. The phantom `cross` ran from 421 into a green that
  // starts at 420 — you cannot carry the green you are aiming at — so it is
  // dropped and the two flanks restored to their real spans. The water at
  // 59-109 is genuinely there (a creek in front of the first tee, centreline
  // in it at 79-81) but dies 43 yd short of `fairwayFrom`, so it is left as
  // imported rather than dressed up as a carry anyone faces.
  'tpc-potomac:1': {
    length: 440,
    fairwayFrom: 152,
    fairwayTo: 428,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 9, to: 15, side: 'left' },
      { id: 'z2', kind: 'water', from: 59, to: 71, side: 'left' },
      { id: 'z3', kind: 'water', from: 71, to: 109, side: 'right' },
      { id: 'z4', kind: 'water', from: 73, to: 81, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 277, to: 295, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 311, to: 327, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 415, to: 428, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 421, to: 437, side: 'left' },
    ],
  },
  // hole 2 — par 5. Two phantom `cross` bands dropped (577-595 and 605-609,
  // the latter inside a green that starts at 599). OSM has three bunkers in
  // the green complex: way/743682574 right, way/743682575 running 574-608 at
  // lateral -19..+4 (so predominantly LEFT, only grazing the line), and
  // way/743682576 greenside right. Rendered as those three.
  'tpc-potomac:2': {
    length: 619,
    fairwayFrom: 212,
    fairwayTo: 607,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 273, to: 311, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 573, to: 584, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 577, to: 608, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 602, to: 619, side: 'right' },
    ],
  },
  // hole 3 — par 3, as imported.
  'tpc-potomac:3': {
    length: 225,
    fairwayFrom: 75,
    fairwayTo: 213,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 178, to: 182, side: 'left' },
      { id: 'z2', kind: 'water', from: 182, to: 218, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 206, to: 214, side: 'left' },
    ],
  },
  // hole 4 — as imported. The 104-yd `cross` at 34-138 looks like the classic
  // phantom but is real: the lake sits square in front of the tee and the
  // fairway runs up its right, so the tee shot genuinely carries a corner of
  // it before the water turns and runs down the left. Confirmed from the tee
  // in the 3D planner; the centreline is inside the polygon for 114 yd, and
  // `fairwayFrom` (150) already sits past the carry.
  'tpc-potomac:4': {
    length: 440,
    fairwayFrom: 150,
    fairwayTo: 428,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 20, to: 34, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 30, to: 40, side: 'left' },
      { id: 'z3', kind: 'water', from: 34, to: 138, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 104, to: 110, side: 'left' },
      { id: 'z5', kind: 'water', from: 138, to: 330, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 414, to: 432, side: 'right' },
    ],
  },
  // hole 5 — two of the three imported `cross` bunkers are phantoms and one
  // is real. Dropped: 282-286 (right-side sand at 271-291 sampled together
  // with a left bunker sitting 30 yd off the line) and 350-356 (inside a
  // green that starts at 345). Kept as a genuine cross: way/743719757 at
  // 304-314, which straddles the centreline at lateral -6..+4.
  'tpc-potomac:5': {
    length: 365,
    fairwayFrom: 125,
    fairwayTo: 353,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 106, to: 236, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 224, to: 240, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 271, to: 291, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 279, to: 288, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 304, to: 314, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 340, to: 358, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 347, to: 358, side: 'left' },
    ],
  },
  // hole 6 — the course's #1 handicap and the worst broken-lateral case here.
  // The raw import returned THIRTEEN water fragments, but they are all one
  // polygon: way/743746911 runs the length of the hole and never leaves the
  // sampling corridor — measured off the centreline it sits 12-35 yd out the
  // whole way, touching the line at 140-142 and 163-164. The 3D planner shows
  // an unbroken creek snaking up the right into the pond at the green. Spanned
  // continuously (right, crossing where the line is actually in the water):
  // the gaps rewarded an aggressive right-hand line that does not exist.
  // Also dropped the import's bunker at -7..-1, which is behind the tee.
  'tpc-potomac:6': {
    length: 484,
    fairwayFrom: 165,
    fairwayTo: 472,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 61, to: 140, side: 'right' },
      { id: 'z2', kind: 'water', from: 140, to: 164, side: 'cross' },
      { id: 'z3', kind: 'water', from: 164, to: 484, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 447, to: 463, side: 'right' },
    ],
  },
  // hole 7 — as imported: the creek crosses at 106-150 (centreline inside the
  // polygon for 51 yd, confirmed from the tee) then runs away down the right.
  'tpc-potomac:7': {
    length: 452,
    fairwayFrom: 153,
    fairwayTo: 440,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 92, to: 106, side: 'left' },
      { id: 'z2', kind: 'water', from: 106, to: 150, side: 'cross' },
      { id: 'z3', kind: 'water', from: 150, to: 226, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 248, to: 260, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 270, to: 274, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 292, to: 316, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 416, to: 436, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 436, to: 452, side: 'left' },
    ],
  },
  // hole 8 — as imported. The two bunkers OSM puts at 332-351 and 367-389 sit
  // 46-49 yd off the line and are correctly left out rather than painted in.
  'tpc-potomac:8': {
    length: 467,
    fairwayFrom: 160,
    fairwayTo: 455,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 254, to: 262, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 304, to: 318, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 430, to: 458, side: 'left' },
    ],
  },
  // hole 9 — par 3. z4 is a hand fix: the import produced a `cross` at
  // 179-183, running into a green that starts at 181, while dropping the real
  // left-hand bunker (way/743719737) sitting at 174-182. Replaced the phantom
  // carry with the bunker that is actually there.
  'tpc-potomac:9': {
    length: 201,
    fairwayFrom: 70,
    fairwayTo: 189,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 131, to: 137, side: 'left' },
      { id: 'z2', kind: 'water', from: 137, to: 179, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 175, to: 201, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 174, to: 182, side: 'left' },
    ],
  },
  // hole 10 — par 5. Broken lateral again (way/743746916, the lake shared with
  // 11 and 12), but unlike 6 and 11 this creek genuinely weaves from one side
  // to the other, so it is NOT spanned wholesale. Only same-side neighbours
  // were merged, and only across gaps where the measured distance to the water
  // never leaves the corridor: 127-171 + 181-335 (gap at 31-36 yd) and
  // 359-389 + 435-443 + 461-560 (gaps at 21-33 yd). The right-hand stretch at
  // 343-359 is where the line is genuinely in the water and stays put.
  'tpc-potomac:10': {
    length: 560,
    fairwayFrom: 188,
    fairwayTo: 548,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 41, to: 123, side: 'right' },
      { id: 'z2', kind: 'water', from: 123, to: 127, side: 'cross' },
      { id: 'z3', kind: 'water', from: 127, to: 335, side: 'left' },
      { id: 'z4', kind: 'water', from: 343, to: 359, side: 'right' },
      { id: 'z5', kind: 'water', from: 359, to: 560, side: 'left' },
      { id: 'z6', kind: 'trees', from: 461, to: 560, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 489, to: 497, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 551, to: 559, side: 'right' },
    ],
  },
  // hole 11 — seven left-hand water fragments merged into one. The 3D planner
  // shows a single creek winding down the left from the tee to the green
  // before wrapping across in front of it, and the measurement agrees: the
  // water never leaves the corridor, sitting 8-47 yd off the line throughout.
  // z4 (the right-hand finish) is where it turns across, and stays as
  // imported.
  'tpc-potomac:11': {
    length: 470,
    fairwayFrom: 170,
    fairwayTo: 458,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'trees', from: 8, to: 178, side: 'right' },
      { id: 'z2', kind: 'water', from: 8, to: 408, side: 'left' },
      { id: 'z3', kind: 'trees', from: 360, to: 440, side: 'right' },
      { id: 'z4', kind: 'water', from: 416, to: 470, side: 'right' },
    ],
  },
  // hole 12 — par 3, and the dropped-greenside-bunker case. OSM maps SIX
  // bunkers within 60 yd of this green and the raw import returned exactly
  // one, which on a 168-yd par 3 deletes the hole's entire defence. z2/z3/z4
  // restore them at their measured positions: way/743733347 (right, 21 yd
  // off), way/743733346 (straddling the line at lateral -3..+1, hence
  // `cross`, and short of the green so it is a carry you really face), and
  // way/743733345 + way/743733344 merged into the left-hand run. The two
  // remaining OSM bunkers sit behind the green and clamp to the end of the
  // hole line, so they are not representable here. The pond off to the left
  // is ~55 yd off the centreline and correctly stays out.
  'tpc-potomac:12': {
    length: 168,
    fairwayFrom: 57,
    fairwayTo: 156,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'trees', from: 26, to: 108, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 117, to: 123, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 122, to: 132, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 137, to: 157, side: 'left' },
    ],
  },
  // hole 13 — the textbook phantom cross, and the one worth reading twice.
  // The import called 53-189 a full-width `cross`, which would make the 3rd
  // EASIEST hole on the card (HCP 16) a 189-yd forced carry, and left
  // `fairwayFrom` at 123 — inside the lake. From the tee it is plainly a
  // lateral hazard: the lake lies down the left and the fairway runs up its
  // right-hand side. The centreline merely grazes the shoreline (OSM's line
  // is inside the polygon for 142 yd because it clips the corner the fairway
  // bends around), which is exactly the "centreline hugging a hazard's edge
  // reads the flank as a cross band" mode. Folded into one continuous LEFT
  // hazard; `fairwayFrom` needs no change once the carry is gone.
  // z5 also absorbs a small cross at 339-343 that ran into the green (340).
  'tpc-potomac:13': {
    length: 360,
    fairwayFrom: 123,
    fairwayTo: 348,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 1, to: 261, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 11, to: 23, side: 'right' },
      { id: 'z3', kind: 'water', from: 283, to: 313, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 285, to: 293, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 337, to: 348, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 354, to: 360, side: 'left' },
    ],
  },
  // hole 14 — the drivable par 4, and the one hole whose `signature` makes a
  // promise ("water dares the bold to have a go"), so the geometry has to
  // back it. It does: way/743753271 runs to the green down the right, and the
  // 2D imagery shows the pond sitting short-and-right of the putting surface,
  // squarely on the line anyone taking it on would fly. Same-side fragments
  // merged across gaps where the water stays 20-35 yd off the line (24-36 +
  // 66-106 left; 168-184 + 216-226 + 242-299 right).
  'tpc-potomac:14': {
    length: 299,
    fairwayFrom: 103,
    fairwayTo: 287,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 4, to: 18, side: 'left' },
      { id: 'z2', kind: 'water', from: 24, to: 106, side: 'left' },
      { id: 'z3', kind: 'water', from: 168, to: 299, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 188, to: 204, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 230, to: 260, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 264, to: 288, side: 'left' },
    ],
  },
  // hole 15 — as imported, and deliberately left bare. Two zones on the #4
  // handicap hole looks like a failed import, but it is not: OSM maps exactly
  // two bunkers within 60 yd of this centreline and the import found both,
  // and the nearest water sits 47 yd off the line, outside the corridor. A
  // 490-yd par 4 defended by length rather than hazards — inventing sand here
  // to make it "look" like a hard hole is precisely what not to do.
  'tpc-potomac:15': {
    length: 490,
    fairwayFrom: 168,
    fairwayTo: 478,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 51, to: 57, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 485, to: 490, side: 'right' },
    ],
  },
  // hole 16 — as imported. Nine OSM bunkers collapse to four zones here, but
  // that is the merge working, not sand going missing: four of them
  // (way/743738825/823/822/824) are one greenside cluster and two more sit
  // behind the green.
  'tpc-potomac:16': {
    length: 412,
    fairwayFrom: 144,
    fairwayTo: 400,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 233, to: 251, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 287, to: 295, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 381, to: 401, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 405, to: 412, side: 'right' },
    ],
  },
  // hole 17 — par 3, as imported, and the one hole that needed a real shift:
  // OSM's centreline measures 198 yd against the card's 222, so every zone
  // moved +24. That is the tee pad, not a scale error — the planner's own
  // default setup for this hole reads 195. Water carried to a green with the
  // pond short and right, bunker left, all confirmed from the tee.
  'tpc-potomac:17': {
    length: 222,
    fairwayFrom: 93,
    fairwayTo: 210,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 38, to: 56, side: 'left' },
      { id: 'z2', kind: 'water', from: 126, to: 130, side: 'right' },
      { id: 'z3', kind: 'water', from: 130, to: 174, side: 'cross' },
      { id: 'z4', kind: 'water', from: 174, to: 216, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 206, to: 222, side: 'left' },
    ],
  },
  // hole 18 — z5 and z7 are hand fixes. The import broke way/743738851 (one
  // long bunker, 405-445 at lateral -16..+6) into left + `cross` + left + a
  // right-hand sliver, giving the closing hole a full-width sand carry at
  // 416-436 that does not exist; restored as the single left-hand bunker it
  // is. It also dropped the greenside left bunker (way/743738850, 455-465)
  // entirely, so z7 puts it back.
  'tpc-potomac:18': {
    length: 465,
    fairwayFrom: 163,
    fairwayTo: 453,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 34, to: 46, side: 'right' },
      { id: 'z2', kind: 'water', from: 70, to: 150, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 262, to: 308, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 380, to: 396, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 405, to: 445, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 452, to: 463, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 455, to: 465, side: 'left' },
    ],
  },

  // ---------------------------------------------------------------------
  // Seminole Golf Club (OSM way 125329140 — one clean polygon holding exactly
  // 18 hole ways, plain ref=N, no names). Card: the club's GOLD tees, par 72,
  // 7259 yd, 75.4/144. Like TPC Potomac this was a pure geometry import — the
  // shipped tuple already matched the card on par AND stroke index for all 18,
  // so nothing feeding the odds moved except the layout itself. Yardages
  // auto-reconcile off `length`.
  //
  // Every hole is shifted (never scaled) so `length` equals the card. Unlike
  // previous imports the shifts are NOT near-uniform: OSM drew each centreline
  // from whichever of the ~3 pads per hole the mapper picked, so they run +78,
  // +73, +42, +40, +40 on holes 3/2/1/4/7 down to -5..+3 on nine others. 17 of
  // 18 centrelines were verified to start inside a `golf=tee` polygon and all
  // 18 to end on their OWN green (18 distinct green ids — no hole is drawn to
  // a neighbour's, and every greenDepth is 20-22, so none hit the 45-yd
  // ceiling). Hole 13 is the exception: its tee pads simply are not in OSM
  // (nearest tee polygon is 145 yd away), but its length lands 1 yd off the
  // card, so the line itself starts in the right place.
  // ProVisualizer's independent tee/pin measurements corroborate the card on
  // 15 of 18 holes to within ~10 yd.
  //
  // THE BIG ONE: OSM tags Seminole's native sandy SCRUB as `golf=bunker`, in
  // three enormous ways (6.1/5.4/3.0 acres against a 0.034-acre median, ~400 m
  // long, each straddling 5-6 corridors). Left in, they rasterised as
  // full-width carries on 11 holes — a 398-yd "carry" on hole 4 — so they are
  // dropped via `osmIgnore` in scripts/import-osm.ts, where the evidence is
  // written up. Satellite at zoom 20 makes it plain: the 175 real bunkers are
  // smooth uniform sand with crisp edges, the scrub is pale sand carpeted in
  // vegetation clumps, and the mapper drew the real bunkers as SEPARATE
  // polygons sitting inside the scrub. Large sprawling bunkers up to 1.34
  // acres (way/697261262, in play on 12/13/14/16) were checked the same way
  // and kept — they are uniform sand, just big, which is what Seminole's
  // restored bunkering looks like.
  //
  // The rest of the course needed almost nothing, because the importer's
  // `side` rule was fixed rather than worked around: a band is only a `cross`
  // where the hazard is laterally CONTINUOUS across the playing line. Ross
  // bunkers both flanks at the same distance constantly, and the old
  // both-flanks-means-cross rule turned that into a phantom carry on 17 of 18
  // holes here, every one of them running into the green. Zero remain, with no
  // per-hole hand-fixing. Five deviations from the raw import survive, each on
  // its own hole and each noted again at the entry:
  //
  //  - holes 2/8/15: `fairwayFrom` moved past a genuine water carry it sat
  //    inside (the README red flag), per the carnoustie:17 precedent. Each
  //    crossing is one lake polygon the centreline runs INSIDE for 17-32
  //    consecutive samples, not a clipped corner: 2 -> 225, 8 -> 131,
  //    15 -> 225. Each was also checked for a way round: none of the three has
  //    mapped fairway anywhere in the corridor through the water.
  //  - hole 11: the opposite verdict on a superficially identical 98-yd water
  //    `cross`, and the one the odds invariants caught — mapped fairway runs
  //    up the LEFT of the lake for every yard of it, so it is a lateral
  //    hazard, not a carry. See the entry.
  //  - hole 12: the left-hand water is ONE lake (way/556121950) that the rake
  //    lost for 14 yd at 169-183; spanned continuously 149-273 so the gap
  //    can't reward an aggressive line for the wrong reason.
  //  - hole 14: same fix, one pond (way/556121962) split into two slivers at
  //    170-178 and 190-194, restored as 170-192.
  //  - hole 6: two separate pot bunkers 7 yd apart that the importer's 8-yd
  //    gap-bridging fused into one 54-yd wall. See the entry.
  //
  // Hole 6's shipped signature claimed "a diagonal wall of sand splits the
  // fairway"; it doesn't, and the copy was rewritten rather than inventing
  // geometry to justify it. The hole's real defense — bunkers pinching the
  // RIGHT off the tee (z3/z4 at 197-221 and 229-251 — the property-line side,
  // since the hole plays due south, so the golfer's right is west) and deep
  // sand round a long narrow green — is exactly what the import produced and
  // what the published hole descriptions describe.
  // ---------------------------------------------------------------------
  'seminole:1': {
    length: 405,
    fairwayFrom: 169,
    fairwayTo: 392,
    greenDepth: 22,
    zones: [
      { id: 'z1', kind: 'bunker', from: 62, to: 82, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 150, to: 174, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 204, to: 220, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 206, to: 212, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 208, to: 226, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 240, to: 264, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 250, to: 258, side: 'cross' },
      { id: 'z8', kind: 'bunker', from: 282, to: 296, side: 'left' },
      { id: 'z9', kind: 'water', from: 302, to: 384, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 314, to: 336, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 374, to: 404, side: 'left' },
      { id: 'z12', kind: 'bunker', from: 386, to: 404, side: 'right' },
    ],
  },
  'seminole:2': {
    length: 456,
    fairwayFrom: 225,
    fairwayTo: 444,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 73, to: 85, side: 'right' },
      { id: 'z2', kind: 'water', from: 73, to: 159, side: 'left' },
      { id: 'z3', kind: 'water', from: 135, to: 177, side: 'right' },
      { id: 'z4', kind: 'water', from: 159, to: 225, side: 'cross' },
      { id: 'z5', kind: 'water', from: 225, to: 315, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 289, to: 319, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 297, to: 456, side: 'left' },
      { id: 'z8', kind: 'water', from: 309, to: 329, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 393, to: 456, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 415, to: 419, side: 'cross' },
    ],
  },
  'seminole:3': {
    length: 558,
    fairwayFrom: 246,
    fairwayTo: 546,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 78, to: 194, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 86, to: 108, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 156, to: 180, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 292, to: 298, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 298, to: 320, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 326, to: 334, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 334, to: 348, side: 'cross' },
      { id: 'z8', kind: 'bunker', from: 358, to: 378, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 360, to: 366, side: 'cross' },
      { id: 'z10', kind: 'bunker', from: 370, to: 384, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 418, to: 446, side: 'right' },
      { id: 'z12', kind: 'bunker', from: 436, to: 454, side: 'left' },
      { id: 'z13', kind: 'bunker', from: 478, to: 530, side: 'right' },
      { id: 'z14', kind: 'bunker', from: 486, to: 540, side: 'left' },
      { id: 'z15', kind: 'bunker', from: 548, to: 558, side: 'right' },
    ],
  },
  'seminole:4': {
    length: 500,
    fairwayFrom: 201,
    fairwayTo: 488,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 40, to: 58, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 44, to: 58, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 72, to: 88, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 100, to: 114, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 122, to: 146, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 124, to: 150, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 192, to: 234, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 202, to: 210, side: 'cross' },
      { id: 'z9', kind: 'bunker', from: 204, to: 232, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 284, to: 324, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 306, to: 330, side: 'right' },
      { id: 'z12', kind: 'bunker', from: 374, to: 498, side: 'left' },
      { id: 'z13', kind: 'bunker', from: 408, to: 434, side: 'right' },
      { id: 'z14', kind: 'bunker', from: 430, to: 446, side: 'cross' },
      { id: 'z15', kind: 'bunker', from: 482, to: 500, side: 'right' },
    ],
  },
  'seminole:5': {
    length: 204,
    fairwayFrom: 73,
    fairwayTo: 192,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 3, to: 39, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 55, to: 65, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 83, to: 141, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 105, to: 204, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 161, to: 204, side: 'right' },
    ],
  },
  // hole 6 — Hogan's hole, and the one place the importer's 8-yd gap-bridging
  // (mergeZones GAP, meant to reunite ONE hazard OSM drew as several polygons)
  // fused two genuinely separate bunkers. z3/z4 are way/697252563 (card
  // 196-221, lateral -38..-23) and way/697252564 (card 228-251, -39..-26):
  // distinct pot bunkers with 7 yd of grass between them, not one 54-yd wall.
  // Merged they covered 100% of the safe drive window (205-240); split back to
  // what OSM actually maps, which is what the imagery shows too.
  //
  // Even split, this hole has the highest safe-tee trouble odds in the library
  // and is the only one of 2067 course/hole/condition combos that fails the
  // safe-vs-aggressive invariant in engine.test.ts. That is the hole, not a bad
  // import: sand flanks BOTH sides of 197-251 while 251-312 is completely clean
  // (verified against every bunker polygon within 80 yd of the centreline, and
  // against imagery), so the safe drive window lands in sand and the aggressive
  // one does not. See the note on that test for how the tension is resolved.
  'seminole:6': {
    length: 400,
    fairwayFrom: 138,
    fairwayTo: 388,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 17, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 113, to: 207, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 197, to: 221, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 229, to: 251, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 223, to: 249, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 315, to: 349, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 349, to: 355, side: 'cross' },
      { id: 'z8', kind: 'bunker', from: 355, to: 375, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 363, to: 391, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 385, to: 400, side: 'right' },
    ],
  },
  'seminole:7': {
    length: 440,
    fairwayFrom: 180,
    fairwayTo: 428,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 40, to: 56, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 174, to: 196, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 180, to: 192, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 232, to: 306, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 238, to: 310, side: 'right' },
      { id: 'z6', kind: 'water', from: 328, to: 350, side: 'right' },
      { id: 'z7', kind: 'water', from: 350, to: 404, side: 'cross' },
      { id: 'z8', kind: 'water', from: 372, to: 430, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 422, to: 440, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 430, to: 440, side: 'left' },
    ],
  },
  'seminole:8': {
    length: 256,
    fairwayFrom: 131,
    fairwayTo: 244,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 13, to: 23, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 19, to: 51, side: 'left' },
      { id: 'z3', kind: 'water', from: 37, to: 97, side: 'right' },
      { id: 'z4', kind: 'water', from: 97, to: 131, side: 'cross' },
      { id: 'z5', kind: 'water', from: 111, to: 117, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 133, to: 209, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 189, to: 197, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 213, to: 225, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 229, to: 256, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 245, to: 253, side: 'left' },
    ],
  },
  'seminole:9': {
    length: 549,
    fairwayFrom: 191,
    fairwayTo: 537,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 90, to: 100, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 114, to: 124, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 148, to: 158, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 234, to: 254, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 248, to: 310, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 290, to: 314, side: 'right' },
      { id: 'z7', kind: 'water', from: 312, to: 376, side: 'left' },
      { id: 'z8', kind: 'water', from: 314, to: 464, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 378, to: 386, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 448, to: 476, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 462, to: 468, side: 'right' },
      { id: 'z12', kind: 'bunker', from: 476, to: 488, side: 'cross' },
      { id: 'z13', kind: 'bunker', from: 488, to: 502, side: 'left' },
      { id: 'z14', kind: 'bunker', from: 490, to: 522, side: 'right' },
      { id: 'z15', kind: 'bunker', from: 528, to: 549, side: 'left' },
      { id: 'z16', kind: 'bunker', from: 538, to: 549, side: 'right' },
    ],
  },
  'seminole:10': {
    length: 417,
    fairwayFrom: 160,
    fairwayTo: 405,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 184, to: 200, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 192, to: 212, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 264, to: 276, side: 'right' },
      { id: 'z4', kind: 'water', from: 284, to: 417, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 398, to: 417, side: 'right' },
    ],
  },
  // hole 11 — the one hole whose raw import was a lie, and the odds invariants
  // caught it: a 98-yd water `cross` at 135-233 that would have made the card's
  // #2 handicap a 233-yd forced carry with no bail-out. It is the Potomac-13
  // mode at full size. The lake (way/556121961) does cover the corridor from
  // -50 out to +16 through that whole stretch, so the straight tee->green chord
  // really is over water — but the MAPPED FAIRWAY sits at +16..+40 for every
  // yard of it (175: [22,28,34]; 195: [22,28,34,40]; 225: [16,22,28,34]), i.e.
  // the hole is played up the left of the lake, not across it. So z2 is the
  // lake as the lateral hazard it is, spanning 89-355 continuously down the
  // right, and `fairwayFrom` goes back to the imported 159. The far-left water
  // (z3/z4) is a separate arm at +46, which is what makes this a fairway
  // threading BETWEEN water rather than a carry over it.
  'seminole:11': {
    length: 463,
    fairwayFrom: 159,
    fairwayTo: 450,
    greenDepth: 22,
    zones: [
      { id: 'z1', kind: 'bunker', from: 17, to: 41, side: 'left' },
      { id: 'z2', kind: 'water', from: 89, to: 355, side: 'right' },
      { id: 'z3', kind: 'water', from: 107, to: 143, side: 'left' },
      { id: 'z4', kind: 'water', from: 177, to: 237, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 237, to: 263, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 279, to: 301, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 303, to: 463, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 389, to: 463, side: 'right' },
    ],
  },
  'seminole:12': {
    length: 368,
    fairwayFrom: 131,
    fairwayTo: 356,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 3, to: 41, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 13, to: 85, side: 'right' },
      { id: 'z3', kind: 'water', from: 97, to: 173, side: 'right' },
      { id: 'z4', kind: 'water', from: 145, to: 149, side: 'cross' },
      { id: 'z5', kind: 'water', from: 149, to: 273, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 261, to: 368, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 281, to: 305, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 341, to: 347, side: 'cross' },
      { id: 'z9', kind: 'bunker', from: 347, to: 368, side: 'left' },
    ],
  },
  'seminole:13': {
    length: 172,
    fairwayFrom: 61,
    fairwayTo: 160,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 1, to: 41, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 67, to: 73, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 73, to: 123, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 123, to: 169, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 141, to: 172, side: 'left' },
    ],
  },
  'seminole:14': {
    length: 513,
    fairwayFrom: 181,
    fairwayTo: 501,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 4, to: 10, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 10, to: 104, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 20, to: 36, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 56, to: 104, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 104, to: 120, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 120, to: 134, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 120, to: 164, side: 'right' },
      { id: 'z8', kind: 'water', from: 170, to: 194, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 220, to: 306, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 248, to: 294, side: 'left' },
      { id: 'z11', kind: 'water', from: 272, to: 456, side: 'left' },
      { id: 'z12', kind: 'bunker', from: 326, to: 344, side: 'right' },
      { id: 'z13', kind: 'water', from: 396, to: 474, side: 'right' },
      { id: 'z14', kind: 'bunker', from: 482, to: 492, side: 'cross' },
      { id: 'z15', kind: 'bunker', from: 486, to: 510, side: 'left' },
      { id: 'z16', kind: 'bunker', from: 488, to: 513, side: 'right' },
    ],
  },
  'seminole:15': {
    length: 535,
    fairwayFrom: 225,
    fairwayTo: 523,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 19, to: 71, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 27, to: 63, side: 'left' },
      { id: 'z3', kind: 'water', from: 91, to: 135, side: 'left' },
      { id: 'z4', kind: 'water', from: 103, to: 163, side: 'right' },
      { id: 'z5', kind: 'water', from: 161, to: 169, side: 'left' },
      { id: 'z6', kind: 'water', from: 163, to: 225, side: 'cross' },
      { id: 'z7', kind: 'water', from: 225, to: 399, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 245, to: 311, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 517, to: 533, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 525, to: 535, side: 'right' },
    ],
  },
  'seminole:16': {
    length: 403,
    fairwayFrom: 152,
    fairwayTo: 391,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 17, to: 23, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 43, to: 57, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 233, to: 281, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 245, to: 257, side: 'left' },
      { id: 'z5', kind: 'water', from: 261, to: 295, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 285, to: 299, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 305, to: 367, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 311, to: 403, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 381, to: 395, side: 'right' },
    ],
  },
  'seminole:17': {
    length: 181,
    fairwayFrom: 70,
    fairwayTo: 169,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 10, to: 40, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 56, to: 72, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 142, to: 174, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 142, to: 181, side: 'right' },
    ],
  },
  'seminole:18': {
    length: 439,
    fairwayFrom: 151,
    fairwayTo: 427,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 14, to: 74, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 214, to: 220, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 220, to: 236, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 242, to: 290, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 274, to: 298, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 316, to: 330, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 374, to: 386, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 392, to: 410, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 418, to: 439, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 420, to: 439, side: 'left' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Kings Creek Country Club — Kemp, Texas (GUEST course; see courses.ts).
  // Imported from OSM way 386836594 against the club's BLUE card (par 71,
  // 6507 yd, 72.0/124). Card is Jackson's, cross-checked against the printed
  // OUT/IN totals; hole 6 was verified as the short par 3 (a first image read
  // doubled hole 7's 515 into it — the totals caught it, and OSM's real 159yd
  // hole-6 centreline agreed). Zones card-shifted per hole (shift, never
  // scale); 16 and 18 clamp a tee-front zone at 0 after negative shifts (18's
  // centreline is drawn from the tips, 66 long of the Blues).
  // NAME-COLLISION: a Kings Creek CC also exists in Rehoboth Beach, Delaware.
  // This is the Texas club, pinned by center + apostrophe in import-osm.ts.
  'kings-creek:1': {
    length: 351,
    fairwayFrom: 127,
    fairwayTo: 339,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 118, to: 146, side: 'left' },
      { id: 'z2', kind: 'water', from: 250, to: 351, side: 'left' },
    ],
  },
  'kings-creek:2': {
    length: 340,
    fairwayFrom: 140,
    fairwayTo: 328,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 54, to: 340, side: 'left' },
    ],
  },
  'kings-creek:3': {
    length: 200,
    fairwayFrom: 72,
    fairwayTo: 188,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 13, to: 49, side: 'right' },
      { id: 'z2', kind: 'water', from: 37, to: 49, side: 'left' },
      { id: 'z3', kind: 'water', from: 49, to: 161, side: 'cross' },
      { id: 'z4', kind: 'water', from: 161, to: 200, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 181, to: 195, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 185, to: 199, side: 'left' },
    ],
  },
  'kings-creek:4': {
    length: 393,
    fairwayFrom: 143,
    fairwayTo: 381,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 9, to: 17, side: 'left' },
      { id: 'z2', kind: 'water', from: 63, to: 139, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 65, to: 77, side: 'right' },
      { id: 'z4', kind: 'water', from: 199, to: 227, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 379, to: 393, side: 'left' },
    ],
  },
  'kings-creek:5': {
    length: 360,
    fairwayFrom: 129,
    fairwayTo: 348,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 72, to: 88, side: 'right' },
      { id: 'z2', kind: 'water', from: 140, to: 150, side: 'left' },
      { id: 'z3', kind: 'water', from: 190, to: 314, side: 'right' },
      { id: 'z4', kind: 'water', from: 272, to: 360, side: 'left' },
    ],
  },
  'kings-creek:6': {
    length: 164,
    fairwayFrom: 61,
    fairwayTo: 152,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 5, to: 9, side: 'right' },
    ],
  },
  'kings-creek:7': {
    length: 515,
    fairwayFrom: 185,
    fairwayTo: 503,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 8, to: 102, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 480, to: 492, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 492, to: 508, side: 'left' },
    ],
  },
  'kings-creek:8': {
    length: 209,
    fairwayFrom: 74,
    fairwayTo: 197,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 77, to: 89, side: 'right' },
      { id: 'z2', kind: 'water', from: 87, to: 129, side: 'cross' },
      { id: 'z3', kind: 'water', from: 129, to: 183, side: 'right' },
      { id: 'z4', kind: 'water', from: 129, to: 133, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 191, to: 205, side: 'left' },
    ],
  },
  'kings-creek:9': {
    length: 567,
    fairwayFrom: 206,
    fairwayTo: 555,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 448, to: 506, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 536, to: 554, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 538, to: 542, side: 'cross' },
    ],
  },
  'kings-creek:10': {
    length: 443,
    fairwayFrom: 160,
    fairwayTo: 431,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 397, to: 443, side: 'right' },
    ],
  },
  'kings-creek:11': {
    length: 151,
    fairwayFrom: 52,
    fairwayTo: 139,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 44, to: 64, side: 'right' },
      { id: 'z2', kind: 'water', from: 92, to: 138, side: 'right' },
      { id: 'z3', kind: 'water', from: 100, to: 120, side: 'left' },
      { id: 'z4', kind: 'water', from: 120, to: 136, side: 'cross' },
      { id: 'z5', kind: 'water', from: 140, to: 151, side: 'left' },
    ],
  },
  'kings-creek:12': {
    length: 576,
    fairwayFrom: 202,
    fairwayTo: 564,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 144, side: 'left' },
      { id: 'z2', kind: 'water', from: 64, to: 576, side: 'right' },
      { id: 'z3', kind: 'water', from: 302, to: 400, side: 'left' },
      { id: 'z4', kind: 'water', from: 328, to: 336, side: 'cross' },
      { id: 'z5', kind: 'water', from: 416, to: 528, side: 'left' },
    ],
  },
  'kings-creek:13': {
    length: 415,
    fairwayFrom: 155,
    fairwayTo: 403,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 15, to: 89, side: 'left' },
      { id: 'z2', kind: 'water', from: 33, to: 179, side: 'right' },
      { id: 'z3', kind: 'water', from: 77, to: 81, side: 'cross' },
      { id: 'z4', kind: 'water', from: 135, to: 169, side: 'left' },
      { id: 'z5', kind: 'water', from: 307, to: 317, side: 'right' },
    ],
  },
  'kings-creek:14': {
    length: 387,
    fairwayFrom: 141,
    fairwayTo: 375,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 77, to: 93, side: 'right' },
      { id: 'z2', kind: 'water', from: 83, to: 95, side: 'left' },
      { id: 'z3', kind: 'water', from: 93, to: 107, side: 'cross' },
      { id: 'z4', kind: 'water', from: 107, to: 141, side: 'right' },
      { id: 'z5', kind: 'water', from: 107, to: 145, side: 'left' },
      { id: 'z6', kind: 'water', from: 237, to: 383, side: 'right' },
      { id: 'z7', kind: 'water', from: 249, to: 271, side: 'left' },
      { id: 'z8', kind: 'water', from: 319, to: 327, side: 'left' },
    ],
  },
  'kings-creek:15': {
    length: 394,
    fairwayFrom: 148,
    fairwayTo: 382,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 16, to: 50, side: 'right' },
      { id: 'z2', kind: 'water', from: 44, to: 88, side: 'cross' },
      { id: 'z3', kind: 'water', from: 74, to: 330, side: 'right' },
      { id: 'z4', kind: 'water', from: 88, to: 96, side: 'left' },
      { id: 'z5', kind: 'water', from: 196, to: 210, side: 'left' },
      { id: 'z6', kind: 'water', from: 360, to: 378, side: 'left' },
    ],
  },
  'kings-creek:16': {
    length: 276,
    fairwayFrom: 95,
    fairwayTo: 264,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 82, side: 'right' },
      { id: 'z2', kind: 'water', from: 82, to: 126, side: 'cross' },
      { id: 'z3', kind: 'water', from: 126, to: 218, side: 'right' },
      { id: 'z4', kind: 'water', from: 218, to: 244, side: 'cross' },
      { id: 'z5', kind: 'water', from: 242, to: 252, side: 'right' },
      { id: 'z6', kind: 'water', from: 244, to: 276, side: 'left' },
    ],
  },
  'kings-creek:17': {
    length: 191,
    fairwayFrom: 68,
    fairwayTo: 179,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 46, to: 86, side: 'right' },
      { id: 'z2', kind: 'water', from: 106, to: 128, side: 'right' },
      { id: 'z3', kind: 'water', from: 128, to: 148, side: 'cross' },
      { id: 'z4', kind: 'water', from: 148, to: 152, side: 'left' },
      { id: 'z5', kind: 'water', from: 162, to: 191, side: 'right' },
    ],
  },
  'kings-creek:18': {
    length: 575,
    fairwayFrom: 158,
    fairwayTo: 563,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 340, side: 'left' },
      { id: 'z2', kind: 'water', from: 22, to: 116, side: 'right' },
      { id: 'z3', kind: 'water', from: 334, to: 364, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 546, to: 560, side: 'left' },
    ],
  },
}
