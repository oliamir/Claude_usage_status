import fs from 'fs'
import os from 'os'
import path from 'path'
import chokidar from 'chokidar'
import { ensureAppIconPng, ensureSiteFaviconPng, launchInTerminal, listInstalledApps, openApp, openUrl, runShell, runSystemAction, sendKeys } from '../system/focus'
import { writeFileAtomic } from '../system/files'
import type { SystemActionId } from '../../shared/presets'

export type Action =
  | { type: 'shell'; command: string; cwd?: string; terminal?: boolean }
  | { type: 'url'; url: string }
  | { type: 'open'; app: string }
  | { type: 'keys'; keys: string }
  | { type: 'mode'; mode: string }
  | { type: 'system'; action: SystemActionId }

export type CustomTile = { label?: string; icon?: string; color?: string; action?: Action } | null

export type KnobActions = { cw?: Action | null; ccw?: Action | null; click?: Action | null }

export type CustomMode = {
  id: string
  file: string
  name: string
  tiles: CustomTile[]
  knobs: { main?: KnobActions | null; left?: KnobActions | null; right?: KnobActions | null }
  errors: string[]
  /** The file couldn't be read as a mode at all, so it has no keys. */
  invalid?: boolean
}

export function modesDir(): string {
  return path.join(os.homedir(), '.tokendeck', 'modes')
}

export function slugifyModeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page'
}

export function loadModes(): CustomMode[] {
  const dir = modesDir()
  fs.mkdirSync(dir, { recursive: true })
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => loadMode(path.join(dir, name)))
}

export function loadMode(file: string): CustomMode {
  const id = path.basename(file, '.json')
  const errors: string[] = []
  let json: Record<string, unknown>
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('a mode file holds one JSON object')
    json = parsed as Record<string, unknown>
  } catch (err) {
    // Six empty keys rather than none, so the deck still draws and says what's wrong.
    return { id, file, name: id, tiles: [null, null, null, null, null, null], knobs: {}, errors: [String(err)], invalid: true }
  }
  const tiles = (Array.isArray(json.tiles) ? json.tiles.slice(0, 6) : []).map((tile): CustomTile =>
    tile && typeof tile === 'object' && !Array.isArray(tile) ? { ...(tile as Record<string, unknown>) } as CustomTile : null
  )
  while (tiles.length < 6) tiles.push(null)
  tiles.forEach((tile, index) => {
    if (!tile || tile.label == null) return
    if (typeof tile.label !== 'string') {
      errors.push(`Tile ${index + 1} label isn't text.`)
      tile.label = String(tile.label)
    }
    const lines = tile.label.split('\n').slice(0, 2)
    if (tile.label.length > 24) errors.push(`Tile ${index + 1} label was cut to 50px.`)
    tile.label = lines.join('\n')
  })
  const knobs = (json.knobs && typeof json.knobs === 'object' && !Array.isArray(json.knobs) ? json.knobs : {}) as CustomMode['knobs']
  return { id, file, name: String(json.name || id), tiles, knobs, errors }
}

export async function hydrateModeIcons(mode: CustomMode): Promise<void> {
  await Promise.all(
    mode.tiles.map(async (tile) => {
      if (!tile?.icon) return
      if (tile.icon.startsWith('app:')) {
        await ensureAppIconPng(tile.icon.slice(4))
      } else if (tile.icon.startsWith('favicon:')) {
        await ensureSiteFaviconPng(tile.icon.slice(8))
      }
    })
  )
}

