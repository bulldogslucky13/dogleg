import type {
  ApproachOdds,
  BallState,
  CharacterId,
  Choice,
  Conditions,
  HazardZone,
  HoleLayout,
  LongOdds,
  PuttOdds,
  ShortOdds,
} from './types'
import { DART_BUFF, FAIRWAY_BUFF, GREENS_BUFF } from './characters'
import { reachableZones } from './layout'

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/**
 * Hole pressure factor 0..1: how much this hole+conditions punish a miss.
 * Same shape as the original game (SI 46%, course difficulty 30%, wind 13%, par-3 4%).
 */
export function pressure(strokeIndex: number, par: number, cond: Conditions): number {
  return clamp01(
    0.46 * (1 - (strokeIndex - 1) / 17) +
      0.3 * ((cond.difficulty - 5) / 5) +
      0.13 * ((cond.wind - 10) / 40) +
      (par === 3 ? 0.04 : 0),
  )
}

function normalize<T extends Record<string, number>>(o: T, keys: (keyof T)[]): void {
  const total = keys.reduce((s, k) => s + Math.max(0, o[k] as number), 0) || 1
  for (const k of keys) (o as Record<string, number>)[k as string] = Math.max(0, o[k] as number) / total
}

// ---------------------------------------------------------------------------
// Long shots (tee on par 4/5, par-5 layups)
// ---------------------------------------------------------------------------

/** carry window in yards from the ball, per choice */
export function driveWindow(choice: Choice, ballPos: number, layout: HoleLayout, extraYards = 0): [number, number] {
  const spans: Record<Choice, [number, number]> = {
    safe: [205, 240],
    normal: [235, 272],
    aggressive: [262, 308],
  }
  const [a, b] = spans[choice]
  const maxTo = layout.length - 12 // a drive never finishes on the green (drivable = tiny approach)
  return [Math.min(ballPos + a + extraYards, maxTo - 10), Math.min(ballPos + b + extraYards, maxTo)]
}

export interface ZoneShare {
  zone: HazardZone
  bucket: 'water' | 'sand' | 'trees'
  share: number // fraction of the *trouble* mass
}

export interface LongOddsDetail {
  odds: LongOdds
  window: [number, number]
  zoneShares: ZoneShare[]
  /** total hazard exposure 0..~2, drives copy like "water in range" */
  exposure: number
}

const TEE_BASE: Record<Choice, { dialed: number; fairway: number; rough: number; trouble: number }> = {
  safe: { dialed: 8, fairway: 64, rough: 25, trouble: 3 },
  normal: { dialed: 22, fairway: 50, rough: 23, trouble: 5 },
  aggressive: { dialed: 40, fairway: 30, rough: 21, trouble: 9 },
}

const LAYUP_BASE: Record<Choice, { dialed: number; fairway: number; rough: number; trouble: number }> = {
  safe: { dialed: 12, fairway: 74, rough: 12, trouble: 2 },
  normal: { dialed: 26, fairway: 58, rough: 13, trouble: 3 },
  aggressive: { dialed: 26, fairway: 58, rough: 13, trouble: 3 }, // unused (aggressive = go for it)
}

const KIND_BUCKET: Record<HazardZone['kind'], 'water' | 'sand' | 'trees'> = {
  water: 'water',
  ocean: 'water',
  bunker: 'sand',
  trees: 'trees',
  deeprough: 'trees',
}

const KIND_SEVERITY: Record<HazardZone['kind'], number> = {
  water: 1,
  ocean: 1.1,
  bunker: 0.9,
  trees: 0.8,
  deeprough: 0.7,
}

/** How much a choice flirts with hazards. Safe actively aims away. */
const CHALLENGE: Record<Choice, number> = { safe: 0.3, normal: 1.0, aggressive: 1.55 }

