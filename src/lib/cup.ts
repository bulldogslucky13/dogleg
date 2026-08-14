import { cupPoints, eventForKey, paysPoints, type CupEvent } from '../engine/events'
import type { CharacterId, Choice, HoleResult } from '../engine/types'
import { SUPABASE_ANON_KEY, SUPABASE_URL, backendEnabled } from './backend'

/**
 * DogLeg Cup boards — pure derivation over event_scores rows.
 *
 * The referee writes one immutable row per (event, round day, player);
 * everything a board shows is computed HERE, client-side, from those rows:
 * the event standings (best three of four, no cuts) and the season points
 * race. No finalize step exists anywhere — an event's board is simply what
 * its rows say, forever, the same philosophy as season_records.
 *
 * The format rules, locked 2026-08-09:
 *  - best 3 of 4 rounds count; fewer than three posted = NOT eligible for a
 *    total (shown greyed as "N of 3", never ranked);
 *  - ties break by best single counted round, then second-best, then third —
 *    NEVER by posting time (no punishment for playing late);
 *  - still tied after all three = the rank is shared (competition numbering);
 *  - exhibitions crown a winner but pay no Cup points (paysPoints).
 */

export interface EventScoreRow {
  event_key: string
  day: number
  player_id: string
  player_name: string
  character?: CharacterId | null
  to_par: number
  strokes: number
  results: HoleResult[]
  /** the round itself, kept by the referee like course_records keeps record
   * rounds — what makes a podium round watchable. Absent on old rows. */
  seed?: string | null
  decisions?: Choice[][] | null
}

const REST_HEADERS = { apikey: SUPABASE_ANON_KEY }

// ---------------------------------------------------------------------------
// Which Cup rounds THIS DEVICE has posted — drives the event card's state
// ("Round 2 posted ✓") without a fetch. Written on successful submission.
// ---------------------------------------------------------------------------

const POSTED_CUP_KEY = 'dogleg:cup-posted:v1'

export function recordPostedCupRound(eventKey: string, day: number): void {
  try {
    const raw = localStorage.getItem(POSTED_CUP_KEY)
    const keys = raw ? (JSON.parse(raw) as string[]) : []
    const key = `${eventKey}:${day}`
    if (!keys.includes(key)) keys.push(key)
    localStorage.setItem(POSTED_CUP_KEY, JSON.stringify(keys.slice(-200)))
  } catch {
    /* private mode */
  }
}

export function hasPostedCupRound(eventKey: string, day: number): boolean {
  try {
    const raw = localStorage.getItem(POSTED_CUP_KEY)
    return raw ? (JSON.parse(raw) as string[]).includes(`${eventKey}:${day}`) : false
  } catch {
    return false
  }
}

/** Every posted round of one event. Null on any failure — a board that can't
 * load says so, it never pretends to be empty. */
