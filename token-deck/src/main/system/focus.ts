import { execFile, spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { which } from './which'
import type { SystemActionId } from '../../shared/presets'

export type FocusTarget = {
  termProgram?: string
  tty?: string
  cwd?: string
  sessionId?: string
  bundleId?: string
  app?: string
}

const BUNDLES: Record<string, string> = {
  Apple_Terminal: 'com.apple.Terminal',
  'iTerm.app': 'com.googlecode.iterm2',
  ghostty: 'com.mitchellh.ghostty',
  WarpTerminal: 'dev.warp.Warp-Stable',
  kitty: 'net.kovidgoyal.kitty',
  WezTerm: 'com.github.wez.wezterm',
  zed: 'dev.zed.Zed',
  vscode: 'com.microsoft.VSCode',
  Cursor: 'com.todesktop.230313mzl4w4u92',
  claude: 'com.anthropic.claudefordesktop',
  codex: 'com.openai.codex'
}

function osa(script: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-e', script, ...args], { timeout: 8000 }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function openBundle(bundleId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/open', ['-b', bundleId], (err) => (err ? reject(err) : resolve()))
  })
}

export async function focusSession(target: FocusTarget): Promise<void> {
  if (process.platform !== 'darwin') {
    await focusWindows(target)
    return
  }
  const term = target.termProgram || ''
  const tty = target.tty || ''
  if (term === 'Apple_Terminal' && tty) {
    try {
      await osa(
        `on run argv
          set theTTY to item 1 of argv
          tell application "Terminal"
            repeat with w in windows
              repeat with t in tabs of w
                if tty of t is theTTY then
                  set selected of t to true
                  set frontmost of w to true
                  activate
                  return
                end if
              end repeat
            end repeat
            activate
          end tell
        end run`,
        [tty]
      )
      return
    } catch {
      /* fall through to open -b */
    }
  }
  if (term === 'iTerm.app' && (tty || target.sessionId)) {
    try {
      await osa(
        `on run argv
          set theTTY to item 1 of argv
          set theID to item 2 of argv
          tell application "iTerm"
            repeat with w in windows
              repeat with t in tabs of w
                repeat with s in sessions of t
                  if tty of s is theTTY or id of s is theID then
                    select s
                    select t
                    select w
                    activate
                    return
                  end if
                end repeat
              end repeat
            end repeat
            activate
          end tell
        end run`,
        [tty, target.sessionId || '']
      )
      return
    } catch {
      /* fall through to open -b */
    }
  }
  if (term === 'ghostty' && tty) {
    try {
      await osa(`tell application "Ghostty" to focus (first terminal whose tty is "${tty.replace(/"/g, '')}")`)
      return
    } catch {
      /* 1.3 falls through */
    }
  }
  if ((term === 'vscode' || term === 'Cursor') && target.cwd) {
    const bin = await which(term === 'Cursor' ? 'cursor' : 'code')
    if (bin) {
      await new Promise<void>((resolve) => {
        execFile(bin, ['-r', target.cwd!], () => resolve())
      })
      return
    }
  }
  if (target.termProgram === 'claude-desktop') {
    await openApp('Claude')
    return
  }
  const bundle = target.bundleId || BUNDLES[term] || target.app
  // Say so when nothing applies (a terminal Token Deck doesn't know, a session without one), so the deck shows FAILED.
  if (!bundle) throw new Error(`no way to bring ${term || 'this session'} to the front`)
  await openBundle(bundle)
}

