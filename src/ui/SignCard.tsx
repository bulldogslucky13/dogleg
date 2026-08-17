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
 * It is a real scorecard on purpose — printed masthead, all eighteen holes
 * broken at the turn with each nine totalled, one ruled line for the
 * signature. Signing your card before you tee off is what golfers actually do,
 * so the one piece of friction we are adding to the top of the funnel is
 * dressed as the most ordinary thing in the sport.
 *
 * It does NOT reuse the in-round `.scorecard`, which was the first attempt and
 * the wrong donor twice over: that component is a live readout of a round in
 * progress rather than blank stationery, and it hides its hole rows on phones
 * (the round screens swap in an 18-hole strip), which is why only the front
 * nine used to survive here.
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
import { Wordmark } from './Wordmark'

/**
 * One half of the card. Real scorecards break at the turn and total each nine
 * — which is also the only way eighteen columns fit a phone, so the honest
 * layout and the practical one are the same layout.
 */
function Nine(props: { holes: DailySetup['course']['holes']; turn: 'Out' | 'In' }) {
  const total = props.holes.reduce((t, h) => t + h.par, 0)
  return (
    <div className="sc-nine">
      <div className="sc-row sc-holes">
        <span className="sc-rowlabel">Hole</span>
        {props.holes.map((h) => (
          <span key={h.number}>{h.number}</span>
        ))}
        <span className="sc-turn">{props.turn}</span>
      </div>
      <div className="sc-row sc-pars">
        <span className="sc-rowlabel">Par</span>
        {props.holes.map((h) => (
          <span key={h.number}>{h.par}</span>
        ))}
        <span className="sc-turn">{total}</span>
      </div>
    </div>
  )
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
    // a taken or grammar-invalid name is worth another try; a network or
    // identity failure is not the player's problem and must not cost them
    // the round (retryable comes from the actual HTTP status, not a guess
    // at the error text — a validation typo must not read as a wire failure)
    if (!res.retryable) setWireFailed(true)
    inputRef.current?.focus()
  }

  const back = () => {
    // the write is one-way (claim-name cannot rename), so leaving mid-claim
    // would let a request that lands after unmount silently name the player
    // permanently — same race the trophy-claim card guards against
    if (busy) return
    props.onBack()
  }

  const holes = setup.course.holes
  const par = holes.reduce((t, h) => t + h.par, 0)

  return (
    <div className="screen sign">
      {/* the mark up top, same gesture as the wrap screen — this is the first
          screen a new player is asked to put their name on, so it should say
          whose clubhouse they are joining */}
      <Wordmark className="sign-wordmark" />
      <div className="kicker">{props.practice ? 'Unlimited play' : `Daily · ${setup.dateKey}`}</div>
      <h2>Sign your scorecard</h2>
      <p className="fine">One line, once — then every board, record and trophy you win has your name on it.</p>

      <div className="signcard">
        {/* printed masthead, the way course stationery actually looks: the
            venue set in the display face on the dark band, its home
            underneath, the par bug punched out to the right */}
        <div className="signcard-head">
          <div className="signcard-venue">
            <b>{setup.course.name}</b>
            <em>{setup.course.location}</em>
          </div>
          <div className="signcard-par">
            <span>Par</span>
            <b>{par}</b>
          </div>
        </div>

        <Nine holes={holes.slice(0, 9)} turn="Out" />
        <Nine holes={holes.slice(9, 18)} turn="In" />

        {/* the signature line — the point of the whole screen */}
        <label className="sign-line">
          <span className="sc-rowlabel">Player</span>
          <span className="sign-x" aria-hidden="true">
            ×
          </span>
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
      <button className="cta ghost" onClick={back} disabled={busy}>
        Back
      </button>
    </div>
  )
}
