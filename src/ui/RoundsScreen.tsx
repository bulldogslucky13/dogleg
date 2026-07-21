import { useEffect, useState } from 'react'
import { characterById } from '../engine/characters'
import { courseBySlug } from '../engine/courses'
import { toParLabel } from '../engine/daily'
import type { ReplayPayload } from '../engine/replay'
import { currentEmail } from '../lib/auth'
import { loadPlayer } from '../lib/leaderboard'
import {
  currentHandicap,
  formatAverage,
  formatHandicap,
  fortuneRounds,
  lifetimeStats,
  loadRoundLog,
  type LoggedRound,
} from '../state/stats'
import { lifetimeRounds, loadArchive, type ArchivedRound, type HistoryEntry } from '../state/store'
import { AccountPanel } from './AccountPanel'
import { RoundScorecard } from './RoundScorecard'

/**
 * My rounds — the locker. Top to bottom: the trophy shelf (lifetime aces and
 * albatrosses, tappable into their round lists), the account-sync CTA for
 * anonymous players, the lifetime-rounds headline (tappable into the full
 * stats view with the handicap), then the Recent/Records tabs. Every round
 * named anywhere in here opens its scorecard; rounds still in the replay
 * archive offer Replay beside it.
 */

type LockerView = 'main' | 'stats' | 'ace' | 'albatross'

/** an archived round already carries everything the scorecard needs */
function toLogged(r: ArchivedRound): LoggedRound {
  return {
    seed: r.seed,
    mode: r.mode,
    courseSlug: r.courseSlug,
    character: r.character,
    dateKey: r.dateKey,
    playedAt: r.playedAt,
    toPar: r.toPar,
    strokes: r.strokes,
    results: r.results,
  }
}

