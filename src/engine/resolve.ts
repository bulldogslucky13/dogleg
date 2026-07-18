import type {
  BallState,
  Choice,
  Conditions,
  HoleLayout,
  HoleResult,
  HoleScore,
  Odds,
  OddsSummary,
  ShotRecord,
  Stage,
} from './types'
import type { HazardZone } from './types'
import type { Rng } from './rng'
import { pickWeighted } from './rng'
import { approachOdds, longOdds, puttOdds, shortOdds, type ApproachMode, type ZoneShare } from './odds'

export interface HoleInPlay {
  layout: HoleLayout
  cond: Conditions
  stage: Stage
  ball: BallState
  strokes: number
  penalties: number
  shots: ShotRecord[]
  /** live headline for the status card */
  status: { tone: 'good' | 'even' | 'bad'; title: string; note: string }
  score?: HoleScore
}

export function startHole(layout: HoleLayout, cond: Conditions): HoleInPlay {
  return {
    layout,
    cond,
    stage: layout.spec.par === 3 ? 'approach' : 'tee',
    ball: { pos: 0, lie: 'tee', side: 'center' },
    strokes: 0,
    penalties: 0,
    shots: [],
    status: { tone: 'even', title: `Hole ${layout.spec.number}`, note: 'Pick your line.' },
  }
}

function approachMode(h: HoleInPlay): ApproachMode {
  const { par } = h.layout.spec
  if (par === 3 && h.ball.lie === 'tee') return 'par3tee'
  if (par === 5 && h.stage === 'second') return 'go'
  const dist = h.layout.length - h.ball.pos
  if (dist <= 115 && (h.ball.lie === 'fairway' || h.ball.lie === 'dialed')) return 'wedge'
  return 'standard'
}

/** Compute the odds the player faces right now for one choice. */
export function oddsFor(h: HoleInPlay, choice: Choice): Odds {
  switch (h.stage) {
    case 'tee':
      return longOdds(h.layout, h.cond, h.ball, choice, 'tee').odds
    case 'second':
      return choice === 'aggressive'
        ? approachOdds(h.layout, h.cond, h.ball, choice, 'go').odds
        : longOdds(h.layout, h.cond, h.ball, choice, 'layup').odds
    case 'approach':
      return approachOdds(h.layout, h.cond, h.ball, choice, approachMode(h)).odds
    case 'putt':
      return puttOdds(h.cond, h.ball.puttFeet ?? 20, choice)
    case 'shortgame':
      return shortOdds(h.layout, h.cond, h.ball, choice)
    default:
      throw new Error(`no odds for stage ${h.stage}`)
  }
}

export function summarize(odds: Odds): OddsSummary {
  switch (odds.kind) {
    case 'long': {
      const good = odds.dialed + odds.fairway
      const bad = odds.sand + odds.trees + odds.water
      return {
        good,
        neutral: odds.rough,
        bad,
        penalty: odds.water,
        headline: `${Math.round(good * 100)}% short grass`,
      }
    }
    case 'approach': {
      const good = odds.holeout + odds.kickin + odds.makeable
      const bad = odds.fringe + odds.sand + odds.water
      return {
        good,
        neutral: odds.lag,
        bad,
        penalty: odds.water,
        headline: `${Math.round(good * 100)}% birdie look`,
      }
    }
    case 'putt':
      return {
        good: odds.one,
        neutral: odds.two,
        bad: odds.three,
        penalty: 0,
        headline: `${Math.round(odds.one * 100)}% make · ${Math.round(odds.three * 100)}% 3-putt`,
      }
    case 'short': {
      const good = odds.holeout + odds.updown
      const stuck = odds.stillin + odds.across
      return {
        good,
        neutral: odds.twochip,
        bad: odds.blowup + odds.disaster + stuck,
        penalty: 0,
        headline:
          stuck >= 0.005
            ? `${Math.round(good * 100)}% save · ${Math.round(odds.stillin * 100)}% stuck`
            : `${Math.round(good * 100)}% save`,
      }
    }
  }
}

