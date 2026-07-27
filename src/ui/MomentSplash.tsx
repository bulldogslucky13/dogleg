import { useEffect, useRef, useState } from 'react'
import { characterById } from '../engine/characters'
import { SITE_URL, streakTag, toParLabel } from '../engine/daily'
import { MOMENT_COPY, type MomentKind } from '../engine/fortune'
import { MISFORTUNE_CONFIG, misfortuneLine, misfortuneOddsCopy, MISFORTUNE_COPY } from '../engine/misfortune'
import { puzzleNumberForDateKey } from '../engine/daily'
import type { CharacterId } from '../engine/types'
import { track } from '../lib/analytics'
import { CharacterAvatar } from './Avatars'
import { momentCardBlob, shareMomentCard } from './momentCard'
import { Wordmark } from './Wordmark'

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
  /** misfortune only: drives the odds copy and the deterministic punchline */
  mode?: 'daily' | 'practice'
  seed?: string
  /** misfortune only: the cursed hole's par, for the scoreline */
  par?: number
  onClose: () => void
}) {
  const grim = props.kind === 'misfortune'
  const copy = grim
    ? { title: MISFORTUNE_COPY.title, sub: misfortuneOddsCopy(props.mode ?? 'daily') }
    : MOMENT_COPY[props.kind as 'ace' | 'albatross']
  const line = grim ? misfortuneLine(props.seed ?? '', props.mode ?? 'daily') : null
  const grimScore = grim && props.par ? `${article(props.par * 2)} ${props.par * 2} on the par-${props.par} ${ordinal(props.holeNumber)}.` : null
  const char = characterById(props.character)
  const confetti = Array.from({ length: 26 })
  const [locked, setLocked] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const noteTimer = useRef<number | undefined>(undefined)
  const cardBlob = useRef<Blob | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setLocked(false), 5000)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(noteTimer.current)
    }
  }, [])

  // Render the share card up front, while the splash sits on screen, so the
  // Share tap can hand it straight to navigator.share(). Web Share needs the
  // tap's transient activation; awaiting the card (its lazy react-dom/server
  // chunk + image loads) inside the click would blow that window on a slow
  // connection and drop the user to a download. Prewarm failures are fine —
  // share() regenerates on demand and falls back to clipboard/download.
  useEffect(() => {
    let alive = true
    momentCardBlob({
      kind: props.kind,
      holeNumber: props.holeNumber,
      courseName: props.courseName,
      dateKey: props.dateKey,
      toPar: props.toPar,
      character: props.character,
      streak: props.streak,
      ...(grim ? { copy: { title: copy.title, sub: line ?? copy.sub } } : {}),
    })
      .then((blob) => {
        if (alive) cardBlob.current = blob
      })
      .catch(() => {})
    return () => {
      alive = false
    }
    // props for a given moment are fixed for the splash's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const line =
        props.kind === 'ace'
          ? `Hole in one at ${props.courseName} ⛳`
          : props.kind === 'albatross'
            ? `Albatross at ${props.courseName} 🕊️`
            : misfortuneShareLine(props)
      const opts = {
        filename: `dogleg-${props.kind === 'ace' ? 'hole-in-one' : props.kind === 'albatross' ? 'albatross' : 'mis-fortune'}.png`,
        text: props.kind === 'misfortune' ? line : `${line}${streakTag(props.streak)} — DogLeg`,
        url: `https://${SITE_URL}`,
      }
      // Ready card → no await before shareMomentCard, so navigator.share() fires
      // inside the tap's activation. Only regenerate if the prewarm hasn't landed.
      const blob =
        cardBlob.current ??
        (await momentCardBlob({
          kind: props.kind,
          holeNumber: props.holeNumber,
          courseName: props.courseName,
          dateKey: props.dateKey,
          toPar: props.toPar,
          character: props.character,
          streak: props.streak,
          ...(grim ? { copy: { title: copy.title, sub: line ?? copy.sub } } : {}),
        }))
      cardBlob.current = blob
      const outcome = await shareMomentCard(blob, opts)
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
        <Wordmark className="moment-wordmark" />
        <div className="moment-kicker">{props.courseName}</div>
        <div className="moment-ball" aria-hidden>
          <span />
        </div>
        <h1 className="moment-title">{copy.title}</h1>
        {grimScore && <p className="moment-grim-score">{grimScore}</p>}
        <p className="moment-sub">{copy.sub}</p>
        {line && <p className="moment-grim-line">{line}</p>}
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

/** Share text for the disaster: misery + the odds + the puzzle number — the
 * "wait, WHAT" package. Mirrors the fortune share format. */
function misfortuneShareLine(props: { courseName: string; holeNumber: number; par?: number; mode?: 'daily' | 'practice'; dateKey: string }): string {
  const par = props.par ?? 4
  const daily = props.mode !== 'practice'
  const where = daily ? `DOGLEG #${puzzleNumberForDateKey(props.dateKey)}` : 'DogLeg'
  const odds = MISFORTUNE_CONFIG[props.mode ?? 'daily'].par4sPerEvent.toLocaleString()
  return `Mis-fortune 🌩️ ${where}: forced to ${article(par * 2).toLowerCase()} ${par * 2} on the par-${par} ${ordinal(props.holeNumber)} at ${props.courseName}. 1 par 4 in ${odds}. It chose me.`
}

/** 'An 8', 'An 11', 'An 18' — but 'A 6', 'A 10' */
function article(n: number): string {
  return n === 8 || n === 11 || n === 18 ? 'An' : 'A'
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

function shortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
