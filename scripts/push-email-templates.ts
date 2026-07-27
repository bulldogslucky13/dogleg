/**
 * Push the generated Auth email templates to the Supabase project.
 *
 * The auth mailer templates are project config, not database rows — so they are
 * not covered by the schema.sql auto-apply in .github/workflows/deploy.yml, and
 * they are not something `supabase functions deploy` touches. They live behind
 * the Management API, which is what this script talks to.
 *
 * CI runs this on every push to main (the email-templates job in
 * .github/workflows/deploy.yml, after the site deploy — the masthead is served
 * from the site, so a template must never go out ahead of it). Pushing by hand
 * is for previewing a change before it merges:
 *
 *   export SUPABASE_ACCESS_TOKEN=$(op read 'op://Private/Supabase Local API Key/credential')
 *   pnpm gen:email-templates
 *   pnpm push:email-templates --dry-run    # show what would change
 *   pnpm push:email-templates
 *
 * Idempotent: it diffs against live config first and no-ops when nothing moved,
 * so running it on every deploy costs one GET and writes nothing.
 *
 * Only the two customised templates are touched (magic link, confirm signup).
 * The other eleven are Supabase stock and are left exactly as they are.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { AUTH_EMAILS } from '../supabase/functions/_shared/auth-emails.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')

const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  console.error(
    'SUPABASE_ACCESS_TOKEN is not set. A personal access token from\n' +
      'https://supabase.com/dashboard/account/tokens, e.g.\n\n' +
      `  export SUPABASE_ACCESS_TOKEN=$(op read 'op://Private/Supabase Local API Key/credential')\n`,
  )
  process.exit(1)
}

// CI passes the ref the same way the rest of deploy.yml gets it; locally it
// comes from the checked-in config, so a hand run needs no extra setup.
const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8')
const ref = process.env.SUPABASE_PROJECT_REF || /^\s*project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1]
if (!ref) {
  console.error('no SUPABASE_PROJECT_REF, and could not read project_id from supabase/config.toml')
  process.exit(1)
}

const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`
const headers = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }

const currentRes = await fetch(api, { headers })
if (!currentRes.ok) {
  console.error(`GET auth config failed: ${currentRes.status} ${await currentRes.text()}`)
  process.exit(1)
}
const current = (await currentRes.json()) as Record<string, string | null>

const patch: Record<string, string> = {}
for (const email of AUTH_EMAILS) {
  const contentKey = `mailer_templates_${email.key}_content`
  const subjectKey = `mailer_subjects_${email.key}`
  const contentChanged = (current[contentKey] ?? '') !== email.html
  const subjectChanged = (current[subjectKey] ?? '') !== email.subject

  console.log(`${email.key}`)
  console.log(
    `  content  ${contentChanged ? `CHANGES  ${(current[contentKey] ?? '').length} -> ${email.html.length} chars` : 'unchanged'}`,
  )
  console.log(
    `  subject  ${subjectChanged ? `CHANGES  ${JSON.stringify(current[subjectKey])} -> ${JSON.stringify(email.subject)}` : 'unchanged'}`,
  )

  if (contentChanged) patch[contentKey] = email.html
  if (subjectChanged) patch[subjectKey] = email.subject
}

if (!Object.keys(patch).length) {
  console.log('\nnothing to push — live config already matches.')
  process.exit(0)
}

if (dryRun) {
  console.log(`\n--dry-run: would PATCH ${Object.keys(patch).join(', ')}`)
  process.exit(0)
}

const res = await fetch(api, { method: 'PATCH', headers, body: JSON.stringify(patch) })
if (!res.ok) {
  console.error(`\nPATCH failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}
console.log(`\npushed ${Object.keys(patch).length} field(s) to ${ref}.`)
