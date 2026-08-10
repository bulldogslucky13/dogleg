import { useEffect, useRef, useState } from 'react'
import { characterById } from '../engine/characters'
import { courseBySlug } from '../engine/courses'
import { localDateKey, RESULT_SQUARE, toParLabel } from '../engine/daily'
import {
  activeEvent,
  CUP_SEASON_START,
  DOGLEG_CUP,
  eventDateKeys,
  eventPlayable,
  nextEvent,
  paysPoints,
  type CupEvent,
} from '../engine/events'
import type { ReplayPayload } from '../engine/replay'
import { track } from '../lib/analytics'
import { backendEnabled } from '../lib/backend'
import {
  cupStandings,
  eventStandings,
  fetchCupSeasonScores,
  fetchEventScores,
  hasPostedCupRound,
  recordCupTrophy,
  type EventScoreRow,
  type EventStanding,
} from '../lib/cup'
import { loadPlayer } from '../lib/leaderboard'
import { Wordmark } from './Wordmark'

/** weekday name for an event's round day, for copy like "through Sunday" */
const DAY_LABEL = ['Thursday', 'Friday', 'Saturday', 'Sunday']

function isMe(name: string): boolean {
  const mine = loadPlayer()?.name
  return !!mine && name.toLowerCase() === mine.toLowerCase()
}

// ---------------------------------------------------------------------------
// The clock to the next round — ticks live, like a broadcast bug
// ---------------------------------------------------------------------------

function countdownTo(target: number): { d: number; h: string; m: string; s: string } {
  const left = Math.max(0, target - Date.now())
  const pad = (n: number) => `${Math.floor(n)}`.padStart(2, '0')
  return {
    d: Math.floor(left / 86_400_000),
    h: pad((left / 3_600_000) % 24),
    m: pad((left / 60_000) % 60),
    s: pad((left / 1000) % 60),
  }
}

function nextRoundParts(): { h: string; m: string; s: string } {
  const now = new Date()
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const t = countdownTo(midnight.getTime())
  return { h: `${t.d * 24 + Number(t.h)}`.padStart(2, '0'), m: t.m, s: t.s }
}

/** "Round 3 tees off in 07:41:22" — the next round opens at local midnight,
 * exactly when today's attempt expires. Sunday posted → the horn line. */
function NextRoundClock(props: { day: number }) {
  const [t, setT] = useState(nextRoundParts)
  useEffect(() => {
    const timer = setInterval(() => setT(nextRoundParts()), 1000)
    return () => clearInterval(timer)
  }, [])
  if (props.day >= 4) {
    return <p className="fine cup-clock-line">That's the tournament — the podium comes at the horn.</p>
  }
  return (
    <p className="fine cup-clock-line" role="timer" aria-label={`Round ${props.day + 1} tees off in ${t.h} hours ${t.m} minutes`}>
      Round {props.day + 1} tees off in{' '}
      <b className="cup-clock">
        {t.h}:{t.m}:{t.s}
      </b>
    </p>
  )
}

// ---------------------------------------------------------------------------
// The Teebox card
// ---------------------------------------------------------------------------

