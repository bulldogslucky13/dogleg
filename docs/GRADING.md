# Grading: decision quality vs. luck

`src/engine/grade.ts` turns a finished round into two honest numbers instead
of one score. `pnpm test` / `src/engine/grade.test.ts` is the harness that
keeps the model honest; this doc explains what it's checking and why.

## 1. The two numbers

A round's `actualToPar` is one number pretending to answer two different
questions: *did you play well* and *did the course treat you well*. Grading
splits it:

- **decisionLoss** — strokes left on the table by not picking the move the
  model likes best, at each decision, given what you actually saw on screen.
  Always ≥ 0. Zero means every pick matched the model's own favorite.
- **luck** — how the *outcome* compared to what your choice was worth on
  average. Negative is lucky (kind bounces), positive is unlucky (lip-outs).
- **destinyBonus** — the ace/albatross guarantee (see `fortune.ts`) pulled
  out of luck into its own bucket, since a manufactured miracle isn't "you
  read the greens well" or "you got a lucky bounce."

`gradeCopy(g)` turns these into the player-facing framing: *"You shot +2, but
you decided like a −1 player."* — the headline uses `skillToPar` (actual
minus luck minus destiny), i.e. the score you'd expect if the dice had been
average. `decisionLine`/`luckLine` are picked from fixed buckets on
`decisionLoss`/`luck` (see the doc comment in `grade.ts` for the exact
breakpoints) — never a computed sentence, so voice stays consistent and the
project's dice-ban rule (`/dice/i` — see `luckLine` in `gradeCopy`) is
trivially enforceable by grepping the fixed strings once.

## 2. The model: Q, V, and one step of real odds

Every decision is a state `s` (stage + ball position/lie) and a choice
`c ∈ {safe, normal, aggressive}`. Two functions:

- `Q(s, c)` = expected strokes to finish the hole from `s`, taking `c` now
  and playing optimally after. One bucket-weighted step (Δ = strokes this
  swing adds, including penalties) plus the continuation value of whatever
  the swing leaves behind: `Q(s,c) = Σ_bucket P_c(bucket) · [Δ(bucket) +
  V(nextState(bucket, c))]`.
- `V(s)` = `min` over the choices actually available of `Q(s,c)`, and `0`
  once the ball's holed out.

**Step one is honest, not recomputed.** `P_c(bucket)` for the real decision
being graded comes from `ShotRecord.faced[c].odds` — the exact odds the
player saw on the choice card, character buffs and fortune floors included.
Only the *resulting-state geometry* (drive windows, hazard-zone shares used
to place the ball after a miss) is recomputed fresh from `longOdds`/
`approachOdds` on the reconstructed before-state — that's honest physics, not
something the UI ever displayed as a probability.

**Continuation is the real engine, replayed without dice.** Every level below
the first is recomputed from scratch by calling the actual `longOdds` /
`approachOdds` / `puttOdds` / `shortOdds` functions — the same functions
`resolve.ts` rolls against — so the model can never drift from the game it's
grading. Positions after a bucket are the *mean* of `resolve.ts`'s landing
formula (jitter fixed at its expected value: 0), except:

- **dialed/fairway/rough** (tee & layup): the mean-position approximation
  systematically underestimates difficulty, because downstream approach odds
  are non-linear in distance (the wedge cutoff, the distance taper) — a
  textbook Jensen's-inequality gap. These are integrated over the real jitter
  spread with 5-point Gauss–Legendre quadrature instead of collapsed to one
  point.
- **sand / trees / water** (tee, layup, and approach misses): which hazard
  zone the ball actually lands behind changes the drop formula (cross zones
  drop differently than side zones), so these are exact probability-weighted
  mixtures over `zoneShares`/`missShares` — never collapsed to a single
  "average" zone.