export async function fetchEventScores(eventKey: string): Promise<EventScoreRow[] | null> {
  if (!backendEnabled) return null
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/event_scores` +
      `?event_key=eq.${encodeURIComponent(eventKey)}` +
      `&select=event_key,day,player_id,player_name,character,to_par,strokes,results,seed,decisions`
    const res = await fetch(url, { headers: REST_HEADERS })
    if (!res.ok) return null
    return (await res.json()) as EventScoreRow[]
  } catch {
    return null
  }
}

/** Every posted round across a set of events — the season standings feed. */
export async function fetchCupSeasonScores(eventKeys: string[]): Promise<EventScoreRow[] | null> {
  if (!backendEnabled || eventKeys.length === 0) return null
  try {
    const list = eventKeys.map(encodeURIComponent).join(',')
    const url =
      `${SUPABASE_URL}/rest/v1/event_scores` +
      `?event_key=in.(${list})` +
      `&select=event_key,day,player_id,player_name,character,to_par,strokes,results,seed,decisions`
    const res = await fetch(url, { headers: REST_HEADERS })
    if (!res.ok) return null
    return (await res.json()) as EventScoreRow[]
  } catch {
    return null
  }
}

export interface EventStanding {
  playerId: string
  name: string
  character?: CharacterId | null
  /** to-par by round day (index 0 = Thursday); null = not posted */
  rounds: (number | null)[]
  /** rounds actually posted */
  played: number
  /** the counted card: best three posted rounds, ascending */
  counted: number[]
  /** sum of the counted card — null until eligible */
  total: number | null
  /** three rounds in = a total on the board */
  eligible: boolean
  /** competition rank among eligible players (ties share); absent for partials */
  rank?: number
}

/** counted cards compare total first, then best round, then next, then next —
 * zero means dead even, and dead even SHARES the rank */
function compareCounted(a: EventStanding, b: EventStanding): number {
  if (a.total! !== b.total!) return a.total! - b.total!
  for (let i = 0; i < 3; i++) {
    const d = (a.counted[i] ?? 0) - (b.counted[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * The event board. Eligible players first, ranked; partial cards follow,
 * most-complete first, unranked — the board always shows the path to a total.
 */
export function eventStandings(rows: EventScoreRow[]): EventStanding[] {
  const byPlayer = new Map<string, EventStanding>()
  for (const r of rows) {
    if (r.day < 1 || r.day > 4) continue
    let s = byPlayer.get(r.player_id)
    if (!s) {
      s = { playerId: r.player_id, name: r.player_name, character: r.character, rounds: [null, null, null, null], played: 0, counted: [], total: null, eligible: false }
      byPlayer.set(r.player_id, s)
    }
    // one row per (event, day, player) is the table's PK; a duplicate here
    // would be a bug upstream — first one wins, matching the referee
    if (s.rounds[r.day - 1] === null) {
      s.rounds[r.day - 1] = r.to_par
      s.played += 1
      // Sunday's row carries the freshest name/character for display
      s.name = r.player_name
    }
  }
  for (const s of byPlayer.values()) {
    const posted = s.rounds.filter((v): v is number => v !== null).sort((a, b) => a - b)
    s.counted = posted.slice(0, 3)
    s.eligible = posted.length >= 3
    s.total = s.eligible ? s.counted.reduce((sum, v) => sum + v, 0) : null
  }
  const eligible = [...byPlayer.values()].filter((s) => s.eligible).sort(compareCounted)
  // competition numbering: a tie EATS the ranks it consumes (two 2nds, no 3rd)
  eligible.forEach((s, i) => {
    s.rank = i > 0 && compareCounted(s, eligible[i - 1]) === 0 ? eligible[i - 1].rank : i + 1
  })
  const partial = [...byPlayer.values()]
    .filter((s) => !s.eligible)
    .sort((a, b) => b.played - a.played || (a.counted.reduce((x, y) => x + y, 0)) - (b.counted.reduce((x, y) => x + y, 0)))
  return [...eligible, ...partial]
}

// ---------------------------------------------------------------------------
// The Trophy Room ledger — what this device's player took home
// ---------------------------------------------------------------------------

export interface CupTrophy {
  eventKey: string
  eventName: string
  courseSlug: string
  major: boolean
  exhibition: boolean
  /** final competition rank; undefined = played but never posted three rounds */
  rank?: number
  total: number | null
  /** to-par by round day (index 0 = Thursday); null = not posted */
  rounds: (number | null)[]
  at: number
}

const TROPHIES_KEY = 'dogleg:cup-trophies:v1'

export function loadCupTrophies(): CupTrophy[] {
  try {
    const raw = localStorage.getItem(TROPHIES_KEY)
    return raw ? (JSON.parse(raw) as CupTrophy[]) : []
  } catch {
    return []
  }
}

/** Engraved at podium time — the ceremony writes what the player finished,
 * once per event, and the Clubhouse Trophy Room reads it forever. */
export function recordCupTrophy(event: CupEvent, standing: EventStanding): void {
  try {
    const trophies = loadCupTrophies()
    if (trophies.some((t) => t.eventKey === event.key)) return
    trophies.unshift({
      eventKey: event.key,
      eventName: event.name,
      courseSlug: event.courseSlug,
      major: !!event.major,
      exhibition: !!event.exhibition,
      rank: standing.eligible ? standing.rank : undefined,
      total: standing.total,
      rounds: standing.rounds,
      at: Date.now(),
    })
    localStorage.setItem(TROPHIES_KEY, JSON.stringify(trophies.slice(0, 100)))
  } catch {
    /* private mode */
  }
}

export interface CupStanding {
  playerId: string
  name: string
  points: number
  /** event wins (rank 1 at a points event) */
  wins: number
  /** events with an eligible finish */
  finishes: number
}

/**
 * The season race: Cup points across every points-paying event these rows
 * cover. Exhibitions and unknown event keys contribute nothing; ineligible
 * (sub-three-round) weeks score nothing — the floor of 5 is for FINISHERS.
 */
export function cupStandings(rows: EventScoreRow[]): CupStanding[] {
  const byEvent = new Map<string, EventScoreRow[]>()
  for (const r of rows) {
    const list = byEvent.get(r.event_key) ?? []
    list.push(r)
    byEvent.set(r.event_key, list)
  }
  const totals = new Map<string, CupStanding>()
  for (const [key, eventRows] of byEvent) {
    const event = eventForKey(key)
    if (!event || !paysPoints(event)) continue
    for (const s of eventStandings(eventRows)) {
      if (!s.eligible || !s.rank) continue
      const t = totals.get(s.playerId) ?? { playerId: s.playerId, name: s.name, points: 0, wins: 0, finishes: 0 }
      t.points += cupPoints(s.rank, event.major)
      t.wins += s.rank === 1 ? 1 : 0
      t.finishes += 1
      t.name = s.name
      totals.set(s.playerId, t)
    }
  }
  return [...totals.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name))
}
