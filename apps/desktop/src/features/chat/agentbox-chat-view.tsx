import { AssistantRuntimeProvider, type ThreadMessage } from '@assistant-ui/react'
import { type ReactNode, Suspense, useMemo } from 'react'

import { useAgentBoxMainChat } from '@/app/composition/wiring/agentbox-main-chat'
import type { WireSessionProjection } from '@/application/session/wire-session-projection'
import { Thread } from '@/components/assistant-ui/thread'
import { TranscriptWindowProvider } from '@/components/assistant-ui/thread/transcript-window'
import { Backdrop } from '@/components/Backdrop'
import { useRuntimeMessageRepository } from '@/features/chat/runtime-repository'
import { useI18n } from '@/i18n'
import { type ChatMessage, type ChatMessagePart, textPart } from '@/lib/chat-messages'
import type { ChatBarState } from '@/lib/composer/types'
import { useIncrementalExternalStoreRuntime } from '@/lib/incremental-external-store-runtime'
import { titlebarHeaderBaseClass, titlebarHeaderTitleClass } from '@/lib/titlebar'

import { AgentBoxEmptyState } from './agentbox-empty-state'
import { ChatBar, ChatBarFallback } from './composer'
import { AgentBoxApprovalPanel } from './composer/agentbox-approval-panel'
import { AgentBoxQueuePanel } from './composer/agentbox-queue-panel'
import { useComposerProfile } from './composer/hooks/use-composer-profile'

export function agentBoxProjectionMessages(
  projection: WireSessionProjection | undefined,
  busy: boolean
): ChatMessage[] {
  if (!projection) {
    return []
  }

  const messages = projection.messageOrder.flatMap(messageId => {
    const message = projection.messages[messageId]

    if (!message) {
      return []
    }

    return [
      {
        hidden: message.displayKind === 'hidden',
        id: message.messageId,
        parts: [textPart(message.text)],
        pending:
          message.role === 'assistant' &&
          busy &&
          projection.messageOrder.at(-1) === message.messageId,
        role: message.role
      }
    ]
  })

  const byId = new Map(messages.map(message => [message.id, message]))

  for (const tool of Object.values(projection.tools)) {
    const failed = tool.state === 'failed' || tool.state === 'denied'
    const terminal = failed || tool.state === 'completed'

    const result = terminal
      ? tool.state === 'completed'
        ? { result: tool.resultExcerpt ?? null, summary: tool.summary ?? null }
        : {
            // The service's reason and its presentable excerpt are both the
            // failure's text; joined here so the row can show them even when
            // there is no stream output to expand into.
            error: [tool.summary ?? tool.state, tool.resultExcerpt].filter(Boolean).join('\n\n'),
            result: tool.resultExcerpt ?? null
          }
      : undefined

    const part = {
      args: {},
      ...(result ? { result } : {}),
      // A failed call is a FAILURE, not a completed activity: without this the
      // row paints as a successful run and the service's own failure text is
      // never shown (the reason the excerpt/summary are carried at all).
      ...(failed ? { isError: true } : {}),
      toolCallId: tool.toolCallId,
      toolName: tool.tool ?? 'tool',
      type: 'tool-call'
    } as ChatMessagePart

    const target = tool.messageId ? byId.get(tool.messageId) : undefined

    if (target) {
      target.parts = [...target.parts, part]
    } else {
      messages.push({
        hidden: false,
        id: `tool:${tool.toolCallId}`,
        parts: [part],
        pending: !terminal,
        role: 'assistant'
      })
    }
  }

  return messages
}

/**
 * Why the composer cannot send yet while the service Workspace is the gate:
 * an in-flight registration is a wait, a failed one reports the service's own
 * reason, and a row with no location at all falls back to the neutral
 * unavailable copy. The service record is the only source of connection facts,
 * so nothing here claims a workspace is verified.
 */
export function registrationReason(
  open: ReturnType<typeof useAgentBoxMainChat>['workspaceOpen'],
  copy: { opening: string; unavailable: string },
  fallback: string
): string {
  if (open.status === 'opening') {
    return copy.opening
  }

  return open.status === 'unavailable' ? `${copy.unavailable} ${open.detail}` : fallback
}

function AgentBoxThreadRuntime({
  binding,
  children,
  messages
}: {
  binding: ReturnType<typeof useAgentBoxMainChat>
  children: ReactNode
  messages: ChatMessage[]
}) {
  const repository = useRuntimeMessageRepository(messages)

  const runtime = useIncrementalExternalStoreRuntime<ThreadMessage>({
    isRunning: binding.busy,
    messageRepository: repository,
    onCancel: binding.onCancel,
    onEdit: async () => undefined,
    onNew: async () => undefined,
    onReload: async () => undefined,
    setMessages: () => undefined
  })

  const transcriptWindow = useMemo(
    () => ({ expandWindow: () => undefined, olderAvailable: false }),
    []
  )

  return (
    <TranscriptWindowProvider value={transcriptWindow}>
      <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
    </TranscriptWindowProvider>
  )
}

