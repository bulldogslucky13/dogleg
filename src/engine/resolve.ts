import type {
  BallState,
  CharacterId,
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
import { approachAdvantage, longAdvantage, puttAdvantage } from './advantage'
import { approachOdds, longOdds, puttOdds, shortOdds, type ApproachMode, type FortuneShotOdds, type ZoneShare } from './odds'
import { playsAsGreensideSand } from './layout'

/** What a made putt scores relative to par — accounts for every stroke already
 * taken, penalties included. A "birdie look" is only a birdie look if holing out
 * from here would actually be a birdie. */
export type ScoreLook = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'worse'

/** `strokesTaken` = strokes already on the card (incl. penalties). A single made
 * putt adds one, so the hole would finish `strokesTaken + 1 - par` to par. */
export function madePuttLook(strokesTaken: number, par: number): ScoreLook {
  const diff = strokesTaken + 1 - par
  if (diff <= -2) return 'eagle'
  if (diff === -1) return 'birdie'
  if (diff === 0) return 'par'
  if (diff === 1) return 'bogey'
  if (diff === 2) return 'double'
  return 'worse'
}

/** Copy for each score look: `title` for the status card, `chip` for the map
 * HUD, `look` for the "% __ look" odds headline, `phrase` for the recap line. */
export const LOOK_LABEL: Record<ScoreLook, { title: string; chip: string; look: string; phrase: string }> = {
  eagle: { title: 'Eagle look', chip: 'Eagle putt', look: 'eagle look', phrase: 'an eagle look' },
  birdie: { title: 'Birdie look', chip: 'Birdie putt', look: 'birdie look', phrase: 'a birdie look' },
  par: { title: 'Par putt', chip: 'Par putt', look: 'par look', phrase: 'a par look' },
  bogey: { title: 'Bogey putt', chip: 'Bogey putt', look: 'bogey look', phrase: 'a bogey look' },
  double: { title: 'Double-bogey putt', chip: 'Double putt', look: 'double look', phrase: 'a double look' },
  worse: { title: 'Damage-control putt', chip: 'Long putt', look: 'scramble', phrase: 'a scramble' },
}

export interface HoleInPlay {
  layout: HoleLayout
  cond: Conditions
  /** round-long playstyle; shifts the odds the whole model sees */
  character?: CharacterId
  /** per-shot ace/albatross probability floors from the fortune counters */
  fortuneOdds?: FortuneShotOdds
  stage: Stage
  ball: BallState
  strokes: number
  penalties: number
  shots: ShotRecord[]
  /** live headline for the status card */
  status: { tone: 'good' | 'even' | 'bad'; title: string; note: string }
  score?: HoleScore
}

/** First-tee copy for a par 3's pin, or null when there's nothing to flag. */
export function pinTeeNote(pin: HoleLayout['pin']): string | null {
  if (!pin || pin.tier === 'middle') return null
  const side = pin.side === 'center' ? '' : ` ${pin.side}`
  if (pin.tier === 'tucked') return `Sucker pin, tucked${side || ' tight'} — hunt it or take the fat of the green.`
  return `Friendly flag${side} — green light.`
}

/** Which directions bite a greenside miss — feeds the pin-framing chip. */
function greensideTrouble(layout: HoleLayout): string[] {
  const L = layout.length
  const dirs = new Set<string>()
  for (const z of layout.zones) {
    if (z.kind === 'trees' || z.kind === 'deeprough') continue
    if (z.to < L - 30) continue // well short of the green: not a greenside miss
    if (z.side === 'left') dirs.add('left')
    else if (z.side === 'right') dirs.add('right')
    else if (z.side === 'cross') dirs.add(z.to > L + 2 ? 'behind' : 'short')
  }
  return [...dirs]
}

/**
 * The pin-framing chip: where today's flag sits and what a miss costs, in one
 * compact pill ("Sucker pin left · short-sided", "Pin · trouble all around").
 * "Short-sided" = the flag hides on the same side as the trouble, so the miss
 * you're most likely to make hunting it is the one with no green to work with.
 * Null when there's nothing worth saying (a plain middle pin, no trouble).
 */
export function pinChip(layout: HoleLayout): string | null {
  const pin = layout.pin
  if (!pin) return null
  const name = pin.tier === 'tucked' ? 'Sucker pin' : pin.tier === 'open' ? 'Friendly flag' : 'Pin'
  const side = pin.side === 'center' ? '' : ` ${pin.side}`
  const dirs = greensideTrouble(layout)
  let trouble = ''
  if (dirs.length >= 3) trouble = ' · trouble all around'
  else if (pin.side !== 'center' && dirs.includes(pin.side)) trouble = ' · short-sided'
  else if (dirs.length > 0) trouble = ` · trouble ${dirs.join(' & ')}`
  const label = `${name}${side}${trouble}`
  return label === 'Pin' ? null : label
}

export function startHole(
  layout: HoleLayout,
  cond: Conditions,
  character?: CharacterId,
  fortuneOdds?: FortuneShotOdds,
): HoleInPlay {
  return {
    layout,
    cond,
    character,
    fortuneOdds,
    // A bail-out par 3 poses a par 5's second-shot question from the tee — lay
    // up to the corner, or take the hazard on — so it starts in that stage and
    // reuses the whole layup/go branch. See `Bailout` in types.ts.
    stage: layout.spec.par === 3 ? (layout.bailout ? 'second' : 'approach') : 'tee',
    ball: { pos: 0, lie: 'tee', side: 'center' },
    strokes: 0,
    penalties: 0,
    shots: [],
    status: { tone: 'even', title: `Hole ${layout.spec.number}`, note: pinTeeNote(layout.pin) ?? 'Pick your line.' },
  }
}

/**
 * The attacking option out of the `second` stage. On a par 5 it's the go-for-it
 * second; on a bail-out par 3 it's still a tee shot at a par-3 flag, so it keeps
 * `par3tee` — that's what carries today's pin, the par-3 approach table, and the
 * ace odds. Declining the bail-out must never cost you the hole-in-one.
 *
 * Exported (not just used internally) so `grade.ts`'s post-round `detailFor`
 * can share this exact rule instead of re-deriving it — see `aceFiringChoice`
 * below for the same reasoning applied to destiny detection.
 */
export function secondGoMode(par: number): ApproachMode {
  return par === 3 ? 'par3tee' : 'go'
}

/**
 * Can `choice` possibly hole out for the ace on a par-3 tee shot? True for
 * every choice on an ordinary par 3. A bail-out par 3 is the exception: laying
 * up cannot possibly finish in the cup, so it must not CONSUME a due destiny
 * either — spending the guarantee on a shot that can't fire it would silently
 * break the promise fortune.ts makes.
 *
 * Exported so `grade.ts`'s own destiny-attribution pass (a 5th site, alongside
 * store/replay/replayFrames below) can gate on the identical rule instead of
 * re-deriving it — see `aceEligible`, which wraps this for the live-play sites
 * that have a full `HoleInPlay` to hand.
 */
export function aceFiringChoice(bailout: HoleLayout['bailout'], choice: Choice): boolean {
  return bailout ? choice === 'aggressive' : true
}

/**
 * Can THIS shot hole out for an ace? Every destiny site (store, replay,
 * replayFrames, grade) gates on this or on `aceFiringChoice` directly.
 */
export function aceEligible(h: HoleInPlay, choice: Choice): boolean {
  if (h.layout.spec.par !== 3 || h.ball.lie !== 'tee') return false
  return aceFiringChoice(h.layout.bailout, choice)
}

/**
 * Where a water penalty puts the ball, for BOTH the long game and the approach.
 *
 * Exported for the same reason `secondGoMode` is: grade.ts values this drop
 * when it prices the `water` bucket, and if the two formulas drift the model
 * prices a drop the player never gets, which the telescoping identity reports
 * as luck. One function, every caller.
 *
 * - **cross** — drop short of the hazard you had to carry (the yellow-stake
 *   line-of-flight option), never behind where you played from.
 * - **lateral** — drop at the middle of the stretch of that lake the shot could
 *   actually have reached: the honest proxy for where the ball crossed the
 *   margin, and what red-stake relief actually is. Uses the same clamped span
 *   the sand branch samples (`from` pushed ahead of the ball, `to` as-is).
 * - **no zone** — nothing mapped won the roll; keep the historical fallback.
 *
 * THE LATERAL BRANCH IS THE FIX. Both stages used to ignore the zone the roll
 * had just chosen: the approach dropped at a fixed `length - 44`, the tee shot
 * at `max(ballPos + 40, windowMid * 0.8)`. Laterals are ~80% of water outcomes,
 * and the lake named by the roll sat on average 47 yd (approach) and 39 yd
 * (long) away from where the ball was actually placed — more than 40 yd away a
 * third of the time. The tee-shot version at least scaled with the drive; the
 * approach's constant was related to nothing at all.
 *
 * `floor` is deliberately kept, and it makes the change strongly asymmetric: on
 * approaches the drop moves BACK 16.7 yd on average and forward only 3.2,
 * because a lake 150 yd short stops advancing you to wedge range while a lake
 * beside the green is already against the floor. Not perfectly one-way though —
 * where a lateral lake's reachable middle sits past the old fixed point, the
 * floor lets the drop come up to 9 yd FORWARD of where it used to be. That is
 * the honest answer for water you cross right at the green, and it is bounded.
 *
 * The per-stage constants stay at the call sites (`WATER_DROP_LONG` /
 * `WATER_DROP_APPROACH`) because they encode genuinely different things: a tee
 * shot has to travel before it can find anything, an approach does not.
 */
export interface WaterDropRule {
  /** how far short of a `cross` hazard the drop sits */
  crossBack: number
  /** the drop must advance at least this far past where the shot was played */
  minAdvance: number
  /** fallback when nothing mapped won the roll */
  noZone: (length: number, windowMid: number, ballPos: number) => number
  /** never drop nearer the hole than `length - floor` */
  floor: number
}

export const WATER_DROP_LONG: WaterDropRule = {
  crossBack: 8,
  minAdvance: 30,
  noZone: (_l, mid, ballPos) => Math.max(ballPos + 40, mid * 0.8),
  floor: 30,
}

export const WATER_DROP_APPROACH: WaterDropRule = {
  crossBack: 10,
  minAdvance: 0,
  noZone: (l) => l - 44,
  floor: 35,
}

export function waterDropPos(
  zone: HazardZone | null,
  ballPos: number,
  length: number,
  rule: WaterDropRule,
  windowMid = 0,
): number {
  let raw: number
  if (!zone) raw = rule.noZone(length, windowMid, ballPos)
  else if (zone.side === 'cross') raw = Math.max(ballPos + rule.minAdvance, zone.from - rule.crossBack)
  else {
    const lo = Math.max(zone.from, ballPos + Math.max(rule.minAdvance, 6))
    const hi = Math.max(lo, zone.to)
    raw = (lo + hi) / 2
  }
  // The floor must never walk the ball BACKWARDS, which it could when the shot
  // was played from nearer the green than the floor itself — a latent bug older
  // than this change and worse before it (whistling-straits:7, ball at 188 on a
  // 221-yд par 3, dropped at 177 under the old fixed formula and 186 under the
  // floor alone). A penalty costs a stroke; it does not also march you back down
  // the hole.
  return Math.max(Math.min(raw, length - rule.floor), ballPos)
}

/**
 * Which side of the hole a water drop sits on: the side of the lake you went
 * into, because red-stake relief is taken beside the crossing point. A `cross`
 * hazard spans the line and has no side to inherit, so those stay centre.
 *
 * Paired with `waterDropPos` for the same reason it exists: the tee shot has
 * always propagated this and the approach always hard-coded `center`, which
 * mattered little while the drop was a fixed distance unrelated to the lake,
 * and matters now that it lands beside it — `HoleMap` positions an unanchored
 * ball off `BallState.side`, so a centre drop is drawn in the middle of the
 * fairway after a penalty taken down the left. Drawing only: `ball.side` is
 * never read by odds.ts or layout.ts, and no roll depends on it.
 */
export function waterDropSide(zone: HazardZone | null): BallState['side'] {
  return zone?.side === 'left' ? 'left' : zone?.side === 'right' ? 'right' : 'center'
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
      return longOdds(h.layout, h.cond, h.ball, choice, 'tee', h.character).odds
    case 'second':
      return choice === 'aggressive'
        ? approachOdds(h.layout, h.cond, h.ball, choice, secondGoMode(h.layout.spec.par), h.character, h.fortuneOdds).odds
        : longOdds(h.layout, h.cond, h.ball, choice, 'layup', h.character).odds
    case 'approach':
      return approachOdds(h.layout, h.cond, h.ball, choice, approachMode(h), h.character, h.fortuneOdds).odds
    case 'putt':
      return puttOdds(h.cond, h.ball.puttFeet ?? 20, choice, h.character)
    case 'shortgame':
      return shortOdds(h.layout, h.cond, h.ball, choice)
    default:
      throw new Error(`no odds for stage ${h.stage}`)
  }
}

