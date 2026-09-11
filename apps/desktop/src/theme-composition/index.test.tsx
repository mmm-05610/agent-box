import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { registry } from '@/contrib/registry'
import { $activeGatewayProfile } from '@/store/profile'
import { $appearance } from '@/store/translucency'
import { useTheme } from '@/themes/context'
import { BUILTIN_THEMES, everforestTheme, midnightTheme } from '@/themes/presets'
import type { DesktopTheme } from '@/themes/types'

import { $accentOverride } from './adapters/accent-override'
import { __resetBackendSkinSync, ingestBackendSkin } from './adapters/backend-sync'
import {
  LAST_PROFILE_KEY,
  MODE_KEY,
  modePref,
  PROFILE_MODES_KEY,
  PROFILE_SKINS_KEY,
  SKIN_KEY,
  skinPref
} from './adapters/preferences'
import { installUserTheme, THEMES_AREA } from './adapters/user-themes'
import { paintStoredAppearance } from './boot'

import { ThemeProvider } from '.'

// The composition root is where the theme feature meets the app: the profile
// store, the plugin registry, the backend skin cache, storage, the translucency
// store and the native bridge. These tests drive that real path end to end —
// the presenter's own contract is `@/themes/context.test.tsx`, and the palette
// math is `@/themes/appearance.test.ts`.

const cssVar = (name: string) => window.document.documentElement.style.getPropertyValue(name)

const native: Array<{ themeSource: string }> = []
const titleBars: Array<{ background: string; foreground: string }> = []

let ctx: ReturnType<typeof useTheme>

function Probe() {
  ctx = useTheme()

  return null
}

const renderThemed = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  )

// The live-authoring loop: Hermes writes/edits one skin file and every surface
// repaints. An in-place edit keeps the NAME — only the palette moves.
const bloomberg = (foreground: string) => ({
  name: 'bloomberg',
  colors: { background: '#000000', ui_text: foreground, ui_accent: '#ff8000' }
})

const originalDesktop = window.hermesDesktop

beforeEach(() => {
  window.localStorage.clear()
  native.length = 0
  titleBars.length = 0
  __resetBackendSkinSync()
  $accentOverride.set(null)
  $activeGatewayProfile.set('default')
  ;(window as unknown as { hermesDesktop: unknown }).hermesDesktop = {
    setNativeTheme: (themeSource: string) => void native.push({ themeSource }),
    setTitleBarTheme: (titleBar: { background: string; foreground: string }) => void titleBars.push(titleBar)
  }
})

afterEach(() => {
  cleanup()
  ;(window as unknown as { hermesDesktop: unknown }).hermesDesktop = originalDesktop
})

