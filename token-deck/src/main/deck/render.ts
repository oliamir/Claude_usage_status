import fs from 'fs'
import { createCanvas, loadImage, type Canvas, type SKRSContext2D } from '@napi-rs/canvas'
import { APPROVAL, C4, C8, HAIR, INK, LIME, LIMIT, STALE, UNLIT, WHITE, WORKING } from './colors'
import { disc, fill, ring, roundRect, strokeRect, text, textScaled } from './draw'
import { AGENT_PLACEMENT, loadGlyph, loadSvgFile } from './glyphs'
import { hairlineColumns, layoutOffset, safeRect, windowCentreInTile, type LayoutName } from './geometry'
import { resource } from '../paths'
import { fitText, fitTitle, inkWidth, measure } from './pixelfont'
import { brandLogoSvg, presetIconSvg } from '../../shared/presets'
import { appIconCachePath, siteFaviconCachePath } from '../system/focus'
import type { AgentId, ModelPaint, SessionPaint, SessionStatus, TileSpec } from '../../shared/model'

const welcomeCache = new Map<number, Buffer>()

export function welcomeCrop(key: number): Buffer {
  const hit = welcomeCache.get(key)
  if (hit) return hit
  const buf = fs.readFileSync(resource('welcome-tiles', `key${key}.jpg`))
  welcomeCache.set(key, buf)
  return buf
}

function blank(): { canvas: Canvas; ctx: SKRSContext2D } {
  const canvas = createCanvas(64, 64) as Canvas
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  fill(ctx, INK, 0, 0, 64, 64)
  return { canvas, ctx }
}

/** dst(x, y) = src(y, 63 − x). 90° clockwise, pixel copy. */
export function toWireCanvas(source: Canvas): Canvas {
  const src = source.getContext('2d').getImageData(0, 0, 64, 64)
  const dest = createCanvas(64, 64) as Canvas
  const dctx = dest.getContext('2d')
  const image = dctx.getImageData(0, 0, 64, 64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const sx = y
      const sy = 63 - x
      const si = (sy * 64 + sx) * 4
      const di = (y * 64 + x) * 4
      image.data[di] = src.data[si]!
      image.data[di + 1] = src.data[si + 1]!
      image.data[di + 2] = src.data[si + 2]!
      image.data[di + 3] = 255
    }
  }
  dctx.putImageData(image, 0, 0)
  return dest
}

export async function encodeWire(source: Canvas): Promise<Buffer> {
  const wire = toWireCanvas(source)
  return Buffer.from(await wire.encode('jpeg', { quality: 100 }))
}

/**
 * Converts a 64x64 90°-CW-rotated wire JPEG into a 60x60 upright (0° rotation) JPEG
 * for Protocol v2 devices (e.g. Ajazz AKP03 / AKP03E rev. 1).
 */
export async function wireToProtocolV2Jpeg(wireJpeg: Buffer): Promise<Buffer> {
  const img = await loadImage(wireJpeg)
  const wireCanvas = createCanvas(64, 64) as Canvas
  const wctx = wireCanvas.getContext('2d')
  wctx.drawImage(img, 0, 0, 64, 64)
  const wireData = wctx.getImageData(0, 0, 64, 64)

  const dest = createCanvas(60, 60) as Canvas
  const dctx = dest.getContext('2d')
  const out = dctx.createImageData(60, 60)
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 60; x++) {
      const ux = x + 2
      const uy = y + 2
      const wx = 63 - uy
      const wy = ux
      const si = (wy * 64 + wx) * 4
      const di = (y * 60 + x) * 4
      out.data[di] = wireData.data[si]!
      out.data[di + 1] = wireData.data[si + 1]!
      out.data[di + 2] = wireData.data[si + 2]!
      out.data[di + 3] = 255
    }
  }
  dctx.putImageData(out, 0, 0)
  return Buffer.from(await dest.encode('jpeg', { quality: 100 }))
}

