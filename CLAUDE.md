# DogLeg — agent guide

DogLeg is a daily golf strategy game: static Vite + React 19 + TypeScript app,
pnpm. The pure-TypeScript game engine lives in `src/engine/` (odds, layout
geometry, shot resolution, characters, 49-course library), round state in
`src/state/store.ts`, UI in `src/ui/` + `src/App.tsx`. Design rationale is in
`docs/DESIGN.md`; the original-game study is in `docs/REVERSE-ENGINEERING.md`.

The one backend piece is the **leaderboard** (Supabase): `supabase/schema.sql`
holds the tables/RLS, `supabase/functions/submit-round/` is the edge function
that validates every submission by REPLAYING the round with the real engine
(`src/engine/replay.ts`, bundled to `engine.mjs` by `pnpm build:validator`).
The client (`src/lib/backend.ts`, `src/lib/leaderboard.ts`, `src/ui/
Leaderboard.tsx`) reads boards with the public key and submits through the
function; identity is a clubhouse name + device secret, no accounts. The
`mint-player` function mints an anonymous (nameless) player row at app start
so every player has a server-minted id — that id salts the daily dice per
player (`dailySalt`), and the clubhouse name is claimed onto the same row on
first submission. Never derive the salt from anything client-chosen. Backend
features disable themselves in tests (`backendEnabled` is false when
`MODE === 'test'`) so CI never touches the network — keep that property.
Engine changes that alter odds/resolution require the function to be
redeployed, or old and new clients will disagree with the referee. **This is
automated** — the `functions` job in `.github/workflows/deploy.yml` rebuilds
`engine.mjs` and redeploys on every push to `main`, before the site goes live.
Stale browser tabs are the remaining gap: a client that loaded its bundle
before such a deploy would replay differently than the referee, so submissions
carry `ENGINE_VERSION` (`src/engine/version.ts`, re-exported through
`replay.ts` into `engine.mjs`) and the function rejects a mismatch up front
with code `stale_client` ("refresh to post your score") instead of a cryptic
replay error. **Bump `ENGINE_VERSION` in the same PR as any change that
alters what a seed + decisions replay into** (odds, resolution, geometry,
conditions); additions the replay ignores don't need a bump. Payloads without
a version (pre-handshake clients) still replay as before. Preventively, the
build also emits `version.json` beside the bundle (vite.config.ts) and the
home screen fetches it no-store (`src/lib/freshness.ts`) — a mismatch shows a
"reload before you tee off" banner before a round is wasted; fetch failures
fail open, and the submit-side check stays the backstop.
It needs the `SUPABASE_ACCESS_TOKEN` secret and `SUPABASE_PROJECT_REF`
variable, and fails loudly if either is missing. To deploy by hand:
`pnpm build:validator && supabase functions deploy submit-round --project-ref
<ref> --no-verify-jwt --use-api`.

**Conditions are versioned.** Replay links, archived rounds, and course-record
ghosts persist only a seed + decisions; conditions re-derive from the seed on
every replay. So anything that changes what a seed reconstructs (new
conditions fields, new per-hole draws) MUST be gated so historical seeds keep
reconstructing exactly what they were dealt: dailies gate on a cutover
dateKey, practice seeds gate on the seed prefix (`practice:` → `practice2:` →
…). The pattern, current cutovers, and how to add the next version live in
the conditions-versioning note in `src/engine/daily.ts`. An ungated change
here silently rewrites every historical record and replay.

Per-function settings (`verify_jwt`) live in `supabase/config.toml` — that is
the source of truth for local `supabase serve` as well as deploys. Auth
settings are *not* in that file: site_url and the redirect allow-list are
managed in the dashboard, so they aren't in version control.

**Fortune** (`src/engine/fortune.ts`): ace/albatross odds + the destiny
guarantee. Counters ride as a seed tail (`:f…`), so the referee and replay
links resolve identical luck; conditions AND dice always derive from the seed
WITHOUT the tail (the tail is client-kept — dice it could vary would be dice
you could grind). Destiny (forced holeout at the guarantee threshold) is deliberately
resolved OUTSIDE the displayed odds — the game's one sanctioned exception to
"the odds never lie", chosen for surprise. Don't add more exceptions.

Cross-device sync is optional email magic links (Supabase Auth): the
`link-account` function ties `auth.users` to a player row (`players.user_id`);
`src/lib/auth.ts` + `src/ui/AccountPanel.tsx` handle send/reconcile/adopt.
Auth redirect URLs are configured for the prod domain and localhost:5173.
Caveat: the project uses Supabase's built-in mailer (a few emails/hour on the
free tier) — plug custom SMTP into the dashboard if sign-in volume grows.

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
