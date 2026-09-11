/**
 * Where a resolved palette goes.
 *
 * The theme core decides *what* to paint; this is the only place that knows the
 * app's surfaces for it — `:root` custom properties, the `.dark` class, the
 * Electron native window chrome, the translucency store, the pending font
 * stylesheet, and the two raw keys index.html's inline script reads before any
 * module loads.
 *
 * Keeping the side effects here is what lets the presenter be coordinated: it
 * hands over a `ResolvedTheme` and never touches a store or the native bridge.
 */

import { setAppearance } from '@/store/translucency'
import type { ThemeAppearancePort } from '@/themes/ports'
import type { ResolvedTheme } from '@/themes/types'

// Stylesheet URLs already linked into this document. A module-level set, not
// state: the same palette repainted must not re-request its font.
const INJECTED_FONT_URLS = new Set<string>()

function paintResolved(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement

  root.style.setProperty('color-scheme', resolved.renderedMode)
  root.dataset.hermesTheme = resolved.skinName
  root.dataset.hermesMode = resolved.renderedMode
  root.classList.toggle('dark', resolved.renderedMode === 'dark')

  for (const [key, value] of Object.entries(resolved.cssVariables)) {
    root.style.setProperty(key, value)
  }

  // Translucency is tuned per appearance, and "appearance" means the palette
  // actually painted — a skin that keeps a bright surface in "dark" wants
  // light's tint. Publishing from the theme paint covers the boot frame too, so
  // the very first resolved state main is told about is already the right one.
  setAppearance(resolved.renderedMode)

  const { titleBar, nativeThemeSource, boot, fontUrl } = resolved.appearance

  // Native window chrome: macOS vibrancy material, titlebar, and — through
  // `nativeTheme` — the palette the window is born with.
  window.hermesDesktop?.setTitleBarTheme?.(titleBar)
  window.hermesDesktop?.setNativeTheme?.(nativeThemeSource)

  // Raw (non-JSON) keys read by the inline pre-paint script in index.html —
  // they let a brand-new window paint the themed background on its very first
  // frame, before this module has even loaded.
  try {
    window.localStorage.setItem('hermes-boot-background', boot.background)
    window.localStorage.setItem('hermes-boot-color-scheme', boot.colorScheme)
  } catch {
    // Storage may be unavailable (private mode / quota); the inline script
    // falls back to prefers-color-scheme.
  }

  if (fontUrl && !INJECTED_FONT_URLS.has(fontUrl)) {
    const link = document.createElement('link')

    link.rel = 'stylesheet'
    link.href = fontUrl
    link.dataset.hermesThemeFont = 'true'
    document.head.appendChild(link)
    INJECTED_FONT_URLS.add(fontUrl)
  }
}

/** The app's appearance port: `:root`, the native shell, translucency, boot keys. */
export const themeAppearance: ThemeAppearancePort = { paint: paintResolved }
