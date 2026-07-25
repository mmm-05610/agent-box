/**
 * perAgentSettings — bridge ProviderFormValues ↔ per-agent_type settings_config.
 *
 * The form UI (ProviderFormFields) is unified across all agent types, but the
 * underlying settings_config shape differs per app:
 *
 *   claude  : { env: { ANTHROPIC_*, ... }, apiFormat, ... }
 *   codex   : { auth: { OPENAI_API_KEY }, config: "<TOML string>" }
 *   hermes  : { base_url, api_key, ... }
 *   opencode: { npm, options: { baseURL, apiKey, ... }, models: {...} }
 *
 * `getInitialFormValues` lifts (api_key, base_url) out of the right slot;
 * `settingsFromFormValues` writes them back into the right slot while
 * preserving every other key (TOML block, models, npm, etc.) so edits
 * never clobber fields the form doesn't expose.
 *
 * Mirrors the per-app extraction contract in
 * `agent_box.providers.resolve_usage_credentials` (Python) and
 * cc-switch's `useHermesFormState` / `useCodexFormState` hooks (TS).
 */
import type { ProviderFormValues } from './ProviderFormFields'
import { defaultFormValues } from './ProviderFormFields'
import type { HermesApiMode, HermesModel } from './forms/HermesProviderForm'

// ── Read: settings_config → form values ──────────────────────────────────

/**
 * Read the initial ProviderFormValues for a given agent_type from a stored
 * settings_config. ``settings`` is the parsed settings_config object (or
 * undefined for new providers).
 */
export function getInitialFormValues(
  agentType: string,
  settings: Record<string, unknown> | undefined,
): ProviderFormValues {
  switch (agentType) {
    case 'codex':
      return getInitialCodexFormValues(settings)
    case 'hermes':
      return getInitialHermesFormValues(settings)
    case 'opencode':
      return getInitialOpencodeFormValues(settings)
    case 'claude':
    default:
      return defaultFormValues(
        (settings?.env as Record<string, string> | undefined) ?? {},
        undefined,
        undefined,
        settings,
      )
  }
}

function getInitialCodexFormValues(
  settings: Record<string, unknown> | undefined,
): ProviderFormValues {
  const auth = (settings?.auth as Record<string, unknown> | undefined) ?? {}
  const configText = (settings?.config as string | undefined) ?? ''
  // Lift base_url from the active ``[model_providers.<X>]`` block — same
  // precedence rules as the Python resolver + cc-switch's TS extractor.
  const baseUrl = extractCodexBaseUrl(configText) ?? ''
  const authValue =
    typeof auth.OPENAI_API_KEY === 'string' ? auth.OPENAI_API_KEY : ''
  const testConfig = (settings?.testConfig as Record<string, unknown> | undefined) ?? {}
  return defaultFormValues(
    injectClaudeShape(baseUrl, authValue),
    undefined,
    undefined,
    {
      ...settings,
      apiFormat: settings?.apiFormat ?? 'openai_responses',
      isFullUrl: settings?.isFullUrl ?? false,
      testTimeout: testConfig.timeoutSecs !== undefined ? String(testConfig.timeoutSecs) : '',
      testDegradedThreshold: testConfig.degradedThresholdMs !== undefined ? String(testConfig.degradedThresholdMs) : '',
      testMaxRetries: testConfig.maxRetries !== undefined ? String(testConfig.maxRetries) : '',
      costMultiplier: settings?.costMultiplier !== undefined ? String(settings.costMultiplier) : '',
      pricingModelSource: settings?.pricingModelSource ?? 'inherit',
    },
  )
}

function getInitialHermesFormValues(
  settings: Record<string, unknown> | undefined,
): ProviderFormValues {
  const baseUrl =
    typeof settings?.base_url === 'string' ? settings.base_url : ''
  const authValue =
    typeof settings?.api_key === 'string' ? settings.api_key : ''
  return defaultFormValues(
    injectClaudeShape(baseUrl, authValue),
    undefined,
    undefined,
    settings,
  )
}