export function CupHomeCard(props: {
  /** start a Cup round (already stale-gated by the caller) */
  onTee: () => void
}) {
  const today = localDateKey()
  const live = activeEvent(today)
  const [showBoard, setShowBoard] = useState(false)
  const [showStandings, setShowStandings] = useState(false)
  if (!live) {
    const next = nextEvent(today)
    if (!next) return null
    return <CupNextCard event={next} />
  }
  const { event, day } = live
  const course = courseBySlug(event.courseSlug)
  const posted = hasPostedCupRound(event.key, day)
  return (
    <div className={`cup-card${event.major ? ' major' : ''}`}>
      <div className="kicker">
        🏆 {event.major ? 'DogLeg Cup · Major week' : 'DogLeg Cup'}
        {event.exhibition ? ' · Exhibition' : ''}
      </div>
      <h2>{event.name}</h2>
      <p className="cup-round-line">
        Round {day} of 4 · {DAY_LABEL[day - 1]}
        {course ? ` · ${course.name}` : ''}
      </p>
      {/* the arc, disclosed — a deliberately harder Sunday stays inside
          "the odds never lie" only because this line says it out loud */}
      <p className="fine cup-arc">
        {day === 4
          ? 'Sunday setup: firmest greens, stiffest wind. This is the hard one.'
          : day === 3
            ? 'The weekend bite is in: tougher setup, wind up another notch.'
            : 'The course firms up through the weekend — Sunday plays hardest.'}
      </p>
      {posted ? (
        <>
          <button className="cta notched" onClick={() => setShowBoard((v) => !v)}>
            Round {day} posted ✓<span className="cta-sub">{showBoard ? 'Hide the board' : 'See the board'}</span>
          </button>
          <NextRoundClock day={day} />
        </>
      ) : (
        <button className="cta" onClick={props.onTee}>
          Tee off in the Cup
          <span className="cta-sub">Best 3 of 4 Rounds – One Attempt per Day</span>
        </button>
      )}
      {!posted && (
        <button className="cta ghost slim-cup" onClick={() => setShowBoard((v) => !v)}>
          {showBoard ? 'Hide the board' : 'Event board'}
        </button>
      )}
      {showBoard && (
        <>
          <CupEventBoard event={event} />
          {!event.exhibition && (
            <button className="cta ghost slim-cup" onClick={() => setShowStandings((v) => !v)}>
              {showStandings ? 'Hide Cup standings' : 'Cup standings'}
            </button>
          )}
          {showStandings && !event.exhibition && <CupStandingsList />}
        </>
      )}
    </div>
  )
}

/**
 * Between tournaments the Cup slot builds anticipation instead of going
 * quiet: the NEXT event's full billing — name, course, dates, the major
 * tag — over a live countdown to its first tee, with the season standings
 * one tap away.
 */
function CupNextCard(props: { event: CupEvent }) {
  const { event } = props
  const [showStandings, setShowStandings] = useState(false)
  const [y, m, d] = event.start.split('-').map(Number)
  const firstTee = new Date(y, m - 1, d).getTime()
  const [t, setT] = useState(() => countdownTo(firstTee))
  useEffect(() => {
    const timer = setInterval(() => setT(countdownTo(firstTee)), 1000)
    return () => clearInterval(timer)
  }, [firstTee])
  const course = courseBySlug(event.courseSlug)
  const par = course?.holes.reduce((s, h) => s + h.par, 0)
  const sunday = eventDateKeys(event)[3]
  const dates = `Thu ${event.start.slice(5).replace('-', '/')} – Sun ${sunday.slice(5).replace('-', '/')}`
  return (
    <div className={`cup-card${event.major ? ' major' : ''}`}>
      <div className="kicker">
        🏆 Next on the DogLeg Cup{event.major ? ' · Major' : ''}
        {event.exhibition ? ' · Exhibition' : ''}
      </div>
      <h2>{event.name}</h2>
      <p className="cup-round-line">
        {course ? `${course.name} · ${course.location}${par ? ` · Par ${par}` : ''}` : event.courseSlug}
      </p>
      <p className="fine cup-arc">{dates} · four rounds, best three count</p>
      <p className="cup-clock-line cup-next-clock" role="timer" aria-label={`First tee in ${t.d} days`}>
        First tee in{' '}
        <b className="cup-clock">
          {t.d > 0 ? `${t.d}d ` : ''}
          {t.h}:{t.m}:{t.s}
        </b>
      </p>
      <button className="cta ghost slim-cup" onClick={() => setShowStandings((v) => !v)}>
        {showStandings ? 'Hide Cup standings' : 'DogLeg Cup standings'}
      </button>
      {showStandings && <CupStandingsList />}
    </div>
  )
}

/**
 * The points line on the Clubhouse trophy shelf: where the player stands in
 * the season-long race, with the full standings one tap below. The Cup's
 * money number lives with the rest of the hardware.
 */
