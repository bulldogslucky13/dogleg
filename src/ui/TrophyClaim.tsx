import { useEffect, useRef, useState } from 'react'
import type { MomentKind } from '../engine/fortune'
import { identifyPlayer, track } from '../lib/analytics'
import { claimClubhouseName } from '../lib/leaderboard'
import { Spinner } from './Spinner'

const MOMENT_NOUN: Record<MomentKind, string> = {
  ace: 'hole in one',
  albatross: 'albatross',
}

/**
 * The unclaimed-trophy card: shown to ANONYMOUS players once the moment
 * splash is dismissed, never during it. The celebration stays a celebration —
 * this is the screen they tap into afterwards.
 *
 * Deliberately built on the tut-card family (a calm paper card on a dimmed
 * backdrop) rather than the moment's full-bleed gradient, rays and confetti:
 * it reads as its own screen, not a second page of the splash. The moment's
 * colour survives only as a thin accent rule, so the two are related without
 * being mistaken for each other.
 *
 * On the copy — every claim here is one we can actually keep:
 *
 * - "no name on it" is literally true: the round is filed under a nameless
 *   minted id, and an anonymous identity cannot post a card at all.
 * - "lives in this browser" is true, and NOT fully solved by claiming a name.
 *   Recovery on a new device runs through fetchMyHistory, which pulls
 *   daily_scores by player id — so it needs the email sync, and it only ever
 *   covers POSTED DAILIES. A practice moment never reaches the server unless
 *   it set a record. So the card sells the name as the first half and says so
 *   plainly, instead of promising a rescue it can't perform.
 * - it never mentions destiny. The guarantee is deliberately outside the
 *   displayed odds (see fortune.ts) and stays that way.
 */
export function TrophyClaim(props: {
  kind: MomentKind
  holeNumber: number
  courseName: string
  /** practice moments can't be posted to a board — the copy has to differ */
  mode: 'daily' | 'practice'
  onClose: () => void
}) {
  const noun = MOMENT_NOUN[props.kind]
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    track('trophy_claim_shown', { kind: props.kind, mode: props.mode, course: props.courseName })
    // mount-only: this card is rendered once per moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const claim = async (e: React.FormEvent) => {
    e.preventDefault()
    const picked = name.trim()
    if (picked.length < 2 || busy) return
    setBusy(true)
    setError(null)
    const out = await claimClubhouseName(picked)
    setBusy(false)
    if (!out.ok) {
      setError(out.error)
      inputRef.current?.focus()
      return
    }
    // the app's core conversion — fire it on the same footing as the board
    // and account doors so the three are comparable in the funnel
    track('clubhouse_name_claimed', { via: 'trophy', kind: props.kind, mode: props.mode })
    identifyPlayer(out.player.id, out.player.name!)
    setClaimed(out.player.name)
  }

  const dismiss = () => {
    // "Not now" promises that nothing changes, and while a claim is in flight
    // that promise is not ours to keep: the write is one-way (claim-name
    // cannot rename), so a dismissal that races it would leave the player
    // permanently named without ever seeing it happen. Closing the door is
    // the only honest option — there is nothing to cancel, the request is
    // already with the server. Bounded by the claim's own timeout, so a
    // stalled network can't leave this card with no way out.
    if (busy) return
    if (!claimed) track('trophy_claim_dismissed', { kind: props.kind, mode: props.mode })
    props.onClose()
  }

  return (
    <div className="tut-backdrop trophy-backdrop" role="dialog" aria-modal="true" aria-label={`Claim your ${noun}`}>
      <div className={`tut-card trophy-claim ${props.kind}`}>
        <div className="trophy-accent" aria-hidden />
        {claimed ? (
          <>
            <div className="kicker">Claimed</div>
            <h2 className="tut-title">🏆 It's yours, {claimed}</h2>
            <div className="tut-body">
              <p>
                That {noun} on {props.courseName} is filed under your name now, and it's waiting in
                your Clubhouse.
              </p>
              <p className="fine">
                {props.mode === 'daily'
                  ? 'Finish the round and post your card to put it on the board too.'
                  : 'Practice rounds stay off the daily board, but your name now carries the course records you set.'}{' '}
                Adding an email in the Clubhouse is what carries it to a new phone.
              </p>
            </div>
            <button className="cta" onClick={dismiss}>
              Back to the round
            </button>
          </>
        ) : (
          <>
            <div className="kicker">Unclaimed trophy</div>
            <h2 className="tut-title">🏆 Put your name on it</h2>
            <div className="tut-body">
              <p>
                You just made {props.kind === 'ace' ? 'a hole in one' : 'an albatross'} on hole{' '}
                {props.holeNumber} at {props.courseName} — and right now it's filed under nobody. No
                name on the card, no line on any board.
              </p>
              <p className="fine">
                Claim a clubhouse name and this one's yours. It's the first half of keeping it —
                until you do, it lives in this browser alone.
              </p>
              <form className="name-form" onSubmit={claim}>
                <input
                  ref={inputRef}
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
                      Claiming…
                    </>
                  ) : (
                    'Claim it'
                  )}
                </button>
              </form>
              {error && <p className="fine trophy-error">{error}</p>}
            </div>
            <button className="trophy-skip" onClick={dismiss} disabled={busy}>
              Not now
            </button>
          </>
        )}
      </div>
    </div>
  )
}
