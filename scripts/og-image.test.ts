/**
 * Guards the link-preview card — the one brand surface with no eyes on it.
 *
 * Everything else that carries the logo is looked at constantly: the app on
 * every run, the emails at /_emails.html. The OG card is only ever seen by
 * someone who isn't us, in a thread we're not in, which is exactly how it spent
 * a week serving the pre-rebrand artwork after every other surface had moved.
 *
 * What a test can actually hold: that the file exists, that it is the size the
 * meta tags promise, and that the tags point at it. Whether it looks right is
 * not assertable — that is what generating it from Wordmark.tsx and theme.css
 * is for (scripts/gen-og-image.ts), so there is no hand-made artwork left to
 * drift in the first place.
 *
 * Deliberately NOT asserted: the bytes of og.png. It is rasterised by whatever
 * Chrome is on the machine, so a byte-pin would fail on a Chrome update rather
 * than on a real regression — the failure mode CI cannot tell apart from a bug.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const html = readFileSync(resolve(root, 'index.html'), 'utf8')

/** Width/height straight out of the PNG's IHDR chunk: 8-byte signature, then a
 *  4-byte length and the "IHDR" tag, then two big-endian uint32s. No decoder
 *  needed, and no dependency for four bytes each. */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path)
  expect(buf.subarray(1, 4).toString('ascii'), `${path} is not a PNG`).toBe('PNG')
  expect(buf.subarray(12, 16).toString('ascii'), `${path} has no IHDR`).toBe('IHDR')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

const meta = (attr: 'property' | 'name', key: string): string => {
  const m = new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(html)
  if (!m) throw new Error(`index.html has no <meta ${attr}="${key}">`)
  return m[1]
}

describe('link preview card', () => {
  it('is the 1200x630 the meta tags promise', () => {
    // 1.91:1 — the large card in iMessage/Facebook/LinkedIn and X's
    // summary_large_image all crop to this, so authoring at exactly this size
    // means none of them cut into the lockup.
    const { width, height } = pngSize(resolve(root, 'public/og.png'))
    expect({ width, height }).toEqual({ width: 1200, height: 630 })
    expect(meta('property', 'og:image:width')).toBe(String(width))
    expect(meta('property', 'og:image:height')).toBe(String(height))
  })

  it('points Open Graph and Twitter at that same file', () => {
    // A relative path resolves against whatever site scraped it — never the
    // one we meant. Scrapers do not run JS and do not follow <base>.
    for (const url of [meta('property', 'og:image'), meta('name', 'twitter:image')]) {
      expect(url).toMatch(/^https:\/\/dogleg\.cameronbristol\.xyz\/og\.png(\?|$)/)
    }
    expect(meta('name', 'twitter:image')).toBe(meta('property', 'og:image'))
  })

  it('describes the card that actually ships, for anyone reading with alt text', () => {
    // The alt outlived the artwork last time: it went on describing an
    // illustrated hole for a week after that illustration was retired. Pin it
    // to the mark itself, which is what the card is now.
    for (const alt of [meta('property', 'og:image:alt'), meta('name', 'twitter:image:alt')]) {
      expect(alt).toMatch(/dogleg/i)
      expect(alt).not.toMatch(/illustrated/i)
    }
  })
})
