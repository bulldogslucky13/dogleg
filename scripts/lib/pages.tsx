/**
 * The marketing/SEO page builders — every crawlable surface outside the app.
 *
 * The app itself is a single-URL SPA, which is perfect for playing and useless
 * for being found: a crawler (or Tailwind's SmartPin, which builds Pinterest
 * Pins by reading a page's images and copy) sees one URL and one og.png. These
 * builders manufacture the missing surface area from data the repo already
 * owns — the course library, the change log, the tutorial copy — so nothing
 * here is hand-authored twice or can drift from the game:
 *
 *   /courses/            index of the library
 *   /courses/<slug>/     one guide per course: scorecard, signature-hole map
 *                        (the real HoleMap component, server-rendered), stats
 *   /how-to-play/        the tutorial's copy as a real page
 *   /changelog/          the player-facing change log (src/lib/changelog.ts)
 *   sitemap.xml, robots.txt, 404.html
 *
 * Pure string-building: no fs writes here beyond reading theme.css and the
 * font files (node context only — scripts/, never bundled into the app). The
 * entry point that writes files is scripts/pages-entry.tsx; tests import this
 * module directly under vitest.
 *
 * These pages ride `pnpm build`, so they regenerate on every deploy and CI
 * run — a new course in COURSES gets its page, its sitemap line and its pin
 * card with no further wiring.
 *
 * DELIBERATELY NOT HERE: anything the odds engine knows that the scorecard
 * doesn't. Pages show CourseSpec + Play Rating — all public in-game — never
 * odds internals, so a page can't become a cheat sheet.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ALL_COURSES, COURSES, GUEST_COURSES, PAR3_COURSES } from '../../src/engine/courses'
import type { CourseSpec, HoleSpec } from '../../src/engine/types'
import { buildLayout } from '../../src/engine/layout'
import { PLAY_RATINGS } from '../../src/engine/playRatings'
import { CHANGELOG, CHANGE_KIND_LABEL } from '../../src/lib/changelog'
import { HoleMap } from '../../src/ui/HoleMap'
import { Wordmark } from '../../src/ui/Wordmark'
import { ROUGH_GRADES } from '../../src/ui/RoughGrades'

export const SITE = 'https://playdogleg.com'

/** Pinterest site-claim code — must render on every page of the domain the
 *  crawler might fetch. The value is the claim, not a secret. */
export const PINTEREST_VERIFY = '1a5c4413c8c5dfc3cbee237c0da375ee'

/** Cache-bust for the per-course pin cards, same contract as og.png's ?v=:
 *  Pinterest and OG scrapers key their image cache on the URL, so bump this
 *  whenever the card design changes or they keep serving the old picture. */
export const PIN_IMG_VERSION = 1

/** Webfonts the static pages self-host (the app's own font assets carry
 *  hashed names that change build to build). The entry copies these from
 *  node_modules into dist/fonts/. */
export const FONT_FILES: { out: string; src: string }[] = [
  { out: 'archivo-wdth.woff2', src: 'node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2' },
  { out: 'barlow-400.woff2', src: 'node_modules/@fontsource/barlow/files/barlow-latin-400-normal.woff2' },
  { out: 'barlow-600.woff2', src: 'node_modules/@fontsource/barlow/files/barlow-latin-600-normal.woff2' },
  { out: 'barlow-700.woff2', src: 'node_modules/@fontsource/barlow/files/barlow-latin-700-normal.woff2' },
]

const root = process.cwd()

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const themeCss = () => readFileSync(resolve(root, 'src/ui/theme.css'), 'utf8')

// ---------------------------------------------------------------- wordmark --

function wordmarkSvg(): string {
  return renderToStaticMarkup(<Wordmark />)
}

// ------------------------------------------------------------- course data --

export function coursePar(c: CourseSpec): number {
  return c.holes.reduce((s, h) => s + h.par, 0)
}

export function courseYards(c: CourseSpec): number {
  return c.holes.reduce((s, h) => s + h.yards, 0)
}

/** The hole the course leads with: the first hole carrying signature copy,
 *  else the card's toughest test (stroke index 1). */
export function signatureHole(c: CourseSpec): HoleSpec {
  return c.holes.find((h) => h.signature) ?? c.holes.reduce((a, b) => (a.strokeIndex < b.strokeIndex ? a : b))
}