function shift(layout: LayoutName, key: number, enabled: boolean): { dx: number; dy: number } {
  if (!enabled) return { dx: 0, dy: 0 }
  return layoutOffset(key, layout)
}

async function drawAgentGlyph(
  ctx: SKRSContext2D,
  layout: 'agents' | 'sessions',
  agent: AgentId,
  dx: number,
  dy: number,
  dim: boolean
): Promise<void> {
  const place = AGENT_PLACEMENT[layout][agent]
  const image = await loadGlyph(place, WHITE, dim)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(image, place.x + dx, place.y + dy, place.w, place.h)
}

function emptySlot(ctx: SKRSContext2D, key: number, offset: boolean): void {
  const c = offset ? windowCentreInTile(key) : { x: 32, y: 32 }
  const ox = Math.round(c.x - 9)
  const oy = Math.round(c.y - 9)
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      fill(ctx, UNLIT, ox + col * 5, oy + row * 5, 3, 3)
    }
  }
}

async function paintAgents(
  ctx: SKRSContext2D,
  spec: Extract<TileSpec, { kind: 'agents' }>,
  key: number,
  offset: boolean,
  _clip: boolean
): Promise<number> {
  const { dx, dy } = shift('agents', key, offset)
  await drawAgentGlyph(ctx, 'agents', spec.agent, dx, dy, !spec.installed)
  return dy
}

function statusColor(status: SessionStatus): string {
  switch (status) {
    case 'working':
      return WORKING
    case 'needs-approval':
      return APPROVAL
    case 'needs-input':
      return WHITE
    case 'completed':
      return LIME
    case 'disconnected':
      return STALE
    default:
      return C8
  }
}

async function paintSession(
  ctx: SKRSContext2D,
  session: SessionPaint | null,
  key: number,
  offset: boolean,
  clip: boolean
): Promise<number> {
  const { dx, dy } = shift('sessions', key, offset)
  if (!session) {
    emptySlot(ctx, key, offset)
    return dy
  }
  const cx = 32 + dx
  const cy = 27 + dy
  const disconnected = session.status === 'disconnected'
  const unknown = session.context === null
  if (unknown) ring(ctx, cx, cy, 17, 4, disconnected ? STALE : C8, Math.PI * 2, true)
  else {
    ring(ctx, cx, cy, 17, 4, UNLIT, null)
    if (session.context !== null && session.context > 0) {
      const arc = disconnected ? STALE : session.context > 85 ? LIMIT : WHITE
      ring(ctx, cx, cy, 17, 4, arc, (session.context / 100) * Math.PI * 2)
    }
  }
  await drawAgentGlyph(ctx, 'sessions', session.agent, dx, dy, false)
  disc(ctx, 44 + dx, 15 + dy, 15, INK)
  if (disconnected) ring(ctx, 44 + dx, 15 + dy, 5, 3, STALE, null)
  else disc(ctx, 44 + dx, 15 + dy, 10, statusColor(session.status))
  if (session.status === 'needs-approval') {
    strokeRect(ctx, 3 + dx, 2 + dy, 58, 58, 3, APPROVAL)
  }
  if (!clip) {
    const title = fitTitle(session.title, 50)
    text(ctx, title, 32 + dx, 48 + dy, disconnected ? STALE : C4, 'center')
  }
  return dy
}

function paintModel(ctx: SKRSContext2D, model: ModelPaint | null, key: number, offset: boolean, _clip: boolean): number {
  const { dx, dy } = shift('models', key, offset)
  if (!model) {
    emptySlot(ctx, key, offset)
    return dy
  }
  const lines = modelNameLines(model.name)
  const lineH = 14
  const gap = lines.length > 1 ? 4 : 0
  const block = lines.length * lineH + (lines.length - 1) * gap
  let y = Math.round((64 - block) / 2) + dy
  const color = model.current ? LIME : WHITE
  for (const line of lines) {
    textScaled(ctx, line, 32 + dx, y, color, 'center', 2, inkWidth(line, false) > 30)
    y += lineH + gap
  }
  return dy
}

