import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { $terminalFontFamily, DEFAULT_TERMINAL_FONT_FAMILY, resolveTerminalFontFamily } from '@/application/terminal/terminal-font'

import { localStoragePreferenceStorage } from './local-storage'
import { type PreferenceStorage } from './preference-storage'
import {
  hydrateTerminalFontFamilyPreference,
  readTerminalFontFamilyPreference,
  setTerminalFontFamilyPreference,
  TERMINAL_FONT_FAMILY_PREFERENCE_KEY
} from './terminal-font-preference'

function memoryStorage(options: { failWrite?: boolean } = {}) {
  const entries = new Map<string, string>()

  const storage: PreferenceStorage = {
    read: key => entries.get(key) ?? null,
    write: (key, value) => {
      if (options.failWrite) {
        throw new Error('storage refused the write')
      }

      entries.set(key, value)
    }
  }

  return { entries, storage }
}

beforeEach(() => {
  $terminalFontFamily.set('')
  window.localStorage.clear()
})

afterEach(() => {
  $terminalFontFamily.set('')
  window.localStorage.clear()
})

describe('the terminal-font Desktop preference', () => {
  it('applies and persists a chosen family', () => {
    const { entries, storage } = memoryStorage()

    setTerminalFontFamilyPreference('  MesloLGS NF  ', storage)

    expect(entries.get(TERMINAL_FONT_FAMILY_PREFERENCE_KEY)).toBe('MesloLGS NF')
    expect($terminalFontFamily.get()).toBe('MesloLGS NF')
    // The atom is what the terminal consumes, so the choice is live.
    expect(resolveTerminalFontFamily($terminalFontFamily.get())).toContain('MesloLGS NF')
  })

  it('treats an empty value as the bundled default', () => {
    const { storage } = memoryStorage()

    setTerminalFontFamilyPreference('MesloLGS NF', storage)
    setTerminalFontFamilyPreference('', storage)

    expect(readTerminalFontFamilyPreference(storage)).toBe('')
    expect($terminalFontFamily.get()).toBe('')
    expect(resolveTerminalFontFamily($terminalFontFamily.get())).toBe(DEFAULT_TERMINAL_FONT_FAMILY)
  })

  it('rehydrates the atom from storage (a reopen keeps the font)', () => {
    const { storage } = memoryStorage()

    setTerminalFontFamilyPreference('Hack Nerd Font', storage)
    $terminalFontFamily.set('')

    hydrateTerminalFontFamilyPreference(storage)

    expect($terminalFontFamily.get()).toBe('Hack Nerd Font')
  })

  it('leaves the atom on the previous font when the write did not land', () => {
    const { storage } = memoryStorage({ failWrite: true })

    expect(() => setTerminalFontFamilyPreference('Hack Nerd Font', storage)).toThrow()
    expect($terminalFontFamily.get()).toBe('')
  })

  it('persists through the production localStorage binding', () => {
    setTerminalFontFamilyPreference('JetBrainsMono Nerd Font')

    expect(readTerminalFontFamilyPreference(localStoragePreferenceStorage)).toBe('JetBrainsMono Nerd Font')
  })
})
