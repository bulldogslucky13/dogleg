/**
 * OSM → Dogleg geometry importer (PROTOTYPE).
 *
 * Pulls real course geography from OpenStreetMap (Overpass API) and projects
 * it onto the engine's 1-D tee→pin hole line, producing the same
 * {length, zones, fairwayFrom, fairwayTo, greenDepth} shape that
 * src/engine/layout.ts synthesizes procedurally.
 *
 * Data © OpenStreetMap contributors, ODbL. Attribution required if shipped.
 *
 * Run (Node 24+, native TS strip, global fetch):
 *   pnpm import:osm sawgrass 17            # human-readable zone report
 *   pnpm import:osm sawgrass 17 --compare  # OSM vs the procedural layout we ship
 *   pnpm import:osm sawgrass 17 --json     # emit layout JSON only
 *   pnpm import:osm sawgrass 17 --raw      # dump matched OSM features
 *   pnpm import:osm sawgrass 17 --debug    # ring counts + per-ring extents
 *   pnpm import:osm sawgrass 17 --fresh    # bypass the per-course Overpass cache
 *   pnpm import:osm sawgrass 17 --shift 110  # centreline starts at a forward pad:
 *                                          # prepend the missing tee run so length,
 *                                          # zones AND the bend profile come out in
 *                                          # card coordinates (see --shift below)
 *   pnpm import:osm muirfield 17 --shift -60 # NEGATIVE: centreline starts BEHIND
 *                                          # the card's tee (traced from a back pad),
 *                                          # so trim that run off the front instead
 *
 * Registry: COURSE_GEO below maps a short slug → course center, the exact
 * golf_course polygon name (osmName), and the engine slug (for --compare).
 * Add an entry per course you want to import.
 *
 * HARD RULE before adding an entry: if you cannot reliably establish the
 * course's real geography — it's one of the library's original fictional
 * courses, you can't pin the right golf_course polygon, or OSM simply hasn't
 * mapped it — DO NOT press forward with inaccurate or missing geo data.
 * Propose another course (or leave it procedural) or stop. A near-name match
 * in the wrong town is the trap to watch for. See step 0 of the freeze process
 * in scripts/README.md.
 *
 * Known gaps (prototype):
 *  - OSM coverage varies; obscure courses may lack golf=hole centerlines, and
 *    many resorts have no natural=wood polygons even where trees define the
 *    course (Sea Pines) — hand-author `trees` zones when identity demands it
 *    (see harbour-town:18 in engine/geometry.ts).
 *  - Ocean IS handled (natural=coastline rasterised as a seaward half-plane,
 *    see OCEAN_REACH_YD below) — but tidal marsh is often mapped as
 *    natural=water/wetland polygons instead, so sound-side holes may come
 *    through as `water`; relabel to `ocean` by hand where the flavor fits
 *    (pebble 7/8, harbour-town 18).
 *
 * This is a build-time tool. Output is meant to be reviewed and committed as
 * static data — nothing here runs in the app or touches the network at runtime.
 *
 * FOLLOW-UP after committing new/updated geometry: run `pnpm gen:ratings` and
 * review the printed table. A course's displayed Play Rating is measured from
 * how it plays in the engine (see scripts/gen-play-ratings.ts), so swapping
 * procedural geometry for real geometry changes its difficulty — the whole
 * point of the pull — and the rating must be regenerated to reflect it, or the
 * badge will keep showing the old procedural number.
 *
 * LANDMARK PASS while QA-ing against imagery: if a hole has a classic,
 * instantly-recognizable structure (Harbour Town 18's lighthouse, a famous
 * clubhouse, the Swilcan Bridge), set `landmark` on the hole tuple in
 * courses.ts — extending the Landmark union in engine/types.ts and adding a
 * sprite in ui/HoleMap.tsx if it's a new kind. Cosmetic only, never in the
 * odds or replay, so it's always versioning-safe. See scripts/README.md
 * step 5 of the freeze process.
 */

// Let --compare import the engine's extensionless TS modules (./rng etc.) —
// vite resolves those, bare Node ESM doesn't, so add the .ts on retry.
import { registerHooks } from 'node:module'
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx)
    } catch (e) {
      if (spec.startsWith('.') && !/\.[cm]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  },
})

// ---------- course registry (prototype: just enough to find features) ----------
// center scopes the query; osmName pins the exact golf_course polygon so we don't
// pull in neighbouring courses (Pebble/Spyglass/Peter Hay all share one radius).
// osmHolePrefix disambiguates courses that share a site and thus share hole
// `ref`s (TPC Sawgrass Stadium vs its Dye's Valley course) — OSM names the hole
// ways "Stadium 2" / "Valley 2", so we prefer the ones whose name matches.
type CourseGeo = {
  name: string
  center: [number, number]
  radius?: number
  osmName: string
  /** OSM way/relation id of the golf_course polygon, used INSTEAD of matching
   * `osmName`. For a course OSM has mapped but never named: the anchored-name
   * match has nothing to bite on, and falling back to "the golf_course polygon
   * nearest the centre" would be a guess of exactly the kind step 0 of the
   * freeze process forbids. An id is not a guess — but it is brittle in the
   * same way `osmHoleWays` is (re-drawn polygon → new id), so a miss is FATAL
   * rather than falling back to the name, and the entry must record how the id
   * was established as this course. Whispering Pines is the case this was added
   * for: `leisure=golf_course` with no `name` tag at all.
   * `osmName` is still required alongside it — it documents, in the registry,
   * what the polygon SHOULD be called.
   * Written `way/<id>` or `relation/<id>`: ways and relations have SEPARATE id
   * spaces, so a bare number would silently pull in whatever unrelated relation
   * happens to share the number. */
  osmAreaId?: `way/${number}` | `relation/${number}`
  osmHolePrefix?: string
  engineSlug: string
  /** holes packed tighter than ~40yd apart (par-3 shorts): assign BUNKERS
   * strictly to the nearest hole line, or a neighbour's sand bleeds into the
   * corridor. Water keeps the looser rule — shared lakes genuinely border
   * several holes at once. */
  packed?: boolean
  /** OSM way/relation ids to drop because the tag is simply WRONG for this
   * course — not a judgment call about whether a real hazard is in play, but a
   * feature that is not the thing its tag says. Every id needs a comment
   * saying what it actually is and how that was established from imagery,
   * because this is the one hook that lets an import ignore real OSM data. */
  osmIgnore?: number[]
  /** Lateral rake spacing in yards, overriding the 6-yd default. Lower it for
   * a course whose hazards are SMALLER than the default assumes: the rake
   * samples the corridor at fixed offsets, so a bunker narrower than the
   * spacing can sit between two samples and never register — then die on the
   * 4-yd minimum span. Muirfield is the case this was added for (its ~150
   * revetted pots are frequently under 6 yd across, and a 6-yd rake dropped
   * greenside sand on 14 of 18 holes, including both walls of the 13th that
   * the hole's own signature copy names). Per-course rather than global so
   * every already-imported course keeps the resolution it was QA'd at —
   * committed geometry is static data, but re-importing one of them later
   * should not silently change its zones. Costs one rake pass per step, so
   * don't lower it without evidence that real hazards are being missed. */
  rake?: number
  /** Explicit ref -> OSM way id for the centreline of every hole, pinning the
   * target hole by ID instead of by name or by nearest-centre. The last resort
   * for a site whose courses share one golf_course polygon AND leave the hole
   * ways unnamed, so `osmHolePrefix` has nothing to match and the
   * nearest-centre tie-break is not merely weak but WRONG. LACC is that case:
   * the North and South routings interleave rather than sitting in separate
   * blocks, so measured from the North centroid the SOUTH hole wins ref=1 by
   * 16 m and ref=2 by 386 m — the exact situation Pine Valley's note says not
   * to import through. An id list is the strongest identity pin available, but
   * it is also the most brittle (OSM re-draws a hole, the id changes), so a
   * miss is FATAL rather than falling back, and every entry needs the evidence
   * that mapped id -> hole recorded in its COURSE_GEO comment.
   *
   * Deliberately NOT applied to the neighbour set used by `ownsHazard` — the
   * opposite of what `osmHolePrefix` does. A prefix narrows the hole lines to
   * one course, which is safe only where the courses occupy separate blocks
   * (Bandon, Pacific Dunes) and each verified no sand bleeds. Where routings
   * interleave, the other course's centrelines are exactly what you want
   * present, so its bunkers get culled from this course's corridors by being
   * nearer their own hole. Pinning the target while keeping every line in the
   * ownership test gets both halves right. */
  osmHoleWays?: Record<number, number>
}

