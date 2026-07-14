// gui-web/src/pages/detail/schema.ts
import type { ComponentType } from 'react'
import type { AgentType } from '@/api'

export interface ProfileMeta {
  name: string
  agent_type: string
  display_name: string
  description: string
  provider: string
  claude_md: string
  preset: string
}

export interface ProfileDetailLike {
  path: string
  meta: ProfileMeta
  config_dir: string
}

export interface TabSpec<T extends ProfileDetailLike = ProfileDetailLike, P = unknown> {
  key: string
  label: string
  Component: ComponentType<P>
  /** Returns the props to pass to Component. Sync only. */
  propsFor: (ctx: T) => P
  /** Hide the tab if false. Sync only. Default true. */
  visible?: (ctx: T) => boolean
}

export interface AgentTabSchema {
  agentType: AgentType
  tabs: TabSpec[]
}

export const AGENT_TAB_SCHEMAS: Record<AgentType, AgentTabSchema> = {
  // filled by Task 11 / 12 / PR 3-5 (codex, hermes, opencode) — see PR 3.
  claude: { agentType: 'claude', tabs: [] },
  codex: { agentType: 'codex', tabs: [] },
  hermes: { agentType: 'hermes', tabs: [] },
  opencode: { agentType: 'opencode', tabs: [] },
  mimocode: { agentType: 'mimocode', tabs: [] },
}

export function tabsFor(profile: ProfileDetailLike): TabSpec[] {
  const entry = AGENT_TAB_SCHEMAS[profile.meta.agent_type as AgentType]
  if (!entry) return []
  return entry.tabs.filter((t) => (t.visible ? t.visible(profile) : true))
}