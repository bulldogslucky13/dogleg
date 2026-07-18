# Dogleg — game design

A from-scratch daily golf strategy game inspired by breakpar.xyz (see
REVERSE-ENGINEERING.md for the study of the original). Static Vite + React +
TypeScript app, pnpm.
No backend: daily seed derived from the date; round state persisted to localStorage so
outcomes can't be re-rolled by refreshing.

## What we keep from the original

- One daily course, 18 holes, ~2-4 one-tap decisions per hole, Safe/Normal/Aggressive
  cadence (Lag/Roll/Charge on greens, Punch/Chip/Flop around them).
- Aggressive budget (8/round, tee & approach only), stroke-index-driven difficulty,
- wind/green-speed conditions, post-hole odds recap, emoji share grid, streaks.
- Baseline probability tables (they're well tuned) — as the *starting point*.

## Fix 1 — geometry is the model (tracker complaint)

Each hole is generated (seeded by course+hole) as a 1.5-D layout: a centerline from tee
(0y) to pin (Ly), with **hazard zones** `{kind, from, to, side}` (water/ocean/bunker/
trees/OB; side left/right/cross/green-ring) plus fairway width class. The SVG map renders
exactly these zones to scale; the ball's true position (yards from tee, lateral hint) is
tracked and rendered after every shot.

Every shot has a **landing window** (target carry ± dispersion, wider for aggressive,
biased toward the hazard side when "challenging the trouble"). Hazard exposure =
overlap(landing window, zone), 0 when the zone is behind the ball or beyond reach.
The `trouble`/`scramble` buckets are *composed from* exposures:

- No reachable hazard → trouble mass shrinks (most redistributes to rough).
- Water reachable → that share of trouble is a penalty outcome (drop at zone edge).
- Bunker reachable → sand lie; trees → punch-out lie.

The pre-shot odds bars, the post-hole recap, the map preview cone, and the resolver all
read the same `computeOdds(state, choice)` — one source of truth, so displayed odds are
always consistent with the ball's actual position. If the water is behind you, its
exposure is 0 and it cannot appear in the odds or the outcome.

## Fix 2 — Safe is bankable (risk complaint)

- Safe's trouble/penalty buckets **do not scale with difficulty**. Difficulty degrades
  safe outcomes positionally (dialed→fairway→rough), never into blow-ups. Cap: safe
  trouble ≤ base (3%), ≈0-1% when no hazard is in the safe landing window.
- Safe aims away from hazards: its landing window is placed short of cross hazards and
  center-away from side hazards (exposure multiplier ~0.25); aggressive hugs the hazard
  line (×1.5).
- Lag putts cap three-putt risk at ~8% even long+fast; Charge owns the 3-putt risk.
- Punch short game: blow-up ≤2% always.
- Cost preserved: Safe rarely produces birdie looks (kick-in/dialed rates stay low, or
  drop further with difficulty), so the aggressive-budget tension survives.

Calibration (Monte Carlo in vitest): all-safe policy ≈ +2..+6 over a round, sensible
mixed policy breaks par ~25-35% of days, all-aggressive is high-variance (occasional -5,
frequent +8). Safe blow-up (double+) rate < 5% of holes.

## UX improvements

- **Live odds before choosing**: each choice card shows a stacked bar
  (good/rough/trouble+penalty) plus the headline number that matters for the stage
  (birdie-look %, save %, 3-putt %). Selecting a card previews its landing window on the
  map; "Hit it" commits. (Original hides odds until after the hole.)
- Hazard chips are positional: "Water carry 215y — clears on Aggressive only",
  "Greenside bunker right".
- Mobile-first: map top (~55vh), controls in thumb zone, 100dvh layout, no scroll during
  play, tap targets ≥44px.

## Content

Original fictional course library (6 courses, distinct hazard personalities) — no real
course names or data copied. Daily rotation by date (local date), conditions seeded per
day. Practice mode: play any course, doesn't touch streaks.

### Getting real course data later

Two viable sources if we want real layouts instead of procedural ones:

1. **Public scorecards** (par / yardage / stroke index are uncopyrightable facts) —
   hand-transcribe famous courses into `courses.ts` rows. Cheap; hazards stay procedural.
2. **OpenStreetMap golf tagging** — thousands of courses have real polygons tagged
   `golf=fairway/bunker/green/water_hazard/tee`. An offline script could project each
   hole's polygons onto its tee→green centerline and emit our `HazardZone {from, to,
   side}` format directly. That would make maps *and* odds match the real course.
   Best done as a build-time importer, not a runtime dependency.

## Sand traps

Lie truth: a ball in a bunker is anchored to that bunker zone on the map (`BallState.zoneId`)
and the status says so. Fairway bunkers use an approach row close to rough (clean escape
is normal; the tax is distance control). Greenside bunkers are their own short-game table:
normative outcome is out-and-on (updown/twochip), with `stillin` (failed escape — stroke
and repeat, capped at 4% for the blast-out) and rare `across` (thinned over the green to
the opposite fringe, ≤1% safe / ~5-8% flop). Tests pin all of these.

## Modules

- `src/engine/rng.ts` — fnv1a hash + mulberry32 streams
- `src/engine/types.ts` — shared types
- `src/engine/courses.ts` — course specs
- `src/engine/layout.ts` — hole spec → geometric layout (zones, carries, green)
- `src/engine/odds.ts` — computeOdds(ballState, choice): buckets + hazard split, all
  geometry-gated; pure
- `src/engine/resolve.ts` — sample from computeOdds with the round's RNG stream; stage
  machine; scoring
- `src/engine/daily.ts` — date → course + conditions + seed; share text
- `src/state/` — reducer + localStorage persistence (round, history, streaks)
- `src/ui/` — HoleMap (SVG from layout), GreenView, ChoiceCards, OddsRecap, Scorecard,
  Result, Home
