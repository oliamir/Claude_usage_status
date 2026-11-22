export type SystemActionId =
  | 'vol-up'
  | 'vol-down'
  | 'vol-mute'
  | 'media-play'
  | 'media-next'
  | 'media-prev'
  | 'brightness-up'
  | 'brightness-down'
  | 'lock-screen'
  | 'screenshot-area'
  | 'screenshot-full'
  | 'mission-control'

export const SYSTEM_ACTIONS: ReadonlyArray<{
  id: SystemActionId
  label: string
  tileLabel: string
  icon: string
  color: string
  category: 'Audio' | 'Media' | 'Mac' | 'Deck'
}> = [
  { id: 'vol-up', label: 'Volume Up (+5%)', tileLabel: 'VOL +', icon: 'preset:volume', color: '#92E759', category: 'Audio' },
  { id: 'vol-down', label: 'Volume Down (-5%)', tileLabel: 'VOL -', icon: 'preset:volume-low', color: '#92E759', category: 'Audio' },
  { id: 'vol-mute', label: 'Mute / Unmute', tileLabel: 'MUTE', icon: 'preset:mute', color: '#EF6461', category: 'Audio' },
  { id: 'media-play', label: 'Play / Pause Media', tileLabel: 'PLAY', icon: 'preset:play', color: '#92E759', category: 'Media' },
  { id: 'media-next', label: 'Next Track', tileLabel: 'NEXT', icon: 'preset:next', color: '#FFFFFF', category: 'Media' },
  { id: 'media-prev', label: 'Previous Track', tileLabel: 'PREV', icon: 'preset:prev', color: '#FFFFFF', category: 'Media' },
  { id: 'screenshot-area', label: 'Screenshot Area (Clipboard)', tileLabel: 'SNAP', icon: 'preset:camera', color: '#60A5FA', category: 'Mac' },
  { id: 'screenshot-full', label: 'Screenshot Full Screen', tileLabel: 'SCREEN', icon: 'preset:monitor', color: '#60A5FA', category: 'Mac' },
  { id: 'mission-control', label: 'Mission Control', tileLabel: 'SPACES', icon: 'preset:layers', color: '#C084FC', category: 'Mac' },
  { id: 'lock-screen', label: 'Sleep Display / Lock', tileLabel: 'LOCK', icon: 'preset:lock', color: '#FBBF24', category: 'Mac' },
  { id: 'brightness-up', label: 'Deck Brightness +15%', tileLabel: 'DIM +', icon: 'preset:sun', color: '#FBBF24', category: 'Deck' },
  { id: 'brightness-down', label: 'Deck Brightness -15%', tileLabel: 'DIM -', icon: 'preset:moon', color: '#C084FC', category: 'Deck' }
]

export const ACCENT_COLORS: ReadonlyArray<{ name: string; hex: string }> = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Lime', hex: '#92E759' },
  { name: 'Sky', hex: '#60A5FA' },
  { name: 'Coral', hex: '#EF6461' },
  { name: 'Amber', hex: '#FBBF24' },
  { name: 'Violet', hex: '#C084FC' }
]

export type BrandLogoDef = {
  id: string
  name: string
  domains: string[]
  /** Full inner SVG markup for a 24x24 viewBox (multicolor brand artwork) */
  svgBody: string
}

