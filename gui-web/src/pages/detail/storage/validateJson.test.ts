import { describe, it, expect } from 'vitest'
import { validateJson, schemaForPath } from './validateJson'

describe('validateJson', () => {
  it('passes non-JSON files through with no error', () => {
    expect(validateJson('/root/notes.md', 'hello').ok).toBe(true)
    expect(validateJson('/root/.env', 'KEY=value').ok).toBe(true)
  })

  it('flags JSON syntax error with line:col', () => {
    const r = validateJson('/root/settings.json', '{"a": ,}')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toMatch(/line \d+/)
      expect(r.error).toMatch(/column \d+/)
    }
  })

  it('accepts valid JSON without registered schema', () => {
    const r = validateJson('/root/anything.json', '{"x":1}')
    expect(r.ok).toBe(true)
  })

  it('rejects JSON invalid against registered schema', () => {
    // Test schema: object with required `name: string`
    const spy = schemaForPath
    expect(spy).toBeTypeOf('function')

    // uses a built-in schema in schemaMaps.ts for codex/config.toml? No — only `.json`
    // So we test the registered claude/settings.json schema
    const r = validateJson(
      '/root/profiles/claude-foo/settings.json',
      '{"hooks": "not-an-object"}',
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.toLowerCase()).toContain('expected')
    }
  })
})