/** Bundle ids that are actually running. Does not launch anything. */
export function runningBundles(ids: string[]): Promise<string[]> {
  if (process.platform !== 'darwin' || ids.length === 0) return Promise.resolve([])
  return new Promise((resolve) => {
    execFile('/usr/bin/lsappinfo', ['list'], { timeout: 4000, maxBuffer: 4_000_000 }, (err, stdout) => {
      if (!err && stdout) {
        const text = String(stdout)
        return resolve(ids.filter((id) => text.includes(`"${id}"`)))
      }
      const list = ids.map((id) => `"${id}"`).join(', ')
      const script = `tell application "System Events"
        set hits to {}
        repeat with p in processes
          try
            set bid to bundle identifier of p
            if bid is in {${list}} then set end of hits to bid
          end try
        end repeat
        return hits as text
      end tell`
      execFile('/usr/bin/osascript', ['-e', script], { timeout: 8000 }, (osaErr, osaOut) => {
        if (osaErr) return resolve([])
        const text = String(osaOut || '')
        resolve(ids.filter((id) => text.includes(id)))
      })
    })
  })
}

export async function raiseBundle(bundleId: string): Promise<void> {
  if (process.platform !== 'darwin') return
  try {
    await openBundle(bundleId)
  } catch {
    await osa(
      `tell application "System Events"
        set frontmost of (first process whose bundle identifier is "${bundleId}") to true
        try
          perform action "AXRaise" of window 1 of (first process whose bundle identifier is "${bundleId}")
        end try
      end tell`
    )
  }
}

export async function cycleBundles(bundleIds: string[], index: number): Promise<number> {
  if (bundleIds.length === 0) return 0
  const next = ((index % bundleIds.length) + bundleIds.length) % bundleIds.length
  await raiseBundle(bundleIds[next]!)
  return next
}

async function focusWindows(target: FocusTarget): Promise<void> {
  const name = target.app || 'WindowsTerminal'
  await new Promise<void>((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', `$p = Get-Process ${name} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { (New-Object -ComObject WScript.Shell).AppActivate($p.Id) | Out-Null }`],
      () => resolve()
    )
  })
}

export async function askAutomation(): Promise<void> {
  if (process.platform !== 'darwin') return
  const scripts = [
    'tell application "System Events" to get name of first process',
    'tell application "Terminal" to get name',
    'tell application "System Events" to get name of processes'
  ]
  for (const script of scripts) {
    await osa(script).catch(() => undefined)
  }
}

type BridgeResponse = {
  ok?: boolean
  status: number
  code?: string
  error?: string
  accessibility?: boolean
  volume?: number
  muted?: boolean
}

let cachedBridgeAccessibility: boolean | null = null

