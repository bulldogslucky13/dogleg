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
conditions); additions the replay ignores don't need a bump. **A bump also
requires a `kind: 'odds'` entry in the player-facing change log
(`src/lib/changelog.ts`) in the same PR** — the log is the public record that
the odds only move in the open, and it is worthless the moment it lags the
engine. Player-visible features and fixes get an entry too — with **two
deliberate exceptions, neither of which is ever logged**:

- **Per-course work.** Imports, scorecard corrections and geometry passes bump
  the engine but stay out of the feed, because courses are tuned the day before
  they come up as the daily and logging each one would both flood the log and
  misrepresent routine prep as meddling with the math. Log changes to how the
  game behaves *everywhere*, not a course's arrival.
- **Cosmetic work.** Colour, contrast, spacing, layout, type, animation and
  copy polish get no entry however visible the change is. "A player can see it"
  is not the bar — the bar is whether the bug could have cost a stroke or
  misled someone about their round. A caddy note that misread the hole is a
  logged fix; an unreadable button is not, because fixing it changed neither
  what the game did nor what it told you.

Both are spelled out in the note at the top of `changelog.ts`, which is the
source of truth for this policy. **The rule is enforced by CI**: the
change-log gate (`.github/workflows/changelog-check.yml`, policy + tests in
`scripts/changelog-check.mjs`) fails any PR that neither updates
`changelog.ts` nor is exempt. Exemptions, by PR label: `course` (course work —
also auto-detected when a diff touches only course-import paths, so routine
imports need no label at all) and `no-changelog` (the deliberate skip for
everything the policy exempts: cosmetic work, refactors, CI, docs). **To log
course work you DO want players to see**: add `changelog-include` alongside
`course` and write the entry. Entry kinds: `odds` | `feature` | `fix` |
`design`. Payloads without
a version (pre-handshake clients) still replay as before. Preventively, the
build also emits `version.json` beside the bundle (vite.config.ts) and the
home screen fetches it no-store (`src/lib/freshness.ts`) — a mismatch shows a
"reload before you tee off" banner before a round is wasted; fetch failures
fail open, and the submit-side check stays the backstop.
It needs the `SUPABASE_ACCESS_TOKEN` secret and `SUPABASE_PROJECT_REF`
variable, and fails loudly if either is missing. To deploy by hand:
`pnpm build:validator && supabase functions deploy submit-round --project-ref
<ref> --no-verify-jwt --use-api`.

**Schema changes are automated the same way**: the deploy workflow applies
`supabase/schema.sql` in full to the live database on every push to `main`,
before the function deploy. So a PR that needs a new table or column just
edits `schema.sql` — no manual step at merge. The contract that makes this
safe: **every statement in schema.sql must be idempotent** (create ... if not
exists, create or replace, drop policy if exists then create). Never add a
bare `create table`/`create policy`/data migration that would error or
double-apply on re-run.

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

**The old domain hands players over.** `localStorage` is per-origin, so the
move to playdogleg.com would otherwise strand every clubhouse — including the
player id the daily dice are salted from. `handoff/index.html` is the one page
the OLD domain still serves: it packs every `dogleg:` key into a URL fragment
and bounces to the new site, where `src/lib/handoff.ts` merges it and strips
the fragment (in `main.tsx`, before React mounts, so `ensureIdentity` can't
mint a competing id first). The two halves live on different domains and can
never share a bundle, so `handoff.test.ts` runs the real script out of the
real HTML file against the real unpacker — **if you touch the wire format,
change both sides**. New persistence keys need no change: the sweep is by
`dogleg:` prefix, not a hand-listed set.

**The email session is the one thing deliberately left behind.** supabase-js
keeps it at `sb-<ref>-auth-token`, outside the `dogleg:` namespace, so the
sweep never sees it — and that is the intended outcome, not a gap: it is a
REFRESH token, and a URL fragment is an acceptable place for the player secret
(post scores as that clubhouse) and not for one that buys ongoing account
access. So a linked player arrives with everything except the sign-in, which
unexplained reads as the move having eaten their account. The old page
therefore ships a flag — `dogleg:handoff-relink:v1`, a boolean, never the
credential — and `AccountPanel` turns it into one sentence and clears it.
Signing back in reconciles rather than duplicates: the account's linked player
row is the same id the handoff carried, so `link-account` returns `linked` and
the daily dice keep their salt.

Cross-device sync is optional email magic links (Supabase Auth): the
`link-account` function ties `auth.users` to a player row (`players.user_id`);
`src/lib/auth.ts` + `src/ui/AccountPanel.tsx` handle send/reconcile/adopt.
Auth redirect URLs are configured for the prod domain and localhost:5173.
Mail goes out through Resend — the edge function POSTs its API directly, and
Supabase Auth is pointed at `smtp.resend.com` (sender `DogLeg Team
<team@playdogleg.com>`, configured in the dashboard).

**Every email we send renders through one chassis**, `supabase/functions/
_shared/email-chassis.ts` — the broadcast card, with theme.css's tokens
resolved to literals (mail has no custom properties, and Outlook's Word engine
drops `rgba()`, so the translucent tiers are pre-composited; `emails.test.ts`
guards both). There are three, and only three:

- **record stolen** — `submit-round/email.ts`, sent via the Resend API
- **magic link** and **confirm signup** — `_shared/auth-emails.ts`

