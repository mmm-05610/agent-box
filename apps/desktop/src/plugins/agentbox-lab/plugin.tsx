/**
 * AgentBox Lab — Phase 0 feasibility plugin.
 *
 * Mounts a `/agentbox-lab` page that drives the frozen-protocol AgentBox
 * sidecar through the narrow `src/agentbox/` adapter and renders the result
 * in the EXISTING Hermes transcript components (`components/assistant-ui`).
 * It registers nothing else, touches no core file, and owns no session/turn
 * state: the AgentBox backend stays the sole authority and this page keeps
 * only a display cache that can be rebuilt from `GET .../transcript`.
 *
 * Dev-only fixture discipline: `defaultEnabled` is true only in dev builds;
 * the token lives in component state (never localStorage, never logs), and
 * the lab never touches the production gateway/session stores.
 */

import { type HermesPlugin, type RouteContribution, ROUTES_AREA, SIDEBAR_NAV_AREA, type SidebarNavContribution } from '@hermes/plugin-sdk'

import { AgentBoxLabPage } from './lab'

const plugin: HermesPlugin = {
  id: 'agentbox-lab',
  name: 'AgentBox Lab',
  description: 'Phase 0 probe: render AgentBox sidecar turns in the existing transcript UI.',
  defaultEnabled: import.meta.env.DEV === true,
  register(ctx) {
    ctx.registerMany([
      {
        id: 'page',
        area: ROUTES_AREA,
        data: { path: '/agentbox-lab' } satisfies RouteContribution,
        render: () => <AgentBoxLabPage />
      },
      {
        id: 'nav',
        area: SIDEBAR_NAV_AREA,
        order: 90,
        data: {
          codicon: 'beaker',
          label: 'AgentBox Lab',
          path: '/agentbox-lab'
        } satisfies SidebarNavContribution
      }
    ])
    ctx.onDispose(() => {
      // Contributions are area-scoped and disposed with the context; the lab
      // holds no global resources beyond component state.
    })
  }
}

export default plugin
