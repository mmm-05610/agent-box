import { beforeEach, describe, expect, it, vi } from 'vitest'

import { wireCapability, WireRemoteError, WireUnavailableError, WireV1Client } from '@/api/wire-v1-client'
import type { WireTransport, WireTransportRequest } from '@/api/wire-v1-client'
import { planWireReconnect } from '@/application/session/wire-reconnect-plan'
import { resolvePendingAgentBoxSend } from '@/application/session/wire-send'
import {
  decideAgentBoxApproval,
  hydrateAgentBoxHistory,
  ingestAgentBoxEvent,
  refreshAgentBoxQueue
} from '@/application/session/wire-session-control'
import {
  applyWireEventFrame,
  emptyWireSessionProjection,
  markWireProjectionResynced
} from '@/application/session/wire-session-projection'
import { $agentBoxQueues, $agentBoxSessionProjections, $agentBoxStopStates } from '@/store/agentbox-runtime'
import { $pendingAgentBoxSends } from '@/store/agentbox-send-intents'

import {
  ApprovalsDecideResultSchema,
  asCursor,
  asRequestId,
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
  queueItem,
  session,
  wslWorkspace
} from './core-v1'

beforeEach(() => {
  // The application seams below project into the shared nanostores; each
  // fixture owns a clean slate so one scenario cannot leak into the next.
  $agentBoxQueues.set({})
  $agentBoxSessionProjections.set({})
  $agentBoxStopStates.set({})
  $pendingAgentBoxSends.set({ items: {}, version: 1 })
})

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

  it('05b — normal completion continues the queue from server events, and replay resurrects nothing', async () => {
    const finishedA = queueItem({ itemId: asWireId('queue-a'), state: 'pending' })
    const dispatchedB = queueItem({ itemId: asWireId('queue-b'), state: 'dispatched', version: 2 })

    const host = scriptedTransport((_request, envelope) => {
      if (envelope.method === 'queue.get') {
        return { jsonrpc: '2.0', id: envelope.id, result: { items: [finishedA] } }
      }

      throw new Error(`queue continuation is event-driven; the client must not call ${envelope.method}`)
    })

    const client = new WireV1Client({ transport: host })

    await refreshAgentBoxQueue(client, session.id)
    expect($agentBoxQueues.get()[session.id]).toEqual([finishedA])

    const pendingA = frame('event-queue-a-pending', 0, {
      item: finishedA,
      kind: 'queue.updated',
      sessionId: session.id
    })

    const completedA = frame('event-queue-a-completed', 1, {
      item: { ...finishedA, state: 'completed', version: 2 },
      kind: 'queue.updated',
      sessionId: session.id
    })

    const nextB = frame('event-queue-b-dispatched', 2, {
      item: dispatchedB,
      kind: 'queue.updated',
      sessionId: session.id
    })

    ingestAgentBoxEvent(pendingA)
    ingestAgentBoxEvent(completedA)

    // A reaching a terminal state removes it from the active projection...
    expect($agentBoxQueues.get()[session.id]).toEqual([])

    // ...and the SERVER dispatching the next item is what continues the queue.
    // The client only renders the fact.
    ingestAgentBoxEvent(nextB)
    expect($agentBoxQueues.get()[session.id]).toEqual([dispatchedB])

    // Negative cases: a duplicate of A's terminal frame and a late replay of
    // A's own pre-terminal frame are both deduplicated by eventId, so the
    // finished item never comes back.
    expect(ingestAgentBoxEvent(completedA).outcome).toBe('duplicate')
    expect(ingestAgentBoxEvent(pendingA).outcome).toBe('duplicate')
    expect($agentBoxQueues.get()[session.id]).toEqual([dispatchedB])

    const sendCalls = host.request.mock.calls.filter(([request]) => {
      const method = (request.body as WireRequest).method

      return method === 'sessions.send' || method === 'sessions.createAndSend'
    })

    expect(sendCalls).toEqual([])
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

  it('06b — expiry and invalidation settle pending approvals, and a settled replay decides nothing twice', async () => {
    // Wire representation only: expiry arrives as `expired`, while a content
    // change or a cancellation arrives as `invalidated`. No new schema value
    // is invented, and replaying a settled frame emits no approvals.decide.
    const host = scriptedTransport((_request, envelope) => {
      if (envelope.method === 'approvals.decide') {
        return { jsonrpc: '2.0', id: envelope.id, result: { decision: 'allow', outcome: 'recorded' } }
      }

      throw new Error(`approval settlement is event-driven; the client must not call ${envelope.method}`)
    })

    const client = new WireV1Client({ transport: host })
    const changed = { ...approval, approvalId: asWireId('approval-2'), version: 5 }

    const requestedFirst = frame('event-approval-1-requested', 20, {
      approval,
      kind: 'approval.requested',
      sessionId: session.id
    })

    const expiredFirst = frame('event-approval-1-expired', 21, {
      approvalId: approval.approvalId,
      kind: 'approval.settled',
      outcome: 'expired',
      sessionId: session.id
    })

    const requestedSecond = frame('event-approval-2-requested', 22, {
      approval: changed,
      kind: 'approval.requested',
      sessionId: session.id
    })

    const invalidatedSecond = frame('event-approval-2-invalidated', 23, {
      approvalId: changed.approvalId,
      kind: 'approval.settled',
      outcome: 'invalidated',
      sessionId: session.id
    })

    let projection = applyWireEventFrame(emptyWireSessionProjection(session.id), requestedFirst).projection

    // The user's ONE decision is the only approvals.decide this flow emits.
    await decideAgentBoxApproval(
      client,
      {
        approvalId: approval.approvalId,
        decision: 'allow',
        expectedVersion: approval.version,
        scope: { kind: 'once' }
      },
      { createRequestId: () => asRequestId('request-approval-0001') }
    )

    const expired = applyWireEventFrame(projection, expiredFirst)

    expect(expired.outcome).toBe('applied')
    expect(expired.projection.approvals[approval.approvalId]).toBeUndefined()
    expect(expired.projection.approvalOutcomes[approval.approvalId]).toBe('expired')

    // Replaying the settled frame is a duplicate even though the approval had
    // been decided: nothing settles a second time.
    const expiredReplay = applyWireEventFrame(expired.projection, expiredFirst)

    expect(expiredReplay.outcome).toBe('duplicate')
    expect(expiredReplay.projection).toBe(expired.projection)
    projection = expiredReplay.projection

    const secondRequested = applyWireEventFrame(projection, requestedSecond)

    expect(secondRequested.projection.approvals[changed.approvalId]).toEqual(changed)

    const invalidated = applyWireEventFrame(secondRequested.projection, invalidatedSecond)

    expect(invalidated.outcome).toBe('applied')
    // The card is gone, so nothing is left to decide.
    expect(invalidated.projection.approvals).toEqual({})
    expect(invalidated.projection.approvalOutcomes).toEqual({
      [approval.approvalId]: 'expired',
      [changed.approvalId]: 'invalidated'
    })

    const invalidatedReplay = applyWireEventFrame(invalidated.projection, invalidatedSecond)

    expect(invalidatedReplay.outcome).toBe('duplicate')
    expect(invalidatedReplay.projection).toBe(invalidated.projection)

    // One user decision, zero replay decisions.
    expect(host.request.mock.calls.map(([request]) => (request.body as WireRequest).method)).toEqual([
      'approvals.decide'
    ])
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

  it('08b — front-end reconnect fixture: history first, reconcile by the original requestId, terminal state clears stop', async () => {
    // Scripted frames over a scripted transport only. This is a FRONT-END
    // reconnect behaviour fixture: it pins what the client does when it
    // resumes — it does not execute or claim a live Server restart.
    const originalRequestId = asRequestId('request-before-reconnect-0001')

    $pendingAgentBoxSends.set({
      items: { [session.id]: { intentKey: '4', requestId: originalRequestId } },
      version: 1
    })
    $agentBoxStopStates.set({ [session.id]: { detail: null, phase: 'stopping' } })

    // The snapshot's own final execution state is terminal: the resumed stream
    // continues after its cursor, so this frame is never re-delivered live.
    const alreadyStopped = frame('event-execution-stopped', 0, {
      executionId: asWireId('execution-1'),
      kind: 'execution.state',
      reason: 'stop confirmed before reconnect',
      sessionId: session.id,
      state: 'stopped'
    })

    const methods: string[] = []

    const host = scriptedTransport((_request, envelope) => {
      methods.push(envelope.method)

      if (envelope.method === 'history.snapshot') {
        return {
          jsonrpc: '2.0',
          id: envelope.id,
          result: {
            frames: [alreadyStopped],
            olderCursor: null,
            outcome: 'snapshot',
            resumeCursor: asCursor('cursor-resume')
          }
        }
      }

      if (envelope.method === 'sendOutcome.query') {
        return {
          jsonrpc: '2.0',
          id: envelope.id,
          result: {
            configVersion: 7,
            executionId: asWireId('execution-1'),
            outcome: 'accepted',
            queueItemId: null,
            sessionId: session.id
          }
        }
      }

      throw new Error(`reconnect must not call ${envelope.method}`)
    })

    const client = new WireV1Client({ transport: host })

    const history = await hydrateAgentBoxHistory(client, session.id)

    expect(history.outcome).toBe('snapshot')
    expect($agentBoxSessionProjections.get()[session.id]?.resumeCursor).toBe('cursor-resume')

    // The snapshot already declared the run over, so the previously requested
    // stop is reconciled from that fact alone — no live frame is re-delivered.
    expect($agentBoxSessionProjections.get()[session.id]?.execution).toMatchObject({ state: 'stopped' })
    expect($agentBoxStopStates.get()[session.id]).toEqual({
      detail: 'stop confirmed before reconnect',
      phase: 'idle'
    })

    // The resume path reads the snapshot BEFORE anything else...
    expect(methods[0]).toBe('history.snapshot')

    // ...and the outstanding send is settled by querying its ORIGINAL
    // requestId, never by re-sending it as a new request.
    const recovered = await resolvePendingAgentBoxSend(client, session.id)

    expect(recovered).toMatchObject({ outcome: 'accepted', requestId: originalRequestId })
    expect($pendingAgentBoxSends.get().items).toEqual({})
    expect(methods).toEqual(['history.snapshot', 'sendOutcome.query'])

    const queryParams = host.request.mock.calls
      .map(([request]) => request.body as WireRequest)
      .filter(body => body.method === 'sendOutcome.query')
      .map(body => body.params)

    expect(queryParams).toEqual([{ requestId: originalRequestId }])

    expect(
      methods.filter(method => method === 'sessions.send' || method === 'sessions.createAndSend')
    ).toEqual([])
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
