import type { PluginContext } from '@ordessa/extension-api'
import { WorkbenchToken, type Workbench } from '@extensions/ordessa.contracts/contract.js'
import { AgentSessionsToken, type AgentSessions } from '@extensions/ordessa.agent-contracts/contract.js'
import { InteractionPanel } from './view'

export default function createPlugin() {
  return { id: 'ordessa.agent-interactions', autoStart: true, requires: [WorkbenchToken, AgentSessionsToken],
    activate(context: PluginContext, workbench: Workbench, sessions: AgentSessions) {
      workbench.forScope(context.resources).addView({ id: 'agent.interactions', title: 'Requests', presentation: 'region', region: 'right',
        component: () => <InteractionPanel service={sessions} /> })
    },
  }
}