async function nativeBridgeCall(
  method: 'GET' | 'POST',
  endpoint: string,
  body?: Record<string, unknown>
): Promise<BridgeResponse | null> {
  const base = process.env.CLAUDE_USAGE_ACTION_URL
  const token = process.env.CLAUDE_USAGE_ACTION_TOKEN
  if (!base || !token) return null
  try {
    const res = await fetch(`${base}${endpoint}`, {
      method,
      headers: {
        'X-Action-Token': token,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(3000)
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (typeof json.accessibility === 'boolean') {
      cachedBridgeAccessibility = json.accessibility
    }
    return {
      ok: Boolean(json.ok) && res.ok,
      status: res.status,
      code: typeof json.code === 'string' ? json.code : undefined,
      error: typeof json.error === 'string' ? json.error : undefined,
      accessibility: typeof json.accessibility === 'boolean' ? json.accessibility : undefined,
      volume: typeof json.volume === 'number' ? json.volume : undefined,
      muted: typeof json.muted === 'boolean' ? json.muted : undefined
    }
  } catch {
    return null
  }
}

export async function refreshAccessibilityStatus(): Promise<boolean> {
  if (process.platform !== 'darwin') return true
  const bridge = await nativeBridgeCall('GET', '/status')
  if (bridge && typeof bridge.accessibility === 'boolean') {
    cachedBridgeAccessibility = bridge.accessibility
    return bridge.accessibility
  }
  return accessibilityTrusted(false)
}

export async function requestAccessibilityPermission(): Promise<boolean> {
  if (process.platform !== 'darwin') return true
  const bridge = await nativeBridgeCall('POST', '/request-accessibility')
  if (bridge) {
    return bridge.accessibility ?? false
  }
  const trusted = accessibilityTrusted(true)
  execFile('/usr/bin/open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'], () => undefined)
  return trusted
}

export function accessibilityTrusted(prompt: boolean): boolean {
  if (process.platform !== 'darwin') return true
  if (!prompt && cachedBridgeAccessibility !== null) return cachedBridgeAccessibility
  try {
    const { systemPreferences } = require('electron') as typeof import('electron')
    return systemPreferences.isTrustedAccessibilityClient(prompt)
  } catch {
    return false
  }
}

const MAC_KEY_CODES: Record<string, number> = {
  // Letters (ANSI layout-independent virtual key codes)
  a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7, c: 8, v: 9,
  b: 11, q: 12, w: 13, e: 14, r: 15, y: 16, t: 17,
  o: 31, u: 32, i: 34, p: 35, l: 37, j: 38, k: 40, n: 45, m: 46,
  // Digits
  '1': 18, '2': 19, '3': 20, '4': 21, '6': 22, '5': 23, '9': 25, '7': 26, '8': 28, '0': 29,
  // Punctuation
  '=': 24, equal: 24, '+': 24, plus: 24,
  '-': 27, minus: 27,
  ']': 30, bracketright: 30,
  '[': 33, bracketleft: 33,
  "'": 39, quote: 39,
  ';': 41, semicolon: 41,
  '\\': 42, backslash: 42,
  ',': 43, comma: 43,
  '/': 44, slash: 44,
  '.': 47, period: 47,
  '`': 50, backquote: 50, grave: 50,
  // Control & navigation
  return: 36,
  enter: 36,
  tab: 48,
  space: 49,
  delete: 51,
  backspace: 51,
  escape: 53,
  esc: 53,
  forwarddelete: 117,
  del: 117,
  home: 115,
  pageup: 116,
  end: 119,
  pagedown: 121,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
  // Function keys
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111
}

export async function sendKeys(keys: string): Promise<void> {
  const cleaned = keys.trim()
  if (!cleaned) throw new Error('empty shortcut')
  if (process.platform === 'darwin') {
    const bridge = await nativeBridgeCall('POST', '/keys', { keys: cleaned })
    if (bridge) {
      if (bridge.ok) return
      if (bridge.code === 'NO_ACCESSIBILITY') {
        cachedBridgeAccessibility = false
        throw new Error('ACCESSIBILITY_REQUIRED')
      }
      throw new Error(bridge.error || `native shortcut error (${bridge.status})`)
    }
    const lower = cleaned.toLowerCase()
    const parts = lower.endsWith('++')
      ? [...lower.slice(0, -2).split('+').map((p) => p.trim()).filter(Boolean), '=']
      : lower.split('+').map((p) => p.trim()).filter(Boolean)
    const key = parts.pop() || ''
    const mods = parts.map((part) => (part === 'cmd' || part === 'meta' ? 'command' : part === 'ctrl' ? 'control' : part === 'opt' || part === 'alt' ? 'option' : part))
    const using = mods.length ? ` using {${mods.map((m) => `${m} down`).join(', ')}}` : ''
    const code = MAC_KEY_CODES[key]
    try {
      if (code !== undefined) {
        await osa(`tell application "System Events" to key code ${code}${using}`)
      } else {
        await osa(`tell application "System Events" to keystroke "${key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"${using}`)
      }
    } catch (err) {
      const msg = String(err)
      if (msg.includes('1002') || msg.includes('-1743') || msg.includes('not allowed to send keystrokes')) {
        throw new Error('ACCESSIBILITY_REQUIRED')
      }
      throw err
    }
    return
  }
  await new Promise<void>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', `(New-Object -ComObject WScript.Shell).SendKeys('${cleaned.replace(/'/g, "''")}')`],
      (err) => (err ? reject(err) : resolve())
    )
  })
}

export async function openApp(app: string): Promise<void> {
  const name = app.trim()
  if (!name) throw new Error('empty app name')
  if (process.platform === 'darwin') {
    const match = listInstalledApps().find((a) => a.name.toLowerCase() === name.toLowerCase())
    const args = match && fs.existsSync(match.path) ? [match.path] : ['-a', name]
    await new Promise<void>((resolve, reject) => {
      execFile('/usr/bin/open', args, (err) => (err ? reject(err) : resolve()))
    })
    return
  }
  await new Promise<void>((resolve, reject) => {
    execFile('cmd', ['/c', 'start', '', name], (err) => (err ? reject(err) : resolve()))
  })
}

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('empty url')
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export async function openUrl(url: string): Promise<void> {
  const normalized = normalizeUrl(url)
  const cmd = process.platform === 'darwin' ? '/usr/bin/open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', normalized] : [normalized]
  await new Promise<void>((resolve, reject) => {
    execFile(cmd, args, (err) => (err ? reject(err) : resolve()))
  })
}

function augmentedPathEnv(): NodeJS.ProcessEnv {
  const extra = [path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin']
  const existing = process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'
  return {
    ...process.env,
    PATH: [...extra, existing].join(':')
  }
}

export function runShell(command: string, cwd?: string): Promise<void> {
  const cmd = command.trim()
  if (!cmd) return Promise.reject(new Error('empty command'))
  const resolvedCwd = cwd ? cwd.replace(/^~/, os.homedir()) : undefined
  if (resolvedCwd && !fs.existsSync(resolvedCwd)) {
    return Promise.reject(new Error(`folder not found: ${resolvedCwd}`))
  }
  return new Promise((resolve, reject) => {
    const shell = process.platform === 'win32' ? 'cmd' : '/bin/zsh'
    const args = process.platform === 'win32' ? ['/c', cmd] : ['-lc', cmd]
    execFile(shell, args, { timeout: 15000, cwd: resolvedCwd, env: augmentedPathEnv() }, (err) => (err ? reject(err) : resolve()))
  })
}

export async function launchInTerminal(command: string): Promise<void> {
  const cmd = command.trim()
  if (!cmd) throw new Error('empty command')
  if (process.platform === 'darwin') {
    const scriptPath = path.join(os.tmpdir(), `tokendeck-run-${crypto.randomBytes(6).toString('hex')}.command`)
    const isInteractiveShell = /^(zsh|bash|fish)(\s|$)/.test(cmd)
    const body = [
      '#!/bin/zsh -l',
      'rm -f "$0"',
      'export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"',
      isInteractiveShell ? `exec ${cmd}` : cmd,
      ...(isInteractiveShell ? [] : ['echo ""', 'exec /bin/zsh -l'])
    ].join('\n') + '\n'
    fs.writeFileSync(scriptPath, body, { mode: 0o755 })
    fs.chmodSync(scriptPath, 0o755)
    await new Promise<void>((resolve, reject) => {
      execFile('/usr/bin/open', ['-a', 'Terminal', scriptPath], (err) => (err ? reject(err) : resolve()))
    })
    return
  }
  await new Promise<void>((resolve, reject) => {
    execFile('cmd', ['/c', 'start', '', 'cmd', '/k', cmd], (err) => (err ? reject(err) : resolve()))
  })
}

let cachedVol: { volume: number; muted: boolean } = { volume: 75, muted: false }
let volSyncedOnce = false
let volWriteInFlight = false
let pendingVolWrite: { volume: number; muted: boolean } | null = null

async function readMacVolume(): Promise<{ volume: number; muted: boolean } | null> {
  if (process.platform !== 'darwin') return { volume: 50, muted: false }
  const bridge = await nativeBridgeCall('GET', '/volume')
  if (bridge?.ok && typeof bridge.volume === 'number') {
    return { volume: Math.max(0, Math.min(100, Math.round(bridge.volume))), muted: Boolean(bridge.muted) }
  }
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-e', 'get volume settings'], { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve(null)
      const text = String(stdout || '')
      const volMatch = text.match(/output volume:(\d+)/)
      const muteMatch = text.match(/output muted:(true|false)/)
      if (!volMatch) return resolve(null)
      const volume = Math.max(0, Math.min(100, Number(volMatch[1])))
      const muted = muteMatch ? muteMatch[1] === 'true' : false
      resolve({ volume, muted })
    })
  })
}

function flushMacVolume(): void {
  if (volWriteInFlight || !pendingVolWrite || process.platform !== 'darwin') return
  const next = pendingVolWrite
  pendingVolWrite = null
  volWriteInFlight = true
  const muteClause = next.muted ? 'with output muted' : 'without output muted'
  execFile(
    '/usr/bin/osascript',
    ['-e', `set volume output volume ${next.volume} ${muteClause}`],
    { timeout: 3000 },
    () => {
      volWriteInFlight = false
      if (pendingVolWrite) flushMacVolume()
    }
  )
}

let hudWindow: import('electron').BrowserWindow | null = null
let hudReady = false
let hudPending: { pct: number; label: string; color: string } | null = null
let hudHideTimer: NodeJS.Timeout | null = null
let hudDestroyTimer: NodeJS.Timeout | null = null

const HUD_HTML = `<!doctype html><html><body style="margin:0;padding:0;background:transparent;font-family:-apple-system,BlinkMacSystemFont,sans-serif;user-select:none;overflow:hidden;">
  <div style="box-sizing:border-box;width:220px;height:64px;border-radius:16px;background:rgba(19,21,18,0.94);border:1px solid rgba(255,255,255,0.16);padding:12px 16px;display:flex;flex-direction:column;justify-content:space-between;color:#fff;">
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600;letter-spacing:0.01em;">
      <span>Volume</span>
      <span id="lbl" style="font-variant-numeric:tabular-nums;color:#92e759;">--</span>
    </div>
    <div style="width:100%;height:7px;border-radius:4px;background:rgba(255,255,255,0.15);overflow:hidden;">
      <div id="bar" style="width:0%;height:100%;background:#92e759;border-radius:4px;transition:width 40ms linear;"></div>
    </div>
  </div>
  <script>
    window.updateVol = function(pct, label, color) {
      var lbl = document.getElementById('lbl');
      var bar = document.getElementById('bar');
      if (lbl) { lbl.textContent = label; lbl.style.color = color; }
      if (bar) { bar.style.width = pct + '%'; bar.style.background = color; }
    };
  </script>
</body></html>`

function showMacVolumeHud(volume: number, muted: boolean): void {
  if (process.platform !== 'darwin') return
  try {
    const { BrowserWindow, screen } = require('electron') as typeof import('electron')
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const width = 220
    const height = 64
    const x = Math.round(display.bounds.x + (display.bounds.width - width) / 2)
    const y = Math.round(display.bounds.y + display.bounds.height - 140)
    const pct = muted ? 0 : volume
    const label = muted ? 'Muted' : `${volume}%`
    const color = muted ? '#ef6461' : '#92e759'
    hudPending = { pct, label, color }

    if (!hudWindow || hudWindow.isDestroyed()) {
      hudReady = false
      hudWindow = new BrowserWindow({
        width,
        height,
        x,
        y,
        frame: false,
        transparent: true,
        focusable: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: true,
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false
        }
      })
      hudWindow.setIgnoreMouseEvents(true)
      hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      hudWindow.webContents.once('did-finish-load', () => {
        hudReady = true
        if (hudPending && hudWindow && !hudWindow.isDestroyed()) {
          const p = hudPending
          void hudWindow.webContents.executeJavaScript(
            `window.updateVol(${p.pct}, ${JSON.stringify(p.label)}, ${JSON.stringify(p.color)})`
          )
          hudWindow.showInactive()
        }
      })
      void hudWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HUD_HTML)}`)
    } else {
      hudWindow.setPosition(x, y, false)
      if (hudReady) {
        void hudWindow.webContents.executeJavaScript(
          `window.updateVol(${pct}, ${JSON.stringify(label)}, ${JSON.stringify(color)})`
        )
        hudWindow.showInactive()
      }
    }

    if (hudHideTimer) clearTimeout(hudHideTimer)
    if (hudDestroyTimer) clearTimeout(hudDestroyTimer)
    hudHideTimer = setTimeout(() => {
      if (hudWindow && !hudWindow.isDestroyed()) hudWindow.hide()
      hudDestroyTimer = setTimeout(() => {
        if (hudWindow && !hudWindow.isDestroyed()) {
          hudWindow.destroy()
        }
        hudWindow = null
        hudReady = false
        hudPending = null
      }, 15_000)
    }, 1200)
  } catch {
    /* non-electron test environment */
  }
}

