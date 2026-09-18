import { z } from 'zod'

/**
 * AgentBox Desktop wire candidate v1 — the SINGLE executable authority for
 * the desktop↔server core contract (P07 checkpoint 2).
 *
 * Status: WIRE_REVISION_PENDING_BACKEND (see docs/desktop-product-delivery/contracts/wire-v1/).
 * Semantics authority: contracts/core-semantics-v1.md (APPROVED_SEMANTICS) —
 * every shape below implements already-approved behavior; the HTTP/WS
 * ENCODING (envelope, method names, header names) is this file's mechanical
 * PROPOSAL to the server side, reviewable through the wire feedback channel.
 * Nothing here grants a production endpoint by itself.
 *
 * One authority, three projections, zero hand-written duplicates:
 *   - static types      → `z.infer` below (never re-declared by hand)
 *   - runtime validation→ the schemas themselves (fixtures/tests execute them)
 *   - server review form→ `wireJsonSchemas()` → generated/wire-v1.schema.json
 *
 * Encoding commitments (mechanical, PROPOSED):
 *   - JSON-RPC 2.0 flavored envelope — the one protocol shape this repo
 *     already speaks (`@hermes/shared` json-rpc-gateway), reusable over both
 *     an HTTP POST binding and a websocket event stream.
 *   - Ids are opaque, server-assigned, stable strings. A display name, a
 *     path, or a native Harness session id is NEVER an object identity
 *     (core v1 §3).
 *   - Every mutating call carries a client-generated `requestId`; the server
 *     dedupes within the scope documented per capability (core v1 §3: same
 *     id + different payload must be rejected, not re-executed).
 *   - Mutable business records carry a server-owned `version`; writes state
 *     the version they were made against, and conflicts come back as
 *     CONFLICT_VERSION with the current record (core v1 §3).
 */

export const WIRE_PROTOCOL_VERSION = 'wire/1'

// ─── Primitives ──────────────────────────────────────────────────────────────

/** Opaque server-assigned identity. Branded so a raw display name or path
 *  cannot silently flow into an id-typed field. */
export const WireIdSchema = z.string().min(1).brand<'WireIdSchema'>()
export type WireId = z.infer<typeof WireIdSchema>

/** Client-side constructors for the branded strings — until real server ids
 *  arrive (always through schema parsing), fixtures and local scaffolding use
 *  these so the brand boundary stays explicit. */
export const asWireId = (value: string) => value as WireId
export const asRequestId = (value: string) => value as RequestId
export const asCursor = (value: string) => value as WireCursor

/** Client-generated request identity (UUID-class). Uniqueness SCOPE is per
 *  capability — see each method's idempotency note in semantics-map.md. */
export const RequestIdSchema = z.string().min(8).brand<'RequestIdSchema'>()
export type RequestId = z.infer<typeof RequestIdSchema>

/** Opaque cursor (history snapshot position / event stream resume point).
 *  Its content is server-defined; clients never parse it. */
export const WireCursorSchema = z.string().brand<'WireCursorSchema'>()
export type WireCursor = z.infer<typeof WireCursorSchema>

/** Optimistic-concurrency version of a mutable business record. */
export const RecordVersionSchema = z.number().int().nonnegative()
export type RecordVersion = z.infer<typeof RecordVersionSchema>

/** RFC3339 UTC instants, not epoch numbers — cross-client display is the
 *  receiver's concern, and epoch seconds invite unit drift. */
export const WireTimestampSchema = z.string().datetime({ offset: true })
export type WireTimestamp = z.infer<typeof WireTimestampSchema>

// ─── Error envelope (core v1 §6/§7: failure modes are distinguishable) ──────

export const WireErrorCodeSchema = z.enum([
  /** The server (or a required worker) is not reachable or not ready. The
   *  client shows an honest unavailable state, never a fake success. */
  'UNAVAILABLE',
  /** Missing/invalid auth material; the client routes to sign-in. */
  'UNAUTHENTICATED',
  /** Authenticated but not allowed for this environment/scope. */
  'FORBIDDEN',
  /** A referenced object does not exist (or is archived and not addressable). */
  'NOT_FOUND',
  /** The call's `expectedVersion` no longer matches; `current` rides along. */
  'CONFLICT_VERSION',
  /** A record cannot be archived while another live record still refers to
   *  it. `details.references` contains stable ids only, never display text or
   *  credential material. */
  'CONFLICT_REFERENCE',
  /** Same requestId as a stored request but a different payload (core v1 §3:
   *  dedupe is identity+content; a silent re-execution is forbidden). */
  'CONFLICT_REQUEST',
  /** The payload is malformed or violates a described constraint. */
  'INVALID_REQUEST',
  /** The server exists but does not implement this capability (degradation
   *  is reported, never faked; `reason` is user-presentable). */
  'CAPABILITY_UNSUPPORTED',
  /** The request timed out with the outcome unknown — the client must query
   *  the original requestId, never blindly resend as a new request. */
  'OUTCOME_UNKNOWN',
  /** A required remote worker disconnected mid-operation. */
  'WORKER_UNREACHABLE',
  /** An approval is stale: expired, cancelled, already decided, or its
   *  bound operation changed (core v1 §7). */
  'APPROVAL_INVALID'
])
export type WireErrorCode = z.infer<typeof WireErrorCodeSchema>

export const WireErrorSchema = z.strictObject({
  code: WireErrorCodeSchema,
  /** User-presentable summary; the server owns the phrasing, the client
   *  renders it — it does not pattern-match on messages (core v1 §5/§8). */
  message: z.string().min(1),
  /** Machine-readable, presentable extras (e.g. current record, missing
   *  capability reason, native failure detail). Opaque to logic. */
  details: z.record(z.string(), z.unknown()).optional(),
  /** The server's current version of a contested record (CONFLICT_VERSION). */
  current: z.unknown().optional()
})
export type WireError = z.infer<typeof WireErrorSchema>

// ─── Envelope (JSON-RPC 2.0 flavored; encoding is a PROPOSED mechanical
// ─── choice — see module doc) ────────────────────────────────────────────────

export const WireRequestSchema = z.strictObject({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/),
  params: z.unknown()
})
export type WireRequest = z.infer<typeof WireRequestSchema>

export const WireResponseSchema = z
  .strictObject({
    jsonrpc: z.literal('2.0'),
    /** Authentication/parse failures happen before a request id is trusted. */
    id: z.union([z.string(), z.number()]).nullable(),
    result: z.unknown().optional(),
    error: WireErrorSchema.optional()
  })
  .superRefine((response, context) => {
    if (('result' in response) === ('error' in response)) {
      context.addIssue({ code: 'custom', message: 'A wire response must carry exactly one of result or error' })
    }

    if ('result' in response && response.id === null) {
      context.addIssue({ code: 'custom', message: 'A successful response must carry its request id', path: ['id'] })
    }
  })
export type WireResponse = z.infer<typeof WireResponseSchema>

/** Common pagination request/response pair (core v1 §8: pagination position
 *  is an opaque cursor; never a page number — replay-safe by construction). */
export const WirePageSchema = z.object({
  cursor: WireCursorSchema.optional(),
  limit: z.number().int().positive().max(500).optional()
})
export type WirePage = z.infer<typeof WirePageSchema>

export function paginated<T extends z.ZodTypeAny>(items: T) {
  return z.object({ items: z.array(items), nextCursor: WireCursorSchema.nullable() })
}

// ─── Capability discovery & auth bootstrap (core v1 §2/§8 row 1) ────────────

export const WireCapabilitySchema = z
  .strictObject({
    id: z.string().min(1),
    supported: z.boolean(),
    /** Required when supported=false — the honest "why", user-presentable. */
    reason: z.string().min(1).optional()
  })
  .superRefine((capability, context) => {
    if (!capability.supported && !capability.reason) {
      context.addIssue({ code: 'custom', message: 'An unsupported capability must carry a reason', path: ['reason'] })
    }
  })
export type WireCapability = z.infer<typeof WireCapabilitySchema>

export const ServerHelloParamsSchema = z.object({
  /** The protocol versions the client can speak, best first. */
  clientVersions: z.array(z.string()).min(1),
  /** What the client can render (e.g. approval cards, config descriptors) —
   *  lets the server degrade capabilities per client honestly. */
  clientPresentationSupports: z.array(z.string())
})
export type ServerHelloParams = z.infer<typeof ServerHelloParamsSchema>

export const ServerHelloResultSchema = z.object({
  serverId: WireIdSchema,
  protocolVersion: z.literal(WIRE_PROTOCOL_VERSION),
  capabilities: z.array(WireCapabilitySchema),
  /** What the authenticated host session uses. Hello itself is authenticated
   *  with the same host-only token; this describes enabled schemes, not an
   *  unauthenticated token exchange. */
  auth: z.discriminatedUnion('required', [
    z.object({ required: z.literal(false) }),
    z.object({
      required: z.literal(true),
      /** How the client may authenticate — described, not embedded secrets. */
      schemes: z.array(z.enum(['session_token', 'oauth_device', 'api_key']))
    })
  ])
})
export type ServerHelloResult = z.infer<typeof ServerHelloResultSchema>

// ─── Business records (core v1 §3) ───────────────────────────────────────────

