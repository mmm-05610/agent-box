import { z } from 'zod'

// Claude settings.json → only validates the keys we care about for save safety.
// Other keys are accepted via .passthrough() to avoid clobbering user data.
//
// NOTE: this schema is currently UNUSED. It is exported so PR 2's
// agent-type-aware schema registry can wire it in. See SCHEMA_REGISTRY TODO.
export const ClaudeSettingsSchema = z
  .object({
    env: z.record(z.string(), z.string()).optional(),
    model: z.string().optional(),
    effortLevel: z.string().optional(),
    permissions: z
      .object({
        defaultMode: z.string().optional(),
        allow: z.array(z.string()).optional(),
        deny: z.array(z.string()).optional(),
        ask: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    hooks: z.record(z.string(), z.unknown()).optional(),
    plugins: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

// Anything parseable as JSON object. We don't constrain field types here
// unless a more specific schema exists.
export const GenericJsonSchema = z.object({}).passthrough()

/**
 * Map of regex → zod schema. Matched against the file path.
 * First match wins. Order: most specific first.
 *
 * TODO(pr-2): Claude-specific schema selection needs to be agent-type
 * aware. Today this registry has no way to see which AgentType the
 * Storage tab belongs to — the path is the only signal. Real Claude
 * paths vary (e.g. `/root/<name>/.claude/settings.json` for some layouts,
 * `/root/profiles/<name>/settings.json` for others), so a path-only
 * regex is brittle. For PR 1 the safe fallback is `GenericJsonSchema`
 * (z.object({}).passthrough()), which parses any JSON object without
 * rejecting user data.
 */
export const SCHEMA_REGISTRY: Array<{ test: RegExp; schema: z.ZodTypeAny }> = [
  { test: /\.json$/, schema: GenericJsonSchema },
]
