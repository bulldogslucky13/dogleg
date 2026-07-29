/**
 * Guards the link-preview card — the one brand surface with no eyes on it.
 *
 * Everything else that carries the logo is looked at constantly: the app on
 * every run, the emails at /_emails.html. The OG card is only ever seen by
 * someone who isn't us, in a thread we're not in, which is exactly how it spent
 * a week serving the pre-rebrand artwork after every other surface had moved.
 *
 * What a test can actually hold: that the file exists, that it is the size the
 * meta tags promise, that the tags point at it, and — since the card is
 * composed by a script that measures its own glyphs — that the composition
 * actually landed on the axis. Everything finer than that is what generating
 * it from Wordmark.tsx and theme.css is for (scripts/gen-og-image.ts), so
 * there is no hand-made artwork left to drift in the first place.
 *
 * Deliberately NOT asserted: the bytes of og.png. It is rasterised by whatever
 * Chrome is on the machine, so a byte-pin would fail on a Chrome update rather
 * than on a real regression — the failure mode CI cannot tell apart from a bug.
 * Where the ink SITS is different: that is geometry, and it holds across
 * Chrome builds to within a pixel or two.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
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

/** Horizontal extent of the card's LIGHT ink — the cream mark, the gold
 *  kicker, the red pennant, the grey tagline. Everything the composition is
 *  made of is far brighter than the turf background and the hairline frame, so
 *  one brightness cut separates them without needing to know the palette. */
function inkSpan(path: string): { left: number; right: number; centre: number } {
  const buf = readFileSync(path)
  let pos = 8
  let width = 0
  let height = 0
  let channels = 3
  const idat: Buffer[] = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      // 2 = truecolour, 6 = truecolour + alpha; the generator writes 2
      channels = data[9] === 6 ? 4 : 3
    }
    if (type === 'IDAT') idat.push(data)
    pos += 12 + len
  }
  // undo PNG's per-scanline filters (spec §9) — the pixels are needed, and a
  // decoder dependency for one test is a worse trade than thirty lines
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  let prev = Buffer.alloc(stride)
  let at = 0
  let left = Infinity
  let right = -1
  for (let y = 0; y < height; y++) {
    const filter = raw[at++]
    const line = raw.subarray(at, at + stride)
    at += stride
    const cur = Buffer.alloc(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[i] = v & 255
    }
    for (let x = 0; x < width; x++) {
      const i = x * channels
      if ((cur[i] + cur[i + 1] + cur[i + 2]) / 3 > 110) {
        if (x < left) left = x
        if (x > right) right = x
      }
    }
    prev = cur
  }
  return { left, right, centre: (left + right) / 2 }
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
      expect(url).toMatch(/^https:\/\/playdogleg\.com\/og\.png(\?|$)/)
    }
    expect(meta('name', 'twitter:image')).toBe(meta('property', 'og:image'))
  })

  it('sits on the horizontal axis, not near it', () => {
    // The card is centred by a script that measures its own glyphs at run
    // time (gen-og-image.ts). That measurement once ran before the webfonts
    // were applied, so it measured the FALLBACK face: the correction came out
    // ~30px short and the card shipped visibly left of centre, with nothing in
    // any diff to show for it. Nobody sees this surface in review, so the only
    // thing that can catch that is arithmetic.
    //
    // The tolerance is for rasterisation, not for composition: a different
    // Chrome antialiases an edge a pixel wider, it does not move the lockup.
    const { left, right, centre } = inkSpan(resolve(root, 'public/og.png'))
    const { width } = pngSize(resolve(root, 'public/og.png'))
    expect(right, 'no ink found — the card is blank or the brightness cut is wrong').toBeGreaterThan(left)
    expect(Math.abs(centre - width / 2), `ink spans ${left}..${right}, centre ${centre}, card centre ${width / 2}`).toBeLessThanOrEqual(8)
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
