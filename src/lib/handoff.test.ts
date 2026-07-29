// @vitest-environment jsdom
/**
 * The cross-origin handoff (see handoff.ts). These tests pin the WIRE FORMAT
 * as much as the merge rules: the packing half lives in handoff/index.html, on
 * a different domain, hand-written, with no way to share a bundle with this
 * one. If the format drifts, every player still holding an old bookmark
 * silently arrives as a stranger — so the format is asserted literally here,
 * not just round-tripped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// the real file, verbatim — ?raw so this stays a browser-typed test with no
// node builtins (tsconfig.app.json carries no node types)
import handoffHtml from '../../handoff/index.html?raw'
import { SITE_URL } from '../engine/daily'
import { importHandoff, packHandoff, runHandoff, unpackHandoff } from './handoff'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v)
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
  clear(): void {
    this.map.clear()
  }
  [name: string]: unknown
}

const NAMED = { id: 'p-old', secret: 's-old', name: 'Bogey Merchant' }
const ANON = { id: 'p-new', secret: 's-new', name: null }

function seeded(entries: Record<string, unknown>): MemoryStorage {
  const s = new MemoryStorage()
  for (const [k, v] of Object.entries(entries)) {
    s.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
  return s
}

const OLD_DEVICE = {
  'dogleg:player:v1': NAMED,
  'dogleg:history:v1': [
    { dateKey: '2026-07-20', toPar: 2 },
    { dateKey: '2026-07-21', toPar: -1 },
  ],
  'dogleg:archive:v1': [{ seed: 'seed-a', playedAt: 200 }],
  'dogleg:lifetime:v1': '42',
  'dogleg:fortune:v1': { p: { ace: 3, aceK: 1, alb: 0, albK: 0 } },
  'dogleg:uimode': 'classic',
}

describe('wire format', () => {
  it('round-trips every dogleg: key and ignores everything else', async () => {
    const store = seeded({ ...OLD_DEVICE, 'other-app:token': 'not ours' })
    const unpacked = await unpackHandoff(await packHandoff(store))
    expect(unpacked?.v).toBe(1)
    expect(Object.keys(unpacked!.keys).sort()).toEqual(Object.keys(OLD_DEVICE).sort())
    expect(unpacked!.keys['dogleg:lifetime:v1']).toBe('42')
  })

  it('is gzip + base64url, marked z., when CompressionStream exists', async () => {
    expect(typeof CompressionStream).toBe('function')
    const payload = await packHandoff(seeded(OLD_DEVICE))
    expect(payload.startsWith('z.')).toBe(true)
    // URL-safe: no +, /, = or anything else that needs escaping in a fragment
    expect(payload.slice(2)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('falls back to an uncompressed p. payload, and still reads back', async () => {
    const CS = globalThis.CompressionStream
    // @ts-expect-error — simulating a browser without the Compression Streams API
    delete globalThis.CompressionStream
    try {
      const payload = await packHandoff(seeded(OLD_DEVICE))
      expect(payload.startsWith('p.')).toBe(true)
      const unpacked = await unpackHandoff(payload)
      expect(unpacked!.keys['dogleg:player:v1']).toBe(JSON.stringify(NAMED))
    } finally {
      globalThis.CompressionStream = CS
    }
  })

  it('gzip keeps a fat archive inside a sane URL length', async () => {
    // the archive is pruned (10 recent + PRs + trophies), so ~80 rounds is a
    // heavy player who has been everywhere — it must not produce a URL that
    // mobile browsers will truncate
    const rounds = Array.from({ length: 80 }, (_, i) => ({
      seed: `daily:2026-05-${i}:p-old`,
      mode: 'daily',
      courseSlug: 'pebble-beach',
      dateKey: `2026-05-${i}`,
      toPar: 3,
      strokes: 75,
      results: Array.from({ length: 18 }, () => 'par'),
      decisions: Array.from({ length: 18 }, () => ['normal', 'normal', 'safe', 'normal']),
      playedAt: 1_700_000_000 + i,
    }))
    const payload = await packHandoff(seeded({ ...OLD_DEVICE, 'dogleg:archive:v1': rounds }))
    expect(payload.length).toBeLessThan(20_000)
    const back = await unpackHandoff(payload)
    expect(JSON.parse(back!.keys['dogleg:archive:v1'])).toHaveLength(80)
  })

  it.each([['', 'empty'], ['z.!!!!', 'corrupt body'], ['x.abcd', 'unknown codec'], ['z.', 'truncated to nothing']])(
    'refuses a payload that is %s (%s)',
    async (payload) => {
      expect(await unpackHandoff(payload)).toBeNull()
    },
  )
})

describe('importing onto a fresh origin', () => {
  it('carries the identity, history, archive and counters across', async () => {
    const target = new MemoryStorage()
    const outcome = await importHandoff(await packHandoff(seeded(OLD_DEVICE)), target)
    expect(outcome).toBe('imported')
    expect(JSON.parse(target.getItem('dogleg:player:v1')!)).toEqual(NAMED)
    expect(JSON.parse(target.getItem('dogleg:history:v1')!)).toHaveLength(2)
    expect(target.getItem('dogleg:lifetime:v1')).toBe('42')
    expect(target.getItem('dogleg:uimode')).toBe('classic')
  })

  it('replaces a freshly minted anonymous identity — it has no posted rounds to strand', async () => {
    const target = seeded({ 'dogleg:player:v1': ANON })
    expect(await importHandoff(await packHandoff(seeded(OLD_DEVICE)), target)).toBe('imported')
    expect(JSON.parse(target.getItem('dogleg:player:v1')!)).toEqual(NAMED)
  })

  it('reports invalid rather than half-importing a corrupt payload', async () => {
    const target = seeded({ 'dogleg:player:v1': ANON })
    expect(await importHandoff('z.notreallygzip', target)).toBe('invalid')
    expect(JSON.parse(target.getItem('dogleg:player:v1')!)).toEqual(ANON)
  })
})

describe('importing onto a device that has already been played on', () => {
  it('refuses when this device holds a different NAMED clubhouse, changing nothing', async () => {
    const mine = { id: 'p-mine', secret: 's-mine', name: 'Sandy Lyle' }
    const target = seeded({ 'dogleg:player:v1': mine, 'dogleg:history:v1': [{ dateKey: '2026-07-26', toPar: 0 }] })
    expect(await importHandoff(await packHandoff(seeded(OLD_DEVICE)), target)).toBe('conflict')
    expect(JSON.parse(target.getItem('dogleg:player:v1')!)).toEqual(mine)
    expect(JSON.parse(target.getItem('dogleg:history:v1')!)).toHaveLength(1)
  })

  it('proceeds when the same named player arrives back (a second old bookmark)', async () => {
    const target = seeded({ 'dogleg:player:v1': NAMED })
    expect(await importHandoff(await packHandoff(seeded(OLD_DEVICE)), target)).toBe('imported')
  })

  it('unions history by day, local winning ties', async () => {
    const target = seeded({
      'dogleg:player:v1': ANON,
      'dogleg:history:v1': [
        { dateKey: '2026-07-21', toPar: 99 },
        { dateKey: '2026-07-26', toPar: 0 },
      ],
    })
    await importHandoff(await packHandoff(seeded(OLD_DEVICE)), target)
    const merged = JSON.parse(target.getItem('dogleg:history:v1')!) as { dateKey: string; toPar: number }[]
    expect(merged.map((e) => e.dateKey)).toEqual(['2026-07-20', '2026-07-21', '2026-07-26'])
    expect(merged.find((e) => e.dateKey === '2026-07-21')!.toPar).toBe(99)
  })

  it('unions the archive by seed and keeps it newest-first', async () => {
    const target = seeded({
      'dogleg:player:v1': ANON,
      // already newest-first, as every real write path (pruneArchive) leaves it
      'dogleg:archive:v1': [
        { seed: 'seed-b', playedAt: 300 },
        { seed: 'seed-a', playedAt: 1 },
      ],
    })
    await importHandoff(await packHandoff(seeded(OLD_DEVICE)), target)
    const merged = JSON.parse(target.getItem('dogleg:archive:v1')!) as { seed: string; playedAt: number }[]
    expect(merged.map((r) => r.seed)).toEqual(['seed-b', 'seed-a'])
    expect(merged.find((r) => r.seed === 'seed-a')!.playedAt).toBe(1)
  })

  it('skips the rewrite entirely when the incoming side has nothing new to add', async () => {
    // OLD_DEVICE's only archive entry is seed-a — already present locally
    const target = seeded({ 'dogleg:player:v1': ANON, 'dogleg:archive:v1': [{ seed: 'seed-a', playedAt: 1 }] })
    const before = target.getItem('dogleg:archive:v1')
    await importHandoff(await packHandoff(seeded(OLD_DEVICE)), target)
    expect(target.getItem('dogleg:archive:v1')).toBe(before) // same string, not just same value — no rewrite happened
  })

  it('never adopts an incoming round-in-progress even when this device has none of its own', async () => {
    const target = seeded({ 'dogleg:player:v1': ANON })
    await importHandoff(await packHandoff(seeded({ ...OLD_DEVICE, 'dogleg:round:v1': { hole: 17 } })), target)
    expect(target.getItem('dogleg:round:v1')).toBeNull()
  })

  it('drops a daily salted for the identity being replaced — it could never be posted', async () => {
    // Visit the new domain, get a nameless minted id, start today's daily
    // (dice salted for THAT id), then follow the old bookmark. The referee
    // derives the expected salt from whoever submits, so playing this round
    // out as the arriving player ends in "seed is not yours" after 18 holes.
    const target = seeded({
      'dogleg:player:v1': ANON,
      'dogleg:round:v1': { seed: 'round:2026-07-29:pebble-beach:k3n9xq2mb1z7', mode: 'daily', complete: false },
    })
    expect(await importHandoff(await packHandoff(seeded(OLD_DEVICE)), target)).toBe('imported')
    expect(target.getItem('dogleg:round:v1')).toBeNull()
    expect(JSON.parse(target.getItem('dogleg:player:v1')!)).toEqual(NAMED)
  })

  it('keeps an UNSALTED daily — the referee accepts those from anyone, so it is still postable', async () => {
    const unsalted = JSON.stringify({ seed: 'round:2026-07-29:pebble-beach', mode: 'daily', complete: false })
    const target = seeded({ 'dogleg:player:v1': ANON })
    target.setItem('dogleg:round:v1', unsalted)
    await importHandoff(await packHandoff(seeded(OLD_DEVICE)), target)
    expect(target.getItem('dogleg:round:v1')).toBe(unsalted)
  })

  it('keeps a practice round, which carries no player salt at all', async () => {
    const practice = JSON.stringify({ seed: 'practice2:pebble-beach:abc', mode: 'practice', complete: false })
    const target = seeded({ 'dogleg:player:v1': ANON })
    target.setItem('dogleg:round:v1', practice)
    await importHandoff(await packHandoff(seeded(OLD_DEVICE)), target)
    expect(target.getItem('dogleg:round:v1')).toBe(practice)
  })

  it('keeps a salted daily when the identity is not actually changing hands', async () => {
    // same player arriving back through a second old bookmark — their own
    // round is still theirs, and dropping it would cost them the round
    const mine = JSON.stringify({ seed: 'round:2026-07-29:pebble-beach:k3n9xq2mb1z7', mode: 'daily', complete: false })
    const target = seeded({ 'dogleg:player:v1': NAMED })
    target.setItem('dogleg:round:v1', mine)
    await importHandoff(await packHandoff(seeded(OLD_DEVICE)), target)
    expect(target.getItem('dogleg:round:v1')).toBe(mine)
  })

  it('drops a salted daily whose seed also carries a fortune tail', async () => {
    const target = seeded({
      'dogleg:player:v1': ANON,
      'dogleg:round:v1': { seed: 'round:2026-07-29:pebble-beach:k3n9xq2mb1z7:f12.0.3.0.5', mode: 'daily' },
    })
    await importHandoff(await packHandoff(seeded(OLD_DEVICE)), target)
    expect(target.getItem('dogleg:round:v1')).toBeNull()
  })

  it('unions the posted-daily set so the fortune streak/drought math (store.ts) stays in sync with history', async () => {
    // local already posted 07-26; the incoming device posted the two days in
    // OLD_DEVICE's history. If posted:v1 were left on "local wins" (the
    // default for anything not specially merged), the merged history would
    // include 07-20/07-21 while posted:v1 forgot they were ever posted —
    // silently undercounting postedStreak() and re-opening a closed ace/
    // albatross drought in postedDailyCounters().
    const target = seeded({
      'dogleg:player:v1': ANON,
      'dogleg:history:v1': [{ dateKey: '2026-07-26', toPar: 0 }],
      'dogleg:posted:v1': ['2026-07-26'],
    })
    await importHandoff(await packHandoff(seeded({ ...OLD_DEVICE, 'dogleg:posted:v1': ['2026-07-20', '2026-07-21'] })), target)
    const posted = JSON.parse(target.getItem('dogleg:posted:v1')!) as string[]
    expect(posted.sort()).toEqual(['2026-07-20', '2026-07-21', '2026-07-26'])
  })

  it('unions the round log by seed — the source every lifetime stat and the handicap window compute from', async () => {
    const target = seeded({
      'dogleg:player:v1': ANON,
      'dogleg:roundlog:v1': { v: 1, rounds: [{ seed: 'seed-local', playedAt: 500 }] },
    })
    await importHandoff(
      await packHandoff(seeded({ ...OLD_DEVICE, 'dogleg:roundlog:v1': { v: 1, rounds: [{ seed: 'seed-old', playedAt: 100 }] } })),
      target,
    )
    const log = JSON.parse(target.getItem('dogleg:roundlog:v1')!) as { rounds: { seed: string }[] }
    expect(log.rounds.map((r) => r.seed)).toEqual(['seed-local', 'seed-old'])
  })

  it('carries a pre-migration player whose history is still under the legacy bp: key', async () => {
    // Their last visit predates migrateLegacyStorage, and the old domain now
    // serves the handoff page instead of the app — so that migration will
    // never run for them again. A dogleg:-only sweep would hand over nothing
    // and strand their entire history on a dead origin.
    const target = new MemoryStorage()
    const old = seeded({ 'dogleg:player:v1': NAMED })
    old.setItem('bp:history:v1', JSON.stringify([{ dateKey: '2026-07-19', toPar: 4 }]))
    expect(await importHandoff(await packHandoff(old), target)).toBe('imported')
    const history = JSON.parse(target.getItem('dogleg:history:v1')!) as { dateKey: string }[]
    expect(history.map((e) => e.dateKey)).toEqual(['2026-07-19'])
    // renamed on arrival — the legacy key itself never lands here
    expect(target.getItem('bp:history:v1')).toBeNull()
  })

  it('unions legacy and modern history when an old bundle wrote both', async () => {
    const target = seeded({ 'dogleg:player:v1': ANON })
    const old = seeded({ 'dogleg:player:v1': NAMED, 'dogleg:history:v1': [{ dateKey: '2026-07-21', toPar: 1 }] })
    old.setItem('bp:history:v1', JSON.stringify([{ dateKey: '2026-07-19', toPar: 4 }]))
    await importHandoff(await packHandoff(old), target)
    const history = JSON.parse(target.getItem('dogleg:history:v1')!) as { dateKey: string }[]
    expect(history.map((e) => e.dateKey)).toEqual(['2026-07-19', '2026-07-21'])
  })

  it('does not adopt a legacy in-progress round, same as the modern round key', async () => {
    const target = new MemoryStorage()
    const old = seeded({ 'dogleg:player:v1': NAMED })
    old.setItem('bp:round:v1', JSON.stringify({ seed: 'round:2026-07-19:pebble-beach', mode: 'daily' }))
    await importHandoff(await packHandoff(old), target)
    expect(target.getItem('dogleg:round:v1')).toBeNull()
    expect(target.getItem('bp:round:v1')).toBeNull()
  })

  it('keeps held and stolen mutually exclusive per course, as records.ts does', async () => {
    // local lost the record here; the stale bookmark still thinks it is held.
    // Left unresolved, pendingSteals() would announce the theft while the
    // Locker listed the same course as ours.
    const target = seeded({
      'dogleg:player:v1': ANON,
      'dogleg:records:v1': { v: 1, held: {}, stolen: { 'pebble-beach': { by: 'Sandy Lyle', theirToPar: -6 } } },
    })
    await importHandoff(
      await packHandoff(
        seeded({ ...OLD_DEVICE, 'dogleg:records:v1': { v: 1, held: { 'pebble-beach': { toPar: -5, since: 1 } }, stolen: {} } }),
      ),
      target,
    )
    const ledger = JSON.parse(target.getItem('dogleg:records:v1')!) as {
      held: Record<string, unknown>
      stolen: Record<string, unknown>
    }
    expect('pebble-beach' in ledger.stolen).toBe(true) // local's view wins
    expect('pebble-beach' in ledger.held).toBe(false)
  })

  it('keeps the hold when this device knew the course under neither state', async () => {
    // an inconsistent incoming ledger must not invent a theft notice
    const target = seeded({ 'dogleg:player:v1': ANON, 'dogleg:records:v1': { v: 1, held: {}, stolen: {} } })
    await importHandoff(
      await packHandoff(
        seeded({
          ...OLD_DEVICE,
          'dogleg:records:v1': {
            v: 1,
            held: { augusta: { toPar: -3, since: 1 } },
            stolen: { augusta: { by: 'Nobody', theirToPar: -4 } },
          },
        }),
      ),
      target,
    )
    const ledger = JSON.parse(target.getItem('dogleg:records:v1')!) as {
      held: Record<string, unknown>
      stolen: Record<string, unknown>
    }
    expect('augusta' in ledger.held).toBe(true)
    expect('augusta' in ledger.stolen).toBe(false)
  })

  it('unions the record ledger, local winning a same-course conflict', async () => {
    const target = seeded({
      'dogleg:player:v1': ANON,
      'dogleg:records:v1': { v: 1, held: { 'pebble-beach': { toPar: -2, since: 1 } }, stolen: {} },
    })
    await importHandoff(
      await packHandoff(
        seeded({
          ...OLD_DEVICE,
          'dogleg:records:v1': {
            v: 1,
            held: { 'pebble-beach': { toPar: -5, since: 2 }, augusta: { toPar: 0, since: 3 } },
            stolen: {},
          },
        }),
      ),
      target,
    )
    const ledger = JSON.parse(target.getItem('dogleg:records:v1')!) as { held: Record<string, { toPar: number }> }
    expect(ledger.held['pebble-beach'].toPar).toBe(-2) // local's conflicting entry wins
    expect(ledger.held.augusta.toPar).toBe(0) // incoming's non-conflicting entry still arrives
  })

  it('heals a corrupted local fortune counter from a valid incoming payload instead of perpetuating it', async () => {
    const target = seeded({ 'dogleg:player:v1': ANON })
    target.setItem('dogleg:fortune:v1', '{not valid json')
    await importHandoff(await packHandoff(seeded(OLD_DEVICE)), target)
    expect(JSON.parse(target.getItem('dogleg:fortune:v1')!).p).toEqual(OLD_DEVICE['dogleg:fortune:v1'].p)
  })

  it('clamps a non-finite lifetime count instead of letting it poison Math.max forever', async () => {
    const target = seeded({ 'dogleg:player:v1': ANON, 'dogleg:lifetime:v1': '7' })
    await importHandoff(await packHandoff(seeded({ ...OLD_DEVICE, 'dogleg:lifetime:v1': '1e400' })), target)
    expect(target.getItem('dogleg:lifetime:v1')).toBe('7')
  })

  it('merges each fortune track as a pair, and takes the higher lifetime count', async () => {
    // OLD_DEVICE carries { ace: 3, aceK: 1, alb: 0, albK: 0 }.
    // ace track: local has had MORE aces (5 vs 1), so local's drought stands.
    // alb track: event counts tie (0 vs 0), so the longer drought wins.
    const target = seeded({
      'dogleg:player:v1': ANON,
      'dogleg:fortune:v1': { p: { ace: 1, aceK: 5, alb: 2, albK: 0 } },
      'dogleg:lifetime:v1': '7',
    })
    await importHandoff(await packHandoff(seeded(OLD_DEVICE)), target)
    expect(JSON.parse(target.getItem('dogleg:fortune:v1')!).p).toEqual({ ace: 1, aceK: 5, alb: 2, albK: 0 })
    expect(target.getItem('dogleg:lifetime:v1')).toBe('42')
  })

  it('never hands back a drought the player already cashed (tracks move as pairs, not per-field maxima)', async () => {
    // The regression this rule exists for: an ace earned HERE resets the
    // drought to 0 and ticks aceK to 1. A stale old bookmark still carrying
    // the pre-ace state {ace: 500, aceK: 0} must not resurrect that drought —
    // a per-field maximum would produce {ace: 500, aceK: 1}, a state neither
    // device was ever in, firing the next destiny hundreds of rounds early.
    const target = seeded({
      'dogleg:player:v1': ANON,
      'dogleg:fortune:v1': { p: { ace: 0, aceK: 1, alb: 0, albK: 0 } },
    })
    await importHandoff(
      await packHandoff(seeded({ ...OLD_DEVICE, 'dogleg:fortune:v1': { p: { ace: 500, aceK: 0, alb: 0, albK: 0 } } })),
      target,
    )
    expect(JSON.parse(target.getItem('dogleg:fortune:v1')!).p).toEqual({ ace: 0, aceK: 1, alb: 0, albK: 0 })
  })

  it('takes the arriving track when IT is the one that has seen more moments', async () => {
    const target = seeded({
      'dogleg:player:v1': ANON,
      'dogleg:fortune:v1': { p: { ace: 400, aceK: 0, alb: 0, albK: 0 } },
    })
    await importHandoff(
      await packHandoff(seeded({ ...OLD_DEVICE, 'dogleg:fortune:v1': { p: { ace: 2, aceK: 3, alb: 0, albK: 0 } } })),
      target,
    )
    expect(JSON.parse(target.getItem('dogleg:fortune:v1')!).p).toEqual({ ace: 2, aceK: 3, alb: 0, albK: 0 })
  })

  it('never overwrites an in-progress round', async () => {
    const live = JSON.stringify({ hole: 4, complete: false })
    const target = seeded({ 'dogleg:player:v1': ANON, 'dogleg:round:v1': live })
    await importHandoff(await packHandoff(seeded({ ...OLD_DEVICE, 'dogleg:round:v1': { hole: 17 } })), target)
    expect(target.getItem('dogleg:round:v1')).toBe(live)
  })
})

describe("the old domain's packing half (handoff/index.html)", () => {
  // The file that will actually run on the old domain is standalone, hand-
  // written, and deployed somewhere this bundle never reaches — the exact
  // conditions under which two halves of a format quietly drift apart. So the
  // real script is pulled out of the real file and run against the real
  // unpacker. If someone edits either side, this fails.
  const html = handoffHtml
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1]

  /** Run the page's IIFE with its globals injected, so nothing is stubbed
   *  globally and the script itself is unmodified. */
  function runPage(store: Storage): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!script) return reject(new Error('no <script> found in handoff/index.html'))
      const el = () => ({ setAttribute: () => {}, textContent: '' })
      const doc = { getElementById: el }
      const loc = { replace: (url: string) => resolve(url) }
      // the page's own 4s "go anyway" safety net must not fire the promise
      const noTimer = () => 0
      new Function('document', 'location', 'localStorage', 'setTimeout', script)(doc, loc, store, noTimer)
    })
  }

  it('produces a URL this app can unpack, carrying every key', async () => {
    const url = await runPage(seeded({ ...OLD_DEVICE, 'other-app:token': 'not ours' }))
    expect(url.startsWith('https://playdogleg.com/#handoff=')).toBe(true)
    const unpacked = await unpackHandoff(url.split('#handoff=')[1])
    expect(Object.keys(unpacked!.keys).sort()).toEqual(Object.keys(OLD_DEVICE).sort())
    expect(unpacked!.keys['dogleg:player:v1']).toBe(JSON.stringify(NAMED))
  })

  it('imports cleanly into a fresh origin, end to end', async () => {
    const url = await runPage(seeded(OLD_DEVICE))
    const target = new MemoryStorage()
    expect(await importHandoff(url.split('#handoff=')[1], target)).toBe('imported')
    expect(JSON.parse(target.getItem('dogleg:player:v1')!)).toEqual(NAMED)
    expect(target.getItem('dogleg:lifetime:v1')).toBe('42')
  })

  it('sends a never-played visitor straight on, with no empty payload', async () => {
    expect(await runPage(new MemoryStorage())).toBe('https://playdogleg.com/')
  })

  it('sweeps the legacy bp: keys too — the app that used to migrate them no longer runs here', async () => {
    // a player who has ONLY pre-migration keys must still be carried, not
    // treated as someone who never played
    const old = new MemoryStorage()
    old.setItem('bp:history:v1', JSON.stringify([{ dateKey: '2026-07-19', toPar: 4 }]))
    const url = await runPage(old)
    expect(url.startsWith('https://playdogleg.com/#handoff=')).toBe(true)
    const unpacked = await unpackHandoff(url.split('#handoff=')[1])
    expect(Object.keys(unpacked!.keys)).toContain('bp:history:v1')

    const target = new MemoryStorage()
    await importHandoff(url.split('#handoff=')[1], target)
    expect(JSON.parse(target.getItem('dogleg:history:v1')!)).toHaveLength(1)
  })

  it('points at the domain this app is actually served from', () => {
    // a typo here strands everyone holding an old bookmark
    expect(html).toContain('https://playdogleg.com/')
    expect(`https://${SITE_URL}/`).toBe('https://playdogleg.com/')
  })
})

