import { decisionsFromScores } from '../engine/replay'
import type { CharacterId } from '../engine/types'
import type { RoundState } from '../state/store'
import { SUPABASE_ANON_KEY, SUPABASE_URL, backendEnabled } from './backend'

/** Clubhouse identity: a device-held id/secret pair, plus a name once the
 * player has claimed one. Anonymous players carry a nameless identity — the
 * server mints the id at app start (see ensureIdentity) so their daily dice
 * can be salted per player, and the name lands on the SAME row when they
 * first post a card. No merging, no account. */
export interface Player {
  id: string
  secret: string
  name: string | null
}

const PLAYER_KEY = 'dogleg:player:v1'

/** Any identity this device holds — named or not. This is what seeds the
 * daily dice and authenticates submissions. */
export function loadIdentity(): Player | null {
  try {
    const raw = localStorage.getItem(PLAYER_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Player
    return p.id && p.secret ? { ...p, name: p.name ?? null } : null
  } catch {
    return null
  }
}

/** The identity once it has a clubhouse name — what the boards and account
 * panel care about. Null while the player is still anonymous. */
export function loadPlayer(): Player | null {
  const p = loadIdentity()
  return p?.name ? p : null
}

/** Persist this device's identity (also used by account sync in auth.ts). */
export function savePlayerIdentity(p: Player): void {
  try {
    localStorage.setItem(PLAYER_KEY, JSON.stringify(p))
  } catch {
    /* private mode */
  }
}

let minting: Promise<void> | null = null

/**
 * Make sure this device has a player id before the daily starts, minting a
 * nameless one from the server if needed. The id is what the per-player dice
 * salt derives from — server-minted so nobody can choose (or grind) their
 * own. Fire-and-forget: by the time a human reaches the first tee the mint
 * has long finished, and if it hasn't (offline, backend down) the round
 * simply starts from the unsalted canonical seed, exactly as before.
 */
export function ensureIdentity(): void {
  if (!backendEnabled || minting || loadIdentity()) return
  minting = (async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/mint-player`, {
        method: 'POST',
        headers: REST_HEADERS,
      })
      if (!res.ok) return
      const body = (await res.json()) as { player?: { id: string; secret: string } }
      // re-check: a submit/sync may have landed an identity while we waited
      if (body.player?.id && body.player.secret && !loadIdentity()) {
        savePlayerIdentity({ id: body.player.id, secret: body.player.secret, name: null })
      }
    } catch {
      /* offline — unsalted fallback, still a valid daily */
    } finally {
      minting = null
    }
  })()
}

// new-style publishable keys are sent as `apikey` alone (they aren't JWTs)
const REST_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
}

export interface BoardRow {
  player_name: string
  character: CharacterId | null
  to_par: number
  strokes: number
}

export async function fetchDailyBoard(dateKey: string): Promise<BoardRow[] | null> {
  if (!backendEnabled) return null
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/daily_scores` +
      `?date_key=eq.${encodeURIComponent(dateKey)}` +
      `&select=player_name,character,to_par,strokes&order=to_par.asc,created_at.asc&limit=100`
    const res = await fetch(url, { headers: REST_HEADERS })
    if (!res.ok) return null
    return (await res.json()) as BoardRow[]
  } catch {
    return null
  }
}

export interface CourseRecord {
  course_slug: string
  player_name: string
  character: CharacterId | null
  to_par: number
}

export async function fetchCourseRecords(): Promise<Map<string, CourseRecord> | null> {
  if (!backendEnabled) return null
  try {
    const url = `${SUPABASE_URL}/rest/v1/course_records?select=course_slug,player_name,character,to_par`
    const res = await fetch(url, { headers: REST_HEADERS })
    if (!res.ok) return null
    const rows = (await res.json()) as CourseRecord[]
    return new Map(rows.map((r) => [r.course_slug, r]))
  } catch {
    return null
  }
}

export interface SubmitResult {
  ok: boolean
  error?: string
  mode?: 'daily' | 'practice'
  toPar?: number
  rank?: number
  total?: number
  duplicate?: boolean
  record?: { broken: boolean; toPar: number; holder: string; character?: CharacterId | null }
}

/** Date keys of dailies this device has successfully posted to the board.
 * Read by the store when baking a fortune streak into a daily seed. */
const POSTED_KEY = 'dogleg:posted:v1'

function recordPostedDaily(dateKey: string): void {
  try {
    const raw = localStorage.getItem(POSTED_KEY)
    const keys = raw ? (JSON.parse(raw) as string[]) : []
    if (!keys.includes(dateKey)) keys.push(dateKey)
    localStorage.setItem(POSTED_KEY, JSON.stringify(keys.slice(-400)))
  } catch {
    /* private mode */
  }
}

/** Submit a finished round. The server replays it and computes the score.
 * An anonymous (nameless) identity submits with its id/secret plus the name
 * being claimed — the name lands on the same player row the round's dice
 * were salted for. */
export async function submitRound(round: RoundState, name?: string): Promise<SubmitResult> {
  if (!backendEnabled) return { ok: false, error: 'leaderboard disabled' }
  const decisions = decisionsFromScores(round.scores)
  if (!round.complete || !decisions) return { ok: false, error: 'round not finished' }
  const player = loadIdentity()
  if (!player?.name && !name) return { ok: false, error: 'name required' }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-round`, {
      method: 'POST',
      headers: { ...REST_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({
        seed: round.seed,
        character: round.character,
        decisions,
        ...(player ? { playerId: player.id, playerSecret: player.secret } : {}),
        ...(name && !player?.name ? { name } : {}),
      }),
    })
    const body = (await res.json()) as SubmitResult & { player?: Player & { secret?: string } }
    if (!res.ok) return { ok: false, error: (body as { error?: string }).error ?? `submit failed (${res.status})` }
    // the server's view of the identity wins: a fresh secret on first-ever
    // submission, or the name just claimed onto an anonymous id
    const secret = body.player?.secret ?? player?.secret
    if (body.player?.id && secret) {
      savePlayerIdentity({ id: body.player.id, secret, name: body.player.name })
    }
    // remember which dailies actually POSTED — the fortune streak claim is
    // derived from this set so the client never claims a streak the referee's
    // daily_scores table can't corroborate (duplicates count: the card for
    // that day is on the board either way)
    if (round.mode === 'daily') recordPostedDaily(round.dateKey)
    return { ...body, ok: true }
  } catch {
    return { ok: false, error: 'network hiccup — your score is safe locally, try again' }
  }
}