function hazardShares(
  layout: HoleLayout,
  ball: BallState,
  window: [number, number],
  choice: Choice,
): { shares: ZoneShare[]; exposure: number } {
  const reach = reachableZones(layout, ball.pos, window[0], window[1])
  let total = 0
  const raw: { zone: HazardZone; bucket: 'water' | 'sand' | 'trees'; w: number }[] = []
  for (const { zone, overlap } of reach) {
    const sideW = zone.side === 'cross' ? 1.15 : zone.side === 'green' ? 1 : 0.85
    const w = overlap * sideW * KIND_SEVERITY[zone.kind] * CHALLENGE[choice]
    if (w > 0.001) {
      raw.push({ zone, bucket: KIND_BUCKET[zone.kind], w })
      total += w
    }
  }
  const shares = raw.map((r) => ({ zone: r.zone, bucket: r.bucket, share: r.w / (total || 1) }))
  return { shares, exposure: Math.min(2, total) }
}

export function longOdds(
  layout: HoleLayout,
  cond: Conditions,
  ball: BallState,
  choice: Choice,
  mode: 'tee' | 'layup',
  character?: CharacterId,
): LongOddsDetail {
  const m = pressure(layout.spec.strokeIndex, layout.spec.par, cond)
  const base = { ...(mode === 'tee' ? TEE_BASE : LAYUP_BASE)[choice] }

  // Difficulty shifts position quality for everyone…
  const dialedDecay = choice === 'safe' ? 0.45 : 0.55
  base.dialed *= 1 - dialedDecay * m
  base.fairway *= 1 - 0.12 * m
  base.rough *= 1 + 0.45 * m
  // …but only normal/aggressive see their blow-up odds grow with it. Safe stays bankable.
  if (choice === 'normal') base.trouble *= 1 + 0.8 * m
  if (choice === 'aggressive') base.trouble *= 1 + 2.4 * m

  // the Fairway Finder's edge lives off the tee box only
  const finder = character === 'fairway' && mode === 'tee'
  if (finder) {
    base.dialed *= FAIRWAY_BUFF.dialed
    base.fairway *= FAIRWAY_BUFF.fairway
    base.rough *= FAIRWAY_BUFF.rough
    base.trouble *= FAIRWAY_BUFF.trouble
  }

  let window = driveWindow(choice, ball.pos, layout, finder ? FAIRWAY_BUFF.extraYards : 0)
  if (mode === 'layup') {
    const target = layout.length - (choice === 'safe' ? 100 : 78)
    window = [target - (choice === 'safe' ? 14 : 20), target + (choice === 'safe' ? 14 : 20)]
    // Safe layups automatically stay short of cross hazards in the layup zone.
    if (choice === 'safe') {
      for (const z of layout.zones) {
        if (z.side === 'cross' && z.to > ball.pos + 40 && z.from < window[1] + 10 && z.to < layout.length - 40) {
          window = [z.from - 32, z.from - 10]
        }
      }
    }
  }

  const { shares, exposure } = hazardShares(layout, ball, window, choice)

  // Geometry gates the trouble bucket: no reachable hazards → most of it is just rough.
  const exposureFactor =
    shares.length === 0
      ? 0.25
      : choice === 'safe'
        ? Math.min(1, 0.35 + 0.65 * exposure)
        : Math.min(choice === 'aggressive' ? 1.9 : 1.5, (choice === 'aggressive' ? 0.55 : 0.4) + exposure)
  const trouble = base.trouble * exposureFactor
  base.rough += base.trouble - trouble // redistribute what geometry removed

  const odds: LongOdds = {
    kind: 'long',
    dialed: base.dialed,
    fairway: base.fairway,
    rough: base.rough,
    sand: 0,
    trees: 0,
    water: 0,
  }
  if (shares.length === 0) {
    odds.trees = trouble // junk floor: pine straw / gnarly lies exist everywhere
  } else {
    for (const s of shares) odds[s.bucket] += trouble * s.share
  }
  normalize(odds as unknown as Record<string, number>, ['dialed', 'fairway', 'rough', 'sand', 'trees', 'water'])
  return { odds, window, zoneShares: shares, exposure }
}

// ---------------------------------------------------------------------------
// Approach shots (par-3 tees, par-4 seconds, par-5 thirds & go-for-it)
// ---------------------------------------------------------------------------

type ApproachRow = { kickin: number; makeable: number; lag: number; scramble: number }
type LieRow = 'tee' | 'dialed' | 'fairway' | 'rough' | 'sand' | 'trees'

