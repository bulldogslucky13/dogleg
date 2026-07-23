import { useRef, useState } from 'react'
import { characterById } from '../engine/characters'
import { SITE_URL, toParLabel } from '../engine/daily'
import type { Season } from '../engine/season'
import type { CharacterId } from '../engine/types'
import { track } from '../lib/analytics'
import { CharacterAvatar } from './Avatars'
import { momentCardBlob, shareMomentCard } from './momentCard'

/**
 * THE marquee record moment: an all-time course record. Full-screen like the
 * fortune splashes (rays, confetti, the works) — this outranks the season
 * celebration, which it acknowledges in a line instead of stacking a second
 * full-screen moment. Immediately dismissible (the result screen beneath is
 * not skippable content), shares through the same branded card pipeline.
 */
export function AllTimeSplash(props: {
  courseName: string
  courseSlug: string
  dateKey: string
  toPar: number
  character?: CharacterId
  season: Season
  /** the previous all-time holder, when there was one */
  previousHolder?: string
  /** the referee confirmed a season record rode along — absent during the
   * pre-migration window where season_records doesn't exist yet */
  tookSeason?: boolean
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const noteTimer = useRef<number | undefined>(undefined)
  const confetti = Array.from({ length: 26 })
  const char = characterById(props.character)

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
        kind: 'record',
        holeNumber: 0,
        courseName: props.courseName,
        dateKey: props.dateKey,
        toPar: props.toPar,
        character: props.character,
        copy: { title: 'ALL-TIME RECORD', sub: 'The best round this course has ever seen.' },
        meta: `${toParLabel(props.toPar)} · all-time course record · ${props.season.label}`,
      })
      const outcome = await shareMomentCard(blob, {
        filename: 'dogleg-all-time-record.png',
        text: `All-time course record on ${props.courseName} (${toParLabel(props.toPar)}) — DogLeg`,
        url: `https://${SITE_URL}`,
      })
      if (outcome === 'cancelled') return
      track('alltime_record_share_clicked', { method: outcome, course: props.courseSlug })
      if (outcome === 'clipboard') flash('Copied!')
      if (outcome === 'download') flash('Saved!')
    } catch {
      flash("Couldn't make the card")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="moment-backdrop alltime" role="dialog" aria-label="All-time course record" onClick={props.onClose}>
      <div className="moment-rays" aria-hidden />
      {confetti.map((_c, i) => (
        <span key={i} className="moment-confetti" style={confettiStyle(i)} aria-hidden />
      ))}
      <div className="moment-card">
        <div className="moment-kicker">⛳ DogLeg · {props.courseName}</div>
        <div className="moment-ball" aria-hidden>
          <span />
        </div>
        <h1 className="moment-title">All-time record</h1>
        <p className="moment-sub">
          {toParLabel(props.toPar)} — the best this course has ever been played.
          {props.previousHolder ? ` ${props.previousHolder}'s wall, repainted.` : ''}
        </p>
        <div className="moment-meta">
          {char && (
            <span className="moment-char">
              <CharacterAvatar id={char.id} size={40} />
              {char.name}
            </span>
          )}
          {props.tookSeason && <span>Takes the {props.season.name} record with it — obviously.</span>}
        </div>
        <button className="cta moment-share" onClick={share} disabled={busy}>
          {busy ? 'Making your card…' : '📸 Share'}
        </button>
        {note && (
          <span className="moment-toast" role="status">
            {note}
          </span>
        )}
        <p className="moment-hint">tap anywhere to continue</p>
      </div>
    </div>
  )
}

function confettiStyle(i: number): React.CSSProperties {
  // deterministic scatter — no Math.random so tests render alike
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
