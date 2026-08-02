import type { ResourceDef } from '..'
import { HookList } from './HookList'

export const hookResource: ResourceDef = {
  key: 'hook',
  labelKey: 'resource.hook',
  List: HookList,
}
