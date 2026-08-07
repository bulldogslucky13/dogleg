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
  return `[out:json][timeout:180];
(
  way["leisure"="golf_course"]["name"~"${geo.osmName}",i](around:${r},${lat},${lon});
  relation["leisure"="golf_course"]["name"~"${geo.osmName}",i](around:${r},${lat},${lon});
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

/** All outer rings of an element as lat/lon loops (ways: one; relations: each outer member). */
function elementRings(e: OsmElement): LatLon[][] {
  if (e.geometry && e.geometry.length >= 3) return [e.geometry]
  if (e.members) {
    return e.members
      .filter((m) => m.role !== 'inner' && m.geometry && m.geometry.length >= 3)
      .map((m) => m.geometry!)
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
  // so disambiguate first by hole NAME (osmHolePrefix), then by nearest center.
  const centerProj = projector(geo.center[0], geo.center[1])
  const c0 = centerProj({ lat: geo.center[0], lon: geo.center[1] })
  let candidates = els.filter(
    (e) => e.tags?.golf === 'hole' && String(e.tags.ref ?? '') === String(holeNo) && e.geometry,
  )
  if (candidates.length === 0) {
    const refs = [...new Set(els.filter((e) => e.tags?.golf === 'hole').map((e) => e.tags?.ref))].sort()
    console.error(`no golf=hole way with ref=${holeNo}. available refs: [${refs.join(', ')}]`)
    process.exit(2)
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
  type Ring = { kind: ZoneKind | 'green'; ring: Vec[]; id: number; type: OsmElement['type'] }
  const rings: Ring[] = []
  for (const e of els) {
    if (e === holeWay) continue
    if (geo.osmIgnore?.includes(e.id)) continue // mis-tagged for this course — see COURSE_GEO
    const k = classify(e.tags ?? {})
    if (!k || k === 'tee' || k === 'fairway' || k === 'hole') continue
    for (const loop of elementRings(e)) {
      const ring = loop.map(proj)
      // Keep a ring only if an EDGE of it comes near the line. A real hazard
      // borders the playing corridor; a course-spanning lake that the coarse
      // straight centreline merely clips through at a dogleg has all its edges
      // far away — that was the phantom "water crosses at 0 yds" on Sawgrass 2.
      let nearestEdge = Infinity
      for (const p of ring) {
        const { along, lateral } = projectToPolyline(center, cum, p)
        const al = toYards(along)
        if (al > -25 && al < length + 25) nearestEdge = Math.min(nearestEdge, toYards(Math.abs(lateral)))
      }
      if (nearestEdge < 48) rings.push({ kind: k, ring, id: e.id, type: e.type })
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
      .filter((r) => r.kind === 'green' && pointInRing(r.ring, p))
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
      if (rings.some((r) => r.kind === 'green' && greenKey(r) === targetKey && pointInRing(r.ring, q))) {
        greenHi = a
        continue
      }
      const other = rings.find((r) => r.kind === 'green' && pointInRing(r.ring, q))
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
  const ownsHazard = (ring: Vec[], kind: ZoneKind) => {
    let dT = Infinity
    let dOther = Infinity
    for (const v of ring) {
      for (const hl of holeLines) {
        const d = distToLine(hl, v)
        if (hl.isTarget) dT = Math.min(dT, d)
        else dOther = Math.min(dOther, d)
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
  const ownedRings = rings.filter((r) => r.kind === 'green' || ownsHazard(r.ring, r.kind))

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
      for (const { kind, ring } of ownedRings) {
        if (kind === 'green') continue
        if (pointInRing(ring, q)) {
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
          if (pointInRing(r.ring, q)) offs.push(off)
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