/** Environment identity: the canonical (distribution/user/host-class) triple
 *  a workspace is anchored to. Two environments exposing the same path string
 *  are NOT the same location (core v1 §4). */
export const EnvironmentIdentitySchema = z.object({
  kind: z.enum(['local', 'wsl', 'ssh']),
  /** Environment-qualified user (e.g. local user name, WSL distro user). */
  user: z.string().nullable(),
  /** Distro for WSL, host for SSH, null for local. */
  host: z.string().nullable()
})
export type EnvironmentIdentity = z.infer<typeof EnvironmentIdentitySchema>

export const WorkspaceRecordSchema = z.object({
  id: WireIdSchema,
  version: RecordVersionSchema,
  displayName: z.string(),
  normalizedPath: z.string(),
  environment: EnvironmentIdentitySchema,
  /** Separated accessibility facts (core v1 §4): readable ≠ writable ≠
   *  runnable — one "Verified" badge must never promise all three. */
  accessibility: z.object({
    readable: z.boolean(),
    writable: z.boolean(),
    /** Execution available for the CURRENT role in this workspace. */
    executableForRole: z.boolean().nullable(),
    reasons: z.array(z.string()).default([])
  }),
  connection: z.discriminatedUnion('state', [
    z.object({ state: z.literal('connected') }),
    z.object({ state: z.literal('connecting') }),
    z.object({
      state: z.literal('preparing'),
      /** Which layer is being prepared: worker base, or a role's harness. */
      layer: z.enum(['worker', 'harness']),
      progress: z.string().nullable()
    }),
    z.object({ state: z.literal('failed'), reason: z.string() })
  ]),
  archivedAt: WireTimestampSchema.nullable(),
  createdAt: WireTimestampSchema,
  updatedAt: WireTimestampSchema
})
export type WorkspaceRecord = z.infer<typeof WorkspaceRecordSchema>

export const SessionRecordSchema = z.object({
  id: WireIdSchema,
  version: RecordVersionSchema,
  workspaceId: WireIdSchema,
  /** The profile the session was last CONFIRMED with — a display fact; the
   *  per-send actual configuration lives on executions (core v1 §5/§6). */
  profileId: WireIdSchema.nullable(),
  displayName: z.string(),
  /** Shared business metadata, not a renderer-local sidebar preference. */
  pinned: z.boolean(),
  archivedAt: WireTimestampSchema.nullable(),
  /** Order 51: the session-level latest usage fact (tokens only), or null
   *  while no family on this session has reported one. */
  latestUsage: z.strictObject({
    turnId: WireIdSchema,
    usageSource: z.string(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional()
  }).nullable().optional(),
  createdAt: WireTimestampSchema,
  updatedAt: WireTimestampSchema
})
export type SessionRecord = z.infer<typeof SessionRecordSchema>

/** Order 60: one permission rule, as the record layer stores it. The rule set
 *  is ordered and family-neutral (it travels across a clone); `pattern` is the
 *  glob a rule speaks about, and null means "every target of this key". */
export const PermissionRuleSchema = z.strictObject({
  key: z.enum(['read', 'edit', 'bash', 'task', 'external_directory', 'webfetch', 'skill']),
  pattern: z.string().nullable(),
  action: z.enum(['allow', 'ask', 'deny'])
})
export type PermissionRule = z.infer<typeof PermissionRuleSchema>

export const ProfileRecordSchema = z.object({
  id: WireIdSchema,
  version: RecordVersionSchema,
  displayName: z.string(),
  /** Which native harness family this role targets — presented as data
   *  (badge/filter), never a client-side branch (core v1 §5). */
  harness: z.string(),
  /** Native capabilities are server claims. Missing/unknown harnesses expose
   *  an empty map; the client never invents brand defaults. */
  capabilities: z.record(z.string(), z.boolean()).default({}),
  /** Order 56: the subscription account this role is bound to, or null. The
   *  locator and the digest stay server-side — the client needs the reference
   *  only (core v1 §3: never the material, never the locator). */
  accountId: WireIdSchema.nullable().optional(),
  /** Order 60: the permission posture. `permissionRules` is the rule set in
   *  effect, last match wins, in order — preset rules first, the user's own
   *  appended. An empty list on a preset is honest: that preset declares no
   *  explicit rules (its fallback action is the posture). */
  permissionPreset: z.string().nullable().optional(),
  permissionRules: z.array(PermissionRuleSchema).optional(),
  /** Order 60: for a clone, the role it came from; null for a role created
   *  from scratch. Display fact only — ids stay opaque. */
  originProfileId: WireIdSchema.nullable().optional(),
  archivedAt: WireTimestampSchema.nullable(),
  createdAt: WireTimestampSchema,
  updatedAt: WireTimestampSchema
})
export type ProfileRecord = z.infer<typeof ProfileRecordSchema>

export const ProviderModelRefSchema = z.object({
  providerId: WireIdSchema,
  modelId: z.string(),
  /** Directory presence ≠ verified availability (core v1 §5). */
  availability: z.enum(['unknown', 'available', 'unavailable']),
  unavailableReason: z.string().nullable()
})
export type ProviderModelRef = z.infer<typeof ProviderModelRefSchema>

// ─── Configuration descriptors (core v1 §5: server-described, limited
// ─── control kinds; the client renders, it does not decide correctness) ─────

export const ConfigControlSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('enum'),
    controlId: z.string(),
    values: z.array(z.string()),
    editable: z.boolean(),
    currentValue: z.string().optional()
  }),
  z.object({
    kind: z.literal('string'),
    controlId: z.string(),
    editable: z.boolean(),
    currentValue: z.string().optional(),
    multiline: z.boolean().default(false)
  }),
  z.object({
    kind: z.literal('boolean'),
    controlId: z.string(),
    editable: z.boolean(),
    currentValue: z.boolean().optional()
  }),
  z.object({
    kind: z.literal('model_slot'),
    controlId: z.string(),
    editable: z.boolean(),
    slots: z.array(z.object({ name: z.string(), model: ProviderModelRefSchema.nullable() })),
    currentValue: z.string().optional()
  })
])
export type ConfigControl = z.infer<typeof ConfigControlSchema>

export const ConfigDescriptorSchema = z.object({
  profileId: WireIdSchema,
  /** The workspace the description is effective for (empty = global). */
  workspaceId: WireIdSchema.nullable(),
  controls: z.array(ConfigControlSchema),
  /** Security-relevant entries the client MUST NOT offer to override (core
   *  v1 §5: security limits cannot be overridden by temporary choices). */
  securityLockedIds: z.array(z.string()),
  /** When changes take effect: next send, or (only if the server declares
   *  it) immediately — the client never assumes immediate. */
  effectTiming: z.enum(['next_send', 'immediate_declared'])
})
export type ConfigDescriptor = z.infer<typeof ConfigDescriptorSchema>

/** A temporary override from a draft: control id → raw value. The server
 *  validates; the client never manufactures effective values. */
export const ConfigOverrideSchema = z.object({ controlId: z.string(), value: z.unknown() })
export type ConfigOverride = z.infer<typeof ConfigOverrideSchema>

/** Reusable Provider/Model configuration. Credentials stay in the Server
 *  SecretStore: only an opaque record id crosses this wire. Harness/provider
 *  values are adapter data and never client-side dispatch keys. */
/** Order 55: where the provider's endpoint facts came from — the honest
 *  answers are a preset catalogue, a pulled model list, or the user's own
 *  hand entry. Fields a source did not supply stay absent: unknown, never a
 *  guessed default. */
export const ProviderProvenanceSchema = z.strictObject({
  baseUrl: z.string().optional(),
  authStyle: z.enum(['api_key', 'oauth', 'none']).optional(),
  wireApi: z.enum(['chat_completions', 'responses']).optional(),
  fieldsSource: z.enum(['preset', 'pulled', 'manual']).optional()
})

export const ProviderModelConfigRecordSchema = z.strictObject({
  id: WireIdSchema,
  version: RecordVersionSchema,
  displayName: z.string().min(1),
  harness: z.string().min(1),
  provider: z.string().min(1),
  credentialId: WireIdSchema.nullable(),
  configuration: z.array(ConfigOverrideSchema),
  models: z.array(
    z.strictObject({
      modelId: z.string().min(1),
      displayName: z.string().min(1),
      availability: z.enum(['unknown', 'available', 'unavailable']),
      unavailableReason: z.string().nullable()
    })
  ),
  archivedAt: WireTimestampSchema.nullable(),
  provenance: ProviderProvenanceSchema.nullable().optional(),
  createdAt: WireTimestampSchema,
  updatedAt: WireTimestampSchema
})
export type ProviderModelConfigRecord = z.infer<typeof ProviderModelConfigRecordSchema>

// ─── Messages & events (core v1 §6: normalized, stable identity, ordered) ───

export const AttachmentRefSchema = z.object({
  /** Server-checked reference into the workspace's own path space. */
  ref: z.string().min(1),
  displayName: z.string(),
  mediaKind: z.enum(['file', 'image', 'other'])
})
export type AttachmentRef = z.infer<typeof AttachmentRefSchema>

