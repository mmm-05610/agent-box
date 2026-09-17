// @vitest-environment jsdom
//
// The product transcript's process view, rendered through the exact product
// path: wire projection → agentBoxProjectionMessages → the real message
// repository and runtime → the real Thread. These tests pin what the process
// view may show with TODAY's wire facts (text, tool.update) and what it must
// never show without them (a thinking row, an invented result).
import { AssistantRuntimeProvider, type ThreadMessage } from '@assistant-ui/react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { emptyWireSessionProjection, type WireSessionProjection } from '@/application/session/wire-session-projection'
import { Thread } from '@/components/assistant-ui/thread'
import { stubThreadEnvironment, stubThreadViewportSize } from '@/components/assistant-ui/test-utils'
import { agentBoxProjectionMessages } from '@/features/chat/agentbox-chat-view'
import { useRuntimeMessageRepository } from '@/features/chat/runtime-repository'
import type { ChatMessage } from '@/lib/chat-messages'
import { useIncrementalExternalStoreRuntime } from '@/lib/incremental-external-store-runtime'
import { asWireId, type WireEvent } from '@/types/wire/wire-v1'

stubThreadEnvironment()
stubThreadViewportSize()

afterEach(cleanup)

function ProductTranscript({ busy, messages }: { busy: boolean; messages: ChatMessage[] }) {
  const repository = useRuntimeMessageRepository(messages)
  const runtime = useIncrementalExternalStoreRuntime<ThreadMessage>({
    isRunning: busy,
    messageRepository: repository,
    onCancel: async () => undefined,
    onEdit: async () => undefined,
    onNew: async () => undefined,
    onReload: async () => undefined,
    setMessages: () => undefined
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  )
}

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

const projectionWith = (
  messages: WireSessionProjection['messages'],
  tools: WireSessionProjection['tools'] = {}
): WireSessionProjection => ({
  ...emptyWireSessionProjection('session-1'),
  messageOrder: Object.keys(messages),
  messages,
  tools
})

describe('AgentBox process view', () => {
  it('renders a failed tool call through the existing tool row, in the service own words', async () => {
    const projection = projectionWith(
      {
        'assistant-1': {
          displayKind: 'visible',
          messageId: 'assistant-1',
          role: 'assistant',
          text: 'Ran the check'
        }
      },
      { 'tool-1': toolUpdate({ state: 'failed', summary: 'exit 1', resultExcerpt: 'bash: no such file' }) }
    )

    const { container } = render(
      <ProductTranscript busy={false} messages={agentBoxProjectionMessages(projection, false)} />
    )

    expect(await screen.findByText('Ran the check')).toBeTruthy()
    expect(container.querySelector('[data-slot="tool-block"]')).toBeTruthy()
    // A failed call must paint AS a failure: the row carries the error status
    // glyph, and the service's own words are one expansion away (the existing
    // failure-row semantics: failures are visible, their detail is not forced
    // open — the same as a legacy failed call).
    expect(await screen.findByLabelText('Error')).toBeTruthy()

    // The reason is reachable: the row expands to the service's own words.
    fireEvent.click(screen.getByRole('button', { name: /Ran command/ }))

    expect(await screen.findByText(/exit 1/)).toBeTruthy()
    expect(await screen.findByText(/bash: no such file/)).toBeTruthy()
  })

  it('renders no thinking row: there is no reasoning event on the wire', async () => {
    const projection = projectionWith({
      'assistant-1': {
        displayKind: 'visible',
        messageId: 'assistant-1',
        role: 'assistant',
        text: 'Answer'
      }
    })

    const { container } = render(
      <ProductTranscript busy={false} messages={agentBoxProjectionMessages(projection, false)} />
    )

    await screen.findByText('Answer')

    expect(container.querySelector('[data-slot="aui_thinking-disclosure"]')).toBeNull()
    expect(container.querySelector('[data-slot="aui_thinking-body"]')).toBeNull()
  })

  it('shows the in-flight status tail while the service turn is still running', async () => {
    const projection = projectionWith({
      'assistant-1': { displayKind: 'visible', messageId: 'assistant-1', role: 'assistant', text: '' }
    })

    const { container } = render(
      <ProductTranscript busy={true} messages={agentBoxProjectionMessages(projection, true)} />
    )

    expect(container.querySelector('[data-slot="aui_response-loading"]')).toBeTruthy()
  })

  it('shows no status tail once the turn is settled', async () => {
    const projection = projectionWith({
      'assistant-1': { displayKind: 'visible', messageId: 'assistant-1', role: 'assistant', text: 'Done' }
    })

    const { container } = render(
      <ProductTranscript busy={false} messages={agentBoxProjectionMessages(projection, false)} />
    )

    await screen.findByText('Done')

    expect(container.querySelector('[data-slot="aui_response-loading"]')).toBeNull()
    expect(container.querySelector('[data-slot="aui_turn-activity"]')).toBeNull()
  })
})