function facedAll(h: HoleInPlay): Record<Choice, { summary: OddsSummary; odds: Odds }> {
  const make = (c: Choice) => {
    const o = oddsFor(h, c)
    return { summary: summarize(o), odds: o }
  }
  return { safe: make('safe'), normal: make('normal'), aggressive: make('aggressive') }
}

const jitter = (rng: Rng, span: number) => (rng() - 0.5) * 2 * span

function finish(h: HoleInPlay, note: string): void {
  const par = h.layout.spec.par
  const diff = h.strokes - par
  const result: HoleResult =
    diff <= -3 ? 'albatross' : diff === -2 ? 'eagle' : diff === -1 ? 'birdie' : diff === 0 ? 'par' : diff === 1 ? 'bogey' : diff === 2 ? 'double' : 'triple'
  h.stage = 'done'
  h.score = { strokes: h.strokes, penalties: h.penalties, result, note, shots: h.shots }
}

/** Apply one decision. Mutates and returns the hole state. */
export function playShot(h: HoleInPlay, choice: Choice, rng: Rng): HoleInPlay {
  const faced = facedAll(h)
  const L = h.layout.length
  const spec = h.layout.spec

  switch (h.stage) {
    case 'tee':
    case 'second': {
      if (h.stage === 'second' && choice === 'aggressive') {
        resolveApproach(h, choice, rng, faced, 'go')
        return h
      }
      const mode = h.stage === 'tee' ? 'tee' : 'layup'
      const detail = longOdds(h.layout, h.cond, h.ball, choice, mode)
      const o = detail.odds
      const bucket = pickWeighted(rng, {
        dialed: o.dialed,
        fairway: o.fairway,
        rough: o.rough,
        sand: o.sand,
        trees: o.trees,
        water: o.water,
      })
      h.strokes += 1
      const [wFrom, wTo] = detail.window
      const mid = (wFrom + wTo) / 2
      let penalty = false
      let after: BallState

      if (bucket === 'water') {
        penalty = true
        h.penalties += 1
        h.strokes += 1
        const zone = pickZone(detail.zoneShares, 'water', rng)
        const dropPos =
          zone && zone.side === 'cross'
            ? Math.max(h.ball.pos + 30, zone.from - 8)
            : Math.max(h.ball.pos + 40, mid * 0.8)
        after = { pos: Math.min(dropPos, L - 30), lie: 'rough', side: zone?.side === 'left' ? 'left' : zone?.side === 'right' ? 'right' : 'center' }
      } else if (bucket === 'sand') {
        const zone = pickZone(detail.zoneShares, 'sand', rng)
        after = {
          pos: zone ? Math.min((zone.from + zone.to) / 2, L - 20) : mid,
          lie: 'sand',
          side: zone && zone.side !== 'cross' && zone.side !== 'green' ? zone.side : 'center',
          zoneId: zone?.id,
        }
      } else if (bucket === 'trees') {
        const zone = pickZone(detail.zoneShares, 'trees', rng)
        after = {
          pos: Math.min(wFrom + jitter(rng, 12), L - 40),
          lie: 'trees',
          side: zone && zone.side !== 'cross' && zone.side !== 'green' ? zone.side : h.ball.side,
          zoneId: zone?.id,
        }
      } else {
        const spread = bucket === 'dialed' ? 4 : bucket === 'fairway' ? 10 : 16
        after = {
          pos: Math.min(mid + jitter(rng, spread) + (bucket === 'dialed' ? 8 : 0), L - 25),
          lie: bucket,
          side: bucket === 'rough' ? (rng() < 0.5 ? 'left' : 'right') : 'center',
        }
      }

      h.ball = after
      h.shots.push({ stage: h.stage, choice, outcome: bucket, penalty, faced, after })
      h.stage = spec.par === 5 && h.stage === 'tee' ? 'second' : 'approach'
      h.status = teeStatus(bucket, penalty)
      return h
    }

    case 'approach': {
      resolveApproach(h, choice, rng, faced, approachMode(h))
      return h
    }

    case 'putt': {
      const o = puttOdds(h.cond, h.ball.puttFeet ?? 20, choice)
      const bucket = pickWeighted(rng, { one: o.one, two: o.two, three: o.three })
      const putts = bucket === 'one' ? 1 : bucket === 'two' ? 2 : 3
      h.strokes += putts
      const feet = h.ball.puttFeet ?? 20
      h.ball = { ...h.ball, pos: L, lie: 'green', puttFeet: 0 }
      h.shots.push({ stage: 'putt', choice, outcome: bucket, penalty: false, faced, after: h.ball })
      finish(
        h,
        bucket === 'one'
          ? feet >= 22
            ? 'Drained it from across the county'
            : 'Center cup'
          : bucket === 'two'
            ? feet >= 22
              ? 'Two-putt from distance, no drama'
              : 'Cozied it close, easy two-putt'
            : 'Three-jacked it — the greens bite',
      )
      return h
    }

    case 'shortgame': {
      const o = shortOdds(h.layout, h.cond, h.ball, choice)
      const sand = h.ball.lie === 'sand'
      const bucket = pickWeighted(rng, {
        holeout: o.holeout,
        updown: o.updown,
        twochip: o.twochip,
        blowup: o.blowup,
        disaster: o.disaster,
        stillin: o.stillin,
        across: o.across,
      })

      if (bucket === 'stillin') {
        // one swing, ball still in the trap — same decision again
        h.strokes += 1
        h.shots.push({ stage: 'shortgame', choice, outcome: bucket, penalty: false, faced, after: h.ball })
        h.status = { tone: 'bad', title: 'Still in the bunker', note: 'Caught the lip — dig in and go again.' }
        return h
      }
      if (bucket === 'across') {
        // thinned it over everything: opposite fringe, still scrambling
        h.strokes += 1
        h.ball = {
          pos: Math.min(L + 6, L + 10),
          lie: 'fringe',
          side: h.ball.side === 'left' ? 'right' : h.ball.side === 'right' ? 'left' : 'right',
        }
        h.shots.push({ stage: 'shortgame', choice, outcome: bucket, penalty: false, faced, after: h.ball })
        h.status = { tone: 'bad', title: 'Across the green', note: 'Thinned it — long side now, chip coming back.' }
        return h
      }

      const add = bucket === 'holeout' ? 1 : bucket === 'updown' ? 2 : bucket === 'twochip' ? 3 : bucket === 'blowup' ? 4 : 5
      h.strokes += add
      h.ball = { pos: L, lie: 'green', side: 'center', puttFeet: 0 }
      h.shots.push({ stage: 'shortgame', choice, outcome: bucket, penalty: false, faced, after: h.ball })
      finish(
        h,
        bucket === 'holeout'
          ? sand
            ? 'Holed it from the beach — are you kidding?'
            : 'Chipped it in — are you kidding?'
          : bucket === 'updown'
            ? sand
              ? 'Splashed it close — easy save'
              : 'Got it up and down'
            : bucket === 'twochip'
              ? sand
                ? 'Out to the fat side, two putts'
                : 'Chip and two putts — take it'
              : bucket === 'blowup'
                ? 'Bladed one across — damage done'
                : 'Everything that could go wrong, did',
      )
      return h
    }

    default:
      return h
  }
}

