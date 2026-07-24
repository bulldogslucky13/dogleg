export type Choice = 'safe' | 'normal' | 'aggressive'

/** Round-long playstyle picked at the first tee. */
export type CharacterId = 'fairway' | 'dart' | 'greens'

export type Dogleg = 'L' | 'R' | 'S'

/** Hazard personality of a hole used by the generator. */
export type HazardStyle = 'none' | 'sand' | 'water' | 'ocean'

export type Greens = 'Slow' | 'Medium' | 'Firm' | 'Fast'

/** A recognizable structure drawn behind the green as pure map flavor —
 * cosmetic only, never touches odds/geometry/seed replay. */
export type Landmark = 'lighthouse' | 'bridge'

export interface HoleSpec {
  number: number
  par: 3 | 4 | 5
  yards: number
  /** 1 = hardest hole on the course, 18 = easiest */
  strokeIndex: number
  /**
   * @deprecated Hand-set and unreliable (several Harbour Town flags shipped
   * backwards). For OSM-imported holes the real centreline bend (`OSM_BEND` in
   * geometry.ts, surfaced as `HoleLayout.bend`) is authoritative and overrides
   * this for both the map and the "Dogleg left/right" chip. This field remains
   * ONLY because procedurally-generated courses still derive their challenge
   * side (and thus hazard placement, which feeds the odds) from it. Prefer the
   * OSM bend wherever a hole has one.
   */
  dogleg: Dogleg
  hazard: HazardStyle
  signature?: string
  /** true = green fully ringed by water (island). Drives layout geometry
   * explicitly, so signature prose can stay pure flavor. */
  island?: boolean
  /** decorative structure behind the green (e.g. Harbour Town's lighthouse) */
  landmark?: Landmark
}

export interface CourseSpec {
  slug: string
  name: string
  location: string
  /** 1-10, baseline course difficulty */
  difficulty: number
  greens: Greens
  /** typical wind, mph; daily conditions jitter around it */
  wind: number
  blurb: string
  holes: HoleSpec[]
  /** true = a par-3 short course: unlimited play only, never in the daily
   * rotation, and fortune (destiny + ace-odds boosts) stays out of it. May
   * have fewer than 18 holes — round length follows `holes.length`. */
  par3Course?: boolean
}

/**
 * Where the flag sits on a par 3. A per-round, seed-derived slice of the
 * conditions: the tier drives the odds (hunting a tucked pin pays better and
 * punishes harder; an open pin is green-light), the side is for the map and
 * copy. Never on par 4s/5s — approach variety there comes from position.
 */
export interface PinPosition {
  tier: 'open' | 'middle' | 'tucked'
  side: 'left' | 'center' | 'right'
}

export interface Conditions {
  wind: number
  greens: Greens
  difficulty: number
  /** par-3 hole number → today's pin. Absent on pre-pin saves: those rounds
   * play (and replay) with no pin modifier, exactly as they were dealt. */
  pins?: Record<number, PinPosition>
  /** hole number → wind delta (mph) on top of `wind`. Par-3 short courses
   * only — the shorts lean into the weather, hole by hole. */
  gusts?: Record<number, number>
}

// ---------- Geometry ----------

export type ZoneKind = 'water' | 'ocean' | 'bunker' | 'trees' | 'deeprough'
export type ZoneSide = 'left' | 'right' | 'cross' | 'green'

/** A hazard zone along the hole line. from/to are yards from the tee. */
export interface HazardZone {
  id: string
  kind: ZoneKind
  from: number
  to: number
  side: ZoneSide
}