export const DraftMessageSchema = z.object({
  text: z.string(),
  attachments: z.array(AttachmentRefSchema).default([])
})
export type DraftMessage = z.infer<typeof DraftMessageSchema>

/** Queue (core v1 §6): the SERVER owns it — one ordinary execution per
 *  session, follow-up default, steer is a separate declared capability. */
export const QueueItemSchema = z.object({
  itemId: WireIdSchema,
  version: RecordVersionSchema,
  submittedAt: WireTimestampSchema,
  /** Frozen at submission (core v1 §6: later choices never rewrite it). */
  message: DraftMessageSchema,
  profileId: WireIdSchema,
  /** Effective configuration frozen when this item was accepted. */
  configVersion: RecordVersionSchema,
  state: z.enum(['pending', 'dispatched', 'withdrawn', 'paused', 'completed', 'failed', 'cancelled'])
})
export type QueueItem = z.infer<typeof QueueItemSchema>

/** `queue.get` contains only work that can still be acted on. Terminal items
 * are delivered through `queue.updated` so projections can remove them. */
export const ActiveQueueItemSchema = QueueItemSchema.extend({
  state: z.enum(['pending', 'dispatched', 'paused'])
})
export type ActiveQueueItem = z.infer<typeof ActiveQueueItemSchema>

/** The ONE approval shape (core v1 §7): the server owns the fact; a decision
 *  binds operation content + version; scope beyond "once" must be explicit. */
export const ApprovalRequestSchema = z.object({
  approvalId: WireIdSchema,
  sessionId: WireIdSchema,
  executionId: WireIdSchema.nullable(),
  version: RecordVersionSchema,
  operation: z.object({
    title: z.string(),
    /** Human-readable structured detail (target, parameters) — presentable,
     *  not executable. */
    detail: z.array(z.object({ label: z.string(), value: z.string() })),
    tool: z.string().nullable()
  }),
  /** Server-declared expiry; absent means the server will invalidate by
   *  state change (core v1 §7: expiry, if any, must be told explicitly). */
  expiresAt: WireTimestampSchema.nullable()
})
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>

export const ApprovalDecisionScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('once') }),
  z.object({
    kind: z.literal('bounded'),
    /** Exactly what the longer grant covers — vague "always" is forbidden. */
    until: z.enum(['session_end']),
    environmentId: WireIdSchema.nullable()
  })
])
export type ApprovalDecisionScope = z.infer<typeof ApprovalDecisionScopeSchema>

/** Normalized stream events. Every frame: stable id, session-scoped seq,
 *  optional cursor. Replay must be idempotent at the application layer
 *  (core v1 §7: replay restores presentation, never re-does work). */
export const WireEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('message.delta'), sessionId: WireIdSchema, messageId: WireIdSchema,
    role: z.literal('assistant'), text: z.string()
  }),
  /** Order 52: the harness's own reasoning, streamed as the model produces it. */
  z.strictObject({
    kind: z.literal('thought.delta'), sessionId: WireIdSchema, text: z.string()
  }),
  /** Order 52: the harness's plan (a full snapshot of its entries). */
  z.strictObject({
    kind: z.literal('plan.updated'), sessionId: WireIdSchema,
    entries: z.array(z.strictObject({
      id: z.string(), content: z.string(),
      status: z.string(), priority: z.string().optional()
    }))
  }),
  /** Order 52: the harness's selected interaction mode. */
  z.strictObject({
    kind: z.literal('mode.updated'), sessionId: WireIdSchema,
    currentModeId: z.string()
  }),
  /** Order 51: the usage a family's own native store reported for one turn.
   *  Fields the family did not report are absent — never zero, never
   *  estimated. Emitted once per completed turn that has a fact. */
  z.strictObject({
    kind: z.literal('usage.updated'), sessionId: WireIdSchema,
    turnId: WireIdSchema,
    usage: z.strictObject({
      inputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional(),
      totalTokens: z.number().int().nonnegative().optional()
    })
  }),
  z.strictObject({
    kind: z.literal('message.final'), sessionId: WireIdSchema, messageId: WireIdSchema,
    role: z.enum(['user', 'assistant', 'system']),
    displayKind: z.enum(['visible', 'hidden']), text: z.string()
  }),
  z.strictObject({
    kind: z.literal('tool.update'), sessionId: WireIdSchema, toolCallId: WireIdSchema,
    messageId: WireIdSchema.nullable(),
    tool: z.string().nullable(),
    state: z.enum(['requested', 'running', 'awaiting_approval', 'completed', 'failed', 'denied']),
    summary: z.string().nullable().optional(),
    /** Presentable result excerpt; full content is fetched, not streamed raw. */
    resultExcerpt: z.string().nullable().optional()
  }),
  z.strictObject({
    kind: z.literal('approval.requested'), sessionId: WireIdSchema, approval: ApprovalRequestSchema
  }),
  z.strictObject({
    kind: z.literal('approval.settled'), sessionId: WireIdSchema, approvalId: WireIdSchema,
    outcome: z.enum(['allowed', 'denied', 'expired', 'invalidated'])
  }),
  z.strictObject({
    kind: z.literal('config.changed'), sessionId: WireIdSchema,
    /** Which send this affects — the running one is never silently changed. */
    effectiveFor: z.enum(['next_send', 'immediate'])
  }),
  z.strictObject({
    kind: z.literal('execution.state'), sessionId: WireIdSchema, executionId: WireIdSchema,
    state: z.enum(['queued', 'dispatched', 'running', 'stopping', 'stopped', 'completed', 'failed', 'unknown']),
    /** Terminal states carry the reason; unknown ≠ failed (core v1 §6/§11). */
    reason: z.string().nullable().optional()
  }),
  z.strictObject({
    kind: z.literal('queue.updated'), sessionId: WireIdSchema, item: QueueItemSchema
  }),
  z.strictObject({
    kind: z.literal('workspace.connection'), workspaceId: WireIdSchema,
    connection: WorkspaceRecordSchema.shape.connection
  })
])
export type WireEvent = z.infer<typeof WireEventSchema>

export const EventFrameSchema = z.strictObject({
  /** Stable event identity — replay dedupes on this, never on position. */
  eventId: WireIdSchema,
  sessionId: WireIdSchema,
  /** Gap-free within the session's subscription view. */
  seq: z.number().int().nonnegative(),
  cursor: WireCursorSchema,
  emittedAt: WireTimestampSchema,
  event: WireEventSchema
})
export type EventFrame = z.infer<typeof EventFrameSchema>

// ─── Method params/results (one zod object per capability, core v1 §8) ──────

export const HelloParamsSchema = ServerHelloParamsSchema
export const HelloResultSchema = ServerHelloResultSchema

/** Workspaces (core v1 §4): open = register-or-select + draft entry; it never
 *  creates a Session nor starts a harness. Idempotent per (environment,
 *  normalizedPath) — reopening keeps the SAME id. */
export const WorkspacesOpenParamsSchema = z.object({
  requestId: RequestIdSchema,
  environment: EnvironmentIdentitySchema,
  /** The path as picked in the environment's own semantics — the client does
   *  no Windows/POSIX rewriting (core v1 §4). */
  path: z.string().min(1),
  expectedVersion: RecordVersionSchema.optional()
})
export type WorkspacesOpenParams = z.infer<typeof WorkspacesOpenParamsSchema>

export const WorkspacesOpenResultSchema = z.object({
  workspace: WorkspaceRecordSchema,
  /** True when this call CREATED the registration (vs reopened existing). */
  created: z.boolean()
})
export type WorkspacesOpenResult = z.infer<typeof WorkspacesOpenResultSchema>

/** Remote directory browsing (core v1 §4): listing by the worker; readable
 *  entries are browsable — write/execute are separate answers. */
export const WorkspacesBrowseParamsSchema = z.object({
  requestId: RequestIdSchema,
  environment: EnvironmentIdentitySchema,
  path: z.string()
})
export type WorkspacesBrowseParams = z.infer<typeof WorkspacesBrowseParamsSchema>

export const WorkspacesBrowseResultSchema = z.object({
  path: z.string(),
  entries: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(['directory', 'file', 'other']),
      /** This entry may be opened as a workspace (readability only). */
      canOpen: z.boolean(),
      canWrite: z.boolean(),
      reason: z.string().nullable()
    })
  )
})
export type WorkspacesBrowseResult = z.infer<typeof WorkspacesBrowseResultSchema>

export const WorkspacesListParamsSchema = z.object({ includeArchived: z.boolean().default(false) })
export type WorkspacesListParams = z.infer<typeof WorkspacesListParamsSchema>
export const WorkspacesListResultSchema = paginated(WorkspaceRecordSchema)
export type WorkspacesListResult = z.infer<typeof WorkspacesListResultSchema>

export const WorkspacesArchiveParamsSchema = z.object({
  requestId: RequestIdSchema,
  workspaceId: WireIdSchema,
  expectedVersion: RecordVersionSchema
})
export type WorkspacesArchiveParams = z.infer<typeof WorkspacesArchiveParamsSchema>
export const WorkspacesArchiveResultSchema = z.object({ workspace: WorkspaceRecordSchema })
export type WorkspacesArchiveResult = z.infer<typeof WorkspacesArchiveResultSchema>

