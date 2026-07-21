import { createElement } from 'react'
import { toParLabel } from '../engine/daily'
import { MOMENT_COPY, type MomentKind } from '../engine/fortune'
import type { CharacterId } from '../engine/types'
import { characterById } from '../engine/characters'
import { CharacterAvatar } from './Avatars'

/**
 * Renders the moment splash as a standalone bragging card on an offscreen
 * canvas — everything the on-screen splash shows except the UI chrome —
 * and shares it as a PNG. The canvas mirrors the .moment-* styles in
 * styles.css by hand; if those change materially, update this to match.
 */

/** the fortune moments, plus the course-record reclaim — same pipeline */
export type CardKind = MomentKind | 'record'

export type MomentCardProps = {
  kind: CardKind
  holeNumber: number
  courseName: string
  dateKey: string
  toPar: number
  character?: CharacterId
  /** current day streak; joins the meta line when it's 2+ (a brag, not a shrug) */
  streak?: number
  /** headline/sub override — the record card supplies its own words */
  copy?: { title: string; sub: string }
  /** meta-line override (record cards have no single hole to name) */
  meta?: string
}

// logical design size (2x'd for export so the PNG stays crisp when shared)
const W = 540
const H = 675
const SCALE = 2
const FONTS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const PALETTE: Record<CardKind, { stops: [string, string, string]; confetti: [string, string, string] }> = {
  // colors lifted from .moment-backdrop.ace / .albatross and their confetti tints
  ace: { stops: ['#b98a1f', '#7a5a10', '#241c05'], confetti: ['#ffd968', '#c05b4d', '#f4efe3'] },
  albatross: { stops: ['#7c56b8', '#4c3378', '#150d24'], confetti: ['#c9a7ff', '#6fbf66', '#f4efe3'] },
  // course-record reclaim: clubhouse greens with gold confetti
  record: { stops: ['#3f7a44', '#26512d', '#0e2415'], confetti: ['#ffd968', '#c9a227', '#f4efe3'] },
}

export async function momentCardBlob(props: MomentCardProps): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.scale(SCALE, SCALE)

  const pal = PALETTE[props.kind]
  const copy = props.copy ?? MOMENT_COPY[props.kind as MomentKind]

  // backdrop — radial wash centered a touch above the middle, like the CSS
  const bg = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.95)
  bg.addColorStop(0, pal.stops[0])
  bg.addColorStop(0.45, pal.stops[1])
  bg.addColorStop(1, pal.stops[2])
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // sunburst rays from behind the ball (static take on .moment-rays)
  const rayCx = W / 2
  const rayCy = 245
  ctx.fillStyle = 'rgba(255, 255, 255, 0.11)'
  for (let a = 0; a < 360; a += 24) {
    ctx.beginPath()
    ctx.moveTo(rayCx, rayCy)
    ctx.arc(rayCx, rayCy, 900, (a * Math.PI) / 180, ((a + 9) * Math.PI) / 180)
    ctx.closePath()
    ctx.fill()
  }

  // confetti — same deterministic scatter as the live splash
  for (let i = 0; i < 26; i++) {
    const x = (((i * 37) % 100) / 100) * W
    const y = (((i * 53) % 97) / 100) * H
    const size = 6 + ((i * 5) % 8)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate((((i * 47) % 360) * Math.PI) / 180)
    ctx.globalAlpha = 0.9
    ctx.fillStyle = i % 3 === 0 ? pal.confetti[0] : i % 3 === 1 ? pal.confetti[1] : pal.confetti[2]
    fillRoundRect(ctx, -size / 2, -size * 0.8, size, size * 1.6, 2)
    ctx.restore()
  }

  const centered = (px: number, weight: number) => {
    ctx.font = `${weight} ${px}px ${FONTS}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
  }
  const softShadow = () => {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 2
  }
  const noShadow = () => {
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
  }

  // kicker
  ctx.save()
  softShadow()
  ctx.fillStyle = 'rgba(248, 244, 233, 0.85)'
  centered(13, 800)
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '3px'
  ctx.fillText(`⛳ DOGLEG · ${props.courseName.toUpperCase()}`, W / 2, 168, W - 48)
  ctx.restore()

  // the ball, glowing, freshly dropped
  drawBall(ctx, W / 2, rayCy, 37)

  // headline — shrink-to-fit so ALBATROSS sits inside the margins too
  ctx.save()
  softShadow()
  ctx.fillStyle = '#f8f4e9'
  let titlePx = 58
  centered(titlePx, 900)
  while (ctx.measureText(copy.title).width > W - 64 && titlePx > 30) {
    titlePx -= 2
    centered(titlePx, 900)
  }
  ctx.fillText(copy.title, W / 2, 348)
  noShadow()

  // sub line
  softShadow()
  ctx.fillStyle = 'rgba(248, 244, 233, 0.92)'
  centered(17, 700)
  ctx.fillText(copy.sub, W / 2, 384, W - 64)
  ctx.restore()

  // character chip
  const char = characterById(props.character)
  let metaY = 448
  if (char) {
    await drawCharChip(ctx, W / 2, 430, char.id, char.name)
    metaY = 492
  }

  // meta line
  ctx.save()
  softShadow()
  ctx.fillStyle = 'rgba(248, 244, 233, 0.92)'
  centered(14, 600)
  const streak = props.streak && props.streak >= 2 ? ` · ${props.streak}-day streak` : ''
  ctx.fillText(
    props.meta ?? `Hole ${props.holeNumber} · ${toParLabel(props.toPar)} on the round · ${shortDate(props.dateKey)}${streak}`,
    W / 2,
    metaY,
    W - 48,
  )
  ctx.restore()

  // logo watermark, bottom-right
  await drawLogo(ctx, W - 60, H - 60, 44)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas export failed'))), 'image/png')
  })
}

function drawBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save()
  // white halo + drop shadow, then the dimpled ball on top
  ctx.shadowColor = 'rgba(255, 255, 255, 0.35)'
  ctx.shadowBlur = 60
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = 34
  ctx.shadowOffsetY = 10
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  const g = ctx.createRadialGradient(cx - r * 0.36, cy - r * 0.44, 0, cx - r * 0.36, cy - r * 0.44, r * 2.2)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.7, '#d9d4c4')
  g.addColorStop(1, '#a9a494')
  ctx.fillStyle = g
  ctx.fill()
  // dimples, same offsets as .moment-ball span's box-shadow (scaled to r)
  const s = r / 37
  const dimples: Array<[number, number, number]> = [
    [0, 0, 0.18],
    [-18 * s, -6 * s, 0.14],
    [16 * s, -10 * s, 0.14],
    [-8 * s, 14 * s, 0.14],
    [14 * s, 12 * s, 0.14],
  ]
  for (const [dx, dy, a] of dimples) {
    ctx.beginPath()
    ctx.arc(cx + dx, cy + dy, 5 * s, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(0, 0, 0, ${a})`
    ctx.fill()
  }
  ctx.restore()
}

