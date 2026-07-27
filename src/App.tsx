import { useEffect, useMemo, useRef, useState } from 'react'
import { characterById } from './engine/characters'
import { castLinesForHole, castRound } from './engine/cast'
import { courseBySlug } from './engine/courses'
import { dailySetup, localDateKey, practiceSetup, toParLabel, type DailySetup } from './engine/daily'
import { longOdds } from './engine/odds'
import { LOOK_LABEL, madePuttLook, oddsFor, pinChip } from './engine/resolve'
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
  tryGradeRound,
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
import { ghostBallAt, ghostNoun, loadGhost, paceLabel, paceVs, type Ghost } from './state/ghost'
import { chasing } from './lib/records'
import { identifyPlayer, track } from './lib/analytics'
import { clubhouseLine, fetchHoleChoices, groupChoices, type TallyRow } from './lib/decisionStats'
import { ensureIdentity, loadIdentity, loadPlayer } from './lib/leaderboard'
import { CharacterAvatar } from './ui/Avatars'
import { GreenView, HoleMap, useMapSize } from './ui/HoleMap'
import { SideMap } from './ui/SideMap'
import { CaddyThoughts, ChoiceCards, ClassicScorecard, HazardChips, HoleComplete, RoundCardSheet, StatusBanner, TierBanner } from './ui/panels'
import { reconcileAchievements, type Unlock } from './state/achievements'
import { UnlockToasts } from './ui/Achievements'
import { prefersReducedMotion } from './ui/motion'
import type { MomentKind } from './engine/fortune'
import { MomentSplash } from './ui/MomentSplash'
import { decodeReplay, type ReplayPayload } from './engine/replay'
import { ReplayScreen } from './ui/ReplayScreen'
import { RoundsScreen } from './ui/RoundsScreen'
import { CharacterPickScreen, HomeScreen, ResultScreen } from './ui/screens'
import { bundleIsStale, bundleKnownStale } from './lib/freshness'
import { Tutorial, hasSeenTutorial } from './ui/Tutorial'
import { SeasonSplash } from './ui/SeasonSplash'
import { ackSeason, needsSeasonSplash } from './state/seasonStore'
import { WhatsNewSplash } from './ui/WhatsNewSplash'
import { ackWhatsNew, needsWhatsNew, primeWhatsNew, WHATS_NEW_VERSION } from './state/whatsNew'

type View = 'home' | 'pick' | 'play' | 'result' | 'watch' | 'rounds'

/**
 * The landing modal: AT MOST ONE, ever. Landing on the home screen behind two
 * stacked dialogs is a worse welcome than hearing one thing at a time, so the
 * three announcements are ranked rather than queued — the winner shows, the
 * losers stay pending and take their turn on a later landing (each keeps its
 * own ack, so nothing is lost, only deferred).
 *
 * The order is deliberate: a player who doesn't know the rules yet can't use
 * either announcement, and a change to how the game PLAYS outranks the season
 * board reset. Decided once, at mount — never re-derived mid-session, so a
 * dialog can't appear over a screen the player navigated to themselves.
 */
type LandingModal = 'tutorial' | 'whatsnew' | 'season'