- **approach makeable/lag**: the resulting putt distance is uniform over a
  real range (`resolve.ts`'s `5 + rng()*span` / `24 + rng()*span`); integrated
  with the same 5-point quadrature. Every such range stays within a single
  `PUTT_BASE` band (short ≤20ft / long >20ft), so there's no discontinuity to
  worry about mid-integral.
- **putt**: closed form, `V = 1·one + 2·two + 3·three` — every outcome is
  terminal, no continuation needed.
- **non-sand short game**: closed form via the strokes map (`holeout=1,
  updown=2, twochip=3, blowup=4, disaster=5`) — also all-terminal.
- **greenside sand**: `stillin` loops back into the *same* decision and
  `across` kicks out to the fringe, so `V_sand` is a genuine fixed point:
  `V_sand = min_c [Σ p_k·k + stillin·(1+V_sand) + across·(1+V_fringe)]`,
  solved with 30 rounds of value iteration (shortOdds doesn't depend on
  position, only lie/conditions/choice, so this is one number per hole and
  converges essentially immediately).
- **water loops** (an approach miss that lands back in the same water,
  possible when the drop is placed just short of a cross hazard): capped at
  recursion depth 3. Beyond the cap, the model treats the drop as a plain
  missed green rather than chasing a vanishingly small probability tail to
  true convergence — the loop's mass shrinks geometrically, so the truncation
  error is negligible. Documented here rather than hidden. Note the cap
  applies to the approach-stage self-loop only; a long-game (tee/layup) water
  splash re-enters the model as a fresh state and is bounded by the global
  recursion depth guard instead — a coarser but still finite truncation,
  intentional since repeated tee-shot splashes carry vanishing probability.

**Budget is real only where it's real.** The aggressive-shot budget
(`AGGRESSIVE_BUDGET = 8`, spent on `tee`/`second`/`approach` choices, see
`replay.ts`) is threaded across the whole round in actual play order. At the
*real* decision being graded, if the budget is already exhausted, `V(s_i)`
and `bestChoice` are computed over `{safe, normal}` only — the player
genuinely couldn't have picked `aggressive` there, so it would be dishonest
to grade them against a baseline that could. Every *continuation* value
inside `Q` (i.e. every hypothetical "and then what" a few shots deep)
ignores the budget entirely — this is a deliberate, documented
approximation: modeling "what if the shared, round-wide resource might be
gone by the time I get here" is a much harder dynamic-programming problem
than this grader needs to solve, and the exact per-shot budget feasibility
(which is what actually matters for `decisionLoss`) doesn't need it. The
practical effect shows up in the calibration test below: a `greedy-by-Q`
policy that doesn't ration the budget wisely will end up a bit worse than its
own (budget-blind) `expectedBest` predicts, because the model assumes
`aggressive` is always an option it isn't always allowed to take late in the
round.

## 3. Why the identity is exact

Define, for shot `k` in a hole with real states `c_0` (hole start) through
`c_n` (holed out), `V(c_k)` computed *once* per checkpoint (the same
budget-aware rule as above) and reused everywhere it's needed:

```
decisionLoss_k = Q(c_k, chosen_k) − V(c_k)
luck_k         = Δ_k + V(c_{k+1}) − Q(c_k, chosen_k)
```

Adding them: `decisionLoss_k + luck_k = Δ_k + V(c_{k+1}) − V(c_k)`. Summing
over the hole telescopes — every interior `V(c_k)` cancels — leaving
`Σ Δ_k + V(c_n) − V(c_0)`. `Σ Δ_k` is the hole's actual stroke count (Δ is
defined from the *recorded outcome*, e.g. `outcome === 'water'` costs 2,
never from `strokesAfter`), and `V(c_n) = 0` (holed out). So:

```
Σ(decisionLoss + luck) = actualStrokes − V(holeStart)
```

exactly, to floating-point precision — not approximately. `grade.ts`
guarantees this by computing every checkpoint's `V` in a single **first
pass** over the hole's shots (`checkpointV[0..n]`, with `checkpointV[n] = 0`)
and only then, in a **second pass**, computing `luck` from those exact same
cached numbers. Computing `V(c_{k+1})` independently at each site (e.g. by
calling the generic continuation `vOf` for both "the baseline of shot k+1"
and "the next-state term in shot k's luck") is *almost* the same number but
not bit-identical whenever budget feasibility at `c_{k+1}` restricts the
choice set — the two-pass structure is what makes them provably the same
number rather than approximately the same number. (`grade.test.ts`'s
identity test caught this as a real bug during development — first-draft
single-pass code was off by ~1e-4/hole, well outside the ±1e-9 the test
enforces.)

