import { type ChatMessage, chatMessageText, completeOpenTimelineParts } from '@/lib/chat-messages'

/** Cancel/stop finalize: drop empty pending/stream placeholders, un-pend the rest. */
export function finalizeInterruptedMessages(
  messages: ChatMessage[],
  streamId?: null | string,
  occurredAt = Date.now() / 1000
): ChatMessage[] {
  return messages
    .filter(
      message =>
        !(
          (message.pending || message.id === streamId) &&
          message.parts.length === 0 &&
          !chatMessageText(message).trim()
        )
    )
    .map(message =>
      message.pending || message.id === streamId
        ? {
            ...message,
            completedAt: occurredAt,
            parts: completeOpenTimelineParts(message.parts, occurredAt),
            pending: false
          }
        : message
    )
}
