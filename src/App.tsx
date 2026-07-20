import { useEffect, useMemo, useRef, useState } from 'react'
import { characterById } from './engine/characters'
import { courseBySlug } from './engine/courses'
import { dailySetup, localDateKey, practiceSetup, toParLabel, type DailySetup } from './engine/daily'
import { longOdds } from './engine/odds'
import { LOOK_LABEL, madePuttLook, oddsFor } from './engine/resolve'
import type { ApproachOdds, CharacterAdvantage, CharacterId, Choice } from './engine/types'
import {
  advanceHole,
  applyChoice,
  buildRecap,
  holeInPlay,
  loadHistory,
  loadRound,
  loadUiMode,
  recordResult,
  roundToPar,
  saveRound,
  saveUiMode,
  newRound,
  usesBudget,
  type HistoryEntry,
  type RoundState,
  type UiMode,
} from './state/store'
import { track } from './lib/analytics'
import { ensureIdentity, loadIdentity } from './lib/leaderboard'
import { CharacterAvatar } from './ui/Avatars'
import { GreenView, HoleMap, useMapSize } from './ui/HoleMap'
import { SideMap } from './ui/SideMap'
import { ChoiceCards, ClassicScorecard, HazardChips, HoleComplete, Scorecard, StatusBanner, TierBanner } from './ui/panels'
import { decodeReplay, type ReplayPayload } from './engine/replay'
import { ReplayScreen } from './ui/ReplayScreen'
import { CharacterPickScreen, HomeScreen, ResultScreen } from './ui/screens'
import { Tutorial, hasSeenTutorial } from './ui/Tutorial'

type View = 'home' | 'pick' | 'play' | 'result' | 'watch'

/** a #watch=<code> link opens straight into the replay viewer */
function watchFromHash(): ReplayPayload | null {
  const m = /#watch=([A-Za-z0-9_-]+)/.exec(window.location.hash)
  return m ? decodeReplay(m[1]) : null
}
/** setup is generated when the pick screen opens, so the conditions it shows are the ones you play */
type PendingStart = { mode: 'daily' | 'practice'; setup: DailySetup }