export async function adjustVolume(action: 'cw' | 'ccw' | 'click'): Promise<{ volume: number; muted: boolean }> {
  // Fast path: native CoreAudio inside ClaudeUsageBar (<1ms, zero subprocess spawns, always live-synced).
  if (process.platform === 'darwin') {
    const bridge = await nativeBridgeCall('POST', '/volume', { action })
    if (bridge?.ok && typeof bridge.volume === 'number') {
      const volume = Math.max(0, Math.min(100, Math.round(bridge.volume)))
      const muted = Boolean(bridge.muted)
      cachedVol = { volume, muted }
      volSyncedOnce = true
      showMacVolumeHud(volume, muted)
      return { volume, muted }
    }
    if (!volSyncedOnce) {
      const current = await readMacVolume()
      if (current) cachedVol = current
      volSyncedOnce = true
    }
  }
  let { volume, muted } = cachedVol
  if (action === 'click') {
    muted = !muted
    if (!muted && volume === 0) volume = 25
  } else if (action === 'cw') {
    volume = Math.min(100, (muted ? 0 : volume) + 5)
    muted = false
  } else {
    volume = Math.max(0, volume - 5)
    if (volume === 0) muted = true
  }
  cachedVol = { volume, muted }
  pendingVolWrite = { volume, muted }
  flushMacVolume()
  showMacVolumeHud(volume, muted)
  return { volume, muted }
}

