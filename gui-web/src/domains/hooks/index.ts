import type { ResourceDef } from '..'
import { HookList } from './HookList'

export const hookResource: ResourceDef = {
  key: 'hooks',
  labelKey: 'resource.hook',
  List: HookList,
}
