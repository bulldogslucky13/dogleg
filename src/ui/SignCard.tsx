/**
 * "Sign your scorecard" — the clubhouse name, asked for at the tee.
 *
 * WHY IT SITS HERE, AND NOWHERE EARLIER. Of players whose first daily was a
 * week ago, 42.5% ever played a second round; among those who never claimed a
 * name it was 21.5%. Meanwhile the score they shot on day one barely moves the
 * needle at all — a first round of +5 or worse actually came back MORE often
 * than a clean one. So the day-one job is not to flatter anybody, it is to
 * make them somebody, and the name was previously only obtainable by
 * FINISHING a round and posting it.
 *
 * But it is asked for AFTER the player has committed to playing, never before
 * (Jackson's call, and it is the right one): the tutorial auto-opens on a
 * first visit, and a name form stacked on top of that would be a stranger
 * demanding your details before you know what the game is. This screen only
 * renders once someone has hit Tee off — they want to play, so the ask is a
 * formality rather than a toll gate.
 *
 * It is a real scorecard on purpose, built from the same `.scorecard` /
 * `.sc-head` / `.sc-line` idiom the round screens use, showing the course and
 * pars they are about to play. Signing your card before you tee off is what
 * golfers actually do, so the one piece of friction we are adding to the top
 * of the funnel is dressed as the most ordinary thing in the sport.
 *
 * FAILS OPEN, DELIBERATELY. Clubhouse names are globally unique, so claiming
 * one needs the server — but DogLeg plays perfectly well with no backend at
 * all (ensureIdentity no-ops offline and the round runs off the unsalted
 * canonical seed). A hard gate on a network round-trip would quietly convert a
 * game you can play on a plane into one that needs signal to start. So: App
 * never shows this screen without a mintable identity and an enabled backend,
 * and if the claim itself fails on the wire the player is offered the tee
 * anyway. "You must name yourself" is the product; "you must have signal" is
 * not.
 */
import { useRef, useState } from 'react'
import type { DailySetup } from '../engine/daily'
import { claimClubhouseName, type Player } from '../lib/leaderboard'
import { track } from '../lib/analytics'
import { Spinner } from './Spinner'

/** Front nine, for the card's pars strip — nine columns is what fits a phone. */
function frontNine(setup: DailySetup) {
  return setup.course.holes.slice(0, 9)
}

export function SignCardScreen(props: {
  setup: DailySetup
  practice: boolean
  onSigned: (player: Player) => void
  /** the fail-open escape hatch — only ever offered after the wire failed */
  onPlayUnsigned: () => void
  onBack: () => void
}) {
  const { setup } = props
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** true once a claim has failed for a reason retrying won't fix on its own */
  const [wireFailed, setWireFailed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const sign = async () => {
    const wanted = name.trim()
    if (wanted.length < 2 || busy) return
    setBusy(true)
    setError(null)
    const res = await claimClubhouseName(wanted)
    setBusy(false)
    if (res.ok) {
      track('clubhouse_name_claimed', { via: 'scorecard', mode: props.practice ? 'practice' : 'daily' })
      props.onSigned(res.player)
      return
    }
    setError(res.error)
    // a name that is merely taken is worth another try; a network or identity
    // failure is not the player's problem and must not cost them the round
    if (!/taken|already/i.test(res.error)) setWireFailed(true)
    inputRef.current?.focus()
  }

  const pars = frontNine(setup)

  return (
    <div className="screen sign">
      <div className="kicker">{props.practice ? 'Unlimited play' : `Daily · ${setup.dateKey}`}</div>
      <h2>Sign your scorecard</h2>
      <p className="fine">
        Every card carries a name. Yours goes on the boards, the records and the trophies you win — no account, no
        password, just the name you want to be known by.
      </p>

      <div className="scorecard signcard">
        <div className="sc-head">
          <span>{setup.course.name}</span>
          <b>Par {setup.course.holes.reduce((t, h) => t + h.par, 0)}</b>
        </div>
        <div className="sc-line">
          <span className="sc-label">Hole</span>
          {pars.map((h) => (
            <span key={h.number}>{h.number}</span>
          ))}
        </div>
        <div className="sc-line sc-scores">
          <span className="sc-label">Par</span>
          {pars.map((h) => (
            <span key={h.number}>{h.par}</span>
          ))}
        </div>

        {/* the signature line — the point of the whole screen */}
        <label className="sign-line">
          <span className="sc-label">Player</span>
          <input
            ref={inputRef}
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void sign()
            }}
            placeholder="Your clubhouse name"
            maxLength={18}
            aria-label="Clubhouse name"
            disabled={busy}
          />
        </label>
      </div>

      {error && <p className="fine board-error">{error}</p>}

      <button className="cta" disabled={busy || name.trim().length < 2} onClick={() => void sign()}>
        {busy ? (
          <>
            <Spinner />
            Signing…
          </>
        ) : (
          'Sign and tee off'
        )}
      </button>

      {wireFailed && (
        // the honest fail-open: we could not reach the clubhouse, so the round
        // is not held hostage to it
        <button className="cta ghost" onClick={props.onPlayUnsigned}>
          Tee off without signing
        </button>
      )}
      <button className="cta ghost" onClick={props.onBack}>
        Back
      </button>
    </div>
  )
}
