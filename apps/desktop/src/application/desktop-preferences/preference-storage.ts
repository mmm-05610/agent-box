/**
 * The storage seam for Desktop-local preferences — pure logic, no DOM.
 *
 * A Desktop preference is owned by this machine, not by any Hermes profile, so
 * it must not ride `GET`/`PUT /api/config`. It lives in the renderer's own
 * storage instead, behind this narrow port so the preference adapters can be
 * tested with an in-memory store and the DOM binding stays in one file
 * (`./local-storage`).
 *
 * The write contract is deliberately stricter than `lib/storage`'s best-effort
 * `writeKey`: a preference the UI reports as saved has to be readable back.
 * `writeVerifiedPreference` performs that read-back and throws when the value
 * did not land, so a caller (the language port, the switches) can surface a
 * failure instead of silently reporting success.
 */

/** The one thing a Desktop preference needs from a backing store. */
export interface PreferenceStorage {
  /** The stored value, or null when absent or unreadable. */
  read: (key: string) => null | string
  /**
   * Store `value`. May throw (quota, permissions, storage unavailable) — an
   * implementation must not swallow that: the caller decides how to report it.
   */
  write: (key: string, value: string) => void
}

/** `true`/`false` as stored; anything absent or unrecognized is the fallback. */
export function readBooleanPreference(storage: PreferenceStorage, key: string, fallback: boolean): boolean {
  const stored = storage.read(key)

  return stored === null ? fallback : stored === 'true'
}

/**
 * Write, then prove it landed. A store that silently ignores the write (or the
 * value it echoes back is not what was asked for) is a failure, not a success:
 * the value is read back and a mismatch throws the caller's failure.
 */
export function writeVerifiedPreference(storage: PreferenceStorage, key: string, value: string): void {
  storage.write(key, value)

  if (storage.read(key) !== value) {
    throw new Error(`Desktop preference "${key}" did not persist`)
  }
}