/** Every hole the library wrote editorial copy for. These are the holes with a
 *  story — the Church Pews, Golden Bell, Shipwreck — which is exactly what
 *  makes them worth a pin of their own. */
export function signatureHoles(c: CourseSpec): HoleSpec[] {
  return c.holes.filter((h) => h.signature)
}

/**
 * The holes that get a pin card BEYOND the course card.
 *
 * The course card already leads with `signatureHole(c)`, so it is excluded
 * here — otherwise every course would ship the same picture twice under two
 * filenames. Courses with no editorial copy contribute nothing: a card whose
 * only claim is "hole 4" is filler, and filler is what makes a Pinterest
 * account look automated.
 */
export function holePinTargets(c: CourseSpec): HoleSpec[] {
  const lead = signatureHole(c)
  return signatureHoles(c).filter((h) => h.number !== lead.number)
}

/** The real HoleMap, server-rendered at the tee with no round context — the
 *  same SVG the app draws, so the guide can never show a hole the game
 *  doesn't. */
export function holeMapSvg(c: CourseSpec, spec: HoleSpec): string {
  const layout = buildLayout(c.slug, spec)
  return renderToStaticMarkup(
    <HoleMap
      layout={layout}
      ball={{ pos: 0, lie: 'tee', side: 'center' }}
      previewWindow={null}
      previewApproach={null}
      previewChoice={null}
    />,
  )
}

const fmtYds = (n: number) => n.toLocaleString('en-US')

/** One factual paragraph per course, composed from the card so every page has
 *  unique prose (thin/duplicate content is how course pages get ignored). */