/** Up to three lines of 2× type. A line wider than 30px at 1× is drawn without the letter gap. */
function modelNameLines(name: string): string[] {
  const upper = name.toUpperCase()
  if (inkWidth(upper, false) <= 30) return [upper]
  const lines: string[] = []
  for (const word of upper.split(' ').filter((part) => part.length > 0)) {
    if (inkWidth(word, false) <= 30) {
      lines.push(word)
      continue
    }
    const bits = word.split('-').filter((part) => part.length > 0)
    if (bits.length > 1 && bits.every((bit) => inkWidth(bit, false) <= 30)) lines.push(...bits)
    else lines.push(word)
  }
  return lines.slice(0, 3)
}

function paintUsage(
  ctx: SKRSContext2D,
  spec: Extract<TileSpec, { kind: 'usage' }>,
  key: number,
  offset: boolean
): number {
  const { dx, dy } = shift('models', key, offset)
  text(ctx, 'USAGE', 32 + dx, 4 + dy, LIME, 'center')
  text(ctx, fitText(spec.agent, 56, 10), 32 + dx, 14 + dy, WHITE, 'center')
  usageRow(ctx, spec.fiveLabel, spec.fiveHour, 26, dx, dy)
  usageRow(ctx, spec.sevenLabel, spec.sevenDay, 44, dx, dy)
  return dy
}

function usageRow(ctx: SKRSContext2D, label: string, pct: number | null, y: number, dx: number, dy: number): void {
  text(ctx, label, 4 + dx, y + dy, C8)
  text(ctx, pct === null ? '--' : `${Math.round(pct)}%`, 60 + dx, y + dy, WHITE, 'right')
  fill(ctx, UNLIT, 4 + dx, y + 8 + dy, 56, 4)
  if (pct !== null && pct > 0) fill(ctx, LIME, 4 + dx, y + 8 + dy, Math.max(3, Math.round(56 * Math.min(100, pct) / 100)), 4)
}

