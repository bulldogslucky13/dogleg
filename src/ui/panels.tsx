import { useEffect, useRef, useState } from 'react'
import type { Choice, CourseSpec, HoleScore, OddsSummary, Stage } from '../engine/types'
import type { HoleInPlay } from '../engine/resolve'
import { LOOK_LABEL, madePuttLook, oddsFor, pinChip, summarize } from '../engine/resolve'
import { pressure } from '../engine/odds'
import { RESULT_LABEL, toParLabel } from '../engine/daily'
import { prefersReducedMotion } from './motion'

const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`

// ---------------------------------------------------------------------------
// Choice cards
// ---------------------------------------------------------------------------

const STAGE_COPY: Record<Exclude<Stage, 'done'>, Record<Choice, { label: string; blurb: string }>> = {
  tee: {
    safe: { label: 'Safe', blurb: 'Find the fairway' },
    normal: { label: 'Normal', blurb: 'Play your line' },
    aggressive: { label: 'Aggressive', blurb: 'Challenge the trouble' },
  },
  second: {
    safe: { label: 'Safe', blurb: 'Lay up for a wedge' },
    normal: { label: 'Normal', blurb: 'Lay up, attack with wedge' },
    aggressive: { label: 'Aggressive', blurb: 'Go for the green in two' },
  },
  approach: {
    safe: { label: 'Safe', blurb: 'Center of the green' },
    normal: { label: 'Normal', blurb: 'Favor the fat side' },
    aggressive: { label: 'Aggressive', blurb: 'Hunt the pin' },
  },
  putt: {
    safe: { label: 'Lag', blurb: 'Cozy it close' },
    normal: { label: 'Roll it', blurb: 'Good pace' },
    aggressive: { label: 'Charge', blurb: 'Ram it in' },
  },
  shortgame: {
    safe: { label: 'Punch', blurb: 'Take the safe out' },
    normal: { label: 'Chip', blurb: 'Standard chip' },
    aggressive: { label: 'Flop', blurb: 'Go for the save' },
  },
}

const SAND_COPY: Record<Choice, { label: string; blurb: string }> = {
  safe: { label: 'Blast out', blurb: 'Fat of the green, guaranteed out' },
  normal: { label: 'Splash', blurb: 'Get it close' },
  aggressive: { label: 'Flop', blurb: 'Short-side it — go for the save' },
}

function choiceCopy(stage: Exclude<Stage, 'done'>, lie: string, c: Choice): { label: string; blurb: string } {
  if (stage === 'shortgame' && lie === 'sand') return SAND_COPY[c]
  return STAGE_COPY[stage][c]
}

export function stageName(stage: Stage, par: number, lie?: string): string {
  switch (stage) {
    case 'tee':
      return 'Tee shot'
    case 'second':
      return 'Second shot'
    case 'approach':
      return par === 3 ? 'Tee shot' : 'Approach'
    case 'putt':
      return 'Putt'
    case 'shortgame':
      return lie === 'sand' ? 'Greenside bunker' : 'Short game'
    default:
      return ''
  }
}

function riskTag(h: HoleInPlay, choice: Choice, summary: OddsSummary): { tone: 'good' | 'warn' | 'bad'; text: string } {
  const m = pressure(h.layout.spec.strokeIndex, h.layout.spec.par, h.cond, h.layout.gust ?? 0)
  const tier = m < 0.34 ? 0 : m < 0.6 ? 1 : 2
  if (h.stage === 'putt') {
    if (choice === 'safe') return { tone: 'good', text: 'Lag it close' }
    if (choice === 'normal') return { tone: 'good', text: 'Good speed' }
    return summary.bad > 0.15 ? { tone: 'bad', text: 'Three-jack risk' } : { tone: 'good', text: 'Green light' }
  }
  if (h.stage === 'shortgame') {
    if (h.ball.lie === 'sand') {
      if (choice === 'safe') return { tone: 'good', text: 'Always out' }
      if (choice === 'normal') return { tone: 'good', text: 'Standard splash' }
      return { tone: 'warn', text: 'Lip risk' }
    }
    if (choice === 'safe') return { tone: 'good', text: 'Kill the blow-up' }
    if (choice === 'normal') return { tone: 'good', text: 'Get it close' }
    return { tone: 'warn', text: 'Blow-up risk' }
  }
  if (choice === 'safe') return { tone: 'good', text: 'Bankable' }
  if (choice === 'normal') return tier === 2 ? { tone: 'warn', text: 'Some risk' } : { tone: 'good', text: 'Solid' }
  if (summary.penalty >= 0.075) return { tone: 'bad', text: 'Danger' }
  return tier === 0 ? { tone: 'good', text: 'Green light' } : tier === 1 ? { tone: 'warn', text: 'Risky' } : { tone: 'bad', text: 'Danger' }
}

export function ChoiceCards(props: {
  hole: HoleInPlay
  aggressiveLeft: number
  selected: Choice | null
  disabled: boolean
  classic?: boolean
  onSelect: (c: Choice) => void
  onCommit: () => void
}) {
  const { hole, selected } = props
  const stage = hole.stage as Exclude<Stage, 'done'>
  const budgeted = stage === 'tee' || stage === 'second' || stage === 'approach'
  const choices: Choice[] = ['safe', 'normal', 'aggressive']
  return (
    <div className="choices-wrap">
      <div className="stage-label">
        {stageName(stage, hole.layout.spec.par, hole.ball.lie)}
        {props.classic ? ' — how do you play it?' : ''}
      </div>
      <div className="choices">
        {choices.map((c) => {
          const summary = summarize(oddsFor(hole, c), { strokes: hole.strokes, par: hole.layout.spec.par })
          const copy = choiceCopy(stage, hole.ball.lie, c)
          const tag = riskTag(hole, c, summary)
          const lockout = c === 'aggressive' && budgeted && props.aggressiveLeft <= 0
          return (
            <button
              key={c}
              className={`choice ${c}${selected === c ? ' selected' : ''}`}
              disabled={props.disabled || lockout}
              onClick={() => (selected === c ? props.onCommit() : props.onSelect(c))}
            >
              <span className="choice-head">
                <span className={`dot ${c}`} />
                <b>{copy.label}</b>
              </span>
              <span className="choice-blurb">{selected === c ? 'Tap again to hit it' : copy.blurb}</span>
              <span className="odds-bar" aria-hidden>
                <i className="seg good" style={{ width: pct(summary.good, 1) }} />
                <i className="seg neutral" style={{ width: pct(summary.neutral, 1) }} />
                <i className="seg bad" style={{ width: pct(summary.bad, 1) }} />
              </span>
              <span className="choice-foot">
                <span className="foot-row">
                  <span className={`tag ${tag.tone}`}>{tag.text}</span>
                  {c === 'aggressive' && budgeted && (
                    <em className="agg-left">
                      {lockout ? 'none left' : `${props.classic ? '🔥 ' : ''}${props.aggressiveLeft} left`}
                    </em>
                  )}
                </span>
                <span className="headline">
                  {summary.headline}
                  {summary.penalty >= 0.005 && <b className="splash"> · {pct(summary.penalty)} 💧</b>}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status + context chips
// ---------------------------------------------------------------------------

export function StatusBanner(props: { hole: HoleInPlay }) {
  const s = props.hole.status
  return (
    <div className={`status ${s.tone}`}>
      <span className={`status-dot ${s.tone}`} />
      <div>
        <b>{s.title}</b>
        <p>{s.note}</p>
      </div>
    </div>
  )
}

export function TierBanner(props: { hole: HoleInPlay }) {
  const spec = props.hole.layout.spec
  const m = pressure(spec.strokeIndex, spec.par, props.hole.cond, props.hole.layout.gust ?? 0)
  const tier =
    m < 0.34
      ? { cls: 'good', text: 'Gettable — green light' }
      : m < 0.6
        ? { cls: 'warn', text: 'Pick your moment' }
        : { cls: 'bad', text: 'Card-wrecker — respect it' }
  return (
    <div className={`tier-banner ${tier.cls}`}>
      <span className="tier-dot" />
      {tier.text}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Caddy's read — the hazard/condition chips, framed as the caddy walking the
// hole with you. A pinned label plus a chip row that shows the FULL text (never
// truncated); when the line is too long for the map it drifts to the right,
// dwells a beat, drifts back, and loops until you play a shot. Honors the OS
// reduce-motion switch (holds still) and does nothing when everything fits.
// ---------------------------------------------------------------------------

export function CaddyThoughts(props: { chips: string[] }) {
  const track = useRef<HTMLDivElement>(null)
  const key = JSON.stringify(props.chips)
  useEffect(() => {
    const el = track.current
    if (!el) return
    el.scrollLeft = 0

    const FADE = 16 // px — max width of each edge fade
    // the edge fades track the scroll: no left fade when parked at the start, no
    // right fade at the end — each grows in only once there's content hiding
    // under it, so the read never looks clipped when it's actually all shown
    const fades = (max: number) => {
      el.style.setProperty('--fade-l', `${Math.max(0, Math.min(el.scrollLeft, FADE))}px`)
      el.style.setProperty('--fade-r', `${Math.max(0, Math.min(max - el.scrollLeft, FADE))}px`)
    }
    fades(el.scrollWidth - el.clientWidth)

    if (prefersReducedMotion()) return

    const DWELL_NEAR = 1600 // ms held at the start before drifting out
    const DWELL_FAR = 3000 // ms held at the far end ("wait a few seconds")
    const SPEED = 24 // px/sec — a slow, barely-there drift
    const SETTLE_FRAMES = 6 // frames to keep checking after a false "it fits" (late web-font swap, etc.)
    // easeInOutSine: the gentlest ease there is — velocity eases to zero at both
    // ends, so the turnarounds never snap
    const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t)

    let raf = 0
    let origin = 0
    let settling = 0
    let lastLeft = -1
    const frame = (now: number) => {
      const max = el.scrollWidth - el.clientWidth
      if (max > 1) {
        settling = 0
        if (!origin) origin = now
        const glide = (max / SPEED) * 1000 // ms to cross the overflow once
        const loop = DWELL_NEAR + glide + DWELL_FAR + glide
        let t = (now - origin) % loop
        let target: number
        if (t < DWELL_NEAR) target = 0
        else if ((t -= DWELL_NEAR) < glide) target = ease(t / glide) * max
        else if ((t -= glide) < DWELL_FAR) target = max
        else target = (1 - ease((t - DWELL_FAR) / glide)) * max
        // dwell phases hold a constant target for seconds at a time — skip the
        // write (and the fade recompute) once we're already sitting there
        if (target !== lastLeft) {
          el.scrollLeft = target
          lastLeft = target
          fades(max)
        }
        raf = requestAnimationFrame(frame)
      } else {
        // content fits — settle for a few frames (in case a late font swap or
        // layout pass still grows it), then stop polling until the content
        // key changes again, instead of running an rAF loop forever for nothing
        if (lastLeft !== 0) {
          el.scrollLeft = 0
          lastLeft = 0
          fades(max)
        }
        origin = 0
        if (settling++ < SETTLE_FRAMES) raf = requestAnimationFrame(frame)
      }
    }
    raf = requestAnimationFrame(frame)

    // a resize (rotation, URL-bar collapse) can flip whether the row overflows
    // without the content key changing — restart the drift cleanly from the
    // top instead of letting a stale `origin` produce a discontinuous jump
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      origin = 0
      settling = 0
      lastLeft = -1
      raf = requestAnimationFrame(frame)
    })
    ro.observe(el)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [key])

  if (props.chips.length === 0) return null
  return (
    <div className="caddy-read">
      <span className="caddy-read-tag">
        <span className="caddy-read-dot" />
        Caddy&rsquo;s read
      </span>
      <div className="chips caddy-track" ref={track}>
        {props.chips.map((c, i) => (
          <span key={i} className="chip">
            {c}
          </span>
        ))}
      </div>
    </div>
  )
}

export function HazardChips(props: { hole: HoleInPlay }) {
  const { layout, cond, ball } = props.hole
  const spec = layout.spec
  // signature flavor rides only on the tee, as a one-off hole intro alongside
  // the tier banner — persisting it every shot would just be noise
  const atTee = props.hole.shots.length === 0
  // the caddy reads out everything relevant, in authored order — the row
  // scrolls, so there's no cap on how much fits (see CaddyThoughts)
  const chips: string[] = []
  if (atTee && spec.strokeIndex <= 4) chips.push(`Signature test · SI ${spec.strokeIndex}`)

  // geometry-honest hazard chips: only what is actually still in front of the ball
  const ahead = layout.zones.filter((z) => z.to > ball.pos + 2)
  if (ahead.some((z) => z.kind === 'ocean')) chips.push('Ocean in play')
  else if (ahead.some((z) => z.kind === 'water')) {
    const cross = ahead.find((z) => z.kind === 'water' && z.side === 'cross')
    chips.push(cross ? `Water crosses at ${Math.round(cross.from - ball.pos)} yds` : 'Water in play')
  } else if (layout.zones.some((z) => z.kind === 'water' || z.kind === 'ocean')) {
    chips.push('Water behind you — out of play')
  } else if (ahead.some((z) => z.kind === 'bunker')) chips.push('Bunkers guard it')
  if (spec.dogleg === 'L') chips.push('Dogleg left')
  if (spec.dogleg === 'R') chips.push('Dogleg right')
  // today's flag on a par 3, framed against the greenside trouble — the
  // tucked ones are the decision ("Sucker pin left · short-sided")
  if (atTee) {
    const pin = pinChip(layout)
    if (pin) chips.push(pin)
  }
  // par-3 shorts carry a per-hole gust on top of the day's wind — and show it
  // ALWAYS there (a gust-carrying hole). Big courses keep the ≥12mph threshold.
  const wind = cond.wind + (layout.gust ?? 0)
  const gustHole = layout.gust !== undefined
  if (wind >= 18) chips.push(`Howling · ${wind} mph`)
  else if (wind >= 12) chips.push(`Breezy · ${wind} mph`)
  else if (gustHole) chips.push(`Wind · ${wind} mph`)
  if (cond.greens === 'Fast' || cond.greens === 'Firm') chips.push('Slick greens')

  const sig = atTee ? spec.signature : undefined
  if (chips.length === 0 && !sig) return null
  return (
    // signature rides its own row above the hazard chips: it wraps freely as
    // the hole's headline, while the caddy's read scrolls the full list below it
    <div className="hazard-stack">
      {sig && (
        <div className="sig-row">
          <span className="chip sig" title="Signature hole">
            ⛳ {sig}
          </span>
        </div>
      )}
      {chips.length > 0 && <CaddyThoughts chips={chips} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Post-hole odds recap
// ---------------------------------------------------------------------------

const BUCKET_COPY: Record<string, string> = {
  dialed: 'dialed in',
  fairway: 'in the fairway',
  rough: 'in the rough',
  sand: 'in the sand',
  trees: 'in the trees',
  water: 'in the water',
  holeout: 'HOLED OUT',
  kickin: 'kick-in range',
  makeable: 'a birdie look',
  lag: 'a long putt',
  fringe: 'just off the green',
  one: 'one putt',
  two: 'two putts',
  three: 'three putts',
  updown: 'up & down',
  twochip: 'chip and two putts',
  blowup: 'a blow-up',
  disaster: 'a disaster',
  stillin: 'still in the bunker',
  across: 'across the green',
}

export function OddsRecap(props: { score: HoleScore; par: number }) {
  const lieBefore = (i: number): string => (i > 0 ? props.score.shots[i - 1].after.lie : 'tee')
  return (
    <div className="recap">
      <h4>The odds you faced · every decision</h4>
      {props.score.shots.map((shot, i) => (
        <div key={i} className="recap-shot">
          <div className="recap-stage">
            {stageName(shot.stage, props.par, lieBefore(i))} — went{' '}
            {choiceCopy(shot.stage as Exclude<Stage, 'done'>, lieBefore(i), shot.choice).label.toLowerCase()}, finished{' '}
            {shot.outcome === 'makeable' && shot.strokesAfter != null
              ? LOOK_LABEL[madePuttLook(shot.strokesAfter, props.par)].phrase
              : (BUCKET_COPY[shot.outcome] ?? shot.outcome)}
            {shot.penalty ? ' (+1 penalty)' : ''}
          </div>
          {shot.advantage && (
            <div className={`recap-advantage ${shot.advantage.id}`}>
              ★ {shot.advantage.title} · {shot.advantage.stat}
            </div>
          )}
          {(['safe', 'normal', 'aggressive'] as Choice[]).map((c) => {
            const f = shot.faced[c]
            return (
              <div key={c} className={`recap-row${shot.choice === c ? ' chosen' : ''}`}>
                <span className="recap-label">
                  {choiceCopy(shot.stage as Exclude<Stage, 'done'>, lieBefore(i), c).label}
                  {shot.choice === c ? ' ✓' : ''}
                </span>
                <span className="odds-bar">
                  <i className="seg good" style={{ width: pct(f.summary.good, 1) }} />
                  <i className="seg neutral" style={{ width: pct(f.summary.neutral, 1) }} />
                  <i className="seg bad" style={{ width: pct(f.summary.bad, 1) }} />
                </span>
                <span className="recap-headline">{f.summary.headline}</span>
              </div>
            )
          })}
        </div>
      ))}
      <p className="recap-note">Your decision shifts the odds — the outcome is one roll inside them.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

export function Scorecard(props: { course: CourseSpec; scores: (HoleScore | null)[]; currentHole: number }) {
  const { course, scores, currentHole } = props
  const offset = currentHole < 9 ? 0 : 9
  const nine = course.holes.slice(offset, offset + 9)
  const left = course.holes.length - scores.filter(Boolean).length
  const row = (label: string, vals: (string | number)[], scoreRow = false) => (
    <div className={`sc-line${scoreRow ? ' sc-scores' : ''}`}>
      <span className="sc-label">{label}</span>
      {vals.map((v, i) => (
        <span key={i} className={offset + i === currentHole ? 'current' : ''}>
          {v}
        </span>
      ))}
    </div>
  )
  // single-row strip shown on small screens instead of the full table, so the
  // vertical space goes to the course map. Standard golf marks: ○ under par,
  // □ over, double box for double bogey or worse — par stays unmarked.
  const stripCell = (i: number) => {
    const s = scores[offset + i]
    let cls = 'scs'
    if (offset + i === currentHole) cls += ' current'
    if (s) {
      if (s.result === 'albatross' || s.result === 'eagle' || s.result === 'birdie') cls += ' under'
      else if (s.result === 'bogey') cls += ' over'
      else if (s.result !== 'par') cls += ' over2'
    } else cls += ' todo'
    return (
      <span key={i} className={cls}>
        {s ? s.strokes : nine[i].number}
      </span>
    )
  }
  return (
    <div className="scorecard">
      <div className="sc-head">
        <span>Round card{course.holes.length > 9 ? ` · ${offset === 0 ? 'Front nine' : 'Back nine'}` : ''}</span>
        <b>{left === 0 ? 'Round complete' : `${left} hole${left === 1 ? '' : 's'} left`}</b>
      </div>
      {row('Hole', nine.map((h) => h.number))}
      {row('Yds', nine.map((h) => h.yards))}
      {row('Par', nine.map((h) => h.par))}
      {row('SI', nine.map((h) => h.strokeIndex))}
      {row('Score', nine.map((_h, i) => (scores[offset + i] ? scores[offset + i]!.strokes : '–')), true)}
      <div className="sc-strip">{nine.map((_h, i) => stripCell(i))}</div>
    </div>
  )
}

/** Classic scorecard: 18 squares, ○ under par · □ over par, like the original. */
export function ClassicScorecard(props: { course: CourseSpec; scores: (HoleScore | null)[]; currentHole: number }) {
  const { course, scores, currentHole } = props
  const cell = (i: number) => {
    const s = scores[i]
    let cls = 'csc-cell'
    if (i === currentHole) cls += ' current'
    if (s) {
      if (s.result === 'albatross' || s.result === 'eagle' || s.result === 'birdie') cls += ' under'
      else if (s.result === 'bogey') cls += ' over'
      else if (s.result === 'double' || s.result === 'triple') cls += ' over2'
    } else cls += ' todo'
    return (
      <span key={i} className={cls}>
        {s ? s.strokes : course.holes[i].number}
      </span>
    )
  }
  const nine = (from: number) => scores.slice(from, from + 9).reduce((t, s) => t + (s?.strokes ?? 0), 0)
  const front = nine(0)
  const back = nine(9)
  return (
    <div className="classic-scorecard">
      <div className="csc-grid">{course.holes.slice(0, 9).map((_, i) => cell(i))}</div>
      {course.holes.length > 9 && <div className="csc-grid">{course.holes.slice(9).map((_, i) => cell(i + 9))}</div>}
      <div className="csc-foot">
        <span>Front {front || '–'}</span>
        <span className="csc-legend">○ under · □ over</span>
        {course.holes.length > 9 ? <span>Back {back || '–'}</span> : <span />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hole-complete panel
// ---------------------------------------------------------------------------

export function HoleComplete(props: {
  score: HoleScore
  par: number
  runningToPar: number
  last: boolean
  onNext: () => void
  /** "the clubhouse cast" lines for this hole — choices only, no outcomes.
   * Undefined/empty hides the block (e.g. non-daily rounds with no cast to show). */
  castLines?: string[]
  /** Real clubhouse tally for this hole's headline (tee) decision — e.g.
   * "9 of 12 laid up." Undefined/unavailable renders nothing extra; the cast
   * lines above stand alone unchanged. Post-commit only, never a live signal. */
  clubhouseTally?: string
}) {
  const { score } = props
  const [clubhouseOpen, setClubhouseOpen] = useState(false)
  const hasClubhouse = (props.castLines?.length ?? 0) > 0
  return (
    <div className="hole-complete">
      {/* a holed first stroke is scorewise an eagle (par 3) but nobody calls it that */}
      <div className="hc-result">{score.strokes === 1 ? 'Hole in One' : RESULT_LABEL[score.result]}</div>
      {score.penalties > 0 && <div className="hc-pen">{score.penalties} penalty stroke{score.penalties > 1 ? 's' : ''}</div>}
      <div className="hc-note">“{score.note}”</div>
      <div className="hc-running">
        Running <b>{toParLabel(props.runningToPar)}</b>
      </div>
      {hasClubhouse && (
        <button className="clubhouse-trigger" onClick={() => setClubhouseOpen(true)}>
          🏌 See what the clubhouse did
        </button>
      )}
      <details className="hc-odds">
        <summary>See the odds you faced</summary>
        <OddsRecap score={score} par={props.par} />
      </details>
      <button className="cta" onClick={props.onNext}>
        {props.last ? 'Sign the card' : 'Next hole'}
      </button>
      {clubhouseOpen && hasClubhouse && (
        <ClubhouseModal
          castLines={props.castLines!}
          clubhouseTally={props.clubhouseTally}
          onClose={() => setClubhouseOpen(false)}
        />
      )}
    </div>
  )
}

/** Post-hole peek at what everyone else did on this hole — the real clubhouse
 * tally (when today's field has posted enough) over the game's cast of regulars.
 * Choices only, opened on demand from the recap; never a live pre-shot signal. */
function ClubhouseModal(props: { castLines: string[]; clubhouseTally?: string; onClose: () => void }) {
  return (
    <div className="clubhouse-backdrop" role="dialog" aria-label="What the clubhouse did" onClick={props.onClose}>
      <div className="clubhouse-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="kicker">The clubhouse</div>
        {props.clubhouseTally && (
          <div className="clubhouse-tally">
            <h4>From today's field</h4>
            <div className="cast-line">{props.clubhouseTally}</div>
          </div>
        )}
        <div className="cast-block">
          <h4>
            The clubhouse cast <span className="cast-hint">(the game's regulars)</span>
          </h4>
          {props.castLines.map((line, i) => (
            <div key={i} className="cast-line">
              {line}
            </div>
          ))}
        </div>
        <button className="cta" onClick={props.onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
