import { useEffect, useState } from 'react'
import { CHARACTERS, characterById } from '../engine/characters'
import { courseBySlug, COURSES } from '../engine/courses'
import { dailySetup, forecastSetup, RESULT_LABEL, RESULT_SQUARE, shareText, SITE_URL, toParLabel, type DailySetup } from '../engine/daily'
import { gradeCopy, type RoundGrade } from '../engine/grade'
import { decisionsFromScores, encodeReplay } from '../engine/replay'
import type { CharacterId, HoleResult } from '../engine/types'
import { track } from '../lib/analytics'
import { backendEnabled } from '../lib/backend'
import { fetchCourseRecords, loadPlayer, type CourseRecord } from '../lib/leaderboard'
import { dismissSteals, pendingSteals, syncLedger, type StolenRecord } from '../lib/records'
import { currentHandicap, formatHandicap } from '../state/stats'
import { characterRecords, computeStreaks, loadArchive, type HistoryEntry, type RoundRecap, type RoundState } from '../state/store'
import { AccountPanel } from './AccountPanel'
import { CharacterAvatar } from './Avatars'
import { ScoreBoard } from './Leaderboard'

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
  const [courseRecs, setCourseRecs] = useState<Map<string, CourseRecord> | null>(null)
  const [steals, setSteals] = useState(() => pendingSteals())

  // course records load once when the browser opens — free-play bragging rights
  useEffect(() => {
    if (showCourses && backendEnabled && courseRecs === null) {
      void fetchCourseRecords().then((r) => setCourseRecs(r ?? new Map()))
    }
  }, [showCourses, courseRecs])

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

      {steals.length > 0 && (
        <StealCard
          steals={steals}
          onDismiss={() => {
            dismissSteals()
            setSteals([])
          }}
          onWinItBack={props.onPractice}
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

      <button className="cta ghost" onClick={() => setShowCourses((v) => !v)}>
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
              {courseRecs?.get(c.slug) && (
                <em className="course-cr">
                  CR {toParLabel(courseRecs.get(c.slug)!.to_par)} ·{' '}
                  {characterById(courseRecs.get(c.slug)!.character ?? undefined)?.emoji ?? ''}{' '}
                  {courseRecs.get(c.slug)!.player_name}
                </em>
              )}
            </button>
          ))}
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
        <p className="tagline">One edge, all 18 holes. Choose for the course in front of you:</p>
      </header>
      <div className="chips center">
        <span className="chip">{course.holes.reduce((s, h) => s + h.yards, 0).toLocaleString()} yards</span>
        <span className="chip">Wind {cond.wind} mph</span>
        <span className="chip">{cond.greens} greens</span>
        <span className="chip">Difficulty {cond.difficulty}/10</span>
      </div>
      <div className="char-cards">
        {CHARACTERS.map((c) => (
          <button key={c.id} className={`char-card ${c.id}`} onClick={() => props.onPick(c.id)}>
            <CharacterAvatar id={c.id} size={84} />
            <b>{c.name}</b>
            <span className="char-tagline">{c.tagline}</span>
            <span className="char-edge">{c.edge}</span>
          </button>
        ))}
      </div>
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
  /** the caddie's report — decision quality vs. luck, null when ungradeable */
  grade: RoundGrade | null
  /** the finished round, when it's still in storage — enables board submission */
  boardRound: RoundState | null
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
  // tomorrow's daily, teased in golf-forecast tone — course + conditions only,
  // never the seed/dateKey/puzzle number or anything outcome-derived
  const forecast = forecastSetup()
  const windTone =
    forecast.cond.wind >= 18
      ? `${forecast.cond.wind} mph gusts`
      : forecast.cond.wind >= 12
        ? `${forecast.cond.wind} mph breeze`
        : `${forecast.cond.wind} mph wind`
  const windMood = forecast.cond.wind >= 18 ? '💨' : forecast.cond.wind >= 12 ? '🍃' : '☀️'
  const greensHot = forecast.cond.greens === 'Fast'
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
        <div className="caddie-panel">
          <div className="kicker">The caddie's report</div>
          <p className="verdict">{gradeCopy(props.grade).headline}</p>
          <div className="recap-tiles caddie-tiles">
            <div className="stat">
              <b>{toParLabel(props.grade.decidedLike)}</b>
              <span>Decided like</span>
            </div>
            <div className="stat">
              <b>{props.grade.luck < 0 ? '−' : '+'}{Math.abs(props.grade.luck).toFixed(1)}</b>
              <span>Rub of the green</span>
            </div>
          </div>
          <p className="fine caddie-line">{gradeCopy(props.grade).decisionLine}</p>
          <p className="fine caddie-line">{gradeCopy(props.grade).luckLine}</p>
        </div>
      )}
      {props.boardRound && <ScoreBoard round={props.boardRound} />}
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
      <div className="forecast">
        <div className="kicker">Tomorrow's forecast</div>
        <p className="forecast-line">
          <b>{forecast.course.name}</b>
          <span className="chips slim">
            <span className="chip forecast-chip">
              {windMood} {windTone}
            </span>
            <span className="chip forecast-chip">
              {greensHot ? '⚡ ' : ''}
              {forecast.cond.greens.toLowerCase()} greens
            </span>
          </span>
        </p>
      </div>
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
