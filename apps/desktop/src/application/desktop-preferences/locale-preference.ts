/**
 * The language choice, as a Desktop-local preference.
 *
 * The other binding of i18n's `LocalePreferencePort`
 * (`application/hermes-locale-preference`) stores `display.language` in the
 * backend config; that surface only exists under an explicit Hermes authority.
 * The AgentBox product persists the locale on this machine instead, and unlike
 * the Hermes port there is no "no bridge" fallback to swallow the write: the
 * provider rolls back and the switcher reports the failure, so a locale the app
 * cannot keep is never presented as kept.
 *
 * The write goes through `writeVerifiedPreference` (write + read-back, throw on
 * mismatch) because `lib/storage`'s best-effort write cannot prove anything
 * landed — and an unprovable write here is exactly the silent no-op this port
 * exists to remove.
 */

import { type Locale, localeConfigValue, type LocalePreferencePort } from '@/i18n'

import { localStoragePreferenceStorage } from './local-storage'
import { type PreferenceStorage, writeVerifiedPreference } from './preference-storage'

export const LOCALE_PREFERENCE_KEY = 'hermes-desktop-locale-v1'

/**
 * The port, bound to a store. `load` resolves the raw stored value (i18n
 * normalizes it, aliases included); `save` rejects unless the value verified.
 */
export function createDesktopLocalePreference(storage: PreferenceStorage): LocalePreferencePort {
  return {
    load: async () => storage.read(LOCALE_PREFERENCE_KEY) ?? undefined,
    save: async (locale: Locale) => {
      writeVerifiedPreference(storage, LOCALE_PREFERENCE_KEY, localeConfigValue(locale))
    }
  }
}

/** The production binding: this machine's storage. */
export const desktopLocalePreference = createDesktopLocalePreference(localStoragePreferenceStorage)
