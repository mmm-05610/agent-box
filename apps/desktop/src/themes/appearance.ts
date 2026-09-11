/**
 * The palette that gets painted, as pure data.
 *
 * `resolveAppearance` is the whole of the theme's effect on the world: given a
 * definition and the appearance inputs, it returns every CSS custom property to
 * write and the native-shell decisions that have to agree with them. Turning
 * that into side effects — `:root` style, the `.dark` class, Electron's
 * `nativeTheme`, the translucency store, the pre-paint keys — is the appearance
 * port's job, so this module can stay a leaf.
 */

import { ensureContrast, harmonize, hexToRgb, mix, readableOn } from './color'
import { DEFAULT_TYPOGRAPHY, nousTheme } from './presets'
import { resolveMode } from './resolve'
import { retintTheme } from './retint'
import type {
  DesktopTheme,
  DesktopThemeColors,
  RenderedMode,
  ResolvedTheme,
  ThemeDefinition,
  ThemeMode
} from './types'

// ─── Palette derivation (for synthesised light variants of dark-only skins) ──
// hexToRgb / mix / readableOn live in ./color so the VS Code converter shares
// the exact same math.

function synthLightColors(seed: DesktopTheme): DesktopThemeColors {
  const accent = seed.colors.ring || seed.colors.primary
  const soft = mix('#ffffff', accent, 0.1)
  const softer = mix('#ffffff', accent, 0.06)
  const border = mix('#ececef', accent, 0.14)
  const midground = seed.colors.midground ?? accent

  return {
    background: '#ffffff',
    foreground: '#161616',
    card: '#ffffff',
    cardForeground: '#161616',
    muted: softer,
    mutedForeground: mix('#6b6b70', accent, 0.16),
    popover: '#ffffff',
    popoverForeground: '#161616',
    primary: accent,
    primaryForeground: readableOn(accent),
    secondary: soft,
    secondaryForeground: mix('#2a2a2a', accent, 0.34),
    accent: soft,
    accentForeground: mix('#2a2a2a', accent, 0.34),
    border,
    input: mix('#e2e2e6', accent, 0.18),
    ring: accent,
    midground,
    midgroundForeground: readableOn(midground),
    destructive: '#b94a3a',
    destructiveForeground: '#ffffff',
    sidebarBackground: mix('#fafafa', accent, 0.05),
    sidebarBorder: border,
    userBubble: soft,
    userBubbleBorder: border
  }
}

/** Returns the seed palette for a definition + mode (no overrides applied). */
export function baseColors(theme: ThemeDefinition, mode: RenderedMode): DesktopThemeColors {
  if (mode === 'dark') {
    return theme.darkColors ?? theme.colors
  }

  return theme.darkColors ? theme.colors : synthLightColors(theme)
}

/** The definition as a named light/dark variant — what a picker previews. */
export function variantOf(theme: ThemeDefinition, mode: RenderedMode): ThemeDefinition {
  return {
    ...theme,
    name: `${theme.name}-${mode}`,
    label: `${theme.label} ${mode === 'light' ? 'Light' : 'Dark'}`,
    description: `${theme.label} ${mode} palette`,
    colors: baseColors(theme, mode)
  }
}

/**
 * Some palettes intentionally keep a bright background even when
 * `mode === 'dark'`, so we shouldn't apply the `.dark` class. Decide from
 * the actual background luminance.
 */
export function renderedModeFor(colors: DesktopThemeColors, mode: RenderedMode): RenderedMode {
  const rgb = hexToRgb(colors.background)

  if (!rgb) {
    return mode
  }

  const [r, g, b] = rgb.map(v => v / 255)

  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? 'light' : 'dark'
}

// ─── CSS application ────────────────────────────────────────────────────────

// Per-mode mix knobs. Light/dark fallbacks live in styles.css `:root` /
// `:root.dark`; setting them inline keeps active-skin overrides surviving
// the boot-time paint.
// styles.css --theme-neutral-chrome — keep in sync.
const NEUTRAL_CHROME = { light: '#f3f3f3', dark: '#0d0d0e' } as const

// The one foreground --dt-primary-solid is built to carry. Fixed rather than
// measured: the surface is derived to suit IT, not the other way round.
// styles.css --dt-primary-solid-foreground fallback — keep in sync.
const PRIMARY_SOLID_FOREGROUND = '#fcfcfc'

export const chromeBackground = (background: string, isDark: boolean) =>
  mix(background, NEUTRAL_CHROME[isDark ? 'dark' : 'light'], isDark ? 0.26 : 0.08)

const mixesFor = (isDark: boolean): Record<string, string> => ({
  '--theme-mix-chrome': isDark ? '74%' : '92%',
  '--theme-mix-sidebar': '100%',
  '--theme-mix-card': isDark ? '38%' : '22%',
  '--theme-mix-elevated': isDark ? '46%' : '28%',
  '--theme-mix-bubble': isDark ? '46%' : '0%'
})