export const BRAND_LOGOS: ReadonlyArray<BrandLogoDef> = [
  {
    id: 'claude',
    name: 'Claude',
    domains: ['claude.ai', 'anthropic.com'],
    svgBody:
      '<g fill="#D97757"><rect x="10.7" y="2" width="2.6" height="20" rx="1.3"/><rect x="10.7" y="2" width="2.6" height="20" rx="1.3" transform="rotate(45 12 12)"/><rect x="10.7" y="2" width="2.6" height="20" rx="1.3" transform="rotate(90 12 12)"/><rect x="10.7" y="2" width="2.6" height="20" rx="1.3" transform="rotate(135 12 12)"/></g>'
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    domains: ['chatgpt.com', 'openai.com'],
    svgBody:
      '<circle cx="12" cy="12" r="10" fill="#10A37F"/><path d="M12 6.2a3.3 3.3 0 0 1 3.1 2.2 3.3 3.3 0 0 1 2.3 4.8 3.3 3.3 0 0 1-2.5 4.7 3.3 3.3 0 0 1-5.8 0 3.3 3.3 0 0 1-2.5-4.7 3.3 3.3 0 0 1 2.3-4.8A3.3 3.3 0 0 1 12 6.2Z" fill="none" stroke="#FFFFFF" stroke-width="1.6"/><circle cx="12" cy="12" r="2.2" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>'
  },
  {
    id: 'github',
    name: 'GitHub',
    domains: ['github.com'],
    svgBody:
      '<path fill="#FFFFFF" d="M12 2C6.48 2 2 6.58 2 12.26c0 4.54 2.87 8.39 6.84 9.75.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.88-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.49A10.27 10.27 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z"/>'
  },
  {
    id: 'gmail',
    name: 'Gmail',
    domains: ['mail.google.com', 'gmail.com'],
    svgBody:
      '<rect x="2" y="4.5" width="20" height="15" rx="2.5" fill="#FFFFFF"/><path d="M2 7l10 6.5L22 7" fill="none" stroke="#EA4335" stroke-width="2.4" stroke-linejoin="round"/><path d="M4.2 5.2v14.3" stroke="#4285F4" stroke-width="2.6"/><path d="M19.8 5.2v14.3" stroke="#34A853" stroke-width="2.6"/>'
  },
  {
    id: 'calendar',
    name: 'Calendar',
    domains: ['calendar.google.com'],
    svgBody:
      '<rect x="3" y="3" width="18" height="18" rx="3" fill="#FFFFFF"/><path d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v3H3V6Z" fill="#4285F4"/><path d="M16 16h5v2a3 3 0 0 1-3 3h-2v-5Z" fill="#34A853"/><path d="M3 16h5v5H6a3 3 0 0 1-3-3v-2Z" fill="#FBBC05"/><path d="M8.5 11.4h3l-1.5 1.9c1.1 0 1.8.6 1.8 1.5 0 1-.8 1.7-2 1.7-.8 0-1.4-.3-1.8-.8" fill="none" stroke="#1F2937" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.2 12.1l1.3-.8v5.2" fill="none" stroke="#1F2937" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
  },
  {
    id: 'drive',
    name: 'Drive',
    domains: ['drive.google.com'],
    svgBody:
      '<polygon points="8.5,3 15.5,3 22,14.5 15,14.5" fill="#FBBC05"/><polygon points="2,14.5 8.5,3 12,9.2 5.5,20.5" fill="#34A853"/><polygon points="5.5,20.5 9,14.5 22,14.5 18.5,20.5" fill="#4285F4"/>'
  },
  {
    id: 'docs',
    name: 'Docs',
    domains: ['docs.google.com'],
    svgBody:
      '<path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="#4285F4"/><polygon points="14,2 19,7 14,7" fill="#A1C2FA"/><rect x="7" y="10.5" width="9" height="1.7" rx=".8" fill="#FFFFFF"/><rect x="7" y="14" width="9" height="1.7" rx=".8" fill="#FFFFFF"/><rect x="7" y="17.5" width="6" height="1.7" rx=".8" fill="#FFFFFF"/>'
  },
  {
    id: 'sheets',
    name: 'Sheets',
    domains: ['sheets.google.com'],
    svgBody:
      '<path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="#0F9D58"/><polygon points="14,2 19,7 14,7" fill="#87CEAC"/><rect x="7" y="10.5" width="10" height="8" rx="1" fill="none" stroke="#FFFFFF" stroke-width="1.5"/><line x1="7" y1="14.5" x2="17" y2="14.5" stroke="#FFFFFF" stroke-width="1.4"/><line x1="12" y1="10.5" x2="12" y2="18.5" stroke="#FFFFFF" stroke-width="1.4"/>'
  },
  {
    id: 'youtube',
    name: 'YouTube',
    domains: ['youtube.com', 'youtu.be'],
    svgBody:
      '<rect x="1.5" y="4.5" width="21" height="15" rx="4.2" fill="#FF0000"/><polygon points="9.8,8.5 16.5,12 9.8,15.5" fill="#FFFFFF"/>'
  },
  {
    id: 'spotify',
    name: 'Spotify',
    domains: ['spotify.com', 'open.spotify.com'],
    svgBody:
      '<circle cx="12" cy="12" r="10" fill="#1DB954"/><path d="M6.8 9.6c3.4-1 7.6-.8 10.6.9" fill="none" stroke="#111310" stroke-width="2" stroke-linecap="round"/><path d="M7.6 12.9c2.8-.8 6.2-.6 8.7.8" fill="none" stroke="#111310" stroke-width="1.7" stroke-linecap="round"/><path d="M8.4 16c2.2-.5 4.8-.4 6.8.6" fill="none" stroke="#111310" stroke-width="1.5" stroke-linecap="round"/>'
  },
  {
    id: 'slack',
    name: 'Slack',
    domains: ['slack.com'],
    svgBody:
      '<rect x="5" y="10" width="5" height="2.4" rx="1.2" fill="#E01E5A"/><rect x="10" y="4" width="2.4" height="5" rx="1.2" fill="#36C5F0"/><rect x="14" y="11.6" width="5" height="2.4" rx="1.2" fill="#2EB67D"/><rect x="11.6" y="15" width="2.4" height="5" rx="1.2" fill="#ECB22E"/><circle cx="7.5" cy="7.5" r="1.5" fill="#36C5F0"/><circle cx="16.5" cy="7.5" r="1.5" fill="#2EB67D"/><circle cx="7.5" cy="16.5" r="1.5" fill="#E01E5A"/><circle cx="16.5" cy="16.5" r="1.5" fill="#ECB22E"/>'
  },
  {
    id: 'notion',
    name: 'Notion',
    domains: ['notion.so', 'notion.site'],
    svgBody:
      '<rect x="3" y="3" width="18" height="18" rx="3.2" fill="#FFFFFF"/><path d="M8 17V7.5h2.2l3.8 5.6V7.5H16V17h-2.1L10 11.3V17H8Z" fill="#111310"/>'
  },
  {
    id: 'figma',
    name: 'Figma',
    domains: ['figma.com'],
    svgBody:
      '<path d="M8.5 2h3.5v6.7H8.5a3.35 3.35 0 0 1 0-6.7Z" fill="#F24E1E"/><path d="M12 2h3.5a3.35 3.35 0 0 1 0 6.7H12V2Z" fill="#FF7262"/><path d="M8.5 8.7H12v6.6H8.5a3.3 3.3 0 0 1 0-6.6Z" fill="#A259FF"/><circle cx="15.3" cy="12" r="3.3" fill="#1ABCFE"/><path d="M8.5 15.3H12v3.35A3.35 3.35 0 1 1 8.5 15.3Z" fill="#0ACF83"/>'
  },
  {
    id: 'linear',
    name: 'Linear',
    domains: ['linear.app'],
    svgBody:
      '<circle cx="12" cy="12" r="9.5" fill="#5E6AD2"/><line x1="6.5" y1="13.5" x2="10.5" y2="17.5" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/><line x1="6.5" y1="9.5" x2="14.5" y2="17.5" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/><line x1="9.5" y1="6.5" x2="17.5" y2="14.5" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>'
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    domains: ['web.whatsapp.com', 'whatsapp.com'],
    svgBody:
      '<circle cx="12" cy="11.5" r="9.2" fill="#25D366"/><polygon points="5,18.5 6.8,14.5 9.8,17.2" fill="#25D366"/><path d="M9.2 8.2c.3-.4.8-.4 1.1.1l.8 1.5c.2.4.1.8-.2 1.1l-.4.4c.5 1 1.4 1.9 2.4 2.4l.4-.4c.3-.3.7-.4 1.1-.2l1.5.8c.5.3.5.8.1 1.1-.7.7-1.7 1-2.8.6-2.5-.9-4.5-2.9-5.4-5.4-.4-1.1-.1-2.1.6-2.8Z" fill="#FFFFFF"/>'
  },
  {
    id: 'zoom',
    name: 'Zoom',
    domains: ['zoom.us', 'zoom.com'],
    svgBody:
      '<rect x="2" y="2" width="20" height="20" rx="5" fill="#2D8CFF"/><rect x="5.5" y="8" width="9" height="8" rx="1.8" fill="#FFFFFF"/><polygon points="15.5,10.5 19.2,8.2 19.2,15.8 15.5,13.5" fill="#FFFFFF"/>'
  },
  {
    id: 'teams',
    name: 'Teams',
    domains: ['teams.microsoft.com', 'teams.live.com'],
    svgBody:
      '<rect x="3" y="4" width="18" height="16" rx="3.5" fill="#6264A7"/><path d="M7.5 9h9v2.2h-3.3V17h-2.4v-5.8H7.5V9Z" fill="#FFFFFF"/>'
  },
  {
    id: 'x',
    name: 'X',
    domains: ['x.com', 'twitter.com'],
    svgBody:
      '<path fill="#FFFFFF" d="M4 3.5h4.2l4.1 5.7L17 3.5h2.8l-6.1 7.1 6.7 9.9h-4.2l-4.5-6.3-5.2 6.3H3.7l6.6-7.8L4 3.5Zm3.5 1.8 9.2 13.4h1.4L8.9 5.3H7.5Z"/>'
  },
  {
    id: 'chrome',
    name: 'Chrome',
    domains: ['google.com'],
    svgBody:
      '<circle cx="12" cy="12" r="10" fill="#FBBC05"/><path d="M12 2a10 10 0 0 1 8.66 5H12a5 5 0 0 0-4.33 2.5L4.2 3.6A9.96 9.96 0 0 1 12 2Z" fill="#EA4335"/><path d="M2 12a10 10 0 0 1 2.2-6.4l3.47 5.9A5 5 0 0 0 12 17l-3.47 4.4A10 10 0 0 1 2 12Z" fill="#34A853"/><circle cx="12" cy="12" r="4.8" fill="#FFFFFF"/><circle cx="12" cy="12" r="3.6" fill="#4285F4"/>'
  },
  {
    id: 'telegram',
    name: 'Telegram',
    domains: ['t.me', 'web.telegram.org', 'telegram.org'],
    svgBody:
      '<circle cx="12" cy="12" r="10" fill="#26A5E4"/><path d="M17.2 7.4 5.9 11.8c-.7.3-.7 1.1 0 1.4l2.8.9 1.1 3.3c.2.5.8.6 1.2.2l1.6-1.5 3.1 2.3c.5.4 1.3.1 1.4-.6l1.7-9.1c.1-.8-.7-1.5-1.6-1.3Z" fill="#FFFFFF"/><path d="M9.6 13.9 15.6 9.6l-4.6 5.2-.3 2.1-1.1-3Z" fill="#B9E2F8"/>'
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    domains: ['dropbox.com'],
    svgBody:
      '<polygon points="7.5,3 2,6.6 7.5,10.2 12,6.6" fill="#0061FF"/><polygon points="16.5,3 12,6.6 16.5,10.2 22,6.6" fill="#0061FF"/><polygon points="2,13.8 7.5,17.4 12,13.8 7.5,10.2" fill="#0061FF"/><polygon points="16.5,10.2 12,13.8 16.5,17.4 22,13.8" fill="#0061FF"/><polygon points="7.5,18.6 12,21.5 16.5,18.6 12,15.7" fill="#0061FF"/>'
  },
  {
    id: 'outlook',
    name: 'Outlook',
    domains: ['outlook.live.com', 'outlook.office.com', 'outlook.com'],
    svgBody:
      '<rect x="7" y="4" width="15" height="16" rx="2" fill="#28A8EA"/><path d="M7 7.5 14.5 12.5 22 7.5" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linejoin="round"/><rect x="2" y="6.5" width="11" height="11" rx="2" fill="#0078D4"/><circle cx="7.5" cy="12" r="3" fill="none" stroke="#FFFFFF" stroke-width="1.8"/>'
  },
  {
    id: 'discord',
    name: 'Discord',
    domains: ['discord.com'],
    svgBody:
      '<rect x="2" y="3" width="20" height="18" rx="5" fill="#5865F2"/><path d="M8.5 8.5c1.1-.4 2.3-.6 3.5-.6s2.4.2 3.5.6c1.2 1.2 1.9 3.1 2 5.3-.9.9-2.1 1.4-3.3 1.7l-.7-1.1c-.5.1-1 .2-1.5.2s-1-.1-1.5-.2l-.7 1.1c-1.2-.3-2.4-.8-3.3-1.7.1-2.2.8-4.1 2-5.3Z" fill="#FFFFFF"/><circle cx="9.8" cy="12" r="1.2" fill="#5865F2"/><circle cx="14.2" cy="12" r="1.2" fill="#5865F2"/>'
  },
  {
    id: 'reddit',
    name: 'Reddit',
    domains: ['reddit.com'],
    svgBody:
      '<circle cx="12" cy="12" r="10" fill="#FF4500"/><ellipse cx="12" cy="13.5" rx="6" ry="4.4" fill="#FFFFFF"/><circle cx="6.2" cy="12.2" r="1.4" fill="#FFFFFF"/><circle cx="17.8" cy="12.2" r="1.4" fill="#FFFFFF"/><path d="M12 9.1 13.3 5.5l2.7.7" fill="none" stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16.5" cy="6.3" r="1.1" fill="#FFFFFF"/><circle cx="9.8" cy="13.2" r="1" fill="#FF4500"/><circle cx="14.2" cy="13.2" r="1" fill="#FF4500"/><path d="M9.8 15.6c.7.6 1.5.8 2.2.8s1.5-.2 2.2-.8" fill="none" stroke="#FF4500" stroke-width="1.2" stroke-linecap="round"/>'
  }
]