export type InstalledApp = { name: string; path: string }

const SYSTEM_APPS_WHITELIST = new Set([
  'Terminal',
  'Safari',
  'Mail',
  'Calendar',
  'Notes',
  'Music',
  'Messages',
  'FaceTime',
  'Reminders',
  'System Settings',
  'Calculator',
  'Preview',
  'Activity Monitor'
])

export function listInstalledApps(): InstalledApp[] {
  if (process.platform !== 'darwin') return []
  const seen = new Map<string, string>()
  const scanDir = (dir: string, filter?: Set<string>) => {
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith('.app')) continue
        const name = entry.slice(0, -4)
        if (filter && !filter.has(name)) continue
        if (!seen.has(name)) seen.set(name, path.join(dir, entry))
      }
    } catch {
      /* directory unavailable */
    }
  }
  scanDir('/Applications')
  scanDir(path.join(os.homedir(), 'Applications'))
  scanDir('/System/Applications', SYSTEM_APPS_WHITELIST)
  scanDir('/System/Applications/Utilities', SYSTEM_APPS_WHITELIST)
  return [...seen.entries()]
    .map(([name, appPath]) => ({ name, path: appPath }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function appIconCachePath(appName: string): string {
  const safe = appName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'app'
  return path.join(os.homedir(), '.tokendeck', 'app-icons', `${safe}.png`)
}

function findAppIcns(appPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const plist = path.join(appPath, 'Contents', 'Info.plist')
    const resDir = path.join(appPath, 'Contents', 'Resources')
    execFile('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIconFile', plist], { timeout: 2000 }, (_err, stdout) => {
      const raw = String(stdout || '').trim()
      if (raw) {
        const name = raw.endsWith('.icns') ? raw : `${raw}.icns`
        const candidate = path.join(resDir, name)
        if (fs.existsSync(candidate)) return resolve(candidate)
      }
      try {
        const first = fs.readdirSync(resDir).find((f) => f.endsWith('.icns'))
        if (first) return resolve(path.join(resDir, first))
      } catch {
        /* ignore */
      }
      resolve(null)
    })
  })
}

