import { useEffect, useState } from 'react'
import { characterById, playableCharacters } from '../engine/characters'
import { courseBySlug, COURSES, GUEST_COURSES, PAR3_COURSES, playRatingFor } from '../engine/courses'
import { dailySetup, forecastSetup, RESULT_LABEL, RESULT_SQUARE, shareText, SITE_URL, toParLabel, type DailySetup } from '../engine/daily'
import { gradeCopy, type RoundGrade } from '../engine/grade'
import { decisionsFromScores, encodeReplay } from '../engine/replay'
import type { CharacterId, HoleResult } from '../engine/types'
import { track } from '../lib/analytics'
import { backendEnabled } from '../lib/backend'
import { challengeShareText, challengeUrl, type Challenge, type ChallengeAttempt } from '../lib/challenge'
import { ChallengeFaceoff, useShareActions } from './ChallengeScreen'
import { bundleIsStale, FRESH_TTL_MS } from '../lib/freshness'
import { fetchCourseRecords, fetchSeasonRecords, loadPlayer, type CourseRecord } from '../lib/leaderboard'
import { seasonCountdown, seasonForDate } from '../engine/season'
import { FortuneInfo } from './Tutorial'
import { ChangeLog } from './ChangeLog'
import { hasEarnedAwards, reconcileAchievements, type Unlock } from '../state/achievements'
import { Wordmark } from './Wordmark'
import { dismissSteals, pendingSteals, syncLedger, syncSeasonLedger, type PendingSteal } from '../lib/records'
import { loadBrowsePrefs, saveBrowsePrefs } from '../lib/browsePrefs'
import { loadFavorites, toggleFavorite } from '../lib/favorites'
import { loadGhost, loadGhostChoices, type Ghost, type GhostBoard } from '../state/ghost'
import { currentHandicap, formatHandicap } from '../state/stats'
import { characterRecords, computeStreaks, loadArchive, type HistoryEntry, type RoundRecap, type RoundState } from '../state/store'
import { AccountPanel } from './AccountPanel'
import { CharacterAvatar } from './Avatars'
import { TAGLINE_PARTS } from './brand'
import { DailyBoardView, RecordCrown, ScoreBoard } from './Leaderboard'
import { PlayRatingChip } from './PlayRating'

/** "Attainable record" = active-type record at this to-par OR WORSE (closer
 * to par reads as beatable). Tunable — what counts as attainable is a design
 * dial, not a law. */
export const ATTAINABLE_RECORD_TO_PAR = -4

