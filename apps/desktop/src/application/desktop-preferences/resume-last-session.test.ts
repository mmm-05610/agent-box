import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { localStoragePreferenceStorage } from './local-storage'
import { type PreferenceStorage } from './preference-storage'
import {
  $resumeLastSession,
  hydrateResumeLastSession,
  readResumeLastSession,
  RESUME_LAST_SESSION_DEFAULT,
  RESUME_LAST_SESSION_PREFERENCE_KEY,
  setResumeLastSession
} from './resume-last-session'

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
  $resumeLastSession.set(RESUME_LAST_SESSION_DEFAULT)
  window.localStorage.clear()
})

afterEach(() => {
  $resumeLastSession.set(RESUME_LAST_SESSION_DEFAULT)
  window.localStorage.clear()
})

describe('the resume-last-session Desktop preference', () => {
  it('defaults to on when nothing was ever stored', () => {
    const { storage } = memoryStorage()

    expect(readResumeLastSession(storage)).toBe(true)
    expect($resumeLastSession.get()).toBe(true)
  })

  it('round-trips through storage and the shared atom', () => {
    const { entries, storage } = memoryStorage()

    setResumeLastSession(false, storage)

    expect(readResumeLastSession(storage)).toBe(false)
    expect(entries.get(RESUME_LAST_SESSION_PREFERENCE_KEY)).toBe('false')
    expect($resumeLastSession.get()).toBe(false)
  })

  it('rehydrates the atom from the same stored authority (a reopen keeps the choice)', () => {
    const { storage } = memoryStorage()

    setResumeLastSession(false, storage)
    $resumeLastSession.set(true)

    hydrateResumeLastSession(storage)

    expect($resumeLastSession.get()).toBe(false)
  })

  it('leaves the atom on the previous value when the write did not land', () => {
    const { storage } = memoryStorage({ failWrite: true })

    expect(() => setResumeLastSession(false, storage)).toThrow()
    expect($resumeLastSession.get()).toBe(true)
    expect(readResumeLastSession(storage)).toBe(true)
  })

  it('persists through the production localStorage binding', () => {
    setResumeLastSession(false)

    expect(readResumeLastSession(localStoragePreferenceStorage)).toBe(false)
  })
})
