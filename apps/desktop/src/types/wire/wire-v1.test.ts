import { describe, expect, it } from 'vitest'

import {
  ApprovalRequestSchema,
  ApprovalsDecideParamsSchema,
  ApprovalsDecideResultSchema,
  asCursor,
  asRequestId,
  asWireId,
  ConfigDescribeResultSchema,
  EventFrameSchema,
  HistorySnapshotResultSchema,
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
    expect(WireResponseSchema.safeParse({ jsonrpc: '2.0', id: 't-1' }).success).toBe(false)
    expect(WireResponseSchema.safeParse({ jsonrpc: '2.0', id: 't-1', result: {}, error }).success).toBe(false)
    expect(WireRequestSchema.safeParse({ jsonrpc: '2.0', id: 't-1', method: 'server.hello', params: {}, extra: true }).success).toBe(false)
  })

  it('every registered method exposes params and result schemas', () => {
    const names = Object.keys(WireMethods)

    expect(names.length).toBeGreaterThanOrEqual(17)

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
      resumeCursor: asCursor('cur-2')
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

  it('event frames carry stable ids, session-scoped seq, and an opaque cursor', () => {
    const base = {
      eventId: asWireId('evt_9'),
      sessionId: asWireId('ses_1'),
      seq: 41,
      cursor: asCursor('cur-9'),
      emittedAt: '2026-09-14T00:00:00.000Z'
    }

    expect(EventFrameSchema.parse({ ...base, event: { kind: 'message.delta', sessionId: asWireId('ses_1'), messageId: asWireId('msg_1'), text: 'he' } }).seq).toBe(41)
    expect(() => EventFrameSchema.parse({ ...base, event: { kind: 'message.delta', sessionId: asWireId('ses_1'), messageId: asWireId('msg_1') } })).toThrow()
  })
})

describe('wire v1 JSON Schema projection', () => {
  it('projects every schema the server needs to review', () => {
    const schemas = wireJsonSchemas()

    expect(schemas['$protocolVersion']).toBe(WIRE_PROTOCOL_VERSION)
    expect(schemas['WireRequest']).toBeDefined()
    expect(schemas['workspaces.open#params']).toBeDefined()
    expect(schemas['approvals.decide#result']).toBeDefined()
    expect(Object.keys(schemas).length).toBeGreaterThanOrEqual(2 + 2 + WireMethodsCount * 2)
  })

  it('keeps the event stream marker exported for the transport layer', () => {
    expect(WIRE_EVENT_STREAM).toBe('wire.eventStream/1')
  })
})

const WireMethodsCount = Object.keys(WireMethods).length