function extractIconViaNSWorkspace(appPath: string, out: string): Promise<boolean> {
  const swift = `import AppKit
let args = CommandLine.arguments
guard args.count >= 3 else { exit(1) }
let icon = NSWorkspace.shared.icon(forFile: args[1])
let size = NSSize(width: 48, height: 48)
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 48, pixelsHigh: 48, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
icon.draw(in: NSRect(origin: .zero, size: size), from: .zero, operation: .copy, fraction: 1.0)
NSGraphicsContext.restoreGraphicsState()
guard let data = rep.representation(using: .png, properties: [:]) else { exit(1) }
try data.write(to: URL(fileURLWithPath: args[2]))`
  return new Promise((resolve) => {
    execFile('/usr/bin/swift', ['-e', swift, appPath, out], { timeout: 6000 }, (err) => {
      resolve(!err && fs.existsSync(out) && fs.statSync(out).size > 200)
    })
  })
}

export async function ensureAppIconPng(appName: string): Promise<string | null> {
  if (process.platform !== 'darwin' || !appName) return null
  const out = appIconCachePath(appName)
  if (fs.existsSync(out)) return out
  const apps = listInstalledApps()
  const match = apps.find((a) => a.name.toLowerCase() === appName.toLowerCase())
  if (!match) return null
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const icns = await findAppIcns(match.path)
  if (icns) {
    const ok = await new Promise<boolean>((resolve) => {
      execFile('/usr/bin/sips', ['-s', 'format', 'png', icns, '--resampleHeightWidth', '48', '48', '--out', out], { timeout: 4000 }, (err) => {
        resolve(!err && fs.existsSync(out) && fs.statSync(out).size > 200)
      })
    })
    if (ok) return out
  }
  if (await extractIconViaNSWorkspace(match.path, out)) return out
  try {
    const { app } = require('electron') as typeof import('electron')
    const icon = await app.getFileIcon(match.path, { size: 'normal' })
    const png = icon.resize({ width: 48, height: 48 }).toPNG()
    if (!png.length) return null
    fs.writeFileSync(out, png)
    return out
  } catch {
    return null
  }
}

