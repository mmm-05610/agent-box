import { atom } from 'nanostores'

import { emptyWireSessionProjection, type WireSessionProjection } from '@/application/session/wire-session-projection'
import type { QueueItem, WireId } from '@/types/wire/wire-v1'

export interface AgentBoxStopState {
  detail: null | string
  phase: 'idle' | 'requesting' | 'stopping' | 'unconfirmed'
}

export const $agentBoxSessionProjections = atom<Record<string, WireSessionProjection>>({})
export const $agentBoxQueues = atom<Record<string, QueueItem[]>>({})
export const $agentBoxStopStates = atom<Record<string, AgentBoxStopState>>({})

export function agentBoxSessionProjection(sessionId: WireId): WireSessionProjection {
  return $agentBoxSessionProjections.get()[sessionId] ?? emptyWireSessionProjection(sessionId)
}

export function setAgentBoxSessionProjection(sessionId: WireId, projection: WireSessionProjection): void {
  $agentBoxSessionProjections.set({ ...$agentBoxSessionProjections.get(), [sessionId]: projection })
}

export function setAgentBoxQueue(sessionId: WireId, items: QueueItem[]): void {
  $agentBoxQueues.set({ ...$agentBoxQueues.get(), [sessionId]: items })
}

export function setAgentBoxStopState(sessionId: WireId, state: AgentBoxStopState): void {
  $agentBoxStopStates.set({ ...$agentBoxStopStates.get(), [sessionId]: state })
}
