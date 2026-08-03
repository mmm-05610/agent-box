import type { ResourceDef } from '..'
import { SkillList } from './List'

export const skillResource: ResourceDef = {
  key: 'skills',
  labelKey: 'resource.skill',
  List: SkillList,
}