async function drawCharChip(ctx: CanvasRenderingContext2D, cx: number, cy: number, id: CharacterId, name: string) {
  const h = 52
  const avatar = 40
  ctx.font = `800 16px ${FONTS}`
  const textW = ctx.measureText(name).width
  const w = 6 + avatar + 8 + textW + 16
  const x = cx - w / 2
  const y = cy - h / 2
  ctx.save()
  ctx.fillStyle = 'rgba(248, 244, 233, 0.14)'
  ctx.strokeStyle = 'rgba(248, 244, 233, 0.35)'
  ctx.lineWidth = 1.5
  fillRoundRect(ctx, x, y, w, h, h / 2)
  ctx.stroke()
  try {
    const img = await avatarImage(id)
    ctx.drawImage(img, x + 6, y + (h - avatar) / 2, avatar, avatar)
  } catch {
    // avatar rasterization failed — the name still identifies the player
  }
  ctx.fillStyle = '#f8f4e9'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, x + 6 + avatar + 8, cy + 1)
  ctx.restore()
}

async function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  try {
    const img = await loadImage(`${import.meta.env.BASE_URL}icon.png`)
    ctx.save()
    ctx.globalAlpha = 0.9
    roundRectPath(ctx, x, y, size, size, 10)
    ctx.clip()
    ctx.drawImage(img, x, y, size, size)
    ctx.restore()
  } catch {
    // logo failed to load (offline?) — ship the card without the watermark
  }
}

async function avatarImage(id: CharacterId): Promise<HTMLImageElement> {
  // rasterize the real avatar component so the card matches the splash
  const { renderToStaticMarkup } = await import('react-dom/server')
  // React omits xmlns, but an SVG loaded as an <img> is invalid without it
  const svg = renderToStaticMarkup(createElement(CharacterAvatar, { id, size: 96 })).replace(
    '<svg',
    '<svg xmlns="http://www.w3.org/2000/svg"',
  )
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    return await loadImage(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image failed: ${src}`))
    img.src = src
  })
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  roundRectPath(ctx, x, y, w, h, r)
  ctx.fill()
}

function shortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Share the card, picking the richest channel the browser supports:
 * native share sheet with the image attached (iOS Safari, Android Chrome),
 * else copy the PNG to the clipboard (desktop Chrome/Safari/Firefox 127+),
 * else download it. Capabilities are injectable so tests can run each
 * browser profile without a real navigator.
 */

export type MomentShareOutcome = 'native' | 'clipboard' | 'download' | 'cancelled'

export type MomentShareEnv = {
  nav: {
    share?: (data: { files?: File[]; text?: string; url?: string }) => Promise<void>
    canShare?: (data: { files?: File[] }) => boolean
    clipboard?: { write?: (items: ClipboardItem[]) => Promise<void> }
  }
  /** the ClipboardItem constructor, when the browser has one */
  clipboardItem?: new (items: Record<string, Blob>) => ClipboardItem
  download: (blob: Blob, filename: string) => void
}

function defaultEnv(): MomentShareEnv {
  return {
    nav: navigator as MomentShareEnv['nav'],
    clipboardItem: typeof ClipboardItem === 'undefined' ? undefined : ClipboardItem,
    download: domDownload,
  }
}

export async function shareMomentCard(
  blob: Blob,
  opts: { filename: string; text: string; url: string },
  env: MomentShareEnv = defaultEnv(),
): Promise<MomentShareOutcome> {
  const file = new File([blob], opts.filename, { type: 'image/png' })
  const { nav } = env

  if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], text: opts.text, url: opts.url })
      return 'native'
    } catch (err) {
      // user closed the share sheet — stay on the celebration, say nothing
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled'
      // anything else (share target crashed, permission): fall through
    }
  }

  if (env.clipboardItem && typeof nav.clipboard?.write === 'function') {
    try {
      await nav.clipboard.write([new env.clipboardItem({ 'image/png': blob })])
      return 'clipboard'
    } catch {
      // clipboard blocked (permissions, insecure context) — download instead
    }
  }

  env.download(blob, opts.filename)
  return 'download'
}

function domDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
