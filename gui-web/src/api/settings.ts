/**
 * Settings API — Read/write GUI settings (stored on Windows side)
 *
 * Settings file: %APPDATA%/agent-box/gui-settings.json
 */

import { call } from '@/lib/bridge'

export interface GuiSettings {
  projects_dir: string
}

/**
 * Load GUI settings.
 */
export async function getSettings(): Promise<GuiSettings> {
  return call<GuiSettings>((api) => api.get_settings(), {
    projects_dir: '~/projects',
  })
}

/**
 * Save GUI settings (partial update, merges with existing).
 */
export async function saveSettings(settings: Partial<GuiSettings>): Promise<GuiSettings> {
  return call<GuiSettings>(
    (api) => api.save_settings(JSON.stringify(settings)),
    { projects_dir: '~/projects' },
  )
}
