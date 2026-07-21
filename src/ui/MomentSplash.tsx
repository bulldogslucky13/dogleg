import { characterById } from '../engine/characters'
import { toParLabel } from '../engine/daily'
import { MOMENT_COPY, type MomentKind } from '../engine/fortune'
import type { CharacterId } from '../engine/types'
import { CharacterAvatar } from './Avatars'

/**
 * The full-screen moment: HOLE IN ONE / ALBATROSS. Composed to be
 * screenshotted — course, hole, date, character, branding, fireworks.
 * Stays up until tapped.
 */
export function MomentSplash(props: {
  kind: MomentKind
  holeNumber: number
  courseName: string
  dateKey: string
  toPar: number
  character?: CharacterId
  onClose: () => void
}) {
  const copy = MOMENT_COPY[props.kind]
  const char = characterById(props.character)
  const confetti = Array.from({ length: 26 })
  return (
    <div className={`moment-backdrop ${props.kind}`} role="dialog" aria-label={copy.title} onClick={props.onClose}>
      <div className="moment-rays" aria-hidden />
      {confetti.map((_c, i) => (
        <span key={i} className="moment-confetti" style={confettiStyle(i)} aria-hidden />
      ))}
      <div className="moment-card">
        <div className="moment-kicker">⛳ Dogleg · {props.courseName}</div>
        <div className="moment-ball" aria-hidden>
          <span />
        </div>
        <h1 className="moment-title">{copy.title}</h1>
        <p className="moment-sub">{copy.sub}</p>
        <div className="moment-meta">
          {char && (
            <span className="moment-char">
              <CharacterAvatar id={char.id} size={40} />
              {char.name}
            </span>
          )}
          <span>
            Hole {props.holeNumber} · {toParLabel(props.toPar)} on the round · {shortDate(props.dateKey)}
          </span>
        </div>
        <p className="moment-hint">tap to keep playing — screenshot it first</p>
      </div>
    </div>
  )
}

function confettiStyle(i: number): React.CSSProperties {
  // deterministic scatter — no Math.random so tests and replays render alike
  const left = (i * 37) % 100
  const delay = ((i * 13) % 20) / 10
  const dur = 2.4 + ((i * 7) % 12) / 10
  const size = 6 + ((i * 5) % 8)
  return {
    left: `${left}%`,
    animationDelay: `${delay}s`,
    animationDuration: `${dur}s`,
    width: size,
    height: size * 1.6,
    transform: `rotate(${(i * 47) % 360}deg)`,
  }
}

function shortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
