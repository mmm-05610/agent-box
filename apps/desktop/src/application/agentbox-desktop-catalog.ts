import type { WireV1Client } from '@/api/wire-v1-client'
import { ensureAgentBoxProfileCatalog } from '@/application/profile/wire-composer-profile'
import { refreshAgentBoxSessions } from '@/application/session/wire-session-catalog'
import { refreshAgentBoxWorkspaces } from '@/application/workspace/wire-workspace-catalog'
import { $agentBoxCatalogReadiness, $agentBoxService } from '@/store/agentbox-service'

let catalogRefresh: Promise<void> | null = null

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The minimum read model required by the primary AgentBox chat route. */
export function ensureAgentBoxDesktopCatalog(client: WireV1Client): Promise<void> {
  const readiness = $agentBoxCatalogReadiness.get()

  if ($agentBoxService.get().phase === 'ready' && readiness.sessions && readiness.workspaces) {
    return Promise.resolve()
  }

  catalogRefresh ??= (async () => {
    try {
      await ensureAgentBoxProfileCatalog(client)
      const [workspaces] = await Promise.all([refreshAgentBoxWorkspaces(client), refreshAgentBoxSessions(client)])

      $agentBoxCatalogReadiness.set({ sessions: true, workspaces: true })
      // Empty workspaces is a valid authoritative catalog, not unavailability.
      void workspaces
      $agentBoxService.set({ detail: null, phase: 'ready' })
    } catch (error) {
      $agentBoxService.set({ detail: errorDetail(error), phase: 'unavailable' })
      throw error
    }
  })().finally(() => {
    catalogRefresh = null
  })

  return catalogRefresh
}
