import type { ResourceDef } from '..'
import { ProviderList } from './ProviderList'
import { ProviderForm } from './ProviderForm'

export const providerResource: ResourceDef = {
  key: 'provider',
  labelKey: 'resource.provider',
  List: ProviderList,
  Editor: ProviderForm,
}
