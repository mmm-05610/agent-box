/**
 * Desktop app theme model.
 *
 *   colors      — Tailwind color tokens written directly to CSS vars.
 *   darkColors  — optional hand-tuned dark variant (else `colors` is reused
 *                 unchanged for dark, and a synth pass generates light).
 *   typography  — font families + optional stylesheet URL.
 *
 * Everything else (layout, sizing, radius, line-height) lives in styles.css.
 * Add new themes in `presets.ts` — no other code changes needed.
 *
 * This module is the pure core of the theme feature: plain data in, plain data
 * out, and no import of any kind. The React layer, the stores and the storage
 * all sit ABOVE it (`import-boundary.test.ts` is the tripwire).
 */

export interface DesktopThemeColors {
  background: string
  foreground: string
  card: string
  cardForeground: string
  muted: string
  mutedForeground: string
  popover: string
  popoverForeground: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  accent: string
  accentForeground: string
  border: string
  input: string
  /** Generic focus ring — buttons, inputs, etc. */
  ring: string
  /**
   * Brand-accent stroke — focus rings, streaming cursors, active session
   * pills, branded scrollbars, text selection. Falls back to `ring`.
   * Aliased to the DS `--midground` token.
   */
  midground?: string
  /** Auto-derived from `midground` luminance when omitted. */
  midgroundForeground?: string
  /** Composer outline / focus color. Falls back to `midground`. */
  composerRing?: string
  destructive: string
  destructiveForeground: string
  sidebarBackground?: string
  sidebarBorder?: string
  userBubble?: string
  userBubbleBorder?: string
}

export interface DesktopThemeTypography {
  fontSans: string
  fontMono: string
  /** Google/Bunny/self-hosted font stylesheet URL. */
  fontUrl?: string
}

/**
 * Integrated-terminal ANSI palette (xterm `ITheme`, minus `background`).
 *
 * Populated only when a converted VS Code theme ships a full `terminal.ansi*`
 * set; otherwise the terminal keeps its built-in VS Code default palette.
 * `background` is intentionally absent — the pane always paints the live skin
 * surface so it stays translucent.
 */
export interface DesktopTerminalPalette {
  foreground?: string
  cursor?: string
  /** Keeps its source alpha — xterm blends it over the surface. */
  selectionBackground?: string
  black?: string
  red?: string
  green?: string
  yellow?: string
  blue?: string
  magenta?: string
  cyan?: string
  white?: string
  brightBlack?: string
  brightRed?: string
  brightGreen?: string
  brightYellow?: string
  brightBlue?: string
  brightMagenta?: string
  brightCyan?: string
  brightWhite?: string
}

export interface DesktopTheme {
  name: string
  label: string
  description: string
  /** Light palette (also reused for dark when `darkColors` is omitted). */
  colors: DesktopThemeColors
  /** Hand-tuned dark palette. Skins like `nous` ship one. */
  darkColors?: DesktopThemeColors
  typography?: Partial<DesktopThemeTypography>
  /** Light-variant terminal ANSI palette (also the fallback for dark). */
  terminal?: DesktopTerminalPalette
  /** Dark-variant terminal ANSI palette. Falls back to `terminal`. */
  darkTerminal?: DesktopTerminalPalette
}

/**
 * A theme definition — the one shape every source produces: a built-in preset,
 * a user install, a backend skin, a plugin contribution.
 */
export type ThemeDefinition = DesktopTheme

/**
 * One theme offered to the picker as `availableThemes` and to the resolver as a
 * candidate. Built-ins, user installs, backend skins and plugin registrations
 * all arrive as this, with the same validity bar.
 */
export type ThemeContribution = DesktopTheme

/** What the user picked. `system` follows the OS appearance. */
export type ThemeMode = 'light' | 'dark' | 'system'

/** The appearance actually in effect once `system` has been decided. */
export type RenderedMode = 'light' | 'dark'

/**
 * The themes this app currently has, as plain data.
 *
 * Whoever holds the stores assembles one of these; the pure core only reads it.
 * Order and precedence between the three sources are the resolver's business.
 */
export interface ThemeSource {
  /** Themes the user installed (converted VS Code themes, imported bundles). */
  user: readonly ThemeContribution[]
  /** Skins the backend pushed. Cached so the boot paint can resolve them. */
  backend: readonly ThemeContribution[]
  /** Themes contributed through the plugin registry. */
  contributed: readonly ThemeContribution[]
}

/**
 * Everything about the native shell that has to agree with the painted palette:
 * Electron's `nativeTheme`, the titlebar, the `.dark` class and the two raw
 * keys the inline pre-paint script in index.html reads before anything loads.
 *
 * Pure data — turning it into side effects is the appearance port's job.
 */
export interface NativeAppearanceDescriptor {
  /** The mode actually painted (from the surface's luminance, not the pick). */
  renderedMode: RenderedMode
  /** Chrome background/foreground for the native titlebar. */
  titleBar: { background: string; foreground: string }
  /**
   * Electron's `nativeTheme.themeSource`. An explicit light/dark pick is forced;
   * `system` stays `system` so `prefers-color-scheme` keeps tracking the OS.
   */
  nativeThemeSource: 'system' | RenderedMode
  /** Pre-paint keys read by index.html's inline script. */
  boot: { background: string; colorScheme: RenderedMode }
  /** Font stylesheet the palette asks for, when it asks for one. */
  fontUrl?: string
}

/** A palette resolved for one mode: what to paint and how to paint it. */
export interface ResolvedTheme {
  /** The definition as painted — accent retint already applied. */
  theme: ThemeDefinition
  /** The mode in effect, with `system` already decided. */
  mode: RenderedMode
  /** The mode actually painted, from the active background's luminance. */
  renderedMode: RenderedMode
  /** The skin slug the painted variant belongs to, sans `-light`/`-dark`. */
  skinName: string
  /** Every CSS custom property the theme sets, ready to write to `:root`. */
  cssVariables: Record<string, string>
  /** The native shell's half of the same decision. */
  appearance: NativeAppearanceDescriptor
}

// The minimal set of color keys a stored theme must carry to be usable. We keep
// this loose — `applyTheme` tolerates missing optionals via fallbacks — but a
// theme with no background/foreground/primary is junk and gets dropped.
const REQUIRED_COLOR_KEYS: ReadonlyArray<keyof DesktopThemeColors> = ['background', 'foreground', 'primary']

/** Shape check for a theme read back from storage or a contribution. */
export function isValidTheme(value: unknown): value is DesktopTheme {
  if (!value || typeof value !== 'object') {
    return false
  }

  const theme = value as Partial<DesktopTheme>

  if (typeof theme.name !== 'string' || typeof theme.label !== 'string' || !theme.colors) {
    return false
  }

  const colors = theme.colors as unknown as Record<string, unknown>

  return REQUIRED_COLOR_KEYS.every(key => typeof colors[key] === 'string')
}
