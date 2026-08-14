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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'_-]{1,17}$/u

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
      // `is('name', null)` is the race guard, and a MISS is not an error —
      // PostgREST reports a zero-row update as a success. This write carries
      // the `user_id` as well as the name, so a silent miss dropped BOTH:
      // the caller was told "linked" while the account stayed unlinked. Ask
      // for the row back so a miss can be told from a hit.
      const { data: linked, error } = await service
        .from('players')
        .update({ user_id: uid, name })
        .eq('id', p.id)
        .is('name', null)
        .select('id, secret, name')
        .maybeSingle()
      if (error) {
        return json(error.code === '23505' ? 409 : 500, {
          error: error.code === '23505' ? 'that name is taken' : 'could not link',
        })
      }
      if (linked) return json(200, { status: 'linked', player: linked })

      // No row changed: another door (claim-name, submit-round, a second tab)
      // named this id first. Only the name lost the race — the link is still
      // what this request is for, so attach the account to the name that
      // actually took rather than reporting a link that never happened.
      const { data: named } = await service.from('players').select('id, secret, name, user_id').eq('id', p.id).single()
      if (!named?.name) return json(500, { error: 'could not link' })
      if (named.user_id && named.user_id !== uid) return json(409, { error: 'that name is synced to another email' })
      const { error: linkError } = await service.from('players').update({ user_id: uid }).eq('id', p.id)
      if (linkError) return json(500, { error: 'could not link' })
      return json(200, { status: 'linked', player: { id: named.id, secret: named.secret, name: named.name } })
    }
    const { error } = await service.from('players').update({ user_id: uid }).eq('id', p.id)
    if (error) return json(500, { error: 'could not link' })
    return json(200, { status: 'linked', player: { id: p.id, secret: p.secret, name: p.name } })
  }

  // fresh account, fresh device → create a named player pre-linked
  if (name) {
    if (!NAME_RE.test(name)) return json(400, { error: 'pick a clubhouse name (2-18 letters/numbers)' })
    const { data, error } = await service
      .from('players')
      .insert({ name, user_id: uid })
      .select('id, secret, name')
      .single()
    if (error) {
      return json(error.code === '23505' ? 409 : 500, {
        error: error.code === '23505' ? 'that name is taken' : 'could not create player',
      })
    }
    return json(200, { status: 'created', player: data })
  }

  return json(200, { status: 'none' })
})
