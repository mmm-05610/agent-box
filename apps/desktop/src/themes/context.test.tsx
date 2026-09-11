import { act, cleanup, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { ThemePresenter, type ThemePresenterProps, useTheme } from './context'
import type { ThemeAppearancePort, ThemePreferences } from './ports'
import { everforestTheme, nousTheme } from './presets'
import { listThemes } from './resolve'
import type { ResolvedTheme, ThemeContribution } from './types'

// The presenter's contract: values in, a resolved palette out. Everything it
// needs arrives as a prop, so these tests drive it with plain objects — no
// store, no registry, no storage, no DOM. What the palette LOOKS like on screen
// is `appearance.test.ts`; that it reaches the app's surfaces is
// `@/application/theme/index.test.tsx`.

const BUILT_INS: readonly ThemeContribution[] = listThemes({ user: [], backend: [], contributed: [] })

const painted: ResolvedTheme[] = []
const appearance: ThemeAppearancePort = { paint: resolved => void painted.push(resolved) }

const lastPaint = (): ResolvedTheme => {
  const resolved = painted[painted.length - 1]

  if (!resolved) {
    throw new Error('nothing was painted')
  }

  return resolved
}

let ctx: ReturnType<typeof useTheme>

function Probe() {
  ctx = useTheme()

  return null
}

interface HarnessProps {
  accentOverride?: ThemePresenterProps['accentOverride']
  activeScope?: string
  preferences?: ThemePreferences
  systemDark?: boolean
  themes?: readonly ThemeContribution[]
}

function Harness({
  accentOverride = null,
  activeScope = 'default',
  preferences: injected = { theme: 'nous', mode: 'light' },
  systemDark = false,
  themes = BUILT_INS
}: HarnessProps) {
  // Props are the composition's read of the stored pick; a commit layers on top,
  // exactly like the real `onPreferencesChange` re-reading after it assigns.
  const [committed, setCommitted] = useState<Partial<ThemePreferences>>({})
  const preferences: ThemePreferences = { ...injected, ...committed }

  return (
    <ThemePresenter
      accentOverride={accentOverride}
      activeScope={activeScope}
      appearance={appearance}
      availableThemes={themes}
      onPendingApplyDrained={() => {}}
      onPreferencesChange={next => setCommitted(current => ({ ...current, ...next }))}
      pendingApply={null}
      preferences={preferences}
      systemDark={systemDark}
    >
      <Probe />
    </ThemePresenter>
  )
}

const cssVar = (name: string) => lastPaint().cssVariables[name]

describe('ThemePresenter', () => {
  afterEach(() => {
    cleanup()
    painted.length = 0
  })

  it('paints the committed theme and reports it', () => {
    render(<Harness preferences={{ theme: 'everforest', mode: 'dark' }} />)

    expect(cssVar('--theme-foreground')).toBe(everforestTheme.darkColors!.foreground)
    expect(ctx.themeName).toBe('everforest')
    expect(ctx.theme).toBe(lastPaint().theme)
    expect(ctx.renderedMode).toBe('dark')
  })

  it('follows the OS for system mode, and the pick for light/dark', () => {
    const { rerender } = render(<Harness preferences={{ theme: 'nous', mode: 'system' }} systemDark />)

    expect(ctx.mode).toBe('system')
    expect(ctx.resolvedMode).toBe('dark')

    rerender(<Harness preferences={{ theme: 'nous', mode: 'system' }} systemDark={false} />)
    expect(ctx.resolvedMode).toBe('light')

    rerender(<Harness preferences={{ theme: 'nous', mode: 'light' }} systemDark />)
    expect(ctx.resolvedMode).toBe('light')
  })

  it('re-seeds the palette from an accent override', () => {
    render(<Harness preferences={{ theme: 'nous', mode: 'dark' }} />)
    const authored = ctx.theme.colors.primary

    cleanup()
    painted.length = 0
    render(<Harness accentOverride="#ff00aa" preferences={{ theme: 'nous', mode: 'dark' }} />)

    expect(ctx.theme.colors.primary).not.toBe(authored)
    expect(ctx.theme.colors.primary).not.toBe(nousTheme.colors.primary)
  })

  it('flattens a name the injected set does not resolve, and keeps the pick itself', () => {
    render(<Harness preferences={{ theme: 'not-installed', mode: 'dark' }} />)

    // The context reports what is painted; the committed pick is the
    // composition's to keep (see the boot/seed case in the composition tests).
    expect(ctx.themeName).toBe('nous')
    expect(lastPaint().theme.name).toBe('nous-dark')
  })

  it('reports the available themes it was handed, in order', () => {
    const themes: ThemeContribution[] = [
      { ...everforestTheme, name: 'everforest' },
      { ...everforestTheme, description: 'plugin', label: 'Plugin', name: 'plugin-theme' }
    ]

    render(<Harness themes={themes} />)

    expect(ctx.availableThemes.map(theme => theme.name)).toEqual(['everforest', 'plugin-theme'])
  })

  it('commits a pick through the preference port it was given', () => {
    render(<Harness />)

    act(() => ctx.setTheme('everforest'))

    expect(ctx.themeName).toBe('everforest')
    expect(ctx.theme.name).toBe('everforest-light')
  })

  it('normalizes a commit that cannot resolve', () => {
    render(<Harness />)

    act(() => ctx.setTheme('nothing-installed'))

    expect(ctx.themeName).toBe('nous')
  })
})

describe('ThemePresenter highlight preview', () => {
  afterEach(() => {
    cleanup()
    painted.length = 0
  })

  const renderHarness = (props: HarnessProps = {}) => render(<Harness {...props} />)

  it('paints the previewed theme without committing it', () => {
    renderHarness()

    const committed = ctx.themeName

    act(() => ctx.previewTheme('everforest', 'dark'))

    expect(cssVar('--theme-foreground')).toBe(everforestTheme.darkColors!.foreground)
    // The commit surface does not change: the context name is still the
    // committed one, and the preference was never written.
    expect(ctx.themeName).toBe(committed)
  })

  it('clearThemePreview repaints the committed appearance', () => {
    renderHarness()

    act(() => ctx.previewTheme('everforest', 'dark'))
    expect(cssVar('--theme-foreground')).toBe(everforestTheme.darkColors!.foreground)

    act(() => ctx.clearThemePreview())
    expect(cssVar('--theme-foreground')).not.toBe(everforestTheme.darkColors!.foreground)
  })

  it('a commit replaces the preview', () => {
    renderHarness()

    act(() => ctx.previewTheme('everforest', 'dark'))
    act(() => ctx.setTheme('mono'))

    expect(ctx.themeName).toBe('mono')
    expect(cssVar('--theme-foreground')).not.toBe(everforestTheme.darkColors!.foreground)
  })

  it('ignores a preview of a theme the injected set does not have', () => {
    renderHarness()

    const before = cssVar('--theme-foreground')

    act(() => ctx.previewTheme('does-not-exist', 'dark'))
    expect(cssVar('--theme-foreground')).toBe(before)
  })

  it('drops a preview when the scope changes — the next context must not inherit it', () => {
    const { rerender } = render(<Harness preferences={{ theme: 'everforest', mode: 'dark' }} />)

    act(() => ctx.previewTheme('mono', 'light'))
    expect(lastPaint().theme.name).toBe('mono-light')

    rerender(<Harness activeScope="work" preferences={{ theme: 'everforest', mode: 'dark' }} />)

    expect(lastPaint().theme.name).toBe('everforest-dark')
  })
})
