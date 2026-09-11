/**
 * AgentBox Desktop adapter — event mapping.
 *
 * Translates durable AgentBox transcript events (frozen §4.2 entry shape)
 * into the desktop renderer's `ChatMessage[]` — the exact shape consumed by
 * `useRuntimeMessageRepository` → `useIncrementalExternalStoreRuntime` → the
 * existing assistant-ui transcript components. NO new session/turn authority
 * is created here: this is a pure, stateless projection. The AgentBox backend
 * remains the sole authority; `client.transcript(sessionId, after)` can
 * rebuild the projection at any time.
 *
 * Mapping (AgentBox event → ChatMessage):
 *   TURN_STARTED            → user bubble (turn input text) + pending marker
 *   assistant.message       → assistant bubble parts (final reply text)
 *   workspace.observation   → tool-like part inside the assistant bubble
 *   turn.result             → tool-like summary part
 *   TURN_TERMINAL           → settles the turn (pending=false; failed → error)
 *   TURN_COMMITTED          → authoritative row boundary (no-op for display)
 */

import type { ChatMessage, ChatMessagePart } from '@/lib/chat-messages/types'

import type { AgentBoxEvent, AgentBoxTranscript } from './types'

export interface AgentBoxTurnProjection {
  messages: ChatMessage[]
  /** Highest seq folded into this projection — the resume cursor. */
  watermark: number
  /** True while the newest turn has not reached TURN_TERMINAL. */
  turnRunning: boolean
}

interface TurnAccumulator {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

const ASSISTANT_MESSAGE_ID_PREFIX = 'agentbox-assistant-'
const USER_MESSAGE_ID_PREFIX = 'agentbox-user-'

function textPart(text: string): ChatMessagePart {
  return { type: 'text', text }
}

/**
 * Fold ONE event into an existing projection. Pure: returns a new structure,
 * never mutates the input messages (React identity preservation upstream).
 * Events with seq ≤ watermark are ignored (replay overlap).
 */
export function foldAgentBoxEvent(projection: AgentBoxTurnProjection, event: AgentBoxEvent): AgentBoxTurnProjection {
  if (event.seq <= projection.watermark) {
    return projection
  }

  const turnId = event.turn_id
  const payload = event.payload

  let messages = projection.messages
  let turnRunning = projection.turnRunning

  if (event.event_type === 'TURN_STARTED' && turnId) {
    const input = typeof payload.input === 'string' ? payload.input : ''

    messages = [
      ...messages,
      {
        id: `${USER_MESSAGE_ID_PREFIX}${turnId}`,
        role: 'user',
        parts: [textPart(input)],
        pending: false
      },
      {
        id: `${ASSISTANT_MESSAGE_ID_PREFIX}${turnId}`,
        role: 'assistant',
        parts: [],
        pending: true
      }
    ]
    turnRunning = true
  } else if (event.event_type === 'assistant.message' && turnId) {
    const text = typeof payload.text === 'string' ? payload.text : ''
    const assistant = findAssistant(messages, turnId)

    if (assistant) {
      const withText: ChatMessage = {
        ...assistant,
        parts: [...assistant.parts, textPart(text)]
      }

      messages = replaceMessage(messages, withText)
    }
  } else if (event.event_type === 'workspace.observation' && turnId) {
    const detail = typeof payload.detail === 'string' ? payload.detail : 'workspace observation'
    const assistant = findAssistant(messages, turnId)

    if (assistant) {
      const withTool: ChatMessage = {
        ...assistant,
        parts: [
          ...assistant.parts,
          {
            type: 'tool-call',
            toolCallId: `${event.event_id}`,
            toolName: 'workspace.observation',
            args: {},
            result: detail
          } as ChatMessagePart
        ]
      }

      messages = replaceMessage(messages, withTool)
    }
  } else if (event.event_type === 'turn.result' && turnId) {
    const outcome = typeof payload.outcome === 'string' ? payload.outcome : ''
    const note = typeof payload.note === 'string' ? payload.note : ''
    const assistant = findAssistant(messages, turnId)

    if (assistant) {
      const withResult: ChatMessage = {
        ...assistant,
        parts: [
          ...assistant.parts,
          {
            type: 'tool-call',
            toolCallId: event.event_id,
            toolName: 'turn.result',
            args: {},
            result: [outcome, note].filter(Boolean).join(' — ')
          } as ChatMessagePart
        ]
      }

      messages = replaceMessage(messages, withResult)
    }
  } else if (event.event_type === 'TURN_TERMINAL' && turnId) {
    const outcome = typeof payload.outcome === 'string' ? payload.outcome : 'unknown'
    const assistant = findAssistant(messages, turnId)

    if (assistant) {
      messages = replaceMessage(messages, {
        ...assistant,
        pending: false,
        ...(outcome !== 'succeeded' ? { error: `turn ${outcome}` } : {})
      })
    }

    turnRunning = false
  }

  // TURN_COMMITTED / SESSION_CREATED / EXECUTION_LINKED / TURN_INPUT /
  // WORKSPACE_AFTER carry no display content — durable bookkeeping only.

  return {
    messages,
    watermark: event.seq,
    turnRunning
  }
}

/** Project a full transcript fetch (initial hydration or re-sync). */
export function projectAgentBoxTranscript(transcript: AgentBoxTranscript): AgentBoxTurnProjection {
  let projection: AgentBoxTurnProjection = { messages: [], watermark: 0, turnRunning: false }

  for (const event of transcript.events) {
    projection = foldAgentBoxEvent(projection, event)
  }

  return projection
}

function findAssistant(messages: ChatMessage[], turnId: string): ChatMessage | undefined {
  return messages.find(message => message.id === `${ASSISTANT_MESSAGE_ID_PREFIX}${turnId}`)
}

function replaceMessage(messages: ChatMessage[], next: ChatMessage): ChatMessage[] {
  return messages.map(message => (message.id === next.id ? next : message))
}
