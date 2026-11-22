import { useEffect, useRef, useState } from 'react'
import {
  AppWindow,
  Globe,
  Image as ImageIcon,
  Keyboard,
  Layers,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Settings,
  Sliders,
  Sun,
  Terminal,
  Trash2,
  X
} from 'lucide-react'
import type { Action, CustomMode, CustomTile, KnobActions } from '../main/modes/custom'
import type { Snapshot } from '../shared/ipc'
import {
  ACCENT_COLORS,
  BRAND_LOGOS,
  PRESET_ICONS,
  SHORTCUT_PRESETS,
  SYSTEM_ACTIONS,
  TERMINAL_PRESETS,
  URL_PRESETS,
  inferIconForShortcut,
  inferLogoForShell,
  inferLogoForUrl
} from '../shared/presets'

type Selection =
  | { kind: 'key'; index: number }
  | { kind: 'metal'; which: 'left' | 'middle' | 'right' }
  | { kind: 'knob'; which: 'main' | 'left' | 'right' }

type ActionKind = 'open' | 'url' | 'keys' | 'system' | 'shell' | 'mode' | 'none'

const BUILTIN_PAGES = [
  { id: 'sessions', name: 'Sessions', desc: 'Live Claude Code & OpenCode sessions' },
  { id: 'models', name: 'Models & Usage', desc: 'Quota meter & model switcher' },
  { id: 'agents', name: 'Agents', desc: 'Quick-launch coding agents' }
] as const

