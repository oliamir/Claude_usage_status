# Token Deck (Embedded Deck Controller for ClaudeUsageBar)

Hardware controller and visual button/knob configurator for **Ajazz AKP03E** and **Stream Dock N3**-family USB HID decks, embedded inside `ClaudeUsageBar.app`.

## Features

- **Hardware Support:** Direct USB HID driver (`node-hid`) for Ajazz AKP03 / AKP03E / AKP03R and Stream Dock N3 devices (Protocol v2 & v3), with solid dark `#131512` ROM background clearing.
- **Visual Button & Knob Configurator:** Two-pane hardware studio UI mirroring the physical 6 LCD keys, 3 bottom page buttons, and 3 rotary knobs with drag-to-swap keys, live shortcut recording (`e.code` layout-independent), and instant hardware sync.
- **Logos for Every Shortcut:**
  - **Open App:** Extracts and caches real macOS `.app` icons (`.icns` via `sips` + `NSWorkspace` fallback).
  - **Open URL:** 24 built-in multicolor brand logos + automatic high-res site favicon caching (`favicon:<host>`).
  - **Keyboard Shortcuts, System Actions, Terminal & Pages:** 36 vector icons, quick presets, and automatic icon inference.
- **Native macOS Input Bridge:** Executes keyboard shortcuts (`CGEvent` virtual `CGKeyCode`, English & Hebrew layout-independent), media keys (`NX_KEYTYPE_*`), and instant Lock Screen (`SACLockScreenImmediate`) through `ClaudeUsageBar.app`'s localhost `NativeInputBridge` in < 1 ms.
- **Mac System Volume Knob:** Big rotary knob controls macOS output volume (`±5%`) and mute with a floating non-focus-stealing HUD and full-tile on-deck volume meter.
- **Live Claude Code Integration:** Built-in `Sessions`, `Models & Usage`, and `Agents` pages synced with `ClaudeUsageBar` OAuth usage data and Claude Code hooks.

## Development

```bash
npm install
npm test
npm run build
npx electron-builder --mac dir --arm64 -c.mac.identity=null
```

To build the unified `ClaudeUsageBar.app` bundle (with deep strict inside-out codesigning), run `../macos/scripts/build.sh`.

## Credits & License

Originally derived from [Token Deck](https://github.com/stiggio/token-deck) (MIT License, see [LICENSE](LICENSE)), heavily customized for Ajazz AKP03E hardware, custom shortcut configuration, and `ClaudeUsageBar` integration.
