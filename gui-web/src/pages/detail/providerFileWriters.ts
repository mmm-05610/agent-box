/**
 * Provider file writers — small helpers that patch per-agent-type config files
 * in place while preserving keys the form doesn't expose.
 *
 * Each function returns the updated file contents (string). Callers pass the
 * result to `saveFile()` along with the appropriate path.
 *
 * Files covered:
 *   - Codex:   config.toml — base_url + model_provider patching via patchCodexBaseUrl
 *   - Codex:   auth.json — JSON object with OPENAI_API_KEY
 *   - OpenCode: opencode.jsonc — JSON.parse + stringify (JSONC subset)
 *   - OpenCode: auth.json — JSON object keyed by provider id
 *   - Hermes:  config.yaml — line-based YAML patching (model.base_url, model.api_key)
 *   - Hermes:  .env       — line replacement for HERMES_API_KEY
 *
 * Parsing intentionally lightweight — no yaml / jsonc libs. Matches the
 * pattern in CodexProviderViewer and the existing perAgentSettings.ts.
 */


// ── Codex ───────────────────────────────────────────────────────────────

/** Find the top-level model_provider string from a Codex config.toml. */
export function extractCodexModelProvider(toml: string): string | null {
  const m = toml.match(/^\s*model_provider\s*=\s*(?:"([^"\r\n]+)"|'([^'\r\n]+)')\s*(?:#.*)?$/m)
  return m ? (m[1] ?? m[2] ?? '').trim() || null : null
}

/**
 * Patch ``model = "<id>"`` into a Codex config.toml.
 * If a top-level model line exists, replace it. Otherwise append.
 */
export function patchCodexModel(toml: string, newModel: string): string {
  if (!newModel) return toml
  const escaped = newModel.replace(/"/g, '\\"')
  if (/^\s*model\s*=\s*(?:"[^"\r\n]*"|'[^'\r\n]*')\s*(?:#.*)?$/m.test(toml)) {
    return toml.replace(
      /^(\s*model\s*=\s*)(?:"[^"\r\n]*"|'[^'\r\n]*')(\s*(?:#.*)?)$/m,
      `$1"${escaped}"$2`,
    )
  }
  return toml.trimEnd() + `\nmodel = "${escaped}"\n`
}

/** Patch the API key in Codex auth.json (single OPENAI_API_KEY field). */
export function patchCodexAuthJson(authJson: string, apiKey: string): string {
  let parsed: Record<string, unknown> = {}
  if (authJson.trim()) {
    try {
      const raw = JSON.parse(authJson)
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        parsed = raw as Record<string, unknown>
      }
    } catch {
      // Treat malformed auth.json as empty so we don't lose the key write.
    }
  }
  parsed.OPENAI_API_KEY = apiKey
  return JSON.stringify(parsed, null, 2) + '\n'
}

export {
  patchCodexBaseUrl,
  extractCodexBaseUrl,
} from '@/components/provider/serialization'

// ── OpenCode ────────────────────────────────────────────────────────────

interface ParsedOpenCodeJsonc {
  raw: string
  parsed: Record<string, unknown> | null
  parseError: string | null
}

/** Parse opencode.jsonc (JSON subset). Returns raw + parsed + error. */
export function parseOpenCodeJsonc(raw: string): ParsedOpenCodeJsonc {
  const trimmed = raw.trim()
  if (!trimmed) return { raw, parsed: {}, parseError: null }
  try {
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { raw, parsed: {}, parseError: null }
    }
    return { raw, parsed: parsed as Record<string, unknown>, parseError: null }
  } catch (error) {
    return {
      raw,
      parsed: null,
      parseError: error instanceof Error ? error.message : 'Invalid JSON',
    }
  }
}

/**
 * Patch a single provider entry's options.baseURL + options.apiKey in
 * opencode.jsonc. If the provider key doesn't exist, it's added. Other
 * providers + top-level keys are preserved verbatim.
 *
 * Pass providerName === null to skip (e.g. when no library match); the
 * existing structure is returned unchanged.
 */
