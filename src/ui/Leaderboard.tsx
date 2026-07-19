import { useEffect, useRef, useState } from 'react'
import { characterById } from '../engine/characters'
import { Spinner } from './Spinner'
import { toParLabel } from '../engine/daily'
import { backendEnabled } from '../lib/backend'
import {
  fetchDailyBoard,
  loadPlayer,
  submitRound,
  type BoardRow,
  type SubmitResult,
} from '../lib/leaderboard'
import type { RoundState } from '../state/store'

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
    setPlayer(loadPlayer())
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
    return (
      <div className="board-block">
        {rec?.broken && (
          <div className="record-banner">🏆 New course record — {toParLabel(rec.toPar)} by {player?.name ?? 'you'}</div>
        )}
        {rec && !rec.broken && (
          <p className="fine">
            Course record: {toParLabel(rec.toPar)} · {rec.holder}
          </p>
        )}
        {nameForm && (
          <>
            <div className="kicker">Course records</div>
            <p className="fine">Pick a clubhouse name to claim course records with your rounds.</p>
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
