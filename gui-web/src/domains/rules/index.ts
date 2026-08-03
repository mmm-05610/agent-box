import type { ResourceDef } from '..'
import { RulesList } from './List'

export const rulesResource: ResourceDef = {
  key: 'rules',
  labelKey: 'tab.rules',
  List: RulesList,
}
