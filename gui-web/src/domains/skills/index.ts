import type { ComponentType } from 'react'
import type { ResourceDef } from '..'

// TODO(stage 3): migrate the real list component from pages/detail/SkillsTab.
const PlaceholderList: ComponentType<any> = () => null

export const skillResource: ResourceDef = {
  key: 'skill',
  labelKey: 'resource.skill',
  List: PlaceholderList,
}