export function courseProse(c: CourseSpec): string {
  const par = coursePar(c)
  const yards = courseYards(c)
  const hardest = c.holes.reduce((a, b) => (a.strokeIndex < b.strokeIndex ? a : b))
  const par3s = c.holes.filter((h) => h.par === 3).length
  const wet = c.holes.filter((h) => h.hazard === 'water' || h.hazard === 'ocean').length
  const rating = PLAY_RATINGS[c.slug]
  const bits: string[] = []
  bits.push(
    `${c.name} plays as a par ${par} at ${fmtYds(yards)} yards in DogLeg${
      rating ? `, with a Play Rating of ${rating}/10 from thousands of simulated rounds` : ''
    }.`,
  )
  bits.push(
    `The card's toughest test is the par-${hardest.par} ${ordinal(hardest.number)} at ${fmtYds(hardest.yards)} yards, stroke index 1.`,
  )
  const pinTalk = par3s > 0 && !c.par3Course
  if (wet > 0)
    bits.push(
      `Water is in play on ${wet} of the ${c.holes.length} holes${pinTalk ? `, and ${par3s} par 3s put the day's pin position front and centre` : ''}.`,
    )
  else if (pinTalk) bits.push(`${par3s} par 3s put the day's pin position front and centre.`)
  bits.push(`Greens run ${c.greens.toLowerCase()}, with typical wind around ${c.wind} mph.`)
  return bits.join(' ')
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

// -------------------------------------------------------------------- shell --

const PAGE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg-page-glow), var(--bg-page);
    background-attachment: fixed;
    color: var(--text-hi);
    font-family: var(--font-ui);
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 780px; margin: 0 auto; padding: 20px 20px 56px; }
  a { color: var(--sand-500); }

  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 6px 0 26px; }
  .topbar .mark { display: block; color: var(--text-hi); }
  .topbar .mark svg { display: block; width: 108px; height: auto; }
  .topnav { display: flex; align-items: center; gap: 18px; font-family: var(--font-display); font-variation-settings: 'wdth' var(--wdth-standard); font-weight: 600; font-size: 15px; }
  .topnav a { color: var(--text-mid); text-decoration: none; }
  .topnav a:hover { color: var(--text-hi); }

  .kicker { font-size: 12px; font-weight: 700; letter-spacing: var(--track-kicker); text-transform: uppercase; color: var(--sand-500); margin: 0 0 10px; }
  h1 { font-family: var(--font-display); font-variation-settings: 'wdth' var(--wdth-tower); font-weight: 650; font-size: clamp(34px, 7vw, 52px); line-height: 1.04; margin: 0 0 6px; text-wrap: balance; }
  h2 { font-family: var(--font-display); font-variation-settings: 'wdth' var(--wdth-tower); font-weight: 600; font-size: 24px; margin: 40px 0 12px; }
  .sub { color: var(--text-mid); margin: 0 0 18px; font-size: 17px; }
  p { color: var(--text-mid); }
  p b, p strong { color: var(--text-hi); }

  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 6px; padding: 0; list-style: none; }
  .chips li { border: 1px solid var(--edge-hairline); background: var(--bg-panel); border-radius: var(--r-pill, 999px); padding: 5px 13px; font-family: var(--font-display); font-variation-settings: 'wdth' var(--wdth-standard); font-weight: 600; font-size: 14px; color: var(--text-mid); white-space: nowrap; }
  .chips li b { color: var(--text-hi); font-weight: 700; }

  .holecard { border: 1px solid var(--edge-hairline); background: var(--bg-panel); border-radius: var(--r-card); padding: 14px; margin: 16px 0; }
  .holecard svg.holemap { display: block; width: min(100%, 420px); height: auto; margin: 0 auto; }
  .holecard figcaption { color: var(--text-mid); font-size: 15px; text-align: center; padding: 10px 8px 2px; }

  table.card { width: 100%; border-collapse: collapse; margin: 12px 0 4px; font-variant-numeric: tabular-nums; }
  table.card caption { text-align: left; font-family: var(--font-display); font-variation-settings: 'wdth' var(--wdth-tower); font-weight: 600; font-size: 17px; padding: 0 0 8px; color: var(--text-hi); }
  table.card th, table.card td { border-top: 1px solid var(--edge-hairline); padding: 6px 8px; text-align: right; font-size: 14px; color: var(--text-mid); }
  table.card th { font-family: var(--font-display); font-variation-settings: 'wdth' var(--wdth-standard); font-weight: 700; color: var(--text-low); text-transform: uppercase; font-size: 11.5px; letter-spacing: 0.08em; }
  table.card th:first-child, table.card td:first-child { text-align: left; }
  table.card td.tot { color: var(--text-hi); font-weight: 700; }

  ul.notes { padding-left: 20px; }
  ul.notes li { color: var(--text-mid); margin: 8px 0; }
  ul.notes b { color: var(--text-hi); }

  .cta-row { margin: 34px 0 8px; }
  a.cta { display: inline-block; background: var(--action-primary); color: #fff; text-decoration: none; font-family: var(--font-display); font-variation-settings: 'wdth' var(--wdth-standard); font-weight: 700; font-size: 17px; padding: 12px 26px; border-radius: var(--r-pill, 999px); }
  .cta-note { color: var(--text-low); font-size: 14px; margin-top: 8px; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; padding: 0; list-style: none; margin: 18px 0; }
  .grid a { display: block; border: 1px solid var(--edge-hairline); background: var(--bg-panel); border-radius: var(--r-card); padding: 14px 16px; text-decoration: none; color: var(--text-hi); }
  .grid a:hover { border-color: var(--sand-500); }
  .grid .cname { font-family: var(--font-display); font-variation-settings: 'wdth' var(--wdth-tower); font-weight: 600; font-size: 18px; line-height: 1.15; }
  .grid .cmeta { color: var(--text-low); font-size: 13px; margin-top: 5px; }

  .pager { display: flex; justify-content: space-between; gap: 16px; margin: 30px 0 0; font-size: 15px; }

  .log { list-style: none; padding: 0; margin: 18px 0; }
  .log li { border-top: 1px solid var(--edge-hairline); padding: 14px 2px; }
  .log .when { color: var(--text-low); font-size: 13px; font-variant-numeric: tabular-nums; }
  .log .badge { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; border-radius: var(--r-pill, 999px); padding: 2px 9px; margin-left: 8px; background: var(--bg-card); color: var(--sand-500); }
  .log .badge.odds { background: var(--flag-500); color: #fff; }
  .log .what { font-weight: 600; color: var(--text-hi); margin: 4px 0 2px; }
  .log .note { color: var(--text-mid); font-size: 15px; margin: 0; }

  footer.site { border-top: 1px solid var(--edge-hairline); margin-top: 54px; padding-top: 18px; display: flex; flex-wrap: wrap; gap: 8px 22px; align-items: center; color: var(--text-low); font-size: 14px; }
  footer.site a { color: var(--text-mid); text-decoration: none; }
  footer.site .dot { width: 9px; height: 9px; border-radius: 999px; background: var(--flag-500); display: inline-block; margin-right: 8px; }
`

function fontsCss(prefix = '/fonts'): string {
  return `
  @font-face { font-family: 'Archivo Variable'; font-style: normal; font-display: swap; font-weight: 100 900; font-stretch: 62% 125%; src: url(${prefix}/archivo-wdth.woff2) format('woff2'); }
  @font-face { font-family: 'Barlow'; font-style: normal; font-display: swap; font-weight: 400; src: url(${prefix}/barlow-400.woff2) format('woff2'); }
  @font-face { font-family: 'Barlow'; font-style: normal; font-display: swap; font-weight: 600; src: url(${prefix}/barlow-600.woff2) format('woff2'); }
  @font-face { font-family: 'Barlow'; font-style: normal; font-display: swap; font-weight: 700; src: url(${prefix}/barlow-700.woff2) format('woff2'); }
`
}

interface ShellOpts {
  /** site-relative, with leading and trailing slash: '/courses/pebble-beach/' */
  path: string
  title: string
  description: string
  kicker: string
  /** absolute URL; falls back to the site og card */
  ogImage?: { url: string; width: number; height: number; alt: string }
  jsonLd?: object[]
  bodyHtml: string
}

export function pageShell(o: ShellOpts): string {
  const og = o.ogImage ?? {
    url: `${SITE}/og.png?v=3`,
    width: 1200,
    height: 630,
    alt: 'DogLeg — Daily Golf Challenge · 18 Holes. Play the Odds.',
  }
  const jsonLd = (o.jsonLd ?? [])
    .map((d) => `<script type="application/ld+json">${JSON.stringify(d)}</script>`)
    .join('\n    ')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#12251a" />
    <meta name="description" content="${esc(o.description)}" />
    <meta name="p:domain_verify" content="${PINTEREST_VERIFY}" />
    <link rel="canonical" href="${SITE}${o.path}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" href="/icon.png" sizes="512x512" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="DogLeg" />
    <meta property="og:title" content="${esc(o.title)}" />
    <meta property="og:description" content="${esc(o.description)}" />
    <meta property="og:url" content="${SITE}${o.path}" />
    <meta property="og:image" content="${esc(og.url)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${og.width}" />
    <meta property="og:image:height" content="${og.height}" />
    <meta property="og:image:alt" content="${esc(og.alt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(o.title)}" />
    <meta name="twitter:description" content="${esc(o.description)}" />
    <meta name="twitter:image" content="${esc(og.url)}" />
    ${jsonLd}
    <title>${esc(o.title)}</title>
    <style>${fontsCss()}${themeCss()}${PAGE_CSS}</style>
  </head>
  <body>
    <div class="wrap">
      <header class="topbar">
        <a class="mark" href="/" aria-label="DogLeg home">${wordmarkSvg()}</a>
        <nav class="topnav">
          <a href="/courses/">Courses</a>
          <a href="/how-to-play/">How to play</a>
          <a href="/changelog/">Change log</a>
        </nav>
      </header>
      <main>
        <p class="kicker">${esc(o.kicker)}</p>
${o.bodyHtml}
        <div class="cta-row">
          <a class="cta" href="/">Play today's round</a>
          <p class="cta-note">Free, no account needed — a new course every day, about 2 minutes a round.</p>
        </div>
      </main>
      <footer class="site">
        <span><span class="dot"></span>playdogleg.com</span>
        <a href="/">Play</a>
        <a href="/courses/">All courses</a>
        <a href="/how-to-play/">How to play</a>
        <a href="/changelog/">Change log</a>
      </footer>
    </div>
  </body>
</html>
`
}

// ------------------------------------------------------------ course pages --

function scorecardTable(c: CourseSpec, holesSlice: HoleSpec[], label: string, totLabel: string): string {
  const rows = holesSlice
    .map(
      (h) =>
        `<tr><td>${h.number}</td><td>${h.par}</td><td>${fmtYds(h.yards)}</td><td>${h.strokeIndex}</td></tr>`,
    )
    .join('')
  const par = holesSlice.reduce((s, h) => s + h.par, 0)
  const yds = holesSlice.reduce((s, h) => s + h.yards, 0)
  return `<table class="card">
  <caption>${esc(label)}</caption>
  <thead><tr><th scope="col">Hole</th><th scope="col">Par</th><th scope="col">Yards</th><th scope="col">Index</th></tr></thead>
  <tbody>${rows}<tr><td class="tot">${totLabel}</td><td class="tot">${par}</td><td class="tot">${fmtYds(yds)}</td><td></td></tr></tbody>
</table>`
}

export function coursePath(c: CourseSpec): string {
  return `/courses/${c.slug}/`
}

export function pinImageUrl(c: CourseSpec): string {
  return `${SITE}/pins/${c.slug}.png?v=${PIN_IMG_VERSION}`
}

/** dist-relative name for a hole card, e.g. 'oakmont-h3.png'. Shared by the
 *  renderer and the URL helper so the two can't drift apart. */
export function holePinFile(c: CourseSpec, hole: HoleSpec): string {
  return `${c.slug}-h${hole.number}.png`
}

export function holePinImageUrl(c: CourseSpec, hole: HoleSpec): string {
  return `${SITE}/pins/${holePinFile(c, hole)}?v=${PIN_IMG_VERSION}`
}

export function coursePage(c: CourseSpec): string {
  const par = coursePar(c)
  const yards = courseYards(c)
  const rating = PLAY_RATINGS[c.slug]
  const sig = signatureHole(c)
  const notes = c.holes.filter((h) => h.signature)
  const idx = ALL_COURSES.indexOf(c)
  const prev = ALL_COURSES[(idx - 1 + ALL_COURSES.length) % ALL_COURSES.length]
  const next = ALL_COURSES[(idx + 1) % ALL_COURSES.length]
  const short = c.holes.length !== 18

  const scorecards = short
    ? scorecardTable(c, c.holes, 'Scorecard', 'TOT')
    : scorecardTable(c, c.holes.slice(0, 9), 'Front nine', 'OUT') + scorecardTable(c, c.holes.slice(9), 'Back nine', 'IN')

  const jsonLd: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'DogLeg', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Courses', item: `${SITE}/courses/` },
        { '@type': 'ListItem', position: 3, name: c.name, item: `${SITE}${coursePath(c)}` },
      ],
    },
  ]

  const body = `        <h1>${esc(c.name)}</h1>
        <p class="sub">${esc(c.location)} · as played in DogLeg, the free daily golf strategy game</p>
        <ul class="chips">
          <li>Par <b>${par}</b></li>
          <li><b>${fmtYds(yards)}</b> yds</li>
          ${rating ? `<li>Play Rating <b>${rating}/10</b></li>` : ''}
          <li>Greens <b>${esc(c.greens)}</b></li>
          <li>Wind <b>${c.wind} mph</b></li>
        </ul>
        <p>${esc(c.blurb)}</p>
        <p>${esc(courseProse(c))}</p>

        <h2>Signature hole — No. ${sig.number}, par ${sig.par}, ${fmtYds(sig.yards)} yds</h2>
        <figure class="holecard">
          ${holeMapSvg(c, sig)}
          <figcaption>${esc(sig.signature ?? `Stroke index ${sig.strokeIndex} — the toughest hole on the card.`)}</figcaption>
        </figure>

        <h2>Scorecard</h2>
        ${scorecards}
${
  notes.length
    ? `        <h2>Holes to know</h2>
        <ul class="notes">
