import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WireV1Client } from '@/api/wire-v1-client'
import { $agentBoxQueues, $agentBoxSessionProjections, $agentBoxStopStates } from '@/store/agentbox-runtime'
import {
  asCursor,
  asRequestId,
  asWireId,
  type EventFrame,
  type QueueItem
} from '@/types/wire/wire-v1'

import {
  decideAgentBoxApproval,
  hydrateAgentBoxHistory,
  ingestAgentBoxEvent,
  refreshAgentBoxQueue,
  requestAgentBoxStop,
  withdrawAgentBoxQueueItem
} from './wire-session-control'

const sessionId = asWireId('session-1')
const requestId = asRequestId('request-control-1')

const queueItem = (patch: Partial<QueueItem> = {}): QueueItem => ({
  configVersion: 3,
  itemId: asWireId('queue-1'),
  message: { attachments: [], text: 'next' },
  profileId: asWireId('profile-1'),
  state: 'pending',
  submittedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  ...patch
})

const frame = (seq: number, event: EventFrame['event']): EventFrame => ({
  cursor: asCursor(`cursor-${seq}`),
  emittedAt: '2026-09-14T00:00:00.000Z',
  event,
  eventId: asWireId(`event-${seq}`),
  seq,
  sessionId
})

function client(call: (method: string, params: unknown) => Promise<unknown>) {
  return { call: vi.fn(call) } as unknown as WireV1Client & { call: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  $agentBoxQueues.set({})
  $agentBoxSessionProjections.set({})
  $agentBoxStopStates.set({})
})

describe('AgentBox queue control', () => {
  it('replaces the queue only with a validated service projection', async () => {
    const wire = client(async () => ({ items: [queueItem()] }))

    await expect(refreshAgentBoxQueue(wire, sessionId)).resolves.toEqual([queueItem()])
    expect($agentBoxQueues.get()[sessionId]).toEqual([queueItem()])
  })

  it('removes an item only after the service confirms withdrawal', async () => {
    $agentBoxQueues.set({ [sessionId]: [queueItem()] })
    const withdrawn = queueItem({ state: 'withdrawn', version: 2 })
    const wire = client(async () => ({ item: withdrawn, outcome: 'withdrawn' }))

    await withdrawAgentBoxQueueItem(
      wire,
      { expectedVersion: 1, itemId: queueItem().itemId, sessionId },
      { createRequestId: () => requestId }
    )

    expect(wire.call).toHaveBeenCalledWith('queue.withdraw', {
      expectedVersion: 1,
      itemId: 'queue-1',
      requestId,
      sessionId
    })
    expect($agentBoxQueues.get()[sessionId]).toEqual([])
  })

  it('keeps and refreshes a too-late item from the returned server record', async () => {
    $agentBoxQueues.set({ [sessionId]: [queueItem()] })
    const dispatched = queueItem({ state: 'dispatched', version: 2 })
    const wire = client(async () => ({ item: dispatched, outcome: 'too_late', reason: 'already dispatched' }))

    await withdrawAgentBoxQueueItem(wire, { expectedVersion: 1, itemId: queueItem().itemId, sessionId })
    expect($agentBoxQueues.get()[sessionId]).toEqual([dispatched])
  })
})