const COURSE_GEO: Record<string, CourseGeo> = {
  // King's Creek CC, Kemp TX (OSM way 386836594). NAME-COLLISION WARNING:
  // a second "Kings Creek Country Club" exists in Rehoboth Beach, Delaware —
  // never import that one's geography under this slug. The Texas club is
  // pinned by center + the apostrophe in its OSM name.
  kingscreek: { name: 'Kings Creek Country Club', center: [32.4039, -96.2461], radius: 1500, osmName: "King's Creek Country Club", engineSlug: 'kings-creek' },
  sawgrass: { name: 'TPC Sawgrass — Stadium', center: [30.1985, -81.396], radius: 1400, osmName: 'Stadium Course', osmHolePrefix: 'Stadium', engineSlug: 'tpc-sawgrass' },
  augusta: { name: 'Augusta National', center: [33.5021, -82.0233], radius: 1600, osmName: 'Augusta National', engineSlug: 'augusta-national' },
  pebble: { name: 'Pebble Beach Links', center: [36.5686, -121.9497], radius: 2500, osmName: 'Pebble Beach Golf', engineSlug: 'pebble-beach' },
  palmbeach: { name: 'Palm Beach Par 3', center: [26.6321, -80.0385], radius: 1200, osmName: 'Palm Beach Par 3', engineSlug: 'palm-beach-par-3', packed: true },
  cobblestone: { name: 'Cobblestone Creek', center: [35.1638, -97.4215], radius: 900, osmName: 'Cobblestone Creek', engineSlug: 'cobblestone-creek', packed: true },
  harbourtown: { name: 'Harbour Town Golf Links', center: [32.1307, -80.8093], radius: 1600, osmName: 'Harbour Town Golf Links', engineSlug: 'harbour-town' },
  // Carnoustie shares its site with Burnside/Buddon/Nestie; Championship hole
  // ways are named "6. Hogan's Alley" (siblings use "(6) …" / "[6] …"), so the
  // prefix regex pins the right ref=N per hole.
  carnoustie: { name: 'Carnoustie — Championship', center: [56.4936, -2.7272], radius: 1600, osmName: 'The Carnoustie Championship Course', osmHolePrefix: '^\\d+\\.', engineSlug: 'carnoustie' },
  // Royal Portrush maps Dunluce and Valley as separate golf_course polygons
  // (ways 1413316756 / 1413316754), so map_to_area on "Dunluce Links" is
  // enough to keep Valley's ref=N holes out — no osmHolePrefix needed. All 18
  // Dunluce centrelines are mapped and named (Calamity Corner, White Rocks).
  // Radius reaches past the 807 m polygon for the Atlantic coastline.
  portrush: { name: 'Royal Portrush — Dunluce', center: [55.2028, -6.6253], radius: 1600, osmName: 'Dunluce Links', engineSlug: 'royal-portrush-dunluce' },
  // Oakmont is one clean multipolygon (rel 6174192, wikidata Q3347853) with no
  // neighbouring course inside the radius, so the name alone pins it. Anchor
  // the name to avoid the Oakmont Country Club in Glendale CA and Oakmont Golf
  // Club in Santa Rosa — different courses that share the word.
  oakmont: { name: 'Oakmont Country Club', center: [40.529, -79.825], radius: 1400, osmName: '^Oakmont Country Club$', engineSlug: 'oakmont' },
  // Cypress Point is way 36435651 (wikidata Q5200356), mapped as "Cypress
  // Point Golf Course". Five other courses sit inside the radius — Spyglass
  // Hill, MPCC Shore, Poppy Hills, The Hay, Pebble Beach — and every one of
  // them has ref=N holes, so the name is anchored to pin exactly this polygon.
  // Radius reaches past the ~700 m polygon for the Pacific coastline that
  // makes 15/16/17.
  cypress: { name: 'Cypress Point', center: [36.5788, -121.9677], radius: 1600, osmName: '^Cypress Point Golf Course$', engineSlug: 'cypress-point' },
  // Whistling Straits shares its resort with the Irish course, but way
  // 205111637 ("Whistling Straits") wraps ONLY the Straits — exactly 18 hole
  // ways sit inside it, all named "Straits Course Hole N" — so map_to_area
  // pins it and no osmHolePrefix is needed. Do NOT add one: hole 1 is
  // misspelled "Straights Course Hole 1" in OSM, so a /Straits/ prefix would
  // silently drop the opener. Radius spans the ~2.9 km lakefront strip so
  // Lake Michigan reaches every hole; the lake is natural=water here (not
  // coastline, unlike Pebble/Portrush), so it imports as `water` — see the
  // geometry.ts block note for the relabel decision.
  whistling: { name: 'Whistling Straits — Straits', center: [43.8499, -87.7346], radius: 2500, osmName: '^Whistling Straits$', engineSlug: 'whistling-straits' },
  // TPC Potomac is relation 357652 (wikidata Q7671115). **OSM misspells the
  // name "Avanel Farm"** — the regex has to match the typo, not the club's
  // spelling, or the area lookup finds nothing. Anchored so it can't drift
  // onto Falls Road GC, the one other golf_course inside the radius. All 18
  // centrelines are mapped with plain ref=N and no names, so no
  // osmHolePrefix. Radius 1600 covers the 1721 x 2138 m polygon (1372 m
  // half-diagonal) and the creek/ponds just outside it.
  // Note: OSM tags hole 15 par=5; the club's GOLD card says par 4 (490 yd,
  // HCP 4) and the card wins — OSM is ground truth for shape only.
  potomac: { name: 'TPC Potomac at Avenel Farm', center: [38.9947, -77.1992], radius: 1600, osmName: '^TPC Potomac at Avanel Farm$', engineSlug: 'tpc-potomac' },
  // Seminole is way 125329140, a single clean polygon (835 x 922 m, 622 m
  // half-diagonal) holding exactly 18 golf=hole ways with plain ref=N and no
  // names, so no osmHolePrefix. Anchored because "Seminole Golf Club" also
  // names courses in Tallahassee and elsewhere, and because Lost Tree Club
  // (rel 2694786) sits 1.8 km south with its own ref=N holes. Radius 1200
  // covers the polygon and the Atlantic beyond the dune ridge while stopping
  // short of Lost Tree's and Frenchman's Creek's water. Mapping is unusually
  // complete for a private club: 178 bunkers (the club's own count is ~180),
  // 24 greens, 18 pins.
  // The three ignored ways are tagged `golf=bunker` + `natural=sand` but are
  // Seminole's native sandy SCRUB, not bunkers: 6.1, 5.4 and 3.0 acres against
  // a 0.034-acre median, 400 m long, each straddling 5-6 hole corridors at
  // once. At zoom 20 the difference is unmistakable — the 175 real bunkers are
  // smooth uniform sand with crisp edges, while these are pale sand carpeted
  // in scattered vegetation clumps, and their boundaries trace AROUND the
  // fairways, greens and bunkers they enclose (hence ~28% bbox fill). Left in,
  // they rasterise as full-width `cross` carries on 11 holes — a 398-yd one on
  // hole 4 — because the corridor rake hits scrub on both flanks of a clean
  // fairway, and `side` collapses to 'cross' either way. Dropping them is the
  // tag being wrong, not a call about whether the scrub is in play; it flanks
  // the holes everywhere rather than sitting in patches, which is what the
  // `Rough` dial in types.ts is for, not hazard zones.
  seminole: {
    name: 'Seminole Golf Club',
    center: [26.863, -80.0512],
    radius: 1200,
    osmName: '^Seminole Golf Club$',
    engineSlug: 'seminole',
    osmIgnore: [697252551, 697255070, 697249629],
  },
  // Torrey Pines maps its two courses as SEPARATE golf_course polygons — South
  // is way 35679036, North is way 35679009 — and both carry a full set of
  // plain ref=N hole ways, so the anchored name is doing real work here: North
  // sits 1.3 km up the mesa, well inside the radius, and an unanchored
  // /Torrey Pines/ would match both and mix two courses' holes under one ref.
  // map_to_area on the South polygon keeps `golf=*` features (and therefore
  // every bunker) South-only; the radius applies only to water/coastline,
  // which is what we want — the Pacific is outside the course boundary.
  // All 18 South centrelines are mapped with plain ref=N and no names, so no
  // osmHolePrefix. Radius 1400 covers the 878 x 1573 m polygon (901 m
  // half-diagonal) and reaches past the bluff to the coastline that makes
  // 3/4/6/14. OSM's `handicap` tags on the hole ways match the club's BLACK
  // card on ALL 18 — it was the SHIPPED tuple that disagreed, on 13 — so here
  // the tags corroborated the card rather than competing with it, which is
  // what gave confidence to overwrite 13 stroke indices at once. That does not
  // promote OSM: the card stays ground truth for stroke index and OSM for
  // shape only, and where the two conflict the card still wins (potomac's
  // hole 15 par above). A matching `handicap`/`par` row is a useful second
  // opinion on a card, nothing more.
  torrey: { name: 'Torrey Pines — South', center: [32.8971, -117.2477], radius: 1400, osmName: '^Torrey Pines South Course$', engineSlug: 'torrey-pines-south' },
  // Pacific Dunes has NO golf_course polygon of its own. It shares way
  // 362513477 ("Bandon Dunes Golf Resort") with the Bandon Dunes course and
  // Old Macdonald — 54 hole ways, three complete sets of ref=1..18 — so
  // map_to_area alone would mix three courses under one ref and osmHolePrefix
  // is carrying the whole identity check. Sheep Ranch, Bandon Trails, Bandon
  // Preserve and Shortys are separate polygons with their own names, so the
  // anchored name keeps them out.
  // **The prefix deliberately stops before "Hole".** Five of the eighteen ways
  // are named with a DOUBLE SPACE — "Pacific Dunes  Hole 5", and likewise
  // 8/9/10/11 — so /^Pacific Dunes Hole/ would silently drop a quarter of the
  // course, the same shape of trap as Whistling Straits' misspelled hole 1.
  // No `packed` clause: of the 105 bunkers that reach a Pacific Dunes
  // corridor, ZERO are nearer a neighbouring course's centreline (the three
  // courses sit in separate dune blocks), so ownsHazard's default rule is safe
  // here even though the polygon holds three courses' sand.
  // Radius 1600 covers the 790 x 1383 m course block (796 m half-diagonal) and
  // reaches the Pacific coastline west of the bluff holes.
  pacificdunes: {
    name: 'Pacific Dunes',
    center: [43.2005, -124.3923],
    radius: 1600,
    osmName: '^Bandon Dunes Golf Resort$',
    osmHolePrefix: '^Pacific Dunes',
    engineSlug: 'pacific-dunes',
  },
  // Bandon Dunes shares way 362513477 ("Bandon Dunes Golf Resort") with Pacific
  // Dunes and Old Macdonald — 54 hole ways, three complete sets of ref=1..18 —
  // so osmHolePrefix is carrying the whole identity check, exactly as for
  // pacificdunes above. Sheep Ranch, Bandon Trails, Bandon Preserve and Shortys
  // are separate polygons with their own names, so the anchored name keeps them
  // out.
  // The third set — Old Macdonald's — is entirely UNNAMED (18 ways with a bare
  // ref and no name), which is what makes the prefix safe here: /^Bandon Dunes/
  // cannot accidentally match them, and the prefix miss is fatal rather than
  // falling through to nearest-centre. All 18 Bandon Dunes ways use plain
  // single-space "Bandon Dunes Hole N" — the double-space trap that would have
  // dropped a quarter of Pacific Dunes does NOT recur on this set (verified way
  // by way against the 54).
  // No `packed` clause: of the 69 bunkers that reach a Bandon Dunes corridor,
  // ZERO are nearer a Pacific Dunes or Old Macdonald centreline (the three
  // courses sit in separate dune blocks), so ownsHazard's default rule is safe
  // even though the polygon holds all 423 of the site's bunkers.
  // Radius 1400 covers the 974 x 1313 m course block (818 m half-diagonal —
  // farthest centreline node 722 m from centre) and reaches the Pacific
  // coastline, which runs 114-795 m west of the holes and is `natural=coastline`
  // here, so it imports as `ocean` rather than needing the whistling-straits
  // relabel. Centre is the centroid of the 18 championship centrelines.
  bandondunes: {
    name: 'Bandon Dunes',
    center: [43.1897, -124.3953],
    radius: 1400,
    osmName: '^Bandon Dunes Golf Resort$',
    osmHolePrefix: '^Bandon Dunes',
    engineSlug: 'bandon-dunes',
  },
  // Pine Valley is way 820204638. **OSM names it "Pine Valley Country Club"**,
  // which is NOT the club's name (Pine Valley Golf Club) — the same shape of
  // trap as TPC Potomac's misspelled "Avanel Farm", so the regex has to match
  // OSM's string, not reality. Identity is nailed down by the polygon's own
  // `wikipedia=en:Pine Valley Golf Club` tag plus the location (Pine Valley
  // Borough, Camden County NJ). Anchored because "Pine Valley" names courses
  // in a dozen states; the two unnamed golf_course ways 2 km west inside a
  // wider radius are Pine Hill / Trump National Philly, which also carry ref=N
  // holes (their ref=2 and ref=3 show up in an unscoped query).
  //
  // **The site holds a SECOND course and osmHolePrefix cannot separate them.**
  // Pine Valley's 10-hole Short Course sits INSIDE the same polygon with
  // `ref=1..10`, so map_to_area passes it through and every one of those refs
  // collides with a championship hole. Neither set is NAMED — all 28 ways
  // carry a bare ref — so the prefix mechanism has nothing to match on and the
  // nearest-centre tie-break is doing the identity work here, which is exactly
  // the situation its own comment warns about. What makes it safe is the
  // MARGIN, not the rule: the Short Course is a compact block ~1 km NW of the
  // championship routing, so measured from the centre below the championship
  // tee wins every colliding ref by 465-961 m (worst case ref=8: 288 m vs
  // 753 m). That is not a tie-break, it is a rout. It was verified ref by ref
  // before importing, and every imported centreline was then checked to start
  // on a `golf=tee` polygon and finish on the `golf=green` whose hole matches
  // the card's par — the potomac endpoint check, which is what actually proves
  // the right 18 came through rather than the ordering rule promising it.
  // The centre is therefore the centroid of the CHAMPIONSHIP hole ways
  // (39.7875, -74.9703), not the polygon's — the polygon centroid sits ~150 m
  // toward the Short Course and shrinks the margins for no benefit.
  // No `packed` clause: the Short Course's sand is ~1 km from the nearest
  // championship corridor, so none of it is nearer a championship centreline
  // than its own, and the championship holes are separated by mature pine
  // forest rather than packed side by side.
  // Radius 1200 covers the 1171 x 1079 m championship block (796 m
  // half-diagonal) and the six tagged water hazards inside it, while stopping
  // well short of Pine Hill's ponds 2 km west. No coastline here.
  pinevalley: {
    name: 'Pine Valley Golf Club',
    center: [39.7875, -74.9703],
    radius: 1200,
    osmName: '^Pine Valley Country Club$',
    engineSlug: 'pine-valley',
  },
  // Muirfield (Honourable Company of Edinburgh Golfers) is way 101336384,
  // Gullane, East Lothian. NAME-COLLISION WARNING, and it bites twice: the
  // library already contains `muirfield-village` (Dublin, Ohio) at rotation
  // #47, and BlueGolf's bare `muirfield` id is a THIRD course — Muirfield GC
  // in North Rocks, Australia (par 69, 6205 METERS), which is what you get if
  // you guess the card URL. The Scottish card is `muirfieldsc`.
  // Anchored `^Muirfield$` because the polygon's name is exactly that.
  //
  // Gullane's links are packed shoulder to shoulder, so the radius matters
  // more than usual: five other courses sit inside 2.5 km — The Renaissance
  // Club (1.3 km NE), Gullane No.1/2/3 as one 54-hole polygon (1.8 km SW),
  // Archerfield's two 18s (2.4 km E), Luffness New (2.6 km SW). Radius 1400
  // covers Muirfield's own ~1.2 km block and the sea to its north without
  // reaching any of them. map_to_area then scopes the features anyway.
  // No osmHolePrefix and none possible — all 18 hole ways are unnamed, bare
  // `ref` — but unlike Pine Valley there is nothing to disambiguate: the
  // polygon contains exactly 18 `golf=hole` ways carrying refs 1-18, one
  // each, no second course inside the boundary.
  // Rake 3, not the default 6 — see CourseGeo.rake. Muirfield's bunkers are
  // small revetted pots, and at 6 yd the corridor rake stepped straight over
  // greenside sand on 14 of 18 holes. Verified against the OSM polygons rather
  // than by eye: 81 bunkers touch a green, and the 6-yd pass left 28 of them
  // with no zone at all, including both walls of the 13th.
  muirfield: {
    name: 'Muirfield',
    center: [56.0458, -2.8218],
    radius: 1400,
    osmName: '^Muirfield$',
    engineSlug: 'muirfield',
    rake: 3,
  },
  // Quail Hollow Club, Charlotte NC (way 877659537). NAME-COLLISION WARNING:
  // "Quail Hollow" is a common club name and BlueGolf alone carries five more
  // (quailhollow, quailhollowgcc1, quailhollowccweiskop, quailhollowgolfcourse,
  // …) in other states. The Charlotte club is `quailhollowclub` there and the
  // only golf_course polygon named "Quail Hollow" anywhere in a 0.3-degree box
  // around the city here.
  quailhollow: {
    name: 'Quail Hollow Club',
    center: [35.1141, -80.8423],
    radius: 1500,
    osmName: '^Quail Hollow Club$',
    engineSlug: 'quail-hollow',
  },
  // Shinnecock Hills is way 689056680, Southampton NY. Its 18 hole ways carry
  // the club's own HOLE NAMES — Westward Ho, Plateau, Peconic, Pump House,
  // Montauk, Pond, Redan, Lowlands, Ben Nevis, Eastward Ho, Hill Head,
  // Tuckahoe, Road Side, Thom's Elbow, Sebonac, Shinnecock, Eden, Home — which
  // match the club's published card name-for-name in order. That is a stronger
  // identity check than any polygon name, and it is why nearest-centre is not
  // doing anything load-bearing here: exactly 18 golf=hole ways sit inside the
  // boundary, one per ref, no second course. No osmHolePrefix is possible (the
  // names are HOLE names, not a shared course prefix, so any prefix would match
  // nothing and be fatal) and none is needed.
  // Three neighbours within 1.5 km all carry their own ref=N holes — National
  // Golf Links of America (way 28989103, 1.27 km N, itself a DogLeg course at
  // rotation #30), Sebonack (28452574), Southampton GC (599416777) — so the
  // anchored name plus map_to_area is real work, not ceremony.
  // Radius 1200 covers the 1133 x 1189 m polygon (821 m half-diagonal;
  // farthest centreline node 701 m from centre) and the ponds inside it.
  // TEE PADS: OSM traced the CHAMPIONSHIP tees on fifteen holes and members'
  // pads on 5, 14 and 16 (raw arcs 543/470/548 against the U.S. Open card's
  // 589/519/616, while the other fifteen land within 10 yd) — the seminole /
  // quail-hollow per-hole pattern, fixed with a positive --shift on those
  // three. Card note: BlueGolf carries Shinnecock ONLY as the members' Red
  // card (6940), a different setup from the 7440 the game ships, so par and
  // stroke index come from BlueGolf (whose Men's Hcp row is identical across
  // all five tee sets, i.e. it is the club's, not a tee's) and the yardages
  // from the 2018 U.S. Open card. See the quail-hollow entry for why a card
  // has to be read as describing a CONFIGURATION.
  shinnecock: {
    name: 'Shinnecock Hills Golf Club',
    center: [40.8971, -72.4402],
    radius: 1200,
    osmName: '^Shinnecock Hills Golf Club$',
    engineSlug: 'shinnecock-hills',
  },
  // The Los Angeles Country Club — NORTH course. Way 56135439 is named simply
  // "Los Angeles Country Club" and contains BOTH the North and the South, 36
  // golf=hole ways, two complete sets of ref=1..18, **every one of them
  // unnamed**. So osmHolePrefix has nothing to match, and — unlike Pine
  // Valley, where the second course sat in a block 1 km away and lost every
  // colliding ref by 465-961 m — the two routings here INTERLEAVE. Measured
  // from the North centreline centroid the SOUTH hole actually wins ref=1 (by
  // 16 m) and ref=2 (by 386 m), and ref=18 comes down to 20 m. Nearest-centre
  // is not weak here, it is WRONG, which is the case Pine Valley's note says
  // to refuse. Hence osmHoleWays: every hole pinned by way id.
  //
  // The ids below were established from TWO independent fingerprints, both
  // agreeing on all 18 and neither leaving a hole ambiguous:
  //  - PAR. This set's par tags read 5,4,4,3,4,4,3,5,3,4,3,4,4,5,3,4,4,4,
  //    which is BlueGolf's North card exactly; the other set reads
  //    4,4,5,3,4,4,3,5,3,5,3,4,4,3,4,5,3,4, which is its South card exactly.
  //    The two cards differ on six holes, so this alone separates them.
  //  - LENGTH. Arc length per hole tracks the North card's Tournament tee on
  //    all 18 (572/578, 499/503, 396/400, 231/234, 483/483, 309/335, 331/326,
  //    532/555, 180/181, 381/409, 290/294, 392/388, 531/510, 621/633, 130/133,
  //    447/542, 523/528, 497/498) while the other set tracks the South card
  //    (342/342, 397/400, 564/617, …). Totals: 7346 vs the North's 7530, and
  //    6179 vs the South's 6407.
  // Note osmHoleWays deliberately does NOT narrow the hole lines ownsHazard
  // measures against (see its doc comment): the South's 18 centrelines stay in
  // the set so its bunkers are culled from North corridors by being nearer
  // their own hole — which matters precisely because the routings interleave.
  // Radius 1300 covers the shared polygon; the only other golf_course inside
  // it is none (Hillcrest 2.4 km SE, Bel-Air 2.6 km NW, Rancho Park 3.2 km S
  // are all outside), so the anchored name is unambiguous.
  // CARD BUG FOUND: the shipped tuple had hole 7 as a par 4, making the course
  // par 71. BlueGolf's card, OSM's own par tag, and the 2023 U.S. Open card
  // all say par 3 (284 yd for the Open, 326 off the Tournament tee — the
  // third-longest par 3 in U.S. Open history). Par 70. Fixed in courses.ts.
  lacc: {
    name: 'Los Angeles Country Club — North',
    center: [34.0731, -118.4231],
    radius: 1300,
    osmName: '^Los Angeles Country Club$',
    engineSlug: 'lacc-north',
    osmHoleWays: {
      1: 1145215817, 2: 1145294562, 3: 1145638805, 4: 1146022230, 5: 1146025900,
      6: 1146032384, 7: 1146041063, 8: 1146053377, 9: 1146057487, 10: 1146070198,
      11: 1146073902, 12: 1146101472, 13: 1146478635, 14: 1146667370, 15: 1146669377,
      16: 1146671443, 17: 1145342058, 18: 1145233742,
    },
  },
  // Cabot Links, Inverness, Nova Scotia — way 854966311 ("Cabot Links Golf
  // Resort"). The resort's other three courses are SEPARATE polygons well
  // outside the radius (Cabot Cliffs way 676091202, 2.1 km NE; The Nest way
  // 1480922644, 2.5 km NE; both with their own holes), so map_to_area on the
  // anchored name is enough — exactly 18 golf=hole ways with plain ref=1..18
  // and no names sit inside the boundary, one per ref, no second course. No
  // osmHolePrefix possible or needed.
  // Radius 1400 covers the 1185 x 1725 m polygon (1046 m half-diagonal;
  // farthest centreline node 928 m from centre) and reaches the Gulf of St
  // Lawrence coastline west of the links, which is natural=coastline here so
  // it imports as `ocean` rather than needing the whistling-straits relabel.
  // CARD: the shipped tuple was not transcribed from any real card — its par
  // sequence disagrees with the club's on six holes and its yardages match no
  // tee set (it put the famous 100-yd short hole at 16 rather than 14). OSM's
  // par tags match the club's BLACK card (6854, par 70) on all 18, so the card
  // wins outright and par, stroke index and yardage were all rebuilt from it.
  // Rake 3, not the default 6 — the muirfield case, and checked the same way
  // (bunker size against the rake, one number, before assuming): 33 of Cabot's
  // 109 bunkers are under 6 yd across and the median is 7.3, so the default
  // lateral rake steps over a third of the course's sand. Quail Hollow kept the
  // 6-yd default on exactly this test (min 6.7, median 12.8), and so do the
  // other four courses imported alongside this one, which is why the knob is
  // per-course rather than global.
  cabot: {
    name: 'Cabot Links',
    center: [46.2353, -61.3075],
    radius: 1400,
    osmName: '^Cabot Links Golf Resort$',
    engineSlug: 'cabot-links',
    rake: 3,
  },
  // Camargo Club, Indian Hill OH — way 30678974, and the cleanest import in
  // the registry. One polygon, exactly 18 golf=hole ways with plain ref=1..18,
  // no second course anywhere inside the radius (it is the only golf_course
  // within 3 km), and OSM's par tags match the club's GOLD card on all 18.
  // The shipped tuple already matched that card on par AND yardage for all 18
  // bar four yards on the 17th, so this was very nearly pure geometry.
  // Radius 1200 covers the 1410 x 1294 m polygon (957 m half-diagonal;
  // farthest centreline node 773 m from centre).
  camargo: {
    name: 'Camargo Club',
    center: [39.1778, -84.3336],
    radius: 1200,
    osmName: '^Camargo Club$',
    engineSlug: 'camargo',
  },
  // Trump National Doral — Blue Monster. Way 112673308 is named "TPC Blue
  // Monster" and wraps ONLY the Blue: exactly 18 golf=hole ways inside it, all
  // named "Blue Monster N", one per ref. It nests inside relation 1564163
  // ("Trump National Doral"), which also holds the Red Tiger, Golden Palm and
  // Silver Fox — importing against the RELATION would mix four courses' refs,
  // so the way is what the anchored name must pin.
  // osmHolePrefix is set even though map_to_area already isolates the course:
  // the names are all present and uniform (verified way by way against the
  // 18 — no Whistling-Straits misspelling, no Pacific-Dunes double space), so
  // it costs nothing and it is a second lock on a site with four courses.
  // Radius 1100 covers the 946 x 1287 m polygon (799 m half-diagonal;
  // farthest centreline node 771 m from centre). Doral's water is all
  // golf-tagged (9 water_hazard + 4 lateral_water_hazard) so it arrives
  // through map_to_area rather than by radius.
  // OSM's `handicap` tags match BlueGolf's BLACK card on ALL 18 and its `par`
  // tags match on all 18 too — the torrey-pines corroboration pattern — which
  // is what gave confidence to replace the shipped yardages wholesale: those
  // matched neither the Black card (7545) nor the 2016 WGC setup (7528), being
  // off by up to 65 yd a hole, so they were an approximation rather than any
  // real configuration.
  doral: {
    name: 'Trump National Doral — Blue Monster',
    center: [25.8209, -80.3423],
    radius: 1100,
    osmName: '^TPC Blue Monster$',
    osmHolePrefix: '^Blue Monster',
    engineSlug: 'doral-blue-monster',
  },
  // Erin Hills. Way 172725497, the only golf_course polygon within 3.5 km, and
  // it holds exactly 18 golf=hole ways — one per ref, no second course to tell
  // it apart from, so neither a prefix nor an id list is needed. The ways are
  // unnamed, but OSM's own `par` tags match the club's BLACK card on all 18.
  // Radius 1400 covers the 2126 x 1652 m polygon (1346 m half-diagonal;
  // farthest centreline node 1007 m from centre).
  // CARD: the shipped tuple matched par on all 18 and NOTHING else — its
  // stroke index disagreed on 15 of 18 and its yardages (7513) sit between the
  // Blue (7357) and Black (7772) sets, matching neither. Frozen on the club's
  // own BLACK card, the whistling-straits call: the tips are the configuration
  // a 7,700-yard US Open venue is, and the men's stroke index is identical
  // across every men's tee set on the card, so the SI fix is unambiguous.
  erinhills: {
    name: 'Erin Hills',
    center: [43.2449, -88.4019],
    radius: 1400,
    osmName: '^Erin Hills$',
    engineSlug: 'erin-hills',
  },
  // Winged Foot — West. Way 122734591 is named "Winged Foot Golf Club" and, on
  // the current data, wraps ONLY the West: exactly 18 golf=hole ways inside it,
  // one per ref. The East's 18 (ways 687333625…687462459, unnamed, ref 1..18)
  // sit OUTSIDE this polygon, so map_to_area separates the two courses on its
  // own — no prefix or id list required.
  // Identity is the shinnecock check at its strongest: the 18 ways carry the
  // club's West hole names (Genesis, Elm, Pinnacle, Sound View, Long Lane, El,
  // Babe-in-the-Woods, Arena, Meadow, Pulpit, Billows, Cape, White Mule,
  // Shamrock, Pyramids, Hells-Bells, Well-Well, Revelations) matching the
  // published West card name-for-name IN ORDER.
  // Radius 1100 covers the 962 x 1798 m polygon (1019 m half-diagonal;
  // farthest centreline node 858 m from centre).
  // CARD: the quail-hollow case — the house source describes a DIFFERENT golf
  // course. BlueGolf carries only the members' configuration (Blue, par 72 /
  // 7426, the 5th, 9th, 12th and 16th all par 5s); the game ships par 70 with
  // the 9th and 16th converted, which is the 2006 U.S. Open setup and not any
  // tee set on the club card. Scored against all three configurations the
  // shipped tuple is the 2006 card (par identical, 14 of 18 yardages
  // dead-on, total deviation 102) rather than the members' (deviation 216 AND
  // two par mismatches) or 2020's (which converted the 5th, not the 9th). So
  // par stays; four yardages move to the 2006 card. Stroke index is taken from
  // the club card, the only place a published SI for these holes exists —
  // USGA championship cards carry none.
  // OSM's own `par` tags arbitrate nothing here (9 par 5 like the members'
  // card, 16 par 4 like the championship's) — the muirfield reminder that hole
  // tags corroborate a card and never settle one.
  wingedfoot: {
    name: 'Winged Foot — West',
    center: [40.9625, -73.7539],
    radius: 1100,
    osmName: '^Winged Foot Golf Club$',
    engineSlug: 'winged-foot-west',
  },
  // National Golf Links of America. Way 28989103 holds exactly 18 golf=hole
  // ways, all named "NGLA <n>", one per ref. The prefix is set even though
  // map_to_area already isolates the course — Shinnecock Hills (already in this
  // registry), Sebonack and Southampton GC all sit within 1.5 km and each
  // carries its own ref=1..18, so a second lock is cheap insurance on the one
  // site in the library where four courses' hole numbering overlaps.
  // Radius 1500 covers the 1262 x 2432 m polygon (1370 m half-diagonal;
  // farthest centreline node 1140 m from centre).
  // CARD: the shipped tuple already matched BlueGolf's tips (Red, par 72 /
  // 6935) on par, stroke index AND yardage for all 18, so this is pure
  // geometry. OSM's `par` tags match it too.
  ngla: {
    name: 'National Golf Links of America',
    center: [40.9063, -72.4492],
    radius: 1500,
    osmName: '^National Golf Links of America$',
    osmHolePrefix: '^NGLA',
    engineSlug: 'national-golf-links',
  },
  // The Country Club (Brookline). 27 holes on one site: way 29870415 holds the
  // Main eighteen (Clyde + Squirrel, "Main 1".."Main 18") AND the nine-hole
  // Primrose ("Primrose 1".."Primrose 9"), which shares refs 1-9 — the classic
  // shared-site collision, and exactly what osmHolePrefix is for.
  // Radius 1100 covers the 1373 x 1222 m polygon (919 m half-diagonal;
  // farthest centreline node 727 m from centre). Robert T. Lynch Municipal sits
  // ~530 m away, outside the polygon; only its water could arrive by radius,
  // and none of it reaches a TCC corridor.
  // CARD: the shipped tuple already matched BlueGolf's `cc11` BLACK card (the
  // Main course, par 70 / 6840) on par, stroke index AND yardage for all 18 —
  // pure geometry. Worth recording WHICH card that is, because the club has
  // three on BlueGolf and the other two are different golf courses: the
  // "Championship Course" entry is the composite (par 71 / 5328 as listed) and
  // Primrose is the nine. OSM's `par` tags on the Main ways match the BLACK
  // card on all 18; its `handicap` tags do not and cannot — they repeat values
  // (two 13s, two 3s) and include a 19.
  tcc: {
    name: 'The Country Club — Main (Clyde/Squirrel)',
    center: [42.3135, -71.1507],
    radius: 1100,
    osmName: '^The Country Club$',
    osmHolePrefix: '^Main',
    engineSlug: 'the-country-club',
  },
  // Whispering Pines (Trinity, TX) — the course that added `osmAreaId`, and the
  // registry's first UNNAMED polygon. Way 1472122122 is tagged `leisure=
  // golf_course` and nothing else, so the anchored-name match has nothing to
  // bite on and the polygon must be pinned by id.
  // NAME-COLLISION WARNING, and it is the worst in the registry: BlueGolf lists
  // NINETEEN courses called some form of "Whispering Pines", including one in
  // Oneonta, AL that owns the bare `whisperingpines` slug. The Texas club is
  // `whisperingpinesgctexas`. Identity here rests on the three hole ways that
  // carry tags at all — ref 1 (par 4, hcp 17), ref 5 (par 5, hcp 7) and ref 18
  // (par 4, hcp 2) — each matching the club's Spirit card exactly, on a card
  // whose stroke index is a distinctive sequence; plus all 18 centrelines
  // ending on 18 DISTINCT golf=green polygons (0-12 m), the potomac check.
  // The club's second course, The Needler, is not mapped at all.
  // osmHoleWays pins all 18 because the 8th carries NO `ref` (way 1107623675):
  // it is drawn between the 7th and 9th, measures 179 yd against the card's
  // 194-yd par 3, and ends on its own green — so it is the 8th, and the id is
  // the only way to say so. The other seventeen ids are their own refs.
  // Radius 1400 covers the 2462 x 1844 m polygon (1538 m half-diagonal;
  // farthest centreline node 915 m from centre); the polygon itself arrives by
  // id, so the radius only scopes the water pull, and this course is full of it.
  // CARD: the shipped tuple already matched BlueGolf's Spirit card (par 72 /
  // 7468) on par, stroke index AND yardage for all 18 — pure geometry.
  // Frozen; the hand-fixes and the lake story are at the whispering-pines
  // block in geometry.ts.
  whisperingpines: {
    name: 'Whispering Pines (Trinity, TX)',
    center: [30.9487, -95.2455],
    radius: 1400,
    osmName: '^Whispering Pines$', // documentary only — the polygon is unnamed
    osmAreaId: 'way/1472122122',
    // Rake stays at the 6-yd default, and this one is worth recording because
    // the SIZE check said to lower it and the OUTCOME check said not to. 12 of
    // 81 bunkers are under 6 yd (min 3.2), which is the muirfield/cabot
    // condition — but run the muirfield test properly, on what actually ships:
    // 48 bunkers come within 30 yd of a green, and the 6-yd pass yields 33
    // greenside zones against rake 3's 32. It recovers nothing, and it makes
    // one hole worse — the 10th's greenside complex (sand both sides of the
    // green) merges into a single right-hand zone at the finer spacing.
    // Bunker width is the SCREENING test; greenside zones shipped is the one
    // that decides.
    // NOTE for anyone reading git history: this entry briefly carried
    // `osmIgnore: [976304]` ("Lake Livingston") on the diagnosis that its outer
    // ring enclosed the whole property. That was wrong, and wrong in an
    // instructive way — the relation's outer arrives as 26 SEPARATE member
    // ways, and reading each as its own ring closes every fragment with an
    // artificial straight edge, which is what swallowed the course. Stitched
    // into the one ring it actually is (see stitchRings), the peninsula falls
    // OUTSIDE the lake and all 18 mid-hole points test dry. The lake needs no
    // special-casing; the rasteriser needed fixing.
    osmHoleWays: {
      1: 715172696,
      2: 1107623669,
      3: 1107623670,
      4: 1107623672,
      5: 715178924,
      6: 1107623673,
      7: 1107623674,
      8: 1107623675, // no `ref` in OSM — see the note above
      9: 1107623682,
      10: 1107623683,
      11: 1107623684,
      12: 1107623685,
      13: 1107623686,
      14: 1107623687,
      15: 1107623688,
      16: 1107623690,
      17: 1107623691,
      18: 715176576,
    },
    engineSlug: 'whispering-pines',
  },
}

