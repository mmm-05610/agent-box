import type { PluginContext } from '@ordessa/extension-api'
import { WorkbenchToken, type Workbench } from '@extensions/ordessa.contracts/contract.js'
import { AgentSessionsToken, type AgentSessions } from '@extensions/ordessa.agent-contracts/contract.js'
import { Conversation } from './view'

export default function createPlugin() {
  return { id: 'ordessa.agent-conversation', autoStart: true, requires: [WorkbenchToken, AgentSessionsToken],
    activate(context: PluginContext, workbench: Workbench, sessions: AgentSessions) {
      const ui = workbench.forScope(context.resources)
      ui.addView({ id: 'agent.conversation', title: 'Conversation', presentation: 'region', region: 'main', component: () => <Conversation service={sessions} /> })
    },
  }
}
