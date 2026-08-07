/**
 * Engine generation number — the client/referee handshake.
 *
 * The client bundle sends this with every submission; the submit-round edge
 * function compares it against the copy bundled into its own engine.mjs
 * BEFORE replaying. A mismatch means the round was played on a different
 * engine generation than the referee would replay it with, so dice resolution
 * could diverge — the function rejects with code "stale_client" ("A new
 * version of DogLeg is live — refresh to post scores") instead of a
 * confusing replay error like "round left unfinished".
 *
 * BUMP THIS whenever a change alters odds, shot resolution, layout geometry,
 * conditions derivation, or anything else that could make a replay of the
 * same seed + decisions come out differently. Pure additions the replay
 * ignores (new UI, new optional payload fields) don't need a bump. Careful
 * with courses: adding to or reordering the daily rotation changes which
 * slug `courseForPuzzle` maps a date to (src/engine/daily.ts) — do it ONLY
 * via a new future-dated ROTATION_ERAS entry (never by editing a shipped
 * era's array), and bump this for the cutover day forward. Only a course
 * reachable purely by practice seeds (which name their slug) is a pure
 * addition. The deploy
 * pipeline already redeploys the function on every push to main, so both
 * sides pick up the new number together; only clients holding a stale bundle
 * see the handshake fail, which is exactly the point.
 */
