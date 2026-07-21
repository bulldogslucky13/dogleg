import { characterById } from '../engine/characters'
import { courseBySlug } from '../engine/courses'
import { toParLabel } from '../engine/daily'
import type { HoleResult } from '../engine/types'
import { holeStrokes, type LoggedRound } from '../state/stats'
import { CharacterAvatar } from './Avatars'

/**
 * THE scorecard — one component for every round the Locker can name: recent
 * rounds, personal bests, course records, fortune rounds, the lifetime
 * highest/lowest. Renders from the round log's per-hole results (strokes are
 * derived from result + par, so pre-log daily history renders identically).
 * Presented as an overlay so any list can open it without leaving its screen.
 */
export function RoundScorecard(props: { round: LoggedRound; onReplay?: () => void; onClose: () => void }) {
  const { round } = props
  const course = courseBySlug(round.courseSlug)
  const char = characterById(round.character)
  const pars = course?.holes.map((h) => h.par) ?? Array(18).fill(4)

  // Real strokes when the round logged them (blow-up holes past 'triple' can't
  // be rebuilt from result + par); older result-only rounds fall back.
  const strokesAt = (hole: number, r: HoleResult) => round.strokesByHole?.[hole] ?? holeStrokes(r, pars[hole])

  const rowClass = (r: HoleResult, strokes: number) => {
    if (strokes === 1 || r === 'albatross') return 'sc-row moment'
    if (r === 'eagle' || r === 'birdie') return 'sc-row under'
    if (r === 'bogey') return 'sc-row over'
    if (r === 'double' || r === 'triple') return 'sc-row over2'
    return 'sc-row'
  }

  const nine = (from: number) => (
    <div className="sc-nine">
      <div className="sc-row sc-head">
        <span>No</span>
        <span>Par</span>
        <span>Score</span>
      </div>
      {round.results.slice(from, from + 9).map((r, i) => {
        const hole = from + i
        const strokes = strokesAt(hole, r)
        return (
          <div key={hole} className={rowClass(r, strokes)}>
            <span>{hole + 1}</span>
            <span>{pars[hole]}</span>
            <span className="sc-strokes">
              {strokes}
              {strokes === 1 && <em className="sc-flag">ACE</em>}
              {r === 'albatross' && strokes !== 1 && <em className="sc-flag alb">ALB</em>}
            </span>
          </div>
        )
      })}
      <div className="sc-row sc-foot">
        <span>{from === 0 ? 'Out' : 'In'}</span>
        <span>{pars.slice(from, from + 9).reduce((s: number, p: number) => s + p, 0)}</span>
        <span>{round.results.slice(from, from + 9).reduce((s, r, i) => s + strokesAt(from + i, r), 0)}</span>
      </div>
    </div>
  )

  return (
    <div className="scorecard-backdrop" role="dialog" aria-label="Scorecard" onClick={props.onClose}>
      <div className="scorecard-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="kicker">
          {round.mode === 'daily' ? 'Daily' : 'Practice'} · {shortDate(round.dateKey)}
        </div>
        <h2 className="sc-course">{course?.name ?? round.courseSlug}</h2>
        <div className="sc-sub">
          {char && (
            <span className="char-chip">
              <CharacterAvatar id={char.id} size={26} />
              <span className="char-chip-name">{char.name}</span>
            </span>
          )}
          <b className={`sc-total${round.toPar < 0 ? ' good' : ''}`}>
            {round.strokes} strokes · {toParLabel(round.toPar)}
          </b>
        </div>
        <div className="sc-nines">
          {nine(0)}
          {nine(9)}
        </div>
        <div className="sc-actions">
          {props.onReplay && (
            <button className="cta ghost" onClick={props.onReplay}>
              ▶ Watch replay
            </button>
          )}
          <button className="cta" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function shortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