export function CupPointsShelf() {
  const [mine, setMine] = useState<{ points: number; rank: number; total: number } | 'none' | 'loading'>('loading')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const today = localDateKey()
    const keys = DOGLEG_CUP.filter((e) => eventPlayable(e) && paysPoints(e) && e.start <= today).map((e) => e.key)
    if (keys.length === 0) {
      setMine('none')
      return
    }
    let liveFetch = true
    void fetchCupSeasonScores(keys).then((rows) => {
      if (!liveFetch) return
      if (!rows) {
        setMine('none')
        return
      }
      const standings = cupStandings(rows)
      const idx = standings.findIndex((s) => isMe(s.name))
      setMine(idx === -1 ? 'none' : { points: standings[idx].points, rank: idx + 1, total: standings.length })
    })
    return () => {
      liveFetch = false
    }
  }, [])
  if (!backendEnabled) return null
  return (
    <div className="cup-points-shelf">
      <button className="cup-points-line" onClick={() => setOpen((v) => !v)}>
        <span className="kicker">🏆 DogLeg Cup points</span>
        <b>
          {mine === 'loading'
            ? '…'
            : mine === 'none'
              ? '0 pts'
              : `${mine.points.toLocaleString()} pts · ${mine.rank} of ${mine.total}`}
        </b>
        <span className="cup-trophy-toggle" aria-hidden>
          {open ? '–' : '+'}
        </span>
      </button>
      {open && <CupStandingsList />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The event board — tournament standings, top ten with ties, expandable
// ---------------------------------------------------------------------------

function StandingRow(props: { s: EventStanding; meRef?: (el: HTMLLIElement | null) => void }) {
  const { s } = props
  const me = isMe(s.name)
  return (
    <li ref={me ? props.meRef : undefined} className={`${me ? 'me' : ''}${s.eligible ? '' : ' cup-partial'}`}>
      <span className={`board-pos${s.rank && s.rank <= 3 ? ` medal-${s.rank}` : ''}`}>{s.rank ?? '·'}</span>
      <span className="board-name">
        {s.name}
        {s.character ? ` ${characterById(s.character)?.emoji ?? ''}` : ''}
      </span>
      <span className="cup-rounds">
        {s.rounds.map((r, i) => (
          <em key={i} className="cup-round-cell">
            {r === null ? '–' : toParLabel(r)}
          </em>
        ))}
      </span>
      <b className="board-score">{s.eligible ? toParLabel(s.total!) : `${s.played} of 3`}</b>
    </li>
  )
}

/**
 * The event's board — ALWAYS tournament standings (best three of four),
 * never a single round's. Collapsed it shows the top ten (ties included);
 * Expand opens the full field on one scrollable screen, jumped straight to
 * the player's own row. Hosts with their own status lines (the wrap's
 * ScoreBoard) pass them as `head` so there is exactly ONE block, one kicker.
 */
export function CupEventBoard(props: {
  event: CupEvent
  title?: string
  head?: React.ReactNode
  /** bump to refetch — the wrap bumps it when the round finishes posting,
   * so the player's fresh row is on the board they're looking at */
  refreshKey?: number
}) {
  const [standings, setStandings] = useState<EventStanding[] | null | 'error'>(null)
  const [expanded, setExpanded] = useState(false)
  const meRow = useRef<HTMLLIElement | null>(null)
  useEffect(() => {
    let liveFetch = true
    void fetchEventScores(props.event.key).then((rows) => {
      if (liveFetch) setStandings(rows === null ? 'error' : eventStandings(rows))
    })
    return () => {
      liveFetch = false
    }
  }, [props.event.key, props.refreshKey])
  // the expand's whole promise: land ON your row, not at the top of a list
  useEffect(() => {
    if (expanded) meRow.current?.scrollIntoView({ block: 'center' })
  }, [expanded])
  if (!backendEnabled) return null

  let body: React.ReactNode = null
  if (standings === null) body = <p className="fine">Loading the board…</p>
  else if (standings === 'error') body = <p className="fine">The board isn’t reachable right now — your rounds are safe.</p>
  else if (standings.length === 0) body = <p className="fine">Nobody has posted yet — the course is wide open.</p>
  else {
    // top ten with ties: everyone holding rank ten or better stays; partial
    // cards fill remaining room so the path to a total is always visible
    const ranked = standings.filter((s) => (s.rank ?? Infinity) <= 10)
    const visible = expanded ? standings : ranked.length >= 10 ? ranked : standings.slice(0, Math.max(10, ranked.length))
    const truncated = !expanded && visible.length < standings.length
    body = (
      <>
        <ol className={`board-list cup-list${expanded ? ' cup-full-board' : ''}`}>
          {visible.map((s) => (
            <StandingRow key={s.playerId} s={s} meRef={(el) => (meRow.current = el ?? meRow.current)} />
          ))}
        </ol>
        {truncated && (
          <button className="cup-expand" onClick={() => setExpanded(true)}>
            Expand leaderboard · all {standings.length} players ›
          </button>
        )}
        {expanded && (
          <button className="cup-expand" onClick={() => setExpanded(false)}>
            Collapse ‹
          </button>
        )}
      </>
    )
  }

  return (
    <div className="board-block cup-board">
      <div className="kicker">{props.title ?? `${props.event.name} · the board`}</div>
      {props.head}
      <p className="fine">Best three rounds of four count. Ties go to the best single round.</p>
      {body}
    </div>
  )
}

/** The season race: Cup points across every points event played so far. */
export function CupStandingsList() {
  const [rows, setRows] = useState<ReturnType<typeof cupStandings> | null | 'error'>(null)
  useEffect(() => {
    const today = localDateKey()
    const keys = DOGLEG_CUP.filter((e) => eventPlayable(e) && paysPoints(e) && e.start <= today).map((e) => e.key)
    let liveFetch = true
    void fetchCupSeasonScores(keys).then((r) => {
      if (liveFetch) setRows(r === null ? 'error' : cupStandings(r))
    })
    return () => {
      liveFetch = false
    }
  }, [])
  if (!backendEnabled) return null
  return (
    <div className="board-block cup-board">
      <div className="kicker">DogLeg Cup · season standings</div>
      <p className="fine">Points at every Cup event since {CUP_SEASON_START} — 500 a win, 600 at a major.</p>
      {rows === null && <p className="fine">Loading the standings…</p>}
      {rows === 'error' && <p className="fine">The standings aren’t reachable right now.</p>}
      {Array.isArray(rows) && rows.length === 0 && <p className="fine">The season race hasn’t scored yet.</p>}
      {Array.isArray(rows) && rows.length > 0 && (
        <ol className="board-list">
          {rows.slice(0, 20).map((r, i) => (
            <li key={r.playerId} className={isMe(r.name) ? 'me' : ''}>
              <span className={`board-pos${i < 3 ? ` medal-${i + 1}` : ''}`}>{i + 1}</span>
              <span className="board-name">{r.name}</span>
              <span className="cup-wins">{r.wins > 0 ? `${r.wins}W` : ''}</span>
              <b className="board-score">{r.points.toLocaleString()} pts</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The Sunday-night podium — the trophy moment after an event you played ends
// ---------------------------------------------------------------------------

const PODIUM_ACK_KEY = 'dogleg:cup-podium-ack:v1'

function ackedPodiums(): Set<string> {
  try {
    const raw = localStorage.getItem(PODIUM_ACK_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function ackPodium(eventKey: string): void {
  try {
    localStorage.setItem(PODIUM_ACK_KEY, JSON.stringify([...ackedPodiums(), eventKey].slice(-40)))
  } catch {
    /* private mode */
  }
}

/** The event whose podium this device is owed: the most recent playable
 * event that ended in the last few days, that this device posted at least
 * one round to, and hasn't been shown yet. */
export function podiumDue(today = localDateKey()): CupEvent | null {
  const acked = ackedPodiums()
  const candidates = DOGLEG_CUP.filter((e) => {
    if (!eventPlayable(e) || acked.has(e.key)) return false
    const sunday = eventDateKeys(e)[3]
    if (!(sunday < today)) return false // still running (or not begun)
    // ended within the last few days — an old podium is history, not news
    const age = (Date.parse(today) - Date.parse(sunday)) / 86_400_000
    if (age > 4) return false
    return [1, 2, 3, 4].some((day) => hasPostedCupRound(e.key, day))
  })
  if (!candidates.length) return null
  return candidates.reduce((a, b) => (a.start >= b.start ? a : b))
}

/** one finisher's four rounds, expandable to scorecards and replays */
function PodiumRounds(props: { rows: EventScoreRow[]; onWatch?: (p: ReplayPayload) => void }) {
  const byDay = [1, 2, 3, 4].map((d) => props.rows.find((r) => r.day === d) ?? null)
  return (
    <div className="cup-podium-rounds">
      {byDay.map((row, i) =>
        row ? (
          <div key={i} className="cup-podium-round">
            <span className="cup-podium-round-day">
              R{i + 1} · {DAY_LABEL[i]}
            </span>
            <span className="cup-podium-round-score">{toParLabel(row.to_par)}</span>
            {Array.isArray(row.results) && row.results.length > 0 && (
              <span className="faceoff-squares cup-podium-squares">
                <span>{row.results.slice(0, 9).map((r) => RESULT_SQUARE[r]).join('')}</span>
                <span>{row.results.slice(9).map((r) => RESULT_SQUARE[r]).join('')}</span>
              </span>
            )}
            {props.onWatch && row.seed && row.decisions && (
              <button
                className="cta ghost slim-cup"
                onClick={() =>
                  props.onWatch!({
                    seed: row.seed!,
                    character: row.character ?? undefined,
                    decisions: row.decisions!,
                    name: row.player_name,
                  })
                }
              >
                ▶ Watch this round
              </button>
            )}
          </div>
        ) : (
          <div key={i} className="cup-podium-round">
            <span className="cup-podium-round-day">
              R{i + 1} · {DAY_LABEL[i]}
            </span>
            <span className="cup-podium-round-score">–</span>
          </div>
        ),
      )}
    </div>
  )
}

/** Full-screen podium: the final board's top three, the champion's four
 * rounds (expandable to scorecards and replays), and your own line. */
export function CupPodiumSplash(props: {
  event: CupEvent
  onClose: () => void
  /** open a finisher's round in the replay viewer */
  onWatch?: (p: ReplayPayload) => void
}) {
  const [standings, setStandings] = useState<EventStanding[] | null>(null)
  const [rows, setRows] = useState<EventScoreRow[]>([])
  const [showWinner, setShowWinner] = useState(false)
  useEffect(() => {
    void fetchEventScores(props.event.key).then((fetched) => {
      if (fetched === null) {
        // no board, no ceremony — try again next landing, don't block home
        props.onClose()
        return
      }
      const s = eventStandings(fetched)
      setRows(fetched)
      setStandings(s)
      track('cup_podium_shown', { event: props.event.key })
      // the ceremony doubles as the trophy engraver: whatever THIS device's
      // player finished, the Clubhouse Trophy Room remembers it
      const mine = s.find((x) => isMe(x.name))
      if (mine) recordCupTrophy(props.event, mine)
    })
    // fetch once for THIS event — onClose identity is irrelevant to the data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.event.key])
  if (!standings) return null
  const podium = standings.filter((s) => s.eligible).slice(0, 3)
  const champion = podium[0] ?? null
  const me = standings.find((s) => isMe(s.name)) ?? null
  const medal = ['🥇', '🥈', '🥉']
  return (
    <div className="cup-podium-splash" role="dialog" aria-label="Final Cup standings">
      <div className="cup-podium-card">
        <Wordmark className="result-wordmark" />
        <div className="kicker">🏆 {props.event.name} · Final</div>
        {podium.length === 0 ? (
          <p className="verdict">Nobody finished three rounds — the course keeps this one.</p>
        ) : (
          <>
            <ol className="cup-podium-list">
              {podium.map((s, i) => (
                <li key={s.playerId}>
                  <span className="cup-medal">{medal[(s.rank ?? i + 1) - 1] ?? medal[i]}</span>
                  <span className="board-name">
                    {s.name}
                    {s.character ? ` ${characterById(s.character)?.emoji ?? ''}` : ''}
                  </span>
                  <b className="board-score">{toParLabel(s.total!)}</b>
                </li>
              ))}
            </ol>
            {champion && (
              <>
                <button className="cup-expand" onClick={() => setShowWinner((v) => !v)}>
                  {showWinner ? 'Close the winning rounds ‹' : `${champion.name}’s winning rounds ›`}
                </button>
                {showWinner && (
                  <PodiumRounds rows={rows.filter((r) => r.player_id === champion.playerId)} onWatch={props.onWatch} />
                )}
              </>
            )}
          </>
        )}
        {me && (
          <p className="verdict cup-podium-me">
            {me.eligible && me.rank
              ? me.rank <= 3
                ? 'That’s you on the podium. Signed, sealed, on the wall.'
                : `You finished ${ordinalWord(me.rank)} at ${toParLabel(me.total!)}.`
              : `${me.played} round${me.played === 1 ? '' : 's'} posted — three make a total. Next event.`}
          </p>
        )}
        <button
          className="cta"
          onClick={() => {
            ackPodium(props.event.key)
            props.onClose()
          }}
        >
          To the Teebox
        </button>
      </div>
    </div>
  )
}

function ordinalWord(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
}
