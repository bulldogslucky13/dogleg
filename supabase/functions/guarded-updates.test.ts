/**
 * Guards the guards: a conditional write must ask whether it actually fired.
 *
 * Three functions write once-only columns on `players` — the clubhouse name
 * (submit-round posting a first card, link-account signing in, claim-name
 * from the trophy card) and the `user_id` that binds a row to an account.
 * Both are one-way, so every one of those writes is guarded — but not in JS
 * any more. Every one of them used to be a `.from('players').update(...)
 * .is(col, null)` builder chain, and every one has now moved into a locked,
 * atomic Postgres function in schema.sql (`claim_name_if_free`,
 * `reserve_name_and_link`, `attach_account`, `create_linked_player`) —
 * `pg_advisory_xact_lock(hashtext(lower(name)))` is what a JS-level `.is()`
 * filter can never provide (it only tells a WRITER's own miss from its own
 * hit; it says nothing about a DIFFERENT transaction reading a stale
 * snapshot at the same instant), so the guard had to move where the lock is.
 *
 * That migration is exactly the kind of refactor this file's own original
 * warning called out: "if a future refactor moves these writes somewhere
 * the scan can't see, the assertions would pass by finding nothing at all."
 * It happened, deliberately, for a good reason — so this file's job changed
 * with it: `playerChains`/`isGuardedUpdate` stay as general JS-level
 * infrastructure (a FUTURE once-only-column write that goes back to a plain
 * builder call still needs exactly this guard, and this file still catches
 * a missing one), while the specific columns that moved are checked against
 * schema.sql instead — the same source-reading approach, aimed at where the
 * guard actually lives now.
 *
 * Reads source text rather than running the handlers — no edge function's
 * `index.ts` (or Postgres function body) is executable here (they need Deno
 * plus a live PostgREST/Postgres, which is why only pure modules under
 * `_shared/` have runnable tests) — so nothing here can prove a branch
 * behaves, only that no writer can quietly go back to trusting a silent
 * miss, or drop the lock that makes the miss/hit answer trustworthy across
 * transactions in the first place.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(resolve(here, '..', 'schema.sql'), 'utf8')

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

/** the full `create or replace function <fn>(...) ... $$;` body from schema.sql */
function sqlFunctionBody(fn: string): string {
  const m = new RegExp(`create or replace function ${fn}\\([^)]*\\)[\\s\\S]*?\\$\\$;`).exec(schema)
  return m?.[0] ?? ''
}

describe('a JS-level guarded update never trusts a silent miss', () => {
  // General-purpose infrastructure, kept live even though nothing currently
  // matches it (see the module note): a FUTURE once-only column written
  // through the JS builder still needs exactly this guard, and this is what
  // catches a missing one.
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
})

describe('every door calls the locked RPC that replaced its JS-level guard', () => {
  it('submit-round and claim-name call the atomic anonymous-claim RPC', () => {
    for (const name of ['submit-round', 'claim-name']) {
      const code = sources.find((s) => s.name === name)!.code
      expect(code, name).toMatch(/\bclaimName\(/)
    }
  })

  it("link-account calls all three of its writers' locked RPCs", () => {
    const code = sources.find((s) => s.name === 'link-account')!.code
    for (const fn of ['attach_account', 'reserve_name_and_link', 'create_linked_player']) {
      expect(code, fn).toMatch(new RegExp(`\\.rpc\\('${fn}'`))
    }
  })
})

describe('every locked RPC in schema.sql actually takes the lock before it writes', () => {
  const lockedFns = ['claim_name_if_free', 'reserve_name_and_link', 'attach_account', 'create_linked_player']

  it.each(lockedFns)('%s exists and is service-role only', (fn) => {
    const body = sqlFunctionBody(fn)
    expect(body, `${fn} not found in schema.sql`).not.toBe('')
    expect(schema).toMatch(new RegExp(`revoke all on function ${fn}\\([^)]*\\) from public, anon, authenticated`))
    expect(schema).toMatch(new RegExp(`grant execute on function ${fn}\\([^)]*\\) to service_role`))
  })

  it.each(lockedFns)('%s takes pg_advisory_xact_lock keyed on the name before touching a row', (fn) => {
    const body = sqlFunctionBody(fn)
    // the lock line must come before the write it protects, or it protects
    // nothing — a naive substring match can't see ordering, so split on it
    const lockIdx = body.search(/perform pg_advisory_xact_lock\(hashtext\(lower\(/)
    const writeIdx = body.search(/\b(update|insert into) players\b/)
    expect(lockIdx, `${fn}: no advisory lock found`).toBeGreaterThan(-1)
    expect(writeIdx, `${fn}: no write found`).toBeGreaterThan(-1)
    expect(lockIdx, `${fn}: the lock must be taken BEFORE the write, or a concurrent transaction can still slip past it`).toBeLessThan(writeIdx)
  })
})

describe('each RPC still guards its own write with the null check it replaced', () => {
  it('claim_name_if_free only writes a row whose name is still null', () => {
    expect(sqlFunctionBody('claim_name_if_free')).toMatch(/where[\s\S]*?players\.name is null/)
  })
  it('reserve_name_and_link only writes a row whose name AND user_id are still null', () => {
    const body = sqlFunctionBody('reserve_name_and_link')
    expect(body).toMatch(/where[\s\S]*?players\.name is null/)
    expect(body).toMatch(/where[\s\S]*?players\.user_id is null/)
  })
  it('attach_account only writes a row whose user_id is still null', () => {
    expect(sqlFunctionBody('attach_account')).toMatch(/where[\s\S]*?players\.user_id is null/)
  })
})
