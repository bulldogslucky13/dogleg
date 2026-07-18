import { useState } from 'react'
import posthog from 'posthog-js'
import { COURSES } from '../engine/courses'
import { dailySetup, RESULT_SQUARE, shareText, toParLabel, type DailySetup } from '../engine/daily'
import type { HoleResult } from '../engine/types'
import { computeStreaks, type HistoryEntry } from '../state/store'

export function HomeScreen(props: {
  history: HistoryEntry[]
  hasActiveRound: boolean
  playedToday: HistoryEntry | null
  onTeeOff: () => void
  onResume: () => void
  onPractice: (slug: string) => void
  onShowResult: () => void
}) {
  const setup = dailySetup()
  const streaks = computeStreaks(props.history)
  const [showCourses, setShowCourses] = useState(false)
  return (
    <div className="screen home">
      <header className="masthead">
        <div className="kicker">Daily challenge · No. {setup.puzzleNumber}</div>
        <h1>
          Dog<em>leg</em>
        </h1>
        <p className="tagline">One round. 18 holes. ~2 minutes.</p>
      </header>

      <div className="today-card">
        <div className="kicker">Today's course</div>
        <h2>{setup.course.name}</h2>
        <p>
          {setup.course.location} · Par {setup.course.holes.reduce((s, h) => s + h.par, 0)}
        </p>
        <div className="chips">
          <span className="chip dark">Wind {setup.cond.wind}</span>
          <span className="chip dark">Greens {setup.cond.greens}</span>
          <span className="chip dark">Difficulty {setup.cond.difficulty}/10</span>
        </div>
        <p className="blurb">{setup.course.blurb}</p>
      </div>

      <div className="stats-row">
        <div className="stat">
          <b>{streaks.dayStreak || '–'}</b>
          <span>Day streak</span>
        </div>
        <div className="stat">
          <b>{streaks.bestStreak || '–'}</b>
          <span>Best streak</span>
        </div>
        <div className="stat">
          <b>{streaks.bestToPar === null ? '–' : toParLabel(streaks.bestToPar)}</b>
          <span>Best to par</span>
        </div>
      </div>
      <p className="cta-tease">Can you break par today?</p>

      {props.playedToday ? (
        <button className="cta" onClick={props.onShowResult}>
          See today's card · {toParLabel(props.playedToday.toPar)}
        </button>
      ) : props.hasActiveRound ? (
        <button className="cta" onClick={props.onResume}>
          Resume today's round
        </button>
      ) : (
        <button className="cta" onClick={props.onTeeOff}>
          Tee off
        </button>
      )}

      <button className="cta ghost" onClick={() => {
        const next = !showCourses
        setShowCourses(next)
        if (next) posthog.capture('courses_browsed')
      }}>
        Play unlimited · Browse courses
      </button>
      {showCourses && (
        <div className="course-list">
          {COURSES.map((c) => (
            <button key={c.slug} className="course-row" onClick={() => props.onPractice(c.slug)}>
              <b>{c.name}</b>
              <span>
                {c.location} · Difficulty {c.difficulty}/10
              </span>
            </button>
          ))}
          <p className="fine">Practice rounds don't touch your streak.</p>
        </div>
      )}
    </div>
  )
}

export function ResultScreen(props: {
  setup: DailySetup
  results: HoleResult[]
  toPar: number
  practice: boolean
  history: HistoryEntry[]
  onHome: () => void
  onPracticeAgain: () => void
}) {
  const { toPar, results } = props
  const [copied, setCopied] = useState(false)
  const streaks = computeStreaks(props.history)
  const broke = toPar < 0
  const share = async () => {
    const text = shareText(props.setup, results, toPar)
    try {
      if (navigator.share) {
        await navigator.share({ text })
        posthog.capture('result_shared', {
          method: 'native_share',
          to_par: toPar,
          course: props.setup.course.name,
          practice: props.practice,
        })
        return
      }
    } catch {
      /* fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
      posthog.capture('result_copied', {
        to_par: toPar,
        course: props.setup.course.name,
        practice: props.practice,
      })
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="screen result">
      <div className="kicker">
        {props.practice ? 'Practice round' : `Daily No. ${props.setup.puzzleNumber}`} · {props.setup.course.name}
      </div>
      <h1 className={`final ${broke ? 'good' : ''}`}>{toParLabel(toPar)}</h1>
      <p className="verdict">
        {broke
          ? 'You broke par. Cap tipped, card signed. 🏆'
          : toPar === 0
            ? 'Level with the course. So close.'
            : toPar <= 3
              ? 'The course won today — barely.'
              : 'The course won today.'}
      </p>
      <div className="emoji-grid">
        <div>{results.slice(0, 9).map((r, i) => (
          <span key={i}>{RESULT_SQUARE[r]}</span>
        ))}</div>
        <div>{results.slice(9).map((r, i) => (
          <span key={i}>{RESULT_SQUARE[r]}</span>
        ))}</div>
      </div>
      {!props.practice && (
        <div className="stats-row">
          <div className="stat">
            <b>{streaks.dayStreak}</b>
            <span>Day streak</span>
          </div>
          <div className="stat">
            <b>{streaks.played}</b>
            <span>Rounds</span>
          </div>
          <div className="stat">
            <b>{streaks.brokePar}</b>
            <span>Broke par</span>
          </div>
        </div>
      )}
      {!props.practice && (
        <button className="cta" onClick={share}>
          {copied ? 'Copied!' : 'Share your card'}
        </button>
      )}
      {props.practice && (
        <button className="cta" onClick={() => {
          posthog.capture('practice_again_clicked', { course: props.setup.course.name })
          props.onPracticeAgain()
        }}>
          Play another practice round
        </button>
      )}
      <button className="cta ghost" onClick={props.onHome}>
        Back to the clubhouse
      </button>
    </div>
  )
}