describe('ThemeProvider over the real sources', () => {
  it('paints the stored theme for the active scope', () => {
    window.localStorage.setItem(SKIN_KEY, 'everforest')
    window.localStorage.setItem(MODE_KEY, 'dark')

    renderThemed()

    expect(cssVar('--theme-foreground')).toBe(everforestTheme.darkColors!.foreground)
    expect(ctx.themeName).toBe('everforest')
  })

  it('commits a pick per profile, and unassigned profiles inherit the global one', () => {
    renderThemed()

    act(() => ctx.setTheme('mono'))
    expect(skinPref.resolve('default')).toBe('mono')

    // A profile with no appearance of its own follows the global pick...
    act(() => $activeGatewayProfile.set('work'))
    expect(ctx.themeName).toBe('mono')

    // ...until it is given one, without disturbing the global.
    act(() => ctx.setTheme('ember'))
    expect(ctx.themeName).toBe('ember')
    expect(skinPref.resolve('default')).toBe('mono')

    // Going back is the same read in reverse.
    act(() => $activeGatewayProfile.set('default'))
    expect(ctx.themeName).toBe('mono')
  })

  it('records the active scope so the next launch paints it', () => {
    renderThemed()

    act(() => $activeGatewayProfile.set('work'))

    expect(window.localStorage.getItem(LAST_PROFILE_KEY)).toBe('work')
  })

  it('follows the OS while the mode is `system`, and the pick once it is not', () => {
    window.localStorage.setItem(MODE_KEY, 'system')
    const original = window.matchMedia

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('dark'), media: query, addEventListener() {}, removeEventListener() {} })
    })

    renderThemed()
    expect(ctx.resolvedMode).toBe('dark')
    expect($appearance.get()).toBe('dark')

    act(() => ctx.setMode('light'))
    expect(ctx.resolvedMode).toBe('light')
    expect($appearance.get()).toBe('light')
    expect(modePref.resolve('default')).toBe('light')

    Object.defineProperty(window, 'matchMedia', { configurable: true, value: original })
  })

  it('repaints when a peer window writes an appearance', () => {
    renderThemed()
    expect(ctx.themeName).toBe('nous')

    // localStorage is per origin, so another renderer's switch only reaches this
    // one as a `storage` event.
    window.localStorage.setItem(SKIN_KEY, 'midnight')
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: SKIN_KEY })))

    expect(ctx.themeName).toBe('midnight')
  })

  it('ignores a peer write to an unrelated key', () => {
    renderThemed()

    window.localStorage.setItem('some-other-preference', 'x')
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'some-other-preference' })))

    expect(ctx.themeName).toBe('nous')
  })

  it('paints an installed user theme, and offers it in the picker', () => {
    const dracula: DesktopTheme = { ...midnightTheme, description: 'VS Code · dracula', label: 'Dracula', name: 'dracula' }

    act(() => void installUserTheme(dracula))

    renderThemed()
    expect(ctx.availableThemes.some(theme => theme.name === 'dracula')).toBe(true)

    act(() => ctx.setTheme('dracula'))
    expect(ctx.themeName).toBe('dracula')
    expect(skinPref.resolve('default')).toBe('dracula')
  })

  it('paints a theme contributed through the plugin registry', () => {
    const zeus: DesktopTheme = { ...midnightTheme, description: 'Zeus', label: 'Zeus', name: 'zeus' }
    const dispose = registry.register({ area: THEMES_AREA, data: zeus, id: 'zeus' })

    renderThemed()

    expect(ctx.availableThemes.some(theme => theme.name === 'zeus')).toBe(true)

    act(() => ctx.setTheme('zeus'))
    expect(ctx.themeName).toBe('zeus')

    dispose()
  })

  it('repaints an in-place palette edit of the ACTIVE user theme', () => {
    window.localStorage.setItem(MODE_KEY, 'dark')

    const dracula: DesktopTheme = {
      ...midnightTheme,
      colors: { ...midnightTheme.colors, foreground: '#111111' },
      label: 'Dracula',
      name: 'dracula'
    }

    act(() => void installUserTheme(dracula))

    renderThemed()
    act(() => ctx.setTheme('dracula'))

    expect(cssVar('--theme-foreground')).toBe('#111111')

    // Live authoring: the theme keeps its name, only the palette moves.
    act(() => void installUserTheme({ ...dracula, colors: { ...dracula.colors, foreground: '#222222' } }))

    expect(cssVar('--theme-foreground')).toBe('#222222')
    expect(ctx.themeName).toBe('dracula')
  })

  it('re-seeds the palette from the dev accent override', () => {
    renderThemed()

    const authored = ctx.theme.colors.primary

    act(() => $accentOverride.set('#ff00aa'))

    expect(ctx.theme.colors.primary).not.toBe(authored)
  })
})