export interface HoleLayout {
  spec: HoleSpec
  /** total playing length, yards from tee to pin */
  length: number
  zones: HazardZone[]
  /** where the fairway starts/ends (tee shots landing outside are rough) */
  fairwayFrom: number
  fairwayTo: number
  /** green depth in yards (front edge = length - greenDepth/2) */
  greenDepth: number
  /**
   * Cosmetic dogleg profile for OSM-imported holes: signed lateral deviation
   * (yards, >0 = golfer-left) of the real centreline from the straight tee→pin
   * chord, at evenly-spaced fractions (endpoints ~0). The map follows this to
   * bend the hole where it truly turns; the chip reads its direction. Map-only
   * — the odds work in 1-D and never see it, so it's not replay-affecting.
   */
  bend?: number[]
  /** today's flag on a par 3, when the round's conditions carry one */
  pin?: PinPosition
  /** this hole's wind delta (mph) on a par-3 short course, from Conditions.gusts */
  gust?: number
}

// ---------- Ball / stage state ----------

export type Lie =
  | 'tee'
  | 'dialed' // perfect fairway position
  | 'fairway'
  | 'rough'
  | 'sand'
  | 'trees' // punch-out territory
  | 'green'
  | 'fringe' // missed green, chippable

export type Stage = 'tee' | 'second' | 'approach' | 'putt' | 'shortgame' | 'done'

export interface BallState {
  /** yards from the tee along the hole line */
  pos: number
  lie: Lie
  /** which side of the line the ball favors, for rendering + short-side logic */
  side: 'left' | 'center' | 'right'
  /** feet from the hole, only meaningful on/around the green */
  puttFeet?: number
  /** when the ball sits in a hazard zone, the map anchors it to this zone */
  zoneId?: string
}

// ---------- Odds (the single source of truth) ----------

/** Long-game outcome buckets. Every entry is a probability in [0,1]; they sum to 1. */
export interface LongOdds {
  kind: 'long'
  /** landed in perfect position */
  dialed: number
  fairway: number
  rough: number
  /** non-penalty junk: trees/deep rough/sand, resolved via zone exposure */
  sand: number
  trees: number
  /** splash: penalty stroke + drop (0 unless a water/ocean zone is reachable) */
  water: number
}

export interface ApproachOdds {
  kind: 'approach'
  holeout: number
  kickin: number
  makeable: number
  lag: number
  /** missed green — subdivided by where it can actually miss */
  fringe: number
  sand: number
  water: number
}

export interface PuttOdds {
  kind: 'putt'
  one: number
  two: number
  three: number
}

export interface ShortOdds {
  kind: 'short'
  holeout: number
  updown: number
  twochip: number
  blowup: number
  disaster: number
  /** sand only: failed to escape — ball stays in the trap, hit it again */
  stillin: number
  /** sand only: caught it thin, flew the green to the opposite fringe */
  across: number
}

export type Odds = LongOdds | ApproachOdds | PuttOdds | ShortOdds

/** What the UI shows on a choice card, derived from Odds. */
export interface OddsSummary {
  good: number
  neutral: number
  bad: number
  /** probability of a penalty (water) on this choice, always geometry-honest */
  penalty: number
  headline: string
}

// ---------- Round ----------

export type HoleResult =
  | 'albatross'
  | 'eagle'
  | 'birdie'
  | 'par'
  | 'bogey'
  | 'double'
  | 'triple'

/** A moment where the round-long character measurably improved this shot's outcome. */
export interface CharacterAdvantage {
  id: CharacterId
  title: string
  note: string
  /** the honest edge, e.g. "+9% to find the short grass" */
  stat: string
}

export interface ShotRecord {
  stage: Stage
  choice: Choice
  /** bucket key that was rolled */
  outcome: string
  penalty: boolean
  /** odds snapshot for the recap, per choice */
  faced: Record<Choice, { summary: OddsSummary; odds: Odds }>
  /** ball position after the shot */
  after: BallState
  /** running stroke total after this shot (penalties included) — lets the recap
   * name a shot's scoring look honestly. Optional: rounds persisted before
   * this field existed won't have it, so readers must guard. */
  strokesAfter?: number
  /** set when the character's edge actually helped this outcome */
  advantage?: CharacterAdvantage
}

export interface HoleScore {
  strokes: number
  penalties: number
  result: HoleResult
  note: string
  shots: ShotRecord[]
}
