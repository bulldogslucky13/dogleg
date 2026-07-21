import { useEffect, useRef, useState } from 'react'
import { characterById } from '../engine/characters'
import { SITE_URL, streakTag, toParLabel } from '../engine/daily'
import { MOMENT_COPY, type MomentKind } from '../engine/fortune'
import type { CharacterId } from '../engine/types'
import { track } from '../lib/analytics'
import { CharacterAvatar } from './Avatars'
import { momentCardBlob, shareMomentCard } from './momentCard'

/**
 * The full-screen moment: HOLE IN ONE / ALBATROSS. Composed to be
 * shared — course, hole, date, character, branding, fireworks. For the
 * first five seconds every tap is swallowed (including the double-tap
 * that committed the shot) so the moment can't be skipped by accident;
 * only the Share button is live. Then a quiet "tap to continue" fades in
 * and any tap outside the button resumes play. Sharing never advances
 * the game.
 */
export function MomentSplash(props: {
  kind: MomentKind
  holeNumber: number
  courseName: string
  dateKey: string
  toPar: number
  character?: CharacterId
  /** current day streak — rides along on shares when it's worth bragging about */
  streak?: number
  onClose: () => void
}) {
  const copy = MOMENT_COPY[props.kind]
  const char = characterById(props.character)
  const confetti = Array.from({ length: 26 })
  const [locked, setLocked] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const noteTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const t = window.setTimeout(() => setLocked(false), 5000)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(noteTimer.current)
    }
  }, [])

  const flash = (message: string) => {
    setNote(message)
    window.clearTimeout(noteTimer.current)
    noteTimer.current = window.setTimeout(() => setNote(null), 2000)
  }

  const share = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      const blob = await momentCardBlob({
        kind: props.kind,
        holeNumber: props.holeNumber,
        courseName: props.courseName,
        dateKey: props.dateKey,
        toPar: props.toPar,
        character: props.character,
        streak: props.streak,
      })
      const line = props.kind === 'ace' ? `Hole in one at ${props.courseName} ⛳` : `Albatross at ${props.courseName} 🕊️`
      const outcome = await shareMomentCard(blob, {
        filename: `dogleg-${props.kind === 'ace' ? 'hole-in-one' : 'albatross'}.png`,
        text: `${line}${streakTag(props.streak)} — Dogleg`,
        url: `https://${SITE_URL}`,
      })
      if (outcome === 'cancelled') return
      track('moment_share_clicked', { method: outcome, kind: props.kind })
      if (outcome === 'clipboard') flash('Copied!')
      if (outcome === 'download') flash('Saved!')
    } catch {
      // card generation failed — leave the celebration up, no dead end
      flash("Couldn't make the card")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`moment-backdrop ${props.kind}${locked ? ' locked' : ''}`}
      role="dialog"
      aria-label={copy.title}
      onClick={() => {
        if (!locked) props.onClose()
      }}
    >
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
        <button className="cta moment-share" onClick={share} disabled={busy}>
          {busy ? 'Making your card…' : '📸 Share'}
        </button>
        {note && (
          <span className="moment-toast" role="status">
            {note}
          </span>
        )}
        {!locked && <p className="moment-continue">tap to continue playing</p>}
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