export async function saveMode(
  id: string,
  data: { name: string; tiles: CustomTile[]; knobs?: CustomMode['knobs'] }
): Promise<CustomMode> {
  const safeId = slugifyModeName(id)
  const dir = modesDir()
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${safeId}.json`)
  const tiles = data.tiles.slice(0, 6)
  while (tiles.length < 6) tiles.push(null)
  const payload = {
    name: data.name.trim() || safeId,
    tiles,
    knobs: data.knobs ?? {}
  }
  writeFileAtomic(file, JSON.stringify(payload, null, 2) + '\n')
  const loaded = loadMode(file)
  await hydrateModeIcons(loaded)
  return loaded
}

export async function createMode(name: string): Promise<CustomMode> {
  const base = slugifyModeName(name)
  const dir = modesDir()
  fs.mkdirSync(dir, { recursive: true })
  let id = base
  let n = 2
  while (fs.existsSync(path.join(dir, `${id}.json`))) {
    id = `${base}-${n++}`
  }
  return saveMode(id, { name: name.trim() || 'New Page', tiles: [null, null, null, null, null, null], knobs: {} })
}

export function deleteMode(id: string): void {
  const safeId = slugifyModeName(id)
  const file = path.join(modesDir(), `${safeId}.json`)
  if (fs.existsSync(file)) fs.rmSync(file, { force: true })
}

export async function ensureDefaultCustomMode(): Promise<CustomMode | null> {
  const existing = loadModes()
  if (existing.length > 0) {
    for (const mode of existing) await hydrateModeIcons(mode)
    return existing[0]!
  }
  const apps = new Set(listInstalledApps().map((a) => a.name))
  const pickApp = (name: string, label: string, fallbackIcon: string, color = '#FFFFFF'): CustomTile =>
    apps.has(name)
      ? { label, icon: `app:${name}`, color, action: { type: 'open', app: name } }
      : { label, icon: fallbackIcon, color, action: { type: 'open', app: name } }

  const tiles: CustomTile[] = [
    apps.has('Claude')
      ? { label: 'CLAUDE', icon: 'app:Claude', color: '#FFFFFF', action: { type: 'open', app: 'Claude' } }
      : { label: 'CLAUDE', icon: 'glyph:claude-code', color: '#92E759', action: { type: 'open', app: 'Claude' } },
    apps.has('Antigravity')
      ? pickApp('Antigravity', 'ANTIGRAV', 'preset:sparkles', '#92E759')
      : { label: 'TERMINAL', icon: 'preset:terminal', color: '#92E759', action: { type: 'open', app: 'Terminal' } },
    apps.has('ChatGPT')
      ? pickApp('ChatGPT', 'CHATGPT', 'brand:chatgpt', '#FFFFFF')
      : { label: 'CLAUDE.AI', icon: 'brand:claude', color: '#FFFFFF', action: { type: 'url', url: 'https://claude.ai' } },
    { label: 'TERMINAL', icon: 'app:Terminal', color: '#92E759', action: { type: 'open', app: 'Terminal' } },
    apps.has('Google Chrome')
      ? pickApp('Google Chrome', 'CHROME', 'preset:globe', '#60A5FA')
      : pickApp('Safari', 'SAFARI', 'preset:globe', '#60A5FA'),
    { label: 'MUTE', icon: 'preset:mute', color: '#EF6461', action: { type: 'system', action: 'vol-mute' } }
  ]

  return saveMode('my-deck', {
    name: 'My Deck',
    tiles,
    knobs: {
      main: {
        cw: { type: 'system', action: 'vol-up' },
        ccw: { type: 'system', action: 'vol-down' },
        click: { type: 'system', action: 'vol-mute' }
      },
      left: null,
      right: null
    }
  })
}

export function watchModes(onChange: () => void): chokidar.FSWatcher {
  fs.mkdirSync(modesDir(), { recursive: true })
  return chokidar.watch(modesDir(), { ignoreInitial: true }).on('all', () => onChange())
}

export type ActionResult = {
  status: 'ok' | 'failed' | 'mode'
  overlay?: string[]
  ms?: number
  reason?: string
}

export async function runAction(
  action: Action | null | undefined,
  opts?: { onBrightnessDelta?: (delta: number) => Promise<void>; log?: (line: string) => void }
): Promise<ActionResult> {
  if (!action) return { status: 'failed', reason: 'No action assigned' }
  try {
    if (action.type === 'shell') {
      const cwd = action.cwd?.replace(/^~/, os.homedir())
      if (action.terminal) {
        const cmd = cwd ? `cd "${cwd}" && ${action.command}` : action.command
        await launchInTerminal(cmd)
      } else {
        await runShell(action.command, cwd)
      }
      return { status: 'ok' }
    }
    if (action.type === 'url') {
      await openUrl(action.url)
      return { status: 'ok' }
    }
    if (action.type === 'open') {
      await openApp(action.app)
      return { status: 'ok' }
    }
    if (action.type === 'keys') {
      await sendKeys(action.keys)
      return { status: 'ok' }
    }
    if (action.type === 'system') {
      const res = await runSystemAction(action.action, opts?.onBrightnessDelta)
      return { status: 'ok', overlay: res.overlay, ms: res.ms }
    }
    return { status: 'mode' }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    opts?.log?.(`action failed (${action.type}): ${raw}`)
    if (raw === 'ACCESSIBILITY_REQUIRED') {
      return {
        status: 'failed',
        reason: 'Accessibility permission required — grant ClaudeUsageBar in System Settings',
        overlay: ['GRANT', 'ACCESS'],
        ms: 2000
      }
    }
    return { status: 'failed', reason: raw }
  }
}

export const MODE_EXAMPLE = {
  name: 'Deploy',
  tiles: [
    { label: 'BUILD', icon: '~/icons/hammer.svg', action: { type: 'shell', command: 'npm run build', cwd: '~/dev/app' } },
    { label: 'LOGS', action: { type: 'url', url: 'https://grafana.example.com/d/abc' } },
    { label: 'EDITOR', action: { type: 'open', app: 'Cursor' } },
    { label: 'PALETTE', action: { type: 'keys', keys: 'cmd+shift+p' } },
    { label: 'AGENTS', action: { type: 'mode', mode: 'agents' } },
    null
  ],
  knobs: {
    main: { cw: { type: 'keys', keys: 'cmd+=' }, ccw: { type: 'keys', keys: 'cmd+-' }, click: { type: 'shell', command: 'say done' } },
    left: null,
    right: null
  }
}
