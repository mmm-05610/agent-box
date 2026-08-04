import type { ResourceDef } from '..'
import { PermissionsList } from './List'

export const permissionsResource: ResourceDef = {
  key: 'permissions',
  labelKey: 'tab.permissions',
  List: PermissionsList,
}