/** `ctx` carries the strokes-so-far and par so an approach headline can name the
 * look honestly — a drop after a penalty is a bogey look, not a birdie look. */
export function summarize(odds: Odds, ctx?: { strokes: number; par: number }): OddsSummary {
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
      // the "look" is what a make would score: land the approach (strokes + 1),
      // then hole the putt — so name it off strokes + 1.
      const look = ctx ? LOOK_LABEL[madePuttLook(ctx.strokes + 1, ctx.par)].look : 'birdie look'
      return {
        good,
        neutral: odds.lag,
        bad,
        penalty: odds.water,
        headline: `${Math.round(good * 100)}% ${look}`,
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
    return { summary: summarize(o, { strokes: h.strokes, par: h.layout.spec.par }), odds: o }
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
export function playShot(h: HoleInPlay, choice: Choice, rng: Rng, destiny?: 'ace' | 'albatross'): HoleInPlay {
  const faced = facedAll(h)
  const L = h.layout.length
  const spec = h.layout.spec
  // capture the lie/position before the shot mutates it — advantage detection
  // re-scores this exact shot with and without the character
  const preBall: BallState = { ...h.ball }

  switch (h.stage) {
    case 'tee':
    case 'second': {
      if (h.stage === 'second' && choice === 'aggressive') {
        resolveApproach(h, choice, rng, faced, secondGoMode(h.layout.spec.par), destiny)
        return h
      }
      const mode = h.stage === 'tee' ? 'tee' : 'layup'
      const detail = longOdds(h.layout, h.cond, h.ball, choice, mode, h.character)
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
        // Same rule as the approach drop — see `waterDropPos`. The tee shot's
        // lateral case had the identical flaw: it ignored the lake the roll
        // named and dropped at a fraction of the drive window instead.
        after = {
          pos: waterDropPos(zone, h.ball.pos, L, WATER_DROP_LONG, mid),
          lie: 'rough',
          side: waterDropSide(zone),
        }
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

      // A lay-up to a bail-out finishes on the bail-out's side of the dogleg —
      // that's the whole point of the shot, and both the map and the short-side
      // logic downstream read it. Grass outcomes only: the rough branch would
      // otherwise flip a coin and strand the ball on the hazard side (at
      // Cypress 16 that side is the Pacific), while sand/trees legitimately
      // take their side from the zone the ball actually found.
      const bail = h.layout.bailout
      const onGrass = bucket === 'dialed' || bucket === 'fairway' || bucket === 'rough'
      if (bail && mode === 'layup' && onGrass) after.side = bail.side

      h.ball = after
      const advantage = h.stage === 'tee' ? (longAdvantage(h.layout, h.cond, preBall, choice, h.character, bucket) ?? undefined) : undefined
      h.shots.push({ stage: h.stage, choice, outcome: bucket, penalty, faced, after, advantage, strokesAfter: h.strokes })
      h.stage = spec.par === 5 && h.stage === 'tee' ? 'second' : 'approach'
      h.status = teeStatus(bucket, penalty, h.layout.junkLabel)
      return h
    }

    case 'approach': {
      resolveApproach(h, choice, rng, faced, approachMode(h), destiny)
      return h
    }

    case 'putt': {
      const o = puttOdds(h.cond, h.ball.puttFeet ?? 20, choice, h.character)
      const bucket = pickWeighted(rng, { one: o.one, two: o.two, three: o.three })
      const putts = bucket === 'one' ? 1 : bucket === 'two' ? 2 : 3
      h.strokes += putts
      const feet = h.ball.puttFeet ?? 20
      h.ball = { ...h.ball, pos: L, lie: 'green', puttFeet: 0 }
      // draining a putt only earns the Greens Keeper callout when the make is a birdie or eagle
      const putForBirdie = h.strokes - h.layout.spec.par <= -1
      const puttAdv = putForBirdie ? (puttAdvantage(h.cond, feet, choice, h.character, bucket) ?? undefined) : undefined
      h.shots.push({ stage: 'putt', choice, outcome: bucket, penalty: false, faced, after: h.ball, advantage: puttAdv, strokesAfter: h.strokes })
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
        h.shots.push({ stage: 'shortgame', choice, outcome: bucket, penalty: false, faced, after: h.ball, strokesAfter: h.strokes })
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
        h.shots.push({ stage: 'shortgame', choice, outcome: bucket, penalty: false, faced, after: h.ball, strokesAfter: h.strokes })
        h.status = { tone: 'bad', title: 'Across the green', note: 'Thinned it — long side now, chip coming back.' }
        return h
      }

      const add = bucket === 'holeout' ? 1 : bucket === 'updown' ? 2 : bucket === 'twochip' ? 3 : bucket === 'blowup' ? 4 : 5
      h.strokes += add
      h.ball = { pos: L, lie: 'green', side: 'center', puttFeet: 0 }
      h.shots.push({ stage: 'shortgame', choice, outcome: bucket, penalty: false, faced, after: h.ball, strokesAfter: h.strokes })
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

function teeStatus(bucket: string, penalty: boolean, junkLabel = 'trees'): HoleInPlay['status'] {
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
      // The `trees` bucket is also where the odds' junk floor lands, so on a
      // course with no trees this has to say what IS out there — Seminole's
      // scrub, Portrush's gorse. `junkLabel` is resolved onto the layout by
      // buildLayout; you can only punch out of something with branches.
      return {
        tone: 'bad',
        title: `In the ${junkLabel}`,
        note: junkLabel === 'trees' ? 'Scrambling — punch out or gamble?' : 'Scrambling — hack it out or gamble?',
      }
  }
}

function resolveApproach(
  h: HoleInPlay,
  choice: Choice,
  rng: Rng,
  faced: Record<Choice, { summary: OddsSummary; odds: Odds }>,
  mode: ApproachMode,
  destiny?: 'ace' | 'albatross',
): void {
  const L = h.layout.length
  const preBall: BallState = { ...h.ball }
  const detail = approachOdds(h.layout, h.cond, h.ball, choice, mode, h.character, h.fortuneOdds)
  const o = detail.odds
  let bucket = pickWeighted(rng, {
    holeout: o.holeout,
    kickin: o.kickin,
    makeable: o.makeable,
    lag: o.lag,
    fringe: o.fringe,
    sand: o.sand,
    water: o.water,
  })
  // destiny consumed the same roll a normal shot would, then overrides it —
  // the game's one sanctioned exception to the displayed odds (see fortune.ts)
  if (destiny === 'ace' && mode === 'par3tee') bucket = 'holeout'
  if (destiny === 'albatross' && mode === 'go') bucket = 'holeout'
  h.strokes += 1
  const stageWas = h.stage
  const destinyFired = bucket === 'holeout' && destiny !== undefined
  // a destined shot is fate, not skill — no character-advantage callout for it
  const advantage = destinyFired
    ? undefined
    : (approachAdvantage(h.layout, h.cond, preBall, choice, mode, h.character, bucket) ?? undefined)
  let penalty = false

  // the Dart Thrower callout only lands when the result is actually birdie-or-better
  const scoringAdvantage = (final: number) => (final - h.layout.spec.par <= -1 ? advantage : undefined)
  if (bucket === 'holeout') {
    h.ball = { pos: L, lie: 'green', side: 'center', puttFeet: 0 }
    h.shots.push({ stage: stageWas, choice, outcome: bucket, penalty, faced, after: h.ball, advantage: scoringAdvantage(h.strokes), strokesAfter: h.strokes })
    finish(h, h.strokes === 1 ? 'ACE. Buy the bar a round.' : 'Holed it from the fairway — pandemonium')
    return
  }
  if (bucket === 'kickin') {
    h.strokes += 1 // tap-in
    h.ball = { pos: L, lie: 'green', side: 'center', puttFeet: 0 }
    h.shots.push({ stage: stageWas, choice, outcome: bucket, penalty, faced, after: h.ball, advantage: scoringAdvantage(h.strokes), strokesAfter: h.strokes })
    finish(h, 'Stuffed it — kick-in range')
    return
  }
  if (bucket === 'makeable' || bucket === 'lag') {
    // Pin-aware distance on par-3 tees: your putt length is measured to the
    // FLAG, and your aim decided how close you tried to land. Safe plays the
    // fat middle, so a tucked pin leaves it longer looks; an open pin is
    // reachable even playing safe. Constant shifts only — no extra rolls, so
    // replay determinism is untouched.
    const pin = mode === 'par3tee' ? h.layout.pin : undefined
    const pinFeet =
      pin?.tier === 'tucked'
        ? choice === 'safe'
          ? 5
          : choice === 'normal'
            ? 2
            : 0
        : pin?.tier === 'open'
          ? choice === 'safe'
            ? -2
            : -1
          : 0
    const feet = Math.max(
      3,
      (bucket === 'makeable'
        ? Math.round(5 + rng() * (choice === 'aggressive' ? 8 : 13))
        : Math.round(24 + rng() * (choice === 'safe' ? 22 : 32))) + pinFeet,
    )
    h.ball = { pos: L, lie: 'green', side: 'center', puttFeet: feet }
    h.stage = 'putt'
    // name the look off what a make actually scores, penalties included
    const look = madePuttLook(h.strokes, h.layout.spec.par)
    h.status =
      bucket === 'makeable'
        ? { tone: look === 'birdie' || look === 'eagle' ? 'good' : 'even', title: LOOK_LABEL[look].title, note: `${feet} feet — on the dance floor.` }
        : { tone: 'even', title: 'Long putt', note: `${feet} feet — lag it close.` }
    // the "stuck it to birdie range" edge only earns a callout when it's truly a birdie look or better
    const stuckAdvantage = look === 'birdie' || look === 'eagle' ? advantage : undefined
    h.shots.push({ stage: stageWas, choice, outcome: bucket, penalty, faced, after: h.ball, advantage: stuckAdvantage, strokesAfter: h.strokes })
    return
  }
  if (bucket === 'water') {
    penalty = true
    h.penalties += 1
    h.strokes += 1
    // YOU DROP WHERE YOU WENT IN — the same rule the sand branch below now
    // follows, for the same reason. A CROSS hazard has always used the zone the
    // roll picked (drop short of it, which is the yellow-stake option). A
    // LATERAL one ignored it completely and dropped at a fixed `L - 44`, and
    // laterals are 80% of approach-water outcomes: the lake the roll named
    // averaged 47 yd from where the ball was actually put, and a third of the
    // time it was more than 40 yd away. Worse, it was generous in the wrong
    // direction — find a lake 150 yd short and you were advanced to 44 yd out,
    // where golf's red-stake relief is a drop back at the crossing.
    //
    // So a lateral drop is now the middle of the stretch of that lake the shot
    // could actually have reached, which is the honest proxy for where the ball
    // crossed the margin. Same clamped span the sand branch samples, so the two
    // hazards agree about what "the zone the roll chose" means.
    const zone = pickZone(detail.missShares, 'water', rng)
    h.ball = { pos: waterDropPos(zone, h.ball.pos, L, WATER_DROP_APPROACH), lie: 'fairway', side: waterDropSide(zone) }
    h.stage = 'approach'
    h.status = { tone: 'bad', title: 'In the water', note: 'One-stroke penalty — playing from the drop.' }
    h.shots.push({ stage: stageWas, choice, outcome: bucket, penalty, faced, after: h.ball, strokesAfter: h.strokes })
    return
  }
  // fringe / sand: greenside scramble.
  //
  // Deliberately NOT routed into deep rough here, though it was tempting: a
  // `fringe` outcome that secretly played from a `trees` lie would make the
  // displayed odds lie about what the miss costs, and the grade model caught
  // it immediately (meanDiff 1.32 against a 0.7 ceiling — actual strokes
  // drifting above expected-best, which is the telescoping identity detecting
  // a hidden penalty). "The odds never lie" has exactly one sanctioned
  // exception and this isn't it. Deep rough's cost is priced where the player
  // can see it: fewer greens hit, scaled by distance (see JUNK_MAX_BITE).
  const zone = bucket === 'sand' ? pickZone(detail.missShares, 'sand', rng) : null
  // THE BALL FINISHES IN THE BUNKER THE ROLL CHOSE — the same rule the tee shot
  // has always followed (see the `sand` branch of resolveLong, which puts the
  // ball at the middle of the zone it found and lets the next shot be an
  // approach from sand). This path used to pick a zone and then ignore it,
  // pinning the ball greenside at `L - 8 - rng()*18` whatever it had picked and
  // always entering the short game. That made three things disagree at once:
  // the share pick, the yardage, and the sprite.
  //
  // It mattered because `shortOdds` never reads `ball.pos` — it is a greenside
  // table by construction — so a ball "in" a fairway bunker 96 yd out was being
  // splashed out with a 24% up-and-down. And the displayed sand% counted those
  // far bunkers while every one of them played as a greenside splash.
  //
  // Now: land in the zone, in its middle half so the lie has some variety, and
  // let `isGreenside` — the SAME predicate the odds use to weight a bunker as
  // one that guards the green — decide whether this is a splash or a swing.
  // The two models cannot disagree about what a sand miss meant, because they
  // now consult the same one. Dispersion weighting (see `approachFocus` in
  // odds.ts) is what makes this safe: without it, landing in the zone the roll
  // chose would strand players in far bunkers far too often.
  // A zone only has to END ahead of the ball to be reachable, so its near edge
  // can lie behind where we are playing from — sampling the whole span could
  // walk the ball BACKWARDS, or leave it close enough to find the same bunker
  // again next shot. Sample only the part that is genuinely ahead.
  // The zone must also have room AHEAD of the ball to land in. A zone whose far
  // edge is only a yard or two past us is "reachable" by the odds' rule but has
  // nowhere to put the ball, and clamping into it would leave the ball outside
  // the bunker it claims — the fallback below then handles it as an ordinary
  // greenside miss.
  const inZone = bucket === 'sand' && zone && zone.to > preBall.pos + 6 ? zone : null
  const lo = inZone ? Math.max(inZone.from, preBall.pos + 6) : 0
  const hi = inZone ? inZone.to : 0
  const pos = inZone
    ? Math.min(lo + (hi - lo) * (0.25 + rng() * 0.5), L - 5)
    : Math.min(L - 8 - rng() * 18, L - 5)
  // A zone the ball is genuinely inside always anchors the sprite, so HoleMap
  // never falls through to its "greenside but unmapped" placement for sand —
  // that fallback drew the ball on bare grass beside the green under a
  // "Greenside bunker" banner whenever the winning zone sat elsewhere. The
  // containment re-check is belt and braces for the clamp above: if pushing the
  // ball ahead of the tee shot carried it out of the bunker, it is not in that
  // bunker and must not claim it.
  const anchored = inZone && pos >= inZone.from && pos <= inZone.to ? inZone : null
  h.ball = {
    pos,
    lie: bucket === 'sand' ? 'sand' : 'fringe',
    side: zone && zone.side !== 'cross' && zone.side !== 'green' ? zone.side : rng() < 0.5 ? 'left' : 'right',
    zoneId: anchored?.id,
  }
  const greenside = !anchored || playsAsGreensideSand(anchored, pos, L, h.layout.greenDepth)
  h.stage = greenside ? 'shortgame' : 'approach'
  h.status = greenside
    ? bucket === 'sand'
      ? { tone: 'bad', title: 'Greenside bunker', note: 'Splash it out — save the par.' }
      : { tone: 'bad', title: 'Missed the green', note: 'Short-game test — get it up and down.' }
    : // Deliberately NOT "fairway bunker": this branch is every bunker the
      // green isn't guarded by, which includes a long waste bunker sitting 26
      // yards from the flag. "In the sand" is true of all of them, and the
      // yardage says the rest.
      { tone: 'bad', title: 'In the sand', note: `${Math.round(L - pos)} yards to go — pick it clean.` }
  h.shots.push({ stage: stageWas, choice, outcome: bucket, penalty, faced, after: h.ball, strokesAfter: h.strokes })
}
