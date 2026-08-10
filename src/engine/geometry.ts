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
  // MEASURED ON THE SHIFTED CENTRELINE, everywhere below — `pnpm import:osm
  // <course> <hole> --shift N`, where N is the shipped `length` in OSM_GEOMETRY
  // minus the raw length the importer prints without the flag. Where OSM drew a
  // hole from a forward pad, the raw line is short by N.
  //
  // That matters because a profile is 13 evenly spaced FRACTIONS of the hole,
  // and HoleMap replays it at the same fractions of the FINAL card length. A
  // profile measured on the short raw line therefore gets STRETCHED over the
  // longer card hole and draws the corner early — 64 yd early on pacific-dunes:8,
  // whose pad is 110 yd forward. Zones can be shifted after the fact; a bend
  // profile cannot, because its samples are positions, not lengths. `--shift`
  // prepends the missing tee run and re-measures, which also re-bases every
  // deviation on the real back-tee -> green chord.
  //
  // Earlier notes here said the tee-end shift "does not apply" to these, being
  // lateral yards. The magnitudes are indeed nearly unmoved (a yard or three);
  // the read was wrong about what the shift moves, which is WHERE along the hole
  // each sample sits — and that is the whole of what the map draws.
  //
  // EXCEPTION — holes whose centreline imports LONGER than the card (a negative
  // shift) keep their raw profile: there is no missing tee run to prepend, and
  // the excess is usually curvature in a wandering polyline rather than a pad
  // offset — the case measured and documented for torrey-pines-south:6 in
  // OSM_GEOMETRY below. Those are carnoustie 4 (-30), 6 (-53), 9 (-49), 14 (-33)
  // and 18 (-42); kings-creek 18 (-66); torrey-pines-south 6 (-22); plus a tail
  // under 15 yd led by tpc-potomac 10 (-13) and cypress-point 11 (-12).
  // kings-creek:18 is the largest and wants a look of its own.
  //
  // Harbour Town Golf Links — real centreline curvature. Note how the signs
  // correct the tuple flags: 5/8/15 bend LEFT (tuple said R), 6 bends RIGHT
  // (tuple said L), 2 is a right dogleg the "straight" flag missed.
  'harbour-town:2': [0, 6, 12, 18, 24, 28, 31, 32, 31, 27, 23, 15, 0],
  'harbour-town:3': [0, -3, -7, -10, -13, -17, -19, -21, -21, -20, -16, -8, 0],
  'harbour-town:5': [0, -14, -29, -43, -55, -63, -65, -58, -43, -30, -18, -9, 0],
  'harbour-town:6': [0, 6, 12, 17, 23, 29, 33, 36, 36, 34, 25, 12, 0],
  'harbour-town:8': [0, -9, -18, -27, -37, -44, -49, -51, -49, -43, -29, -14, 0],
  'harbour-town:9': [0, -1, -3, -4, -5, -6, -7, -8, -9, -9, -8, -4, 0],
  'harbour-town:10': [0, -6, -12, -18, -23, -29, -33, -35, -35, -32, -23, -12, 0],
  'harbour-town:11': [0, -3, -6, -9, -12, -14, -16, -18, -18, -17, -13, -6, 0],
  'harbour-town:12': [0, 5, 11, 16, 22, 27, 31, 34, 34, 31, 24, 12, 0],
  'harbour-town:13': [0, -3, -6, -9, -13, -16, -18, -20, -20, -19, -15, -8, 0],
  'harbour-town:15': [0, -6, -12, -18, -24, -30, -35, -40, -44, -46, -43, -29, 0],
  'harbour-town:16': [0, -10, -20, -29, -39, -49, -59, -65, -70, -69, -57, -29, 0],
  'harbour-town:18': [0, -4, -8, -13, -17, -21, -23, -25, -25, -22, -16, -8, 0],

  // Carnoustie — Championship — real centreline curvature. Signs contradict
  // the tuple's dogleg flag on more holes than they confirm: 2 bends LEFT
  // (tuple said R), 4 bends LEFT 42 yd (tuple said S), 5 bends LEFT (tuple
  // said R), 7 bends RIGHT (tuple said S), 9 bends LEFT right at the 8-yd
  // persistence threshold (tuple said R), 11 bends LEFT (tuple said S), 15
  // bends RIGHT (tuple said S), 18 bends RIGHT (tuple said S). Only 3 (L),
  // 6 (L), 12 (L), and 14 (R) agree with their flag.
  'carnoustie:2': [0, 5, 10, 14, 19, 23, 25, 25, 24, 20, 13, 7, 0],
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

  // Royal Portrush — Dunluce — real centreline curvature, re-measured on the
  // shifted line (see the note at the top of this map). Signs correct the
  // tuple again: 5 and
  // 10 bend LEFT hard (tuple said R and S), 11 and 18 bend LEFT (tuple said L
  // and S), 8 and 9 bend RIGHT (tuple said S and R), 15 bends RIGHT (tuple
  // said L). 10's 75-yd bend is the Himalayas dogleg.
  'royal-portrush-dunluce:2': [0, -10, -20, -30, -39, -44, -46, -45, -39, -31, -20, -10, 0],
  'royal-portrush-dunluce:4': [0, -6, -12, -18, -24, -28, -30, -30, -27, -21, -14, -7, 0],
  'royal-portrush-dunluce:5': [0, 14, 29, 43, 55, 63, 66, 62, 54, 43, 29, 15, 0],
  'royal-portrush-dunluce:6': [0, 1, 3, 4, 5, 7, 8, 8, 8, 7, 5, 3, 0],
  'royal-portrush-dunluce:8': [0, -10, -20, -30, -40, -45, -47, -46, -41, -32, -21, -11, 0],
  'royal-portrush-dunluce:9': [0, -8, -15, -23, -30, -34, -35, -34, -30, -23, -15, -8, 0],
  'royal-portrush-dunluce:10': [0, 13, 26, 39, 52, 63, 71, 75, 72, 64, 48, 25, 0],
  'royal-portrush-dunluce:11': [0, 8, 15, 23, 30, 36, 40, 40, 37, 31, 20, 10, 0],
  'royal-portrush-dunluce:14': [0, -1, -3, -4, -6, -7, -9, -10, -10, -9, -7, -4, 0],
  'royal-portrush-dunluce:15': [0, -9, -17, -26, -34, -43, -48, -50, -50, -43, -30, -15, 0],
  'royal-portrush-dunluce:18': [0, 11, 21, 32, 43, 52, 58, 59, 56, 47, 32, 16, 0],
  // Oakmont Country Club — real centreline curvature, re-measured on the
  // shifted line (see the note at the top of this map). Holes 1 and 8 import
  // long (-8 and -3 yd) and keep their raw profiles.
  'oakmont:1': [0, -1, -2, -3, -5, -6, -7, -7, -8, -8, -7, -4, 0],
  'oakmont:4': [0, 13, 26, 39, 52, 60, 63, 62, 55, 43, 29, 14, 0],
  'oakmont:8': [0, -3, -6, -9, -12, -15, -18, -21, -22, -22, -18, -9, 0],
  'oakmont:11': [0, 2, 3, 5, 7, 9, 10, 11, 11, 10, 8, 4, 0],
  'oakmont:12': [0, 5, 11, 16, 22, 27, 30, 32, 31, 27, 19, 9, 0],
  'oakmont:14': [0, -1, -2, -4, -5, -6, -7, -8, -8, -8, -7, -4, 0],
  'oakmont:15': [0, 2, 4, 5, 7, 9, 10, 10, 10, 9, 6, 3, 0],
  'oakmont:16': [0, 1, 2, 4, 5, 6, 7, 8, 9, 9, 7, 4, 0],
  'oakmont:17': [0, -4, -8, -12, -16, -20, -24, -28, -30, -28, -22, -11, 0],

  // Cypress Point — real centreline curvature, re-measured on the shifted line
  // (see the note at the top of this map); 11 imports 12 yd long and 16 is
  // hand-authored, so both keep their own numbers. Signs correct the tuple
  // again: 2, 5 and 6 bend RIGHT
  // (tuple said S, S and R), 8, 12 and 14 bend LEFT (tuple said L, L and R),
  // 17 bends LEFT (tuple said L). 12's 61-yd bend and 5's 70-yd are the two
  // real doglegs; 9's 9-yd sits right on the persistence threshold.
  'cypress-point:1': [0, 2, 4, 6, 9, 11, 12, 14, 14, 13, 10, 5, 0],
  'cypress-point:2': [0, -11, -21, -32, -41, -47, -49, -47, -41, -33, -24, -13, 0],
  'cypress-point:4': [0, 1, 3, 4, 6, 7, 8, 9, 9, 8, 6, 3, 0],
  'cypress-point:5': [0, -15, -29, -44, -57, -67, -72, -70, -61, -49, -35, -18, 0],
  'cypress-point:6': [0, -10, -21, -31, -41, -48, -52, -53, -50, -43, -34, -21, 0],
  'cypress-point:8': [0, 6, 12, 18, 23, 29, 35, 39, 43, 42, 37, 20, 0],
  'cypress-point:9': [0, -1, -2, -4, -5, -6, -7, -8, -9, -9, -9, -6, 0],
  'cypress-point:10': [0, 4, 8, 11, 15, 18, 20, 20, 19, 16, 12, 7, 0],
  'cypress-point:11': [0, 3, 6, 10, 13, 15, 17, 18, 17, 15, 10, 5, 0],
  'cypress-point:12': [0, 10, 21, 31, 42, 52, 58, 62, 62, 53, 37, 19, 0],
  'cypress-point:14': [0, 4, 8, 12, 16, 19, 22, 25, 25, 23, 19, 9, 0],
  // 16 is the one hand-authored profile in this map. Its OSM centreline is a
  // straight tee→pin chord across the cove, which is the line you play only if
  // you take the hole on; the hole itself doglegs RIGHT round the water to the
  // bail-out, peaking ~55 yd golfer-left of the chord at the corner (~165 yd,
  // the middle of the measured landing area). Positive = golfer-left = the
  // path bows left = "Dogleg right" on the chip, per the sign note above.
  'cypress-point:16': [0, 10, 20, 29, 37, 44, 49, 53, 55, 54, 43, 24, 0],
  'cypress-point:17': [0, 7, 14, 21, 28, 36, 41, 45, 45, 41, 31, 15, 0],
  'cypress-point:18': [0, 3, 6, 10, 13, 16, 18, 20, 20, 18, 14, 7, 0],
  // Whistling Straits — Straits — real centreline curvature, re-measured on the
  // shifted line (see the note at the top of this map); hole 1's pad is 85 yd
  // forward, the largest on any course here. Signs correct a tuple that shipped
  // 15 of 18 holes as 'S': 5 and 11
  // are the two big Dye swings (109 and 82 yd), and 1, 6, 8, 10, 13 and 14
  // all turn hard enough to earn a chip the tuple never gave them. 16 shipped
  // BACKWARDS (tuple 'R', the centreline bends left), and 15's tuple 'L' is a
  // real but gentle 11-yd lean that stays under the 20-yd chip threshold.
  'whistling-straits:1': [0, -6, -12, -18, -24, -30, -36, -39, -39, -35, -26, -13, 0],
  'whistling-straits:2': [0, 3, 6, 9, 11, 14, 16, 17, 17, 14, 10, 5, 0],
  'whistling-straits:4': [0, -4, -8, -12, -15, -19, -21, -21, -21, -18, -12, -6, 0],
  'whistling-straits:5': [0, 21, 42, 63, 84, 105, 117, 118, 99, 61, 23, 1, 0],
  'whistling-straits:6': [0, 4, 9, 13, 18, 22, 26, 28, 30, 29, 25, 12, 0],
  'whistling-straits:8': [0, 8, 17, 25, 33, 41, 45, 46, 45, 39, 26, 13, 0],
  'whistling-straits:9': [0, 2, 5, 7, 10, 12, 14, 15, 15, 14, 11, 5, 0],
  'whistling-straits:10': [0, -8, -16, -24, -32, -40, -46, -51, -52, -48, -37, -19, 0],
  'whistling-straits:11': [0, 17, 34, 51, 68, 79, 84, 81, 67, 50, 33, 17, 0],
  'whistling-straits:13': [0, 6, 13, 19, 26, 31, 34, 34, 32, 27, 18, 9, 0],
  'whistling-straits:14': [0, -6, -13, -19, -26, -32, -38, -42, -44, -43, -36, -18, 0],
  'whistling-straits:15': [0, 2, 4, 6, 8, 10, 11, 11, 11, 9, 6, 3, 0],
  'whistling-straits:16': [0, -6, -11, -17, -22, -28, -33, -39, -45, -49, -45, -26, 0],
  'whistling-straits:18': [0, -10, -20, -31, -41, -51, -57, -60, -59, -51, -35, -18, 0],
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
  'tpc-potomac:11': [0, -12, -25, -37, -49, -58, -64, -64, -58, -48, -32, -16, 0],
  'tpc-potomac:13': [0, 1, 2, 3, 5, 6, 7, 8, 8, 8, 7, 4, 0],
  'tpc-potomac:14': [0, 3, 5, 8, 10, 13, 15, 16, 17, 16, 14, 7, 0],
  'tpc-potomac:15': [0, 3, 5, 8, 10, 13, 15, 15, 15, 14, 10, 5, 0],
  'tpc-potomac:16': [0, -2, -4, -7, -9, -11, -12, -12, -11, -9, -6, -3, 0],

  // Seminole — 10 of 18 bend hard enough to persist. 3 is the big one (75 yd
  // left), with 15 and 16 close behind; 18 turns 50 yd right into the home
  // green. The eight straight holes include all four par 3s.
  'seminole:1': [0, 2, 5, 7, 9, 11, 14, 16, 17, 18, 17, 12, 0],
  'seminole:2': [0, -2, -4, -6, -8, -10, -12, -14, -15, -15, -13, -8, 0],
  'seminole:3': [0, 13, 26, 39, 53, 66, 77, 84, 83, 74, 53, 26, 0],
  'seminole:6': [0, -3, -7, -10, -13, -16, -18, -18, -17, -14, -9, -5, 0],
  'seminole:7': [0, 2, 4, 5, 7, 9, 11, 12, 12, 12, 10, 5, 0],
  'seminole:9': [0, -3, -7, -10, -13, -17, -19, -20, -20, -18, -14, -7, 0],
  'seminole:12': [0, 2, 4, 6, 8, 10, 11, 13, 13, 12, 9, 5, 0],
  'seminole:15': [0, 10, 20, 30, 40, 50, 57, 62, 61, 55, 39, 20, 0],
  'seminole:16': [0, 10, 21, 31, 41, 52, 57, 61, 60, 51, 35, 17, 0],
  'seminole:18': [0, -8, -16, -24, -32, -40, -46, -50, -50, -46, -35, -17, 0],

  // Kings Creek CC (see OSM_GEOMETRY note)
  'kings-creek:1': [0, -1, -2, -4, -5, -6, -7, -8, -8, -8, -7, -3, 0],
  'kings-creek:2': [0, -3, -7, -10, -13, -17, -20, -22, -24, -24, -21, -12, 0],
  'kings-creek:4': [0, 6, 11, 17, 22, 28, 31, 33, 33, 29, 21, 10, 0],
  'kings-creek:5': [0, 8, 16, 24, 32, 38, 43, 43, 41, 35, 23, 12, 0],
  'kings-creek:7': [0, -5, -11, -16, -22, -25, -28, -28, -27, -23, -18, -11, 0],
  'kings-creek:9': [0, -12, -23, -35, -46, -56, -64, -69, -69, -61, -48, -26, 0],
  'kings-creek:13': [0, -5, -9, -14, -19, -23, -26, -28, -28, -25, -18, -9, 0],
  'kings-creek:14': [0, 4, 8, 13, 17, 21, 24, 27, 27, 26, 21, 10, 0],
  'kings-creek:15': [0, 3, 6, 8, 11, 14, 16, 17, 17, 16, 12, 6, 0],
  'kings-creek:16': [0, 2, 5, 7, 10, 12, 14, 16, 16, 14, 11, 6, 0],
  'kings-creek:18': [0, -24, -48, -72, -96, -116, -131, -138, -129, -103, -74, -39, 0],
  // Torrey Pines — South. Unusually, the tuple's dogleg flags were all RIGHT
  // where it set one (2, 6 dogleg right; 13 left — signs per the note above,
  // positive bows golfer-left = turns right). What the real centrelines add is
  // the holes the "straight" flag missed: 1, 5 and 7 turn right (+21..+46) and
  // 14 turns left (-31), all past the chip's 20-yd threshold. 10, 12, 15, 17
  // and 18 bend too gently to chip but are persisted so the map still curves
  // them — which is also what retires hole 12's and 17's overstated 'R' flags.
  // Hole 4's flag said 'L' on a centreline that bends 4 yd; its tuple is now
  // 'S', since with no entry here the stale flag would have been the chip.
  'torrey-pines-south:1': [0, 4, 9, 13, 17, 21, 23, 23, 22, 19, 13, 6, 0],
  'torrey-pines-south:2': [0, 4, 9, 13, 17, 21, 24, 25, 25, 22, 16, 8, 0],
  'torrey-pines-south:5': [0, 3, 7, 10, 14, 17, 19, 21, 21, 19, 14, 7, 0],
  'torrey-pines-south:6': [0, 13, 26, 40, 52, 61, 65, 64, 56, 45, 32, 17, 0],
  'torrey-pines-south:7': [0, 8, 17, 25, 34, 40, 44, 46, 44, 38, 29, 16, 0],
  'torrey-pines-south:10': [0, -2, -4, -7, -9, -11, -12, -13, -13, -11, -8, -4, 0],
  'torrey-pines-south:12': [0, 3, 6, 9, 11, 14, 16, 16, 16, 14, 9, 5, 0],
  'torrey-pines-south:13': [0, -9, -18, -27, -34, -38, -38, -36, -31, -24, -16, -8, 0],
  'torrey-pines-south:14': [0, -4, -9, -13, -18, -22, -26, -29, -31, -30, -25, -14, 0],
  'torrey-pines-south:15': [0, -1, -2, -3, -4, -5, -6, -7, -8, -8, -8, -6, 0],
  'torrey-pines-south:17': [0, -2, -4, -6, -8, -9, -10, -10, -9, -7, -5, -3, 0],
  'torrey-pines-south:18': [0, 3, 6, 9, 11, 13, 13, 12, 9, 5, 1, -1, 0],
  // Pacific Dunes. `bend` is the signed BULGE of the centreline off the
  // tee->green chord, not the turn, and the two are OPPOSITE: a hole doglegging
  // RIGHT bows golfer-LEFT of its own chord, because the chord cuts the corner.
  // So positive = right turn, which is the conversion panels.tsx makes for the
  // chip (`m < 0 ? 'L' : 'R'`). Verified label-free on all eleven by comparing
  // the centreline's heading over the first third of the hole against the last
  // third; every one agrees with the chip.
  // Against that measurement the hand-set `dogleg` flags in courses.ts are
  // RIGHT on 3, 6, 9, 12, 15 and 18; absent (S) on 1, 8, 13 and 16, which do
  // turn; and wrong on exactly one hole — 7 is tagged L and turns right by 14
  // degrees. `bend` overrides the flag either way, so every chip reads true.
  // (An earlier draft of this note had it backwards, reading the importer's
  // console label — which names the bulge — as the turn. Hence the sign note.)
  // Measured on the shifted line, per the note at the top of this map — these
  // were the first profiles done that way, and hole 8 (pad 110 yd forward, corner
  // drawn 64 yd early) is the hole that found the stretch. Hole 3 is the
  // exception: its shift is -4 yd, too small to prepend and worth 0.8% of the
  // hole, so it keeps its raw profile.
  'pacific-dunes:1': [0, 1, 3, 4, 5, 7, 8, 9, 9, 8, 6, 3, 0],
  'pacific-dunes:3': [0, -5, -9, -14, -18, -22, -25, -26, -26, -25, -20, -11, 0],
  'pacific-dunes:6': [0, 1, 2, 4, 5, 6, 7, 8, 8, 8, 7, 3, 0],
  'pacific-dunes:7': [0, 4, 7, 11, 14, 18, 19, 20, 20, 17, 12, 6, 0],
  'pacific-dunes:8': [0, 6, 12, 18, 23, 29, 33, 32, 28, 22, 15, 7, 0],
  'pacific-dunes:9': [0, 1, 3, 4, 5, 7, 8, 10, 10, 9, 6, 3, 0],
  'pacific-dunes:12': [0, -9, -19, -28, -37, -42, -44, -44, -43, -39, -32, -18, 0],
  'pacific-dunes:13': [0, -2, -4, -6, -7, -9, -10, -11, -11, -10, -7, -4, 0],
  'pacific-dunes:15': [0, 3, 5, 8, 10, 13, 14, 16, 17, 16, 14, 8, 0],
  'pacific-dunes:16': [0, 6, 12, 19, 25, 31, 37, 42, 43, 40, 30, 15, 0],
  'pacific-dunes:18': [0, -7, -15, -22, -29, -36, -43, -45, -41, -33, -22, -11, 0],
  // Pine Valley. Entries are persisted at the importer's >=8 yd bar so the map
  // curves every real turn; the tuple's `dogleg` flags are set separately, at
  // the caddy chip's >=20 yd bar (see the note on the holes in courses.ts).
  // Those two bars disagree ON PURPOSE for 7, 8, 9 and 11, which bend 17, 19,
  // 10 and 10 yd: drawn as the gentle curves they are, but not called doglegs.
  // Don't "fix" that by promoting their flags — the flag would then claim a
  // chip the UI won't show, which is what an earlier draft of this note got
  // wrong. Of the flags that DO change, 6, 13 and 15 turn the opposite way to
  // the shipped tuple and 12, 16, 17 were flagged straight at 51, 54 and 27 yd.
  // Holes 1 and 6 bow 77 and 80 yd — the biggest in the library — and both are
  // corroborated by ProVisualizer, whose routed legs imply corners ~117 and
  // ~106 yd off the chord, so the coarse OSM lines are if anything
  // understating them. 6 and 17 are measured on the SHIFTED back-tee line.
  'pine-valley:1': [0, 14, 27, 41, 54, 66, 74, 77, 73, 62, 41, 21, 0],
  'pine-valley:4': [0, 8, 15, 23, 31, 38, 43, 46, 46, 41, 29, 15, 0],
  'pine-valley:6': [0, 12, 25, 37, 50, 62, 73, 80, 74, 58, 39, 20, 0],
  'pine-valley:7': [0, 4, 7, 11, 14, 16, 17, 17, 15, 12, 8, 4, 0],
  'pine-valley:8': [0, -2, -5, -7, -10, -12, -15, -17, -18, -19, -18, -14, 0],
  'pine-valley:9': [0, -1, -3, -4, -5, -7, -8, -9, -10, -9, -7, -3, 0],
  'pine-valley:11': [0, 1, 3, 4, 6, 7, 8, 9, 10, 10, 9, 6, 0],
  'pine-valley:12': [0, -6, -12, -18, -24, -29, -35, -41, -47, -51, -48, -27, 0],
  'pine-valley:13': [0, -9, -18, -27, -36, -44, -52, -57, -60, -57, -47, -31, 0],
  'pine-valley:15': [0, 4, 9, 13, 18, 22, 24, 26, 26, 22, 16, 8, 0],
  'pine-valley:16': [0, 11, 22, 34, 44, 52, 54, 38, 18, 5, 1, 0, 0],
  'pine-valley:17': [0, 4, 7, 11, 15, 18, 22, 25, 27, 27, 24, 14, 0],
  'pine-valley:18': [0, 4, 8, 12, 16, 19, 22, 24, 24, 23, 18, 9, 0],
  // Bandon Dunes. The shipped flags were wrong on ELEVEN of eighteen holes —
  // the worst run in the library — so this map is doing more correcting here
  // than anywhere else. Two of them, 4 and 8, were flagged 'L' on centrelines
  // that turn RIGHT 47 and 33 yd; 1, 9, 14, 16 and 18 were flagged straight and
  // bend 54, 81, 40, 48 and 32. The tuple is updated to match (see courses.ts),
  // at the caddy chip's >=20 yd bar rather than this map's >=8 yd persist bar —
  // so 5, 10, 11, 13 and 17 keep an entry here (they bend 15-19 yd and the map
  // should curve them) while their flags go 'S', the same deliberate
  // disagreement documented for Pine Valley above. Hole 7 gets NO entry and its
  // 'R' flag becomes 'S': the line is dead straight, and with nothing here to
  // override it the stale flag would have been the chip (torrey-pines-south:4).
  // 1 is measured on the arc->straight remap, and 9, 10, 13, 14, 16, 18 on the
  // SHIFTED back-tee line.
  'bandon-dunes:1': [0, 9, 18, 28, 37, 46, 51, 54, 54, 46, 32, 16, 0],
  'bandon-dunes:3': [0, 4, 7, 11, 15, 18, 20, 21, 20, 18, 12, 6, 0],
  'bandon-dunes:4': [0, 8, 16, 24, 32, 40, 44, 48, 48, 42, 30, 15, 0],
  'bandon-dunes:5': [0, -3, -6, -9, -12, -15, -17, -18, -17, -15, -10, -5, 0],
  'bandon-dunes:8': [0, 6, 12, 18, 23, 28, 32, 33, 32, 28, 19, 10, 0],
  'bandon-dunes:9': [0, 14, 28, 42, 56, 68, 77, 81, 75, 62, 44, 22, 0],
  'bandon-dunes:10': [0, 3, 7, 10, 13, 16, 18, 19, 19, 17, 12, 6, 0],
  'bandon-dunes:11': [0, -3, -5, -8, -10, -13, -14, -15, -15, -14, -10, -5, 0],
  'bandon-dunes:13': [0, -4, -8, -12, -16, -17, -18, -17, -15, -11, -7, -4, 0],
  'bandon-dunes:14': [0, 6, 12, 18, 24, 30, 36, 39, 40, 37, 28, 14, 0],
  'bandon-dunes:16': [0, 7, 13, 20, 26, 33, 39, 42, 44, 44, 36, 18, 0],
  'bandon-dunes:17': [0, -2, -4, -6, -8, -10, -11, -12, -12, -10, -7, -4, 0],
  'bandon-dunes:18': [0, 6, 13, 19, 26, 30, 32, 32, 29, 23, 15, 8, 0],
  // Muirfield — measured on the TRIMMED centreline where the hole was cut back
  // to the white card (holes 15 and 17 here); see the Muirfield note in
  // OSM_GEOMETRY. Same reason the shifted holes are re-measured rather than
  // rescaled: a profile is positions, not lengths.
  'muirfield:1': [0, 5, 11, 16, 22, 25, 28, 28, 26, 22, 15, 7, 0],
  'muirfield:5': [0, 4, 8, 11, 15, 17, 19, 19, 17, 14, 9, 5, 0],
  'muirfield:6': [0, -12, -24, -37, -49, -56, -61, -61, -54, -43, -29, -14, 0],
  'muirfield:8': [0, 8, 16, 25, 33, 41, 46, 49, 49, 43, 31, 15, 0],
  'muirfield:9': [0, -5, -9, -14, -19, -22, -25, -25, -23, -20, -13, -7, 0],
  'muirfield:10': [0, 2, 4, 6, 8, 10, 11, 11, 11, 10, 7, 3, 0],
  'muirfield:14': [0, -2, -5, -7, -9, -11, -11, -11, -10, -8, -5, -3, 0],
  'muirfield:15': [0, 7, 15, 22, 28, 32, 33, 31, 28, 21, 14, 7, 0],
  'muirfield:17': [0, -13, -26, -40, -51, -58, -60, -57, -51, -39, -26, -13, 0],
  // Quail Hollow — measured on the SHIFTED centreline (both directions; see
  // the Quail Hollow note in OSM_GEOMETRY).
  'quail-hollow:1': [0, 16, 33, 49, 65, 80, 90, 94, 92, 79, 53, 26, 0],
  'quail-hollow:2': [0, -7, -13, -20, -27, -33, -39, -43, -44, -43, -35, -17, 0],
  'quail-hollow:5': [0, 5, 10, 16, 21, 26, 30, 33, 34, 32, 26, 13, 0],
  'quail-hollow:7': [0, 4, 7, 11, 14, 18, 21, 23, 23, 21, 17, 8, 0],
  'quail-hollow:8': [0, 3, 6, 9, 12, 15, 17, 19, 21, 21, 18, 10, 0],
  'quail-hollow:9': [0, -8, -17, -25, -33, -40, -44, -44, -40, -33, -22, -11, 0],
  'quail-hollow:11': [0, -6, -12, -18, -24, -30, -34, -37, -36, -32, -23, -12, 0],
  'quail-hollow:12': [0, 2, 3, 5, 7, 8, 9, 10, 10, 8, 6, 3, 0],
  'quail-hollow:14': [0, -4, -8, -12, -16, -20, -23, -26, -26, -24, -19, -10, 0],
  'quail-hollow:15': [0, -15, -30, -46, -61, -76, -88, -93, -90, -75, -51, -25, 0],
  'quail-hollow:16': [0, 8, 16, 24, 31, 39, 46, 50, 50, 45, 34, 17, 0],
  'quail-hollow:18': [0, -4, -7, -11, -14, -18, -21, -22, -23, -21, -16, -8, 0],
  // camargo — measured on the SHIFTED/remapped centreline where one applies
  // (see the camargo note in OSM_GEOMETRY).
  'camargo:2': [0, 15, 30, 45, 60, 73, 82, 86, 85, 73, 49, 24, 0],
  'camargo:4': [0, -9, -18, -27, -36, -44, -49, -50, -49, -42, -29, -14, 0],
  'camargo:7': [0, -3, -6, -9, -12, -16, -17, -18, -18, -16, -11, -6, 0],
  'camargo:9': [0, 7, 15, 22, 30, 37, 41, 43, 41, 36, 24, 12, 0],
  'camargo:10': [0, -8, -15, -23, -30, -34, -37, -37, -33, -27, -18, -9, 0],
  'camargo:12': [0, 6, 12, 18, 24, 30, 35, 38, 40, 39, 33, 17, 0],
  'camargo:13': [0, 6, 11, 17, 23, 28, 33, 37, 39, 39, 33, 17, 0],
  'camargo:14': [0, 3, 5, 8, 11, 13, 16, 17, 19, 19, 16, 9, 0],
  'camargo:17': [0, -4, -8, -12, -15, -19, -23, -25, -27, -24, -17, -9, 0],
  // shinnecock-hills — measured on the SHIFTED/remapped centreline where one applies
  // (see the shinnecock-hills note in OSM_GEOMETRY).
  'shinnecock-hills:1': [0, 6, 12, 18, 25, 31, 37, 43, 37, 29, 19, 10, 0],
  'shinnecock-hills:3': [0, -5, -10, -15, -20, -25, -28, -29, -28, -25, -17, -9, 0],
  'shinnecock-hills:4': [0, 7, 14, 20, 27, 34, 40, 45, 49, 49, 37, 19, 0],
  'shinnecock-hills:5': [0, 9, 18, 27, 35, 43, 48, 49, 46, 44, 35, 18, 0],
  'shinnecock-hills:6': [0, 8, 16, 25, 33, 41, 48, 53, 52, 39, 26, 13, 0],
  'shinnecock-hills:8': [0, 3, 7, 10, 14, 17, 20, 22, 23, 22, 19, 10, 0],
  'shinnecock-hills:9': [0, -6, -12, -19, -25, -31, -36, -41, -43, -33, -22, -11, 0],
  'shinnecock-hills:12': [0, 5, 11, 16, 21, 27, 24, 18, 11, 4, -1, -3, 0],
  'shinnecock-hills:13': [0, 6, 13, 19, 26, 32, 36, 39, 39, 34, 25, 13, 0],
  'shinnecock-hills:14': [0, 5, 10, 15, 20, 25, 31, 26, 35, 31, 22, 11, 0],
  'shinnecock-hills:15': [0, 6, 12, 18, 25, 30, 34, 35, 34, 28, 18, 9, 0],
  'shinnecock-hills:16': [0, 1, 3, 4, 6, 7, 6, 4, -2, -9, -10, -5, 0],
  'shinnecock-hills:18': [0, -7, -15, -22, -30, -37, -45, -53, -56, -47, -32, -16, 0],
  // cabot-links — measured on the SHIFTED/remapped centreline where one applies
  // (see the cabot-links note in OSM_GEOMETRY).
  'cabot-links:1': [0, -8, -16, -23, -26, -26, -25, -23, -19, -14, -9, -5, 0],
  'cabot-links:3': [0, 3, 7, 10, 14, 17, 20, 22, 24, 24, 21, 12, 0],
  'cabot-links:4': [0, -1, -3, -4, -6, -7, -9, -10, -11, -11, -8, -4, 0],
  'cabot-links:6': [0, -13, -25, -38, -51, -63, -71, -77, -77, -68, -47, -24, 0],
  'cabot-links:8': [0, -5, -10, -15, -20, -25, -28, -31, -31, -28, -22, -11, 0],
  'cabot-links:9': [0, -3, -6, -10, -13, -16, -18, -20, -20, -18, -13, -7, 0],
  'cabot-links:10': [0, 2, 4, 6, 8, 10, 12, 13, 13, 12, 9, 4, 0],
  'cabot-links:11': [0, 11, 23, 34, 46, 56, 65, 71, 73, 69, 57, 34, 0],
  'cabot-links:12': [0, 4, 8, 11, 15, 19, 23, 25, 26, 25, 21, 11, 0],
  'cabot-links:15': [0, -2, -3, -5, -7, -9, -10, -11, -12, -12, -10, -5, 0],
  'cabot-links:16': [0, -4, -8, -13, -17, -21, -23, -25, -25, -22, -15, -8, 0],
  'cabot-links:18': [0, 3, 5, 8, 11, 13, 14, 15, 14, 12, 8, 4, 0],
  // lacc-north — measured on the SHIFTED/remapped centreline where one applies
  // (see the lacc-north note in OSM_GEOMETRY).
  'lacc-north:1': [0, -4, -9, -13, -17, -20, -23, -23, -21, -18, -12, -6, 0],
  'lacc-north:2': [0, -3, -6, -9, -12, -15, -17, -18, -18, -17, -13, -7, 0],
  'lacc-north:3': [0, -3, -6, -8, -11, -13, -15, -15, -14, -12, -8, -4, 0],
  'lacc-north:5': [0, 2, 4, 6, 8, 10, 11, 11, 11, 10, 7, 3, 0],
  'lacc-north:6': [0, 3, 7, 10, 13, 17, 20, 23, 25, 27, 26, 19, 0],
  'lacc-north:7': [0, -1, -2, -4, -5, -6, -7, -8, -8, -8, -7, -4, 0],
  'lacc-north:8': [0, 7, 14, 21, 28, 33, 37, 36, 34, 28, 19, 9, 0],
  'lacc-north:10': [0, -2, -4, -5, -7, -9, -11, -12, -13, -13, -11, -6, 0],
  'lacc-north:12': [0, -6, -12, -17, -23, -29, -35, -38, -41, -41, -36, -19, 0],
  'lacc-north:13': [0, 1, 2, 4, 5, 6, 7, 8, 8, 8, 7, 4, 0],
  'lacc-north:14': [0, 8, 15, 23, 30, 35, 37, 37, 33, 27, 18, 9, 0],
  'lacc-north:18': [0, -4, -8, -11, -15, -19, -23, -25, -27, -27, -25, -15, 0],
  // doral-blue-monster — measured on the SHIFTED/remapped centreline where one applies
  // (see the doral-blue-monster note in OSM_GEOMETRY).
  'doral-blue-monster:1': [0, 5, 9, 14, 18, 21, 23, 23, 21, 18, 12, 6, 0],
  'doral-blue-monster:3': [0, 9, 17, 26, 34, 41, 47, 50, 49, 44, 36, 23, 0],
  'doral-blue-monster:5': [0, -5, -10, -16, -21, -26, -30, -33, -34, -33, -27, -13, 0],
  'doral-blue-monster:6': [0, -5, -10, -14, -19, -24, -27, -29, -29, -27, -21, -10, 0],
  'doral-blue-monster:8': [0, -9, -18, -27, -36, -44, -51, -57, -61, -61, -53, -30, 0],
  'doral-blue-monster:10': [0, -19, -39, -58, -76, -87, -89, -81, -60, -36, -15, -4, 0],
  'doral-blue-monster:12': [0, 4, 8, 12, 16, 19, 22, 25, 27, 26, 22, 12, 0],
  'doral-blue-monster:14': [0, -8, -16, -25, -33, -41, -46, -51, -51, -47, -35, -18, 0],
  'doral-blue-monster:16': [0, -8, -16, -24, -33, -41, -46, -50, -50, -45, -33, -16, 0],
  'doral-blue-monster:17': [0, 5, 9, 14, 18, 23, 26, 28, 28, 25, 19, 9, 0],
  'doral-blue-monster:18': [0, -7, -14, -21, -28, -35, -40, -42, -42, -37, -26, -13, 0],

  // THE DOGLEG — hand-designed profiles (>0 = golfer-left bow = right
  // dogleg, matching the sign convention proven on harbour-town:2). The
  // corners sharpen through the round by design: compare 1's late 52-yard
  // peak with 8's 60, and 18 is the only S-curve in the library — left off
  // the tee, right at the last turn, the mark drawn at course scale.
  'the-dogleg:1': [0, 4, 9, 15, 22, 30, 39, 47, 52, 50, 40, 23, 0],
  'the-dogleg:2': [0, -4, -9, -14, -19, -24, -27, -28, -26, -22, -16, -8, 0],
  'the-dogleg:4': [0, 3, 7, 12, 18, 25, 31, 36, 38, 35, 27, 15, 0],
  'the-dogleg:5': [0, -4, -10, -16, -23, -30, -35, -38, -37, -32, -24, -13, 0],
  'the-dogleg:6': [0, 3, 6, 10, 15, 20, 25, 28, 29, 26, 20, 11, 0],
  'the-dogleg:8': [0, -3, -7, -13, -21, -31, -43, -54, -60, -56, -42, -22, 0],
  'the-dogleg:9': [0, 4, 8, 14, 20, 27, 33, 37, 38, 34, 26, 14, 0],
  'the-dogleg:10': [0, -3, -7, -11, -15, -19, -22, -24, -24, -21, -15, -8, 0],
  'the-dogleg:11': [0, 3, 8, 14, 21, 28, 34, 38, 39, 35, 26, 14, 0],
  'the-dogleg:13': [0, -4, -10, -17, -24, -30, -35, -37, -36, -31, -23, -12, 0],
  'the-dogleg:14': [0, 4, 9, 15, 21, 27, 32, 35, 35, 31, 23, 12, 0],
  'the-dogleg:15': [0, -5, -12, -20, -28, -34, -38, -39, -36, -30, -21, -11, 0],
  'the-dogleg:17': [0, 4, 8, 13, 18, 23, 27, 30, 30, 27, 20, 10, 0],
  'the-dogleg:18': [0, -8, -18, -27, -32, -30, -20, -4, 14, 28, 32, 22, 0],
  // bellerive — measured on the SHIFTED centreline where one applies (2, 5,
  // 8, 17; see the bellerive note in OSM_GEOMETRY). RTJ turned this course
  // LEFT: nine of twelve bends bow left, 17 is the big right-hander.
  'bellerive:1': [0, -2, -4, -6, -8, -10, -11, -11, -11, -9, -6, -3, 0],
  'bellerive:2': [0, -8, -15, -23, -30, -38, -45, -50, -53, -53, -44, -23, 0],
  'bellerive:4': [0, -11, -23, -34, -43, -49, -49, -47, -41, -31, -21, -10, 0],
  'bellerive:7': [0, -4, -8, -12, -16, -20, -23, -25, -25, -24, -20, -10, 0],
  'bellerive:8': [0, -10, -21, -31, -41, -47, -50, -50, -45, -36, -24, -12, 0],
  'bellerive:9': [0, -4, -9, -13, -17, -21, -24, -27, -27, -26, -20, -10, 0],
  'bellerive:10': [0, -10, -21, -31, -42, -49, -53, -53, -48, -39, -26, -13, 0],
  'bellerive:12': [0, -5, -9, -14, -19, -24, -27, -30, -31, -30, -25, -13, 0],
  'bellerive:14': [0, -6, -12, -18, -24, -30, -35, -38, -40, -39, -32, -16, 0],
  'bellerive:15': [0, 1, 3, 4, 5, 6, 7, 8, 8, 7, 5, 2, 0],
  'bellerive:17': [0, 10, 21, 31, 41, 46, 47, 45, 39, 30, 20, 10, 0],
  'bellerive:18': [0, -7, -14, -20, -27, -33, -37, -38, -37, -32, -22, -11, 0],
}