${notes.map((h) => `          <li><b>No. ${h.number}</b> · par ${h.par}, ${fmtYds(h.yards)} yds — ${esc(h.signature!)}</li>`).join('\n')}
        </ul>`
    : ''
}
        <nav class="pager">
          <a href="${coursePath(prev)}">&larr; ${esc(prev.name)}</a>
          <a href="${coursePath(next)}">${esc(next.name)} &rarr;</a>
        </nav>`

  return pageShell({
    path: coursePath(c),
    title: `${c.name} — DogLeg course guide`,
    description: `${c.name} in DogLeg: par ${par}, ${fmtYds(yards)} yards${rating ? `, Play Rating ${rating}/10` : ''}. Scorecard, signature hole map, and how the course plays. ${c.blurb}`,
    kicker: 'Course guide',
    ogImage: {
      url: pinImageUrl(c),
      width: 1000,
      height: 1500,
      alt: `${c.name} — hole map and scorecard stats from DogLeg`,
    },
    jsonLd,
    bodyHtml: body,
  })
}

export function coursesIndexPage(): string {
  const rotation = COURSES
  const guests = GUEST_COURSES
  const shorts = PAR3_COURSES
  const card = (c: CourseSpec) => {
    const rating = PLAY_RATINGS[c.slug]
    return `          <li><a href="${coursePath(c)}">
            <span class="cname">${esc(c.name)}</span>
            <span class="cmeta">${esc(c.location)} · par ${coursePar(c)}${rating ? ` · rating ${rating}/10` : ''}</span>
          </a></li>`
  }
  const body = `        <h1>The course library</h1>
        <p class="sub">${rotation.length} championship courses in the daily rotation, plus short courses for unlimited play.</p>
        <p>Every day DogLeg deals one course from this library as the daily challenge — same course, same conditions, for everyone. Each guide below carries the full scorecard, a map of the signature hole drawn by the game's own engine, and how the course tends to play.</p>
        <h2>Daily rotation</h2>
        <ul class="grid">
${rotation.map(card).join('\n')}
        </ul>
${
  guests.length
    ? `        <h2>Guest courses</h2>
        <p>Off the rotation, open in unlimited play — and known to crash the daily on special occasions.</p>
        <ul class="grid">
${guests.map(card).join('\n')}
        </ul>`
    : ''
}
${
  shorts.length
    ? `        <h2>Short courses</h2>
        <p>Par-3 layouts for unlimited play — never the daily, always open.</p>
        <ul class="grid">
${shorts.map(card).join('\n')}
        </ul>`
    : ''
}`
  return pageShell({
    path: '/courses/',
    title: 'Golf courses in DogLeg — the full library',
    description: `All ${ALL_COURSES.length} courses in DogLeg, the free daily golf strategy game: scorecards, signature-hole maps, play ratings, and how each course plays.`,
    kicker: 'Courses',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'DogLeg', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Courses', item: `${SITE}/courses/` },
        ],
      },
    ],
    bodyHtml: body,
  })
}