export const URL_PRESETS: ReadonlyArray<{ label: string; url: string; icon: string }> = [
  { label: 'Claude.ai', url: 'https://claude.ai', icon: 'brand:claude' },
  { label: 'ChatGPT', url: 'https://chatgpt.com', icon: 'brand:chatgpt' },
  { label: 'GitHub', url: 'https://github.com', icon: 'brand:github' },
  { label: 'Gmail', url: 'https://mail.google.com', icon: 'brand:gmail' },
  { label: 'Calendar', url: 'https://calendar.google.com', icon: 'brand:calendar' },
  { label: 'Drive', url: 'https://drive.google.com', icon: 'brand:drive' },
  { label: 'YouTube', url: 'https://youtube.com', icon: 'brand:youtube' },
  { label: 'Notion', url: 'https://notion.so', icon: 'brand:notion' },
  { label: 'Figma', url: 'https://figma.com', icon: 'brand:figma' },
  { label: 'Slack', url: 'https://app.slack.com', icon: 'brand:slack' },
  { label: 'Linear', url: 'https://linear.app', icon: 'brand:linear' },
  { label: 'X', url: 'https://x.com', icon: 'brand:x' }
]

export const SHORTCUT_PRESETS: ReadonlyArray<{
  label: string
  tileLabel: string
  keys: string
  icon: string
  color: string
}> = [
  { label: 'Copy (⌘C)', tileLabel: 'COPY', keys: 'cmd+c', icon: 'preset:copy', color: '#60A5FA' },
  { label: 'Paste (⌘V)', tileLabel: 'PASTE', keys: 'cmd+v', icon: 'preset:paste', color: '#92E759' },
  { label: 'Undo (⌘Z)', tileLabel: 'UNDO', keys: 'cmd+z', icon: 'preset:undo', color: '#FBBF24' },
  { label: 'Spotlight (⌘Space)', tileLabel: 'SEARCH', keys: 'cmd+space', icon: 'preset:search', color: '#60A5FA' },
  { label: 'Screenshot (⌘⇧4)', tileLabel: 'SNAP', keys: 'cmd+shift+4', icon: 'preset:camera', color: '#C084FC' },
  { label: 'Zoom Mute (⌘⇧A)', tileLabel: 'MIC', keys: 'cmd+shift+a', icon: 'preset:mic-off', color: '#EF6461' },
  { label: 'New Tab (⌘T)', tileLabel: 'NEW TAB', keys: 'cmd+t', icon: 'preset:tabs', color: '#92E759' },
  { label: 'Close Tab (⌘W)', tileLabel: 'CLOSE', keys: 'cmd+w', icon: 'preset:close', color: '#EF6461' },
  { label: 'Reload (⌘R)', tileLabel: 'RELOAD', keys: 'cmd+r', icon: 'preset:refresh', color: '#60A5FA' },
  { label: 'Switch App (⌘Tab)', tileLabel: 'SWITCH', keys: 'cmd+tab', icon: 'preset:window', color: '#FFFFFF' },
  { label: 'Emoji (⌃⌘Space)', tileLabel: 'EMOJI', keys: 'ctrl+cmd+space', icon: 'preset:emoji', color: '#FBBF24' },
  { label: 'Lock (⌃⌘Q)', tileLabel: 'LOCK', keys: 'ctrl+cmd+q', icon: 'preset:lock', color: '#FBBF24' }
]

