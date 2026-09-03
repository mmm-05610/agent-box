"use client"

import { useMemo, type ReactNode } from "react"
import {
  selectTimelineTurns,
  useConversationRuntimeActions,
  useConversationRuntimeStore,
  type ConversationRuntimeContextValue,
} from "@/features/session/model/conversation-runtime-store"

// Re-export the store surface + pure builder + types so existing importers
// (and the test) keep resolving through this module unchanged.
export {
  buildStreamingTurnsFromLiveMessage,
  getConversationIdByExternalIdFromStore,
  getRuntimeSession,
  getTimelineTurns,
  resetConversationRuntimeStore,
  selectTimelineTurns,
  useConversationRuntimeActions,
  useConversationRuntimeStore,
} from "@/features/session/model/conversation-runtime-store"
export type {
  ConversationRuntimeContextValue,
  ConversationRuntimeSession,
  ConversationSyncState,
  ConversationTimelinePhase,
  ConversationTimelineTurn,
  RuntimeActions,
} from "@/features/session/model/conversation-runtime-store"

/**
 * Compatibility shim. Conversation-runtime state now lives in
 * `@/features/session/model/conversation-runtime-store`; this provider is a passthrough and
 * `useConversationRuntime()` reproduces the former merged-value semantics
 * (re-render whenever ANY session changes) so existing consumers work
 * unchanged. Perf-sensitive consumers should instead select their own slice via
 * `useConversationRuntimeStore(...)` + `useConversationRuntimeActions()`.
 */
export function ConversationRuntimeProvider({
  children,
}: {
  children: ReactNode
}) {
  return <>{children}</>
}

export function useConversationRuntime(): ConversationRuntimeContextValue {
  // Subscribe to exactly the two slices whose identity change drove the old
  // context value flip; the memo below rebuilds the api object (with getters
  // closing over the current maps) only when they change. Actions are a single
  // stable reference, so they never trigger a rebuild.
  const byConversationId = useConversationRuntimeStore(
    (s) => s.byConversationId
  )
  const conversationIdByExternalId = useConversationRuntimeStore(
    (s) => s.conversationIdByExternalId
  )
  const actions = useConversationRuntimeActions()
  return useMemo(
    () => ({
      getSession: (conversationId: number) =>
        byConversationId.get(conversationId) ?? null,
      getConversationIdByExternalId: (externalId: string) =>
        conversationIdByExternalId.get(externalId) ?? null,
      getTimelineTurns: (conversationId: number) =>
        selectTimelineTurns(
          { byConversationId, conversationIdByExternalId },
          conversationId
        ),
      ...actions,
    }),
    [byConversationId, conversationIdByExternalId, actions]
  )
}
