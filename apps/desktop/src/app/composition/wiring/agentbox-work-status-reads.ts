import { useCallback, useEffect, useState } from 'react'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { loadExecutionInventory } from '@/application/execution/wire-execution-inventory'
import { loadWorkspaceGitStatus } from '@/application/workspace/wire-workspace-git'
import type { ExecutionInventoryRow, WorkspaceGitStatus } from '@/types/wire/wire-v1'

export interface AgentBoxWorkStatusReads {
  /** Order 64: the service's answer, or null while no read has succeeded. */
  executions: ExecutionInventoryRow[] | null
  /** Order 62: the workspace's answer, or null while no read has succeeded. */
  git: WorkspaceGitStatus | null
  refresh: () => void
}

/**
 * P21: the work-status cards' read-only facts. Re-read on the signals the panel
 * already reacts to (`reloadKey`) and on demand; there is no timer, so a card
 * shows what was last asked for rather than pretending to be live. A failed
 * read leaves the fact null — the card then does not render, which is the same
 * honest absence as "the service has nothing to say".
 */
export function useAgentBoxWorkStatusReads(workspaceId: null | string, reloadKey: string): AgentBoxWorkStatusReads {
  const [git, setGit] = useState<WorkspaceGitStatus | null>(null)
  const [executions, setExecutions] = useState<ExecutionInventoryRow[] | null>(null)
  const [attempt, setAttempt] = useState(0)

  const refresh = useCallback(() => setAttempt(value => value + 1), [])

  useEffect(() => {
    let current = true

    if (!workspaceId) {
      setGit(null)
    } else {
      void loadWorkspaceGitStatus(agentBoxRuntimeClient(), workspaceId)
        .then(status => current && setGit(status))
        .catch(() => current && setGit(null))
    }

    void loadExecutionInventory(agentBoxRuntimeClient())
      .then(rows => current && setExecutions(rows))
      .catch(() => current && setExecutions(null))

    return () => {
      current = false
    }
  }, [workspaceId, reloadKey, attempt])

  return { executions, git, refresh }
}
