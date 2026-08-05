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
pnpm import:osm seminole 4 --profile   # per-polygon lateral profiles + a
                                       # verdict on every `cross` zone
```

`--profile` is the triage tool for the artifact modes below: for each polygon
that reaches the corridor it prints the along-span, the lateral range, and how
often that polygon ALONE lies across the playing line, then rules each `cross`
zone REAL CARRY (one polygon spans the line) or ARTIFACT (several polygons on
different flanks). Reach for it before hand-fixing anything.

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
- **Whistling Straits — Straits (all 18)** — 1383 mapped bunkers come through
  as up to 29 zones on a hole, which is the course being honest rather than an
  artifact. One hand-fix (17's lake, below). Also the case for pulling the card
  *before* trusting the tuple: the shipped ~7497 setup was replaced by the
  club's 7790 BLACK card, moving 16 of 18 yardages and 16 of 18 stroke indices.
- **Seminole (all 18)** — 178 mapped bunkers, and the course that paid for the
  `side` rule above. Its shipped tuple already matched the club's GOLD card on
  par *and* stroke index for all 18, so it was pure geometry. Two things worth
  copying. First, the per-hole shifts are wildly uneven (+78, +73, +42, +40,
  +40 on five holes, -5..+3 on nine) because OSM drew each centreline from
  whichever of the ~3 pads per hole the mapper picked — so verify the tee/green
  endpoints per hole rather than assuming one constant fits the course.
  Second, `--profile` (below) was written here: it prints each contributing
  polygon's along-span and lateral range and rules on every `cross` zone, which
  is what separated the three mis-tagged scrub ways from 175 real bunkers.
- **TPC Potomac at Avenel Farm (all 18)** — the rare course whose shipped tuple
  already matched the card on par *and* stroke index for all 18, so the import
  was pure geometry. Notable for two things. First, the phantom-cross mode at
  its most convincing: hole 13 imported a 136-yd full-width water `cross`,
  which would have made the card's 3rd-easiest hole a 189-yd forced carry, when
  the lake is really a lateral hazard the fairway runs alongside — the
  centreline just clips the corner it bends around. Hole 4's superficially
  identical 104-yd cross *is* real, and the only thing that separates them is
  looking from the tee. Second, worth copying: before hand-fixing anything,
  every centreline was checked to start on a `golf=tee` polygon and end on a
  `golf=green` (all 18 did), and each fragmented hazard got a yard-by-yard
  distance-to-centreline profile, so "one creek the corridor chopped up" (hole
  6, thirteen fragments, one polygon 12-35 yd out the whole way) could be told
  from "genuinely separate water" without guessing. Same trick in reverse
  cleared hole 15, which imports with just two zones on the #4 handicap hole
  and is simply that bare.

- **Torrey Pines — South (all 18)** — the course that proves "shift, don't
  scale" is a rule about a *diagnosis*, not a reflex. Two holes missed the
  BLACK card by more than tee-box variance, for opposite reasons, and the same
  fix would have been right on one and wrong on the other. Hole 10 imported 36
  yd SHORT off a forward pad — the textbook case, shifted +36. Hole 6 imported
  22 yd LONG, and shifting it would have been the error: its tee and green
  endpoints are both correct, so the excess is curvature in a wandering
  polyline (bend 65 yd, the course's biggest). The tell is cheap and worth
  copying — **compare each bunker's STRAIGHT-LINE distance from the tee to its
  arc position**. On hole 6 they agree to within 2 yd in the fairway and
  diverge only near the green, which says the excess accumulates along the
  hole rather than sitting at the tee; a blind shift would have walked the
  driving-zone sand ~25 yd back from measured truth. It is remapped through
  arc → straight-line instead.
  Also the first course whose defining hazard was **absent from OSM
  entirely**: no `natural=scrub` or `wood` polygon exists inside or within
  900 m of the property, so the canyons that give the course its character
  imported as open ground on five holes. They were hand-authored as
  `deeprough` from **USGS NED 10m elevation transects** (`api.opentopodata.org`,
  the same 3DEP data ProVisualizer quotes). The recipe, which is what the
  shipped zones were cut from — follow it exactly or you will not reproduce
  them: sample **every 10 yd** along the centreline, at **±20, 30, 40, 50 and
  60 yd**, and take the nearest offset whose ground sits **≥6 m below the
  playing line** as the rim. Author a zone only over a contiguous run where
  that rim is **inside the importer's own 50-yd corridor**, and span exactly
  that run — no extrapolating past the last measured station.
  That turns "there's a canyon there" into a measurement, and it cuts both
  ways: it authored rims on 3/4/6/13/17 and *declined* 2/7/8/9/14/15/16, whose
  ground falls away at 55-70 yd — outside the corridor, the same call that
  cleared `whistling-straits:9/18`.
  **Sample at 10 yd, not 25.** A first pass at 25-yd spacing was too coarse to
  see that hole 17's rim is not one run: it dives inside the corridor over
  10-120, wanders back out, and returns over 210-340. Read off those coarse
  stations the hole shipped one 100-350 zone — 230 yd of hazard past the
  evidence, on a hole it moves the odds and Play Rating for — and it took
  review to catch. The re-measure also *widened* 4, 6 and 13, so the error
  from coarse stations runs in both directions.
  A gap in the run is a real decision, not a rounding artifact. Merge one only
  where the rim wanders just past 50 yd through a feature imagery shows
  unbroken (a hole in a continuous hazard rewards an aggressive line for the
  wrong reason — the broken-lateral-hazard mode below), and say so in the
  comment; leave the long ones open. Hole 17's 90-yd gap stayed, so that hole
  carries two zones. Reach for all of this on any course with terrain the
  polygons don't describe.
  Two more worth knowing: a single bunker straddling the centreline can
  rasterise into **two overlapping zones** (a `cross` slice nested inside a
  flanking slice — holes 3 and 8, both front greenside bunkers), and the
  stroke index disagreed with the card on 13 of 18 holes while OSM's own
  `handicap` tags matched the card on all 18 — a reminder that OSM's hole tags
  are a useful *corroborator* of a card even though its geometry is only ever
  ground truth for shape.

- **Pine Valley (all 18)** — the course that shows `osmHolePrefix` is not always
  available when you need it. Pine Valley's 10-hole Short Course sits INSIDE the
  same `golf_course` polygon with `ref=1..10`, colliding with the championship
  holes, and **not one of the 28 hole ways is named** — so the prefix mechanism
  has nothing to match and nearest-centre carries the identity check alone. What
  made that safe was checking the MARGIN rather than trusting the rule: measured
  from the championship centroid, the right hole wins every colliding ref by
  465-961 m, because the two courses sit in blocks ~1 km apart. Where a margin
  like that doesn't exist, don't import. Two independent per-hole checks then
  confirmed it — all 18 centrelines start on a `golf=tee` and end on a DISTINCT
  `golf=green` (the Potomac check), and ProVisualizer's own tee coordinate sits
  within 3 yd of the centreline start on 16 of 18.
  Worth copying: **the 3D planner exposes its tee, pin and dogleg-target
  coordinates as page globals** (`tempHoleTeeLat/Lon`, `tempHolePinLat/Lon`,
  `tempHoleTargetLat/Lon`), so the whole course can be compared to OSM
  numerically instead of by eye. That is what separated this course's three
  length problems, which look identical in a length column and need opposite
  fixes: holes 6 and 17 sit on FORWARD pads (PV's tee 28 and 67 yd behind the
  centreline start → `--shift`); hole 1's endpoints are both right but Chaikin
  rounds 24 yd off a 3-point line around a genuinely sharp corner (remap
  smoothed-arc → RAW-arc); holes 13 and 16 are the torrey-6 case, endpoints
  right and the line wandering long (remap arc → straight-line).
  Also the first course where `cross` bands are mostly REAL — Pine Valley is
  wall-to-wall sand and you carry waste to reach the fairway on most holes, so
  `--profile` ruling every band REAL CARRY is the course being honest. The
  discriminator that still worked is the mapped-fairway test: four bands had
  `golf=fairway` running beside them for 27-50% of their span and were folded to
  flanks, and the rest had none at all.

- **Muirfield (all 18)** — the course that added the negative `--shift` and the
  per-course rake. Its shipped tuple already matched the club's WHITE card
  (par 71 / 6728) on par, stroke index *and* yardage for all 18, so it was pure
  geometry, and notable for three things.
  First, **the tee problem ran the other way.** Every previous course that
  missed its card imported SHORT off a forward pad; Muirfield imports LONG on
  ten holes because OSM traced them from the CHAMPIONSHIP tees (7089 yd of
  centreline against the card's 6728). `--shift` now takes a negative, which
  trims that run off the front instead of prepending a missing one — and
  trimming is the *stronger* operation, because it only discards measured line
  where the positive path invents a straight one. Diagnose before reaching for
  it: the tell is that ProVisualizer's published tee sat within 1-7 yd of the
  untrimmed OSM start on 17 of 18 holes, and PV's tee-to-pin distance tracked
  the OSM length rather than the card on exactly the ten long holes. Then check
  the trim lands somewhere real — 9 of 10 came down within 12 yd of a mapped
  `golf=tee`, most within 2-8. (Hole 15 is the one that didn't: only two pads
  are mapped and the card needs 49 yd, so the card wins and the entry says so.)
  Second, **the 6-yd lateral rake is not fine enough for every course.** This
  is `bandon-dunes:12` generalised — there, one bunker 4 yd off the line
  vanished under the rake and was hand-added back. Muirfield's ~150 revetted
  pots are frequently under 6 yd across, and the default rake stepped over
  greenside sand on 14 of 18 holes, including both walls of the 13th, which the
  hole's own `signature` names. `COURSE_GEO.rake` lowers it per course (3 here);
  it is per-course rather than global so every already-imported course keeps the
  resolution it was QA'd at. Check for this with the polygons rather than by
  eye: count the bunkers whose ring comes within ~30 yd of the hole's green and
  compare against the greenside zones you actually shipped. 81 touch a green at
  Muirfield and the 6-yd pass left 28 of them with no zone at all.
  Third, **a `cross` band must be wide enough to be worth carrying.** Lateral
  continuity across the line is necessary, not sufficient: a 3-yd pot sitting on
  the centreline satisfies it while blocking three yards of a hundred-yard
  corridor. Sand now needs to span >=12 yd to earn `cross`; water and trees keep
  the old rule, because a burn crossing a fairway is narrow and IS a forced
  carry. Muirfield ends with zero cross zones on any hole, which is the links
  being honest rather than a bug.
  Worth knowing: its OSM `handicap` tags disagree with the club card on 12 of 18
  holes — the exact reverse of Torrey Pines, where they matched on all 18. OSM's
  hole tags corroborate a card; they never arbitrate one. And `golf=rough` is
  useless here for the reason it usually is: one course-wide multipolygon
  spanning the whole corridor (the default surface), correctly dropped.

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
    The *both sides* half of this is now fixed at the source (Seminole, where
    it hit 17 of 18 holes): a band only earns `cross` where the hazard is
    laterally CONTINUOUS across the playing line, so sand flanking a clean
    fairway stays two flanking zones. What survives is the single-hazard case
    — one polygon the coarse centreline genuinely clips. **The check that
    separates a real carry from a clipped corner is whether the hole has
    MAPPED FAIRWAY beside the hazard**: `seminole:11` imports a 98-yd water
    `cross` that looks exactly like `seminole:2`'s genuine one, but the
    `golf=fairway` polygons run up the left of the lake for every yard of it,
    so it is a lateral hazard the hole plays around. Hole 2 has no fairway in
    the corridor at all until past the water, and is a real forced carry.
  - *Mis-tagged surfaces*: OSM sometimes tags a course's native sandy SCRUB as
    `golf=bunker`. Seminole had three such ways (6.1/5.4/3.0 acres against a
    0.034-acre median, each straddling 5-6 corridors), which rasterised as
    full-width carries on 11 holes. Tell them apart by size against the
    course's own median, by how many corridors one polygon touches, and at
    zoom 20 by texture — real bunkers are smooth uniform sand with crisp
    edges, scrub is sand carpeted in vegetation clumps, and the mapper usually
    draws the real bunkers as SEPARATE polygons sitting inside the scrub. Drop
    them with `osmIgnore` in `COURSE_GEO`, with the evidence in the comment.
    Do not drop a merely LARGE bunker: Seminole's way/697261262 is 1.34 acres
    and is genuine.
  - *Broken lateral hazards*: a continuous lake/marsh shows gaps where the
    fairway widens past the 50-yd sample corridor. If imagery shows unbroken
    water, span it continuously — the gap rewards aggressive lines for the
    wrong reason.
  - *Dropped greenside bunkers*: rings hugging or behind the green can
    rasterize to nothing (`harbour-town:4`). If imagery shows sand at the
    green and the zones don't, add it.
  - *A big water body that vanishes entirely*: only `natural=coastline` gets
    the seaward half-plane and its 160-yd `OCEAN_REACH_YD`. A lake mapped as a
    `natural=water` polygon — including a Great Lake — is rasterised like any
    pond, so it must come inside `CORRIDOR_YD` (50) to register at all. A
    course played along a bluff above the water therefore imports with *no
    water on the holes that are most obviously beside it*. Red flag: a hole
    whose card or `signature` names water comes through with zero water zones
    (`whistling-straits:17` — Lake Michigan runs down its whole left at
    91 yd narrowing to 47, so nothing registered). Measure the real
    centreline-to-shore distance before deciding: at Whistling Straits the
    same check *cleared* 9 and 18, whose water genuinely never comes into
    play, and hand-authoring there would have been invention.
- Output is meant to be **reviewed and committed as static data**, not fetched
  live. `buildLayout` prefers a hole's `OSM_GEOMETRY` entry and falls back to
  procedural when absent.

### The freeze process (repeatable)

0. **Preflight: confirm the course is real, identifiable, and mapped — before
   touching anything else.** The hard rule for this whole process: **if you
   cannot reliably establish the course's geography, do not press forward with
   inaccurate or missing geo data. Propose another solution, or stop.**
   Shipping guessed, partial, or wrong-course geometry is worse than shipping
   the procedural layout — procedural geometry is honest about being generic,
   while a bad import claims to be the real place and quietly poisons the odds,
   the map, the Play Rating, and every replay of that seed. Three checks:
   - **Does the course exist?** Roughly a sixth of the library is *original
     fiction* — `copper-canyon`, `gullwing-point`, `birchwood-national`,
     `millbrook-valley`, `cypress-hollow`, `old-wick-links` (see
     `docs/DESIGN.md`). These have no real-world counterpart and are
     **permanently import-ineligible**. Beware near-name collisions: real
     "Copper Canyon" courses exist in Buckeye / Sun City Festival, AZ, but they
     are not DogLeg's Scottsdale course and their geography must never be
     imported under its slug.
   - **Is it the right course?** Match name *and* location, then pin the exact
     OSM `golf_course` polygon (`osmName`) before importing. Multi-course sites
     and shared hole `ref`s are the standard trap — see `osmHolePrefix`.
   - **Is it actually mapped?** No `golf=hole` centerlines, missing greens or
     hazard polygons, or a card you can't source means the data isn't there.
     Don't fill the gap with invention.

   When a check fails, say so plainly and pick a real option instead: import a
   different course (the next real one in the rotation is usually the right
   call — the rotation order in `courses.ts` is fixed history and must **not**
   be reshuffled to dodge a fictional course), leave the course procedural, or
   stop and hand it back. Hand-authoring a *few* zones against verified imagery
   is part of the process (step 4); hand-authoring a *whole course* from
   imagination is not an import.
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
     centerline starts at the wrong tee pad. Either way the rule is card for
     distance, OSM for shape.
     **SHIFT the zones, don't scale them.** A centreline that starts at the
     members' pad is missing its yardage entirely at the *tee end*, so every
     zone's distance-from-tee is short by one constant — add `(card - import)`
     to every `from`/`to`/`fairwayFrom`/`fairwayTo` and leave `greenDepth`
     alone. Scaling stretches the gap across the whole hole and walks the
     fairway bunkers backwards. Proved on `royal-portrush-dunluce:14`, which
     imported 67 yd short: shifting puts sand at 253 R / 333 L and the imagery
     shows ~246 / ~330, while scaling predicted 217 / 310. A shift also keeps
     greenside features greenside, which is what makes it safe to apply
     blindly to all 18.
     **`bend` is the exception — it cannot be shifted afterwards.** Its 13
     samples are evenly spaced *fractions of the hole*, and `HoleMap` replays
     them at the same fractions of the final card length, so a profile measured
     on a short raw line gets STRETCHED over the long card hole and draws the
     corner yards early (64 yd early on `pacific-dunes:8`, off a 110-yd forward
     pad). The lateral values need no scaling — that much of the old note was
     right — but their POSITIONS do. Re-measure instead:
     `pnpm import:osm <course> <hole> --shift N` prepends the missing tee run
     as a straight segment back along the opening heading, so `length`, every
     zone, `fairwayFrom`/`To` and the bend profile all come out in card
     coordinates in one pass — and the deviations get re-based on the real
     back-tee → green chord, which no resample of the old numbers could do.
     It also rasterises the prepended stretch, so hazards beside the back-tee
     run are found rather than assumed absent. Use it for any hole importing
     more than ~10 yd short.
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
   - **Anything the copy names, the geometry must contain.** Walk every
     `signature` string on the course's tuples (and any `landmark`) and check
     the feature it names is actually *there* — a zone at the right yardage,
     on the right side, big enough to matter, and drawn so a player can see
     it. Promising something the map doesn't show is worse than staying quiet:
     the copy is the game telling you where the danger is, so if it names the
     Church Pews and the map shows two ordinary blobs, the hole is lying.
     This is the check that caught Oakmont 3 — the geometry had the Pews as a
     104-yd bunker all along, but the map drew every side bunker as one ~10-yd
     pot regardless of length, so the course's most famous hazard was
     invisible. Fix the geometry when the feature is missing; fix the
     *rendering* when it's present but doesn't read. If a hazard's real shape
     is famous enough that a generic blob misreads the hole, that's what
     `ZoneStyle` is for (`style: 'pews'`) — cosmetic only, never in the odds.
     Conversely, if imagery says the named feature isn't really in play,
     change the copy rather than inventing geometry to justify it.
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
