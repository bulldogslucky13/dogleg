import { useEffect, useState } from 'react'
import { characterById, playableCharacters } from '../engine/characters'
import { courseBySlug, COURSES, PAR3_COURSES, playRatingFor } from '../engine/courses'
import { dailySetup, forecastSetup, RESULT_LABEL, RESULT_SQUARE, shareText, SITE_URL, toParLabel, type DailySetup } from '../engine/daily'
import { gradeCopy, type RoundGrade } from '../engine/grade'
import { decisionsFromScores, encodeReplay } from '../engine/replay'
import type { CharacterId, HoleResult } from '../engine/types'
import { track } from '../lib/analytics'
import { backendEnabled } from '../lib/backend'
import { bundleIsStale, FRESH_TTL_MS } from '../lib/freshness'
import { fetchCourseRecords, fetchSeasonRecords, loadPlayer, type CourseRecord } from '../lib/leaderboard'
import { seasonCountdown, seasonForDate } from '../engine/season'
import { dismissSteals, pendingSteals, syncLedger, type StolenRecord } from '../lib/records'
import { loadGhost, type Ghost } from '../state/ghost'
import { currentHandicap, formatHandicap } from '../state/stats'
import { characterRecords, computeStreaks, loadArchive, type HistoryEntry, type RoundRecap, type RoundState } from '../state/store'
import { AccountPanel } from './AccountPanel'
import { CharacterAvatar } from './Avatars'
import { DailyBoardView, ScoreBoard } from './Leaderboard'
import { PlayRatingChip } from './PlayRating'

