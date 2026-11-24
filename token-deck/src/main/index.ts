import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, powerMonitor, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import crypto from 'crypto'
import { createCanvas } from '@napi-rs/canvas'
import { getHidapiVersion } from 'node-hid'
import { WELCOME_HASH } from './deck/geometry'
import { resource } from './paths'
import { burnWatch, calibrate, probe } from './cli'
import { Log } from './log'
import { openStore } from './settings/store'
import { DeckTransport } from './deck/transport'
import { HookServer } from './hooks/server'
import { ClaudeCode } from './integrations/claude-code'
import { CodexIntegration, restoreCodex } from './integrations/codex'
import { OpenCodeIntegration } from './integrations/opencode'
import { LaunchOnly } from './integrations/launch'
import { Controller } from './modes/controller'
import { createMode, deleteMode, ensureDefaultCustomMode, MODE_EXAMPLE, saveMode, watchModes } from './modes/custom'
import { shouldAutoBurn, shippedRecords } from './burn/records'
import { accessibilityTrusted, askAutomation, getAllInstalledAppIcons, listInstalledApps, refreshAccessibilityStatus, requestAccessibilityPermission } from './system/focus'
import { isAppUrl, isExternalLink } from './system/navigation'
import type { AgentId } from '../shared/model'
import type { IpcCall, Snapshot } from '../shared/ipc'

const smoke = process.argv.includes('--smoke')
const embedded = process.argv.includes('--embedded')
const parentPidArg = process.argv.find((arg) => arg.startsWith('--parent-pid='))
const parentPid = parentPidArg ? Number(parentPidArg.split('=')[1]) : 0
const cli = ['burn', 'probe', 'calibrate'].find((arg) => process.argv.includes(arg))

if (smoke) {
  void app.whenReady().then(async () => {
    try {
      console.log(getHidapiVersion())
      const canvas = createCanvas(64, 64)
      await canvas.encode('jpeg', { quality: 100 })
      for (const file of [
        'welcome-320x240.png',
        'welcome-sent.jpg',
        'welcome-tiles/key1.jpg',
        'welcome-tiles/key2.jpg',
        'welcome-tiles/key3.jpg',
        'welcome-tiles/key4.jpg',
        'welcome-tiles/key5.jpg',
        'welcome-tiles/key6.jpg',
        'panel-geometry.json',
        'preburned.json'
      ]) {
        if (!fs.existsSync(resource(file))) throw new Error(`missing ${file}`)
      }
      const hash = crypto.createHash('sha256').update(fs.readFileSync(resource('welcome-sent.jpg'))).digest('hex')
      if (hash !== WELCOME_HASH) throw new Error(`welcome hash ${hash}`)
      app.exit(0)
    } catch (err) {
      console.error(err)
      app.exit(2)
    }
  })
} else if (cli) {
  void app.whenReady().then(async () => {
    if (!app.requestSingleInstanceLock()) {
      console.log('Quit Token Deck first: the tray app owns the deck.')
      app.exit(1)
      return
    }
    try {
      if (cli === 'probe') await probe()
      else if (cli === 'calibrate') await calibrate()
      else await burnWatch()
      app.exit(0)
    } catch (err) {
      console.error(err)
      app.exit(1)
    }
  })
} else {
  const locked = app.requestSingleInstanceLock()
  if (!locked) app.quit()
  else void app.whenReady().then(start)
}

