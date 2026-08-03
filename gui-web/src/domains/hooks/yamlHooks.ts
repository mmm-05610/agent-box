/**
 * YamlHooks — read/merge the `hooks:` section of a config.yaml using the
 * yaml library. No hand-written line/regex parsing.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export interface HookEntry {
  command: string
}

export type HookPhases = Record<string, HookEntry[]>

/**
 * Structured `hooks:` section from a YAML fragment (or full config).
 * Phases map to their command entries; entries without a string `command`
 * are skipped.
 */
export function parseHooksSection(fragment: string): HookPhases {
  if (!fragment.trim()) return {}
  let parsed: unknown
  try {
    parsed = parseYaml(fragment)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const hooks = (parsed as Record<string, unknown>).hooks
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return {}

  const phases: HookPhases = {}
  for (const [phase, entries] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue
    const commands = entries
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      .map((entry) => entry.command)
      .filter((command): command is string => typeof command === 'string')
    if (commands.length > 0) phases[phase] = commands.map((command) => ({ command }))
  }
  return phases
}

/**
 * The `hooks:` fragment of a config.yaml — what the Monaco editor edits.
 * Returns '' when the config has no hooks section.
 */
export function extractHooksFragment(configYaml: string): string {
  if (!configYaml.trim()) return ''
  let doc: unknown
  try {
    doc = parseYaml(configYaml)
  } catch {
    return ''
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ''
  const hooks = (doc as Record<string, unknown>).hooks
  if (hooks === undefined) return ''
  return stringifyYaml({ hooks })
}

/**
 * Merge the edited hooks fragment back into the full config.yaml.
 * An empty fragment removes the hooks section. Throws when the fragment
 * is not valid YAML.
 */
export function mergeHooksIntoConfig(configYaml: string, hooksFragment: string): string {
  const doc = (parseYaml(configYaml) ?? {}) as Record<string, unknown>
  if (!hooksFragment.trim()) {
    delete doc.hooks
  } else {
    const fragment = parseYaml(hooksFragment)
    // The Monaco fragment is the whole `hooks:` block; unwrap it so we
    // don't nest hooks inside hooks. A fragment without the wrapper key
    // is used as-is.
    doc.hooks = fragment && typeof fragment === 'object' && !Array.isArray(fragment)
      ? ((fragment as Record<string, unknown>).hooks ?? fragment)
      : fragment
  }
  return stringifyYaml(doc)
}
