export type Choice = 'safe' | 'normal' | 'aggressive'

/** Round-long playstyle picked at the first tee. */
export type CharacterId = 'fairway' | 'dart' | 'greens'

export type Dogleg = 'L' | 'R' | 'S'

/** Hazard personality of a hole used by the generator. */
export type HazardStyle = 'none' | 'sand' | 'water' | 'ocean'

export type Greens = 'Slow' | 'Medium' | 'Firm' | 'Fast'

/**
 * How much the stuff off the fairway costs you — a course-level dial, the
 * rough's answer to `greens`. Gorse at Portrush, hay at a US Open setup: the
 * kind of course whose defense is what happens when you miss, not what you
 * have to carry.
 *
 * This is deliberately NOT a hazard zone. Gorse and penal rough surround a
 * links or Open course everywhere rather than sitting in mappable patches,
 * and OSM's scrub coverage is far too patchy to place them honestly (Dornoch
 * has 6 scrub polygons, Troon 7, Portrush none at all). A dial needs no
 * geometry, so it works on every course, imported or procedural.
 *
 * `normal` is the historical behaviour exactly — untagged courses are
 * unchanged, so adding this field alone is not replay-affecting. TAGGING a
 * course is: it moves that course's approach odds, so it needs an
 * ENGINE_VERSION bump and a `pnpm gen:ratings` in the same PR.
 */
export type Rough = 'normal' | 'penal' | 'severe'

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
  /** how punishing the miss is off the fairway (default 'normal'). */
  rough?: Rough
  /** what this course calls its penal rough, for chips and recap copy
   * ('gorse', 'hay', 'fescue'). Cosmetic — never read by the odds. */
  roughLabel?: string
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

/**
 * Optional drawing treatment for a zone whose real-world shape is famous
 * enough that a generic blob misreads the hole — currently just Oakmont's
 * Church Pews, the ladder of sand between the 3rd and 4th.
 *
 * PURE MAP FLAVOR: the odds engine never reads it, so it is not
 * replay-affecting and needs no ENGINE_VERSION bump — same contract as
 * `bend` and `landmark`. Reach for it only when a hole's signature copy
 * names a feature by name; otherwise the normal shapes are the house style.
 */
export type ZoneStyle = 'pews'

/** A hazard zone along the hole line. from/to are yards from the tee. */
export interface HazardZone {
  id: string
  kind: ZoneKind
  from: number
  to: number
  side: ZoneSide
  /** cosmetic drawing treatment — map only, never read by the odds */
  style?: ZoneStyle
}

/**
 * A par 3 you can decline to take on.
 *
 * Almost every par 3 in golf offers one shot: at the flag, more or less boldly.
 * A handful — Cypress Point's 16th is the archetype — offer two *lines*. The
 * fairway doglegs round a hazard to a bail-out you can lay up to and pitch
 * from; the shot at the flag cuts the corner and takes on far more of the
 * trouble. That is a real decision ("do I take this hole on at all?") that the
 * usual safe/normal/aggressive-at-the-flag axis cannot say.
 *
 * When a hole carries this, `safe` and `normal` become lay-ups to the two bands
 * below — the same shape as a par 5's second shot, which is why a bail-out par
 * 3 starts in the `second` stage — and only `aggressive` goes at the green.
 * The differing risk is ordinary geometry: the hazard runs down the inside of
 * the dogleg, so a lay-up pushed further up the fairway flirts with more of it,
 * and the shot at the flag is over it the whole way.
 */
export interface Bailout {
  /** which side of the dogleg the lay-up ground sits on — map only */
  side: 'left' | 'right'
  /** where a safe lay-up finishes: yards along the hole line */
  safe: [number, number]
  /** where an attacking lay-up finishes — further up, closer to the corner */
  normal: [number, number]
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
  /** the lay-up option on a par 3 that doglegs round its hazard. See `Bailout`. */
  bailout?: Bailout
  /** today's flag on a par 3, when the round's conditions carry one */
  pin?: PinPosition
  /** this hole's wind delta (mph) on a par-3 short course, from Conditions.gusts */
  gust?: number
  /** the course's rough severity, copied down by `buildLayout` so the odds
   * never need a course lookup. Absent = 'normal'. */
  rough?: Rough
  /** the course's name for its rough ('gorse'), for chips/recap copy only. */
  roughLabel?: string
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
