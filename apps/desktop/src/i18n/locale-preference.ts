import type { Locale } from './types'

/**
 * The one thing i18n needs from whoever persists the user's language choice,
 * stated in i18n's own vocabulary.
 *
 * i18n owns the locale; the composition root owns where it is kept. The
 * provider never picks a backend, never reaches for a global store, and has no
 * fallback implementation — a surface without persistence passes `null` and
 * says so at its own call site. The production binding is
 * `hermesLocalePreference` (`src/hermes-locale-preference.ts`), which stores
 * the choice in the backend's config as `display.language`.
 */
export interface LocalePreferencePort {
  /**
   * The persisted preference, exactly as the backend stored it — any shape, any
   * alias (`zh-CN`, `zh_TW`, `de`). i18n normalizes it; an absent or unusable
   * value falls back to `DEFAULT_LOCALE`.
   */
  load: () => Promise<unknown>
  /** Persist `locale`. Rejects when the write did not land. */
  save: (locale: Locale) => Promise<void>
}