function getInitialOpencodeFormValues(
  settings: Record<string, unknown> | undefined,
): ProviderFormValues {
  const options =
    (settings?.options as Record<string, unknown> | undefined) ?? {}
  const baseUrl =
    typeof options.baseURL === 'string' ? options.baseURL : ''
  const authValue =
    typeof options.apiKey === 'string' ? options.apiKey : ''
  return defaultFormValues(
    injectClaudeShape(baseUrl, authValue),
    undefined,
    undefined,
    settings,
  )
}

/**
 * Reuse defaultFormValues()'s ANTHROPIC_* plumbing by injecting a synthetic
 * env that the form's existing fields read from. Stripped before save —
 * see ``stripClaudeShape()``.
 */
function injectClaudeShape(
  baseUrl: string,
  authValue: string,
): Record<string, string> {
  return {
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: authValue,
  }
}

// ── Write: form values → settings_config (merge, don't clobber) ───────────

/**
 * Build the final settings_config from a form submission, preserving any
 * fields the form doesn't expose. ``currentSettings`` is the row's existing
 * settings_config (or empty object for new providers).
 *
 * Crucially, this is MERGE: unknown keys in ``currentSettings`` are kept
 * untouched. Saves will no longer wipe codex's TOML config, opencode's
 * ``models`` map, or hermes' other top-level yaml fields.
 */
export function settingsFromFormValues(
  agentType: string,
  currentSettings: Record<string, unknown>,
  fv: ProviderFormValues,
  presetDefaults?: Record<string, unknown>,
  extras?: {
    hermes?: { apiMode?: HermesApiMode; models?: HermesModel[]; rateLimitDelay?: number }
    opencode?: { extraOptions?: Record<string, unknown> }
  },
): Record<string, unknown> {
  // Shared shape (claude + meta overrides)
  const next: Record<string, unknown> = { ...currentSettings }

  // Always editable: name, notes, website_url
  if (fv.name !== undefined) next.name = fv.name
  if (fv.notes !== undefined) next.notes = fv.notes
  if (fv.websiteUrl !== undefined) next.website_url = fv.websiteUrl

  switch (agentType) {
    case 'codex':
      return applyCodexEdits(next, fv, currentSettings, presetDefaults)
    case 'hermes':
      return applyHermesEdits(next, fv, currentSettings, presetDefaults, extras?.hermes)
    case 'opencode':
      return applyOpencodeEdits(next, fv, currentSettings, presetDefaults, extras?.opencode)
    case 'claude':
    default:
      return applyClaudeEdits(next, fv, currentSettings)
  }
}

function applyClaudeEdits(
  next: Record<string, unknown>,
  fv: ProviderFormValues,
  current: Record<string, unknown>,
): Record<string, unknown> {
  // Rebuild env from fv, preserving any pre-existing keys the form didn't
  // touch (the form only edits ANTHROPIC_* + a few meta flags).
  const env: Record<string, string> = {
    ...((current.env as Record<string, string> | undefined) ?? {}),
    ANTHROPIC_BASE_URL: fv.baseUrl,
    [fv.useApiKey ? 'ANTHROPIC_API_KEY' : 'ANTHROPIC_AUTH_TOKEN']: fv.authValue,
  }
  delete env[fv.useApiKey ? 'ANTHROPIC_AUTH_TOKEN' : 'ANTHROPIC_API_KEY']
  if (fv.fallbackModel) env.ANTHROPIC_MODEL = fv.fallbackModel
  for (const r of MODEL_ROLES) {
    const rm = fv.roleModels[r.role]
    if (rm.model) env[r.modelField] = rm.model
    if (rm.name) env[r.nameField] = rm.name
  }
  if (fv.timeoutMs) env.API_TIMEOUT_MS = fv.timeoutMs
  if (fv.disableAutoUpdates) env.DISABLE_AUTOUPDATER = '1'
  // Strip empty values to avoid clobbering
  for (const k of Object.keys(env)) if (!env[k]) delete env[k]
  next.env = env
  if (fv.apiFormat && fv.apiFormat !== 'anthropic') next.apiFormat = fv.apiFormat; else delete next.apiFormat
  if (fv.effortLevel) next.effortLevel = fv.effortLevel; else delete next.effortLevel
  if (fv.includeCoAuthoredBy) next.includeCoAuthoredBy = true; else delete next.includeCoAuthoredBy
  if (fv.enableToolSearch) next.ENABLE_TOOL_SEARCH = true; else delete next.ENABLE_TOOL_SEARCH
  if (fv.skipWebFetchPreflight) next.skipWebFetchPreflight = true; else delete next.skipWebFetchPreflight
  if (fv.customUserAgent) next.customUserAgent = fv.customUserAgent; else delete next.customUserAgent
  return next
}

