/**
 * windows/quick-entry-settings.ts
 *
 * The Quick Entry preference: read it, persist it, and apply it to the live
 * global shortcut.
 *
 * Extracted from `main.ts` (E5b). The window and shortcut are injected because
 * they are the window layer's, not this module's; what this module owns is the
 * policy, which has two edges that are easy to miss:
 *
 *  - **Disabling must not orphan the panel.** Turning the feature off closes an
 *    open always-on-top window rather than leaving a floating composer with no
 *    way to dismiss it.
 *  - **A taken or invalid chord is reported, not thrown.** The preference is still
 *    persisted and the caller still gets a state to render, so the user can pick
 *    another chord instead of losing the setting.
 */

import fs from 'node:fs'
import path from 'node:path'

import { sanitizeQuickEntrySettings } from './quick-entry'

export interface QuickEntrySettingsDeps {
  /** Push settings onto the global shortcut; returns the resulting state. */
  applyShortcut: (settings: any) => { error?: null | string; shortcut: string }
  /** Close and forget the panel (called when the feature is switched off). */
  closeWindow: () => void
  getWindow: () => null | undefined | { close: () => void; isDestroyed: () => boolean }
  log: (line: string) => void
  setWindow: (win: null) => void
}

export interface QuickEntrySettings {
  apply(settings: any): any
  read(): any
  write(settings: any): void
}

export function createQuickEntrySettings(configPath: string, deps: QuickEntrySettingsDeps): QuickEntrySettings {
  const read = () => {
    try {
      return sanitizeQuickEntrySettings(JSON.parse(fs.readFileSync(configPath, 'utf8')))
    } catch {
      // Missing / unreadable / malformed → shipped defaults (enabled, default chord).
      return sanitizeQuickEntrySettings(undefined)
    }
  }

  const write = (settings: any) => {
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true })
      fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf8')
    } catch (error: any) {
      deps.log(`[quick-entry] write failed: ${error?.message || error}`)
    }
  }

  const apply = (settings: any) => {
    const state = deps.applyShortcut(settings)

    if (!settings.enabled) {
      const win = deps.getWindow()

      if (win && !win.isDestroyed()) {
        win.close()
      }

      deps.setWindow(null)
    }

    if (state.error === 'taken') {
      deps.log(`[quick-entry] shortcut ${state.shortcut} is already taken by another application`)
    } else if (state.error === 'invalid') {
      deps.log(`[quick-entry] shortcut ${state.shortcut} is not a valid accelerator`)
    }

    return { ...state, enabled: settings.enabled }
  }

  return { apply, read, write }
}
