/**
 * Guards the generated marketing pages — the crawlable surface (SEO) and the
 * Pinterest feedstock (SmartPin reads a page's images and copy) that ride
 * every `pnpm build`.
 *
 * Like the OG-card test, this pins what a test can actually hold: that every
 * course in the library gets a page, that each page carries the metadata the
 * crawlers and the Pinterest claim need, that the sitemap and robots agree
 * with the pages that exist, and that the hole map really rendered (an empty
 * <svg> would ship silently otherwise). Look, don't guess: the pages
 * themselves are reviewed by eye at /courses/ on a `pnpm preview` build.
 */
import { describe, it, expect } from 'vitest'
import { ALL_COURSES } from '../src/engine/courses'
import { CHANGELOG } from '../src/lib/changelog'
import {
  allFiles,
  coursePage,
  coursesIndexPage,
  changelogPage,
  howToPlayPage,
  notFoundPage,
  pinCardHtml,
  sitemapUrls,
  sitemapXml,
  robotsTxt,
  coursePath,
  PINTEREST_VERIFY,
  SITE,
} from './lib/pages'

describe('course pages', () => {
  it('covers the whole library — rotation, guests, short courses', () => {
    const paths = allFiles().map((f) => f.path)
    for (const c of ALL_COURSES) {
      expect(paths).toContain(`courses/${c.slug}/index.html`)
    }
  })

  it('every page carries canonical, Pinterest claim, OG image and a rendered hole map', () => {
    for (const c of ALL_COURSES) {
      const html = coursePage(c)
      expect(html, c.slug).toContain(`<link rel="canonical" href="${SITE}${coursePath(c)}" />`)
      expect(html, c.slug).toContain(`<meta name="p:domain_verify" content="${PINTEREST_VERIFY}" />`)
      expect(html, c.slug).toContain(`${SITE}/pins/${c.slug}.png`)
      // the real HoleMap rendered with real zones — not an empty frame
      expect(html, c.slug).toContain('class="holemap"')
      expect(html, c.slug).toContain('aria-label="Hole ')
      // one scorecard row per hole
      const rows = html.match(/<tr><td>\d+<\/td>/g) ?? []
      expect(rows.length, c.slug).toBe(c.holes.length)
    }
  })

  it('page copy shows the card, not the engine: no odds internals leak', () => {
    for (const c of ALL_COURSES) {
      const html = coursePage(c)
      // `difficulty` is the internal odds knob (CourseSpec.difficulty); pages
      // may only show the public Play Rating
      expect(html, c.slug).not.toMatch(/difficulty/i)
    }
  })

  it('JSON-LD on a course page parses and breadcrumbs to the course', () => {
    const c = ALL_COURSES[0]
    const html = coursePage(c)
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
    expect(blocks.length).toBeGreaterThan(0)
    const crumbs = JSON.parse(blocks[0][1])
    expect(crumbs['@type']).toBe('BreadcrumbList')
    expect(crumbs.itemListElement.at(-1).item).toBe(`${SITE}${coursePath(c)}`)
  })
})

describe('static pages', () => {
  it('index, how-to-play, changelog and 404 all build with the claim tag', () => {
    for (const html of [coursesIndexPage(), howToPlayPage(), changelogPage(), notFoundPage()]) {
      expect(html).toContain(`<meta name="p:domain_verify" content="${PINTEREST_VERIFY}" />`)
      expect(html).toContain('<a class="cta" href="/">')
    }
  })

  it('the changelog page carries every entry', () => {
    const html = changelogPage()
    for (const e of CHANGELOG) {
      expect(html).toContain(e.date)
    }
  })
})

describe('sitemap and robots', () => {
  it('sitemap lists home, the hubs, and every course exactly once', () => {
    const urls = sitemapUrls()
    expect(urls).toContain(`${SITE}/`)
    expect(urls).toContain(`${SITE}/courses/`)
    expect(urls).toContain(`${SITE}/how-to-play/`)
    expect(urls).toContain(`${SITE}/changelog/`)
    for (const c of ALL_COURSES) expect(urls).toContain(`${SITE}${coursePath(c)}`)
    expect(new Set(urls).size).toBe(urls.length)
    // every sitemap URL has a generated file behind it (home is the app's own
    // index.html, built by vite, not by the generator)
    const paths = new Set(allFiles().map((f) => f.path))
    for (const u of urls) {
      if (u === `${SITE}/`) continue
      expect(paths.has(`${u.slice(SITE.length + 1)}index.html`), u).toBe(true)
    }
    // and the XML wraps them all
    const xml = sitemapXml()
    for (const u of urls) expect(xml).toContain(`<loc>${u}</loc>`)
  })

  it('robots points at the sitemap and blocks nothing', () => {
    const txt = robotsTxt()
    expect(txt).toContain(`Sitemap: ${SITE}/sitemap.xml`)
    expect(txt).toContain('Allow: /')
    expect(txt).not.toMatch(/Disallow: \/\S/)
  })
})

describe('pin cards', () => {
  it('every course card builds at 2:3 with the map, the name and the domain', () => {
    for (const c of ALL_COURSES) {
      const html = pinCardHtml(c)
      expect(html, c.slug).toContain('width: 1000px; height: 1500px')
      expect(html, c.slug).toContain('class="holemap"')
      expect(html, c.slug).toContain('playdogleg.com')
      // fonts must ride inline: a file:// @font-face silently falls back
      expect(html, c.slug).toContain('data:font/woff2;base64,')
    }
  })
})
