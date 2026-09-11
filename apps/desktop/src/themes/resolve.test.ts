import { describe, expect, it } from 'vitest'

import { BUILTIN_THEMES, DEFAULT_SKIN_NAME, nousTheme } from './presets'
import { listThemes, lookupTheme, normalizeMode, normalizeSkinName, pickTheme, resolveMode } from './resolve'
import type { ThemeContribution, ThemeSource } from './types'

// The resolution policy, as data: three sources in, one merged set out, and one
// answer per name. This is the file that makes "one resolver owns the policy"
// checkable — the app's stores are joined to it in `@/themes/user-themes.ts`.

const theme = (name: string): ThemeContribution => ({ ...nousTheme, description: `${name} source`, label: name, name })

const EMPTY: ThemeSource = { user: [], backend: [], contributed: [] }

describe('listThemes', () => {
  it('orders built-ins first, then contributions, backend skins, and user installs', () => {
    const source: ThemeSource = {
      user: [theme('from-user')],
      backend: [theme('from-backend')],
      contributed: [theme('from-plugin')]
    }

    expect(listThemes(source).map(t => t.name)).toEqual([
      ...Object.keys(BUILTIN_THEMES),
      'from-plugin',
      'from-backend',
      'from-user'
    ])
  })

  // A name can arrive from more than one source. The list must keep the winner
  // and drop the loser, or the picker shows the same name twice and the second
  // one silently resolves to the first.
  it('keeps only the highest-precedence entry for a name', () => {
    const contested = 'contested'

    const source: ThemeSource = {
      user: [{ ...theme(contested), description: 'user wins' }],
      backend: [{ ...theme(contested), description: 'backend loses' }],
      contributed: [{ ...theme(contested), description: 'contribution loses' }]
    }

    const matches = listThemes(source).filter(t => t.name === contested)

    expect(matches).toHaveLength(1)
    expect(matches[0].description).toBe('user wins')
    expect(lookupTheme(contested, listThemes(source))?.description).toBe('user wins')
  })

  it('lets a backend skin shadow a plugin contribution of the same name', () => {
    const source: ThemeSource = {
      user: [],
      backend: [{ ...theme('skinned'), description: 'backend' }],
      contributed: [{ ...theme('skinned'), description: 'plugin' }]
    }

    expect(listThemes(source).filter(t => t.name === 'skinned')).toEqual([
      expect.objectContaining({ description: 'backend' })
    ])
  })
})

describe('pickTheme', () => {
  it('resolves a name the merged set has', () => {
    const source: ThemeSource = { ...EMPTY, user: [{ ...theme('custom'), label: 'Custom' }] }

    expect(pickTheme('custom', listThemes(source)).label).toBe('Custom')
    expect(pickTheme('everforest', listThemes(source)).label).toBe(BUILTIN_THEMES.everforest.label)
  })

  // A name can dangle — a retired skin, a backend skin not seeded on this
  // launch. Refusing to paint is worse than painting the default.
  it('falls back to the default rather than refusing to paint', () => {
    expect(pickTheme('nobody-installed-this', []).name).toBe(DEFAULT_SKIN_NAME)
  })
})

describe('normalizeSkinName', () => {
  const themes = listThemes(EMPTY)

  it('keeps a name that resolves', () => {
    expect(normalizeSkinName('everforest', themes)).toBe('everforest')
  })

  it('flattens a name nothing resolves, and an empty pick', () => {
    expect(normalizeSkinName('nobody-installed-this', themes)).toBe(DEFAULT_SKIN_NAME)
    expect(normalizeSkinName(null, themes)).toBe(DEFAULT_SKIN_NAME)
  })

  // Retired palettes are gone from the app but linger in stored picks; landing
  // on the canonical skin keeps old muscle memory working.
  it.each(['nous-light', 'default', 'gold'])('flattens the retired skin %s', retired => {
    expect(normalizeSkinName(retired, themes)).toBe(DEFAULT_SKIN_NAME)
  })
})

describe('mode', () => {
  it('accepts the three modes and defaults anything else to system', () => {
    expect(normalizeMode('light')).toBe('light')
    expect(normalizeMode('dark')).toBe('dark')
    expect(normalizeMode('system')).toBe('system')
    expect(normalizeMode('dusk')).toBe('system')
    expect(normalizeMode(null)).toBe('system')
  })

  it('resolves system against the OS, and passes an explicit pick through', () => {
    expect(resolveMode('system', true)).toBe('dark')
    expect(resolveMode('system', false)).toBe('light')
    expect(resolveMode('dark', false)).toBe('dark')
    expect(resolveMode('light', true)).toBe('light')
  })
})