// ---------- Overpass ----------
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  // Fourth mirror, added during the Muirfield import when the first three all
  // returned the "server is probably too busy" dispatcher timeout for ~15 min
  // and this one answered every query first try.
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type OsmTags = Record<string, string>
type LatLon = { lat: number; lon: number }
type OsmElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  tags?: OsmTags
  geometry?: LatLon[] // present on ways/rels with `out geom`
  members?: { type: string; ref: number; role: string; geometry?: LatLon[] }[]
}

async function fetchOverpass(query: string): Promise<OsmElement[]> {
  let lastErr: unknown
  // try each mirror; retry the transient "server busy" 504/429 a couple times
  for (const url of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'dogleg-osm-importer/0.1 (golf course geometry prototype)',
          },
          body: 'data=' + encodeURIComponent(query),
        })
        if (res.status === 504 || res.status === 429) {
          console.error(`  ${new URL(url).host}: ${res.status}, retrying …`)
          await sleep(2000 * (attempt + 1))
          continue
        }
        if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`)
        const json = (await res.json()) as { elements: OsmElement[] }
        return json.elements
      } catch (e) {
        lastErr = e
        console.error(`  ${new URL(url).host}: ${(e as Error).message.split('\n')[0]}`)
        await sleep(1000)
      }
    }
  }
  throw lastErr ?? new Error('all Overpass endpoints failed')
}

function golfQuery(geo: CourseGeo): string {
  const [lat, lon] = geo.center
  const r = geo.radius ?? 1500
  // Scope golf features to the named golf_course polygon (keeps neighbouring
  // courses out); pull water bodies by radius since ponds/lakes often carry no
  // golf tag and can straddle the course boundary.
  // An unnamed polygon is pinned by id instead (see osmAreaId); the id form
  // deliberately drops the `around` filter, because an id IS the scope.
  const scope = geo.osmAreaId
    ? `  ${geo.osmAreaId.split('/')[0]}(${geo.osmAreaId.split('/')[1]});`
    : `  way["leisure"="golf_course"]["name"~"${geo.osmName}",i](around:${r},${lat},${lon});
  relation["leisure"="golf_course"]["name"~"${geo.osmName}",i](around:${r},${lat},${lon});`
  return `[out:json][timeout:180];
