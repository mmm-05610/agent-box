import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createDesktopLocalePreference,
  desktopLocalePreference,
  LOCALE_PREFERENCE_KEY
} from './locale-preference'
import { type PreferenceStorage } from './preference-storage'

function memoryStorage(options: { dropWrite?: boolean; failWrite?: boolean } = {}) {
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

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('the Desktop-local locale preference port', () => {
  it('reads back a locale it saved', async () => {
    const { entries, storage } = memoryStorage()
    const port = createDesktopLocalePreference(storage)

    await port.save('ja')

    await expect(port.load()).resolves.toBe('ja')
    expect(entries.get(LOCALE_PREFERENCE_KEY)).toBe('ja')
  })

  it('resolves "nothing stored" as undefined', async () => {
    const { storage } = memoryStorage()

    await expect(createDesktopLocalePreference(storage).load()).resolves.toBeUndefined()
  })

  it('rejects the save when the store throws, and reports no success', async () => {
    const { storage } = memoryStorage({ failWrite: true })
    const port = createDesktopLocalePreference(storage)

    await expect(port.save('zh')).rejects.toThrow()
    await expect(port.load()).resolves.toBeUndefined()
  })

  it('rejects the save when the store silently drops the write', async () => {
    const { storage } = memoryStorage({ dropWrite: true })
    const port = createDesktopLocalePreference(storage)

    await expect(port.save('zh')).rejects.toThrow(/did not persist/)
    await expect(port.load()).resolves.toBeUndefined()
  })

  it('keeps the previous locale when a later save fails', async () => {
    const { storage } = memoryStorage()
    const port = createDesktopLocalePreference(storage)

    await port.save('ar')
    await expect(port.save('ja')).resolves.toBeUndefined()

    const failing = createDesktopLocalePreference(memoryStorage({ dropWrite: true }).storage)

    await expect(failing.save('ru')).rejects.toThrow()
    await expect(port.load()).resolves.toBe('ja')
  })

  it('round-trips through the production localStorage binding', async () => {
    await desktopLocalePreference.save('zh-hant')

    await expect(desktopLocalePreference.load()).resolves.toBe('zh-hant')
  })
})