export const OSM_GEOMETRY: Record<string, OsmHoleGeometry> = {
  // hole 1 — opener
  'tpc-sawgrass:1': {
    length: 427,
    fairwayFrom: 149,
    fairwayTo: 408,
    greenDepth: 33,
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
    fairwayTo: 518,
    greenDepth: 32,
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
    fairwayTo: 166,
    greenDepth: 25,
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
    fairwayTo: 378,
    greenDepth: 24,
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
    fairwayTo: 445,
    greenDepth: 31,
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
    fairwayTo: 374,
    greenDepth: 28,
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
    fairwayTo: 433,
    greenDepth: 30,
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
    fairwayTo: 220,
    greenDepth: 29,
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
    fairwayTo: 560,
    greenDepth: 29,
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
    fairwayTo: 393,
    greenDepth: 30,
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
    fairwayTo: 314,
    greenDepth: 37,
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
    fairwayTo: 160,
    greenDepth: 28,
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
    fairwayTo: 450,
    greenDepth: 36,
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
    fairwayTo: 440,
    greenDepth: 37,
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
    fairwayTo: 504,
    greenDepth: 29,
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
    fairwayTo: 123,
    greenDepth: 26,
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
    fairwayTo: 427,
    greenDepth: 34,
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
    fairwayTo: 509,
    greenDepth: 37,
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
    greenDepth: 40,
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
    greenDepth: 33,
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
    greenDepth: 29,
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
    greenDepth: 29,
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
    greenDepth: 23,
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
    greenDepth: 33,
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
    greenDepth: 31,
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
    greenDepth: 25,
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
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'bunker', from: 55, to: 63, side: 'right' },
    ],
  },
  // hole 10 — scorecard 112 yd (OSM centreline 107 yd, zones scaled to card)
  'palm-beach-par-3:10': {
    length: 112,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 31,
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
    greenDepth: 30,
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
    greenDepth: 33,
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
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 6, side: 'right' },
    ],
  },
  // hole 14 — scorecard 129 yd (OSM centreline 126 yd, zones scaled to card)
  'palm-beach-par-3:14': {
    length: 129,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 34,
    zones: [
    ],
  },
  // hole 15 — scorecard 156 yd (OSM centreline 147 yd, zones scaled to card)
  'palm-beach-par-3:15': {
    length: 156,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 33,
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
    greenDepth: 30,
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
    greenDepth: 36,
    zones: [
      { id: 'z1', kind: 'water', from: 68, to: 127, side: 'right' },
    ],
  },
  // hole 1 — scorecard 176 yd (OSM centreline 159 yd, zones scaled to card)
  'cobblestone-creek:1': {
    length: 176,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 29,
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
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 144, to: 150, side: 'right' },
    ],
  },
  // hole 3 — scorecard 168 yd (OSM centreline 171 yd, zones scaled to card)
  'cobblestone-creek:3': {
    length: 168,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 39,
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
    greenDepth: 33,
    zones: [
    ],
  },
  // hole 6 — scorecard 150 yd (OSM centreline 154 yd, zones scaled to card)
  'cobblestone-creek:6': {
    length: 150,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 32,
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
    greenDepth: 30,
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
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'bunker', from: 72, to: 77, side: 'left' },
    ],
  },
  // hole 9 — scorecard 225 yd (OSM centreline 229 yd, zones scaled to card)
  'cobblestone-creek:9': {
    length: 225,
    fairwayFrom: 0,
    fairwayTo: 0,
    greenDepth: 27,
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
    fairwayTo: 394,
    greenDepth: 21,
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
    fairwayTo: 488,
    greenDepth: 21,
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
    fairwayTo: 453,
    greenDepth: 26,
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
    fairwayTo: 524,
    greenDepth: 24,
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
    fairwayTo: 395,
    greenDepth: 30,
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
    fairwayTo: 178,
    greenDepth: 32,
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
    fairwayTo: 452,
    greenDepth: 25,
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
    fairwayTo: 426,
    greenDepth: 37,
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
    fairwayTo: 419,
    greenDepth: 26,
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
    fairwayTo: 409,
    greenDepth: 27,
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
    fairwayTo: 172,
    greenDepth: 28,
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
    fairwayTo: 563,
    greenDepth: 23,
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
    fairwayTo: 417,
    greenDepth: 27,
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
    fairwayTo: 171,
    greenDepth: 28,
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
    fairwayTo: 455,
    greenDepth: 26,
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
    fairwayTo: 382,
    greenDepth: 31,
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
    fairwayTo: 409,
    greenDepth: 45,
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
    fairwayTo: 323,
    greenDepth: 38,
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
    fairwayTo: 359,
    greenDepth: 29,
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
    fairwayTo: 359,
    greenDepth: 35,
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
    fairwayTo: 497,
    greenDepth: 43,
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
    fairwayTo: 386,
    greenDepth: 24,
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
    fairwayTo: 147,
    greenDepth: 33,
    zones: [
      { id: 'z1', kind: 'bunker', from: 151, to: 162, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 162, to: 166, side: 'left' },
    ],
  },
  // hole 9 — Railway — scorecard 416 yd (OSM centreline 465 yd, zones scaled to card)
  'carnoustie:9': {
    length: 416,
    fairwayFrom: 146,
    fairwayTo: 394,
    greenDepth: 41,
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
    fairwayTo: 424,
    greenDepth: 33,
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
    fairwayTo: 347,
    greenDepth: 38,
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
    fairwayTo: 139,
    greenDepth: 38,
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
    fairwayTo: 455,
    greenDepth: 39,
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
    fairwayTo: 439,
    greenDepth: 35,
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
    fairwayTo: 210,
    greenDepth: 45,
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
    fairwayTo: 417,
    greenDepth: 30,
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
    fairwayTo: 421,
    greenDepth: 44,
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
    fairwayTo: 401,
    greenDepth: 35,
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
    fairwayTo: 555,
    greenDepth: 34,
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
    fairwayTo: 159,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'bunker', from: 144, to: 154, side: 'left' },
    ],
  },
  'royal-portrush-dunluce:4': {
    length: 482,
    fairwayFrom: 171,
    fairwayTo: 467,
    greenDepth: 26,
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
    fairwayTo: 352,
    greenDepth: 40,
    zones: [
      { id: 'z1', kind: 'bunker', from: 324, to: 328, side: 'right' },
    ],
  },
  'royal-portrush-dunluce:6': {
    length: 194,
    fairwayFrom: 76,
    fairwayTo: 170,
    greenDepth: 44,
    zones: [],
  },
  'royal-portrush-dunluce:7': {
    length: 592,
    fairwayFrom: 212,
    fairwayTo: 573,
    greenDepth: 33,
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
    fairwayTo: 413,
    greenDepth: 37,
    zones: [
      { id: 'z1', kind: 'bunker', from: 269, to: 277, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 305, to: 311, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 419, to: 425, side: 'right' },
    ],
  },
  'royal-portrush-dunluce:9': {
    length: 432,
    fairwayFrom: 154,
    fairwayTo: 412,
    greenDepth: 36,
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
    fairwayTo: 423,
    greenDepth: 44,
    zones: [],
  },
  'royal-portrush-dunluce:11': {
    length: 474,
    fairwayFrom: 178,
    fairwayTo: 457,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'bunker', from: 463, to: 471, side: 'left' },
    ],
  },
  'royal-portrush-dunluce:12': {
    length: 532,
    fairwayFrom: 188,
    fairwayTo: 514,
    greenDepth: 32,
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
    fairwayTo: 452,
    greenDepth: 38,
    zones: [
      { id: 'z1', kind: 'bunker', from: 253, to: 259, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 313, to: 321, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 333, to: 341, side: 'left' },
    ],
  },
  'royal-portrush-dunluce:15': {
    length: 426,
    fairwayFrom: 157,
    fairwayTo: 408,
    greenDepth: 32,
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
    fairwayTo: 453,
    greenDepth: 37,
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
    fairwayTo: 463,
    greenDepth: 34,
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
    fairwayTo: 331,
    greenDepth: 25,
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
    fairwayTo: 442,
    greenDepth: 45,
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
    fairwayTo: 587,
    greenDepth: 45,
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
    fairwayTo: 391,
    greenDepth: 33,
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
    fairwayTo: 186,
    greenDepth: 29,
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
    fairwayTo: 465,
    greenDepth: 40,
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
    fairwayTo: 274,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 41, to: 89, side: 'right' },
      { id: 'z2', kind: 'trees', from: 201, to: 229, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 211, to: 293, side: 'left' },
    ],
  },
  'oakmont:9': {
    length: 471,
    fairwayFrom: 160,
    fairwayTo: 446,
    greenDepth: 45,
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
    fairwayTo: 441,
    greenDepth: 34,
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
    fairwayTo: 380,
    greenDepth: 31,
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
    fairwayTo: 641,
    greenDepth: 39,
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
    fairwayTo: 165,
    greenDepth: 37,
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
    fairwayTo: 356,
    greenDepth: 45,
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
    fairwayTo: 484,
    greenDepth: 45,
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
    fairwayTo: 217,
    greenDepth: 36,
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
    fairwayTo: 303,
    greenDepth: 23,
    zones: [
      { id: 'z1', kind: 'bunker', from: 218, to: 273, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 296, to: 317, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 303, to: 317, side: 'left' },
    ],
  },
  'oakmont:18': {
    length: 505,
    fairwayFrom: 188,
    fairwayTo: 486,
    greenDepth: 34,
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
    fairwayTo: 400,
    greenDepth: 30,
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
    fairwayTo: 537,
    greenDepth: 32,
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
    fairwayTo: 143,
    greenDepth: 22,
    zones: [
      { id: 'z1', kind: 'bunker', from: 90, to: 98, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 98, to: 108, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 120, to: 152, side: 'right' },
    ],
  },
  'cypress-point:4': {
    length: 390,
    fairwayFrom: 137,
    fairwayTo: 373,
    greenDepth: 30,
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
    fairwayTo: 471,
    greenDepth: 28,
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
    fairwayTo: 510,
    greenDepth: 21,
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
    fairwayTo: 343,
    greenDepth: 21,
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
    fairwayTo: 464,
    greenDepth: 21,
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
    fairwayTo: 418,
    greenDepth: 33,
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
    fairwayTo: 391,
    greenDepth: 30,
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
    fairwayTo: 371,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'bunker', from: 326, to: 346, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 356, to: 388, side: 'left' },
    ],
  },
  'cypress-point:14': {
    length: 394,
    fairwayFrom: 142,
    fairwayTo: 380,
    greenDepth: 24,
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
    fairwayTo: 203,
    greenDepth: 34,
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
    fairwayTo: 378,
    greenDepth: 22,
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
    fairwayTo: 329,
    greenDepth: 24,
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
    fairwayTo: 479,
    greenDepth: 24,
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
    fairwayTo: 581,
    greenDepth: 28,
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
    fairwayTo: 168,
    greenDepth: 35,
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
    fairwayTo: 474,
    greenDepth: 36,
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
    fairwayTo: 586,
    greenDepth: 30,
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
    fairwayTo: 202,
    greenDepth: 34,
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
    fairwayTo: 486,
    greenDepth: 36,
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
    fairwayTo: 423,
    greenDepth: 33,
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
    fairwayTo: 377,
    greenDepth: 23,
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
    fairwayTo: 630,
    greenDepth: 25,
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
    fairwayTo: 382,
    greenDepth: 35,
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
    fairwayTo: 379,
    greenDepth: 29,
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
    fairwayTo: 481,
    greenDepth: 39,
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
    fairwayTo: 548,
    greenDepth: 35,
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
    fairwayTo: 233,
    greenDepth: 27,
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
    fairwayTo: 507,
    greenDepth: 21,
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
    fairwayTo: 423,
    greenDepth: 29,
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
    fairwayTo: 604,
    greenDepth: 26,
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
    fairwayTo: 204,
    greenDepth: 37,
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
    fairwayTo: 349,
    greenDepth: 27,
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
    fairwayTo: 465,
    greenDepth: 33,
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
    fairwayTo: 433,
    greenDepth: 34,
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
    fairwayTo: 450,
    greenDepth: 29,
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
    fairwayTo: 184,
    greenDepth: 30,
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
    fairwayTo: 539,
    greenDepth: 37,
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
    fairwayTo: 454,
    greenDepth: 28,
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
    fairwayTo: 150,
    greenDepth: 32,
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
    fairwayTo: 346,
    greenDepth: 23,
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
    fairwayTo: 284,
    greenDepth: 25,
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
    fairwayTo: 473,
    greenDepth: 29,
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
    fairwayTo: 208,
    greenDepth: 24,
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
    fairwayTo: 447,
    greenDepth: 31,
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
    fairwayTo: 382,
    greenDepth: 41,
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
    fairwayTo: 436,
    greenDepth: 35,
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
    fairwayTo: 539,
    greenDepth: 34,
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
    fairwayTo: 482,
    greenDepth: 32,
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
    fairwayTo: 187,
    greenDepth: 29,
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
    fairwayTo: 382,
    greenDepth: 31,
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
    fairwayTo: 422,
    greenDepth: 32,
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
    fairwayTo: 236,
    greenDepth: 35,
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
    fairwayTo: 533,
    greenDepth: 27,
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
    fairwayTo: 398,
    greenDepth: 33,
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
    fairwayTo: 441,
    greenDepth: 40,
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
    fairwayTo: 352,
    greenDepth: 27,
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
    fairwayTo: 154,
    greenDepth: 31,
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
    fairwayTo: 496,
    greenDepth: 29,
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
    fairwayTo: 521,
    greenDepth: 24,
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
    fairwayTo: 386,
    greenDepth: 30,
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
    fairwayTo: 158,
    greenDepth: 41,
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
    fairwayTo: 417,
    greenDepth: 39,
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
    fairwayTo: 335,
    greenDepth: 27,
    zones: [
      { id: 'z1', kind: 'water', from: 118, to: 146, side: 'left' },
      { id: 'z2', kind: 'water', from: 250, to: 351, side: 'left' },
    ],
  },
  'kings-creek:2': {
    length: 340,
    fairwayFrom: 140,
    fairwayTo: 324,
    greenDepth: 28,
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
    fairwayTo: 380,
    greenDepth: 22,
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
    fairwayTo: 151,
    greenDepth: 21,
    zones: [
      { id: 'z1', kind: 'water', from: 5, to: 9, side: 'right' },
    ],
  },
  'kings-creek:7': {
    length: 515,
    fairwayFrom: 185,
    fairwayTo: 500,
    greenDepth: 25,
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
    fairwayTo: 427,
    greenDepth: 28,
    zones: [
      { id: 'z1', kind: 'water', from: 397, to: 443, side: 'right' },
    ],
  },
  'kings-creek:11': {
    length: 151,
    fairwayFrom: 52,
    fairwayTo: 138,
    greenDepth: 21,
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
    fairwayTo: 401,
    greenDepth: 24,
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
    fairwayTo: 261,
    greenDepth: 26,
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
    fairwayTo: 176,
    greenDepth: 25,
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
    fairwayTo: 558,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 340, side: 'left' },
      { id: 'z2', kind: 'water', from: 22, to: 116, side: 'right' },
      { id: 'z3', kind: 'water', from: 334, to: 364, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 546, to: 560, side: 'left' },
    ],
  },

  // ---- Torrey Pines — South (all 18) ------------------------------------
  // Card = the BLACK tees (BlueGolf `torreypinessouth`): par 72, 7802 yd.
  // OSM's own `par` AND `handicap` tags match that card on all 18, and
  // ProVisualizer's independent satellite measurement lands within 3 yd of it
  // on 16 of 18 holes — so the card is unusually well corroborated here.
  // Zones are SHIFTED onto the card per hole (never scaled), except hole 6.
  //
  // Every centreline starts on a `golf=tee` polygon and ends on a `golf=green`
  // (the TPC Potomac check, 18 of 18), so no hole runs to a neighbour's green.
  //
  // Five deviations from the raw import, each measured rather than eyeballed:
  //
  // 1. HOLE 10 imported 36 yd SHORT (419 arc vs 454 card) — OSM drew its
  //    centreline from a forward pad. ProVisualizer measures 457, confirming
  //    the card, so every zone is shifted +36 (royal-portrush-dunluce:14
  //    rationale). Its greenside sand lands at 427-454 beside a 434-454 green.
  //
  // 2. HOLE 6 imported 22 yd LONG (591 arc vs 564 card, 562 by ProVisualizer)
  //    and is the ONLY hole here where a shift would have been wrong. Its tee
  //    and green endpoints are both correct; the excess is curvature in a
  //    wandering polyline (bend max 65 yd, the biggest on the course). Proof:
  //    each fairway bunker's straight-line distance from the tee matches its
  //    ARC position to within 2 yd (312-333 vs 304-326, 379-398 vs 378-398),
  //    so a blind -22 shift would have walked the driving-zone sand ~25 yd
  //    back from where it measurably is. Zones are instead remapped through
  //    arc -> straight-line-from-tee (1:1 to the dogleg at 300 yd, then
  //    compressing) with a -5 correction to land the pin on the card.
  //
  // 3. HOLES 3 and 8 each imported ONE greenside bunker as TWO overlapping
  //    zones — a `cross` slice inside a flanking slice (3: 180-186 inside
  //    178-188; 8: 146-152 inside 152-164) — because a single polygon that
  //    straddles the line rasterises to a different `side` at different
  //    along-samples. Measured, each is one bunker fronting the green
  //    (3: way/903058692, along 178-189, lateral -15..+7; 8: way/35974273,
  //    along 143-164, lateral -16..+6), abutting a green that starts at 189
  //    and 165. Modelled as one `cross` each: a front bunker on a par 3 is a
  //    genuine carry, but it is ONE hazard, not two.
  //
  // 4. HOLE 18's pond imported as three slices (water left / cross / left)
  //    from one `golf=water_hazard` way whose edge wobbles across the coarse
  //    centreline — the phantom-cross half of the broken-lateral mode. The
  //    polygon runs along 518-556 at lateral -22..+4, i.e. overwhelmingly
  //    down ONE side, and straddles at only 6 of 19 samples: a lateral
  //    hazard, not a forced carry. Merged into one continuous `water` left,
  //    which is also what the hole's `signature` promises.
  //
  // 5. THE CANYONS (holes 3, 4, 6, 13, 17) are the course's defining hazard
  //    and OSM has NOT ONE polygon for them — no `natural=scrub`, no
  //    `natural=wood` anywhere inside or within 900 m of the boundary, so the
  //    import came back sand-only and read the canyon side of five holes as
  //    open ground. This is the Carnoustie-gorse gap (hand-author `deeprough`
  //    where vegetation defines a hole; harbour-town:18's trees are the
  //    precedent). Rather than draw them by eye, the rims were MEASURED: USGS
  //    NED 10m elevation transects (the same source ProVisualizer quotes)
  //    every 10 yd along each centreline, sampling +/-20..60 yd, taking the
  //    nearest offset whose ground sits >= 6 m below the playing line. A zone
  //    is authored ONLY where that rim falls inside the importer's own 50-yd
  //    corridor, and it spans exactly the measured run — these ARE the runs:
  //      h3  left  110-190          (rim 30-40; the canyon left of the green)
  //      h4  left  10-480           (rim 30-50; the bluff, 8-16 m deep)
  //      h6  right 5-255            (rim 30-50; matches the tee-view imagery)
  //      h13 left  10-230           (rim 20-40; the closest rim on the course)
  //      h17 left  10-120, 210-340  (rim 20-40 / 40-50)
  //    Two merges, both because the rim wanders just past 50 yd for a stretch
  //    of a feature the imagery shows unbroken, and a hole in a continuous
  //    hazard rewards an aggressive line for the wrong reason (the
  //    broken-lateral-hazard mode in scripts/README.md): h4 spans gaps at
  //    120-140 and 350-410, h17 spans 240-270. h17's 120-210 gap is NOT
  //    merged — 90 yd is too long to call one hazard, so that hole carries
  //    two zones. Nothing is extrapolated past a measured endpoint.
  //    Holes 2, 7, 8, 9, 14, 15 and 16 also fall away, but at 55-70 yd —
  //    outside the corridor — so they were deliberately left alone, the same
  //    call that cleared whistling-straits:9/18. Holes 1, 5, 10, 11, 12 and 18
  //    have no drop at all within 70 yd. Hole 6 has a second, LEFT rim over
  //    10-50 yd; it is tee-adjacent and unreachable, so it is not authored.
  //
  // Zone `side` was calibrated against the importer's own output on holes 6,
  // 10 and 18 before any of this was written, and the canyon sides were then
  // checked against the 3D planner's tee views (6 right, 13 left, 17 left).
  // Data (c) OpenStreetMap contributors, ODbL. Terrain: USGS 3DEP/NED.
  'torrey-pines-south:1': {
    length: 451,
    fairwayFrom: 161,
    fairwayTo: 435,
    greenDepth: 28,
    zones: [
      { id: 'z1', kind: 'bunker', from: 55, to: 75, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 281, to: 297, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 289, to: 321, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 321, to: 335, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 427, to: 449, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 433, to: 451, side: 'left' },
    ],
  },
  'torrey-pines-south:2': {
    length: 389,
    fairwayFrom: 136,
    fairwayTo: 372,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'bunker', from: 261, to: 281, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 267, to: 313, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 359, to: 385, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 365, to: 387, side: 'right' },
    ],
  },
  'torrey-pines-south:3': {
    length: 201,
    fairwayFrom: 71,
    fairwayTo: 189,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'deeprough', from: 110, to: 190, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 179, to: 190, side: 'cross' },
    ],
  },
  'torrey-pines-south:4': {
    length: 490,
    fairwayFrom: 173,
    fairwayTo: 474,
    greenDepth: 28,
    zones: [
      { id: 'z1', kind: 'deeprough', from: 10, to: 480, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 276, to: 328, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 460, to: 470, side: 'left' },
    ],
  },
  'torrey-pines-south:5': {
    length: 454,
    fairwayFrom: 160,
    fairwayTo: 438,
    greenDepth: 27,
    zones: [
      { id: 'z1', kind: 'bunker', from: 279, to: 315, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 279, to: 321, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 427, to: 445, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 433, to: 454, side: 'right' },
    ],
  },
  'torrey-pines-south:6': {
    length: 564,
    fairwayFrom: 200,
    fairwayTo: 545,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'deeprough', from: 5, to: 255, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 95, to: 121, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 169, to: 199, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 301, to: 350, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 363, to: 380, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 539, to: 552, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 542, to: 559, side: 'right' },
    ],
  },
  'torrey-pines-south:7': {
    length: 462,
    fairwayFrom: 162,
    fairwayTo: 446,
    greenDepth: 28,
    zones: [
      { id: 'z1', kind: 'bunker', from: 54, to: 74, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 268, to: 298, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 310, to: 324, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 434, to: 462, side: 'right' },
    ],
  },
  'torrey-pines-south:8': {
    length: 177,
    fairwayFrom: 63,
    fairwayTo: 165,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 145, to: 166, side: 'cross' },
    ],
  },
  'torrey-pines-south:9': {
    length: 615,
    fairwayFrom: 214,
    fairwayTo: 600,
    greenDepth: 25,
    zones: [
      { id: 'z1', kind: 'bunker', from: 298, to: 314, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 304, to: 322, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 328, to: 350, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 334, to: 344, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 492, to: 510, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 546, to: 556, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 576, to: 614, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 596, to: 615, side: 'right' },
    ],
  },
  'torrey-pines-south:10': {
    length: 454,
    fairwayFrom: 182,
    fairwayTo: 439,
    greenDepth: 26,
    zones: [
      { id: 'z1', kind: 'bunker', from: 36, to: 72, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 278, to: 302, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 318, to: 334, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 428, to: 452, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 432, to: 454, side: 'left' },
    ],
  },
  'torrey-pines-south:11': {
    length: 225,
    fairwayFrom: 81,
    fairwayTo: 208,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'bunker', from: 201, to: 211, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 207, to: 225, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 223, to: 225, side: 'left' },
    ],
  },
  'torrey-pines-south:12': {
    length: 505,
    fairwayFrom: 179,
    fairwayTo: 487,
    greenDepth: 32,
    zones: [
      { id: 'z1', kind: 'bunker', from: 279, to: 311, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 305, to: 333, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 479, to: 499, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 491, to: 505, side: 'right' },
    ],
  },
  'torrey-pines-south:13': {
    length: 621,
    fairwayFrom: 218,
    fairwayTo: 607,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'deeprough', from: 10, to: 230, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 279, to: 293, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 303, to: 319, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 333, to: 399, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 579, to: 613, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 587, to: 609, side: 'left' },
    ],
  },
  'torrey-pines-south:14': {
    length: 437,
    fairwayFrom: 155,
    fairwayTo: 424,
    greenDepth: 22,
    zones: [
      { id: 'z1', kind: 'bunker', from: 273, to: 305, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 403, to: 429, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 421, to: 437, side: 'right' },
    ],
  },
  'torrey-pines-south:15': {
    length: 517,
    fairwayFrom: 182,
    fairwayTo: 502,
    greenDepth: 25,
    zones: [
      { id: 'z1', kind: 'bunker', from: 220, to: 242, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 498, to: 517, side: 'right' },
    ],
  },
  'torrey-pines-south:16': {
    length: 227,
    fairwayFrom: 80,
    fairwayTo: 212,
    greenDepth: 26,
    zones: [
      { id: 'z1', kind: 'bunker', from: 197, to: 227, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 211, to: 227, side: 'right' },
    ],
  },
  'torrey-pines-south:17': {
    length: 443,
    fairwayFrom: 159,
    fairwayTo: 429,
    greenDepth: 23,
    zones: [
      { id: 'z1', kind: 'deeprough', from: 10, to: 120, side: 'left' },
      { id: 'z2', kind: 'deeprough', from: 210, to: 340, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 266, to: 324, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 414, to: 432, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 424, to: 436, side: 'left' },
    ],
  },
  'torrey-pines-south:18': {
    length: 570,
    fairwayFrom: 200,
    fairwayTo: 558,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 114, to: 128, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 274, to: 318, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 314, to: 354, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 342, to: 358, side: 'left' },
      { id: 'z5', kind: 'water', from: 518, to: 556, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 556, to: 570, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 560, to: 570, side: 'right' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Pacific Dunes (Bandon, OR) — Tom Doak, 2001. Imported from OSM; all 18
  // centrelines are mapped. Pure geometry: the shipped tuple already matched
  // the club's BLACK card (6633 yd, par 71) on par, yardage AND stroke index
  // for all 18, so nothing in courses.ts moved.
  //
  // IDENTITY. Pacific Dunes has no golf_course polygon of its own — it shares
  // way 362513477 ("Bandon Dunes Golf Resort") with the Bandon Dunes course
  // and Old Macdonald, 54 hole ways under three complete sets of ref=1..18.
  // `osmHolePrefix` is doing the whole identity check, and it deliberately
  // stops before "Hole" because five ways carry a DOUBLE SPACE ("Pacific
  // Dunes  Hole 5", likewise 8/9/10/11). See COURSE_GEO in scripts/import-osm.ts.
  //
  // YARDAGE. Every centreline is drawn from a FORWARD pad, so all 18 imported
  // short — by 3 to 110 yd, wildly unevenly, exactly the per-hole spread
  // Seminole warned about. Diagnosed at the tee end rather than assumed:
  // every line starts inside a `golf=tee` polygon and ends within 9 yd of its
  // green's CENTROID, so nothing is missing at the green and the whole deficit
  // sits behind the tee. Corroborated twice — 13 of 18 gaps land within ~10 yd
  // of a real mapped back-tee pad (15 and 16 dead-on), and ProVisualizer's own
  // yardages confirm the four biggest shifts (h8 402 vs card 400, h15 544/539,
  // h16 341/338, h17 210/208). So zones are SHIFTED by (card - import), never
  // scaled. `fairwayFrom`/`fairwayTo` are DERIVED from length in the importer
  // (0.35*L; L - greenDepth/2 - 2), not measured, so they are recomputed from
  // the card length rather than shifted.
  //
  // THE OCEAN, which imported as NOTHING. This is the course named for the
  // Pacific and the raw import had zero water or ocean zones on all 18 holes —
  // the red flag from scripts/README.md at its loudest. Cause: the
  // `natural=coastline` way is drawn at the WATERLINE, 103-210 yd out across a
  // beach, so no rake sample ever lands seaward of it, and the importer's
  // outward OCEAN_REACH probe only runs once a near-rake hit exists. The real
  // hazard at Bandon is the BLUFF, and OSM maps no cliff here at all (one
  // `natural=beach` polygon, no `natural=cliff`).
  // So the rims were MEASURED, by the Torrey Pines recipe exactly: USGS NED
  // 10m (3DEP) transects every 10 yd along each centreline, sampling +/-20..60
  // yd, taking the nearest offset whose ground sits >= 6 m below the playing
  // line, authoring a zone only where that rim falls inside the importer's own
  // 50-yd corridor and spanning exactly the measured run. These ARE the runs,
  // in import coordinates before the shift:
  //   h4  right 0-390  (rim 20-40)   h11 left 0-100  (rim 20-30)
  //   h13 left  0-410  (rim 30-50)
  // The ground falls MONOTONICALLY from ~31 m on the playing line to ~7 m at
  // 60 yd and keeps going to a sea-level beach — h11 drops 22 m inside 60 yd —
  // which is what separates a bluff from a dune hollow, and the rim side
  // matches the measured ocean side on all three.
  // It declined the other fifteen, which is the point of measuring. Hole 10
  // is the one that matters: its tuple declares `hazard: 'ocean'`, but its
  // nearest drop is at 60 yd, OUTSIDE the corridor, and the tee view shows the
  // Pacific sitting beyond the green behind a wide dune shelf — the same call
  // that cleared whistling-straits:9/18. Hole 3 likewise declares `ocean` and
  // measures out. Both are left alone: `hazard` only feeds the PROCEDURAL
  // layout, so it is inert once a hole has real geometry, and no `signature`
  // on this course names water on 3 or 10. Do not "fix" the geometry to match
  // that field. Hole 18 has a 5-station drop at 40-50 yd right over 0-40 yd —
  // a dune swale beside the tee, 813 yd from the ocean and unreachable, so not
  // authored. Nothing is extrapolated: h4's zone starts at 68, the shifted
  // position of the mapped tee, because the 68 yd behind it were never sampled.
  // `ocean` (not `deeprough`) is the honest kind here — over the rim is the
  // beach and the Pacific, a lost ball, and KIND_BUCKET puts ocean in the
  // penalty-carrying `water` bucket where Torrey's recoverable scrub canyons
  // sit in `trees`. It is also what makes h11's and h13's `signature` strings
  // true; before this pass both named an ocean the map did not contain.
  //
  // HAND-FIXES, both the same artifact: a single polygon that reaches only the
  // FIRST rake offset past the centreline (-2 yd) earns `cross` off that one
  // sample, which reads as a full-width forced carry.
  //   h3  the 46-76 `trees` cross is way/1098554089, a scrub mass spanning
  //       lateral -2..46 — i.e. entirely LEFT bar 2 yd — and a forced carry
  //       50 yd off the tee of a 499-yd par 5 is a hole nobody plays. The tee
  //       view shows clear ground there. Folded into the left flank, which
  //       merges with its neighbours into one 0-100 left zone.
  //   h11 the 112-118 `bunker` cross is way/1098412203, lateral -2..10.
  //       Folded into the adjoining left bunker (112-126); the right-flank
  //       zone at 104-130 already covers the other side, which is the ordinary
  //       two-flanking-bunkers shape the importer's own rule is built for.
  // No `osmIgnore`: the Seminole mis-tagged-scrub check was run and came back
  // clean — the giant `golf=bunker`+`natural=sand` polygons here (6.4, 2.0,
  // 0.9 acres against a 0.017 median) touch ZERO Pacific Dunes corridors, and
  // only 2 bunkers straddle 3+ corridors. No `packed` either: of the 105
  // bunkers reaching a corridor, none is nearer a neighbouring course's line.
  // No landmark — the course has no built structure anyone would recognise.
  // Data (c) OpenStreetMap contributors, ODbL. Terrain: USGS 3DEP/NED.
  'pacific-dunes:1': {
    length: 370,
    fairwayFrom: 130,
    fairwayTo: 352,
    greenDepth: 33,
    zones: [
      { id: 'z1', kind: 'bunker', from: 157, to: 249, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 279, to: 299, side: 'right' },
      { id: 'z3', kind: 'trees', from: 345, to: 370, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 349, to: 361, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 363, to: 370, side: 'left' },
    ],
  },
  'pacific-dunes:2': {
    length: 368,
    fairwayFrom: 129,
    fairwayTo: 346,
    greenDepth: 39,
    zones: [
      { id: 'z1', kind: 'trees', from: 31, to: 65, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 47, to: 61, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 61, to: 99, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 95, to: 109, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 111, to: 121, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 215, to: 243, side: 'left' },
      { id: 'z7', kind: 'trees', from: 275, to: 319, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 319, to: 343, side: 'right' },
    ],
  },
  // z1: the raw import split this into left 0-46 / cross 46-76 / left 72-100 —
  // one scrub mass, folded back into a single left zone (see HAND-FIXES above).
  'pacific-dunes:3': {
    length: 499,
    fairwayFrom: 175,
    fairwayTo: 485,
    greenDepth: 25,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 100, side: 'left' },
      { id: 'z2', kind: 'trees', from: 102, to: 178, side: 'right' },
      { id: 'z3', kind: 'trees', from: 130, to: 174, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 174, to: 188, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 230, to: 256, side: 'left' },
      { id: 'z6', kind: 'trees', from: 232, to: 270, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 296, to: 326, side: 'left' },
      { id: 'z8', kind: 'trees', from: 360, to: 394, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 376, to: 404, side: 'left' },
      { id: 'z10', kind: 'trees', from: 436, to: 456, side: 'right' },
      { id: 'z11', kind: 'trees', from: 458, to: 476, side: 'left' },
      { id: 'z12', kind: 'trees', from: 472, to: 499, side: 'right' },
      { id: 'z13', kind: 'bunker', from: 474, to: 499, side: 'right' },
    ],
  },
  // z1: hand-authored bluff, 3DEP-measured (see THE OCEAN above).
  'pacific-dunes:4': {
    length: 463,
    fairwayFrom: 162,
    fairwayTo: 439,
    greenDepth: 45,
    zones: [
      { id: 'z1', kind: 'ocean', from: 68, to: 458, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 246, to: 296, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 406, to: 424, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 434, to: 446, side: 'left' },
    ],
  },
  'pacific-dunes:5': {
    length: 199,
    fairwayFrom: 70,
    fairwayTo: 175,
    greenDepth: 45,
    zones: [
      { id: 'z1', kind: 'bunker', from: 63, to: 75, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 131, to: 159, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 155, to: 173, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 189, to: 199, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 191, to: 199, side: 'right' },
    ],
  },
  'pacific-dunes:6': {
    length: 316,
    fairwayFrom: 111,
    fairwayTo: 304,
    greenDepth: 21,
    zones: [
      { id: 'z1', kind: 'bunker', from: 15, to: 43, side: 'left' },
      { id: 'z2', kind: 'trees', from: 97, to: 143, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 193, to: 213, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 279, to: 309, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 281, to: 309, side: 'right' },
    ],
  },
  'pacific-dunes:7': {
    length: 464,
    fairwayFrom: 162,
    fairwayTo: 440,
    greenDepth: 44,
    zones: [
      { id: 'z1', kind: 'bunker', from: 32, to: 46, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 44, to: 54, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 72, to: 80, side: 'right' },
      { id: 'z4', kind: 'trees', from: 136, to: 250, side: 'left' },
      { id: 'z5', kind: 'trees', from: 168, to: 218, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 410, to: 464, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 414, to: 438, side: 'right' },
    ],
  },
  'pacific-dunes:8': {
    length: 400,
    fairwayFrom: 140,
    fairwayTo: 387,
    greenDepth: 22,
    zones: [
      { id: 'z1', kind: 'trees', from: 110, to: 164, side: 'right' },
      { id: 'z2', kind: 'trees', from: 110, to: 214, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 194, to: 222, side: 'right' },
      { id: 'z4', kind: 'trees', from: 250, to: 300, side: 'right' },
      { id: 'z5', kind: 'trees', from: 286, to: 338, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 384, to: 396, side: 'right' },
    ],
  },
  'pacific-dunes:9': {
    length: 406,
    fairwayFrom: 142,
    fairwayTo: 382,
    greenDepth: 45,
    zones: [
      { id: 'z1', kind: 'trees', from: 39, to: 57, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 97, to: 123, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 185, to: 205, side: 'left' },
      { id: 'z4', kind: 'trees', from: 189, to: 209, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 225, to: 247, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 345, to: 357, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 355, to: 395, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 397, to: 406, side: 'right' },
    ],
  },
  // No ocean: the bluff here is 60 yd out, outside the corridor, and the tuple's
  // `hazard: 'ocean'` is inert once real geometry exists. See THE OCEAN above.
  // One zone on a 206-yd par 3 is bare but checked, not dropped: every
  // `golf=bunker` within 80 yd of this centreline was enumerated, and the sand
  // that looks greenside from above (ways 1098412203/04/05) hugs hole 11's line
  // and is assigned there — it sits BEYOND this green, between the two. OSM has
  // no bunker of hole 10's own inside the corridor. The dune sand around the
  // green is untagged terrain, and from directly overhead Bandon's dunes are not
  // reliably distinguishable from bunkers, so nothing was hand-authored here.
  // Compare tpc-potomac:15, which is simply that bare too.
  'pacific-dunes:10': {
    length: 206,
    fairwayFrom: 72,
    fairwayTo: 185,
    greenDepth: 38,
    zones: [
      { id: 'z1', kind: 'trees', from: 74, to: 128, side: 'left' },
    ],
  },
  // z1: hand-authored bluff, 3DEP-measured. z3 absorbed the 112-118 `cross`.
  'pacific-dunes:11': {
    length: 148,
    fairwayFrom: 52,
    fairwayTo: 130,
    greenDepth: 32,
    zones: [
      { id: 'z1', kind: 'ocean', from: 40, to: 140, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 104, to: 130, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 112, to: 126, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 140, to: 148, side: 'left' },
    ],
  },
  'pacific-dunes:12': {
    length: 529,
    fairwayFrom: 185,
    fairwayTo: 507,
    greenDepth: 39,
    zones: [
      { id: 'z1', kind: 'trees', from: 76, to: 128, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 196, to: 216, side: 'left' },
      { id: 'z3', kind: 'trees', from: 226, to: 250, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 380, to: 392, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 394, to: 410, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 490, to: 508, side: 'left' },
      { id: 'z7', kind: 'trees', from: 512, to: 528, side: 'left' },
    ],
  },
  // z2: hand-authored bluff, 3DEP-measured — this is the hole whose `signature`
  // says the ocean shoulders the whole fairway, and now it does. z5 is a chain
  // of seven mapped bunkers down the inland (right) side, merged by the
  // importer's own 8-yd rule and confirmed near-continuous in the tee view.
  'pacific-dunes:13': {
    length: 444,
    fairwayFrom: 155,
    fairwayTo: 420,
    greenDepth: 45,
    zones: [
      { id: 'z1', kind: 'trees', from: 30, to: 156, side: 'right' },
      { id: 'z2', kind: 'ocean', from: 30, to: 440, side: 'left' },
      { id: 'z3', kind: 'trees', from: 168, to: 194, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 248, to: 278, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 318, to: 444, side: 'right' },
      { id: 'z6', kind: 'trees', from: 376, to: 398, side: 'right' },
      { id: 'z7', kind: 'trees', from: 440, to: 444, side: 'right' },
    ],
  },
  'pacific-dunes:14': {
    length: 145,
    fairwayFrom: 51,
    fairwayTo: 125,
    greenDepth: 37,
    zones: [
      { id: 'z1', kind: 'bunker', from: 46, to: 72, side: 'right' },
      { id: 'z2', kind: 'trees', from: 46, to: 74, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 82, to: 112, side: 'right' },
      { id: 'z4', kind: 'trees', from: 96, to: 145, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 136, to: 145, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 140, to: 145, side: 'left' },
    ],
  },
  'pacific-dunes:15': {
    length: 539,
    fairwayFrom: 189,
    fairwayTo: 520,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'trees', from: 101, to: 131, side: 'right' },
      { id: 'z2', kind: 'trees', from: 153, to: 189, side: 'left' },
      { id: 'z3', kind: 'trees', from: 201, to: 255, side: 'right' },
      { id: 'z4', kind: 'trees', from: 215, to: 223, side: 'left' },
      { id: 'z5', kind: 'trees', from: 245, to: 283, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 315, to: 361, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 381, to: 401, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 445, to: 463, side: 'right' },
      { id: 'z9', kind: 'trees', from: 467, to: 539, side: 'right' },
    ],
  },
  'pacific-dunes:16': {
    length: 338,
    fairwayFrom: 118,
    fairwayTo: 320,
    greenDepth: 32,
    zones: [
      { id: 'z1', kind: 'trees', from: 126, to: 220, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 200, to: 212, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 260, to: 274, side: 'left' },
    ],
  },
  'pacific-dunes:17': {
    length: 208,
    fairwayFrom: 73,
    fairwayTo: 194,
    greenDepth: 25,
    zones: [
      { id: 'z1', kind: 'trees', from: 79, to: 115, side: 'right' },
      { id: 'z2', kind: 'trees', from: 83, to: 189, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 115, to: 149, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 181, to: 187, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 189, to: 208, side: 'left' },
    ],
  },
  'pacific-dunes:18': {
    length: 591,
    fairwayFrom: 207,
    fairwayTo: 574,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'trees', from: 5, to: 39, side: 'right' },
      { id: 'z2', kind: 'trees', from: 5, to: 275, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 193, to: 247, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 287, to: 375, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 373, to: 441, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 569, to: 591, side: 'right' },
    ],
  },
  // ---- Pine Valley (all 18) ---------------------------------------------
  // Card = the BACK tees (BlueGolf `pinevalley`): par 70, 7197 yd, 76.6/155.
  // OSM's own `par` tags match it on all 18 (it carries no `handicap` here),
  // and ProVisualizer's independent satellite measurement lands within 9 yd
  // on 15 of 18 — so the card is well corroborated. The shipped tuple was the
  // club's historic ~6,765 card, which is why 13 yardages and 16 stroke
  // indices moved in courses.ts.
  //
  // IDENTITY. The site holds a SECOND course — the 10-hole Short Course —
  // INSIDE the same golf_course polygon, with `ref=1..10` colliding with the
  // championship holes and NO names on any of the 28 ways, so osmHolePrefix
  // has nothing to match and nearest-centre is carrying the check. See the
  // COURSE_GEO note: it wins every colliding ref by 465-961 m. Independently,
  // all 18 centrelines start on a `golf=tee` polygon and end on a DISTINCT
  // `golf=green` (the TPC Potomac check), and ProVisualizer's tee sits within
  // 3 yd of the centreline start on 16 of 18 — two checks that would both
  // fail if the Short Course had leaked in.
  //
  // Pine Valley is wall-to-wall sand, so this course legitimately imports
  // more `cross` bands than any other in the library: on most holes you carry
  // waste to reach the fairway island. `--profile` rules every one REAL CARRY
  // (a single polygon spans the line), and mapped `golf=fairway` runs beside
  // only the four folded below. Treat a long cross here as the course being
  // honest, the way Whistling Straits' 29-zone holes are.
  //
  // LENGTHS. Zones are shifted onto the card per hole. Five needed more than
  // a constant, each diagnosed rather than assumed:
  //
  // 1. HOLES 6 and 17 imported 34 and 76 yd SHORT off FORWARD pads — the
  //    wrong-tee-pad case, confirmed by ProVisualizer's tee sitting 28 and 67
  //    yd behind the centreline start (every other hole: <= 3 yd). Re-imported
  //    with `--shift 34` / `--shift 76` rather than shifted afterwards, so the
  //    bend profiles are re-measured on the real back-tee chord and the
  //    prepended run is rasterised. That is what found 17's `water 44-88 left`
  //    — the lake beside its back tee, absent from the unshifted import. Both
  //    prepends land within 8-11 yd of ProVisualizer's tee (6-7 yd lateral),
  //    inside tee-pad width, so the straight-back assumption holds here.
  //
  // 2. HOLE 1 imported 24 yd SHORT with BOTH endpoints correct, so a shift
  //    would have been wrong. Its OSM centreline is only 3 points around a
  //    sharp dogleg right, and Chaikin rounds the corner off: the RAW polyline
  //    measures 415 yd against the card's 421, while the smoothed line the
  //    rasteriser walks measures 397. The corner is genuinely that sharp —
  //    ProVisualizer routes the hole 260 + 165 against a 349-yd chord, which
  //    puts its corner ~117 yd off the chord, MORE than OSM's 77. So the
  //    excess is smoothing, not geography: zones are remapped smoothed-arc ->
  //    RAW-arc (+6 to land the pin on the card) instead of shifted.
  //
  // 3. HOLES 13 and 16 imported 21 and 15 yd LONG, the mirror of hole 1 and
  //    the same call as torrey-pines-south:6 — endpoints correct, the excess
  //    is curvature in a wandering polyline. Both are effectively straight
  //    (chord 482 vs card 486; chord 472 vs card 475), so they are remapped
  //    arc -> straight-line-from-tee with a +4 / +3 correction. A blind shift
  //    would have walked hole 13's second-shot sand ~36 yd back from where
  //    ProVisualizer measures it.
  //
  // HAND-FIXES beyond the length work, all against the 3D planner:
  //
  //  h1  a 3-yd `cross` at 271 was the left waste (275-297) nicking the
  //      coarse line — mapped fairway runs beside it for half its span, so it
  //      is lateral. Folded into that zone (now 271-297).
  //  h2  a 4-yd `cross` at 333 ran PAST the green edge (331) — the Cypress
  //      greenside-ring mode. It sits wholly inside the 319-365 left zone,
  //      so dropped rather than duplicated.
  //  h4  three 4-6 yd `cross` slivers (104, 134, 162) are the wobbling EDGE
  //      of the one left waste at 86-192, which already spans them — the
  //      broken-lateral mode in miniature. Dropped. Separately the 230-248
  //      `cross` has mapped fairway beside it for 46% of its span (the
  //      seminole:11 test), so it is a lateral hazard the hole plays around,
  //      folded into the right flank (now 230-308).
  //  h6  `trees 0-6 cross` is the pine chute the tee sits in, not a carry —
  //      you are never asked to fly trees 6 yd off a tee. Dropped.
  //  h7  the 100-194 `cross` likewise has fairway beside it for 36% of its
  //      span; folded into the left waste (now 24-194). Hell's Half Acre is
  //      the OTHER one, 360-440, which has no fairway beside it at all — that
  //      is the carry the hole's `signature` promises, and it is real.
  //      The 590-608 front bunker is trimmed to 606, the green edge.
  //  h17 `trees 20-48 cross` is the same tee chute as h6, on the prepended
  //      back-tee run. Dropped.
  //  h18 the 435-447 front bunker is trimmed to 445, the green edge.
  //
  // COPY CHECK. h5 "the hardest hole in the world" — a 238-yd par 3 ringed by
  // sand (142-234 left, 172-238 right) and fronted by a water carry at 62-110.
  // h7 "Hell's Half Acre" — the 80-yd cross at 360-440, on the second shot of
  // a 636-yd par 5, as promised. h10 "a pit you don't climb out of" — the
  // greenside sand at 122-158 / 130-158 either side of a green starting at
  // 137. All three are present at the right yardage. No landmark: Pine Valley
  // has no structure a golfer would recognise from the map.
  //
  // Water: six tagged hazards, all inside the course. Hole 16's reads RIGHT
  // (lateral -67..-22 yd) — the 3D view rotates and reads left at a glance,
  // which is why it was checked against the polygon rather than the picture.
  'pine-valley:1': {
    length: 421,
    fairwayFrom: 145,
    fairwayTo: 400,
    greenDepth: 37,
    zones: [
      { id: 'z1', kind: 'bunker', from: 6, to: 38, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 60, to: 80, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 66, to: 152, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 132, to: 136, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 150, to: 406, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 178, to: 219, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 271, to: 297, side: 'left' },
      { id: 'z8', kind: 'trees', from: 322, to: 421, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 398, to: 421, side: 'left' },
    ],
  },
  'pine-valley:2': {
    length: 368,
    fairwayFrom: 123,
    fairwayTo: 347,
    greenDepth: 37,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 3, side: 'left' },
      { id: 'z2', kind: 'trees', from: 0, to: 125, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 63, to: 75, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 75, to: 131, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 125, to: 133, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 129, to: 133, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 147, to: 233, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 155, to: 235, side: 'right' },
      { id: 'z9', kind: 'trees', from: 177, to: 217, side: 'right' },
      { id: 'z10', kind: 'trees', from: 233, to: 303, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 281, to: 345, side: 'right' },
      { id: 'z12', kind: 'bunker', from: 289, to: 313, side: 'cross' },
      { id: 'z13', kind: 'bunker', from: 319, to: 365, side: 'left' },
      { id: 'z14', kind: 'bunker', from: 359, to: 368, side: 'right' },
    ],
  },
  'pine-valley:3': {
    length: 198,
    fairwayFrom: 64,
    fairwayTo: 176,
    greenDepth: 40,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 22, side: 'left' },
      { id: 'z2', kind: 'trees', from: 0, to: 198, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 34, to: 44, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 34, to: 48, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 36, to: 152, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 102, to: 112, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 152, to: 198, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 152, to: 198, side: 'left' },
    ],
  },
  'pine-valley:4': {
    length: 499,
    fairwayFrom: 175,
    fairwayTo: 481,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 56, side: 'left' },
      { id: 'z2', kind: 'trees', from: 0, to: 424, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 62, to: 72, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 86, to: 192, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 190, to: 218, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 190, to: 230, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 230, to: 308, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 344, to: 352, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 348, to: 372, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 360, to: 370, side: 'cross' },
      { id: 'z11', kind: 'bunker', from: 412, to: 476, side: 'right' },
      { id: 'z12', kind: 'bunker', from: 450, to: 499, side: 'left' },
    ],
  },
  'pine-valley:5': {
    length: 238,
    fairwayFrom: 83,
    fairwayTo: 221,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'water', from: 32, to: 62, side: 'left' },
      { id: 'z2', kind: 'water', from: 62, to: 110, side: 'cross' },
      { id: 'z3', kind: 'trees', from: 62, to: 114, side: 'right' },
      { id: 'z4', kind: 'trees', from: 62, to: 208, side: 'left' },
      { id: 'z5', kind: 'water', from: 110, to: 166, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 142, to: 234, side: 'left' },
      { id: 'z7', kind: 'trees', from: 162, to: 238, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 168, to: 172, side: 'cross' },
      { id: 'z9', kind: 'bunker', from: 172, to: 238, side: 'right' },
    ],
  },
  'pine-valley:6': {
    length: 444,
    fairwayFrom: 155,
    fairwayTo: 427,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 58, side: 'right' },
      { id: 'z2', kind: 'trees', from: 6, to: 24, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 74, to: 382, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 82, to: 98, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 92, to: 102, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 118, to: 172, side: 'cross' },
      { id: 'z7', kind: 'trees', from: 134, to: 218, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 320, to: 434, side: 'left' },
      { id: 'z9', kind: 'trees', from: 348, to: 444, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 392, to: 444, side: 'right' },
    ],
  },
  'pine-valley:7': {
    length: 636,
    fairwayFrom: 217,
    fairwayTo: 619,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 32, side: 'left' },
      { id: 'z2', kind: 'trees', from: 6, to: 468, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 24, to: 194, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 72, to: 114, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 142, to: 146, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 194, to: 210, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 342, to: 364, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 356, to: 400, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 360, to: 440, side: 'cross' },
      { id: 'z10', kind: 'bunker', from: 402, to: 410, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 416, to: 430, side: 'left' },
      { id: 'z12', kind: 'bunker', from: 440, to: 454, side: 'right' },
      { id: 'z13', kind: 'bunker', from: 456, to: 484, side: 'left' },
      { id: 'z14', kind: 'bunker', from: 494, to: 522, side: 'left' },
      { id: 'z15', kind: 'bunker', from: 532, to: 628, side: 'left' },
      { id: 'z16', kind: 'bunker', from: 590, to: 606, side: 'cross' },
      { id: 'z17', kind: 'bunker', from: 604, to: 622, side: 'right' },
      { id: 'z18', kind: 'bunker', from: 634, to: 636, side: 'right' },
    ],
  },
  'pine-valley:8': {
    length: 326,
    fairwayFrom: 113,
    fairwayTo: 314,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 48, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 2, to: 40, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 34, to: 128, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 58, to: 66, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 128, to: 244, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 134, to: 242, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 252, to: 326, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 266, to: 326, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 300, to: 304, side: 'cross' },
    ],
  },
  'pine-valley:9': {
    length: 458,
    fairwayFrom: 158,
    fairwayTo: 441,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'bunker', from: 41, to: 139, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 75, to: 83, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 83, to: 99, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 99, to: 113, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 113, to: 181, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 181, to: 201, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 181, to: 253, side: 'left' },
      { id: 'z8', kind: 'trees', from: 197, to: 339, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 245, to: 259, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 279, to: 291, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 279, to: 458, side: 'right' },
      { id: 'z12', kind: 'bunker', from: 317, to: 445, side: 'left' },
      { id: 'z13', kind: 'trees', from: 363, to: 458, side: 'left' },
    ],
  },
  'pine-valley:10': {
    length: 161,
    fairwayFrom: 58,
    fairwayTo: 147,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'bunker', from: 3, to: 23, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 3, to: 123, side: 'left' },
      { id: 'z3', kind: 'trees', from: 19, to: 157, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 53, to: 101, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 101, to: 133, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 125, to: 161, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 133, to: 161, side: 'left' },
    ],
  },
  'pine-valley:11': {
    length: 397,
    fairwayFrom: 138,
    fairwayTo: 382,
    greenDepth: 26,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 53, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 0, to: 65, side: 'right' },
      { id: 'z3', kind: 'trees', from: 5, to: 159, side: 'left' },
      { id: 'z4', kind: 'trees', from: 49, to: 397, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 53, to: 127, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 127, to: 131, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 319, to: 395, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 331, to: 397, side: 'left' },
    ],
  },
  'pine-valley:12': {
    length: 358,
    fairwayFrom: 127,
    fairwayTo: 336,
    greenDepth: 40,
    zones: [
      { id: 'z1', kind: 'bunker', from: 2, to: 26, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 56, to: 194, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 68, to: 358, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 106, to: 134, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 162, to: 178, side: 'cross' },
      { id: 'z6', kind: 'trees', from: 246, to: 358, side: 'right' },
    ],
  },
  'pine-valley:13': {
    length: 486,
    fairwayFrom: 181,
    fairwayTo: 476,
    greenDepth: 25,
    zones: [
      { id: 'z1', kind: 'trees', from: 4, to: 10, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 4, to: 18, side: 'right' },
      { id: 'z3', kind: 'trees', from: 4, to: 286, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 34, to: 50, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 80, to: 86, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 98, to: 176, side: 'right' },
      { id: 'z7', kind: 'trees', from: 102, to: 258, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 270, to: 276, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 286, to: 298, side: 'left' },
      { id: 'z10', kind: 'trees', from: 298, to: 404, side: 'left' },
      { id: 'z11', kind: 'trees', from: 310, to: 440, side: 'right' },
      { id: 'z12', kind: 'bunker', from: 322, to: 336, side: 'left' },
      { id: 'z13', kind: 'bunker', from: 345, to: 371, side: 'left' },
      { id: 'z14', kind: 'bunker', from: 359, to: 447, side: 'right' },
      { id: 'z15', kind: 'bunker', from: 389, to: 484, side: 'left' },
      { id: 'z16', kind: 'trees', from: 451, to: 486, side: 'right' },
      { id: 'z17', kind: 'bunker', from: 455, to: 475, side: 'right' },
      { id: 'z18', kind: 'trees', from: 470, to: 486, side: 'left' },
      { id: 'z19', kind: 'bunker', from: 482, to: 486, side: 'right' },
    ],
  },
  'pine-valley:14': {
    length: 220,
    fairwayFrom: 78,
    fairwayTo: 203,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'bunker', from: 1, to: 57, side: 'left' },
      { id: 'z2', kind: 'trees', from: 1, to: 161, side: 'right' },
      { id: 'z3', kind: 'trees', from: 61, to: 159, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 97, to: 101, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 103, to: 217, side: 'right' },
      { id: 'z6', kind: 'water', from: 151, to: 181, side: 'cross' },
      { id: 'z7', kind: 'water', from: 177, to: 197, side: 'left' },
      { id: 'z8', kind: 'trees', from: 181, to: 220, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 193, to: 203, side: 'left' },
    ],
  },
  'pine-valley:15': {
    length: 615,
    fairwayFrom: 213,
    fairwayTo: 595,
    greenDepth: 35,
    zones: [
      { id: 'z1', kind: 'trees', from: 4, to: 116, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 10, to: 22, side: 'left' },
      { id: 'z3', kind: 'water', from: 20, to: 42, side: 'left' },
      { id: 'z4', kind: 'water', from: 42, to: 150, side: 'cross' },
      { id: 'z5', kind: 'water', from: 52, to: 60, side: 'left' },
      { id: 'z6', kind: 'water', from: 150, to: 156, side: 'left' },
      { id: 'z7', kind: 'water', from: 150, to: 252, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 168, to: 260, side: 'left' },
      { id: 'z9', kind: 'trees', from: 246, to: 390, side: 'left' },
      { id: 'z10', kind: 'trees', from: 278, to: 572, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 356, to: 372, side: 'right' },
      { id: 'z12', kind: 'trees', from: 494, to: 602, side: 'left' },
      { id: 'z13', kind: 'bunker', from: 506, to: 538, side: 'left' },
      { id: 'z14', kind: 'bunker', from: 526, to: 615, side: 'right' },
      { id: 'z15', kind: 'bunker', from: 552, to: 590, side: 'left' },
    ],
  },
  'pine-valley:16': {
    length: 475,
    fairwayFrom: 175,
    fairwayTo: 456,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 3, to: 121, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 81, to: 87, side: 'left' },
      { id: 'z3', kind: 'trees', from: 81, to: 161, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 87, to: 101, side: 'cross' },
      { id: 'z5', kind: 'trees', from: 93, to: 197, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 121, to: 137, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 137, to: 273, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 161, to: 167, side: 'cross' },
      { id: 'z9', kind: 'bunker', from: 167, to: 183, side: 'left' },
      { id: 'z10', kind: 'trees', from: 211, to: 255, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 246, to: 258, side: 'left' },
      { id: 'z12', kind: 'bunker', from: 281, to: 475, side: 'left' },
      { id: 'z13', kind: 'trees', from: 289, to: 375, side: 'right' },
      { id: 'z14', kind: 'water', from: 391, to: 475, side: 'right' },
    ],
  },
  'pine-valley:17': {
    length: 414,
    fairwayFrom: 145,
    fairwayTo: 400,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 20, side: 'left' },
      { id: 'z2', kind: 'water', from: 44, to: 88, side: 'left' },
      { id: 'z3', kind: 'trees', from: 48, to: 52, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 86, to: 104, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 122, to: 136, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 134, to: 284, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 136, to: 152, side: 'cross' },
      { id: 'z8', kind: 'bunker', from: 186, to: 264, side: 'right' },
      { id: 'z9', kind: 'trees', from: 190, to: 414, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 196, to: 212, side: 'cross' },
      { id: 'z11', kind: 'bunker', from: 306, to: 342, side: 'right' },
      { id: 'z12', kind: 'bunker', from: 332, to: 342, side: 'left' },
      { id: 'z13', kind: 'trees', from: 336, to: 394, side: 'left' },
      { id: 'z14', kind: 'bunker', from: 342, to: 390, side: 'cross' },
      { id: 'z15', kind: 'bunker', from: 390, to: 406, side: 'left' },
      { id: 'z16', kind: 'bunker', from: 390, to: 408, side: 'right' },
    ],
  },
  'pine-valley:18': {
    length: 483,
    fairwayFrom: 170,
    fairwayTo: 462,
    greenDepth: 38,
    zones: [
      { id: 'z1', kind: 'bunker', from: 1, to: 19, side: 'left' },
      { id: 'z2', kind: 'trees', from: 1, to: 179, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 29, to: 63, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 87, to: 235, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 97, to: 117, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 117, to: 127, side: 'cross' },
      { id: 'z7', kind: 'water', from: 181, to: 261, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 219, to: 227, side: 'cross' },
      { id: 'z9', kind: 'bunker', from: 229, to: 383, side: 'right' },
      { id: 'z10', kind: 'trees', from: 337, to: 417, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 363, to: 367, side: 'cross' },
      { id: 'z12', kind: 'water', from: 409, to: 415, side: 'right' },
      { id: 'z13', kind: 'water', from: 411, to: 415, side: 'left' },
      { id: 'z14', kind: 'water', from: 415, to: 429, side: 'cross' },
      { id: 'z15', kind: 'water', from: 429, to: 441, side: 'right' },
      { id: 'z16', kind: 'bunker', from: 435, to: 445, side: 'cross' },
      { id: 'z17', kind: 'bunker', from: 439, to: 481, side: 'right' },
      { id: 'z18', kind: 'bunker', from: 439, to: 483, side: 'left' },
    ],
  },
  // Bandon Dunes (Bandon, OR) — David McLay Kidd, 1999. Imported from OSM; all
  // 18 centrelines are mapped. Pure geometry: the shipped tuple already matched
  // the club's TOURNAMENT card (7315 yd, par 72, 75.9/145) on par, yardage AND
  // stroke index for all 18, so no yardage or SI moved in courses.ts. What did
  // move there is eleven `dogleg` flags and two `signature` strings — see below
  // and the OSM_BEND note above.
  //
  // IDENTITY. Same shared polygon as Pacific Dunes: way 362513477 ("Bandon
  // Dunes Golf Resort") holds this course, Pacific Dunes and Old Macdonald —
  // 54 hole ways, three complete sets of ref=1..18. `osmHolePrefix` is the
  // whole identity check. It is safe here for a reason worth recording: Old
  // Macdonald's eighteen ways are entirely UNNAMED (bare ref, no name), so
  // /^Bandon Dunes/ cannot reach them, and all 18 of this course's ways use
  // plain single-space "Bandon Dunes Hole N" — the double-space trap that would
  // have dropped a quarter of Pacific Dunes does not recur on this set. Checked
  // way by way against all 54. See COURSE_GEO in scripts/import-osm.ts.
  //
  // YARDAGE. EVERY hole lands on the card, because `courses.ts` reconciles each
  // hole's `yards` to the imported `length` at load — so a length left at its
  // raw import value does not sit quietly beside the card, it REPLACES it on
  // the scorecard. A first pass here shipped seven holes at raw import (2, 3,
  // 4, 6, 8, 11, 15, each within 6 yd) on the reasoning that tee-box variance
  // is not worth chasing; that silently rewrote seven published yardages and
  // made the course play 7249 against a 7266 card. "Within variance" is a
  // statement about which SHIFT to apply, never a licence to skip one.
  // Thirteen holes imported SHORT off forward pads and are re-imported with
  // `--shift` (2 +4, 3 +4, 4 +6, 5 +40, 7 +28, 8 +1, 9 +16, 10 +27, 11 +5,
  // 13 +13, 14 +71, 16 +16, 18 +11), which prepends the missing tee run and
  // re-measures zones, fairway and bend in card coordinates in one pass.
  // Holes 6 and 15 import 2 and 1 yd LONG. `--shift` takes only a positive
  // yardage, and neither wants one: both are dead straight (bend max -2 and 1),
  // so there is no curvature to remap the way hole 1 needs, and both endpoints
  // are right, so there is no tee run to prepend. Every coordinate simply moves
  // back by that constant — the exact mirror of a positive shift, which
  // preserves each zone's distance from the GREEN and so keeps greenside
  // features greenside.
  // Hole 1 is the OPPOSITE case and the reason "shift, don't scale" is a rule
  // about a diagnosis: it imports 21 yd LONG. Its endpoints are both correct
  // (line start -> green measures 388 against the card's 386, while the two
  // other tee pads in reach measure 444 and 396), so there is no missing tee
  // run to prepend and a shift would be meaningless. The excess is curvature in
  // a 3-node polyline that bows 54 yd. The torrey-pines-south:6 tell confirms
  // where it accumulates: arc and straight-line distance from the tee agree to
  // 0 yd out to 200, diverge by 4 at 300 and 17 by the green. So hole 1 is
  // remapped arc -> straight-line on the importer's own chaikin(2) centreline
  // and scaled the last 0.4% to the card, which walks its sand from 286/340/346
  // to 282/329/334 rather than leaving it 17 yd long at the green.
  //
  // YARDAGE CONFLICT — read this before "correcting" any length here. Four
  // sources were compared per hole: the club's own hole-by-hole
  // (bandondunesgolf.com, 7212), BlueGolf's TOURNAMENT card (7315),
  // ProVisualizer's measured tee->pin (7255), and the OSM line itself. They
  // agree within ~20 yd on fifteen holes. Three do not:
  //   h1  club 398 / BG 386 / PV 421 / OSM chord 388 — spread 35, no majority
  //   h5  club 445 / BG 473 / PV 465 / OSM 433       — spread 28, no majority
  //   h16 club 363 / BG 412 / PV 358 / OSM 347       — spread 54, and here
  //       THREE sources cluster at 347-363 against BlueGolf's lone 412.
  // Only 16 was changed. 50 yd is far outside tee-set variance, and the shipped
  // tuple carried BlueGolf's number, so the tuple was wrong: it is now 363 (the
  // only yardage this import moved) and the hole is shifted +16 rather than the
  // +65 the bad card implied. 1 and 5 keep their shipped BlueGolf values —
  // their spreads are ordinary tee-set disagreement with no source clearly
  // right, and inventing a fourth answer would be worse than either. This is
  // why "the card is ground truth" is a rule about a SOURCE, not a file: when
  // the club's own card and two independent measurements all disagree with the
  // third-party database, the database is what gives.
  //
  // THE OCEAN, which again imported as NOTHING — same cause as Pacific Dunes,
  // and the check that matters most on this course. The `natural=coastline` way
  // is drawn at the WATERLINE across a wide beach, 113-158 yd from the nearest
  // centreline, so no rake sample lands seaward of it and the importer's
  // outward OCEAN_REACH probe never seeds. OSM maps no cliff on the property.
  // Rims were MEASURED by the Torrey Pines recipe: USGS NED 10m (3DEP)
  // transects every 10 yd along each centreline at +/-20..60 yd, nearest offset
  // sitting >= 6 m below the playing line is the rim, author only where that rim
  // falls inside the importer's own 50-yd corridor, span exactly the measured
  // run, extrapolate nothing. Stations are built on the SHIFTED, chaikin(2)
  // line so they share the importer's coordinates — a first pass on the raw
  // line put hole 16's numbers 9 yd out.
  // Authored, all three monotonic to a sea-level beach:
  //   h5  left  0-310 (rim 20-50)   h6  left 0-210 (rim 30)
  //   h16 right 0-190  (rim 20-50)  — re-measured on the CORRECTED 363 line;
  //       the first pass, on the bad 412 card, put this run at 20-240.
  // DECLINED, and this is the half that earns the measurement:
  //   h17 tripped the rim test TWICE (right 0-50 and 280-330) and is not the
  //       sea either time — the ground dips to 7 m and RISES back to 21, a dune
  //       hollow between the hole and a ridge. It plays EAST, away from a
  //       Pacific that is 158 deg behind it. Its tuple says `hazard: 'ocean'`.
  //   h11 flat at 31-32 m for 100 yd; h15's ground RISES seaward to a dune
  //       crest. Both tuples say 'ocean'; neither has any.
  //   h12 (right 220-230) and h16's second run (right 400-410) DO reach sea
  //       level, but their rim sits AT 50 yd — the corridor edge, not inside
  //       it — over 10-yd runs. Same call that cleared whistling-straits:9/18
  //       and torrey's 55-70 yd flanks. h16's 160-yd gap is left open rather
  //       than merged: too long to be the wander a merge is for.
  // `hazard: 'ocean'` on 5/11/15/17 is left untouched — it only feeds the
  // PROCEDURAL layout and is inert once a hole has real geometry. Do not "fix"
  // geometry to match it. The `signature` strings are a different matter,
  // because those are shown to the player, and two were false: hole 5 promised
  // "the Pacific down the entire right" when the sea is down its LEFT (the hole
  // plays due north, west is 108 deg left), and hole 15 promised "a green
  // teetering above the beach" on an inland dune par 3 whose ground climbs away
  // from the water. Both rewritten in courses.ts to what the map now contains.
  //
  // HAND-FIX, one. Hole 10's 214-220 `cross` is way/1057044353 alone — a ~12-yd
  // bunker lying lateral -2..10, i.e. just LEFT of the line it clips — and a
  // 6-yd full-width forced carry at 214 yd is not what that is. Re-sided to
  // left, NOT dropped: the bunker is real, only the carry was invented. Worth
  // noting that the catalog's usual discriminator was unavailable here — Bandon
  // Dunes has NO `golf=fairway` polygons mapped at all (0 of 18 centrelines run
  // on one), so "is there mapped fairway beside the hazard" could not be asked,
  // and the ring profile had to settle it alone. It was the only `cross` on the
  // course.
  // GREENS. Six holes read greenDepth exactly 45, the clamp the README says to
  // suspect. Not the cypress-point:1 artifact here: no centreline touches two
  // greens (the importer's multi-green warning is silent on all 18), all 18 end
  // on 18 DISTINCT green polygons, and an independent measure of each target
  // green along its own approach axis agrees within 1-2 yd everywhere except
  // where it exceeds the clamp — 5 (51), 6 (58), 13 (51), 17 (65). These are
  // simply enormous links greens.
  // No `osmIgnore`, no `packed`: of the 69 bunkers reaching a corridor, none is
  // nearer a neighbouring course's centreline. No landmark — nothing built here
  // that a golfer would recognise from a map.
  // Data (c) OpenStreetMap contributors, ODbL. Terrain: USGS 3DEP/NED.
  'bandon-dunes:1': {
    length: 386,
    fairwayFrom: 135,
    fairwayTo: 363,
    greenDepth: 41,
    zones: [
      { id: 'z1', kind: 'bunker', from: 282, to: 288, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 329, to: 337, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 334, to: 346, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 370, to: 377, side: 'left' },
    ],
  },
  'bandon-dunes:2': {
    length: 220,
    fairwayFrom: 77,
    fairwayTo: 201,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 84, to: 104, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 148, to: 184, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 190, to: 216, side: 'left' },
    ],
  },
  'bandon-dunes:3': {
    length: 563,
    fairwayFrom: 197,
    fairwayTo: 541,
    greenDepth: 39,
    zones: [
      { id: 'z1', kind: 'bunker', from: 64, to: 96, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 130, to: 140, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 332, to: 350, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 372, to: 378, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 436, to: 450, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 466, to: 478, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 534, to: 542, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 540, to: 550, side: 'right' },
    ],
  },
  'bandon-dunes:4': {
    length: 443,
    fairwayFrom: 155,
    fairwayTo: 418,
    greenDepth: 45,
    zones: [
      { id: 'z1', kind: 'bunker', from: 318, to: 324, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 416, to: 424, side: 'left' },
    ],
  },
  'bandon-dunes:5': {
    length: 473,
    fairwayFrom: 166,
    fairwayTo: 448,
    greenDepth: 45,
    zones: [
      { id: 'z1', kind: 'ocean', from: 0, to: 310, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 350, to: 370, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 434, to: 473, side: 'right' },
    ],
  },
  'bandon-dunes:6': {
    length: 217,
    fairwayFrom: 76,
    fairwayTo: 192,
    greenDepth: 45,
    zones: [
      { id: 'z1', kind: 'ocean', from: 0, to: 208, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 164, to: 206, side: 'left' },
    ],
  },
  'bandon-dunes:7': {
    length: 411,
    fairwayFrom: 144,
    fairwayTo: 392,
    greenDepth: 33,
    zones: [
      { id: 'z1', kind: 'trees', from: 42, to: 180, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 158, to: 162, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 178, to: 186, side: 'left' },
      { id: 'z4', kind: 'trees', from: 350, to: 390, side: 'left' },
    ],
  },
  'bandon-dunes:8': {
    length: 385,
    fairwayFrom: 135,
    fairwayTo: 363,
    greenDepth: 39,
    zones: [
      { id: 'z1', kind: 'bunker', from: 202, to: 218, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 276, to: 304, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 356, to: 366, side: 'left' },
    ],
  },
  'bandon-dunes:9': {
    length: 605,
    fairwayFrom: 212,
    fairwayTo: 583,
    greenDepth: 39,
    zones: [
      { id: 'z1', kind: 'bunker', from: 274, to: 280, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 320, to: 332, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 356, to: 366, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 448, to: 452, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 456, to: 460, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 530, to: 540, side: 'left' },
    ],
  },
  'bandon-dunes:10': {
    length: 380,
    fairwayFrom: 133,
    fairwayTo: 363,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'bunker', from: 202, to: 214, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 214, to: 220, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 240, to: 244, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 332, to: 338, side: 'left' },
    ],
  },
  'bandon-dunes:11': {
    length: 469,
    fairwayFrom: 164,
    fairwayTo: 444,
    greenDepth: 45,
    zones: [
      { id: 'z1', kind: 'bunker', from: 359, to: 366, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 394, to: 400, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 442, to: 448, side: 'right' },
    ],
  },
  // z1 is HAND-ADDED — the dropped-greenside-bunker mode (harbour-town:4).
  // way/1057045714 is a 6 x 5 yd pot at along 223-229, lateral 4-9 LEFT, and
  // the +/-50 yd rake steps in 6-yd offsets, so between -2 and +4 it stepped
  // clean over a bunker sitting 4 yd off the line: ZERO rake hits, and the hole
  // imported with no zones at all. Not a culling question — ownsHazard keeps it
  // at 4 yd — and not a mapping one either: 0 of its 13 vertices are inside the
  // green. Imagery shows the sand short-left of the green where the projection
  // puts it.
  'bandon-dunes:12': {
    length: 238,
    fairwayFrom: 83,
    fairwayTo: 216,
    greenDepth: 40,
    zones: [{ id: 'z1', kind: 'bunker', from: 223, to: 229, side: 'left' }],
  },
  // Genuinely bare, verified rather than assumed: the nearest bunker to this
  // centreline is 65 yd off it — outside the corridor — and the tee view shows
  // an open dune corridor the whole way. Same shape as tpc-potomac:15: a hard
  // hole (SI 6) whose difficulty is length and the scrub off-line, which the
  // course-wide Rough dial carries rather than hazard zones. Nothing authored
  // here because nothing measured; hand-drawing gorse would be invention.
  'bandon-dunes:13': {
    length: 554,
    fairwayFrom: 194,
    fairwayTo: 529,
    greenDepth: 45,
    zones: [
    ],
  },
  'bandon-dunes:14': {
    length: 390,
    fairwayFrom: 137,
    fairwayTo: 375,
    greenDepth: 26,
    zones: [
      { id: 'z1', kind: 'bunker', from: 264, to: 270, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 296, to: 314, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 298, to: 304, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 342, to: 354, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 376, to: 390, side: 'right' },
    ],
  },
  'bandon-dunes:15': {
    length: 206,
    fairwayFrom: 72,
    fairwayTo: 184,
    greenDepth: 39,
    zones: [
      { id: 'z1', kind: 'bunker', from: 189, to: 197, side: 'right' },
    ],
  },
  // THE ONE HOLE WHERE THE SHIPPED CARD WAS WRONG — see the YARDAGE CONFLICT
  // note in the course header. BlueGolf says 412; the club's own hole-by-hole
  // says 363, ProVisualizer measures 358 and the OSM tee->green line 347.
  // Shifted +16 to the club's 363, not +65 to BlueGolf's 412, which would have
  // walked all four bunkers ~49 yd back from where they are and stretched the
  // ocean 50 yd past the bluff. Rim re-measured on the corrected line.
  'bandon-dunes:16': {
    length: 363,
    fairwayFrom: 127,
    fairwayTo: 343,
    greenDepth: 35,
    zones: [
      { id: 'z1', kind: 'ocean', from: 0, to: 190, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 238, to: 254, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 266, to: 282, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 294, to: 302, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 320, to: 326, side: 'left' },
    ],
  },
  'bandon-dunes:17': {
    length: 405,
    fairwayFrom: 142,
    fairwayTo: 380,
    greenDepth: 45,
    zones: [
      { id: 'z1', kind: 'bunker', from: 256, to: 262, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 284, to: 300, side: 'right' },
    ],
  },
  'bandon-dunes:18': {
    length: 558,
    fairwayFrom: 195,
    fairwayTo: 539,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 248, to: 256, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 310, to: 338, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 336, to: 340, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 530, to: 544, side: 'right' },
    ],
  },
  // ---- Muirfield (OSM way 101336384, Gullane) ----------------------------
  // Pure geometry import: the shipped tuple already matched the club's WHITE
  // card (par 71 / 6728 yd) on par, yardage AND stroke index for all 18, so
  // nothing in courses.ts moved. OSM's own `handicap` tags disagree with that
  // card on 12 holes — the reverse of Torrey Pines, and a reminder that OSM
  // hole tags corroborate a card, they never arbitrate one.
  //
  // TEN HOLES ARE TRIMMED, which is the one course-wide deviation from the raw
  // import. OSM traced those centrelines from the CHAMPIONSHIP pads (7089 yd
  // of centreline against the white card's 6728), so each was cut at the front
  // with `--shift -N` to start at the tee we actually play from. Two
  // independent sources agree the untrimmed start is the back pad, not the
  // white one: ProVisualizer's published tee sits within 1-7 yd of it on 17 of
  // 18 holes, and its tee-to-pin distance tracks the OSM length rather than
  // the card on exactly the ten holes trimmed here. The trims then land on a
  // mapped `golf=tee` polygon — 9 of 10 within 12 yd of one, most within 2-8.
  // Hole 15 is the exception and is called out on its own entry.
  // Trimming discards measured line rather than inventing a straight run, so
  // it is the safer half of --shift; hazards beside the discarded stretch drop
  // out with it, correctly, since they sit behind the tee.
  //
  // Untrimmed holes come in 5-14 yd off the card, inside tee-box variance;
  // courses.ts reconciles the yardage tuple to these lengths. Hole 8 is the
  // widest gap (429 vs 443) and is NOT a pad problem — its endpoints check out
  // and the hole doglegs hard, so Chaikin rounds the corner off (the
  // pine-valley:1 case). Shifting it would have walked its fairway sand
  // backwards for nothing.
  //
  // Imported at rake 3 (see COURSE_GEO.rake): Muirfield's ~150 revetted pots
  // are small enough that the default 6-yd lateral rake stepped over greenside
  // sand on 14 of 18 holes. No water anywhere (correct — the course has none
  // in play), and no `cross` zones on any hole, which is the links being
  // honest: there is nothing here you cannot run the ball up to.
    'muirfield:1': {
    length: 441,
    fairwayFrom: 154,
    fairwayTo: 420,
    greenDepth: 37,
    zones: [
      { id: 'z1', kind: 'bunker', from: 212, to: 234, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 296, to: 300, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 350, to: 370, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 398, to: 408, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 422, to: 432, side: 'right' },
    ],
  },
    'muirfield:2': {
    length: 359,
    fairwayFrom: 126,
    fairwayTo: 339,
    greenDepth: 35,
    zones: [
      { id: 'z1', kind: 'bunker', from: 20, to: 28, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 192, to: 198, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 230, to: 236, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 238, to: 242, side: 'left' },
      { id: 'z5', kind: 'trees', from: 258, to: 359, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 312, to: 318, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 326, to: 352, side: 'right' },
    ],
  },
    'muirfield:3': {
    length: 367,
    fairwayFrom: 128,
    fairwayTo: 344,
    greenDepth: 41,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 38, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 70, to: 102, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 164, to: 168, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 280, to: 284, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 280, to: 288, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 342, to: 354, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 350, to: 356, side: 'left' },
    ],
  },
  // trimmed -42 yd to the WHITE card (see the course note above)
  'muirfield:4': {
    length: 182,
    fairwayFrom: 64,
    fairwayTo: 162,
    greenDepth: 36,
    zones: [
      { id: 'z1', kind: 'bunker', from: 150, to: 164, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 168, to: 172, side: 'left' },
    ],
  },
  // trimmed -40 yd to the WHITE card (see the course note above)
  'muirfield:5': {
    length: 510,
    fairwayFrom: 179,
    fairwayTo: 490,
    greenDepth: 36,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 60, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 162, to: 180, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 208, to: 216, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 242, to: 246, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 252, to: 258, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 262, to: 266, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 296, to: 300, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 394, to: 402, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 454, to: 462, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 482, to: 510, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 494, to: 510, side: 'left' },
    ],
  },
    'muirfield:6': {
    length: 450,
    fairwayFrom: 158,
    fairwayTo: 427,
    greenDepth: 42,
    zones: [
      { id: 'z1', kind: 'bunker', from: 214, to: 226, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 226, to: 230, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 240, to: 244, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 254, to: 258, side: 'left' },
      { id: 'z5', kind: 'trees', from: 308, to: 320, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 410, to: 418, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 428, to: 434, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 444, to: 450, side: 'left' },
    ],
  },
  // trimmed -37 yd to the WHITE card (see the course note above)
  'muirfield:7': {
    length: 147,
    fairwayFrom: 51,
    fairwayTo: 127,
    greenDepth: 35,
    zones: [
      { id: 'z1', kind: 'bunker', from: 124, to: 128, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 128, to: 132, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 138, to: 144, side: 'left' },
    ],
  },
    'muirfield:8': {
    length: 429,
    fairwayFrom: 150,
    fairwayTo: 413,
    greenDepth: 27,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 14, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 0, to: 24, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 222, to: 252, side: 'right' },
      { id: 'z4', kind: 'trees', from: 254, to: 358, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 316, to: 320, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 358, to: 386, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 378, to: 382, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 396, to: 400, side: 'right' },
    ],
  },
  // trimmed -43 yd to the WHITE card (see the course note above)
  'muirfield:9': {
    length: 505,
    fairwayFrom: 177,
    fairwayTo: 489,
    greenDepth: 27,
    zones: [
      { id: 'z1', kind: 'bunker', from: 34, to: 40, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 64, to: 68, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 222, to: 230, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 262, to: 272, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 326, to: 338, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 424, to: 440, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 432, to: 444, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 462, to: 470, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 482, to: 490, side: 'right' },
      { id: 'z10', kind: 'trees', from: 494, to: 505, side: 'left' },
    ],
  },
    'muirfield:10': {
    length: 465,
    fairwayFrom: 163,
    fairwayTo: 447,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 14, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 234, to: 240, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 264, to: 270, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 288, to: 294, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 346, to: 352, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 352, to: 358, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 440, to: 458, side: 'right' },
    ],
  },
  // trimmed -31 yd to the WHITE card (see the course note above)
  'muirfield:11': {
    length: 354,
    fairwayFrom: 124,
    fairwayTo: 340,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'bunker', from: 14, to: 18, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 252, to: 258, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 268, to: 272, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 278, to: 282, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 342, to: 354, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 346, to: 354, side: 'left' },
    ],
  },
    'muirfield:12': {
    length: 374,
    fairwayFrom: 131,
    fairwayTo: 353,
    greenDepth: 38,
    zones: [
      { id: 'z1', kind: 'bunker', from: 10, to: 16, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 174, to: 182, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 256, to: 260, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 324, to: 338, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 348, to: 364, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 358, to: 370, side: 'left' },
    ],
  },
  // trimmed -31 yd to the WHITE card (see the course note above)
  'muirfield:13': {
    length: 156,
    fairwayFrom: 55,
    fairwayTo: 137,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 138, to: 154, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 144, to: 156, side: 'left' },
    ],
  },
  // trimmed -22 yd to the WHITE card (see the course note above)
  'muirfield:14': {
    length: 449,
    fairwayFrom: 157,
    fairwayTo: 432,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'bunker', from: 48, to: 64, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 234, to: 278, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 238, to: 242, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 364, to: 372, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 374, to: 382, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 416, to: 422, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 432, to: 438, side: 'right' },
    ],
  },
  // trimmed -49 yd to the WHITE card. THE ONE TRIM WITHOUT A PAD UNDER IT: the
  // other nine land within 12 yd of a mapped `golf=tee`, but 15 has only two
  // pads mapped (0 and 32 yd) and the card needs 49. The card is ground truth
  // for distance and OSM has simply not mapped this hole's forward tee, so the
  // trim follows the card and this comment is the deviation.
  'muirfield:15': {
    length: 394,
    fairwayFrom: 138,
    fairwayTo: 374,
    greenDepth: 36,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 28, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 150, to: 184, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 232, to: 236, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 260, to: 264, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 318, to: 322, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 324, to: 330, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 344, to: 348, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 372, to: 378, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 376, to: 394, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 392, to: 394, side: 'left' },
    ],
  },
    'muirfield:16': {
    length: 181,
    fairwayFrom: 63,
    fairwayTo: 163,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'bunker', from: 160, to: 181, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 160, to: 176, side: 'left' },
    ],
  },
  // trimmed -61 yd to the WHITE card (see the course note above)
  'muirfield:17': {
    length: 506,
    fairwayFrom: 177,
    fairwayTo: 487,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 20, to: 42, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 52, to: 62, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 198, to: 220, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 238, to: 244, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 276, to: 284, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 360, to: 396, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 364, to: 380, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 480, to: 484, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 484, to: 488, side: 'left' },
    ],
  },
  // trimmed -47 yd to the WHITE card (see the course note above)
  'muirfield:18': {
    length: 418,
    fairwayFrom: 146,
    fairwayTo: 400,
    greenDepth: 32,
    zones: [
      { id: 'z1', kind: 'bunker', from: 212, to: 220, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 232, to: 252, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 364, to: 372, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 384, to: 388, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 406, to: 418, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 408, to: 418, side: 'right' },
    ],
  },
  // ---- Quail Hollow Club (OSM way 877659537, Charlotte NC) ---------------
  // Imported against the 2025 PGA CHAMPIONSHIP card (par 71 / 7,626), taken
  // from the championship's own scorecard PDF. Choosing that card is the first
  // decision on this course and it is not the house default: BlueGolf carries
  // Quail Hollow only as its MEMBER configuration (par 72 / 7,546, the 1st
  // played as a par 5), which is a different golf course from the one this
  // game ships. The tuple's par sequence and OSM's own par tags both match the
  // tournament card on all 18, so the members' card is the outlier, not us.
  // Par is therefore untouched; four yardages move (1, 9, 13, 16) and
  // courses.ts reconciles them from the lengths below.
  //
  // TEN HOLES ARE SHIFTED, and unlike Muirfield they go BOTH WAYS — 1 and 3
  // trim, the other eight prepend. That is the seminole pattern: 82 mapped tee
  // pads over 18 holes, and the mapper picked a different one per hole. Each
  // shift is justified at its own entry. Where a shift is corroborated it is by
  // ProVisualizer's published tee projected onto the hole's heading, which
  // agrees within 12 yd on 1, 10, 11, 12, 16, 17 and 18.
  //
  // Rake stays at the 6-yd default, deliberately, one course after Muirfield
  // needed 3. The evidence is in the polygons: not one of Quail Hollow's 74
  // bunkers is under 6 yd across (min 6.7, median 12.8), where Muirfield's pots
  // routinely are. That is the case for the knob being per-course.
  //
  // Three hand-fixes, each commented at its hole: 2 (dropped greenside bunker),
  // 17 (water cross running into the green) and 18 (the creek, which is a
  // linestring and therefore invisible to the importer).
  // trimmed -35 yd to the card (see the course note above)
  'quail-hollow:1': {
    length: 505,
    fairwayFrom: 177,
    fairwayTo: 484,
    greenDepth: 37,
    zones: [
      { id: 'z1', kind: 'bunker', from: 266, to: 278, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 294, to: 302, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 336, to: 356, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 436, to: 452, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 478, to: 505, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 482, to: 505, side: 'right' },
    ],
  },
  // HAND-FIX: greenside bunker added. OSM way/680333077 sits at along 447-448,
  // 13-23 yd RIGHT — just past the 1-D hole end, so the corridor caught a single
  // sample of it and the 4-yd span filter dropped that. Without it this 452-yd
  // par 4 ships carrying one hazard, a bunker 20 yd off the tee, which is not
  // the hole. Clipped to the green rather than left behind it (harbour-town:4).
  'quail-hollow:2': {
    length: 442,
    fairwayFrom: 155,
    fairwayTo: 423,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 4, to: 22, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 432, to: 442, side: 'right' },
    ],
  },
  // trimmed -35 yd. Both geo sources sit on a back pad here — PV's tee is 2 yd
  // from the OSM start and both measure ~518 against the card's 483 — but OSM
  // maps a tee at +39 lying 1 yd off the line, which is the tournament pad.
  'quail-hollow:3': {
    length: 483,
    fairwayFrom: 169,
    fairwayTo: 464,
    greenDepth: 33,
    zones: [
      { id: 'z1', kind: 'bunker', from: 148, to: 156, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 166, to: 180, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 292, to: 312, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 458, to: 476, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 458, to: 482, side: 'left' },
    ],
  },
  'quail-hollow:4': {
    length: 187,
    fairwayFrom: 65,
    fairwayTo: 173,
    greenDepth: 23,
    zones: [
      { id: 'z1', kind: 'bunker', from: 18, to: 28, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 160, to: 178, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 164, to: 187, side: 'left' },
    ],
  },
  'quail-hollow:5': {
    length: 447,
    fairwayFrom: 156,
    fairwayTo: 431,
    greenDepth: 27,
    zones: [
      { id: 'z1', kind: 'bunker', from: 268, to: 320, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 300, to: 324, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 422, to: 438, side: 'right' },
    ],
  },
  'quail-hollow:6': {
    length: 250,
    fairwayFrom: 88,
    fairwayTo: 234,
    greenDepth: 28,
    zones: [
      { id: 'z1', kind: 'bunker', from: 228, to: 236, side: 'left' },
    ],
  },
  'quail-hollow:7': {
    length: 545,
    fairwayFrom: 191,
    fairwayTo: 527,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'bunker', from: 104, to: 114, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 286, to: 340, side: 'left' },
      { id: 'z3', kind: 'water', from: 340, to: 536, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 508, to: 528, side: 'left' },
    ],
  },
  'quail-hollow:8': {
    length: 349,
    fairwayFrom: 122,
    fairwayTo: 336,
    greenDepth: 21,
    zones: [
      { id: 'z1', kind: 'bunker', from: 252, to: 268, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 292, to: 310, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 316, to: 336, side: 'right' },
      { id: 'z4', kind: 'trees', from: 328, to: 349, side: 'right' },
    ],
  },
  // shifted +40 to the card. NO PAD, NO PV CORROBORATION: OSM's start is the
  // BACKMOST mapped pad (its other three are forward of it) and PV's tee sits on
  // that same spot, so both views of the geometry say ~492 — while the PGA card
  // and BlueGolf's member card independently say ~530. Two cards against one
  // unmapped championship tee; the card wins and this comment is the deviation.
  'quail-hollow:9': {
    length: 530,
    fairwayFrom: 186,
    fairwayTo: 511,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 316, to: 338, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 502, to: 516, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 508, to: 530, side: 'right' },
    ],
  },
  // shifted +45 to the card (PV tee -57, OSM pad -55)
  'quail-hollow:10': {
    length: 592,
    fairwayFrom: 207,
    fairwayTo: 573,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 296, to: 324, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 530, to: 548, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 580, to: 592, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 580, to: 592, side: 'left' },
    ],
  },
  // shifted +35 to the card (OSM pad at -35 exactly, PV tee -42)
  'quail-hollow:11': {
    length: 462,
    fairwayFrom: 162,
    fairwayTo: 442,
    greenDepth: 36,
    zones: [
      { id: 'z1', kind: 'bunker', from: 242, to: 264, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 282, to: 316, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 426, to: 458, side: 'left' },
    ],
  },
  // shifted +40 to the card (PV tee -37; OSM maps no pad back there)
  'quail-hollow:12': {
    length: 456,
    fairwayFrom: 160,
    fairwayTo: 435,
    greenDepth: 38,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 428, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 28, to: 40, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 430, to: 446, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 436, to: 452, side: 'left' },
    ],
  },
  'quail-hollow:13': {
    length: 208,
    fairwayFrom: 73,
    fairwayTo: 188,
    greenDepth: 36,
    zones: [
      { id: 'z1', kind: 'trees', from: 50, to: 148, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 182, to: 194, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 206, to: 208, side: 'right' },
    ],
  },
  'quail-hollow:14': {
    length: 335,
    fairwayFrom: 117,
    fairwayTo: 310,
    greenDepth: 45,
    zones: [
      { id: 'z1', kind: 'water', from: 202, to: 335, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 214, to: 236, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 258, to: 286, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 296, to: 312, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 320, to: 334, side: 'right' },
    ],
  },
  // shifted +102 to the card — the largest on the course and the least
  // corroborated. OSM's start is again its backmost mapped pad, and PV's
  // hole-15 tee sits 79 yd off this hole's heading, so it corroborates nothing.
  // What is solid is that the GREEN end is right (PV's pin is 3 yd from the
  // centreline end), so the whole shortfall is at the tee. Prepending 102 yd of
  // straight line is pacific-dunes:8 magnitude and carries that hole's risk:
  // the run back to the tee is assumed straight because nothing maps its shape.
  'quail-hollow:15': {
    length: 577,
    fairwayFrom: 202,
    fairwayTo: 559,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'water', from: 164, to: 386, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 308, to: 336, side: 'right' },
      { id: 'z3', kind: 'water', from: 386, to: 436, side: 'cross' },
      { id: 'z4', kind: 'water', from: 436, to: 442, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 496, to: 512, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 534, to: 574, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 566, to: 577, side: 'left' },
    ],
  },
  // shifted +65 to the card (PV tee -67)
  'quail-hollow:16': {
    length: 529,
    fairwayFrom: 185,
    fairwayTo: 507,
    greenDepth: 39,
    zones: [
      { id: 'z1', kind: 'bunker', from: 138, to: 148, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 316, to: 336, side: 'right' },
      { id: 'z3', kind: 'water', from: 402, to: 529, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 508, to: 529, side: 'right' },
    ],
  },
  // shifted +43 to the card (PV tee -35, OSM pad -33)
  // HAND-FIX: the water cross imported as 118-208 on a green that starts at
  // 192 — a carry running 16 yd INTO the target, which is the cypress-point
  // 3/10/11/13 mode (you cannot carry the green you are aiming at). Clipped to
  // the green edge, and the greenside-left water extended back to meet it so the
  // pond stays continuous instead of gaining a gap where the cross used to end.
  'quail-hollow:17': {
    length: 223,
    fairwayFrom: 78,
    fairwayTo: 205,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'water', from: 86, to: 118, side: 'right' },
      { id: 'z2', kind: 'water', from: 118, to: 192, side: 'cross' },
      { id: 'z3', kind: 'water', from: 192, to: 223, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 208, to: 212, side: 'right' },
    ],
  },
  // shifted +47 to the card (PV tee -47 exactly, and PV's own page reads 495)
  // HAND-FIX: the creek. waterway=stream LINESTRINGS never reach the
  // polygon-only rasterizer (the carnoustie mode), so the one hole whose
  // signature promises "creek all down the left" imported with no water at all.
  // Laid from way/674001489, measured against this hole's own shifted centreline:
  // it crosses at ~190 and then runs up the LEFT at 1-23 yd off, unbroken, to the
  // green. The crossing is deliberately NOT a cross zone — at 190 yd on a 494-yd
  // par 4 it sits far short of the landing area, and forcing a carry there would
  // invent a hazard the hole does not present.
  'quail-hollow:18': {
    length: 494,
    fairwayFrom: 173,
    fairwayTo: 472,
    greenDepth: 40,
    zones: [
      { id: 'z1', kind: 'water', from: 196, to: 494, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 294, to: 314, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 472, to: 484, side: 'right' },
    ],
  },
  // ===================== Camargo Club (all 18) =====================
  // The cleanest import in the registry. One polygon, 18 plain ref=1..18 hole
  // ways, no second course within 3 km, and OSM's par tags match the club's
  // GOLD card on all 18 — as did the shipped tuple, on par AND stroke index
  // AND yardage, bar four yards on the 17th. So this was very nearly pure
  // geometry. All 18 centrelines end on a green and PV's pin is 0-3 yd from
  // each end. Rake stays at 6 (only 3 of 54 bunkers under 6 yd, median 14.1).
  //
  // TEE PADS: `--shift +15 / +16 / +35 / +17` on 7, 9, 16 and 17. Only 17 has
  // independent corroboration — PV's tee sits 18 yd behind the OSM start and
  // PV's own tee-to-pin reads 538 against the card's 540. On 7, 9 and 16 PV's
  // tee AGREES with the OSM start and both geometry sources come in short of
  // the card, so the card is carrying those three alone; 16 is the widest
  // (385 measured against 420) and there is no mapped pad behind the start.
  // Hole 6 is left 13 yd LONG rather than trimmed: PV measures 378 and OSM
  // 381 against the card's 368, so trimming would contradict both.
  //
  // HOLE 2 is the pine-valley:1 case and NOT a tee problem. Its endpoints are
  // both right; the OSM line is 3 points around a sharp dogleg and Chaikin
  // rounds 18 yd off the corner (raw 522, smoothed 504, card 529). Zones are
  // remapped smoothed-arc -> RAW-arc with a +7 constant instead of shifted —
  // which moves the driving bunker only 5 yd (288-300 -> 293-305) where a
  // blind +25 shift would have walked it to 313, past where it really sits.
  //
  // THE CREEK was checked for the carnoustie linestring mode and deliberately
  // left out. Projecting all 16 `waterway=stream` ways onto each centreline,
  // it reaches a corridor on exactly one hole — 18, crossing at 95-98 yd — and
  // that is 50 yd short of where the fairway even starts on a 424-yd par 4.
  // Laying a carry there would invent a hazard the hole does not present, the
  // same call as quail-hollow:18's crossing. Everywhere else it is 26-129 yd
  // off the line.
  // COPY CHECK. h8 "a textbook Redan" — 230 yd with sand 156-230 right and
  // 158-202 / 212-230 left around a green starting at 198. h11 "The Short" —
  // 138 yd ringed by sand 104-134 right and 104-138 left.
  // HAND-FIXES: h7's `bunker 404-408 cross` dropped (greenside ring on a green
  // starting at 394; `396-410 right` already holds that sand). h11's
  // `104-116 cross` folded back into both flanks so the ring still starts at
  // 104 rather than at the green edge. h16's `trees 0-12 cross` dropped —
  // relation/3621188 is the tee surrounds, and nobody carries the trees they
  // are standing in.
  'camargo:1': {
    length: 392,
    fairwayFrom: 137,
    fairwayTo: 373,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 368, to: 388, side: 'left' },
    ],
  },
  'camargo:2': {
    length: 529,
    fairwayFrom: 183,
    fairwayTo: 512,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'bunker', from: 293, to: 305, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 461, to: 467, side: 'right' },
      { id: 'z3', kind: 'trees', from: 479, to: 529, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 481, to: 491, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 503, to: 523, side: 'left' },
    ],
  },
  'camargo:3': {
    length: 321,
    fairwayFrom: 112,
    fairwayTo: 304,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 24, side: 'right' },
      { id: 'z2', kind: 'trees', from: 0, to: 72, side: 'left' },
      { id: 'z3', kind: 'trees', from: 86, to: 170, side: 'left' },
      { id: 'z4', kind: 'trees', from: 182, to: 226, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 258, to: 264, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 296, to: 321, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 300, to: 306, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 318, to: 321, side: 'right' },
    ],
  },
  'camargo:4': {
    length: 459,
    fairwayFrom: 161,
    fairwayTo: 440,
    greenDepth: 33,
    zones: [
      { id: 'z1', kind: 'bunker', from: 10, to: 40, side: 'left' },
      { id: 'z2', kind: 'trees', from: 150, to: 168, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 358, to: 380, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 366, to: 398, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 402, to: 456, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 412, to: 434, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 448, to: 458, side: 'left' },
    ],
  },
  'camargo:5': {
    length: 183,
    fairwayFrom: 64,
    fairwayTo: 171,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 98, side: 'left' },
      { id: 'z2', kind: 'trees', from: 142, to: 183, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 158, to: 183, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 166, to: 183, side: 'right' },
    ],
  },
  'camargo:6': {
    length: 381,
    fairwayFrom: 133,
    fairwayTo: 363,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'trees', from: 104, to: 114, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 168, to: 182, side: 'right' },
      { id: 'z3', kind: 'trees', from: 254, to: 381, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 356, to: 376, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 356, to: 374, side: 'left' },
    ],
  },
  'camargo:7': {
    length: 427,
    fairwayFrom: 149,
    fairwayTo: 408,
    greenDepth: 33,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 4, side: 'right' },
      { id: 'z2', kind: 'trees', from: 0, to: 128, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 22, to: 32, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 396, to: 410, side: 'right' },
    ],
  },
  'camargo:8': {
    length: 230,
    fairwayFrom: 81,
    fairwayTo: 212,
    greenDepth: 32,
    zones: [
      { id: 'z1', kind: 'trees', from: 130, to: 196, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 156, to: 230, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 158, to: 202, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 212, to: 230, side: 'left' },
    ],
  },
  'camargo:9': {
    length: 432,
    fairwayFrom: 151,
    fairwayTo: 413,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 102, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 204, to: 220, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 398, to: 418, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 400, to: 424, side: 'right' },
    ],
  },
  'camargo:10': {
    length: 443,
    fairwayFrom: 155,
    fairwayTo: 423,
    greenDepth: 35,
    zones: [
      { id: 'z1', kind: 'bunker', from: 218, to: 240, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 406, to: 426, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 422, to: 428, side: 'left' },
    ],
  },
  'camargo:11': {
    length: 138,
    fairwayFrom: 48,
    fairwayTo: 122,
    greenDepth: 28,
    zones: [
      { id: 'z1', kind: 'bunker', from: 104, to: 134, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 104, to: 138, side: 'left' },
      { id: 'z3', kind: 'trees', from: 134, to: 138, side: 'left' },
    ],
  },
  'camargo:12': {
    length: 412,
    fairwayFrom: 144,
    fairwayTo: 393,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 74, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 6, to: 14, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 38, to: 54, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 324, to: 340, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 350, to: 378, side: 'left' },
    ],
  },
  'camargo:13': {
    length: 366,
    fairwayFrom: 128,
    fairwayTo: 344,
    greenDepth: 40,
    zones: [
      { id: 'z1', kind: 'bunker', from: 58, to: 62, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 336, to: 364, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 346, to: 366, side: 'right' },
    ],
  },
  'camargo:14': {
    length: 391,
    fairwayFrom: 137,
    fairwayTo: 372,
    greenDepth: 33,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 44, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 52, to: 82, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 348, to: 364, side: 'right' },
    ],
  },
  'camargo:15': {
    length: 191,
    fairwayFrom: 67,
    fairwayTo: 171,
    greenDepth: 35,
    zones: [
      { id: 'z1', kind: 'bunker', from: 166, to: 191, side: 'left' },
    ],
  },
  'camargo:16': {
    length: 420,
    fairwayFrom: 147,
    fairwayTo: 403,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'trees', from: 12, to: 20, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 200, to: 218, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 374, to: 390, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 398, to: 418, side: 'left' },
    ],
  },
  'camargo:17': {
    length: 540,
    fairwayFrom: 189,
    fairwayTo: 523,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 64, side: 'right' },
      { id: 'z2', kind: 'trees', from: 0, to: 20, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 508, to: 524, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 526, to: 534, side: 'left' },
    ],
  },
  'camargo:18': {
    length: 424,
    fairwayFrom: 148,
    fairwayTo: 405,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 230, to: 258, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 400, to: 422, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 402, to: 424, side: 'right' },
    ],
  },
  // ===================== Shinnecock Hills (all 18) =====================
  // The course that shows an OSM hole NAME set can be the identity check.
  // Shinnecock's 18 centrelines carry the club's own hole names — Westward Ho,
  // Plateau, Peconic, Pump House, Montauk, Pond, Redan, Lowlands, Ben Nevis,
  // Eastward Ho, Hill Head, Tuckahoe, Road Side, Thom's Elbow, Sebonac,
  // Shinnecock, Eden, Home — matching the published card name for name in
  // order, which is worth more than the polygon name given that National Golf
  // Links (itself rotation #30), Sebonack and Southampton all sit within
  // 1.5 km with their own ref=N holes.
  //
  // CARD: BlueGolf carries Shinnecock only as the members' RED card (6940),
  // which is a different golf course from the 7440 U.S. Open setup the game
  // ships — the quail-hollow lesson, so read what CONFIGURATION a card
  // describes before treating it as ground truth. Par 70 is confirmed by that
  // card on all 18 (so OSM's lone par=5 tag on the 12th is the outlier), and
  // the stroke index is taken from it because BlueGolf prints the SAME men's
  // handicap row on all five tee sets — it is the club's, not a tee's. That
  // row disagreed with the shipped tuple on 15 of 18 holes. Yardages are the
  // 2018 U.S. Open card's.
  //
  // TEE PADS: fifteen holes imported within 8 yd of that card. Three did not,
  // and all three are the same cause — OSM traced a members' pad while the
  // rest of the course is on the championship tees. `--shift 48 / 54 / 69` on
  // 5, 14 and 16, each corroborated by ProVisualizer's published tee sitting
  // 48, 48 and 71 yd BEHIND the OSM centreline start (every other hole: within
  // 7 yd), and 5 has a mapped `golf=tee` at exactly -46. Holes 5 and 16 are
  // the two whose PV tee is also ~29 yd off the line laterally, so the
  // straight-back prepend is the weaker assumption there than on 14.
  //
  // ENDPOINT CHECK (the potomac one): all 18 centrelines finish on a
  // `golf=green`, and PV's own pin sits 0-8 yd from each end.
  // COPY CHECK. h7 "the Redan seventh" — a 197-yd par 3 with sand 162-196 left
  // and 160-188 right around a green starting at 164, which is the Redan's
  // front-left bunker where the copy promises it. h18 names no feature.
  // Rake stays at the 6-yd default: only 9 of 172 bunkers are under 6 yd
  // across (median 12.2), the quail-hollow call rather than the muirfield one.
  'shinnecock-hills:1': {
    length: 399,
    fairwayFrom: 140,
    fairwayTo: 382,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 8, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 198, to: 242, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 286, to: 304, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 328, to: 344, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 376, to: 394, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 390, to: 399, side: 'right' },
    ],
  },
  'shinnecock-hills:2': {
    length: 259,
    fairwayFrom: 91,
    fairwayTo: 238,
    greenDepth: 37,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 88, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 190, to: 252, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 234, to: 259, side: 'right' },
    ],
  },
  'shinnecock-hills:3': {
    length: 502,
    fairwayFrom: 176,
    fairwayTo: 484,
    greenDepth: 32,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 212, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 182, to: 218, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 262, to: 288, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 398, to: 420, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 438, to: 452, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 456, to: 484, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 490, to: 502, side: 'right' },
    ],
  },
  'shinnecock-hills:4': {
    length: 480,
    fairwayFrom: 168,
    fairwayTo: 464,
    greenDepth: 28,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 10, side: 'right' },
      { id: 'z2', kind: 'trees', from: 0, to: 34, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 102, to: 124, side: 'left' },
      { id: 'z4', kind: 'water', from: 194, to: 222, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 270, to: 302, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 320, to: 340, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 380, to: 422, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 434, to: 466, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 454, to: 468, side: 'right' },
    ],
  },
  'shinnecock-hills:5': {
    length: 589,
    fairwayFrom: 206,
    fairwayTo: 569,
    greenDepth: 35,
    zones: [
      { id: 'z1', kind: 'bunker', from: 148, to: 200, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 200, to: 214, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 214, to: 298, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 222, to: 326, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 232, to: 240, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 308, to: 336, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 448, to: 504, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 494, to: 534, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 568, to: 580, side: 'right' },
    ],
  },
  'shinnecock-hills:6': {
    length: 492,
    fairwayFrom: 172,
    fairwayTo: 472,
    greenDepth: 36,
    zones: [
      { id: 'z1', kind: 'trees', from: 64, to: 296, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 98, to: 106, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 168, to: 238, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 192, to: 196, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 224, to: 250, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 226, to: 236, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 292, to: 372, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 296, to: 316, side: 'left' },
      { id: 'z9', kind: 'trees', from: 360, to: 492, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 370, to: 378, side: 'left' },
      { id: 'z11', kind: 'water', from: 392, to: 424, side: 'cross' },
      { id: 'z12', kind: 'bunker', from: 438, to: 464, side: 'right' },
      { id: 'z13', kind: 'bunker', from: 462, to: 488, side: 'left' },
    ],
  },
  'shinnecock-hills:7': {
    length: 197,
    fairwayFrom: 69,
    fairwayTo: 178,
    greenDepth: 33,
    zones: [
      { id: 'z1', kind: 'bunker', from: 18, to: 42, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 78, to: 90, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 110, to: 140, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 160, to: 188, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 162, to: 196, side: 'left' },
    ],
  },
  'shinnecock-hills:8': {
    length: 447,
    fairwayFrom: 156,
    fairwayTo: 426,
    greenDepth: 37,
    zones: [
      { id: 'z1', kind: 'bunker', from: 30, to: 60, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 212, to: 302, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 220, to: 232, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 240, to: 244, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 294, to: 316, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 332, to: 350, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 362, to: 386, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 406, to: 447, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 416, to: 436, side: 'left' },
    ],
  },
  'shinnecock-hills:9': {
    length: 482,
    fairwayFrom: 169,
    fairwayTo: 464,
    greenDepth: 32,
    zones: [
      { id: 'z1', kind: 'bunker', from: 22, to: 32, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 192, to: 208, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 218, to: 240, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 218, to: 238, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 432, to: 440, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 440, to: 482, side: 'left' },
    ],
  },
  'shinnecock-hills:10': {
    length: 417,
    fairwayFrom: 146,
    fairwayTo: 401,
    greenDepth: 27,
    zones: [
      { id: 'z1', kind: 'bunker', from: 118, to: 144, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 142, to: 164, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 320, to: 348, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 392, to: 414, side: 'right' },
    ],
  },
  'shinnecock-hills:11': {
    length: 156,
    fairwayFrom: 55,
    fairwayTo: 142,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'bunker', from: 98, to: 114, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 124, to: 144, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 130, to: 152, side: 'right' },
    ],
  },
  'shinnecock-hills:12': {
    length: 474,
    fairwayFrom: 166,
    fairwayTo: 458,
    greenDepth: 28,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 34, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 172, to: 186, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 216, to: 232, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 236, to: 254, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 266, to: 278, side: 'right' },
      { id: 'z6', kind: 'trees', from: 330, to: 368, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 386, to: 450, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 420, to: 444, side: 'right' },
      { id: 'z9', kind: 'trees', from: 456, to: 474, side: 'right' },
    ],
  },
  'shinnecock-hills:13': {
    length: 369,
    fairwayFrom: 129,
    fairwayTo: 352,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'bunker', from: 148, to: 190, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 290, to: 294, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 294, to: 318, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 318, to: 322, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 346, to: 362, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 352, to: 368, side: 'left' },
    ],
  },
  'shinnecock-hills:14': {
    length: 519,
    fairwayFrom: 182,
    fairwayTo: 502,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'bunker', from: 82, to: 104, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 260, to: 276, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 322, to: 336, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 380, to: 404, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 476, to: 508, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 496, to: 510, side: 'right' },
    ],
  },
  'shinnecock-hills:15': {
    length: 409,
    fairwayFrom: 143,
    fairwayTo: 392,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 148, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 174, to: 200, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 196, to: 230, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 364, to: 409, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 370, to: 374, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 384, to: 408, side: 'right' },
    ],
  },
  'shinnecock-hills:16': {
    length: 616,
    fairwayFrom: 216,
    fairwayTo: 598,
    greenDepth: 32,
    zones: [
      { id: 'z1', kind: 'bunker', from: 26, to: 36, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 138, to: 170, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 230, to: 234, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 234, to: 242, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 242, to: 262, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 246, to: 250, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 298, to: 326, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 328, to: 342, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 412, to: 422, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 422, to: 432, side: 'cross' },
      { id: 'z11', kind: 'bunker', from: 432, to: 490, side: 'left' },
      { id: 'z12', kind: 'bunker', from: 510, to: 520, side: 'right' },
      { id: 'z13', kind: 'bunker', from: 564, to: 616, side: 'left' },
      { id: 'z14', kind: 'bunker', from: 586, to: 616, side: 'right' },
    ],
  },
  'shinnecock-hills:17': {
    length: 176,
    fairwayFrom: 62,
    fairwayTo: 158,
    greenDepth: 32,
    zones: [
      { id: 'z1', kind: 'bunker', from: 116, to: 176, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 154, to: 172, side: 'left' },
    ],
  },
  'shinnecock-hills:18': {
    length: 481,
    fairwayFrom: 168,
    fairwayTo: 461,
    greenDepth: 35,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 32, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 136, to: 152, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 236, to: 248, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 282, to: 300, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 386, to: 400, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 410, to: 444, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 460, to: 476, side: 'left' },
    ],
  },
  // ===================== Cabot Links (all 18) =====================
  // The course whose SHIPPED TUPLE was not a card at all. Its par sequence
  // disagreed with the club's on six holes and its yardages matched no tee set
  // — it put the famous 100-yd short hole at 16 when the card has it at 14.
  // OSM's par tags match the BLACK card (6854, par 70) on all 18, so par,
  // stroke index and yardage were all rebuilt from that card.
  //
  // Rake 3 (see COURSE_GEO): 33 of 109 bunkers are under 6 yd across, median
  // 7.3 — the muirfield case, and the reason the greenside sand on 5 and 14
  // registers at all.
  //
  // A DEEPROUGH BUG SURFACED HERE and is fixed in the importer rather than by
  // hand: `golf=rough` is dropped wholesale at merge time, but it still won
  // sample points ahead of real hazards, and way/1044331550 covers the whole
  // 5th at -41..37 lateral. Both greenside bunkers on a 186-yd par 3 — 16 and
  // 21 yd off the line — rasterised as rough and then vanished. Hole 3 is
  // genuinely bare even after the fix: its nearest sand is 42 yd off the line.
  //
  // THE SEA IS MOSTLY A VIEW, and that is a measurement rather than a
  // judgement. Projecting the coastline onto each centreline, it comes within
  // the importer's 50-yd corridor on exactly two holes: the 6th, where it runs
  // 14-31 yd off the line for all 465 yd (kept, and the hole's `ocean` zone
  // spans it honestly), and the 16th, where it is 48-87 yd away and dips
  // inside 50 only at the final station — dropped by hand, the
  // whistling-straits:9/18 call, with the tee view showing a wide dune band
  // between corridor and beach. Every other hole is 64-128 yd from the water.
  // Those dune bands are NOT mapped (Cabot has no `natural=scrub` at all) and
  // are deliberately not invented: hand-authoring a whole dune system from
  // imagination is not an import, and there is no measurement here of the kind
  // that justified torrey-pines-south's canyon rims.
  // TEE PADS: `--shift -36 / +55 / +31` on 1, 4 and 12. 1 trims (PV's tee is
  // 33 yd ahead of the OSM start); 4 prepends (PV's tee 40 yd behind, and no
  // mapped pad behind the OSM start); 12 prepends onto mapped pads at -30/-31/
  // -48, which is what carries it since PV's tee there is 47 yd off the line
  // and corroborates nothing.
  'cabot-links:1': {
    length: 540,
    fairwayFrom: 189,
    fairwayTo: 518,
    greenDepth: 40,
    zones: [
      { id: 'z1', kind: 'bunker', from: 16, to: 54, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 92, to: 98, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 160, to: 168, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 228, to: 270, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 242, to: 260, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 468, to: 482, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 470, to: 482, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 514, to: 540, side: 'right' },
    ],
  },
  'cabot-links:2': {
    length: 247,
    fairwayFrom: 86,
    fairwayTo: 223,
    greenDepth: 43,
    zones: [
      { id: 'z1', kind: 'bunker', from: 222, to: 247, side: 'right' },
    ],
  },
  'cabot-links:3': {
    length: 319,
    fairwayFrom: 112,
    fairwayTo: 300,
    greenDepth: 33,
    zones: [

    ],
  },
  'cabot-links:4': {
    length: 450,
    fairwayFrom: 158,
    fairwayTo: 431,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 152, to: 160, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 238, to: 246, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 268, to: 280, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 310, to: 326, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 318, to: 330, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 368, to: 380, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 420, to: 434, side: 'right' },
    ],
  },
  'cabot-links:5': {
    length: 186,
    fairwayFrom: 65,
    fairwayTo: 166,
    greenDepth: 36,
    zones: [
      { id: 'z1', kind: 'bunker', from: 114, to: 134, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 152, to: 162, side: 'right' },
    ],
  },
  'cabot-links:6': {
    length: 465,
    fairwayFrom: 157,
    fairwayTo: 445,
    greenDepth: 36,
    zones: [
      { id: 'z1', kind: 'ocean', from: 1, to: 465, side: 'left' },
      { id: 'z2', kind: 'water', from: 9, to: 229, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 119, to: 129, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 145, to: 167, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 367, to: 377, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 439, to: 443, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 455, to: 463, side: 'left' },
    ],
  },
  'cabot-links:7': {
    length: 195,
    fairwayFrom: 68,
    fairwayTo: 177,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'bunker', from: 176, to: 190, side: 'left' },
    ],
  },
  'cabot-links:8': {
    length: 574,
    fairwayFrom: 201,
    fairwayTo: 555,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 316, to: 404, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 548, to: 574, side: 'left' },
    ],
  },
  'cabot-links:9': {
    length: 357,
    fairwayFrom: 125,
    fairwayTo: 336,
    greenDepth: 37,
    zones: [
      { id: 'z1', kind: 'bunker', from: 86, to: 104, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 158, to: 166, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 194, to: 208, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 240, to: 250, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 272, to: 306, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 306, to: 312, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 324, to: 332, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 342, to: 356, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 348, to: 357, side: 'right' },
    ],
  },
  'cabot-links:10': {
    length: 387,
    fairwayFrom: 135,
    fairwayTo: 367,
    greenDepth: 35,
    zones: [
      { id: 'z1', kind: 'bunker', from: 12, to: 50, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 14, to: 24, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 46, to: 52, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 62, to: 66, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 120, to: 132, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 194, to: 210, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 230, to: 254, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 330, to: 354, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 362, to: 374, side: 'left' },
    ],
  },
  'cabot-links:11': {
    length: 612,
    fairwayFrom: 214,
    fairwayTo: 589,
    greenDepth: 42,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 6, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 220, to: 228, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 338, to: 378, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 518, to: 524, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 522, to: 534, side: 'left' },
    ],
  },
  'cabot-links:12': {
    length: 450,
    fairwayFrom: 158,
    fairwayTo: 429,
    greenDepth: 38,
    zones: [
      { id: 'z1', kind: 'bunker', from: 106, to: 112, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 244, to: 250, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 266, to: 274, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 296, to: 328, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 440, to: 448, side: 'right' },
    ],
  },
  'cabot-links:13': {
    length: 441,
    fairwayFrom: 154,
    fairwayTo: 422,
    greenDepth: 33,
    zones: [
      { id: 'z1', kind: 'bunker', from: 40, to: 48, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 170, to: 178, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 178, to: 186, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 182, to: 208, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 288, to: 296, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 314, to: 322, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 344, to: 350, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 412, to: 428, side: 'left' },
    ],
  },
  'cabot-links:14': {
    length: 99,
    fairwayFrom: 35,
    fairwayTo: 80,
    greenDepth: 33,
    zones: [
      { id: 'z1', kind: 'bunker', from: 40, to: 48, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 78, to: 82, side: 'left' },
    ],
  },
  'cabot-links:15': {
    length: 420,
    fairwayFrom: 147,
    fairwayTo: 408,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 10, to: 16, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 362, to: 376, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 390, to: 416, side: 'left' },
    ],
  },
  'cabot-links:16': {
    length: 465,
    fairwayFrom: 163,
    fairwayTo: 450,
    greenDepth: 25,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 14, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 300, to: 310, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 316, to: 328, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 348, to: 360, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 456, to: 464, side: 'right' },
      { id: 'z6', kind: 'trees', from: 458, to: 465, side: 'right' },
    ],
  },
  'cabot-links:17': {
    length: 168,
    fairwayFrom: 59,
    fairwayTo: 151,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 104, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 128, to: 138, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 130, to: 136, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 152, to: 156, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 164, to: 168, side: 'left' },
    ],
  },
  'cabot-links:18': {
    length: 466,
    fairwayFrom: 163,
    fairwayTo: 445,
    greenDepth: 38,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 160, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 12, to: 22, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 48, to: 60, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 128, to: 142, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 132, to: 138, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 198, to: 210, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 240, to: 262, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 352, to: 360, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 402, to: 408, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 416, to: 426, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 446, to: 466, side: 'right' },
    ],
  },
  // ===================== Los Angeles CC — North (all 18) =====================
  // The course that needed a way-ID pin. Way 56135439 holds BOTH the North and
  // the South — 36 hole ways, two complete sets of ref=1..18, every one
  // UNNAMED — and unlike Pine Valley (where the second course sat in a block
  // 1 km off and lost every colliding ref by 465-961 m) the two routings
  // INTERLEAVE: measured from the North centroid the SOUTH hole wins ref=1 by
  // 16 m and ref=2 by 386 m. Nearest-centre is not weak here, it is wrong, so
  // every hole is pinned by way id in COURSE_GEO.osmHoleWays, established from
  // two independent fingerprints that agree on all 18 (par sequence and
  // per-hole arc length against each course's own BlueGolf card) and then
  // confirmed a third way: PV's "Los Angeles CC North" pins land 0-4 yd from
  // every one of these centrelines' ends.
  //
  // PAR BUG FOUND: the 7th shipped as a par 4 and this course as par 71. The
  // club card, OSM's par tag and the 2023 U.S. Open card all say par 3 — 326 yd
  // off the Tournament tee, 284 for the Open, among the longest par 3s ever
  // used in a major. Fixed in courses.ts; the course is par 70.
  //
  // TEE PADS: `--shift` on 6, 8, 10, 13, 14, 16 (+32, +25, +28, -21, +15, +95).
  // 13 trims — PV's tee is 18 yd AHEAD of the OSM start, so OSM traced from
  // behind. 16 is the big one and the least corroborated: the card wants 542
  // against an imported 447, PV's tee sits 84 yd back which agrees in
  // direction, but 46 yd off the line laterally, so it corroborates the
  // direction and not the distance — the card is carrying that one.
  // Stroke indices already matched the card on all 18 and are untouched.
  // COPY CHECK. h11 "nearly 300 yards of it" — 290 yd, correct. h15 "the
  // barranca grants no mercy" — every one of LACC's 77 `natural=sand`
  // polygons also carries `golf=bunker`, so the barrancas ARE the sand, and
  // this hole has it 86-130 left and 98-130 right around a green starting at
  // 100: the feature the copy names is present, at the right yardage, on both
  // sides. h7 carries new copy for its new par.
  // HAND-FIX h15: `bunker 104-110 cross` was the greenside ring read as a
  // carry (the cypress 3/10/11/13 mode — you cannot carry the green you are
  // aiming at) sitting between two right-side pieces of the same ring; merged
  // into one right zone 98-130.
  'lacc-north:1': {
    length: 571,
    fairwayFrom: 200,
    fairwayTo: 556,
    greenDepth: 25,
    zones: [
      { id: 'z1', kind: 'bunker', from: 48, to: 108, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 242, to: 276, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 280, to: 330, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 476, to: 496, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 532, to: 571, side: 'left' },
    ],
  },
  'lacc-north:2': {
    length: 498,
    fairwayFrom: 174,
    fairwayTo: 486,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 76, to: 88, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 142, to: 154, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 212, to: 244, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 216, to: 220, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 232, to: 236, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 290, to: 306, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 398, to: 432, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 454, to: 468, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 464, to: 478, side: 'right' },
    ],
  },
  'lacc-north:3': {
    length: 395,
    fairwayFrom: 138,
    fairwayTo: 380,
    greenDepth: 25,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 6, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 2, to: 50, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 16, to: 56, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 360, to: 380, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 372, to: 388, side: 'left' },
    ],
  },
  'lacc-north:4': {
    length: 231,
    fairwayFrom: 81,
    fairwayTo: 213,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'bunker', from: 42, to: 70, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 158, to: 200, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 200, to: 226, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 212, to: 230, side: 'left' },
    ],
  },
  'lacc-north:5': {
    length: 483,
    fairwayFrom: 169,
    fairwayTo: 468,
    greenDepth: 25,
    zones: [
      { id: 'z1', kind: 'bunker', from: 56, to: 62, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 446, to: 450, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 450, to: 454, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 454, to: 478, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 460, to: 468, side: 'left' },
    ],
  },
  'lacc-north:6': {
    length: 335,
    fairwayFrom: 117,
    fairwayTo: 323,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 318, to: 332, side: 'right' },
    ],
  },
  'lacc-north:7': {
    length: 330,
    fairwayFrom: 115,
    fairwayTo: 311,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 8, to: 34, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 136, to: 140, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 140, to: 152, side: 'cross' },
      { id: 'z4', kind: 'bunker', from: 150, to: 154, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 152, to: 156, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 180, to: 204, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 234, to: 264, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 274, to: 286, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 284, to: 328, side: 'right' },
    ],
  },
  'lacc-north:8': {
    length: 555,
    fairwayFrom: 194,
    fairwayTo: 541,
    greenDepth: 23,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 14, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 72, to: 86, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 100, to: 144, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 230, to: 256, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 254, to: 304, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 336, to: 364, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 376, to: 398, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 506, to: 555, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 528, to: 555, side: 'right' },
    ],
  },
  'lacc-north:9': {
    length: 180,
    fairwayFrom: 63,
    fairwayTo: 158,
    greenDepth: 40,
    zones: [
      { id: 'z1', kind: 'bunker', from: 72, to: 82, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 76, to: 118, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 134, to: 138, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 154, to: 180, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 160, to: 180, side: 'right' },
    ],
  },
  'lacc-north:10': {
    length: 409,
    fairwayFrom: 143,
    fairwayTo: 392,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'bunker', from: 20, to: 30, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 238, to: 300, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 344, to: 362, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 376, to: 390, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 396, to: 409, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 402, to: 409, side: 'left' },
    ],
  },
  'lacc-north:11': {
    length: 290,
    fairwayFrom: 102,
    fairwayTo: 270,
    greenDepth: 36,
    zones: [
      { id: 'z1', kind: 'bunker', from: 10, to: 34, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 12, to: 38, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 224, to: 262, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 244, to: 274, side: 'right' },
    ],
  },
  'lacc-north:12': {
    length: 385,
    fairwayFrom: 135,
    fairwayTo: 373,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 106, to: 130, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 352, to: 370, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 352, to: 385, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 356, to: 364, side: 'cross' },
    ],
  },
  'lacc-north:13': {
    length: 510,
    fairwayFrom: 179,
    fairwayTo: 490,
    greenDepth: 36,
    zones: [
      { id: 'z1', kind: 'bunker', from: 362, to: 376, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 376, to: 386, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 402, to: 426, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 428, to: 450, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 438, to: 444, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 474, to: 502, side: 'right' },
    ],
  },
  'lacc-north:14': {
    length: 633,
    fairwayFrom: 222,
    fairwayTo: 619,
    greenDepth: 23,
    zones: [
      { id: 'z1', kind: 'water', from: 12, to: 20, side: 'right' },
      { id: 'z2', kind: 'water', from: 36, to: 48, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 68, to: 98, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 160, to: 182, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 284, to: 298, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 298, to: 312, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 466, to: 506, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 536, to: 542, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 592, to: 633, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 594, to: 602, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 596, to: 600, side: 'cross' },
      { id: 'z12', kind: 'bunker', from: 616, to: 622, side: 'right' },
    ],
  },
  'lacc-north:15': {
    length: 130,
    fairwayFrom: 46,
    fairwayTo: 113,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'bunker', from: 18, to: 44, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 86, to: 130, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 98, to: 130, side: 'right' },
    ],
  },
  'lacc-north:16': {
    length: 542,
    fairwayFrom: 190,
    fairwayTo: 522,
    greenDepth: 36,
    zones: [
      { id: 'z1', kind: 'bunker', from: 14, to: 64, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 26, to: 68, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 142, to: 156, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 192, to: 206, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 258, to: 274, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 296, to: 320, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 324, to: 342, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 494, to: 520, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 496, to: 508, side: 'left' },
    ],
  },
  'lacc-north:17': {
    length: 523,
    fairwayFrom: 183,
    fairwayTo: 509,
    greenDepth: 23,
    zones: [
      { id: 'z1', kind: 'bunker', from: 8, to: 36, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 14, to: 24, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 140, to: 154, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 182, to: 226, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 226, to: 232, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 266, to: 274, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 286, to: 300, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 298, to: 314, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 320, to: 336, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 348, to: 374, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 358, to: 390, side: 'left' },
      { id: 'z12', kind: 'bunker', from: 396, to: 408, side: 'right' },
      { id: 'z13', kind: 'bunker', from: 442, to: 522, side: 'right' },
      { id: 'z14', kind: 'bunker', from: 446, to: 458, side: 'left' },
      { id: 'z15', kind: 'bunker', from: 502, to: 523, side: 'left' },
    ],
  },
  'lacc-north:18': {
    length: 494,
    fairwayFrom: 173,
    fairwayTo: 473,
    greenDepth: 38,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 10, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 12, to: 16, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 26, to: 76, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 98, to: 104, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 114, to: 120, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 208, to: 212, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 212, to: 256, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 434, to: 494, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 460, to: 490, side: 'right' },
    ],
  },
  // ===================== Trump National Doral — Blue Monster (all 18) ======
  // Identity is uncontested: way 112673308 wraps only the Blue, its 18 hole
  // ways are all named "Blue Monster N", and OSM's `par` AND `handicap` tags
  // match BlueGolf's BLACK card on ALL 18 — the torrey-pines corroboration
  // pattern, and what gave confidence to replace the shipped yardages
  // wholesale: those matched neither the Black card (7545) nor the 2016 WGC
  // setup (7528), missing by up to 65 yd a hole, so they were an approximation
  // of no real configuration.
  //
  // WHICH CARD: the Black one throughout, deliberately, rather than mixing.
  // Doral has at least three published setups (Black 7545, WGC 2016 7528,
  // Cadillac 2026 7739) and the mapper picked pads per hole, so no single card
  // fits every hole — total absolute deviation is 316 yd against Black, 299
  // against the WGC and 420 against the Cadillac. Black wins on being the
  // club's own published card and the one OSM's own tags agree with.
  // The cost is visible on three holes where OSM and PV both measure a longer
  // pad than the Black card uses (4: 231/230 vs 206; 11: 453/455 vs 423;
  // 15: 187/187 vs 155) and are therefore TRIMMED to it. Trimming discards
  // measured line rather than inventing a straight run, so it is the safer
  // half of --shift, and hole 15's result was checked against the tee view:
  // water 40-130 running up to a green starting at 132 is what the imagery
  // shows. Hole 4's water starting at 0 is likewise real and not a trim
  // artifact — its tee sits on the lake edge (OSM's own water polygon starts
  // 4 yd along the untrimmed line).
  //
  // TWO PHANTOM CROSSES, both the same lake and both confirmed from the tee in
  // the 3D planner. On 10, way/869986875 runs the WHOLE hole (along 34-598,
  // lateral -26..46) and the coarse centreline hugs its edge, so the middle of
  // it rasterised as a 272-yd full-width carry on a 626-yd par 5; the tee view
  // shows water down the left the entire way with a tree line between it and
  // the fairway, and nothing across the playing line. On 16, way/109724858
  // does the same thing (40-80 left, 80-128 "cross", 128-338 left is one
  // continuous lake). Both folded into the single left zone they always were.
  // The par-3 crosses that SURVIVED are real: 4, 9 and 15 all play across
  // water, each ruled a single-polygon carry by --profile and each with 0-1%
  // mapped fairway beside it, against 65%/59% on hole 1 as a control.
  // HAND-FIXES also: 11's `394-398 cross` dropped (greenside ring; 354-423
  // left and 390-423 right already ring a green starting at 392) and 12's
  // cross clipped to the green edge.
  // h17's greenDepth hits the 45-yd clamp but is NOT the cypress-point:1
  // green-clip — the importer reports no second green on its line. That green
  // really is that deep.
  // COPY CHECK. h18 "water clings to the left for home" — water 22-332,
  // 376-416 and 442-477 all LEFT, plus the carry to a green starting at 442.
  // Rake stays at 6: exactly one of 101 bunkers is under 6 yd across.
  'doral-blue-monster:1': {
    length: 582,
    fairwayFrom: 204,
    fairwayTo: 559,
    greenDepth: 42,
    zones: [
      { id: 'z1', kind: 'water', from: 190, to: 210, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 250, to: 286, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 302, to: 324, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 392, to: 426, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 446, to: 478, side: 'right' },
      { id: 'z6', kind: 'water', from: 526, to: 582, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 550, to: 564, side: 'left' },
    ],
  },
  'doral-blue-monster:2': {
    length: 446,
    fairwayFrom: 156,
    fairwayTo: 423,
    greenDepth: 42,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 6, side: 'right' },
      { id: 'z2', kind: 'water', from: 0, to: 22, side: 'left' },
      { id: 'z3', kind: 'water', from: 26, to: 110, side: 'right' },
      { id: 'z4', kind: 'water', from: 34, to: 240, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 36, to: 46, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 246, to: 260, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 290, to: 330, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 322, to: 328, side: 'cross' },
      { id: 'z9', kind: 'water', from: 372, to: 446, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 400, to: 442, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 444, to: 446, side: 'right' },
    ],
  },
  'doral-blue-monster:3': {
    length: 433,
    fairwayFrom: 152,
    fairwayTo: 411,
    greenDepth: 39,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 158, side: 'left' },
      { id: 'z2', kind: 'water', from: 130, to: 433, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 286, to: 332, side: 'left' },
    ],
  },
  'doral-blue-monster:4': {
    length: 206,
    fairwayFrom: 72,
    fairwayTo: 188,
    greenDepth: 32,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 176, side: 'cross' },
      { id: 'z2', kind: 'water', from: 176, to: 206, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 192, to: 206, side: 'left' },
    ],
  },
  'doral-blue-monster:5': {
    length: 421,
    fairwayFrom: 147,
    fairwayTo: 405,
    greenDepth: 27,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 4, side: 'right' },
      { id: 'z2', kind: 'water', from: 0, to: 12, side: 'left' },
      { id: 'z3', kind: 'water', from: 138, to: 214, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 258, to: 314, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 296, to: 328, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 384, to: 398, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 396, to: 421, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 408, to: 421, side: 'right' },
      { id: 'z9', kind: 'water', from: 416, to: 421, side: 'left' },
    ],
  },
  'doral-blue-monster:6': {
    length: 425,
    fairwayFrom: 149,
    fairwayTo: 410,
    greenDepth: 25,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 24, side: 'right' },
      { id: 'z2', kind: 'water', from: 38, to: 158, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 240, to: 282, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 280, to: 310, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 312, to: 334, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 394, to: 425, side: 'left' },
    ],
  },
  'doral-blue-monster:7': {
    length: 469,
    fairwayFrom: 164,
    fairwayTo: 455,
    greenDepth: 23,
    zones: [
      { id: 'z1', kind: 'water', from: 100, to: 168, side: 'right' },
      { id: 'z2', kind: 'water', from: 188, to: 244, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 220, to: 238, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 252, to: 312, side: 'left' },
      { id: 'z5', kind: 'water', from: 306, to: 460, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 432, to: 468, side: 'left' },
    ],
  },
  'doral-blue-monster:8': {
    length: 553,
    fairwayFrom: 194,
    fairwayTo: 536,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'water', from: 4, to: 122, side: 'right' },
      { id: 'z2', kind: 'water', from: 52, to: 148, side: 'left' },
      { id: 'z3', kind: 'water', from: 158, to: 230, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 258, to: 276, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 294, to: 308, side: 'right' },
      { id: 'z6', kind: 'water', from: 312, to: 553, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 412, to: 440, side: 'right' },
      { id: 'z8', kind: 'water', from: 462, to: 504, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 510, to: 548, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 512, to: 518, side: 'left' },
    ],
  },
  'doral-blue-monster:9': {
    length: 209,
    fairwayFrom: 73,
    fairwayTo: 188,
    greenDepth: 37,
    zones: [
      { id: 'z1', kind: 'bunker', from: 22, to: 30, side: 'right' },
      { id: 'z2', kind: 'water', from: 24, to: 32, side: 'right' },
      { id: 'z3', kind: 'water', from: 24, to: 32, side: 'left' },
      { id: 'z4', kind: 'water', from: 32, to: 102, side: 'cross' },
      { id: 'z5', kind: 'water', from: 102, to: 209, side: 'right' },
      { id: 'z6', kind: 'water', from: 114, to: 190, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 204, to: 209, side: 'left' },
    ],
  },
  'doral-blue-monster:10': {
    length: 626,
    fairwayFrom: 218,
    fairwayTo: 603,
    greenDepth: 41,
    zones: [
      { id: 'z1', kind: 'bunker', from: 8, to: 18, side: 'left' },
      { id: 'z2', kind: 'water', from: 42, to: 626, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 299, to: 340, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 359, to: 378, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 437, to: 457, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 530, to: 579, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 591, to: 619, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 605, to: 626, side: 'right' },
    ],
  },
  'doral-blue-monster:11': {
    length: 423,
    fairwayFrom: 148,
    fairwayTo: 405,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 44, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 10, to: 20, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 32, to: 58, side: 'right' },
      { id: 'z4', kind: 'water', from: 46, to: 206, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 242, to: 286, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 286, to: 314, side: 'cross' },
      { id: 'z7', kind: 'bunker', from: 288, to: 292, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 302, to: 332, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 330, to: 342, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 354, to: 423, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 390, to: 423, side: 'right' },
    ],
  },
  'doral-blue-monster:12': {
    length: 599,
    fairwayFrom: 210,
    fairwayTo: 585,
    greenDepth: 23,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 420, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 246, to: 264, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 292, to: 310, side: 'right' },
      { id: 'z4', kind: 'water', from: 320, to: 368, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 350, to: 374, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 426, to: 504, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 474, to: 516, side: 'left' },
      { id: 'z8', kind: 'trees', from: 490, to: 550, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 542, to: 568, side: 'right' },
      { id: 'z10', kind: 'trees', from: 560, to: 599, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 572, to: 576, side: 'cross' },
      { id: 'z12', kind: 'bunker', from: 576, to: 599, side: 'left' },
      { id: 'z13', kind: 'bunker', from: 578, to: 599, side: 'right' },
    ],
  },
  'doral-blue-monster:13': {
    length: 243,
    fairwayFrom: 85,
    fairwayTo: 224,
    greenDepth: 33,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 202, side: 'right' },
      { id: 'z2', kind: 'trees', from: 0, to: 6, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 26, to: 46, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 206, to: 230, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 218, to: 236, side: 'left' },
    ],
  },
  'doral-blue-monster:14': {
    length: 474,
    fairwayFrom: 166,
    fairwayTo: 461,
    greenDepth: 22,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 10, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 62, to: 70, side: 'right' },
      { id: 'z3', kind: 'water', from: 92, to: 474, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 258, to: 292, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 284, to: 314, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 302, to: 312, side: 'left' },
      { id: 'z7', kind: 'trees', from: 338, to: 384, side: 'right' },
      { id: 'z8', kind: 'bunker', from: 356, to: 370, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 430, to: 466, side: 'left' },
      { id: 'z10', kind: 'bunker', from: 454, to: 466, side: 'right' },
    ],
  },
  'doral-blue-monster:15': {
    length: 155,
    fairwayFrom: 54,
    fairwayTo: 141,
    greenDepth: 23,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 68, side: 'right' },
      { id: 'z2', kind: 'water', from: 32, to: 40, side: 'left' },
      { id: 'z3', kind: 'water', from: 40, to: 130, side: 'cross' },
      { id: 'z4', kind: 'water', from: 130, to: 155, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 140, to: 155, side: 'right' },
    ],
  },
  'doral-blue-monster:16': {
    length: 350,
    fairwayFrom: 122,
    fairwayTo: 338,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'trees', from: 0, to: 58, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 2, to: 20, side: 'left' },
      { id: 'z3', kind: 'water', from: 40, to: 338, side: 'left' },
      { id: 'z4', kind: 'trees', from: 82, to: 102, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 224, to: 274, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 246, to: 256, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 274, to: 294, side: 'cross' },
      { id: 'z8', kind: 'bunker', from: 284, to: 308, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 288, to: 300, side: 'right' },
      { id: 'z10', kind: 'bunker', from: 324, to: 344, side: 'right' },
      { id: 'z11', kind: 'bunker', from: 328, to: 340, side: 'left' },
    ],
  },
  'doral-blue-monster:17': {
    length: 428,
    fairwayFrom: 150,
    fairwayTo: 403,
    greenDepth: 45,
    zones: [
      { id: 'z1', kind: 'water', from: 2, to: 208, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 52, to: 74, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 258, to: 316, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 270, to: 282, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 298, to: 322, side: 'left' },
      { id: 'z6', kind: 'water', from: 340, to: 428, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 384, to: 428, side: 'left' },
    ],
  },
  'doral-blue-monster:18': {
    length: 477,
    fairwayFrom: 167,
    fairwayTo: 457,
    greenDepth: 35,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 50, side: 'right' },
      { id: 'z2', kind: 'water', from: 22, to: 332, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 330, to: 364, side: 'right' },
      { id: 'z4', kind: 'water', from: 376, to: 416, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 382, to: 400, side: 'right' },
      { id: 'z6', kind: 'water', from: 416, to: 442, side: 'cross' },
      { id: 'z7', kind: 'water', from: 442, to: 477, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 444, to: 460, side: 'right' },
      { id: 'z9', kind: 'bunker', from: 470, to: 477, side: 'right' },
    ],
  },

  // ---------------------------------------------------------------------
  // THE DOGLEG — Clubhouse, USA. HAND-DESIGNED, not imported: the course
  // exists nowhere but here, so every zone below is original architecture
  // (no OSM, no ODbL note). The design brief: every two-shotter turns, the
  // corners sharpen as the round goes, and the trouble always lives down
  // the INSIDE of the bend — cutting the corner is the whole game. House
  // easter eggs: the billboard off the first tee (landmark), Jack's Corner
  // at 9 and Cam's Bite at 11 (the architects' initials), and the D and L
  // cut into the sand flanking the last green (ZoneStyle letterD/letterL).
  // ---------------------------------------------------------------------
  // 1 — First Turn: the brand statement. Long, hard corner right; the
  // bunker complex stacked on the inside is what "sharp" looks like.
  'the-dogleg:1': {
    length: 452,
    fairwayFrom: 178,
    fairwayTo: 434,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'trees', from: 140, to: 440, side: 'left' },
      { id: 'z2', kind: 'deeprough', from: 180, to: 260, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 262, to: 318, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 315, to: 352, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 424, to: 452, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 430, to: 452, side: 'right' },
    ],
  },
  // 2 — the counter-turn: gentler left, pond short-left of the green
  'the-dogleg:2': {
    length: 401,
    fairwayFrom: 168,
    fairwayTo: 386,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'trees', from: 150, to: 380, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 240, to: 290, side: 'left' },
      { id: 'z3', kind: 'water', from: 330, to: 372, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 384, to: 401, side: 'right' },
    ],
  },
  // 3 — short hole over water down the left
  'the-dogleg:3': {
    length: 176,
    fairwayFrom: 60,
    fairwayTo: 160,
    greenDepth: 27,
    zones: [
      { id: 'z1', kind: 'water', from: 90, to: 158, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 160, to: 176, side: 'right' },
    ],
  },
  // 4 — the creek crosses twice, exactly as the signature promises: once in
  // the landing zone, once at the green's doorstep feeding the right pond
  'the-dogleg:4': {
    length: 528,
    fairwayFrom: 172,
    fairwayTo: 506,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'trees', from: 160, to: 480, side: 'left' },
      { id: 'z2', kind: 'water', from: 292, to: 312, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 318, to: 352, side: 'left' },
      { id: 'z4', kind: 'water', from: 452, to: 472, side: 'cross' },
      { id: 'z5', kind: 'water', from: 470, to: 510, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 508, to: 528, side: 'right' },
    ],
  },
  // 5 — the double-stack corner left
  'the-dogleg:5': {
    length: 431,
    fairwayFrom: 175,
    fairwayTo: 414,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'trees', from: 150, to: 420, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 258, to: 306, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 300, to: 340, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 398, to: 431, side: 'right' },
    ],
  },
  // 6 — short and tactical: sand inside, a pondlet guarding the lay-up side
  'the-dogleg:6': {
    length: 366,
    fairwayFrom: 160,
    fairwayTo: 350,
    greenDepth: 27,
    zones: [
      { id: 'z1', kind: 'deeprough', from: 200, to: 330, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 228, to: 268, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 262, to: 292, side: 'right' },
      { id: 'z4', kind: 'water', from: 300, to: 352, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 344, to: 366, side: 'left' },
    ],
  },
  // 7 — the flick: tiny, ringed by sand (front band ends short of the green
  // face — never a cross into the putting surface)
  'the-dogleg:7': {
    length: 149,
    fairwayFrom: 55,
    fairwayTo: 130,
    greenDepth: 27,
    zones: [
      { id: 'z1', kind: 'bunker', from: 108, to: 126, side: 'cross' },
      { id: 'z2', kind: 'bunker', from: 126, to: 149, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 128, to: 149, side: 'right' },
    ],
  },
  // 8 — THE ELBOW, SI 1: the sharpest corner on the card, and the lake owns
  // the entire inside of it. The brave line carries water the whole way.
  'the-dogleg:8': {
    length: 445,
    fairwayFrom: 180,
    fairwayTo: 428,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'trees', from: 150, to: 430, side: 'right' },
      { id: 'z2', kind: 'water', from: 210, to: 400, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 300, to: 345, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 418, to: 445, side: 'left' },
    ],
  },
  // 9 — JACK'S CORNER: the turn for home. The architect's bunker sits square
  // on the corner; the pond waits for the second shot that bails right.
  'the-dogleg:9': {
    length: 556,
    fairwayFrom: 175,
    fairwayTo: 534,
    greenDepth: 32,
    zones: [
      { id: 'z1', kind: 'trees', from: 170, to: 520, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 268, to: 330, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 356, to: 410, side: 'left' },
      { id: 'z4', kind: 'water', from: 420, to: 500, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 528, to: 556, side: 'left' },
    ],
  },
  // 10 — the back nine opens gently left
  'the-dogleg:10': {
    length: 397,
    fairwayFrom: 165,
    fairwayTo: 380,
    greenDepth: 28,
    zones: [
      { id: 'z1', kind: 'trees', from: 160, to: 380, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 244, to: 292, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 372, to: 397, side: 'right' },
    ],
  },
  // 11 — CAM'S BITE: the lake takes a mouthful out of the inside corner.
  // Carry it or go the long way — the signature is the geometry.
  'the-dogleg:11': {
    length: 430,
    fairwayFrom: 172,
    fairwayTo: 412,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'deeprough', from: 180, to: 250, side: 'right' },
      { id: 'z2', kind: 'water', from: 250, to: 390, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 300, to: 350, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 404, to: 430, side: 'left' },
    ],
  },
  // 12 — even the short holes turn here: a bail-out par 3 that doglegs
  // left around the water. Safe/normal lay up; only aggressive takes the
  // flag over the wet stuff. (Hand-authored bailout, house precedent.)
  'the-dogleg:12': {
    length: 188,
    fairwayFrom: 58,
    fairwayTo: 170,
    greenDepth: 28,
    zones: [
      { id: 'z1', kind: 'water', from: 96, to: 188, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 168, to: 188, side: 'left' },
    ],
    bailout: { side: 'left', safe: [92, 122], normal: [132, 162] },
  },
  // 13 — THE STAIRCASE: three bunkers climb the inside of the long left
  // sweep; the creek crosses once more before the green
  'the-dogleg:13': {
    length: 572,
    fairwayFrom: 180,
    fairwayTo: 548,
    greenDepth: 33,
    zones: [
      { id: 'z1', kind: 'trees', from: 160, to: 540, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 262, to: 300, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 318, to: 356, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 372, to: 410, side: 'left' },
      { id: 'z5', kind: 'water', from: 500, to: 522, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 548, to: 572, side: 'right' },
    ],
  },
  // 14 — the long right-hander; water guards the approach-side bail
  'the-dogleg:14': {
    length: 449,
    fairwayFrom: 178,
    fairwayTo: 430,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'trees', from: 150, to: 430, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 270, to: 330, side: 'right' },
      { id: 'z3', kind: 'water', from: 396, to: 440, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 420, to: 449, side: 'left' },
    ],
  },
  // 15 — SNAP HOOK: the drivable dare. The carry over the inside water is
  // the tee shot the hole is named for; the safe line is all fairway.
  'the-dogleg:15': {
    length: 318,
    fairwayFrom: 150,
    fairwayTo: 300,
    greenDepth: 27,
    zones: [
      { id: 'z1', kind: 'water', from: 208, to: 268, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 270, to: 302, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 240, to: 290, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 296, to: 318, side: 'right' },
    ],
  },
  // 16 — the long-iron exam: sand both sides, scrub short-right
  'the-dogleg:16': {
    length: 203,
    fairwayFrom: 70,
    fairwayTo: 186,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'deeprough', from: 120, to: 180, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 178, to: 203, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 182, to: 203, side: 'right' },
    ],
  },
  // 17 — the penultimate turn: sand at the corner, water left of the green
  'the-dogleg:17': {
    length: 428,
    fairwayFrom: 170,
    fairwayTo: 410,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'bunker', from: 250, to: 300, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 258, to: 312, side: 'right' },
      { id: 'z3', kind: 'trees', from: 312, to: 410, side: 'right' },
      { id: 'z4', kind: 'water', from: 380, to: 420, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 402, to: 428, side: 'right' },
    ],
  },
  // 18 — THE LONG WAY HOME: the double dogleg in the shape of the mark.
  // Left off the tee (water inside the first corner), right at the last
  // turn, the home creek crossed by the footbridge (landmark), and the
  // D and L cut into the sand either side of the green — the house
  // initials, waiting for anyone who looks twice.
  'the-dogleg:18': {
    length: 566,
    fairwayFrom: 182,
    fairwayTo: 540,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'trees', from: 150, to: 360, side: 'right' },
      { id: 'z2', kind: 'water', from: 210, to: 320, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 250, to: 300, side: 'right' },
      { id: 'z4', kind: 'water', from: 452, to: 474, side: 'cross' },
      { id: 'z5', kind: 'bunker', from: 480, to: 520, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 476, to: 516, side: 'right' },
      { id: 'z7', kind: 'bunker', from: 538, to: 566, side: 'left', style: 'letterD' },
      { id: 'z8', kind: 'bunker', from: 540, to: 566, side: 'right', style: 'letterL' },
    ],
  },
  // ===================== Bellerive Country Club (all 18) =====================
  // DogLeg Cup opening-exhibition venue (bellerive-2026). OSM way 617944761,
  // one clean polygon, 18 unnamed ref=1..18 hole ways. IDENTITY: PV's per-hole
  // tee sits 1-7 yd from every OSM centreline start and its pin 1-11 yd from
  // every end (the shinnecock/doral numeric pass, id=368), and OSM's par tags
  // match BlueGolf's BLACK card on all 18.
  // CARD: BlueGolf BLACK, par 72 / 7506, 76.5/146 (bluegolf course id
  // 'bellerivecc'). OSM handicap tags corroborate 16 of 18 (they swap 12 and
  // 17's 4/6; the card wins). Rake stays 6 (3 of 88 bunkers under 6 yd,
  // median 14.3).
  // TEE PADS: four holes import short of the card past tee-box variance —
  // 2 (+28), 5 (+18), 8 (+14), 17 (+31) — and on every one the centreline
  // already starts on the BACKMOST mapped pad with PV agreeing (its tee-to-pin
  // tracks OSM, e.g. 412 and 605 against the card's 427 and 624). So the card
  // is carrying those four alone: the BLACK pads are simply unmapped and
  // unimaged — the muirfield-15 / camargo-16 call — and they take a positive
  // --shift. Hole 2 note: 11 of its 28 is Chaikin corner-cutting (raw arc 410,
  // smoothed 399), so its post-corner zones sit truest and its driving bunker
  // carries up to ~10 yd of shift error — accepted, within QA tolerance.
  // THE CREEK (carnoustie linestring mode): Smith Creek (way 469780839) and a
  // second stream (350712126) are waterway=stream lines, invisible to the
  // polygon rasterizer, so a course whose closing holes are defined by a creek
  // imported water-free outside the ponds. Both were projected onto every
  // shifted centreline: crossings at 82-194 yd on 2/8/9/12/13 are short of any
  // landing area and stay out (the quail-hollow:18 no-invented-carry call; 12
  // and 13 instead move fairwayFrom past a creek AT the fairway start), while
  // 8, 10 and 17 carry hand-laid zones — see the HAND comments inline.
  // QA: every hole walked in PV's 3D planner from the tee; per-side greenside
  // census against the polygons (one clipped pin-high bunker restored on 14).
  'bellerive:1': {
    length: 429,
    fairwayFrom: 150,
    fairwayTo: 412,
    greenDepth: 29,
    zones: [
      { id: 'z1', kind: 'bunker', from: 28, to: 44, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 260, to: 304, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 300, to: 326, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 400, to: 429, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 412, to: 429, side: 'right' },
    ],
  },
  'bellerive:2': {
    length: 427,
    fairwayFrom: 149,
    fairwayTo: 412,
    greenDepth: 25,
    zones: [
      { id: 'z1', kind: 'bunker', from: 28, to: 46, side: 'right' },
      { id: 'z2', kind: 'water', from: 254, to: 424, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 318, to: 338, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 406, to: 427, side: 'right' },
    ],
  },
  'bellerive:3': {
    length: 162,
    fairwayFrom: 57,
    fairwayTo: 145,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'water', from: 74, to: 142, side: 'cross' },
      { id: 'z2', kind: 'water', from: 142, to: 162, side: 'right' },
    ],
  },
  'bellerive:4': {
    length: 552,
    fairwayFrom: 193,
    fairwayTo: 535,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'water', from: 0, to: 12, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 236, to: 266, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 300, to: 332, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 468, to: 504, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 508, to: 548, side: 'left' },
      { id: 'z6', kind: 'bunker', from: 524, to: 544, side: 'right' },
    ],
  },
  'bellerive:5': {
    length: 489,
    fairwayFrom: 171,
    fairwayTo: 473,
    greenDepth: 27,
    zones: [
      { id: 'z1', kind: 'bunker', from: 6, to: 30, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 52, to: 82, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 102, to: 122, side: 'left' },
      { id: 'z4', kind: 'water', from: 260, to: 294, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 456, to: 474, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 480, to: 489, side: 'left' },
    ],
  },
  'bellerive:6': {
    length: 215,
    fairwayFrom: 75,
    fairwayTo: 201,
    greenDepth: 23,
    zones: [
      { id: 'z1', kind: 'bunker', from: 2, to: 6, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 48, to: 82, side: 'left' },
      { id: 'z3', kind: 'water', from: 146, to: 180, side: 'cross' },
      { id: 'z4', kind: 'water', from: 180, to: 210, side: 'right' },
      { id: 'z5', kind: 'bunker', from: 196, to: 210, side: 'left' },
    ],
  },
  'bellerive:7': {
    length: 390,
    fairwayFrom: 137,
    fairwayTo: 373,
    greenDepth: 30,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 12, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 34, to: 52, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 248, to: 272, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 274, to: 300, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 298, to: 332, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 362, to: 374, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 370, to: 390, side: 'right' },
    ],
  },
  'bellerive:8': {
    length: 612,
    fairwayFrom: 214,
    fairwayTo: 597,
    greenDepth: 26,
    zones: [
      { id: 'z1', kind: 'bunker', from: 308, to: 336, side: 'right' },
      { id: 'z2', kind: 'water', from: 410, to: 520, side: 'right' }, // HAND: Smith Creek runs 9-17 yd off the right through the layup zone (waterway=stream linestring, invisible to the polygon rasterizer — carnoustie mode). Projected onto the shifted centreline; the trivial tee-front crossing at 84 stays out (fairway already starts at 214).
      { id: 'z3', kind: 'bunker', from: 486, to: 520, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 584, to: 612, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 586, to: 604, side: 'right' },
    ],
  },
  'bellerive:9': {
    length: 435,
    fairwayFrom: 152,
    fairwayTo: 417,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'bunker', from: 56, to: 74, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 276, to: 322, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 408, to: 426, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 412, to: 430, side: 'left' },
    ],
  },
  'bellerive:10': {
    length: 505,
    fairwayFrom: 177,
    fairwayTo: 493,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 94, to: 104, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 302, to: 330, side: 'left' },
      { id: 'z3', kind: 'water', from: 444, to: 460, side: 'cross' }, // HAND: the creek crosses the corridor at ~452, 60 yd short of the green — the go-for-it-in-two carry. Projected from the waterway linestring (carnoustie mode) and confirmed in the planner.
      { id: 'z4', kind: 'bunker', from: 472, to: 482, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 482, to: 502, side: 'right' },
    ],
  },
  'bellerive:11': {
    length: 368,
    fairwayFrom: 129,
    fairwayTo: 354,
    greenDepth: 24,
    zones: [
      { id: 'z1', kind: 'bunker', from: 222, to: 238, side: 'right' },
      { id: 'z2', kind: 'water', from: 294, to: 356, side: 'right' },
    ],
  },
  'bellerive:12': {
    length: 473,
    fairwayFrom: 185,
    fairwayTo: 455,
    greenDepth: 31,
    zones: [
      { id: 'z1', kind: 'bunker', from: 318, to: 338, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 358, to: 372, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 446, to: 466, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 454, to: 473, side: 'right' },
    ],
  },
  'bellerive:13': {
    length: 190,
    fairwayFrom: 90,
    fairwayTo: 168,
    greenDepth: 40,
    zones: [
      { id: 'z1', kind: 'bunker', from: 154, to: 180, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 176, to: 190, side: 'left' },
    ],
  },
  'bellerive:14': {
    length: 415,
    fairwayFrom: 145,
    fairwayTo: 394,
    greenDepth: 37,
    zones: [
      { id: 'z1', kind: 'bunker', from: 282, to: 300, side: 'right' },
      { id: 'z2', kind: 'bunker', from: 310, to: 328, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 398, to: 415, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 400, to: 415, side: 'left' }, // HAND: pin-high left sand (way 617907439) sits at raw arc 420-421, past the smoothed length, so the rasterizer clipped it to nothing — harbour-town:4 mode. Confirmed in the planner; spanned to the green edge.
    ],
  },
  'bellerive:15': {
    length: 495,
    fairwayFrom: 173,
    fairwayTo: 482,
    greenDepth: 21,
    zones: [
      { id: 'z1', kind: 'bunker', from: 318, to: 344, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 466, to: 484, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 470, to: 484, side: 'left' },
    ],
  },
  'bellerive:16': {
    length: 240,
    fairwayFrom: 84,
    fairwayTo: 219,
    greenDepth: 38,
    zones: [
      { id: 'z1', kind: 'bunker', from: 202, to: 218, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 206, to: 222, side: 'right' },
    ],
  },
  'bellerive:17': {
    length: 624,
    fairwayFrom: 218,
    fairwayTo: 605,
    greenDepth: 34,
    zones: [
      { id: 'z1', kind: 'bunker', from: 0, to: 16, side: 'right' },
      { id: 'z2', kind: 'water', from: 72, to: 128, side: 'right' },
      { id: 'z3', kind: 'water', from: 190, to: 455, side: 'right' }, // HAND: Smith Creek hugs the right at 1-23 yd off from the drive through the layup (carnoustie mode; quail-hollow:18 long-lateral precedent). The treed near-tee run down the left and its crossing at ~180 stay out — short of the fairway (218), no invented carry.
      { id: 'z4', kind: 'bunker', from: 288, to: 332, side: 'left' },
      { id: 'z5', kind: 'water', from: 455, to: 468, side: 'cross' }, // HAND: first genuine layup crossing, measured at ~460-465 on the shifted line.
      { id: 'z6', kind: 'water', from: 468, to: 518, side: 'left' }, // HAND: between its two crossings the creek runs 3-7 yd left of the line — the layup corridor is a sliver right of it.
      { id: 'z7', kind: 'bunker', from: 516, to: 532, side: 'left' },
      { id: 'z8', kind: 'water', from: 518, to: 530, side: 'cross' }, // HAND: second crossing at ~519-525; the imported 516-532 left bunker is real sand beside the same weave.
      { id: 'z9', kind: 'water', from: 530, to: 590, side: 'right' }, // HAND: the creek exits right and runs 4-24 yd off toward the green, fading out past 590.
      { id: 'z10', kind: 'bunker', from: 554, to: 570, side: 'left' },
      { id: 'z11', kind: 'bunker', from: 596, to: 606, side: 'right' },
      { id: 'z12', kind: 'bunker', from: 604, to: 616, side: 'left' },
    ],
  },
  'bellerive:18': {
    length: 455,
    fairwayFrom: 159,
    fairwayTo: 436,
    greenDepth: 33,
    zones: [
      { id: 'z1', kind: 'bunker', from: 244, to: 290, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 298, to: 324, side: 'right' },
      { id: 'z3', kind: 'bunker', from: 422, to: 440, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 422, to: 452, side: 'right' },
    ],
  },
}