export function HomeScreen(props: {
  history: HistoryEntry[]
  activeRound: { mode: 'daily' | 'practice'; courseName: string } | null
  playedToday: HistoryEntry | null
  onTeeOff: () => void
  onResume: () => void
  onPractice: (slug: string) => void
  onShowResult: () => void
  onHowToPlay: () => void
  onMyRounds: () => void
  /** deep-link into the locker's lifetime stats view */
  onStats: () => void
  onHistorySynced?: (h: HistoryEntry[]) => void
}) {
  const setup = dailySetup()
  const streaks = computeStreaks(props.history)
  const records = characterRecords(props.history)
  const [showCourses, setShowCourses] = useState(false)
  const [courseTab, setCourseTab] = useState<'courses' | 'par3'>('courses')
  const [courseRecs, setCourseRecs] = useState<Map<string, CourseRecord> | null>(null)
  const [seasonRecs, setSeasonRecs] = useState<Map<string, CourseRecord> | null>(null)
  /** which season the loaded seasonRecs belong to — a rollover while the
   * panel sits open must refetch for the new key, not show last season's
   * holders under the new season's name */
  const [seasonRecsKey, setSeasonRecsKey] = useState<string | null>(null)
  const [steals, setSteals] = useState(() => pendingSteals())
  /** an engine-changing deploy landed after this tab loaded its bundle — a
   * round played now couldn't post, so say "reload" before the first stroke */
  const [stale, setStale] = useState(false)
  const season = seasonForDate()

  // checked on mount, then again whenever the tab comes back into view and on
  // a slow interval — a home screen left open through a deploy must notice it
  // BEFORE the player tees off, not at submit time. (bundleIsStale itself
  // caches, so the extra calls are only fetches when its TTL has lapsed.)
  useEffect(() => {
    let cancelled = false
    const check = () =>
      void bundleIsStale().then((s) => {
        if (!cancelled && s) setStale(true)
      })
    check()
    const onVisible = () => {
      if (!document.hidden) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(check, FRESH_TTL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // the all-time board loads once when the browser opens — the wall of legends
  useEffect(() => {
    if (showCourses && backendEnabled && courseRecs === null) {
      void fetchCourseRecords().then((r) => setCourseRecs(r ?? new Map()))
    }
  }, [showCourses, courseRecs])

  // the season board is the live race: fetched per season KEY, so any render
  // after a quarterly rollover swaps in the fresh board
  useEffect(() => {
    if (showCourses && backendEnabled && seasonRecsKey !== season.key) {
      setSeasonRecsKey(season.key)
      setSeasonRecs(null)
      // a FAILED season fetch stays null (no lines) — an empty season board is
      // "open, be the first"; an unreachable one must not pretend to know
      void fetchSeasonRecords(season.key).then((r) => setSeasonRecs(r))
    }
  }, [showCourses, seasonRecsKey, season.key])

  // the record-stolen check: compare the records this device holds against
  // the server's holders. Purely a read — the "notification" is derived.
  useEffect(() => {
    if (!backendEnabled) return
    const myName = loadPlayer()?.name ?? null
    if (!myName) return
    void fetchCourseRecords().then((recs) => {
      if (!recs) return
      syncLedger(recs, myName)
      setSteals(pendingSteals())
    })
  }, [])
  const avgLabel = (avg: number) => (avg > 0 ? `+${avg.toFixed(1)}` : avg.toFixed(1))
  // a stale bundle must not START any round — the referee refuses its score,
  // daily or practice alike. Every start path funnels into the remedy: the
  // page reloads onto the current bundle and the player tees off from there.
  const startPractice = stale ? () => window.location.reload() : props.onPractice
  return (
    <div className="screen home">
      <header className="masthead">
        <div className="masthead-top">
          <div className="kicker">Daily challenge · No. {setup.puzzleNumber}</div>
          <button className="how-to-play" onClick={props.onHowToPlay}>
            How to play
          </button>
        </div>
        <h1>
          Dog<em>leg</em>
        </h1>
        <p className="tagline">One round. 18 holes. ~2 minutes.</p>
      </header>

      {stale && (
        <div className="stale-banner" role="status">
          <span>A new version of DogLeg is live — refresh so your score can post.</span>
          <button onClick={() => window.location.reload()}>Refresh</button>
        </div>
      )}

      {steals.length > 0 && (
        <StealCard
          steals={steals}
          onDismiss={() => {
            dismissSteals()
            setSteals([])
          }}
          onWinItBack={startPractice}
        />
      )}

      <div className="today-card">
        <div className="kicker">Today's course</div>
        <h2>{setup.course.name}</h2>
        <p>
          {setup.course.location} · Par {setup.course.holes.reduce((s, h) => s + h.par, 0)}
        </p>
        <div className="chips">
          <span className="chip dark">Wind {setup.cond.wind}</span>
          <span className="chip dark">Greens {setup.cond.greens}</span>
          <PlayRatingChip slug={setup.course.slug} dark />
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
      <StreakNote />
      {records.length > 0 && (
        <div className="char-records">
          {records.map((r) => {
            const spec = characterById(r.id)!
            return (
              <div key={r.id} className="char-record" title={spec.edge}>
                <CharacterAvatar id={r.id} size={36} />
                <div className="char-record-text">
                  <b>{spec.name}</b>
                  <span>
                    {r.played} round{r.played === 1 ? '' : 's'} · avg {avgLabel(r.avgToPar)} · best {toParLabel(r.bestToPar)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="cta-tease">Can you break par today?</p>

      {props.playedToday ? (
        <button className="cta" onClick={props.onShowResult}>
          See today's card · {toParLabel(props.playedToday.toPar)}
        </button>
      ) : props.activeRound?.mode === 'daily' ? (
        <button className="cta" onClick={props.onResume}>
          Resume today's round
        </button>
      ) : stale ? (
        // a stale bundle would play a round the referee refuses to post —
        // the primary CTA becomes the fix instead of the trap
        <button className="cta" onClick={() => window.location.reload()}>
          Refresh to play
        </button>
      ) : (
        <button className="cta" onClick={props.onTeeOff}>
          Tee off
        </button>
      )}
      {props.activeRound?.mode === 'practice' && (
        <button className="cta ghost" onClick={props.onResume}>
          Resume practice round · {props.activeRound.courseName}
        </button>
      )}
      {stale && props.activeRound && !props.playedToday && (
        // an in-progress round already carries its creation-time engine stamp,
        // so its score is unpostable no matter when the tab refreshes.
        // Discarding a half-played daily for the player would be worse than
        // telling the truth: finish it if you like, the board won't take it.
        <p className="fine">
          Your round in progress started on an old version of DogLeg, so its score won't post to the board — your
          next round will.
        </p>
      )}

      {props.playedToday && <ForecastCard today={props.playedToday} />}

      <button className="cta ghost" onClick={() => setShowCourses((v) => !v)}>
        Play unlimited · Browse courses
      </button>
      {showCourses && (
        <div className="course-list">
          <div className="course-tabs" role="tablist" aria-label="Course type">
            <button
              role="tab"
              aria-selected={courseTab === 'courses'}
              className={`course-tab${courseTab === 'courses' ? ' active' : ''}`}
              onClick={() => setCourseTab('courses')}
            >
              Courses
            </button>
            <button
              role="tab"
              aria-selected={courseTab === 'par3'}
              className={`course-tab${courseTab === 'par3' ? ' active' : ''}`}
              onClick={() => {
                setCourseTab('par3')
                track('course_tab_selected', { tab: 'par3' })
              }}
            >
              Par 3 Courses
            </button>
          </div>
          {courseTab === 'par3' && <Par3Intro />}
          {courseTab === 'courses' && (
            <p className="season-countdown">
              ⏳ {season.name} ends in {seasonCountdown(season)} — season records are up for grabs
            </p>
          )}
          {courseTab === 'courses' &&
            COURSES.map((c) => {
              const sr = seasonRecs?.get(c.slug)
              const at = courseRecs?.get(c.slug)
              return (
                <button key={c.slug} className="course-row" onClick={() => startPractice(c.slug)}>
                  <b>{c.name}</b>
                  <span>
                    {c.location} · Play Rating {playRatingFor(c.slug)}/10
                  </span>
                  {seasonRecs &&
                    (sr ? (
                      <em className="course-cr">
                        Season {toParLabel(sr.to_par)} · {characterById(sr.character ?? undefined)?.emoji ?? ''}{' '}
                        {sr.player_name}
                      </em>
                    ) : (
                      <em className="course-cr open">Season record open — be the first</em>
                    ))}
                  {at && (
                    <em className="course-cr alltime">
                      All-time {toParLabel(at.to_par)} · {characterById(at.character ?? undefined)?.emoji ?? ''}{' '}
                      {at.player_name}
                    </em>
                  )}
                </button>
              )
            })}
          {courseTab === 'par3' &&
            PAR3_COURSES.map((c) => {
              const sr = seasonRecs?.get(c.slug)
              const at = courseRecs?.get(c.slug)
              return (
                <button key={c.slug} className="course-row" onClick={() => startPractice(c.slug)}>
                  <b>{c.name}</b>
                  <span>
                    {c.location} · {c.holes.length} holes · Play Rating {playRatingFor(c.slug)}/10
                  </span>
                  {seasonRecs &&
                    (sr ? (
                      <em className="course-cr">
                        Season {toParLabel(sr.to_par)} · {characterById(sr.character ?? undefined)?.emoji ?? ''}{' '}
                        {sr.player_name}
                      </em>
                    ) : (
                      <em className="course-cr open">Season record open — be the first</em>
                    ))}
                  {at && (
                    <em className="course-cr alltime">
                      All-time {toParLabel(at.to_par)} · {characterById(at.character ?? undefined)?.emoji ?? ''}{' '}
                      {at.player_name}
                    </em>
                  )}
                </button>
              )
            })}
          <p className="fine">Practice rounds don't touch your streak.</p>
        </div>
      )}
      {loadArchive().length > 0 && (
        <button className="cta ghost" onClick={props.onMyRounds}>
          🏆 Clubhouse · my rounds
        </button>
      )}
      <HandicapChip onTap={props.onStats} />
      <AccountPanel onHistorySynced={props.onHistorySynced} />
    </div>
  )
}

const PAR3_INTRO_KEY = 'dogleg:par3intro:v1'

/**
 * First visit to the Par 3 tab: a one-time explainer for how the shorts play
 * differently. Dismiss persists; storage-blocked browsers just see it again.
 */
function Par3Intro() {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(PAR3_INTRO_KEY) === '1'
    } catch {
      return false
    }
  })
  if (seen) return null
  return (
    <div className="par3-intro" role="note">
      <div className="kicker">⛳ New: par-3 courses</div>
      <p>
        <b>Nothing but one-shotters</b> — real short courses at their real length (9, 10, or 18
        holes), straight off the club's scorecard.
      </p>
      <ul>
        <li>
          <b>The flag matters.</b> A sucker pin pays the hunt and punishes the miss; a friendly flag
          is green light. Watch the tee chips.
        </li>
        <li>
          <b>The wind swirls.</b> Gusts change hole to hole out here — check before you pick a line.
        </li>
        <li>
          <b>Every hole is real.</b> Lengths off the club's own scorecard, hazards mapped from
          satellite imagery — not made up.
        </li>
      </ul>
      <button
        className="cta ghost slim"
        onClick={() => {
          try {
            localStorage.setItem(PAR3_INTRO_KEY, '1')
          } catch {
            /* storage blocked: show it again next time */
          }
          setSeen(true)
        }}
      >
        Got it — show me the tees
      </button>
    </div>
  )
}

/**
 * Tomorrow's daily, teased in golf-forecast tone — course + conditions only,
 * never the seed/dateKey/puzzle number or anything outcome-derived. Shown on
 * the home screen once today's round is in the books, so it reads as "you're
 * done — here's what's on the tee tomorrow".
 */
export function ForecastCard(props: { today: HistoryEntry }) {
  const forecast = forecastSetup()
  const windTone =
    forecast.cond.wind >= 18
      ? `${forecast.cond.wind} mph gusts`
      : forecast.cond.wind >= 12
        ? `${forecast.cond.wind} mph breeze`
        : `${forecast.cond.wind} mph wind`
  const windMood = forecast.cond.wind >= 18 ? '💨' : forecast.cond.wind >= 12 ? '🍃' : '☀️'
  const greensHot = forecast.cond.greens === 'Fast'

  // how tomorrow's Play Rating compares to today's — only call it out when the
  // swing is real (±2), so the tease isn't noise on an ordinary rotation day.
  // today's score nudges which emoji lands: a rough day sharpens the harder
  // read into dread, a hot one softens the easier read into relief.
  const ratingDelta = playRatingFor(forecast.course.slug) - playRatingFor(props.today.courseSlug)
  const roughToday = props.today.toPar >= 3
  const hotToday = props.today.toPar <= -2
  const outlookEmoji =
    ratingDelta >= 2 ? (roughToday ? '😩' : '😬') : ratingDelta <= -2 ? (hotToday ? '😮‍💨' : '😅') : undefined

  return (
    <div className="forecast">
      <div className="kicker">Tomorrow's forecast</div>
      <div className="forecast-line">
        <b>{forecast.course.name}</b>
        <span className="chips slim">
          <span className="chip forecast-chip">
            {windMood} {windTone} · {greensHot ? '⚡ ' : ''}
            {forecast.cond.greens.toLowerCase()} greens
          </span>
          <PlayRatingChip slug={forecast.course.slug} className="forecast-chip" suffix={outlookEmoji} />
        </span>
      </div>
    </div>
  )
}

/**
 * The record-stolen card — one card no matter how many records fell, never
 * a queue of banners. Playful, never insulting: the reader should reach for
 * their putter, not their feelings. "Win it back" deep-links straight into
 * unlimited play on that course.
 */
function StealCard(props: {
  steals: Array<{ courseSlug: string } & StolenRecord>
  onDismiss: () => void
  onWinItBack: (slug: string) => void
}) {
  const [expanded, setExpanded] = useState(props.steals.length === 1)
  const courseName = (slug: string) => courseBySlug(slug)?.name ?? slug
  const one = props.steals.length === 1 ? props.steals[0] : null
  return (
    <div className="steal-card" role="status">
      <button className="steal-x" onClick={props.onDismiss} aria-label="Dismiss">
        ✕
      </button>
      <div className="kicker">🚨 Course record stolen</div>
      {one ? (
        <>
          <p>
            <b>{one.by}</b> shot <b>{toParLabel(one.theirToPar)}</b> at {courseName(one.courseSlug)}, sliding past
            your {toParLabel(one.myToPar)}. Word travels fast around here.
          </p>
          <button className="cta steal-cta" onClick={() => props.onWinItBack(one.courseSlug)}>
            Win it back
          </button>
        </>
      ) : (
        <>
          <p>
            <b>{props.steals.length} of your course records fell</b> while you were gone.
            {!expanded && ' The nerve.'}
          </p>
          {expanded ? (
            <div className="steal-list">
              {props.steals.map((s) => (
                <div key={s.courseSlug} className="steal-row">
                  <span>
                    <b>{courseName(s.courseSlug)}</b> — {s.by}, {toParLabel(s.theirToPar)} (yours: {toParLabel(s.myToPar)})
                  </span>
                  <button className="cta ghost slim" onClick={() => props.onWinItBack(s.courseSlug)}>
                    Win it back
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <button className="cta ghost steal-cta" onClick={() => setExpanded(true)}>
              See the damage
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** what the result screen's quiet close calls the thing that was raced */
function ghostCloseNoun(close: { kind: 'record' | 'personal'; holder: string | null }): string {
  if (close.kind !== 'record') return 'your best'
  return close.holder ? `${close.holder}'s record` : 'your own record'
}

/**
 * The pre-round tale of the tape: who holds the wall, their score, and their
 * actual card hole by hole — so the challenger knows exactly what they're
 * getting into. Self-loading (one fetch + one engine replay) and quick; it
 * renders when ready and never delays the tee shot.
 */
function GhostStakes(props: { courseSlug: string }) {
  const [ghost, setGhost] = useState<Ghost | null>(null)
  useEffect(() => {
    let live = true
    void loadGhost(props.courseSlug).then((g) => {
      if (live) setGhost(g)
    })
    return () => {
      live = false
    }
  }, [props.courseSlug])
  if (!ghost) return null
  const char = characterById(ghost.character)
  const headline =
    ghost.kind === 'record'
      ? ghost.holder
        ? `The record: ${ghost.holder}`
        : 'The record is yours — defend it'
      : 'The ghost: your best round here'
  return (
    <div className={`ghost-stakes${ghost.kind === 'record' ? ' cr' : ''}`}>
      <div className="ghost-stakes-head">
        <b>👻 {headline}</b>
        <span className="ghost-stakes-score">
          {char ? `${char.emoji} ` : ''}
          {toParLabel(ghost.toPar)}
        </span>
      </div>
      <div className="emoji-grid ghost-grid">
        <div>
          {ghost.results.slice(0, 9).map((r, i) => (
            <span key={i}>{RESULT_SQUARE[r]}</span>
          ))}
        </div>
        <div>
          {ghost.results.slice(9).map((r, i) => (
            <span key={i}>{RESULT_SQUARE[r]}</span>
          ))}
        </div>
      </div>
      <span className="fine">Their card, their luck — you race the pace on your own dice.</span>
    </div>
  )
}

/** The fortune disclosure, wherever the current streak is shown. Flavor
 * only, by design: the mechanic is disclosed, the math stays under the
 * hood — never print the multiplier or the ramp. */
function StreakNote() {
  // honest by design: the boost only applies to streaks the referee can
  // verify — dailies posted under a clubhouse name. Anonymous local streaks
  // don't move the odds (anti-cheat), so the copy says so.
  return (
    <p className="fine streak-note">
      The golf gods reward the faithful — post your daily cards under a clubhouse name, and the longer your streak,
      the better your odds of striking a Fortune.
    </p>
  )
}

/** The home page's quiet handicap line. Hidden entirely until the handicap
 * is established — the empty state lives in the locker, not here. */
function HandicapChip(props: { onTap: () => void }) {
  const hcap = currentHandicap()
  if (!hcap.established) return null
  return (
    <button className="hcap-chip" onClick={props.onTap}>
      Current handicap <b>{formatHandicap(hcap.value)}</b> ›
    </button>
  )
}

export function CharacterPickScreen(props: {
  setup: DailySetup
  practice: boolean
  onPick: (c: CharacterId) => void
  onBack: () => void
}) {
  const { course, cond } = props.setup
  return (
    <div className="screen pick">
      <button className="home-link" onClick={props.onBack}>
        ‹ Teebox
      </button>
      <header>
        <div className="kicker">
          {props.practice ? 'Practice round' : "Today's round"} · {course.name}
        </div>
        <h2 className="pick-title">Pick your player</h2>
        <p className="tagline">One edge, all {course.holes.length} holes. Choose for the course in front of you:</p>
      </header>
      {props.practice && <GhostStakes courseSlug={course.slug} />}
      <div className="chips center">
        <span className="chip">{course.holes.reduce((s, h) => s + h.yards, 0).toLocaleString()} yards</span>
        <span className="chip">Wind {cond.wind} mph</span>
        <span className="chip">{cond.greens} greens</span>
        <PlayRatingChip slug={course.slug} />
      </div>
      <div className="char-cards">
        {/* playableCharacters benches the Fairway Finder on par-3 courses —
         * his edge is the driver, and a zero-edge pick would be a trap.
         * Shared with the clubhouse cast (cast.ts) so the two rosters can't drift. */}
        {playableCharacters(course).map((c) => (
          <button key={c.id} className={`char-card ${c.id}`} onClick={() => props.onPick(c.id)}>
            <CharacterAvatar id={c.id} size={84} />
            <b>{c.name}</b>
            <span className="char-tagline">{c.tagline}</span>
            <span className="char-edge">{c.edge}</span>
          </button>
        ))}
      </div>
      {course.par3Course && <p className="fine">The Fairway Finder sat this one out — no drivers on a par-3 course.</p>}
      <p className="fine">Your player shifts the real odds — you'll see it in every bar.</p>
    </div>
  )
}

export function ResultScreen(props: {
  setup: DailySetup
  results: HoleResult[]
  toPar: number
  practice: boolean
  character?: CharacterId
  recap: RoundRecap | null
  /** the swing coach's report — decision quality vs. luck, null when ungradeable */
  grade: RoundGrade | null
  /** the finished round, when it's still in storage — enables board submission */
  boardRound: RoundState | null
  /** the ghost race's quiet close: final margin vs the chased round */
  ghostClose?: { margin: number; kind: 'record' | 'personal'; holder: string | null } | null
  history: HistoryEntry[]
  onHome: () => void
  onPracticeAgain: () => void
}) {
  const { toPar, results } = props
  const [copied, setCopied] = useState(false)
  const [copiedReplay, setCopiedReplay] = useState(false)
  const streaks = computeStreaks(props.history)
  const broke = toPar < 0
  const char = characterById(props.character)
  const text = shareText(props.setup, results, toPar, props.character, streaks.dayStreak)
  // a replay link IS the round: seed + decisions, re-run by the viewer's engine
  const replayUrl = (() => {
    if (!props.boardRound) return null
    const decisions = decisionsFromScores(props.boardRound.scores)
    if (!decisions) return null
    const code = encodeReplay({
      seed: props.boardRound.seed,
      character: props.boardRound.character,
      decisions,
      // loadPlayer is the NAMED identity — an anonymous player's replay is
      // simply unattributed, it never leaks their minted id as a name
      name: loadPlayer()?.name ?? undefined,
    })
    return `https://${SITE_URL}/#watch=${code}`
  })()
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const copy = async () => {
    let ok = true
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // clipboard API blocked (http, old browser): select-and-copy fallback
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      ok = document.execCommand('copy')
      ta.remove()
    }
    if (!ok) return
    track('share_clicked', { method: 'clipboard', to_par: toPar })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const share = async () => {
    try {
      await navigator.share({ text })
      track('share_clicked', { method: 'native', to_par: toPar })
    } catch (err) {
      // AbortError means the user closed the share sheet — anything else is a real failure
      if (err instanceof Error && err.name === 'AbortError') return
      await copy()
    }
  }
  return (
    <div className="screen result">
      <div className="kicker">
        {props.practice ? 'Practice round' : `Daily No. ${props.setup.puzzleNumber}`} · {props.setup.course.name}
      </div>
      <h1 className={`final ${broke ? 'good' : ''}`}>{toParLabel(toPar)}</h1>
      {char && (
        <div className="char-chip result-chip">
          <CharacterAvatar id={char.id} size={34} />
          <span>as the {char.name}</span>
        </div>
      )}
      <p className="verdict">
        {broke
          ? 'You broke par. Cap tipped, card signed. 🏆'
          : toPar === 0
            ? 'Level with the course. So close.'
            : toPar <= 3
              ? 'The course won today — barely.'
              : 'The course won today.'}
      </p>
      {props.ghostClose && props.ghostClose.margin > 0 && (
        <p className="fine ghost-close">
          👻 {props.ghostClose.margin} off {ghostCloseNoun(props.ghostClose)} — so close, again. The ghost will be
          waiting.
        </p>
      )}
      {props.ghostClose && props.ghostClose.margin === 0 && (
        <p className="fine ghost-close">
          👻 Matched {ghostCloseNoun(props.ghostClose)} to the stroke — ties don't take it. One better.
        </p>
      )}
      <div className="emoji-grid">
        <div>{results.slice(0, 9).map((r, i) => (
          <span key={i}>{RESULT_SQUARE[r]}</span>
        ))}</div>
        <div>{results.slice(9).map((r, i) => (
          <span key={i}>{RESULT_SQUARE[r]}</span>
        ))}</div>
      </div>
      {props.recap && (
        <div className="recap-tiles">
          {props.recap.best && (
            <div className="stat">
              <b>{RESULT_LABEL[props.recap.best.result]}</b>
              <span>Best · No. {props.recap.best.hole}</span>
            </div>
          )}
          <div className="stat">
            {props.recap.worst ? (
              <>
                <b>{RESULT_LABEL[props.recap.worst.result]}</b>
                <span>Toughest · No. {props.recap.worst.hole}</span>
              </>
            ) : (
              <>
                <b>Clean</b>
                <span>No blow-ups</span>
              </>
            )}
          </div>
          {props.recap.deuces !== null && (
            <div className="stat">
              <b>{props.recap.deuces}</b>
              <span>Deuce{props.recap.deuces === 1 ? '' : 's'}</span>
            </div>
          )}
          <div className="stat">
            <b>{props.recap.aggressiveUsed}/8</b>
            <span>Aggressive used</span>
          </div>
          <div className="stat">
            {props.recap.longestMake !== null && props.recap.longestMake >= 15 ? (
              <>
                <b>{props.recap.longestMake} ft</b>
                <span>Longest make</span>
              </>
            ) : (
              <>
                <b>{props.recap.penalties}</b>
                <span>Penalt{props.recap.penalties === 1 ? 'y' : 'ies'}</span>
              </>
            )}
          </div>
        </div>
      )}
      {props.grade && (
        <div className="coach-panel">
          <div className="kicker">The Swing Coach's Report</div>
          <p className="verdict">{gradeCopy(props.grade).headline}</p>
          <div className="recap-tiles coach-tiles">
            <div className="stat">
              <b>{toParLabel(props.grade.decidedLike)}</b>
              <span>Decided like</span>
            </div>
            <div className="stat">
              <b>{props.grade.luck < 0 ? '−' : '+'}{Math.abs(props.grade.luck).toFixed(1)}</b>
              <span>Rub of the green</span>
            </div>
          </div>
          <p className="fine coach-line">{gradeCopy(props.grade).decisionLine}</p>
          <p className="fine coach-line">{gradeCopy(props.grade).luckLine}</p>
        </div>
      )}
      {props.boardRound ? (
        <ScoreBoard round={props.boardRound} />
      ) : (
        // re-opening today's card after the full round left memory (a practice
        // round took the slot, or a refreshed device only kept the day's
        // history entry): the card was already posted, so show the standings
        // read-only rather than dropping the board entirely
        !props.practice && <DailyBoardView dateKey={props.setup.dateKey} />
      )}
      {!props.practice && (
        <>
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
          <StreakNote />
        </>
      )}
      {!props.practice && (
        <div className="share-block">
          <div className="kicker">Your share card</div>
          <pre className="share-preview">{text}</pre>
          {canNativeShare && (
            <button className="cta" onClick={share}>
              Share your card
            </button>
          )}
          <button className={`cta${canNativeShare ? ' ghost' : ''}`} onClick={copy}>
            {copied ? 'Copied — paste it in the chat ✓' : 'Copy for the group chat'}
          </button>
        </div>
      )}
      {replayUrl && (
        <button
          className="cta ghost"
          onClick={async () => {
            let ok = true
            try {
              await navigator.clipboard.writeText(replayUrl)
            } catch {
              // clipboard API blocked: select-and-copy fallback, same as the
              // share card — and like there, no success claim it didn't earn
              const ta = document.createElement('textarea')
              ta.value = replayUrl
              ta.style.position = 'fixed'
              ta.style.opacity = '0'
              document.body.appendChild(ta)
              ta.select()
              ok = document.execCommand('copy')
              ta.remove()
            }
            if (!ok) return
            track('replay_link_copied', { to_par: toPar, mode: props.practice ? 'practice' : 'daily' })
            setCopiedReplay(true)
            setTimeout(() => setCopiedReplay(false), 2000)
          }}
        >
          {copiedReplay ? 'Replay link copied ✓' : '🎬 Copy replay link — let them watch it'}
        </button>
      )}
      {props.practice && (
        <button className="cta" onClick={props.onPracticeAgain}>
          Play another practice round
        </button>
      )}
      <button className="cta ghost" onClick={props.onHome}>
        Back to the Teebox
      </button>
    </div>
  )
}
