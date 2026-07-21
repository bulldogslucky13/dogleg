// Dogleg submit-round edge function (Deno).
//
// Receives { seed, character, decisions, playerId?, playerSecret?, name? },
// REPLAYS the round with the real game engine (bundled as engine.mjs by
// `pnpm build:validator`), and writes the engine's score — never the client's
// claim. Identities are normally minted anonymously up front (mint-player);
// the first posted card claims a clubhouse name onto that same row. Legacy
// clients with no identity at all still get one created here from a name.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import { FORTUNE_CONFIG, courseBySlug, dailySalt, destinyDue, replayRound } from './engine.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'_-]{1,17}$/u

/** The calendar day before a YYYY-MM-DD key (pure date math, no timezone). */
function dayBefore(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d) - 86_400_000)
  return `${t.getUTCFullYear()}-${`${t.getUTCMonth() + 1}`.padStart(2, '0')}-${`${t.getUTCDate()}`.padStart(2, '0')}`
}

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

  // ---- a destined practice round cannot contend for course records ----
  // Practice fortune counters have no server-visible history AT ALL, so a
  // destiny-due tail is unverifiable — anyone could forge `:f500.…` and post
  // a forced ace as a record. And even a legitimately destined round is a
  // gift, not a record-worthy score. Practice records only accept rounds
  // whose tail is below every destiny threshold; the round itself still
  // played fine on the client, it just doesn't claim the CR.
  if (info.mode === 'practice' && info.fortune) {
    const due = destinyDue('practice', info.fortune)
    if (due.ace || due.albatross) {
      return json(422, { error: 'destined rounds do not contend for course records' })
    }
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ---- identify or create the player ----
  // Ordering rule for this block: verify everything — secret, then salt —
  // BEFORE any write. A submission destined for rejection must not get to
  // claim a clubhouse name or mint a player row as a side effect.
  let player: { id: string; name: string; secret?: string }
  if (playerId && playerSecret) {
    const { data } = await supabase.from('players').select('id, name, secret').eq('id', playerId).single()
    if (!data || data.secret !== playerSecret) return json(403, { error: 'unknown player' })

    // ---- the salt must be the one THIS player is entitled to ----
    // The salt reseeds every roll in the round, so a client free to choose it
    // could replay one decision list under thousands of salts offline and post
    // the luckiest card — a genuine replay the referee would happily certify.
    // Exactly one salt is valid per player per day, and we derive it here
    // rather than trusting the seed. An absent salt is still accepted: that is
    // the single canonical daily seed with no freedom to grind — the fallback
    // for clients that could not reach mint-player before teeing off.
    if (info.mode === 'daily' && info.salt && info.salt !== dailySalt(data.id, info.dateKey!)) {
      return json(422, { error: 'round rejected: seed is not yours' })
    }

    // ---- fortune sanity: the tail is client-kept, so every knob it offers
    // must be bounded by server-visible history. Dice already ignore the
    // tail entirely (replayRound strips it before seeding the rng), which
    // leaves exactly two knobs a daily tail can turn: the streak multiplier
    // and the destiny guarantee. Both are checked against posted dailies. ----
    if (info.mode === 'daily' && info.fortune) {
      const g = FORTUNE_CONFIG.daily.guaranteeAt
      const claimsStreak = info.fortune.streak > 1
      const claimsAceDestiny = info.fortune.ace >= g
      const claimsAlbDestiny = info.fortune.alb >= g
      if (claimsStreak || claimsAceDestiny || claimsAlbDestiny) {
        const { data: rows } = await supabase
          .from('daily_scores')
          .select('date_key, course_slug, results')
          .eq('player_id', data.id)
          .order('date_key', { ascending: false })
          .limit(400)
        const postedKeys = new Set((rows ?? []).map((r: { date_key: string }) => r.date_key))
        // a streak is CONSECUTIVE posted days, not a lifetime count: walk
        // back from the day before this submission. The claim may be at most
        // that run + today (+3 grace for the odd submission that failed) —
        // scattered old cards can't add up to a loyalty multiplier.
        let run = 0
        let cursor = info.dateKey!
        while (postedKeys.has((cursor = dayBefore(cursor)))) run++
        if (info.fortune.streak > run + 1 + 3) {
          return json(422, { error: 'streak is not credible for this player yet' })
        }
        // destiny is only honored when the referee can RECOMPUTE the drought
        // from posted cards: count posted dailies since the last one that
        // contained the moment (ace = eagle result on a par 3; an albatross
        // result on a par 5 is the 2). A claim of >= guaranteeAt needs a
        // recomputed drought within a small grace of it — a client cannot
        // manufacture a destiny holeout out of a short or fabricated history.
        if (claimsAceDestiny || claimsAlbDestiny) {
          let sinceAce = 0
          let sinceAlb = 0
          let aceDone = false
          let albDone = false
          for (const row of (rows ?? []) as { course_slug: string; results: string[] | null }[]) {
            const course = courseBySlug(row.course_slug)
            const results = row.results ?? []
            const hasAce = !!course && results.some((r, i) => r === 'eagle' && course.holes[i]?.par === 3)
            const hasAlb = !!course && results.some((r, i) => r === 'albatross' && course.holes[i]?.par === 5)
            if (!aceDone) {
              if (hasAce) aceDone = true
              else sinceAce++
            }
            if (!albDone) {
              if (hasAlb) albDone = true
              else sinceAlb++
            }
          }
          const GRACE = 5 // a few locally-completed-but-unposted dailies
          if (claimsAceDestiny && sinceAce < g - GRACE) {
            return json(422, { error: 'destiny counter is not credible for this player yet' })
          }
          if (claimsAlbDestiny && sinceAlb < g - GRACE) {
            return json(422, { error: 'destiny counter is not credible for this player yet' })
          }
        }
      }
    }

    if (!data.name) {
      // an anonymous minted identity posting its first card: the name is
      // claimed onto THIS row, the one the round's dice were salted for
      if (!name || !NAME_RE.test(name)) return json(400, { error: 'pick a clubhouse name (2-18 letters/numbers)' })
      const { error } = await supabase.from('players').update({ name }).eq('id', data.id).is('name', null)
      if (error) {
        return json(error.code === '23505' ? 409 : 500, {
          error: error.code === '23505' ? 'that name is taken' : 'could not claim that name',
        })
      }
      data.name = name
    }
    player = { id: data.id, name: data.name }
  } else {
    // A salted seed can never belong to a player that doesn't exist yet: the
    // salt derives from a server-minted id, and this row hasn't been minted.
    // Rejected here, before the insert, so the doomed submission can't
    // reserve a name on its way out.
    if (info.mode === 'daily' && info.salt) return json(422, { error: 'round rejected: seed is not yours' })
    // a brand-new player row has zero posted dailies, so neither a streak
    // multiplier nor a destiny-due counter can ever be credible here —
    // rejected BEFORE the insert, same ordering rule as the salt check above.
    // (Streak bound = the named branch's formula with run 0: 0 + 1 + 3.)
    if (info.mode === 'daily' && info.fortune) {
      const g = FORTUNE_CONFIG.daily.guaranteeAt
      if (info.fortune.streak > 4 || info.fortune.ace >= g || info.fortune.alb >= g) {
        return json(422, { error: 'fortune counters are not credible for this player yet' })
      }
    }
    if (!name || !NAME_RE.test(name)) return json(400, { error: 'pick a clubhouse name (2-18 letters/numbers)' })
    const { data, error } = await supabase.from('players').insert({ name }).select('id, name, secret').single()
    if (error) {
      return json(error.code === '23505' ? 409 : 500, {
        error: error.code === '23505' ? 'that name is taken' : 'could not create player',
      })
    }
    player = { id: data.id, name: data.name, secret: data.secret }
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
    .select('to_par, player_name, character')
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
      ? { broken: true, toPar: replay.toPar, holder: player.name, character: character ?? null }
      : { broken: false, toPar: existing!.to_par, holder: existing!.player_name, character: existing!.character ?? null },
    player: { id: player.id, name: player.name, ...(player.secret ? { secret: player.secret } : {}) },
  })
})
