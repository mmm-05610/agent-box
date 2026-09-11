/**
 * Theme and mode preferences, as they are stored.
 *
 * Skin and mode are each stored per profile: `default` *is* the legacy global
 * slot, so it reads and writes the global key directly, and every named profile
 * falls back to that global until it is given an appearance of its own. That is
 * the whole of "a profile inherits the global preference", and why single-profile
 * users and pre-per-profile installs are unaffected by any of this.
 *
 * The `ThemePreferencePort` at the bottom is the half the presenter may see;
 * nothing in the pure core or the presenter reads a key.
 */

import { persistString, persistStringRecord, storedString, storedStringRecord } from '@/lib/storage'
import type { ThemePreferencePort } from '@/themes/ports'
import { DEFAULT_SKIN_NAME } from '@/themes/presets'
import { listThemes, normalizeMode, normalizeSkinName } from '@/themes/resolve'

import { themeSource } from './user-themes'

// Legacy global skin (pre per-profile themes). Still the inheritance fallback
// for any profile without its own assignment, so single-profile users and old
// installs are unaffected.
export const SKIN_KEY = 'hermes-desktop-theme-v2'
export const MODE_KEY = 'hermes-desktop-mode-v1'
// Per-profile skin + light/dark mode assignments: { [profileKey]: value }.
export const PROFILE_SKINS_KEY = 'hermes-desktop-profile-themes-v1'
export const PROFILE_MODES_KEY = 'hermes-desktop-profile-modes-v1'
// Last active profile, recorded so the boot-time paint can pick that profile's
// theme before the gateway reports which profile actually launched.
export const LAST_PROFILE_KEY = 'hermes-desktop-active-profile-v1'

/** Everything a peer window could change that this one has to repaint for. */
export const APPEARANCE_KEYS: ReadonlySet<string> = new Set([
  SKIN_KEY,
  PROFILE_SKINS_KEY,
  MODE_KEY,
  PROFILE_MODES_KEY
])

interface ProfilePref<T> {
  /** The pick as written, un-normalized. */
  stored: (profile: string) => null | string
  resolve: (profile: string) => T
  assign: (profile: string, value: T) => void
}

const profilePref = <T extends string>(
  record: string,
  legacy: string,
  normalize: (value: null | string) => T
): ProfilePref<T> => {
  const stored = (profile: string): null | string => storedStringRecord(record)[profile] ?? storedString(legacy)

  return {
    stored,
    resolve: (profile: string): T => normalize(stored(profile)),
    assign: (profile: string, value: T): void => {
      if (profile === 'default') {
        persistString(legacy, value)
      } else {
        persistStringRecord(record, { ...storedStringRecord(record), [profile]: value })
      }
    }
  }
}

/** The merged set a stored skin name is normalized against — the app's live registry. */
const mergedThemes = () => listThemes(themeSource())

export const skinPref = profilePref(PROFILE_SKINS_KEY, SKIN_KEY, name => normalizeSkinName(name, mergedThemes()))
export const modePref = profilePref(PROFILE_MODES_KEY, MODE_KEY, normalizeMode)

/** The skin a scope paints, as written: an unresolvable name is kept, not flattened. */
export const storedSkin = (scope: string): string => skinPref.stored(scope) ?? DEFAULT_SKIN_NAME

/** The scope the last session ended on, as written, for the boot-time paint. */
export const storedScope = (): null | string => storedString(LAST_PROFILE_KEY)

/** Record the active scope so the next launch's first frame paints its theme. */
export const rememberScope = (scope: string): void => persistString(LAST_PROFILE_KEY, scope)

/**
 * The same preferences, as a port.
 *
 * This is the half the presenter is allowed to see: read a scope, commit a pick,
 * hear about a peer window's write. The keys, the legacy fallback and the
 * per-profile record stay behind it — which is why the provider can be a leaf.
 */
export const themePreferences: ThemePreferencePort = {
  // The raw pick, deliberately: a name that does not resolve YET (a backend skin
  // the gateway hasn't seeded on this launch) has to survive to be painted once
  // it can, instead of being flattened to the default for the rest of the session.
  read: scope => ({ theme: storedSkin(scope), mode: modePref.resolve(scope) }),

  assign: (scope, next) => {
    if (next.theme !== undefined) {
      skinPref.assign(scope, next.theme)
    }

    if (next.mode !== undefined) {
      modePref.assign(scope, next.mode)
    }
  },

  // Appearance lives in per-origin `localStorage`, and every desktop window is
  // another renderer on that origin — so a switch made in the HUD (or any peer
  // window) only ever repainted the window it was made in. `storage` fires in
  // the OTHER windows, which is exactly the set that needs to catch up.
  subscribe: onChange => {
    const onStorage = (event: StorageEvent) => {
      if (event.key && !APPEARANCE_KEYS.has(event.key)) {
        return
      }

      onChange()
    }

    window.addEventListener('storage', onStorage)

    return () => window.removeEventListener('storage', onStorage)
  }
}
