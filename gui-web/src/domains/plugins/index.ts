import type { ResourceDef } from '..'
import { PluginsList } from './List'

export const pluginsResource: ResourceDef = {
  key: 'plugins',
  labelKey: 'tab.plugins',
  feature: 'plugins',
  List: PluginsList,
}