describe('AgentBox stop and event projection', () => {
  it('shows stopping only after the service accepts the stop request', async () => {
    const running = frame(0, {
      executionId: asWireId('execution-1'),
      kind: 'execution.state',
      sessionId,
      state: 'running'
    })

    ingestAgentBoxEvent(running)
    const wire = client(async () => ({ executionId: asWireId('execution-1'), outcome: 'stop_requested' }))

    await requestAgentBoxStop(
      wire,
      { executionId: asWireId('execution-1'), sessionId },
      { createRequestId: () => requestId }
    )

    expect($agentBoxSessionProjections.get()[sessionId]?.execution?.state).toBe('stopping')
    expect($agentBoxStopStates.get()[sessionId]?.phase).toBe('stopping')
  })

  it('preserves the running fact when stop remains unconfirmed', async () => {
    ingestAgentBoxEvent(
      frame(0, { executionId: asWireId('execution-1'), kind: 'execution.state', sessionId, state: 'running' })
    )
    const wire = client(async () => ({ outcome: 'unconfirmed', reason: 'transport uncertain' }))

    await requestAgentBoxStop(wire, { executionId: asWireId('execution-1'), sessionId })
    expect($agentBoxSessionProjections.get()[sessionId]?.execution?.state).toBe('running')
    expect($agentBoxStopStates.get()[sessionId]).toEqual({ detail: 'transport uncertain', phase: 'unconfirmed' })
  })

  it('does not strand stop at requesting when the transport outcome is unknown', async () => {
    ingestAgentBoxEvent(
      frame(0, { executionId: asWireId('execution-1'), kind: 'execution.state', sessionId, state: 'running' })
    )
    const wire = client(async () => Promise.reject(new Error('connection lost')))

    await expect(requestAgentBoxStop(wire, { executionId: asWireId('execution-1'), sessionId })).rejects.toThrow(
      'connection lost'
    )
    expect($agentBoxSessionProjections.get()[sessionId]?.execution?.state).toBe('running')
    expect($agentBoxStopStates.get()[sessionId]).toEqual({ detail: 'connection lost', phase: 'unconfirmed' })
  })

  it.each(['completed', 'stopped', 'failed'] as const)('clears the stop state once execution reaches %s', state => {
    ingestAgentBoxEvent(
      frame(0, { executionId: asWireId('execution-1'), kind: 'execution.state', sessionId, state: 'stopping' })
    )

    expect($agentBoxStopStates.get()[sessionId]).toEqual({ detail: null, phase: 'stopping' })

    ingestAgentBoxEvent(
      frame(1, {
        executionId: asWireId('execution-1'),
        kind: 'execution.state',
        reason: 'run ended',
        sessionId,
        state
      })
    )

    expect($agentBoxStopStates.get()[sessionId]).toEqual({ detail: 'run ended', phase: 'idle' })
    expect($agentBoxSessionProjections.get()[sessionId]?.execution?.state).toBe(state)
  })

  it('projects cross-window queue events from server truth', () => {
    ingestAgentBoxEvent(frame(0, { item: queueItem(), kind: 'queue.updated', sessionId }))
    expect($agentBoxQueues.get()[sessionId]).toEqual([queueItem()])

    ingestAgentBoxEvent(
      frame(1, { item: queueItem({ state: 'withdrawn', version: 2 }), kind: 'queue.updated', sessionId })
    )
    expect($agentBoxQueues.get()[sessionId]).toEqual([])
  })

  it.each(['completed', 'failed', 'cancelled'] as const)('removes %s queue items after the terminal event', state => {
    ingestAgentBoxEvent(frame(0, { item: queueItem(), kind: 'queue.updated', sessionId }))
    ingestAgentBoxEvent(frame(1, { item: queueItem({ state, version: 2 }), kind: 'queue.updated', sessionId }))

    expect($agentBoxQueues.get()[sessionId]).toEqual([])
  })

  it('continues the active queue with the next dispatched item, and a stale replay cannot bring a terminal item back', () => {
    const finishedA = queueItem({ itemId: asWireId('queue-a') })
    const completedA: QueueItem = { ...finishedA, state: 'completed', version: 2 }
    const nextB = queueItem({ itemId: asWireId('queue-b'), state: 'dispatched', version: 1 })

    ingestAgentBoxEvent(frame(0, { item: finishedA, kind: 'queue.updated', sessionId }))
    ingestAgentBoxEvent(frame(1, { item: completedA, kind: 'queue.updated', sessionId }))
    ingestAgentBoxEvent(frame(2, { item: nextB, kind: 'queue.updated', sessionId }))

    expect($agentBoxQueues.get()[sessionId]).toEqual([nextB])

    // Duplicate frames (same eventId) are never applied, so A stays out.
    expect(ingestAgentBoxEvent(frame(1, { item: completedA, kind: 'queue.updated', sessionId })).outcome).toBe(
      'duplicate'
    )
    expect(ingestAgentBoxEvent(frame(0, { item: finishedA, kind: 'queue.updated', sessionId })).outcome).toBe(
      'duplicate'
    )
    expect($agentBoxQueues.get()[sessionId]).toEqual([nextB])
  })

  it('deduplicates replay, projects tool facts, and marks a sequence gap for resync', () => {
    const tool = frame(0, {
      kind: 'tool.update',
      messageId: null,
      resultExcerpt: null,
      sessionId,
      state: 'awaiting_approval',
      summary: 'write file',
      tool: null,
      toolCallId: asWireId('tool-1')
    })

    expect(ingestAgentBoxEvent(tool).outcome).toBe('applied')
    expect(ingestAgentBoxEvent(tool).outcome).toBe('duplicate')
    expect($agentBoxSessionProjections.get()[sessionId]?.tools['tool-1']?.state).toBe('awaiting_approval')

    expect(
      ingestAgentBoxEvent(
        frame(2, {
          displayKind: 'visible',
          kind: 'message.final',
          messageId: asWireId('message-2'),
          role: 'assistant',
          sessionId,
          text: 'late'
        })
      ).outcome
    ).toBe('gap')
    expect($agentBoxSessionProjections.get()[sessionId]?.needsResync).toBe(true)
  })

  it('keeps an approval visible until the server event settles it', async () => {
    const approvalId = asWireId('approval-1')
    ingestAgentBoxEvent(
      frame(0, {
        approval: {
          approvalId,
          executionId: asWireId('execution-1'),
          expiresAt: null,
          operation: { detail: [{ label: 'path', value: '/workspace/file' }], title: 'Write file', tool: null },
          sessionId,
          version: 2
        },
        kind: 'approval.requested',
        sessionId
      })
    )
    const wire = client(async () => ({ decision: 'allow', outcome: 'recorded' }))

    await decideAgentBoxApproval(
      wire,
      { approvalId, decision: 'allow', expectedVersion: 2, scope: { kind: 'once' } },
      { createRequestId: () => requestId }
    )
    expect($agentBoxSessionProjections.get()[sessionId]?.approvals[approvalId]).toBeTruthy()

    ingestAgentBoxEvent(
      frame(1, { approvalId, kind: 'approval.settled', outcome: 'allowed', sessionId })
    )
    expect($agentBoxSessionProjections.get()[sessionId]?.approvals[approvalId]).toBeUndefined()
  })

  // Expiry arrives as `expired`; a content change or a cancellation arrives as
  // `invalidated` — the schema carries no other invalidation outcome, and the
  // client must not invent one.
  it.each(['expired', 'invalidated'] as const)(
    'removes a pending approval settled as %s, and the identical replay decides nothing twice',
    outcome => {
      const approvalId = asWireId(`approval-${outcome}`)

      ingestAgentBoxEvent(
        frame(0, {
          approval: {
            approvalId,
            executionId: asWireId('execution-1'),
            expiresAt: null,
            operation: { detail: [{ label: 'path', value: '/workspace/file' }], title: 'Write file', tool: null },
            sessionId,
            version: 2
          },
          kind: 'approval.requested',
          sessionId
        })
      )

      expect($agentBoxSessionProjections.get()[sessionId]?.approvals[approvalId]).toBeTruthy()

      const settledFrame = frame(1, { approvalId, kind: 'approval.settled', outcome, sessionId })

      expect(ingestAgentBoxEvent(settledFrame).outcome).toBe('applied')

      const settled = $agentBoxSessionProjections.get()[sessionId]

      expect(settled?.approvals[approvalId]).toBeUndefined()
      expect(settled?.approvalOutcomes[approvalId]).toBe(outcome)

      // A replay is a duplicate: the stored projection is the SAME object, so
      // no second decision fact is recorded and nothing settles again.
      expect(ingestAgentBoxEvent(settledFrame).outcome).toBe('duplicate')
      expect($agentBoxSessionProjections.get()[sessionId]).toBe(settled)
    }
  )
})

