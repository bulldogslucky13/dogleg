import { useEffect, useState } from 'react'
import { SITE_URL } from '../engine/daily'
import { CharacterAvatar } from './Avatars'
import { TaglineLockup } from './brand'
import { RoughGradeList } from './RoughGrades'
import { SyncCta } from './RoundsScreen'
import { Wordmark } from './Wordmark'

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
  /** which pillar of the tagline this step teaches — the card's kicker.
   * Absent on the hero, which IS the tagline. */
  pillar?: '18 Holes' | 'Play the Odds' | 'Beat the Course'
}

/**
 * The Fortunes explanation, in one place: it is both the last How-to-Play step
 * and what the home screen's Fortune callout opens via its ⓘ. Edit here and
 * both surfaces follow — they must never drift, since this copy carries the
 * honest disclosure that only NAMED daily streaks move the odds.
 */
function FortunesBody() {
  return (
    <>
      Every so often the course simply smiles on you: a <b>hole in one</b> or an{' '}
      <b>albatross</b>, out of pure luck — the best score a hole can give. That's a{' '}
      <b>Fortune</b>, and it can strike on any hole, any day, for any player. But golf
      rewards the consistent — post your daily cards under a <b>clubhouse name</b>, keep
      your streak alive, and your odds of striking a Fortune quietly improve.
    </>
  )
}

const STEPS: Step[] = [
  {
    // the hero: the tagline IS the lesson plan — format, mechanic, goal
    title: 'Welcome to DogLeg',
    body: (
      <>
        <Wordmark className="howto-mark" />
        <TaglineLockup />
        <span className="howto-lede">
          That's the whole game, in three moves. Here's how each one works.
        </span>
      </>
    ),
  },
  {
    pillar: '18 Holes',
    title: 'One round, one goal',
    body: (
      <>
        Remember that little word game everyone was addicted to? This is that, for golf.
        One new course every day, the same 18 holes for everyone — so when you{' '}
        <b>beat the odds</b> and drop your card in the group chat, they know exactly what
        it took. The course wins most days. That's what makes the good days worth sharing.
      </>
    ),
  },
  {
    pillar: 'Play the Odds',
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
    pillar: 'Play the Odds',
    title: 'Watch the flag',
    body: (
      <>
        On par 3s, the day's <b>pin position</b> is part of the call. A <b>sucker pin</b>{' '}
        pays the aggressive hunt with closer looks — and punishes the miss harder. A{' '}
        <b>friendly flag</b> is green light for everyone. The chips at the tee tell you
        which one you're facing, and the odds bar always tells the truth about it.
      </>
    ),
  },
  {
    pillar: 'Play the Odds',
    title: 'Not all rough is rough',
    body: (
      <>
        Miss the fairway and the lie is part of the story. Three grades of it, and the map
        always shows you which you're in:
        <RoughGradeList />
        Out of the deep stuff you'll save par a lot less often — sometimes the play is simply
        to wedge out and live with the bogey.
      </>
    ),
  },
  {
    pillar: 'Play the Odds',
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
    pillar: '18 Holes',
    title: 'The card does the talking',
    body: (
      <>
        Finish the round and your scorecard is ready for the group chat — the squares tell
        the story, no spoilers. Here's what your crew sees:
        <pre className="share-preview howto-share-demo" aria-label="Example share card">
          {`DOGLEG #24 ⛳
Pebble Beach Links (Par 72)
70 (-2) · 3-day streak

🟩⬜⬜🟨⬜🟩⬜⬜🟩
⬜🟩⬜⬜🟧⬜⬜🟩⬜

🐦 5  ·  ⛳ 11  ·  😬 2
${SITE_URL}`}
        </pre>
      </>
    ),
  },
  {
    pillar: 'Beat the Course',
    title: 'The course keeps score too',
    body: (
      <>
        Every course wears a <b>record</b> — hold one and your name is on the wall until
        somebody takes it. <b>Unlimited play</b> is where you hunt them: any course, any
        time, racing the record holder's actual round as a ghost. Records reset each{' '}
        <b>season</b>, so the wall is always worth another run — and your daily{' '}
        <b>streak</b> is the habit that feeds all of it.
      </>
    ),
  },
  {
    pillar: 'Beat the Course',
    title: 'Fortunes',
    body: <FortunesBody />,
  },
]

/**
 * The Fortunes page on its own, opened from the home screen's Fortune callout.
 * Deliberately NOT the tutorial: it never marks the tutorial seen (so a new
 * player still gets the full walkthrough), and it carries no sync line — that
 * stays How to Play's single mention.
 */
export function FortuneInfo(props: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  return (
    <div
      className="tut-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Fortunes"
      onClick={props.onClose}
    >
      <div className="tut-card howto" onClick={(e) => e.stopPropagation()}>
        <button className="tut-skip" onClick={props.onClose} aria-label="Close">
          Close
        </button>
        <div className="kicker">How to play · Fortunes</div>
        <h2 className="tut-title">Fortunes</h2>
        <div className="tut-body">
          <FortunesBody />
        </div>
        <div className="tut-nav">
          <span />
          <button className="cta" onClick={props.onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

export function Tutorial(props: {
  onClose: () => void
  /** the Fortunes step's one quiet sync line routes here — the same account
   * flow the Clubhouse CTA opens. This is How to Play's ONLY sync mention. */
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
      <div className={`tut-card howto howto-tour${step === 0 ? ' howto-hero' : ''}`}>
        <button className="tut-skip" onClick={finish} aria-label="Close tutorial">
          Skip
        </button>
        <div className="kicker">
          {/* the pillar names the lesson; the hero needs no kicker beyond the count */}
          {current.pillar ?? 'How to play'} · {step + 1} of {STEPS.length}
        </div>
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
