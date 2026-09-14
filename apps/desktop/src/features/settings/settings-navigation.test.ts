import { describe, expect, it } from 'vitest'

import { ACTIVE_SETTINGS_VIEWS, resolveSettingsView } from './settings-navigation'

describe('AgentBox settings navigation', () => {
  it('exposes only the five approved product areas plus device-local app preferences', () => {
    expect(ACTIVE_SETTINGS_VIEWS).toEqual([
      'product:models',
      'product:resources',
      'product:identities',
      'product:harnesses',
      'product:data',
      'appearance',
      'notifications',
      'keybinds',
      'about'
    ])
  })

  it.each([
    ['config:model', 'product:models'],
    ['mcp', 'product:resources'],
    ['plugins', 'product:resources'],
    ['providers', 'product:identities'],
    ['keys', 'product:identities'],
    ['gateway', 'product:harnesses'],
    ['connections', 'product:harnesses'],
    ['sessions', 'product:data'],
    ['config:appearance', 'appearance']
  ] as const)('redirects the legacy %s deep link without restoring its old surface', (legacy, target) => {
    expect(resolveSettingsView(legacy)).toBe(target)
  })

  it('does not expose arbitrary legacy config sections', () => {
    expect(resolveSettingsView('config:voice')).toBe('product:models')
  })
})
