import type { ApprovalRequest, EventFrame, WireCursor, WireEvent } from '@/types/wire/wire-v1'

export interface WireTranscriptMessage {
  displayKind: 'hidden' | 'visible'
  messageId: string
  role: 'assistant' | 'system' | 'user'
  text: string
}

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
  messageOrder: string[]
  messages: Record<string, WireTranscriptMessage>
  needsResync: boolean
  olderCursor: null | WireCursor
  resumeCursor: null | WireCursor
  sessionId: string
  tools: Record<
    string,
    Extract<WireEvent, { kind: 'tool.update' }>
  >
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
    messageOrder: [],
    messages: {},
    needsResync: false,
    olderCursor: null,
    resumeCursor: null,
    sessionId,
    tools: {}
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
    const current = projection.messages[event.messageId]

    return {
      ...projection,
      messageOrder: current ? projection.messageOrder : [...projection.messageOrder, event.messageId],
      messages: {
        ...projection.messages,
        [event.messageId]: {
          displayKind: current?.displayKind ?? 'visible',
          messageId: event.messageId,
          role: event.role,
          text: `${current?.text ?? ''}${event.text}`
        }
      }
    }
  }

  if (event.kind === 'message.final') {
    return {
      ...projection,
      messageOrder: projection.messages[event.messageId]
        ? projection.messageOrder
        : [...projection.messageOrder, event.messageId],
      messages: {
        ...projection.messages,
        [event.messageId]: {
          displayKind: event.displayKind,
          messageId: event.messageId,
          role: event.role,
          text: event.text
        }
      }
    }
  }

  if (event.kind === 'execution.state') {
    return {
      ...projection,
      execution: { executionId: event.executionId, reason: event.reason ?? null, state: event.state }
    }
  }

  if (event.kind === 'tool.update') {
    return { ...projection, tools: { ...projection.tools, [event.toolCallId]: event } }
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
  input: { cursor: WireCursor; lastSeq?: number; olderCursor?: null | WireCursor }
): WireSessionProjection {
  return {
    ...projection,
    lastSeq: input.lastSeq ?? projection.lastSeq,
    needsResync: false,
    olderCursor: input.olderCursor === undefined ? projection.olderCursor : input.olderCursor,
    resumeCursor: input.cursor
  }
}
