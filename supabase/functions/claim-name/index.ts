// DogLeg claim-name edge function (Deno).
//
// Claims a clubhouse name onto an existing anonymous player row, given that
// row's own credentials — WITHOUT a finished round.
//
// Until this existed, a name could only be claimed two ways: submit-round
// (needs a complete round) or link-account (needs an email session). That
// welded "become a named player" onto "post a card", which is fine at the
// end of a round and useless anywhere else — in particular the moment a
// player makes an ace or an albatross, which lands MID-round and is the
// single most motivated instant the game produces. This function is the
// third door, and it is deliberately the narrowest of the three: it names a
// row and does nothing else.
//
// It cannot mint an identity (unlike submit-round's legacy path) — the
// caller must already hold a minted id and its secret, so the name always
// lands on the row the player's daily dice are already salted for. It cannot
// rename either: the update is guarded on `name is null`, so a claimed name
// is permanent through this door exactly as it is through the other two.
//
// Sybil surface: one minted identity buys exactly one name, and minting is
// itself capped per IP per day (mint-player). So this adds no new headroom
// for name-squatting beyond what submit-round already allowed — it only
// removes the requirement to play 18 holes first.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

// identical to submit-round / link-account — one grammar for clubhouse names
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'_-]{1,17}$/u

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let body: any
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const { playerId, playerSecret } = body ?? {}
  const name = typeof body?.name === 'string' ? body.name.trim() : undefined

  if (!playerId || !playerSecret) return json(400, { error: 'unknown player' })
  if (!name || !NAME_RE.test(name)) return json(400, { error: 'pick a clubhouse name (2-18 letters/numbers)' })

  const { data: player } = await supabase.from('players').select('id, name, secret').eq('id', playerId).single()
  if (!player || player.secret !== playerSecret) return json(403, { error: 'unknown player' })

  // Already named — return the identity rather than an error. The claim card
  // can be tapped twice on a flaky connection, and the second tap must not
  // read as a failure when the first one actually landed.
  if (player.name) return json(200, { player: { id: player.id, name: player.name } })

  // `is('name', null)` is the race guard: two devices claiming onto the same
  // row at once, and only the first update matches. A miss is NOT an error —
  // PostgREST reports a zero-row update as a success — so the loser has to be
  // told apart from the winner by asking for the row back. Without the
  // `select`, both taps would be answered with their own name while the
  // database kept only one, and the losing device would persist a name it
  // does not own.
  const { data: claimed, error } = await supabase
    .from('players')
    .update({ name })
    .eq('id', player.id)
    .is('name', null)
    .select('id, name')
    .maybeSingle()
  if (error) {
    return json(error.code === '23505' ? 409 : 500, {
      error: error.code === '23505' ? 'that name is taken' : 'could not claim that name',
    })
  }
  if (claimed?.name) return json(200, { player: { id: claimed.id, name: claimed.name } })

  // Zero rows changed: someone named this row between the read above and the
  // update. Answer with the name that actually landed, exactly as the
  // already-named path does — the caller wanted an identity with a name on
  // it, and it has one.
  const { data: winner } = await supabase.from('players').select('id, name').eq('id', player.id).single()
  if (winner?.name) return json(200, { player: { id: winner.id, name: winner.name } })
  return json(500, { error: 'could not claim that name' })
})
