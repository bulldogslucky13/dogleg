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
  archiveRound,
  buildRecap,
  holeInPlay,
  loadHistory,
  computeStreaks,
  loadRound,
  loadUiMode,
  recordResult,
  supersededDaily,
  roundToPar,
  saveRound,
  saveUiMode,
  newRound,
  usesBudget,
  type HistoryEntry,
  type RoundState,
  type UiMode,
} from './state/store'
import { absorbHistory, logRound } from './state/stats'
import { chasing } from './lib/records'
import { identifyPlayer, track } from './lib/analytics'
import { ensureIdentity, loadIdentity, loadPlayer } from './lib/leaderboard'
import { CharacterAvatar } from './ui/Avatars'
import { GreenView, HoleMap, useMapSize } from './ui/HoleMap'
import { SideMap } from './ui/SideMap'
import { ChoiceCards, ClassicScorecard, HazardChips, HoleComplete, Scorecard, StatusBanner, TierBanner } from './ui/panels'
import type { MomentKind } from './engine/fortune'
import { MomentSplash } from './ui/MomentSplash'
import { decodeReplay, type ReplayPayload } from './engine/replay'
import { ReplayScreen } from './ui/ReplayScreen'
import { RoundsScreen } from './ui/RoundsScreen'
import { CharacterPickScreen, HomeScreen, ResultScreen } from './ui/screens'
import { Tutorial, hasSeenTutorial } from './ui/Tutorial'

type View = 'home' | 'pick' | 'play' | 'result' | 'watch' | 'rounds'

/** a #watch=<code> link opens straight into the replay viewer. 'bad' means
 * the hash IS a watch link but the code doesn't decode (truncated in a chat,
 * mangled by an unfurler) — distinct from no watch link at all, so the app
 * can show the friendly error instead of silently landing home. */
type WatchState = ReplayPayload | 'bad' | null
function watchFromHash(): WatchState {
  const m = /#watch=([A-Za-z0-9_-]+)/.exec(window.location.hash)
  if (!m) return null
  return decodeReplay(m[1]) ?? 'bad'
}
/** setup is generated when the pick screen opens, so the conditions it shows are the ones you play */
type PendingStart = { mode: 'daily' | 'practice'; setup: DailySetup }

