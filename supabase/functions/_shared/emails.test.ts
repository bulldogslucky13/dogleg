// Unit tests for the shared email chassis and the Auth templates it renders.
//
// Most of these are regression guards for things that fail SILENTLY in a mail
// client — you don't find out from an exception, you find out from a player who
// can't sign in, or a screenshot of a card with no colour in it. Cheap to
// assert, expensive to discover.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { renderEmail, escapeHtml, WORDMARK_URL, SITE_URL } from './email-chassis.ts'
import { AUTH_EMAILS } from './auth-emails.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const sample = renderEmail({
  title: 'Title',
  preheader: 'Preview line',
  headline: 'Headline',
  leadHtml: 'Lead with <strong>markup</strong>.',
  block: [{ label: 'Course', value: 'Whistling Straits' }],
  cta: { label: 'Do the thing', url: 'https://example.test/go' },
  fallbackUrl: 'https://example.test/go',
  footerFineHtml: 'Fine print.',
})

describe('renderEmail', () => {
  it('renders every content slot', () => {
    expect(sample).toContain('<title>Title</title>')
    expect(sample).toContain('Preview line')
    expect(sample).toContain('Headline')
    expect(sample).toContain('Lead with <strong>markup</strong>.')
    expect(sample).toContain('Whistling Straits')
    expect(sample).toContain('Do the thing')
    expect(sample).toContain('href="https://example.test/go"')
    expect(sample).toContain('Fine print.')
  })

  it('omits the lower-third slab when there is no data for it', () => {
    const bare = renderEmail({
      title: 't',
      preheader: 'p',
      headline: 'h',
      leadHtml: 'l',
      cta: { label: 'c', url: 'https://example.test' },
      footerFineHtml: 'f',
    })
    // the slab is the only thing wearing the light blocked surface
    expect(bare).not.toContain('#efe6cd')
  })

  // Mail has no cascade and no custom properties: a var() that leaked out of
  // the theme.css port would render as *nothing* — invisible text on a card
  // that still looks structurally fine in a browser preview.
  it('resolves every design token to a literal — no var() survives', () => {
    expect(sample).not.toContain('var(--')
  })

  // Outlook's Word rendering engine drops rgba() outright, taking the whole
  // declaration with it. theme.css's translucent tiers are pre-composited in
  // INK for exactly this reason; this keeps them that way.
  it('uses no rgba() colours', () => {
    expect(sample).not.toMatch(/rgba\(/)
  })

  it('loads the wordmark over absolute https — relative paths do not resolve in mail', () => {
    expect(WORDMARK_URL).toMatch(/^https:\/\//)
    expect(sample).toContain(`src="${WORDMARK_URL}"`)
    expect(SITE_URL).toMatch(/^https:\/\//)
  })

  // Gmail blocks remote images on first open. A height attribute would keep the
  // masthead reserving its box and leave the alt text floating above a hole.
  it('gives the masthead image a width but no height attribute', () => {
    // anchored on src= so this finds the tag, not the literal <img> that
    // appears in the comment explaining why the height is missing
    const img = /<img\s[^>]*src=[^>]*>/.exec(sample)![0]
    expect(img).toContain('width="200"')
    expect(img).not.toMatch(/\sheight="/)
    expect(img).toContain('alt="DogLeg"')
  })
})

describe('escapeHtml', () => {
  it('neutralises the characters that could break out of an attribute or tag', () => {
    expect(escapeHtml(`<script>&"'`)).toBe('&lt;script&gt;&amp;&quot;&#39;')
  })

  it('escapes the ampersand first, so escapes are not double-escaped', () => {
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
})

describe('AUTH_EMAILS', () => {
  it('covers exactly the two templates the app can actually reach', () => {
    // src/lib/auth.ts only ever calls signInWithOtp: no passwords, no phone,
    // no MFA, no OAuth identities, no invites. Adding a third here means a new
    // auth flow shipped — push it with pnpm push:email-templates.
    expect(AUTH_EMAILS.map((e) => e.key).sort()).toEqual(['confirmation', 'magic_link'])
  })

  for (const email of AUTH_EMAILS) {
    describe(email.key, () => {
      // The single highest-stakes assertion in this file: GoTrue substitutes
      // this token, so it has to reach the HTML raw. If the chassis ever starts
      // escaping content, sign-in breaks for everyone and the mail still looks
      // perfectly fine.
      it('passes {{ .ConfirmationURL }} through unescaped, in the button and the fallback', () => {
        // three times: the button href, the fallback href, and the fallback's
        // visible text — the "paste this into your browser" line shows the URL
        expect(email.html.split('{{ .ConfirmationURL }}').length - 1).toBe(3)
        expect(email.html).toContain('href="{{ .ConfirmationURL }}"')
        // the token must not arrive HTML-escaped in any form
        expect(email.html).not.toMatch(/\{\{\s*&/)
        expect(email.html).not.toContain('&lt;')
      })

      it('has a subject', () => {
        expect(email.subject.length).toBeGreaterThan(0)
      })

      // The committed HTML is what gets reviewed in a diff and pushed to the
      // project; a stale file means the review showed something that is not
      // what shipped. Regenerate with pnpm gen:email-templates.
      it('matches the committed file in supabase/templates', () => {
        const onDisk = readFileSync(resolve(repoRoot, 'supabase/templates', email.file), 'utf8')
        expect(onDisk).toContain(email.html)
        expect(onDisk).toContain(email.subject)
      })
    })
  }
})
