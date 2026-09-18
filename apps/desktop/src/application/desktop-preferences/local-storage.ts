/**
 * The production `PreferenceStorage`: the renderer's own localStorage.
 *
 * Kept apart from `./preference-storage` so the read-back/verification logic is
 * a pure function of the port — a test can exercise every failure mode without
 * a DOM. Here the only decisions are "where is the store" and "let a write
 * failure throw". Reads collapse to `null` (storage disabled or absent) because
 * "nothing stored" is a valid answer; writes throw because the caller has to
 * hear about a preference that did not land.
 */

import type { PreferenceStorage } from './preference-storage'

function localStorageOrNull(): null | Storage {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    // Access itself can throw under a storage-disabling policy (private mode,
    // blocked third-party context). It reads as "no store", same as absent.
    return null
  }
}

export const localStoragePreferenceStorage: PreferenceStorage = {
  read: key => {
    try {
      return localStorageOrNull()?.getItem(key) ?? null
    } catch {
      return null
    }
  },
  write: (key, value) => {
    const storage = localStorageOrNull()

    if (!storage) {
      throw new Error(`No localStorage to persist Desktop preference "${key}"`)
    }

    storage.setItem(key, value)
  }
}
