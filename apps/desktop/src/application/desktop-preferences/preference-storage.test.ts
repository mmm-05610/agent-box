import { describe, expect, it } from 'vitest'

import { type PreferenceStorage, readBooleanPreference, writeVerifiedPreference } from './preference-storage'

/** The in-memory stand-in: pure, and able to fail either way a real store can
 *  fail (the write refuses, or the write is silently dropped). */
function memoryStorage(options: { failWrite?: boolean; dropWrite?: boolean } = {}) {
  const entries = new Map<string, string>()

  const storage: PreferenceStorage = {
    read: key => entries.get(key) ?? null,
    write: (key, value) => {
      if (options.failWrite) {
        throw new Error('storage refused the write')
      }

      if (!options.dropWrite) {
        entries.set(key, value)
      }
    }
  }

  return { entries, storage }
}

describe('readBooleanPreference', () => {
  it('reads true/false as stored and falls back only when nothing is stored', () => {
    const { storage } = memoryStorage()

    expect(readBooleanPreference(storage, 'k', true)).toBe(true)

    storage.write('k', 'false')
    expect(readBooleanPreference(storage, 'k', true)).toBe(false)

    storage.write('k', 'true')
    expect(readBooleanPreference(storage, 'k', false)).toBe(true)
  })
})

describe('writeVerifiedPreference', () => {
  it('succeeds only when the value can be read back', () => {
    const { storage } = memoryStorage()

    writeVerifiedPreference(storage, 'k', 'v')

    expect(storage.read('k')).toBe('v')
  })

  it('throws when the store refuses the write', () => {
    const { storage } = memoryStorage({ failWrite: true })

    expect(() => writeVerifiedPreference(storage, 'k', 'v')).toThrow()
  })

  it('throws when the store silently ignores the write', () => {
    const { storage, entries } = memoryStorage({ dropWrite: true })

    expect(() => writeVerifiedPreference(storage, 'k', 'v')).toThrow(/did not persist/)
    expect(entries.size).toBe(0)
  })
})