/** Profiles & config (core v1 §5). */
export const ProfilesListParamsSchema = z.object({ includeArchived: z.boolean().default(false) })
export type ProfilesListParams = z.infer<typeof ProfilesListParamsSchema>
export const ProfilesListResultSchema = paginated(ProfileRecordSchema)
export type ProfilesListResult = z.infer<typeof ProfilesListResultSchema>

export const ProfilesCreateParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  displayName: z.string().min(1),
  harness: z.string().min(1),
  /** The credential this role runs with, when the Harness cannot express it
   *  through a model control (Hermes declares none). Absent or null means the
   *  role carries none, which is what every Harness without a credential kind
   *  requires. The value is a reference; the material stays where it lives. */
  credentialId: WireIdSchema.nullable().optional()
})
export type ProfilesCreateParams = z.infer<typeof ProfilesCreateParamsSchema>
export const ProfilesCreateResultSchema = z.strictObject({ profile: ProfileRecordSchema })
export type ProfilesCreateResult = z.infer<typeof ProfilesCreateResultSchema>

export const ProfilesUpdateParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  profileId: WireIdSchema,
  expectedVersion: RecordVersionSchema,
  displayName: z.string().min(1)
})
export type ProfilesUpdateParams = z.infer<typeof ProfilesUpdateParamsSchema>
export const ProfilesUpdateResultSchema = z.strictObject({ profile: ProfileRecordSchema })
export type ProfilesUpdateResult = z.infer<typeof ProfilesUpdateResultSchema>

export const ProfilesArchiveParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  profileId: WireIdSchema,
  expectedVersion: RecordVersionSchema
})
export type ProfilesArchiveParams = z.infer<typeof ProfilesArchiveParamsSchema>
export const ProfilesArchiveResultSchema = z.strictObject({ profile: ProfileRecordSchema })
export type ProfilesArchiveResult = z.infer<typeof ProfilesArchiveResultSchema>

export const ProfilesUpdateConfigParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  profileId: WireIdSchema,
  expectedVersion: RecordVersionSchema,
  values: z.array(ConfigOverrideSchema)
})
export type ProfilesUpdateConfigParams = z.infer<typeof ProfilesUpdateConfigParamsSchema>
export const ProfilesUpdateConfigResultSchema = z.strictObject({
  profile: ProfileRecordSchema,
  configVersion: RecordVersionSchema,
  effectiveFor: z.literal('next_send')
})
export type ProfilesUpdateConfigResult = z.infer<typeof ProfilesUpdateConfigResultSchema>

export const ProviderModelsListParamsSchema = z.strictObject({ includeArchived: z.boolean().default(false) })
export type ProviderModelsListParams = z.infer<typeof ProviderModelsListParamsSchema>
export const ProviderModelsListResultSchema = paginated(ProviderModelConfigRecordSchema)
export type ProviderModelsListResult = z.infer<typeof ProviderModelsListResultSchema>

const ProviderModelWriteFieldsSchema = z.strictObject({
  displayName: z.string().min(1),
  harness: z.string().min(1),
  provider: z.string().min(1),
  credentialId: WireIdSchema.nullable(),
  configuration: z.array(ConfigOverrideSchema),
  models: ProviderModelConfigRecordSchema.shape.models
})

export const ProviderModelsCreateParamsSchema = ProviderModelWriteFieldsSchema.extend({
  requestId: RequestIdSchema,
  provenance: ProviderProvenanceSchema.optional()
})

/** Order 55: one bounded outbound probe of the declared endpoint. */
export const ProviderModelsProbeModelsParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  baseUrl: z.string().min(1),
  credentialId: WireIdSchema.nullable().optional()
})
export const ProviderModelsProbeModelsResultSchema = z.strictObject({
  status: z.enum(['ok', 'failed']),
  models: z.array(z.string().min(1)),
  code: z.string().optional()
})
export const ProviderModelsProbeConnectionParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  baseUrl: z.string().min(1),
  credentialId: WireIdSchema.nullable().optional()
})
export const ProviderModelsProbeConnectionResultSchema = z.strictObject({
  status: z.enum(['reachable', 'unreachable', 'failed']),
  code: z.string().optional(),
  detail: z.string().optional()
})

/** Order 57: harness runtime artifact management. Install stages the source
 *  the execution side prepared (under the store's incoming area) and roll-
 *  back/`current` are pointer moves — running sessions are never touched. */
export const ProviderArtifactsListParamsSchema = z.strictObject({
  harness: z.string().min(1)
})
export const ProviderArtifactsInstallParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  harness: z.string().min(1),
  version: z.string().min(1),
  sourceToken: z.string().min(1),
  digest: z.string().regex(/^sha256:[0-9a-f]{64}$/)
})
export const ProviderArtifactsRollbackParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  harness: z.string().min(1),
  version: z.string().min(1)
})
export const ProviderArtifactsListResultSchema = z.strictObject({
  harness: z.string().min(1),
  versions: z.array(z.strictObject({
    version: z.string().min(1),
    entries: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative()
  })),
  current: z.string().nullable()
})
export const ProviderArtifactsMutateResultSchema = z.strictObject({
  harness: z.string().min(1),
  current: z.string().nullable().optional(),
  version: z.string().optional(),
  digest: z.string().optional(),
  entries: z.number().int().nonnegative().optional()
})
export type ProviderModelsCreateParams = z.infer<typeof ProviderModelsCreateParamsSchema>
export const ProviderModelsCreateResultSchema = z.strictObject({
  providerModel: ProviderModelConfigRecordSchema
})
export type ProviderModelsCreateResult = z.infer<typeof ProviderModelsCreateResultSchema>

export const ProviderModelsUpdateParamsSchema = ProviderModelWriteFieldsSchema.omit({
  harness: true,
  provider: true
}).extend({
  requestId: RequestIdSchema,
  providerModelId: WireIdSchema,
  expectedVersion: RecordVersionSchema
})
export type ProviderModelsUpdateParams = z.infer<typeof ProviderModelsUpdateParamsSchema>
export const ProviderModelsUpdateResultSchema = ProviderModelsCreateResultSchema
export type ProviderModelsUpdateResult = z.infer<typeof ProviderModelsUpdateResultSchema>

export const ProviderModelsArchiveParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  providerModelId: WireIdSchema,
  expectedVersion: RecordVersionSchema
})
export type ProviderModelsArchiveParams = z.infer<typeof ProviderModelsArchiveParamsSchema>
export const ProviderModelsArchiveResultSchema = ProviderModelsCreateResultSchema
export type ProviderModelsArchiveResult = z.infer<typeof ProviderModelsArchiveResultSchema>

export const ConfigDescribeParamsSchema = z.object({
  profileId: WireIdSchema,
  workspaceId: WireIdSchema.nullable()
})
export type ConfigDescribeParams = z.infer<typeof ConfigDescribeParamsSchema>
export const ConfigDescribeResultSchema = z.object({ descriptor: ConfigDescriptorSchema })
export type ConfigDescribeResult = z.infer<typeof ConfigDescribeResultSchema>

/** Effective-config resolution happens SERVER-side (core v1 §5: adapter
 *  default → profile default → explicit override; security never overridable). */
export const ConfigResolveParamsSchema = z.object({
  profileId: WireIdSchema,
  workspaceId: WireIdSchema.nullable(),
  overrides: z.array(ConfigOverrideSchema)
})
export type ConfigResolveParams = z.infer<typeof ConfigResolveParamsSchema>

export const ConfigResolveResultSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('resolved'),
    /** Fixed at acceptance time for a send (core v1 §5: draft choices are
     *  not the effective configuration until the run accepts them). */
    effective: z.array(z.object({ controlId: z.string(), value: z.unknown() }))
  }),
  z.object({
    outcome: z.literal('rejected'),
    invalidControls: z.array(z.object({ controlId: z.string(), reason: z.string() }))
  })
])
export type ConfigResolveResult = z.infer<typeof ConfigResolveResultSchema>

/** Session catalog and shared metadata. Listing is the restart discovery path;
 * renderer caches never stand in for this authority. */
export const SessionsListParamsSchema = z.strictObject({
  workspaceId: WireIdSchema.nullable().optional(),
  includeArchived: z.boolean().default(false),
  page: WirePageSchema.optional()
})
export type SessionsListParams = z.infer<typeof SessionsListParamsSchema>
export const SessionsListResultSchema = z.strictObject({
  items: z.array(SessionRecordSchema),
  nextCursor: WireCursorSchema.nullable()
})
export type SessionsListResult = z.infer<typeof SessionsListResultSchema>

export const SessionsUpdateParamsSchema = z
  .strictObject({
    requestId: RequestIdSchema,
    sessionId: WireIdSchema,
    expectedVersion: RecordVersionSchema,
    displayName: z.string().min(1).optional(),
    pinned: z.boolean().optional(),
    workspaceId: WireIdSchema.optional()
  })
  .refine(value => value.displayName !== undefined || value.pinned !== undefined || value.workspaceId !== undefined, {
    message: 'A Session update must change at least one field'
  })
