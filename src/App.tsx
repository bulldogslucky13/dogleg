import { useEffect, useMemo, useRef, useState } from 'react'
import posthog from 'posthog-js'
import { courseBySlug } from './engine/courses'
import { dailySetup, localDateKey, practiceSetup, toParLabel, type DailySetup } from './engine/daily'
import { longOdds } from './engine/odds'
import type { Choice } from './engine/types'
import {
  advanceHole,
  applyChoice,
  holeInPlay,
  loadHistory,
  loadRound,
  recordResult,
  roundToPar,
  saveRound,
  startDailyRound,
  startPracticeRound,
  usesBudget,
  type HistoryEntry,
  type RoundState,
} from './state/store'
import { GreenView, HoleMap } from './ui/HoleMap'
import { ChoiceCards, ContextChips, HoleComplete, Scorecard, StatusBanner } from './ui/panels'
import { HomeScreen, ResultScreen } from './ui/screens'

type View = 'home' | 'play' | 'result'

export default function App() {
  const [round, setRound] = useState<RoundState | null>(() => loadRound())
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())
  const [view, setView] = useState<View>(() => {
    const r = loadRound()
    return r && !r.complete ? 'play' : 'home'
  })
  const [selected, setSelected] = useState<Choice | null>(null)
  const [animating, setAnimating] = useState(false)
  const animTimer = useRef<number | null>(null)

  useEffect(() => {
    saveRound(round)
  }, [round])

  useEffect(
    () => () => {
      if (animTimer.current) window.clearTimeout(animTimer.current)
    },
    [],
  )

  const playedToday = history.find((e) => e.dateKey === localDateKey()) ?? null

  const hole = useMemo(() => (round && !round.complete && round.hole ? holeInPlay(round) : null), [round])

  const previewWindow = useMemo<[number, number] | null>(() => {
    if (!hole || !selected || animating) return null
    if (hole.stage === 'tee') return longOdds(hole.layout, hole.cond, hole.ball, selected, 'tee').window
    if (hole.stage === 'second' && selected !== 'aggressive')
      return longOdds(hole.layout, hole.cond, hole.ball, selected, 'layup').window
    if (hole.stage === 'second') return [hole.layout.length - 40, hole.layout.length]
    if (hole.stage === 'approach') return [hole.layout.length - 30, hole.layout.length]
    return null
  }, [hole, selected, animating])

  if (view === 'home') {
    return (
      <HomeScreen
        history={history}
        hasActiveRound={!!round && !round.complete}
        playedToday={playedToday}
        onTeeOff={() => {
          const r = startDailyRound()
          posthog.capture('daily_round_started', {
            course: r.courseSlug,
            puzzle_number: r.puzzleNumber,
            wind: r.cond.wind,
            greens: r.cond.greens,
            difficulty: r.cond.difficulty,
          })
          setRound(r)
          setSelected(null)
          setView('play')
        }}
        onResume={() => {
          posthog.capture('round_resumed')
          setView('play')
        }}
        onPractice={(slug) => {
          const r = startPracticeRound(slug)
          posthog.capture('practice_round_started', { course: slug })
          setRound(r)
          setSelected(null)
          setView('play')
        }}
        onShowResult={() => setView('result')}
      />
    )
  }

  if (view === 'result') {
    const entry = playedToday
    const isPractice = !!round && round.mode === 'practice' && round.complete
    let setup: DailySetup
    let results = entry?.results ?? []
    let toPar = entry?.toPar ?? 0
    if (isPractice && round) {
      setup = { ...practiceSetup(round.courseSlug, ''), cond: round.cond, puzzleNumber: 0, dateKey: round.dateKey, seed: round.seed }
      results = round.scores.map((s) => s?.result ?? 'triple')
      toPar = roundToPar(round)
    } else {
      setup = dailySetup()
    }
    return (
      <ResultScreen
        setup={setup}
        results={results}
        toPar={toPar}
        practice={isPractice}
        history={history}
        onHome={() => setView('home')}
        onPracticeAgain={() => {
          if (round) {
            setRound(startPracticeRound(round.courseSlug))
            setSelected(null)
            setView('play')
          }
        }}
      />
    )
  }

  // ---- play ----
  if (!round || !hole) {
    return (
      <div className="screen">
        <p className="tagline center">Walking to the first tee…</p>
        <button className="cta" onClick={() => setView('home')}>
          Clubhouse
        </button>
      </div>
    )
  }

  const course = courseBySlug(round.courseSlug)!
  const spec = course.holes[round.currentHole]
  const toPar = roundToPar(round)
  const holeDone = hole.stage === 'done' && hole.score
  const modeTag = round.mode === 'daily' ? `Daily · No. ${round.puzzleNumber}` : 'Practice'

  const commit = (choice: Choice) => {
    if (animating || !hole) return
    if (choice === 'aggressive' && usesBudget(hole.stage) && round.aggressiveLeft <= 0) return
    setAnimating(true)
    setSelected(null)
    setRound((r) => (r ? applyChoice(r, choice) : r))
    animTimer.current = window.setTimeout(() => setAnimating(false), 700)
  }

  const next = () => {
    const after = advanceHole(round)
    setRound(after)
    setSelected(null)
    if (after.complete) {
      const h = recordResult(after)
      setHistory(h)
      posthog.capture('round_completed', {
        mode: after.mode,
        course: after.courseSlug,
        puzzle_number: after.puzzleNumber,
        to_par: roundToPar(after),
      })
      setView('result')
    }
  }

  return (
    <div className="screen play">
      <button className="home-link" onClick={() => setView('home')} aria-label="Back to clubhouse">
        ‹ Clubhouse
      </button>
      <header className="hole-head">
        <div className="hole-id">
          <b className="hole-num">{spec.number}</b>
          <div>
            <div className="hole-par">
              Par {spec.par} · SI {spec.strokeIndex}
            </div>
            <div className="chips slim">
              <span className="chip">
                {course.name} · {modeTag}
              </span>
              <span className="chip">{round.cond.wind} mph</span>
              <span className="chip">{round.cond.greens.toLowerCase()} greens</span>
            </div>
          </div>
        </div>
        <div className="hole-right">
          <div className={`topar ${toPar < 0 ? 'good' : toPar > 0 ? 'bad' : ''}`}>{toParLabel(toPar)} to par</div>
          <div className="yards">{spec.yards} yards</div>
        </div>
      </header>

      <div className="map-wrap">
        {hole.stage === 'putt' ? (
          <GreenView feet={hole.ball.puttFeet ?? 20} holeNumber={spec.number} greens={round.cond.greens} />
        ) : (
          <HoleMap layout={hole.layout} ball={hole.ball} previewWindow={previewWindow} previewChoice={selected} />
        )}
      </div>

      <div className="panel">
        {holeDone ? (
          <HoleComplete
            score={hole.score!}
            par={spec.par}
            runningToPar={toPar}
            last={round.currentHole >= 17}
            onNext={next}
          />
        ) : (
          <>
            {hole.shots.length === 0 && hole.stage !== 'putt' ? <ContextChips hole={hole} /> : <StatusBanner hole={hole} />}
            {hole.stage === 'putt' && (
              <div className="chips slim center">
                <span className="chip">
                  {(hole.ball.puttFeet ?? 0) <= 20 ? 'Birdie-range putt' : 'Long putt'} · ~{hole.ball.puttFeet} ft
                </span>
                <span className="chip">{round.cond.greens} green</span>
              </div>
            )}
            <ChoiceCards
              hole={hole}
              aggressiveLeft={round.aggressiveLeft}
              selected={selected}
              disabled={animating}
              onSelect={setSelected}
              onCommit={() => selected && commit(selected)}
            />
          </>
        )}
        <Scorecard course={course} scores={round.scores} currentHole={round.currentHole} />
      </div>
    </div>
  )
}
