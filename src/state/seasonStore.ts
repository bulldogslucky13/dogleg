import { previousSeason, seasonForDate, type Season } from '../engine/season'
import { fetchSeasonRecords, loadPlayer } from '../lib/leaderboard'
import { loadRoundLog, type LoggedRound } from './stats'

/**
 * Client-side season bookkeeping: the once-per-rollover splash ack, the
 * podium math, and the permanent awards shelf — all derived from the
 * immutable season_records rows of PAST seasons (a finished season's rows
 * never change again, which is what makes awards safe to cache forever).
 */

/** the first season that ever existed — the game launched July 19, 2026 */
export const FIRST_SEASON_KEY = '2026-q2-summer'

const ACK_KEY = 'dogleg:season-ack:v1'
const AWARDS_KEY = 'dogleg:season-awards:v1'

export function ackedSeasonKey(): string | null {
  try {
    return localStorage.getItem(ACK_KEY)
  } catch {
    return null
  }
}

/** The splash shows once per season change — including a player's first-ever
 * open (the splash doubles as the seasons explainer). */
export function needsSeasonSplash(now: Date = new Date()): boolean {
  return ackedSeasonKey() !== seasonForDate(now).key
}

export function ackSeason(now: Date = new Date()): void {
  try {
    localStorage.setItem(ACK_KEY, seasonForDate(now).key)
  } catch {
    /* private mode */
  }
}

export interface SeasonHolderRow {
  courseSlug: string
  playerName: string
  toPar: number
}

export interface PodiumEntry {
  playerName: string
  records: number
  /** 1-based placement */
  place: number
}

/** every season from launch up to (not including) the given one, oldest first */
export function pastSeasons(current: Season): Season[] {
  const out: Season[] = []
  let cursor = previousSeason(current)
  let guard = 0
  while (cursor.key >= FIRST_SEASON_KEY && guard++ < 80) {
    out.unshift(cursor)
    if (cursor.key === FIRST_SEASON_KEY) break
    cursor = previousSeason(cursor)
  }
  return out
}

/** the finished season's holder list, newest-best ordering left to callers */
export async function fetchSeasonBoard(seasonKey: string): Promise<SeasonHolderRow[] | null> {
  const map = await fetchSeasonRecords(seasonKey)
  if (!map) return null
  return [...map.entries()].map(([courseSlug, r]) => ({
    courseSlug,
    playerName: r.player_name,
    toPar: r.to_par,
  }))
}

/** most records held wins; best single round breaks ties */
export function podium(rows: SeasonHolderRow[], top = 3): PodiumEntry[] {
  const byPlayer = new Map<string, { name: string; records: number; best: number }>()
  for (const r of rows) {
    const key = r.playerName.toLowerCase()
    const cur = byPlayer.get(key) ?? { name: r.playerName, records: 0, best: 99 }
    cur.records += 1
    cur.best = Math.min(cur.best, r.toPar)
    byPlayer.set(key, cur)
  }
  return [...byPlayer.values()]
    .sort((a, b) => b.records - a.records || a.best - b.best)
    .slice(0, top)
    .map((p, i) => ({ playerName: p.name, records: p.records, place: i + 1 }))
}

export interface SeasonAward {
  seasonKey: string
  seasonLabel: string
  /** courses this player ended the season holding */
  courses: SeasonHolderRow[]
  /** podium placement, when they made it (1-3) */
  place: number | null
}

interface AwardCache {
  v: 1
  /** the clubhouse name (lowercased) these awards were folded for — a device
   * that adopts a different synced identity must not inherit them */
  player: string | null
  /** last PAST season folded into the cache */
  through: string | null
  awards: SeasonAward[]
}

function emptyAwards(player: string | null): AwardCache {
  return { v: 1, player, through: null, awards: [] }
}

function readAwards(me: string): AwardCache {
  try {
    const raw = localStorage.getItem(AWARDS_KEY)
    if (raw) {
      const j = JSON.parse(raw) as AwardCache
      // a cache built for another player (or a pre-scoping cache with no
      // player at all) is discarded — refetching past seasons is cheap and
      // the immutable rows make the rebuild identical every time
      if (j?.v === 1 && j.player === me) return j
    }
  } catch {
    /* fall through */
  }
  return emptyAwards(me)
}

/**
 * The permanent shelf: every past season where this player ended holding
 * season records. Computed once per finished season from its immutable rows,
 * then cached forever — a future season resetting the live boards can never
 * take a past award away.
 */
export async function seasonAwards(now: Date = new Date()): Promise<SeasonAward[]> {
  const me = loadPlayer()?.name?.toLowerCase() ?? null
  // no clubhouse name → no awards are attributable to this device
  if (!me) return []
  const cache = readAwards(me)
  const past = pastSeasons(seasonForDate(now))
  const pending = past.filter((s) => cache.through === null || s.key > cache.through)
  for (const season of pending) {
    const rows = await fetchSeasonBoard(season.key)
    if (!rows) return cache.awards // offline — retry next open, cache unchanged
    const mine = rows.filter((r) => r.playerName.toLowerCase() === me)
    const placeEntry = podium(rows).find((p) => p.playerName.toLowerCase() === me)
    if (mine.length > 0) {
      cache.awards.push({
        seasonKey: season.key,
        seasonLabel: season.label,
        courses: mine.sort((a, b) => a.toPar - b.toPar),
        place: placeEntry?.place ?? null,
      })
    }
    cache.through = season.key
  }
  try {
    localStorage.setItem(AWARDS_KEY, JSON.stringify(cache))
  } catch {
    /* private mode */
  }
  return cache.awards
}

/** this player's rounds that fell inside a season, from the local round log */
export function roundsInSeason(season: Season, log: LoggedRound[] = loadRoundLog()): LoggedRound[] {
  return log.filter((r) => r.playedAt >= season.startsAt && r.playedAt < season.endsAt)
}
