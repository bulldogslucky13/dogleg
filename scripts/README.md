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

- **Quail Hollow Club (all 18)** — the course where **the house scorecard
  source is the wrong source**. BlueGolf carries Quail Hollow only as its MEMBER
  configuration (par 72 / 7,546, the 1st played as a par 5), which is a
  different golf course from the tournament setup the game ships. Pulling the
  card first, per step 1, would therefore have produced a par mismatch on hole 1
  and read as "a data bug, full stop" when the tuple was right all along. What
  settled it: the shipped par sequence AND OSM's own per-hole `par` tags both
  match the 2025 PGA Championship card (par 71 / 7,626) on all 18, so the
  members' card is the outlier. **Check what CONFIGURATION a card describes
  before treating a par mismatch as a bug** — for a tournament venue the club's
  everyday card and its championship card can differ by a par and 80 yards, and
  the championship's own scorecard PDF is the better source. Par ended up
  untouched; four yardages moved.
  Second, its shifts go **both directions on the same course** — 1 and 3 trim,
  eight others prepend. 82 tee pads over 18 holes and the mapper picked a
  different one per hole, the seminole pattern, so per-hole diagnosis is the
  only way through. Projecting ProVisualizer's published tee onto each hole's
  HEADING (a signed along-distance, not the raw point distance) is what sorted
  them: it agrees within 12 yd on seven of the ten. Raw distance would not have
  worked — hole 15's PV tee is 104 yd away but sits 79 yd off the hole's line,
  so it corroborates nothing, and only the projection reveals that.
  Third, it is a clean example of the **carnoustie linestring mode** biting the
  one hole that could least afford it: `waterway=stream` never reaches the
  polygon rasterizer, so 18 — whose signature reads "creek all down the left" —
  imported with no water whatsoever. Projecting the stream onto the hole's own
  shifted centreline gives the creek crossing at ~190 and then running up the
  left at 1-23 yd off, unbroken, to the green. The crossing was deliberately not
  laid as a `cross`: at 190 yd on a 494-yd par 4 it is far short of the landing
  area, and a forced carry there would be invented.
  Worth copying: **check bunker SIZE against the rake before assuming you need a
  finer one.** Muirfield needed rake 3 immediately before this; Quail Hollow
  keeps the 6-yd default because not one of its 74 bunkers is under 6 yd across
  (min 6.7, median 12.8). One number decides it, and it is the reason the rake
  is a per-course knob and not a new global.

