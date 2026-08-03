import { describe, expect, it } from 'vitest'
import {
  blockFieldPath,
  getFieldAt,
  inferFormat,
  joinRule,
  parseConfig,
  setFieldAt,
  splitRule,
  stringifyConfig,
} from './codec'

const JSONC = `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "custom": { "baseURL": "", "setCacheKey": true, },
  },
  // trailing comment
}`

describe('inferFormat', () => {
  it('maps extensions to formats', () => {
    expect(inferFormat('settings.json')).toBe('json')
    expect(inferFormat('opencode.jsonc')).toBe('jsonc')
    expect(inferFormat('config.yaml')).toBe('yaml')
    expect(inferFormat('config.yml')).toBe('yaml')
    expect(inferFormat('config.toml')).toBe('toml')
    expect(inferFormat(undefined)).toBe('json')
  })
})

describe('parseConfig / stringifyConfig', () => {
  it('round-trips json', () => {
    const doc = parseConfig('{"permissions": {"allow": ["Bash(npm run *)"]}}', 'json')
    expect(doc).toEqual({ permissions: { allow: ['Bash(npm run *)'] } })
    expect(parseConfig(stringifyConfig(doc!, 'json'), 'json')).toEqual(doc)
  })

  it('parses jsonc with comments and trailing commas', () => {
    const doc = parseConfig(JSONC, 'jsonc')
    expect(doc).toEqual({
      $schema: 'https://opencode.ai/config.json',
      provider: { custom: { baseURL: '', setCacheKey: true } },
    })
  })

  it('round-trips yaml', () => {
    const doc = parseConfig('approvals:\n  mode: smart\n  agent:\n    disabled_toolsets: [browser, web]\n', 'yaml')
    expect(doc).toEqual({ approvals: { mode: 'smart', agent: { disabled_toolsets: ['browser', 'web'] } } })
    expect(parseConfig(stringifyConfig(doc!, 'yaml'), 'yaml')).toEqual(doc)
  })

  it('round-trips toml', () => {
    const doc = parseConfig('approval_policy = "never"\ntools = ["web_search"]\n[history]\npersistence = "none"\n', 'toml')
    expect(doc).toEqual({ approval_policy: 'never', tools: ['web_search'], history: { persistence: 'none' } })
    expect(parseConfig(stringifyConfig(doc!, 'toml'), 'toml')).toEqual(doc)
  })

  it('returns {} for empty input and null for invalid yaml', () => {
    expect(parseConfig('', 'yaml')).toEqual({})
    expect(parseConfig('a: [unclosed', 'yaml')).toBeNull()
  })
})

describe('getFieldAt / setFieldAt', () => {
  it('walks dotted paths', () => {
    const doc: Record<string, unknown> = { a: { b: { c: 1 } } }
    expect(getFieldAt(doc, 'a.b.c')).toBe(1)
    expect(getFieldAt(doc, 'a.b.missing')).toBeUndefined()
  })

  it('creates intermediate objects on set', () => {
    const doc: Record<string, unknown> = {}
    setFieldAt(doc, 'approvals.agent.disabled_toolsets', ['browser'])
    expect(doc).toEqual({ approvals: { agent: { disabled_toolsets: ['browser'] } } })
  })
})

describe('blockFieldPath', () => {
  it('keeps fields equal to config_key absolute', () => {
    expect(blockFieldPath({ approval_policy: 'never' }, 'approval_policy', 'approval_policy', false)).toBe('approval_policy')
  })

  it('uses top-level fields when config_key is a scalar field', () => {
    const doc = { approval_policy: 'never' }
    expect(blockFieldPath(doc, 'approval_policy', 'tools', true)).toBe('tools')
  })

  it('nests fields under an existing container config_key', () => {
    const doc = { permissions: { defaultMode: 'default' } }
    expect(blockFieldPath(doc, 'permissions', 'defaultMode', false)).toBe('permissions.defaultMode')
    expect(blockFieldPath(doc, 'permissions', 'allow', false)).toBe('permissions.allow')
  })

  it('nests fields under an absent container config_key', () => {
    expect(blockFieldPath({}, 'approvals', 'mode', false)).toBe('approvals.mode')
    expect(blockFieldPath({}, 'approvals', 'agent.disabled_toolsets', false)).toBe('approvals.agent.disabled_toolsets')
  })

  it('returns config_key for tool_matrix blocks', () => {
    expect(blockFieldPath({ permission: {} }, 'permission', undefined, false)).toBe('permission')
  })
})

describe('splitRule / joinRule', () => {
  it('splits and joins tool(pattern) rules', () => {
    expect(splitRule('Bash(npm run *)', 'tool(pattern)')).toEqual({ tool: 'Bash', pattern: 'npm run *' })
    expect(splitRule('Read(./.env)', 'tool(pattern)')).toEqual({ tool: 'Read', pattern: './.env' })
    expect(joinRule('Bash', 'npm run *', 'tool(pattern)')).toBe('Bash(npm run *)')
  })

  it('treats unmatched rules as raw patterns', () => {
    expect(splitRule('plain rule', 'tool(pattern)')).toEqual({ tool: null, pattern: 'plain rule' })
    expect(joinRule('', 'npm run *', 'tool(pattern)')).toBe('npm run *')
  })
})
