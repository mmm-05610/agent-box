import { describe, expect, it } from 'vitest'

import {
  AccountViewSchema,
  ApprovalRequestSchema,
  ApprovalsDecideParamsSchema,
  ApprovalsDecideResultSchema,
  AssetBindingSchema,
  AssetsPublishPluginResultSchema,
  asCursor,
  asRequestId,
  asWireId,
  ConfigDescribeResultSchema,
  EventFrameSchema,
  ExecutionInventoryRowSchema,
  ExecutionsListParamsSchema,
  HistorySnapshotResultSchema,
  HookTriggerViewSchema,
  ProfileRecordSchema,
  ProfilesCloneResultSchema,
  ProfilesMemoryResultSchema,
  ProfilesUpdateConfigResultSchema,
  ProviderModelConfigRecordSchema,
  QueueGetResultSchema,
  QueueItemSchema,
  SendOutcomeQueryResultSchema,
  ServerHelloResultSchema,
  SessionsCreateAndSendParamsSchema,
  SessionsCreateAndSendResultSchema,
  SessionsSendResultSchema,
  WIRE_EVENT_STREAM,
  WIRE_PROTOCOL_VERSION,
  WireErrorCodeSchema,
  wireJsonSchemas,
  WireMethods,
  WireRequestSchema,
  WireResponseSchema,
  WorkspacesGitStatusResultSchema,
  WorkspacesOpenParamsSchema
} from './wire-v1'
import type {
  ApprovalRequest,
  ApprovalsDecideParams,
  ApprovalsDecideResult,
  ConfigOverride,
  DraftMessage,
  EventFrame,
  HistorySnapshotResult,
  ServerHelloResult,
  SessionsCreateAndSendParams,
  SessionsCreateAndSendResult,
  WireError,
  WireRequest,
  WireResponse,
  WorkspacesOpenParams
} from './wire-v1'

// Checkpoint-2 guard: the wire candidate validates real message shapes and
// every registered method projects to JSON Schema. The §9 behavior matrix
// lives in the checkpoint-3 fixture suite; this file pins the envelope.

const wsOpen = {
  requestId: asRequestId('req-2f2a3c90-tests'),
  environment: { kind: 'wsl', user: 'maoqh', host: 'Ubuntu' },
  path: '/home/maoqh/wsl-round1-验收 目录'
} satisfies WorkspacesOpenParams

describe('wire v1 envelope', () => {
  it('a JSON-RPC flavored request round-trips', () => {
    const request = {
      jsonrpc: '2.0',
      id: 't-1',
      method: 'workspaces.open',
      params: wsOpen
    } satisfies WireRequest

    expect(WireRequestSchema.parse(request)).toEqual(request)
    expect(WireRequestSchema.safeParse({ ...request, jsonrpc: '1.0' }).success).toBe(false)
  })

  it('a response carries either a result or a typed error', () => {
    const error: WireError = {
      code: 'CONFLICT_REQUEST',
      message: 'requestId was used with a different payload'
    }

    const response: WireResponse = { jsonrpc: '2.0', id: 't-1', error }

    expect(WireResponseSchema.parse(response)).toEqual(response)
    expect(WireErrorCodeSchema.options).toContain('OUTCOME_UNKNOWN')
    expect(WireErrorCodeSchema.options).toContain('CONFLICT_REFERENCE')
    expect(WireResponseSchema.safeParse({ jsonrpc: '2.0', id: 't-1' }).success).toBe(false)
    expect(WireResponseSchema.safeParse({ jsonrpc: '2.0', id: 't-1', result: {}, error }).success).toBe(false)
    expect(WireResponseSchema.safeParse({ jsonrpc: '2.0', id: null, result: {} }).success).toBe(false)
    expect(WireRequestSchema.safeParse({ jsonrpc: '2.0', id: 't-1', method: 'server.hello', params: {}, extra: true }).success).toBe(false)
  })

  it('every registered method exposes params and result schemas, and the locked core survives', () => {
    const names = Object.keys(WireMethods)

    // The locked wire/1 core at relock — 28 methods. Additive faces (usage
    // events, provider probes, artifacts) may grow the registry without
    // touching this set; a REMOVED core method fails here and forces a
    // protocol review. The generated schema JSON remains the count authority.
    const core = [
      'server.hello',
      'workspaces.open',
      'workspaces.list',
      'workspaces.browse',
      'workspaces.archive',
      'profiles.list',
      'profiles.create',
      'profiles.update',
      'profiles.archive',
      'profiles.updateConfig',
      'config.describe',
      'config.resolve',
      'sessions.list',
      'sessions.update',
      'sessions.archive',
      'sessions.switchProfile',
      'sessions.createAndSend',
      'sessions.send',
      'queue.get',
      'queue.withdraw',
      'runs.stop',
      'approvals.decide',
      'history.snapshot',
      'providerModels.list',
      'providerModels.create',
      'providerModels.update',
      'providerModels.archive',
      'sendOutcome.query'
    ]

    for (const method of core) {
      expect(names, `locked core method ${method}`).toContain(method)
    }

    expect(names.length).toBeGreaterThanOrEqual(core.length)

    for (const [name, [params, result]] of Object.entries(WireMethods)) {
      expect(params, `${name} params`).toBeDefined()
      expect(result, `${name} result`).toBeDefined()
    }
  })
})

