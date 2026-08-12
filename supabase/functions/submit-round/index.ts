// DogLeg submit-round edge function (Deno).
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
import {
  ENGINE_VERSION,
  FORTUNE_CONFIG,
  choiceRowsFromReplay,
  courseBySlug,
  dailySalt,
  destinyDue,
  eventForKey,
  eventPlayable,
  fortuneEligible,
  replayRound,
  seasonForDate,
} from './engine.mjs'
import { buildStealEmail, sendViaResend } from './email.ts'
import { SITE_URL } from '../_shared/email-chassis.ts'

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

/**
 * True when an upsert failed only because the course_records.seed/decisions
 * columns aren't there yet (pre-delta database). PostgREST reports an unknown
 * column as PGRST204 with the missing name in the message; Postgres proper
 * uses 42703. Anything else is a real failure we must not swallow.
 */
function missingGhostColumns(error: { code?: string; message?: string }): boolean {
  if (error.code !== 'PGRST204' && error.code !== '42703') return false
  const msg = error.message ?? ''
  return msg.includes('seed') || msg.includes('decisions')
}

/**
 * True when a write failed only because the season_records table itself isn't
 * there yet (pre-delta database — the schema update is manual, the function
 * deploy is automatic). PostgREST reports an unknown table as PGRST205;
 * Postgres proper uses 42P01. Anything else is a real failure.
 */
