import http from 'http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { normalizeUrl, refreshAccessibilityStatus, runSystemAction, sendKeys } from '../src/main/system/focus'
import { runAction } from '../src/main/modes/custom'
import { SHORTCUT_PRESETS, SYSTEM_ACTIONS, TERMINAL_PRESETS, URL_PRESETS } from '../src/shared/presets'

describe('QA: URL normalization & presets integrity', () => {
  it('normalizes bare domains and preserves schemes', () => {
    expect(normalizeUrl('github.com')).toBe('https://github.com')
    expect(normalizeUrl('  claude.ai/chats ')).toBe('https://claude.ai/chats')
    expect(normalizeUrl('https://mail.google.com')).toBe('https://mail.google.com')
    expect(normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000')
    expect(normalizeUrl('mailto:test@example.com')).toBe('mailto:test@example.com')
    expect(() => normalizeUrl('   ')).toThrow()
  })

  it('has valid non-empty icons and payloads on every URL, shortcut, terminal, and system preset', () => {
    for (const u of URL_PRESETS) {
      expect(normalizeUrl(u.url)).toMatch(/^https:\/\//)
      expect(u.icon).toMatch(/^brand:/)
    }
    for (const s of SHORTCUT_PRESETS) {
      expect(s.keys.length).toBeGreaterThan(2)
      expect(s.icon).toMatch(/^preset:/)
      expect(s.tileLabel.length).toBeGreaterThan(0)
    }
    for (const t of TERMINAL_PRESETS) {
      expect(t.command.length).toBeGreaterThan(0)
      expect(t.icon).toMatch(/^(brand|preset):/)
    }
    for (const sys of SYSTEM_ACTIONS) {
      expect(sys.icon).toMatch(/^preset:/)
      expect(sys.tileLabel.length).toBeGreaterThan(0)
    }
  })
})

describe('QA: Native input bridge & action execution', () => {
  let server: http.Server
  let baseUrl = ''
  const token = 'test-secret-token'
  let allowAccess = true
  const received: Array<{ path: string; body: Record<string, unknown> }> = []

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = ''
      req.on('data', (chunk) => (raw += chunk))
      req.on('end', () => {
        if (req.headers['x-action-token'] !== token) {
          res.writeHead(403, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }))
          return
        }
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
        received.push({ path: req.url || '', body })
        if (req.url === '/status') {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, accessibility: allowAccess }))
          return
        }
        if ((req.url === '/keys' || req.url === '/media') && !allowAccess) {
          res.writeHead(403, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, code: 'NO_ACCESSIBILITY', error: 'Accessibility required' }))
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address()
    if (addr && typeof addr === 'object') {
      baseUrl = `http://127.0.0.1:${addr.port}`
    }
    process.env.CLAUDE_USAGE_ACTION_URL = baseUrl
    process.env.CLAUDE_USAGE_ACTION_TOKEN = token
  })

  afterAll(async () => {
    delete process.env.CLAUDE_USAGE_ACTION_URL
    delete process.env.CLAUDE_USAGE_ACTION_TOKEN
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('executes every keyboard shortcut preset and knob shortcut through the native bridge', async () => {
    if (process.platform !== 'darwin') return
    allowAccess = true
    expect(await refreshAccessibilityStatus()).toBe(true)

    const combos = [
      ...SHORTCUT_PRESETS.map((p) => p.keys),
      'cmd+=',
      'cmd+-',
      'cmd+0',
      'cmd+opt+right',
      'cmd+opt+left',
      'cmd+w'
    ]
    for (const combo of combos) {
      const res = await runAction({ type: 'keys', keys: combo })
      expect(res.status, `shortcut ${combo}`).toBe('ok')
    }
    const sentKeys = received.filter((r) => r.path === '/keys').map((r) => r.body.keys)
    expect(sentKeys).toEqual(combos)
  })

  it('surfaces GRANT ACCESS overlay and reason when Accessibility permission is missing', async () => {
    if (process.platform !== 'darwin') return
    allowAccess = false
    expect(await refreshAccessibilityStatus()).toBe(false)
    const logs: string[] = []
    const res = await runAction({ type: 'keys', keys: 'cmd+=' }, { log: (l) => logs.push(l) })
    expect(res.status).toBe('failed')
    expect(res.overlay).toEqual(['GRANT', 'ACCESS'])
    expect(res.reason).toContain('Accessibility')
    expect(logs.some((l) => l.includes('ACCESSIBILITY_REQUIRED'))).toBe(true)
    await expect(sendKeys('cmd+opt+right')).rejects.toThrow('ACCESSIBILITY_REQUIRED')
  })

  it('executes media keys, lock screen, brightness, volume, shell, and mode actions cleanly', async () => {
    if (process.platform !== 'darwin') return
    allowAccess = true

    for (const id of ['media-play', 'media-next', 'media-prev', 'lock-screen'] as const) {
      const res = await runSystemAction(id)
      expect(res.overlay?.length, `system action ${id}`).toBeGreaterThan(0)
    }

    let deltaSum = 0
    const bUp = await runSystemAction('brightness-up', async (d) => { deltaSum += d })
    const bDn = await runSystemAction('brightness-down', async (d) => { deltaSum += d })
    expect(deltaSum).toBe(0)
    expect(bUp.overlay).toEqual(['BRIGHT +'])
    expect(bDn.overlay).toEqual(['BRIGHT -'])

    const shellOk = await runAction({ type: 'shell', command: 'echo qa-ok', terminal: false })
    expect(shellOk.status).toBe('ok')

    const shellBadDir = await runAction({ type: 'shell', command: 'echo hi', cwd: '/nonexistent-qa-dir-12345', terminal: false })
    expect(shellBadDir.status).toBe('failed')
    expect(shellBadDir.reason).toContain('folder not found')

    const modeRes = await runAction({ type: 'mode', mode: 'sessions' })
    expect(modeRes.status).toBe('mode')
  })
})