const APPROACH_BASE: Record<LieRow, Record<Choice, ApproachRow>> = {
  tee: {
    safe: { kickin: 5, makeable: 26, lag: 50, scramble: 19 },
    normal: { kickin: 10, makeable: 32, lag: 37, scramble: 21 },
    aggressive: { kickin: 19, makeable: 33, lag: 18, scramble: 30 },
  },
  dialed: {
    safe: { kickin: 20, makeable: 46, lag: 29, scramble: 5 },
    normal: { kickin: 32, makeable: 44, lag: 18, scramble: 6 },
    aggressive: { kickin: 46, makeable: 35, lag: 10, scramble: 9 },
  },
  fairway: {
    safe: { kickin: 7, makeable: 31, lag: 48, scramble: 14 },
    normal: { kickin: 13, makeable: 37, lag: 36, scramble: 14 },
    aggressive: { kickin: 23, makeable: 37, lag: 20, scramble: 20 },
  },
  rough: {
    safe: { kickin: 3, makeable: 16, lag: 45, scramble: 36 },
    normal: { kickin: 5, makeable: 23, lag: 38, scramble: 34 },
    aggressive: { kickin: 11, makeable: 27, lag: 22, scramble: 40 },
  },
  // fairway bunkers: a clean pick is very possible — the tax is distance control, not escape
  sand: {
    safe: { kickin: 2, makeable: 13, lag: 45, scramble: 40 },
    normal: { kickin: 4, makeable: 19, lag: 39, scramble: 38 },
    aggressive: { kickin: 9, makeable: 24, lag: 25, scramble: 42 },
  },
  trees: {
    safe: { kickin: 1, makeable: 5, lag: 23, scramble: 71 },
    normal: { kickin: 1, makeable: 9, lag: 24, scramble: 66 },
    aggressive: { kickin: 4, makeable: 14, lag: 20, scramble: 62 },
  },
}

const HOLEOUT = {
  par3Tee: { safe: 0.0003, normal: 0.0006, aggressive: 0.001 },
  approach: { safe: 0.0002, normal: 0.0005, aggressive: 0.0012 },
  par5Go: { safe: 0, normal: 0, aggressive: 0.0005 },
  wedge: { safe: 0.0012, normal: 0.0018, aggressive: 0.0012 },
  chip: { safe: 0.015, normal: 0.03, aggressive: 0.05 },
} as const

const HOLEOUT_LIE: Record<LieRow, number> = {
  tee: 1,
  dialed: 1.5,
  fairway: 1,
  rough: 0.5,
  sand: 0.25,
  trees: 0.15,
}

export interface ApproachOddsDetail {
  odds: ApproachOdds
  missShares: ZoneShare[]
  window: [number, number]
}

export type ApproachMode = 'par3tee' | 'standard' | 'wedge' | 'go'