describe('ThemeProvider → the native shell', () => {
  it('pins the renderer, the native theme, the titlebar and the pre-paint keys', () => {
    window.localStorage.setItem(SKIN_KEY, 'everforest')
    window.localStorage.setItem(MODE_KEY, 'dark')

    renderThemed()

    expect(native.at(-1)?.themeSource).toBe('dark')
    expect(titleBars.at(-1)).toEqual({
      background: expect.any(String),
      foreground: everforestTheme.darkColors!.foreground
    })
    // The raw keys index.html's inline script reads before any module loads.
    expect(window.localStorage.getItem('hermes-boot-color-scheme')).toBe('dark')
    expect(window.localStorage.getItem('hermes-boot-background')).toBe(titleBars.at(-1)!.background)
  })

  // 'system' must stay 'system' or nativeTheme stops tracking the OS.
  it('leaves the native theme on `system` when the mode follows the OS', () => {
    window.localStorage.setItem(MODE_KEY, 'system')

    renderThemed()

    expect(native.at(-1)?.themeSource).toBe('system')
  })
})

describe('ThemeProvider ← backend skin sync', () => {
  it('applies an activated backend skin', () => {
    renderThemed()

    act(() => ingestBackendSkin(bloomberg('#ff9f0a'), { apply: true }))

    expect(cssVar('--theme-foreground')).toBe('#ff9f0a')
    expect(cssVar('--theme-background-seed')).toBe('#000000')
  })

  it('repaints an in-place edit of the ACTIVE skin (same name, new palette)', () => {
    renderThemed()

    act(() => ingestBackendSkin(bloomberg('#ff9f0a'), { apply: true }))
    expect(cssVar('--theme-foreground')).toBe('#ff9f0a')

    // Recolor the same skin file. The same-name apply guard correctly no-ops
    // (protects manual desktop picks), so the repaint must come from the
    // registry update reaching the active theme derivation.
    act(() => ingestBackendSkin(bloomberg('#ff2d95'), { apply: true }))
    expect(cssVar('--theme-foreground')).toBe('#ff2d95')
  })

  it('does not repaint an edit to an INACTIVE skin', () => {
    renderThemed()

    act(() => ingestBackendSkin(bloomberg('#ff9f0a'), { apply: true }))

    // A different skin registered without apply (e.g. seeded on reconnect)
    // must not touch the painted theme.
    act(() =>
      ingestBackendSkin({ name: 'forest', colors: { background: '#001100', ui_text: '#66ff66' } }, { apply: false })
    )
    expect(cssVar('--theme-foreground')).toBe('#ff9f0a')
  })

  // The relaunch bug: the persisted pick was a backend skin, and the boot paint
  // ran before the gateway seeded it. The name could not resolve, got flattened
  // to the default, and the connect-time seed (apply: false, by design) never
  // repainted — so the theme "didn't stick" until `/skin`.
  it('paints a persisted backend skin once the connect-time seed makes it resolvable', () => {
    window.localStorage.setItem(SKIN_KEY, 'bloomberg')

    renderThemed()

    // Boot: nothing resolves 'bloomberg' yet → default paint...
    expect(cssVar('--theme-background-seed')).not.toBe('#000000')

    // ...but the pick survives, so the seed alone repaints it.
    act(() => ingestBackendSkin(bloomberg('#ff9f0a'), { apply: false }))

    expect(cssVar('--theme-background-seed')).toBe('#000000')
    expect(skinPref.resolve('default')).toBe('bloomberg')
  })
})

describe('the pre-mount paint', () => {
  // Captured while this file's imports were evaluated — i.e. at the same moment
  // `main.tsx` would have imported the composition, before React mounts.
  const paintedAtImport = window.document.documentElement.style.getPropertyValue('--theme-foreground')

  it('has already painted by the time the module is imported', () => {
    expect(paintedAtImport).not.toBe('')
  })

  it('paints the LAST active scope, not the default one', () => {
    window.localStorage.setItem(PROFILE_SKINS_KEY, JSON.stringify({ work: 'midnight' }))
    window.localStorage.setItem(PROFILE_MODES_KEY, JSON.stringify({ work: 'dark' }))
    window.localStorage.setItem(LAST_PROFILE_KEY, 'work')
    window.document.documentElement.style.removeProperty('--theme-foreground')

    paintStoredAppearance()

    expect(cssVar('--theme-foreground')).toBe(
      (BUILTIN_THEMES.midnight.darkColors ?? BUILTIN_THEMES.midnight.colors).foreground
    )
  })
})
