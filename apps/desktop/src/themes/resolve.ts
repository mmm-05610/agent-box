/**
 * Theme resolution over plain data.
 *
 * The merged theme set arrives as a `ThemeSource` — three lists of definitions
 * from three sources — and everything here is a pure function over it. No store,
 * no registry, no gateway: whoever owns those assembles the source and hands it
 * down, which is what lets the theme core stay a leaf.
 *
 * Precedence is written down exactly once, in `listThemes`, and every later
 * lookup runs over that one merged list — so the picker and the resolver cannot
 * disagree about which theme a name means.
 */

import { BUILTIN_THEMES, DEFAULT_SKIN_NAME, nousTheme } from './presets'
import type {
  RenderedMode,
  ThemeContribution,
  ThemeDefinition,
  ThemeMode,
  ThemeSource
} from './types'

/**
 * Skins that no longer exist. A profile still pointing at one falls back to
 * `DEFAULT_SKIN_NAME` rather than painting a name nothing resolves.
 */
export const RETIRED_SKINS: ReadonlySet<string> = new Set(['nous-light', 'default', 'gold'])

/**
 * The merged set, as one ordered list: built-ins first (stable order), then
 * plugin contributions, then backend skins, then user installs.
 *
 * A name can arrive from more than one source. The winner is the same one
 * `resolve` would pick — built-in, then user install, then backend skin, then
 * contribution — so the loser's entry is filtered out rather than shown twice.
 */
export function listThemes(source: ThemeSource): ThemeContribution[] {
  const userNames = new Set(source.user.map(theme => theme.name))
  const backendNames = new Set(source.backend.map(theme => theme.name))
  const shadows = (theme: ThemeContribution) => userNames.has(theme.name) || backendNames.has(theme.name)

  return [
    ...Object.values(BUILTIN_THEMES),
    ...source.contributed.filter(theme => !shadows(theme)),
    ...source.backend.filter(theme => !userNames.has(theme.name)),
    ...source.user
  ]
}

/**
 * Resolve a theme by name in a merged list. At most one entry per name survives
 * `listThemes`, so first match wins and the list is a valid resolution input on
 * its own.
 */
export function lookupTheme(name: string, themes: readonly ThemeContribution[]): ThemeContribution | undefined {
  return themes.find(theme => theme.name === name)
}

/**
 * The definition to paint for a name.
 *
 * The default is the last rung rather than a thrown error: a name can dangle (a
 * retired skin, a backend skin that hasn't been seeded yet on this launch), and
 * a window that refuses to paint is worse than one painting the default.
 */
export function pickTheme(name: string, themes: readonly ThemeContribution[]): ThemeDefinition {
  return lookupTheme(name, themes) ?? nousTheme
}

/** A stored skin name, flattened to one the merged set resolves. */
export function normalizeSkinName(name: null | string | undefined, themes: readonly ThemeContribution[]): string {
  return name && lookupTheme(name, themes) && !RETIRED_SKINS.has(name) ? name : DEFAULT_SKIN_NAME
}

/**
 * A stored mode, or `system` when there isn't one.
 *
 * A fresh profile follows the OS. Defaulting to `light` meant someone whose
 * desktop is dark got a white window on first launch and had to go find the
 * setting — and with per-appearance translucency it also handed them light's
 * much heavier tint, tuned for a bright desktop they don't have.
 */
export function normalizeMode(value: null | string | undefined): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

/** The light/dark appearance a mode resolves to. */
export function resolveMode(mode: ThemeMode, systemDark: boolean): RenderedMode {
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
}
