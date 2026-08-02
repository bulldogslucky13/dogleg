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
// The dogleg flags in courses.ts are corrected on ten holes to match the real
// centrelines. That is cosmetic for Pine Valley itself — OSM_BEND overrides the
// flag on the map, and layout.ts reads it only for procedural holes, which this
// course no longer has — so it is not what earns the bump; the card and the
// geometry are.
export const ENGINE_VERSION = 14
