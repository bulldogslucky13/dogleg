import { useState } from 'react'
import { characterById } from '../engine/characters'
import { courseBySlug } from '../engine/courses'
import { toParLabel } from '../engine/daily'
import type { ReplayPayload } from '../engine/replay'
import { loadPlayer } from '../lib/leaderboard'
import { lifetimeRounds, loadArchive, type ArchivedRound } from '../state/store'

/**
 * My rounds — two tabs so the trophy shelf can grow without burying the feed:
 * "Recent" is your last 10 rounds; "Records" is the permanent shelf (course
 * records you hold + personal bests per course, which never age out). Every
 * entry has a Watch button into the replay viewer.
 */
export function RoundsScreen(props: { onWatch: (p: ReplayPayload) => void; onBack: () => void }) {
  const [tab, setTab] = useState<'recent' | 'records'>('recent')
  const rounds = loadArchive()
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

  const watch = (r: ArchivedRound) =>
    // loadPlayer is the NAMED identity — an anonymous player's replay is
    // simply unattributed, it never leaks their minted id as a name
    props.onWatch({ seed: r.seed, character: r.character, decisions: r.decisions, name: loadPlayer()?.name ?? undefined })

  const row = (r: ArchivedRound, badge?: string) => (
    <div key={`${r.seed}:${badge ?? ''}`} className="round-row">
      <div className="round-row-text">
        <b>
          {courseBySlug(r.courseSlug)?.name ?? r.courseSlug}
          {r.character ? ` ${characterById(r.character)?.emoji ?? ''}` : ''}
        </b>
        <span>
          {shortDate(r.dateKey)} · {r.mode === 'daily' ? 'Daily' : 'Practice'} · {r.strokes} strokes
        </span>
      </div>
      {badge && <em className={`round-badge ${badge === 'CR' ? 'cr' : 'pr'}`}>{badge}</em>}
      <b className={`round-score${r.toPar < 0 ? ' good' : ''}`}>{toParLabel(r.toPar)}</b>
      <button className="cta ghost slim" onClick={() => watch(r)}>
        ▶ Watch
      </button>
    </div>
  )

  return (
    <div className="screen rounds">
      <button className="home-link" onClick={props.onBack}>
        ‹ Clubhouse
      </button>
      <header>
        <div className="kicker">
          Your locker · {lifetimeRounds()} lifetime round{lifetimeRounds() === 1 ? '' : 's'}
        </div>
        <h2 className="pick-title">My rounds</h2>
      </header>

      {rounds.length === 0 ? (
        <p className="tagline center">No rounds in the locker yet — go play one and it'll show up here.</p>
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
              <div className="kicker">Last {recent.length} round{recent.length === 1 ? '' : 's'}</div>
              {recent.map((r) => row(r))}
            </section>
          )}

          {tab === 'records' && (
            <>
              {records.length > 0 && (
                <section className="rounds-section">
                  <div className="kicker">🏆 Course records you hold</div>
                  {records.map((r) => row(r, 'CR'))}
                </section>
              )}
              {prs.length > 0 && (
                <section className="rounds-section">
                  <div className="kicker">Personal bests</div>
                  {prs.map((r) => row(r, 'PR'))}
                </section>
              )}
              {records.length + prs.length === 0 && (
                <p className="fine">No records yet — beat your best on any course and it lives here forever.</p>
              )}
            </>
          )}
        </>
      )}

      <p className="fine">Recent keeps your last 10; records and personal bests stay forever.</p>
    </div>
  )
}

function shortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