function applyCodexEdits(
  next: Record<string, unknown>,
  fv: ProviderFormValues,
  current: Record<string, unknown>,
  presetDefaults?: Record<string, unknown>,
): Record<string, unknown> {
  // env is unused by codex — drop any ANTHROPIC_* from the prior merge.
  delete next.env
  // auth.OPENAI_API_KEY from the form's authValue
  const auth = { ...((current.auth as Record<string, unknown>) ?? {}) }
  if (fv.authValue) auth.OPENAI_API_KEY = fv.authValue
  else delete auth.OPENAI_API_KEY
  next.auth = auth
  // config TOML — re-extract base_url and patch it into the active section.
  // Falls back to ``[model_providers.custom]`` if no model_provider line yet.
  const currentConfig =
    (current.config as string | undefined) ??
    (presetDefaults?.config as string | undefined) ??
    defaultCodexToml()
  next.config = patchCodexBaseUrl(currentConfig, fv.baseUrl)
  next.apiFormat = fv.apiFormat === 'openai_chat' ? 'openai_chat' : 'openai_responses'
  next.isFullUrl = fv.isFullUrl
  if (fv.customUserAgent) next.customUserAgent = fv.customUserAgent
  else delete next.customUserAgent
  if (fv.testConfigEnabled || fv.testTimeout || fv.testDegradedThreshold || fv.testMaxRetries) {
    next.testConfig = {
      enabled: true,
      ...(fv.testTimeout ? { timeoutSecs: Number(fv.testTimeout) } : {}),
      ...(fv.testDegradedThreshold ? { degradedThresholdMs: Number(fv.testDegradedThreshold) } : {}),
      ...(fv.testMaxRetries ? { maxRetries: Number(fv.testMaxRetries) } : {}),
    }
    next.testConfigEnabled = true
  } else {
    delete next.testConfig
    delete next.testConfigEnabled
  }
  // 计费配置（costMultiplier / pricingModelSource / pricingConfigEnabled）暂未启用：
  // 表单里没有对应 UI，下游也没有 reader。等使用统计/成本面板上线后再恢复这段逻辑。
  return next
}

