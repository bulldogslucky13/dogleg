// DogLeg link-account edge function (Deno).
//
// Ties an authenticated email account (magic link) to a player identity:
// - device player + fresh account → attach the player to the account
// - account already has a player  → return that identity (new-device adoption)
// - neither + a name              → create the player pre-linked
//
// The caller must present a valid user access token; player writes still
// happen with the service role.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkName, isNameConflict, NAME_CHECK_FAILED, NAME_RE, NAME_TAKEN } from '../_shared/names.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // who is signing in?
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const { data: userData, error: userErr } = await service.auth.getUser(token)
  if (userErr || !userData?.user) return json(401, { error: 'sign in first' })
  const uid = userData.user.id

  let body: any
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const { playerId, playerSecret } = body ?? {}
  const name = typeof body?.name === 'string' ? body.name.trim() : undefined

  // the account's existing player always wins — that IS the synced identity
  const { data: accountPlayer } = await service
    .from('players')
    .select('id, secret, name')
    .eq('user_id', uid)
    .maybeSingle()
  if (accountPlayer) {
    return json(200, { status: 'account', player: accountPlayer })
  }

  /**
   * Attach this account to a player row that was read as unlinked.
   *
   * `user_id` is unique across rows, which stops one account holding two
   * players — it does NOT stop a second account overwriting the column on the
   * same row. Reaching here means the lookup above found no player for this
   * account, so the row must still be unlinked when the write lands.
   * attach_account (schema.sql) is the atomic form of the old
   * `.update({user_id}).is('user_id', null)`: it takes the SAME
   * pg_advisory_xact_lock(name) every other name-touching writer takes,
   * keyed on this row's OWN existing name, before writing — a lock, not just
   * the guard column, because a concurrent ANONYMOUS claim for that same
   * name never sets user_id and so never trips players_name_reserved_ci on
   * its own; only the lock makes the two sides wait on each other. A miss is
   * reported as success by PostgREST, so the row has to come back for a miss
   * to be visible at all.
   *
   * This is the one write in the file that never calls `checkName` first —
   * intentionally, because a player syncing the name they ALREADY hold must
   * always be able to (see the name guard below). But it CAN still 23505 on
   * `players_name_reserved_ci` — not on this row's own name changing (it
   * isn't), but on `user_id` going non-null while the name stays what it
   * already was: if two anonymous rows independently landed on the same
   * shared name before either synced, and the other one linked first, this
   * row's link now collides with an account that already reserved that name.
   * `isNameConflict` is what tells that apart from an ordinary `user_id` race
   * so the right error reaches the player.
   */
  const attach = async (id: string): Promise<'linked' | 'taken' | 'nametaken' | 'error'> => {
    const { data, error } = await service.rpc('attach_account', { p_id: id, p_uid: uid })
    if (error) return isNameConflict(error) ? 'nametaken' : 'error'
    const row = Array.isArray(data) ? data[0] : data
    if (row?.user_id) return 'linked'
    // no row changed: another account signed in against this same identity
    // between the read and the write, and the first one to land keeps it
    const { data: check } = await service.from('players').select('user_id').eq('id', id).single()
    if (!check) return 'error'
    return check.user_id === uid ? 'linked' : 'taken'
  }
  const attachFailure = (outcome: 'taken' | 'nametaken' | 'error') =>
    outcome === 'nametaken'
      ? json(409, { error: NAME_TAKEN })
      : outcome === 'taken'
        ? json(409, { error: 'that name is synced to another email' })
        : json(500, { error: 'could not link' })

  // fresh account + this device's player → attach it
  if (playerId && playerSecret) {
    const { data: p } = await service.from('players').select('id, secret, name, user_id').eq('id', playerId).single()
    if (!p || p.secret !== playerSecret) return json(403, { error: 'unknown player' })
    if (p.user_id && p.user_id !== uid) return json(409, { error: 'that name is synced to another email' })
    if (!p.name) {
      // an anonymous minted identity: it must be named to sync, and the name
      // must land on THIS row — the id the player's daily dice are salted
      // for — never a fresh one, or their in-flight round would stop
      // belonging to them
      if (!name) return json(200, { status: 'needsname' })
      if (!NAME_RE.test(name)) return json(400, { error: 'pick a clubhouse name (2-18 letters/numbers)' })
      // This row is about to become an ACCOUNT, so the name it takes has to be
      // free of other accounts (see _shared/names.ts). checkName here is the
      // courtesy layer only — it catches the common case with a clean error
      // before any write. The actual guarantee is reserve_name_and_link
      // (schema.sql): the atomic form of the old direct update, now behind
      // pg_advisory_xact_lock(name) — the same lock claim_name_if_free takes,
      // so this write and a concurrent anonymous claim for the same name
      // wait on each other instead of both reading "free" from a stale
      // snapshot. isNameConflict still tells a genuine 23505 apart from an
      // ordinary user_id collision.
      const availability = await checkName(service, name)
      if (availability === 'reserved') return json(409, { error: NAME_TAKEN })
      if (availability === 'unknown') return json(503, { error: NAME_CHECK_FAILED })
      // A MISS is not an error — PostgREST reports a zero-row update as a
      // success. This one call writes the name AND the link, so a silent
      // miss dropped BOTH: the caller was told "linked" while the account
      // stayed unlinked. Ask for the row back so a miss can be told from a hit.
      const { data: linkedRows, error } = await service.rpc('reserve_name_and_link', {
        p_id: p.id,
        p_uid: uid,
        p_name: name,
      })
      if (error) {
        return json(error.code === '23505' ? 409 : 500, {
          error: error.code !== '23505' ? 'could not link' : isNameConflict(error) ? NAME_TAKEN : 'that name is synced to another email',
        })
      }
      const linked = Array.isArray(linkedRows) ? linkedRows[0] : linkedRows
      if (linked) return json(200, { status: 'linked', player: linked })

      // No row changed, so something moved between the read and the write —
      // either another door (claim-name, submit-round, a second tab) named
      // this id, or another account linked it. Re-read to find out which.
      const { data: row } = await service.from('players').select('id, secret, name, user_id').eq('id', p.id).single()
      if (!row) return json(500, { error: 'could not link' })
      if (row.user_id && row.user_id !== uid) return json(409, { error: 'that name is synced to another email' })
      // a name landed first, and only the name lost — the link is still what
      // this request is for, so attach the account to the name that took
      if (!row.name) return json(500, { error: 'could not link' })
      const outcome = await attach(p.id)
      if (outcome !== 'linked') return attachFailure(outcome)
      return json(200, { status: 'linked', player: { id: row.id, secret: row.secret, name: row.name } })
    }
    const outcome = await attach(p.id)
    if (outcome !== 'linked') return attachFailure(outcome)
    return json(200, { status: 'linked', player: { id: p.id, secret: p.secret, name: p.name } })
  }

  // fresh account, fresh device → create a named player pre-linked
  if (name) {
    if (!NAME_RE.test(name)) return json(400, { error: 'pick a clubhouse name (2-18 letters/numbers)' })
    const availability = await checkName(service, name)
    if (availability === 'reserved') return json(409, { error: NAME_TAKEN })
    if (availability === 'unknown') return json(503, { error: NAME_CHECK_FAILED })
    // create_linked_player (schema.sql): atomic insert behind the same
    // pg_advisory_xact_lock(name) as every other writer here — this row is
    // brand new, but the name it's born with is exactly as contestable as
    // any other write in this file.
    const { data: createdRows, error } = await service.rpc('create_linked_player', { p_uid: uid, p_name: name })
    if (error) {
      return json(error.code === '23505' ? 409 : 500, {
        error: error.code !== '23505' ? 'could not create player' : isNameConflict(error) ? NAME_TAKEN : 'that name is synced to another email',
      })
    }
    const data = Array.isArray(createdRows) ? createdRows[0] : createdRows
    return json(200, { status: 'created', player: data })
  }

  return json(200, { status: 'none' })
})