export function HomeScreen(props: {
  history: HistoryEntry[]
  activeRound: { mode: 'daily' | 'practice'; courseName: string; challenge?: boolean } | null
  playedToday: HistoryEntry | null
  onTeeOff: () => void
  onResume: () => void
  onPractice: (slug: string) => void
  onShowResult: () => void
  onHowToPlay: () => void
  onMyRounds: () => void
  /** deep-link into the locker's lifetime stats view */
  onStats: () => void
  /** the Clubhouse holds earned awards — opens its door even with no rounds
   * on this device. Owned by App because the app-start backfill that grants
   * them lands after this screen's first render (see App.tsx). */
  awardsEarned?: boolean
  /** this screen's own record sync just reconciled — re-check the above */
  onAwardsChanged?: () => void
  onHistorySynced?: (h: HistoryEntry[]) => void
}) {
  const setup = dailySetup()
  const streaks = computeStreaks(props.history)
  const records = characterRecords(props.history)
  const [showCourses, setShowCourses] = useState(false)
  const [courseTab, setCourseTab] = useState<'courses' | 'par3'>('courses')
  /** the last-applied browse configuration, restored on every open — set a
   * view once, come back to it (persists across full reloads; see
   * lib/browsePrefs.ts for the local-now-portable-later contract) */
  const savedPrefs = loadBrowsePrefs()
  /** unlimited-list filters — combinable, all reading existing data: the
   * archive for played/recent, Play Ratings for difficulty, the two record
   * maps for the hunt. Record filters obey the season/all-time toggle. */
  const [recType, setRecType] = useState<'season' | 'alltime'>(savedPrefs.recType)
  const [playedFilter, setPlayedFilter] = useState<'all' | 'unplayed' | 'played'>(savedPrefs.played)
  const [ratingFilter, setRatingFilter] = useState<'any' | 'easy' | 'mid' | 'hard'>(savedPrefs.rating)
  const [recordFilter, setRecordFilter] = useState<'any' | 'open' | 'attainable' | 'mine' | 'notmine'>(savedPrefs.record)
  const [favsOnly, setFavsOnly] = useState(savedPrefs.favsOnly)
  const [courseSort, setCourseSort] = useState<'tour' | 'easiest' | 'hardest' | 'beatable' | 'recent' | 'favorites'>(
    savedPrefs.sort,
  )
  const [favs, setFavs] = useState<Set<string>>(() => loadFavorites())
  const [filterSheet, setFilterSheet] = useState(false)
  const [courseRecs, setCourseRecs] = useState<Map<string, CourseRecord> | null>(null)
  const [seasonRecs, setSeasonRecs] = useState<Map<string, CourseRecord> | null>(null)
  /** which season the loaded seasonRecs belong to — a rollover while the
   * panel sits open must refetch for the new key, not show last season's
   * holders under the new season's name */
  const [seasonRecsKey, setSeasonRecsKey] = useState<string | null>(null)
  const [steals, setSteals] = useState(() => pendingSteals())
  /** the Fortune callout's ⓘ opens How to Play's Fortunes page on its own */
  const [fortuneInfo, setFortuneInfo] = useState(false)
  const [changeLog, setChangeLog] = useState(false)
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
      // a FAILED fetch stays null, same rule the season board follows: an
      // empty map reads as "every record open — be the first", and 49 rows of
      // that lie is exactly what a flaky connection must not produce. While
      // null the rows say the records are still loading and the record
      // filters stay disabled. Flipping the toggle retries (recType dep).
      void fetchCourseRecords().then((r) => setCourseRecs(r))
    }
  }, [showCourses, courseRecs, recType])

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
  // the server's holders, on BOTH boards. Purely reads — the "notification"
  // is derived. Each fetch reconciles its own shelf independently, so one
  // board being unreachable never silences (or fakes) the other; a failed
  // fetch stays null and that shelf simply isn't reconciled this visit.
  useEffect(() => {
    if (!backendEnabled) return
    const myName = loadPlayer()?.name ?? null
    if (!myName) return
    void fetchCourseRecords().then((recs) => {
      if (!recs) return
      syncLedger(recs, myName)
      // the sync can adopt records set on another device, or learn that one was
      // taken back there — both move achievements (Name on the Wall, the record
      // ladders, Repo Man), and this fetch lands long after the app-start
      // reconcile. Quiet: nobody earned anything just now, we only found out.
      reconcileAchievements('quiet')
      props.onAwardsChanged?.()
      setSteals(pendingSteals())
    })
    void fetchSeasonRecords(season.key).then((recs) => {
      if (!recs) return
      syncSeasonLedger(recs, season.key, myName)
      setSteals(pendingSteals())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // remember the browse view as it changes, not on leave — a mid-session
  // reload (or the tab dying) must not lose the configuration either
  useEffect(() => {
    saveBrowsePrefs({
      recType,
      played: playedFilter,
      rating: ratingFilter,
      record: recordFilter,
      favsOnly,
      sort: courseSort,
    })
  }, [recType, playedFilter, ratingFilter, recordFilter, favsOnly, courseSort])

  const avgLabel = (avg: number) => (avg > 0 ? `+${avg.toFixed(1)}` : avg.toFixed(1))
  // a stale bundle must not START any round — the referee refuses its score,
  // daily or practice alike. Every start path funnels into the remedy: the
  // page reloads onto the current bundle and the player tees off from there.
  const startPractice = stale ? () => window.location.reload() : props.onPractice
  // courses you've completed get their scorecard corner punched (the notch)
  const playedSlugs = new Set(loadArchive().map((r) => r.courseSlug))
  // Jackson's bands: Easy 1-3 / Medium 4-7 / Hard 8-10
  const RATING_BAND = { easy: [1, 3], mid: [4, 7], hard: [8, 10] } as const
  const activeRecs = recType === 'season' ? seasonRecs : courseRecs
  const recsReady = activeRecs !== null
  const myName = loadPlayer()?.name ?? null
  // recent sort reads the archive once per open, not per row: last playedAt
  // per slug. The archive prunes, so "recent" means what it remembers — the
  // same source and the same honesty as the played notch itself.
  const lastPlayed = new Map<string, number>()
  for (const r of loadArchive()) lastPlayed.set(r.courseSlug, Math.max(lastPlayed.get(r.courseSlug) ?? 0, r.playedAt))
  const activeFilterCount =
    (playedFilter !== 'all' ? 1 : 0) + (ratingFilter !== 'any' ? 1 : 0) + (recordFilter !== 'any' ? 1 : 0) + (favsOnly ? 1 : 0)
  const filtersActive = activeFilterCount > 0 || courseSort !== 'tour'
  // guest courses browse (and filter, and sort) like everything else — one pool
  const browsable = [...COURSES, ...GUEST_COURSES]
  const visibleCourses = browsable.filter((c) => {
    if (favsOnly && !favs.has(c.slug)) return false
    if (playedFilter === 'unplayed' && playedSlugs.has(c.slug)) return false
    if (playedFilter === 'played' && !playedSlugs.has(c.slug)) return false
    if (ratingFilter !== 'any') {
      const [lo, hi] = RATING_BAND[ratingFilter]
      const r = playRatingFor(c.slug)
      if (r < lo || r > hi) return false
    }
    if (recordFilter !== 'any' && recsReady) {
      const rec = activeRecs.get(c.slug)
      if (recordFilter === 'open' && rec) return false
      if (recordFilter === 'attainable' && (!rec || rec.to_par < ATTAINABLE_RECORD_TO_PAR)) return false
      if (recordFilter === 'mine' && !(rec && myName && rec.player_name === myName)) return false
      if (recordFilter === 'notmine' && rec && myName && rec.player_name === myName) return false
    }
    return true
  }).sort((a, b) => {
    if (courseSort === 'easiest') return playRatingFor(a.slug) - playRatingFor(b.slug)
    if (courseSort === 'hardest') return playRatingFor(b.slug) - playRatingFor(a.slug)
    if (courseSort === 'recent') return (lastPlayed.get(b.slug) ?? 0) - (lastPlayed.get(a.slug) ?? 0)
    // starred courses first, tour order within each group — the shortlist
    // floats to the top without needing the filter sheet at all
    if (courseSort === 'favorites') return Number(favs.has(b.slug)) - Number(favs.has(a.slug))
    if (courseSort === 'beatable') {
      // weakest active record first — open records are the weakest of all
      const va = activeRecs?.get(a.slug)?.to_par ?? 99
      const vb = activeRecs?.get(b.slug)?.to_par ?? 99
      return vb - va
    }
    return 0
  })
  const resetFilters = () => {
    setPlayedFilter('all')
    setRatingFilter('any')
    setRecordFilter('any')
    setFavsOnly(false)
    setCourseSort('tour')
  }
  return (
    <div className="screen home">
      {/* The masthead is one lockup: the kicker and the tagline sit IN the
          wordmark's negative space — either side of the pennant up top, either
          side of the cup below — rather than taking rows of their own. Their
          positions derive from the mark's own geometry (see .lockup in
          broadcast.css), so they track it if it resizes. */}
      <header className="masthead">
        <div className="lockup">
          <h1 className="wordmark">
            <Wordmark />
          </h1>
          <span className="lockup-kicker">Daily Golf Challenge · No. {setup.puzzleNumber}</span>
          {/* the tagline is a brand element with one home (ui/brand.tsx) —
              the lockup renders its parts, never retypes them */}
          <p className="lockup-tag">{`${TAGLINE_PARTS[0]} ${TAGLINE_PARTS[1]}`}</p>
          <p className="lockup-tag-end">{TAGLINE_PARTS[2]}</p>
        </div>
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

      {/* the corner notch is earned: it punches through once today's card is
          in the books, like a marked-off paper scorecard */}
      <div className={`today-card${props.playedToday ? ' notched' : ''}`}>
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
      <StreakNote onInfo={() => setFortuneInfo(true)} />
      {fortuneInfo && <FortuneInfo onClose={() => setFortuneInfo(false)} />}
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

      <p className="cta-tease">Can you beat the odds today?</p>

      {props.playedToday ? (
        // today's round is in the books — this CTA wears the earned notch too
        <button className="cta notched" onClick={props.onShowResult}>
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
          {props.activeRound.challenge ? '⚔️ Resume challenge attempt' : 'Resume practice round'} ·{' '}
          {props.activeRound.courseName}
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
        Play unlimited
        <span className="cta-sub">Browse courses</span>
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
          {courseTab === 'courses' && (
            <div className="course-filters">
              {/* one slim row; the full controls live in the sheet below */}
              <div className="filter-bar">
                <div className="rec-toggle" role="group" aria-label="Record type">
                  <button className={`rec-toggle-btn${recType === 'season' ? ' on' : ''}`} onClick={() => setRecType('season')}>
                    View Season Records
                  </button>
                  <button className={`rec-toggle-btn${recType === 'alltime' ? ' on' : ''}`} onClick={() => setRecType('alltime')}>
                    View All-Time Records
                  </button>
                </div>
                <div className="filter-bar-actions">
                  <button className={`filter-chip${activeFilterCount > 0 ? ' on' : ''}`} onClick={() => setFilterSheet(true)}>
                    ☰ Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
                  </button>
                  <button
                    className={`filter-chip sort${courseSort !== 'tour' ? ' on' : ''}`}
                    onClick={() =>
                      setCourseSort(
                        courseSort === 'tour'
                          ? 'easiest'
                          : courseSort === 'easiest'
                            ? 'hardest'
                            : courseSort === 'hardest'
                              ? 'beatable'
                              : courseSort === 'beatable'
                                ? 'recent'
                                : courseSort === 'recent'
                                  ? 'favorites'
                                  : 'tour',
                      )
                    }
                    aria-label="Change sort order"
                  >
                    ⇅ Sort:{' '}
                    {courseSort === 'tour'
                      ? 'Tour'
                      : courseSort === 'easiest'
                        ? 'Easiest'
                        : courseSort === 'hardest'
                          ? 'Hardest'
                          : courseSort === 'beatable'
                            ? 'Beatable'
                            : courseSort === 'recent'
                              ? 'Recent'
                              : '★ Favorites'}
                  </button>
                </div>
              </div>
              {visibleCourses.length !== browsable.length && (
                <p className="fine filter-count">
                  {visibleCourses.length} of {browsable.length} courses
                </p>
              )}
            </div>
          )}
          {filterSheet && (
            <div className="tut-backdrop filter-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Course filters" onClick={() => setFilterSheet(false)}>
              <div className="tut-card filter-sheet" onClick={(e) => e.stopPropagation()}>
                <button className="tut-skip" onClick={() => setFilterSheet(false)} aria-label="Close">
                  Done
                </button>
                <div className="kicker">Filter courses</div>
                <div className="filter-group">
                  <span className="filter-label">Played</span>
                  <div className="filter-row" role="group" aria-label="Filter by played">
                    {(['all', 'unplayed', 'played'] as const).map((f) => (
                      <button key={f} className={`filter-chip${playedFilter === f ? ' on' : ''}`} onClick={() => setPlayedFilter(f)}>
                        {f === 'all' ? 'All' : f === 'unplayed' ? 'Never played' : 'Played ▸'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <span className="filter-label">Difficulty</span>
                  <div className="filter-row" role="group" aria-label="Filter by difficulty">
                    {(['any', 'easy', 'mid', 'hard'] as const).map((f) => (
                      <button key={f} className={`filter-chip${ratingFilter === f ? ' on' : ''}`} onClick={() => setRatingFilter(f)}>
                        {f === 'any' ? 'Any' : f === 'easy' ? 'Easy 1–3' : f === 'mid' ? 'Medium 4–7' : 'Hard 8–10'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <span className="filter-label">{recType === 'season' ? 'Season record' : 'All-time record'}</span>
                  <div className="filter-row" role="group" aria-label="Filter by record">
                    {(['any', 'open', 'attainable', 'mine', 'notmine'] as const).map((f) => (
                      <button
                        key={f}
                        className={`filter-chip${recordFilter === f ? ' on' : ''}`}
                        disabled={f !== 'any' && !recsReady}
                        title={f !== 'any' && !recsReady ? 'Records still loading' : undefined}
                        onClick={() => setRecordFilter(f)}
                      >
                        {f === 'any'
                          ? 'Any'
                          : f === 'open'
                            ? 'Open'
                            : f === 'attainable'
                              ? `Attainable (${ATTAINABLE_RECORD_TO_PAR} or worse)`
                              : f === 'mine'
                                ? 'I hold it'
                                : "I don't hold it"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <span className="filter-label">Favorites</span>
                  <div className="filter-row">
                    <button className={`filter-chip fav${favsOnly ? ' on' : ''}`} onClick={() => setFavsOnly(!favsOnly)}>
                      ★ Favorites only{favs.size > 0 ? ` · ${favs.size}` : ''}
                    </button>
                  </div>
                </div>
                <div className="filter-foot">
                  {filtersActive && (
                    <button className="filter-reset" onClick={resetFilters}>
                      Reset filters
                    </button>
                  )}
                  <button className="cta filter-apply" onClick={() => setFilterSheet(false)}>
                    Show {visibleCourses.length} course{visibleCourses.length === 1 ? '' : 's'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {courseTab === 'courses' && visibleCourses.length === 0 && (
            <div className="filter-empty">
              {/* the filters are the cause, and the copy says so — a saved
                  view can go stale (a rollover reopens every record, so an
                  "open" filter that matched yesterday matches nothing today)
                  and a bare "no courses" would read as missing data */}
              <p className="fine">No courses match your saved filters — every course is still here.</p>
              <button className="filter-reset" onClick={resetFilters}>
                Reset filters
              </button>
            </div>
          )}
          {courseTab === 'courses' &&
            visibleCourses.map((c) => {
              // the row shows the ACTIVE record type only, labeled, so nobody
              // misreads which record they're hunting — the toggle above flips it
              const rec = activeRecs?.get(c.slug)
              const mine = Boolean(rec && myName && rec.player_name === myName)
              const recLabel = recType === 'season' ? 'Season' : 'All-time'
              return (
                <div key={c.slug} className="course-row-wrap">
                  <button
                    className={`course-row${playedSlugs.has(c.slug) ? ' notched' : ''}`}
                    onClick={() => startPractice(c.slug)}
                  >
                    <b>{c.name}</b>
                    <span>
                      {c.location} · Play Rating {playRatingFor(c.slug)}/10
                    </span>
                    {!recsReady && <em className="course-cr loading">{recLabel} records loading…</em>}
                    {recsReady &&
                      (rec ? (
                        <em className={`course-cr${recType === 'alltime' ? ' alltime' : ''}`}>
                          {recLabel} {toParLabel(rec.to_par)}
                          <RecordCrown rec={rec} /> · {characterById(rec.character ?? undefined)?.emoji ?? ''}{' '}
                          {rec.player_name}
                          {mine && <i className="course-cr-you">YOU</i>}
                        </em>
                      ) : (
                        <em className="course-cr open">{recLabel} record open — be the first</em>
                      ))}
                  </button>
                  <button
                    className={`course-fav${favs.has(c.slug) ? ' on' : ''}`}
                    aria-label={favs.has(c.slug) ? `Unfavorite ${c.name}` : `Favorite ${c.name}`}
                    aria-pressed={favs.has(c.slug)}
                    onClick={() => setFavs(new Set(toggleFavorite(c.slug)))}
                  >
                    {favs.has(c.slug) ? '★' : '☆'}
                  </button>
                </div>
              )
            })}
          {/* tooltips need a hover no phone has — the crown explains itself
              here, but only once a crowned record is actually on the list */}
          {courseTab === 'courses' &&
            [...(courseRecs?.values() ?? []), ...(seasonRecs?.values() ?? [])].some((r) => r.mode === 'daily') && (
              <p className="fine crown-legend">
                <RecordCrown rec={{ mode: 'daily' }} /> Set in daily play – one attempt, one record-setting round.
              </p>
            )}
          {courseTab === 'par3' &&
            PAR3_COURSES.map((c) => {
              const sr = seasonRecs?.get(c.slug)
              const at = courseRecs?.get(c.slug)
              return (
                <button
                  key={c.slug}
                  className={`course-row${playedSlugs.has(c.slug) ? ' notched' : ''}`}
                  onClick={() => startPractice(c.slug)}
                >
                  <b>{c.name}</b>
                  <span>
                    {c.location} · {c.holes.length} holes · Play Rating {playRatingFor(c.slug)}/10
                  </span>
                  {seasonRecs &&
                    (sr ? (
                      <em className="course-cr">
                        Season {toParLabel(sr.to_par)}
                        <RecordCrown rec={sr} /> · {characterById(sr.character ?? undefined)?.emoji ?? ''}{' '}
                        {sr.player_name}
                      </em>
                    ) : (
                      <em className="course-cr open">Season record open — be the first</em>
                    ))}
                  {at && (
                    <em className="course-cr alltime">
                      All-time {toParLabel(at.to_par)}
                      <RecordCrown rec={at} /> · {characterById(at.character ?? undefined)?.emoji ?? ''}{' '}
                      {at.player_name}
                    </em>
                  )}
                </button>
              )
            })}
          <p className="fine">Practice rounds don't touch your streak.</p>
        </div>
      )}
      {/* The door opens on anything the clubhouse can show, not just replayable
          rounds. The archive holds rounds THIS device played; a device whose
          history arrived by account sync has a full round log, stats and awards
          behind an empty archive, and gating on the archive alone locked it out
          of its own clubhouse. `history` is the synced half and is already in
          hand — but it only ever carries DAILIES, so a player whose records
          were all set in practice play elsewhere syncs in with earned awards
          and no rounds at all. Earned awards open the door too. (A genuinely
          fresh device earns nothing: every tier and badge needs at least one
          round, record or established handicap behind it.) */}
      {(loadArchive().length > 0 || props.history.length > 0 || (props.awardsEarned ?? hasEarnedAwards())) && (
        <button className="cta ghost" onClick={props.onMyRounds}>
          🏆 Clubhouse
          <span className="cta-sub">My rounds</span>
        </button>
      )}
      <HandicapChip onTap={props.onStats} />
      <AccountPanel onHistorySynced={props.onHistorySynced} />
      {/* the quiet stuff lives at the foot of the screen: the rules, and the
          receipt showing what has changed since launch */}
      <div className="teebox-footer">
        <button className="footer-link" onClick={props.onHowToPlay}>
          How to play
        </button>
        <span aria-hidden>·</span>
        <button className="footer-link" onClick={() => setChangeLog(true)}>
          Change log
        </button>
      </div>
      {changeLog && <ChangeLog onClose={() => setChangeLog(false)} />}
      {/* The OpenStreetMap credit is not decoration: the course geography is
          imported from OSM (scripts/import-osm.ts), whose ODbL licence requires
          attribution wherever the data ships — which it does, on every
          real-geometry course. The trademark line disclaims affiliation in the
          three ways that matter (affiliated / endorsed / sponsored). */}
      <p className="fine-print">
        New course every day at midnight Eastern (ET). Course names and trademarks are the property
        of their respective owners — DogLeg is not affiliated with, endorsed by, or sponsored by any
        course, club or tournament. Layouts and yardages are stylized for play, built in part from
        map data ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">
          OpenStreetMap contributors
        </a>{' '}
        (ODbL). © 2026 DogLeg. All rights reserved.
      </p>
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
/** which wall the name came off — worn by every steal surface so an all-time
 * fall and a season fall can never be mistaken for each other. Solid gold is
 * the all-time record, the gold keyline is the season board — the same
 * convention as the Records tab's badges. */
function StealTag({ scope }: { scope: PendingSteal['scope'] }) {
  const label = scope === 'both' ? 'All-time + Season' : scope === 'alltime' ? 'All-time' : 'Season'
  return <span className={`steal-tag ${scope}`}>{label}</span>
}

function StealCard(props: {
  steals: PendingSteal[]
  onDismiss: () => void
  onWinItBack: (slug: string) => void
}) {
  const [expanded, setExpanded] = useState(props.steals.length === 1)
  const courseName = (slug: string) => courseBySlug(slug)?.name ?? slug
  const one = props.steals.length === 1 ? props.steals[0] : null
  // the kicker names the board outright when every fall is on the same one
  const kicker = props.steals.every((s) => s.scope === 'season')
    ? '🚨 Season record stolen'
    : props.steals.every((s) => s.scope === 'alltime')
      ? '🚨 Course record stolen'
      : '🚨 Records stolen'
  return (
    <div className="steal-card" role="status">
      <button className="steal-x" onClick={props.onDismiss} aria-label="Dismiss">
        ✕
      </button>
      <div className="kicker">{kicker}</div>
      {one ? (
        <>
          <p>
            <StealTag scope={one.scope} /> <b>{one.by}</b> shot <b>{toParLabel(one.theirToPar)}</b> at{' '}
            {courseName(one.courseSlug)}
            {one.scope === 'season'
              ? `, knocking your ${toParLabel(one.myToPar)} off the season board. The horn hasn't blown yet — plenty of time to answer.`
              : one.scope === 'both'
                ? ` — past your ${toParLabel(one.myToPar)}, taking the all-time record and the season board in one round. The nerve.`
                : `, sliding past your ${toParLabel(one.myToPar)} on the all-time board. Word travels fast around here.`}
          </p>
          <button className="cta steal-cta" onClick={() => props.onWinItBack(one.courseSlug)}>
            Win it back
          </button>
        </>
      ) : (
        <>
          <p>
            <b>{props.steals.length} of your records fell</b> while you were gone.
            {!expanded && ' The nerve.'}
          </p>
          {expanded ? (
            <div className="steal-list">
              {props.steals.map((s) => (
                <div key={`${s.scope}:${s.courseSlug}`} className="steal-row">
                  <span>
                    <StealTag scope={s.scope} /> <b>{courseName(s.courseSlug)}</b> — {s.by},{' '}
                    {toParLabel(s.theirToPar)} (yours: {toParLabel(s.myToPar)})
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
function ghostCloseNoun(close: { kind: 'record' | 'personal' | 'challenge'; board?: GhostBoard; holder: string | null }): string {
  // 'challenge' never reaches this line — the head-to-head card is that
  // round's close (see App's ghostClose) — but the type rides the Ghost union
  if (close.kind !== 'record') return 'your best'
  const noun = close.board === 'season' ? 'season record' : 'record'
  return close.holder ? `${close.holder}'s ${noun}` : `your own ${noun}`
}

/**
 * The pre-round tale of the tape: who holds the wall, their score, and their
 * actual card hole by hole — so the challenger knows exactly what they're
 * getting into. Self-loading (two fetches + engine replays) and quick; it
 * renders when ready and never delays the tee shot.
 *
 * When the all-time and season records are DIFFERENT rounds, a toggle picks
 * which one the ghost races — the stakes card previews whichever is chosen.
 * Same round on both boards (or only one board set): no toggle, no choice.
 */
function GhostStakes(props: { courseSlug: string; board: GhostBoard; onBoard: (b: GhostBoard) => void }) {
  const [choices, setChoices] = useState<{ alltime: Ghost | null; season: Ghost | null } | null>(null)
  const [fallback, setFallback] = useState<Ghost | null>(null)
  useEffect(() => {
    let live = true
    void loadGhostChoices(props.courseSlug).then((c) => {
      if (!live) return
      setChoices(c)
      // no record round on either board — show the own-best ghost instead
      if (!c.alltime && !c.season) {
        void loadGhost(props.courseSlug).then((g) => {
          if (live) setFallback(g)
        })
      }
    })
    return () => {
      live = false
    }
  }, [props.courseSlug])
  const canToggle = !!choices?.alltime && !!choices?.season && choices.alltime.seed !== choices.season.seed
  // a pick with nothing to race snaps to the board that HAS a record, so the
  // pick and the loaded ghost can't disagree at tee-off. Both directions
  // matter: an all-time row old enough to predate stored replays leaves the
  // season round as the only raceable record, and the default pick is
  // all-time — without the snap the one available ghost is unreachable.
  const wantSeason = props.board === 'season'
  useEffect(() => {
    if (!choices) return
    if (wantSeason && !choices.season) props.onBoard('alltime')
    else if (!wantSeason && !choices.alltime && choices.season) props.onBoard('season')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices, wantSeason])
  // the snap above converges the pick, but only on the NEXT render — so the
  // preview falls through to whichever board actually has a round rather than
  // blanking the card for a frame
  const ghost = (wantSeason ? choices?.season : choices?.alltime) ?? choices?.alltime ?? choices?.season ?? fallback
  if (!ghost) return null
  const char = characterById(ghost.character)
  const boardNoun = ghost.board === 'season' ? 'season record' : 'record'
  const headline =
    ghost.kind === 'record'
      ? ghost.holder
        ? `The ${boardNoun}: ${ghost.holder}`
        : `The ${boardNoun} is yours — defend it`
      : 'The ghost: your best round here'
  return (
    <div className={`ghost-stakes${ghost.kind === 'record' ? ' cr' : ''}`}>
      {canToggle && choices?.alltime && choices?.season && (
        <div className="ghost-board-toggle" role="radiogroup" aria-label="Which record to race">
          <button
            className={!wantSeason ? 'on' : ''}
            aria-pressed={!wantSeason}
            onClick={() => props.onBoard('alltime')}
          >
            All-time {toParLabel(choices.alltime.toPar)}
          </button>
          <button
            className={wantSeason ? 'on' : ''}
            aria-pressed={wantSeason}
            onClick={() => props.onBoard('season')}
          >
            Season {toParLabel(choices.season.toPar)}
          </button>
        </div>
      )}
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
      <span className="fine">Their card, their conditions — you&rsquo;ll play your own.</span>
    </div>
  )
}

/** The fortune disclosure, wherever the current streak is shown. Flavor
 * only, by design: the mechanic is disclosed, the math stays under the
 * hood — never print the multiplier or the ramp. */
/**
 * The Fortune callout. Honest by design: the boost only applies to streaks the
 * referee can verify — dailies posted under a clubhouse name. Anonymous local
 * streaks don't move the odds (anti-cheat), so the copy says so.
 *
 * With `onInfo` it becomes tappable and wears an ⓘ, opening the full Fortunes
 * page; without it (the result screen) it stays a plain note.
 */
function StreakNote(props: { onInfo?: () => void }) {
  const copy = (
    <>
      <em className="streak-note-head">Golf rewards the consistent</em>
      Dailies under a clubhouse name boost Fortune odds.
    </>
  )
  if (!props.onInfo) return <p className="fine streak-note">{copy}</p>
  return (
    <button className="fine streak-note" onClick={props.onInfo} aria-label="How Fortunes work">
      {copy}
      <span className="streak-note-info" aria-hidden>
        ⓘ
      </span>
    </button>
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
  /** a challenge attempt's stakes: whose card, what score */
  challenge?: { from: string | null; toPar: number }
  /** which record the ghost will race (practice only) — owned by the app so
   * the choice survives into the round that starts here */
  ghostBoard: GhostBoard
  onGhostBoard: (b: GhostBoard) => void
  onPick: (c: CharacterId) => void
  onBack: () => void
}) {
  const { course, cond } = props.setup
  return (
    <div className="screen pick">
      <button className="home-link" onClick={props.onBack}>
        ‹ {props.challenge ? 'The challenge' : 'Teebox'}
      </button>
      <header>
        <div className="kicker">
          {props.challenge ? 'Challenge' : props.practice ? 'Practice round' : "Today's round"} · {course.name}
        </div>
        <h2 className="pick-title">Pick your player</h2>
        <p className="tagline">One edge, all {course.holes.length} holes. Choose for the course in front of you:</p>
      </header>
      {props.challenge ? (
        <div className="ghost-stakes cr">
          <div className="ghost-stakes-head">
            <b>⚔️ Beat {props.challenge.from ?? 'your rival'}</b>
            <span className="ghost-stakes-score">{toParLabel(props.challenge.toPar)}</span>
          </div>
          <span className="fine">One attempt. Their card, their luck — you get your own.</span>
        </div>
      ) : (
        // a challenge races one card, so the board picker only belongs to a
        // plain practice round
        props.practice && <GhostStakes courseSlug={course.slug} board={props.ghostBoard} onBoard={props.onGhostBoard} />
      )}
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
  ghostClose?: { margin: number; kind: 'record' | 'personal' | 'challenge'; board?: GhostBoard; holder: string | null } | null
  /** the round that just wrapped was a challenge attempt — the head-to-head
   * card renders with the signed result from the ledger */
  challenge?: { challenge: Challenge; mine: NonNullable<ChallengeAttempt['done']> }
  history: HistoryEntry[]
  /** achievements this round earned — the wrap card renders only when some did */
  unlocks?: Unlock[]
  /** deep-link into the Clubhouse Awards tab */
  onAwards?: () => void
  /** the board confirmed a course record — record-derived achievements only
   * become earnable at this point, well after the round's own reconcile */
  onRecordsChanged?: () => void
  onHome: () => void
  onPracticeAgain: () => void
}) {
  const { toPar, results } = props
  const [copied, setCopied] = useState(false)
  const [copiedReplay, setCopiedReplay] = useState(false)
  const streaks = computeStreaks(props.history)
  const broke = toPar < 0
  const char = characterById(props.character)
  // the round as pure data: seed + decisions, re-run by the receiver's engine.
  // One payload, two doors — #watch replays it, #challenge dares them to beat it.
  const roundPayload = (() => {
    if (!props.boardRound) return null
    const decisions = decisionsFromScores(props.boardRound.scores)
    if (!decisions) return null
    return {
      seed: props.boardRound.seed,
      character: props.boardRound.character,
      decisions,
      // loadPlayer is the NAMED identity — an anonymous player's replay is
      // simply unattributed, it never leaks their minted id as a name
      name: loadPlayer()?.name ?? undefined,
    }
  })()
  const replayUrl = roundPayload ? `https://${SITE_URL}/#watch=${encodeReplay(roundPayload)}` : null
  // challenges are creatable from PRACTICE rounds only (they're unlimited
  // play's game — the daily's share card stays the classic squares), and a
  // finished attempt doesn't re-arm as a fresh gauntlet from the wrap — its
  // head-to-head card carries the rally's next throw instead
  const myChallengeUrl = roundPayload && props.practice && !props.challenge ? challengeUrl(roundPayload) : null
  const text = shareText(props.setup, results, toPar, props.character, streaks.dayStreak)
  // practice wrap: the challenge share stands alone (the daily's rides its share card)
  const practiceChallenge = useShareActions(
    myChallengeUrl
      ? challengeShareText({ courseName: props.setup.course.name, toPar, url: myChallengeUrl, rally: 0 })
      : '',
    (method) => track('challenge_sent', { method, kind: 'fresh', rally: 0, to_par: toPar }),
  )
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
    // `daily` gates the earned notch: a signed daily is locked until tomorrow,
    // a practice round can always be replayed — no notch for the replayable
    <div className={`screen result${props.practice ? '' : ' daily'}`}>
      {/* small mark up top: the hero score + board is the screenshot people
          take, and the screenshot should carry the brand */}
      <Wordmark className="result-wordmark" />
      <div className="kicker">
        {props.challenge ? '⚔️ Challenge' : props.practice ? 'Practice round' : `Daily No. ${props.setup.puzzleNumber}`} ·{' '}
        {props.setup.course.name}
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
      {/* the challenge's close: their signed card against yours, and the
          rally's next throw. Renders INSTEAD of the practice square rows —
          the faceoff already shows this round's squares. */}
      {props.challenge && <ChallengeFaceoff challenge={props.challenge.challenge} mine={props.challenge.mine} />}
      {/* practice only: the square rows ARE the recap there. On the daily the
          share card carries the same squares right above the board — showing
          the block twice was one scorecard too many. */}
      {props.practice && !props.challenge && (
        <div className="emoji-grid">
          <div>{results.slice(0, 9).map((r, i) => (
            <span key={i}>{RESULT_SQUARE[r]}</span>
          ))}</div>
          <div>{results.slice(9).map((r, i) => (
            <span key={i}>{RESULT_SQUARE[r]}</span>
          ))}</div>
        </div>
      )}
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
      {/* throw the round down while it stings (or shines) — the challenge
          share sits above the coach's autopsy. One line, no sub-label: the
          one-attempt/own-luck contract is told on the receiving end. */}
      {props.practice && !props.challenge && myChallengeUrl && (
        <button
          className="cta"
          onClick={practiceChallenge.canNativeShare ? practiceChallenge.share : practiceChallenge.copy}
        >
          {practiceChallenge.copied ? 'Challenge link copied ✓' : '⚔️ Challenge a friend'}
        </button>
      )}
      {props.grade && (
        <div className="coach-panel">
          <div className="coach-head">
            <div className="kicker">The Swing Coach's Report</div>
            {/* the difficulty pill, again — primarily for readers who are mad
                about their score: tap it and see what the course does to a
                competent golfer */}
            <PlayRatingChip slug={props.setup.course.slug} />
          </div>
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
      {/* achievements this round earned — durable record of what the toasts
          announced, and the door to the full trophy room. Absent entirely on
          a round that earned nothing. */}
      {props.unlocks && props.unlocks.length > 0 && props.onAwards && (
        <button className="ach-earned" onClick={props.onAwards}>
          <span className="kicker">
            Achievement{props.unlocks.length === 1 ? '' : 's'} earned this round
          </span>
          {props.unlocks.map((u) => (
            <span key={u.id} className="ach-earned-row">
              <b>
                {u.name}
                {u.count ? <em className="ach-count"> ×{u.count}</em> : null}
              </b>
              <span className="ach-earned-detail">{u.detail}</span>
            </span>
          ))}
          <span className="ach-earned-link">See all awards ›</span>
        </button>
      )}
      {/* the share card sits ABOVE the board: brag first, standings second */}
      {!props.practice && (
        <div className="share-block">
          <div className="kicker">Your share card</div>
          <pre className="share-preview">{text}</pre>
          <div className="share-actions">
            <button className="cta ghost" onClick={copy}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            {canNativeShare && (
              <button className="cta" onClick={share}>
                Share
              </button>
            )}
          </div>
        </div>
      )}
      {props.boardRound ? (
        <ScoreBoard round={props.boardRound} onRecordsChanged={props.onRecordsChanged} />
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
