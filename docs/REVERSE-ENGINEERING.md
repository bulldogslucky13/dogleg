# Break Par (breakpar.xyz) — how it works under the hood

Findings from playing a round and reading the deobfuscated Next.js bundles
(`app/play/page-*.js`, chunk `8695-*.js`) on 2026-07-18 (Daily No. 24, Payne's Valley).

## Architecture

- Next.js app. Odds **display** is computed client-side from static tables; shot
  **resolution** happens server-side (`PATCH /api/round/:id/hole` with the decision list,
  server returns stage/lie/ballT/shots/outcome) from a daily seed.
- Course library is static data in the bundle: 18 holes ×
  `[par, yardage, strokeIndex, dogleg L|R|S, hazard none|sand|water|ocean, signature?]`.
  Real courses (Pebble Beach, St Andrews, Sawgrass, Payne's Valley…). Names/conditions
  (wind mph, greens Slow/Medium/Firm/Fast, difficulty 1-10) come from the server.
- Daily rotation: date in America/New_York, epoch 2026-06-25 (No. 1).
- The hole map is a **decorative seeded SVG** — hash of `par:yardage:SI:number:dogleg:hazard`
  drives procedural art. Ball placement is a scalar `ballT` mapped to visual states
  (line / rough / trouble / short / water). **No geometry exists in the model.**

## Round structure

- 18 holes, ~2-4 decisions per hole, one Safe/Normal/Aggressive choice per shot.
- Aggressive budget: **8 per round**, decremented only on tee/approach stages
  (putt "Charge" and short-game "Flop" are free).
- Stage machine:
  - Par 3: tee (approach-style) → green stage
  - Par 4: tee → approach → green stage
  - Par 5: tee → second (Safe/Normal = layup, Aggressive = go for green) → wedge → green
  - Green stage: putt decision (Lag/Roll it/Charge) if on green; short game
    (Punch/Chip/Flop) if missed — short game is terminal (includes implied putts).
  - Water/ocean: +1 penalty, drop, replay the stage. Can repeat (saw double-water = +2).

## Probability model (exact tables from the bundle)

Difficulty factor per hole: `m = clamp01(0.46·(1-(SI-1)/17) + 0.30·(difficulty-5)/5 + 0.13·(wind-10)/40 + 0.04·[par==3])`

**Tee** → {dialed, fairway, rough, trouble}, then renormalized to 100:

| choice | dialed | fairway | rough | trouble |
|---|---|---|---|---|
| safe | 8 | 64 | 25 | 3 |
| normal | 22 | 50 | 23 | 5 |
| aggressive | 44 | 31 | 16 | 9 |

Difficulty scaling: `dialed ×(1-0.55m)`, `fairway ×(1-0.12m)`, `rough ×(1+0.45m)`,
`trouble ×(1+(0.8+1.6·[aggressive])·m)`.

**Approach** by lie → {kickin, makeable, lag, scramble} (kickin = tap-in, makeable =
birdie look 6-18ft, lag = long putt 25-45ft, scramble = missed green). Base tables per
lie (tee/dialed/fairway/rough/trouble) × choice; difficulty scaling
`kickin ×(1-0.6m)`, `makeable ×(1-0.35m)`, `lag ×(1+0.3m)`,
`scramble ×(1+(0.7+1.2·[aggressive])·m)`. Par-5 third-shot wedge (after layup, non-agg)
gets bonus ×{kickin 1.5, makeable 1.25, lag 0.55, scramble 0.9}.

**Hole-out chances** (eagle/ace juice): par3 tee 0.03/0.06/0.1%, approach
0.02/0.05/0.12% (× lie multiplier tee 1 / dialed 1.5 / fairway 1 / rough 0.5 / trouble
0.15), par5 go-for-it 0/0/0.05%, layup wedge 0.12/0.18/0%, chip 1.5/3/5%.

**Putting** short (6-18ft, mid 12) / long (25-45ft, mid 35) → {one, two, three}:

| | safe (Lag) | normal (Roll it) | aggressive (Charge) |
|---|---|---|---|
| short | 16/82/2 | 27/70/3 | 37/55/8 |
| long | 4/83/9 | 7/77/13 | 12/60/28 |

Green speed multipliers on make/three-putt: Slow 0.85/0.8, Medium 1/1, Firm 1.1/1.2,
Fast 1.2/1.45. Distance slope: make ×(1-(ft-mid)·slope), three ×(1+(ft-mid)·slope).

**Short game** → {updown 33/38/48, twochip 59/45/30, blowup 7/14/17, disaster 1/3/5}
(safe/normal/aggressive = Punch/Chip/Flop), difficulty scaling on each bucket.

Scoring: outcome buckets map to strokes (updown = chip+1 putt, twochip = +1 more, etc.);
share squares 🟪🟦🟩⬜🟨🟧🟥 for albatross→triple+.

## Root causes of the two complaints

1. **"Safe doesn't minimize risk enough"** — Safe's trouble% scales with the same
   difficulty factor as Normal (×(1+0.8m)); on a hard hole (SI 1-4, windy, difficulty
   7+) m ≈ 0.6-0.9, so safe trouble ~5-6% and rough ~35%, while its "short grass" payoff
   converges to Normal's (65% vs 64% — the hole-1 recap literally showed a 1-point
   difference). Safe pays a real price in position but buys almost no safety.
2. **"Live tracker doesn't correlate"** — there is no ball geometry anywhere in the
   model. Odds are a pure function of (lie bucket, choice, difficulty); the map and the
   hazards on it are procedural art seeded from hole metadata. A ball sitting past the
   water can still "find water" because water is just a skin applied to the abstract
   `trouble` outcome, and displayed odds include hazards that are physically behind
   the ball.
