import type { IconComponent } from '@/lib/icons'

import type { SettingsView } from './types'

/** Appearance is the ONLY settings surface the palette searches: querying
 *  legacy runtime config, credentials, plugins or MCP from here would make
 *  opening the palette a hidden fallback to retired pages (see
 *  `use-settings-search.ts`). The ids stay shared so the page and the search
 *  entries cannot drift. */
export const APPEARANCE_SETTING_IDS = {
  backdrop: 'appearance.backdrop',
  embeds: 'appearance.embeds',
  introSplash: 'appearance.intro-splash',
  language: 'appearance.language',
  theme: 'appearance.theme',
  toolView: 'appearance.tool-view',
  translucency: 'appearance.translucency',
  uiScale: 'appearance.ui-scale',
  userBubble: 'appearance.user-bubble'
} as const

export interface SettingsSearchTarget {
  setting?: string
  view: SettingsView
}

export interface SettingsSearchEntry {
  context: string
  description?: string
  icon: IconComponent
  id: string
  keywords: string[]
  label: string
  target: SettingsSearchTarget
}

/** Serialize a search target to the Settings route's query string. */
export function settingsSearchTargetQuery(target: SettingsSearchTarget): string {
  const params = new URLSearchParams()

  params.set('tab', target.view)

  if (target.setting) {
    params.set('setting', target.setting)
  }

  return params.toString()
}
