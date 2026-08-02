import type { ComponentType } from 'react'
import type { ResourceDef } from '..'

// TODO(stage 3): migrate the real list component from pages/detail/HooksEditor.
const PlaceholderList: ComponentType<any> = () => null

export const hookResource: ResourceDef = {
  key: 'hook',
  labelKey: 'resource.hook',
  List: PlaceholderList,
}