export function RoundsScreen(props: {
  onWatch: (p: ReplayPayload) => void
  onBack: () => void
  /** fold synced dailies into the log so locker stats update on sign-in here */
  onHistorySynced?: (h: HistoryEntry[]) => void
  /** deep-link straight into the stats view (the home handicap chip) */
  initialView?: 'main' | 'stats'
  /** open with the account panel already expanded (How to Play's sync line) */
  initialAccount?: boolean
}) {
  const [view, setView] = useState<LockerView>(props.initialView ?? 'main')
  const [tab, setTab] = useState<'recent' | 'records'>('recent')
  const [card, setCard] = useState<LoggedRound | null>(null)
  const [showAccount, setShowAccount] = useState(props.initialAccount ?? false)
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    currentEmail()
      .then((e) => live && setEmail(e))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const log = loadRoundLog()
  const archive = loadArchive()
  const stats = lifetimeStats(log)
  const hcap = currentHandicap(log)

  const archived = (seed: string) => archive.find((r) => r.seed === seed)
  const watch = (seed: string) => {
    const a = archived(seed)
    if (!a) return
    // loadPlayer is the NAMED identity — an anonymous player's replay is
    // simply unattributed, it never leaks their minted id as a name
    props.onWatch({ seed: a.seed, character: a.character, decisions: a.decisions, name: loadPlayer()?.name ?? undefined })
  }

  /** the two per-round actions, everywhere: the scorecard always, the replay
   * when the archive still holds the decisions */
  const actions = (r: LoggedRound) => (
    <span className="round-actions">
      <button className="cta ghost slim" onClick={() => setCard(r)}>
        Scorecard
      </button>
      {archived(r.seed) && (
        <button className="cta ghost slim" onClick={() => watch(r.seed)}>
          ▶ Replay
        </button>
      )}
    </span>
  )

  const row = (r: LoggedRound, badge?: string, context?: string) => (
    <div key={`${r.seed}:${badge ?? ''}:${context ?? ''}`} className="round-row">
      <div className="round-row-text">
        <b>
          {courseBySlug(r.courseSlug)?.name ?? r.courseSlug}
          {r.character ? ` ${characterById(r.character)?.emoji ?? ''}` : ''}
        </b>
        <span>
          {context ? `${context} · ` : ''}
          {shortDate(r.dateKey)} · {r.mode === 'daily' ? 'Daily' : 'Practice'} · {r.strokes} strokes
        </span>
      </div>
      {badge && <em className={`round-badge ${badge === 'CR' ? 'cr' : 'pr'}`}>{badge}</em>}
      <b className={`round-score${r.toPar < 0 ? ' good' : ''}`}>{toParLabel(r.toPar)}</b>
      {actions(r)}
    </div>
  )

  const rounds = archive
  const records = rounds.filter((r) => r.courseRecord)
  const bestByCourse = new Map<string, ArchivedRound>()
  for (const r of rounds) {
    const best = bestByCourse.get(r.courseSlug)
    if (!best || r.toPar < best.toPar) bestByCourse.set(r.courseSlug, r)
  }
  const prs = [...bestByCourse.values()]
    .filter((r) => !r.courseRecord)
    .sort((a, b) => a.toPar - b.toPar)
  const recent = [...rounds].sort((a, b) => b.playedAt - a.playedAt).slice(0, 10)

  const scorecard = card && (
    <RoundScorecard
      round={card}
      onReplay={archived(card.seed) ? () => watch(card.seed) : undefined}
      onClose={() => setCard(null)}
    />
  )

  // ------------------------------------------------------------- fortune list
  if (view === 'ace' || view === 'albatross') {
    const kind = view
    const list = fortuneRounds(kind, log)
    const title = kind === 'ace' ? 'Hole in One' : 'Albatross'
    return (
      <div className="screen rounds">
        {scorecard}
        <button className="home-link" onClick={() => setView('main')}>
          ‹ Clubhouse
        </button>
        <header>
          <div className="kicker">
            {kind === 'ace' ? '⛳' : '🕊️'} Lifetime {title} · {list.reduce((s, f) => s + f.holes.length, 0)}
          </div>
          <h2 className="pick-title">Every {title.toLowerCase()}</h2>
        </header>
        {list.length === 0 ? (
          <p className="tagline center">
            None yet — the shelf is built and waiting.{' '}
            {kind === 'ace' ? 'The par 3s are listening.' : 'Go for a par 5 in two.'}
          </p>
        ) : (
          <section className="rounds-section">
            {list.map((f) => row(f.round, undefined, `Hole ${f.holes.join(' & ')}`))}
          </section>
        )}
      </div>
    )
  }

  // -------------------------------------------------------------- stats view
  if (view === 'stats') {
    const dist: Array<{ label: string; count: number; cls?: string }> = [
      { label: 'Triples', count: stats.distribution.triple, cls: 'cold' },
      { label: 'Doubles', count: stats.distribution.double, cls: 'cold' },
      { label: 'Bogeys', count: stats.distribution.bogey, cls: 'cold' },
      { label: 'Pars', count: stats.distribution.par },
      { label: 'Birdies', count: stats.distribution.birdie, cls: 'hot' },
      { label: 'Eagles', count: stats.distribution.eagle, cls: 'hot' },
    ]
    const max = Math.max(1, ...dist.map((d) => d.count))
    return (
      <div className="screen rounds">
        {scorecard}
        <button className="home-link" onClick={() => setView('main')}>
          ‹ Clubhouse
        </button>
        <header>
          <div className="kicker">
            Lifetime stats · {lifetimeRounds()} round{lifetimeRounds() === 1 ? '' : 's'}
          </div>
          <h2 className="pick-title">Your game</h2>
        </header>

        <div className="stats-headline">
          {hcap.established ? (
            <>
              <b>{formatHandicap(hcap.value)}</b>
              <span>Current handicap</span>
              <span className="fine">Best 10 of your last 30 rounds, vs par</span>
            </>
          ) : (
            <>
              <b>–</b>
              <span>Handicap: Not yet established</span>
              <span className="fine">
                Play {hcap.roundsToGo} more round{hcap.roundsToGo === 1 ? '' : 's'} to establish your handicap
              </span>
            </>
          )}
        </div>

        <section className="rounds-section">
          <div className="kicker">Every hole you've played</div>
          <div className="dist-list">
            {dist.map((d) => (
              <div key={d.label} className={`dist-row${d.cls ? ` ${d.cls}` : ''}`}>
                <span>{d.label}</span>
                <span className="dist-bar">
                  <i style={{ width: `${(d.count / max) * 100}%` }} />
                </span>
                <b>{d.count}</b>
              </div>
            ))}
          </div>
          <p className="dist-ref">Aces and albatrosses live on the trophy shelf in your clubhouse ↑</p>
        </section>

        <section className="rounds-section">
          <div className="kicker">Rounds</div>
          {stats.averageToPar !== null && (
            <div className="stats-row">
              <div className="stat">
                <b>{formatAverage(stats.averageToPar)}</b>
                <span>Average score</span>
              </div>
              <div className="stat">
                <b>{stats.rounds}</b>
                <span>In the book</span>
              </div>
              <div className="stat">
                <b>{stats.best ? toParLabel(stats.best.toPar) : '–'}</b>
                <span>Career best</span>
              </div>
            </div>
          )}
          {stats.best && row(stats.best, undefined, 'Lowest round')}
          {stats.worst && stats.worst.seed !== stats.best?.seed && row(stats.worst, undefined, 'Highest round')}
        </section>
      </div>
    )
  }

  // --------------------------------------------------------------- main view
  return (
    <div className="screen rounds">
      {scorecard}
      <button className="home-link" onClick={props.onBack}>
        ‹ Teebox
      </button>
      <header>
        <h2 className="pick-title">Clubhouse</h2>
      </header>

      <div className="trophy-row">
        <button className={`trophy ace${stats.aces === 0 ? ' empty' : ''}`} onClick={() => setView('ace')}>
          <span className="trophy-emoji">⛳</span>
          <b>{stats.aces}</b>
          <span>Lifetime Hole in One</span>
        </button>
        <button
          className={`trophy albatross${stats.albatrosses === 0 ? ' empty' : ''}`}
          onClick={() => setView('albatross')}
        >
          <span className="trophy-emoji">🕊️</span>
          <b>{stats.albatrosses}</b>
          <span>Lifetime Albatross</span>
        </button>
      </div>

      {!email && !showAccount && (
        <SyncCta copy="Sync account to save player stats" onTap={() => setShowAccount(true)} trigger="locker" />
      )}
      {showAccount && <AccountPanel onHistorySynced={props.onHistorySynced} defaultOpen={props.initialAccount} />}

      <button className="stats-headline" onClick={() => setView('stats')}>
        <b>{lifetimeRounds()}</b>
        <span>Lifetime rounds played ›</span>
        <span className="fine">Handicap, score breakdown, best &amp; worst</span>
      </button>

      {rounds.length === 0 ? (
        <p className="tagline center">No rounds in the clubhouse yet — go play one and it'll show up here.</p>
      ) : (
        <>
          <div className="locker-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'recent'}
              className={`locker-tab${tab === 'recent' ? ' on' : ''}`}
              onClick={() => setTab('recent')}
            >
              Recent
            </button>
            <button
              role="tab"
              aria-selected={tab === 'records'}
              className={`locker-tab${tab === 'records' ? ' on' : ''}`}
              onClick={() => setTab('records')}
            >
              Records · {records.length + prs.length}
            </button>
          </div>

          {tab === 'recent' && (
            <section className="rounds-section">
              <div className="kicker">
                Last {recent.length} round{recent.length === 1 ? '' : 's'}
              </div>
              {recent.map((r) => row(toLogged(r)))}
            </section>
          )}

          {tab === 'records' && (
            <>
              {records.length > 0 && (
                <section className="rounds-section">
                  <div className="kicker">🏆 Course records you hold</div>
                  {records.map((r) => row(toLogged(r), 'CR'))}
                </section>
              )}
              {prs.length > 0 && (
                <section className="rounds-section">
                  <div className="kicker">Personal bests</div>
                  {prs.map((r) => row(toLogged(r), 'PR'))}
                </section>
              )}
              {records.length + prs.length === 0 && (
                <p className="fine">No records yet — beat your best on any course and it lives here forever.</p>
              )}
            </>
          )}
        </>
      )}

      <p className="fine">Recent keeps your last 10; records, personal bests, and fortune rounds stay forever.</p>
    </div>
  )
}

/**
 * The account-sync nudge. Copy and trigger context are props so future
 * event-driven prompts (say, the moment a player becomes handicap-eligible)
 * reuse this component with different words — no rework, just a new call.
 */
export function SyncCta(props: { copy: string; onTap: () => void; trigger: string }) {
  return (
    <button className="sync-cta" data-trigger={props.trigger} onClick={props.onTap}>
      <b>{props.copy}</b>
      <em>Sync ›</em>
    </button>
  )
}

function shortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