export function patchOpenCodeProvider(
  raw: string,
  providerName: string | null,
  baseUrl: string,
  apiKey: string,
): string {
  const state = parseOpenCodeJsonc(raw)
  if (!state.parsed) {
    // Surface the parse error so callers can toast instead of silently writing
    // partial data. The viewer will typically display the raw text in that case.
    throw new Error(`opencode.jsonc is not valid JSON: ${state.parseError ?? 'unknown'}`)
  }
  if (!providerName) return JSON.stringify(state.parsed, null, 2) + '\n'

  const providerMap = (state.parsed.provider as Record<string, unknown> | undefined) ?? {}
  const existing = (providerMap[providerName] as Record<string, unknown> | undefined) ?? {}
  const options = {
    ...((existing.options as Record<string, unknown> | undefined) ?? {}),
  }
  if (baseUrl) options.baseURL = baseUrl
  if (apiKey) options.apiKey = apiKey
  const nextProvider = { ...existing, options }
  state.parsed.provider = { ...providerMap, [providerName]: nextProvider }
  return JSON.stringify(state.parsed, null, 2) + '\n'
}

/** Patch an entry in opencode's auth.json. Other entries preserved. */
export function patchOpenCodeAuthJson(authJson: string, providerName: string, apiKey: string): string {
  let parsed: Record<string, unknown> = {}
  if (authJson.trim()) {
    try {
      const raw = JSON.parse(authJson)
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        parsed = raw as Record<string, unknown>
      }
    } catch {
      // Treat malformed auth.json as empty.
    }
  }
  if (apiKey) {
    parsed[providerName] = apiKey
  } else {
    delete parsed[providerName]
  }
  return JSON.stringify(parsed, null, 2) + '\n'
}

/** Extract a provider's options.baseURL from opencode.jsonc. */
export function extractOpenCodeBaseUrl(raw: string, providerName: string | null): string | null {
  const state = parseOpenCodeJsonc(raw)
  if (!state.parsed || !providerName) return null
  const providerMap = state.parsed.provider as Record<string, unknown> | undefined
  const provider = providerMap?.[providerName] as Record<string, unknown> | undefined
  const options = provider?.options as Record<string, unknown> | undefined
  return typeof options?.baseURL === 'string' ? options.baseURL : null
}

/** Extract a provider's apiKey from opencode.jsonc. */
export function extractOpenCodeApiKey(raw: string, providerName: string | null): string | null {
  const state = parseOpenCodeJsonc(raw)
  if (!state.parsed || !providerName) return null
  const providerMap = state.parsed.provider as Record<string, unknown> | undefined
  const provider = providerMap?.[providerName] as Record<string, unknown> | undefined
  const options = provider?.options as Record<string, unknown> | undefined
  return typeof options?.apiKey === 'string' ? options.apiKey : null
}

// ── Hermes ──────────────────────────────────────────────────────────────

/**
 * Replace the value at ``\n  <key>: <value>`` inside the ``model:`` block of a
 * Hermes config.yaml. If the key doesn't exist inside model, append it.
 * Other top-level sections are left untouched.
 */
function patchModelScalar(yaml: string, key: string, newValue: string): string {
  if (!newValue) return yaml
  const lines = yaml.split(/\r?\n/)
  let inModel = false
  let patched = false
  const out: string[] = []
  for (const raw of lines) {
    if (/^model\s*:\s*$/.test(raw)) {
      inModel = true
      out.push(raw)
      continue
    }
    if (!inModel) { out.push(raw); continue }
    // Next top-level key ends the model section.
    if (/^[A-Za-z_]/.test(raw)) {
      if (!patched) out.push(`  ${key}: ${newValue}`)
      patched = true
      inModel = false
      out.push(raw)
      continue
    }
    const m = raw.match(/^(\s{2})([A-Za-z_]+)(\s*:\s*)(.+?)\s*$/)
    if (m && m[2] === key) {
      out.push(`${m[1]}${m[2]}${m[3]}${newValue}`)
      patched = true
      continue
    }
    out.push(raw)
  }
  if (inModel && !patched) out.push(`  ${key}: ${newValue}`)
  return out.join('\n')
}

/** Set model.default to ``<model>`` (top of model block). */
export function patchHermesModelDefault(yaml: string, model: string): string {
  return patchModelScalar(yaml, 'default', model)
}

