import { decisionsFromScores } from '../engine/replay'
import type { CharacterId } from '../engine/types'
import type { RoundState } from '../state/store'
import { SUPABASE_ANON_KEY, SUPABASE_URL, backendEnabled } from './backend'

/** Clubhouse identity: a name plus a device-held id/secret pair. No account. */
export interface Player {
  id: string
  secret: string
  name: string
}

const PLAYER_KEY = 'dogleg:player:v1'

export function loadPlayer(): Player | null {
  try {
    const raw = localStorage.getItem(PLAYER_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Player
    return p.id && p.secret && p.name ? p : null
  } catch {
    return null
  }
}

/** Persist this device's identity (also used by account sync in auth.ts). */
export function savePlayerIdentity(p: Player): void {
  try {
    localStorage.setItem(PLAYER_KEY, JSON.stringify(p))
  } catch {
    /* private mode */
  }
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

/** Submit a finished round. The server replays it and computes the score. */
export async function submitRound(round: RoundState, name?: string): Promise<SubmitResult> {
  if (!backendEnabled) return { ok: false, error: 'leaderboard disabled' }
  const decisions = decisionsFromScores(round.scores)
  if (!round.complete || !decisions) return { ok: false, error: 'round not finished' }
  const player = loadPlayer()
  if (!player && !name) return { ok: false, error: 'name required' }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-round`, {
      method: 'POST',
      headers: { ...REST_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({
        seed: round.seed,
        character: round.character,
        decisions,
        ...(player ? { playerId: player.id, playerSecret: player.secret } : { name }),
      }),
    })
    const body = (await res.json()) as SubmitResult & { player?: Player & { secret?: string } }
    if (!res.ok) return { ok: false, error: (body as { error?: string }).error ?? `submit failed (${res.status})` }
    if (body.player?.secret) savePlayerIdentity({ id: body.player.id, secret: body.player.secret, name: body.player.name })
    return { ...body, ok: true }
  } catch {
    return { ok: false, error: 'network hiccup — your score is safe locally, try again' }
  }
}
