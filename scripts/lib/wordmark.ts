/**
 * Reads the real <Wordmark/> component and hands back plain SVG.
 *
 * Two build-time tools need the mark outside React — the email masthead
 * (scripts/gen-email-wordmark.ts) and the link-preview card
 * (scripts/gen-og-image.ts) — and both must show the SAME logo the app shows.
 * Parsing src/ui/Wordmark.tsx, rather than keeping a copied-out duplicate of
 * the path data, is what guarantees that: retune the mark once and every
 * generated asset follows. The paths are long enough that a hand-transcribed
 * copy would rot silently.
 *
 * What comes back is deliberately UNRESOLVED — `currentColor` and the
 * `var(--logo-*)` custom properties are left exactly as the component wrote
 * them. The two callers want opposite things: a browser can resolve both
 * against theme.css, and mail can resolve neither. Substituting here would
 * force the browser case to undo the work.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type ExtractedWordmark = {
  /** the component's own viewBox — the lockup's framing is a design decision
   *  that lives there, not something a caller should re-invent */
  viewBox: string
  /** everything between <svg> and </svg>, valid SVG rather than JSX */
  body: string
  /** viewBox width/height, parsed, for callers sizing the mark */
  width: number
  height: number
}

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

/** @param root repo root; the component is read from src/ui/Wordmark.tsx */
export function extractWordmark(root: string): ExtractedWordmark {
  const componentPath = resolve(root, 'src/ui/Wordmark.tsx')
  const src = readFileSync(componentPath, 'utf8')

  const open = src.indexOf('<svg')
  if (open < 0) throw new Error(`no <svg> found in ${componentPath}`)
  const close = src.lastIndexOf('</svg>')
  if (close < 0) throw new Error(`no </svg> found in ${componentPath}`)

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
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number)

  return { viewBox, body, width: vbW, height: vbH }
}
