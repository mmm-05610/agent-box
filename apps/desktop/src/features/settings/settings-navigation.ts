import type { SettingsView } from './types'

export type ProductSettingsView = 'data' | 'harnesses' | 'identities' | 'models' | 'resources'

export const ACTIVE_SETTINGS_VIEWS = [
  'product:models',
  'product:resources',
  'product:identities',
  'product:harnesses',
  'product:data',
  'appearance',
  'notifications',
  'keybinds',
  'about'
] as const satisfies readonly SettingsView[]

export const LEGACY_SETTINGS_REDIRECTS: Readonly<Record<string, (typeof ACTIVE_SETTINGS_VIEWS)[number]>> = {
  billing: 'product:identities',
  connections: 'product:harnesses',
  'config:appearance': 'appearance',
  'config:model': 'product:models',
  gateway: 'product:harnesses',
  keys: 'product:identities',
  mcp: 'product:resources',
  plugins: 'product:resources',
  providers: 'product:identities',
  sessions: 'product:data'
}

export function resolveSettingsView(view: SettingsView): (typeof ACTIVE_SETTINGS_VIEWS)[number] {
  if (view in LEGACY_SETTINGS_REDIRECTS) {
    return LEGACY_SETTINGS_REDIRECTS[view]!
  }

  if (ACTIVE_SETTINGS_VIEWS.includes(view as (typeof ACTIVE_SETTINGS_VIEWS)[number])) {
    return view as (typeof ACTIVE_SETTINGS_VIEWS)[number]
  }

  return 'product:models'
}
