import { describe, expect, it, vi } from 'vitest'

import { wireCapability, WireRemoteError, WireUnavailableError, WireV1Client } from '@/api/wire-v1-client'
import type { WireTransport, WireTransportRequest } from '@/api/wire-v1-client'
import { planWireReconnect } from '@/application/session/wire-reconnect-plan'
import {
  applyWireEventFrame,
  emptyWireSessionProjection,
  markWireProjectionResynced
} from '@/application/session/wire-session-projection'

import {
  ApprovalsDecideResultSchema,
  asCursor,
  asWireId,
  EventFrameSchema,
  HistorySnapshotResultSchema,
  QueueItemSchema,
  SendOutcomeQueryResultSchema,
  SessionsSwitchProfileResultSchema,
  type WireRequest
} from '../wire-v1'

import {
  approval,
  CORE_V1_FIXTURE_MATRIX,
  createAndSendParams,
  fixtureTime,
  frame,
  localWorkspace,
  profile,
  session,
  wslWorkspace
} from './core-v1'

function scriptedTransport(
  handler: (request: WireTransportRequest, envelope: WireRequest) => unknown | Promise<unknown>
): WireTransport & { request: ReturnType<typeof vi.fn> } {
  return {
    request: vi.fn(async request => {
      const envelope = request.body as WireRequest

      return handler(request, envelope)
    })
  }
}