export const TERMINAL_PRESETS: ReadonlyArray<{
  label: string
  tileLabel: string
  command: string
  icon: string
  color: string
  terminal: boolean
}> = [
  { label: 'Claude Code', tileLabel: 'CLAUDE', command: 'claude', icon: 'brand:claude', color: '#FFFFFF', terminal: true },
  { label: 'Git Status', tileLabel: 'GIT', command: 'git status', icon: 'brand:github', color: '#FFFFFF', terminal: true },
  { label: 'Dev Server', tileLabel: 'DEV', command: 'npm run dev', icon: 'preset:rocket', color: '#92E759', terminal: true },
  { label: 'New Shell', tileLabel: 'SHELL', command: 'zsh', icon: 'preset:terminal', color: '#92E759', terminal: true }
]

export type PresetIconDef = {
  id: string
  name: string
  paths: string
}

export const PRESET_ICONS: ReadonlyArray<PresetIconDef> = [
  { id: 'copy', name: 'Copy', paths: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' },
  { id: 'paste', name: 'Paste', paths: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>' },
  { id: 'undo', name: 'Undo', paths: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>' },
  { id: 'search', name: 'Search', paths: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' },
  { id: 'tabs', name: 'New Tab', paths: '<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="9" y1="12" x2="15" y2="12"/>' },
  { id: 'close', name: 'Close', paths: '<rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>' },
  { id: 'refresh', name: 'Reload', paths: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>' },
  { id: 'window', name: 'Window', paths: '<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/>' },
  { id: 'emoji', name: 'Emoji', paths: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>' },
  { id: 'mic-off', name: 'Mic Mute', paths: '<line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" y1="19" x2="12" y2="22"/>' },
  { id: 'mic', name: 'Mic', paths: '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>' },
  { id: 'save', name: 'Save', paths: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>' },
  { id: 'terminal', name: 'Terminal', paths: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>' },
  { id: 'code', name: 'Code', paths: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>' },
  { id: 'sparkles', name: 'AI', paths: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>' },
  { id: 'globe', name: 'Web', paths: '<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/>' },
  { id: 'chat', name: 'Chat', paths: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
  { id: 'mail', name: 'Mail', paths: '<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>' },
  { id: 'calendar', name: 'Calendar', paths: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
  { id: 'folder', name: 'Folder', paths: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' },
  { id: 'play', name: 'Play', paths: '<polygon points="6 4 20 12 6 20 6 4"/>' },
  { id: 'next', name: 'Next', paths: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>' },
  { id: 'prev', name: 'Prev', paths: '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>' },
  { id: 'music', name: 'Music', paths: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' },
  { id: 'volume', name: 'Volume', paths: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/>' },
  { id: 'volume-low', name: 'Vol Down', paths: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>' },
  { id: 'mute', name: 'Mute', paths: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>' },
  { id: 'camera', name: 'Camera', paths: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>' },
  { id: 'monitor', name: 'Screen', paths: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>' },
  { id: 'layers', name: 'Spaces', paths: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>' },
  { id: 'lock', name: 'Lock', paths: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>' },
  { id: 'rocket', name: 'Launch', paths: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>' },
  { id: 'bolt', name: 'Action', paths: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
  { id: 'sun', name: 'Bright', paths: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>' },
  { id: 'moon', name: 'Dim', paths: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' },
  { id: 'link', name: 'Link', paths: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' }
]

export function brandLogoSvg(id: string, size = 28): string | null {
  const clean = id.replace(/^brand:/, '')
  const def = BRAND_LOGOS.find((logo) => logo.id === clean)
  if (!def) return null
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${def.svgBody}</svg>`
}

export function presetIconSvg(id: string, color = '#ffffff', size = 28): string | null {
  const clean = id.replace(/^preset:/, '')
  const def = PRESET_ICONS.find((icon) => icon.id === clean)
  if (!def) return null
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${def.paths}</svg>`
}

export function inferLogoForUrl(rawUrl: string): string | null {
  try {
    const withProto = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    const host = new URL(withProto).hostname.toLowerCase().replace(/^www\./, '')
    if (!host || !host.includes('.')) return null
    for (const logo of BRAND_LOGOS) {
      if (logo.domains.some((d) => host === d || host.endsWith(`.${d}`))) {
        return `brand:${logo.id}`
      }
    }
    return `favicon:${host}`
  } catch {
    return null
  }
}

export function inferIconForShortcut(keys: string): { icon: string; color: string; label?: string } | null {
  const norm = keys.toLowerCase().replace(/\s+/g, '')
  const exact = SHORTCUT_PRESETS.find((p) => p.keys === norm)
  if (exact) return { icon: exact.icon, color: exact.color, label: exact.tileLabel }
  if (norm.endsWith('+f') || norm.endsWith('+space')) return { icon: 'preset:search', color: '#60A5FA' }
  if (norm.endsWith('+s')) return { icon: 'preset:save', color: '#92E759' }
  if (norm.endsWith('+c')) return { icon: 'preset:copy', color: '#60A5FA' }
  if (norm.endsWith('+v')) return { icon: 'preset:paste', color: '#92E759' }
  if (norm.endsWith('+z')) return { icon: 'preset:undo', color: '#FBBF24' }
  if (norm.endsWith('+r')) return { icon: 'preset:refresh', color: '#60A5FA' }
  if (norm.endsWith('+w')) return { icon: 'preset:close', color: '#EF6461' }
  if (norm.endsWith('+t')) return { icon: 'preset:tabs', color: '#92E759' }
  if (norm.endsWith('+tab')) return { icon: 'preset:window', color: '#FFFFFF' }
  return null
}

export function inferLogoForShell(command: string): string | null {
  const first = command.trim().toLowerCase().split(/\s+/)[0] || ''
  if (!first) return null
  if (first === 'claude') return 'brand:claude'
  if (first === 'codex') return 'brand:chatgpt'
  if (first === 'git' || first === 'gh') return 'brand:github'
  if (['npm', 'npx', 'pnpm', 'yarn', 'bun', 'cargo', 'make'].includes(first)) return 'preset:rocket'
  if (['docker', 'kubectl', 'k9s'].includes(first)) return 'preset:layers'
  if (['python', 'python3', 'node', 'deno', 'ruby', 'go', 'swift', 'code', 'cursor', 'nvim', 'vim'].includes(first)) return 'preset:code'
  return null
}