// -------------------------------------------------------------- static pages --

export function howToPlayPage(): string {
  const grades = ROUGH_GRADES.map(
    (g) => `          <li><b>${esc(g.name)}</b> (${esc(g.where)}) — ${esc(g.line)}</li>`,
  ).join('\n')
  const body = `        <h1>How to play DogLeg</h1>
        <p class="sub">One course a day, 18 holes, about 2 minutes — every decision shifts the odds.</p>

        <h2>One round, one goal</h2>
        <p>A new course every day. Beat the course and <b>break par</b> — the course wins most days, so a good score is worth bragging about. Everyone plays the same course under the same conditions, so the group chat comparison is honest.</p>

        <h2>Every shot is a call</h2>
        <p>Play each shot <b>Safe</b>, <b>Normal</b>, or <b>Aggressive</b>. Before you commit, the odds bar shows your real chances — green is good, red is trouble, and the bar never lies. You get <b>8 aggressive plays</b> a round, so spend them where they matter.</p>

        <h2>Watch the flag</h2>
        <p>On par 3s, the day's <b>pin position</b> is part of the call. A sucker pin pays the aggressive hunt with closer looks — and punishes the miss harder. A friendly flag is a green light for everyone. The chips at the tee tell you which one you're facing.</p>

        <h2>Not all rough is rough</h2>
        <p>Miss the fairway and the lie is part of the story. Three grades, and the map always shows which one you're in:</p>
        <ul class="notes">
${grades}
        </ul>
        <p>Out of the deep stuff you'll save par a lot less often — sometimes the play is simply to wedge out and live with the bogey.</p>

        <h2>Pick your player</h2>
        <p>Before the round, choose an edge for all 18 holes: <b>Fairway Finder</b> (big off the tee), <b>Dart Thrower</b> (sticks approaches), or <b>Greens Keeper</b> (deadly putter). Each is a real edge — pick for the course in front of you.</p>

        <h2>See it your way, then share it</h2>
        <p>Toggle between the modern top-down map and the classic side view any time. Finish the round and copy your score card straight to the group chat — the squares tell the story, no spoilers.</p>

        <h2>Fortunes</h2>
        <p>Every so often the golf gods simply smile on you: a <b>hole in one</b> or an <b>albatross</b>, out of pure luck — the best score a hole can give. That's a <b>Fortune</b>, and it can strike on any hole, any day, for any player. But the golf gods reward the faithful — post your daily cards under a clubhouse name, keep your streak alive, and your odds of striking a Fortune quietly improve.</p>`
  return pageShell({
    path: '/how-to-play/',
    title: 'How to play DogLeg — the daily golf strategy game',
    description:
      'Learn DogLeg in two minutes: play every shot Safe, Normal, or Aggressive against real odds, read the pin, survive the rough, and beat the course.',
    kicker: 'How to play',
    bodyHtml: body,
  })
}

