/**
 * Guards the guards: a conditional update must ask whether it actually fired.
 *
 * Three functions write once-only columns on `players` — the clubhouse name
 * (submit-round posting a first card, link-account signing in, claim-name from
 * the trophy card) and the `user_id` that binds a row to an account. Both are
 * one-way, so every one of those writes carries an `is(..., null)` guard, and
 * the guards are correct. What is not obvious is that MISSING is not an error:
 * PostgREST reports an update that changed zero rows as a success, so
 * `{ error }` is null and the losing writer falls straight through to its
 * success path and reports something the database never did.
 *
 * That is invisible at the call site — the code reads like an ordinary guarded
 * update — and it has been written four times now. The blast radius is not
 * small in either column. `player_name` is denormalised onto daily_scores and
 * both record boards, so a lost name race posts a card under a name belonging
 * to somebody else. A lost `user_id` race is quieter and worse: `user_id` is
 * unique across rows, which stops one account holding two players but does
 * nothing to stop a second account overwriting the column on the same row, so
 * an unguarded attach silently moves someone else's synced identity.
 *
 * The fix in every case is the same: ask for the row back and let it say what
 * happened. This test holds that shape. It reads source text rather than
 * running the handlers — no edge function's `index.ts` is testable here (they
 * need Deno plus a live PostgREST, which is why only pure modules under
 * `_shared/` have tests) — so it cannot prove a branch behaves, only that no
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

/** an update whose success depends on a column still being null */
const isGuardedUpdate = (chain: string) => chain.includes('.update(') && /\.is\('\w+', null\)/.test(chain)

describe('a guarded update never trusts a silent miss', () => {
  it('finds the functions it is meant to be guarding', () => {
    // an empty sweep would make every assertion below pass vacuously
    expect(sources.map((s) => s.name).sort()).toContain('claim-name')
    expect(sources.flatMap((s) => playerChains(s.code)).length).toBeGreaterThan(0)
  })

  it.each(sources.map((s) => s.name))('%s asks for the row back on every guarded update', (name) => {
    const code = sources.find((s) => s.name === name)!.code
    for (const chain of playerChains(code).filter(isGuardedUpdate)) {
      expect(
        /\.select\(/.test(chain),
        `${name}: this update only fires while the guarded column is null, but a zero-row update is ` +
          `a SUCCESS in PostgREST, not an error — without a .select() the losing writer reports ` +
          `something the database never did:\n\n  ${chain}\n`,
      ).toBe(true)
    }
  })

  it('every write to a once-only column goes through a guard', () => {
    // The rule above is only worth anything if the guards are all still there
    // — an unguarded `update({ user_id })` would pass it by having nothing to
    // check. Both columns are permanent, so neither may be written blind.
    for (const { name, code } of sources) {
      for (const chain of playerChains(code)) {
        if (!chain.includes('.update(')) continue
        const writes = /\.update\(\{([^}]*)\}\)/.exec(chain)?.[1] ?? ''
        for (const column of ['name', 'user_id']) {
          if (!new RegExp(`\\b${column}\\b`).test(writes)) continue
          expect(
            new RegExp(`\\.is\\('${column}', null\\)`).test(chain),
            `${name}: writes \`${column}\` — a permanent column — without an ` +
              `is('${column}', null) guard, so it can overwrite a value that is already there:\n\n  ${chain}\n`,
          ).toBe(true)
        }
      }
    }
  })

  it('the writers the rules sweep are the ones we think they are', () => {
    // if a future refactor moves these writes somewhere the scan can't see,
    // the assertions above would pass by finding nothing at all
    const guarded = sources
      .filter((s) => playerChains(s.code).some(isGuardedUpdate))
      .map((s) => s.name)
      .sort()
    expect(guarded).toEqual(['claim-name', 'link-account', 'submit-round'])
  })
})