The auth pair used to live *only* in the Supabase dashboard, which is how they
silently missed a rebrand. They are now generated to `supabase/templates/*.html`
(`pnpm gen:email-templates`, reviewable in the diff, pinned by a test).

**Pushing them is automated**, like the schema and the functions: the
`email-templates` job in `.github/workflows/deploy.yml` runs
`pnpm push:email-templates` on every push to `main`. A PR that changes email
copy just edits `_shared/auth-emails.ts` and commits the regenerated HTML — no
manual step at merge. Two things make that safe: the push diffs against live
config and no-ops when nothing moved, and CI runs `gen:email-templates --check`
first, so it refuses to push anything that disagrees with the reviewed files.

That job runs **after** the site deploy — deliberately the opposite of the
functions job, which goes first so the referee is never older than the clients
submitting to it. Emails point the other way: the masthead is an `<img>` served
from the site, so a template must never ship ahead of the asset it references.

To preview a change before it merges:

```sh
export SUPABASE_ACCESS_TOKEN=...        # supabase.com/dashboard/account/tokens
pnpm gen:email-templates && pnpm push:email-templates --dry-run
```

The other eleven auth templates in the project are Supabase stock and
deliberately untouched: `src/lib/auth.ts` only ever calls `signInWithOtp`, so
DogLeg has no password reset, phone, MFA, OAuth-identity or invite flow to
brand.

The masthead is a hosted PNG (`public/brand/`, regenerate with `pnpm
gen:email-wordmark`) because Gmail strips inline SVG — it is rasterised from
`src/ui/Wordmark.tsx` itself, so the logo has one source of truth. It carries
no information the alt text doesn't, since Gmail blocks remote images on first
open. Look at all three at `/_emails.html` in dev, images on **and** off.

## Brand assets are generated, never drawn

**No image carrying the logo is hand-made.** Each is rendered from
`src/ui/Wordmark.tsx` and `src/ui/theme.css` by a script, so retuning the mark
or a token carries to every surface with one command:

- `pnpm gen:email-wordmark` → `public/brand/wordmark-email.*` (the mail masthead)
- `pnpm gen:og-image` → `public/og.png` (the link-preview card)

Both read the component through `scripts/lib/wordmark.ts` and rasterise through
`scripts/lib/rasterise.ts` (headless Chrome — no node-canvas/sharp dependency).
The extractor hands back the mark **unresolved**, `currentColor` and
`var(--logo-*)` intact, because the two callers want opposite things: the OG
card renders in a real browser and resolves both against theme.css, while mail
can resolve neither and substitutes literals itself.

The OG card is the surface with no eyes on it — nobody on the team sees it,
because it only ever renders in someone else's thread. That is how it sat on
pre-rebrand artwork for a week after every other surface had moved. So: it is
generated (there is no artwork left to go stale), `scripts/og-image.test.ts`
pins its size and its meta tags, and `og:image` carries a **`?v=` cache-bust —
bump it whenever the card changes**, because iMessage, Slack and Facebook key
their preview cache on the image URL and will otherwise keep serving the old
picture forever. Iterate on the design with `pnpm gen:og-image --html`, which
writes the page to /tmp and prints the path to open in a browser.

The app icons (`public/favicon.svg`, `icon.png`, `apple-touch-icon.png`) are the
one exception — they are square badge/app-icon lockups rather than the wordmark,
so they are exported from the design tool's own files (which live outside this
repo, with the designer) rather than generated here. Ask for fresh exports when
the mark changes; there is no `pnpm` command for them.

## Marketing pages, SEO and Pinterest are generated too

The app is a single-URL SPA, so every crawlable surface is prerendered by
`scripts/lib/pages.tsx` (builders) + `scripts/pages-entry.tsx` (writer),
bundled by `vite.pages.config.ts` because the builders render real app
components (HoleMap, Wordmark) — same pattern as `build:validator`. `pnpm
gen:pages` rides `pnpm build`, so `/courses/<slug>/` (one guide per course in
ALL_COURSES, signature-hole map included), `/courses/`, `/how-to-play/`,
`/changelog/`, `sitemap.xml`, `robots.txt` and `404.html` can never go stale —
a new course gets its page and sitemap line with no wiring. `scripts/
pages.test.ts` guards the metadata, the Pinterest domain-claim tag
(`p:domain_verify`, also in index.html — keep the two in step), and that no
odds internals leak (pages show CourseSpec + Play Rating only, never
`difficulty`).

The per-course Pinterest cards (2:3, 1000x1500) are rasterised by `pnpm
gen:pin-images` into `dist/pins/` **in the deploy workflow only** (they need
the runner's Chrome; PR CI builds pages without a browser). Course pages use
them as `og:image` with a `?v=` cache-bust (`PIN_IMG_VERSION` in pages.tsx) —
bump it when the card design changes, same contract as og.png. The Pinterest
conversion tag (src/lib/analytics.ts) is dormant until the
`VITE_PINTEREST_TAG_ID` repo variable is set; like PostHog, it never loads in
tests.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm dev            # local dev server (port 5173)
pnpm typecheck      # tsc -b
pnpm test           # full vitest suite (unit + calibration + smoke)
pnpm test:smoke     # just the smoke suite (fast, ~2s)
pnpm build          # typecheck + production build to dist/
pnpm gen:og-image   # redraw the link-preview card (public/og.png)
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
