import { describe, expect, it } from 'vitest'

import { type PermissionRule, type ProfileMemory } from '@/types/wire/wire-v1'

import { profileBindingsOfKind, profileMemoryView, profilePermissionRows } from './profile-read-facts'

const memory = (overrides: Partial<ProfileMemory> = {}): ProfileMemory => ({
  available: true,
  files: [],
  reason: null,
  ...overrides
})

describe('profileMemoryView (order 63)', () => {
  it('draws no section at all when the family declares no memory paths', () => {
    expect(profileMemoryView(memory({ available: false, note: 'this family declares no memory paths' }))).toBeNull()
  })

  it('draws no section for a home it cannot read either', () => {
    expect(profileMemoryView(memory({ available: false, reason: 'MEMORY_HOME_MISSING' }))).toBeNull()
  })

  it('keeps a refused file as a refusal, with no content to render', () => {
    const view = profileMemoryView(
      memory({
        files: [
          { path: 'MEMORY.md', size: 12, reason: 'MEMORY_CONTAINS_SECRET', refused: true },
          { path: 'notes.md', size: 4, digest: 'sha256:abcd', content: 'hi\n' }
        ]
      })
    )

    expect(view?.files[0]).toMatchObject({ content: null, path: 'MEMORY.md', refusal: 'MEMORY_CONTAINS_SECRET' })
    expect(view?.files[1]).toMatchObject({ content: 'hi\n', refusal: null })
  })
})

describe('profilePermissionRows (order 60)', () => {
  const rule = (key: PermissionRule['key'], action: PermissionRule['action'], pattern: null | string = null): PermissionRule => ({
    action,
    key,
    pattern
  })

  it('marks a row a later, broader rule for the same key overrides', () => {
    const rows = profilePermissionRows([rule('bash', 'allow'), rule('bash', 'deny')])

    expect(rows.map(row => row.shadowed)).toEqual([true, false])
  })

  it('does not call a narrower later rule a shadow', () => {
    const rows = profilePermissionRows([rule('bash', 'allow'), rule('bash', 'deny', 'rm *')])

    expect(rows.map(row => row.shadowed)).toEqual([false, false])
  })

  it('leaves another key alone', () => {
    const rows = profilePermissionRows([rule('bash', 'allow'), rule('edit', 'deny')])

    expect(rows.map(row => row.shadowed)).toEqual([false, false])
  })

  it('reports no rows for a role the service sent no rules for', () => {
    expect(profilePermissionRows([])).toEqual([])
  })
})

describe('profileBindingsOfKind (order 58)', () => {
  const binding = (kind: 'mcp' | 'plugin' | 'skill', enabled: boolean, assetId: string) => ({
    assetId,
    digest: 'sha256:0000',
    enabled,
    kind,
    name: assetId,
    revision: 1
  })

  it('keeps a disabled binding in the list — bound but off is a state to show', () => {
    const rows = profileBindingsOfKind([binding('skill', false, 'fixture-skill')], 'skill')

    expect(rows).toHaveLength(1)
    expect(rows[0]?.enabled).toBe(false)
  })

  it('separates the kinds instead of mixing them into one list', () => {
    const all = [binding('skill', true, 'a'), binding('mcp', true, 'b'), binding('plugin', true, 'c')]

    expect(profileBindingsOfKind(all, 'skill').map(row => row.assetId)).toEqual(['a'])
    expect(profileBindingsOfKind(all, 'mcp').map(row => row.assetId)).toEqual(['b'])
    // A code asset is still a binding and is answered, not silently dropped —
    // it simply has no section of its own on the role page yet.
    expect(profileBindingsOfKind(all, 'plugin').map(row => row.assetId)).toEqual(['c'])
  })
})