export type SessionsUpdateParams = z.infer<typeof SessionsUpdateParamsSchema>
export const SessionsUpdateResultSchema = z.strictObject({ session: SessionRecordSchema })
export type SessionsUpdateResult = z.infer<typeof SessionsUpdateResultSchema>

export const SessionsArchiveParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  sessionId: WireIdSchema,
  expectedVersion: RecordVersionSchema
})
export type SessionsArchiveParams = z.infer<typeof SessionsArchiveParamsSchema>
export const SessionsArchiveResultSchema = z.strictObject({ session: SessionRecordSchema })
export type SessionsArchiveResult = z.infer<typeof SessionsArchiveResultSchema>

/** Same-harness profile switch on an EXISTING session: server-confirmed,
 *  old state kept on failure (core v1 §3/§5). Idempotent per requestId. */
export const SessionsSwitchProfileParamsSchema = z.object({
  requestId: RequestIdSchema,
  sessionId: WireIdSchema,
  profileId: WireIdSchema,
  expectedVersion: RecordVersionSchema
})
export type SessionsSwitchProfileParams = z.infer<typeof SessionsSwitchProfileParamsSchema>

export const SessionsSwitchProfileResultSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('confirmed'), session: SessionRecordSchema }),
  z.object({ outcome: z.literal('rejected'), reason: z.string(), session: SessionRecordSchema })
])
export type SessionsSwitchProfileResult = z.infer<typeof SessionsSwitchProfileResultSchema>

/** First send is ONE business intent (core v1 §6): the server consistently
 *  saves session + first message + pending execution, answers ACCEPTED (or
 *  rejects BEFORE acceptance), and only then dispatches. Idempotency scope:
 *  requestId, globally. Same id + same payload replays the SAME answer. */
export const SessionsCreateAndSendParamsSchema = z.object({
  requestId: RequestIdSchema,
  workspaceId: WireIdSchema,
  profileId: WireIdSchema,
  overrides: z.array(ConfigOverrideSchema),
  message: DraftMessageSchema
})
export type SessionsCreateAndSendParams = z.infer<typeof SessionsCreateAndSendParamsSchema>

export const SessionsCreateAndSendResultSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('accepted'),
    session: SessionRecordSchema,
    executionId: WireIdSchema,
    /** The configuration version the run fixed at acceptance. */
    configVersion: RecordVersionSchema
  }),
  z.object({
    outcome: z.literal('rejected_before_accept'),
    reason: z.string(),
    /** No session was created — the draft survives untouched. */
    invalidControls: z.array(z.object({ controlId: z.string(), reason: z.string() })).nullable()
  })
])
export type SessionsCreateAndSendResult = z.infer<typeof SessionsCreateAndSendResultSchema>

/** Continue-send on an existing session (follow-up default). */
export const SessionsSendParamsSchema = z.object({
  requestId: RequestIdSchema,
  sessionId: WireIdSchema,
  overrides: z.array(ConfigOverrideSchema).default([]),
  message: DraftMessageSchema
})
export type SessionsSendParams = z.infer<typeof SessionsSendParamsSchema>

export const SessionsSendResultSchema = z.union([
  z.object({
    outcome: z.literal('accepted'),
    executionId: WireIdSchema,
    configVersion: RecordVersionSchema,
    queueItemId: z.null()
  }),
  z.object({
    outcome: z.literal('accepted'),
    /** A null execution plus a queue id is an accepted, frozen follow-up. */
    executionId: z.null(),
    configVersion: RecordVersionSchema,
    queueItemId: WireIdSchema
  }),
  z.object({ outcome: z.literal('rejected_before_accept'), reason: z.string() })
])
export type SessionsSendResult = z.infer<typeof SessionsSendResultSchema>

/** Query an original requestId (core v1 §6: timeout ⇒ query, never resend;
 *  UNKNOWN is not a safe-to-resend answer). Scope = the send families. */
export const SendOutcomeQueryParamsSchema = z.object({ requestId: RequestIdSchema })
export type SendOutcomeQueryParams = z.infer<typeof SendOutcomeQueryParamsSchema>

export const SendOutcomeQueryResultSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('accepted'),
    sessionId: WireIdSchema,
    executionId: WireIdSchema.nullable(),
    configVersion: RecordVersionSchema,
    queueItemId: WireIdSchema.nullable()
  }),
  z.object({ outcome: z.literal('rejected_before_accept'), reason: z.string() }),
  z.object({ outcome: z.literal('unknown') })
])
export type SendOutcomeQueryResult = z.infer<typeof SendOutcomeQueryResultSchema>

export const QueueGetParamsSchema = z.object({ sessionId: WireIdSchema })
export type QueueGetParams = z.infer<typeof QueueGetParamsSchema>
export const QueueGetResultSchema = z.object({ items: z.array(ActiveQueueItemSchema) })
export type QueueGetResult = z.infer<typeof QueueGetResultSchema>

export const QueueWithdrawParamsSchema = z.object({
  requestId: RequestIdSchema,
  sessionId: WireIdSchema,
  itemId: WireIdSchema,
  expectedVersion: RecordVersionSchema
})
export type QueueWithdrawParams = z.infer<typeof QueueWithdrawParamsSchema>
export const QueueWithdrawResultSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('withdrawn'), item: QueueItemSchema }),
  z.object({ outcome: z.literal('too_late'), reason: z.string(), item: QueueItemSchema.nullable() })
])
export type QueueWithdrawResult = z.infer<typeof QueueWithdrawResultSchema>

/** Stop (core v1 §6): request → stopping → confirmed stop. The answer says
 *  STOP_REQUESTED — the real terminal state arrives as execution.state. */
export const RunsStopParamsSchema = z.object({
  requestId: RequestIdSchema,
  sessionId: WireIdSchema,
  executionId: WireIdSchema
})
export type RunsStopParams = z.infer<typeof RunsStopParamsSchema>

export const RunsStopResultSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('stop_requested'), executionId: WireIdSchema }),
  z.object({ outcome: z.literal('already_finished'), executionId: WireIdSchema, reason: z.string() }),
  z.object({ outcome: z.literal('unconfirmed'), reason: z.string() })
])
export type RunsStopResult = z.infer<typeof RunsStopResultSchema>

/** Approvals (core v1 §7): first valid decision is atomically accepted;
 *  a retried SAME decision returns the stored result; a conflicting one is
 *  rejected APPROVAL_INVALID. Decision idempotency scope = approvalId. */
export const ApprovalsDecideParamsSchema = z.object({
  requestId: RequestIdSchema,
  approvalId: WireIdSchema,
  expectedVersion: RecordVersionSchema,
  decision: z.enum(['allow', 'deny']),
  scope: ApprovalDecisionScopeSchema
})
export type ApprovalsDecideParams = z.infer<typeof ApprovalsDecideParamsSchema>

export const ApprovalsDecideResultSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('recorded'), decision: z.enum(['allow', 'deny']) }),
  z.object({ outcome: z.literal('already_recorded'), decision: z.enum(['allow', 'deny']) }),
  z.object({ outcome: z.literal('invalid'), reason: z.string() })
])
export type ApprovalsDecideResult = z.infer<typeof ApprovalsDecideResultSchema>

/** History & recovery (core v1 §7): snapshot with a consistent cursor;
 *  events after the cursor arrive through the subscription — or the client
 *  is told to resync when its cursor is too old. Replay restores
 *  presentation only. */
export const HistorySnapshotParamsSchema = z.object({
  sessionId: WireIdSchema,
  cursor: WireCursorSchema.optional(),
  page: WirePageSchema.optional()
})
export type HistorySnapshotParams = z.infer<typeof HistorySnapshotParamsSchema>

export const HistorySnapshotResultSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('snapshot'),
    frames: z.array(EventFrameSchema),
    /** Feed the subscription from here for a gap-free join. */
    resumeCursor: WireCursorSchema,
    /** A distinct backward-pagination cursor; never reused as a live cursor. */
    olderCursor: WireCursorSchema.nullable()
  }),
  z.object({ outcome: z.literal('resync_required'), reason: z.string() })
])
export type HistorySnapshotResult = z.infer<typeof HistorySnapshotResultSchema>

// ─── Order 62: a workspace's Git status (read-only, six nullable fields) ────

/** Six fields, each independently null — null means "not obtainable", never
 *  zero, and `reason` carries the typed cause. A repository with no upstream
 *  has no ahead/behind (the absence IS the fact); a binary diff has no line
 *  counts. The client renders the reason; it never fills a gap with 0. */
export const WorkspaceGitStatusSchema = z.strictObject({
  branch: z.string().nullable(),
  changedFiles: z.number().int().nonnegative().nullable(),
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
  ahead: z.number().int().nonnegative().nullable(),
  behind: z.number().int().nonnegative().nullable(),
  /** Typed code among GIT_UNAVAILABLE / GIT_NOT_A_REPOSITORY / GIT_TIMEOUT /
   *  GIT_OUTPUT_LIMIT / GIT_PARSE_FAILED / GIT_NO_COMMITS / GIT_BINARY_DIFF /
   *  GIT_WORKSPACE_MISSING — null when every field above was obtainable. */
  reason: z.string().nullable()
})
export type WorkspaceGitStatus = z.infer<typeof WorkspaceGitStatusSchema>

