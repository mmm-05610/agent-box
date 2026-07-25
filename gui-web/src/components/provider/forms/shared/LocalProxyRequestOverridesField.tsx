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
    if (!isPlainObject(parsed)) return { error: 'JSON must be an object' }
    return { value: parsed }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid JSON' }
  }
}

function validateHeaders(raw: string): string | null {
  const result = parseJson(raw)
  if (!result.error && result.value !== undefined) {
    const headers = result.value as Record<string, unknown>
    for (const [name, value] of Object.entries(headers)) {
      if (typeof value !== 'string') {
        return `Header "${name}" must be a string`
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
      return 'Body override must not include protocol field "stream"'
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
  const headerError = useMemo(() => validateHeaders(headersJson), [headersJson])
  const bodyError = useMemo(() => validateBody(bodyJson), [bodyJson])

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">本地代理请求覆盖</p>
        <p className="text-xs text-muted-foreground">
          仅在本地路由/代理接管后生效，应用于协议转换后的上游请求。
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Header 覆盖 (JSON)"
          hint={
            headerError
              ? <span className="text-destructive">Header 覆盖格式错误：{headerError}</span>
              : <span>键值对：<code className="font-mono">{`{"X-Provider": "agent-box"}`}</code></span>
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
          label="Body 覆盖 (JSON)"
          hint={
            bodyError
              ? <span className="text-destructive">Body 覆盖格式错误：{bodyError}</span>
              : <span>键值对：<code className="font-mono">{`{"temperature": 0.2}`}</code></span>
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
