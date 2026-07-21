# scripts/

Build-time tooling. Nothing here runs in the app or at request time.

## `import-osm.ts` — real course geography from OpenStreetMap (PROTOTYPE)

Pulls golf features from OSM (Overpass API) and projects them onto the engine's
1-D tee→pin hole line, producing the same
`{ length, zones, fairwayFrom, fairwayTo, greenDepth }` shape that
`src/engine/layout.ts` synthesizes procedurally. The goal: replace guessed
geometry with the real thing for marquee holes (Sawgrass 17, Amen Corner, …).

```sh
pnpm import:osm sawgrass 17            # zone report
pnpm import:osm sawgrass 17 --compare  # OSM vs the layout we ship today
pnpm import:osm augusta 12 --json      # machine-readable layout
```

Slugs live in `COURSE_GEO` at the top of the script (`sawgrass`, `augusta`,
`pebble`). Each entry needs the course center, the exact OSM `golf_course`
polygon name, and the engine slug (for `--compare`).

### How it works

1. **Fetch** — one Overpass query per course, scoped to the named `golf_course`
   polygon (`map_to_area`) so neighbouring courses don't bleed in, plus nearby
   `natural=water` bodies (carry lakes often have no golf tag). Cached per course
   under `$TMPDIR`; `--fresh` refetches.
2. **Centerline** — the `golf=hole` way with matching `ref` is the tee→pin line;
   arc length along it = "yards from tee". Where courses cluster, the `ref=N`
   hole nearest the course center wins.
3. **Rasterize** — walk the line yard by yard, rake lateral sample points, and
   point-in-polygon test each against every hazard ring. `left/right/cross`
   falls out of which offsets hit. This is what makes island greens and crossing
   water work where naive polygon-centroid projection fails.
4. **Merge** — contiguous same-kind/same-side samples collapse into zones.

### Validated

- **Sawgrass 17** — water carry 12→green + greenside pot bunker; 138 yd (real ≈137).
- **Augusta 11/12/13** — Amen Corner: greenside pond, full Rae's Creek carry,
  creek down the left.
- **Pebble 7** — correct 109 yd hole, greenside bunkers (ocean not yet captured).

### Known gaps

- **Ocean** — the sea is `natural=coastline` (a line), so cliff/ocean holes
  aren't represented yet. Next step: treat the coastline as a lateral ocean
  hazard on the seaward side.
- **Coverage** — obscure courses may lack `golf=hole` centerlines in OSM.
- Output is meant to be **reviewed and committed as static data**, not fetched
  live. `buildLayout` prefers a hole's `OSM_GEOMETRY` entry and falls back to
  procedural when absent.

### The freeze process (repeatable)

1. `pnpm import:osm <course> <hole> --compare` — sanity-check vs the shipped layout.
2. Paste the `--json` zones into `src/engine/geometry.ts` under `${slug}:${hole}`.
3. That's it. `courses.ts` **auto-reconciles** each hole's `yards` to the
   imported `length` at load, so the header, scorecard, course total, and map
   all read one source. No hand-editing of the yardage tuples.

Data © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/).
Attribution required if this geometry ships.
