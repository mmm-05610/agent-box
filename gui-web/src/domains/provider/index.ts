import type { ComponentType } from 'react'
import type { ResourceDef } from '..'

// TODO(stage 3): migrate the real list component from pages/detail/ProviderTab.
const PlaceholderList: ComponentType<any> = () => null

export const providerResource: ResourceDef = {
  key: 'provider',
  labelKey: 'resource.provider',
  List: PlaceholderList,
}
