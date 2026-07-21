// Unit tests for the record-steal email module. email.ts is deliberately
// pure (no Deno, no network) so this file runs in the regular vitest suite.
import { describe, it, expect } from 'vitest'
import { buildStealEmail, sendViaResend } from './email.ts'

describe('buildStealEmail', () => {
  const input = {
    courseName: 'Pebble Creek',
    thiefName: "O'Brien <script>",
    siteUrl: 'https://dogleg.cameronbristol.xyz',
  }
  const msg = buildStealEmail(input)

  it('puts the course name in the subject', () => {
    expect(msg.subject).toContain('Pebble Creek')
  })

  it('names the thief, the course, and the site in the text body', () => {
    expect(msg.text).toContain("O'Brien <script>")
    expect(msg.text).toContain('Pebble Creek')
    expect(msg.text).toContain('https://dogleg.cameronbristol.xyz')
  })

  it('names the thief, the course, and links the site in the html body', () => {
    expect(msg.html).toContain('O&#39;Brien')
    expect(msg.html).toContain('Pebble Creek')
    expect(msg.html).toContain('href="https://dogleg.cameronbristol.xyz"')
  })

  it('escapes the thief name in html — no raw script tag survives', () => {
    expect(msg.html).not.toContain('<script>')
    expect(msg.html).toContain('&lt;script&gt;')
  })
})

describe('sendViaResend', () => {
  const msg = { subject: 'sub', text: 'txt', html: '<p>html</p>' }

  it('POSTs the message to Resend with the bearer key', async () => {
    let captured: { url: string; init: RequestInit } | undefined
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init! }
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    const result = await sendViaResend(fakeFetch, 'key-123', 'DogLeg <rec@dogleg.test>', 'holder@example.com', msg)

    expect(result).toEqual({ ok: true, status: 200 })
    expect(captured!.url).toBe('https://api.resend.com/emails')
    expect(captured!.init.method).toBe('POST')
    expect((captured!.init.headers as Record<string, string>).Authorization).toBe('Bearer key-123')
    expect(JSON.parse(captured!.init.body as string)).toEqual({
      from: 'DogLeg <rec@dogleg.test>',
      to: 'holder@example.com',
      subject: 'sub',
      html: '<p>html</p>',
      text: 'txt',
    })
  })

  it('maps a non-2xx response to ok: false with the status', async () => {
    const fakeFetch = (async () => new Response('nope', { status: 422 })) as typeof fetch
    const result = await sendViaResend(fakeFetch, 'k', 'f@t.test', 't@t.test', msg)
    expect(result).toEqual({ ok: false, status: 422 })
  })
})