export const WorkspacesGitStatusParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  workspaceId: WireIdSchema
})
export type WorkspacesGitStatusParams = z.infer<typeof WorkspacesGitStatusParamsSchema>
export const WorkspacesGitStatusResultSchema = z.strictObject({ git: WorkspaceGitStatusSchema })
export type WorkspacesGitStatusResult = z.infer<typeof WorkspacesGitStatusResultSchema>

// ─── Order 64: the in-flight executions we own (read-only inventory) ────────

/** One row per active turn, straight from the ledger: no machine-level
 *  process enumeration, no cancellation surface. `pid` is filled only where
 *  the platform can report it; otherwise it is null WITH a `pidReason` — a
 *  null pid is never rendered as 0 and never guessed. */
export const ExecutionInventoryRowSchema = z.strictObject({
  executionId: WireIdSchema,
  turnId: WireIdSchema,
  sessionId: WireIdSchema,
  profileId: WireIdSchema,
  /** Display facts for a list that must stand alone. */
  profile: z.string(),
  harness: z.string(),
  placement: z.string(),
  state: z.enum(['queued', 'dispatched', 'running', 'stopping', 'stopped', 'completed', 'failed', 'unknown']),
  startedAt: WireTimestampSchema,
  workspaceId: WireIdSchema,
  workspace: z.string(),
  queueItemId: WireIdSchema.nullable(),
  pid: z.number().int().nullable(),
  pidReason: z.string().nullable(),
  adapterPid: z.number().int().nullable(),
  adapterPidReason: z.string().nullable()
})
export type ExecutionInventoryRow = z.infer<typeof ExecutionInventoryRowSchema>

/** The server refuses a shorter list rather than truncating silently, so the
 *  client's own bound is the server's. */
export const EXECUTION_INVENTORY_LIMIT = 200

export const ExecutionsListParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  limit: z.number().int().min(1).max(EXECUTION_INVENTORY_LIMIT).optional()
})
export type ExecutionsListParams = z.infer<typeof ExecutionsListParamsSchema>
export const ExecutionsListResultSchema = z.strictObject({ executions: z.array(ExecutionInventoryRowSchema) })
export type ExecutionsListResult = z.infer<typeof ExecutionsListResultSchema>

// ─── Order 63: a role's declared memory files (read-only) ───────────────────

/** A declared memory file, either delivered or refused as a whole. A file
 *  whose bytes hit the credential rule carries a reason and NO content — the
 *  material never crosses this wire, not even to be hidden by the UI. */
export const MemoryFileSchema = z.union([
  z.strictObject({
    path: z.string(),
    size: z.number().int().nonnegative(),
    digest: z.string(),
    content: z.string()
  }),
  z.strictObject({
    path: z.string(),
    size: z.number().int().nonnegative(),
    reason: z.literal('MEMORY_CONTAINS_SECRET'),
    refused: z.literal(true)
  })
])
export type MemoryFile = z.infer<typeof MemoryFileSchema>

/** `available:false` is the honest answer for a family that declares no
 *  memory paths, a home that is not there, or a remote home we cannot read —
 *  the client HIDES the partition rather than drawing an empty one. */
export const ProfileMemorySchema = z.strictObject({
  available: z.boolean(),
  reason: z.string().nullable(),
  files: z.array(MemoryFileSchema),
  note: z.string().optional()
})
export type ProfileMemory = z.infer<typeof ProfileMemorySchema>

export const ProfilesMemoryParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  profileId: WireIdSchema
})
export type ProfilesMemoryParams = z.infer<typeof ProfilesMemoryParamsSchema>
export const ProfilesMemoryResultSchema = z.strictObject({ memory: ProfileMemorySchema })
export type ProfilesMemoryResult = z.infer<typeof ProfilesMemoryResultSchema>

// ─── Order 60: cloning a role, and writing its permission posture ───────────

/** What traveled, what did not, and why — computed BEFORE anything is
 *  written, so the report and the rows cannot disagree. Native session
 *  material never travels (`native-sessions` is always unmigrated). */
export const ProfileMigrationEntrySchema = z.strictObject({
  item: z.string(),
  migrated: z.boolean(),
  reason: z.string(),
  detail: z.unknown().optional()
})
export type ProfileMigrationEntry = z.infer<typeof ProfileMigrationEntrySchema>

export const ProfileMigrationSchema = z.strictObject({
  targetFamily: z.string(),
  sourceFamily: z.string(),
  sameFamily: z.boolean(),
  items: z.array(ProfileMigrationEntrySchema),
  /** The permission posture the clone receives (family-neutral, re-expanded
   *  so the stored order is preserved), or null when it no longer validates. */
  permissions: z.strictObject({
    preset: z.string(),
    rules: z.array(PermissionRuleSchema)
  }).nullable(),
  reboundAssets: z.array(z.string()),
  migratedCount: z.number().int().nonnegative(),
  refusedCount: z.number().int().nonnegative()
})
export type ProfileMigration = z.infer<typeof ProfileMigrationSchema>

export const ProfilesCloneParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  profileId: WireIdSchema,
  displayName: z.string().min(1),
  harness: z.string().min(1).optional()
})
export type ProfilesCloneParams = z.infer<typeof ProfilesCloneParamsSchema>
export const ProfilesCloneResultSchema = z.strictObject({
  profile: ProfileRecordSchema,
  migration: ProfileMigrationSchema
})
export type ProfilesCloneResult = z.infer<typeof ProfilesCloneResultSchema>

/** The rules are validated before storage: an illegal key or action answers
 *  its own typed code and nothing is saved. */
export const ProfilesSetPermissionsParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  profileId: WireIdSchema,
  expectedVersion: RecordVersionSchema,
  preset: z.string().min(1),
  rules: z.array(PermissionRuleSchema)
})
export type ProfilesSetPermissionsParams = z.infer<typeof ProfilesSetPermissionsParamsSchema>
export const ProfilesSetPermissionsResultSchema = z.strictObject({ profile: ProfileRecordSchema })
export type ProfilesSetPermissionsResult = z.infer<typeof ProfilesSetPermissionsResultSchema>

// ─── Order 58: managed assets (catalogue, revisions, bindings, catalogues) ──

/** The stable identity every store, directory row and binding shares. */
export const AssetSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/)
export type AssetSlug = z.infer<typeof AssetSlugSchema>

/** The catalogue shape: no content, no host paths — a directory entry, not
 *  the asset itself. */
export const AssetViewSchema = z.strictObject({
  assetId: AssetSlugSchema,
  kind: z.enum(['skill', 'mcp', 'plugin']),
  name: z.string(),
  description: z.string().nullable(),
  latestRevision: z.number().int().nonnegative(),
  digest: z.string(),
  source: z.string().nullable(),
  createdAt: WireTimestampSchema,
  updatedAt: WireTimestampSchema
})
export type AssetView = z.infer<typeof AssetViewSchema>

export const AssetBindingSchema = z.strictObject({
  assetId: AssetSlugSchema,
  kind: z.enum(['skill', 'mcp', 'plugin']),
  name: z.string(),
  revision: z.number().int().positive(),
  digest: z.string(),
  /** A disabled binding is still a binding — the UI must show the state, not
   *  drop the row. */
  enabled: z.boolean()
})
export type AssetBinding = z.infer<typeof AssetBindingSchema>

/** A standard MCP server definition. The store owns its canonical shape and
 *  the rules that refuse a bad one, so the contract carries the object as
 *  data instead of restating a second authority. */
export const McpServerDefinitionSchema = z.record(z.string(), z.unknown())
export type McpServerDefinition = z.infer<typeof McpServerDefinitionSchema>

export const CatalogEntrySchema = z.strictObject({
  kind: z.enum(['skill', 'mcp']),
  name: z.string(),
  /** Relative to the source the snapshot names; never a host path. */
  path: z.string(),
  origin: z.string(),
  description: z.string().optional(),
  /** Where the entry stands against what is already published. */
  installed: z.boolean(),
  installedDigest: z.string().nullable()
})
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>

export const CatalogSchema = z.strictObject({
  sourcePath: z.string(),
  digest: z.string(),
  entries: z.array(CatalogEntrySchema)
})
export type Catalog = z.infer<typeof CatalogSchema>

export const AssetsListParamsSchema = z.strictObject({})
export type AssetsListParams = z.infer<typeof AssetsListParamsSchema>
export const AssetsListResultSchema = z.strictObject({ assets: z.array(AssetViewSchema) })
export type AssetsListResult = z.infer<typeof AssetsListResultSchema>

export const AssetsPublishSkillParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  assetId: AssetSlugSchema,
  revision: z.number().int().positive(),
  sourcePath: z.string().min(1)
})
export type AssetsPublishSkillParams = z.infer<typeof AssetsPublishSkillParamsSchema>
export const AssetsPublishSkillResultSchema = z.strictObject({ asset: AssetViewSchema })
export type AssetsPublishSkillResult = z.infer<typeof AssetsPublishSkillResultSchema>

export const AssetsPublishMcpParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  assetId: AssetSlugSchema,
  revision: z.number().int().positive(),
  definition: McpServerDefinitionSchema
})
export type AssetsPublishMcpParams = z.infer<typeof AssetsPublishMcpParamsSchema>
export const AssetsPublishMcpResultSchema = AssetsPublishSkillResultSchema
export type AssetsPublishMcpResult = z.infer<typeof AssetsPublishMcpResultSchema>