export default function App() {
  const [round, setRound] = useState<RoundState | null>(() => loadRound())
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())
  const [watching, setWatching] = useState<ReplayPayload | null>(() => watchFromHash())
  const [view, setView] = useState<View>(() => {
    if (watchFromHash()) return 'watch'
    const r = loadRound()
    return r && !r.complete ? 'play' : 'home'
  })
  const [selected, setSelected] = useState<Choice | null>(null)
  const [uiMode, setUiMode] = useState<UiMode>(loadUiMode)
  const [pending, setPending] = useState<PendingStart | null>(null)
  const [showTutorial, setShowTutorial] = useState(() => !hasSeenTutorial())
  /** which result the result view shows — the daily card or a finished practice round */
  const [resultFor, setResultFor] = useState<'daily' | 'practice'>('daily')
  const [animating, setAnimating] = useState(false)
  const [splash, setSplash] = useState<CharacterAdvantage | null>(null)
  const [splashKey, setSplashKey] = useState(0)
  const animTimer = useRef<number | null>(null)
  const splashTimer = useRef<number | null>(null)
  const [mapRef, mapSize] = useMapSize()

  useEffect(() => {
    saveRound(round)
  }, [round])

  // mint an anonymous player id early so the daily dice can be salted per
  // player — long done by the time a human reaches the first tee
  useEffect(() => {
    ensureIdentity()
  }, [])

  // a replay link opened while the app is already mounted only fires
  // hashchange — no reload, so the mount-time hash check never reruns
  useEffect(() => {
    const onHash = () => {
      const p = watchFromHash()
      if (p) {
        setWatching(p)
        setView('watch')
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(
    () => () => {
      if (animTimer.current) window.clearTimeout(animTimer.current)
      if (splashTimer.current) window.clearTimeout(splashTimer.current)
    },
    [],
  )

  const playedToday = history.find((e) => e.dateKey === localDateKey()) ?? null

  const hole = useMemo(() => (round && !round.complete && round.hole ? holeInPlay(round) : null), [round])

  const previewWindow = useMemo<[number, number] | null>(() => {
    if (!hole || !selected || animating) return null
    if (hole.stage === 'tee') return longOdds(hole.layout, hole.cond, hole.ball, selected, 'tee', hole.character).window
    if (hole.stage === 'second' && selected !== 'aggressive')
      return longOdds(hole.layout, hole.cond, hole.ball, selected, 'layup', hole.character).window
    return null
  }, [hole, selected, animating])

  // approach-style shots get landing rings driven by the full odds distribution
  const previewApproach = useMemo<ApproachOdds | null>(() => {
    if (!hole || !selected || animating) return null
    const approachStyle = hole.stage === 'approach' || (hole.stage === 'second' && selected === 'aggressive')
    if (!approachStyle) return null
    const o = oddsFor(hole, selected)
    return o.kind === 'approach' ? o : null
  }, [hole, selected, animating])

  if (view === 'home') {
    return (
      <>
        {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
        <HomeScreen
          history={history}
          onHowToPlay={() => setShowTutorial(true)}
          activeRound={
            round && !round.complete
              ? { mode: round.mode, courseName: courseBySlug(round.courseSlug)?.name ?? '' }
              : null
          }
          playedToday={playedToday}
          onTeeOff={() => {
            setPending({ mode: 'daily', setup: dailySetup() })
            setView('pick')
          }}
          onResume={() => setView('play')}
          onPractice={(slug) => {
            setPending({ mode: 'practice', setup: practiceSetup(slug, `${Date.now()}`) })
            setView('pick')
          }}
          onShowResult={() => {
            setResultFor('daily')
            setView('result')
          }}
        />
      </>
    )
  }

  if (view === 'watch' && watching) {
    return (
      <ReplayScreen
        payload={watching}
        onExit={() => {
          window.history.replaceState(null, '', window.location.pathname)
          setWatching(null)
          setView('home')
        }}
      />
    )
  }

  if (view === 'pick') {
    const start = pending ?? { mode: 'daily' as const, setup: dailySetup() }
    return (
      <CharacterPickScreen
        setup={start.setup}
        practice={start.mode === 'practice'}
        onPick={(character: CharacterId) => {
          const r = newRound(start.setup, start.mode, character, loadIdentity()?.id)
          track('round_started', { mode: start.mode, course: r.courseSlug, puzzle_number: r.puzzleNumber, character })
          setRound(r)
          setSelected(null)
          setPending(null)
          setView('play')
        }}
        onBack={() => {
          setPending(null)
          setView('home')
        }}
      />
    )
  }

  if (view === 'result') {
    const entry = playedToday
    const isPractice = resultFor === 'practice' && !!round && round.mode === 'practice' && round.complete
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
    // the full shot-by-shot round only survives in localStorage for the round it belongs to
    const recapSource = isPractice
      ? round
      : round && round.mode === 'daily' && round.complete && round.dateKey === entry?.dateKey
        ? round
        : null
    return (
      <ResultScreen
        setup={setup}
        results={results}
        toPar={toPar}
        practice={isPractice}
        recap={recapSource ? buildRecap(recapSource) : null}
        boardRound={recapSource}
        character={isPractice && round ? round.character : entry?.character}
        history={history}
        onHome={() => setView('home')}
        onPracticeAgain={() => {
          if (round) {
            // rematch on the same course, but pick your player fresh each run
            // (round_started is tracked by the pick screen's onPick)
            setPending({ mode: 'practice', setup: practiceSetup(round.courseSlug, `${Date.now()}`) })
            setView('pick')
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
    setSplash(null)
    const nextRound = applyChoice(round, choice)
    setRound(nextRound)
    const shots = nextRound.hole?.shots ?? []
    const adv = shots[shots.length - 1]?.advantage
    if (adv) {
      // let the ball settle, then splash the earned edge
      if (splashTimer.current) window.clearTimeout(splashTimer.current)
      splashTimer.current = window.setTimeout(() => {
        setSplash(adv)
        setSplashKey((k) => k + 1)
        splashTimer.current = window.setTimeout(() => setSplash(null), 4200)
      }, 520)
    }
    animTimer.current = window.setTimeout(() => setAnimating(false), 700)
  }

  const toggleUi = () => {
    setUiMode((m) => {
      const nextMode: UiMode = m === 'modern' ? 'classic' : 'modern'
      saveUiMode(nextMode)
      return nextMode
    })
  }

  const next = () => {
    if (splashTimer.current) window.clearTimeout(splashTimer.current)
    setSplash(null)
    const after = advanceHole(round)
    setRound(after)
    setSelected(null)
    if (after.complete) {
      const h = recordResult(after)
      setHistory(h)
      setResultFor(after.mode)
      setView('result')
    }
  }

  const classic = uiMode === 'classic'
  const char = characterById(round.character)

  return (
    <div className={`screen play${classic ? ' classic' : ''}`}>
      <div className="top-row">
        <button className="home-link" onClick={() => setView('home')} aria-label="Back to clubhouse">
          ‹ Clubhouse
        </button>
        {char && (
          <div className="char-chip" title={char.edge}>
            <CharacterAvatar id={char.id} size={26} />
            <span className="char-chip-name">{char.name}</span>
          </div>
        )}
        <button className="home-link" onClick={toggleUi}>
          ⇄ {classic ? 'Classic view' : 'Modern view'}
        </button>
      </div>
      <header className="hole-head">
        <div className="hole-id">
          <b className="hole-num">{spec.number}</b>
          <div>
            <div className="hole-par">
              Par {spec.par} · SI {spec.strokeIndex}
            </div>
            {/* phones hide the chip row, so the course rides along as plain text */}
            <div className="hole-course">
              {course.name} · {modeTag}
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

      <div ref={mapRef} className={`map-wrap${classic && hole.stage !== 'putt' ? ' side' : ''}`}>
        {hole.stage === 'putt' ? (
          <GreenView feet={hole.ball.puttFeet ?? 20} holeNumber={spec.number} greens={round.cond.greens} size={mapSize} />
        ) : classic ? (
          <SideMap layout={hole.layout} ball={hole.ball} />
        ) : (
          <HoleMap
            layout={hole.layout}
            ball={hole.ball}
            previewWindow={previewWindow}
            previewApproach={previewApproach}
            previewChoice={selected}
            size={mapSize}
          />
        )}
        {!holeDone && (
          <div className="map-overlay top">
            {hole.shots.length === 0 && hole.stage !== 'putt' ? <TierBanner hole={hole} /> : <StatusBanner hole={hole} />}
          </div>
        )}
        {splash && (
          <div key={splashKey} className={`advantage-splash ${splash.id}`} role="status">
            <CharacterAvatar id={splash.id} size={34} />
            <div className="advantage-text">
              <b>{splash.title}</b>
              <span>{splash.note}</span>
              <em>{splash.stat}</em>
            </div>
          </div>
        )}
        {!holeDone && (
          <div className="map-overlay bottom">
            {hole.stage === 'putt' ? (
              <div className="chips slim center">
                <span className="chip">
                  {LOOK_LABEL[madePuttLook(hole.strokes, spec.par)].chip} · ~{hole.ball.puttFeet} ft
                </span>
                <span className="chip">{round.cond.greens} green</span>
              </div>
            ) : (
              // wind/greens/hazards live on the map at every stage — the hole
              // head no longer carries condition chips on small screens
              <HazardChips hole={hole} />
            )}
          </div>
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
            <ChoiceCards
              hole={hole}
              aggressiveLeft={round.aggressiveLeft}
              selected={selected}
              disabled={animating}
              classic={classic}
              onSelect={setSelected}
              onCommit={() => selected && commit(selected)}
            />
          </>
        )}
        {classic ? (
          <ClassicScorecard course={course} scores={round.scores} currentHole={round.currentHole} />
        ) : (
          <Scorecard course={course} scores={round.scores} currentHole={round.currentHole} />
        )}
      </div>
    </div>
  )
}
