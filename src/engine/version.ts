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
 * same seed + decisions come out differently. Pure additions (new courses,
 * new UI, new fields the replay ignores) don't need a bump. The deploy
 * pipeline already redeploys the function on every push to main, so both
 * sides pick up the new number together; only clients holding a stale bundle
 * see the handshake fail, which is exactly the point.
 */
export const ENGINE_VERSION = 1
