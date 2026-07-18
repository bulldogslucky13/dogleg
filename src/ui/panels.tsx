import type { Choice, CourseSpec, HoleScore, OddsSummary, Stage } from '../engine/types'
import type { HoleInPlay } from '../engine/resolve'
import { oddsFor, summarize } from '../engine/resolve'
import { pressure } from '../engine/odds'
import { RESULT_LABEL, toParLabel } from '../engine/daily'

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
  const m = pressure(h.layout.spec.strokeIndex, h.layout.spec.par, h.cond)
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
          const summary = summarize(oddsFor(hole, c))
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
  const m = pressure(spec.strokeIndex, spec.par, props.hole.cond)
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

export function HazardChips(props: { hole: HoleInPlay }) {
  const { layout, cond, ball } = props.hole
  const spec = layout.spec
  const chips: string[] = []
  if (spec.strokeIndex <= 4) chips.push(`Signature test · SI ${spec.strokeIndex}`)

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
  if (cond.wind >= 18) chips.push(`Howling · ${cond.wind} mph`)
  else if (cond.wind >= 12) chips.push(`Breezy · ${cond.wind} mph`)
  if (cond.greens === 'Fast' || cond.greens === 'Firm') chips.push('Slick greens')
  if (chips.length === 0) return null
  return (
    <div className="chips center">
      {chips.slice(0, 3).map((c) => (
        <span key={c} className="chip">
          {c}
        </span>
      ))}
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
            {BUCKET_COPY[shot.outcome] ?? shot.outcome}
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
  const left = 18 - scores.filter(Boolean).length
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
  return (
    <div className="scorecard">
      <div className="sc-head">
        <span>Round card · {offset === 0 ? 'Front nine' : 'Back nine'}</span>
        <b>{left === 0 ? 'Round complete' : `${left} hole${left === 1 ? '' : 's'} left`}</b>
      </div>
      {row('Hole', nine.map((h) => h.number))}
      {row('Yds', nine.map((h) => h.yards))}
      {row('Par', nine.map((h) => h.par))}
      {row('SI', nine.map((h) => h.strokeIndex))}
      {row('Score', nine.map((_h, i) => (scores[offset + i] ? scores[offset + i]!.strokes : '–')), true)}
    </div>
  )
}

/** Classic scorecard: 18 squares, ○ under par · □ over par, like the original. */
export function ClassicScorecard(props: { course: CourseSpec; scores: (HoleScore | null)[]; currentHole: number }) {
  const { course, scores, currentHole } = props
  const cell = (i: number) => {
    const s = scores[i]
    const par = course.holes[i].par
    let cls = 'csc-cell'
    if (i === currentHole) cls += ' current'
    if (s) {
      if (s.strokes < par) cls += ' under'
      else if (s.strokes - par === 1) cls += ' over'
      else if (s.strokes - par >= 2) cls += ' over2'
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
      <div className="csc-grid">{course.holes.slice(9).map((_, i) => cell(i + 9))}</div>
      <div className="csc-foot">
        <span>Front {front || '–'}</span>
        <span className="csc-legend">○ under · □ over</span>
        <span>Back {back || '–'}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hole-complete panel
// ---------------------------------------------------------------------------

export function HoleComplete(props: { score: HoleScore; par: number; runningToPar: number; last: boolean; onNext: () => void }) {
  const { score } = props
  return (
    <div className="hole-complete">
      <div className="hc-result">{RESULT_LABEL[score.result]}</div>
      {score.penalties > 0 && <div className="hc-pen">{score.penalties} penalty stroke{score.penalties > 1 ? 's' : ''}</div>}
      <div className="hc-note">“{score.note}”</div>
      <div className="hc-running">
        Running <b>{toParLabel(props.runningToPar)}</b>
      </div>
      <details className="hc-odds">
        <summary>See the odds you faced</summary>
        <OddsRecap score={score} par={props.par} />
      </details>
      <button className="cta" onClick={props.onNext}>
        {props.last ? 'Sign the card' : 'Next hole'}
      </button>
    </div>
  )
}