function applyHermesEdits(
  next: Record<string, unknown>,
  fv: ProviderFormValues,
  current: Record<string, unknown>,
  presetDefaults?: Record<string, unknown>,
  extras?: {
    apiMode?: HermesApiMode
    models?: HermesModel[]
    rateLimitDelay?: number
  },
): Record<string, unknown> {
  delete next.env
  // base_url + api_key live at the top level for hermes (config.yaml)
  if (fv.baseUrl) next.base_url = fv.baseUrl.replace(/\/+$/, '')
  else if (current.base_url === undefined && presetDefaults?.base_url)
    next.base_url = presetDefaults.base_url
  else delete next.base_url
  if (fv.authValue) next.api_key = fv.authValue
  else delete next.api_key

  // apiMode — written as a top-level string so Hermes CLI can pick it up.
  const apiMode =
    extras?.apiMode ??
    (current.api_mode as HermesApiMode | undefined) ??
    (presetDefaults?.api_mode as HermesApiMode | undefined)
  if (apiMode) next.api_mode = apiMode
  else delete next.api_mode

  // models — list of { id, name?, context_length? } entries. Drop empties.
  const rawModels =
    extras?.models ??
    (Array.isArray(current.models) ? (current.models as HermesModel[]) : undefined) ??
    (Array.isArray(presetDefaults?.models) ? (presetDefaults.models as HermesModel[]) : undefined) ??
    []
  const models = rawModels
    .map((model) => ({
      id: typeof model.id === 'string' ? model.id.trim() : '',
      name: typeof model.name === 'string' ? model.name.trim() : '',
      context_length:
        typeof model.contextLength === 'number'
          ? model.contextLength
          : typeof model.context_length === 'number'
            ? model.context_length
            : undefined,
    }))
    .filter((model) => model.id)
    .map((model) => {
      const out: Record<string, unknown> = { id: model.id }
      if (model.name) out.name = model.name
      if (typeof model.context_length === 'number') out.context_length = model.context_length
      return out
    })
  if (models.length > 0) next.models = models
  else delete next.models

  // rate_limit_delay — number of seconds; omit when undefined / 0.
  const delay =
    extras?.rateLimitDelay ??
    (typeof current.rate_limit_delay === 'number' ? current.rate_limit_delay : undefined) ??
    (typeof presetDefaults?.rate_limit_delay === 'number'
      ? presetDefaults.rate_limit_delay
      : undefined)
  if (typeof delay === 'number' && delay > 0) next.rate_limit_delay = delay
  else delete next.rate_limit_delay
  return next
}

function applyOpencodeEdits(
  next: Record<string, unknown>,
  fv: ProviderFormValues,
  current: Record<string, unknown>,
  presetDefaults?: Record<string, unknown>,
  extras?: { extraOptions?: Record<string, unknown> },
): Record<string, unknown> {
  delete next.env
  // Preserve npm / models if the current row has them; otherwise seed from preset.
  if (current.npm === undefined && presetDefaults?.npm) next.npm = presetDefaults.npm
  if (current.models === undefined && presetDefaults?.models) next.models = presetDefaults.models
  // options.{baseURL, apiKey, ...} — patch baseURL + apiKey, then layer extraOptions on top
  // so the form-level fields always win.
  const options = {
    ...((current.options as Record<string, unknown>) ??
      (presetDefaults?.options as Record<string, unknown> | undefined) ??
      {}),
  }
  // Apply extraOptions first (anything that isn't a reserved key) so form fields can override.
  if (extras?.extraOptions) {
    for (const key of Object.keys(options)) {
      if (key !== 'baseURL' && key !== 'apiKey') delete options[key]
    }
    for (const [key, value] of Object.entries(extras.extraOptions)) {
      if (key === 'baseURL' || key === 'apiKey') continue
      if (value === undefined || value === '') delete options[key]
      else options[key] = value
    }
  }
  if (fv.baseUrl) options.baseURL = fv.baseUrl
  if (fv.authValue) options.apiKey = fv.authValue
  // If extraOptions explicitly cleared baseURL/apiKey, honor that.
  if (extras?.extraOptions?.baseURL === '' || extras?.extraOptions?.baseURL === undefined) {
    // only delete if not set by fv
    if (!fv.baseUrl) delete options.baseURL
  }
  if (extras?.extraOptions?.apiKey === '' || extras?.extraOptions?.apiKey === undefined) {
    if (!fv.authValue) delete options.apiKey
  }
  next.options = options
  return next
}

// ── Codex TOML helpers ──────────────────────────────────────────────────
//
// Lightweight line-based extractor / patcher for the small subset of Codex
// config.toml the form needs to read/write. Mirrors
// `agent_box.providers._extract_codex_base_url` (Python).

// All three need the `m` flag so `^` and `$` anchor per-line (not just
// string start/end) — TOML bodies span many lines and section headers can
// appear anywhere.
const _CODEX_SECTION_HEADER_RE = /^\s*\[([^\]\r\n]+)\]\s*$/m
const _CODEX_BASE_URL_RE =
  /^\s*base_url\s*=\s*(?:"((?:\\.|[^"\\\r\n])*)"|'([^'\r\n]*)')(?:[ \t]*(?:#[^\r\n]*)?)?$/m
