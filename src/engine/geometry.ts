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
}
