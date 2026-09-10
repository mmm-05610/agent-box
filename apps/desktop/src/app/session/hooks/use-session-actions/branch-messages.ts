import { type ChatMessage, chatMessageText } from '@/lib/chat-messages'
import { textWithoutEmbeddedImages } from '@/lib/embedded-images'

/** Derive the message spine that seeds a branch, from the local or the
 *  authoritative transcript. */
export interface BranchMessage {
  content: string
  role: ChatMessage['role']
  source: ChatMessage
}

// The copyable spine of a branch: user/assistant turns that carry text.
export const toBranchMessages = (messages: ChatMessage[]): BranchMessage[] =>
  messages
    .map(message => ({ content: chatMessageText(message), role: message.role, source: message }))
    .filter(({ content, role }) => content.trim() && (role === 'assistant' || role === 'user'))

/**
 * Choose the transcript used to seed an open-chat branch.
 *
 * The local renderer can hold a compacted model projection, while the REST
 * transcript contains the complete display projection. Use the latter for a
 * whole-chat branch. When branching from a clicked bubble, map that bubble by
 * durable row id first and by same-role/text ordinal as a legacy fallback; if
 * it cannot be mapped, keep the local prefix rather than silently choosing a
 * different point in the conversation.
 */
export function selectBranchMessages(
  localMessages: ChatMessage[],
  authoritativeMessages: ChatMessage[] | null,
  messageId?: string
): BranchMessage[] {
  const localIndex = messageId ? localMessages.findIndex(message => message.id === messageId) : -1

  if (!authoritativeMessages?.length) {
    return toBranchMessages(localMessages.slice(0, localIndex >= 0 ? localIndex + 1 : localMessages.length))
  }

  if (!messageId) {
    return toBranchMessages(authoritativeMessages)
  }

  if (localIndex < 0) {
    return toBranchMessages(localMessages)
  }

  const target = localMessages[localIndex]

  let authoritativeIndex =
    target.rowId === undefined
      ? -1
      : authoritativeMessages.findIndex(message => message.rowId !== undefined && message.rowId === target.rowId)

  // Strip `@image:` directive lines the same way the persisted→ChatMessage
  // conversion does (extractImageRefs lifts them into attachmentRefs), so a
  // local optimistic bubble and its authoritative twin compare equal.
  const comparableText = (message: ChatMessage) =>
    textWithoutEmbeddedImages(chatMessageText(message))
      .replace(/^@image:[^\n]*\n?/gm, '')
      .trim()

  if (authoritativeIndex < 0) {
    const targetText = comparableText(target)

    const targetOrdinal = localMessages
      .slice(0, localIndex + 1)
      .filter(message => message.role === target.role && comparableText(message) === targetText).length

    let ordinal = 0

    authoritativeIndex = authoritativeMessages.findIndex(message => {
      if (message.role !== target.role || comparableText(message) !== targetText) {
        return false
      }

      ordinal += 1

      return ordinal === targetOrdinal
    })
  }

  if (authoritativeIndex < 0) {
    return toBranchMessages(localMessages.slice(0, localIndex + 1))
  }

  return toBranchMessages(authoritativeMessages.slice(0, authoritativeIndex + 1))
}
