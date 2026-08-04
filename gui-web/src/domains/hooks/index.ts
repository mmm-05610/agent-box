import type { ResourceDef } from '..'
import { HookList } from './List'

export const hookResource: ResourceDef = {
  key: 'hooks',
  labelKey: 'resource.hook',
  List: HookList,
}
