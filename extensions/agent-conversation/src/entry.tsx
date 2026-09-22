import type { PluginContext } from '@ordessa/extension-api'
import { CommandsToken, WorkbenchToken, type Commands, type Workbench } from '@extensions/ordessa.contracts/contract.js'
import { AgentSessionsToken, type AgentSessions } from '@extensions/ordessa.agent-contracts/contract.js'
import { Conversation, SessionBrowser } from './view'

export default function createPlugin() {
  return { id: 'ordessa.agent-conversation', autoStart: true, requires: [CommandsToken, WorkbenchToken, AgentSessionsToken],
    activate(context: PluginContext, commands: Commands, workbench: Workbench, sessions: AgentSessions) {
      const ui = workbench.forScope(context.resources)
      ui.addView({ id: 'agent.sessions', title: 'Sessions', presentation: 'region', region: 'left', component: () => <SessionBrowser service={sessions} /> })
      ui.addView({ id: 'agent.conversation', title: 'Conversation', presentation: 'region', region: 'main', component: () => <Conversation service={sessions} /> })
      commands.forScope(context.resources).add({ id: 'agent.open', title: 'Agents', execute: () => {
        workbench.open('agent.sessions'); workbench.open('agent.conversation')
      } })
      ui.addUI({ id: 'agent.navigation', kind: 'command', slot: 'navigation', command: 'agent.open', label: 'Agents', icon: () => <span aria-hidden="true">◎</span> })
    },
  }
}