export async function getAllInstalledAppIcons(): Promise<Record<string, string>> {
  const apps = listInstalledApps()
  const result: Record<string, string> = {}
  const batchSize = 8
  for (let i = 0; i < apps.length; i += batchSize) {
    const batch = apps.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (entry) => {
        const pngPath = await ensureAppIconPng(entry.name)
        if (!pngPath) return
        try {
          const buf = fs.readFileSync(pngPath)
          if (buf.length > 0) result[entry.name] = `data:image/png;base64,${buf.toString('base64')}`
        } catch {
          /* ignore unreadable icon */
        }
      })
    )
  }
  return result
}

export function siteFaviconCachePath(host: string): string {
  const safe = host.toLowerCase().replace(/[^a-z0-9.-]+/g, '').replace(/^\.+|\.+$/g, '') || 'site'
  return path.join(os.homedir(), '.tokendeck', 'favicons', `${safe}.png`)
}

export async function ensureSiteFaviconPng(host: string): Promise<string | null> {
  const safe = host.toLowerCase().replace(/[^a-z0-9.-]+/g, '').replace(/^\.+|\.+$/g, '')
  if (!safe || !safe.includes('.')) return null
  const out = siteFaviconCachePath(safe)
  if (fs.existsSync(out) && fs.statSync(out).size > 100) return out
  try {
    const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(safe)}&sz=64`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 100) return null
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8
    const isWebp = buf.subarray(0, 4).toString('ascii') === 'RIFF'
    if (!isPng && !isJpeg && !isWebp) return null
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, buf)
    return out
  } catch {
    return null
  }
}

async function sendMediaKeyMac(keyType: 'play' | 'next' | 'prev'): Promise<void> {
  const bridge = await nativeBridgeCall('POST', '/media', { key: keyType })
  if (bridge) {
    if (bridge.ok) return
    if (bridge.code === 'NO_ACCESSIBILITY') {
      cachedBridgeAccessibility = false
      throw new Error('ACCESSIBILITY_REQUIRED')
    }
    throw new Error(bridge.error || `media key error (${bridge.status})`)
  }
  const code = keyType === 'play' ? 16 : keyType === 'next' ? 17 : 18
  const swift = `import AppKit
let key: Int32 = ${code}
for down in [true, false] {
  let flags: UInt = down ? 0xa00 : 0xb00
  let data1 = Int((key << 16) | ((down ? 0xa : 0xb) << 8))
  NSEvent.otherEvent(with: .systemDefined, location: .zero, modifierFlags: NSEvent.ModifierFlags(rawValue: flags), timestamp: 0, windowNumber: 0, context: nil, subtype: 8, data1: data1, data2: -1)?.cgEvent?.post(tap: .cghidEventTap)
}`
  await new Promise<void>((resolve, reject) => {
    execFile('/usr/bin/swift', ['-e', swift], { timeout: 6000 }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export async function runSystemAction(
  action: SystemActionId,
  onBrightnessDelta?: (delta: number) => Promise<void>
): Promise<{ overlay?: string[]; ms?: number }> {
  if (action === 'vol-up' || action === 'vol-down' || action === 'vol-mute') {
    const dir = action === 'vol-up' ? 'cw' : action === 'vol-down' ? 'ccw' : 'click'
    const { volume, muted } = await adjustVolume(dir)
    return {
      overlay: muted ? ['VOL=ICON', 'VOL=MUTE', 'VOL=0'] : ['VOL=ICON', `VOL=${volume}%`, `VOL=${volume}`],
      ms: 1500
    }
  }
  if (action === 'brightness-up' || action === 'brightness-down') {
    const delta = action === 'brightness-up' ? 15 : -15
    await onBrightnessDelta?.(delta)
    return { overlay: [delta > 0 ? 'BRIGHT +' : 'BRIGHT -'], ms: 1200 }
  }
  if (process.platform === 'darwin') {
    if (action === 'media-play') {
      await sendMediaKeyMac('play')
      return { overlay: ['PLAY', 'PAUSE'], ms: 1000 }
    }
    if (action === 'media-next') {
      await sendMediaKeyMac('next')
      return { overlay: ['NEXT', 'TRACK'], ms: 1000 }
    }
    if (action === 'media-prev') {
      await sendMediaKeyMac('prev')
      return { overlay: ['PREV', 'TRACK'], ms: 1000 }
    }
    if (action === 'lock-screen') {
      const bridge = await nativeBridgeCall('POST', '/lock')
      if (bridge?.ok) {
        return { overlay: ['LOCKED'], ms: 1000 }
      }
      await new Promise<void>((resolve, reject) => {
        execFile('/usr/bin/pmset', ['displaysleepnow'], (err) => (err ? reject(err) : resolve()))
      })
      return { overlay: ['LOCKED'], ms: 1000 }
    }
    if (action === 'screenshot-area') {
      const child = spawn('/usr/sbin/screencapture', ['-i', '-c'], { detached: true, stdio: 'ignore' })
      child.unref()
      return { overlay: ['CAPTURE'], ms: 1000 }
    }
    if (action === 'screenshot-full') {
      await new Promise<void>((resolve, reject) => {
        execFile('/usr/sbin/screencapture', ['-x', '-c'], { timeout: 5000 }, (err) => (err ? reject(err) : resolve()))
      })
      return { overlay: ['COPIED'], ms: 1200 }
    }
    if (action === 'mission-control') {
      await openApp('Mission Control')
      return { overlay: ['SPACES'], ms: 1000 }
    }
  }
  return {}
}
