import { describe, expect, it } from 'vitest'
import { extractHooksFragment, mergeHooksIntoConfig, parseHooksSection } from './yamlHooks'

const CONFIG = `model:
  default: ""
hooks:
  pre_llm_call:
    - command: /hooks/pre.sh
  post_tool_call:
    - command: /hooks/post.sh
    - command: "/hooks/quoted.sh"
terminal:
  backend: local
`

describe('parseHooksSection', () => {
  it('extracts phases and commands from a hooks fragment', () => {
    const phases = parseHooksSection('hooks:\n  pre_llm_call:\n    - command: /hooks/pre.sh\n')
    expect(phases).toEqual({ pre_llm_call: [{ command: '/hooks/pre.sh' }] })
  })

  it('handles empty input', () => {
    expect(parseHooksSection('')).toEqual({})
    expect(parseHooksSection('  \n  ')).toEqual({})
  })

  it('skips non-string commands', () => {
    const phases = parseHooksSection('hooks:\n  phase_a:\n    - command: /a.sh\n    - timeout: 10\n    - foo: bar\n')
    expect(phases).toEqual({ phase_a: [{ command: '/a.sh' }] })
  })

  it('returns {} for invalid yaml', () => {
    expect(parseHooksSection('hooks:\n  pre: [unclosed')).toEqual({})
  })
})

describe('extractHooksFragment', () => {
  it('returns the hooks section as a yaml fragment', () => {
    const fragment = extractHooksFragment(CONFIG)
    expect(fragment).toContain('pre_llm_call')
    expect(fragment).toContain('/hooks/pre.sh')
    expect(fragment).not.toContain('model')
  })

  it('returns empty when there is no hooks section', () => {
    expect(extractHooksFragment('model:\n  default: ""\n')).toBe('')
  })
})

describe('mergeHooksIntoConfig', () => {
  it('replaces the hooks section and preserves other keys', () => {
    const next = mergeHooksIntoConfig(CONFIG, 'hooks:\n  pre_llm_call:\n    - command: /hooks/new.sh\n')
    expect(next).toContain('model:')
    expect(next).toContain('terminal:')
    expect(next).toContain('/hooks/new.sh')
    expect(next).not.toContain('/hooks/pre.sh')
    expect(next).not.toContain('post_tool_call')
    expect(parseHooksSection(next)).toEqual({ pre_llm_call: [{ command: '/hooks/new.sh' }] })
  })

  it('removes the hooks section when the fragment is empty', () => {
    const next = mergeHooksIntoConfig(CONFIG, '')
    expect(next).toContain('model:')
    expect(next).not.toContain('hooks:')
  })

  it('throws on invalid fragment yaml', () => {
    expect(() => mergeHooksIntoConfig(CONFIG, 'hooks:\n  pre: [unclosed')).toThrow()
  })

  it('creates a config from scratch when there is no existing config', () => {
    const next = mergeHooksIntoConfig('', 'hooks:\n  pre_llm_call:\n    - command: /hooks/new.sh\n')
    expect(parseHooksSection(next)).toEqual({ pre_llm_call: [{ command: '/hooks/new.sh' }] })
  })
})
