import type { ResourceDef } from '..'
import { MemoriesList } from './List'

export const memoriesResource: ResourceDef = {
  key: 'memories',
  labelKey: 'tab.memories',
  List: MemoriesList,
}