/** Code assets are stored verbatim (the digest covers the original bytes) and
 *  answered with a bounded preview — no form ever assembles this code. */
export const AssetsPublishPluginParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  assetId: AssetSlugSchema,
  revision: z.number().int().positive(),
  sourcePath: z.string().min(1)
})
export type AssetsPublishPluginParams = z.infer<typeof AssetsPublishPluginParamsSchema>
export const AssetsPublishPluginResultSchema = z.strictObject({
  asset: AssetViewSchema,
  preview: z.string()
})
export type AssetsPublishPluginResult = z.infer<typeof AssetsPublishPluginResultSchema>

export const AssetsBindParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  profileId: WireIdSchema,
  assetId: AssetSlugSchema,
  revision: z.number().int().positive().optional(),
  enabled: z.boolean().optional()
})
export type AssetsBindParams = z.infer<typeof AssetsBindParamsSchema>
export const AssetsBindResultSchema = z.strictObject({ binding: AssetBindingSchema })
export type AssetsBindResult = z.infer<typeof AssetsBindResultSchema>

export const AssetsUnbindParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  profileId: WireIdSchema,
  assetId: AssetSlugSchema
})
export type AssetsUnbindParams = z.infer<typeof AssetsUnbindParamsSchema>
export const AssetsUnbindResultSchema = z.strictObject({ unbound: z.literal(true) })
export type AssetsUnbindResult = z.infer<typeof AssetsUnbindResultSchema>

export const AssetsBindingsParamsSchema = z.strictObject({ profileId: WireIdSchema })
export type AssetsBindingsParams = z.infer<typeof AssetsBindingsParamsSchema>
export const AssetsBindingsResultSchema = z.strictObject({ bindings: z.array(AssetBindingSchema) })
export type AssetsBindingsResult = z.infer<typeof AssetsBindingsResultSchema>

export const AssetsSyncCatalogParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  sourceId: AssetSlugSchema,
  sourcePath: z.string().min(1)
})
export type AssetsSyncCatalogParams = z.infer<typeof AssetsSyncCatalogParamsSchema>
export const AssetsCatalogResultSchema = z.strictObject({ catalog: CatalogSchema })
export type AssetsCatalogResult = z.infer<typeof AssetsCatalogResultSchema>

export const AssetsCatalogParamsSchema = z.strictObject({ sourceId: AssetSlugSchema })
export type AssetsCatalogParams = z.infer<typeof AssetsCatalogParamsSchema>

export const AssetsInstallFromCatalogParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  sourceId: AssetSlugSchema,
  entryName: AssetSlugSchema,
  revision: z.number().int().positive()
})
export type AssetsInstallFromCatalogParams = z.infer<typeof AssetsInstallFromCatalogParamsSchema>
/** The published row, plus the pinned provenance `<snapshot digest>:<origin>`
 *  — an install never silently switches source. */
export const AssetsInstallFromCatalogResultSchema = z.strictObject({
  installed: z.strictObject({
    asset_id: AssetSlugSchema,
    kind: z.enum(['skill', 'mcp']),
    name: z.string(),
    revision: z.number().int().positive(),
    digest: z.string(),
    source: z.string()
  })
})
export type AssetsInstallFromCatalogResult = z.infer<typeof AssetsInstallFromCatalogResultSchema>

/** One bounded stdio handshake: no configuration is written, no credential is
 *  read, no completion is attempted. */
export const McpProbeFactsSchema = z.strictObject({
  status: z.literal('ok'),
  serverName: z.string().nullable(),
  serverVersion: z.string().nullable(),
  protocolVersion: z.string().nullable()
})
export type McpProbeFacts = z.infer<typeof McpProbeFactsSchema>

export const AssetsProbeParamsSchema = z.strictObject({ definition: McpServerDefinitionSchema })
export type AssetsProbeParams = z.infer<typeof AssetsProbeParamsSchema>
export const AssetsProbeResultSchema = z.strictObject({ probe: McpProbeFactsSchema })
export type AssetsProbeResult = z.infer<typeof AssetsProbeResultSchema>

// ─── Order 59: managed hooks (models, enablement, trigger history) ──────────

/** The hook model is the target family's shape; these are the canonical keys
 *  the ledger stores, and `commands` is derived from them so the UI can show
 *  the exact commands an enable would run. */
export const HookHandlerSchema = z.object({
  type: z.string(),
  command: z.string().optional(),
  url: z.string().optional(),
  tool: z.string().optional(),
  prompt: z.string().optional(),
  timeout: z.number().int().positive(),
  async: z.boolean()
})
export type HookHandler = z.infer<typeof HookHandlerSchema>

export const HookModelSchema = z.object({
  event: z.string(),
  matcher: z.string().optional(),
  handlers: z.array(HookHandlerSchema).min(1)
})
export type HookModel = z.infer<typeof HookModelSchema>

export const HookViewSchema = z.strictObject({
  hookId: WireIdSchema,
  family: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  model: HookModelSchema,
  /** Every command this hook would run, in order — visible before enabling. */
  commands: z.array(z.string()),
  source: z.string().nullable(),
  createdAt: WireTimestampSchema,
  updatedAt: WireTimestampSchema
})
export type HookView = z.infer<typeof HookViewSchema>

/** `exit 2` blocks: the trigger row says so, and the UI must not soften it. */
export const HookTriggerViewSchema = z.strictObject({
  triggerId: WireIdSchema,
  hookId: WireIdSchema,
  event: z.string(),
  at: WireTimestampSchema,
  exitCode: z.number().int(),
  outputSummary: z.string().nullable(),
  truncated: z.boolean(),
  blocking: z.boolean(),
  effect: z.enum(['blocked', 'ran', 'failed'])
})
export type HookTriggerView = z.infer<typeof HookTriggerViewSchema>

export const HooksListParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  family: z.string().optional()
})
export type HooksListParams = z.infer<typeof HooksListParamsSchema>
export const HooksListResultSchema = z.strictObject({ hooks: z.array(HookViewSchema) })
export type HooksListResult = z.infer<typeof HooksListResultSchema>

export const HooksCreateParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  family: z.string().min(1),
  name: z.string().min(1),
  model: HookModelSchema,
  source: z.string().optional()
})
export type HooksCreateParams = z.infer<typeof HooksCreateParamsSchema>
export const HooksCreateResultSchema = z.strictObject({ hook: HookViewSchema })
export type HooksCreateResult = z.infer<typeof HooksCreateResultSchema>

export const HooksUpdateParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  hookId: WireIdSchema,
  model: HookModelSchema
})
export type HooksUpdateParams = z.infer<typeof HooksUpdateParamsSchema>
export const HooksUpdateResultSchema = HooksCreateResultSchema
export type HooksUpdateResult = z.infer<typeof HooksUpdateResultSchema>

export const HooksSetEnabledParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  hookId: WireIdSchema,
  enabled: z.boolean()
})
export type HooksSetEnabledParams = z.infer<typeof HooksSetEnabledParamsSchema>
export const HooksSetEnabledResultSchema = HooksCreateResultSchema
export type HooksSetEnabledResult = z.infer<typeof HooksSetEnabledResultSchema>

export const HooksDeleteParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  hookId: WireIdSchema
})
export type HooksDeleteParams = z.infer<typeof HooksDeleteParamsSchema>
/** The cascade is explicit: deleting a hook removes its trigger history, and
 *  the count is answered rather than implied. */
export const HooksDeleteResultSchema = z.strictObject({
  deleted: z.literal(true),
  triggersRemoved: z.number().int().nonnegative()
})
export type HooksDeleteResult = z.infer<typeof HooksDeleteResultSchema>

export const HooksTriggersParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  hookId: WireIdSchema.optional(),
  limit: z.number().int().min(1).max(500).optional()
})
export type HooksTriggersParams = z.infer<typeof HooksTriggersParamsSchema>
export const HooksTriggersResultSchema = z.strictObject({ triggers: z.array(HookTriggerViewSchema) })
export type HooksTriggersResult = z.infer<typeof HooksTriggersResultSchema>

// ─── Order 56: managed subscription accounts (references only) ──────────────

/** Zero tokens, zero locators, zero digests: `hasAsset` says whether a login
 *  state exists, and the material itself stays in the platform secret store. */
export const AccountViewSchema = z.strictObject({
  accountId: WireIdSchema,
  harnessType: z.string(),
  accountIdentifier: z.string(),
  state: z.string(),
  hasAsset: z.boolean(),
  lastVerifiedAt: WireTimestampSchema.nullable(),
  createdAt: WireTimestampSchema,
  updatedAt: WireTimestampSchema
})
export type AccountView = z.infer<typeof AccountViewSchema>

export const AccountsListParamsSchema = z.strictObject({})
export type AccountsListParams = z.infer<typeof AccountsListParamsSchema>
export const AccountsListResultSchema = z.strictObject({ accounts: z.array(AccountViewSchema) })
export type AccountsListResult = z.infer<typeof AccountsListResultSchema>