export function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [appIcons, setAppIcons] = useState<Record<string, string>>({})
  const [view, setView] = useState<'studio' | 'settings'>('studio')
  const [selection, setSelection] = useState<Selection>({ kind: 'key', index: 0 })
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [newPageOpen, setNewPageOpen] = useState(false)
  const [newPageName, setNewPageName] = useState('')
  const [draftPageName, setDraftPageName] = useState('')

  useEffect(() => {
    const off = window.tokenDeck.onState(setSnap)
    void window.tokenDeck.invoke({ method: 'snapshot' }).then((value) => {
      if (value && typeof value === 'object') setSnap(value as Snapshot)
    })
    void window.tokenDeck.invoke({ method: 'appIcons' }).then((value) => {
      if (value && typeof value === 'object') setAppIcons(value as unknown as Record<string, string>)
    })
    return off
  }, [])

  const activeCustom: CustomMode | null =
    snap && snap.activePage.startsWith('custom:')
      ? snap.customModes.find((m) => `custom:${m.id}` === snap.activePage) ?? null
      : null

  useEffect(() => {
    if (activeCustom) setDraftPageName(activeCustom.name)
  }, [activeCustom?.id, activeCustom?.name])

  if (!snap) return null

  const saveCustomMode = (mode: CustomMode, patch: { name?: string; tiles?: CustomTile[]; knobs?: CustomMode['knobs'] }) => {
    void window.tokenDeck.invoke({
      method: 'saveMode',
      id: mode.id,
      name: patch.name ?? mode.name,
      tiles: patch.tiles ?? mode.tiles,
      knobs: patch.knobs ?? mode.knobs
    })
  }

  const updateTile = (index: number, nextTile: CustomTile) => {
    if (!activeCustom) return
    const nextTiles = [...activeCustom.tiles]
    while (nextTiles.length < 6) nextTiles.push(null)
    nextTiles[index] = nextTile
    saveCustomMode(activeCustom, { tiles: nextTiles })
  }

  const swapTiles = (from: number, to: number) => {
    if (!activeCustom || from === to) return
    const nextTiles = [...activeCustom.tiles]
    while (nextTiles.length < 6) nextTiles.push(null)
    ;[nextTiles[from], nextTiles[to]] = [nextTiles[to] ?? null, nextTiles[from] ?? null]
    saveCustomMode(activeCustom, { tiles: nextTiles })
    setSelection({ kind: 'key', index: to })
  }

  const updateKnob = (which: 'main' | 'left' | 'right', next: KnobActions | null) => {
    if (!activeCustom) return
    saveCustomMode(activeCustom, {
      knobs: {
        ...activeCustom.knobs,
        [which]: next
      }
    })
  }

  const pageLabel = (target: string): string => {
    if (target === 'sessions') return 'Sessions'
    if (target === 'models') return 'Models & Usage'
    if (target === 'agents') return 'Agents'
    if (target.startsWith('custom:')) {
      const id = target.slice(7)
      return snap.customModes.find((m) => m.id === id)?.name || id
    }
    return target
  }

  const knobSummary = (which: 'main' | 'left' | 'right'): string => {
    const custom = activeCustom?.knobs?.[which]
    if (custom && (custom.cw || custom.ccw || custom.click)) {
      if (custom.cw?.type === 'system' && custom.cw.action === 'vol-up') return 'Volume'
      if (custom.cw?.type === 'system' && custom.cw.action === 'media-next') return 'Media'
      if (custom.cw?.type === 'system' && custom.cw.action === 'brightness-up') return 'Brightness'
      if (custom.cw?.type === 'keys') return custom.cw.keys.toUpperCase()
      return 'Custom'
    }
    if (which === 'main') return 'Volume'
    if (snap.activePage === 'sessions') return which === 'left' ? 'App Filter' : 'Status Filter'
    if (snap.activePage === 'models') return which === 'left' ? 'Pick Agent' : 'Permission'
    if (snap.activePage === 'agents') return which === 'left' ? 'Model' : 'Effort'
    return which === 'left' ? 'Left Knob' : 'Right Knob'
  }

  const deviceDotClass =
    snap.device.phase === 'ready'
      ? 'ready'
      : snap.device.phase === 'burning' || snap.device.phase === 'opening' || snap.device.phase === 'handshaking'
        ? 'warn'
        : snap.device.phase === 'vendor' || snap.device.phase === 'unresponsive'
          ? 'err'
          : ''

  const deviceLabel =
    snap.device.phase === 'ready'
      ? snap.device.firmware.includes('AKP03E')
        ? 'AKP03E Connected'
        : 'Deck Connected'
      : snap.device.phase === 'vendor'
        ? 'Close StreamDock App'
        : 'Simulator Mode'

  return (
    <div className="studio">
      {/* Top Bar */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="status-pill" title={snap.device.message}>
            <span className={`status-dot ${deviceDotClass}`} />
            <span>{deviceLabel}</span>
          </div>

          <div className="page-tabs">
            {snap.customModes.map((mode) => {
              const target = `custom:${mode.id}`
              return (
                <button
                  key={mode.id}
                  className={`page-tab ${view === 'studio' && snap.activePage === target ? 'active' : ''}`}
                  onClick={() => {
                    setView('studio')
                    void window.tokenDeck.invoke({ method: 'selectPage', target })
                  }}
                >
                  {mode.name}
                </button>
              )
            })}
            {BUILTIN_PAGES.map((p) => (
              <button
                key={p.id}
                className={`page-tab ${view === 'studio' && snap.activePage === p.id ? 'active' : ''}`}
                onClick={() => {
                  setView('studio')
                  void window.tokenDeck.invoke({ method: 'selectPage', target: p.id })
                }}
              >
                {p.name}
              </button>
            ))}
          </div>

          <button
            className="page-tab-add"
            onClick={() => {
              setNewPageName('')
              setNewPageOpen(true)
            }}
          >
            <Plus size={13} /> New Page
          </button>
        </div>

        <div className="topbar-right">
          <button
            className={`btn sm ${view === 'settings' ? 'accent' : ''}`}
            onClick={() => setView(view === 'settings' ? 'studio' : 'settings')}
          >
            <Settings size={13} /> {view === 'settings' ? 'Back to Deck' : 'Device & Hooks'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      {view === 'settings' ? (
        <SettingsPanel snap={snap} />
      ) : (
        <div className="workspace">
          {/* Left: Interactive Visual Hardware Canvas */}
          <section className="canvas-pane">
            <div className="canvas-head">
              <div className="page-title-edit">
                {activeCustom ? (
                  <>
                    <input
                      className="page-name-input"
                      value={draftPageName}
                      onChange={(e) => setDraftPageName(e.target.value)}
                      onBlur={() => {
                        if (draftPageName.trim() && draftPageName !== activeCustom.name) {
                          saveCustomMode(activeCustom, { name: draftPageName.trim() })
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      }}
                      aria-label="Page Name"
                    />
                    {snap.customModes.length > 1 && (
                      <button
                        className="btn sm danger"
                        title="Delete this custom page"
                        onClick={() => void window.tokenDeck.invoke({ method: 'deleteMode', id: activeCustom.id })}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </>
                ) : (
                  <h1 className="page-title-static">{pageLabel(snap.activePage)}</h1>
                )}
              </div>
              <span className="canvas-hint">
                {activeCustom ? 'Click any key, button, or knob · Drag keys to swap' : 'Dynamic built-in page · Click buttons or knobs below'}
              </span>
            </div>

            {/* Physical AKP03E Layout */}
            <div className="hardware-shell">
              <div className="hardware-left">
                {/* 6 LCD Screen Keys */}
                <div className="lcd-grid">
                  {[0, 1, 2, 3, 4, 5].map((index) => {
                    const isSelected = selection.kind === 'key' && selection.index === index
                    const tile = snap.tiles[index] || ''
                    return (
                      <div
                        key={index}
                        className={`lcd-key ${isSelected ? 'selected' : ''} ${dragOver === index ? 'drag-over' : ''}`}
                        draggable={!!activeCustom}
                        onClick={() => setSelection({ kind: 'key', index })}
                        onDragStart={() => setDragFrom(index)}
                        onDragOver={(e) => {
                          if (activeCustom && dragFrom !== null) {
                            e.preventDefault()
                            setDragOver(index)
                          }
                        }}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (dragFrom !== null) swapTiles(dragFrom, index)
                          setDragFrom(null)
                          setDragOver(null)
                        }}
                        onDragEnd={() => {
                          setDragFrom(null)
                          setDragOver(null)
                        }}
                      >
                        {tile && <WireTile jpeg={tile} />}
                        <span className="key-badge">{index + 1}</span>
                        <button
                          className="key-test-btn"
                          title={`Test Key ${index + 1}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            void window.tokenDeck.invoke({ method: 'testTile', key: index + 1 })
                          }}
                        >
                          <Play size={10} fill="currentColor" />
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* 3 Bottom Physical Mode Buttons */}
                <div className="metal-row">
                  {(['left', 'middle', 'right'] as const).map((which) => {
                    const boundTarget = snap.metalBindings[which]
                    const isSelected = selection.kind === 'metal' && selection.which === which
                    const isActivePage = snap.activePage === boundTarget
                    return (
                      <button
                        key={which}
                        className={`metal-slot ${isSelected ? 'selected' : ''} ${isActivePage ? 'active-page' : ''}`}
                        onClick={() => setSelection({ kind: 'metal', which })}
                        onDoubleClick={() => void window.tokenDeck.invoke({ method: 'selectPage', target: boundTarget })}
                        title="Click to assign page · Double-click to switch"
                      >
                        <div className="metal-cap" />
                        <span className="metal-label">{pageLabel(boundTarget)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Right: 3 Physical Rotary Knobs */}
              <div className="hardware-right">
                <button
                  className={`knob-btn ${selection.kind === 'knob' && selection.which === 'main' ? 'selected' : ''}`}
                  onClick={() => setSelection({ kind: 'knob', which: 'main' })}
                >
                  <div className="knob-dial big" />
                  <span className="knob-title">Big Knob · {knobSummary('main')}</span>
                </button>

                <div className="small-knobs-row">
                  <button
                    className={`knob-btn ${selection.kind === 'knob' && selection.which === 'left' ? 'selected' : ''}`}
                    onClick={() => setSelection({ kind: 'knob', which: 'left' })}
                  >
                    <div className="knob-dial small" />
                    <span className="knob-title">{knobSummary('left')}</span>
                  </button>

                  <button
                    className={`knob-btn ${selection.kind === 'knob' && selection.which === 'right' ? 'selected' : ''}`}
                    onClick={() => setSelection({ kind: 'knob', which: 'right' })}
                  >
                    <div className="knob-dial small" />
                    <span className="knob-title">{knobSummary('right')}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Brightness Bar */}
            <div className="brightness-bar">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Sun size={14} /> Brightness
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={snap.brightness}
                onChange={(e) => void window.tokenDeck.invoke({ method: 'brightness', value: Number(e.target.value) })}
              />
              <span style={{ width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{snap.brightness}%</span>
            </div>

            {snap.lastAction && Date.now() - snap.lastAction.at < 5000 && (
              <div className={`action-toast ${snap.lastAction.ok ? 'ok' : 'err'}`}>
                <span>{snap.lastAction.ok ? '✓' : '✗'} {snap.lastAction.message}</span>
                {!snap.lastAction.ok && !snap.accessibility && (
                  <button
                    className="btn sm accent"
                    onClick={() => void window.tokenDeck.invoke({ method: 'requestAccessibility' })}
                  >
                    Grant Accessibility…
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Right: Context-Aware Visual Inspector */}
          <aside className="inspector">
            {selection.kind === 'key' && activeCustom && (
              <KeyInspector
                key={`${activeCustom.id}-${selection.index}`}
                index={selection.index}
                tile={activeCustom.tiles[selection.index] ?? null}
                snap={snap}
                appIcons={appIcons}
                onChange={(next) => updateTile(selection.index, next)}
              />
            )}

            {selection.kind === 'key' && !activeCustom && (
              <BuiltinKeyInspector
                snap={snap}
                index={selection.index}
                onCreatePage={() => {
                  setNewPageName('')
                  setNewPageOpen(true)
                }}
              />
            )}

            {selection.kind === 'metal' && (
              <MetalButtonInspector
                which={selection.which}
                snap={snap}
                pageLabel={pageLabel}
              />
            )}

            {selection.kind === 'knob' && (
              <KnobInspector
                key={`${activeCustom?.id ?? 'builtin'}-${selection.which}`}
                which={selection.which}
                snap={snap}
                activeCustom={activeCustom}
                onChange={(next) => updateKnob(selection.which, next)}
                onTest={(action) =>
                  void window.tokenDeck.invoke({
                    method: 'simulator',
                    event: { type: 'knob', which: selection.which, action }
                  })
                }
              />
            )}
          </aside>
        </div>
      )}

      {/* Create New Page Modal */}
      {newPageOpen && (
        <div className="modal-backdrop" onClick={() => setNewPageOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Create New Button Page</h2>
            <div className="field-group">
              <label className="field-label">Page Name</label>
              <input
                className="text-input"
                autoFocus
                placeholder="e.g. Media, Work, Meetings, Shortcuts"
                value={newPageName}
                onChange={(e) => setNewPageName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newPageName.trim()) {
                    void window.tokenDeck.invoke({ method: 'createMode', name: newPageName.trim() })
                    setNewPageOpen(false)
                    setView('studio')
                    setSelection({ kind: 'key', index: 0 })
                  }
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setNewPageOpen(false)}>Cancel</button>
              <button
                className="btn accent"
                disabled={!newPageName.trim()}
                onClick={() => {
                  void window.tokenDeck.invoke({ method: 'createMode', name: newPageName.trim() })
                  setNewPageOpen(false)
                  setView('studio')
                  setSelection({ kind: 'key', index: 0 })
                }}
              >
                Create Page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Usage Details Modal */}
      {snap.usageOpen && <UsagePopup snap={snap} />}
    </div>
  )
}

/* ==================== MINI ICON RENDERER ==================== */

function MiniIcon({
  icon,
  color = 'currentColor',
  size = 16,
  appIcons
}: {
  icon?: string
  color?: string
  size?: number
  appIcons?: Record<string, string>
}) {
  if (!icon) return null
  if (icon.startsWith('brand:')) {
    const id = icon.slice(6)
    const def = BRAND_LOGOS.find((b) => b.id === id)
    if (!def) return null
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={{ flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: def.svgBody }}
      />
    )
  }
  if (icon.startsWith('preset:')) {
    const id = icon.slice(7)
    const def = PRESET_ICONS.find((p) => p.id === id)
    if (!def) return null
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
        dangerouslySetInnerHTML={{ __html: def.paths }}
      />
    )
  }
  if (icon.startsWith('app:')) {
    const appName = icon.slice(4)
    const src = appIcons?.[appName]
    if (src) {
      return (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size, borderRadius: 4, flexShrink: 0, objectFit: 'contain' }}
        />
      )
    }
    return <AppWindow size={size} style={{ flexShrink: 0 }} />
  }
  return null
}

/* ==================== KEY INSPECTOR ==================== */

function KeyInspector({
  index,
  tile,
  snap,
  appIcons,
  onChange
}: {
  index: number
  tile: CustomTile
  snap: Snapshot
  appIcons: Record<string, string>
  onChange: (next: CustomTile) => void
}) {
  const [label, setLabel] = useState(tile?.label || '')
  const [icon, setIcon] = useState(tile?.icon || '')
  const [color, setColor] = useState(tile?.color || '#FFFFFF')
  const [action, setAction] = useState<Action | undefined>(tile?.action)
  const [recording, setRecording] = useState(false)
  const [appQuery, setAppQuery] = useState('')
  const saveTimer = useRef<number | null>(null)
  const pendingCommit = useRef<(() => void) | null>(null)

  const kind: ActionKind = action ? action.type : 'none'

  const commitNow = (nextLabel: string, nextIcon: string, nextColor: string, nextAction: Action | undefined) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = null
    pendingCommit.current = null
    if (!nextLabel.trim() && !nextIcon && !nextAction) {
      onChange(null)
      return
    }
    onChange({
      label: nextLabel,
      icon: nextIcon || undefined,
      color: nextColor,
      action: nextAction
    })
  }

  const commitDebounced = (nextLabel: string, nextIcon: string, nextColor: string, nextAction: Action | undefined) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    pendingCommit.current = () => commitNow(nextLabel, nextIcon, nextColor, nextAction)
    saveTimer.current = window.setTimeout(() => {
      pendingCommit.current?.()
    }, 180)
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      pendingCommit.current?.()
    }
  }, [])

  useEffect(() => {
    if (!recording) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const combo = eventToShortcutCombo(e)
      if (!combo) return
      const nextAction: Action = { type: 'keys', keys: combo }
      const inferred = inferIconForShortcut(combo)
      const nextIcon = inferred?.icon || icon || 'preset:bolt'
      const nextColor = inferred?.color || color
      const nextLabel = !label || label === 'SHORTCUT' ? inferred?.label || combo.toUpperCase() : label
      setAction(nextAction)
      setIcon(nextIcon)
      setColor(nextColor)
      setLabel(nextLabel)
      setRecording(false)
      commitNow(nextLabel, nextIcon, nextColor, nextAction)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recording, label, icon, color])

  const selectActionKind = (nextKind: ActionKind) => {
    setRecording(false)
    if (nextKind === 'none') {
      setLabel('')
      setIcon('')
      setColor('#FFFFFF')
      setAction(undefined)
      commitNow('', '', '#FFFFFF', undefined)
      return
    }
    if (nextKind === 'open') {
      const preferred = snap.installedApps.includes('Claude') ? 'Claude' : snap.installedApps[0] || 'Claude'
      const nextAction: Action = { type: 'open', app: preferred }
      const nextLabel = shortLabel(preferred)
      const nextIcon = `app:${preferred}`
      setAction(nextAction)
      setLabel(nextLabel)
      setIcon(nextIcon)
      setColor('#FFFFFF')
      commitNow(nextLabel, nextIcon, '#FFFFFF', nextAction)
    } else if (nextKind === 'url') {
      const first = URL_PRESETS[0]!
      const nextAction: Action = { type: 'url', url: first.url }
      const nextLabel = first.label.toUpperCase()
      const nextIcon = first.icon
      setAction(nextAction)
      setLabel(nextLabel)
      setIcon(nextIcon)
      setColor('#FFFFFF')
      commitNow(nextLabel, nextIcon, '#FFFFFF', nextAction)
    } else if (nextKind === 'keys') {
      const first = SHORTCUT_PRESETS[0]!
      const nextAction: Action = { type: 'keys', keys: first.keys }
      setAction(nextAction)
      setLabel(first.tileLabel)
      setIcon(first.icon)
      setColor(first.color)
      commitNow(first.tileLabel, first.icon, first.color, nextAction)
    } else if (nextKind === 'system') {
      const preset = SYSTEM_ACTIONS[0]!
      const nextAction: Action = { type: 'system', action: preset.id }
      setAction(nextAction)
      setLabel(preset.tileLabel)
      setIcon(preset.icon)
      setColor(preset.color)
      commitNow(preset.tileLabel, preset.icon, preset.color, nextAction)
    } else if (nextKind === 'shell') {
      const preset = TERMINAL_PRESETS[0]!
      const nextAction: Action = { type: 'shell', command: preset.command, terminal: preset.terminal }
      setAction(nextAction)
      setLabel(preset.tileLabel)
      setIcon(preset.icon)
      setColor(preset.color)
      commitNow(preset.tileLabel, preset.icon, preset.color, nextAction)
    } else if (nextKind === 'mode') {
      const nextAction: Action = { type: 'mode', mode: 'sessions' }
      const nextLabel = 'SESSIONS'
      const nextIcon = 'brand:claude'
      setAction(nextAction)
      setLabel(nextLabel)
      setIcon(nextIcon)
      setColor('#92E759')
      commitNow(nextLabel, nextIcon, '#92E759', nextAction)
    }
  }

  const filteredApps = appQuery.trim()
    ? snap.installedApps.filter((a) => a.toLowerCase().includes(appQuery.trim().toLowerCase()))
    : snap.installedApps

  return (
    <>
      <div className="inspector-head">
        <div>
          <h2 className="inspector-title">Screen Key {index + 1}</h2>
          <div className="inspector-sub">Changes sync live to your deck</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn sm accent"
            disabled={!action}
            onClick={() => void window.tokenDeck.invoke({ method: 'testTile', key: index + 1 })}
          >
            <Play size={11} fill="currentColor" /> Test
          </button>
          <button
            className="btn sm danger"
            title="Clear button"
            onClick={() => selectActionKind('none')}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="inspector-body">
        {/* Action Type Picker */}
        <div className="field-group">
          <span className="field-label">Action</span>
          <div className="action-type-grid">
            {[
              { id: 'open' as const, label: 'Open App', Icon: AppWindow },
              { id: 'url' as const, label: 'Open URL', Icon: Globe },
              { id: 'keys' as const, label: 'Shortcut', Icon: Keyboard },
              { id: 'system' as const, label: 'System', Icon: Sliders },
              { id: 'shell' as const, label: 'Terminal', Icon: Terminal },
              { id: 'mode' as const, label: 'Go to Page', Icon: Layers }
            ].map(({ id, label: pillLabel, Icon }) => (
              <button
                key={id}
                className={`action-type-pill ${kind === id ? 'active' : ''}`}
                onClick={() => selectActionKind(id)}
              >
                <Icon size={16} />
                <span>{pillLabel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Action Details */}
        {action?.type === 'open' && (
          <div className="field-group">
            <label className="field-label">Application</label>
            <input
              className="text-input"
              placeholder="Search installed apps…"
              value={appQuery}
              onChange={(e) => setAppQuery(e.target.value)}
            />
            <div className="app-picker-grid">
              {filteredApps.map((appName) => {
                const isSelected = action.app.toLowerCase() === appName.toLowerCase()
                return (
                  <button
                    key={appName}
                    className={`app-picker-item ${isSelected ? 'active' : ''}`}
                    title={appName}
                    onClick={() => {
                      const nextAction: Action = { type: 'open', app: appName }
                      const nextLabel = shortLabel(appName)
                      const nextIcon = `app:${appName}`
                      setAction(nextAction)
                      setLabel(nextLabel)
                      setIcon(nextIcon)
                      commitNow(nextLabel, nextIcon, color, nextAction)
                    }}
                  >
                    <MiniIcon icon={`app:${appName}`} size={20} appIcons={appIcons} />
                    <span className="app-picker-name">{appName}</span>
                  </button>
                )
              })}
            </div>
            <input
              className="text-input"
              placeholder="Or type exact macOS app name…"
              value={action.app}
              onChange={(e) => {
                const name = e.target.value
                const nextAction: Action = { type: 'open', app: name }
                const nextIcon = name.trim() ? `app:${name.trim()}` : icon
                setAction(nextAction)
                setIcon(nextIcon)
                commitDebounced(label, nextIcon, color, nextAction)
              }}
            />
          </div>
        )}

        {action?.type === 'url' && (
          <div className="field-group">
            <label className="field-label">Website URL</label>
            <input
              className="text-input"
              placeholder="https://…"
              value={action.url}
              onChange={(e) => {
                const val = e.target.value
                const nextAction: Action = { type: 'url', url: val }
                const canAutoLogo =
                  !icon || icon === 'preset:globe' || icon.startsWith('brand:') || icon.startsWith('favicon:')
                const autoLogo = canAutoLogo ? inferLogoForUrl(val) || 'preset:globe' : icon
                setAction(nextAction)
                setIcon(autoLogo)
                commitDebounced(label, autoLogo, color, nextAction)
              }}
            />
            <div className="quick-chips">
              {URL_PRESETS.map((p) => {
                const active = action.url === p.url
                return (
                  <button
                    key={p.label}
                    className={`quick-chip chip-with-icon ${active ? 'active' : ''}`}
                    onClick={() => {
                      const nextAction: Action = { type: 'url', url: p.url }
                      const nextLabel = p.label.toUpperCase()
                      setAction(nextAction)
                      setLabel(nextLabel)
                      setIcon(p.icon)
                      commitNow(nextLabel, p.icon, color, nextAction)
                    }}
                  >
                    <MiniIcon icon={p.icon} size={14} />
                    <span>{p.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {action?.type === 'keys' && (
          <div className="field-group">
            {!snap.accessibility && <AccessibilityBanner />}
            <label className="field-label">Keyboard Shortcut</label>
            <div
              className={`recorder-box ${recording ? 'recording' : ''}`}
              onClick={() => setRecording(!recording)}
            >
              <span className="recorder-keys">
                {recording ? 'Press keys now…' : formatShortcutDisplay(action.keys)}
              </span>
              <span style={{ fontSize: 11, color: recording ? 'var(--accent)' : 'var(--text-secondary)' }}>
                {recording ? 'Listening' : 'Click to Record'}
              </span>
            </div>
            <input
              className="text-input"
              placeholder="e.g. cmd+shift+p, cmd+c, ctrl+right"
              value={action.keys}
              onChange={(e) => {
                const val = e.target.value
                const nextAction: Action = { type: 'keys', keys: val }
                const inferred = inferIconForShortcut(val)
                const nextIcon = inferred ? inferred.icon : icon
                const nextColor = inferred ? inferred.color : color
                setAction(nextAction)
                if (inferred) {
                  setIcon(nextIcon)
                  setColor(nextColor)
                }
                commitDebounced(label, nextIcon, nextColor, nextAction)
              }}
            />
            <span className="field-label" style={{ marginTop: 4 }}>Popular Shortcuts</span>
            <div className="quick-chips">
              {SHORTCUT_PRESETS.map((p) => {
                const active = action.keys.toLowerCase() === p.keys
                return (
                  <button
                    key={p.keys}
                    className={`quick-chip chip-with-icon ${active ? 'active' : ''}`}
                    onClick={() => {
                      const nextAction: Action = { type: 'keys', keys: p.keys }
                      setAction(nextAction)
                      setLabel(p.tileLabel)
                      setIcon(p.icon)
                      setColor(p.color)
                      commitNow(p.tileLabel, p.icon, p.color, nextAction)
                    }}
                  >
                    <MiniIcon icon={p.icon} color={p.color} size={13} />
                    <span>{p.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {action?.type === 'system' && (
          <div className="field-group">
            {!snap.accessibility && ['media-play', 'media-next', 'media-prev'].includes(action.action) && (
              <AccessibilityBanner />
            )}
            <label className="field-label">System Action</label>
            <div className="system-action-grid">
              {SYSTEM_ACTIONS.map((a) => {
                const active = action.action === a.id
                return (
                  <button
                    key={a.id}
                    className={`system-action-card ${active ? 'active' : ''}`}
                    title={a.label}
                    onClick={() => {
                      const nextAction: Action = { type: 'system', action: a.id }
                      setAction(nextAction)
                      setLabel(a.tileLabel)
                      setIcon(a.icon)
                      setColor(a.color)
                      commitNow(a.tileLabel, a.icon, a.color, nextAction)
                    }}
                  >
                    <MiniIcon icon={a.icon} color={a.color} size={16} />
                    <div className="system-action-meta">
                      <span className="system-action-name">{a.tileLabel}</span>
                      <span className="system-action-desc">{a.label}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {action?.type === 'shell' && (
          <div className="field-group">
            <label className="field-label">Shell Command</label>
            <div className="quick-chips">
              {TERMINAL_PRESETS.map((p) => (
                <button
                  key={p.label}
                  className={`quick-chip chip-with-icon ${action.command === p.command ? 'active' : ''}`}
                  onClick={() => {
                    const nextAction: Action = { ...action, command: p.command, terminal: p.terminal }
                    setAction(nextAction)
                    setLabel(p.tileLabel)
                    setIcon(p.icon)
                    setColor(p.color)
                    commitNow(p.tileLabel, p.icon, p.color, nextAction)
                  }}
                >
                  <MiniIcon icon={p.icon} color={p.color} size={14} />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
            <input
              className="text-input"
              placeholder="e.g. claude, opencode, npm run dev"
              value={action.command}
              onChange={(e) => {
                const cmd = e.target.value
                const nextAction: Action = { ...action, command: cmd }
                const inferred = inferLogoForShell(cmd)
                const canAuto = !icon || icon === 'preset:terminal' || icon.startsWith('brand:') || icon === 'preset:rocket' || icon === 'preset:code' || icon === 'preset:layers'
                const nextIcon = canAuto && inferred ? inferred : icon
                setAction(nextAction)
                if (nextIcon !== icon) setIcon(nextIcon)
                commitDebounced(label, nextIcon, color, nextAction)
              }}
            />
            <input
              className="text-input"
              placeholder="Working folder (optional, e.g. ~/dev)"
              value={action.cwd || ''}
              onChange={(e) => {
                const nextAction: Action = { ...action, cwd: e.target.value || undefined }
                setAction(nextAction)
                commitDebounced(label, icon, color, nextAction)
              }}
            />
            <label className="toggle-row">
              <span>Run inside a new Terminal window</span>
              <input
                type="checkbox"
                checked={!!action.terminal}
                onChange={(e) => {
                  const nextAction: Action = { ...action, terminal: e.target.checked }
                  setAction(nextAction)
                  commitNow(label, icon, color, nextAction)
                }}
              />
            </label>
          </div>
        )}

        {action?.type === 'mode' && (
          <div className="field-group">
            <label className="field-label">Target Page</label>
            <div className="option-list">
              {snap.customModes.map((m) => {
                const target = `custom:${m.id}`
                const active = action.mode === target
                return (
                  <button
                    key={m.id}
                    className={`option-item ${active ? 'active' : ''}`}
                    onClick={() => {
                      const nextAction: Action = { type: 'mode', mode: target }
                      const nextLabel = m.name.slice(0, 9).toUpperCase()
                      const nextIcon = 'preset:layers'
                      setAction(nextAction)
                      setLabel(nextLabel)
                      setIcon(nextIcon)
                      commitNow(nextLabel, nextIcon, color, nextAction)
                    }}
                  >
                    <span className="chip-with-icon">
                      <MiniIcon icon="preset:layers" color="#92E759" size={15} />
                      <span>{m.name}</span>
                    </span>
                    <span className="option-tag">Page</span>
                  </button>
                )
              })}
              {BUILTIN_PAGES.map((p) => {
                const active = action.mode === p.id
                return (
                  <button
                    key={p.id}
                    className={`option-item ${active ? 'active' : ''}`}
                    onClick={() => {
                      const nextAction: Action = { type: 'mode', mode: p.id }
                      const nextLabel = p.id === 'models' ? 'USAGE' : p.name.toUpperCase()
                      const nextIcon = 'brand:claude'
                      setAction(nextAction)
                      setLabel(nextLabel)
                      setIcon(nextIcon)
                      commitNow(nextLabel, nextIcon, color, nextAction)
                    }}
                  >
                    <span className="chip-with-icon">
                      <MiniIcon icon="brand:claude" size={15} />
                      <span>{p.name}</span>
                    </span>
                    <span className="option-tag">Built-in</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Appearance: Label, Color, Icon */}
        {kind !== 'none' && (
          <>
            <div className="field-group">
              <label className="field-label">Button Label</label>
              <input
                className="text-input"
                maxLength={20}
                placeholder="Short label shown on key…"
                value={label}
                onChange={(e) => {
                  const val = e.target.value
                  setLabel(val)
                  commitDebounced(val, icon, color, action)
                }}
              />
            </div>

            <div className="field-group">
              <span className="field-label">Accent Color</span>
              <div className="swatch-row">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    className={`swatch ${color.toUpperCase() === c.hex ? 'active' : ''}`}
                    style={{ background: c.hex }}
                    title={c.name}
                    onClick={() => {
                      setColor(c.hex)
                      commitNow(label, icon, c.hex, action)
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="field-group">
              <span className="field-label">Logo & Icon</span>
              <div className="icon-actions-row">
                {action?.type === 'open' && action.app && (
                  <button
                    className={`btn sm ${icon === `app:${action.app}` ? 'accent' : ''}`}
                    onClick={() => {
                      const nextIcon = `app:${action.app}`
                      setIcon(nextIcon)
                      commitNow(label, nextIcon, color, action)
                    }}
                  >
                    <MiniIcon icon={`app:${action.app}`} size={14} appIcons={appIcons} /> App Logo
                  </button>
                )}
                {action?.type === 'url' && action.url && (
                  <button
                    className={`btn sm ${icon.startsWith('favicon:') || icon.startsWith('brand:') ? 'accent' : ''}`}
                    onClick={() => {
                      const nextIcon = inferLogoForUrl(action.url) || 'preset:globe'
                      setIcon(nextIcon)
                      commitNow(label, nextIcon, color, action)
                    }}
                  >
                    <Globe size={12} /> Site Logo
                  </button>
                )}
                <button
                  className="btn sm"
                  onClick={async () => {
                    const picked = (await window.tokenDeck.invoke({ method: 'pickIconFile' })) as string | null
                    if (picked) {
                      setIcon(picked)
                      commitNow(label, picked, color, action)
                    }
                  }}
                >
                  <ImageIcon size={12} /> Custom Image…
                </button>
                <button
                  className={`btn sm ${!icon ? 'accent' : ''}`}
                  onClick={() => {
                    setIcon('')
                    commitNow(label, '', color, action)
                  }}
                >
                  Text Only
                </button>
              </div>

              <span className="icon-section-label">Brand & Service Logos</span>
              <div className="icon-grid">
                {BRAND_LOGOS.map((b) => {
                  const val = `brand:${b.id}`
                  return (
                    <button
                      key={b.id}
                      className={`icon-cell brand-cell ${icon === val ? 'active' : ''}`}
                      title={b.name}
                      onClick={() => {
                        setIcon(val)
                        commitNow(label, val, color, action)
                      }}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        dangerouslySetInnerHTML={{ __html: b.svgBody }}
                      />
                    </button>
                  )
                })}
              </div>

              <span className="icon-section-label">Shortcut & Action Icons</span>
              <div className="icon-grid">
                {PRESET_ICONS.map((p) => {
                  const val = `preset:${p.id}`
                  const isActive = icon === val
                  return (
                    <button
                      key={p.id}
                      className={`icon-cell ${isActive ? 'active' : ''}`}
                      title={p.name}
                      onClick={() => {
                        setIcon(val)
                        commitNow(label, val, color, action)
                      }}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={isActive ? color : 'currentColor'}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        dangerouslySetInnerHTML={{ __html: p.paths }}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

/* ==================== BUILT-IN PAGE KEY INSPECTOR ==================== */

function BuiltinKeyInspector({
  snap,
  index,
  onCreatePage
}: {
  snap: Snapshot
  index: number
  onCreatePage: () => void
}) {
  const moveModel = (agent: 'claude-code' | 'codex' | 'opencode', idx: number, dir: -1 | 1) => {
    const models = [...snap.favorites[agent]]
    const target = idx + dir
    if (target < 0 || target >= models.length) return
    ;[models[idx], models[target]] = [models[target]!, models[idx]!]
    void window.tokenDeck.invoke({ method: 'favorites', agent, models })
  }

  return (
    <>
      <div className="inspector-head">
        <div>
          <h2 className="inspector-title">
            {snap.activePage === 'sessions' ? 'Dynamic Sessions Page' : snap.activePage === 'models' ? 'Models & Usage Page' : 'Built-In Agents Page'}
          </h2>
          <div className="inspector-sub">Key {index + 1} · Auto-populated live</div>
        </div>
        <button
          className="btn sm accent"
          onClick={() => void window.tokenDeck.invoke({ method: 'testTile', key: index + 1 })}
        >
          <Play size={11} fill="currentColor" /> Test
        </button>
      </div>
      <div className="inspector-body">
        {snap.activePage === 'models' && (
          <div className="field-group">
            <span className="field-label">Claude Model Key Order (Keys 2–6)</span>
            <ul className="model-list">
              {snap.favorites['claude-code'].map((name, i, list) => (
                <li key={name}>
                  <span>{i < 5 ? `Key ${i + 2}: ` : ''}{name}</span>
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button className="btn sm" disabled={i === 0} onClick={() => moveModel('claude-code', i, -1)}>↑</button>
                    <button className="btn sm" disabled={i === list.length - 1} onClick={() => moveModel('claude-code', i, 1)}>↓</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {snap.activePage === 'sessions' && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Keys 1–6 automatically list your 6 most recent Claude Code and OpenCode sessions with live status dots and context rings. Press any key to jump to that session or resume it in Terminal.
          </p>
        )}

        {snap.activePage === 'agents' && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            This built-in page maps fixed slots to Claude Code, Cursor, Codex, OpenCode, Amp, and Devin. To configure your own custom apps, shortcuts, and macros on every key, switch to a Custom Page like <strong>My Deck</strong>.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {snap.customModes[0] && (
            <button
              className="btn accent"
              onClick={() => void window.tokenDeck.invoke({ method: 'selectPage', target: `custom:${snap.customModes[0]!.id}` })}
            >
              Edit Buttons on “{snap.customModes[0].name}”
            </button>
          )}
          <button className="btn" onClick={onCreatePage}>
            <Plus size={14} /> Create New Custom Page
          </button>
        </div>
      </div>
    </>
  )
}

/* ==================== METAL BOTTOM BUTTON INSPECTOR ==================== */

function MetalButtonInspector({
  which,
  snap,
  pageLabel
}: {
  which: 'left' | 'middle' | 'right'
  snap: Snapshot
  pageLabel: (target: string) => string
}) {
  const current = snap.metalBindings[which]
  const title = which === 'left' ? 'Left Physical Button' : which === 'middle' ? 'Middle Physical Button' : 'Right Physical Button'

  const assign = (target: string) => {
    void window.tokenDeck.invoke({
      method: 'setMetalBindings',
      bindings: { ...snap.metalBindings, [which]: target }
    })
  }

  return (
    <>
      <div className="inspector-head">
        <div>
          <h2 className="inspector-title">{title}</h2>
          <div className="inspector-sub">Choose which page this button switches to</div>
        </div>
        <button
          className="btn sm accent"
          onClick={() => void window.tokenDeck.invoke({ method: 'selectPage', target: current })}
        >
          Switch Now
        </button>
      </div>
      <div className="inspector-body">
        <div className="field-group">
          <span className="field-label">Your Custom Pages</span>
          <div className="option-list">
            {snap.customModes.map((mode) => {
              const target = `custom:${mode.id}`
              return (
                <button
                  key={mode.id}
                  className={`option-item ${current === target ? 'active' : ''}`}
                  onClick={() => assign(target)}
                >
                  <span className="chip-with-icon">
                    <MiniIcon icon="preset:layers" color="#92E759" size={15} />
                    <span>{mode.name}</span>
                  </span>
                  <span className="option-tag">{current === target ? 'Assigned' : 'Custom'}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="field-group">
          <span className="field-label">Built-In Dynamic Pages</span>
          <div className="option-list">
            {BUILTIN_PAGES.map((p) => (
              <button
                key={p.id}
                className={`option-item ${current === p.id ? 'active' : ''}`}
                onClick={() => assign(p.id)}
              >
                <span className="chip-with-icon">
                  <MiniIcon icon="brand:claude" size={16} />
                  <div>
                    <div>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.desc}</div>
                  </div>
                </span>
                <span className="option-tag">{current === p.id ? 'Assigned' : 'Built-in'}</span>
              </button>
            ))}
          </div>
        </div>

        {which === 'middle' && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Tip: Tap the middle button to jump to <strong>{pageLabel(current)}</strong>. Hold it for 0.8s to open the on-deck page picker.
          </p>
        )}
      </div>
    </>
  )
}

/* ==================== KNOB INSPECTOR ==================== */

const KNOB_PRESETS: Array<{ name: string; desc: string; icon: string; color: string; value: KnobActions | null }> = [
  {
    name: 'Mac Volume',
    desc: 'Turn: Volume ±5% · Press: Mute',
    icon: 'preset:volume',
    color: '#92E759',
    value: {
      cw: { type: 'system', action: 'vol-up' },
      ccw: { type: 'system', action: 'vol-down' },
      click: { type: 'system', action: 'vol-mute' }
    }
  },
  {
    name: 'Media Controls',
    desc: 'Turn: Next / Prev Track · Press: Play/Pause',
    icon: 'preset:music',
    color: '#60A5FA',
    value: {
      cw: { type: 'system', action: 'media-next' },
      ccw: { type: 'system', action: 'media-prev' },
      click: { type: 'system', action: 'media-play' }
    }
  },
  {
    name: 'Zoom',
    desc: 'Turn: ⌘+ / ⌘- · Press: ⌘0 Reset',
    icon: 'preset:search',
    color: '#C084FC',
    value: {
      cw: { type: 'keys', keys: 'cmd+=' },
      ccw: { type: 'keys', keys: 'cmd+-' },
      click: { type: 'keys', keys: 'cmd+0' }
    }
  },
  {
    name: 'Browser Tabs',
    desc: 'Turn: Next / Prev Tab · Press: Close Tab',
    icon: 'preset:tabs',
    color: '#FBBF24',
    value: {
      cw: { type: 'keys', keys: 'cmd+opt+right' },
      ccw: { type: 'keys', keys: 'cmd+opt+left' },
      click: { type: 'keys', keys: 'cmd+w' }
    }
  },
  {
    name: 'Deck Brightness',
    desc: 'Turn: Brightness ±15%',
    icon: 'preset:sun',
    color: '#FBBF24',
    value: {
      cw: { type: 'system', action: 'brightness-up' },
      ccw: { type: 'system', action: 'brightness-down' },
      click: null
    }
  },
  {
    name: 'Default Behavior',
    desc: 'Use built-in knob action',
    icon: 'preset:bolt',
    color: '#9DA39A',
    value: null
  }
]

function KnobInspector({
  which,
  snap,
  activeCustom,
  onChange,
  onTest
}: {
  which: 'main' | 'left' | 'right'
  snap: Snapshot
  activeCustom: CustomMode | null
  onChange: (next: KnobActions | null) => void
  onTest: (action: 'cw' | 'ccw' | 'click') => void
}) {
  const [recordingDir, setRecordingDir] = useState<'cw' | 'ccw' | 'click' | null>(null)
  const title = which === 'main' ? 'Big Top Knob' : which === 'left' ? 'Bottom-Left Knob' : 'Bottom-Right Knob'
  const current = activeCustom?.knobs?.[which] ?? null

  const updateDir = (dir: 'cw' | 'ccw' | 'click', val: Action | null) => {
    onChange({
      ...(current || {}),
      [dir]: val
    })
  }

  useEffect(() => {
    if (!recordingDir) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const combo = eventToShortcutCombo(e)
      if (!combo) return
      updateDir(recordingDir, { type: 'keys', keys: combo })
      setRecordingDir(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recordingDir, current])

  const needsAccessibility =
    !!current &&
    (['cw', 'ccw', 'click'] as const).some((d) => {
      const a = current[d]
      return a?.type === 'keys' || (a?.type === 'system' && ['media-play', 'media-next', 'media-prev'].includes(a.action))
    })

  return (
    <>
      <div className="inspector-head">
        <div>
          <h2 className="inspector-title">{title}</h2>
          <div className="inspector-sub">
            {activeCustom ? `Custom page “${activeCustom.name}”` : 'Built-in page'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn sm" title="Test Counter-Clockwise" onClick={() => onTest('ccw')}>
            <RotateCcw size={12} />
          </button>
          <button className="btn sm" title="Test Press" onClick={() => onTest('click')}>
            ●
          </button>
          <button className="btn sm" title="Test Clockwise" onClick={() => onTest('cw')}>
            <RotateCw size={12} />
          </button>
        </div>
      </div>

      <div className="inspector-body">
        {!activeCustom ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {which === 'main'
              ? 'On all built-in pages, the Big Knob controls your Mac’s system volume (turn for ±5%, press to mute/unmute). Switch to a Custom Page to override it.'
              : 'On built-in pages, the small knobs filter agents, status, models, or effort. Switch to a Custom Page to assign custom shortcuts or media controls.'}
          </p>
        ) : (
          <>
            {!snap.accessibility && needsAccessibility && <AccessibilityBanner />}

            <div className="field-group">
              <span className="field-label">Quick Presets</span>
              <div className="option-list">
                {KNOB_PRESETS.map((preset) => {
                  const isActive = knobActionsMatch(current, preset.value)
                  return (
                    <button
                      key={preset.name}
                      className={`option-item ${isActive ? 'active' : ''}`}
                      onClick={() => onChange(preset.value)}
                    >
                      <span className="chip-with-icon" style={{ gap: 10 }}>
                        <MiniIcon icon={preset.icon} color={preset.color} size={17} />
                        <div>
                          <div>{preset.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{preset.desc}</div>
                        </div>
                      </span>
                      <span className="option-tag">{isActive ? 'Active' : 'Apply'}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="field-group">
              <span className="field-label">Custom Bindings (Shortcut Keys)</span>
              {([
                { dir: 'cw' as const, label: 'Turn Clockwise' },
                { dir: 'ccw' as const, label: 'Turn Counter-Clockwise' },
                { dir: 'click' as const, label: 'Press (Click)' }
              ]).map(({ dir, label }) => {
                const act = current?.[dir]
                const isRec = recordingDir === dir
                const display =
                  act?.type === 'keys'
                    ? formatShortcutDisplay(act.keys)
                    : act?.type === 'system'
                      ? SYSTEM_ACTIONS.find((a) => a.id === act.action)?.label || act.action
                      : act?.type === 'shell'
                        ? `Shell: ${act.command}`
                        : 'Unassigned'
                return (
                  <div className="knob-subcard" key={dir}>
                    <div className="knob-subhead">
                      <span>{label}</span>
                      <span style={{ display: 'flex', gap: 4 }}>
                        <button
                          className={`btn sm ${isRec ? 'accent' : ''}`}
                          style={{ height: 22, padding: '0 7px', fontSize: 11 }}
                          onClick={() => setRecordingDir(isRec ? null : dir)}
                        >
                          {isRec ? 'Press keys…' : 'Record'}
                        </button>
                        {act && (
                          <button
                            className="btn sm danger"
                            style={{ height: 22, padding: '0 6px', fontSize: 11 }}
                            onClick={() => updateDir(dir, null)}
                          >
                            Clear
                          </button>
                        )}
                      </span>
                    </div>
                    <input
                      className="text-input"
                      style={{ height: 32, fontSize: 12.5 }}
                      placeholder={display}
                      value={act?.type === 'keys' ? act.keys : ''}
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (!raw) updateDir(dir, null)
                        else updateDir(dir, { type: 'keys', keys: raw })
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function AccessibilityBanner() {
  return (
    <div className="perm-banner">
      <div className="perm-banner-text">
        <strong>Accessibility Permission Required</strong>
        <span>
          Keyboard shortcuts &amp; media keys need macOS Accessibility enabled for <strong>ClaudeUsageBar</strong>.
        </span>
      </div>
      <button
        className="btn sm accent"
        onClick={() => void window.tokenDeck.invoke({ method: 'requestAccessibility' })}
      >
        Grant Access…
      </button>
    </div>
  )
}

/* ==================== SETTINGS & HOOKS PANEL ==================== */

function SettingsPanel({ snap }: { snap: Snapshot }) {
  const claude = snap.agents.find((a) => a.id === 'claude-code')
  return (
    <div className="settings-view">
      <div className="settings-card">
        <h2>Hardware Device</h2>
        <div className="settings-row">
          <div>
            <div>Status</div>
            <div className="settings-sub">
              {snap.device.message}
              {snap.device.firmware && snap.device.firmware !== 'n/a' ? ` · Firmware ${snap.device.firmware}` : ''}
            </div>
          </div>
          <button
            className="btn sm"
            onClick={() => void window.tokenDeck.invoke({ method: 'showLog' })}
          >
            Show Log
          </button>
        </div>

        <div className="settings-row">
          <div>
            <div>Device ROM Background</div>
            <div className="settings-sub">Replaces the factory white/red background behind the keys with solid dark.</div>
          </div>
          <button
            className="btn sm accent"
            disabled={snap.device.phase === 'burning' || snap.device.burnFailed}
            onClick={() => void window.tokenDeck.invoke({ method: 'burn' })}
          >
            Clear Background Now
          </button>
        </div>

        <div className="settings-row">
          <div>
            <div>Custom Pages Folder</div>
            <div className="settings-sub">All pages are saved as JSON files in ~/.tokendeck/modes/</div>
          </div>
          <button
            className="btn sm"
            onClick={() => void window.tokenDeck.invoke({ method: 'openModes' })}
          >
            Open Folder
          </button>
        </div>
      </div>

      <div className="settings-card">
        <h2>Claude Code Integration</h2>
        <div className="settings-row">
          <div>
            <div>Live Session Hooks & Status Line</div>
            <div className="settings-sub">
              {claude?.hooks ? 'Connected — Claude Code sessions stream live to your deck.' : 'Not connected yet.'}
            </div>
          </div>
          {claude?.installed && (
            <button
              className={`btn sm ${claude.hooks ? '' : 'accent'}`}
              onClick={() =>
                void window.tokenDeck.invoke({
                  method: claude.hooks ? 'restore' : 'connect',
                  id: 'claude-code'
                })
              }
            >
              {claude.hooks ? 'Disconnect Hooks' : 'Connect Claude Code'}
            </button>
          )}
        </div>

        <div className="settings-row">
          <div>
            <div>macOS Accessibility</div>
            <div className="settings-sub">
              {snap.accessibility
                ? 'Granted for ClaudeUsageBar — keyboard shortcuts, Zoom, Browser Tabs & media controls enabled.'
                : 'Required for keyboard shortcuts, Zoom, Browser Tabs, and media keys. Enable ClaudeUsageBar in System Settings.'}
            </div>
          </div>
          {!snap.accessibility && (
            <button
              className="btn sm accent"
              onClick={() => void window.tokenDeck.invoke({ method: 'requestAccessibility' })}
            >
              Grant Permission…
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ==================== USAGE POPUP ==================== */

function UsagePopup({ snap }: { snap: Snapshot }) {
  const row = snap.allowance
  const close = () => void window.tokenDeck.invoke({ method: 'usageClose' })
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{row.agent} Allowance</h2>
        <UsageLine name={row.fiveLabel} pct={row.fiveHour} resets={row.fiveResets} />
        <UsageLine name={row.sevenLabel} pct={row.sevenDay} resets={row.sevenResets} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn accent" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  )
}

function UsageLine({ name, pct, resets }: { name: string; pct: number | null; resets: number | null }) {
  const width = pct === null ? 0 : Math.max(0, Math.min(100, pct))
  const when = resets
    ? new Date(resets > 1e12 ? resets : resets * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : ''
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span>{name}</span>
        <strong>{pct === null ? '--' : `${Math.round(pct)}%`}</strong>
      </div>
      <div className="usage-track"><div className="usage-fill" style={{ width: `${width}%` }} /></div>
      {when && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Resets {when}</div>}
    </div>
  )
}

/* ==================== WIRE TILE RENDERER ==================== */

function WireTile({ jpeg }: { jpeg: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const image = new Image()
    image.onload = () => {
      const wire = document.createElement('canvas')
      wire.width = 64
      wire.height = 64
      const source = wire.getContext('2d')
      const dest = canvas.getContext('2d')
      if (!source || !dest) return
      source.drawImage(image, 0, 0, 64, 64)
      const pixels = source.getImageData(0, 0, 64, 64)
      const out = dest.createImageData(64, 64)
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          const si = (x * 64 + (63 - y)) * 4
          const di = (y * 64 + x) * 4
          out.data[di] = pixels.data[si]!
          out.data[di + 1] = pixels.data[si + 1]!
          out.data[di + 2] = pixels.data[si + 2]!
          out.data[di + 3] = 255
        }
      }
      dest.putImageData(out, 0, 0)
    }
    image.src = jpeg
  }, [jpeg])
  return <canvas ref={ref} width={64} height={64} />
}

const APP_SHORT_LABELS: Record<string, string> = {
  'microsoft powerpoint': 'PPT',
  'microsoft outlook': 'OUTLOOK',
  'microsoft excel': 'EXCEL',
  'microsoft word': 'WORD',
  'microsoft teams': 'TEAMS',
  'google chrome': 'CHROME',
  'google drive': 'DRIVE',
  'google docs': 'DOCS',
  'google sheets': 'SHEETS',
  'google slides': 'SLIDES',
  'system settings': 'SETTINGS',
  'activity monitor': 'ACTIVITY',
  'zoom.us': 'ZOOM'
}

function shortLabel(appName: string): string {
  const mapped = APP_SHORT_LABELS[appName.trim().toLowerCase()]
  if (mapped) return mapped
  const clean = appName.replace(/^Google\s+/i, '').replace(/^Microsoft\s+/i, '').replace(/\.us$/i, '')
  return clean.slice(0, 9).toUpperCase()
}

const CODE_TO_KEY: Record<string, string> = {
  Space: 'space',
  Enter: 'enter',
  NumpadEnter: 'enter',
  Tab: 'tab',
  Backspace: 'delete',
  Delete: 'forwarddelete',
  Escape: 'escape',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  Equal: '=',
  Minus: '-',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`'
}

function eventToShortcutCombo(e: KeyboardEvent): string | null {
  if (['Meta', 'Shift', 'Control', 'Alt'].includes(e.key)) return null
  if (e.code.startsWith('Meta') || e.code.startsWith('Shift') || e.code.startsWith('Control') || e.code.startsWith('Alt')) return null
  const parts: string[] = []
  if (e.metaKey) parts.push('cmd')
  if (e.ctrlKey) parts.push('ctrl')
  if (e.altKey) parts.push('opt')
  if (e.shiftKey) parts.push('shift')

  let keyName: string | undefined
  if (/^Key[A-Z]$/.test(e.code)) {
    keyName = e.code.slice(3).toLowerCase()
  } else if (/^Digit[0-9]$/.test(e.code)) {
    keyName = e.code.slice(5)
  } else if (/^F([1-9]|1[0-2])$/.test(e.code)) {
    keyName = e.code.toLowerCase()
  } else if (CODE_TO_KEY[e.code]) {
    keyName = CODE_TO_KEY[e.code]
  } else if (e.key && e.key.length === 1) {
    keyName = e.key.toLowerCase()
  }
  if (!keyName) return null
  parts.push(keyName)
  return parts.join('+')
}

function knobActionsMatch(a: KnobActions | null | undefined, b: KnobActions | null): boolean {
  const norm = (x: KnobActions | null | undefined) =>
    JSON.stringify({
      cw: x?.cw ?? null,
      ccw: x?.ccw ?? null,
      click: x?.click ?? null
    })
  return norm(a) === norm(b)
}

function formatShortcutDisplay(keys: string): string {
  if (!keys) return 'None'
  const lower = keys.trim().toLowerCase()
  const tokens = lower.endsWith('++')
    ? [...lower.slice(0, -2).split('+').map((p) => p.trim()).filter(Boolean), '+']
    : lower.split('+').map((p) => p.trim()).filter(Boolean)
  return tokens
    .map((l) => {
      if (l === 'cmd' || l === 'meta' || l === 'command') return '⌘'
      if (l === 'shift') return '⇧'
      if (l === 'opt' || l === 'alt' || l === 'option') return '⌥'
      if (l === 'ctrl' || l === 'control') return '⌃'
      if (l === 'left') return '←'
      if (l === 'right') return '→'
      if (l === 'up') return '↑'
      if (l === 'down') return '↓'
      if (l === 'space') return 'Space'
      if (l === 'enter' || l === 'return') return '↩'
      if (l === 'delete' || l === 'backspace') return '⌫'
      if (l === 'escape' || l === 'esc') return 'Esc'
      return l.toUpperCase()
    })
    .join(' ')
}
