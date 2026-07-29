/**
 * Screenshots an HTML page to PNG with headless Chrome.
 *
 * Shared by the two build-time image tools (the email masthead and the
 * link-preview card). Chrome is already on any machine that browses, so this
 * keeps a node-canvas/sharp dependency out of package.json for files that
 * change about once a rebrand.
 */
import { writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const CHROMES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

export function findChrome(): string {
  const chrome = CHROMES.find((p) => {
    try {
      execFileSync('test', ['-x', p])
      return true
    } catch {
      return false
    }
  })
  if (!chrome) {
    throw new Error(`no Chrome/Chromium found; looked in:\n  ${CHROMES.join('\n  ')}`)
  }
  return chrome
}

export type ShotOptions = {
  /** CSS pixel box to capture */
  width: number
  height: number
  /** device scale; 2 for retina rasters, 1 where the box is already the
   *  final pixel size (the OG card is authored at its true 1200x630) */
  scale?: number
  /** transparent ground instead of the page's own background */
  transparent?: boolean
  /** label used in the temp filename, for debuggability */
  tag?: string
}

/** Write `html` to a temp file, screenshot it, leave the PNG at `outPng`. */
export function shotHtml(html: string, outPng: string, opts: ShotOptions): void {
  const { width, height, scale = 1, transparent = false, tag = 'shot' } = opts
  const chrome = findChrome()

  const tmp = resolve(tmpdir(), `dogleg-${tag}-${process.pid}.html`)
  writeFileSync(tmp, html)
  try {
    execFileSync(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        ...(transparent ? ['--default-background-color=00000000'] : []),
        `--force-device-scale-factor=${scale}`,
        `--window-size=${width},${height}`,
        `--screenshot=${outPng}`,
        // local @font-face files load over file://; without this Chrome
        // treats each as a cross-origin fetch and silently falls back
        '--allow-file-access-from-files',
        `file://${tmp}`,
      ],
      { stdio: 'ignore' },
    )
  } finally {
    rmSync(tmp, { force: true })
  }
}
