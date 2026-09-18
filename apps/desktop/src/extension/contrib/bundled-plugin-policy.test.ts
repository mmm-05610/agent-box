import { describe, expect, it } from 'vitest'

import { bundledPluginRetired } from './bundled-plugin-policy'

describe('bundledPluginRetired', () => {
  it('retires Bot Mode under the agentbox product authority', () => {
    expect(bundledPluginRetired('hermes-bots', 'agentbox')).toBe(true)
  })

  it('retires nothing else under agentbox — the other bundled plugins keep shipping', () => {
    for (const id of ['accent', 'kanban', 'radio']) {
      expect(bundledPluginRetired(id, 'agentbox')).toBe(false)
    }
  })

  it('retires nothing at all under the legacy hermes authority', () => {
    for (const id of ['hermes-bots', 'accent', 'kanban', 'radio']) {
      expect(bundledPluginRetired(id, 'hermes')).toBe(false)
    }
  })
})