- **Shinnecock Hills / LACC North / Cabot Links / Camargo / Doral Blue Monster
  (all 18 each)** — five courses frozen in one pass, and between them they show
  every identity mechanism the registry has.
  **Shinnecock** is the case where OSM's own hole NAMES are the identity check:
  its 18 centrelines carry the club's hole names (Westward Ho, Plateau, Redan,
  Eden, Home …) matching the published card name-for-name in order, which is
  worth more than a polygon name with National Golf Links, Sebonack and
  Southampton all inside 1.5 km. Three holes traced members' pads while the rest
  are on championship tees — ProVisualizer's published tee sits 48, 48 and 71 yd
  BEHIND the OSM start on exactly those three, against ≤7 yd on the other
  fifteen.
  **LACC North** is the course that added `osmHoleWays`. One polygon holds both
  the North and the South, 36 hole ways, two full sets of `ref=1..18`, **every
  one unnamed** — and unlike Pine Valley the routings INTERLEAVE, so from the
  North centroid the SOUTH hole wins ref=1 by 16 m and ref=2 by 386 m.
  Nearest-centre is not weak there, it is wrong. Pin by way id, and establish
  the ids from fingerprints rather than proximity: par sequence and per-hole arc
  length each match one course's card on all 18. It also carried a **par bug** —
  the 7th shipped as a par 4 and the course as par 71, against the club card,
  OSM's par tag and the 2023 U.S. Open card, all of which say par 3.
  **Cabot Links** is the reminder to check the tuple against a card before
  assuming it came from one: six pars disagreed with the club's, the yardages
  matched no tee set, and the famous 100-yd short hole sat at 16 when the card
  has it at 14. It is also the second `rake: 3` course (33 of 109 bunkers under
  6 yd) and the one that exposed the deeprough-shadowing bug below. Its sea is
  mostly a VIEW, which is a measurement and not a judgement: projecting the
  coastline onto each centreline puts it inside the 50-yd corridor on two holes
  only (6, at 14-31 yd for all 465 yd — kept) and 48-87 yd away on the 16th,
  where the imported `ocean` was dropped by hand.
  **Camargo** is the cleanest entry in the registry — tuple already matching the
  GOLD card on par, SI and yardage bar four yards — and a second worked example
  of the `pine-valley:1` remap on its 2nd.
  **Doral** shows what to do when a course has THREE published cards (Black
  7545, WGC 2016 7528, Cadillac 2026 7739) and the mapper picked pads per hole:
  score total absolute deviation against each (316 / 299 / 420) and commit to
  one, rather than mixing per hole and ending up with a total that is no real
  configuration. Black wins on being the club's own and the one OSM's `par` AND
  `handicap` tags match on all 18.
  Worth copying from all five: **ProVisualizer's per-hole tee/pin arrays make
  the whole card checkable numerically in one pass.** `3dlink.php?id=<id>`
  exposes `tempHoleTeeLat/Lon` and `tempHolePinLat/Lon` as 1..18 arrays for the
  whole course, so one harvest gives you, for every hole, a second opinion on
  the tee (projected onto the hole's HEADING, per Quail Hollow) and a check that
  the centreline ends on the right green (PV's pin landed 0-11 yd from every one
  of these 90 hole ends). That is what separated "wrong pad" from "Chaikin
  rounding" from "the card describes a different tee" across 90 holes without
  eyeballing any of them.

- **Erin Hills (all 18)** — the course that says **check the CLUB'S card, and
  check its date**. Its cards disagree with each other, and both of the
  widely-quoted third-party ones are stale in opposite directions: one puts the
  1st at 608 and the total at 7800, which is the 2017 U.S. Open-era card, while
  the club has since shortened 1/3/11/17 and LENGTHENED the 16th from 183 to
  247. Settled by reading the club's own scorecard PDF (04/26) — the text is in
  subset CFF fonts, so it comes out through the `/ToUnicode` maps rather than a
  naive string scrape — which BlueGolf turns out to reproduce exactly. The
  shipped tuple matched par on all 18 and nothing else (SI wrong on 15, and the
  yardages no tee set at all).
  That card history IS the shift diagnosis, and it is worth copying: **when a
  club moves its tees, OSM keeps tracing the old pads**, so the holes needing a
  trim are exactly the ones the club shortened (3 -39, 5 -36, 11 -44, 17 -33)
  and the one needing a prepend is the one it lengthened (16, +57). The trims
  were verified, not assumed — after the trim all four of the 3rd's bunkers and
  all three of the 11th's land on measured sand.
  Two hand-fixes, both `cross` bands that are not carries: the 7th's is a PAIR
  of touching pots (`--profile` rules it TOUCHING POLYGONS, not one span) worth
  12 yd of a hundred-yard corridor, and the 13th's is a pond 20 yd off the
  RIGHT that the coarse line clips by 4 — left in, it would have made the
  card's EASIEST hole a forced water carry. 12 and 17 import BARE and imagery
  confirms that is honest, not the cabot-links shadowing bug.
  Also the course that needed a `junkLabel`: real geometry gave it sand and
  glacial grass and not one tree polygon, so the odds' junk floor had nothing
  to name (fescue).

- **Winged Foot — West (all 18)** — the quail-hollow "which CONFIGURATION is
  this card" check at its sharpest, and the lesson is to run it before treating
  a par mismatch as a bug. BlueGolf carries Winged Foot only as the members'
  course (Blue, par 72 / 7426, four par 5s); the game ships par 70 with the 9th
  and 16th converted, which is the 2006 U.S. Open setup and no tee set on the
  club card. Score the shipped tuple against every candidate rather than
  eyeballing: 2006 (par identical, 14 of 18 yardages dead-on, deviation 102)
  beats the members' card (216, plus two par mismatches) and 2020 (which
  converted the 5th, not the 9th). Par stays; four yardages move. Stroke index
  has to come from the CLUB card — a USGA championship card publishes none —
  and it moves on 17 of 18.
  That split is also the shift diagnosis, and it is the cleanest instance of a
  useful general rule: **when the card and the mapper disagree about which tee
  a hole plays from, the per-hole trims are exactly the holes the championship
  moved.** OSM's lengths track the members' Blue card to ~3 yd a hole (total
  deviation 60 over 18), so the 9th comes off the front by 56 — the yardage
  that turns a 572-yd par 5 into a 514-yd par 4 — and 3 and 17 by 32 and 18.
  Identity is the shinnecock check at full strength: way/122734591 holds
  exactly 18 hole ways carrying the club's West hole NAMES in card order, and
  the East's 18 sit outside the polygon, so `map_to_area` separates them alone.
  One hand-fix, the 12th's 4-yd `trees` cross at the tee (a chute, not a
  carry). The crosses that survive are Tillinghast's actual cross bunkers.

- **National Golf Links of America / The Country Club, Brookline (all 18
  each)** — both pure geometry, both tuples already matching their cards on
  par, stroke index and yardage for all 18. Between them they show the two ends
  of the shift spectrum. NGLA is the cleanest import in the registry (fourteen
  holes within 7 yd of the card raw); TCC has the largest shifts, going both
  ways, off 72 mapped tee pads.
  Two things worth copying. First, **TCC is the case for reading the card's own
  per-tee overrides**: its 2nd imports 288 against a card of 220 and is trimmed
  65, because from BLACK the hole plays 220 as a PAR 3 while every shorter set
  plays ~288 as a par 4 — the geometry was right and the card was unusual.
  Its 15th is trimmed 77 for the opposite reason: OSM and ProVisualizer both
  traced the championship pad the 2022 U.S. Open used, and the club's BLACK
  card is the configuration we ship.
  Second, **NGLA's 16th is the doral "commit to one card" rule applied against
  good evidence.** OSM (476) and ProVisualizer (474) agree the hole plays from
  a new back tee that postdates the card's 415, and a published source confirms
  the teeing ground was added. It is still trimmed to the card, because taking
  it would mix a tee the other seventeen holes are not played from into an
  otherwise coherent 6935 configuration.
  Between them, five hand-fixes and four of the five are the same mode:
  greenside rings rasterised as carries INTO the green they guard (ngla 6,
  tcc 12, tcc 18) or a real carry whose `fairwayFrom` sat inside the water
  (ngla 13, 14).

