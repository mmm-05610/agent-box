/**
 * The terminal font, as a Desktop-local preference.
 *
 * `$terminalFontFamily` is the live authority the terminal already consumes
 * (`useTerminalFontController`), so publishing the stored value into the atom
 * IS applying it. The legacy shell seeded that atom from the backend config
 * record; the AgentBox product seeds it from this machine's storage instead —
 * no `GET`/`PUT /api/config`, and the choice survives a restart.
 */

import { $terminalFontFamily, normalizeTerminalFontFamily } from '@/application/terminal/terminal-font'

import { localStoragePreferenceStorage } from './local-storage'
import { type PreferenceStorage, writeVerifiedPreference } from './preference-storage'

export const TERMINAL_FONT_FAMILY_PREFERENCE_KEY = 'hermes-desktop-terminal-font-family-v1'

/** The stored font family, normalized; empty means the bundled default. */
export function readTerminalFontFamilyPreference(
  storage: PreferenceStorage = localStoragePreferenceStorage
): string {
  return normalizeTerminalFontFamily(storage.read(TERMINAL_FONT_FAMILY_PREFERENCE_KEY))
}

/**
 * Persist and apply. Persist first, publish second: a write that did not land
 * leaves the atom on the previous font instead of pretending it stuck.
 */
export function setTerminalFontFamilyPreference(
  value: unknown,
  storage: PreferenceStorage = localStoragePreferenceStorage
): void {
  const normalized = normalizeTerminalFontFamily(value)

  writeVerifiedPreference(storage, TERMINAL_FONT_FAMILY_PREFERENCE_KEY, normalized)
  $terminalFontFamily.set(normalized)
}

/** Cold-start hydration: seed the atom the terminal reads from. */
export function hydrateTerminalFontFamilyPreference(storage: PreferenceStorage = localStoragePreferenceStorage): void {
  $terminalFontFamily.set(readTerminalFontFamilyPreference(storage))
}
