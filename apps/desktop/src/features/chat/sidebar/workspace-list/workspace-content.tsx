import type * as React from 'react'

import { useI18n } from '@/i18n'
import type { WorkspaceListItem } from '@/types/workspace'

/**
 * The body a workspace row reveals when it expands (36R):
 *
 * - A matched AgentBox service Workspace OWNS the body: its Session records
 *   render there (loading, empty and rows alike) — never a legacy fallback.
 * - LOCAL workspaces without one render their session tree — the rows arrive
 *   as a prop from the existing session renderer, so the tree rendering is
 *   REUSED, not rewritten, and this component never learns how sessions are
 *   drawn.
 * - WSL workspaces the service does not know render the honest unavailable
 *   prompt: no Hermes session is created behind the user's back.
 */
export function WorkspaceContent({
  agentBoxContent,
  item,
  sessionContent
}: {
  agentBoxContent?: React.ReactNode
  item: WorkspaceListItem
  sessionContent?: React.ReactNode
}) {
  const { t } = useI18n()

  if (agentBoxContent) {
    return <>{agentBoxContent}</>
  }

  if (item.backend === 'local') {
    return sessionContent ? <>{sessionContent}</> : null
  }

  return (
    <div className="px-1 pb-1.5" data-wsl-workspace-empty={item.id}>
      <div className="rounded-md px-2 py-1.5 text-[0.6875rem] leading-4 text-(--ui-text-tertiary)">
        {t.wslWorkspace.sessionUnavailable}
      </div>
    </div>
  )
}
