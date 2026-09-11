/**
 * What the theme React layer is allowed to ask of the app.
 *
 * Each port replaces one edge the presenter used to hold upward: the profile
 * store (which scope is active), `localStorage` (where the pick lives),
 * `setAppearance` (the native window), the plugin registry and the backend skin
 * cache (where themes come from). The presenter takes values and capabilities;
 * the composition layer owns the sources.
 */

import type { ResolvedTheme, ThemeMode } from './types'

/** The committed appearance of one scope, as the user wrote it. */
export interface ThemePreferences {
  /**
   * The pick as written, un-normalized: a name nothing resolves YET (a backend
   * skin the gateway hasn't seeded on this launch) must survive to be painted
   * once the registry can resolve it, instead of being flattened to the default.
   */
  theme: string
  mode: ThemeMode
}

/**
 * Where a scope's appearance lives, and how a peer window's write reaches this
 * one. Every desktop window is another renderer on the same origin, so a switch
 * made in the HUD only ever repainted the window it was made in.
 */
export interface ThemePreferencePort {
  /** The committed preferences of `scope`. */
  read(scope: string): ThemePreferences
  /**
   * Persist a pick for `scope`. `default` is not a profile — it *is* the legacy
   * global slot, so it writes the global value every unassigned profile inherits.
   */
  assign(scope: string, next: Partial<ThemePreferences>): void
  /** Subscribe to peer-window writes; returns the unsubscribe. */
  subscribe(onChange: () => void): () => void
}

/**
 * Where a resolved palette goes: `:root` custom properties, the `.dark` class,
 * Electron's native window chrome, the translucency store, and the raw
 * pre-paint keys index.html's inline script reads on a brand-new window.
 */
export interface ThemeAppearancePort {
  paint(resolved: ResolvedTheme): void
}
