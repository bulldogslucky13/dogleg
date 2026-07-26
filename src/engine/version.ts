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
 * with courses: adding to or reordering the daily COURSES rotation changes
 * which slug `courseForPuzzle` maps a date to (src/engine/daily.ts), which
 * breaks replay of existing daily seeds — that's a bump, or better, a gated
 * cutover per the conditions-versioning note in daily.ts. Only a course
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
export const ENGINE_VERSION = 8
