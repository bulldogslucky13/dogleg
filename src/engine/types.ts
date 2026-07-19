export type Choice = 'safe' | 'normal' | 'aggressive'

/** Round-long playstyle picked at the first tee. */
export type CharacterId = 'fairway' | 'dart' | 'greens'

export type Dogleg = 'L' | 'R' | 'S'

/** Hazard personality of a hole used by the generator. */
export type HazardStyle = 'none' | 'sand' | 'water' | 'ocean'

export type Greens = 'Slow' | 'Medium' | 'Firm' | 'Fast'

export interface HoleSpec {
  number: number
  par: 3 | 4 | 5
  yards: number
  /** 1 = hardest hole on the course, 18 = easiest */
  strokeIndex: number
  dogleg: Dogleg
  hazard: HazardStyle
  signature?: string
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
}

export interface Conditions {
  wind: number
  greens: Greens
  difficulty: number
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
   * name a shot's scoring look honestly */
  strokesAfter: number
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
