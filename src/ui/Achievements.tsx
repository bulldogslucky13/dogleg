import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  computeProgress,
  LADDERS,
  loadAchievements,
  markBackfillSeen,
  ONE_OFFS,
  type Unlock,
} from '../state/achievements'
import { prefersReducedMotion } from './motion'

/**
 * The unlock moment: a quiet toast rail, bottom of the screen, never a
 * modal — earning a rank should feel like a nod from the booth, not an
 * interruption. Multiple unlocks land as a swipeable snap-scroll rail: it
 * auto-advances on a timer, but the FIRST touch (swipe, wheel, drag) hands
 * control to the player — the timer stops, a close button takes over, and
 * they can browse back and forth as long as they like. Repeat completions
 * of repeatable badges ride the same treatment as a count bump.
 */
export function UnlockToasts(props: { unlocks: Unlock[]; onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const [manual, setManual] = useState(false)
  const railRef = useRef<HTMLDivElement | null>(null)

  // auto-advance until the player takes the wheel
  useEffect(() => {
    if (manual) return
    const dwell = prefersReducedMotion() ? 5200 : 3800
    const t = setTimeout(() => {
      if (index + 1 < props.unlocks.length) setIndex(index + 1)
      else props.onDone()
    }, dwell)
    return () => clearTimeout(t)
  }, [index, manual, props])

  // keep the rail's scroll position on the current card (auto mode only)
  useEffect(() => {
    if (manual) return
    const rail = railRef.current
    if (!rail) return
    // jsdom has no Element.scrollTo — fall back to plain assignment there
    if (typeof rail.scrollTo === 'function')
      rail.scrollTo({ left: index * rail.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    else rail.scrollLeft = index * rail.clientWidth
  }, [index, manual])

  if (!props.unlocks.length) return null
  const takeover = () => setManual(true)
  return createPortal(
    <div className="ach-rail-wrap" role="status">
      <div
        className="ach-rail"
        ref={railRef}
        onTouchStart={takeover}
        onWheel={takeover}
        onPointerDown={takeover}
      >
        {props.unlocks.map((u, i) => (
          <div key={u.id} className="ach-toast">
            <span className="ach-toast-kicker">Achievement{u.count ? ` · ×${u.count}` : ' unlocked'}</span>
            <b className="ach-toast-name">{u.name}</b>
            <span className="ach-toast-detail">{u.detail}</span>
            {props.unlocks.length > 1 && (
              <span className="ach-toast-queue">
                {i + 1}/{props.unlocks.length}
              </span>
            )}
          </div>
        ))}
      </div>
      <button className="ach-rail-close" onClick={props.onDone} aria-label="Dismiss">
        ✕
      </button>
    </div>,
    document.body,
  )
}

/**
 * The Achievements tab in the Clubhouse: every ladder with its next carrot,
 * then the one-off badges. Earned vs locked reads at a glance; in-progress
 * ladders show "740 / 2000 birdies" toward the NEXT tier by name — the
 * player should always know what they're chasing and how close they are.
 * Hidden one-offs show only a wry hint until the day they unlock.
 */
export function AchievementsView() {
  const ledger = loadAchievements()
  const progress = useMemo(() => computeProgress(), [])

  // the one-time backfill summary is considered delivered once this tab
  // has been seen
  useEffect(() => {
    markBackfillSeen()
  }, [])

  const summary = ledger.backfill && !ledger.backfill.seen && ledger.backfill.granted > 0 ? ledger.backfill.granted : null
  const earnedCount = Object.keys(ledger.earned).length
  const totalCount = LADDERS.reduce((s, l) => s + l.tiers.length, 0) + ONE_OFFS.length

  return (
    <section className="rounds-section achievements">
      {summary !== null && (
        <p className="ach-backfill" role="status">
          🏆 Your history already earned <b>{summary}</b> achievement{summary === 1 ? '' : 's'} — they're checked off
          below.
        </p>
      )}
      <div className="kicker">
        Achievements · {earnedCount}/{totalCount}
      </div>

      {LADDERS.map((ladder) => {
        const value = progress.ladders[ladder.id] ?? 0
        const done = ladder.tiers.filter((t) => value >= t.threshold)
        const next = ladder.tiers.find((t) => value < t.threshold)
        const top = done.length === ladder.tiers.length
        const current = done[done.length - 1]
        // progress toward the next tier measured from the previous one, so a
        // fresh rung starts near empty instead of inheriting the old bar
        const floor = current?.threshold ?? 0
        const pct = next ? Math.min(100, ((value - floor) / (next.threshold - floor)) * 100) : 100
        return (
          <div key={ladder.id} className={`ach-ladder${top ? ' complete' : ''}`}>
            <div className="ach-ladder-head">
              <b className="ach-title">{ladder.title}</b>
              <span className={`ach-rank${current ? '' : ' none'}`}>{current ? current.name : 'Unranked'}</span>
            </div>
            <div className="ach-bar" role="img" aria-label={next ? `${value} of ${next.threshold} ${ladder.unit}` : 'complete'}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="ach-ladder-foot">
              {next ? (
                <>
                  <span className="ach-progress">
                    {value.toLocaleString()} / {next.threshold.toLocaleString()} {ladder.unit}
                  </span>
                  <span className="ach-next">
                    next: <b>{next.name}</b>
                  </span>
                </>
              ) : (
                <span className="ach-progress top">
                  {value.toLocaleString()} {ladder.unit} · the ladder is yours
                </span>
              )}
            </div>
            <div className="ach-dots" aria-hidden>
              {ladder.tiers.map((t) => (
                <i key={t.tier} className={value >= t.threshold ? 'on' : ''} title={`${t.name} · ${t.threshold.toLocaleString()}`} />
              ))}
            </div>
          </div>
        )
      })}

      <div className="kicker">One-offs</div>
      <div className="ach-badges">
        {ONE_OFFS.map((o) => {
          const earned = Boolean(ledger.earned[o.id])
          const count = ledger.counts[o.id] ?? 0
          if (!earned && o.hidden) {
            return (
              <div key={o.id} className="ach-badge locked hidden-badge">
                <b>???</b>
                <span>{o.hint}</span>
              </div>
            )
          }
          return (
            <div key={o.id} className={`ach-badge${earned ? '' : ' locked'}`}>
              <b>
                {o.name}
                {earned && o.repeatable && count > 1 && <em className="ach-count"> ×{count}</em>}
              </b>
              <span>{o.requirement}</span>
            </div>
          )
        })}
      </div>
      <p className="fine ach-fine">
        Hidden badges reveal themselves when you earn them. Everything here is recognition — nothing changes the odds.
      </p>
    </section>
  )
}
