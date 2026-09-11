import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@/lib/chat-messages/types'

import { lastVisibleMessageIsUser } from './message-tail'

function message(id: string, role: ChatMessage['role'], hidden = false): ChatMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', text: `${role}:${id}` }],
    hidden
  }
}

describe('lastVisibleMessageIsUser', () => {
  it('looks past hidden messages to the last VISIBLE role', () => {
    const messages = [message('u1', 'user'), message('a1', 'assistant', true)]

    expect(lastVisibleMessageIsUser(messages)).toBe(true)
  })

  it('is false once the visible tail is the assistant’s', () => {
    const messages = [message('u1', 'user'), message('a1', 'assistant')]

    expect(lastVisibleMessageIsUser(messages)).toBe(false)
  })

  it('is false for an empty transcript', () => {
    expect(lastVisibleMessageIsUser([])).toBe(false)
  })

  it('is false when every message is hidden', () => {
    expect(lastVisibleMessageIsUser([message('u1', 'user', true)])).toBe(false)
  })
})