describe('wire v1 core behaviors pinned by schema shape', () => {
  it('workspace open is identity-scoped: environment + path, never a name', () => {
    const parsed = WorkspacesOpenParamsSchema.parse(wsOpen)

    expect(parsed.environment.kind).toBe('wsl')
    expect(() => WorkspacesOpenParamsSchema.parse({ ...wsOpen, requestId: 'short' })).toThrow()
  })

  it('first-send acceptance separates before-accept rejection from acceptance', () => {
    const params: SessionsCreateAndSendParams = {
      requestId: asRequestId('req-aaaaaaaa-send1'),
      workspaceId: asWireId('ws_1'),
      profileId: asWireId('prof_1'),
      overrides: [{ controlId: 'thinking', value: 'low' }] satisfies ConfigOverride[],
      message: { text: 'hello', attachments: [] } satisfies DraftMessage
    }

    const accepted: SessionsCreateAndSendResult = {
      outcome: 'accepted',
      session: {
        id: asWireId('ses_1'),
        version: 3,
        workspaceId: asWireId('ws_1'),
        profileId: asWireId('prof_1'),
        displayName: 'hello',
        pinned: false,
        archivedAt: null,
        createdAt: '2026-09-14T00:00:00.000Z',
        updatedAt: '2026-09-14T00:00:00.000Z'
      },
      executionId: asWireId('exe_1'),
      configVersion: 7
    }

    expect(SessionsCreateAndSendParamsSchema.parse(params).overrides).toHaveLength(1)
    expect(SessionsCreateAndSendResultSchema.parse(accepted).outcome).toBe('accepted')
    // A before-accept rejection carries NO session — the draft survives.
    const rejected = SessionsCreateAndSendResultSchema.parse({ outcome: 'rejected_before_accept', reason: 'path not writable', invalidControls: null })
    expect('session' in rejected).toBe(false)
  })

  it('outcome queries can answer UNKNOWN — never a safe-to-resend signal', () => {
    expect(SendOutcomeQueryResultSchema.parse({ outcome: 'unknown' }).outcome).toBe('unknown')
  })

  it('an approval binds operation content and version, with explicit scope', () => {
    const approval: ApprovalRequest = {
      approvalId: asWireId('apr_1'),
      sessionId: asWireId('ses_1'),
      executionId: asWireId('exe_1'),
      version: 1,
      operation: {
        title: 'Write file',
        detail: [{ label: 'target', value: '/home/maoqh/p/file.ts' }],
        tool: 'write_file'
      },
      expiresAt: null
    }

    expect(ApprovalRequestSchema.parse(approval).operation.detail).toHaveLength(1)

    const decide: ApprovalsDecideParams = {
      requestId: asRequestId('req-bbbbbbbb-apr1'),
      approvalId: asWireId('apr_1'),
      expectedVersion: 1,
      decision: 'allow',
      scope: { kind: 'once' }
    }

    const result: ApprovalsDecideResult = { outcome: 'recorded', decision: 'allow' }

    expect(ApprovalsDecideParamsSchema.parse(decide).scope.kind).toBe('once')
    expect(ApprovalsDecideResultSchema.parse(result).outcome).toBe('recorded')
  })

  it('history answers either a snapshot with a resume cursor or a resync demand', () => {
    const frame: EventFrame = {
      eventId: asWireId('evt_1'),
      sessionId: asWireId('ses_1'),
      seq: 0,
      cursor: asCursor('cur-1'),
      emittedAt: '2026-09-14T00:00:00.000Z',
      event: { kind: 'execution.state', sessionId: asWireId('ses_1'), executionId: asWireId('exe_1'), state: 'running', reason: null }
    }

    const snapshot: HistorySnapshotResult = {
      outcome: 'snapshot',
      frames: [frame],
      resumeCursor: asCursor('cur-2'),
      olderCursor: null
    }

    expect(HistorySnapshotResultSchema.parse(snapshot).outcome).toBe('snapshot')
    expect(HistorySnapshotResultSchema.parse({ outcome: 'resync_required', reason: 'cursor expired' }).outcome).toBe('resync_required')
  })

  it('hello reports capability degradation with reasons and auth needs', () => {
    const hello: ServerHelloResult = {
      serverId: asWireId('srv_1'),
      protocolVersion: WIRE_PROTOCOL_VERSION,
      capabilities: [
        { id: 'steer', supported: false, reason: 'not implemented by this server' },
        { id: 'queue', supported: true }
      ],
      auth: { required: true, schemes: ['session_token'] }
    }

    const parsed = ServerHelloResultSchema.parse(hello)

    expect(parsed.capabilities[0]?.reason).toContain('not implemented')
    expect(parsed.auth.required).toBe(true)
    expect(
      ServerHelloResultSchema.safeParse({
        ...hello,
        capabilities: [{ id: 'queue', supported: false }]
      }).success
    ).toBe(false)
  })

  it('accepts the server-described control vocabulary without brand branches', () => {
    const result = ConfigDescribeResultSchema.parse({
      descriptor: {
        profileId: asWireId('prof_1'),
        workspaceId: null,
        controls: [
          { kind: 'enum', controlId: 'model', values: ['alpha-default', 'alpha-fast'], editable: true },
          { kind: 'boolean', controlId: 'sandbox', currentValue: true, editable: false }
        ],
        securityLockedIds: ['sandbox'],
        effectTiming: 'next_send'
      }
    })

    expect(result.descriptor.controls.map(control => control.controlId)).toEqual(['model', 'sandbox'])
  })

  it('keeps reusable Provider/Model credentials opaque and profile config next-send only', () => {
    const providerModel = ProviderModelConfigRecordSchema.parse({
      id: asWireId('provider_1'),
      version: 2,
      displayName: 'Private endpoint',
      harness: 'opaque-alpha',
      provider: 'opaque-provider',
      credentialId: asWireId('credential_1'),
      configuration: [{ controlId: 'base_url', value: 'https://example.invalid' }],
      models: [
        {
          modelId: 'model-a',
          displayName: 'Model A',
          availability: 'unknown',
          unavailableReason: null
        }
      ],
      archivedAt: null,
      createdAt: '2026-09-14T00:00:00.000Z',
      updatedAt: '2026-09-14T00:00:00.000Z'
    })

    expect(providerModel.credentialId).toBe('credential_1')
    expect(JSON.stringify(providerModel)).not.toContain('secret')
    expect(
      ProfilesUpdateConfigResultSchema.parse({
        profile: {
          id: asWireId('profile_1'),
          version: 3,
          displayName: 'Builder',
          harness: 'opaque-alpha',
          capabilities: {},
          archivedAt: null,
          createdAt: '2026-09-14T00:00:00.000Z',
          updatedAt: '2026-09-14T00:00:00.000Z'
        },
        configVersion: 9,
        effectiveFor: 'next_send'
      }).effectiveFor
    ).toBe('next_send')
  })

  it('distinguishes a dispatched send from an accepted server-queued follow-up', () => {
    expect(
      SessionsSendResultSchema.parse({
        outcome: 'accepted',
        executionId: null,
        configVersion: 4,
        queueItemId: asWireId('queue_1')
      })
    ).toMatchObject({ queueItemId: 'queue_1' })

    expect(
      SessionsSendResultSchema.safeParse({
        outcome: 'accepted',
        executionId: null,
        configVersion: 4,
        queueItemId: null
      }).success
    ).toBe(false)
  })

  it('pins a queue item to its accepted configuration version', () => {
    expect(
      QueueItemSchema.parse({
        itemId: asWireId('queue_1'),
        version: 1,
        submittedAt: '2026-09-14T00:00:00.000Z',
        message: { text: 'next', attachments: [] },
        profileId: asWireId('prof_1'),
        configVersion: 9,
        state: 'pending'
      }).configVersion
    ).toBe(9)
  })

  it('keeps queue snapshots active while terminal transitions remain valid events', () => {
    const terminal = {
      itemId: asWireId('queue_terminal'),
      version: 2,
      submittedAt: '2026-09-14T00:00:00.000Z',
      message: { text: 'done', attachments: [] },
      profileId: asWireId('prof_1'),
      configVersion: 9,
      state: 'completed' as const
    }

    expect(QueueItemSchema.parse(terminal).state).toBe('completed')
    expect(QueueGetResultSchema.safeParse({ items: [terminal] }).success).toBe(false)
  })

  it('event frames carry stable ids, session-scoped seq, and an opaque cursor', () => {
    const base = {
      eventId: asWireId('evt_9'),
      sessionId: asWireId('ses_1'),
      seq: 41,
      cursor: asCursor('cur-9'),
      emittedAt: '2026-09-14T00:00:00.000Z'
    }

    expect(EventFrameSchema.parse({ ...base, event: { kind: 'message.delta', sessionId: asWireId('ses_1'), messageId: asWireId('msg_1'), role: 'assistant', text: 'he' } }).seq).toBe(41)
    expect(() => EventFrameSchema.parse({ ...base, event: { kind: 'message.delta', sessionId: asWireId('ses_1'), messageId: asWireId('msg_1') } })).toThrow()
  })
})

