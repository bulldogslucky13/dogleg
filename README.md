# ⛳ Dogleg

**A daily golf strategy game.** One course a day, 18 holes, about 2 minutes a round.
Every shot is one choice — Safe, Normal, or Aggressive — and every choice honestly
shifts your odds. You get 8 aggressive plays per round. Spend them well and you might
break par; the course wins most days.

What makes Dogleg different from games like it:

- **Safe means safe.** Playing safe caps your blow-up risk no matter how hard the hole
  is. Bad conditions cost you position (rough, longer putts) — never a snowman.
- **The odds never lie.** Every hole has real geometry. If the pond is behind your
  ball, your water risk is 0% — the map, the odds bars, and the dice all share one
  model, and you see your odds *before* you commit.
- **Real sand play.** Fairway traps are a distance problem; greenside traps are an
  escape problem, with a real (small) chance you leave it in the bunker or fly the
  green entirely.

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
pnpm dev        # dev server at http://localhost:5173
pnpm test       # engine invariants + Monte Carlo calibration
pnpm build      # type-check + production build to dist/
```

- Pure-TypeScript game engine in `src/engine/` — the UI never rolls its own dice.
- Daily seed = local date; round state persists to localStorage, so refreshing can't
  re-roll a shot.
- Design docs: [docs/DESIGN.md](docs/DESIGN.md) ·
  [docs/REVERSE-ENGINEERING.md](docs/REVERSE-ENGINEERING.md)

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
