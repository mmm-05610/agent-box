import type { WireV1Client } from '@/api/wire-v1-client'
import {
  $agentBoxQueues,
  agentBoxSessionProjection,
  setAgentBoxQueue,
  setAgentBoxSessionProjection,
  setAgentBoxStopState
} from '@/store/agentbox-runtime'
import {
  type ApprovalDecisionScope,
  asRequestId,
  type EventFrame,
  type QueueWithdrawResult,
  type RequestId,
  type RunsStopResult,
  type WireId
} from '@/types/wire/wire-v1'

import { applyWireEventFrame, emptyWireSessionProjection, markWireProjectionResynced } from './wire-session-projection'

export interface WireSessionControlOptions {
  createRequestId?: () => RequestId
}

const defaultRequestId = (): RequestId => asRequestId(`desktop-${crypto.randomUUID()}`)

export async function refreshAgentBoxQueue(client: WireV1Client, sessionId: WireId) {
  const result = await client.call('queue.get', { sessionId })
  setAgentBoxQueue(sessionId, result.items)

  return result.items
}

export async function withdrawAgentBoxQueueItem(
  client: WireV1Client,
  input: { expectedVersion: number; itemId: WireId; sessionId: WireId },
  options: WireSessionControlOptions = {}
): Promise<QueueWithdrawResult> {
  const result = await client.call('queue.withdraw', {
    ...input,
    requestId: (options.createRequestId ?? defaultRequestId)()
  })

  const current = $agentBoxQueues.get()[input.sessionId] ?? []

  if (result.outcome === 'withdrawn') {
    setAgentBoxQueue(
      input.sessionId,
      current.filter(item => item.itemId !== input.itemId)
    )
  } else if (result.item) {
    setAgentBoxQueue(
      input.sessionId,
      current.map(item => (item.itemId === result.item!.itemId ? result.item! : item))
    )
  }

  return result
}

export async function requestAgentBoxStop(
  client: WireV1Client,
  input: { executionId: WireId; sessionId: WireId },
  options: WireSessionControlOptions = {}
): Promise<RunsStopResult> {
  setAgentBoxStopState(input.sessionId, { detail: null, phase: 'requesting' })

  let result: RunsStopResult

  try {
    result = await client.call('runs.stop', {
      ...input,
      requestId: (options.createRequestId ?? defaultRequestId)()
    })
  } catch (error) {
    setAgentBoxStopState(input.sessionId, {
      detail: error instanceof Error ? error.message : String(error),
      phase: 'unconfirmed'
    })
    throw error
  }

  if (result.outcome === 'stop_requested') {
    const projection = agentBoxSessionProjection(input.sessionId)
    setAgentBoxSessionProjection(input.sessionId, {
      ...projection,
      execution: { executionId: input.executionId, reason: null, state: 'stopping' }
    })
    setAgentBoxStopState(input.sessionId, { detail: null, phase: 'stopping' })
  } else if (result.outcome === 'unconfirmed') {
    setAgentBoxStopState(input.sessionId, { detail: result.reason, phase: 'unconfirmed' })
  } else {
    setAgentBoxStopState(input.sessionId, { detail: result.reason, phase: 'idle' })
  }

  return result
}

export async function decideAgentBoxApproval(
  client: WireV1Client,
  input: {
    approvalId: WireId
    decision: 'allow' | 'deny'
    expectedVersion: number
    scope: ApprovalDecisionScope
  },
  options: WireSessionControlOptions = {}
) {
  return client.call('approvals.decide', {
    ...input,
    requestId: (options.createRequestId ?? defaultRequestId)()
  })
}

export function ingestAgentBoxEvent(frame: EventFrame) {
  const current = agentBoxSessionProjection(frame.sessionId)
  const result = applyWireEventFrame(current, frame)

  if (result.outcome === 'applied' || result.outcome === 'gap') {
    setAgentBoxSessionProjection(frame.sessionId, result.projection)
  }

  if (frame.event.kind === 'execution.state' && result.outcome === 'applied') {
    setAgentBoxStopState(frame.sessionId, {
      detail: frame.event.reason ?? null,
      phase: frame.event.state === 'stopping' ? 'stopping' : 'idle'
    })
  }

  if (frame.event.kind === 'queue.updated' && result.outcome === 'applied') {
    const event = frame.event
    const current = $agentBoxQueues.get()[frame.sessionId] ?? []
    const index = current.findIndex(item => item.itemId === event.item.itemId)
    const items = [...current]

    if (index < 0) {
      items.push(event.item)
    } else {
      items[index] = event.item
    }

    setAgentBoxQueue(frame.sessionId, items.filter(item => item.state !== 'withdrawn'))
  }

  return result
}

export async function hydrateAgentBoxHistory(client: WireV1Client, sessionId: WireId) {
  const existing = agentBoxSessionProjection(sessionId)
  let fullResync = false

  let snapshot = await client.call('history.snapshot', {
    ...(existing.resumeCursor ? { cursor: existing.resumeCursor } : {}),
    sessionId
  })

  if (snapshot.outcome === 'resync_required') {
    fullResync = true
    snapshot = await client.call('history.snapshot', { sessionId })
  }

  if (snapshot.outcome === 'resync_required') {
    setAgentBoxSessionProjection(sessionId, { ...existing, needsResync: true })

    return { outcome: 'resync_required' as const, reason: snapshot.reason }
  }

  let projection = existing.resumeCursor && !fullResync ? existing : emptyWireSessionProjection(sessionId)

  for (const frame of snapshot.frames) {
    const applied = applyWireEventFrame(projection, frame)

    if (applied.outcome === 'gap' || applied.outcome === 'wrong_session') {
      setAgentBoxSessionProjection(sessionId, { ...applied.projection, needsResync: true })

      return { outcome: 'resync_required' as const, reason: applied.outcome }
    }

    projection = applied.projection
  }

  projection = markWireProjectionResynced(projection, {
    cursor: snapshot.resumeCursor,
    olderCursor: snapshot.olderCursor,
    ...(snapshot.frames.length > 0 ? { lastSeq: snapshot.frames.at(-1)!.seq } : {})
  })
  setAgentBoxSessionProjection(sessionId, projection)

  return { outcome: 'snapshot' as const, projection }
}