/** Primary product chat. It reuses the established Thread and Composer visual
 * surfaces while replacing their business authority with AgentBox wire state. */
export function AgentBoxChatView({ maxVoiceRecordingSeconds }: { maxVoiceRecordingSeconds?: number }) {
  const { t } = useI18n()
  const binding = useAgentBoxMainChat()
  const messages = agentBoxProjectionMessages(binding.projection, binding.busy)

  const composerProfile = useComposerProfile({
    draftScope: binding.draftScopeKey,
    sessionId: binding.sessionId,
    workspaceId: binding.workspace?.id ?? null
  })

  const chatBarState = useMemo<ChatBarState>(
    () => ({
      model: { canSwitch: false, hidden: true, loading: !binding.catalogReady, model: '', provider: '' },
      profile: composerProfile,
      queue: { authority: 'server' },
      tools: { enabled: false, label: t.composer.attach },
      voice: { active: false, enabled: false }
    }),
    [binding.catalogReady, composerProfile, t.composer.attach]
  )

  const unavailableReason =
    binding.service.phase === 'unavailable'
      ? binding.service.detail || t.composer.serviceUnreachable
      : binding.catalogReady && !binding.workspace
        ? registrationReason(
            binding.workspaceOpen,
            { opening: t.composer.workspaceOpening, unavailable: t.composer.workspaceUnavailable },
            t.composer.workspaceMissing
          )
        : binding.catalogReady && !binding.session && !binding.profileId
          ? t.composer.profileRequired
          : null

  return (
    <div
      className="relative isolate flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)"
      data-agentbox-chat=""
      data-agentbox-service-phase={binding.service.phase}
    >
      <Backdrop />
      {(binding.session || binding.workspace) && (
        <header className={titlebarHeaderBaseClass}>
          <div className={titlebarHeaderTitleClass}>{binding.session?.displayName ?? binding.workspace?.displayName}</div>
        </header>
      )}

      <AgentBoxThreadRuntime binding={binding} messages={messages}>
        <div className="relative min-h-0 flex-1 overflow-hidden bg-(--ui-chat-surface-background)" data-slot="composer-bounds">
          <Thread
            clampToComposer
            cwd={binding.workspace?.normalizedPath ?? null}
            emptyState={
              messages.length === 0 ? (
                /* P14: the draft screen is the product's own — brand, one
                   greeting, and starters only while a send is possible. The
                   composer below is the same one, not a second input. */
                <AgentBoxEmptyState
                  canSend={binding.sendAvailable}
                  onPick={text => void binding.onSubmit(text)}
                  waiting={binding.service.phase !== 'ready'}
                />
              ) : undefined
            }
            gateway={null}
            onCancel={binding.onCancel}
            sessionId={binding.sessionId}
            sessionKey={binding.sessionId ?? binding.draftScopeKey}
          />
          {unavailableReason && (
            <div
              className="pointer-events-none absolute inset-x-0 top-4 z-10 mx-auto w-fit max-w-[min(32rem,calc(100%-2rem))] rounded-lg border border-(--ui-border) bg-(--ui-panel-background)/90 px-3 py-2 text-center text-xs text-(--ui-text-secondary) shadow-sm"
              data-agentbox-unavailable=""
            >
              {unavailableReason}
            </div>
          )}
        </div>
        <Suspense fallback={<ChatBarFallback />}>
          <ChatBar
            busy={binding.busy}
            cwd={binding.workspace?.normalizedPath ?? null}
            disabled={!binding.sendAvailable}
            draftScopeKey={binding.draftScopeKey}
            focusKey={binding.sessionId ?? binding.workspace?.id ?? null}
            gateway={null}
            maxRecordingSeconds={maxVoiceRecordingSeconds}
            onCancel={binding.onCancel}
            onSubmit={binding.onSubmit}
            queueSessionKey={binding.sessionId}
            runtimeAuthority="agentbox"
            serverQueue={
              binding.sessionId &&
              (binding.queue.length > 0 || Object.keys(binding.projection?.approvals ?? {}).length > 0) ? (
                <div className="grid gap-1.5">
                  <AgentBoxApprovalPanel approvals={Object.values(binding.projection?.approvals ?? {})} />
                  <AgentBoxQueuePanel items={binding.queue} sessionId={binding.sessionId} />
                </div>
              ) : null
            }
            sessionId={binding.sessionId}
            state={chatBarState}
          />
        </Suspense>
      </AgentBoxThreadRuntime>
    </div>
  )
}