const _CODEX_MODEL_PROVIDER_RE =
  /^\s*model_provider\s*=\s*(["'])([^"'\r\n]+)\1(?:[ \t]*(?:#[^\r\n]*)?)?$/m

export function extractCodexBaseUrl(configText: string): string | undefined {
  if (!configText) return undefined
  const active = (() => {
    const m = _CODEX_MODEL_PROVIDER_RE.exec(configText)
    if (!m) return undefined
    const n = m[2].trim()
    return n || undefined
  })()
  let inActive = false
  let inTop = true
  for (const rawLine of configText.split(/\r?\n/)) {
    const sec = _CODEX_SECTION_HEADER_RE.exec(rawLine)
    if (sec) {
      const header = sec[1].trim()
      inActive = !!active && header === `model_providers.${active}`
      inTop = false
      continue
    }
    const m = _CODEX_BASE_URL_RE.exec(rawLine)
    if (!m) continue
    const value = (m[1] ?? m[2] ?? '').trim()
    if (inActive || inTop) return value
  }
  return undefined
}

/**
 * Patch ``base_url = "<new>"`` into the active ``[model_providers.<X>]``
 * section; if the section is missing or the file is empty, seed a minimal
 * TOML with a ``[model_providers.custom]`` block.
 */
export function patchCodexBaseUrl(configText: string, newBaseUrl: string): string {
  const escaped = newBaseUrl.replace(/"/g, '\\"')
  const lines = configText ? configText.split(/\r?\n/) : []
  const active = (() => {
    const m = _CODEX_MODEL_PROVIDER_RE.exec(configText)
    return m ? m[2].trim() : undefined
  })()
  let inActive = false
  let inTop = true
  const out: string[] = []
  let activePatched = false
  let topPatched = false
  for (const line of lines) {
    const sec = _CODEX_SECTION_HEADER_RE.exec(line)
    if (sec) {
      const header = sec[1].trim()
      inActive = !!active && header === `model_providers.${active}`
      inTop = false
      out.push(line)
      continue
    }
    if (_CODEX_BASE_URL_RE.test(line)) {
      if (inActive && !activePatched) {
        out.push(`base_url = "${escaped}"`)
        activePatched = true
        continue
      }
      if (inTop && !topPatched && !active) {
        out.push(`base_url = "${escaped}"`)
        topPatched = true
        continue
      }
      // Drop a stale base_url elsewhere — only keep the active/top one.
      continue
    }
    out.push(line)
  }
  // If neither was patched, append (or seed) the active section.
  if (active && !activePatched) {
    if (!lines.some((l) => _CODEX_SECTION_HEADER_RE.test(l))) {
      // No sections yet — seed a minimal config.
      out.push(`model_provider = "${active}"`)
      out.push('')
      out.push(`[model_providers.${active}]`)
      out.push(`base_url = "${escaped}"`)
    } else {
      out.push(`[model_providers.${active}]`)
      out.push(`base_url = "${escaped}"`)
    }
  } else if (!topPatched && !active) {
    out.push(`base_url = "${escaped}"`)
  }
  return out.filter((l, i, arr) => !(i === 0 && l === '') && !(i === arr.length - 1 && l === '')).join('\n')
}

function defaultCodexToml(): string {
  return 'model_provider = "custom"\n\n[model_providers.custom]\nbase_url = ""\n'
}

// ── Shared MODEL_ROLES reference (used by applyClaudeEdits) ──────────────
//
// Re-declared locally to keep this module self-contained — same list as
// ProviderFormFields. Update both if the role set changes.
const MODEL_ROLES = [
  { role: 'sonnet', modelField: 'ANTHROPIC_DEFAULT_SONNET_MODEL', nameField: 'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME' },
  { role: 'opus',   modelField: 'ANTHROPIC_DEFAULT_OPUS_MODEL',   nameField: 'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME' },
  { role: 'fable',  modelField: 'ANTHROPIC_DEFAULT_FABLE_MODEL',  nameField: 'ANTHROPIC_DEFAULT_FABLE_MODEL_NAME' },
  { role: 'haiku',  modelField: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',  nameField: 'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME' },
] as const
