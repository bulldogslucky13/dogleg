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
// v2 = #65 (Harbour Town scorecard + geometry). v3 = this change: the greenside
// odds weight, a fresh generation stacked on top of #65.
export const ENGINE_VERSION = 3