describe('the boot path', () => {
  beforeEach(() => {
    localStorage.clear()
    window.location.hash = ''
  })
  afterEach(() => {
    window.location.hash = ''
  })

  it('imports from #handoff= and strips the fragment so it cannot be re-shared or replayed', async () => {
    const payload = await packHandoff(seeded(OLD_DEVICE))
    window.location.hash = `#handoff=${payload}`
    expect(await runHandoff()).toBe('imported')
    expect(JSON.parse(localStorage.getItem('dogleg:player:v1')!)).toEqual(NAMED)
    expect(window.location.hash).toBe('')
  })

  it('leaves an unrelated fragment (a #watch= replay link) alone', async () => {
    window.location.hash = '#watch=abc123'
    expect(await runHandoff()).toBeNull()
    expect(window.location.hash).toBe('#watch=abc123')
  })

  it('strips only the handoff when it rides alongside another fragment key', async () => {
    const payload = await packHandoff(seeded(OLD_DEVICE))
    window.location.hash = `#watch=abc123&handoff=${payload}`
    expect(await runHandoff()).toBe('imported')
    expect(window.location.hash).toBe('#watch=abc123')
  })

  it('does nothing at all on an ordinary load', async () => {
    expect(await runHandoff()).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('strips every occurrence of a duplicated handoff= param, not just the first', async () => {
    const payload = await packHandoff(seeded(OLD_DEVICE))
    // a malformed/concatenated link — the second copy is the same secret and
    // must not be left sitting in the address bar
    window.location.hash = `#handoff=${payload}&handoff=${payload}`
    expect(await runHandoff()).toBe('imported')
    expect(window.location.hash).toBe('')
  })

  it('clears a dead #handoff= with no value instead of re-triggering forever', async () => {
    window.location.hash = '#handoff='
    expect(await runHandoff()).toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('muzzles an import that finishes AFTER the boot timeout gave up on it', async () => {
    // Promise.race stops the waiting, not the work. A decompression that
    // finally lands at 6s must not write behind the mounted app's back, where
    // it would race ensureIdentity's freshly minted id and leave the running
    // app holding state for an identity it never rendered.
    // REAL streams, not hand-rolled fakes: through() drains via
    // `new Response(ts.readable)`, which only accepts a genuine ReadableStream
    let release!: (v: Uint8Array) => void
    class StallingStream {
      writable = new WritableStream()
      readable = new ReadableStream({
        start(c) {
          release = (v: Uint8Array) => {
            c.enqueue(v)
            c.close()
          }
        },
      })
    }
    const realDS = globalThis.DecompressionStream
    // a genuine payload, built with the real compressor before it is stubbed
    const payload = await packHandoff(seeded(OLD_DEVICE))
    // the stand-in IS the decompressor, so whatever it emits is taken as the
    // decompressed bytes — no need to actually gzip them
    const decompressed = new TextEncoder().encode(
      JSON.stringify({ v: 1, keys: { 'dogleg:player:v1': JSON.stringify(NAMED) } }),
    )
    globalThis.DecompressionStream = StallingStream as unknown as typeof DecompressionStream
    vi.useFakeTimers()
    try {
      window.location.hash = `#handoff=${payload}`
      const result = runHandoff()
      await vi.advanceTimersByTimeAsync(5000)
      expect(await result).toBe('invalid')
      expect(localStorage.getItem('dogleg:player:v1')).toBeNull()

      // NOW let the abandoned import complete — it must write nothing
      release(decompressed)
      await vi.advanceTimersByTimeAsync(1000)
      await Promise.resolve()
      expect(localStorage.getItem('dogleg:player:v1')).toBeNull()
    } finally {
      vi.useRealTimers()
      globalThis.DecompressionStream = realDS
    }
  })

  it('never hangs boot forever if the unpack stream stalls instead of settling', async () => {
    // An anomalous DecompressionStream that never produces a chunk and never
    // closes, so through()'s drain would await it forever. A real
    // ReadableStream, for the same reason as the test above.
    class HangingStream {
      writable = new WritableStream()
      readable = new ReadableStream({ start() {} })
    }
    const real = globalThis.DecompressionStream
    globalThis.DecompressionStream = HangingStream as unknown as typeof DecompressionStream
    vi.useFakeTimers()
    try {
      const payload = await packHandoff(seeded(OLD_DEVICE)) // built with the REAL CompressionStream, still valid gzip
      window.location.hash = `#handoff=${payload}`
      const result = runHandoff()
      await vi.advanceTimersByTimeAsync(5000)
      expect(await result).toBe('invalid') // the 5s fallback wins the race, not a hang
    } finally {
      vi.useRealTimers()
      globalThis.DecompressionStream = real
    }
  })
})

describe('packHandoff on storage that throws (private-mode-style)', () => {
  it('packs whatever it collected before the throw, rather than rejecting the whole page', async () => {
    class ThrowingStorage extends MemoryStorage {
      override get length(): number {
        throw new DOMException('blocked', 'SecurityError')
      }
    }
    const payload = await packHandoff(new ThrowingStorage())
    const unpacked = await unpackHandoff(payload)
    expect(unpacked?.keys).toEqual({})
  })
})
