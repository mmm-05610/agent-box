/**
 * Skills API — CRUD operations for the skill library
 *
 * Calls PyWebView bridge functions via window.pywebview.api (async).
 * ACS rows are already snake_case — no conversion layer needed.
 */

import { call } from '@/lib/bridge'
import type { AgentType, Skill } from './types'

export async function fetchSkills(agentType: AgentType): Promise<Skill[]> {
  return call<Skill[]>((api) => api.list_skills!(agentType), [])
}

export async function saveSkill(
  skillId: string,
  dataJson: string,
): Promise<Skill> {
  return call<Skill>(
    (api) => api.save_skill!(skillId, dataJson),
    {} as Skill,
  )
}

export async function deleteSkill(skillId: string): Promise<void> {
  await call<void>((api) => api.delete_skill!(skillId), undefined)
}

export async function setSkillAgent(
  skillId: string,
  agentType: AgentType,
  enabled: boolean,
): Promise<void> {
  await call<void>(
    (api) => api.set_skill_agent!(skillId, agentType, enabled ? 'true' : 'false'),
    undefined,
  )
}

// ── Profile skills (apply / remove) ─────────────────────────────────────

export async function applySkillToProfile(profileName: string, skillId: string): Promise<void> {
  await call<void>((api) => api.apply_skill_to_profile!(profileName, skillId), undefined)
}

export async function removeSkillFromProfile(profileName: string, skillId: string): Promise<void> {
  await call<void>((api) => api.remove_skill_from_profile!(profileName, skillId), undefined)
}