// v2 = #65 (Harbour Town scorecard + geometry). v3 = #71 (greenside odds
// weight). v4 = Carnoustie real geometry (OSM import + hand-laid burns).
// v5 = Royal Portrush real geometry, the Dunluce stroke-index fix (15 of 18
// SIs were wrong, and SI feeds pressure() in the odds), and the course-level
// rough-severity dial (CourseSpec.rough) with Portrush tagged 'penal'. One
// version covers all three: v5 has never been deployed, so they ship together.
// v6 = Cypress Point real geometry (OSM import, three imagery-verified hand
// fixes) and its stroke-index fix — 16 of 18 SIs were wrong, and SI feeds
// pressure() in the odds, so both halves change what a seed replays into.
// v7 = the bail-out par 3 (`Bailout` in types.ts): a par 3 that doglegs round
// its hazard starts in the `second` stage, so safe/normal lay up and only
// aggressive goes at the flag. Cypress 16 is the first, re-laid along the line
// it is actually played. Changes the stage machine, the odds and the geometry —
// every part of what a seed replays into.
// v8 = Whistling Straits real geometry (OSM import, tee-end shifted to the
// BLACK card, plus the hand-restored Lake Michigan on 17) and its scorecard
// fix: the shipped ~7497 tuple moves to the club's 7790 BLACK card, changing
// 16 of 18 yardages and 16 of 18 stroke indices — and SI feeds pressure() in
// the odds, so the card half changes replays just as much as the geometry.
// v8 also carries the safe-lay-up fix in odds.ts (MIN_LAYUP_ADVANCE): the
// stay-short-of-a-crossing rule could collapse a lay-up to a 13-yd nudge, or
// -5 yd on harbour-town:15, so it now carries crossings too close to lay up
// behind. That changes lay-up landing spots on Harbour Town and Oakmont as
// well as Whistling Straits — QA on the new course surfaced it, but the bug
// was already shipped. One version covers both: v8 has never been deployed,
// so they go out together.
// v9 = TPC Potomac real geometry (OSM import off relation 357652, every hole
// shifted to the club's GOLD card). Pure geometry: the shipped tuple already
// matched the card on par and stroke index for all 18, so nothing in the odds
// inputs moved — but the layout a seed replays into does, on every hole.
// v10 = Seminole real geometry (OSM way 125329140, every hole shifted to the
// club's GOLD card). Pure geometry like Potomac — the shipped tuple already
// matched the card on par and stroke index for all 18 — but the layout a seed
// replays into moves on every hole. v10 also carries an importer `side` fix
// that changes what future imports produce: a band is only a `cross` where the
// hazard is laterally CONTINUOUS across the playing line, so sand flanking
// both sides of a clean fairway no longer reads as a carry you can drive
// between. That reshapes only newly imported geometry (committed courses are
// static data and untouched), but Seminole is the first course to ship from
// it, so the two go out together.
// v11 = Kings Creek CC (guest course, Kemp TX) + the DAILY_OVERRIDES table:
// 2026-08-01's daily maps to the guest course instead of the rotation walk,
// which changes what that day's seeds replay into (they don't exist yet — the
// override ships before the day does). The rotation array itself is untouched;
// this is the gated-cutover shape the note above asks for, expressed as an
// explicit per-day table.
// v12 = Torrey Pines South real geometry (OSM way 35679036, every hole shifted
// to the club's BLACK card) plus that card's stroke index, which disagreed
// with the shipped tuple on 13 of 18 holes — and SI feeds pressure() in the
// odds, so the card half changes replays as much as the geometry. Two parts of
// the geometry are hand-work rather than raw import, both documented at the
// block in geometry.ts: hole 6 is remapped through arc -> straight-line rather
// than shifted (its centreline wanders 22 yd long, and a shift would have
// moved the driving-zone sand ~25 yd off measured truth), and the canyons on
// 3/4/6/13/17 are hand-authored `deeprough` from USGS NED 10m terrain
// transects, because OSM has no scrub or wood polygon anywhere on the
// property and the import read five canyon flanks as open ground.
// v13 = Pacific Dunes real geometry (OSM, every hole shifted to the club's
// BLACK card). Pure geometry like Potomac and Seminole — the shipped tuple
// already matched the card on par, yardage AND stroke index for all 18 — but
// the layout a seed replays into moves on every hole. Two parts are hand-work,
// both documented at the block in geometry.ts: the bluff on 4/11/13 is
// hand-authored `ocean` from USGS NED 10m transects (the coastline way is
// drawn at the WATERLINE, 103-210 yd out across a beach, so the course named
// for the Pacific imported with zero water on all 18), and two `cross` bands
// that were single polygons clipping the centreline by 2 yd are folded into
// their flanks. v13 also carries an importer greenDepth fix that changes what
// future imports produce: a centreline drawn tee->PIN was measuring only the
// FRONT HALF of its green, so the clamp floored greenDepth at 20 — shallower
// than the procedural default — and greenDepth sets `fairwayTo` and feeds
// isGreenside() in the odds. Pacific Dunes is the first course to ship from
// the fixed importer, so the two go out together.
// v13 ALSO carries the re-measure of every previously imported course against
// that fixed importer — 199 holes across 15 courses, greenDepth only (zones,
// length and fairwayFrom are untouched). It is one version, not two, because
// v13 has never been deployed: the referee has never seen it, so the geometry
// and the re-measure ship as one generation, the same call made for v5, v8 and
// v10.
// Scope, stated precisely because the first draft of this note overstated it:
// for an IMPORTED hole `fairwayTo` is passed straight through to the layout and
// read only by the map (layout.ts uses it to place zones on PROCEDURAL holes
// only), so it is cosmetic here. The one path from greenDepth into what a seed
// replays into is isGreenside() -> the `sideW` weight in odds.ts, which touches
// BUNKERS whose end lands within 8 yd of the green front. So the odds move on
// the holes where a bunker changes greenside classification and nowhere else,
// and the measured effect is small — every course's Play Rating holds its
// integer value and PLAY_INDEX drifts by at most 0.006. Small is not zero, and
// a replay that resolves differently is a bump either way.
// The re-measure also fixed a second, older artifact at source. greenDepth took
// min/max across EVERY green the centreline touched, so cypress-point:1 — whose
// line clips a NEIGHBOURING green at 28-54 yd before reaching its own at 400 —
// spanned 402 yd and pinned the 45 clamp. It now keeps only the last contiguous
// run, the green the hole is actually played to. That is the artifact the README
// says to suspect at exactly 45; the other seven holes at the clamp (carnoustie
// 2/16, oakmont 3/4/9/14/15) were each checked and are single greens that really
// do run 45+ yd along the line of play.
// v14 = Pine Valley real geometry (OSM way 820204638, every hole landed on the
// club's BACK card) plus that card's yardage AND stroke index. The shipped
// tuple was the club's historic ~6,765 card, so 13 of 18 yardages and 16 of 18
// stroke indices move — and SI feeds pressure() in the odds, so the card half
// changes replays as much as the geometry does. Hole 7 goes from SI 5 to the
// card's No. 1, hole 5 from SI 1 to 11.
// Four parts are hand-work rather than raw import, all documented at the block
// in geometry.ts: holes 6 and 17 are re-imported through `--shift` off forward
// pads (confirmed by ProVisualizer's tee sitting 28 and 67 yd behind the
// centreline start); hole 1 is remapped smoothed-arc -> RAW-arc because Chaikin
// rounds 24 yd off a 3-point line around a corner that is genuinely ~117 yd off
// the chord; holes 13 and 16 are remapped arc -> straight-line-from-tee, the
// torrey-pines-south:6 call, their centrelines wandering 21 and 15 yd long; and
// nine cross bands are folded, dropped or trimmed (edge slivers of one waste,
// two tee chutes, two front bunkers overrunning the green edge, and three
// laterals with mapped fairway beside them).
// The dogleg flags in courses.ts are re-derived from the real centrelines
// against the same >=20 yd threshold the caddy chip uses, so flag and chip
// cannot disagree; eight holes change. That is cosmetic for Pine Valley itself
// — OSM_BEND overrides the flag on the map, and layout.ts reads it only for
// procedural holes, which this course no longer has — so it is not what earns
// the bump; the card and the geometry are.
// v15 = Bandon Dunes real geometry (OSM way 362513477, the shared resort
// polygon it splits with Pacific Dunes and Old Macdonald; eight holes shifted
// to the card off forward pads). Near-pure geometry: the shipped tuple already
// matched BlueGolf's TOURNAMENT card on par, yardage and stroke index for all
// 18, so no SI moves and the odds inputs are untouched — but the layout a seed
// replays into moves on every hole.
// ONE yardage does move, and it is a card bug rather than a tee-set choice:
// hole 16 shipped BlueGolf's 412 against the club's own 363, ProVisualizer's
// measured 358 and the OSM tee->green line's 347. Three sources against one, 50
// yd outside any tee-set variance, so the tuple goes to 363 and the hole is
// shifted +16 instead of the +65 the bad number implied — which would have put
// its four bunkers ~49 yd behind where they sit. Holes 1 and 5 have 28-35 yd
// spreads across the same four sources with no majority; those keep their
// shipped values rather than inventing a fourth answer. All of it is laid out
// in the YARDAGE CONFLICT note at the block in geometry.ts.
// Two parts are hand-work, both documented there: the bluff on 5/6/16 is
// hand-authored `ocean` from USGS NED 10m transects (same cause as Pacific
// Dunes — the coastline way sits at the WATERLINE 113-158 yd out across a
// beach, so the course on the Pacific imported with zero water on all 18), and
// hole 12's greenside pot is hand-added after the 6-yd rake stepped clean over
// a bunker 4 yd off the line and left the hole with no zones at all. The
// measurement declined more than it authored: 11, 15 and 17 all carry
// `hazard: 'ocean'` and have no rim inside the corridor, 17 twice tripping the
// drop test on a dune hollow that climbs back up.
// Hole 1 is remapped arc -> straight-line rather than shifted (it imports 21 yd
// LONG off a correct pair of endpoints — the torrey-pines-south:6 call), and
// hole 10's lone `cross` is re-sided to left, being one ~12-yd bunker clipping
// the line rather than a carry.
// The dogleg flags in courses.ts are re-derived from the real centrelines at
// the caddy chip's >=20 yd bar; eleven of eighteen were wrong, two of them
// pointing the opposite way. Like Pine Valley that is cosmetic and not what
// earns the bump — the geometry and hole 16's yardage are.
// v16 = Muirfield real geometry (OSM way 101336384). Pure geometry: the
// shipped tuple already matched the club's WHITE card on par, yardage AND
// stroke index for all 18, so courses.ts is untouched — the bump is the zones.
// Ten holes are TRIMMED rather than shifted, the first course to need the
// negative half of --shift: OSM traced them from the championship pads (7089
// yd of centreline against the card's 6728), so the run behind the white tee
// is cut off the front instead of a missing one being prepended. Two sources
// agree the untrimmed start is the back pad — ProVisualizer's published tee is
// within 1-7 yd of it on 17 of 18, and its tee-to-pin distance tracks OSM
// rather than the card on exactly the ten holes trimmed — and 9 of the 10
// trims land within 12 yd of a mapped `golf=tee` (hole 15 is the exception and
// says so at its entry).
// Imported at rake 3, the first use of the per-course rake knob. This is the
// bandon-dunes:12 problem generalised: there, ONE bunker 4 yd off the line
// vanished under the 6-yd lateral rake and was hand-added back. Muirfield's
// ~150 revetted pots are small enough that the same gap swallowed greenside
// sand on 14 of 18 holes, which is too many to hand-fix and too many to leave
// — including both walls of the 13th, which the hole's own signature names.
// Also tightens `cross` for SAND only: a crossing must now span >=12 yd
// laterally, because a 3-yd pot sitting on the centreline satisfied "laterally
// continuous" while blocking three yards of a hundred-yard corridor, and
// `cross` means you must carry it. Water keeps the old rule — a burn crossing
// a fairway is narrow and IS a forced carry. Muirfield ends with zero cross
// zones, which is the links being honest: nothing here you can't run up to.
//
// v16 ALSO carries Quail Hollow (OSM way 877659537), imported in the same PR
// and sharing this one bump — both are geometry, neither has shipped, so a
// second generation would buy nothing. Notable for its CARD rather than the
// tooling: BlueGolf holds Quail Hollow only as its MEMBER course (par 72, the
// 1st played as a par 5), which is a different golf course from the one this
// game ships, so the house source is the wrong source here and the 2025 PGA
// Championship card (par 71 / 7,626) is used instead. The shipped par sequence
// and OSM's own par tags both match that card on all 18, which is what says
// the members' card is the outlier rather than us. Par is untouched; four
// yardages move and courses.ts reconciles them from the imported lengths.
// Ten holes shift and they go BOTH ways — 1 and 3 trim, the other eight
// prepend — because 82 tee pads are mapped over 18 holes and the mapper picked
// a different one per hole (the seminole pattern). Three hand-fixes: a dropped
// greenside bunker on 2, a water cross running 16 yd INTO the green on 17, and
// the creek on 18, which is a waterway LINESTRING and so never reaches the
// polygon rasterizer — the carnoustie mode, landing on the one hole whose
// signature promises "creek all down the left".
// Rake stays at the 6-yd default here, one course after Muirfield needed 3:
// not one of Quail Hollow's 74 bunkers is under 6 yd across (min 6.7, median
// 12.8). That contrast is the argument for the knob being per-course.
export const ENGINE_VERSION = 16
