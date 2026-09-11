// IPC surface extracted from main.ts. Channel names, payloads and error
// semantics unchanged; state authority stays with main.ts via this deps object.

import {
  BrowserWindow,
  ipcMain,
  nativeTheme
} from 'electron'

import {
  applyTitleBarOverlay,
  applyWindowTranslucency,
  getTranslucencyState,
  isHexColor,
  setRendererTitleBarTheme,
  setTranslucencyState,
  THEME_SOURCES,
  writePersistedThemeSource
} from '../windows/window-theme'
import {
  glassActive,
  normalizeState as normalizeTranslucency,
  vibrancyFor as vibrancyForTranslucency,
  windowOpacityFor
} from '../windows/translucency'

export interface RegisterThemeIpcDeps {
  GLASS_SUPPORTED: any
  TRANSLUCENCY_SUPPORTED: any
  hudIpc: any
  scheduleTranslucencyWrite: any
}

export function registerThemeIpc({ GLASS_SUPPORTED, TRANSLUCENCY_SUPPORTED, hudIpc, scheduleTranslucencyWrite }: RegisterThemeIpcDeps) {
ipcMain.on('hermes:titlebar-theme', (_event, payload) => {
  if (!payload || !isHexColor(payload.background) || !isHexColor(payload.foreground)) {
    return
  }

  setRendererTitleBarTheme({
    background: payload.background,
    foreground: payload.foreground
  })

  // Repaint the native (Windows/Linux) titlebar overlay on every open chat
  // window, not just the primary — instance peers and session windows share the
  // one app theme. applyTitleBarOverlay no-ops on the frameless pet overlay.
  for (const win of BrowserWindow.getAllWindows()) {
    applyTitleBarOverlay(win)
  }
})

ipcMain.on('hermes:native-theme', (_event, mode) => {
  if (!THEME_SOURCES.has(mode)) {
    return
  }

  if (nativeTheme.themeSource !== mode) {
    nativeTheme.themeSource = mode
    writePersistedThemeSource(mode)
  }
})

ipcMain.on('hermes:translucency:support', event => {
  event.returnValue = { glass: GLASS_SUPPORTED, translucency: TRANSLUCENCY_SUPPORTED }
})

ipcMain.on('hermes:launch-flags', event => {
  event.returnValue = {
    localModels: process.argv.includes('--local') || process.platform === 'win32' || process.platform === 'darwin'
  }
})

ipcMain.on('hermes:translucency', (_event, payload) => {
  const next = normalizeTranslucency(payload, GLASS_SUPPORTED)
  const previous = getTranslucencyState()

  if (
    next.intensity === previous.intensity &&
    next.fade === previous.fade &&
    next.mode === previous.mode &&
    next.material === previous.material &&
    next.scope === previous.scope
  ) {
    return
  }

  setTranslucencyState(next)

  // Which native properties actually moved. `scope` is renderer-only (which
  // surfaces thin), so it never appears here.
  const changed = {
    // The backing follows whether glass is ON, not the intensity behind it.
    backing: glassActive(previous) !== glassActive(next),
    material: vibrancyForTranslucency(previous) !== vibrancyForTranslucency(next),
    opacity: windowOpacityFor(previous) !== windowOpacityFor(next)
  }

  scheduleTranslucencyWrite()

  // The HUD's frost reads the same setting but answers on its own terms (see
  // hudFrostFor) — and it is a transparent window, so it is deliberately not
  // in the chat fan-out below. It self-diffs, so an unrelated change costs
  // nothing native.
  hudIpc.applyHudFrost()

  if (changed.backing || changed.material || changed.opacity) {
    for (const win of BrowserWindow.getAllWindows()) {
      applyWindowTranslucency(win, changed)
    }
  }
})
}
