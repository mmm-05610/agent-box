/**
 * Desktop theme presentation.
 *
 * This is the React layer, and it is coordinated rather than coordinating: it
 * paints what it is handed. Every question that used to be answered from inside
 * this module now arrives as a prop —
 *
 *   which profile is active   → `activeScope`
 *   what themes exist         → `availableThemes` (the merged set, picker order)
 *   what the user picked      → `preferences`
 *   is the OS dark            → `systemDark`
 *   the dev accent override   → `accentOverride`
 *   where the paint goes      → `appearance`
 *
 * — and the composition layer (`src/theme-composition/`) is what reads the
 * profile store, the plugin registry, the backend skin cache and `localStorage`
 * to produce them. The provider never resolves a scope, subscribes to a
 * registry, or writes a preference key itself; `import-boundary.test.ts` keeps
 * it that way.
 *
 * The palette math lives in `./appearance` and `./resolve`, both plain data in,
 * plain data out. Mode (light/dark/system) controls brightness; the skin
 * controls accent. The two are persisted independently. Shift+X toggles
 * light/dark — owned by the keybind runtime (`appearance.toggleMode`), not here.
 */

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { resolveAppearance } from './appearance'
import type { ThemeAppearancePort, ThemePreferences } from './ports'
import { BUILTIN_THEME_LIST, DEFAULT_SKIN_NAME, nousTheme } from './presets'
import { lookupTheme, normalizeMode, normalizeSkinName, pickTheme } from './resolve'
import type { DesktopTheme, RenderedMode, ThemeContribution, ThemeMode } from './types'

// Compatibility re-export: the authoritative definition of `ThemeMode` lives in
// `./types`, but Settings, the command palette and the keybind map import it
// from here. Those imports are a mechanical follow-up once the i18n leaf work
// lands, and this re-export goes with them.
export type { ThemeMode }

export interface ThemePresenterProps {
  children?: ReactNode
  /** The scope whose appearance is active: a profile key, or `default`. */
  activeScope: string
  /**
   * The merged theme set — every theme this window can offer, in picker order.
   * Definitions, not rows: the picker rows the context exposes are derived here,
   * and so is every lookup.
   */
  availableThemes: readonly ThemeContribution[]
  /** The committed appearance of `activeScope`, as written. */
  preferences: ThemePreferences
  /** Commit a pick for the active scope. */
  onPreferencesChange: (next: Partial<ThemePreferences>) => void
  /** A one-shot switch the backend asked for (Hermes authoring/activating a skin). */
  pendingApply: string | null
  /** The provider drained `pendingApply`; the composition clears its source. */
  onPendingApplyDrained: () => void
  /** The OS appearance, for `system`. */
  systemDark: boolean
  /** Dev-only live accent override. */
  accentOverride: string | null
  /** Where the resolved palette goes. */
  appearance: ThemeAppearancePort
}

export interface ThemeContextValue {
  theme: DesktopTheme
  themeName: string
  mode: ThemeMode
  /** The light/dark switch the user picked. */
  resolvedMode: RenderedMode
  /**
   * The mode actually painted, derived from the active background's luminance.
   * Differs from `resolvedMode` for skins that keep a bright surface in "dark"
   * (or vice-versa). Surface-bound UI (e.g. the terminal palette) should key off
   * this so it matches what's on screen instead of inverting.
   */
  renderedMode: RenderedMode
  availableThemes: Array<{ name: string; label: string; description: string }>
  setTheme: (name: string) => void
  setMode: (mode: ThemeMode) => void
  /**
   * Paint a theme with an explicit light/dark, without persistence. This is
   * the highlight preview for the palette. A commit (`setTheme`) or
   * `clearThemePreview` repaints the committed appearance.
   */
  previewTheme: (name: string, mode: RenderedMode) => void
  clearThemePreview: () => void
}

const SKIN_LIST = BUILTIN_THEME_LIST.map(({ name, label, description }) => ({ name, label, description }))

