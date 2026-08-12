// The Supabase Auth emails, in version control at last.
//
// These two render to supabase/templates/*.html via `pnpm gen:email-templates`
// and are pushed to the project's auth config by scripts/push-email-templates.ts.
// Before this file they existed ONLY in the Supabase dashboard, which is how
// they drifted from the record-steal mail: nothing in a pull request could show
// you that a rebrand had missed them.
//
// Only these two are customised, and only these two are reachable: src/lib/auth.ts
// calls signInWithOtp and nothing else, so DogLeg has no password reset, no phone,
// no MFA, no OAuth identities and no invites. The other eleven templates in the
// project are Supabase stock for flows this app does not have.
//
// {{ .ConfirmationURL }} is a Go template token consumed by GoTrue — it has to
// reach the HTML unescaped, which is why the chassis takes already-escaped HTML
// and does not escape for you.

import { renderEmail } from './email-chassis.ts'

const CONFIRMATION_URL = '{{ .ConfirmationURL }}'

export type AuthEmail = {
  /** Supabase auth-config key stem: mailer_templates_<key>_content / mailer_subjects_<key> */
  key: 'magic_link' | 'confirmation'
  /** Filename under supabase/templates/ */
  file: string
  subject: string
  html: string
}

export const AUTH_EMAILS: AuthEmail[] = [
  {
    key: 'magic_link',
    file: 'magic-link.html',
    subject: "You're on the tee — sign in to DogLeg",
    html: renderEmail({
      title: 'Sign in to DogLeg',
      preheader: 'Your sign-in link is inside — it plays through once.',
      headline: 'You&rsquo;re on the tee',
      leadHtml:
        'Tap below to sign in and sync your clubhouse across devices. No password &mdash; the link does the work. It plays through once and expires shortly, so use it while it&rsquo;s fresh.',
      cta: { label: 'Sign in to DogLeg', url: CONFIRMATION_URL },
      fallbackUrl: CONFIRMATION_URL,
      footerFineHtml:
        'Didn&rsquo;t ask to sign in? No harm done &mdash; ignore this and the link expires on its own. Nothing goes on your card.',
    }),
  },
  {
    key: 'confirmation',
    file: 'confirm-signup.html',
    subject: 'One putt to go — confirm your DogLeg email',
    html: renderEmail({
      title: 'Confirm your email &middot; DogLeg',
      preheader: 'One tap to confirm your email and lock in your spot.',
      headline: 'One putt to go',
      leadHtml:
        'Confirm this email address to finish signing up and lock in your spot on the tee. Tap below &mdash; that&rsquo;s the whole scorecard. The link plays through once and expires shortly, so sink it while it&rsquo;s fresh.',
      cta: { label: 'Confirm email address', url: CONFIRMATION_URL },
      fallbackUrl: CONFIRMATION_URL,
      footerFineHtml:
        'Didn&rsquo;t sign up for DogLeg? No harm done &mdash; ignore this and the link expires on its own.',
    }),
  },
]