export default function App() {
  const [round, setRound] = useState<RoundState | null>(() => loadRound())
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())
  const [watching, setWatching] = useState<WatchState>(() => watchFromHash())
  const [view, setView] = useState<View>(() => {
    if (watchFromHash()) return 'watch'
    const r = loadRound()
    return r && !r.complete ? 'play' : 'home'
  })
  const [selected, setSelected] = useState<Choice | null>(null)
  /** where the locker opens: 'stats' when deep-linked from the home handicap chip */
  const [lockerView, setLockerView] = useState<'main' | 'stats'>('main')
  /** open the locker with the account panel expanded (How to Play's sync line) */
  const [lockerAccount, setLockerAccount] = useState(false)
  const [uiMode, setUiMode] = useState<UiMode>(loadUiMode)
  const [pending, setPending] = useState<PendingStart | null>(null)
  const [showTutorial, setShowTutorial] = useState(() => !hasSeenTutorial())
  /** which result the result view shows — the daily card or a finished practice round */
  const [resultFor, setResultFor] = useState<'daily' | 'practice'>('daily')
  const [animating, setAnimating] = useState(false)
  const [splash, setSplash] = useState<CharacterAdvantage | null>(null)
  const [splashKey, setSplashKey] = useState(0)
  const [moment, setMoment] = useState<{ kind: MomentKind; holeNumber: number } | null>(null)
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
    // a device that already holds a NAMED player is a returning known user —
    // attach their events to that stable id so cross-device stats line up.
    // Anonymous (nameless) devices are deliberately left un-identified.
    const p = loadPlayer()
    if (p) identifyPlayer(p.id, p.name)
  }, [])

  // a replay link opened while the app is already mounted only fires
  // hashchange — no reload, so the mount-time hash check never reruns.
  // The reverse matters too: entering a replay pushes a hash history entry,
  // so the browser Back button REMOVES the hash — leave the replay when
  // that happens, or Back appears to do nothing. (Re-registered when
  // `watching` changes so the handler sees the current state.)
  useEffect(() => {
    const onHash = () => {
      const p = watchFromHash()
      if (p) {
        setWatching(p)
        setView('watch')
        return
      }
      if (watching) {
        setWatching(null)
        const r = loadRound()
        setView(r && !r.complete ? 'play' : 'home')
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [watching])

  useEffect(
    () => () => {
      if (animTimer.current) window.clearTimeout(animTimer.current)
      if (splashTimer.current) window.clearTimeout(splashTimer.current)
    },
    [],
  )

  // Navigation telemetry: one `screen_viewed` per place a player lands, so we
  // can see who gets past 'play' — into results, replays, the clubhouse. The
  // clubhouse fires its own finer-grained screen events (see RoundsScreen), so
  // it's skipped here to avoid double-counting the same landing.
  useEffect(() => {
    if (view === 'rounds') return
    const props: Record<string, unknown> = { screen: view === 'watch' ? 'replay' : view }
    if ((view === 'play' || view === 'result') && round) {
      props.mode = round.mode
      props.course = round.courseSlug
    }
    track('screen_viewed', props)
    // fire on view change only — round/course ride along as context
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // the tutorial auto-opens on a first visit — that impression is the top of
  // the activation funnel, worth its own event (manual opens tagged below)
  useEffect(() => {
    if (showTutorial) track('tutorial_shown', { trigger: 'auto' })
    // mount-only: the auto-open decision is made once, at load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Sync can complete from either the home CTA or the locker's account panel;
  // both must fold the freshly-pulled dailies into the log so stats/trophies
  // update immediately, not on some later home-screen sync.
  const handleHistorySynced = (h: HistoryEntry[]) => {
    setHistory(h)
    absorbHistory(h) // the round log counts synced dailies too
    // a synced day supersedes this device's unfinished daily for the
    // same date — drop it so a refresh can't replay a completed day
    if (supersededDaily(round, h)) setRound(null)
  }

  if (view === 'home') {
    return (
      <>
        {showTutorial && (
          <Tutorial
            onClose={() => setShowTutorial(false)}
            onSync={() => {
              // the same account flow as the Locker CTA: land in the locker
              // with the panel open
              setShowTutorial(false)
              setLockerView('main')
              setLockerAccount(true)
              setView('rounds')
            }}
          />
        )}
        <HomeScreen
          history={history}
          onHowToPlay={() => {
            track('tutorial_shown', { trigger: 'manual' })
            setShowTutorial(true)
          }}
          onMyRounds={() => {
            setLockerView('main')
            setLockerAccount(false)
            setView('rounds')
          }}
          onStats={() => {
            setLockerView('stats')
            setLockerAccount(false)
            setView('rounds')
          }}
          activeRound={
            round && !round.complete
              ? { mode: round.mode, courseName: courseBySlug(round.courseSlug)?.name ?? '' }
              : null
          }
          playedToday={playedToday}
          onHistorySynced={handleHistorySynced}
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
    const exitWatch = () => {
      window.history.replaceState(null, '', window.location.pathname)
      setWatching(null)
      setView('home')
    }
    if (watching === 'bad') {
      return (
        <div className="screen">
          <p className="tagline center">That replay link doesn't parse — maybe it got truncated in the chat?</p>
          <button className="cta" onClick={exitWatch}>
            Teebox
          </button>
        </div>
      )
    }
    return <ReplayScreen payload={watching} onExit={exitWatch} />
  }

  if (view === 'rounds') {
    return (
      <RoundsScreen
        initialView={lockerView}
        initialAccount={lockerAccount}
        onWatch={(p) => {
          setWatching(p)
          setView('watch')
        }}
        onHistorySynced={handleHistorySynced}
        onBack={() => {
          setLockerAccount(false)
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
          Teebox
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
    // THE moment: an ace (1 on a par 3) or albatross (2 on a par 5) just landed
    const justScored = nextRound.hole?.score
    const parNow = courseBySlug(nextRound.courseSlug)!.holes[nextRound.currentHole].par
    let momentFired = false
    if (justScored && parNow === 3 && justScored.strokes === 1) {
      setMoment({ kind: 'ace', holeNumber: nextRound.currentHole + 1 })
      momentFired = true
    } else if (justScored && parNow === 5 && justScored.strokes === 2) {
      setMoment({ kind: 'albatross', holeNumber: nextRound.currentHole + 1 })
      momentFired = true
    }
    if (momentFired) {
      // the marquee moment — previously only visible if the player shared it
      track('moment_shown', {
        kind: parNow === 3 ? 'ace' : 'albatross',
        mode: nextRound.mode,
        course: nextRound.courseSlug,
        hole_number: nextRound.currentHole + 1,
      })
    }
    const shots = nextRound.hole?.shots ?? []
    const adv = shots[shots.length - 1]?.advantage
    if (adv && !momentFired) {
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
      archiveRound(after) // into the locker — replayable forever if it's a PR/CR
      logRound(after) // into the round log — scorecard + stats material, forever
      setResultFor(after.mode)
      setView('result')
    }
  }

  const classic = uiMode === 'classic'
  const char = characterById(round.character)
  // the target on the wall: a stolen record being chased stays visible in
  // the HUD for the whole unlimited round
  const chase = round.mode === 'practice' ? chasing(round.courseSlug) : null

  // A Fortune shares the day streak, but the daily in progress isn't in
  // `history` until it's signed (recordResult), so counting from history alone
  // would share yesterday's streak — a fresh 2-day streak would read as 1.
  // Count today's daily provisionally so the shared brag matches the moment.
  const activeDaily = round.mode === 'daily' && round.dateKey === localDateKey()
  const shareStreak = computeStreaks(
    activeDaily && !history.some((h) => h.dateKey === round.dateKey)
      ? [...history, { dateKey: round.dateKey, puzzleNumber: round.puzzleNumber, courseSlug: round.courseSlug, toPar, results: [], character: round.character }]
      : history,
  ).dayStreak

  return (
    <div className={`screen play${classic ? ' classic' : ''}`}>
      {moment && (
        <MomentSplash
          kind={moment.kind}
          holeNumber={moment.holeNumber}
          courseName={course.name}
          dateKey={round.dateKey}
          toPar={toPar}
          character={round.character}
          streak={shareStreak}
          onClose={() => setMoment(null)}
        />
      )}
      <div className="top-row">
        <button className="home-link" onClick={() => setView('home')} aria-label="Back to the teebox">
          ‹ Teebox
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
          <div className="yards">{hole.layout.length} yards</div>
          {chase && <div className="chase-chip">🎯 Record {toParLabel(chase.theirToPar)} · {chase.by}</div>}
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
            // the signature pill adds a row to the bottom overlay only at the
            // tee — reserve extra room so it never sits over the tee ball
            bottomInset={hole.shots.length === 0 && spec.signature ? 46 : 0}
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
