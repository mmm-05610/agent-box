import { atom } from 'nanostores'

import type { ConfigDescriptor, ProfileRecord, ServerHelloResult, SessionRecord } from '@/types/wire/wire-v1'

export type AgentBoxServicePhase = 'idle' | 'loading' | 'ready' | 'unavailable'

export interface AgentBoxServiceState {
  detail: null | string
  phase: AgentBoxServicePhase
}

export interface DraftConfigState {
  descriptor: ConfigDescriptor | null
  detail: null | string
  profileId: string
  status: 'loading' | 'ready' | 'unavailable'
}

export const $agentBoxService = atom<AgentBoxServiceState>({ detail: null, phase: 'idle' })
export const $agentBoxHello = atom<ServerHelloResult | null>(null)
export const $agentBoxProfiles = atom<ProfileRecord[]>([])
export const $agentBoxSessions = atom<Record<string, SessionRecord>>({})
export const $draftConfigStates = atom<Record<string, DraftConfigState>>({})

export function setDraftConfigState(scope: string, state: DraftConfigState): void {
  $draftConfigStates.set({ ...$draftConfigStates.get(), [scope]: state })
}

export function upsertAgentBoxSession(session: SessionRecord): void {
  $agentBoxSessions.set({ ...$agentBoxSessions.get(), [session.id]: session })
}
