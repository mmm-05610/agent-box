/**
 * The theme leaf's public surface.
 *
 * Core, pure types, pure algorithms, and the presenter — nothing else. Every
 * product integration the theme feature needs (backend skins, user installs,
 * plugin contributions, the storage-backed preference, the dev accent atom, the
 * Electron marketplace, the imperative switch door, the `/skin` verb) lives in
 * `@/application/theme` and is imported from there by path.
 *
 * The split is enforced by `import-boundary.test.ts`: no module under `themes/`
 * may import a `@/…` or `@hermes/…` product module, so this barrel cannot
 * re-export one without failing the suite.
 */

export { ThemePresenter, useTheme } from './context'
export { BUILTIN_THEME_LIST, BUILTIN_THEMES, DEFAULT_SKIN_NAME } from './presets'
export type {
  DesktopTheme,
  DesktopThemeColors,
  DesktopThemeTypography,
  NativeAppearanceDescriptor,
  RenderedMode,
  ResolvedTheme,
  ThemeContribution,
  ThemeDefinition,
  ThemeMode,
  ThemeSource
} from './types'
