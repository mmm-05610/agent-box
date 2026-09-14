import { describe, expect, it } from 'vitest'

import { emptyWireSessionProjection } from '@/application/session/wire-session-projection'
import { asWireId } from '@/types/wire/wire-v1'

import { agentBoxProjectionMessages } from './agentbox-chat-view'

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
