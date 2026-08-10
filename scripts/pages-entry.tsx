/**
 * Writes the static marketing pages (scripts/lib/pages.tsx) into the build.
 *
 * Runs AS A VITE SSR BUNDLE, not directly under node: the builders render
 * real app components (HoleMap, Wordmark) so they need JSX, which node's
 * type-stripping can't do. `pnpm gen:pages` builds this entry with
 * vite.pages.config.ts to scripts-dist/gen-pages.mjs, then executes it —
 * same pattern as build:validator bundling the engine for the edge function.
 *
 *   node scripts-dist/gen-pages.mjs [--out dist]         pages + sitemap +
 *                                                        robots + 404 + fonts
 *   node scripts-dist/gen-pages.mjs --pins [--out dist]  the 2:3 Pinterest
 *                                                        card per course, to
 *                                                        <out>/pins/ (needs
 *                                                        Chrome; deploy-only)
 *
 * Pages ride `pnpm build` so they can never go stale; pin cards are rendered
 * by headless Chrome in the deploy workflow (and by hand for previews) so PR
 * CI never needs a browser.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ALL_COURSES } from '../src/engine/courses'
import { allFiles, pinCardHtml, FONT_FILES, PIN_W, PIN_H } from './lib/pages'
import { shotHtml } from './lib/rasterise'

const args = process.argv.slice(2)
const outFlag = args.indexOf('--out')
const outDir = resolve(process.cwd(), outFlag !== -1 ? args[outFlag + 1] : 'dist')

if (args.includes('--pins')) {
  const pinsDir = resolve(outDir, 'pins')
  mkdirSync(pinsDir, { recursive: true })
  for (const c of ALL_COURSES) {
    const out = resolve(pinsDir, `${c.slug}.png`)
    shotHtml(pinCardHtml(c), out, { width: PIN_W, height: PIN_H, scale: 1, tag: `pin-${c.slug}` })
    console.log(`pins/${c.slug}.png  ${PIN_W}x${PIN_H}`)
  }
  console.log(`${ALL_COURSES.length} pin cards -> ${pinsDir}`)
} else {
  const files = allFiles()
  for (const f of files) {
    const path = resolve(outDir, f.path)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, f.content)
  }
  const fontsDir = resolve(outDir, 'fonts')
  mkdirSync(fontsDir, { recursive: true })
  for (const f of FONT_FILES) {
    copyFileSync(resolve(process.cwd(), f.src), resolve(fontsDir, f.out))
  }
  console.log(`${files.length} pages + ${FONT_FILES.length} fonts -> ${outDir}`)
}
