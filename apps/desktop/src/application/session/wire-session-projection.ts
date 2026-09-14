import type { ApprovalRequest, EventFrame, WireCursor, WireEvent } from '@/types/wire/wire-v1'

export interface WireSessionProjection {
  appliedEventIds: string[]
  approvals: Record<string, ApprovalRequest>
  approvalOutcomes: Record<string, 'allowed' | 'denied' | 'expired' | 'invalidated'>
  configEffectiveFor: null | 'immediate' | 'next_send'
  execution: null | {
    executionId: string
    reason: null | string
    state: Extract<WireEvent, { kind: 'execution.state' }>['state']
  }
  lastSeq: null | number
  messages: Record<string, string>
  needsResync: boolean
  resumeCursor: null | WireCursor
  sessionId: string
}

export type WireFrameApplyOutcome = 'applied' | 'duplicate' | 'gap' | 'wrong_session'

export interface WireFrameApplyResult {
  outcome: WireFrameApplyOutcome
  projection: WireSessionProjection
}

export function emptyWireSessionProjection(sessionId: string): WireSessionProjection {
  return {
    appliedEventIds: [],
    approvals: {},
    approvalOutcomes: {},
    configEffectiveFor: null,
    execution: null,
    lastSeq: null,
    messages: {},
    needsResync: false,
    resumeCursor: null,
    sessionId
  }
}

/**
 * Pure replay reducer. It restores presentation facts only; it cannot invoke a
 * tool, decide an approval, dispatch a message, or start an execution.
 */
export function applyWireEventFrame(
  projection: WireSessionProjection,
  frame: EventFrame
): WireFrameApplyResult {
  if (frame.sessionId !== projection.sessionId || ('sessionId' in frame.event && frame.event.sessionId !== projection.sessionId)) {
    return { outcome: 'wrong_session', projection }
  }

  if (projection.appliedEventIds.includes(frame.eventId)) {
    return { outcome: 'duplicate', projection }
  }

  if (projection.lastSeq !== null && frame.seq !== projection.lastSeq + 1) {
    return { outcome: 'gap', projection: { ...projection, needsResync: true } }
  }

  const next: WireSessionProjection = {
    ...projection,
    appliedEventIds: [...projection.appliedEventIds, frame.eventId],
    lastSeq: frame.seq,
    resumeCursor: frame.cursor
  }

  return { outcome: 'applied', projection: reduceWireEvent(next, frame.event) }
}

function reduceWireEvent(projection: WireSessionProjection, event: WireEvent): WireSessionProjection {
  if (event.kind === 'message.delta') {
    return {
      ...projection,
      messages: { ...projection.messages, [event.messageId]: `${projection.messages[event.messageId] ?? ''}${event.text}` }
    }
  }

  if (event.kind === 'message.final') {
    return { ...projection, messages: { ...projection.messages, [event.messageId]: event.text } }
  }

  if (event.kind === 'execution.state') {
    return {
      ...projection,
      execution: { executionId: event.executionId, reason: event.reason ?? null, state: event.state }
    }
  }

  if (event.kind === 'approval.requested') {
    return {
      ...projection,
      approvals: { ...projection.approvals, [event.approval.approvalId]: event.approval }
    }
  }

  if (event.kind === 'approval.settled') {
    const approvals = { ...projection.approvals }

    delete approvals[event.approvalId]

    return {
      ...projection,
      approvals,
      approvalOutcomes: { ...projection.approvalOutcomes, [event.approvalId]: event.outcome }
    }
  }

  if (event.kind === 'config.changed') {
    return { ...projection, configEffectiveFor: event.effectiveFor }
  }

  return projection
}

export function markWireProjectionResynced(
  projection: WireSessionProjection,
  input: { cursor: WireCursor; lastSeq: number }
): WireSessionProjection {
  return { ...projection, lastSeq: input.lastSeq, needsResync: false, resumeCursor: input.cursor }
}