/** Every CSS custom property a painted palette sets on `:root`. */
export function cssVariablesFor(theme: ThemeDefinition, rendered: RenderedMode): Record<string, string> {
  const c = theme.colors
  const typo = { ...DEFAULT_TYPOGRAPHY, ...nousTheme.typography, ...theme.typography }
  const isDark = rendered === 'dark'
  const midground = c.midground ?? c.ring

  // Brand seeds feed every glass + shadcn token via `color-mix()` in styles.css.
  const seeds: Record<string, string> = {
    '--theme-foreground': c.foreground,
    '--theme-primary': c.primary,
    '--theme-secondary': c.secondary,
    '--theme-accent-soft': c.accent,
    '--theme-midground': midground,
    '--theme-warm': c.primary,
    '--theme-background-seed': c.background,
    '--theme-sidebar-seed': c.sidebarBackground ?? c.background,
    '--theme-card-seed': c.card,
    '--theme-elevated-seed': c.popover,
    '--theme-bubble-seed': c.userBubble ?? c.popover
  }

  // shadcn/Tailwind tokens that aren't derived from the seed chain.
  const palette: Record<string, string> = {
    '--dt-primary-foreground': c.primaryForeground,
    '--dt-secondary-foreground': c.secondaryForeground,
    '--dt-accent-foreground': c.accentForeground,
    '--dt-border': c.border,
    '--dt-input': c.input,
    '--dt-ring': c.ring,
    '--dt-muted': c.muted,
    '--dt-midground-foreground': c.midgroundForeground ?? readableOn(midground),
    // A LOUD fill of the brand colour, for the rare surface that has to read as
    // the app speaking rather than as chrome. `primary` alone can't do that job:
    // a pale accent (imported VS Code themes love a pastel pink) is a perfectly
    // valid primary, and the honest `primaryForeground` for it is near-black —
    // so the "loud" surface comes out a pastel card with dark text on it,
    // whispering. Deepening the hue until the LIGHT foreground clears AA keeps
    // one look across every theme: no-ops on an accent that is already deep,
    // and only ever darkens, so the hue survives.
    '--dt-primary-solid': ensureContrast(c.primary, PRIMARY_SOLID_FOREGROUND, 4.5),
    '--dt-primary-solid-foreground': PRIMARY_SOLID_FOREGROUND,
    '--dt-composer-ring': c.composerRing ?? midground,
    '--dt-destructive': c.destructive,
    '--dt-destructive-foreground': c.destructiveForeground,
    '--dt-sidebar-border': c.sidebarBorder ?? c.border,
    '--dt-user-bubble-border': c.userBubbleBorder ?? c.border,
    // Semantic success, bent toward the accent so it settles into the palette
    // instead of clashing with it. A green accent barely moves it (see
    // `harmonize`); a blue one turns the sidebar's finished dots teal rather
    // than leaving eight emerald spots fighting the theme.
    '--ui-success': harmonize('#10b981', midground, 0.25),
    '--dt-font-sans': typo.fontSans,
    '--dt-font-mono': typo.fontMono,
    '--noise-opacity-mul': isDark ? 'calc(0.04 / 0.21)' : 'calc(0.34 / 0.21)'
  }

  return { ...seeds, ...mixesFor(isDark), ...palette }
}

export interface AppearanceInput {
  /** The committed definition, as its name resolved. */
  theme: ThemeDefinition
  /** The mode preference in effect. `system` follows `systemDark`. */
  mode: ThemeMode
  /** The OS appearance, for `system`. */
  systemDark: boolean
  /** Dev-only live accent override; `null` paints the theme as authored. */
  accentOverride: string | null
}

/**
 * Resolve a palette for painting: the retinted variant, every CSS variable it
 * needs, and the native-shell decisions that must agree with it.
 *
 * The retint is the identity when the seed already matches, so an untouched
 * override costs nothing.
 */
export function resolveAppearance({
  theme,
  mode,
  systemDark,
  accentOverride
}: AppearanceInput): ResolvedTheme {
  const picked = resolveMode(mode, systemDark)
  const committed = variantOf(theme, picked)
  const painted = accentOverride === null ? committed : retintTheme(committed, accentOverride)
  const renderedMode = renderedModeFor(painted.colors, picked)
  const isDark = renderedMode === 'dark'
  const chrome = chromeBackground(painted.colors.background, isDark)
  const fontUrl = { ...DEFAULT_TYPOGRAPHY, ...nousTheme.typography, ...painted.typography }.fontUrl

  return {
    theme: painted,
    mode: picked,
    renderedMode,
    skinName: skinNameOf(painted, picked),
    cssVariables: cssVariablesFor(painted, renderedMode),
    appearance: {
      renderedMode,
      titleBar: { background: chrome, foreground: painted.colors.foreground },
      // An explicit light/dark pick is forced; 'system' stays 'system' so
      // prefers-color-scheme keeps tracking the OS.
      nativeThemeSource: mode === 'system' ? 'system' : renderedMode,
      boot: { background: chrome, colorScheme: renderedMode },
      ...(fontUrl ? { fontUrl } : {})
    }
  }
}

/** The slug a painted variant belongs to, without its `-light`/`-dark` suffix. */
export function skinNameOf(theme: ThemeDefinition, mode: RenderedMode): string {
  const suffix = `-${mode}`

  return theme.name.endsWith(suffix) ? theme.name.slice(0, -suffix.length) : theme.name
}