async function start(): Promise<void> {
  app.dock?.hide()
  app.setAppUserModelId('com.local.ClaudeUsageBar.tokendeck')
  const log = new Log()
  const store = openStore()
  const claude = new ClaudeCode(store, (line) => log.write(line))
  const codex = new CodexIntegration(store, (line) => log.write(line))
  const opencode = new OpenCodeIntegration(store)
  const launch = {
    cursor: new LaunchOnly('cursor', 'Cursor'),
    amp: new LaunchOnly('amp', 'Visual Studio Code'),
    devin: new LaunchOnly('devin', 'Devin', 'https://app.devin.ai')
  }
  await Promise.all([
    ensureDefaultCustomMode(),
    refreshAccessibilityStatus(),
    claude.detect(),
    codex.detect(),
    opencode.detect(),
    launch.cursor.detect(),
    launch.amp.detect(),
    launch.devin.detect()
  ])
  const installedApps = listInstalledApps().map((a) => a.name)
  let window: BrowserWindow | null = null
  let tray: Tray | null = null
  let lastTiles: Buffer[] = []
  let updateVersion: string | null = null
  let quitting = false
  let shutdownCap = 3000
  let wizardOpen = !store.get('wizardDone')
  let usageOpen = false
  const transport = new DeckTransport()
  transport.brightness = store.get('brightness')
  transport.keepalive = store.get('repaintKeepalive')
  transport.log = (line) => log.write(line)
  transport.setKnobMap(store.get('knobMap'))
  transport.shouldBurn = (serial) => shouldAutoBurn(serial, store.get('burnedSerials'), store.get('burnFailures')[serial] || 0, store.get('autoBurn'))
  transport.onBurned = (serial) => {
    const rows = store.get('burnedSerials').filter((row) => row.serial !== serial)
    rows.push({ serial, imageHash: WELCOME_HASH, at: new Date().toISOString() })
    store.set('burnedSerials', rows)
    const failures = { ...store.get('burnFailures') }
    delete failures[serial]
    store.set('burnFailures', failures)
    if (!embedded) {
      void dialog.showMessageBox({ message: 'Device background cleared to solid dark.', buttons: ['OK'] })
    }
    broadcast()
  }
  transport.onBurnFailed = (serial) => {
    if (!serial) return
    const failures = { ...store.get('burnFailures') }
    failures[serial] = (failures[serial] || 0) + 1
    store.set('burnFailures', failures)
    if (!embedded) {
      void dialog.showMessageBox({ message: 'The device background was not written. Unplug the deck and plug it back in.', buttons: ['OK'] })
    }
    broadcast()
  }
  const controller = new Controller(
    store,
    claude,
    codex,
    opencode,
    launch,
    async (frames, force) => {
      lastTiles = frames.map((frame) => frame || Buffer.alloc(0))
      await transport.paint(frames, force)
      broadcast()
    },
    (line) => log.write(line),
    async () => {
      const result = await dialog.showMessageBox({
        type: 'question',
        message: 'Allow full access on the next session?',
        buttons: ['Cancel', 'Allow full access'],
        defaultId: 0,
        cancelId: 0
      })
      return result.response === 1
    },
    async (delta) => {
      const next = Math.max(0, Math.min(100, store.get('brightness') + delta))
      store.set('brightness', next)
      await transport.setBrightness(next)
      broadcast()
    }
  )
  controller.onConnect = () => {
    if (!store.get('wizardDone')) wizardOpen = true
    openWindow()
    broadcast()
  }
  controller.onUsage = () => {
    usageOpen = true
    openWindow()
    broadcast()
  }
  transport.onInput = (event) => {
    log.write(`input ${JSON.stringify(event)}`)
    void controller.handle(event).catch((err) => log.write(`input error ${err}`))
  }
  transport.onState = () => {
    void controller.render(true)
    broadcast()
  }
  transport.currentTiles = () => lastTiles.filter((buf) => buf.length > 0)
  claude.isActiveView = () => controller.mode === 'agents' || controller.mode === 'sessions' || controller.mode === 'models'
  const onAgentChange = () => {
    if (controller.mode === 'custom' && !controller.overlay) return
    void controller.render(false)
  }
  claude.onChange = onAgentChange
  codex.onChange = onAgentChange
  opencode.onChange = onAgentChange
  const hooks = new HookServer(
    store,
    (event) => {
      if (event.source === 'claude' || event.source === 'statusline') {
        claude.ingest(event)
      } else if (event.source === 'usage-sync') {
        const data = (event.body || {}) as {
          fiveHour?: number | null
          sevenDay?: number | null
          fiveResets?: number | null
          sevenResets?: number | null
          fiveLabel?: string
          sevenLabel?: string
        }
        const prev = store.get('usage')['claude-code']
        const five =
          typeof data.fiveHour === 'number'
            ? { pct: data.fiveHour, resetsAt: typeof data.fiveResets === 'number' ? data.fiveResets : undefined }
            : prev?.five
        const seven =
          typeof data.sevenDay === 'number'
            ? { pct: data.sevenDay, resetsAt: typeof data.sevenResets === 'number' ? data.sevenResets : undefined }
            : prev?.seven
        store.set('usage', {
          ...store.get('usage'),
          'claude-code': {
            five,
            seven,
            at: Date.now(),
            labels: {
              five: data.fiveLabel || prev?.labels?.five || 'FBL',
              seven: data.sevenLabel || prev?.labels?.seven || '7D'
            }
          }
        })
        void controller.render(false)
        broadcast()
      }
    },
    (line) => log.write(line)
  )
  hooks.onStateRequest = ({ lite }) => (lite ? snapshotLite() : snapshot())
  hooks.onCommandRequest = async (body: unknown) => {
    const cmd = (body || {}) as { method?: string; [key: string]: unknown }
    if (cmd.method === 'openWindow') {
      openWindow()
      broadcast()
      return snapshot()
    }
    await dispatch(cmd as IpcCall)
    broadcast()
    return snapshot()
  }
  await hooks.start()
  claude.start()
  if (codex.bin) void codex.start()
  if (opencode.bin) opencode.start()
  watchModes(() => void controller.modesChanged())
  app.setLoginItemSettings({ openAtLogin: store.get('startAtLogin') })

  const welcomePng = `data:image/png;base64,${fs.readFileSync(resource('welcome-320x240.png')).toString('base64')}`
  // The one page the settings window may show and take calls from.
  const rendererFile = path.join(__dirname, '../renderer/index.html')
  const appUrl = process.env.ELECTRON_RENDERER_URL || pathToFileURL(rendererFile).href
  let accessibilityPollTimer: NodeJS.Timeout | null = null

  function stopAccessibilityPoll(): void {
    if (accessibilityPollTimer) {
      clearInterval(accessibilityPollTimer)
      accessibilityPollTimer = null
    }
  }

  function startAccessibilityPollIfNeeded(): void {
    stopAccessibilityPoll()
    if (!window || window.isDestroyed()) return
    void refreshAccessibilityStatus().then((trusted) => {
      broadcast()
      if (trusted || !window || window.isDestroyed()) return
      accessibilityPollTimer = setInterval(() => {
        if (!window || window.isDestroyed()) {
          stopAccessibilityPoll()
          return
        }
        void refreshAccessibilityStatus().then((ok) => {
          if (ok) {
            stopAccessibilityPoll()
            broadcast()
          }
        })
      }, 3000)
    })
  }

  function openWindow(): void {
    if (window && !window.isDestroyed()) {
      window.show()
      window.moveTop()
      window.focus()
      app.focus({ steal: true })
      startAccessibilityPollIfNeeded()
      return
    }
    window = new BrowserWindow({
      width: 1080,
      height: 700,
      minWidth: 920,
      minHeight: 600,
      show: false,
      backgroundColor: '#111310',
      title: 'Token Deck',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    window.on('closed', () => {
      stopAccessibilityPoll()
      window = null
    })
    // The window holds the app's bridge, so nothing but the app's own page may load in it.
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (isExternalLink(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    window.webContents.on('will-navigate', (event, url) => {
      if (isAppUrl(url, appUrl)) return
      event.preventDefault()
      if (isExternalLink(url)) void shell.openExternal(url)
    })
    if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    else void window.loadFile(rendererFile)
    window.once('ready-to-show', () => {
      window?.show()
      window?.moveTop()
      window?.focus()
      app.focus({ steal: true })
      startAccessibilityPollIfNeeded()
    })
  }

  function snapshotLite(): Record<string, unknown> {
    const device = transport.snapshot()
    const customModes = controller.modes()
    return {
      version: app.getVersion(),
      device: {
        phase: device.phase,
        message: device.message,
        product: device.info?.product || '',
        firmware: device.info?.firmware || transport.firmware,
        burnFailed: device.burnFailed
      },
      mode: controller.mode,
      activePage: controller.activePage(),
      metalBindings: store.get('metalBindings') || { left: 'custom:my-deck', middle: 'sessions', right: 'models' },
      customModes: customModes.map((m) => ({ id: m.id, name: m.name })),
      brightness: store.get('brightness'),
      agents: [
        { id: 'claude-code', hooks: claude.hooksInstalled }
      ],
      accessibility: accessibilityTrusted(false)
    }
  }

  function snapshot(): Snapshot {
    const device = transport.snapshot()
    const serial = device.info?.serial || ''
    const failures = serial ? store.get('burnFailures')[serial] || 0 : 0
    const customModes = controller.modes()
    return {
      version: app.getVersion(),
      device: {
        phase: device.phase,
        message: device.message,
        manufacturer: device.info?.manufacturer || '',
        product: device.info?.product || '',
        serial,
        release: device.info ? String(device.info.release) : '',
        firmware: device.info?.firmware || transport.firmware,
        burnFailed: device.burnFailed
      },
      mode: controller.mode,
      activePage: controller.activePage(),
      metalBindings: store.get('metalBindings') || { left: 'custom:my-deck', middle: 'sessions', right: 'models' },
      customModes,
      installedApps,
      brightness: store.get('brightness'),
      keepalive: store.get('repaintKeepalive'),
      autoBurn: store.get('autoBurn'),
      startAtLogin: store.get('startAtLogin'),
      agents: [
        row('claude-code', !!claude.bin || claude.desktop, claude.signedIn, claude.hooksInstalled, claude.statusChained, true, claude.bin ? 'Claude Code' : claude.desktop ? 'Desktop app' : ''),
        row('codex', !!codex.bin, codex.signedIn, false, false, !!codex.bin, ''),
        row('opencode', !!opencode.bin, false, false, false, opencode.reachable, opencode.version),
        row('cursor', launch.cursor.installed, false, false, false, false, ''),
        row('amp', launch.amp.installed, false, false, false, false, ''),
        row('devin', true, false, false, false, false, 'app.devin.ai')
      ],
      favorites: store.get('favorites'),
      efforts: { 'claude-code': ['low', 'medium', 'high', 'xhigh'], codex: codex.models[0]?.efforts || [], opencode: [] },
      modes: customModes.map((mode) => ({ name: mode.name, file: mode.file, errors: mode.errors })),
      example: JSON.stringify(MODE_EXAMPLE, null, 2),
      burned: store.get('burnedSerials'),
      preburned: shippedRecords().some((record) => record.serial === serial),
      burnMessage: failures >= 2 ? 'Token Deck could not write the welcome screen to this deck.' : '',
      welcomePng,
      tiles: lastTiles.map((buf) => (buf.length ? `data:image/jpeg;base64,${buf.toString('base64')}` : '')),
      wizard: wizardOpen ? { step: store.get('wizardStep'), open: true, notes: [] } : null,
      knobsCalibrated: store.get('knobsCalibrated'),
      accessibility: accessibilityTrusted(false),
      lastAction: controller.lastAction,
      updateVersion,
      log: log.tail(),
      modelNamesUpper: store.get('modelNamesUpper'),
      allowance: controller.allowance(),
      usageOpen
    }
  }

  function broadcast(): void {
    if (window && !window.isDestroyed() && window.isVisible()) {
      window.webContents.send('td-state', snapshot())
    }
    rebuildTray()
  }

  function rebuildTray(): void {
    if (!tray) return
    const mode = controller.mode === 'models' ? 'Models & Usage' : controller.mode === 'sessions' ? 'Sessions' : controller.mode === 'agents' ? 'Agents' : 'Agents'
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Token Deck', click: openWindow },
      { label: `Mode: ${mode}`, enabled: false },
      { label: 'Open settings…', click: openWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]))
  }

  if (!embedded) {
    const icon = trayImage()
    tray = new Tray(icon)
    tray.setToolTip('Token Deck')
    rebuildTray()
    tray.on('click', openWindow)
  }

  ipcMain.handle('td', async (event, call: IpcCall) => {
    if (!isAppUrl(event.senderFrame?.url || '', appUrl)) {
      log.write(`ignored a call from ${event.senderFrame?.url || 'an unknown frame'}`)
      throw new Error('not allowed')
    }
    if (call.method === 'pickIconFile') {
      const picked = await dialog.showOpenDialog({
        title: 'Choose Button Icon',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'svg', 'jpg', 'jpeg', 'webp'] }]
      })
      return picked.canceled ? null : picked.filePaths[0] || null
    }
    if (call.method === 'appIcons') {
      return getAllInstalledAppIcons()
    }
    await dispatch(call)
    broadcast()
    return snapshot()
  })

  async function dispatch(call: IpcCall): Promise<void> {
    if (call.method === 'brightness') {
      store.set('brightness', call.value)
      await transport.setBrightness(call.value)
    } else if (call.method === 'keepalive') {
      store.set('repaintKeepalive', call.value)
      transport.keepalive = call.value
    } else if (call.method === 'autoBurn') store.set('autoBurn', call.value)
    else if (call.method === 'login') {
      store.set('startAtLogin', call.value)
      app.setLoginItemSettings({ openAtLogin: call.value })
    } else if (call.method === 'testPattern') {
      const jpeg = await (await import('./deck/render')).renderTile({ kind: 'test' }, 1)
      await transport.paint([jpeg, jpeg, jpeg, jpeg, jpeg, jpeg], true)
    } else if (call.method === 'connect') await connectAgent(call.id)
    else if (call.method === 'disconnect') disconnect(call.id)
    else if (call.method === 'restore') {
      try {
        if (call.id === 'claude-code') claude.uninstall()
        if (call.id === 'codex') restoreCodex()
      } catch (err) {
        log.write(`restore ${err}`)
        await settingsProblem(call.id === 'codex' ? '~/.codex/config.toml' : '~/.claude/settings.json', err)
      }
      await claude.detect()
    } else if (call.method === 'favorites') {
      const favorites = store.get('favorites')
      favorites[call.agent] = call.models.slice(0, 6)
      store.set('favorites', favorites)
      await controller.render(true)
    } else if (call.method === 'reloadModes') await controller.modesChanged()
    else if (call.method === 'openModes') {
      const { modesDir } = await import('./modes/custom')
      await shell.openPath(modesDir())
    } else if (call.method === 'saveMode') {
      const saved = await saveMode(call.id, { name: call.name, tiles: call.tiles, knobs: call.knobs })
      controller.invalidateModes()
      if (controller.activePage() === `custom:${saved.id}`) {
        await controller.selectPage(`custom:${saved.id}`, false)
      } else {
        await controller.modesChanged()
      }
    } else if (call.method === 'createMode') {
      const created = await createMode(call.name)
      controller.invalidateModes()
      await controller.selectPage(`custom:${created.id}`, false)
    } else if (call.method === 'deleteMode') {
      deleteMode(call.id)
      controller.invalidateModes()
      const bindings = store.get('metalBindings')
      if (bindings) {
        const next = { ...bindings }
        for (const k of ['left', 'middle', 'right'] as const) {
          if (next[k] === `custom:${call.id}`) next[k] = k === 'middle' ? 'sessions' : k === 'right' ? 'models' : 'agents'
        }
        store.set('metalBindings', next)
      }
      if (controller.activePage() === `custom:${call.id}`) {
        const remaining = controller.modes()
        await controller.selectPage(remaining[0] ? `custom:${remaining[0].id}` : 'agents', false)
      } else {
        await controller.modesChanged()
      }
    } else if (call.method === 'selectPage') {
      await controller.selectPage(call.target, false)
    } else if (call.method === 'setMetalBindings') {
      store.set('metalBindings', call.bindings)
    } else if (call.method === 'testTile') {
      await controller.handle({ type: 'key', key: call.key as 1 | 2 | 3 | 4 | 5 | 6 })
    } else if (call.method === 'burn') {
      await transport.rewrite()
    } else if (call.method === 'exportWelcome') {
      const target = await dialog.showSaveDialog({ defaultPath: 'token-deck-background.jpg' })
      if (!target.canceled && target.filePath) {
        const { loadImage, createCanvas } = await import('@napi-rs/canvas')
        const image = await loadImage(resource('welcome-320x240.png'))
        const canvas = createCanvas(320, 240)
        const ctx = canvas.getContext('2d')
        ctx.drawImage(image, 0, 0, 320, 240)
        fs.writeFileSync(target.filePath, Buffer.from(await canvas.encode('jpeg', { quality: 97 })))
      }
    } else if (call.method === 'checkUpdates' || call.method === 'updateNow') {
      /* updates managed by ClaudeUsageBar */
    } else if (call.method === 'showLog') await shell.openPath(log.file)
    else if (call.method === 'usageClose') usageOpen = false
    else if (call.method === 'wizard') {
      if (call.skip) store.set('wizardStep', Math.min(4, call.step + 1))
      else store.set('wizardStep', call.step)
      if (store.get('wizardStep') >= 4) {
        store.set('wizardDone', true)
        wizardOpen = false
      }
    } else if (call.method === 'wizardAsk') await askAutomation()
    else if (call.method === 'requestAccessibility') {
      await requestAccessibilityPermission()
      await refreshAccessibilityStatus()
    } else if (call.method === 'simulator') {
      const event = call.event
      if (event.type === 'key' && event.key) await controller.handle({ type: 'key', key: event.key as 1 | 2 | 3 | 4 | 5 | 6 })
      if (event.type === 'metal' && event.which) await controller.handle({ type: 'metal', which: event.which as 'left' | 'middle' | 'right', pressed: !!event.pressed })
      if (event.type === 'knob' && event.which && event.action) {
        await controller.handle({ type: 'knob', which: event.which as 'main' | 'left' | 'right', action: event.action as 'cw' | 'ccw' | 'click' })
      }
    }
  }

  /** Says that a change to an agent's settings didn't happen, and why. Token Deck never half-writes the file. */
  async function settingsProblem(file: string, err: unknown): Promise<void> {
    const reason = err instanceof Error ? err.message : String(err)
    const invalid = /not valid JSON|not an object/.test(reason)
    await dialog.showMessageBox({
      type: 'warning',
      message: `Token Deck didn’t change ${file}`,
      detail: invalid
        ? 'The file isn’t valid JSON, so Token Deck left it as it is. Fix the file, then try again.'
        : `Token Deck got an error (${reason}) and left the file as it was. Try again; if it keeps happening, About › Show log has the details.`,
      buttons: ['OK']
    })
  }

  async function connectAgent(id: AgentId): Promise<void> {
    if (id === 'claude-code') {
      try {
        const notes = await claude.install()
        log.write(notes.join(' '))
      } catch (err) {
        log.write(`connect claude ${err}`)
        await settingsProblem('~/.claude/settings.json', err)
      }
      if (controller.mode === 'idle') controller.mode = store.get('mode')
    } else if (id === 'codex') await codex.start()
    else if (id === 'opencode') opencode.start()
    else if (id === 'cursor' || id === 'amp' || id === 'devin') await launch[id].launch()
    await controller.render(true)
  }

  function disconnect(id: AgentId): void {
    if (id === 'codex') codex.stop()
    if (id === 'opencode') opencode.stop()
  }

  powerMonitor.on('suspend', () => {
    transport.pause()
    claude.pause()
    codex.pause()
    opencode.pause()
  })
  powerMonitor.on('lock-screen', () => {
    transport.pause()
    claude.pause()
    codex.pause()
    opencode.pause()
  })
  powerMonitor.on('resume', () => {
    transport.resume()
    void transport.reconnect()
    claude.resume()
    codex.resume()
    opencode.resume()
  })
  powerMonitor.on('unlock-screen', () => {
    transport.resume()
    claude.resume()
    codex.resume()
    opencode.resume()
  })
  powerMonitor.on('shutdown', () => {
    shutdownCap = 1000
  })
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    stopAccessibilityPoll()
    claude.stop()
    codex.stop()
    opencode.stop()
    void (async () => {
      const crops = [1, 2, 3, 4, 5, 6].map((key) => fs.readFileSync(resource('welcome-tiles', `key${key}.jpg`)))
      await transport.prepareQuit({ paint: transport.burnFailed ? null : crops, capMs: shutdownCap })
      await hooks.stop()
      app.exit(0)
    })()
  })
  app.on('window-all-closed', () => undefined)
  app.on('second-instance', () => openWindow())

  transport.start()
  await controller.render(true)
  if (wizardOpen && !embedded) openWindow()
  if (parentPid > 0) {
    setInterval(() => {
      try {
        process.kill(parentPid, 0)
      } catch {
        app.quit()
      }
    }, 15_000).unref()
  }
  log.write('Token Deck ready')
}

function row(id: AgentId, installed: boolean, signedIn: boolean, hooks: boolean, statusLine: boolean, reachable: boolean, detail: string) {
  return { id, installed, signedIn, hooks, statusLine, reachable, detail }
}

function trayImage() {
  const file = resource('trayTemplate.png')
  if (fs.existsSync(file)) return nativeImage.createFromPath(file)
  return nativeImage.createEmpty()
}
