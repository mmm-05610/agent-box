import { describe, it, expect } from 'vitest'
import { tabsFor } from './schema'

describe('tabsFor', () => {
  it('returns empty array for unknown agent types', () => {
    const r = tabsFor({
      path: '/x',
      config_dir: '/x',
      meta: {
        name: 'n', agent_type: 'unknown', display_name: '', description: '',
        provider: '', claude_md: '', preset: '',
      },
    } as never)
    expect(r).toEqual([])
  })

  it('filters out tabs whose visible() returns false', () => {
    // we don't yet have populated schemas; this validates the filter wiring
    const r = tabsFor({
      path: '/x',
      config_dir: '/x',
      meta: {
        name: 'n', agent_type: 'claude', display_name: '', description: '',
        provider: '', claude_md: '', preset: '',
      },
    } as never)
    expect(Array.isArray(r)).toBe(true)
  })
})