/**
 * Clubhouse names — the one grammar, and the one availability rule.
 *
 * There are three doors a name can come through (submit-round posting a first
 * card, claim-name from the trophy card, link-account signing in), and the
 * rule has to read the same through all three or the boards end up with names
 * one door allows and another refuses. Both halves live here.
 *
 * THE RULE (see the long note in supabase/schema.sql): names are shared by
 * default. Two anonymous players may both be "Jacob". A name becomes
 * unavailable only once a player who has LINKED AN EMAIL ACCOUNT holds it,
 * because an account is a recoverable claim and reserving a name is what it
 * is for. Anonymous rows that already share a reserved name keep it; they
 * just stop being joined by new ones.
 *
 * The rule is enforced in layers (see the long note in schema.sql).
 * `checkName` below is the courtesy layer everywhere — a pre-flight read that
 * turns a collision into a clean, specific error before any write is
 * attempted, but on its own is check-then-act, not a guarantee. The real
 * guarantee is `pg_advisory_xact_lock(hashtext(lower(name)))`, taken by every
 * writer of `name` right before it checks-and-writes: submit-round's and
 * claim-name's anonymous claims via `claimName` below
 * (`claim_name_if_free`), and link-account's three writers via their own
 * locked RPCs (`reserve_name_and_link`, `attach_account`,
 * `create_linked_player`). The lock is what makes an anonymous claim and a
 * concurrent linked reservation for the same name actually wait on each
 * other — `players_name_reserved_ci` (the partial unique index over linked
 * rows) still exists and still fires on a genuine conflict, but a plain
 * index can't serialize a writer that never sets `user_id` against one that
 * does, which is exactly the anonymous side of this race. `isNameConflict`
 * below tells that index's 23505 apart from an ordinary `user_id` collision
 * for the writers that could hit either.
 */

/** 2-18 chars, opens on a letter or digit. Identical in all three doors. */
export const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'_-]{1,17}$/u

/** What a player is told when an account holds the name they typed. */
export const NAME_TAKEN = 'that name belongs to a synced player — try another'

/** What they are told when the reservation check itself could not be run. */
export const NAME_CHECK_FAILED = 'could not check that name — try again'

export type NameCheck = 'free' | 'reserved' | 'unknown'

/**
 * Is this name reserved by an email-linked player?
 *
 * Delegates to the `name_reserved` RPC rather than filtering here: the client
 * builder has no case-insensitive equality operator, only `ilike` — and `_`
 * is legal in a clubhouse name AND a LIKE wildcard, so an `ilike` check would
 * quietly treat "de_bilzan" as a match for "debilzan". The RPC compares
 * `lower(name) = lower(btrim(...))`, which is exactly what the writers do.
 *
 * Returns 'unknown' rather than throwing, and every caller must FAIL CLOSED on
 * it. Schema is applied before functions deploy (deploy.yml), so the RPC can
 * never be missing on a live database — an 'unknown' is a transient fault, and
 * a retryable "try again" is the right answer. Failing open would hand out a
 * reserved name on a blip, and names are permanent.
 */
export async function checkName(
  // deno-lint-ignore no-explicit-any
  service: any,
  name: string,
): Promise<NameCheck> {
  const { data, error } = await service.rpc('name_reserved', { p_name: name })
  if (error) return 'unknown'
  return data === true ? 'reserved' : 'free'
}

/** The name of the schema.sql index that is the actual enforcement — see the
 * two-layer note above. Every writer that can hit BOTH a name conflict and a
 * `user_id` conflict on the same statement needs this to tell them apart. */
const RESERVED_INDEX = 'players_name_reserved_ci'

/**
 * Did this 23505 come from the reserved-name index specifically, and not
 * from some other unique constraint (players.user_id is the only other one
 * in play) that happens to share the same error code?
 *
 * This is what makes the two-layer enforcement safe to race against: two
 * requests can both pass `checkName` (courtesy, two round trips before the
 * write) and then both attempt to write the same not-yet-reserved name — the
 * loser's write hits `players_name_reserved_ci` and must be told apart from
 * an ordinary "your account is already linked to a different row" failure,
 * or the wrong error copy goes to the player.
 */
export function isNameConflict(error: { code?: string; message?: string }): boolean {
  return error.code === '23505' && (error.message ?? '').includes(RESERVED_INDEX)
}

export type ClaimOutcome =
  | { outcome: 'claimed'; name: string }
  | { outcome: 'reserved' }
  | { outcome: 'raced'; name: string }
  | { outcome: 'unknown' }

/**
 * Atomically claim `name` onto a row already known to be nameless — callers
 * must have already validated the row's identity (id + secret) and its
 * current null name via a prior read; this only takes the id.
 *
 * One RPC call, one Postgres statement (`claim_name_if_free` in schema.sql),
 * which takes `pg_advisory_xact_lock(hashtext(lower(name)))` before checking
 * or writing anything — the actual fix for the gap a separate `checkName()`
 * read before a separate guarded write leaves open: two transactions can each
 * take a snapshot showing a name free before either commits, and no
 * single-statement check closes that on its own. The lock makes this call
 * and link-account's locked writers (same key) wait on each other instead.
 *
 * The function always returns the row's state AFTER the attempt, never
 * nothing, so a single round trip distinguishes every outcome a caller needs:
 * `claimed` (this call set it), `raced` (a DIFFERENT door named this exact
 * row first — an ordinary race on the row, not a reservation — the caller
 * should use the name that won), or `reserved` (the write was blocked because
 * `name` belongs to a linked account).
 */
export async function claimName(
  // deno-lint-ignore no-explicit-any
  service: any,
  id: string,
  name: string,
): Promise<ClaimOutcome> {
  const { data, error } = await service.rpc('claim_name_if_free', { p_id: id, p_name: name })
  if (error) return { outcome: 'unknown' }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { outcome: 'unknown' }
  if (row.claimed && row.name) return { outcome: 'claimed', name: row.name }
  if (row.name) return { outcome: 'raced', name: row.name }
  return { outcome: 'reserved' }
}
