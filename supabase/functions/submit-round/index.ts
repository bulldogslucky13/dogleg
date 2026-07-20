// Dogleg submit-round edge function (Deno).
//
// Receives { seed, character, decisions, playerId?, playerSecret?, name? },
// REPLAYS the round with the real game engine (bundled as engine.mjs by
// `pnpm build:validator`), and writes the engine's score — never the client's
// claim. Creates the player on first submission (clubhouse-name identity).
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import { dailySalt, replayRound } from './engine.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'_-]{1,17}$/u

function utcDateKey(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, '0')}-${`${d.getUTCDate()}`.padStart(2, '0')}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  let body: any
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'bad json' })
  }

  const { seed, character, decisions, playerId, playerSecret } = body ?? {}
  const name = typeof body?.name === 'string' ? body.name.trim() : undefined
  if (typeof seed !== 'string' || seed.length > 120) return json(400, { error: 'bad seed' })
  if (character !== undefined && !['fairway', 'dart', 'greens'].includes(character)) {
    return json(400, { error: 'bad character' })
  }

  // ---- the referee: recompute the score from seed + decisions ----
  const replay = replayRound(seed, character, decisions)
  if (!replay.ok) return json(422, { error: `round rejected: ${replay.error}` })
  const info = replay.info

  // a daily must be for (about) today — UTC ±1 day covers every timezone
  if (info.mode === 'daily') {
    const allowed = [utcDateKey(-1), utcDateKey(0), utcDateKey(1)]
    if (!allowed.includes(info.dateKey!)) return json(422, { error: 'daily is not for today' })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ---- identify or create the player ----
  let player: { id: string; name: string; secret?: string }
  if (playerId && playerSecret) {
    const { data } = await supabase.from('players').select('id, name, secret').eq('id', playerId).single()
    if (!data || data.secret !== playerSecret) return json(403, { error: 'unknown player' })
    player = { id: data.id, name: data.name }
  } else {
    if (!name || !NAME_RE.test(name)) return json(400, { error: 'pick a clubhouse name (2-18 letters/numbers)' })
    const { data, error } = await supabase.from('players').insert({ name }).select('id, name, secret').single()
    if (error) {
      return json(error.code === '23505' ? 409 : 500, {
        error: error.code === '23505' ? 'that name is taken' : 'could not create player',
      })
    }
    player = { id: data.id, name: data.name, secret: data.secret }
  }

  // ---- the salt must be the one THIS player is entitled to ----
  // The salt reseeds every roll in the round, so a client free to choose it
  // could replay one decision list under thousands of salts offline and post
  // the luckiest card — a genuine replay the referee would happily certify.
  // Exactly one salt is valid per player per day, and we derive it here
  // rather than trusting the seed. An absent salt is fine: that is the single
  // canonical daily seed with no freedom to grind, which is what players
  // without an identity (and rounds started before they claimed a name) play.
  if (info.mode === 'daily' && info.salt) {
    if (info.salt !== dailySalt(player.id, info.dateKey!)) {
      return json(422, { error: 'round rejected: seed is not yours' })
    }
  }

  // ---- write the validated score ----
  if (info.mode === 'daily') {
    const row = {
      date_key: info.dateKey!,
      puzzle_number: info.puzzleNumber!,
      course_slug: info.course.slug,
      player_id: player.id,
      player_name: player.name,
      character: character ?? null,
      to_par: replay.toPar,
      strokes: replay.strokes,
      results: replay.results,
    }
    // first card of the day stands; a resubmission is ignored
    const { error } = await supabase.from('daily_scores').insert(row)
    if (error && error.code !== '23505') return json(500, { error: 'could not save score' })

    const { count: better } = await supabase
      .from('daily_scores')
      .select('*', { count: 'exact', head: true })
      .eq('date_key', info.dateKey!)
      .lt('to_par', replay.toPar)
    const { count: total } = await supabase
      .from('daily_scores')
      .select('*', { count: 'exact', head: true })
      .eq('date_key', info.dateKey!)
    return json(200, {
      mode: 'daily',
      toPar: replay.toPar,
      strokes: replay.strokes,
      rank: (better ?? 0) + 1,
      total: total ?? 1,
      duplicate: !!error,
      player: { id: player.id, name: player.name, ...(player.secret ? { secret: player.secret } : {}) },
    })
  }

  // practice: course records
  const { data: existing } = await supabase
    .from('course_records')
    .select('to_par, player_name')
    .eq('course_slug', info.course.slug)
    .maybeSingle()
  const isRecord = !existing || replay.toPar < existing.to_par
  if (isRecord) {
    const { error } = await supabase.from('course_records').upsert({
      course_slug: info.course.slug,
      player_id: player.id,
      player_name: player.name,
      character: character ?? null,
      to_par: replay.toPar,
      set_at: new Date().toISOString(),
    })
    if (error) return json(500, { error: 'could not save record' })
  }
  return json(200, {
    mode: 'practice',
    toPar: replay.toPar,
    strokes: replay.strokes,
    record: isRecord
      ? { broken: true, toPar: replay.toPar, holder: player.name }
      : { broken: false, toPar: existing!.to_par, holder: existing!.player_name },
    player: { id: player.id, name: player.name, ...(player.secret ? { secret: player.secret } : {}) },
  })
})
