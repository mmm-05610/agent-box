import { getHermesConfigRecord, saveHermesConfig } from '@/api/config'
import { isLegacyRestAllowed } from '@/api/legacy-rest'
import { type Locale, localeConfigValue, type LocalePreferencePort } from '@/i18n'
import { type HermesConfigRecord } from '@/types/hermes'

/**
 * The production binding of i18n's `LocalePreferencePort` to the backend config
 * — the app-layer half of language persistence, kept out of `src/i18n` so the
 * catalog stays a leaf.
 *
 * i18n asks only "what was stored?" and "store this locale". Every Hermes fact
 * lives here: the preference IS `display.language`, the write is a
 * read-modify-write so unrelated config keys survive, and a config store that
 * answers `{ ok: false }` is a rejection rather than a silent no-op.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `display.language` out of a raw config record, whatever it holds. */
export function getConfigDisplayLanguage(config: HermesConfigRecord): unknown {
  return isRecord(config.display) ? config.display.language : undefined
}

/** A copy of `config` carrying `locale` as `display.language`, leaving every
 *  other key — including the rest of `display` — untouched. */
export function withConfigDisplayLanguage(config: HermesConfigRecord, locale: Locale): HermesConfigRecord {
  const display = isRecord(config.display) ? config.display : {}

  return {
    ...config,
    display: {
      ...display,
      language: localeConfigValue(locale)
    }
  }
}

// The renderer also runs outside Electron (HUD/overlay roots, unit tests, the
// browser dev shell) where there is no config bridge at all. Reading then
// yields nothing and writing is a no-op, which is exactly how the pre-port
// `defaultConfigClient` behaved — a missing bridge is not a failure to report.
//
// The same is true of the AgentBox product runtime: `window.hermesDesktop.api`
// exists, but the legacy Hermes REST surface behind it is deliberately not
// served (the renderer door is closed by `applyProductRuntimePolicy`), so
// issuing a config read/write there can only ever be refused. A bridge that
// cannot serve the surface is not a bridge, which keeps this port's declared
// contract true: `load()` resolves "nothing stored" and `save()` is a no-op
// instead of a guaranteed-failure request (and its 10×3s startup retry chain).
// The language switcher lives on the legacy appearance surface; giving the
// product an honest "locale persistence unavailable" UI is a separate product
// decision, not something this port may fake.
function hasConfigBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.hermesDesktop?.api) && isLegacyRestAllowed()
}

export const hermesLocalePreference: LocalePreferencePort = {
  load: () =>
    hasConfigBridge() ? getHermesConfigRecord().then(getConfigDisplayLanguage) : Promise.resolve(undefined),

  save: async locale => {
    if (!hasConfigBridge()) {
      return
    }

    const latestConfig = await getHermesConfigRecord()
    const result = await saveHermesConfig(withConfigDisplayLanguage(latestConfig, locale))

    if (!result.ok) {
      throw new Error('Failed to save language')
    }
  }
}