function pickZone(shares: ZoneShare[], bucket: string, rng: Rng): HazardZone | null {
  const list = shares.filter((s) => s.bucket === bucket)
  if (!list.length) return null
  let roll = rng() * list.reduce((s, z) => s + z.share, 0)
  for (const s of list) {
    roll -= s.share
    if (roll <= 0) return s.zone
  }
  return list[list.length - 1].zone
}

function teeStatus(bucket: string, penalty: boolean): HoleInPlay['status'] {
  if (penalty) return { tone: 'bad', title: 'In the water', note: 'One-stroke penalty — playing from the drop.' }
  switch (bucket) {
    case 'dialed':
      return { tone: 'good', title: 'Dialed in', note: 'Perfect position — attack.' }
    case 'fairway':
      return { tone: 'good', title: 'In the fairway', note: 'Clean look at the green.' }
    case 'rough':
      return { tone: 'even', title: 'In the rough', note: 'Awkward — pick your spot.' }
    case 'sand':
      return { tone: 'bad', title: 'In the bunker', note: 'Digging in — advance it smart.' }
    default:
      return { tone: 'bad', title: 'In the trees', note: 'Scrambling — punch out or gamble?' }
  }
}

function resolveApproach(
  h: HoleInPlay,
  choice: Choice,
  rng: Rng,
  faced: Record<Choice, { summary: OddsSummary; odds: Odds }>,
  mode: ApproachMode,
): void {
  const L = h.layout.length
  const detail = approachOdds(h.layout, h.cond, h.ball, choice, mode)
  const o = detail.odds
  const bucket = pickWeighted(rng, {
    holeout: o.holeout,
    kickin: o.kickin,
    makeable: o.makeable,
    lag: o.lag,
    fringe: o.fringe,
    sand: o.sand,
    water: o.water,
  })
  h.strokes += 1
  const stageWas = h.stage
  let penalty = false

  if (bucket === 'holeout') {
    h.ball = { pos: L, lie: 'green', side: 'center', puttFeet: 0 }
    h.shots.push({ stage: stageWas, choice, outcome: bucket, penalty, faced, after: h.ball })
    finish(h, h.strokes === 1 ? 'ACE. Buy the bar a round.' : 'Holed it from the fairway — pandemonium')
    return
  }
  if (bucket === 'kickin') {
    h.strokes += 1 // tap-in
    h.ball = { pos: L, lie: 'green', side: 'center', puttFeet: 0 }
    h.shots.push({ stage: stageWas, choice, outcome: bucket, penalty, faced, after: h.ball })
    finish(h, 'Stuffed it — kick-in range')
    return
  }
  if (bucket === 'makeable' || bucket === 'lag') {
    const feet =
      bucket === 'makeable'
        ? Math.round(5 + rng() * (choice === 'aggressive' ? 8 : 13))
        : Math.round(24 + rng() * (choice === 'safe' ? 22 : 32))
    h.ball = { pos: L, lie: 'green', side: 'center', puttFeet: feet }
    h.stage = 'putt'
    h.status =
      bucket === 'makeable'
        ? { tone: 'good', title: 'Birdie look', note: `${feet} feet — on the dance floor.` }
        : { tone: 'even', title: 'Long putt', note: `${feet} feet — lag it close.` }
    h.shots.push({ stage: stageWas, choice, outcome: bucket, penalty, faced, after: h.ball })
    return
  }
  if (bucket === 'water') {
    penalty = true
    h.penalties += 1
    h.strokes += 1
    const zone = pickZone(detail.missShares, 'water', rng)
    const dropPos = zone && zone.side === 'cross' ? Math.max(h.ball.pos, zone.from - 10) : L - 44
    h.ball = { pos: Math.min(dropPos, L - 35), lie: 'fairway', side: 'center' }
    h.stage = 'approach'
    h.status = { tone: 'bad', title: 'In the water', note: 'One-stroke penalty — playing from the drop.' }
    h.shots.push({ stage: stageWas, choice, outcome: bucket, penalty, faced, after: h.ball })
    return
  }
  // fringe / sand: greenside scramble
  const zone = bucket === 'sand' ? pickZone(detail.missShares, 'sand', rng) : null
  h.ball = {
    pos: Math.min(L - 8 - rng() * 18, L - 5),
    lie: bucket === 'sand' ? 'sand' : 'fringe',
    side: zone && zone.side !== 'cross' && zone.side !== 'green' ? zone.side : rng() < 0.5 ? 'left' : 'right',
    zoneId: zone?.id,
  }
  h.stage = 'shortgame'
  h.status =
    bucket === 'sand'
      ? { tone: 'bad', title: 'Greenside bunker', note: 'Splash it out — save the par.' }
      : { tone: 'bad', title: 'Missed the green', note: 'Short-game test — get it up and down.' }
  h.shots.push({ stage: stageWas, choice, outcome: bucket, penalty, faced, after: h.ball })
}
