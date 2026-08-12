// Record-steal notification email: copy + Resend delivery.
//
// The card itself is the shared chassis in ../_shared/email-chassis.ts, which
// every DogLeg email renders through — including the sign-in and confirm-email
// templates that used to be dashboard-only. This file is just the copy.
//
// Deliberately pure (no Deno APIs, no supabase-js, no engine imports) so the
// module can be unit-tested by the regular vitest suite — fetch is injected
// rather than reached for globally.

import { escapeHtml, renderEmail } from '../_shared/email-chassis.ts'

export type StealEmailInput = {
  courseName: string
  thiefName: string
  siteUrl: string
  /** set → a SEASON record fell, and this is its archival label ("Summer
   * 2026"); absent → the all-time course record. The two must never read
   * alike: the season loss has a clock on it (the horn), the all-time loss
   * doesn't, and both say plainly which wall the name came off. */
  seasonLabel?: string
}

export function buildStealEmail(input: StealEmailInput): { subject: string; text: string; html: string } {
  const { courseName, thiefName, siteUrl, seasonLabel } = input
  const subject = seasonLabel
    ? `Your season record at ${courseName} just got stolen`
    : `Your record at ${courseName} just got stolen`
  const boardNoun = seasonLabel ? `the ${seasonLabel} season board` : 'the all-time board'
  const urgency = seasonLabel
    ? `There's still time before the horn — grab your clubs.`
    : `Records don't defend themselves — grab your clubs.`
  const text = [
    `${thiefName} just knocked you off the top of ${boardNoun} at ${courseName}.`,
    '',
    urgency,
    '',
    `Take it back: ${siteUrl}`,
  ].join('\n')

  const thief = escapeHtml(thiefName)
  const course = escapeHtml(courseName)
  const url = escapeHtml(siteUrl)
  const season = seasonLabel ? escapeHtml(seasonLabel) : null

  // The who/where goes in the lower-third slab rather than the sentence: it is
  // the whole payload of this mail, and it survives being skimmed in a
  // notification shade. The lead carries the needle instead. The "Record" row
  // is the differentiator — all-time and season thefts must be tellable apart
  // at a glance.
  const html = renderEmail({
    title: season ? `Season record stolen at ${course}` : `Record stolen at ${course}`,
    preheader: season
      ? `${thief} now holds the ${season} season record at ${course}.`
      : `${thief} now holds the all-time course record at ${course}.`,
    headline: season ? 'Your season record&rsquo;s been stolen' : 'Your record&rsquo;s been stolen',
    leadHtml: season
      ? 'Someone just knocked you off the top of the season board. There&rsquo;s still time before the horn &mdash; grab your clubs.'
      : 'Someone just knocked you off the top of the board. Records don&rsquo;t defend themselves &mdash; grab your clubs.',
    block: [
      { label: 'Course', value: course },
      { label: 'Record', value: season ? `${season} season` : 'All-time course record' },
      { label: 'New record holder', value: thief },
    ],
    cta: { label: 'Take it back', url },
    fallbackUrl: url,
    footerFineHtml:
      'You&rsquo;re getting this because your clubhouse is linked to this email and someone took what&rsquo;s yours. At most one of these per record per day.',
  })

  return { subject, text, html }
}

/** One POST to Resend, no retries — the dedupe row was already written, so a
 *  failed send stays failed (at-most-once, by design). */
export async function sendViaResend(
  fetchFn: typeof fetch,
  apiKey: string,
  from: string,
  to: string,
  msg: { subject: string; text: string; html: string },
): Promise<{ ok: boolean; status: number }> {
  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject: msg.subject, html: msg.html, text: msg.text }),
  })
  return { ok: res.ok, status: res.status }
}
