import { capabilityScoped } from '@/api/client'
import { completeMcpDesktopOAuth } from '@/application/mcp-oauth'
import { onGatewayEvent } from '@/extension/contrib/events'
import { getLogs, getStatus, hermesApi, type HermesGateway } from '@/hermes'
import { $gateway, requestGatewayForAgent } from '@/store/gateway'
import { notify, notifyError } from '@/store/notifications'
import { runGatewayRestart } from '@/store/system-actions'
import type { PaginatedSessions } from '@/types/hermes'

import type { PluginProfileRoute } from './host-routing'

/** System doors: logs, MCP OAuth, navigation, events, gateway status and
 *  the ambient request facade. */
export const hostSystem = {
  notify,
  notifyError,

  /** Tail an app log file (`agent` / `errors` / `gateway` / `gui` / …). */
  logs: async (...args: Parameters<typeof getLogs>) => getLogs(...args),


  /** Complete client-local MCP sign-in for a pinned bot profile, optionally
   *  installing its catalog entry first. Uses the same OAuth flow as Settings. */
  completeMcpOAuth: async (options: Parameters<typeof completeMcpDesktopOAuth>[0] & { catalogPreset?: string }) => {
    const profile = capabilityScoped(options.profile)

    if (options.catalogPreset) {
      const added = await requestGatewayForAgent<{ ok?: boolean; error?: string }>(
        profile.connectionId ?? null,
        profile.profile || 'default',
        'mcp.servers.add',
        { name: options.serverName, preset: options.catalogPreset }
      )

      if (!added.ok) {
        throw new Error(added.error || 'Could not add server')
      }
    }

    return completeMcpDesktopOAuth({ ...options, profile })
  },


  /** Navigate the app router (hash routes, e.g. '/command-center?section=system'). */
  navigate: (path: string) => {
    window.location.hash = path.startsWith('#') ? path : `#${path}`
  },


  /** HEAR the gateway stream (message deltas, session lifecycle, tool
   *  activity, …) by event type — `'*'` for everything. Returns a disposer.
   *  Listeners are isolated; a throw can't affect app dispatch. */
  onEvent: onGatewayEvent,


  /** Restart the backend gateway (progress surfaces in the core statusbar). */
  restartGateway: async () => runGatewayRestart(),


  /** One-shot system status snapshot (platforms, versions, …). */
  status: async () => getStatus(),


  /** Read persisted sessions from a profile's owning source without dialing
   *  that profile's gateway. The source primary opens state.db directly. */
  listPersistedSessions: async (
    route: PluginProfileRoute | null,
    options: { profile: string; limit?: number }
  ): Promise<PaginatedSessions> => {
    if (route && (!route.connectionId.trim() || !route.profile.trim() || !route.targetProfile.trim())) {
      throw new Error('Profile route must include connectionId, profile, and targetProfile')
    }

    const profile = options.profile.trim()

    if (!profile) {
      throw new Error('Persisted session reads require a profile')
    }

    const limit = Math.min(500, Math.max(0, options.limit ?? 200))

    const query = new URLSearchParams({
      limit: String(limit),
      offset: '0',
      min_messages: '0',
      archived: 'exclude',
      order: 'created',
      profile
    })

    return hermesApi<PaginatedSessions>({
      ...(route ? { connectionId: route.connectionId } : {}),
      path: `/api/profiles/sessions?${query.toString()}`,
      timeoutMs: 60_000
    })
  },


  /** Mutate the durable hidden flag through the source primary. Keeping the
   *  owner profile in the body (not request.profile) prevents Electron from
   *  starting a profile backend merely to reconcile persisted visibility. */
  setPersistedSessionHidden: async (
    route: PluginProfileRoute | null,
    options: { sessionId: string; profile: string; hidden: boolean }
  ): Promise<{ ok: boolean; hidden: boolean }> => {
    if (route && (!route.connectionId.trim() || !route.profile.trim() || !route.targetProfile.trim())) {
      throw new Error('Profile route must include connectionId, profile, and targetProfile')
    }

    const profile = options.profile.trim()

    if (!profile || !options.sessionId.trim()) {
      throw new Error('Persisted session updates require a profile and session id')
    }

    return hermesApi<{ ok: boolean; hidden: boolean }>({
      ...(route ? { connectionId: route.connectionId } : {}),
      path: `/api/sessions/${encodeURIComponent(options.sessionId)}`,
      method: 'PATCH',
      body: { hidden: options.hidden, profile }
    })
  },


  /** Gateway JSON-RPC — sessions, config, skills, cron, kanban, everything
   *  the app itself uses. Lazy: resolves the LIVE socket per call. */
  request: async <T>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
    const gateway = $gateway.get()

    if (!gateway) {
      throw new Error('Hermes gateway unavailable')
    }

    return gateway.request<T>(method, params)
  },


  /** The LIVE gateway instance for the active profile (null before the first
   *  socket opens). Most plugins want `host.request`; this exists for SDK
   *  components that take a `HermesGateway` prop directly (e.g. `McpTab`),
   *  which need the instance, not just a JSON-RPC door. Re-read per use — the
   *  active instance changes on a profile swap. */
  getGateway: (): HermesGateway | null => $gateway.get()

}
