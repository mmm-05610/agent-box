/**
 * HookList — hooks resource list. Dispatches to the right editor based on
 * the registry's resources.hooks.format (json → SettingsHooksEditor,
 * yaml → HermesHooksViewer) — backend-driven, not a hardcoded agent branch.
 */

import type { AgentType } from '@/api'
import { useAgentConfigs } from '@/hooks'
import { SettingsHooksEditor } from './SettingsHooksEditor'
import { HermesHooksViewer } from './HermesHooksViewer'

interface HookListProps {
  profileName: string
  agentType?: AgentType
}

export function HookList({ profileName, agentType }: HookListProps) {
  const { agentConfigs } = useAgentConfigs()
  const hooksFormat = agentType ? agentConfigs?.[agentType]?.resources?.hooks?.format : undefined
  if (hooksFormat === 'yaml') return <HermesHooksViewer profileName={profileName} />
  return <SettingsHooksEditor profileName={profileName} />
}