const ThemeContext = createContext<ThemeContextValue>({
  theme: nousTheme,
  themeName: DEFAULT_SKIN_NAME,
  mode: 'light',
  resolvedMode: 'light',
  renderedMode: 'light',
  availableThemes: SKIN_LIST,
  setTheme: () => {},
  setMode: () => {},
  previewTheme: () => {},
  clearThemePreview: () => {}
})

export function ThemePresenter({
  children,
  activeScope,
  availableThemes,
  preferences,
  onPreferencesChange,
  pendingApply,
  onPendingApplyDrained,
  systemDark,
  accentOverride,
  appearance
}: ThemePresenterProps) {
  // What the context hands out: the merged set projected to picker rows.
  const themeOptions = useMemo(
    () => availableThemes.map(({ name, label, description }) => ({ name, label, description })),
    [availableThemes]
  )

  // The committed pick, resolved against the CURRENT list — so a stored backend
  // skin that failed to resolve at boot paints once the gateway seeds it. The
  // raw pick itself stays in `preferences`, un-flattened.
  const committedName = useMemo(
    () => normalizeSkinName(preferences.theme, availableThemes),
    [preferences.theme, availableThemes]
  )

  const mode: ThemeMode = normalizeMode(preferences.mode)

  // Transient highlight preview (palette theme picker). It is never persisted.
  // A commit or an explicit clear returns the paint to the committed appearance.
  const [preview, setPreview] = useState<null | { name: string; mode: RenderedMode }>(null)

  const paintedName = preview ? preview.name : committedName
  const paintedMode = preview ? preview.mode : mode

  const resolved = useMemo(
    () =>
      resolveAppearance({ theme: pickTheme(paintedName, availableThemes), mode: paintedMode, systemDark, accentOverride }),
    // `availableThemes` is the reactivity for an in-place palette edit of the
    // ACTIVE skin (live theme authoring), not just a name switch.
    [paintedName, paintedMode, availableThemes, systemDark, accentOverride]
  )

  useEffect(() => {
    appearance.paint(resolved)
  }, [appearance, resolved])

  // Hand the pick up: the composition owns which scope is live and where it is
  // persisted, so these callbacks stay stable across profile switches.
  const setTheme = useCallback(
    (name: string) => {
      setPreview(null)
      onPreferencesChange({ theme: normalizeSkinName(name, availableThemes) })
    },
    [onPreferencesChange, availableThemes]
  )

  const setMode = useCallback(
    (next: ThemeMode) => {
      setPreview(null)
      onPreferencesChange({ mode: normalizeMode(next) })
    },
    [onPreferencesChange]
  )

  const previewTheme = useCallback(
    (name: string, previewMode: RenderedMode) => {
      setPreview(lookupTheme(name, availableThemes) ? { name, mode: previewMode } : null)
    },
    [availableThemes]
  )

  const clearThemePreview = useCallback(() => setPreview(null), [])

  // A highlight preview belongs to the surface that opened it. Switching scope is
  // a re-home, and the previous context must not leak into the next one.
  useEffect(() => setPreview(null), [activeScope])

  // Drain a backend-driven skin switch (Hermes authoring/activating a skin from a
  // prompt, or `/skin` on another surface). setTheme persists it per profile, so
  // the choice sticks like any manual pick.
  useEffect(() => {
    if (pendingApply) {
      setTheme(pendingApply)
      onPendingApplyDrained()
    }
  }, [pendingApply, setTheme, onPendingApplyDrained])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: resolved.theme,
      themeName: committedName,
      mode,
      resolvedMode: resolved.mode,
      renderedMode: resolved.renderedMode,
      availableThemes: themeOptions,
      setTheme,
      setMode,
      previewTheme,
      clearThemePreview
    }),
    [resolved, committedName, mode, themeOptions, setTheme, setMode, previewTheme, clearThemePreview]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = (): ThemeContextValue => useContext(ThemeContext)
