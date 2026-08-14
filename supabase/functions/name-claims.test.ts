/**
 * Guards the one-way name claim against the mistake it invited twice.
 *
 * Three functions can put a clubhouse name on a row — submit-round (posting a
 * first card), link-account (signing in) and claim-name (the trophy card) —
 * and all three guard the write the same way, on `is('name', null)`, because a
 * claimed name is permanent. The guard is correct. What is not obvious is that
 * MISSING it is not an error: PostgREST reports an update that changed zero
 * rows as a success, so `{ error }` is null and the losing writer falls
 * straight through to its success path, reporting a name the database gave to
 * somebody else.
 *
 * That is invisible at the call site — the code reads like a normal guarded
 * update — and the blast radius is not small, because `player_name` is
 * denormalised onto daily_scores and both record boards. A lost race in
 * submit-round posts a card under a name that isn't the player's; in
 * link-account the same miss silently dropped the `user_id` too, so the caller
 * was told "linked" while the account stayed unlinked.
 *
 * The fix in all three is the same: ask for the row back and let it say what
 * happened. This test holds that shape. It reads source text rather than
 * running the handlers — no edge function's `index.ts` is testable here (they
 * need Deno plus a live PostgREST, which is why only pure modules under
 * `_shared/` have tests) — so it can't prove the branch behaves, only that no
 * new writer can quietly go back to trusting a silent miss.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

const sources = readdirSync(here, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
  .map((e) => ({ name: e.name, code: readFileSync(resolve(here, e.name, 'index.ts'), 'utf8') }))

/**
 * Every `supabase.from('players')...` builder chain in a file, as one string.
 *
 * Walks `.method(...)` segments with paren balancing rather than matching a
 * regex against the whole chain — the arguments contain their own parentheses
 * and quotes, and a chain spans however many lines prettier decided on.
 */
function playerChains(code: string): string[] {
  const chains: string[] = []
  for (const start of [...code.matchAll(/\.from\('players'\)/g)]) {
    let i = start.index! + start[0].length
    let chain = start[0]
    for (;;) {
      const rest = code.slice(i)
      const seg = /^\s*\.\w+\(/.exec(rest)
      if (!seg) break
      let depth = 0
      let j = seg[0].length - 1 // sitting on the opening paren
      for (; j < rest.length; j++) {
        if (rest[j] === '(') depth++
        else if (rest[j] === ')' && --depth === 0) break
      }
      if (depth !== 0) break // unbalanced — stop rather than run off the end
      chain += rest.slice(0, j + 1).replace(/\s+/g, ' ')
      i += j + 1
    }
    chains.push(chain)
  }
  return chains
}

describe('a guarded name claim never trusts a silent miss', () => {
  it('finds the functions it is meant to be guarding', () => {
    // an empty sweep would make every assertion below pass vacuously
    expect(sources.map((s) => s.name).sort()).toContain('claim-name')
    expect(sources.flatMap((s) => playerChains(s.code)).length).toBeGreaterThan(0)
  })

  it.each(sources.map((s) => s.name))('%s asks for the row back on every guarded name write', (name) => {
    const code = sources.find((s) => s.name === name)!.code
    const guarded = playerChains(code).filter((c) => c.includes('.update(') && /\.is\('name', null\)/.test(c))
    for (const chain of guarded) {
      expect(
        /\.select\(/.test(chain),
        `${name}: this update is guarded on \`name is null\`, but a zero-row update is a SUCCESS in ` +
          `PostgREST, not an error — without a .select() the losing writer reports a name the row ` +
          `does not have:\n\n  ${chain}\n`,
      ).toBe(true)
    }
  })

  it('every writer that claims a name is covered by the rule', () => {
    // if a future refactor moves these writes somewhere the scan can't see,
    // the assertion above would pass by finding nothing at all
    const claiming = sources
      .filter((s) => playerChains(s.code).some((c) => c.includes('.update(') && /\.is\('name', null\)/.test(c)))
      .map((s) => s.name)
      .sort()
    expect(claiming).toEqual(['claim-name', 'link-account', 'submit-round'])
  })
})
