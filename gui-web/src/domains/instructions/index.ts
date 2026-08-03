import type { ResourceDef } from '..'
import { InstructionsList } from './List'

export const instructionsResource: ResourceDef = {
  key: 'instructions',
  labelKey: 'tab.instructions',
  List: InstructionsList,
}