function pickLandingModal(): LandingModal | null {
  if (!hasSeenTutorial()) return 'tutorial'
  if (needsWhatsNew()) return 'whatsnew'
  if (needsSeasonSplash()) return 'season'
  return null
}

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
  /** which single announcement this load earns, if any (see pickLandingModal).
   * Only a load that actually LANDS on home earns one: booting straight into
   * an unfinished round or a #watch replay is not an arrival at the home
   * screen, and a dialog that waited for the player to navigate there later
   * would ambush a screen they chose. Those loads pick nothing — every ack
   * stays pending, and the announcement takes its turn on the next open. */
  const [landing, setLanding] = useState<LandingModal | null>(() => (view === 'home' ? pickLandingModal() : null))
  /** How to Play reopened from the masthead — orthogonal to the landing pick */
  const [manualTutorial, setManualTutorial] = useState(false)
  const showTutorial = manualTutorial || landing === 'tutorial'
  /** which result the result view shows — the daily card or a finished practice round */
  const [resultFor, setResultFor] = useState<'daily' | 'practice'>('daily')
  const [animating, setAnimating] = useState(false)
  const [splash, setSplash] = useState<CharacterAdvantage | null>(null)
  const [splashKey, setSplashKey] = useState(0)
  const [moment, setMoment] = useState<{ kind: MomentKind; holeNumber: number } | null>(null)
  /** Clubhouse decision stats (Layer 2): real tallies of what the field chose
   * on the CURRENT hole, fetched only after that hole is committed. Null until
   * fetched (or unavailable) — the cast block degrades gracefully to cast-only
   * lines in that case. Scoped to the played hole so future-hole tallies never
   * reach the client ahead of a live decision. */
  const [holeChoices, setHoleChoices] = useState<TallyRow[] | null>(null)
  const animTimer = useRef<number | null>(null)
  const splashTimer = useRef<number | null>(null)
  const [mapRef, mapSize] = useMapSize()
  /** the full-18 round card, opened by tapping the header score chip */
  const [showCard, setShowCard] = useState(false)
  /** achievements newly earned by the round that just finished — toast queue */
  const [unlocks, setUnlocks] = useState<Unlock[]>([])

  useEffect(() => {
    saveRound(round)
  }, [round])

  // mint an anonymous player id early so the daily dice can be salted per
  // player — long done by the time a human reaches the first tee
  useEffect(() => {
    // a device with no rounds behind it has nothing to catch up on — stamp the
    // current drop so a first-timer never gets a "what's changed" card later
    primeWhatsNew()
    // grant whatever the stored stats already earn, silently — the first run
    // records a summary the Clubhouse shows once; re-runs are no-ops
    reconcileAchievements('quiet')
    ensureIdentity()
    // a device that already holds a NAMED player is a returning known user —
    // attach their events to that stable id so cross-device stats line up.
    // Anonymous (nameless) devices are deliberately left un-identified.
    const p = loadPlayer()
    if (p) identifyPlayer(p.id, p.name)
  }, [])

  // Clubhouse decision stats (Layer 2): for a daily round only, and ONLY once
  // the current hole is committed (stage 'done'), fetch that one hole's real
  // tallies for the post-hole recap. Scoping to the played hole is deliberate —
  // the client never holds tallies for holes it hasn't reached, so the signal
  // can't leak ahead of a live decision. Fire-and-forget; fetchHoleChoices
  // degrades to null on any failure or in tests.
  useEffect(() => {
    if (!round || round.mode !== 'daily' || round.hole?.stage !== 'done') return
    let cancelled = false
    fetchHoleChoices(round.dateKey, round.currentHole + 1).then((rows) => {
      if (!cancelled) setHoleChoices(rows)
    })
    return () => {
      cancelled = true
    }
  }, [round?.mode, round?.dateKey, round?.currentHole, round?.hole?.stage])

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

  // Warm the staleness verdict on the screens that lead into a round start
  // (pick is every round's doorway; result hosts "play another practice
  // round"), so the SYNC gate in onPick has a fresh answer by the time the
  // player commits. HomeScreen runs its own banner-driven checks; this covers
  // the start paths that never pass back through home.
  useEffect(() => {
    if (view === 'pick' || view === 'result') void bundleIsStale()
  }, [view])

  // the tutorial auto-opens on a first visit — that impression is the top of
  // the activation funnel, worth its own event (manual opens tagged below).
  // The what's-new impression rides along so reach is measurable: it fires at
  // most once per player per drop, which is exactly its ceiling.
  useEffect(() => {
    if (landing === 'tutorial') track('tutorial_shown', { trigger: 'auto' })
    if (landing === 'whatsnew') track('whats_new_shown', { version: WHATS_NEW_VERSION })
    // mount-only: the auto-open decision is made once, at load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Closes the tutorial from either origin. A landing tutorial retires the
   * landing slot rather than handing off to the next announcement — one
   * dialog per arrival, whatever is pending. */
  const closeTutorial = () => {
    setManualTutorial(false)
    setLanding((l) => (l === 'tutorial' ? null : l))
  }

  const playedToday = history.find((e) => e.dateKey === localDateKey()) ?? null

  const hole = useMemo(() => (round && !round.complete && round.hole ? holeInPlay(round) : null), [round])

  // The ghost: loaded once per unlimited round — one fetch for the true
  // record round (the referee keeps what it verified), falling back to the
  // player's own best; then two replay passes, milliseconds. Kept through
  // the result screen so the final margin can be told. Purely derived;
  // never touches the live rng.
  const [ghost, setGhost] = useState<Ghost | null>(null)
  useEffect(() => {
    if (round?.mode !== 'practice') {
      setGhost(null)
      return
    }
    let live = true
    // drop the previous attempt's ghost before the new one loads — otherwise
    // a slow or null-returning fetch lets the old course's pace chip, ball,
    // and early-hole comparisons render against the new round
    setGhost(null)
    void loadGhost(round.courseSlug, round.seed).then((g) => {
      if (live) setGhost(g)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.seed])
  // reduced motion drops the ghost ball (theater) but keeps the pace tracker
  // (the feature)
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])

  // Clubhouse cast (Layer 1): a deterministic sim of the game's regular
  // characters playing today's course, surfaced choices-only in the post-hole
  // recap — never dice, outcomes, or scores. Computed once per round (keyed
  // on the round's identity, not currentHole) since it simulates all 18 holes
  // up front. Daily rounds strip the per-player salt back out of the seed so
  // every player sees the SAME cast; practice seeds carry no salt, so the
  // round's own seed is already the right key (castRound strips any fortune
  // tail itself, for both modes).
  const cast = useMemo(() => {
    if (!round) return null
    const course = courseBySlug(round.courseSlug)
    if (!course) return null
    const seed = round.mode === 'daily' ? `round:${round.dateKey}:${round.courseSlug}` : round.seed
    return castRound({ course, cond: round.cond, seed })
  }, [round?.mode, round?.dateKey, round?.courseSlug, round?.cond, round?.seed])

  // Clubhouse decision stats (Layer 2): the real-tally headline for the CURRENT
  // hole's opening stage (the headline decision), from today's posted rounds.
  // Read off `hole.shots[0]` — the stage actually faced and recorded — rather
  // than re-deriving it from par: a bail-out par 3 (see `Bailout` in
  // engine/types.ts) opens in `second`, not `approach`, and a stale par-based
  // guess would query for rows that don't exist, silently emptying the tally
  // for that hole. Daily only — practice has no shared field to tally against
  // — and null whenever the rows haven't loaded (or the backend is
  // unavailable, or the hole hasn't recorded an opening shot yet), in which
  // case the cast lines above stand alone, unchanged.
  const clubhouseTally = useMemo(() => {
    if (!round || round.mode !== 'daily' || !holeChoices) return null
    const stage = hole?.shots[0]?.stage
    if (!stage) return null
    const grouped = groupChoices(holeChoices, round.currentHole + 1, stage)
    return clubhouseLine(grouped, stage)
  }, [round?.mode, round?.currentHole, holeChoices, hole])

  // the swing coach's report replays the whole round's EV model — memoize so unrelated
  // state changes on the result screen don't recompute it
  const roundGrade = useMemo(() => (round && round.complete ? tryGradeRound(round) : null), [round])

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
        {/* exactly one of these three can be live at a time — `landing` holds a
            single value and the manual tutorial replaces rather than stacks */}
        {landing === 'season' && !showTutorial && (
          <SeasonSplash
            onClose={() => {
              ackSeason()
              setLanding(null)
            }}
          />
        )}
        {landing === 'whatsnew' && !showTutorial && (
          <WhatsNewSplash
            onClose={() => {
              ackWhatsNew()
              setLanding(null)
            }}
          />
        )}
        {showTutorial && (
          <Tutorial
            onClose={closeTutorial}
            onSync={() => {
              // the same account flow as the Clubhouse CTA: land in the Clubhouse
              // with the panel open
              closeTutorial()
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
            setManualTutorial(true)
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
          // the one doorway every round starts through — daily, practice,
          // and result-screen rematches all land here. A stale bundle would
          // stamp the old engine version onto a round the referee is already
          // guaranteed to refuse; reload onto the current bundle instead.
          if (bundleKnownStale()) {
            window.location.reload()
            return
          }
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
    // the swing coach's report needs the same shot-by-shot record the recap does
    const grade = recapSource ? roundGrade : null
    return (
      <>
        {unlocks.length > 0 && <UnlockToasts unlocks={unlocks} onDone={() => setUnlocks([])} />}
        <ResultScreen
          setup={setup}
          results={results}
          toPar={toPar}
          practice={isPractice}
          recap={recapSource ? buildRecap(recapSource) : null}
          grade={grade}
          boardRound={recapSource}
          ghostClose={
            isPractice && round && ghost
              ? { margin: roundToPar(round) - ghost.toPar, kind: ghost.kind, holder: ghost.holder }
              : null
          }
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
      </>
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
      archiveRound(after) // into the Clubhouse — replayable forever if it's a PB/CR
      logRound(after) // into the round log — scorecard + stats material, forever
      // read-only pass over the stats the round just moved; anything newly
      // earned toasts over the wrap screen, politely queued
      setUnlocks(reconcileAchievements('live'))
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
              <span className="chip">
                {round.cond.wind + (hole.layout.gust ?? 0)} mph
                {(hole.layout.gust ?? 0) >= 4 ? ' · gusting' : (hole.layout.gust ?? 0) <= -3 ? ' · a lull' : ''}
              </span>
              <span className="chip">{round.cond.greens.toLowerCase()} greens</span>
            </div>
          </div>
        </div>
        <div className="hole-right">
          {/* the score chip IS the round card now — tap it for the full 18.
              The modern layout no longer carries the always-on strip. */}
          <button
            className={`topar ${toPar < 0 ? 'good' : toPar > 0 ? 'bad' : ''}`}
            onClick={() => setShowCard(true)}
            aria-label="See your full round card"
          >
            {toParLabel(toPar)} to par
            {/* the expand arrows are the tell that the chip opens the full
                card — without them this was a hidden feature. Drawn inline
                (not a unicode arrow) so no platform renders a tofu box. */}
            <svg className="topar-expand" viewBox="0 0 16 16" aria-hidden>
              <path
                d="M10 3h3v3M13 3L9.5 6.5M6 13H3v-3M3 13l3.5-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="yards">{hole.layout.length} yards</div>
        </div>
      </header>
      {showCard && (
        <RoundCardSheet
          course={course}
          scores={round.scores}
          currentHole={round.currentHole}
          toPar={toPar}
          onClose={() => setShowCard(false)}
        />
      )}
      {/* Ghost/record chips get their own row rather than living inside
          .hole-right: that block refuses to shrink (flex-shrink: 0), so a
          230px chip inside it squeezed the par/course text to ~11px — "Par 4 ·
          SI 8" wrapped and the course name clipped to its first letter on
          every ghost round. Visually this is where the chips already sat. */}
      {(ghost || chase) && (
        <div className="ghost-chip-row">
          {ghost &&
            (() => {
              const pace = paceVs(ghost, round.scores, round.courseSlug)
              return (
                <div className={`pace-chip ${pace.state}`}>
                  👻{' '}
                  {pace.holesCompared === 0
                    ? `chasing ${ghostNoun(ghost)} · ${toParLabel(ghost.toPar)}`
                    : paceLabel(pace, ghost)}
                </div>
              )
            })()}
          {/* the stolen record stays on the wall unless the ghost IS that record —
              a personal-best fallback ghost races "your best", so the real target
              (holder + score) must stay visible for a "win it back" attempt */}
          {chase && (!ghost || ghost.kind === 'personal') && (
            <div className="chase-chip">🎯 Record {toParLabel(chase.theirToPar)} · {chase.by}</div>
          )}
        </div>
      )}

      <div ref={mapRef} className={`map-wrap${classic && hole.stage !== 'putt' ? ' side' : ''}`}>
        {hole.stage === 'putt' ? (
          <GreenView feet={hole.ball.puttFeet ?? 20} holeNumber={spec.number} greens={round.cond.greens} pin={hole.layout.pin} size={mapSize} />
        ) : classic ? (
          <SideMap layout={hole.layout} ball={hole.ball} />
        ) : (
          <HoleMap
            layout={hole.layout}
            ball={hole.ball}
            ghostBall={
              ghost && !reducedMotion ? ghostBallAt(ghost, round.currentHole, hole.shots.length) : null
            }
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
              (() => {
                const pin = pinChip(hole.layout)
                return (
                  <CaddyThoughts
                    chips={[
                      `${LOOK_LABEL[madePuttLook(hole.strokes, spec.par)].chip} · ~${hole.ball.puttFeet} ft`,
                      `${round.cond.greens} green`,
                      ...(pin ? [pin] : []),
                    ]}
                  />
                )
              })()
            ) : (
              // wind/greens/hazards live on the map at every stage — the hole
              // head no longer carries condition chips on small screens
              <HazardChips hole={hole} />
            )}
          </div>
        )}
      </div>

      <div className={`panel${classic ? ' classic-flow' : ''}`}>
        {holeDone ? (
          <HoleComplete
            score={hole.score!}
            par={spec.par}
            runningToPar={toPar}
            last={round.currentHole >= course.holes.length - 1}
            onNext={next}
            castLines={cast ? castLinesForHole(cast, round.currentHole, Boolean(hole.layout.bailout)) : undefined}
            clubhouseTally={clubhouseTally ?? undefined}
            bailout={Boolean(hole.layout.bailout)}
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
        {/* classic keeps its inline card; modern gave the strip's room to the
            map — the full card lives behind the score chip instead */}
        {classic && <ClassicScorecard course={course} scores={round.scores} currentHole={round.currentHole} />}
      </div>
    </div>
  )
}
