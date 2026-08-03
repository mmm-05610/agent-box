import type { ResourceDef } from '..'
import { SkillList } from './SkillList'

export const skillResource: ResourceDef = {
  key: 'skills',
  labelKey: 'resource.skill',
  List: SkillList,
}
