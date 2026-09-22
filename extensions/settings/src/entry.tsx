import type { PluginContext } from '@ordessa/extension-api'
import { CommandsToken, WorkbenchToken, SettingsToken, type Commands, type Workbench } from '@extensions/ordessa.contracts/contract.js'
import { createSettings } from './model'
import { SettingsPage } from './page'
export default function createPlugin() {
  return { id: 'ordessa.settings', autoStart: true, provides: SettingsToken, requires: [CommandsToken, WorkbenchToken],
    activate(context: PluginContext, commands: Commands, workbench: Workbench) {
      const model = createSettings(context.resources), views = workbench.forScope(context.resources)
      views.addView({ id: 'ordessa.settings.page', title: '设置', presentation: 'full-page', component: () => <SettingsPage model={model} /> })
      commands.forScope(context.resources).add({ id: 'ordessa.settings.open', title: '设置', execute: () => workbench.open('ordessa.settings.page') })
      views.addUI({ id: 'ordessa.settings.entry', kind: 'command', slot: 'navigation', command: 'ordessa.settings.open', order: 1000 })
      return model.service
    },
  }
}
