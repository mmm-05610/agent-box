/**
 * HookList — hooks resource list. Dispatches to the right editor based on
 * the registry's resources.hooks.format (json → JsonHooksEditor,
 * yaml → YamlHooksViewer) — backend-driven, not a hardcoded agent branch.
 */

import type { AgentType } from '@/api'
import { useAgentConfigs } from '@/hooks'
import { JsonHooksEditor } from './JsonHooksEditor'
import { YamlHooksViewer } from './YamlHooksViewer'

interface HookListProps {
  profileName: string
  agentType?: AgentType
}

export function HookList({ profileName, agentType }: HookListProps) {
  const { agentConfigs } = useAgentConfigs()
  const hooksFormat = agentType ? agentConfigs?.[agentType]?.resources?.hooks?.format : undefined
  if (hooksFormat === 'yaml') return <YamlHooksViewer profileName={profileName} agentType={agentType} />
  return <JsonHooksEditor profileName={profileName} agentType={agentType} />
}