describe('core-semantics/1 §9 executable fixture matrix', () => {
  it('contains one traceable fixture for every required scenario', () => {
    expect(CORE_V1_FIXTURE_MATRIX.map(fixture => fixture.covers)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(new Set(CORE_V1_FIXTURE_MATRIX.map(fixture => fixture.id)).size).toBe(9)
  })

  it('01 — unavailable service and unsupported capabilities fail honestly', async () => {
    const unavailable = new WireV1Client({
      transport: { request: vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))) }
    })

    await expect(unavailable.hello()).rejects.toBeInstanceOf(WireUnavailableError)

    const hello = {
      serverId: asWireId('server-1'),
      protocolVersion: 'wire/1' as const,
      capabilities: [{ id: 'sessions.createAndSend', supported: false, reason: 'NO_HARNESS' }],
      auth: { required: true as const, schemes: ['session_token' as const] }
    }

    expect(wireCapability(hello, 'sessions.createAndSend')).toMatchObject({
      supported: false,
      reason: 'NO_HARNESS'
    })
  })

  it('02 — workspace identity includes environment and reopen never calls sessions', async () => {
    const host = scriptedTransport((_request, envelope) => ({
      jsonrpc: '2.0',
      id: envelope.id,
      result: { created: false, workspace: localWorkspace }
    }))

    const client = new WireV1Client({ transport: host })

    const reopened = await client.call('workspaces.open', {
      requestId: createAndSendParams.requestId,
      environment: localWorkspace.environment,
      path: localWorkspace.normalizedPath
    })

    expect(reopened.workspace.id).toBe(localWorkspace.id)
    expect(reopened.created).toBe(false)
    expect(wslWorkspace.normalizedPath).toBe(localWorkspace.normalizedPath)
    expect(wslWorkspace.id).not.toBe(localWorkspace.id)
    expect(host.request.mock.calls.map(([request]) => request.method)).toEqual(['workspaces.open'])
  })

  it('03 — first-send replay keeps identity; conflicts and unknown outcomes stay distinct', async () => {
    const accepted = {
      outcome: 'accepted',
      session,
      executionId: asWireId('execution-1'),
      configVersion: 7
    }

    let acceptedPayload: string | null = null

    const host = scriptedTransport((_request, envelope) => {
      if (envelope.method === 'sendOutcome.query') {
        return { jsonrpc: '2.0', id: envelope.id, result: { outcome: 'unknown' } }
      }

      const digest = JSON.stringify(envelope.params)

      if (acceptedPayload !== null && acceptedPayload !== digest) {
        return {
          jsonrpc: '2.0',
          id: envelope.id,
          error: { code: 'CONFLICT_REQUEST', message: 'same request id, different payload' }
        }
      }

      acceptedPayload = digest

      return { jsonrpc: '2.0', id: envelope.id, result: accepted }
    })

    const client = new WireV1Client({ transport: host })
    const first = await client.call('sessions.createAndSend', createAndSendParams)
    const replay = await client.call('sessions.createAndSend', createAndSendParams)

    expect(replay).toEqual(first)
    await expect(
      client.call('sessions.createAndSend', {
        ...createAndSendParams,
        message: { text: 'different payload', attachments: [] }
      })
    ).rejects.toBeInstanceOf(WireRemoteError)
    expect(
      SendOutcomeQueryResultSchema.parse(await client.call('sendOutcome.query', { requestId: createAndSendParams.requestId }))
        .outcome
    ).toBe('unknown')
  })

  it('04 — rejected role switch keeps the old record and queue config is frozen', () => {
    const rejected = SessionsSwitchProfileResultSchema.parse({
      outcome: 'rejected',
      reason: 'execution_running',
      session
    })

    const queued = QueueItemSchema.parse({
      itemId: asWireId('queue-1'),
      version: 1,
      submittedAt: fixtureTime,
      message: { text: 'queued with alpha', attachments: [] },
      profileId: profile.id,
      configVersion: 7,
      state: 'pending'
    })

    expect(rejected.session.profileId).toBe(profile.id)
    expect(queued).toMatchObject({ profileId: profile.id, configVersion: 7 })
  })

  it('05 — stop is requested before a terminal event and paused queue remains visible', () => {
    let projection = emptyWireSessionProjection(session.id)

    projection = applyWireEventFrame(
      projection,
      frame('event-running', 10, {
        kind: 'execution.state',
        sessionId: session.id,
        executionId: asWireId('execution-1'),
        state: 'running'
      })
    ).projection
    projection = applyWireEventFrame(
      projection,
      frame('event-stopping', 11, {
        kind: 'execution.state',
        sessionId: session.id,
        executionId: asWireId('execution-1'),
        state: 'stopping'
      })
    ).projection

    expect(projection.execution?.state).toBe('stopping')
    expect(
      QueueItemSchema.parse({
        itemId: asWireId('queue-paused'),
        version: 2,
        submittedAt: fixtureTime,
        message: { text: 'wait', attachments: [] },
        profileId: profile.id,
        configVersion: 7,
        state: 'paused'
      }).state
    ).toBe('paused')
  })

  it('06 — approval retries are one fact and replay never re-decides', () => {
    expect(ApprovalsDecideResultSchema.parse({ outcome: 'recorded', decision: 'allow' }).outcome).toBe('recorded')
    expect(ApprovalsDecideResultSchema.parse({ outcome: 'already_recorded', decision: 'allow' }).outcome).toBe(
      'already_recorded'
    )

    const requested = frame('event-approval', 20, {
      kind: 'approval.requested',
      sessionId: session.id,
      approval
    })

    const first = applyWireEventFrame(emptyWireSessionProjection(session.id), requested)
    const replay = applyWireEventFrame(first.projection, requested)

    expect(first.projection.approvals[approval.approvalId]).toEqual(approval)
    expect(replay.outcome).toBe('duplicate')
    expect(replay.projection).toBe(first.projection)
  })

  it('07 — snapshot joins dedupe replay, detect gaps, and honor explicit resync', () => {
    const firstFrame = frame('event-message-1', 30, {
      kind: 'message.delta',
      sessionId: session.id,
      messageId: asWireId('message-1'),
      role: 'assistant',
      text: 'hello'
    })

    const snapshot = HistorySnapshotResultSchema.parse({
      outcome: 'snapshot',
      frames: [firstFrame],
      resumeCursor: firstFrame.cursor,
      olderCursor: null
    })

    if (snapshot.outcome !== 'snapshot') {
      throw new Error('fixture must be a snapshot')
    }

    const applied = applyWireEventFrame(emptyWireSessionProjection(session.id), snapshot.frames[0]!)
    expect(applyWireEventFrame(applied.projection, snapshot.frames[0]!).outcome).toBe('duplicate')

    const late = frame('event-message-2', 32, {
      displayKind: 'visible',
      kind: 'message.final',
      sessionId: session.id,
      messageId: asWireId('message-1'),
      role: 'assistant',
      text: 'hello world'
    })

    const gap = applyWireEventFrame(applied.projection, late)
    expect(gap).toMatchObject({ outcome: 'gap', projection: { needsResync: true } })

    const resynced = markWireProjectionResynced(gap.projection, { cursor: asCursor('cursor-31'), lastSeq: 31 })
    const completed = applyWireEventFrame(resynced, late)

    expect(completed.outcome).toBe('applied')
    expect(completed.projection.messageOrder).toEqual(['message-1'])
    expect(completed.projection.messages['message-1']).toMatchObject({ role: 'assistant', text: 'hello world' })
    expect(HistorySnapshotResultSchema.parse({ outcome: 'resync_required', reason: 'cursor expired' }).outcome).toBe(
      'resync_required'
    )
  })

  it('08 — reconnect plans only snapshot and subscribe; worker loss stays a failure fact', () => {
    const plan = planWireReconnect(session.id, asCursor('cursor-40'))

    expect(plan).toEqual({
      eventStream: 'wire.eventStream/1',
      snapshot: {
        method: 'history.snapshot',
        params: { sessionId: session.id, cursor: 'cursor-40' }
      }
    })
    expect(JSON.stringify(plan)).not.toContain('sessions.send')

    const failed = applyWireEventFrame(
      emptyWireSessionProjection(session.id),
      frame('event-worker-lost', 40, {
        kind: 'execution.state',
        sessionId: session.id,
        executionId: asWireId('execution-1'),
        state: 'failed',
        reason: 'WORKER_UNREACHABLE'
      })
    )

    expect(failed.projection.execution).toMatchObject({ state: 'failed', reason: 'WORKER_UNREACHABLE' })
  })

  it('09 — strict event frames reject secret material instead of stripping it', () => {
    const safe = frame('event-safe', 50, {
      kind: 'tool.update',
      messageId: null,
      sessionId: session.id,
      toolCallId: asWireId('tool-1'),
      tool: 'managed_tool',
      state: 'completed',
      summary: 'Result returned and cleanup confirmed',
      resultExcerpt: null
    })

    expect(EventFrameSchema.safeParse(safe).success).toBe(true)
    expect(
      EventFrameSchema.safeParse({
        ...safe,
        event: { ...safe.event, token: 'should-never-cross-the-wire' }
      }).success
    ).toBe(false)
    expect(JSON.stringify(safe)).not.toContain('secret')
  })
})
