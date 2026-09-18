import { useCallback, useEffect, useState } from 'react'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { WireRemoteError } from '@/api/wire-v1-client'
import { loadExecutionInventory } from '@/application/execution/wire-execution-inventory'
import { loadWorkspaceGitStatus } from '@/application/workspace/wire-workspace-git'
import type { ExecutionInventoryRow, WorkspaceGitStatus } from '@/types/wire/wire-v1'

export interface AgentBoxWorkStatusReads {
  /** Order 64: the service's answer, or null while no read has succeeded. */
  executions: ExecutionInventoryRow[] | null
  /** Why the inventory read failed — the service's own typed answer, shown as
   *  a card fact. A refused read (over the row bound, say) is never silent. */
  executionsError: null | string
  /** Order 62: the workspace's answer, or null while no read has succeeded. */
  git: WorkspaceGitStatus | null
  gitError: null | string
  refresh: () => void
}

/** A failed read said something; pass it on instead of swallowing it. The
 *  typed code comes first so a refusal reads differently from a transport gap. */
function readFailure(reason: unknown): string {
  if (reason instanceof WireRemoteError) {
    return `${reason.code}: ${reason.message}`
  }

  return reason instanceof Error ? reason.message : String(reason)
}

/**
 * P21: the work-status cards' read-only facts. Re-read on the signals the panel
 * already reacts to (`reloadKey`) and on demand; there is no timer, so a card
 * shows what was last asked for rather than pretending to be live. A read that
 * FAILED keeps its reason: the card then says why rather than vanishing, which
 * is the difference between "nothing to show" and "we could not ask".
 */
export function useAgentBoxWorkStatusReads(workspaceId: null | string, reloadKey: string): AgentBoxWorkStatusReads {
  const [git, setGit] = useState<WorkspaceGitStatus | null>(null)
  const [gitError, setGitError] = useState<null | string>(null)
  const [executions, setExecutions] = useState<ExecutionInventoryRow[] | null>(null)
  const [executionsError, setExecutionsError] = useState<null | string>(null)
  const [attempt, setAttempt] = useState(0)

  const refresh = useCallback(() => setAttempt(value => value + 1), [])

  useEffect(() => {
    let current = true

    if (!workspaceId) {
      setGit(null)
      setGitError(null)
    } else {
      void loadWorkspaceGitStatus(agentBoxRuntimeClient(), workspaceId)
        .then(status => {
          if (current) {
            setGit(status)
            setGitError(null)
          }
        })
        .catch((reason: unknown) => {
          if (current) {
            setGit(null)
            setGitError(readFailure(reason))
          }
        })
    }

    void loadExecutionInventory(agentBoxRuntimeClient())
      .then(rows => {
        if (current) {
          setExecutions(rows)
          setExecutionsError(null)
        }
      })
      .catch((reason: unknown) => {
        if (current) {
          setExecutions(null)
          setExecutionsError(readFailure(reason))
        }
      })

    return () => {
      current = false
    }
  }, [workspaceId, reloadKey, attempt])

  return { executions, executionsError, git, gitError, refresh }
}