async function paintCustom(
  ctx: SKRSContext2D,
  lines: string[] | null,
  iconFile: string | undefined,
  color: string | undefined,
  key: number,
  offset: boolean,
  clip: boolean
): Promise<number> {
  const { dx, dy } = shift('custom', key, offset)
  const hasLabel = !!lines && lines.some((l) => l.trim().length > 0)
  const hasIcon = !!iconFile
  if (!hasLabel && !hasIcon) {
    emptySlot(ctx, key, offset)
    return dy
  }
  const tint = color || WHITE
  let drewIcon = false
  if (iconFile) {
    try {
      if (iconFile.startsWith('preset:')) {
        const svg = presetIconSvg(iconFile, tint, 26)
        if (svg) {
          const img = await loadImage(Buffer.from(svg))
          ctx.imageSmoothingEnabled = true
          ctx.drawImage(img, 32 - 13 + dx, (hasLabel ? 19 : 32) - 13 + dy, 26, 26)
          drewIcon = true
        }
      } else if (iconFile.startsWith('brand:')) {
        const svg = brandLogoSvg(iconFile, 28)
        if (svg) {
          const img = await loadImage(Buffer.from(svg))
          ctx.imageSmoothingEnabled = true
          ctx.drawImage(img, 32 - 14 + dx, (hasLabel ? 19 : 32) - 14 + dy, 28, 28)
          drewIcon = true
        }
      } else if (iconFile.startsWith('favicon:')) {
        const pngPath = siteFaviconCachePath(iconFile.slice(8))
        if (fs.existsSync(pngPath)) {
          const img = await loadImage(pngPath)
          ctx.imageSmoothingEnabled = true
          ctx.drawImage(img, 32 - 14 + dx, (hasLabel ? 19 : 32) - 14 + dy, 28, 28)
          drewIcon = true
        } else {
          const svg = presetIconSvg('preset:globe', tint, 26)
          if (svg) {
            const img = await loadImage(Buffer.from(svg))
            ctx.imageSmoothingEnabled = true
            ctx.drawImage(img, 32 - 13 + dx, (hasLabel ? 19 : 32) - 13 + dy, 26, 26)
            drewIcon = true
          }
        }
      } else if (iconFile.startsWith('glyph:')) {
        const glyphName = iconFile.slice(6).replace(/[^a-z0-9-]/gi, '')
        const glyphPath = resource('glyphs', `${glyphName}.svg`)
        if (fs.existsSync(glyphPath)) {
          const img = await loadSvgFile(glyphPath, 26, tint)
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(img, 32 - 13 + dx, (hasLabel ? 19 : 32) - 13 + dy, 26, 26)
          drewIcon = true
        }
      } else if (iconFile.startsWith('app:')) {
        const pngPath = appIconCachePath(iconFile.slice(4))
        if (fs.existsSync(pngPath)) {
          const img = await loadImage(pngPath)
          ctx.imageSmoothingEnabled = true
          ctx.drawImage(img, 32 - 15 + dx, (hasLabel ? 19 : 32) - 15 + dy, 30, 30)
          drewIcon = true
        }
      } else if (fs.existsSync(iconFile)) {
        const image = iconFile.toLowerCase().endsWith('.svg') ? await loadSvgFile(iconFile, 28, tint) : await loadImage(iconFile)
        ctx.imageSmoothingEnabled = !iconFile.toLowerCase().endsWith('.svg')
        ctx.drawImage(image, 32 - 14 + dx, (hasLabel ? 20 : 32) - 14 + dy, 28, 28)
        drewIcon = true
      }
    } catch {
      /* fallback to label only */
    }
  }
  if (!clip && lines && hasLabel) {
    const rows = lines.filter((l) => l.trim().length > 0).slice(0, 2)
    if (drewIcon) {
      const startY = rows.length === 1 ? 42 : 38
      rows.forEach((line, i) => {
        const fitted = fitText(line.toUpperCase(), 50, 12)
        text(ctx, fitted, 32 + dx, startY + i * 9 + dy, WHITE, 'center')
      })
    } else if (rows.length === 1 && inkWidth(rows[0]!.toUpperCase(), false) <= 28) {
      textScaled(ctx, rows[0]!.toUpperCase(), 32 + dx, 25 + dy, tint, 'center', 2)
    } else {
      const startY = rows.length === 1 ? 28 : 23
      rows.forEach((line, i) => {
        const fitted = fitText(line.toUpperCase(), 50, 12)
        text(ctx, fitted, 32 + dx, startY + i * 11 + dy, tint, 'center')
      })
    }
  }
  return dy
}

async function paintConnect(ctx: SKRSContext2D, key: number, offset: boolean): Promise<number> {
  const { dx, dy } = shift('agents', key, offset)
  const image = await loadSvgFile(resource('glyphs', 'claude-code.svg'), 30)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(image, 17 + dx, 10 + dy, 30, 29)
  text(ctx, 'CONNECT', 12 + dx, 47 + dy, WHITE)
  return dy
}

function paintTest(ctx: SKRSContext2D): void {
  strokeRect(ctx, 0, 0, 64, 64, 1, APPROVAL)
  ring(ctx, 32, 24, 14, 2, LIME, null)
  text(ctx, 'LIME', 32, 8, LIME, 'center')
  text(ctx, 'Sonnet', 32, 40, WHITE, 'center')
  roundRect(ctx, 4, 50, 56, 12, 2, LIME)
  text(ctx, 'Opus', 32, 52, INK, 'center')
}