(
${scope}
)->.gc;
.gc map_to_area->.a;
(
  way["golf"](area.a);
  relation["golf"](area.a);
  way["natural"="water"](around:${r},${lat},${lon});
  relation["natural"="water"](around:${r},${lat},${lon});
  way["natural"="coastline"](around:${r},${lat},${lon});
  way["natural"="wood"](area.a);
  relation["natural"="wood"](area.a);
  way["landuse"="forest"](area.a);
  relation["landuse"="forest"](area.a);
);
out geom;`
}

// ---------- geo math: lat/lon → local meters → yards ----------
const M_PER_YARD = 0.9144

/** Equirectangular projection around a reference lat, good for course-scale distances. */
function projector(refLat: number, refLon: number) {
  const R = 6_371_000
  const cosLat = Math.cos((refLat * Math.PI) / 180)
  return (p: LatLon): [number, number] => {
    const x = ((p.lon - refLon) * Math.PI) / 180 * R * cosLat
    const y = ((p.lat - refLat) * Math.PI) / 180 * R
    return [x, y] // meters, east/north
  }
}

type Vec = [number, number]
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1]
const len = (a: Vec) => Math.hypot(a[0], a[1])
const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0]

/**
 * Chaikin corner-cutting: turns a coarse hole centreline (OSM gives 2–5 points)
 * into a smooth curve so the perpendicular normal rotates GRADUALLY through a
 * bend instead of snapping at a kink — which is what flipped a right-side creek
 * onto the left for part of its length. Endpoints (tee, green) are preserved;
 * a straight 2-point line is returned unchanged.
 */
function chaikin(pts: Vec[], iters: number): Vec[] {
  let out = pts
  for (let it = 0; it < iters; it++) {
    if (out.length < 3) break
    const next: Vec[] = [out[0]]
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i]
      const b = out[i + 1]
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    next.push(out[out.length - 1])
    out = next
  }
  return out
}

/** Cumulative arc length (meters) at each vertex of a polyline. */
function arcLengths(pts: Vec[]): number[] {
  const acc = [0]
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + len(sub(pts[i], pts[i - 1])))
  return acc
}

/**
 * Project a point onto a polyline. Returns distance ALONG the line (meters from
 * start) and signed lateral offset (>0 = left of travel direction, <0 = right).
 */
function projectToPolyline(pts: Vec[], cum: number[], q: Vec): { along: number; lateral: number } {
  let best = { d2: Infinity, along: 0, lateral: 0 }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const ab = sub(b, a)
    const abLen = len(ab)
    if (abLen < 1e-6) continue
    let t = dot(sub(q, a), ab) / (abLen * abLen)
    t = Math.max(0, Math.min(1, t))
    const proj: Vec = [a[0] + ab[0] * t, a[1] + ab[1] * t]
    const d = sub(q, proj)
    const d2 = dot(d, d)
    if (d2 < best.d2) {
      const along = cum[i] + abLen * t
      // left/right via z of cross(direction, toPoint)
      const lateral = cross([ab[0] / abLen, ab[1] / abLen], sub(q, proj))
      best = { d2, along, lateral }
    }
  }
  return { along: best.along, lateral: best.lateral }
}

const toYards = (m: number) => m / M_PER_YARD
const toMeters = (yd: number) => yd * M_PER_YARD

/** Point at arc-length `a` (meters) along the polyline, with unit travel direction. */
function pointAtArc(pts: Vec[], cum: number[], a: number): { p: Vec; dir: Vec } {
  const total = cum[cum.length - 1]
  a = Math.max(0, Math.min(total, a))
  let i = 0
  while (i < cum.length - 2 && cum[i + 1] < a) i++
  const seg = sub(pts[i + 1], pts[i])
  const segLen = len(seg) || 1
  const t = (a - cum[i]) / segLen
  const dir: Vec = [seg[0] / segLen, seg[1] / segLen]
  return { p: [pts[i][0] + seg[0] * t, pts[i][1] + seg[1] * t], dir }
}

/**
 * Cosmetic dogleg profile: signed lateral deviation (yards, >0 = golfer-left)
 * of the smoothed centreline from the straight tee→green chord, sampled at
 *
 * NOTE THE SIGN IS THE BULGE, NOT THE TURN, and they are OPPOSITE: a hole that
 * doglegs RIGHT bows golfer-LEFT of its own tee→green chord (the chord cuts the
 * corner), so a POSITIVE profile is a RIGHT dogleg. src/ui/panels.tsx makes
 * exactly that conversion for the chip (`m < 0 ? 'L' : 'R'`). Read the printed
 * label below, not the raw sign, or you will document the hole backwards.
 * BEND_SAMPLES+1 evenly-spaced fractions. Endpoints are ~0 by construction; the
 * max-magnitude sample marks where — and how hard — the hole actually turns.
 * Map-only: the odds engine works in 1-D and never sees this, so it is not
 * odds- or replay-affecting.
 */
const BEND_SAMPLES = 12
function bendProfile(center: Vec[], cum: number[]): number[] {
  const total = cum[cum.length - 1]
  const tee = center[0]
  const end = center[center.length - 1]
  const chord = sub(end, tee)
  const chordLen = len(chord) || 1
  const dir: Vec = [chord[0] / chordLen, chord[1] / chordLen]
  const out: number[] = []
  for (let i = 0; i <= BEND_SAMPLES; i++) {
    const { p } = pointAtArc(center, cum, (i / BEND_SAMPLES) * total)
    out.push(Math.round(toYards(cross(dir, sub(p, tee)))))
  }
  return out
}

/**
 * Nearest coastline test. OSM draws coastline with the SEA on the right of the
 * way direction (land on the left), so the signed side of the closest segment
 * tells us whether `q` is over water. Returns null if no coastline is near.
 */
function seaSide(coast: Vec[][], q: Vec, maxDistM: number): boolean | null {
  let bestD2 = Infinity
  let sea: boolean | null = null
  for (const line of coast) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]
      const b = line[i + 1]
      const ab = sub(b, a)
      const abLen = len(ab)
      if (abLen < 1e-6) continue
      let t = dot(sub(q, a), ab) / (abLen * abLen)
      t = Math.max(0, Math.min(1, t))
      const proj: Vec = [a[0] + ab[0] * t, a[1] + ab[1] * t]
      const d2 = dot(sub(q, proj), sub(q, proj))
      if (d2 < bestD2) {
        bestD2 = d2
        // cross(dir, q-a) < 0 ⇒ q is to the RIGHT of travel ⇒ seaward
        sea = cross(ab, sub(q, a)) < 0
      }
    }
  }
  if (sea === null || bestD2 > maxDistM * maxDistM) return null
  return sea
}

/** Ray-cast point-in-polygon (ring = projected meters). */
function pointInRing(ring: Vec[], q: Vec): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Point-in-polygon honouring a multipolygon's inner rings (see elementRings). */
function pointInPoly(p: { ring: Vec[]; holes: Vec[][] }, q: Vec): boolean {
  return pointInRing(p.ring, q) && !p.holes.some((h) => pointInRing(h, q))
}

/**
 * An element's polygons as lat/lon loops: ways are one ring with no holes;
 * relations give one entry per OUTER member, each carrying the relation's INNER
 * rings as holes.
 *
 * The holes are not decoration. A multipolygon's outer ring is the extent of
 * the feature and its inners are the land punched out of it, so dropping the
 * inners inflates the feature to its own bounding shoreline. Whispering Pines
 * is the course that found this: it sits on a peninsula INSIDE relation/976304
 * ("Lake Livingston", 26 outers and 266 inners), whose outer ring sweeps around
 * the whole reservoir. With inners dropped, every sample point on every hole
 * tested inside the lake and all 18 imported as one full-width water `cross`
 * from tee to green — a course that is 100% carry, which is the tell.
 *
 * Attaching EVERY inner to EVERY outer is safe rather than sloppy: in a
 * well-formed multipolygon an inner lies inside exactly one outer, and the
 * outers are disjoint, so a point inside outer B can never be inside an inner
 * belonging to outer A.
 */
type Poly = { ring: LatLon[]; holes: LatLon[][] }

/**
 * Joins a role's member ways into closed rings by matching endpoints.
 *
 * A multipolygon ring is frequently SPLIT across several member ways — OSM
 * shares a way between two features, or a mapper drew a long shoreline in
 * sections — and Overpass hands each member back separately. Treating a
 * fragment as a ring is not a small error: `pointInRing` closes whatever it is
 * given with an artificial last-to-first edge, so half a lake becomes a lake
 * bounded by a straight line through open water, and an inner fragment
 * subtracts land that was never a hole. Six of NGLA's ring members arrive
 * split, and 27 of Whispering Pines', so this is the common case rather than a
 * corner one.
 *
 * Ways in a relation share node coordinates exactly, so endpoints match on
 * value. A fragment that will not close is kept anyway rather than dropped: it
 * is broken data either way, and the implicit closure is what shipped before
 * this function existed, whereas dropping it would silently delete a hazard.
 */
function stitchRings(parts: LatLon[][]): LatLon[][] {
  const key = (p: LatLon) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`
  const pool = parts.filter((p) => p.length >= 2).map((p) => p.slice())
  const rings: LatLon[][] = []
  while (pool.length) {
    let cur = pool.pop()!
    while (key(cur[0]) !== key(cur[cur.length - 1])) {
      const tail = key(cur[cur.length - 1])
      const i = pool.findIndex((w) => key(w[0]) === tail || key(w[w.length - 1]) === tail)
      if (i < 0) break // no continuation — keep the fragment, see the note above
      const w = pool.splice(i, 1)[0]
      cur = cur.concat((key(w[0]) === tail ? w : w.slice().reverse()).slice(1))
    }
    if (cur.length >= 3) rings.push(cur)
  }
  return rings
}

