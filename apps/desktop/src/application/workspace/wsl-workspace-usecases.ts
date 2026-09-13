/**
 * application/workspace/wsl-workspace-usecases.ts — save / reconnect /
 * refresh use-cases over the narrow WorkspaceHostPort (work order 35).
 *
 * Rules this module enforces:
 * - Persistence happens only through the host's save (which re-verifies the
 *   directory and is idempotent by request id); the renderer never invents
 *   workspace rows.
 * - A failed save changes nothing: the caller keeps its selection for retry.
 * - A failed refresh NEVER clears the projection — an empty list is not a
 *   truthful rendering of "the host did not answer".
 * - Reconnect re-verifies; the projection moves to 'validating' only while
 *   the verify is in flight and lands on the freshest outcome.
 */

import {
  listWslWorkspaces,
  reconnectWslWorkspace,
  releaseWslConnection,
  saveWslWorkspace
} from '@/api/workspace'
import {
  $wslWorkspaceValidation,
  setWslWorkspaces,
  setWslWorkspaceValidation,
  upsertWslWorkspace,
  type WslWorkspaceValidationState
} from '@/store/wsl-workspace'
import type {
  WslFailure,
  WslWorkspaceErrorCode,
  WslWorkspaceRecord
} from '@/types/workspace'

/** New idempotency key per save attempt (the host dedupes replays AND the
 *  same location re-added under a new key). */
export function createWslSaveRequestId(): string {
  return `wsl_save_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export interface WslRefreshOutcome {
  ok: boolean
  code?: WslWorkspaceErrorCode
}

export async function refreshWslWorkspaces(): Promise<WslRefreshOutcome> {
  const result = await listWslWorkspaces()

  if (result.ok) {
    setWslWorkspaces(result.workspaces)

    return { ok: true }
  }

  // A host failure keeps the current projection: an unanswered host is not
  // an empty workspace list. The caller surfaces the typed code.
  return { ok: false, code: result.code }
}

export type WslSaveOutcome = { ok: true; workspace: WslWorkspaceRecord } | WslFailure

export async function saveWslWorkspaceFromWizard(input: {
  connectionId: string
  name?: string
  path: string
}): Promise<WslSaveOutcome> {
  const result = await saveWslWorkspace({
    connectionId: input.connectionId,
    name: input.name,
    path: input.path,
    requestId: createWslSaveRequestId()
  })

  if (!result.ok) {
    return result
  }

  upsertWslWorkspace(result.workspace)
  setWslWorkspaceValidation(result.workspace.id, { status: 'unverified' })

  return { ok: true, workspace: result.workspace }
}

/** Best-effort temp-connection release when the wizard closes or finishes. */
export async function releaseWizardConnection(connectionId: null | string): Promise<void> {
  if (!connectionId) {
    return
  }

  try {
    await releaseWslConnection(connectionId)
  } catch {
    // The temporary connection expires on its own; nothing to surface.
  }
}

export type WslReconnectOutcome =
  | { ok: true; status: 'connected'; userChanged: boolean; actualUser: string }
  | { ok: true; status: 'failed'; message: string }
  | WslFailure

export async function reconnectWslWorkspaceProjection(workspaceId: string): Promise<WslReconnectOutcome> {
  setWslWorkspaceValidation(workspaceId, { status: 'validating' })

  const result = await reconnectWslWorkspace(workspaceId)

  if (result.ok && result.status === 'connected') {
    setWslWorkspaceValidation(workspaceId, {
      status: 'validated',
      actualUser: result.actualUser,
      userChanged: result.userChanged,
      verifiedAt: Date.now()
    })

    return { ok: true, status: 'connected', userChanged: result.userChanged, actualUser: result.actualUser }
  }

  // Either an explicit failed outcome or a transport failure: both are a
  // failed revalidation carrying a typed code and safe copy.
  const code = result.ok ? result.code : result.code
  const message = result.ok ? result.message : result.message

  setWslWorkspaceValidation(workspaceId, { status: 'failed', code, message, verifiedAt: Date.now() })

  return { ok: true, status: 'failed', message }
}

/** Reopen: the saved list is shown immediately, but every record is a stale
 *  fact until re-verified — reset any 'validated' states to 'unverified'. */
export function resetWslValidationsOnStartup(): void {
  const current = $wslWorkspaceValidation.get()
  const next: Record<string, WslWorkspaceValidationState> = {}

  for (const [id, state] of Object.entries(current)) {
    next[id] = state.status === 'validated' ? { status: 'unverified' } : state
  }

  $wslWorkspaceValidation.set(next)
}
