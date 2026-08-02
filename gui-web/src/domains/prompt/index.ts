import type { ComponentType } from 'react'
import type { ResourceDef } from '..'

// TODO(stage 3): migrate the real list component from pages/detail/PromptTab.
const PlaceholderList: ComponentType<any> = () => null

export const promptResource: ResourceDef = {
  key: 'prompt',
  labelKey: 'resource.prompt',
  List: PlaceholderList,
}
