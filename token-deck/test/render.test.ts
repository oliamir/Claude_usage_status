import { describe, expect, it } from 'vitest'
import { createCanvas, type Canvas } from '@napi-rs/canvas'
import { encodeWire, renderTile, renderUpright, toWireCanvas, wireToProtocolV2Jpeg } from '../src/main/deck/render'
import { is444, jpegInfo } from '../src/main/deck/jpeg'
import { demoAgents, demoIdle, demoModelTiles, demoSessions } from '../src/main/deck/demo'
import { welcomeCrop } from '../src/main/deck/render'
import type { TileSpec } from '../src/shared/model'
import { splitGroups } from '../src/shared/overlays'
import { BRAND_LOGOS, PRESET_ICONS, inferIconForShortcut, inferLogoForShell, inferLogoForUrl } from '../src/shared/presets'

describe('rotation and jpeg', () => {
  it('moves a pixel at (0, 0) to (63, 0)', () => {
    const canvas = createCanvas(64, 64)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, 64, 64)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 1, 1)
    const wire = toWireCanvas(canvas)
    const data = wire.getContext('2d').getImageData(0, 0, 64, 64).data
    const at = (x: number, y: number) => data[(y * 64 + x) * 4]
    expect(at(63, 0)).toBe(255)
    expect(at(0, 0)).toBe(0)
  })

  it('encodes 4:4:4 at quality 100', async () => {
    const canvas = createCanvas(64, 64)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#131512'
    ctx.fillRect(0, 0, 64, 64)
    ctx.fillStyle = '#92E759'
    ctx.fillRect(8, 8, 4, 4)
    const jpeg = await encodeWire(canvas)
    const info = jpegInfo(jpeg)
    expect(info.baseline).toBe(true)
    expect(is444(info)).toBe(true)

    const v2Jpeg = await wireToProtocolV2Jpeg(jpeg)
    const v2Info = jpegInfo(v2Jpeg)
    expect(v2Info.width).toBe(60)
    expect(v2Info.height).toBe(60)
    expect(v2Info.baseline).toBe(true)
    expect(is444(v2Info)).toBe(true)
  })
})

describe('built-in tiles stay under 10 KB', () => {
  it('renders demo, idle, overlays and welcome crops', async () => {
    const specs: Array<{ spec: TileSpec; key: number; overlay?: string | null }> = []
    demoAgents().forEach((spec, i) => specs.push({ spec, key: i + 1 }))
    demoSessions().forEach((spec, i) => specs.push({ spec, key: i + 1 }))
    demoModelTiles().forEach((spec, i) => specs.push({ spec, key: i + 1 }))
    demoIdle().forEach((spec, i) => specs.push({ spec, key: i + 1 }))
    specs.push({ spec: { kind: 'test' }, key: 1 })
    specs.push({ spec: { kind: 'session', session: null }, key: 3 })
    specs.push({ spec: { kind: 'custom', custom: { lines: ['BUILD', 'NOW'] } }, key: 6 })
    const overlay = splitGroups('ASK | PRESS TO | APPLY')
    demoAgents().forEach((spec, i) => specs.push({ spec, key: i + 1, overlay: overlay[i] ?? '' }))
    for (const item of specs) {
      const jpeg = await renderTile(item.spec, item.key, true, item.overlay ?? null)
      expect(jpeg.length).toBeLessThan(10000)
    }
    for (let key = 1; key <= 6; key++) expect(welcomeCrop(key).length).toBeLessThan(10000)
  })
})

describe('brand logos and shortcut icons', () => {
  it('renders all 24 brand logos and 36 preset icons cleanly onto tiles', async () => {
    const countNonInk = (canvas: Canvas) => {
      const data = canvas.getContext('2d').getImageData(0, 0, 64, 64).data
      let count = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== 0x13 || data[i + 1] !== 0x15 || data[i + 2] !== 0x12) count++
      }
      return count
    }

    for (const logo of BRAND_LOGOS) {
      const spec: TileSpec = { kind: 'custom', custom: { lines: [logo.name.toUpperCase()], iconFile: `brand:${logo.id}`, color: '#FFFFFF' } }
      const canvas = await renderUpright(spec, 1, false, null)
      expect(countNonInk(canvas), `brand:${logo.id} drew pixels`).toBeGreaterThan(80)
      const jpeg = await encodeWire(canvas)
      expect(jpeg.length).toBeLessThan(10000)
    }

    for (const preset of PRESET_ICONS) {
      const spec: TileSpec = { kind: 'custom', custom: { lines: [preset.name.toUpperCase()], iconFile: `preset:${preset.id}`, color: '#92E759' } }
      const canvas = await renderUpright(spec, 1, false, null)
      expect(countNonInk(canvas), `preset:${preset.id} drew pixels`).toBeGreaterThan(40)
    }
  })

  it('infers relevant logos for URLs, keyboard shortcuts, and shell commands', () => {
    expect(inferLogoForUrl('https://github.com/oliamir/Claude_usage_status')).toBe('brand:github')
    expect(inferLogoForUrl('https://mail.google.com/mail/u/0')).toBe('brand:gmail')
    expect(inferLogoForUrl('claude.ai')).toBe('brand:claude')
    expect(inferLogoForUrl('https://www.vercel.com/dashboard')).toBe('favicon:vercel.com')
    expect(inferIconForShortcut('cmd+c')?.icon).toBe('preset:copy')
    expect(inferIconForShortcut('cmd+shift+4')?.icon).toBe('preset:camera')
    expect(inferIconForShortcut('cmd+s')?.icon).toBe('preset:save')
    expect(inferLogoForShell('claude --continue')).toBe('brand:claude')
    expect(inferLogoForShell('git pull')).toBe('brand:github')
    expect(inferLogoForShell('npm run dev')).toBe('preset:rocket')
  })
})
