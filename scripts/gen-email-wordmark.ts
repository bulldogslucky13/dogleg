/**
 * Email wordmark generator (build-time tool — never runs in the app).
 *
 * Email clients are the one place the real <Wordmark/> can't go: Gmail strips
 * inline SVG outright, and Outlook's Word engine won't lay it out. So the
 * masthead in our transactional mail is a raster of the same mark, and this
 * script is what keeps the two honest — it reads src/ui/Wordmark.tsx, the
 * actual component (via scripts/lib/wordmark.ts), and re-emits it as
 *
 *   public/brand/wordmark-email.svg   standalone, colours resolved to literals
 *   public/brand/wordmark-email.png   2x raster, transparent, what mail loads
 *
 * Reading the component (rather than a copied-out copy of the path data) is the
 * whole point: retune the logo and one `pnpm gen:email-wordmark` carries it to
 * the inbox. The paths are long enough that hand-transcription would rot
 * silently.
 *
 * Two things the component does that a standalone file can't:
 *   - the letters take `currentColor`, inheriting ink from whatever they sit in
 *   - the pennant and cup read --logo-* from theme.css
 * Mail has no cascade to inherit from and no custom properties, so both get
 * resolved here against INK below — the email masthead's own ink, matching
 * theme.css's --text-hi / --logo-flag / --logo-cup / --logo-cup-rim.
 * (The link-preview card, scripts/gen-og-image.ts, renders in a real browser
 * and so leaves both alone — that is why resolution lives here, not in the
 * shared extractor.)
 *
 * Run:  pnpm gen:email-wordmark
 *       pnpm gen:email-wordmark --print   # emit the SVG to stdout, write nothing
 *
 * Rasterising uses headless Chrome (already on any machine that browses); no
 * node-canvas/sharp dependency for a file that changes once a rebrand.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { extractWordmark } from './lib/wordmark.ts'
import { shotHtml } from './lib/rasterise.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The email masthead's ink. Mirrors theme.css: --text-hi (sand-100) for the
 *  letterforms, --logo-flag / --logo-cup / --logo-cup-rim for the three parts
 *  that carry their own colour. Keep in step with that file. */
const INK = {
  letters: '#f8f3e4', // --text-hi / --sand-100
  flag: '#d94a32', // --logo-flag / --flag-500
  cup: '#0e2114', // --logo-cup / --turf-950
  cupRim: '#2a5f33', // --logo-cup-rim
} as const

/** Display width in the email, in CSS px. The card is 480px wide with 32px
 *  padding, so 200 leaves the mark comfortably inside the measure. */
const DISPLAY_WIDTH = 200

function buildSvg(): string {
  const { viewBox, body: raw, width: vbW, height: vbH } = extractWordmark(root)

  const body = raw
    // no cascade and no custom properties in mail: resolve both
    .replace(/var\(--logo-cup-rim[^)]*\)/g, INK.cupRim)
    .replace(/var\(--logo-cup[^)]*\)/g, INK.cup)
    .replace(/var\(--logo-flag[^)]*\)/g, INK.flag)
    .replace(/currentColor/g, INK.letters)

  if (body.includes('var(--')) {
    throw new Error(`unresolved CSS custom property in wordmark; teach INK about it:\n${body.match(/var\(--[^)]*\)/g)?.join('\n')}`)
  }

  const height = Math.round((DISPLAY_WIDTH * vbH) / vbW)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${DISPLAY_WIDTH}" height="${height}" role="img" aria-label="DogLeg">
  <title>DogLeg</title>
  ${body.replace(/\n/g, '\n  ')}
</svg>
`
}

const svg = buildSvg()

if (process.argv.includes('--print')) {
  process.stdout.write(svg)
} else {
  const width = Number(/width="(\d+)"/.exec(svg)![1])
  const height = Number(/height="(\d+)"/.exec(svg)![1])
  const outDir = resolve(root, 'public/brand')
  mkdirSync(outDir, { recursive: true })

  const outSvg = resolve(outDir, 'wordmark-email.svg')
  const outPng = resolve(outDir, 'wordmark-email.png')
  writeFileSync(outSvg, svg)

  // A wrapper page pins the exact pixel box; screenshotting the .svg directly
  // lets Chrome pick its own viewport and paints an opaque white ground.
  shotHtml(
    `<!doctype html><meta charset="utf-8">
<style>
  html,body { margin:0; padding:0; background:transparent; }
  svg { display:block; width:${width}px; height:${height}px; }
</style>
${svg}`,
    outPng,
    { width, height, scale: 2, transparent: true, tag: 'wordmark' },
  )

  console.log(`wordmark-email.svg  ${width}x${height}`)
  console.log(`wordmark-email.png  ${width * 2}x${height * 2} (2x)`)
}
