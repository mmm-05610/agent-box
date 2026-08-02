import type { ResourceDef } from '..'
import { PromptList } from './PromptList'

export const promptResource: ResourceDef = {
  key: 'prompt',
  labelKey: 'resource.prompt',
  List: PromptList,
}
