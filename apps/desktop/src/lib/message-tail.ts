import type { ChatMessage } from '@/lib/chat-messages/types'

/**
 * The transcript's last VISIBLE role.
 *
 * A pure, dependency-free reading of `ChatMessage[]`, so it can live under
 * `lib/` and be shared by the layers that must not import each other: the
 * session store's `$lastVisibleMessageIsUser` computed and the chat surfaces'
 * loading-state derivations (application/transcript/thread-loading re-exports nothing — both
 * import this module).
 */
export function lastVisibleMessageIsUser(messages: ChatMessage[]): boolean {
  // Allocation-free reverse scan — runs in a hot $messages computed.
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (!messages[i].hidden) {
      return messages[i].role === 'user'
    }
  }

  return false
}
