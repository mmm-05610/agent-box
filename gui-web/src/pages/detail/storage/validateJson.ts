import { z } from 'zod'
import { SCHEMA_REGISTRY } from './schemaMaps'

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string }

export function schemaForPath(path: string): z.ZodTypeAny | null {
  for (const entry of SCHEMA_REGISTRY) {
    if (entry.test.test(path)) return entry.schema
  }
  return null
}

export function validateJson(path: string, content: string): ValidationResult {
  // Non-JSON files: no validation, always ok.
  if (!path.endsWith('.json')) return { ok: true }

  // Syntax check
  try {
    JSON.parse(content)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid JSON'
    // V8 / Node >= 20 format: `Unexpected token 'X', "<source>" is not valid JSON`
    // Older V8 / other engines may include `position N`.
    const tokMatch = msg.match(
      /^Unexpected token\s+(?:'([^']+)'|"([^"]+)")\s*,\s*".*" is not valid JSON/,
    )
    const posMatch = msg.match(/position (\d+)/)
    let line = 0
    let col = 0
    let located = false
    if (tokMatch) {
      const tok = tokMatch[1] ?? tokMatch[2]
      if (tok) {
        const idx = content.indexOf(tok)
        if (idx >= 0) {
          const upto = content.slice(0, idx)
          const lines = upto.split('\n')
          line = lines.length
          col = lines[lines.length - 1].length + 1
          located = true
        }
      }
    }
    if (!located && posMatch) {
      const pos = Number(posMatch[1])
      const upto = content.slice(0, pos)
      const lines = upto.split('\n')
      line = lines.length
      col = lines[lines.length - 1].length + 1
      located = true
    }
    if (located) {
      return {
        ok: false,
        error: `JSON syntax error at line ${line} column ${col}: ${msg}`,
      }
    }
    return { ok: false, error: `JSON syntax error: ${msg}` }
  }

  // Schema check
  const schema = schemaForPath(path)
  if (!schema) return { ok: true }
  const parsed: unknown = JSON.parse(content)
  const result = schema.safeParse(parsed)
  if (!result.success) {
    const issue = result.error.issues[0]
    return {
      ok: false,
      error: `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    }
  }
  return { ok: true }
}