function missingSeasonTable(error: { code?: string; message?: string }): boolean {
  if (error.code !== 'PGRST205' && error.code !== '42P01') return false
  return (error.message ?? '').includes('season_records')
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

  // ---- engine-generation handshake, BEFORE any replay ----
  // A round played on a different engine generation than this bundle would
  // replay with different dice — the replay "failure" that produces is not
  // the player's fault and its error text is gibberish to them ("hole 11:
  // round left unfinished"). Reject the mismatch up front with a
  // machine-readable code so the client can say "refresh". A payload with NO
  // version is a pre-handshake client: let it replay as before — its round
  // either validates or it doesn't, same as always.
  if (body?.engineVersion !== undefined && body.engineVersion !== ENGINE_VERSION) {
    return json(409, {
      error: 'A new version of DogLeg is live — refresh to post your score.',
      code: 'stale_client',
    })
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

  // ---- DogLeg Cup policy checks ----
  // setupFromSeed already proved the seed names a real event, that event's
  // course, and a day inside its Thursday–Sunday window. Two things are
  // policy, not grammar, and live here: the event must actually be RUNNING
  // (a placeholder on the calendar parses so history replays, but takes no
  // submissions), and each round must be posted on (about) its own calendar
  // day — the daily's exact freshness rule, so a player can't bank Thursday
  // and post it Sunday with the whole week's boards in view.
  if (info.mode === 'major') {
    const event = eventForKey(info.eventKey!)
    if (!event || !eventPlayable(event)) return json(422, { error: 'that Cup event is not running' })
    const allowed = [utcDateKey(-1), utcDateKey(0), utcDateKey(1)]
    if (!allowed.includes(info.dateKey!)) return json(422, { error: 'this Cup round is not for today' })
  }

  // ---- destiny and record contention ----
  // Practice fortune counters have no server-visible history AT ALL, so a
  // destiny-due tail is unverifiable — anyone could forge `:f500.…` and post
  // a forced ace as a record. Those rounds still VALIDATE and post like any
  // other practice round (the moment is the point, and an error banner over
  // a guaranteed ace would sour the game's biggest gift) — they just quietly
  // don't contend for either record board.
  //
  // DAILY destiny is different, by decision (2026-08-03): the daily drought
  // is recomputed from posted cards below, so a destined daily is VERIFIED —
  // and a forced hole-out still needs seventeen other strong holes before it
  // threatens a record. Verified destiny counts; unverifiable destiny can't.
  //
  // Fortune-ineligible courses (par-3 shorts) never fire destiny regardless
  // of the tail — the engine ignores fortune there entirely — so a due tail
  // on such a seed is inert, not a forged gift. (Current clients omit the
  // tail on those courses; this guard also accepts any that still carry one.)
  let recordEligible = true
  if (info.mode === 'practice' && info.fortune && fortuneEligible(info.course)) {
    const due = destinyDue('practice', info.fortune)
    if (due.ace || due.albatross) recordEligible = false
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
    // Cup rounds live under the identical rule — same derivation, same day.
    if ((info.mode === 'daily' || info.mode === 'major') && info.salt && info.salt !== dailySalt(data.id, info.dateKey!)) {
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
          // the drought is the PRE-round drought: a RETRY of this very
          // submission may already have its card posted (the insert
          // committed, a later record write failed), and counting that
          // card's own destiny moment would zero the drought and reject
          // the self-heal retry the duplicate path exists to serve
          const history = ((rows ?? []) as { date_key: string; course_slug: string; results: string[] | null }[]).filter(
            (r) => r.date_key !== info.dateKey,
          )
          let sinceAce = 0
          let sinceAlb = 0
          let aceDone = false
          let albDone = false
          for (const row of history) {
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
    // reserve a name on its way out. Cup rounds under the same rule.
    if ((info.mode === 'daily' || info.mode === 'major') && info.salt) return json(422, { error: 'round rejected: seed is not yours' })
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

  // Every failure from here on happens AFTER the player row was minted (or
  // the name claimed): the identity must ride on those error responses, or a
  // first-time device retries with no credentials, re-claims the same name,
  // gets "that name is taken", and its posted card is stranded under an
  // identity it never received. `player.secret` is only set when this very
  // request created the row — established identities never re-receive theirs.
  const fail = (status: number, payload: Record<string, unknown>) =>
    json(status, {
      ...payload,
      ...(player.secret ? { player: { id: player.id, name: player.name, secret: player.secret } } : {}),
    })

  // ---- write the validated score ----
  let daily: { rank: number; total: number; duplicate: boolean } | null = null
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
    if (error && error.code !== '23505') return fail(500, { error: 'could not save score' })
    if (error) {
      // Duplicate resubmission: the first card stands, so records may only
      // contend with THAT card's score. Without this check a player could
      // replay the daily with different decisions and use a later, better
      // result to take a record the one-attempt board never saw. A retry of
      // the same round (same score) still falls through, so a record write
      // that failed after the board write self-heals on the client's retry.
      const { data: first } = await supabase
        .from('daily_scores')
        .select('to_par, strokes')
        .eq('date_key', info.dateKey!)
        .eq('player_id', player.id)
        .maybeSingle()
      if (!first || first.to_par !== replay.toPar || first.strokes !== replay.strokes) {
        recordEligible = false
      }
    }

    // ---- clubhouse decision tallies (Layer 2): best-effort, fresh cards only.
    // One atomic RPC bumps the aggregate counters for every (hole,stage) this
    // round played. `!error` means a genuinely new daily card (dupes already
    // skipped), so no counter is ever double-bumped. A tally hiccup is logged
    // and swallowed — it never fails the player's submission. ----
    if (!error && info.dateKey && player.name) {
      const rows = choiceRowsFromReplay(replay.scores)
      if (rows.length > 0) {
        const { error: tallyError } = await supabase.rpc('bump_choice_tallies', {
          p_date_key: info.dateKey,
          p_course_slug: info.course.slug,
          p_player_name: player.name,
          p_holes: rows.map((r) => r.hole),
          p_stages: rows.map((r) => r.stage),
          p_choices: rows.map((r) => r.choice),
        })
        if (tallyError) console.error('bump_choice_tallies failed:', tallyError)
      }
    }

    const { count: better } = await supabase
      .from('daily_scores')
      .select('*', { count: 'exact', head: true })
      .eq('date_key', info.dateKey!)
      .lt('to_par', replay.toPar)
    const { count: total } = await supabase
      .from('daily_scores')
      .select('*', { count: 'exact', head: true })
      .eq('date_key', info.dateKey!)
    daily = { rank: (better ?? 0) + 1, total: total ?? 1, duplicate: !!error }
    // NO early return: a course record is the best score anyone has posted
    // on the course from ANY competitive play, so a daily falls through to
    // the same record claims practice rounds make. Running the claims even
    // on a duplicate resubmission is deliberate — they're strictly-better-
    // gated no-ops normally, so a record write that failed after the board
    // write self-heals on the client's retry instead of diverging forever.
  }

  // ---- write a validated Cup round ----
  // One row per (event, day, player): the first signed card for a round day
  // stands, a resubmission is a duplicate — the daily's exact contract. The
  // board (best 3 of 4, ties by best single round) and the season points
  // race are DERIVED from these rows client-side; nothing is finalized here.
  // Deliberately NOT contending for course/season records in this lane —
  // whether Cup rounds join the record boards is an open design call, and
  // conservative-by-default means no accidental record churn from events.
  if (info.mode === 'major') {
    const row = {
      event_key: info.eventKey!,
      day: info.eventDay!,
      date_key: info.dateKey!,
      course_slug: info.course.slug,
      player_id: player.id,
      player_name: player.name,
      character: character ?? null,
      to_par: replay.toPar,
      strokes: replay.strokes,
      results: replay.results,
      // the validated round itself, kept like course_records keeps record
      // rounds — the podium replays a champion's actual golf
      seed,
      decisions,
    }
    const { error } = await supabase.from('event_scores').insert(row)
    if (error && error.code !== '23505') return json(500, { error: 'could not save score' })

    // where this round sits among today's field — the wrap's one-liner;
    // the full best-3-of-4 board is a client-side read
    const { count: better } = await supabase
      .from('event_scores')
      .select('*', { count: 'exact', head: true })
      .eq('event_key', info.eventKey!)
      .eq('day', info.eventDay!)
      .lt('to_par', replay.toPar)
    const { count: total } = await supabase
      .from('event_scores')
      .select('*', { count: 'exact', head: true })
      .eq('event_key', info.eventKey!)
      .eq('day', info.eventDay!)
    return json(200, {
      mode: 'major',
      eventKey: info.eventKey,
      day: info.eventDay,
      toPar: replay.toPar,
      strokes: replay.strokes,
      rank: (better ?? 0) + 1,
      total: total ?? 1,
      duplicate: !!error,
      player: { id: player.id, name: player.name, ...(player.secret ? { secret: player.secret } : {}) },
    })
  }

  // ---- SEASON course record (scope 'global' today — leagues later filter
  // this same table by scope). The season is stamped HERE, from the ET
  // calendar: that single fact makes rollover reliable with nobody online,
  // because a season's rows simply stop changing when submissions start
  // carrying the next key. A practice round is stamped at submission time;
  // a DAILY is stamped from its own dateKey (anchored mid-day UTC, which is
  // morning of the same ET day), so a card played before the horn but
  // posted just after midnight still lands in the season its puzzle
  // belonged to.
  // The claim is written as two atomic statements rather than a read-then-
  // write: an insert that only wins when no row exists yet, then an update
  // the DATABASE gates on `to_par > ours` — so two concurrent submissions
  // can both race here and the better round holds the row either way.
  // ---- tell a previous holder their record was stolen (either board) ----
  // Best effort, entirely behind env config (no RESEND_API_KEY → no-op),
  // and never allowed to affect the submission response: the record is
  // already saved, a broken mailer shouldn't unsave it. Runs as a
  // background task (EdgeRuntime.waitUntil) so a slow mailer can't hold
  // the response open — a timed-out client would retry, find its own
  // record already written, get record.broken: false, and never run its
  // reclaim bookkeeping. The dedupe insert rides inside the task: still
  // insert-before-send, still at-most-once. `scope` keeps the two boards'
  // dedupe slots apart — one round can legitimately trigger both mails.
  const notifyStolen = async (scope: 'alltime' | 'season', stolenFrom: string, seasonLabel?: string) => {
    const notify = (async () => {
      const resendKey = Deno.env.get('RESEND_API_KEY')
      const emailFrom = Deno.env.get('EMAIL_FROM')
      if (!resendKey || !emailFrom) return
      // only holders who linked an email account can be reached
      const { data: prev } = await supabase
        .from('players')
        .select('user_id')
        .eq('id', stolenFrom)
        .maybeSingle()
      if (!prev?.user_id) return
      // dedupe BEFORE sending: one email per holder per record per UTC
      // day, and a crashed send burns the slot rather than double-mailing
      const { error: dedupeError } = await supabase.from('record_steal_emails').insert({
        scope,
        course_slug: info.course.slug,
        player_id: stolenFrom,
        date_key: utcDateKey(0),
      })
      if (dedupeError) {
        if (dedupeError.code !== '23505') {
          console.error('record-steal email dedupe insert failed:', dedupeError.code)
        }
        return
      }
      const { data: userData } = await supabase.auth.admin.getUserById(prev.user_id)
      const email = userData?.user?.email
      if (!email) return
      const msg = buildStealEmail({
        courseName: info.course.name,
        thiefName: player.name,
        siteUrl: SITE_URL,
        seasonLabel,
      })
      const sent = await sendViaResend(fetch, resendKey, emailFrom, email, msg)
      if (!sent.ok) console.error('record-steal email send failed with status', sent.status)
    })().catch((e) => console.error('record-steal email path threw:', e))
    const runtime = (globalThis as any).EdgeRuntime
    if (typeof runtime?.waitUntil === 'function') runtime.waitUntil(notify)
    // no waitUntil (older local runtime): await rather than lose the send
    else await notify
  }

  const season =
    info.mode === 'daily' ? seasonForDate(new Date(`${info.dateKey}T12:00:00Z`)) : seasonForDate(new Date())
  const seasonRow = {
    scope: 'global',
    season_key: season.key,
    course_slug: info.course.slug,
    player_id: player.id,
    player_name: player.name,
    character: character ?? null,
    to_par: replay.toPar,
    set_at: new Date().toISOString(),
    seed,
    decisions,
    // which mode set it — daily records are the harder feat (one attempt,
    // fixed conditions) and the UI crowns them for it
    mode: info.mode,
  }
  // null → the database predates season_records (the schema update is manual,
  // the function deploy automatic). Practice submissions must keep working
  // through that window: season bookkeeping degrades away and the response
  // simply omits seasonRecord. Self-heals once the table exists.
  let seasonRecord: {
    broken: boolean
    toPar: number
    holder: string
    character: string | null
    seasonKey: string
  } | null = null
  // pre-read the season row purely to identify the previous holder for the
  // steal email — it is NOT part of the race-safe write decision below, and
  // on a pre-delta database (no season_records yet) it quietly reads null
  const { data: seasonExisting } = await supabase
    .from('season_records')
    .select('player_id')
    .eq('scope', 'global')
    .eq('season_key', season.key)
    .eq('course_slug', info.course.slug)
    .maybeSingle()
  // an ineligible round (unverifiable practice destiny) makes no claim, but
  // still falls through to the holder read so the wrap can show the board
  const { data: seasonClaimed, error: seasonClaimError } = recordEligible
    ? await supabase
        .from('season_records')
        .upsert(seasonRow, { onConflict: 'scope,season_key,course_slug', ignoreDuplicates: true })
        .select('to_par')
    : { data: null, error: null }
  if (seasonClaimError && !missingSeasonTable(seasonClaimError)) {
    return fail(500, { error: 'could not save season record' })
  }
  if (!seasonClaimError) {
    let seasonBroken = ((seasonClaimed as { to_par: number }[] | null)?.length ?? 0) > 0
    if (!seasonBroken && recordEligible) {
      // a row exists — replace it only when this round is strictly better,
      // decided by the database in one statement (ties keep the holder)
      const { data: seasonTaken, error: seasonTakeError } = await supabase
        .from('season_records')
        .update(seasonRow)
        .eq('scope', 'global')
        .eq('season_key', season.key)
        .eq('course_slug', info.course.slug)
        .gt('to_par', replay.toPar)
        .select('to_par')
      if (seasonTakeError) return fail(500, { error: 'could not save season record' })
      seasonBroken = (seasonTaken?.length ?? 0) > 0
    }
    if (seasonBroken) {
      seasonRecord = {
        broken: true,
        toPar: replay.toPar,
        holder: player.name,
        character: character ?? null,
        seasonKey: season.key,
      }
      if (seasonExisting && seasonExisting.player_id !== player.id) {
        await notifyStolen('season', seasonExisting.player_id, season.label)
      }
    } else {
      const { data: seasonHolder } = await supabase
        .from('season_records')
        .select('to_par, player_id, player_name, character, seed')
        .eq('scope', 'global')
        .eq('season_key', season.key)
        .eq('course_slug', info.course.slug)
        .maybeSingle()
      if (seasonHolder) {
        // retry-aware recovery: the standing row may BE this very round —
        // the season claim committed, a later write 500'd the response, and
        // the client retried. The stored ghost seed is exact identity (one
        // seed, one round), so on a match the win is re-reported as broken
        // rather than silently downgraded to someone else's record — without
        // it the client would never run its season bookkeeping/celebration.
        // Gated on the client's `unacknowledged` marker (sent until a 200
        // lands in its posted ledger): daily seeds are stable per player+day,
        // so seed identity alone can't tell a lost-response retry from an
        // already-acknowledged card being reopened and auto-resubmitted —
        // without the gate every reopen would re-celebrate. A forged marker
        // buys nothing but a repeat splash on the forger's own screen: this
        // path writes nothing. No steal email here either way — the original
        // claim's send already ran, and the dedupe ledger holds.
        if (body?.unacknowledged === true && seasonHolder.player_id === player.id && seasonHolder.seed === seed) {
          seasonRecord = {
            broken: true,
            toPar: replay.toPar,
            holder: player.name,
            character: character ?? null,
            seasonKey: season.key,
          }
        } else {
          seasonRecord = {
            broken: false,
            toPar: seasonHolder.to_par,
            holder: seasonHolder.player_name,
            character: seasonHolder.character ?? null,
            seasonKey: season.key,
          }
        }
      }
    }
  }

  // ALL-TIME course records (never reset), from EITHER mode. Same race-safe shape as
  // the season write above: claim-if-absent, then a database-gated replace,
  // so two concurrent submissions can't leave a worse round on the row. The
  // pre-write read is NOT part of that decision — it only identifies the
  // previous holder for the steal email.
  const { data: existing } = await supabase
    .from('course_records')
    .select('to_par, player_id, player_name, character')
    .eq('course_slug', info.course.slug)
    .maybeSingle()
  const record = {
    course_slug: info.course.slug,
    player_id: player.id,
    player_name: player.name,
    character: character ?? null,
    to_par: replay.toPar,
    set_at: new Date().toISOString(),
    mode: info.mode,
  }
  // the record ROUND rides along — the referee just replayed and verified
  // this exact seed + decision list, so keeping it costs nothing and lets
  // every challenger race the true record as a ghost. Public by design:
  // it's the same payload a replay share link carries.
  //
  // pre-delta database: the seed/decisions columns don't exist yet (the
  // migration is manual, the function deploy is automatic). Both writes
  // retry without the ghost round; the client falls back to the
  // challenger's own best. Self-heals once the delta runs.
  let recordClaimed: { to_par: number }[] | null = null
  let recordClaimError: { code?: string; message?: string } | null = null
  if (recordEligible) {
    ;({ data: recordClaimed, error: recordClaimError } = await supabase
      .from('course_records')
      .upsert({ ...record, seed, decisions }, { onConflict: 'course_slug', ignoreDuplicates: true })
      .select('to_par'))
    if (recordClaimError && missingGhostColumns(recordClaimError)) {
      ;({ data: recordClaimed, error: recordClaimError } = await supabase
        .from('course_records')
        .upsert(record, { onConflict: 'course_slug', ignoreDuplicates: true })
        .select('to_par'))
    }
  }
  if (recordClaimError) return fail(500, { error: 'could not save record' })
  let isRecord = (recordClaimed?.length ?? 0) > 0
  if (!isRecord && recordEligible) {
    // a record exists — replace it only when this round is strictly better,
    // decided by the database in one statement (ties keep the holder)
    let { data: recordTaken, error: recordTakeError } = await supabase
      .from('course_records')
      .update({ ...record, seed, decisions })
      .eq('course_slug', info.course.slug)
      .gt('to_par', replay.toPar)
      .select('to_par')
    if (recordTakeError && missingGhostColumns(recordTakeError)) {
      ;({ data: recordTaken, error: recordTakeError } = await supabase
        .from('course_records')
        .update(record)
        .eq('course_slug', info.course.slug)
        .gt('to_par', replay.toPar)
        .select('to_par'))
    }
    if (recordTakeError) return fail(500, { error: 'could not save record' })
    isRecord = (recordTaken?.length ?? 0) > 0
  }
  if (isRecord) {
    // the previous ALL-TIME holder gets the sterner of the two mails; the
    // shared helper (defined above the season write) carries the machinery
    if (existing && existing.player_id !== player.id) {
      await notifyStolen('alltime', existing.player_id)
    }
  }
  // re-read rather than trust the pre-write snapshot: when our claim lost a
  // race (existing was null but the insert conflicted), the snapshot has no
  // holder to show — the row itself always does
  let recordHolder = existing
  if (!isRecord && !recordHolder) {
    const { data: raced } = await supabase
      .from('course_records')
      .select('to_par, player_id, player_name, character')
      .eq('course_slug', info.course.slug)
      .maybeSingle()
    recordHolder = raced
  }
  // retry-aware recovery, the all-time twin of the season one above: the
  // standing row may BE this very round (the claim committed, the 200 was
  // lost, the client retried with its unacknowledged marker). Same identity
  // test — this player AND this exact seed — so the win is re-reported and
  // the client still runs recordWon/markArchiveRecord/the celebration. The
  // seed is read separately and guarded: a pre-delta database has no seed
  // column, and recovery must degrade away there rather than fail the
  // submission. Runs after the steal-email block by design — the original
  // claim already sent the mail, and `existing` is the player's own row here
  // so the block would skip anyway. Writes nothing, so a forged marker only
  // repeats a splash on the forger's own screen.
  if (!isRecord && body?.unacknowledged === true && recordHolder?.player_id === player.id) {
    const { data: ghost, error: ghostError } = await supabase
      .from('course_records')
      .select('seed')
      .eq('course_slug', info.course.slug)
      .maybeSingle()
    if (!ghostError && ghost?.seed != null && ghost.seed === seed) isRecord = true
  }
  // one response shape for both modes: dailies carry their board fields
  // (rank/total/duplicate) AND the record outcomes, so a single flow serves
  // the daily board and the record system together — they cannot diverge.
  return json(200, {
    mode: info.mode,
    toPar: replay.toPar,
    strokes: replay.strokes,
    ...(daily ?? {}),
    // no holder and no claim (an ineligible round on a recordless course) →
    // omit `record` entirely, like the season path: synthesizing one from
    // the challenger would show their own score as the standing record
    ...(isRecord
      ? { record: { broken: true, toPar: replay.toPar, holder: player.name, character: character ?? null } }
      : recordHolder
        ? {
            record: {
              broken: false,
              toPar: recordHolder.to_par,
              holder: recordHolder.player_name,
              character: recordHolder.character ?? null,
            },
          }
        : {}),
    ...(seasonRecord ? { seasonRecord } : {}),
    player: { id: player.id, name: player.name, ...(player.secret ? { secret: player.secret } : {}) },
  })
})