/** Write the full models list into Hermes config.yaml. */
export function patchHermesModels(
  yaml: string,
  models: Array<{ id: string; name: string; context_length?: number }>,
): string {
  const lines = yaml.split('\n')
  const modelIndex = lines.findIndex((l) => /^\s*models\s*:/.test(l))
  const indent = '  '

  if (modelIndex === -1) {
    // models section doesn't exist — append at end
    const modelLines = ['models:']
    for (const m of models) {
      modelLines.push(`${indent}- id: ${quoteYaml(m.id)}`)
      modelLines.push(`${indent}  name: ${quoteYaml(m.name)}`)
      if (m.context_length) {
        modelLines.push(`${indent}  context_length: ${m.context_length}`)
      }
    }
    return [...lines, '', ...modelLines].join('\n')
  }

  // Find the end of the models section (next top-level key, no indent)
  let endIndex = modelIndex + 1
  while (endIndex < lines.length) {
    const l = lines[endIndex]
    if (l.trim() === '' || /^\S/.test(l)) break
    endIndex++
  }

  const prefix = lines.slice(0, modelIndex)
  const suffix = lines.slice(endIndex + 1) // skip trailing blank line too
  const modelLines = ['models:']
  for (const m of models) {
    modelLines.push(`${indent}- id: ${quoteYaml(m.id)}`)
    modelLines.push(`${indent}  name: ${quoteYaml(m.name)}`)
    if (m.context_length) {
      modelLines.push(`${indent}  context_length: ${m.context_length}`)
    }
  }

  return [...prefix, ...modelLines, ...suffix].join('\n')
}

function quoteYaml(s: string): string {
  if (/[:\{\}\[\],&\*\?\|<>=!%@`'\"#]/.test(s) || s.includes(' ') || s === '') {
    return `"${s.replace(/"/g, '\\"')}"`
  }
  return s
}

/** Set model.base_url (used by library apply). */
export function patchHermesBaseUrl(yaml: string, baseUrl: string): string {
  return patchModelScalar(yaml, 'base_url', baseUrl.replace(/\/+$/, ''))
}

/** Set model.api_key to ``<key>`` (literal) or ``${HERMES_API_KEY}`` if key empty. */
export function patchHermesApiKey(yaml: string, apiKey: string): string {
  // Match the template's convention: empty key → env reference.
  const value = apiKey ? apiKey : '${HERMES_API_KEY}'
  return patchModelScalar(yaml, 'api_key', value)
}

/**
 * Read/write ``HERMES_API_KEY=`` from a .env file. Returns the new full
 * contents. Comment lines and unrelated keys are preserved.
 */
export function patchHermesEnv(envContent: string, apiKey: string): string {
  const lines = envContent.split(/\r?\n/)
  let patched = false
  const out = lines.map((line) => {
    if (/^\s*#/.test(line)) return line
    if (/^HERMES_API_KEY\s*=/.test(line)) {
      patched = true
      return `HERMES_API_KEY=${apiKey}`
    }
    return line
  })
  if (!patched) {
    // Strip trailing blank line before appending.
    while (out.length > 0 && out[out.length - 1] === '') out.pop()
    out.push(`HERMES_API_KEY=${apiKey}`)
  }
  return out.join('\n')
}

/** Read HERMES_API_KEY from .env. Returns '' if not set. */
export function extractHermesApiKey(envContent: string): string {
  for (const line of envContent.split(/\r?\n/)) {
    const m = line.match(/^\s*HERMES_API_KEY\s*=\s*(.*?)\s*$/)
    if (m) return m[1] ?? ''
  }
  return ''
}

/** Read scalar fields from the ``model:`` block of config.yaml. */
export function extractHermesModelFields(yaml: string): {
  defaultModel: string | null
  baseUrl: string | null
  apiKey: string | null
} {
  const lines = yaml.split(/\r?\n/)
  const out = { defaultModel: null as string | null, baseUrl: null as string | null, apiKey: null as string | null }
  let inModel = false
  for (const raw of lines) {
    if (/^model\s*:\s*$/.test(raw)) { inModel = true; continue }
    if (!inModel) continue
    if (/^[A-Za-z_]/.test(raw)) break
    const m = raw.replace(/\s+#.*$/, '').match(/^\s{2}([A-Za-z_]+)\s*:\s*(.+?)\s*$/)
    if (!m) continue
    const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    if (m[1] === 'default') out.defaultModel = value
    else if (m[1] === 'base_url') out.baseUrl = value
    else if (m[1] === 'api_key') out.apiKey = value
  }
  return out
}
