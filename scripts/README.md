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

Slugs live in `COURSE_GEO` at the top of the script — that map is the source
of truth for what's importable. Each entry needs the course center, the exact
OSM `golf_course` polygon name, and the engine slug (for `--compare`). To
find the polygon name for a new course, query Overpass for
`leisure=golf_course` near the course's coordinates and match `name`.

### How it works

1. **Fetch** — one Overpass query per course, scoped to the named `golf_course`
   polygon (`map_to_area`) so neighbouring courses don't bleed in, plus nearby
   `natural=water` bodies and `natural=coastline` (carry lakes and the sea
   often have no golf tag) and in-course `natural=wood` / `landuse=forest` for
   tree corridors. Cached per course under `$TMPDIR`; `--fresh` refetches.
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
- **Pebble 7/8** — cliff par 3 + the chasm carry, Pacific down the right via
  coastline handling.
- **Harbour Town (all 18)** — full-course import for a daily; lengths track the
  card (18 dead-on 470), signature holes match imagery (7's sand ring, 13's
  horseshoe, 16's waste bunker). Two hand-fixes — see the artifact modes below.

### Known gaps & importer artifact modes

- **Coverage** — obscure courses may lack `golf=hole` centerlines, and many
  resorts have no `natural=wood` polygons even where trees define the course
  (Sea Pines). Hand-author `trees` zones when course identity demands them
  (`harbour-town:18`).
- **Marsh vs ocean** — the open sea (`natural=coastline`) imports as `ocean`,
  but tidal marsh/sound edges are usually `natural=water` polygons, so
  sound-side holes come through as `water`. Relabel to `ocean` by hand where
  the flavor fits (`pebble-beach:7/8`, `harbour-town:18`).
- **Artifact modes to expect** (all seen in real imports — check for them
  during QA, fix by hand with a comment):
  - *Phantom cross zones*: a centerline hugging a hazard's edge (or cutting a
    dogleg corner) reads the flank as full-width `cross` bands — sometimes on
    both sides. Red flag: a `cross` zone overlapping `fairwayFrom`
    (`harbour-town:18`), or "water off the tee" no real player faces
    (`tpc-sawgrass:2`).
  - *Broken lateral hazards*: a continuous lake/marsh shows gaps where the
    fairway widens past the 50-yd sample corridor. If imagery shows unbroken
    water, span it continuously — the gap rewards aggressive lines for the
    wrong reason.
  - *Dropped greenside bunkers*: rings hugging or behind the green can
    rasterize to nothing (`harbour-town:4`). If imagery shows sand at the
    green and the zones don't, add it.
- Output is meant to be **reviewed and committed as static data**, not fetched
  live. `buildLayout` prefers a hole's `OSM_GEOMETRY` entry and falls back to
  procedural when absent.

### The freeze process (repeatable)

1. **Pull the club's published scorecard first** — it is the ground truth for
   par, stroke index, and length; OSM is the ground truth for *geography*
   only. BlueGolf's detailed scorecard
   (`course.bluegolf.com/bluegolf/course/course/<id>/detailedscorecard.htm`,
   e.g. `spharbourtown` — find the id by searching the course name on
   course.bluegolf.com) lists per-hole YDS / PAR / HCP for a named tee set.
   The page sits behind an AWS WAF challenge, so fetch it with a real
   browser, not curl. Verify against `courses.ts` **before** importing:
   - **Par** must match the tuple exactly — a mismatch is a data bug, full stop.
   - **HCP** is the card's stroke index; it feeds `pressure()` in the odds,
     so a wrong SI mis-weights every shot on the hole. Fix the tuple to the
     card. (The Harbour Town import shipped 18 as SI 18; the card says HCP 2.)
   - **Yardage** — note the tee set you're matching. Imported lengths within
     ~10 yd of the card are tee-box variance; bigger gaps usually mean OSM's
     centerline starts at the wrong tee pad. For those, scale the hole's
     zones so `length` equals the card (the Palm Beach entries in
     `geometry.ts` are the precedent: card for distance, OSM for shape).
2. `pnpm import:osm <course> <hole> --compare` — sanity-check vs the shipped
   layout and the card from step 1.
3. Paste the `--json` zones into `src/engine/geometry.ts` under `${slug}:${hole}`.
   `courses.ts` **auto-reconciles** each hole's `yards` to the imported
   `length` at load, so the header, scorecard, course total, and map all read
   one source. No hand-editing of the yardage tuples.
   - **Dogleg profile.** If the report prints a `bend:` line (max ≥ 8 yд), paste
     that array into the `OSM_BEND` map (same key, `${slug}:${hole}`). The map
     bends the hole to the real centreline where it actually turns, and the
     "Dogleg left/right" chip reads its direction — both **overriding** the
     hand-set `HoleSpec.dogleg` flag, which shipped backwards on several holes.
     `bend` is cosmetic (the odds are 1-D and never read it), so it's not
     replay-affecting and needs no `ENGINE_VERSION` bump. Straight holes print
     `bend: straight` and get no entry — they render on the flag fallback.
4. **QA pass against satellite/aerial imagery** — walk every hole and compare
   the zone report (kind / side / yardage) to what's actually on the ground.
   Use ProVisualizer's **3D planner**: `provisualizer.com/3dplanner.php?n=
   <Course Name>` — get the link (with the course name and full tee/pin data
   in the querystring) from the course's main page,
   `provisualizer.com/courses/<slug>.php`. It gives a per-hole tee-perspective
   satellite view with a hole dropdown + Next/Prev Hole stepping, which is
   much more reliable for reading hazards than the top-down 2D overview
   (the Carnoustie burns were unmistakable from the tee view and easy to
   miss from above). Any aerial source works in a pinch.
   Hunt specifically for the artifact modes listed above,
   and fix by hand **with a comment explaining the deviation from the raw
   import** (`tpc-sawgrass:2`, `harbour-town:4`/`18` are the house style).
5. **Landmark pass.** While you're in the imagery, ask: does any hole have a
   *classic, instantly-recognizable structure* a golfer would expect to see on
   the map? (Harbour Town 18's candy-striped lighthouse is the archetype;
   think windmills, famous clubhouses, bridges like the Swilcan.) If so, set
   `landmark` on that hole's tuple in `courses.ts` and — when it's a new
   kind — extend the `Landmark` union in `src/engine/types.ts` and add a
   sprite next to `Lighthouse` in `src/ui/HoleMap.tsx`. Landmarks are **pure
   map flavor**: cosmetic only, never in the odds, geometry, or seed replay,
   so adding one is always versioning-safe. One per course is plenty — save
   them for the shot everyone remembers.
6. `pnpm gen:ratings` — real geometry changes how the course plays, so the
   Play Rating must be regenerated (see the FOLLOW-UP note in the script
   header). Review the printed table; only the imported course should move.
7. `pnpm test` — the full suite, not just smoke. The odds invariants are the
   geometry lie-detector: *safe-vs-aggressive* fails on phantom cross zones
   under the fairway, and *safe stays bankable* fails on hazards crowding the
   safe landing area. A failure here usually means the geometry is dishonest,
   not that the test needs loosening.

Engine geometry feeds the leaderboard referee: per CLAUDE.md, merged imports
must deploy the `submit-round` function (automated on push to `main`) before
the course next appears in the daily rotation, or old-geometry clients and the
validator will disagree.

Data © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/).
Attribution required if this geometry ships.
