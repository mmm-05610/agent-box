import type { ResourceDef } from '..'
import { ProviderList } from './ProviderList'

export const providerResource: ResourceDef = {
  key: 'provider',
  labelKey: 'resource.provider',
  List: ProviderList,
}
