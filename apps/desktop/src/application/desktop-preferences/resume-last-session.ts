/**
 * "Reopen the last chat on launch", as a Desktop-local preference.
 *
 * The legacy shell kept this in the backend config record
 * (`display.resume_last_session`) and read it back with `GET /api/config`. The
 * AgentBox product serves no legacy REST surface, so the decision lives on the
 * machine that makes it, in the renderer's own storage — the shared
 * `$resumeLastSession` atom is the runtime authority the Appearance switch
 * writes and the product composition root reads.
 *
 * The value is always a definite boolean: the atom starts at the approved
 * default, `readResumeLastSession` never returns `undefined`, and hydration is
 * synchronous at the composition root — so the cold-start restore latch in
 * `useDesktopIntegrations` resolves without waiting for any backend.
 */

import { atom } from 'nanostores'

import { localStoragePreferenceStorage } from './local-storage'
import { type PreferenceStorage, readBooleanPreference, writeVerifiedPreference } from './preference-storage'

export const RESUME_LAST_SESSION_PREFERENCE_KEY = 'hermes-desktop-resume-last-session-v1'

/** The approved product default: reopen the most recent chat on cold start. */
export const RESUME_LAST_SESSION_DEFAULT = true

/** The live preference. Definite boolean by construction — never `undefined`. */
export const $resumeLastSession = atom<boolean>(RESUME_LAST_SESSION_DEFAULT)

/** The stored preference, or the approved default when nothing is stored. */
export function readResumeLastSession(storage: PreferenceStorage = localStoragePreferenceStorage): boolean {
  return readBooleanPreference(storage, RESUME_LAST_SESSION_PREFERENCE_KEY, RESUME_LAST_SESSION_DEFAULT)
}

/**
 * Flip the preference. Persist first, publish second: a write that did not land
 * must not look saved (the atom keeps its previous value and the error
 * propagates to the caller).
 */
export function setResumeLastSession(on: boolean, storage: PreferenceStorage = localStoragePreferenceStorage): void {
  writeVerifiedPreference(storage, RESUME_LAST_SESSION_PREFERENCE_KEY, String(on))
  $resumeLastSession.set(on)
}

/** Cold-start hydration: seed the shared atom from the same stored authority. */
export function hydrateResumeLastSession(storage: PreferenceStorage = localStoragePreferenceStorage): void {
  $resumeLastSession.set(readResumeLastSession(storage))
}