export function changelogPage(): string {
  const entries = CHANGELOG.map(
    (e) => `          <li>
            <span class="when">${esc(e.date)}</span><span class="badge ${e.kind}">${esc(CHANGE_KIND_LABEL[e.kind])}</span>
            <p class="what">${esc(e.title)}</p>
            <p class="note">${esc(e.note)}</p>
          </li>`,
  ).join('\n')
  const body = `        <h1>Change log</h1>
        <p class="sub">The public record — when the odds move, it's written here.</p>
        <p>DogLeg's whole promise is that <b>the odds never lie</b>, which only means something if you can see when they moved. Every change to how a shot resolves is logged as an odds change; features and fixes are listed too.</p>
        <ul class="log">
${entries}
        </ul>`
  return pageShell({
    path: '/changelog/',
    title: 'DogLeg change log — every odds change, on the record',
    description:
      "The player-facing record of every change to DogLeg's odds, features, and fixes. When the math moves, it moves in the open.",
    kicker: 'Change log',
    bodyHtml: body,
  })
}

export function notFoundPage(): string {
  const body = `        <h1>Out of bounds</h1>
        <p class="sub">That page isn't on the card. Taking you back to the first tee&hellip;</p>
        <script>setTimeout(function () { window.location.replace('/') }, 2500)</script>`
  return pageShell({
    path: '/404.html',
    title: 'DogLeg — page not found',
    description: 'That page is out of bounds. Back to the first tee.',
    kicker: 'Rule 18.2',
    bodyHtml: body,
  })
}

