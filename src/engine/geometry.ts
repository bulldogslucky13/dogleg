import type { HazardZone } from './types'

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
  'harbour-town:3': {
    length: 436,
    fairwayFrom: 153,
    fairwayTo: 424,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 32, to: 40, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 60, to: 74, side: 'left' },
      { id: 'z3', kind: 'bunker', from: 210, to: 360, side: 'right' },
      { id: 'z4', kind: 'bunker', from: 388, to: 424, side: 'left' },
      { id: 'z5', kind: 'water', from: 422, to: 436, side: 'right' },
      { id: 'z6', kind: 'bunker', from: 430, to: 436, side: 'right' },
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
  'harbour-town:16': {
    length: 409,
    fairwayFrom: 143,
    fairwayTo: 397,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 234, to: 280, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 280, to: 334, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 314, to: 320, side: 'left' },
      { id: 'z4', kind: 'bunker', from: 334, to: 348, side: 'left' },
      { id: 'z5', kind: 'bunker', from: 348, to: 386, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 386, to: 392, side: 'left' },
      { id: 'z7', kind: 'bunker', from: 400, to: 409, side: 'right' },
    ],
  },
  // hole 17 — par 3 — marsh left and crossing, the long bunker wrapping the green
  'harbour-town:17': {
    length: 214,
    fairwayFrom: 75,
    fairwayTo: 202,
    greenDepth: 20,
    zones: [
      { id: 'z1', kind: 'bunker', from: 2, to: 22, side: 'left' },
      { id: 'z2', kind: 'bunker', from: 44, to: 48, side: 'cross' },
      { id: 'z3', kind: 'bunker', from: 48, to: 56, side: 'left' },
      { id: 'z4', kind: 'water', from: 50, to: 66, side: 'left' },
      { id: 'z5', kind: 'water', from: 66, to: 118, side: 'cross' },
      { id: 'z6', kind: 'bunker', from: 90, to: 148, side: 'right' },
      { id: 'z7', kind: 'water', from: 118, to: 214, side: 'left' },
      { id: 'z8', kind: 'bunker', from: 148, to: 192, side: 'left' },
      { id: 'z9', kind: 'bunker', from: 152, to: 160, side: 'cross' },
      { id: 'z10', kind: 'bunker', from: 192, to: 206, side: 'cross' },
      { id: 'z11', kind: 'bunker', from: 202, to: 214, side: 'left' },
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
}
