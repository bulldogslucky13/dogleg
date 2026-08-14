/**
 * Guards the edge-function deploy list against the drift that just happened.
 *
 * `.github/workflows/deploy.yml` names every function to deploy, one line
 * each. Nothing derives that list from the functions that exist, so adding
 * `supabase/functions/<name>/index.ts` and a `[functions.<name>]` block to
 * config.toml LOOKS complete while shipping nothing: the client goes live
 * calling an endpoint the project never had. That is silent in every gate the
 * repo runs — typecheck, tests and build all pass, because the missing piece
 * is a line in a YAML file no test read — and it only surfaces in production,
 * as a 404 on the one action the feature exists to perform.
 *
 * The explicit list is deliberate (a `for` loop over the directory would
 * redeploy the referee on every unrelated push), so the fix is not to
 * generate it — it is to fail here when it disagrees with the directory.
 *
 * The second assertion is the more dangerous half. `verify_jwt` defaults to
 * ON, so a function whose deploy line forgets `--no-verify-jwt` deploys
 * behind a gateway check that 401s every anonymous caller: a total outage of
 * whatever it serves, from a missing flag rather than a wrong one. The
 * workflow already repeats config.toml's answer on the command line on
 * purpose (see the comment there); this pins the two together so the repeat
 * can't quietly become a contradiction.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const workflow = readFileSync(resolve(root, '.github/workflows/deploy.yml'), 'utf8')
const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8')

/** every deployable function: a directory with an index.ts, minus `_shared` */
const functions = readdirSync(resolve(root, 'supabase/functions'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
  .map((e) => e.name)
  .sort()

/** `supabase functions deploy <name> \` + flags, with YAML line continuations folded away */
const deployed = new Map<string, string>()
for (const m of workflow.replace(/\\\n\s*/g, ' ').matchAll(/supabase functions deploy (\S+)([^\n]*)/g)) {
  deployed.set(m[1], m[2])
}

/** `[functions.<name>]` ... `verify_jwt = <bool>` */
function verifyJwt(name: string): boolean | undefined {
  const block = new RegExp(`\\[functions\\.${name}\\]([\\s\\S]*?)(?=\\n\\[|$)`).exec(config)
  if (!block) return undefined
  const flag = /verify_jwt\s*=\s*(true|false)/.exec(block[1])
  return flag ? flag[1] === 'true' : undefined
}

describe('edge functions are all actually deployed', () => {
  it('finds the functions and the deploy step', () => {
    // if either of these is empty the assertions below would pass vacuously
    expect(functions.length).toBeGreaterThan(0)
    expect(deployed.size).toBeGreaterThan(0)
  })

  it.each(functions)('%s is in the deploy workflow', (name) => {
    expect(
      deployed.has(name),
      `supabase/functions/${name}/ exists but .github/workflows/deploy.yml never deploys it — ` +
        `the client would call an endpoint that isn't there`,
    ).toBe(true)
  })

  it.each(functions)('%s declares verify_jwt in config.toml', (name) => {
    expect(verifyJwt(name), `no [functions.${name}] verify_jwt in supabase/config.toml`).toBeTypeOf('boolean')
  })

  it.each(functions)('%s deploys with the JWT setting config.toml asks for', (name) => {
    const flags = deployed.get(name) ?? ''
    expect(
      flags.includes('--no-verify-jwt'),
      `[functions.${name}] says verify_jwt = ${verifyJwt(name)} but its deploy line ` +
        `${flags.includes('--no-verify-jwt') ? 'passes' : 'omits'} --no-verify-jwt`,
    ).toBe(verifyJwt(name) === false)
  })

  it('deploys nothing that no longer exists', () => {
    expect([...deployed.keys()].sort()).toEqual(functions)
  })
})
