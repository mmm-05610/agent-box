/**
 * GUI settings — persisted in browser localStorage.
 *
 * Pure frontend preferences (theme, projects_dir mirror). The *source of
 * truth* for projects_dir is the backend (gui-settings.json via
 * useProjectsDir — localStorage on a file:// origin is not reliable); this
 * mirror keeps the value for the immediate session. The constant below is
 * an empty fallback, not a hardcoded path.
 */

export type Theme = 'system' | 'light' | 'dark'

export interface GuiSettings {
  projects_dir: string
  theme: Theme
}

export const SETTINGS_KEY = 'agent-box-settings'

export const DEFAULT_SETTINGS: GuiSettings = {
  projects_dir: '',
  theme: 'system',
}

function isTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark'
}

/** Read GUI settings, falling back to defaults when absent or invalid. */
export function readSettings(): GuiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_SETTINGS }
    }
    const rec = parsed as Record<string, unknown>
    return {
      projects_dir:
        typeof rec.projects_dir === 'string'
          ? rec.projects_dir
          : DEFAULT_SETTINGS.projects_dir,
      theme: isTheme(rec.theme) ? rec.theme : DEFAULT_SETTINGS.theme,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Merge a partial update into stored settings and persist. */
export function writeSettings(patch: Partial<GuiSettings>): GuiSettings {
  const next = { ...readSettings(), ...patch }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  return next
}