describe('wire v1 relock: the additive faces (orders 56 / 58 / 59 / 60 / 62 / 63 / 64)', () => {
  it('a Git status that cannot be obtained says so field by field, and 0 stays a real count', () => {
    const unavailable = WorkspacesGitStatusResultSchema.parse({
      git: { branch: null, changedFiles: null, additions: null, deletions: null, ahead: null, behind: null, reason: 'GIT_UNAVAILABLE' }
    })

    expect(unavailable.git).toMatchObject({ changedFiles: null, additions: null, reason: 'GIT_UNAVAILABLE' })

    const clean = WorkspacesGitStatusResultSchema.parse({
      git: { branch: 'main', changedFiles: 0, additions: 0, deletions: 0, ahead: 0, behind: 0, reason: null }
    })

    expect(clean.git.changedFiles).toBe(0)
  })

  it('a refused memory file is refused as a whole — no content rides along', () => {
    const refused = { path: 'MEMORY.md', size: 12, reason: 'MEMORY_CONTAINS_SECRET', refused: true }

    expect(
      ProfilesMemoryResultSchema.safeParse({ memory: { available: true, reason: null, files: [refused] } }).success
    ).toBe(true)
    expect(
      ProfilesMemoryResultSchema.safeParse({
        memory: { available: true, reason: null, files: [{ ...refused, content: 'sk-not-a-real-value' }] }
      }).success
    ).toBe(false)
  })

  it('a family that declares no memory paths answers available:false — nothing to draw', () => {
    const hidden = ProfilesMemoryResultSchema.parse({
      memory: { available: false, reason: null, files: [], note: 'this family declares no memory paths' }
    })

    expect(hidden.memory.available).toBe(false)
    expect(hidden.memory.files).toHaveLength(0)
  })

  it('the inventory carries a reason wherever the pid is absent, and refuses an over-long read', () => {
    const pidless = ExecutionInventoryRowSchema.parse({
      executionId: asWireId('execution_1'),
      turnId: asWireId('turn_1'),
      sessionId: asWireId('session_1'),
      profileId: asWireId('profile_1'),
      profile: 'Builder',
      harness: 'opaque-alpha',
      placement: 'wsl',
      state: 'running',
      startedAt: '2026-09-18T00:00:00.000Z',
      workspaceId: asWireId('workspace_1'),
      workspace: 'fixture',
      queueItemId: null,
      pid: null,
      pidReason: 'PID_NOT_REPORTED',
      adapterPid: null,
      adapterPidReason: 'ADAPTER_PID_NOT_REPORTED'
    })

    expect(pidless.pid).toBeNull()
    expect(pidless.pidReason).toBe('PID_NOT_REPORTED')
    expect(
      ExecutionsListParamsSchema.safeParse({ requestId: asRequestId('req-12345678-inv'), limit: 201 }).success
    ).toBe(false)
    expect(ExecutionsListParamsSchema.parse({ requestId: asRequestId('req-12345678-inv'), limit: 200 }).limit).toBe(200)
  })

  it('an account view carries references only — a locator never crosses the wire', () => {
    const view = {
      accountId: asWireId('account_1'),
      harnessType: 'opaque-alpha',
      accountIdentifier: 'person@example.invalid',
      state: 'ready',
      hasAsset: true,
      lastVerifiedAt: null,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z'
    }

    expect(AccountViewSchema.safeParse(view).success).toBe(true)
    expect(AccountViewSchema.safeParse({ ...view, assetLocator: 'keyring://account_1' }).success).toBe(false)
  })

  it('a clone report states what did not travel, and sessions never travel', () => {
    const parsed = ProfilesCloneResultSchema.parse({
      profile: {
        id: asWireId('profile_2'),
        version: 1,
        displayName: 'Cloned role',
        harness: 'opaque-alpha',
        capabilities: {},
        archivedAt: null,
        createdAt: '2026-09-18T00:00:00.000Z',
        updatedAt: '2026-09-18T00:00:00.000Z'
      },
      migration: {
        targetFamily: 'opaque-alpha',
        sourceFamily: 'opaque-beta',
        sameFamily: false,
        items: [
          { item: 'configuration', migrated: false, reason: 'families differ: configuration keys are family-specific' },
          { item: 'native-sessions', migrated: false, reason: 'native sessions belong to the source; a clone starts with none' }
        ],
        permissions: null,
        reboundAssets: [],
        migratedCount: 0,
        refusedCount: 2
      }
    })

    expect(parsed.migration.items.filter(entry => entry.migrated)).toHaveLength(0)
    expect(parsed.migration.permissions).toBeNull()
  })

  it('a hook trigger that blocked says so, and only the three effects exist', () => {
    const blocked = {
      triggerId: asWireId('trigger_1'),
      hookId: asWireId('hook_1'),
      event: 'pre_tool',
      at: '2026-09-18T00:00:00.000Z',
      exitCode: 2,
      outputSummary: 'refused',
      truncated: false,
      blocking: true,
      effect: 'blocked'
    }

    expect(HookTriggerViewSchema.parse(blocked).blocking).toBe(true)
    expect(HookTriggerViewSchema.safeParse({ ...blocked, effect: 'ignored' }).success).toBe(false)
  })

  it('a plugin publish answers a bounded preview beside the stored asset', () => {
    const asset = {
      assetId: 'fixture-plugin',
      kind: 'plugin',
      name: 'fixture-plugin',
      description: null,
      latestRevision: 1,
      digest: 'sha256:0000',
      source: 'local:fixture.js',
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z'
    }

    expect(AssetsPublishPluginResultSchema.parse({ asset, preview: 'export default {}' }).preview).toContain('export')
    expect(AssetsPublishPluginResultSchema.safeParse({ asset }).success).toBe(false)
  })

  it('a disabled binding is still a binding row', () => {
    expect(
      AssetBindingSchema.parse({
        assetId: 'fixture-skill',
        kind: 'skill',
        name: 'Fixture skill',
        revision: 2,
        digest: 'sha256:1111',
        enabled: false
      }).enabled
    ).toBe(false)
  })

  it('a role carries its permission posture and clone origin as data', () => {
    const profile = ProfileRecordSchema.parse({
      id: asWireId('profile_3'),
      version: 4,
      displayName: 'Planner',
      harness: 'opaque-alpha',
      capabilities: {},
      accountId: null,
      permissionPreset: 'plan',
      permissionRules: [{ key: 'bash', pattern: null, action: 'deny' }],
      originProfileId: asWireId('profile_1'),
      archivedAt: null,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z'
    })

    expect(profile.permissionRules?.[0]).toEqual({ key: 'bash', pattern: null, action: 'deny' })
    expect(profile.originProfileId).toBe('profile_1')
  })

  it('the landed faces are registered as wire/1 methods', () => {
    for (const method of [
      'workspaces.gitStatus',
      'executions.list',
      'profiles.clone',
      'profiles.setPermissions',
      'profiles.memory',
      'assets.list',
      'assets.publishSkill',
      'assets.publishMcp',
      'assets.publishPlugin',
      'assets.bind',
      'assets.unbind',
      'assets.bindings',
      'assets.syncCatalog',
      'assets.catalog',
      'assets.installFromCatalog',
      'assets.probe',
      'hooks.list',
      'hooks.create',
      'hooks.update',
      'hooks.setEnabled',
      'hooks.delete',
      'hooks.triggers',
      'accounts.list',
      'accounts.create',
      'accounts.bind',
      'accounts.importAsset'
    ]) {
      expect(Object.keys(WireMethods), method).toContain(method)
    }
  })
})

describe('wire v1 JSON Schema projection', () => {
  it('projects every schema the server needs to review', () => {
    const schemas = wireJsonSchemas()

    expect(schemas['$protocolVersion']).toBe(WIRE_PROTOCOL_VERSION)
    expect(schemas['WireRequest']).toBeDefined()
    expect(schemas['workspaces.open#params']).toBeDefined()
    expect(schemas['approvals.decide#result']).toBeDefined()
    expect(schemas['profiles.updateConfig#result']).toBeDefined()
    expect(schemas['providerModels.archive#params']).toBeDefined()
    expect(Object.keys(schemas).length).toBeGreaterThanOrEqual(2 + 2 + WireMethodsCount * 2)
  })

  it('keeps the event stream marker exported for the transport layer', () => {
    expect(WIRE_EVENT_STREAM).toBe('wire.eventStream/1')
  })
})

const WireMethodsCount = Object.keys(WireMethods).length
