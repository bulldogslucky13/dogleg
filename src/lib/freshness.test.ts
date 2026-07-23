import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENGINE_VERSION } from '../engine/version'
import { bundleIsStale, staleFromManifest } from './freshness'

describe('staleFromManifest: the version.json comparison', () => {
  it('flags only a manifest that positively names a different version', () => {
    expect(staleFromManifest({ engineVersion: ENGINE_VERSION + 1 })).toBe(true)
    expect(staleFromManifest({ engineVersion: ENGINE_VERSION })).toBe(false)
  })

  it('fails open on anything malformed — missing, wrong type, not an object', () => {
    expect(staleFromManifest({})).toBe(false)
    expect(staleFromManifest({ engineVersion: '2' })).toBe(false)
    expect(staleFromManifest(null)).toBe(false)
    expect(staleFromManifest(undefined)).toBe(false)
    expect(staleFromManifest('garbage')).toBe(false)
  })
})

describe('bundleIsStale in test mode', () => {
  afterEach(() => vi.restoreAllMocks())

  it('never fetches — backendEnabled is false, CI must not touch the network', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    await expect(bundleIsStale()).resolves.toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })
})
