import type { AppLocale, SystemLanguageSettings } from "@/lib/types"

export const APP_LOCALES: readonly AppLocale[] = ["en", "zh_cn"]
const FALLBACK_APP_LOCALE: AppLocale = "en"
export const LANGUAGE_SETTINGS_STORAGE_KEY = "codeg.system_language_settings"
export const LANGUAGE_MODE_COOKIE_KEY = "codeg.language_mode"
export const LANGUAGE_COOKIE_KEY = "codeg.locale"
export type IntlLocale = "en" | "zh-CN"

export const DEFAULT_LANGUAGE_SETTINGS: SystemLanguageSettings = {
  mode: "system",
  language: FALLBACK_APP_LOCALE,
}

export const APP_LOCALE_TO_INTL_LOCALE: Record<AppLocale, IntlLocale> = {
  en: "en",
  zh_cn: "zh-CN",
}

export const INTL_LOCALE_TO_APP_LOCALE: Record<IntlLocale, AppLocale> = {
  en: "en",
  "zh-CN": "zh_cn",
}

export function isAppLocale(value: unknown): value is AppLocale {
  return APP_LOCALES.includes(value as AppLocale)
}

export function isIntlLocale(value: unknown): value is IntlLocale {
  return value === "en" || value === "zh-CN"
}

export function toIntlLocale(locale: AppLocale): IntlLocale {
  return APP_LOCALE_TO_INTL_LOCALE[locale]
}

export function fromIntlLocale(locale: IntlLocale): AppLocale {
  return INTL_LOCALE_TO_APP_LOCALE[locale]
}

export function normalizeLanguageSettings(
  settings: Partial<SystemLanguageSettings> | null | undefined
): SystemLanguageSettings {
  const mode = settings?.mode === "manual" ? "manual" : "system"
  const language = isAppLocale(settings?.language)
    ? settings.language
    : FALLBACK_APP_LOCALE

  return {
    mode,
    language,
  }
}

export function mapLocaleTagToAppLocale(localeTag: string): AppLocale | null {
  const normalized = localeTag.trim().toLowerCase().replace(/_/g, "-")

  if (!normalized) return null
  if (normalized.startsWith("en")) return "en"

  // Only zh-CN ships; every other Chinese variant (zh-Hant/TW/HK/MO) falls
  // back to it rather than to English.
  if (normalized.startsWith("zh")) return "zh_cn"

  return null
}

export function parseAcceptLanguageHeader(value: string | null): string[] {
  if (!value) return []

  return value
    .split(",")
    .map((entry) => entry.split(";")[0]?.trim())
    .filter((entry): entry is string => Boolean(entry))
}

export function parseLocaleFromCookieValue(
  value: string | undefined
): AppLocale | null {
  if (!value) return null

  if (isAppLocale(value)) return value
  if (isIntlLocale(value)) return fromIntlLocale(value)

  return mapLocaleTagToAppLocale(value)
}

export function getSystemLocaleCandidates(): string[] {
  if (typeof navigator === "undefined") return []

  const candidates = [
    ...(navigator.languages ?? []),
    navigator.language,
  ].filter((value): value is string => Boolean(value))

  return [...new Set(candidates)]
}

export function resolveSystemLocale(candidates: string[]): AppLocale | null {
  for (const candidate of candidates) {
    const resolved = mapLocaleTagToAppLocale(candidate)
    if (resolved) return resolved
  }

  return null
}

export function resolveAppLocale(
  settings: SystemLanguageSettings,
  systemLocaleCandidates: string[]
): AppLocale {
  if (settings.mode === "manual") {
    return settings.language
  }

  return resolveSystemLocale(systemLocaleCandidates) ?? FALLBACK_APP_LOCALE
}

// Read the currently-effective `AppLocale` synchronously. Reading the cookie
// (kept in sync by i18n-provider) sidesteps the system-mode case where the
// DB's `language` field doesn't reflect the real OS locale.
export function getCurrentEffectiveAppLocale(): AppLocale {
  if (typeof document !== "undefined") {
    try {
      const match = document.cookie
        .split("; ")
        .find((row) => row.startsWith(`${LANGUAGE_COOKIE_KEY}=`))
      if (match) {
        const value = decodeURIComponent(
          match.slice(LANGUAGE_COOKIE_KEY.length + 1)
        )
        const parsed = parseLocaleFromCookieValue(value)
        if (parsed) return parsed
      }
    } catch {
      // Malformed cookie value (e.g. broken URI sequence): fall through to
      // navigator-based resolution rather than crashing the caller.
    }
  }

  if (typeof navigator !== "undefined") {
    const resolved = resolveSystemLocale(getSystemLocaleCandidates())
    if (resolved) return resolved
  }

  return FALLBACK_APP_LOCALE
}
