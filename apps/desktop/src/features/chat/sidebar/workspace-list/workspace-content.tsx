import type * as React from 'react'

import { useI18n } from '@/i18n'
import type { WorkspaceListItem } from '@/types/workspace'

/**
 * The body a workspace row reveals when it expands (36R):
 *
 * - LOCAL workspaces render their session tree — the rows arrive as a prop
 *   from the existing session renderer, so the tree rendering is REUSED, not
 *   rewritten, and this component never learns how sessions are drawn.
 * - WSL workspaces render the honest unavailable prompt: sessions in WSL
 *   workspaces are not wired in this round, and no Hermes session is created
 *   behind the user's back.
 */
export function WorkspaceContent({ item, sessionContent }: { item: WorkspaceListItem; sessionContent?: React.ReactNode }) {
  const { t } = useI18n()

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