function elementRings(e: OsmElement): Poly[] {
  if (e.geometry && e.geometry.length >= 3) return [{ ring: e.geometry, holes: [] }]
  if (e.members) {
    const geomOf = (inner: boolean) =>
      e
        .members!.filter((m) => (m.role === 'inner') === inner && m.geometry && m.geometry.length >= 2)
        .map((m) => m.geometry!)
    const holes = stitchRings(geomOf(true))
    return stitchRings(geomOf(false)).map((ring) => ({ ring, holes }))
  }
  return []
}

function centroid(ring: Vec[]): Vec {
  let x = 0
  let y = 0
  for (const p of ring) {
    x += p[0]
    y += p[1]
  }
  return [x / ring.length, y / ring.length]
}

// ---------- feature classification ----------
type ZoneKind = 'water' | 'ocean' | 'bunker' | 'trees' | 'deeprough'
function classify(tags: OsmTags): ZoneKind | 'green' | 'tee' | 'fairway' | 'hole' | null {
  const g = tags.golf
  if (g === 'green') return 'green'
  if (g === 'tee') return 'tee'
  if (g === 'fairway') return 'fairway'
  if (g === 'hole') return 'hole'
  if (g === 'bunker') return 'bunker'
  if (g === 'water_hazard' || g === 'lateral_water_hazard') return 'water'
  if (g === 'rough') return 'deeprough'
  if (tags.natural === 'water' || tags.water) return 'water'
  if (tags.natural === 'wood' || tags.landuse === 'forest') return 'trees'
  return null
}

/** Merge same-kind/same-side fragments whose spans overlap or nearly touch. */
function mergeZones<T extends { kind: string; from: number; to: number; side: string }>(raws: T[]): T[] {
  const GAP = 8 // yards; bridge tiny gaps from split polygons
  const out: T[] = []
  const sorted = [...raws].sort((a, b) => a.from - b.from)
  for (const r of sorted) {
    const hit = out.find((o) => o.kind === r.kind && o.side === r.side && r.from <= o.to + GAP && r.to >= o.from - GAP)
    if (hit) {
      hit.from = Math.min(hit.from, r.from)
      hit.to = Math.max(hit.to, r.to)
    } else {
      out.push({ ...r })
    }
  }
  return out.sort((a, b) => a.from - b.from)
}

