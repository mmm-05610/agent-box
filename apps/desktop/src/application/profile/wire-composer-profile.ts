import { wireCapability, type WireV1Client } from '@/api/wire-v1-client'
import {
  $agentBoxHello,
  $agentBoxProfiles,
  $agentBoxService,
  setDraftConfigState,
  upsertAgentBoxSession
} from '@/store/agentbox-service'
import {
  sessionDraftExecutionContext,
  type SessionDraftExecutionContext,
  setSessionDraftExecutionContext
} from '@/store/composer'
import { rememberWorkspaceProfile } from '@/store/workspace-profile-preference'
import {
  asRequestId,
  asWireId,
  type ProfileRecord,
  type SessionRecord,
  type WireMethodName
} from '@/types/wire/wire-v1'

export interface ComposerProfileSelection {
  currentSession: null | SessionRecord
  profileId: string
  scope: string
  workspaceId: null | string
}

let catalogRefresh: Promise<ProfileRecord[]> | null = null

const requestId = () => asRequestId(crypto.randomUUID())

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Refreshes the neutral profile catalog. No legacy gateway/profile fallback. */
export async function refreshAgentBoxProfileCatalog(client: WireV1Client): Promise<ProfileRecord[]> {
  $agentBoxService.set({ detail: null, phase: 'loading' })

  try {
    const hello = await client.hello(['wire.eventStream/1'])
    $agentBoxHello.set(hello)

    const capability = wireCapability(hello, 'profiles.list')

    if (!capability.supported) {
      throw new Error(capability.reason || 'profiles.list is unavailable')
    }

    const result = await client.call('profiles.list', { includeArchived: false })
    $agentBoxProfiles.set(result.items)
    $agentBoxService.set({ detail: null, phase: 'ready' })

    return result.items
  } catch (error) {
    // Keep the last service projection as an offline cache; availability is a
    // separate fact and must not erase server truth already shown to the user.
    $agentBoxService.set({ detail: errorDetail(error), phase: 'unavailable' })
    throw error
  }
}

export function ensureAgentBoxProfileCatalog(client: WireV1Client): Promise<ProfileRecord[]> {
  if ($agentBoxService.get().phase === 'ready') {
    return Promise.resolve($agentBoxProfiles.get())
  }

  catalogRefresh ??= refreshAgentBoxProfileCatalog(client).finally(() => {
    catalogRefresh = null
  })

  return catalogRefresh
}

async function describeDraftConfig(
  client: WireV1Client,
  selection: Pick<ComposerProfileSelection, 'profileId' | 'scope' | 'workspaceId'>
): Promise<void> {
  const { profileId, scope, workspaceId } = selection
  setDraftConfigState(scope, { descriptor: null, detail: null, profileId, status: 'loading' })

  try {
    const result = await client.call('config.describe', {
      profileId: asWireId(profileId),
      workspaceId: workspaceId ? asWireId(workspaceId) : null
    })

    // A later selection owns the scope. Never let this response repaint it.
    if (sessionDraftExecutionContext(scope).profileId !== profileId) {
      return
    }

    setDraftConfigState(scope, { descriptor: result.descriptor, detail: null, profileId, status: 'ready' })
  } catch (error) {
    if (sessionDraftExecutionContext(scope).profileId !== profileId) {
      return
    }

    setDraftConfigState(scope, {
      descriptor: null,
      detail: errorDetail(error),
      profileId,
      status: 'unavailable'
    })
  }
}

/**
 * New draft: local intent only, followed by a read-only config description.
 * Existing Session: paint changes only after sessions.switchProfile confirms.
 */
export async function selectComposerProfile(
  client: WireV1Client,
  selection: ComposerProfileSelection
): Promise<boolean> {
  const { currentSession, profileId, scope, workspaceId } = selection

  if (!currentSession) {
    setSessionDraftExecutionContext(scope, { overrides: [], profileId })

    if (workspaceId) {
      rememberWorkspaceProfile(workspaceId, profileId)
    }

    await describeDraftConfig(client, selection)

    return true
  }

  try {
    const result = await client.call('sessions.switchProfile', {
      expectedVersion: currentSession.version,
      profileId: asWireId(profileId),
      requestId: requestId(),
      sessionId: currentSession.id
    })

    // Both outcomes carry the authoritative Session. Rejection deliberately
    // repaints/keeps that old value rather than the user's unconfirmed click.
    upsertAgentBoxSession(result.session)

    if (result.outcome !== 'confirmed') {
      return false
    }

    setSessionDraftExecutionContext(scope, { overrides: [], profileId })

    if (workspaceId) {
      rememberWorkspaceProfile(workspaceId, profileId)
    }

    await describeDraftConfig(client, selection)

    return true
  } catch {
    return false
  }
}

export function setComposerTemporaryOverrides(scope: string, overrides: SessionDraftExecutionContext['overrides']): void {
  const current = sessionDraftExecutionContext(scope)

  setSessionDraftExecutionContext(scope, { ...current, overrides })
}

export function profileMethodCapability(method: WireMethodName): boolean {
  const hello = $agentBoxHello.get()

  return Boolean(hello && wireCapability(hello, method).supported)
}
