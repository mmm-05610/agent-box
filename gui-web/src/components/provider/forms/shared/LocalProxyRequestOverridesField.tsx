/**
 * LocalProxyRequestOverridesField — Headers JSON + Body JSON editor.
 *
 * Mirrors cc-switch's `LocalProxyRequestOverridesField` (`@/components/providers/forms/`)
 * but trimmed to the JSON-textarea + live-parse-error pattern that the agent-box
 * theme already uses elsewhere (KeyValueEditor, KeyInput). The header/body JSON
 * validation helpers come from cc-switch's `lib/requestOverrides`; we re-implement
 * the small subset we need inline so we don't have to depend on a separate util
 * module.
 *
 * Only renders when both callbacks are provided. Gate by `category !== 'official'`
 * upstream so official providers never expose this.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Field } from './Field'

export interface LocalProxyRequestOverridesFieldProps {
  headersJson: string
  bodyJson: string
  onHeadersJsonChange: (next: string) => void
  onBodyJsonChange: (next: string) => void
  disabled?: boolean
}

// ── Validation helpers (subset of cc-switch's requestOverrides.ts) ──────
//
// We intentionally keep this tiny — only the JSON-shape + header-name checks
// that surface useful UI errors. The backend (Rust `agent-box` proxy) enforces
// the full RFC 9110 + protected-header rules; this is purely cosmetic feedback.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(raw: string): { value?: unknown; error?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  try {
    const parsed = JSON.parse(trimmed)
    if (!isPlainObject(parsed)) return { error: 'json-must-be-object' }
    return { value: parsed }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'invalid-json' }
  }
}

function validateHeaders(raw: string): string | null {
  const result = parseJson(raw)
  if (!result.error && result.value !== undefined) {
    const headers = result.value as Record<string, unknown>
    for (const [name, value] of Object.entries(headers)) {
      if (typeof value !== 'string') {
        return `header-not-string|${name}`
      }
    }
  }
  return result.error ?? null
}

function validateBody(raw: string): string | null {
  const result = parseJson(raw)
  if (!result.error && result.value !== undefined) {
    const body = result.value as Record<string, unknown>
    if ('stream' in body) {
      return 'body-has-stream'
    }
  }
  return result.error ?? null
}

export function LocalProxyRequestOverridesField({
  headersJson,
  bodyJson,
  onHeadersJsonChange,
  onBodyJsonChange,
  disabled,
}: LocalProxyRequestOverridesFieldProps) {
  const { t } = useTranslation()
  const headerError = useMemo(() => validateHeaders(headersJson), [headersJson])
  const bodyError = useMemo(() => validateBody(bodyJson), [bodyJson])

  const translateError = (code: string): string => {
    if (code === 'json-must-be-object') return t('providerForm.localProxy.errors.mustBeObject')
    if (code === 'invalid-json') return t('providerForm.localProxy.errors.invalidJson')
    if (code === 'body-has-stream') return t('providerForm.localProxy.errors.bodyNoStream')
    if (code.startsWith('header-not-string|')) {
      const name = code.slice('header-not-string|'.length)
      return t('providerForm.localProxy.errors.headerMustBeString', { name })
    }
    return code
  }
  const translatedHeaderError = headerError ? translateError(headerError) : null
  const translatedBodyError = bodyError ? translateError(bodyError) : null

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">{t('providerForm.localProxy.title')}</p>
        <p className="text-xs text-muted-foreground">
          {t('providerForm.localProxy.desc')}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label={t('providerForm.localProxy.header')}
          hint={
            translatedHeaderError
              ? <span className="text-destructive">{t('providerForm.localProxy.headerErrorPrefix')}{translatedHeaderError}</span>
              : <span>{t('providerForm.localProxy.kvExample')}<code className="font-mono">{`{"X-Provider": "agent-box"}`}</code></span>
          }
        >
          <textarea
            value={headersJson}
            onChange={(event) => onHeadersJsonChange(event.target.value)}
            placeholder={'{\n  "X-Provider": "agent-box"\n}'}
            disabled={disabled}
            aria-invalid={Boolean(headerError)}
            className="min-h-[132px] w-full resize-y rounded-md border border-border bg-input px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none"
          />
        </Field>
        <Field
          label={t('providerForm.localProxy.body')}
          hint={
            translatedBodyError
              ? <span className="text-destructive">{t('providerForm.localProxy.bodyErrorPrefix')}{translatedBodyError}</span>
              : <span>{t('providerForm.localProxy.kvExample')}<code className="font-mono">{`{"temperature": 0.2}`}</code></span>
          }
        >
          <textarea
            value={bodyJson}
            onChange={(event) => onBodyJsonChange(event.target.value)}
            placeholder={'{\n  "temperature": 0.2\n}'}
            disabled={disabled}
            aria-invalid={Boolean(bodyError)}
            className="min-h-[132px] w-full resize-y rounded-md border border-border bg-input px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none"
          />
        </Field>
      </div>
    </div>
  )
}