function paintOverlay(ctx: SKRSContext2D, key: number, dy: number, group: string | null): void {
  if (group && group.startsWith('VOL=') && key <= 3) {
    fill(ctx, INK, 0, 0, 64, 64)
    const c = windowCentreInTile(key)
    const cx = Math.round(c.x)
    const cy = Math.round(c.y)
    const val = group.slice(4)
    if (key === 1) {
      text(ctx, 'VOLUME', cx, cy - 14, LIME, 'center')
      // Speaker cone + waves
      fill(ctx, WHITE, cx - 10, cy - 1, 4, 6)
      fill(ctx, WHITE, cx - 6, cy - 4, 3, 12)
      fill(ctx, LIME, cx, cy - 2, 2, 8)
      fill(ctx, LIME, cx + 4, cy - 5, 2, 14)
      fill(ctx, LIME, cx + 8, cy - 8, 2, 20)
    } else if (key === 2) {
      const isMute = val === 'MUTE'
      const pct = isMute ? 0 : parseInt(val, 10) || 0
      textScaled(ctx, val, cx, cy - 12, isMute ? APPROVAL : WHITE, 'center', 2)
      const barW = 44
      const barX = cx - Math.floor(barW / 2)
      const barY = cy + 8
      fill(ctx, UNLIT, barX, barY, barW, 5)
      if (!isMute && pct > 0) {
        fill(ctx, LIME, barX, barY, Math.max(2, Math.round((barW * Math.min(100, pct)) / 100)), 5)
      }
    } else if (key === 3) {
      const pct = parseInt(val, 10) || 0
      const activeBars = Math.round((pct / 100) * 5)
      for (let i = 0; i < 5; i++) {
        const bh = 6 + i * 4
        const bx = cx - 15 + i * 7
        const by = cy + 12 - bh
        fill(ctx, i < activeBars ? LIME : UNLIT, bx, by, 4, bh)
      }
    }
    return
  }
  const safe = safeRect(key)
  const top = Math.min(44 + dy, safe.y1 - 11)
  if (top < 64) fill(ctx, INK, 0, top, 64, 64 - top)
  if (top >= 0 && top < 64) {
    const cols = hairlineColumns(key)
    fill(ctx, HAIR, cols.x0, top, cols.x1 - cols.x0 + 1, 1)
  }
  if (!group) return
  if (key > 3) return
  const centre = windowCentreInTile(key).x
  const y = top + 3
  const w = measure(group)
  let x = Math.round(centre - (w - 1) / 2)
  if (x < safe.x0) x = safe.x0
  if (x + w - 1 > safe.x1) x = safe.x1 - w + 1
  text(ctx, group, x, y, WHITE)
}

export async function renderUpright(spec: TileSpec, key: number, offset = true, overlay: string | null = null): Promise<Canvas> {
  if (spec.kind === 'welcome') {
    throw new Error('welcome crops are pre-encoded')
  }
  const { canvas, ctx } = blank()
  let dy = 0
  const clip = overlay !== null
  if (spec.kind === 'agents') dy = await paintAgents(ctx, spec, key, offset, clip)
  else if (spec.kind === 'session') dy = await paintSession(ctx, spec.session, key, offset, clip)
  else if (spec.kind === 'model') dy = paintModel(ctx, spec.model, key, offset, clip)
  else if (spec.kind === 'usage') dy = paintUsage(ctx, spec, key, offset)
  else if (spec.kind === 'custom') dy = await paintCustom(ctx, spec.custom?.lines ?? null, spec.custom?.iconFile, spec.custom?.color, key, offset, clip)
  else if (spec.kind === 'connect') dy = await paintConnect(ctx, key, offset)
  else if (spec.kind === 'test') paintTest(ctx)
  if (overlay !== null) paintOverlay(ctx, key, dy, overlay.length ? overlay : null)
  return canvas
}

export async function renderTile(spec: TileSpec, key: number, offset = true, overlay: string | null = null): Promise<Buffer> {
  if (spec.kind === 'welcome') return welcomeCrop(key)
  const canvas = await renderUpright(spec, key, offset, overlay)
  return encodeWire(canvas)
}

export function litCount(pct: number): number {
  return Math.max(0, Math.min(10, Math.round(pct / 10)))
}
