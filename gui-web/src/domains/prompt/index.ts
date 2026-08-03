import type { ResourceDef } from '..'
import { PromptList } from './List'

export const promptResource: ResourceDef = {
  key: 'prompt',
  labelKey: 'resource.prompt',
  List: PromptList,
}