export function approachOdds(
  layout: HoleLayout,
  cond: Conditions,
  ball: BallState,
  choice: Choice,
  mode: ApproachMode,
  character?: CharacterId,
): ApproachOddsDetail {
  const m = pressure(layout.spec.strokeIndex, layout.spec.par, cond)
  const lie: LieRow = ball.lie === 'tee' ? 'tee' : (ball.lie as LieRow)
  const row = { ...APPROACH_BASE[lie][choice] }

  // the Dart Thrower's edge: every approach-style swing flies truer
  if (character === 'dart') {
    row.kickin *= DART_BUFF.kickin
    row.makeable *= DART_BUFF.makeable
    row.lag *= DART_BUFF.lag
    row.scramble *= DART_BUFF.scramble
  }

  row.kickin *= 1 - (choice === 'safe' ? 0.5 : 0.6) * m
  row.makeable *= 1 - (choice === 'safe' ? 0.3 : 0.35) * m
  row.lag *= 1 + (choice === 'safe' ? 0.35 : 0.3) * m
  // Safe approaches still miss more greens under pressure (that's the bogey tax) —
  // they just never turn a miss into a blow-up. Danger scaling lives in the hazard split.
  const scrambleGrowth = choice === 'safe' ? 0.55 : choice === 'normal' ? 0.7 : 1.9
  row.scramble *= 1 + scrambleGrowth * m

  if (mode === 'wedge') {
    // A layup earns a wedge look — the attacking layup (normal) earns a better one.
    const juicy = choice !== 'safe'
    row.kickin *= juicy ? 1.35 : 1.05
    row.makeable *= juicy ? 1.15 : 1.02
    row.lag *= 0.75
    row.scramble *= 0.9
  }
  if (mode === 'go') {
    row.kickin *= 0.55
    row.makeable *= 0.8
    row.lag *= 1.25
    row.scramble *= 1.35
  }

  // Where can this shot actually miss? Between the ball and just past the green.
  const dist = layout.length - ball.pos
  const window: [number, number] = [ball.pos + dist * 0.45, layout.length + 12]
  const { shares } = hazardShares(layout, ball, window, choice)

  const odds: ApproachOdds = {
    kind: 'approach',
    holeout: 0,
    kickin: row.kickin,
    makeable: row.makeable,
    lag: row.lag,
    fringe: row.scramble,
    sand: 0,
    water: 0,
  }
  // Hazards claim a choice-scaled share of missed greens; the rest is plain
  // fringe/rough. Safe bails toward the fat side, so its misses rarely find
  // the short-side trouble — hunting pins is what brings it in play.
  const hazardable = row.scramble * (choice === 'safe' ? 0.32 : choice === 'normal' ? 0.7 : 0.88)
  let claimed = 0
  for (const s of shares) {
    if (s.bucket === 'trees') continue // near the green, tree misses are just fringe junk
    const take = hazardable * s.share
    odds[s.bucket] += take
    claimed += take
  }
  odds.fringe = Math.max(0, row.scramble - claimed)

  normalize(odds as unknown as Record<string, number>, ['kickin', 'makeable', 'lag', 'fringe', 'sand', 'water'])

  let holeoutBase =
    mode === 'par3tee'
      ? HOLEOUT.par3Tee[choice]
      : mode === 'go'
        ? HOLEOUT.par5Go[choice]
        : mode === 'wedge'
          ? HOLEOUT.wedge[choice]
          : HOLEOUT.approach[choice] * HOLEOUT_LIE[lie]
  if (character === 'dart') holeoutBase *= DART_BUFF.holeout
  odds.holeout = holeoutBase
  const scale = 1 - holeoutBase
  odds.kickin *= scale
  odds.makeable *= scale
  odds.lag *= scale
  odds.fringe *= scale
  odds.sand *= scale
  odds.water *= scale

  return { odds, missShares: shares, window }
}

// ---------------------------------------------------------------------------
// Putting
// ---------------------------------------------------------------------------

/** Per-choice anchors: `one` is the make % at PUTT_CURVE.makeAnchor feet,
 * `three` is the 3-putt % at PUTT_CURVE.threeAnchor feet. Distance shapes both
 * continuously — no short/long buckets, so a 21-footer isn't a cliff. */
const PUTT_BASE: Record<Choice, { one: number; three: number }> = {
  safe: { one: 10, three: 4 },
  normal: { one: 22, three: 8 },
  aggressive: { one: 32, three: 16 },
}

const GREEN_SPEED = {
  Slow: { make: 0.85, three: 0.8 },
  Medium: { make: 1, three: 1 },
  Firm: { make: 1.1, three: 1.2 },
  Fast: { make: 1.2, three: 1.45 },
} as const

/** Make decays hyperbolically from the 12ft anchor — tap-ins near-automatic,
 * bombs rare but never impossible. 3-putt is a non-factor inside `threeFrom`
 * feet, then climbs linearly with distance through the 20ft anchor. */
const PUTT_CURVE = { minFeet: 3, maxFeet: 60, makeAnchor: 12, makeExp: 1, threeFrom: 4, threeAnchor: 20 } as const
const MAKE_FLOOR = 0.5
const MAKE_CAP = 92
const LAG_THREE_CAP = 8

