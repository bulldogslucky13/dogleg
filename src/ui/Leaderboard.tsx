import { useEffect, useRef, useState } from 'react'
import { characterById } from '../engine/characters'
import { Spinner } from './Spinner'
import { toParLabel } from '../engine/daily'
import { backendEnabled } from '../lib/backend'
import {
  fetchCourseRecords,
  fetchDailyBoard,
  loadPlayer,
  submitRound,
  type BoardRow,
  type CourseRecord,
  type SubmitResult,
} from '../lib/leaderboard'
import { recordWon, type StolenRecord } from '../lib/records'
import { markArchiveRecord, roundToPar, type RoundState } from '../state/store'
import { courseBySlug } from '../engine/courses'
import { identifyPlayer, track } from '../lib/analytics'
import { RecordSplash } from './RecordSplash'
import { SyncCta } from './RoundsScreen'

/**
 * Post-round leaderboard block. Daily rounds land on today's board; practice
 * rounds contend for the course record. First-time players pick a clubhouse
 * name inline — no account, the device remembers them.
 */
export function ScoreBoard(props: { round: RoundState }) {
  const { round } = props
  const [player, setPlayer] = useState(loadPlayer)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [board, setBoard] = useState<BoardRow[] | null>(null)
  /** set when this round took BACK a record that had been stolen from us */
  const [reclaim, setReclaim] = useState<StolenRecord | null>(null)
  /** the standing record, fetched for unnamed players so beating it can
   * become the claim-a-name moment */
  const [standing, setStanding] = useState<CourseRecord | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const sent = useRef(false)

  const refreshBoard = async () => {
    if (round.mode === 'daily') setBoard(await fetchDailyBoard(round.dateKey))
  }

  const submit = async (pickedName?: string) => {
    setBusy(true)
    setError(null)
    const r = await submitRound(round, pickedName)
    setBusy(false)
    if (!r.ok) {
      setError(r.error ?? 'something went sideways')
      return
    }
    setResult(r)
    const named = loadPlayer()
    setPlayer(named)
    // naming yourself on a card is the app's core conversion — a device with a
    // clubhouse name is a returning, ranked player. Fire it before the record
    // bookkeeping so a name-claim always registers.
    if (pickedName && !player) {
      track('clubhouse_name_claimed', { via: 'board', mode: round.mode })
      // just became a known player — attach their events to the stable id
      if (named) identifyPlayer(named.id, named.name)
    }
    let reclaimed = false
    if (r.record?.broken) {
      markArchiveRecord(round.seed) // pin it in the locker forever
      // ledger: this record is ours now — and if it had been stolen from
      // us, that's a RECLAIM, which deserves its own moment
      const stolen = recordWon(round.courseSlug, r.record.toPar)
      if (stolen) {
        setReclaim(stolen)
        reclaimed = true
      }
    }
    // the untracked conversion: a round actually WRITTEN to a board. Only
    // count real writes, so the metric isn't inflated by no-op submits:
    //  - daily: every non-duplicate post lands on today's board (a returning
    //    player re-opening today's card auto-submits again → duplicate: true,
    //    skip it)
    //  - practice: the round only writes when it breaks the course record;
    //    ordinary practice completions submit for validation but write nothing
    const wroteToBoard = round.mode === 'daily' ? !r.duplicate : !!r.record?.broken
    if (wroteToBoard) {
      track('board_submitted', {
        mode: round.mode,
        course: round.courseSlug,
        to_par: roundToPar(round),
        named: !!(pickedName || player),
        is_record: !!r.record?.broken,
        reclaim: reclaimed,
        rank: r.rank ?? null,
      })
    }
    void refreshBoard()
  }

  // returning players post automatically; the board shows either way
  useEffect(() => {
    if (!backendEnabled) return
    void refreshBoard()
    if (player && !sent.current && round.complete) {
      sent.current = true
      void submit()
    }
    // an unnamed player's practice round might have beaten the standing
    // record — fetch it so the claim form can say so
    if (!player && round.mode === 'practice') {
      void fetchCourseRecords().then((recs) => setStanding(recs?.get(round.courseSlug) ?? null))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!backendEnabled) return null

  const nameForm = !player && !result && (
    <form
      className="name-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim().length >= 2) void submit(name.trim())
      }}
    >
      <input
        ref={nameInputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Clubhouse name"
        maxLength={18}
        aria-label="Clubhouse name"
        disabled={busy}
      />
      <button className="cta slim" disabled={busy || name.trim().length < 2} type="submit">
        {busy ? (
          <>
            <Spinner />
            Posting…
          </>
        ) : round.mode === 'daily' ? (
          'Post my card'
        ) : (
          'Claim records'
        )}
      </button>
    </form>
  )

  if (round.mode === 'practice') {
    const rec = result?.record
    // an unnamed player just outscored the standing record (or set the first
    // one) — beating it is the natural moment to claim a name and defend it
    const beatsStanding = !player && !result && (!standing || roundToPar(round) < standing.to_par)
    return (
      <div className="board-block">
        {reclaim && (
          <RecordSplash
            courseName={courseBySlug(round.courseSlug)?.name ?? round.courseSlug}
            courseSlug={round.courseSlug}
            dateKey={round.dateKey}
            toPar={roundToPar(round)}
            character={round.character}
            takenFrom={reclaim.by}
            onClose={() => setReclaim(null)}
          />
        )}
        {rec?.broken && (
          <div className="record-banner">
            🏆 New course record — {toParLabel(rec.toPar)} by {player?.name ?? 'you'}
            {round.character ? ` ${characterById(round.character)?.emoji ?? ''}` : ''}
          </div>
        )}
        {rec && !rec.broken && (
          <p className="fine">
            Course record: {toParLabel(rec.toPar)} ·{' '}
            {rec.character ? `${characterById(rec.character)?.emoji ?? ''} ` : ''}
            {rec.holder}
          </p>
        )}
        {nameForm && (
          <>
            <div className="kicker">Course records</div>
            {beatsStanding && standing ? (
              <SyncCta
                copy={`That round beats ${standing.player_name}'s course record — claim a clubhouse name to take it and defend it.`}
                trigger="record-claim"
                onTap={() => nameInputRef.current?.focus()}
              />
            ) : (
              <p className="fine">Pick a clubhouse name to claim course records with your rounds.</p>
            )}
            {nameForm}
          </>
        )}
        {error && <p className="fine board-error">{error}</p>}
      </div>
    )
  }

  return (
    <div className="board-block">
      <div className="kicker">Today's board</div>
      {player && busy && (
        <p className="fine">
          <Spinner />
          Posting your card…
        </p>
      )}
      {result?.rank && (
        <p className="board-rank">
          You're <b>{ordinal(result.rank)}</b> of {result.total} so far today
        </p>
      )}
      {nameForm && (
        <>
          <p className="fine">Put a name on your card and join the daily board — no account needed.</p>
          {nameForm}
        </>
      )}
      {error && <p className="fine board-error">{error}</p>}
      {board && board.length > 0 && (
        <ol className="board-list">
          {board.slice(0, 10).map((row, i) => (
            <li key={`${row.player_name}:${i}`} className={player && row.player_name === player.name ? 'me' : ''}>
              <span className="board-pos">{i + 1}</span>
              <span className="board-name">
                {row.player_name}
                {row.character ? ` ${characterById(row.character)?.emoji ?? ''}` : ''}
              </span>
              <b className="board-score">{toParLabel(row.to_par)}</b>
            </li>
          ))}
        </ol>
      )}
      {board && board.length === 0 && !result && <p className="fine">Nobody's posted yet — be first.</p>}
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/**
 * Read-only daily board, shown when today's card is re-opened but the full
 * round is no longer in memory — e.g. a practice round replaced the single
 * round slot, or a refreshed device only holds the day's history entry. The
 * card was already posted when the round finished, so there's nothing to
 * submit here; the standings just need to still be there.
 */
export function DailyBoardView(props: { dateKey: string }) {
  const [board, setBoard] = useState<BoardRow[] | null>(null)
  const player = loadPlayer()

  useEffect(() => {
    if (!backendEnabled) return
    let cancelled = false
    void fetchDailyBoard(props.dateKey).then((rows) => {
      if (!cancelled) setBoard(rows)
    })
    return () => {
      cancelled = true
    }
  }, [props.dateKey])

  if (!backendEnabled) return null

  return (
    <div className="board-block">
      <div className="kicker">Today's board</div>
      {!board && (
        <p className="fine">
          <Spinner />
          Loading the board…
        </p>
      )}
      {board && board.length > 0 && (
        <ol className="board-list">
          {board.slice(0, 10).map((row, i) => (
            <li key={`${row.player_name}:${i}`} className={player && row.player_name === player.name ? 'me' : ''}>
              <span className="board-pos">{i + 1}</span>
              <span className="board-name">
                {row.player_name}
                {row.character ? ` ${characterById(row.character)?.emoji ?? ''}` : ''}
              </span>
              <b className="board-score">{toParLabel(row.to_par)}</b>
            </li>
          ))}
        </ol>
      )}
      {board && board.length === 0 && <p className="fine">Nobody's posted yet — be first.</p>}
    </div>
  )
}