// ---------- main ----------
async function main() {
  const [slug, holeArg, ...flags] = process.argv.slice(2)
  if (!slug || !holeArg) {
    console.error('usage: node scripts/import-osm.ts <courseSlug> <holeNumber> [--json|--raw]')
    process.exit(1)
  }
  const holeNo = Number(holeArg)
  const geo = COURSE_GEO[slug]
  if (!geo) {
    console.error(`no geo registry entry for "${slug}". known: ${Object.keys(COURSE_GEO).join(', ')}`)
    process.exit(1)
  }

  // cache Overpass responses per course so iteration doesn't re-hit the network
  const cacheFile = `${process.env.TMPDIR ?? '/tmp'}/osm-${slug}.json`
  let els: OsmElement[]
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs')
  if (!flags.includes('--fresh') && existsSync(cacheFile)) {
    els = JSON.parse(readFileSync(cacheFile, 'utf8'))
    console.error(`  ${els.length} golf features (cached ${cacheFile})`)
  } else {
    console.error(`fetching OSM golf features near ${geo.name} …`)
    els = await fetchOverpass(golfQuery(geo))
    writeFileSync(cacheFile, JSON.stringify(els))
    console.error(`  ${els.length} golf features returned (cached)`)
  }

  // the hole centerline: golf=hole way with matching ref. Neighboring courses
  // (Pebble/Spyglass/Del Monte in one radius) each have a hole `ref`, and a
  // shared site (Sawgrass Stadium vs Valley) even shares the whole numbering —
  // so disambiguate first by way ID (osmHoleWays), then by hole NAME
  // (osmHolePrefix), then by nearest center.
  const centerProj = projector(geo.center[0], geo.center[1])
  const c0 = centerProj({ lat: geo.center[0], lon: geo.center[1] })
  const holeWays = els.filter((e) => e.tags?.golf === 'hole' && e.geometry)
  // An osmHoleWays pin is checked against EVERY golf=hole way, not just the ones
  // carrying ref=N: an id names one specific way, which is strictly stronger
  // evidence than a ref tag and does not need the ref to agree with it. That
  // also makes the pin the way to import a hole OSM simply forgot to number —
  // whispering-pines:8 is mapped, drawn between the 7th and the 9th, and has no
  // `ref` at all, so the ref filter alone would drop it and report the hole
  // missing on a course that is fully mapped.
  let candidates = geo.osmHoleWays
    ? holeWays
    : holeWays.filter((e) => String(e.tags!.ref ?? '') === String(holeNo))
  if (candidates.length === 0) {
    const refs = [...new Set(holeWays.map((e) => e.tags?.ref))].sort()
    console.error(`no golf=hole way with ref=${holeNo}. available refs: [${refs.join(', ')}]`)
    process.exit(2)
  }
  if (geo.osmHoleWays) {
    // FATAL on a miss, for the same reason osmHolePrefix is (below) and more
    // so: an id list is only ever set where NEITHER a name prefix nor
    // nearest-centre can tell two courses apart, so there is nothing safe to
    // fall back to. If OSM re-draws a hole the id changes and this stops,
    // which is the intended outcome — re-pin the id against the current data
    // and re-verify it is the right course's hole before importing.
    const wantId = geo.osmHoleWays[holeNo]
    if (!wantId) {
      console.error(`hole ${holeNo}: no osmHoleWays entry for ${geo.name}. Pin the way id before importing.`)
      process.exit(2)
    }
    const pinned = candidates.filter((e) => e.id === wantId)
    if (!pinned.length) {
      const ids = candidates.map((e) => e.id).join(', ')
      console.error(
        `hole ${holeNo}: osmHoleWays pins way ${wantId} on ${geo.name}, which is not among the\n` +
          `  ${candidates.length} golf=hole way(s) here: [${ids}]\n` +
          `  That id is this course's only identity check against the other course on the site,\n` +
          `  so this refuses to guess. Re-pin osmHoleWays in COURSE_GEO against the current OSM\n` +
          `  data — and re-verify the replacement is this course's hole — before importing.`,
      )
      process.exit(2)
    }
    candidates = pinned
  }
  if (geo.osmHolePrefix) {
    const re = new RegExp(geo.osmHolePrefix, 'i')
    const named = candidates.filter((e) => re.test(e.tags?.name ?? ''))
    // FATAL, deliberately, rather than falling through to nearest-centre. A
    // prefix is only ever set where several courses share ONE golf_course
    // polygon and therefore share hole `ref`s — Bandon's 54 ways across three
    // courses, Sawgrass Stadium against Dye's Valley, Carnoustie against its
    // three siblings — so it is the ONLY thing telling them apart. If an OSM
    // rename breaks the match, nearest-centre would quietly hand back a
    // NEIGHBOURING course's hole and emit it under this slug: geometry that
    // claims to be the real place and isn't, which step 0 of the freeze process
    // in scripts/README.md calls worse than shipping nothing at all. Stop and
    // make a human re-pin the prefix.
    if (!named.length) {
      const names = candidates.map((e) => JSON.stringify(e.tags?.name ?? null)).join(', ')
      console.error(
        `hole ${holeNo}: no golf=hole way matched /${geo.osmHolePrefix}/i on ${geo.name}.\n` +
          `  ${candidates.length} way(s) share ref=${holeNo} here, named: ${names}\n` +
          `  That prefix is this course's only identity check against the others on the site,\n` +
          `  so this refuses to guess. Re-pin osmHolePrefix in COURSE_GEO against the current\n` +
          `  OSM names before importing.`,
      )
      process.exit(2)
    }
    candidates = named
  }
  const holeWay = candidates.sort((a, b) => {
    const da = len(sub(centerProj(a.geometry![0]), c0))
    const db = len(sub(centerProj(b.geometry![0]), c0))
    return da - db
  })[0]
  if (candidates.length > 1) console.error(`  ${candidates.length} candidates for ref=${holeNo}; chose nearest to center`)

  // reference frame anchored at the tee end of the hole line
  const line = holeWay.geometry
  const proj = projector(line[0].lat, line[0].lon)
  // --shift <yd>: the centreline starts at a FORWARD pad, so prepend the
  // missing tee run as a straight segment back along the opening heading —
  // the same assumption the zone shift already makes ("the real tee is N yards
  // straight back"), applied to the geometry instead of to the numbers
  // afterwards. Everything downstream then comes out in CARD coordinates for
  // free: `length`, every zone's from/to, fairwayFrom/To — and, crucially, the
  // BEND PROFILE, which cannot be shifted after the fact. Its 13 samples are
  // evenly spaced fractions of the hole, and HoleMap replays them at the same
  // fractions of the final card length, so a profile measured on the short raw
  // line gets STRETCHED over the long one and draws the corner yards early
  // (64 yd early on pacific-dunes:8, whose pad is 110 yd forward). Re-measuring
  // on the extended line also re-bases the deviations on the real back-tee ->
  // green chord, which a resample of the old numbers could not do.
  const rawPts = line.map(proj)
  const shiftIdx = flags.indexOf('--shift')
  const shiftYd = shiftIdx >= 0 ? Number(flags[shiftIdx + 1]) : 0
  if (shiftIdx >= 0 && !Number.isFinite(shiftYd)) {
    console.error('--shift needs a yardage, e.g. --shift 110')
    process.exit(2)
  }
  if (shiftYd > 0 && rawPts.length >= 2) {
    const [p0, p1] = rawPts
    const back = sub(p0, p1)
    const bl = len(back) || 1
    rawPts.unshift([p0[0] + (back[0] / bl) * toMeters(shiftYd), p0[1] + (back[1] / bl) * toMeters(shiftYd)])
  }
  // A NEGATIVE --shift is the mirror image: the centreline starts BEHIND the
  // card's tee (the mapper traced from a championship pad on a course we ship
  // off a shorter card), so walk N yards down the existing line and start
  // there. Muirfield is the case this was written for — OSM drew 10 of 18 from
  // the back pads, and the club's WHITE card, which the shipped tuple already
  // matched exactly, is 361 yd shorter in total.
  //
  // Trimming is the STRONGER half of the operation, not a grudging inverse:
  // the positive path invents a straight run back from the tee, while this one
  // only discards measured line, so the geometry that survives is all real.
  // Do it here, on the raw points and before smoothing, for the same reason
  // --shift prepends here — length, zones, fairwayFrom/To and the bend profile
  // then all come out in card coordinates in one pass. Hazards beside the
  // discarded run drop out with it, which is correct: they sit behind the tee
  // we actually play from.
  if (shiftYd < 0 && rawPts.length >= 2) {
    let drop = toMeters(-shiftYd)
    while (rawPts.length >= 2 && drop > 0) {
      const seg = len(sub(rawPts[1], rawPts[0]))
      if (seg > drop) {
        // land mid-segment: move the first point forward along it
        const d = sub(rawPts[1], rawPts[0])
        const f = drop / (seg || 1)
        rawPts[0] = [rawPts[0][0] + d[0] * f, rawPts[0][1] + d[1] * f]
        break
      }
      drop -= seg
      rawPts.shift()
    }
    if (rawPts.length < 2) {
      console.error(`--shift ${shiftYd} trims the whole centreline away`)
      process.exit(2)
    }
  }
  const center: Vec[] = chaikin(rawPts, 2)
  const cum = arcLengths(center)
  const holeLenM = cum[cum.length - 1]
  const length = Math.round(toYards(holeLenM))

  if (flags.includes('--raw')) {
    const rows = els
      .filter((e) => classify(e.tags ?? {}))
      .map((e) => ({ id: e.id, kind: classify(e.tags ?? {}), tags: e.tags }))
    console.log(JSON.stringify({ holeRef: holeNo, length, features: rows }, null, 2))
    return
  }

  // --- corridor rasterization ---
  // Walk the hole line yard by yard; at each step probe a lateral rake of points
  // and point-in-polygon test them against every hazard. This handles surrounding
  // water (island greens), doglegs, and crossing hazards that vertex-projection
  // mangles. `side` falls out of which offsets hit.
  const CORRIDOR_YD = 50 // how far left/right we care about
  const OCEAN_REACH_YD = 160 // how far out to look for a set-back cliff line
  const STEP_YD = 2
  const RAKE_YD = geo.rake ?? 6 // lateral sample spacing (see CourseGeo.rake)
  const CENTER_YD = 10 // |offset| within this counts as "on the line" → crossing

  // pre-project every hazard ring once, keep only rings near the corridor
  // Carry the element TYPE, not just the id: OSM way and relation ids are
  // separate namespaces, so reporting a multipolygon hazard as way/<id> sends
  // a reviewer to an unrelated object or a 404 — and `--profile` output is
  // read as evidence during the freeze.
  type Ring = { kind: ZoneKind | 'green'; ring: Vec[]; holes: Vec[][]; id: number; type: OsmElement['type'] }
  const rings: Ring[] = []
  for (const e of els) {
    if (e === holeWay) continue
    if (geo.osmIgnore?.includes(e.id)) continue // mis-tagged for this course — see COURSE_GEO
    const k = classify(e.tags ?? {})
    if (!k || k === 'tee' || k === 'fairway' || k === 'hole') continue
    for (const loop of elementRings(e)) {
      const ring = loop.ring.map(proj)
      const holes = loop.holes.map((h) => h.map(proj))
      // Keep a ring only if an EDGE of it comes near the line. A real hazard
      // borders the playing corridor; a course-spanning lake that the coarse
      // straight centreline merely clips through at a dogleg has all its edges
      // far away — that was the phantom "water crosses at 0 yds" on Sawgrass 2.
      // INNER rings count as edges too. For a hole played along an island or a
      // peninsula, the water's edge beside it IS the inner ring, while the
      // outer boundary can be miles out across the lake — scanning only the
      // outer would drop the polygon before pointInPoly ever got to use its
      // holes, and the hole would come through with no water at all.
      let nearestEdge = Infinity
      for (const boundary of [ring, ...holes]) {
        for (const p of boundary) {
          const { along, lateral } = projectToPolyline(center, cum, p)
          const al = toYards(along)
          if (al > -25 && al < length + 25) nearestEdge = Math.min(nearestEdge, toYards(Math.abs(lateral)))
        }
      }
      if (nearestEdge < 48) rings.push({ kind: k, ring, holes, id: e.id, type: e.type })
    }
  }

  // coastline polylines near the corridor (the sea is the RIGHT side of the way)
  const coast: Vec[][] = []
  for (const e of els) {
    if (e.tags?.natural !== 'coastline' || !e.geometry || e.geometry.length < 2) continue
    const line = e.geometry.map(proj)
    let near = false
    for (const p of line) {
      const { along, lateral } = projectToPolyline(center, cum, p)
      const al = toYards(along)
      if (al > -60 && al < length + 60 && toYards(Math.abs(lateral)) < CORRIDOR_YD + 150) {
        near = true
        break
      }
    }
    if (near) coast.push(line)
  }

  if (flags.includes('--oceandbg') && coast.length) {
    const nearestSea = (a: number, side: number) => {
      const { p, dir } = pointAtArc(center, cum, toMeters(a))
      const nrm: Vec = [-dir[1], dir[0]]
      for (let off = 2; off <= 250; off += 3) {
        const o = side * off
        const q: Vec = [p[0] + nrm[0] * toMeters(o), p[1] + nrm[1] * toMeters(o)]
        if (seaSide(coast, q, toMeters(400)) === true) return off
      }
      return null
    }
    for (let a = 0; a <= length; a += 15) {
      console.error(`  [odbg] along ${String(a).padStart(3)}yd  sea-left ${nearestSea(a, 1) ?? '—'}  sea-right ${nearestSea(a, -1) ?? '—'}`)
    }
  }

  if (flags.includes('--debug')) {
    console.error(`  [dbg] coastline segments in corridor: ${coast.length}`)
    const byk: Record<string, number> = {}
    for (const r of rings) byk[r.kind] = (byk[r.kind] ?? 0) + 1
    console.error(`  [dbg] rings in corridor: ${JSON.stringify(byk)}`)
    for (const { kind, ring } of rings.filter((r) => r.kind === 'water' || r.kind === 'green')) {
      let aLo = Infinity
      let aHi = -Infinity
      let pLo = Infinity
      let pHi = -Infinity
      for (const p of ring) {
        const { along, lateral } = projectToPolyline(center, cum, p)
        aLo = Math.min(aLo, toYards(along))
        aHi = Math.max(aHi, toYards(along))
        pLo = Math.min(pLo, toYards(lateral))
        pHi = Math.max(pHi, toYards(lateral))
      }
      console.error(
        `  [dbg] ${kind} along ${aLo.toFixed(0)}–${aHi.toFixed(0)}  lateral ${pLo.toFixed(0)}..${pHi.toFixed(0)}`,
      )
    }
  }

  // ---------- ocean (rasterised half-plane) + green (centre-line) ----------
  // Keep the raw set of lateral offsets hit at each along, NOT a left/right/centre
  // summary. A summary cannot tell "one hazard lying across the line" from "two
  // hazards flanking a clean fairway" — both set left+right — and calling the
  // second one a `cross` invents a carry the player just drives between. Ross
  // courses bunker both flanks at the same distance constantly (Seminole threw
  // 40 of these, including a 398-yd "carry" on hole 4), which is why the
  // artifact-mode catalog in scripts/README.md leads with phantom crosses.
  const seriesByKind = new Map<ZoneKind, Map<number, Set<number>>>()
  const record = (kind: ZoneKind, a: number, off: number) => {
    let byAlong = seriesByKind.get(kind)
    if (!byAlong) seriesByKind.set(kind, (byAlong = new Map()))
    let offs = byAlong.get(a)
    if (!offs) byAlong.set(a, (offs = new Set()))
    offs.add(off)
  }
  const coastReach = toMeters(CORRIDOR_YD + 120)

  // green depth: the along span where the centre line runs through a green —
  // specifically the LAST contiguous run of it. Taking min/max across every hit
  // is what made cypress-point:1 read 402 yd deep: that centreline passes a
  // NEIGHBOURING green at 28-54 yd before reaching its own at 400, so the span
  // stretched between two different greens and pinned the 45 clamp. That is the
  // artifact scripts/README.md says to suspect whenever greenDepth reads exactly
  // 45, and it is silent whenever the stray green inflates the number without
  // reaching the clamp. The green a hole is played TO is the one its line ends
  // on, so only the run that reaches the end counts.
  // Carry the polygon id per sample so a line touching MORE THAN ONE green is
  // reported rather than silently resolved. There is no automatic way to pick
  // the right one: the tell-tale is which green the hole is played TO, and for
  // a way drawn tee->pin that is the one its end sits in — but if a way
  // OVERSHOOTS its own green into a neighbour's, "the green at the end" is the
  // neighbour, so polygon identity picks the same wrong green the last run
  // does. What the old min/max at least did was fail LOUDLY (a conspicuous
  // clamped 45). So the heuristic stays — it is right for every tee->pin way,
  // which is all 246 shipped holes — and the ambiguity is made loud instead,
  // naming every green and its span so a human decides. Never let this pass
  // quietly: a plausible-looking depth off the wrong green is worse than an
  // obviously wrong one.
  // Identity is TYPE + ID, never the id alone: OSM way and relation ids are
  // separate namespaces, so way/123 and relation/123 are different objects and
  // keying on the number could fuse two greens into one — suppressing the
  // warning below and letting the run bridge them, which is exactly the
  // inflated depth this whole block exists to prevent. Same reason the Ring
  // type carries `type` for hazard reporting.
  const greenKey = (g: { id: number; type: OsmElement['type'] }) => `${g.type}/${g.id}`
  // EVERY green containing each station, sorted — not the first `find` hit.
  // Where two green polygons OVERLAP, taking the first match makes both the
  // warning and the measured run depend on the order `rings` happens to be in,
  // which is the ordering-dependent wrong-green result this guard exists to
  // expose. Sorting also makes the target choice below deterministic.
  const onGreen: { a: number; keys: string[] }[] = []
  for (let a = 0; a <= length; a += STEP_YD) {
    const p = pointAtArc(center, cum, toMeters(a)).p
    const keys = rings
      .filter((r) => r.kind === 'green' && pointInPoly(r, p))
      .map(greenKey)
      .sort()
    if (keys.length) onGreen.push({ a, keys: [...new Set(keys)] })
  }
  const greensTouched = [...new Set(onGreen.flatMap((g) => g.keys))].sort()
  if (greensTouched.length > 1) {
    const spans = greensTouched.map((key) => {
      const hits = onGreen.filter((g) => g.keys.includes(key))
      return `    ${key}  ${hits[0].a}-${hits[hits.length - 1].a} yd`
    })
    console.error(
      `  ! hole ${holeNo}: the centreline runs through ${greensTouched.length} DIFFERENT greens:\n` +
        spans.join('\n') +
        `\n    greenDepth is measured from the LAST run (the green a tee->pin line ends on).\n` +
        `    Check that is this hole's green — a line that overshoots into a neighbour's\n` +
        `    would measure the neighbour here, and it would look perfectly plausible.\n` +
        `    (Normal cause: the tee sits beside the PREVIOUS hole's green — cypress-point:1.)`,
    )
  }
  // The green this hole is played TO is the one its line ends on. `keys` is
  // sorted, so keys[0] is the same choice whatever order `rings` came in; if
  // the last station sits on more than one green they genuinely overlap at the
  // pin, which no rule can disambiguate, so say so.
  const targetKey = onGreen.length ? onGreen[onGreen.length - 1].keys[0] : ''
  if (onGreen.length && onGreen[onGreen.length - 1].keys.length > 1) {
    console.error(
      `  ! hole ${holeNo}: the pin sits on ${onGreen[onGreen.length - 1].keys.length} OVERLAPPING greens ` +
        `(${onGreen[onGreen.length - 1].keys.join(', ')}); measuring ${targetKey}. Check the mapping.`,
    )
  }
  let greenLo = Infinity
  let greenHi = -Infinity
  if (onGreen.length) {
    // walk back over the last contiguous run of stations still ON THE TARGET —
    // a station that has left it is a different green touching, not more depth
    let lo = onGreen.length - 1
    while (lo > 0 && onGreen[lo].a - onGreen[lo - 1].a <= STEP_YD * 2 && onGreen[lo - 1].keys.includes(targetKey))
      lo--
    greenLo = onGreen[lo].a
    greenHi = onGreen[onGreen.length - 1].a
  }

  // A centreline that STOPS AT THE PIN runs through only the FRONT HALF of its
  // green, so the walk above measures half a green and the clamp floors it at
  // 20 — SHALLOWER than the procedural default (28-36) the import is supposed
  // to improve on. That is not cosmetic: greenDepth sets `fairwayTo` and feeds
  // isGreenside() in the odds. Bandon maps every hole this way (all 18 Pacific
  // Dunes lines end within 9 yd of their green's centroid, and 11 of 18
  // floored), and it is the mirror of the greenDepth-45 mode in the README:
  // there the line runs on to the WRONG green, here it stops at the right one.
  // So where the walk is STILL INSIDE a green when the way runs out, keep
  // walking along the approach direction until it actually leaves. Same test,
  // same yardstick — the only thing that changes is that the way ending is no
  // longer mistaken for the green ending. Do NOT substitute the ring's own
  // extent along that axis: on a green set across the shot (hole 3 is 42 yd
  // wide against 32 deep) the bounding extent reads corner-to-corner and
  // invents depth. Lines that exit their green before the end are untouched.
  if (isFinite(greenHi) && greenHi >= length - STEP_YD) {
    // Pinned to the run's OWN polygon, not "any green". Two greens that touch or
    // overlap would otherwise let the ray walk straight out of the target and on
    // through its neighbour without ever landing a sample on open ground —
    // rebuilding the very inflated depth this block exists to stop, and doing it
    // where the multi-green warning above cannot see it, since that is computed
    // only from samples on the original centreline.
    const endP = pointAtArc(center, cum, toMeters(length)).p
    const backP = pointAtArc(center, cum, toMeters(Math.max(0, length - 25))).p
    const app = sub(endP, backP)
    const appLen = len(app) || 1
    const appDir: Vec = [app[0] / appLen, app[1] / appLen]
    for (let a = length + STEP_YD; a <= length + 60; a += STEP_YD) {
      const d = toMeters(a - length)
      const q: Vec = [endP[0] + appDir[0] * d, endP[1] + appDir[1] * d]
      // Ask "am I still on the TARGET", never "which green did find() hit
      // first" — where a neighbour overlaps the target past the pin, the first
      // hit can be the neighbour while q is still inside the target, and
      // truncating there would make the depth depend on ring order rather than
      // on the target green's own edge.
      if (rings.some((r) => r.kind === 'green' && greenKey(r) === targetKey && pointInPoly(r, q))) {
        greenHi = a
        continue
      }
      const other = rings.find((r) => r.kind === 'green' && pointInPoly(r, q))
      if (other) {
        console.error(
          `  ! hole ${holeNo}: past the pin the approach leaves ${targetKey} and enters ` +
            `${greenKey(other)} at ${a} yd — greenDepth stops at the target green's own edge. ` +
            `Two greens touching here is worth a look.`,
        )
      }
      break
    }
  }

  // ocean is everything seaward of the coastline — sample the rake for it only
  if (coast.length) {
    for (let a = 0; a <= length; a += STEP_YD) {
      const { p, dir } = pointAtArc(center, cum, toMeters(a))
      const nrm: Vec = [-dir[1], dir[0]] // left-hand normal (+offset = left)
      for (let off = -CORRIDOR_YD; off <= CORRIDOR_YD; off += RAKE_YD) {
        const q: Vec = [p[0] + nrm[0] * toMeters(off), p[1] + nrm[1] * toMeters(off)]
        if (seaSide(coast, q, coastReach) === true) record('ocean', a, off)
      }
    }
  }

  // Ocean is a half-plane, not a polygon. Where the cliff is set back beyond the
  // rake, the fairway sits inland yet still has the sea down that flank. Pick the
  // hole's ocean side from the reliable near-rake hits (a wrapping bay shore can
  // otherwise fake the opposite side), then probe outward to fill every along on
  // that side so the water renders as one continuous edge.
  const oceanHits = seriesByKind.get('ocean')
  if (coast.length && oceanHits) {
    let leftN = 0
    let rightN = 0
    for (const offs of oceanHits.values()) {
      if ([...offs].some((o) => o > 0)) leftN++
      if ([...offs].some((o) => o < 0)) rightN++
    }
    const s = rightN >= leftN ? -1 : 1 // -1 ⇒ ocean on the right (off<0)
    // A green that juts into the sea (Pebble 7) has ocean CLOSE on the far side
    // too, but only around the green. Allow the non-dominant side there with a
    // TIGHT reach — close enough to be the same promontory, not a bay shore an
    // OCEAN_REACH away (which is exactly the Carmel Bay false positive we reject
    // by keeping the fairway strictly one-sided).
    const WRAP_REACH_YD = 75
    const greenStart = isFinite(greenLo) ? greenLo - 12 : length - 30
    const probe = (a: number, side: number, reach: number) => {
      const { p, dir } = pointAtArc(center, cum, toMeters(a))
      const nrm: Vec = [-dir[1], dir[0]]
      for (let off = RAKE_YD; off <= reach; off += RAKE_YD) {
        const o = side * off
        const q: Vec = [p[0] + nrm[0] * toMeters(o), p[1] + nrm[1] * toMeters(o)]
        if (seaSide(coast, q, coastReach) === true) {
          record('ocean', a, o)
          return
        }
      }
    }
    for (let a = 0; a <= length; a += STEP_YD) {
      probe(a, s, OCEAN_REACH_YD) // dominant flank: full reach, whole hole
      if (a >= greenStart) probe(a, -s, WRAP_REACH_YD) // wrap: near the green only, tight
    }
  }

  // ---------- discrete hazards (water / bunker / trees) ----------
  // Rasterise the corridor, but with a SMOOTHED normal so a coarse centreline
  // that kinks near the green can't flip a hazard onto the wrong side, and only
  // over rings THIS hole owns — a neighbour's sand in a tight corridor otherwise
  // bleeds in. (Both were the failure modes on Sawgrass's complex holes.)
  const holeLines = els
    .filter(
      (e) =>
        e.tags?.golf === 'hole' &&
        e.geometry &&
        (!geo.osmHolePrefix || new RegExp(geo.osmHolePrefix, 'i').test(e.tags?.name ?? '')),
    )
    .map((e) => {
      // The TARGET's line must be the SHIFTED one (rawPts carries the prepended
      // tee run), or --shift half-works: the corridor rake reaches hazards
      // beside the new back-tee segment, but ownership still measures them
      // against the forward pad, so a neighbouring hole's line is nearer and
      // they get culled — silently dropping exactly the hazards --shift exists
      // to find. Neighbours keep their own raw geometry; only the hole being
      // imported grows a tee.
      const l = e === holeWay ? rawPts : e.geometry!.map(proj)
      return { isTarget: e === holeWay, line: l, cum: arcLengths(l) }
    })
  const distToLine = (hl: { line: Vec[]; cum: number[] }, q: Vec) => Math.abs(projectToPolyline(hl.line, hl.cum, q).lateral)
  // Ownership by the polygon's NEAREST APPROACH to a line, not its centroid: a
  // long shared hazard (Rae's Creek fronting Augusta 12) has a far-off centroid
  // but runs right under our line, so it's ours; a neighbour's bunker never
  // comes close to our line at all.
  // Measured over the outer AND inner boundaries, for the same reason the
  // proximity filter above is: on a multipolygon the edge that borders our hole
  // can be an INNER ring, with the outer miles away across the lake. Judging
  // ownership on the outer alone then compares two distances that are both
  // enormous and neither of which is the shoreline in question, so a
  // neighbouring hole can win a reservoir by a metre of noise and cull the
  // water from the hole whose bank it actually is.
  // No committed course changes as a result (all 90 holes in the v19 batch
  // re-import byte-identical, Whispering Pines included) — this makes a check
  // that happened to come out right measure the thing it is asking about.
  const ownsHazard = (poly: { ring: Vec[]; holes: Vec[][] }, kind: ZoneKind) => {
    let dT = Infinity
    let dOther = Infinity
    for (const boundary of [poly.ring, ...poly.holes]) {
      for (const v of boundary) {
        for (const hl of holeLines) {
          const d = distToLine(hl, v)
          if (hl.isTarget) dT = Math.min(dT, d)
          else dOther = Math.min(dOther, d)
        }
      }
    }
    // Packed short courses: a bunker belongs to whichever hole line it's
    // nearest, full stop — the 42yd hug clause below spans a whole corridor
    // gap there and adopts the neighbour's sand (Palm Beach hole 1 grew
    // phantom left bunkers from holes 2/18 without this).
    if (geo.packed && kind === 'bunker') return dT <= dOther + toMeters(5)
    // hugging our line ⇒ ours; only cull ones clearly closer to a neighbour
    return dT <= toMeters(42) || dT <= dOther + toMeters(20)
  }
  const ownedRings = rings.filter((r) => r.kind === 'green' || ownsHazard(r, r.kind))

  // travel direction at along a, averaged over ±25 yd → a normal that a single
  // coarse-centreline kink can't flip (a real dogleg bend still turns it)
  const smoothDirAt = (a: number): Vec => {
    const w = toMeters(25)
    const tot = cum[cum.length - 1]
    const a0 = pointAtArc(center, cum, Math.max(0, toMeters(a) - w)).p
    const a1 = pointAtArc(center, cum, Math.min(tot, toMeters(a) + w)).p
    const d = sub(a1, a0)
    const dl = len(d) || 1
    return [d[0] / dl, d[1] / dl]
  }

  for (let a = 0; a <= length; a += STEP_YD) {
    const base = pointAtArc(center, cum, toMeters(a)).p
    const dir = smoothDirAt(a)
    const nrm: Vec = [-dir[1], dir[0]] // left-hand normal (+offset = left)
    for (let off = -CORRIDOR_YD; off <= CORRIDOR_YD; off += RAKE_YD) {
      const q: Vec = [base[0] + nrm[0] * toMeters(off), base[1] + nrm[1] * toMeters(off)]
      for (const r of ownedRings) {
        const kind = r.kind
        if (kind === 'green') continue
        // `deeprough` (golf=rough) is dropped wholesale at merge time — it is
        // the course's DEFAULT surface, usually one big multipolygon, and never
        // becomes a zone. So letting it win a sample point here can only ever
        // HIDE a real hazard drawn inside it: the loop breaks on the first ring
        // that contains the point, and ring order is just Overpass's response
        // order. That is what emptied cabot-links:3 and :5 — way/1044331550
        // covers the whole 5th at -41..37 lateral, so both greenside bunkers
        // (16 and 21 yd off the line on a 186-yd par 3) rasterised as rough and
        // then vanished, leaving a bare hole where the imagery shows sand.
        // Skipping it outright is equivalent to testing it last.
        if (kind === 'deeprough') continue
        if (pointInPoly(r, q)) {
          record(kind, a, off)
          break // one kind per sample point
        }
      }
    }
  }

  // ---------- collapse per-along hits into zones (ocean + hazards) ----------
  // A hazard is a CROSSING only where its sand/water is laterally CONTINUOUS
  // across the playing line — you cannot carry something with a gap you can
  // drive through. So split each along's hit offsets into contiguous runs (one
  // rake step apart) and give each run its own side; a run only earns `cross`
  // if it reaches both flanks AND covers the centre band. Two flanking hazards
  // therefore stay two flanking zones, however close together they sit, while a
  // genuine carry still reads as one cross even when OSM drew it as several
  // touching polygons.
  type Raw = { kind: ZoneKind; from: number; to: number; side: string }
  const raws: Raw[] = []
  for (const [kind, byAlong] of seriesByKind) {
    for (const a of [...byAlong.keys()].sort((x, y) => x - y)) {
      const offs = [...byAlong.get(a)!].sort((x, y) => x - y)
      let run: number[] = []
      const flush = () => {
        if (!run.length) return
        // A crossing must also be WIDE enough to be worth carrying. Continuity
        // across the line is necessary but not sufficient: a small revetted pot
        // sitting on the centreline satisfies it while blocking three yards of
        // a hundred-yard corridor, and `cross` means "you must carry this".
        // Muirfield produced three (6:224, 8:274, 18:364, spanning 9, 6 and 3
        // yd laterally) once the rake was fine enough to see them at all.
        // Width alone can't be the test, though — a burn crossing the fairway
        // is narrow and IS a forced carry (Carnoustie, Rae's Creek). So the
        // minimum applies to SAND only: a narrow bunker on the line is a pot
        // you aim around, a narrow watercourse is a hazard you clear.
        const MIN_CROSS_SAND_YD = 12
        const spansLine =
          run.some((o) => o > 0) &&
          run.some((o) => o < 0) &&
          run.some((o) => Math.abs(o) <= CENTER_YD) &&
          (kind !== 'bunker' || run[run.length - 1] - run[0] >= MIN_CROSS_SAND_YD)
        // Falls through to the flank holding most of the hazard's mass; a
        // straddling run that isn't a crossing used to default to 'cross'.
        const mass = run.reduce((s, o) => s + o, 0)
        const side = spansLine ? 'cross' : run[0] > 0 ? 'left' : run[run.length - 1] < 0 ? 'right' : mass >= 0 ? 'left' : 'right'
        raws.push({ kind, from: a, to: a + STEP_YD, side })
        run = []
      }
      for (const o of offs) {
        if (run.length && o - run[run.length - 1] > RAKE_YD) flush()
        run.push(o)
      }
      flush()
    }
  }

  const greenDepth = isFinite(greenLo) ? Math.max(20, Math.min(45, greenHi - greenLo)) : 30

  // merge contiguous same-kind/same-side samples into real zones
  const merged = mergeZones(raws)
    .filter((r) => r.to - r.from >= STEP_YD)
    // OSM rough polygons are big, noisy, and mostly the default surface anyway —
    // the map reads cleaner as fairway + real hazards (water/sand/ocean)
    .filter((r) => r.kind !== 'deeprough')
    // drop sub-4yd slivers (rake/projection noise); keep real carries
    .filter((r) => r.to - r.from >= 4)
  const zones = merged.map((r, i) => ({ id: `z${i + 1}`, kind: r.kind, from: r.from, to: Math.min(length, r.to), side: r.side }))

  // ---------- --profile: per-ring lateral profiles, and a verdict per `cross` ----------
  // The decisive question for every `cross` band is whether ONE polygon actually
  // spans the playing line, or whether two flanking hazards merely hit the rake
  // on both sides of a clean centre — `side` collapses to 'cross' either way
  // (see the ternary above), and only the first is a carry anyone plays.
  // Courses bunkered down both flanks (Seminole) produce the second in bulk.
  if (flags.includes('--profile')) {
    const hazardRings = ownedRings.filter((r) => r.kind !== 'green')
    // per-ring hit map: along → set of lateral offsets this ring alone covers
    const ringHits = new Map<Ring, Map<number, number[]>>()
    for (const r of hazardRings) {
      const m = new Map<number, number[]>()
      for (let a = 0; a <= length; a += STEP_YD) {
        const base = pointAtArc(center, cum, toMeters(a)).p
        const dir = smoothDirAt(a)
        const nrm: Vec = [-dir[1], dir[0]]
        const offs: number[] = []
        for (let off = -CORRIDOR_YD; off <= CORRIDOR_YD; off += RAKE_YD) {
          const q: Vec = [base[0] + nrm[0] * toMeters(off), base[1] + nrm[1] * toMeters(off)]
          if (pointInPoly(r, q)) offs.push(off)
        }
        if (offs.length) m.set(a, offs)
      }
      ringHits.set(r, m)
    }
    // The sea is a half-plane, not a polygon, so it is nowhere in `rings` — an
    // `ocean` cross has no ring to find and would report as an artifact with no
    // culprits at all, which is exactly backwards on the carries most worth
    // checking (Cypress 15-17, Pebble 8). Sample it the way the importer does,
    // off the coastline, so ocean crossings get the same straddle evidence.
    const oceanHits = new Map<number, number[]>()
    if (coast.length) {
      for (let a = 0; a <= length; a += STEP_YD) {
        const { p, dir } = pointAtArc(center, cum, toMeters(a))
        const nrm: Vec = [-dir[1], dir[0]]
        const offs: number[] = []
        for (let off = -CORRIDOR_YD; off <= CORRIDOR_YD; off += RAKE_YD) {
          const q: Vec = [p[0] + nrm[0] * toMeters(off), p[1] + nrm[1] * toMeters(off)]
          if (seaSide(coast, q, coastReach) === true) offs.push(off)
        }
        if (offs.length) oceanHits.set(a, offs)
      }
    }
    console.error('')
    console.log(`# ${geo.name} — hole ${holeNo}  (ring profiles)`)
    const straddles = (offs: number[]) =>
      offs.some((o) => Math.abs(o) <= CENTER_YD) && offs.some((o) => o > 0) && offs.some((o) => o < 0)
    for (const r of hazardRings) {
      const m = ringHits.get(r)!
      if (!m.size) continue
      const alongs = [...m.keys()].sort((a, b) => a - b)
      const all = [...m.values()].flat()
      const nStraddle = alongs.filter((a) => straddles(m.get(a)!)).length
      console.log(
        `  ${r.kind.padEnd(7)} ${`${r.type}/${r.id}`.padEnd(20)} along ${String(alongs[0]).padStart(4)}-${String(alongs[alongs.length - 1]).padEnd(4)}` +
          `  lateral ${String(Math.min(...all)).padStart(4)}..${String(Math.max(...all)).padEnd(4)}` +
          `  straddles the line at ${nStraddle} of ${alongs.length} samples`,
      )
    }
    console.log('\n  verdict per `cross` zone:')
    console.log(
      '  (REAL CARRY = one hazard lies across the line. That is necessary, not sufficient —\n' +
        '   check for mapped `golf=fairway` alongside it before believing a forced carry:\n' +
        "   seminole:11's lake spans 49 of 49 samples and is still a lateral, because the\n" +
        '   fairway runs up its left for every yard of it.)',
    )
    // A zone only has as many samples as its length allows (STEP_YD apart), and
    // merged zones can be 4 yd — two samples. Demanding a flat 3 made every
    // short crossing unprovable and so reported it as an artifact whatever the
    // geometry said. Ask instead for the strongest evidence the zone COULD
    // carry: three samples where there's room, all of them where there isn't.
    // …and it is the ZONE's capacity that sets the bar, not the ring's. Scaling
    // it to how many samples the ring itself happens to occupy inverts the
    // test: a polygon appearing at ONE sample of a 100-yd zone would need one
    // straddle to approve the whole thing, while the other 99 yd could be pure
    // flanking — the artifact this is built to catch.
    for (const z of zones.filter((z) => z.side === 'cross')) {
      const zoneSamples = Math.max(1, Math.round((z.to - z.from) / STEP_YD))
      const need = Math.max(1, Math.min(3, zoneSamples))
      const culprits: string[] = []
      let best: { label: string; spans: number[]; } | null = null
      const sources: { label: string; hits: Map<number, number[]> }[] = hazardRings
        .filter((r) => r.kind === z.kind)
        .map((r) => ({ label: `${r.type}/${r.id}`, hits: ringHits.get(r)! }))
      if (z.kind === 'ocean' && oceanHits.size) sources.push({ label: 'coastline', hits: oceanHits })
      for (const s of sources) {
        const inSpan = [...s.hits.keys()].filter((a) => a >= z.from && a < z.to)
        if (!inSpan.length) continue
        const offs = inSpan.flatMap((a) => s.hits.get(a)!)
        const spans = inSpan.filter((a) => straddles(s.hits.get(a)!)).sort((a, b) => a - b)
        if (spans.length >= need && spans.length > (best?.spans.length ?? 0)) best = { label: s.label, spans }
        culprits.push(
          `${s.label} (${Math.min(...offs)}..${Math.max(...offs)}${spans.length ? `, spans ${spans.length}/${zoneSamples}` : ''})`,
        )
      }
      // No single polygon spanning is NOT the same as nothing spanning. The
      // `side` rule only calls a band `cross` where the hazard is laterally
      // continuous, and OSM often draws one hazard as several touching
      // polygons — so check the union before crying artifact, or the tool
      // condemns real crossings (whistling-straits:18 is drawn as five).
      const unionHits = new Map<number, number[]>()
      for (const s of sources)
        for (const [a, offs] of s.hits) unionHits.set(a, [...(unionHits.get(a) ?? []), ...offs])
      const unionSpans = [...unionHits.keys()]
        .filter((a) => a >= z.from && a < z.to && straddles([...new Set(unionHits.get(a)!)].sort((x, y) => x - y)))
        .sort((a, b) => a - b)
      const greenStart = isFinite(greenLo) ? greenLo : length - greenDepth
      const intoGreen = z.to > greenStart ? '  INTO THE GREEN' : ''
      const none = z.kind === 'ocean' && !coast.length ? 'no coastline in the corridor' : 'none'
      let verdict: string
      if (!best && unionSpans.length >= need) {
        verdict =
          `TOUCHING POLYGONS — no single one spans, but together they cross continuously at ` +
          `${unionSpans[0]}-${unionSpans[unionSpans.length - 1] + STEP_YD} ` +
          `(${unionSpans.length} of ${zoneSamples} zone samples): ${culprits.join(' + ')}`
      } else if (!best) {
        verdict = `ARTIFACT (nothing spans the line) — ${culprits.join(' + ') || none}`
      } else {
        const lo = best.spans[0]
        const hi = best.spans[best.spans.length - 1] + STEP_YD
        const where = `${best.label} spans ${lo}-${hi} (${best.spans.length} of ${zoneSamples} zone samples)`
        // A long zone carried by a short genuine crossing is the halfway case:
        // something really is across the line, but most of this zone isn't it.
        verdict = best.spans.length * 2 >= zoneSamples ? `REAL CARRY — ${where}` : `PARTIAL — ${where}; the rest is flanking`
      }
      console.log(
        `  ${z.id.padEnd(4)} ${z.kind.padEnd(7)} ${String(z.from).padStart(4)}-${String(z.to).padEnd(4)}  ${verdict}${intoGreen}`,
      )
    }
    return
  }

  const bend = bendProfile(center, cum)
  const bendMax = bend.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0)

  const layout = {
    slug,
    holeRef: holeNo,
    source: 'osm',
    length,
    zones,
    fairwayFrom: Math.round(length * 0.35),
    fairwayTo: length - Math.round(greenDepth / 2) - 2,
    greenDepth: Math.round(greenDepth),
    // only worth persisting when the hole actually bends (a few yards of wander
    // is projection noise on a "straight" hole — leave it off and it renders straight)
    ...(Math.abs(bendMax) >= 8 ? { bend } : {}),
  }

  if (flags.includes('--json')) {
    console.log(JSON.stringify(layout, null, 2))
    return
  }

  // human-readable report
  const fmtZones = (zs: { kind: string; from: number; to: number; side: string }[]) =>
    zs.map((z) => `  ${z.kind.padEnd(9)} ${String(z.from).padStart(4)}–${String(z.to).padEnd(4)} yd  ${z.side}`).join('\n')

  console.error('')
  console.log(`# ${geo.name} — hole ${holeNo}  (OSM)`)
  console.log(`length: ${length} yd   greenDepth: ${layout.greenDepth} yd   fairway: ${layout.fairwayFrom}–${layout.fairwayTo} yd`)
  console.log(`zones (${zones.length}):`)
  console.log(fmtZones(zones))
  if (Math.abs(bendMax) >= 8) {
    const cornerFrac = bend.indexOf(bendMax) / BEND_SAMPLES
    console.log(
      `bend: dogleg ${bendMax > 0 ? 'RIGHT' : 'LEFT'} — bows ${bendMax > 0 ? '+' : ''}${bendMax} yd golfer-${bendMax > 0 ? 'left' : 'right'} of the chord (the bulge is OPPOSITE the turn) near ${Math.round(cornerFrac * length)} yd — [${bend.join(', ')}]`,
    )
  } else {
    console.log(`bend: straight (max ${bendMax} yd, not persisted)`)
  }

  // side-by-side with the current procedural layout the game ships today
  if (flags.includes('--compare')) {
    const { buildLayout } = await import('../src/engine/layout.ts')
    // courseBySlug spans the whole library — rotation, par-3 shorts, and guest
    // courses alike — so a course outside the daily walk still compares.
    const { courseBySlug } = await import('../src/engine/courses.ts')
    const course = courseBySlug(geo.engineSlug)
    const spec = course?.holes[holeNo - 1]
    if (!spec) {
      console.error(`\n(no engine hole for ${geo.engineSlug} #${holeNo} to compare)`)
      return
    }
    const proc = buildLayout(geo.engineSlug, spec)
    console.log(`\n# ${geo.name} — hole ${holeNo}  (PROCEDURAL, shipping today)`)
    console.log(`length: ${proc.length} yd   greenDepth: ${proc.greenDepth} yd   fairway: ${proc.fairwayFrom}–${proc.fairwayTo} yd`)
    console.log(`zones (${proc.zones.length}):`)
    console.log(fmtZones(proc.zones))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
