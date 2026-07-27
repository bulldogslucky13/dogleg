/**
 * Email wordmark generator (build-time tool — never runs in the app).
 *
 * Email clients are the one place the real <Wordmark/> can't go: Gmail strips
 * inline SVG outright, and Outlook's Word engine won't lay it out. So the
 * masthead in our transactional mail is a raster of the same mark, and this
 * script is what keeps the two honest — it reads src/ui/Wordmark.tsx, the
 * actual component, and re-emits it as
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
 *
 * Run:  pnpm gen:email-wordmark
 *       pnpm gen:email-wordmark --print   # emit the SVG to stdout, write nothing
 *
 * Rasterising uses headless Chrome (already on any machine that browses); no
 * node-canvas/sharp dependency for a file that changes once a rebrand.
 */
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'

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

const CHROMES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

/** Find the `>` that closes an opening tag, ignoring any that sit inside
 *  quotes or a JSX `{...}` expression. Regex can't be trusted here — the
 *  attribute values contain both. */
function endOfOpenTag(src: string, from: number): number {
  let quote: string | null = null
  let braces = 0
  for (let i = from; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '{') braces++
    else if (c === '}') braces--
    else if (c === '>' && braces === 0) return i
  }
  throw new Error('unterminated opening tag')
}

function buildSvg(): string {
  const componentPath = resolve(root, 'src/ui/Wordmark.tsx')
  const src = readFileSync(componentPath, 'utf8')

  const open = src.indexOf('<svg')
  if (open < 0) throw new Error(`no <svg> found in ${componentPath}`)
  const close = src.lastIndexOf('</svg>')
  if (close < 0) throw new Error(`no </svg> found in ${componentPath}`)

  // viewBox has to come off the component too — the lockup's framing is a
  // design decision that lives there (see the note about the tighter crop).
  const viewBox = /viewBox="([^"]+)"/.exec(src.slice(open, endOfOpenTag(src, open)))?.[1]
  if (!viewBox) throw new Error('could not read viewBox from Wordmark.tsx')

  const body = src
    .slice(endOfOpenTag(src, open) + 1, close)
    // JSX comments carry the component's annotations; they aren't valid SVG
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    // JSX camelCase presentation attributes -> SVG kebab-case
    .replace(/\bstrokeWidth=/g, 'stroke-width=')
    .replace(/\bstrokeLinejoin=/g, 'stroke-linejoin=')
    .replace(/\bstrokeLinecap=/g, 'stroke-linecap=')
    .replace(/\bstrokeDasharray=/g, 'stroke-dasharray=')
    .replace(/\bfillRule=/g, 'fill-rule=')
    .replace(/\bclipRule=/g, 'clip-rule=')
    // no cascade and no custom properties in mail: resolve both
    .replace(/var\(--logo-cup-rim[^)]*\)/g, INK.cupRim)
    .replace(/var\(--logo-cup[^)]*\)/g, INK.cup)
    .replace(/var\(--logo-flag[^)]*\)/g, INK.flag)
    .replace(/currentColor/g, INK.letters)
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (body.includes('var(--')) {
    throw new Error(`unresolved CSS custom property in wordmark; teach INK about it:\n${body.match(/var\(--[^)]*\)/g)?.join('\n')}`)
  }

  const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number)
  const height = Math.round((DISPLAY_WIDTH * vbH) / vbW)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${DISPLAY_WIDTH}" height="${height}" role="img" aria-label="DogLeg">
  <title>DogLeg</title>
  ${body.replace(/\n/g, '\n  ')}
</svg>
`
}

function rasterise(svg: string, outPng: string, width: number, height: number): void {
  const chrome = CHROMES.find((p) => {
    try {
      execFileSync('test', ['-x', p])
      return true
    } catch {
      return false
    }
  })
  if (!chrome) {
    throw new Error(`no Chrome/Chromium found; looked in:\n  ${CHROMES.join('\n  ')}`)
  }

  // A wrapper page pins the exact pixel box; screenshotting the .svg directly
  // lets Chrome pick its own viewport and paints an opaque white ground.
  const page = `<!doctype html><meta charset="utf-8">
<style>
  html,body { margin:0; padding:0; background:transparent; }
  svg { display:block; width:${width}px; height:${height}px; }
</style>
${svg}`
  const tmp = resolve(tmpdir(), `dogleg-wordmark-${process.pid}.html`)
  writeFileSync(tmp, page)
  try {
    execFileSync(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        // transparent ground, so the mark sits on whatever the masthead is
        '--default-background-color=00000000',
        '--force-device-scale-factor=2', // 2x for retina inboxes
        `--window-size=${width},${height}`,
        `--screenshot=${outPng}`,
        `file://${tmp}`,
      ],
      { stdio: 'ignore' },
    )
  } finally {
    rmSync(tmp, { force: true })
  }
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
  rasterise(svg, outPng, width, height)

  console.log(`wordmark-email.svg  ${width}x${height}`)
  console.log(`wordmark-email.png  ${width * 2}x${height * 2} (2x)`)
}