describe('AgentBox history recovery', () => {
  it('retries from a clean snapshot when the saved cursor is too old', async () => {
    ingestAgentBoxEvent(
      frame(8, {
        displayKind: 'visible',
        kind: 'message.final',
        messageId: asWireId('old-message'),
        role: 'assistant',
        sessionId,
        text: 'stale'
      })
    )

    const fresh = frame(0, {
      displayKind: 'visible',
      kind: 'message.final',
      messageId: asWireId('fresh-message'),
      role: 'assistant',
      sessionId,
      text: 'restored'
    })

    const wire = client(async (_method, params) =>
      'cursor' in (params as Record<string, unknown>)
        ? { outcome: 'resync_required', reason: 'cursor expired' }
        : { frames: [fresh], olderCursor: null, outcome: 'snapshot', resumeCursor: asCursor('cursor-fresh') }
    )

    const result = await hydrateAgentBoxHistory(wire, sessionId)

    expect(result.outcome).toBe('snapshot')
    expect($agentBoxSessionProjections.get()[sessionId]?.messages).toEqual({
      'fresh-message': {
        displayKind: 'visible',
        messageId: 'fresh-message',
        role: 'assistant',
        text: 'restored'
      }
    })
    expect(wire.call).toHaveBeenCalledTimes(2)
  })

  it('retains an explicit resync-required state instead of manufacturing history', async () => {
    const wire = client(async () => ({ outcome: 'resync_required', reason: 'history unavailable' }))

    await expect(hydrateAgentBoxHistory(wire, sessionId)).resolves.toEqual({
      outcome: 'resync_required',
      reason: 'history unavailable'
    })
    expect($agentBoxSessionProjections.get()[sessionId]?.needsResync).toBe(true)
  })

  // A terminal execution frame can arrive only inside the reconnect snapshot:
  // the resumed stream continues after the snapshot's cursor, so the frame is
  // never re-delivered. The stop affordance must be reconciled from it.
  it.each([
    ['completed', 'run completed'],
    ['failed', 'worker unreachable'],
    ['stopped', null]
  ] as const)('clears a requested stop when the reconnect snapshot already ended as %s', async (state, reason) => {
    $agentBoxStopStates.set({ [sessionId]: { detail: null, phase: 'stopping' } })

    const wire = client(async () => ({
      frames: [
        frame(0, { executionId: asWireId('execution-1'), kind: 'execution.state', sessionId, state: 'running' }),
        frame(1, { executionId: asWireId('execution-1'), kind: 'execution.state', reason, sessionId, state })
      ],
      olderCursor: null,
      outcome: 'snapshot',
      resumeCursor: asCursor('cursor-snapshot')
    }))

    await expect(hydrateAgentBoxHistory(wire, sessionId)).resolves.toMatchObject({ outcome: 'snapshot' })

    expect($agentBoxSessionProjections.get()[sessionId]?.execution?.state).toBe(state)
    expect($agentBoxStopStates.get()[sessionId]).toEqual({ detail: reason, phase: 'idle' })
    expect(wire.call.mock.calls.map(call => call[0])).toEqual(['history.snapshot'])
  })

  // The counter-example: a snapshot that says the run is still alive must NOT
  // silently erase the stop the user already requested.
  it.each(['queued', 'dispatched', 'running', 'stopping', 'unknown'] as const)(
    'leaves a requested stop intact while the reconnect snapshot still reports %s',
    async state => {
      $agentBoxStopStates.set({ [sessionId]: { detail: 'transport uncertain', phase: 'unconfirmed' } })

      const wire = client(async () => ({
        frames: [frame(0, { executionId: asWireId('execution-1'), kind: 'execution.state', sessionId, state })],
        olderCursor: null,
        outcome: 'snapshot',
        resumeCursor: asCursor('cursor-snapshot')
      }))

      await hydrateAgentBoxHistory(wire, sessionId)

      expect($agentBoxStopStates.get()[sessionId]).toEqual({ detail: 'transport uncertain', phase: 'unconfirmed' })
      expect(wire.call.mock.calls.map(call => call[0])).toEqual(['history.snapshot'])
    }
  )

  it('does not clear a requested stop when the snapshot carries no execution fact at all', async () => {
    $agentBoxStopStates.set({ [sessionId]: { detail: null, phase: 'unconfirmed' } })

    const wire = client(async () => ({
      frames: [
        frame(0, {
          displayKind: 'visible',
          kind: 'message.final',
          messageId: asWireId('message-1'),
          role: 'assistant',
          sessionId,
          text: 'history without an execution fact'
        })
      ],
      olderCursor: null,
      outcome: 'snapshot',
      resumeCursor: asCursor('cursor-snapshot')
    }))

    await hydrateAgentBoxHistory(wire, sessionId)

    expect($agentBoxStopStates.get()[sessionId]).toEqual({ detail: null, phase: 'unconfirmed' })
    expect(wire.call.mock.calls.map(call => call[0])).toEqual(['history.snapshot'])
  })
})
