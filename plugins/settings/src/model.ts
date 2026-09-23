import type { ResourceScope } from '@ordessa/extension-api'
import type { SettingGroup, Setting, Settings } from '@extensions/ordessa.contracts/contract.js'
import { registry } from '../shared/registry'
export function createSettings(lifetime: ResourceScope) {
  const groups = registry<SettingGroup>(lifetime), items = registry<Setting>(lifetime)
  const service: Settings = { forScope: scope => ({
    addGroup: group => groups.add(scope, group),
    addItem: item => {
      if (!['custom', 'boolean', 'text', 'number', 'enum'].includes(item.kind)) throw Error('Unsupported setting kind')
      return items.add(scope, item)
    },
  }) }
  return { groups, items, service }
}
export type SettingsModel = ReturnType<typeof createSettings>
