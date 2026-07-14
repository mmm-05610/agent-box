import { describe, it, expect } from 'vitest'
import { validateJson } from './validateJson'

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
    // Generically the registered registry is just `\.json$` → `GenericJsonSchema`
    // which is z.object({}).passthrough(); any object parses cleanly. So we can
    // only assert behavior we can guarantee — i.e. a non-object should fail.
    const r = validateJson('/root/anything.json', '"just-a-string"')
    expect(r.ok).toBe(false)
  })
})