export const AccountsCreateParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  harness: z.string().min(1),
  accountIdentifier: z.string().min(1)
})
export type AccountsCreateParams = z.infer<typeof AccountsCreateParamsSchema>
export const AccountsCreateResultSchema = z.strictObject({ account: AccountViewSchema })
export type AccountsCreateResult = z.infer<typeof AccountsCreateResultSchema>

/** A null accountId unbinds; the write is versioned like every other profile
 *  write, so a concurrent edit answers CONFLICT_VERSION instead of winning. */
export const AccountsBindParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  profileId: WireIdSchema,
  expectedVersion: RecordVersionSchema,
  accountId: WireIdSchema.nullable()
})
export type AccountsBindParams = z.infer<typeof AccountsBindParamsSchema>
export const AccountsBindResultSchema = z.strictObject({ profile: ProfileRecordSchema })
export type AccountsBindResult = z.infer<typeof AccountsBindResultSchema>

export const AccountsImportAssetParamsSchema = z.strictObject({
  requestId: RequestIdSchema,
  accountId: WireIdSchema,
  sourcePath: z.string().min(1)
})
export type AccountsImportAssetParams = z.infer<typeof AccountsImportAssetParamsSchema>
export const AccountsImportAssetResultSchema = z.strictObject({ account: AccountViewSchema })
export type AccountsImportAssetResult = z.infer<typeof AccountsImportAssetResultSchema>

// ─── Method registry ─────────────────────────────────────────────────────────

/** Method name → [params, result]. The registry is the review surface: one
 *  row per core-v1 §8 capability (see semantics-map.md for the mapping and
 *  per-method idempotency scopes). */
export const WireMethods = {
  'server.hello': [HelloParamsSchema, HelloResultSchema],
  'workspaces.open': [WorkspacesOpenParamsSchema, WorkspacesOpenResultSchema],
  'workspaces.list': [WorkspacesListParamsSchema, WorkspacesListResultSchema],
  'workspaces.browse': [WorkspacesBrowseParamsSchema, WorkspacesBrowseResultSchema],
  'workspaces.archive': [WorkspacesArchiveParamsSchema, WorkspacesArchiveResultSchema],
  'workspaces.gitStatus': [WorkspacesGitStatusParamsSchema, WorkspacesGitStatusResultSchema],
  'executions.list': [ExecutionsListParamsSchema, ExecutionsListResultSchema],
  'profiles.list': [ProfilesListParamsSchema, ProfilesListResultSchema],
  'profiles.create': [ProfilesCreateParamsSchema, ProfilesCreateResultSchema],
  'profiles.update': [ProfilesUpdateParamsSchema, ProfilesUpdateResultSchema],
  'profiles.archive': [ProfilesArchiveParamsSchema, ProfilesArchiveResultSchema],
  'profiles.updateConfig': [ProfilesUpdateConfigParamsSchema, ProfilesUpdateConfigResultSchema],
  'profiles.clone': [ProfilesCloneParamsSchema, ProfilesCloneResultSchema],
  'profiles.setPermissions': [ProfilesSetPermissionsParamsSchema, ProfilesSetPermissionsResultSchema],
  'profiles.memory': [ProfilesMemoryParamsSchema, ProfilesMemoryResultSchema],
  'providerModels.list': [ProviderModelsListParamsSchema, ProviderModelsListResultSchema],
  'providerModels.create': [ProviderModelsCreateParamsSchema, ProviderModelsCreateResultSchema],
  'providerModels.update': [ProviderModelsUpdateParamsSchema, ProviderModelsUpdateResultSchema],
  'providerModels.archive': [ProviderModelsArchiveParamsSchema, ProviderModelsArchiveResultSchema],
  'providerModels.probeModels': [ProviderModelsProbeModelsParamsSchema, ProviderModelsProbeModelsResultSchema],
  'providerModels.probeConnection': [ProviderModelsProbeConnectionParamsSchema, ProviderModelsProbeConnectionResultSchema],
  'providerArtifacts.list': [ProviderArtifactsListParamsSchema, ProviderArtifactsListResultSchema],
  'providerArtifacts.install': [ProviderArtifactsInstallParamsSchema, ProviderArtifactsMutateResultSchema],
  'providerArtifacts.rollback': [ProviderArtifactsRollbackParamsSchema, ProviderArtifactsMutateResultSchema],
  'assets.list': [AssetsListParamsSchema, AssetsListResultSchema],
  'assets.publishSkill': [AssetsPublishSkillParamsSchema, AssetsPublishSkillResultSchema],
  'assets.publishMcp': [AssetsPublishMcpParamsSchema, AssetsPublishMcpResultSchema],
  'assets.publishPlugin': [AssetsPublishPluginParamsSchema, AssetsPublishPluginResultSchema],
  'assets.bind': [AssetsBindParamsSchema, AssetsBindResultSchema],
  'assets.unbind': [AssetsUnbindParamsSchema, AssetsUnbindResultSchema],
  'assets.bindings': [AssetsBindingsParamsSchema, AssetsBindingsResultSchema],
  'assets.syncCatalog': [AssetsSyncCatalogParamsSchema, AssetsCatalogResultSchema],
  'assets.catalog': [AssetsCatalogParamsSchema, AssetsCatalogResultSchema],
  'assets.installFromCatalog': [AssetsInstallFromCatalogParamsSchema, AssetsInstallFromCatalogResultSchema],
  'assets.probe': [AssetsProbeParamsSchema, AssetsProbeResultSchema],
  'hooks.list': [HooksListParamsSchema, HooksListResultSchema],
  'hooks.create': [HooksCreateParamsSchema, HooksCreateResultSchema],
  'hooks.update': [HooksUpdateParamsSchema, HooksUpdateResultSchema],
  'hooks.setEnabled': [HooksSetEnabledParamsSchema, HooksSetEnabledResultSchema],
  'hooks.delete': [HooksDeleteParamsSchema, HooksDeleteResultSchema],
  'hooks.triggers': [HooksTriggersParamsSchema, HooksTriggersResultSchema],
  'accounts.list': [AccountsListParamsSchema, AccountsListResultSchema],
  'accounts.create': [AccountsCreateParamsSchema, AccountsCreateResultSchema],
  'accounts.bind': [AccountsBindParamsSchema, AccountsBindResultSchema],
  'accounts.importAsset': [AccountsImportAssetParamsSchema, AccountsImportAssetResultSchema],
  'config.describe': [ConfigDescribeParamsSchema, ConfigDescribeResultSchema],
  'config.resolve': [ConfigResolveParamsSchema, ConfigResolveResultSchema],
  'sessions.list': [SessionsListParamsSchema, SessionsListResultSchema],
  'sessions.update': [SessionsUpdateParamsSchema, SessionsUpdateResultSchema],
  'sessions.archive': [SessionsArchiveParamsSchema, SessionsArchiveResultSchema],
  'sessions.switchProfile': [SessionsSwitchProfileParamsSchema, SessionsSwitchProfileResultSchema],
  'sessions.createAndSend': [SessionsCreateAndSendParamsSchema, SessionsCreateAndSendResultSchema],
  'sessions.send': [SessionsSendParamsSchema, SessionsSendResultSchema],
  'sendOutcome.query': [SendOutcomeQueryParamsSchema, SendOutcomeQueryResultSchema],
  'queue.get': [QueueGetParamsSchema, QueueGetResultSchema],
  'queue.withdraw': [QueueWithdrawParamsSchema, QueueWithdrawResultSchema],
  'runs.stop': [RunsStopParamsSchema, RunsStopResultSchema],
  'approvals.decide': [ApprovalsDecideParamsSchema, ApprovalsDecideResultSchema],
  'history.snapshot': [HistorySnapshotParamsSchema, HistorySnapshotResultSchema]
} as const

export type WireMethodName = keyof typeof WireMethods
export type WireParamsOf<M extends WireMethodName> = z.infer<(typeof WireMethods)[M][0]>
export type WireResultOf<M extends WireMethodName> = z.infer<(typeof WireMethods)[M][1]>

/** The event stream is a websocket/long-lived channel carrying EventFrames;
 *  subscribe/resume is expressed by `history.snapshot` + the stream cursor,
 *  not by a separate RPC (one recovery mechanism, core v1 §7). */
export const WIRE_EVENT_STREAM = 'wire.eventStream/1' as const

/** JSON-Schema projection for server-side review (one map of schemas, keyed;
 *  generated into contracts/wire-v1/generated/ — never hand-edited). */
export function wireJsonSchemas(): Record<string, unknown> {
  const entries: Record<string, z.ZodType> = {
    WireRequest: WireRequestSchema,
    WireResponse: WireResponseSchema,
    WireError: WireErrorSchema,
    EventFrame: EventFrameSchema,
    WireEvent: WireEventSchema
  }

  for (const [method, [params, result]] of Object.entries(WireMethods)) {
    entries[`${method}#params`] = params
    entries[`${method}#result`] = result
  }

  const schemas = Object.fromEntries(Object.entries(entries).map(([key, schema]) => [key, z.toJSONSchema(schema, { target: 'draft-7' })]))

  return { $protocolVersion: WIRE_PROTOCOL_VERSION, ...schemas }
}
