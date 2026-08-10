import { useEffect, useState } from 'react'
import { characterById } from '../engine/characters'
import { courseBySlug } from '../engine/courses'
import { localDateKey, toParLabel } from '../engine/daily'
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
import { track } from '../lib/analytics'
import { backendEnabled } from '../lib/backend'
import {
  cupStandings,
  eventStandings,
  fetchCupSeasonScores,
  fetchEventScores,
  hasPostedCupRound,
  type EventStanding,
} from '../lib/cup'
import { loadPlayer } from '../lib/leaderboard'
import { Wordmark } from './Wordmark'

/** weekday name for an event's round day, for copy like "through Sunday" */
const DAY_LABEL = ['Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * The Teebox's Cup surface: the live event card during an event week (with
 * the disclosed firming-up arc and the day's CTA), the next-event teaser
 * between weeks, and the expandable event board / season standings.
 */
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
    return (
      <div className="cup-tease">
        <span className="cup-tease-kicker">🏆 DogLeg Cup</span>
        <span>
          {next.name} · tees off {next.start.slice(5).replace('-', '/')}
        </span>
      </div>
    )
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
        <button className="cta notched" onClick={() => setShowBoard((v) => !v)}>
          Round {day} posted ✓<span className="cta-sub">{showBoard ? 'Hide the board' : 'See the board'}</span>
        </button>
      ) : (
        <button className="cta" onClick={props.onTee}>
          Tee off in the Cup
          <span className="cta-sub">Best 3 of 4 rounds count · one attempt today</span>
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

function StandingRow(props: { s: EventStanding; me: boolean }) {
  const { s } = props
  return (
    <li className={`${props.me ? 'me' : ''}${s.eligible ? '' : ' cup-partial'}`}>
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

/** The event's best-3-of-4 board. Fetched fresh on mount; a failed fetch says
 * so rather than pretending the field is empty. */
export function CupEventBoard(props: { event: CupEvent }) {
  const [standings, setStandings] = useState<EventStanding[] | null | 'error'>(null)
  useEffect(() => {
    let liveFetch = true
    void fetchEventScores(props.event.key).then((rows) => {
      if (liveFetch) setStandings(rows === null ? 'error' : eventStandings(rows))
    })
    return () => {
      liveFetch = false
    }
  }, [props.event.key])
  if (!backendEnabled) return null
  const myName = loadPlayer()?.name ?? null
  return (
    <div className="board-block cup-board">
      <div className="kicker">{props.event.name} · the board</div>
      <p className="fine">Best three rounds of four count. Ties go to the best single round.</p>
      {standings === null && <p className="fine">Loading the board…</p>}
      {standings === 'error' && <p className="fine">The board isn’t reachable right now — your rounds are safe.</p>}
      {Array.isArray(standings) && standings.length === 0 && (
        <p className="fine">Nobody has posted yet — the course is wide open.</p>
      )}
      {Array.isArray(standings) && standings.length > 0 && (
        <ol className="board-list cup-list">
          {standings.slice(0, 25).map((s) => (
            <StandingRow key={s.playerId} s={s} me={!!myName && s.name.toLowerCase() === myName.toLowerCase()} />
          ))}
        </ol>
      )}
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
  const myName = loadPlayer()?.name ?? null
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
            <li key={r.playerId} className={myName && r.name.toLowerCase() === myName.toLowerCase() ? 'me' : ''}>
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
 * event that ended in the last three days, that this device posted at least
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

/** Full-screen podium splash: the final board's top three and your line. */
export function CupPodiumSplash(props: { event: CupEvent; onClose: () => void }) {
  const [standings, setStandings] = useState<EventStanding[] | null>(null)
  useEffect(() => {
    void fetchEventScores(props.event.key).then((rows) => {
      if (rows === null) {
        // no board, no ceremony — try again next landing, don't block home
        props.onClose()
        return
      }
      setStandings(eventStandings(rows))
      track('cup_podium_shown', { event: props.event.key })
    })
    // fetch once for THIS event — onClose identity is irrelevant to the data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.event.key])
  if (!standings) return null
  const podium = standings.filter((s) => s.eligible).slice(0, 3)
  const myName = loadPlayer()?.name ?? null
  const me = myName ? standings.find((s) => s.name.toLowerCase() === myName.toLowerCase()) : null
  const medal = ['🥇', '🥈', '🥉']
  return (
    <div className="cup-podium-splash" role="dialog" aria-label="Final Cup standings">
      <div className="cup-podium-card">
        <Wordmark className="result-wordmark" />
        <div className="kicker">🏆 {props.event.name} · final</div>
        {podium.length === 0 ? (
          <p className="verdict">Nobody finished three rounds — the course keeps this one.</p>
        ) : (
          <ol className="cup-podium-list">
            {podium.map((s, i) => (
              <li key={s.playerId}>
                <span className="cup-medal">{medal[(s.rank ?? i + 1) - 1] ?? medal[i]}</span>
                <span className="board-name">{s.name}</span>
                <b className="board-score">{toParLabel(s.total!)}</b>
              </li>
            ))}
          </ol>
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
