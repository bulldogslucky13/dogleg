/**
 * Preventive half of the engine-version handshake (the enforcing half lives
 * in the submit-round function): catch a stale bundle BEFORE the player
 * spends 18 holes on a round whose score the referee would refuse.
 *
 * The build emits a `version.json` next to the bundle carrying the same
 * ENGINE_VERSION that was compiled in (see the emit-engine-version plugin in
 * vite.config.ts). Site and function deploy together on every push to main,
 * so fetching that file fresh answers "has an engine-changing deploy landed
 * since this tab loaded its bundle?" without asking the backend anything.
 *
 * Fail-open on purpose: offline, a 404 (dev server has no version.json), or
 * a malformed body all mean "not stale" — the round is still fully playable
 * locally either way, and the submit-side check remains the backstop.
 */
import { ENGINE_VERSION } from '../engine/version'
import { backendEnabled } from './backend'

/** True only when the manifest positively names a DIFFERENT engine version. */
export function staleFromManifest(body: unknown): boolean {
  const v = (body as { engineVersion?: unknown } | null)?.engineVersion
  return typeof v === 'number' && v !== ENGINE_VERSION
}

let check: Promise<boolean> | null = null

export async function bundleIsStale(): Promise<boolean> {
  if (!backendEnabled) return false
  // one fetch per page load — the answer can't change until the tab reloads
  // (and reloading IS the remedy), so home-screen remounts share it
  check ??= (async () => {
    try {
      // relative to the page URL so it works on any host/sub-path (base './'),
      // and no-store so a CDN or the browser can't hand back the stale answer
      const res = await fetch('./version.json', { cache: 'no-store' })
      if (!res.ok) return false
      return staleFromManifest(await res.json())
    } catch {
      return false
    }
  })()
  return check
}
