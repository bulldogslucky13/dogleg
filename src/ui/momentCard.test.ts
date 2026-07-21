import { describe, expect, it, vi } from 'vitest'
import { shareMomentCard, type MomentShareEnv } from './momentCard'

// Each test models a real browser's capability profile so the channel
// choice (native sheet → clipboard → download) is pinned without a DOM.

const PNG = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
const OPTS = { filename: 'dogleg-hole-in-one.png', text: 'Hole in one ⛳ — Dogleg', url: 'https://dogleg.cameronbristol.xyz' }

class FakeClipboardItem {
  items: Record<string, Blob>
  constructor(items: Record<string, Blob>) {
    this.items = items
  }
}
const clipboardItem = FakeClipboardItem as unknown as MomentShareEnv['clipboardItem']

describe('shareMomentCard channel choice', () => {
  it('iOS Safari / Android Chrome (file share supported) → native sheet with the image attached', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const env: MomentShareEnv = {
      nav: { share, canShare: () => true },
      clipboardItem,
      download: vi.fn(),
    }
    expect(await shareMomentCard(PNG, OPTS, env)).toBe('native')
    const payload = share.mock.calls[0][0]
    expect(payload.files).toHaveLength(1)
    expect(payload.files[0].type).toBe('image/png')
    expect(payload.text).toBe(OPTS.text)
    expect(payload.url).toBe(OPTS.url)
    expect(env.download).not.toHaveBeenCalled()
  })

  it('user closes the share sheet → cancelled, silently, nothing else fires', async () => {
    const abort = new Error('cancelled')
    abort.name = 'AbortError'
    const write = vi.fn()
    const env: MomentShareEnv = {
      nav: { share: vi.fn().mockRejectedValue(abort), canShare: () => true, clipboard: { write } },
      clipboardItem,
      download: vi.fn(),
    }
    expect(await shareMomentCard(PNG, OPTS, env)).toBe('cancelled')
    expect(write).not.toHaveBeenCalled()
    expect(env.download).not.toHaveBeenCalled()
  })

  it('desktop Chrome (share exists but not for files) → PNG copied to the clipboard', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const env: MomentShareEnv = {
      nav: { share: vi.fn(), canShare: () => false, clipboard: { write } },
      clipboardItem,
      download: vi.fn(),
    }
    expect(await shareMomentCard(PNG, OPTS, env)).toBe('clipboard')
    const item = write.mock.calls[0][0][0] as FakeClipboardItem
    expect(item.items['image/png']).toBe(PNG)
    expect(env.download).not.toHaveBeenCalled()
  })

  it('native share fails mid-flight (not a cancel) → falls back to clipboard', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const env: MomentShareEnv = {
      nav: { share: vi.fn().mockRejectedValue(new Error('boom')), canShare: () => true, clipboard: { write } },
      clipboardItem,
      download: vi.fn(),
    }
    expect(await shareMomentCard(PNG, OPTS, env)).toBe('clipboard')
  })

  it('no share, no ClipboardItem (older desktop) → downloads the image', async () => {
    const download = vi.fn()
    const env: MomentShareEnv = { nav: {}, clipboardItem: undefined, download }
    expect(await shareMomentCard(PNG, OPTS, env)).toBe('download')
    expect(download).toHaveBeenCalledWith(PNG, OPTS.filename)
  })

  it('clipboard write blocked by permissions → downloads instead', async () => {
    const download = vi.fn()
    const env: MomentShareEnv = {
      nav: { clipboard: { write: vi.fn().mockRejectedValue(new Error('denied')) } },
      clipboardItem,
      download,
    }
    expect(await shareMomentCard(PNG, OPTS, env)).toBe('download')
    expect(download).toHaveBeenCalledWith(PNG, OPTS.filename)
  })
})
