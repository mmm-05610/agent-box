import { atom } from 'nanostores'

import type {
  ConfigDescriptor,
  ProfileRecord,
  ServerHelloResult,
  SessionRecord,
  WorkspaceRecord
} from '@/types/wire/wire-v1'

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

export interface AgentBoxCatalogReadiness {
  sessions: boolean
  workspaces: boolean
}

export const $agentBoxService = atom<AgentBoxServiceState>({ detail: null, phase: 'idle' })
export const $agentBoxHello = atom<ServerHelloResult | null>(null)
export const $agentBoxProfiles = atom<ProfileRecord[]>([])
export const $agentBoxWorkspaces = atom<WorkspaceRecord[]>([])
export const $agentBoxSessions = atom<Record<string, SessionRecord>>({})
export const $draftConfigStates = atom<Record<string, DraftConfigState>>({})
export const $agentBoxCatalogReadiness = atom<AgentBoxCatalogReadiness>({ sessions: false, workspaces: false })

export function agentBoxCapabilitySupported(hello: ServerHelloResult | null, capabilityId: string): boolean {
  return hello?.capabilities.some(capability => capability.id === capabilityId && capability.supported) ?? false
}

export function agentBoxQueueControlsAvailable(
  hello: ServerHelloResult | null,
  authority: 'server' | undefined
): boolean {
  return authority === 'server' && agentBoxCapabilitySupported(hello, 'queue')
}

export function setDraftConfigState(scope: string, state: DraftConfigState): void {
  $draftConfigStates.set({ ...$draftConfigStates.get(), [scope]: state })
}

export function upsertAgentBoxSession(session: SessionRecord): void {
  $agentBoxSessions.set({ ...$agentBoxSessions.get(), [session.id]: session })
}

export function upsertAgentBoxProfile(profile: ProfileRecord): void {
  const profiles = $agentBoxProfiles.get()
  const index = profiles.findIndex(candidate => candidate.id === profile.id)

  if (profile.archivedAt) {
    $agentBoxProfiles.set(profiles.filter(candidate => candidate.id !== profile.id))

    return
  }

  if (index < 0) {
    $agentBoxProfiles.set([...profiles, profile])

    return
  }

  const next = [...profiles]
  next[index] = profile
  $agentBoxProfiles.set(next)
}
