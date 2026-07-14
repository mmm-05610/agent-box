// gui-web/src/pages/detail/schema.ts
import type { ComponentType } from 'react'
import type { AgentType } from '@/api'
import type { ProfileDetail } from '../detail'
import { MetaEditor } from './MetaEditor'
import { ProviderEditor } from './ProviderEditor'
import { PermissionsEditor } from './PermissionsEditor'
import { HooksEditor } from './HooksEditor'
import { PluginsEditor } from './PluginsEditor'
import { FileTextEditor } from './FileTextEditor'
import { McpTab } from './McpTab'
import { SkillsTab } from './SkillsTab'
import { StorageExplorer } from './storage/StorageExplorer'

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

interface DetailTabContext extends ProfileDetailLike {
  settingsPath: string
  settingsRaw: string
  claudeMdPath: string
  claudeMdRaw: string
  claudeDotJson: string
  fileTree: string[]
  onRefresh: () => void
}

const tabContext = (detail: ProfileDetailLike) => detail as DetailTabContext
const component = <P,>(value: ComponentType<P>) => value as unknown as ComponentType<unknown>

export const AGENT_TAB_SCHEMAS: Record<AgentType, AgentTabSchema> = {
  // PR 1 wires Claude; PR 3-5 populate the other agent types.
  claude: {
    agentType: 'claude',
    tabs: [
      {
        key: 'meta',
        label: 'Meta',
        Component: component(MetaEditor),
        propsFor: (d) => ({ detail: d as unknown as ProfileDetail, onRefresh: tabContext(d).onRefresh }),
      },
      {
        key: 'provider',
        label: 'Provider',
        Component: component(ProviderEditor),
        propsFor: (d) => ({
          path: tabContext(d).settingsPath,
          content: tabContext(d).settingsRaw,
          onRefresh: tabContext(d).onRefresh,
          agentType: d.meta.agent_type,
        }),
      },
      {
        key: 'permissions',
        label: 'Permissions',
        Component: component(PermissionsEditor),
        propsFor: (d) => ({
          path: tabContext(d).settingsPath,
          content: tabContext(d).settingsRaw,
          onRefresh: tabContext(d).onRefresh,
        }),
      },
      {
        key: 'hooks',
        label: 'Hooks',
        Component: component(HooksEditor),
        propsFor: (d) => ({
          path: tabContext(d).settingsPath,
          content: tabContext(d).settingsRaw,
          onRefresh: tabContext(d).onRefresh,
        }),
      },
      {
        key: 'plugins',
        label: 'Plugins',
        Component: component(PluginsEditor),
        propsFor: (d) => ({
          path: tabContext(d).settingsPath,
          content: tabContext(d).settingsRaw,
          onRefresh: tabContext(d).onRefresh,
        }),
      },
      {
        key: 'claude-md',
        label: 'CLAUDE.md',
        Component: component(FileTextEditor),
        propsFor: (d) => ({
          path: tabContext(d).claudeMdPath,
          content: tabContext(d).claudeMdRaw,
          label: 'CLAUDE.md',
          placeholder: '# Custom instructions',
          onRefresh: tabContext(d).onRefresh,
        }),
      },
      {
        key: 'mcp',
        label: 'MCP',
        Component: component(McpTab),
        propsFor: (d) => ({ profileName: d.meta.name, profilePath: d.path }),
      },
      {
        key: 'skills',
        label: 'Skills',
        Component: component(SkillsTab),
        propsFor: (d) => ({ profileName: d.meta.name, configDir: d.config_dir }),
      },
      {
        key: 'storage',
        label: 'Storage',
        Component: component(StorageExplorer),
        propsFor: (d) => ({ profilePath: d.path, fileTree: tabContext(d).fileTree }),
      },
    ],
  },
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