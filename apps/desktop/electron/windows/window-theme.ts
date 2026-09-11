/**
 * composition/window-theme.ts — the native-theme + window-translucency
 * subsystem (persisted theme source, translucency state, chat window
 * surface options, titlebar overlay), extracted verbatim from main.ts.
 * main.ts mutates the two live pieces of state through the exported
 * setters when the renderer reports a theme / Settings writes a toggle.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { app, nativeTheme } from 'electron'

import { rememberLog } from '../app/log-buffer'
import { isWslEnvironment } from '../host-capabilities/platform/bootstrap-platform'

import { macTitleBarOverlayHeight } from './titlebar-overlay-width'
import {
  backgroundMaterialFor,
  defaultTranslucencyState,
  glassActive,
  glassSupportedOn,
  normalizeState as normalizeTranslucency,
  opacityNeedsSetting,
  vibrancyFor as vibrancyForTranslucency,
  windowBackingOptions,
  windowOpacityFor,
  windowOpacityOptions
} from './translucency'

const TITLEBAR_HEIGHT = 34

const IS_MAC = process.platform === 'darwin'
const IS_WINDOWS = process.platform === 'win32'
const GLASS_SUPPORTED = glassSupportedOn(process.platform, os.release())
const DARWIN_MAJOR = IS_MAC ? Number.parseInt(os.release(), 10) || 0 : 0
const IS_WSL = isWslEnvironment()

let rendererTitleBarTheme: any = null

export function setRendererTitleBarTheme(theme: any): void {
  rendererTitleBarTheme = theme
}

export function getTranslucencyState() {
  return translucencyState
}

export function setTranslucencyState(next: ReturnType<typeof readPersistedTranslucency>): void {
  translucencyState = next
}

// Force the NATIVE window appearance (vibrancy material, titlebar, the
// pre-first-paint window background) to follow the APP theme instead of the
// OS appearance. With `vibrancy` set, macOS paints an NSVisualEffectView that
// tracks the window's effective appearance and ignores `backgroundColor` —
// so a dark-themed app on a light-mode Mac flashes a white material on every
// new window until the renderer covers it. The renderer reports its mode via
// 'hermes:native-theme' ('dark' | 'light' | 'system'); we pin
// nativeTheme.themeSource to it and persist the value so cold launches paint
// correctly before the renderer has even loaded.
const NATIVE_THEME_CONFIG_PATH = path.join(app.getPath('userData'), 'native-theme.json')
export const THEME_SOURCES = new Set(['dark', 'light', 'system'])

export function readPersistedThemeSource() {
  try {
    const parsed = JSON.parse(fs.readFileSync(NATIVE_THEME_CONFIG_PATH, 'utf8'))

    if (parsed && THEME_SOURCES.has(parsed.themeSource)) {
      return parsed.themeSource
    }
  } catch {
    // Missing / malformed → follow the OS like a fresh install.
  }

  return 'system'
}

export function writePersistedThemeSource(mode) {
  try {
    fs.mkdirSync(path.dirname(NATIVE_THEME_CONFIG_PATH), { recursive: true })
    fs.writeFileSync(NATIVE_THEME_CONFIG_PATH, JSON.stringify({ themeSource: mode }, null, 2), 'utf8')
  } catch (error) {
    rememberLog(`[theme] write native theme failed: ${error.message}`)
  }
}

nativeTheme.themeSource = readPersistedThemeSource()

// Window translucency (see-through window). One lever, 0–100; 0 = off (the
// default). Two modes share the lever (see electron/translucency.ts and
// store/translucency): 'clear' maps it to the native window opacity so the
// desktop shows through the whole window; 'glass' keeps the window opaque
// and lets the renderer thin its surfaces over a platform material instead
// — a matte blur with full-contrast text. macOS uses vibrancy; Windows 11
// uses DWM acrylic/mica/tabbed. Persisted so a cold launch applies it at
// window creation, before the renderer reports its value.
// macOS + Windows only; `setOpacity` is a no-op on Linux.
const TRANSLUCENCY_CONFIG_PATH = path.join(app.getPath('userData'), 'translucency.json')

export function readPersistedTranslucency() {
  try {
    return normalizeTranslucency(JSON.parse(fs.readFileSync(TRANSLUCENCY_CONFIG_PATH, 'utf8')), GLASS_SUPPORTED)
  } catch {
    // Nothing persisted yet — a first launch. Glass ships on, so the FIRST
    // window has to be created with the glass backing already: a window born
    // opaque cannot reliably be swapped to glass afterwards (see
    // windowBackingOptions). nativeTheme is the only appearance signal main
    // has this early; the renderer's first resolved send corrects it.
    return defaultTranslucencyState(nativeTheme.shouldUseDarkColors ? 'dark' : 'light', GLASS_SUPPORTED, IS_WINDOWS)
  }
}

export function writePersistedTranslucency(state) {
  try {
    fs.mkdirSync(path.dirname(TRANSLUCENCY_CONFIG_PATH), { recursive: true })
    fs.writeFileSync(TRANSLUCENCY_CONFIG_PATH, JSON.stringify(state, null, 2), 'utf8')
  } catch (error) {
    rememberLog(`[translucency] write failed: ${error.message}`)
  }
}

let translucencyState = readPersistedTranslucency()

// Chat windows whose webContents backing follows translucency (primary,
// instance peers, session windows). The HUD / pet overlay / quick entry /
// wake indicator are `transparent: true` windows that own their backgrounds —
// painting a themed backing onto them would turn them into opaque rectangles.
export const translucencyBackedWindows = new WeakSet()

// Set a live window's native opacity, but only when the state asks it to fade
// — or when the window is already faded and is on its way back to opaque. The
// window's own opacity is the record of whether that door was ever opened; see
// opacityNeedsSetting for why it matters that it stays shut.
export function applyWindowOpacity(win) {
  const opacity = windowOpacityFor(translucencyState)

  if (typeof win.setOpacity === 'function' && opacityNeedsSetting(opacity, win.getOpacity?.() ?? 1)) {
    win.setOpacity(opacity)
  }
}

// Re-apply translucency to a live window (runtime toggle, no recreation).
// Opacity goes through applyWindowOpacity, which knows when the call is worth
// making at all. The backing swap is the glass half: Chromium composites the
// page against the window backing BEFORE the OS composites the window, so
// glass needs the backing dropped for the platform material to reach it, and
// every other state needs the opaque themed backing (anti-flash, and it is
// what makes clear mode fade to the desktop instead of to black).
//
// `changed` says which native properties actually need touching. Dragging the
// intensity slider emits ~100 updates, and in glass mode NONE of them change
// anything native — the tint is painted by the renderer and windowOpacityFor
// answers off `fade`, not `intensity`, there. Re-issuing setVibrancy on every
// tick restarts its 150ms animation before macOS can settle the material,
// which reads as jank and flattens the frost levels into each other. Windows
// setBackgroundMaterial is instantaneous but still skipped on tint-only ticks.
// The glass Fade lever is the one glass drag that does reach main, and it
// costs exactly what a Clear drag costs: one setOpacity.
//
// CAUTION (measured, macOS 26 / Electron 40): a runtime
// setBackgroundColor('#00000000') is silently LOST on a window whose
// compositor hasn't been up for a few seconds — including calls from
// 'ready-to-show' and 'did-finish-load'. Cold launches therefore must not
// rely on this path: windows are BORN with the right backing
// (windowBackingOptions at each creation site). This path only has to cover
// live toggles from Settings, where the window is long settled.
export function applyWindowTranslucency(win, changed = { backing: true, material: true, opacity: true }) {
  if (!win || win.isDestroyed()) {
    return
  }

  try {
    // Backing swap + material are scoped to registered chat windows (see
    // translucencyBackedWindows above).
    if (translucencyBackedWindows.has(win)) {
      if (changed.backing && typeof win.setBackgroundColor === 'function') {
        win.setBackgroundColor(glassActive(translucencyState) ? '#00000000' : getWindowBackgroundColor())
      }

      if (changed.material) {
        // Glass frost level = the platform material. Animate the macOS hop so
        // a deliberate frost switch feels continuous — which only works if we
        // don't re-issue it on unrelated updates. Windows has no equivalent
        // animation option; setBackgroundMaterial is instantaneous.
        if (IS_MAC && typeof win.setVibrancy === 'function') {
          win.setVibrancy(vibrancyForTranslucency(translucencyState), { animationDuration: 150 })
        }

        if (IS_WINDOWS && GLASS_SUPPORTED && typeof win.setBackgroundMaterial === 'function') {
          win.setBackgroundMaterial(backgroundMaterialFor(translucencyState))
        }
      }
    }

    if (changed.opacity) {
      applyWindowOpacity(win)
    }
  } catch (error) {
    rememberLog(`[translucency] apply failed: ${error.message}`)
  }
}

// Constructor options every chat window shares for its translucency surface:
// the platform material, the webContents backing, and a native opacity only if
// the state actually fades — all under the CURRENT state. Glass omits
// backgroundColor so the material shows from the first frame (Electron hands a
// translucent window a transparent default backing, and runtime swaps are lost
// early in a window's life — see applyWindowTranslucency); otherwise the opaque
// themed anti-flash backing.
//
// Call sites also register the window in translucencyBackedWindows so a live
// toggle can re-apply. The HUD, pet overlay, quick entry and wake indicator
// are `transparent: true` windows that own their backgrounds and are
// deliberately not chat windows.
export function chatWindowSurfaceOptions() {
  return {
    vibrancy: IS_MAC ? vibrancyForTranslucency(translucencyState) : undefined,
    // Pin the material to its ACTIVE appearance: several NSVisualEffectView
    // materials collapse to a shared inactive look when the window blurs
    // (measured on macOS 26: sidebar, popover and under-window composited
    // pixel-identically once unfocused), which would quietly erase the
    // user's frost choice whenever they click elsewhere. Only observable
    // under glass — everywhere else the page buries the material.
    visualEffectState: IS_MAC ? ('active' as const) : undefined,
    // NOT `transparent: true` on Windows. The backdrop material already makes
    // the window translucent on its own: `IsTranslucent` answers yes off
    // `background_material_` alone, which is what gives the page its transparent
    // default backing, and `SetBackgroundMaterial` flips widget translucency
    // live, so a Clear→Glass toggle needs no recreate either way. Its one gate
    // is a frameless window, and `titleBarStyle: 'hidden'` already makes
    // `has_frame()` false here.
    //
    // What `transparent` adds on top is permanent and unwanted: it pins the
    // widget to kTranslucent for the window's whole life, so even glass-OFF
    // windows pay a DirectComposition redraw per frame (electron#39895), and it
    // opts into the documented transparent-window limits — including that a
    // RESIZABLE transparent window is unsupported and breaks (electron#48421).
    // Every chat window is resizable.
    backgroundMaterial: IS_WINDOWS && GLASS_SUPPORTED ? backgroundMaterialFor(translucencyState) : undefined,
    ...windowOpacityOptions(translucencyState),
    ...windowBackingOptions(translucencyState, getWindowBackgroundColor())
  }
}

export function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

// Background color to paint a window with BEFORE its renderer loads, so a new
// (or reopened) window doesn't flash white/light in dark mode. Prefer the theme
// the renderer last reported; fall back to the OS preference on first launch.
export function getWindowBackgroundColor() {
  if (rendererTitleBarTheme && isHexColor(rendererTitleBarTheme.background)) {
    return rendererTitleBarTheme.background
  }

  return nativeTheme.shouldUseDarkColors ? '#111111' : '#f7f7f7'
}

// Transparent WCO — renderer chrome shows through. rgba(0,0,0,0) can fall back
// to GetFrameColor() on some Electron builds; rgba(1,0,0,0) is the escape hatch.
const TITLEBAR_OVERLAY_COLOR = 'rgba(1, 0, 0, 0)'

export function getTitleBarOverlayOptions() {
  if (IS_MAC) {
    // Tahoe (Darwin 25+) misplaces the traffic lights when the overlay has a
    // nonzero height (electron#49183); 0 there keeps them at the configured
    // inset. See macTitleBarOverlayHeight.
    return { height: macTitleBarOverlayHeight({ darwinMajor: DARWIN_MAJOR, titlebarHeight: TITLEBAR_HEIGHT }) }
  }

  // WSLg paints WCO via the RDP host's own min/max/close, so requesting
  // an Electron overlay there just leaves a dead gap. Plain Linux (KDE,
  // GNOME) can use the native overlay — let it through.
  if (!IS_WINDOWS && IS_WSL) {
    return false
  }

  return {
    color: TITLEBAR_OVERLAY_COLOR,
    height: TITLEBAR_HEIGHT,
    symbolColor:
      rendererTitleBarTheme && isHexColor(rendererTitleBarTheme.foreground)
        ? rendererTitleBarTheme.foreground
        : nativeTheme.shouldUseDarkColors
          ? '#f7f7f7'
          : '#242424'
  }
}

// Push refreshed overlay options to a live window after a theme/appearance
// change. No-op only on plain (non-WSL) Linux, where getTitleBarOverlayOptions()
// returns false; the try/catch additionally guards builds where
// setTitleBarOverlay isn't supported.
export function applyTitleBarOverlay(win) {
  const options = getTitleBarOverlayOptions()

  if (!options || typeof options !== 'object') {
    return
  }

  try {
    win?.setTitleBarOverlay?.(options)
  } catch {
    // Overlay not supported on this platform/build — leave the frameless
    // titlebar as-is.
  }
}
