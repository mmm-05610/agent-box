import type { ProviderModelConfigRecord } from '@/types/wire/wire-v1'

/**
 * The provider presets this client ships, as DATA.
 *
 * They carry identifiers only. Endpoint, authentication scheme, protocol
 * style and credential-variable names do NOT exist on the locked wire — they
 * are backend 55's model — so nothing here invents them: a preset that
 * pretended to know a base URL would be a fabricated connection fact the
 * service has never seen. When the wire grows those fields, this catalog gains
 * them as values, and the form keeps its shape.
 */
export interface ProviderPreset {
  /** The value written to `ProviderModelConfigRecord.provider`. */
  id: string
  /** Display name only; never parsed. */
  label: string
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'moonshot', label: 'Moonshot' },
  { id: 'xai', label: 'xAI' }
]

/** The sentinels for "type it instead" — an explicit override, never the
 *  default path (and never hidden: the override is what a first-run install
 *  with an empty directory legitimately needs). */
export const CUSTOM_HARNESS = '__custom_harness__'
export const CUSTOM_PROVIDER = '__custom_provider__'

export interface ProviderOption extends ProviderPreset {
  /** True for values a service record already carries — shown as in-use so
   *  the directory's own data is selectable without retyping it. */
  inUse: boolean
}

/** Presets first, then the provider ids the service's own records carry.
 *  Pure; the caller decides the labels' group headings. */
export function providerOptions(used: readonly string[]): ProviderOption[] {
  const presets = PROVIDER_PRESETS.map(preset => ({ ...preset, inUse: false }))
  const known = new Set(presets.map(preset => preset.id))

  for (const id of used) {
    if (id && !known.has(id)) {
      known.add(id)
      presets.push({ id, inUse: true, label: id })
    }
  }

  return presets
}

/** Harness families the service has actually declared (its records' `harness`
 *  values). No catalog of "known harnesses" is invented here: a family this
 *  client has never seen would still be accepted by the service, but naming it
 *  from a local list would be the client deciding what the service supports. */
export function harnessOptions(declared: readonly string[], current: string): string[] {
  const values = new Set(declared.filter(Boolean))

  if (current) {
    values.add(current)
  }

  return [...values].sort((left, right) => left.localeCompare(right))
}

/** Model ids the service's records already carry for one provider — the
 *  suggestion source for the model-id field. Still an input: the model's own
 *  name is the service's to validate, and the wire has no directory to pick
 *  from yet. */
export function knownModelIds(records: readonly ProviderModelConfigRecord[], provider: string): string[] {
  const ids = new Set<string>()

  for (const record of records) {
    if (record.provider !== provider) {
      continue
    }

    for (const model of record.models) {
      if (model.modelId) {
        ids.add(model.modelId)
      }
    }
  }

  return [...ids].sort((left, right) => left.localeCompare(right))
}