// -------------------------------------------------------- sitemap / robots --

export function sitemapUrls(): string[] {
  return [
    `${SITE}/`,
    `${SITE}/courses/`,
    ...ALL_COURSES.map((c) => `${SITE}${coursePath(c)}`),
    `${SITE}/how-to-play/`,
    `${SITE}/changelog/`,
  ]
}

export function sitemapXml(): string {
  const urls = sitemapUrls()
    .map((u) => `  <url><loc>${u}</loc></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

export function robotsTxt(): string {
  return `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`
}

// ----------------------------------------------------------------- pin card --

/** Base64 @font-face block for file:// rasterisation (same trick as the OG
 *  card: a file:// @font-face is a cross-origin fetch Chrome fails silently,
 *  so the fonts ride inline). */
function embeddedFontsCss(): string {
  const face = (family: string, file: string, extra: string) => {
    const b64 = readFileSync(resolve(root, file)).toString('base64')
    return `@font-face{font-family:'${family}';font-style:normal;font-display:block;${extra}src:url(data:font/woff2;base64,${b64}) format('woff2');}`
  }
  return [
    face('Archivo Variable', FONT_FILES[0].src, 'font-weight:100 900;font-stretch:62% 125%;'),
    face('Barlow', FONT_FILES[2].src, 'font-weight:600;'),
    face('Barlow', FONT_FILES[3].src, 'font-weight:700;'),
  ].join('\n')
}

export const PIN_W = 1000
export const PIN_H = 1500

/**
 * The 2:3 Pinterest card — Pinterest's preferred 1000x1500.
 * Composition: kicker + course name up top, a real hole map as the hero, the
 * stat line and domain at the foot. Rasterised by scripts/pages-entry.tsx
 * --pins via scripts/lib/rasterise.ts.
 *
 * `hole` picks which hole the card leads with, defaulting to the course's
 * signature. One template rather than two: a hole card and a course card
 * differ only in which map is the hero and how the kicker reads, and forking
 * the markup would mean every future retune had to be made twice.
 */
export function pinCardHtml(c: CourseSpec, hole?: HoleSpec): string {
  const sig = hole ?? signatureHole(c)
  const isHoleCard = Boolean(hole)
  const rating = PLAY_RATINGS[c.slug]
  const stats = [
    `Par ${coursePar(c)}`,
    `${fmtYds(courseYards(c))} yds`,
    rating ? `Play Rating ${rating}/10` : null,
  ].filter(Boolean)
  return `<!doctype html>
<meta charset="utf-8">
<style>
${embeddedFontsCss()}
${themeCss()}
  html, body { margin: 0; padding: 0; }
  body {
    width: ${PIN_W}px; height: ${PIN_H}px; overflow: hidden;
    background: linear-gradient(180deg, var(--turf-800) 0%, var(--turf-900) 60%), var(--bg-page);
    color: var(--text-hi);
    font-family: var(--font-ui);
    display: flex; flex-direction: column; align-items: center;
  }
  .frame { position: absolute; inset: 26px; border: 1px solid var(--edge-hairline); border-radius: var(--r-card); pointer-events: none; }
  .head { text-align: center; padding-top: 78px; }
  .head .wordmark svg { width: 220px; height: auto; color: var(--text-hi); }
  .kicker { margin: 26px 0 10px; font-size: 26px; font-weight: 700; letter-spacing: var(--track-kicker); text-transform: uppercase; color: var(--sand-500); }
  h1 { margin: 0 60px; font-family: var(--font-display); font-variation-settings: 'wdth' var(--wdth-tower); font-weight: 650; font-size: 76px; line-height: 1.02; text-align: center; }
  .loc { margin: 12px 0 0; font-family: var(--font-display); font-variation-settings: 'wdth' var(--wdth-standard); font-weight: 600; font-size: 28px; color: var(--text-mid); text-align: center; }
  .hero { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; padding: 26px 0 10px; }
  .hero svg.holemap { height: 100%; max-height: 660px; width: auto; }
  .sigline { margin: 0 90px 26px; text-align: center; font-size: 25px; line-height: 1.35; color: var(--text-mid); }
  .stats { display: flex; gap: 14px; justify-content: center; margin-bottom: 34px; }
  .stats span { border: 1px solid var(--edge-hairline); background: var(--turf-900); border-radius: 999px; padding: 10px 26px; font-family: var(--font-display); font-variation-settings: 'wdth' var(--wdth-standard); font-weight: 700; font-size: 27px; }
  .domain { display: flex; align-items: center; gap: 13px; margin-bottom: 64px; font-family: var(--font-display); font-variation-settings: 'wdth' var(--wdth-standard); font-size: 26px; font-weight: 700; letter-spacing: 0.03em; color: var(--sand-500); }
  .domain::before { content: ''; width: 12px; height: 12px; border-radius: 999px; background: var(--flag-500); }
</style>
<div class="frame"></div>
<div class="head">
  <div class="wordmark">${wordmarkSvg()}</div>
  <p class="kicker">${isHoleCard ? 'Signature Hole' : 'Course Guide'} · No. ${sig.number} · Par ${sig.par}</p>
  <h1>${esc(c.name)}</h1>
  <p class="loc">${esc(c.location)}</p>
</div>
<div class="hero">${holeMapSvg(c, sig)}</div>
${sig.signature ? `<p class="sigline">${esc(sig.signature)}</p>` : ''}
<div class="stats">${stats.map((s) => `<span>${esc(s!)}</span>`).join('')}</div>
<div class="domain">playdogleg.com</div>
`
}

// -------------------------------------------------------------- everything --

export interface OutFile {
  /** dist-relative path, e.g. 'courses/pebble-beach/index.html' */
  path: string
  content: string
}

export function allFiles(): OutFile[] {
  return [
    ...ALL_COURSES.map((c) => ({ path: `courses/${c.slug}/index.html`, content: coursePage(c) })),
    { path: 'courses/index.html', content: coursesIndexPage() },
    { path: 'how-to-play/index.html', content: howToPlayPage() },
    { path: 'changelog/index.html', content: changelogPage() },
    { path: '404.html', content: notFoundPage() },
    { path: 'sitemap.xml', content: sitemapXml() },
    { path: 'robots.txt', content: robotsTxt() },
  ]
}