- **Whispering Pines (Trinity, TX) — all 18, and the course that found the
  ring-stitching bug.** Pure geometry (its tuple already matched the club's
  Spirit card on par, SI and yardage for all 18), but the hardest IDENTITY in
  the registry and the most instructive failure.
  Identity first: nineteen clubs share this name, the bare `whisperingpines`
  slug on BlueGolf belongs to one in **Alabama**, and OSM's polygon for the
  Texas club carries no `name` tag at all — which is what `osmAreaId` was added
  for. It is pinned instead by three hole ways whose par + handicap match the
  Spirit card on a distinctive SI sequence, and by all 18 centrelines ending on
  18 distinct greens. The 8th has no `ref` in OSM and is pinned by way id.
  Then the lake, and **the wrong diagnosis is the part worth keeping.** Lake
  Livingston appeared to enclose the whole property — every hole imported as
  one full-width water `cross` tee to green — which reads exactly like a
  badly-drawn outer ring, and was briefly "fixed" by dropping the relation with
  `osmIgnore`. That also deleted the real water on six holes. The actual cause
  was the rasteriser reading the relation's 26 outer member ways as 26 separate
  rings (see the artifact catalog). **If a huge water polygon seems to cover a
  course, count its member ways before blaming the mapper.**
  Also worth copying: the RAKE check went the other way here. 12 of 81 bunkers
  are under the 6-yd default, which is the muirfield/cabot condition and says
  lower it — but the outcome check overruled the size check. 48 bunkers come
  within 30 yd of a green, and rake 6 yields 33 greenside zones against rake
  3's 32, while rake 3 merges the 10th's two-sided greenside complex into one
  side. **Bunker width screens; greenside zones shipped decides.**
  Six hand-fixes, and note the shape differs from the other four courses in
  this batch: four crossings overrun the green they carry TO by 4-8 yd and are
  CLIPPED to the green front rather than dropped, because unlike a greenside
  ring rasterised as a carry these are the real thing — on 15 and 16 they are
  the hole.

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
  - *Rough shadowing real hazards* (FIXED at source in the Cabot pass, listed
    so the shape is recognisable if it recurs with another always-dropped
    kind): `golf=rough` classifies to `deeprough`, which is filtered out
    wholesale at merge time — but it still competed for sample points, and the
    rasteriser breaks on the FIRST ring containing a point in Overpass response
    order. So a course-wide rough multipolygon silently deleted every hazard
    drawn inside it. `cabot-links:5` imported with no zones at all: way
    /1044331550 covers the hole at -41..37 lateral, so both greenside bunkers on
    a 186-yd par 3, 16 and 21 yd off the line, rasterised as rough and vanished.
    The tell is a hole coming through BARE that imagery says is not — and the
    profile (`--profile`) showing the bunkers reaching the corridor anyway,
    which is what separates this from a genuine ownership cull.
  - *A multipolygon inflated to its own shoreline* (FIXED at source, in two
    halves). First, only OUTER members were read, so the land an INNER ring
    punches out of a feature counted as part of it. Second — and this is the
    one that actually bites — each member way was treated as a complete ring,
    when a multipolygon ring is routinely **split across several members** (six
    of NGLA's arrive that way, 27 of Whispering Pines'). Point-in-polygon
    closes whatever it is handed with an artificial last-to-first edge, so half
    a lake becomes a lake bounded by a straight line through open water.
    Whispering Pines sits on a peninsula inside "Lake Livingston"
    (relation/976304), whose outer arrives as 26 fragments: read separately
    they swallowed the whole property and all 18 holes imported as one
    full-width water `cross` from tee to green. **The tell is a course that is
    100% forced carry.** Stitched into the single ring it actually is, every
    mid-hole point tests dry and the lake needs no special-casing.
    Worth knowing because the wrong diagnosis is so plausible: this first
    looked like a badly-drawn outer that genuinely enclosed the course, and was
    briefly "fixed" by dropping the relation with `osmIgnore` — which also
    deleted the real water on six holes. If a huge water polygon seems to cover
    a course, count its member ways before blaming the mapper.
  - *A polygon dropped before its holes are read*: the proximity filter that
    decides whether a ring is near enough to matter scans boundary vertices.
    For a hole played along an island or a peninsula, the water's edge beside
    it IS an inner ring while the outer boundary can be miles out across the
    lake, so scanning only the outer discarded the polygon and the hole came
    through with no water. Inner boundaries count too.
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
