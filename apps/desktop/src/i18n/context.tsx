import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { TRANSLATIONS } from './catalog'
import { DEFAULT_LOCALE, normalizeLocale } from './languages'
import type { LocalePreferencePort } from './locale-preference'
import { setRuntimeI18nLocale } from './runtime'
import type { Locale, Translations } from './types'

export { LOCALE_META } from './languages'

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

const RTL_LOCALES = new Set<Locale>(['ar'])

function applyDocumentLocale(locale: Locale) {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.lang = locale
  document.documentElement.dir = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr'
}

export interface I18nContextValue {
  configLoadError: Error | null
  isLoadingConfig: boolean
  isSavingLocale: boolean
  locale: Locale
  saveError: Error | null
  setLocale: (next: Locale) => Promise<void>
  t: Translations
}

const I18nContext = createContext<I18nContextValue>({
  configLoadError: null,
  isLoadingConfig: false,
  isSavingLocale: false,
  locale: DEFAULT_LOCALE,
  saveError: null,
  setLocale: async () => {},
  t: TRANSLATIONS[DEFAULT_LOCALE]
})

export interface I18nProviderProps {
  children: ReactNode
  initialLocale?: unknown
  /**
   * Where the language choice is persisted, injected by the composition root.
   * Required, and `null` is a real answer: a surface with no persistence must
   * say so here rather than let the provider guess a backend.
   */
  localePreference: LocalePreferencePort | null
}

export function I18nProvider({ children, initialLocale, localePreference }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => normalizeLocale(initialLocale))
  const [isLoadingConfig, setIsLoadingConfig] = useState(false)
  const [isSavingLocale, setIsSavingLocale] = useState(false)
  const [configLoadError, setConfigLoadError] = useState<Error | null>(null)
  const [saveError, setSaveError] = useState<Error | null>(null)
  const localeRef = useRef(locale)
  // Set once the user picks a language through setLocale: a startup read that
  // resolves (or fails) after that must never overwrite an explicit choice.
  const userLocaleRef = useRef(false)

  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    localeRef.current = locale
    setRuntimeI18nLocale(locale)
    applyDocumentLocale(locale)
  }, [locale])

  useEffect(() => {
    if (!localePreference) {
      return
    }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryCount = 0

    // The desktop races its own backend at startup: the renderer mounts before
    // the backend is ready, so the first /api/config call can time out. We keep
    // the established permanent-failure contract — a rejected config load
    // settles on English so the UI stays usable — but bounded retries recover
    // transient startup failures, applying the persisted display.language once
    // the backend comes up.
    const MAX_LOCALE_RETRIES = 10
    const LOCALE_RETRY_DELAY_MS = 3_000

    const loadLocale = () => {
      setIsLoadingConfig(true)
      setConfigLoadError(null)

      return localePreference
        .load()
        .then(persisted => {
          if (!cancelled && !userLocaleRef.current) {
            setLocaleState(normalizeLocale(persisted))
          }
        })
        .catch(error => {
          if (cancelled || userLocaleRef.current) {
            return
          }

          setConfigLoadError(toError(error))
          setLocaleState(DEFAULT_LOCALE)

          if (retryCount < MAX_LOCALE_RETRIES) {
            retryCount += 1
            retryTimer = setTimeout(() => {
              loadLocale()
            }, LOCALE_RETRY_DELAY_MS)
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoadingConfig(false)
          }
        })
    }

    loadLocale()

    return () => {
      cancelled = true

      if (retryTimer) {
        clearTimeout(retryTimer)
      }
    }
  }, [localePreference, initialLocale])

  const setLocale = useCallback(
    async (next: Locale) => {
      const previousLocale = localeRef.current

      userLocaleRef.current = true
      setSaveError(null)
      setLocaleState(next)

      if (!localePreference) {
        return
      }

      setIsSavingLocale(true)

      try {
        await localePreference.save(next)
      } catch (error) {
        const nextError = toError(error)

        setLocaleState(previousLocale)
        setSaveError(nextError)

        throw nextError
      } finally {
        setIsSavingLocale(false)
      }
    },
    [localePreference]
  )

  const value = useMemo<I18nContextValue>(
    () => ({
      configLoadError,
      isLoadingConfig,
      isSavingLocale,
      locale,
      saveError,
      setLocale,
      t: TRANSLATIONS[locale]
    }),
    [configLoadError, isLoadingConfig, isSavingLocale, locale, saveError, setLocale]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
