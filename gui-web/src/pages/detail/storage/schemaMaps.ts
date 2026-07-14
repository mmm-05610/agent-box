import { z } from 'zod'

// Claude settings.json → only validates the keys we care about for save safety.
// Other keys are accepted via .passthrough() to avoid clobbering user data.
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
 */
export const SCHEMA_REGISTRY: Array<{ test: RegExp; schema: z.ZodTypeAny }> = [
  { test: /profiles\/[^/]+\/settings\.json$/, schema: ClaudeSettingsSchema },
  { test: /\.json$/, schema: GenericJsonSchema },
]
