import type { WireV1Client } from '@/api/wire-v1-client'
import {
  asRequestId,
  type EnvironmentIdentity,
  type RequestId,
  type WorkspacesBrowseResult
} from '@/types/wire/wire-v1'

export interface BrowseAgentBoxWorkspaceInput {
  environment: EnvironmentIdentity
  path: string
}

export interface BrowseAgentBoxWorkspaceOptions {
  createRequestId?: () => RequestId
}

/** One directory inside an environment the service can reach. The host still
 *  discovers and connects to WSL; listing a directory is the service's job. */
export interface AgentBoxWorkspaceBrowserPort {
  browse(input: BrowseAgentBoxWorkspaceInput): Promise<WorkspacesBrowseResult>
}

const defaultRequestId = (): RequestId => asRequestId(`desktop-${crypto.randomUUID()}`)

/**
 * `workspaces.browse` (core v1 §4): the worker lists, the Desktop presents.
 * The client forwards the environment identity and the path exactly as it holds
 * them and reports the service's answer verbatim — readability, writability and
 * the failure reason are the service's facts, never derived here. Nothing is
 * cached or opened by this call.
 */
export function wireAgentBoxWorkspaceBrowserPort(
  client: WireV1Client,
  options: BrowseAgentBoxWorkspaceOptions = {}
): AgentBoxWorkspaceBrowserPort {
  const createRequestId = options.createRequestId ?? defaultRequestId

  return {
    async browse(input) {
      return client.call('workspaces.browse', {
        environment: input.environment,
        path: input.path,
        requestId: createRequestId()
      })
    }
  }
}
