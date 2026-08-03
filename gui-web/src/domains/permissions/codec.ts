/**
 * Permissions codec — parse/serialize permission configs with open-source
 * libraries (yaml / smol-toml) and resolve backend block fields onto the
 * parsed document. No hand-written yaml/toml parsing.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'

export type ConfigFormat = 'json' | 'jsonc' | 'yaml' | 'toml'

export interface PermissionBlock {
  type: 'rule_groups' | 'select' | 'toggle_list' | 'tool_matrix' | 'raw_editor'
  field?: string
  groups?: string[]
  rule_format?: string
  suggested_tools?: string[]
  options?: string[]
  items?: string[]
  tools?: string[]
  values?: string[]
  label?: string
}

export interface PermissionsResource {
  config_file?: string
  config_key?: string
  blocks?: PermissionBlock[]
}

export function inferFormat(configFile: string | undefined): ConfigFormat {
  if (configFile?.endsWith('.toml')) return 'toml'
  if (configFile?.endsWith('.yaml') || configFile?.endsWith('.yml')) return 'yaml'
  if (configFile?.endsWith('.jsonc')) return 'jsonc'
  return 'json'
}

/** Monaco language label for a config format. */
export function editorLanguage(format: ConfigFormat): 'json' | 'yaml' | 'toml' {
  if (format === 'yaml') return 'yaml'
  if (format === 'toml') return 'toml'
  return 'json'
}

/**
 * Strip comments from JSONC (string-aware). Preprocessing only — the actual
 * parse is done by the yaml library (handles JSON flow + trailing commas).
 */
function stripJsoncComments(source: string): string {
  let out = ''
  let inString = false
  let inLine = false
  let inBlock = false
  let quote = ''
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!
    const next = source[i + 1]
    if (inLine) {
      if (char === '\n') { inLine = false; out += char }
      continue
    }
    if (inBlock) {
      if (char === '*' && next === '/') { inBlock = false; i++ }
      continue
    }
    if (inString) {
      out += char
      if (char === '\\' && next) { out += next; i++; continue }
      if (char === quote) inString = false
      continue
    }
    if (char === '"' || char === "'") { inString = true; quote = char; out += char; continue }
    if (char === '/' && next === '/') { inLine = true; i++; continue }
    if (char === '/' && next === '*') { inBlock = true; i++; continue }
    out += char
  }
  return out
}

/**
 * Parse a config file into a plain object. Returns null when the file is
 * not parseable (structured editors are then disabled to avoid data loss).
 */
export function parseConfig(raw: string, format: ConfigFormat): Record<string, unknown> | null {
  if (!raw.trim()) return {}
  try {
    if (format === 'toml') {
      const parsed = parseToml(raw)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    }
    if (format === 'yaml') {
      const parsed = parseYaml(raw)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    }
    // json / jsonc — JSON.parse first, then a JSONC-tolerant yaml parse.
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      const parsed = parseYaml(stripJsoncComments(raw))
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    }
  } catch {
    return null
  }
}

export function stringifyConfig(doc: Record<string, unknown>, format: ConfigFormat): string {
  if (format === 'toml') return stringifyToml(doc as Parameters<typeof stringifyToml>[0])
  if (format === 'yaml') return stringifyYaml(doc)
  return JSON.stringify(doc, null, 2)
}

export function getFieldAt(doc: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object' && !Array.isArray(acc)) {
      return (acc as Record<string, unknown>)[segment]
    }
    return undefined
  }, doc)
}

export function setFieldAt(doc: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.')
  let cursor = doc
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!
    const next = cursor[segment]
    if (next && typeof next === 'object' && !Array.isArray(next)) {
      cursor = next as Record<string, unknown>
    } else {
      const created: Record<string, unknown> = {}
      cursor[segment] = created
      cursor = created
    }
  }
  cursor[segments[segments.length - 1]!] = value
}

/**
 * Where a block's value lives on the document.
 * - tool_matrix blocks write the config_key itself.
 * - When a block's field equals config_key, config_key is a scalar field
 *   (e.g. codex approval_policy) and other blocks use top-level paths.
 * - Otherwise config_key is a container (e.g. permissions / approvals) and
 *   fields are relative to it.
 */
export function blockFieldPath(
  doc: Record<string, unknown>,
  configKey: string,
  field: string | undefined,
  configKeyIsField: boolean,
): string {
  if (!field || field === configKey) return configKey
  if (!configKeyIsField) {
    const container = getFieldAt(doc, configKey)
    if (container === undefined || (typeof container === 'object' && container !== null && !Array.isArray(container))) {
      return `${configKey}.${field}`
    }
  }
  return field
}

/** Split a rule like `Bash(npm run *)` per the backend rule_format. */
export function splitRule(rule: string, ruleFormat: string): { tool: string | null; pattern: string } {
  if (ruleFormat === 'tool(pattern)') {
    const match = rule.match(/^([A-Za-z0-9_]+)\((.+)\)$/)
    if (match) return { tool: match[1] ?? null, pattern: match[2] ?? '' }
  }
  return { tool: null, pattern: rule }
}

export function joinRule(tool: string, pattern: string, ruleFormat: string): string {
  if (ruleFormat === 'tool(pattern)' && tool) return `${tool}(${pattern})`
  return pattern
}
