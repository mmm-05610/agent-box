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

  it('deduplicates replay, projects tool facts, and marks a sequence gap for resync', () => {
    const tool = frame(0, {
      kind: 'tool.update',
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
        frame(2, { kind: 'message.final', messageId: asWireId('message-2'), sessionId, text: 'late' })
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
})

describe('AgentBox history recovery', () => {
  it('retries from a clean snapshot when the saved cursor is too old', async () => {
    ingestAgentBoxEvent(
      frame(8, { kind: 'message.final', messageId: asWireId('old-message'), sessionId, text: 'stale' })
    )

    const fresh = frame(0, {
      kind: 'message.final',
      messageId: asWireId('fresh-message'),
      sessionId,
      text: 'restored'
    })

    const wire = client(async (_method, params) =>
      'cursor' in (params as Record<string, unknown>)
        ? { outcome: 'resync_required', reason: 'cursor expired' }
        : { frames: [fresh], outcome: 'snapshot', resumeCursor: asCursor('cursor-fresh') }
    )

    const result = await hydrateAgentBoxHistory(wire, sessionId)

    expect(result.outcome).toBe('snapshot')
    expect($agentBoxSessionProjections.get()[sessionId]?.messages).toEqual({ 'fresh-message': 'restored' })
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
})