`expectedBest` (and the round's `expectedBestToPar`) is just `checkpointV[0]`
— the hole-start baseline, for free, from the same computation.

## 4. Destiny → destinyBonus

`fortune.ts`'s destiny guarantee forces a hole-out on the round's first
qualifying shot once a track is overdue — deliberately outside the displayed
odds (see `fortune.ts`'s module doc). Grading recomputes `destinyPlan` from
the seed and walks shots in play order, flagging the one shot where the plan
was still live, the shot structurally qualifies (first par-3 tee shot for
ace; first `stage === 'second'`, `choice === 'aggressive'`, exactly one
stroke down for albatross), and the recorded outcome is `'holeout'`. That
shot's `luck` (which, being a forced hole-out against long odds, is always
strongly negative) moves verbatim into `destinyBonus` and its own `luck`
field is zeroed. `decisionLoss` is untouched — destiny overrides the dice,
never the grading of the choice itself. Because it's a pure relabeling (move
a number from one bucket to another, change nothing else), the identity in
§3 keeps holding exactly.

## 5. Budget, retrospectively

See §2's budget paragraph — the short version: exact at the real decision
being graded, approximate (ignored) in every hypothetical continuation. This
is the one place the model is deliberately less accurate than it could be,
and it's a documented, bounded approximation rather than a bug.

## 6. Validation map

| Test | What it bounds |
|---|---|
| determinism | grading is a pure function of its input |
| telescoping identity | `\|actual − (expectedBest + decisionLoss + luck + destinyBonus)\|` < 1e-9, per hole and round, over ~30 varied rounds |
| dominance | `decisionLoss ≥ 0` always; `0` exactly when `choice === bestChoice`; putt `evChosen` matches the closed form off `faced` odds |
| destiny | forced ace/albatross flagged, `destinyBonus < 0`, identity still exact; a non-firing plan reports `destinyBonus === 0` |
| budget | once the round's 8 aggressive plays are spent, no later budgeted `bestChoice` is `'aggressive'` |
| drift guard | step-one odds recomputed from the reconstructed before-state match `faced.odds` bucket-by-bucket to 10 decimal places — this is effectively exact (same pure functions, same inputs), so no "loosen honestly" was needed here in practice |
| copy ban | `gradeCopy`'s three strings never match `/dice/i`, across the full cross-product of luck/decision/destiny buckets; headline `+`/`-`/`E` formatting |
| MC calibration | greedy-by-Q (self-consistent, budget-rationed policy, N=200): `\|mean(actualToPar − expectedBestToPar)\|` < 0.7 and per-shot `decisionLoss ≈ 0`; all-normal (N=200): `\|mean(luck)\|` < 0.6 |

The calibration bracket is the one that pushed the model, not just the test:
the first working version passed everything except greedy-by-Q, biased
+0.86/round. Bisection (see the `DIAG*` scratch tests used during
development, not checked in) traced it to par-5 holes specifically, and
further isolation showed the *continuation* math itself was accurate — a
live Monte Carlo replay from a fixed `second`-stage state matched its
predicted `Q` to within noise. The bias came entirely from a greedy policy
that (correctly, per §2/§5) evaluates `aggressive` at the go-for-it decision
as if the budget were never a constraint, then spends the round's 8 slots on
whichever hole asks first rather than the holes where `aggressive` is worth
the most — exactly the "V ignores budget" approximation working as
documented, not a defect in it. The fix was in the test's policy (only take
`aggressive` over the runner-up when it's ahead by a real margin, so the
budget lands on the few decisions — mostly `second`-stage go-for-it calls —
where it matters), not in the model. The long-game bucket quadrature (§2)
was also added at this point per "promote a bucket to quadrature, don't
loosen the bracket" — it's a genuine accuracy improvement (fixes a real
Jensen's-gap source) even though, in the end, it wasn't what closed the
greedy-by-Q gap.

## 7. Voice rules

- Numbers are always honest — `gradeCopy` never rounds a bucket boundary to
  flatter the framing, and the headline's `skillToPar` is computed, not
  vibes.
- The framing is playful, the golf-gods/lip-outs/caddie voice already used
  elsewhere in the game's copy (`resolve.ts`'s shot notes, `fortune.ts`'s
  `MOMENT_COPY`) — never clinical ("decisionLoss: 2.3").
  - **"dice" is banned everywhere in this copy**, enforced by test: the game
  presents itself as odds and swings, never as a die roll, even when explaining
  bad luck.
