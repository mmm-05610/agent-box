import type { ResourceDef } from '..'
import { SkillList } from './SkillList'

export const skillResource: ResourceDef = {
  key: 'skill',
  labelKey: 'resource.skill',
  List: SkillList,
}
