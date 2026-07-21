import { useEffect, useState } from 'react'
import { CharacterAvatar } from './Avatars'
import { SyncCta } from './RoundsScreen'

const STORAGE_KEY = 'dogleg:tutorial:v1'

export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'done'
  } catch {
    return true // if storage is blocked, don't nag every load
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'done')
  } catch {
    /* ignore */
  }
}

interface Step {
  title: string
  body: React.ReactNode
}

const STEPS: Step[] = [
  {
    title: 'One round, one goal',
    body: (
      <>
        A new course every day — 18 holes, about 2 minutes. Beat the course and{' '}
        <b>break par</b>. It wins most days, so a good score is worth bragging about.
      </>
    ),
  },
  {
    title: 'Every shot is a call',
    body: (
      <>
        Play each shot <b>Safe</b>, <b>Normal</b>, or <b>Aggressive</b>. The colored bar
        shows your real odds <i>before</i> you commit — green is good, red is trouble. You
        get <b>8 aggressive plays</b> a round, so spend them where they matter.
        <span className="tut-bar" aria-hidden>
          <i className="seg good" style={{ width: '62%' }} />
          <i className="seg neutral" style={{ width: '26%' }} />
          <i className="seg bad" style={{ width: '12%' }} />
        </span>
      </>
    ),
  },
  {
    title: 'Pick your player',
    body: (
      <>
        Before the round, choose an edge for all 18 holes:
        <span className="tut-players">
          <span>
            <CharacterAvatar id="fairway" size={40} />
            <em>Fairway Finder</em>
            <small>Big off the tee</small>
          </span>
          <span>
            <CharacterAvatar id="dart" size={40} />
            <em>Dart Thrower</em>
            <small>Sticks approaches</small>
          </span>
          <span>
            <CharacterAvatar id="greens" size={40} />
            <em>Greens Keeper</em>
            <small>Deadly putter</small>
          </span>
        </span>
        Each is a real edge — pick for the course in front of you.
      </>
    ),
  },
  {
    title: 'See it your way, then share it',
    body: (
      <>
        Toggle between the <b>modern</b> top-down map and the <b>classic</b> side view any
        time. Finish the round and copy your score card straight to the group chat — the
        squares tell the story, no spoilers.
      </>
    ),
  },
  {
    title: 'Fortunes',
    body: (
      <>
        Every so often the golf gods simply smile on you: a <b>hole in one</b> or an{' '}
        <b>albatross</b>, out of pure luck — the best score a hole can give. That's a{' '}
        <b>Fortune</b>, and it can strike on any hole, any day, for any player. But the
        golf gods reward the faithful — post your daily cards under a{' '}
        <b>clubhouse name</b>, keep your streak alive, and your odds of striking a
        Fortune quietly improve.
      </>
    ),
  },
]

export function Tutorial(props: {
  onClose: () => void
  /** the Fortunes step's one quiet sync line routes here — the same account
   * flow the Locker CTA opens. This is How to Play's ONLY sync mention. */
  onSync?: () => void
}) {
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      if (e.key === 'ArrowRight' && !last) setStep((s) => s + 1)
      if (e.key === 'ArrowLeft' && step > 0) setStep((s) => s - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, last])

  const finish = () => {
    markSeen()
    props.onClose()
  }

  const current = STEPS[step]
  return (
    <div className="tut-backdrop" role="dialog" aria-modal="true" aria-label="How to play DogLeg">
      <div className="tut-card">
        <button className="tut-skip" onClick={finish} aria-label="Close tutorial">
          Skip
        </button>
        <div className="kicker">How to play · {step + 1} of {STEPS.length}</div>
        <h2 className="tut-title">{current.title}</h2>
        <div className="tut-body">{current.body}</div>
        {current.title === 'Fortunes' && props.onSync && (
          <SyncCta
            copy="Playing on more than one device? Sync your account to keep your streak and stats with you."
            trigger="how-to-play"
            onTap={() => {
              markSeen()
              props.onSync!()
            }}
          />
        )}
        <div className="tut-dots" aria-hidden>
          {STEPS.map((_s, i) => (
            <span key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
        <div className="tut-nav">
          {step > 0 ? (
            <button className="cta ghost" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          ) : (
            <span />
          )}
          {last ? (
            <button className="cta" onClick={finish}>
              Let's play
            </button>
          ) : (
            <button className="cta" onClick={() => setStep((s) => s + 1)}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
