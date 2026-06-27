/**
 * Skills API — CRUD operations for the skill library
 *
 * Calls PyWebView bridge functions via window.pywebview.api (async).
 * Converts snake_case fields from CLI to camelCase.
 */

import { call } from '@/lib/bridge'
import type { AgentType, Skill } from './types'

/** Convert snake_case skill row from CLI to camelCase. */
function toSkill(raw: Record<string, unknown>): Skill {
  return {
    id: raw.id as string,
    name: raw.name as string,
    description: (raw.description as string | null | undefined) ?? undefined,
    directory: (raw.directory as string | null | undefined) ?? undefined,
    repoOwner: (raw.repo_owner as string | null | undefined) ?? undefined,
    repoName: (raw.repo_name as string | null | undefined) ?? undefined,
    repoBranch: (raw.repo_branch as string | null | undefined) ?? 'main',
    readmeUrl: (raw.readme_url as string | null | undefined) ?? undefined,
    agentTypes: (raw.agent_types as AgentType[] | undefined) ?? [],
    installedAt: (raw.installed_at as number | undefined) ?? undefined,
  }
}

export async function fetchSkills(agentType: AgentType): Promise<Skill[]> {
  const raw = await call<Record<string, unknown>[]>(
    (api) => api.list_skills(agentType),
    [],
  )
  return raw.map(toSkill)
}

export async function fetchSkillDetail(skillId: string): Promise<Skill | null> {
  const raw = await call<Record<string, unknown> | null>(
    (api) => api.get_skill(skillId),
    null,
  )
  return raw ? toSkill(raw) : null
}

export async function saveSkill(
  skillId: string,
  dataJson: string,
): Promise<Skill> {
  const raw = await call<Record<string, unknown>>(
    (api) => api.save_skill(skillId, dataJson),
    {} as Record<string, unknown>,
  )
  return toSkill(raw)
}

export async function deleteSkill(skillId: string): Promise<void> {
  await call<void>((api) => api.delete_skill(skillId), undefined)
}

export async function setSkillAgent(
  skillId: string,
  agentType: AgentType,
  enabled: boolean,
): Promise<void> {
  await call<void>(
    (api) => api.set_skill_agent(skillId, agentType, enabled ? 'true' : 'false'),
    undefined,
  )
}