export function puttOdds(cond: Conditions, feet: number, choice: Choice, character?: CharacterId): PuttOdds {
  const base = PUTT_BASE[choice]
  const speed = GREEN_SPEED[cond.greens]
  const c = PUTT_CURVE
  const ft = Math.max(c.minFeet, Math.min(c.maxFeet, feet))

  let one = base.one * speed.make * Math.pow(c.makeAnchor / ft, c.makeExp)
  let three = base.three * speed.three * (Math.max(0, ft - c.threeFrom) / (c.threeAnchor - c.threeFrom))
  // the Greens Keeper's edge — applied before the caps so caps stay honest
  if (character === 'greens') {
    one *= GREENS_BUFF.one
    three *= GREENS_BUFF.three
  }
  // Lagging is the whole point of lagging: it caps the disaster.
  if (choice === 'safe') three = Math.min(three, LAG_THREE_CAP)
  one = Math.min(MAKE_CAP, Math.max(MAKE_FLOOR, one))
  // however deep the charge, the two-putt stays the modal outcome from
  // distance: 3-putt never claims more than the two-putt share left by the make
  three = Math.min(three, (100 - one) / 2)
  const two = Math.max(1, 100 - one - three)

  const odds: PuttOdds = { kind: 'putt', one, two, three }
  normalize(odds as unknown as Record<string, number>, ['one', 'two', 'three'])
  return odds
}

// ---------------------------------------------------------------------------
// Short game (missed greens)
// ---------------------------------------------------------------------------

const SHORT_BASE: Record<Choice, { updown: number; twochip: number; blowup: number; disaster: number }> = {
  safe: { updown: 27, twochip: 65, blowup: 7, disaster: 1 },
  normal: { updown: 33, twochip: 50, blowup: 14, disaster: 3 },
  aggressive: { updown: 44, twochip: 34, blowup: 17, disaster: 5 },
}

/**
 * Greenside sand. The normative outcome is out-and-on-the-green; the real risks are
 * leaving it in the trap (hit again) and — rarely — thinning it across the green.
 */
const SAND_BASE: Record<
  Choice,
  { updown: number; twochip: number; stillin: number; across: number; disaster: number }
> = {
  safe: { updown: 19, twochip: 73, stillin: 3, across: 0.5, disaster: 0.5 },
  normal: { updown: 30, twochip: 56, stillin: 8, across: 2, disaster: 1 },
  aggressive: { updown: 42, twochip: 33, stillin: 14, across: 5, disaster: 2.5 },
}

export function shortOdds(layout: HoleLayout, cond: Conditions, ball: BallState, choice: Choice): ShortOdds {
  const m = pressure(layout.spec.strokeIndex, layout.spec.par, cond)
  const odds: ShortOdds = {
    kind: 'short',
    holeout: 0,
    updown: 0,
    twochip: 0,
    blowup: 0,
    disaster: 0,
    stillin: 0,
    across: 0,
  }

  if (ball.lie === 'sand') {
    const base = { ...SAND_BASE[choice] }
    base.updown *= 1 - 0.45 * m
    base.twochip *= 1 + 0.15 * m
    if (choice === 'normal') {
      base.stillin *= 1 + 0.5 * m
      base.across *= 1 + 0.5 * m
    }
    if (choice === 'aggressive') {
      base.stillin *= 1 + m
      base.across *= 1 + m
      base.disaster *= 1 + m
    }
    // The simple splash-out stays simple no matter the conditions.
    if (choice === 'safe') {
      base.stillin = Math.min(base.stillin, 4)
      base.across = Math.min(base.across, 1)
      base.disaster = Math.min(base.disaster, 0.5)
    }
    Object.assign(odds, base)
    normalize(odds as unknown as Record<string, number>, ['updown', 'twochip', 'stillin', 'across', 'disaster'])
  } else {
    const base = { ...SHORT_BASE[choice] }
    base.updown *= 1 - 0.45 * m
    base.twochip *= 1 + 0.2 * m
    if (choice === 'normal') base.blowup *= 1 + 0.7 * m
    if (choice === 'aggressive') {
      base.blowup *= 1 + 1.5 * m
      base.disaster *= 1 + m
    }
    // The punch-out is guaranteed boring: it cannot blow up.
    if (choice === 'safe') {
      base.blowup = Math.min(base.blowup, 2)
      base.disaster = Math.min(base.disaster, 0.5)
    }
    Object.assign(odds, base)
    normalize(odds as unknown as Record<string, number>, ['updown', 'twochip', 'blowup', 'disaster'])
  }

  const holeout = ball.lie === 'sand' ? HOLEOUT.chip[choice] * 0.5 : HOLEOUT.chip[choice]
  odds.holeout = holeout
  for (const k of ['updown', 'twochip', 'blowup', 'disaster', 'stillin', 'across'] as const) {
    odds[k] *= 1 - holeout
  }
  return odds
}
