/**
 * The clubhouse-name rule, and the three doors that have to obey it.
 *
 * Names are shared by default and reserved only by an email account (the long
 * note in supabase/schema.sql says why). That rule used to be a unique index,
 * which meant the database enforced it no matter which door a name came
 * through. It isn't any more — dropping the index is the whole point — so a
 * door that forgets to ask hands out a reserved name and nothing downstream
 * notices. There is no test that can run the handlers (they need Deno and a
 * live PostgREST, which is why only `_shared/` has tests here), so this reads
 * their source the way guarded-updates.test.ts does: it can't prove a branch
 * behaves, only that no new writer can quietly skip the check.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { NAME_RE, checkName, isNameConflict } from './names.ts'

const here = dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(resolve(here, '../../schema.sql'), 'utf8')

/** a stand-in for the supabase client: only `rpc` is ever reached */
const service = (result: { data?: unknown; error?: unknown }) => ({
  calls: [] as Array<{ fn: string; args: unknown }>,
  rpc(fn: string, args: unknown) {
    this.calls.push({ fn, args })
    return Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
  },
})

describe('checkName asks the database, and fails closed', () => {
  it('reports a name held by an account as reserved', async () => {
    const s = service({ data: true })
    expect(await checkName(s, 'Jacob')).toBe('reserved')
    expect(s.calls).toEqual([{ fn: 'name_reserved', args: { p_name: 'Jacob' } }])
  })

  it('reports anything else as free — shared names are the normal case', async () => {
    expect(await checkName(service({ data: false }), 'Jacob')).toBe('free')
  })

  it("returns 'unknown' rather than throwing when the check itself fails", async () => {
    // callers must treat this as a refusal: handing out a reserved name on a
    // transient blip is unfixable, because names are permanent
    expect(await checkName(service({ error: { message: 'boom' } }), 'Jacob')).toBe('unknown')
  })
})

describe('the name grammar', () => {
  it('accepts 2-18 chars opening on a letter or digit', () => {
    for (const ok of ['Jacob', 'DeBilzan', 'Chud Ben 2', "O'Hara", 'a.b_c-d', '18 Handicap']) {
      expect(NAME_RE.test(ok), ok).toBe(true)
    }
  })
  it('rejects the empty, the overlong, and a leading separator', () => {
    for (const bad of ['', 'J', ' Jacob', '.Jacob', 'x'.repeat(19)]) {
      expect(NAME_RE.test(bad), JSON.stringify(bad)).toBe(false)
    }
  })
})

describe('the schema backs the rule the functions enforce', () => {
  it('defines name_reserved and keeps it off the public key', () => {
    expect(schema).toMatch(/create or replace function name_reserved\(p_name text\)/)
    expect(schema).toMatch(/revoke all on function name_reserved\(text\) from public, anon, authenticated/)
  })

  it('has no GLOBAL unique index on names — that is what makes them shareable', () => {
    // dropping global uniqueness is the whole point: two anonymous rows must
    // be able to share a name. A unique index with no `where` clause would
    // silently restore it and break every namesake, including linking.
    const uniqueIndexes = [...schema.matchAll(/create unique index[^;]*players\s*\(\s*lower\(name\)\s*\)([^;]*);/gi)]
    for (const m of uniqueIndexes) {
      expect(m[1], m[0]).toMatch(/where\s+user_id\s+is\s+not\s+null/i)
    }
    expect(schema).toMatch(/drop index if exists players_name_ci;/)
  })

  it('reserves names only among LINKED rows, via a partial unique index', () => {
    // this is the actual guarantee — see the two-layer note in names.ts and
    // schema.sql. checkName is a courtesy that runs before this; this index
    // is what a write can't get past even when two requests race it at once.
    expect(schema).toMatch(
      /create unique index if not exists players_name_reserved_ci on players \(lower\(name\)\) where user_id is not null;/,
    )
  })
})

describe('isNameConflict tells a name collision apart from a user_id collision', () => {
  const nameError = { code: '23505', message: 'duplicate key value violates unique constraint "players_name_reserved_ci"' }
  const userIdError = { code: '23505', message: 'duplicate key value violates unique constraint "players_user_id_key"' }

  it('is true only for the reserved-name index', () => {
    expect(isNameConflict(nameError)).toBe(true)
  })
  it('is false for a user_id collision sharing the same 23505 code', () => {
    expect(isNameConflict(userIdError)).toBe(false)
  })
  it('is false for a non-conflict error', () => {
    expect(isNameConflict({ code: '500', message: 'players_name_reserved_ci' })).toBe(false)
  })
})

describe('every door that writes a name asks first', () => {
  // Derived, not hardcoded — a NEW function directory that starts writing
  // players.name must be caught here automatically, the same way
  // guarded-updates.test.ts derives its own directory list rather than
  // naming the three doors by hand (which is exactly how link-account's
  // attach() path went unchecked for a release: a hand-maintained list only
  // proves the doors on the list behave, never that the list is complete).
  const allDirs = readdirSync(resolve(here, '..'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name)
  const writesPlayerName = (code: string) =>
    [...code.matchAll(/\.from\('players'\)[\s\S]{0,400}?\.(update|insert)\(\{[\s\S]{0,200}?\bname\b/g)].length > 0
  const doors = allDirs.filter((dir) =>
    writesPlayerName(readFileSync(resolve(here, '..', dir, 'index.ts'), 'utf8')),
  )

  it('found exactly the three known doors — a heuristic miss here would silently stop covering one', () => {
    expect([...doors].sort()).toEqual(['claim-name', 'link-account', 'submit-round'])
  })

  for (const door of doors) {
    it(`${door} consults checkName and refuses both non-free answers`, () => {
      const code = readFileSync(resolve(here, '..', door, 'index.ts'), 'utf8')
      // it imports the shared rule rather than re-deriving one
      expect(code).toMatch(/from '\.\.\/_shared\/names\.ts'/)
      // ...and every name it writes went past a check
      const writes = [...code.matchAll(/\bname\b\s*[,}]/g)].length
      expect(writes).toBeGreaterThan(0)
      const checks = [...code.matchAll(/await checkName\(/g)].length
      expect(checks).toBeGreaterThan(0)
      expect(code).toMatch(/=== 'reserved'\) return json\(409/)
      expect(code).toMatch(/=== 'unknown'\) return json\(503/)
    })
  }

  it('no door still carries its own copy of the grammar', () => {
    // three copies of NAME_RE is how the doors drifted apart before
    for (const door of doors) {
      const code = readFileSync(resolve(here, '..', door, 'index.ts'), 'utf8')
      expect(code).not.toMatch(/const NAME_RE\s*=/)
    }
  })

  it('link-account tells a name conflict apart from a user_id conflict on every write that sets both', () => {
    // link-account is the one door that ever writes user_id, so it's the only
    // one whose 23505 could mean two different things. A write that sets
    // BOTH columns (or updates user_id on a row whose name might collide,
    // like attach()) must run its error through isNameConflict — otherwise a
    // genuine name race reads to the player as an account problem instead of
    // "pick another name", with no way to act on it.
    const code = readFileSync(resolve(here, '..', 'link-account', 'index.ts'), 'utf8')
    expect(code).toMatch(/from '\.\.\/_shared\/names\.ts'/)
    const uses = [...code.matchAll(/isNameConflict\(/g)].length
    // attach() + the two other writes that can hit players_name_reserved_ci
    expect(uses).toBeGreaterThanOrEqual(3)
  })
})
