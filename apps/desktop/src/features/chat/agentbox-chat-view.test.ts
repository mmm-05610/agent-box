import { describe, expect, it } from 'vitest'

import { emptyWireSessionProjection } from '@/application/session/wire-session-projection'
import { asWireId, type WireEvent } from '@/types/wire/wire-v1'

import { agentBoxProjectionMessages, registrationReason } from './agentbox-chat-view'

describe('AgentBox transcript projection', () => {
  it('reuses the normal message/tool card pipeline and keeps hidden rows hidden', () => {
    const projection = {
      ...emptyWireSessionProjection('session-1'),
      messageOrder: ['user-1', 'assistant-1'],
      messages: {
        'assistant-1': {
          displayKind: 'visible' as const,
          messageId: 'assistant-1',
          role: 'assistant' as const,
          text: 'Done'
        },
        'user-1': {
          displayKind: 'hidden' as const,
          messageId: 'user-1',
          role: 'user' as const,
          text: 'internal intent'
        }
      },
      tools: {
        'tool-1': {
          kind: 'tool.update' as const,
          messageId: asWireId('assistant-1'),
          resultExcerpt: 'updated app.ts',
          sessionId: asWireId('session-1'),
          state: 'completed' as const,
          summary: 'Patch applied',
          tool: 'patch',
          toolCallId: asWireId('tool-1')
        }
      }
    }

    const messages = agentBoxProjectionMessages(projection, false)

    expect(messages[0]).toMatchObject({ hidden: true, id: 'user-1' })
    expect(messages[1]?.parts).toEqual([
      { text: 'Done', type: 'text' },
      {
        args: {},
        result: { result: 'updated app.ts', summary: 'Patch applied' },
        toolCallId: 'tool-1',
        toolName: 'patch',
        type: 'tool-call'
      }
    ])
  })
})

// The process view may only render facts the wire actually carries. Today that
// is message text plus `tool.update` (the backend emits these for failures, and
// a completed update when it has one) — no reasoning parts, no fabricated tool
// lifecycle, no duration derived from anything local.
describe('AgentBox transcript process facts', () => {
  const toolUpdate = (
    overrides: Partial<Extract<WireEvent, { kind: 'tool.update' }>>
  ): Extract<WireEvent, { kind: 'tool.update' }> => ({
    kind: 'tool.update',
    messageId: asWireId('assistant-1'),
    sessionId: asWireId('session-1'),
    state: 'failed',
    tool: 'terminal',
    toolCallId: asWireId('tool-1'),
    ...overrides
  })

  const withTool = (tool: Extract<WireEvent, { kind: 'tool.update' }>) => ({
    ...emptyWireSessionProjection('session-1'),
    messageOrder: ['assistant-1'],
    messages: {
      'assistant-1': {
        displayKind: 'visible' as const,
        messageId: 'assistant-1',
        role: 'assistant' as const,
        text: 'working'
      }
    },
    tools: { 'tool-1': tool }
  })

  it('carries a failed tool call as its own error, marked as a failure', () => {
    const messages = agentBoxProjectionMessages(
      withTool(toolUpdate({ state: 'failed', summary: 'exit 1', resultExcerpt: 'bash: no such file' })),
      false
    )

    expect(messages[0]?.parts).toEqual([
      { text: 'working', type: 'text' },
      {
        args: {},
        isError: true,
        result: { error: 'exit 1\n\nbash: no such file', result: 'bash: no such file' },
        toolCallId: 'tool-1',
        toolName: 'terminal',
        type: 'tool-call'
      }
    ])
  })

  it('marks a denied call as a failure too, with the service reason', () => {
    const messages = agentBoxProjectionMessages(
      withTool(toolUpdate({ state: 'denied', summary: 'Denied by policy' })),
      false
    )

    expect(messages[0]?.parts.at(-1)).toMatchObject({ isError: true, result: { error: 'Denied by policy' } })
  })

  it('never invents a result for a call the service has not finished', () => {
    for (const state of ['requested', 'running', 'awaiting_approval'] as const) {
      const messages = agentBoxProjectionMessages(withTool(toolUpdate({ state })), true)
      const part = messages[0]?.parts.at(-1) as { isError?: unknown; result?: unknown }

      expect(part.result).toBeUndefined()
      expect(part.isError).toBeUndefined()
      expect(part).toMatchObject({ toolCallId: 'tool-1', toolName: 'terminal', type: 'tool-call' })
      // The row still exists — it is a real call in flight, just not a result.
      expect(messages[0]?.parts).toHaveLength(2)
    }
  })

  it('renders no reasoning or thinking part: the wire has no such event', () => {
    const messages = agentBoxProjectionMessages(
      {
        ...withTool(toolUpdate({ state: 'failed', summary: 'exit 1' })),
        sessionId: 'session-1'
      },
      true
    )

    const partTypes = messages.flatMap(message => message.parts.map(part => part.type))

    expect(new Set(partTypes)).toEqual(new Set(['text', 'tool-call']))
    expect(partTypes).not.toContain('reasoning')
  })

  it('marks only the last assistant message pending while a turn is running', () => {
    const projection = {
      ...emptyWireSessionProjection('session-1'),
      messageOrder: ['assistant-1', 'assistant-2'],
      messages: {
        'assistant-1': {
          displayKind: 'visible' as const,
          messageId: 'assistant-1',
          role: 'assistant' as const,
          text: 'first'
        },
        'assistant-2': {
          displayKind: 'visible' as const,
          messageId: 'assistant-2',
          role: 'assistant' as const,
          text: 'second'
        }
      }
    }

    const busy = agentBoxProjectionMessages(projection, true)
    const idle = agentBoxProjectionMessages(projection, false)

    expect(busy.map(message => message.pending)).toEqual([false, true])
    expect(idle.map(message => message.pending)).toEqual([false, false])
  })
})

describe('AgentBox workspace registration notice', () => {
  const copy = { opening: 'Registering this workspace with the service…', unavailable: 'Not registered:' }

  it('shows a wait while the registration is in flight', () => {
    expect(registrationReason({ status: 'opening' }, copy, 'unavailable')).toBe(copy.opening)
  })

  it('reports the service reason when the registration cannot be made', () => {
    expect(registrationReason({ detail: 'NOT_IMPLEMENTED', status: 'unavailable' }, copy, 'unavailable')).toBe(
      'Not registered: NOT_IMPLEMENTED'
    )
  })

  it('falls back to the neutral copy when there is no location to register', () => {
    expect(registrationReason({ status: 'idle' }, copy, 'unavailable')).toBe('unavailable')
  })
})
