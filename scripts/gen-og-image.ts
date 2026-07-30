/**
 * Link-preview card generator (build-time tool — never runs in the app).
 *
 * Emits public/og.png — the 1200x630 image iMessage, Slack, Facebook, LinkedIn
 * and X show when someone shares the site. It is the first thing a new player
 * ever sees of DogLeg, and until now it was the only surface the rebrand
 * missed: a hand-made PNG from July 19 showing the old generic-sans "Dogleg"
 * and an illustrated hole that no longer exists anywhere in the product.
 *
 * A hand-made PNG is exactly how that happens, so this card is GENERATED from
 * the same two sources the app itself renders from:
 *
 *   - src/ui/Wordmark.tsx  the real mark, via scripts/lib/wordmark.ts
 *   - src/ui/theme.css     the real tokens, inlined verbatim below
 *
 * Neither is copied. Retune the logo or move a colour and one
 * `pnpm gen:og-image` carries it to every link preview.
 *
 * Unlike the email masthead (scripts/gen-email-wordmark.ts), this renders in a
 * real browser — so `currentColor` and the `var(--logo-*)` custom properties
 * resolve on their own, against theme.css, with no pre-compositing. That is
 * why the shared extractor hands back the mark unresolved.
 *
 * THE COMPOSITION is the app's own home masthead, scaled up: the kicker and
 * tagline sit in the wordmark's negative space (either side of the pennant,
 * either side of the cup) rather than taking rows of their own. Every offset
 * derives from the mark's own geometry, the same way .lockup does in
 * broadcast.css — see the note there. Someone who taps the preview lands on a
 * screen that looks like the preview.
 *
 * Deliberately NOT on the card: the corner notch. It is earned by playing a
 * course (see --notch in theme.css), and a link preview has earned nothing.
 *
 * Run:  pnpm gen:og-image
 *       pnpm gen:og-image --html   # write the page to /tmp and print the path,
 *                                  # for opening in a real browser to iterate
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { extractWordmark } from './lib/wordmark.ts'
import { shotHtml } from './lib/rasterise.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The canonical OG size, and what the meta tags in index.html declare.
 *  1.91:1 — Facebook/LinkedIn/iMessage's large card and X's summary_large_image
 *  all crop to this, so authoring at exactly this ratio means nothing is cut. */
const W = 1200
const H = 630

/** The mark's display width on the card, in px. Everything in the lockup is a
 *  ratio of this (as in broadcast.css), so the composition tracks it. */
const MARK_W = 560

/** The lockup box is wider than the mark, exactly as on the home screen, where
 *  .lockup is width:100% and the mark is min(100%, --mark-w). That extra width
 *  is the runway the kicker and the closing tagline run out into — it only has
 *  to be generous, because the card measures its own ink and centres on that
 *  (see the centring pass at the foot of the page). */
const LOCKUP_W = 900

/** Card copy. The kicker and the two tagline halves are the home masthead's
 *  own words (src/ui/screens.tsx) minus the puzzle number, which a static card
 *  can't know — a preview should say what the screen behind it says. */
const COPY = {
  kicker: 'Daily Golf Challenge',
  tagStart: '18 Holes. Play the Odds.',
  tagEnd: 'Beat the course.',
  domain: 'dogleg.cameronbristol.xyz',
}

/** Webfonts as data URIs. The card is rasterised from a file:// page, where a
 *  file:// @font-face is a cross-origin fetch that Chrome fails silently — and
 *  a silent fallback to Helvetica is exactly the kind of wrong this script
 *  exists to prevent. Base64 sidesteps the question entirely. */
function fontFace(family: string, file: string, extra = ''): string {
  const b64 = readFileSync(resolve(root, file)).toString('base64')
  return `@font-face{font-family:'${family}';font-style:normal;font-display:block;${extra}src:url(data:font/woff2;base64,${b64}) format('woff2');}`
}

