# Dogleg — agent guide

Dogleg is a daily golf strategy game: static Vite + React 19 + TypeScript app,
pnpm, no backend. The pure-TypeScript game engine lives in `src/engine/` (odds,
layout geometry, shot resolution, characters, 49-course library), round state in
`src/state/store.ts`, UI in `src/ui/` + `src/App.tsx`. Design rationale is in
`docs/DESIGN.md`; the original-game study is in `docs/REVERSE-ENGINEERING.md`.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm dev            # local dev server (port 5173)
pnpm typecheck      # tsc -b
pnpm test           # full vitest suite (unit + calibration + smoke)
pnpm test:smoke     # just the smoke suite (fast, ~2s)
pnpm build          # typecheck + production build to dist/
```

## Tests — read this before changing anything

There are two layers of tests, and **both run in CI on every pull request**
(`.github/workflows/pr-smoke.yml`) as well as on every push to `main` before
deploy (`.github/workflows/deploy.yml`). A PR is not done until they pass.

### Unit / invariant tests (`src/**/*.test.ts` next to their modules)

`src/engine/engine.test.ts`, `advantage.test.ts`, `characters.test.ts`, and
`src/state/store.test.ts` enforce the design contract: odds distributions sum
to 1, geometry honesty (no water risk once past the water), safe-is-safe caps,
and Monte Carlo calibration of the base policies and each character (~1 stroke
of edge, none dominant). If a change moves the calibration numbers, that is a
design decision — see the targets table in README.md — not a test to loosen
casually.

### Smoke tests (`src/smoke.test.ts` + `src/smoke.ui.test.tsx`) — MAINTAIN THESE

The smoke suite is the whole-game safety net, added specifically so agents and
CI catch integration breakage that unit tests miss:

- **`src/smoke.test.ts`** (node) plays complete 18-hole rounds through the
  *store API the UI actually uses* (`newRound → applyChoice → advanceHole`):
  every course start-to-finish, every character, the aggressive-budget
  bookkeeping, daily-setup validity/determinism for every course in rotation,
  seed-replay determinism, the mid-round save/load JSON round-trip, and the
  end-of-round artifacts (recap + share card).
- **`src/smoke.ui.test.tsx`** (jsdom, Testing Library) mounts the real
  `<App />` and clicks the happy path: home → tee off → pick a player → first
  tee → select + commit a shot, plus resume-from-storage and the
  modern/classic view toggle. It is the only test rendering the full component
  tree, so any screen crash on the core flow fails here.

**Maintenance policy — this is not optional:**

1. **Keep them green.** Never delete, skip (`.skip`), or weaken a smoke test to
   get a PR through. If a smoke test fails, the game is broken or the test
   legitimately needs updating to match an intentional change — decide which,
   and say so in the PR.
2. **Extend them when you add surface area.** New course → it's covered
   automatically (the suites iterate `COURSES`), but verify. New character,
   shot stage, screen, persistence key, game mode, or user-visible flow →
   add or update a smoke test in the same PR that exercises it end to end.
3. **Update the UI walkthrough when the UI changes.** If you rename a button,
   reorder screens, or change the commit gesture, `src/smoke.ui.test.tsx`
   must be updated to walk the new flow — that's the test doing its job.
4. **Keep them fast.** The smoke suite is meant to run on every PR in seconds.
   Prefer one deterministic round per surface over Monte Carlo loops (those
   belong in `engine.test.ts`).

## CI

- `.github/workflows/pr-smoke.yml` — every PR: install → typecheck → full test
  suite → production build. Keep this workflow in sync with the scripts in
  `package.json`.
- `.github/workflows/deploy.yml` — push to `main`: test, build, deploy to
  GitHub Pages.

## Conventions

- The UI never rolls its own dice — all randomness goes through the engine's
  seeded rng (`src/engine/rng.ts`); round state persists to localStorage so a
  refresh can't re-roll a shot. Don't break either property.
- `pnpm` only (see `packageManager` in package.json); commit `pnpm-lock.yaml`
  changes when deps change, and CI installs with `--frozen-lockfile`.
