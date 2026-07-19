# ⛳ Dogleg

**A daily golf strategy game.** One course a day, 18 holes, about 2 minutes a round.
Pick your player, then every shot is one choice — Safe, Normal, or Aggressive — and
every choice honestly shifts your odds. You get 8 aggressive plays per round. Spend
them well and you might break par; the course wins most days.

What makes Dogleg different from games like it:

- **Pick your player.** Before the round you choose one of three playstyles — the
  **Fairway Finder** (length + accuracy off the tee), the **Dart Thrower** (approach
  accuracy), or the **Greens Keeper** (putting). Each is a real ~1-stroke-per-round
  edge, balance-verified by Monte Carlo tests and *never* a cheat code — and when your
  edge actually changes a shot's outcome, the game tells you, with the honest number.
- **Safe means safe.** Playing safe caps your blow-up risk no matter how hard the hole
  is. Bad conditions cost you position (rough, longer putts) — never a snowman.
- **The odds never lie.** Every hole has real geometry. If the pond is behind your
  ball, your water risk is 0% — the map, the odds bars, and the dice all share one
  model, and you see your odds *before* you commit. Your character shifts those same
  odds, so the bars you see already include your edge.
- **Real sand play.** Fairway traps are a distance problem; greenside traps are an
  escape problem, with a real (small) chance you leave it in the bunker or fly the
  green entirely.
- **49 courses.** Real championship layouts — Pebble Beach, St Andrews, Augusta,
  Oakmont, Pine Valley, TPC Sawgrass and more — plus a handful of originals. A new one
  is the daily; all are playable as practice rounds.
- **Two ways to see it.** A modern top-down map or a classic side-profile view, toggled
  any time mid-round — both driven by the same honest odds.

---

## Run it on your computer

You need to do steps 1–2 only once.

**1. Install Node.js** (the thing that runs the app)

Go to [nodejs.org](https://nodejs.org), download the "LTS" version, and run the
installer with all default settings.

**2. Turn on pnpm** (the tool that installs the app's parts)

Open the **Terminal** app (Mac: press `Cmd+Space`, type "Terminal", press Enter) and
paste this line, then press Enter:

```sh
corepack enable pnpm
```

**3. Download and start the game**

In that same Terminal window, paste these four lines one at a time, pressing Enter
after each:

```sh
git clone https://github.com/bulldogslucky13/dogleg.git
cd dogleg
pnpm install
pnpm dev
```

When it says `Local: http://localhost:5173`, open that address in your web browser.
That's the game. Leave the Terminal window open while you play.

To play again later: open Terminal, type `cd dogleg`, then `pnpm dev`.

**To stop it:** click on the Terminal window and press `Ctrl+C`.

---

## For developers

```sh
pnpm dev         # dev server at http://localhost:5173
pnpm test        # full suite: engine invariants + Monte Carlo calibration + smoke
pnpm test:smoke  # just the whole-game smoke tests (~2s)
pnpm build       # type-check + production build to dist/
```

- Pure-TypeScript game engine in `src/engine/` — the UI never rolls its own dice.
  `odds.ts` is the single source of truth; `resolve.ts` runs the stage machine;
  `characters.ts` holds the three playstyles and their buff tables; `advantage.ts`
  detects when a character measurably helped a shot (by re-scoring it without the
  character); `courses.ts` is the 49-course library.
- Daily seed = local date; round state persists to localStorage, so refreshing can't
  re-roll a shot.
- Tests (`pnpm test`) enforce the design contract: odds always sum to 1, geometry
  honesty (no water risk once you're past the water), safe-is-safe, and Monte Carlo
  calibration for both the base policies **and** each character (~1 stroke of edge,
  none dominant, no stat-padding the game into a birdie-fest).
- Smoke tests (`src/smoke.test.ts` + `src/smoke.ui.test.tsx`) play complete rounds
  through the real store API and click through the real `<App />` in jsdom. They run
  on **every pull request** via `.github/workflows/pr-smoke.yml` and must be kept
  green and extended alongside new features — the maintenance policy lives in
  [CLAUDE.md](CLAUDE.md).
- Design docs: [docs/DESIGN.md](docs/DESIGN.md) ·
  [docs/REVERSE-ENGINEERING.md](docs/REVERSE-ENGINEERING.md)
- Privacy: the deployed site uses [PostHog](https://posthog.com) for anonymous,
  cookie-free usage analytics (no accounts, no PII; honors Do Not Track). Local dev
  sends nothing unless `VITE_POSTHOG_KEY` is set.

### Deploying

The site is 100% static — `pnpm build` produces a `dist/` folder you can host
anywhere. This repo ships with a GitHub Actions workflow that tests, builds, and
publishes to **GitHub Pages** on every push to `main` (enable it once in the repo's
Settings → Pages → Source: "GitHub Actions").

To point a custom domain (e.g. `dogleg.cameronbristol.xyz`) at it, add the domain in
Settings → Pages and create the matching CNAME record at your DNS provider. Update
`SITE_URL` in `src/engine/daily.ts` to match whatever domain you choose (it appears in
the share text).

### Calibration targets (enforced by tests)

| policy | avg to par | breaks par | doubles+/round |
|---|---|---|---|
| all-safe | ~+2.5 | ~12% | <0.5 |
| all-normal | ~+2.3 | ~22% | ~1.1 |
| smart mixed | ~+0.5 | ~35-40% | ~1.1 |