function buildHtml(): string {
  const { viewBox, body } = extractWordmark(root)

  // theme.css verbatim — the card reads --turf-*, --text-*, --logo-*, --font-*
  // and the width-axis stops straight off it, so a token change lands here
  // without this file knowing the token exists.
  const theme = readFileSync(resolve(root, 'src/ui/theme.css'), 'utf8')

  const fonts = [
    fontFace(
      'Archivo Variable',
      'node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2',
      "font-weight:100 900;font-stretch:62% 125%;",
    ),
    fontFace('Barlow', 'node_modules/@fontsource/barlow/files/barlow-latin-600-normal.woff2', 'font-weight:600;'),
    fontFace('Barlow', 'node_modules/@fontsource/barlow/files/barlow-latin-700-normal.woff2', 'font-weight:700;'),
  ].join('\n')

  return `<!doctype html>
<meta charset="utf-8">
<style>
${fonts}
${theme}

  html, body { margin: 0; padding: 0; }

  body {
    width: ${W}px;
    height: ${H}px;
    overflow: hidden;
    /* the home screen's own background (broadcast.css .screen.home), so the
       preview and the page it links to are the same surface */
    background: linear-gradient(180deg, var(--turf-800) 0%, var(--turf-900) 60%), var(--bg-page);
    color: var(--text-hi);
    font-family: var(--font-ui);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* the app screen's hairline edge, pulled in off the bleed so the card reads
     as a framed broadcast graphic rather than a full-bleed photo */
  .frame {
    position: absolute;
    inset: 28px;
    border: 1px solid var(--edge-hairline);
    border-radius: var(--r-card);
    pointer-events: none;
  }

  .stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 54px;
  }

  /* ------------------------------------------------------------- lockup ----
     A scaled copy of .lockup in broadcast.css. Same geometry, same source:
     viewBox 0 2 289 151.5 · pole left 37.44 · pennant tip 90 · cup 182..240 ·
     pennant centre y 17 · cup centre y 143 (both less the viewBox's y=2). */
  .lockup {
    --mark-w: ${MARK_W}px;
    position: relative;
    width: ${LOCKUP_W}px;
  }

  .lockup .wordmark { margin: 0; line-height: 0; color: var(--text-hi); }
  .lockup .wordmark svg { display: block; width: var(--mark-w); height: auto; }
  .lockup > :not(.wordmark) { position: absolute; margin: 0; }

  /* top row — right of the pennant's tip, at its mid-height (17 -> 9.9%) */
  .lockup-kicker {
    top: 9.9%;
    transform: translateY(-50%);
    left: calc(var(--mark-w) * 90 / 289 + 20px);
    right: 0;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: var(--track-kicker);
    text-transform: uppercase;
    /* --text-low is right on the screen, where the eye has the whole masthead
       for context; a preview gets a glance at thumbnail size, so the kicker
       takes the sand the email chassis gives its kickers instead */
    color: var(--sand-500);
    line-height: 1.15;
  }

  /* bottom row — beside the cup, at its mid-height (143 -> 93.1%). Condensed
     display face, as on the screen: the left slot is capped by the cup's left
     edge, and 'tower' width buys ~20% more size at the same slot width. */
  .lockup-tag, .lockup-tag-end {
    top: 93.1%;
    transform: translateY(-50%);
    font-family: var(--font-display);
    font-variation-settings: 'wdth' var(--wdth-tower);
    font-size: 34px;
    font-weight: 600;
    letter-spacing: 0.005em;
    color: var(--text-mid);
    line-height: 1.2;
    white-space: nowrap;
  }

  .lockup-tag {
    left: 0;
    width: calc(var(--mark-w) * 182 / 289 - 14px);
    text-align: right;
  }

  .lockup-tag-end {
    left: calc(var(--mark-w) * 240 / 289 + 14px);
    right: 0;
  }

  /* ------------------------------------------------------------- domain ----
     The flag-red dot is the one bit of the retired card worth keeping: it
     reads as a live "on air" tally, and it is the same red as the pennant
     directly above it. */
  .domain {
    display: flex;
    align-items: center;
    gap: 13px;
    font-family: var(--font-display);
    font-variation-settings: 'wdth' var(--wdth-standard);
    font-size: 25px;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: var(--sand-500);
  }

  .domain::before {
    content: '';
    width: 11px;
    height: 11px;
    border-radius: var(--r-pill);
    background: var(--flag-500);
  }
</style>

<div class="frame"></div>

<div class="stack">
  <div class="lockup">
    <div class="wordmark">
      <svg viewBox="${viewBox}" role="img" aria-label="DogLeg" xmlns="http://www.w3.org/2000/svg">
        ${body.replace(/\n/g, '\n        ')}
      </svg>
    </div>
    <span class="lockup-kicker">${COPY.kicker}</span>
    <p class="lockup-tag">${COPY.tagStart}</p>
    <p class="lockup-tag-end">${COPY.tagEnd}</p>
  </div>

  <div class="domain">${COPY.domain}</div>
</div>

<script>
  /* Centre the LOCKUP on its ink, not on its box.
     The lockup's box is deliberately much wider than the mark — it is the
     runway the kicker and closing tagline run out into — and its text children
     are stretched to that width by "right: 0" (the kicker, the closing
     tagline) or pinned to a computed slot (the opening tagline, right-aligned
     against the cup's left edge). So every box here is wider than the glyphs
     in it, and centring the box leaves the painted composition sitting well
     left of the axis. How far left depends on how long the copy is, so a
     hand-tuned box width would silently decentre the card the next time
     someone edits a tagline.
     Hence: measure the glyphs. Range.getBoundingClientRect() over a text
     element's contents gives the true ink extent where the element's own rect
     gives the slot it was poured into. The mark is measured as an element
     (its box IS its ink), and the domain line is left alone — it sits on the
     card's axis on its own, and riding along with the lockup's correction
     would push it off. Vertical needs no pass: flexbox already centres the
     stack, whose height is genuinely its content's height. */
  const inkRect = (el) => {
    const r = document.createRange()
    r.selectNodeContents(el)
    return r.getBoundingClientRect()
  }

  const lockup = document.querySelector('.lockup')
  const rects = [
    lockup.querySelector('.wordmark svg').getBoundingClientRect(),
    ...[...lockup.querySelectorAll('.lockup-kicker, .lockup-tag, .lockup-tag-end')].map(inkRect),
  ]
  const left = Math.min(...rects.map((r) => r.left))
  const right = Math.max(...rects.map((r) => r.right))
  lockup.style.transform = 'translateX(' + (${W} / 2 - (left + right) / 2).toFixed(2) + 'px)'
</script>
`
}

const html = buildHtml()

if (process.argv.includes('--html')) {
  const out = resolve(tmpdir(), 'dogleg-og-card.html')
  writeFileSync(out, html)
  console.log(out)
} else {
  const outDir = resolve(root, 'public')
  mkdirSync(outDir, { recursive: true })
  const outPng = resolve(outDir, 'og.png')

  // scale 1: the card is authored at its true delivered size, so there is no
  // downsample to soften the letterforms
  shotHtml(html, outPng, { width: W, height: H, scale: 1, tag: 'og' })

  console.log(`og.png  ${W}x${H}`)
}
