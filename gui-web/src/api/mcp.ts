/**
 * MCP Servers API — CRUD operations for the MCP server library
 *
 * Calls PyWebView bridge functions via window.pywebview.api (async).
 * Converts snake_case fields from CLI to camelCase.
 */

import { call } from '@/lib/bridge'
import type { AgentType, McpServer, McpServerConfig } from './types'

/** Convert snake_case mcp_server row from CLI to camelCase. */
function toMcpServer(raw: Record<string, unknown>): McpServer {
  return {
    id: raw.id as string,
    name: raw.name as string,
    description: (raw.description as string | null | undefined) ?? undefined,
    homepage: (raw.homepage as string | null | undefined) ?? undefined,
    docs: (raw.docs as string | null | undefined) ?? undefined,
    tags: (raw.tags as string[] | undefined) ?? [],
    agentTypes: (raw.agent_types as AgentType[] | undefined) ?? [],
    serverConfig: (raw.server_config as string | null | undefined) ?? undefined,
    serverConfigParsed:
      (raw.server_config_parsed as McpServerConfig | null | undefined) ??
      undefined,
  }
}

export async function fetchMcpServers(agentType: AgentType): Promise<McpServer[]> {
  const raw = await call<Record<string, unknown>[]>(
    (api) => api.list_mcp_servers(agentType),
    [],
  )
  return raw.map(toMcpServer)
}

export async function fetchMcpServerDetail(
  serverId: string,
): Promise<McpServer | null> {
  const raw = await call<Record<string, unknown> | null>(
    (api) => api.get_mcp_server(serverId),
    null,
  )
  return raw ? toMcpServer(raw) : null
}

export async function saveMcpServer(
  serverId: string,
  dataJson: string,
): Promise<McpServer> {
  const raw = await call<Record<string, unknown>>(
    (api) => api.save_mcp_server(serverId, dataJson),
    {} as Record<string, unknown>,
  )
  return toMcpServer(raw)
}

export async function deleteMcpServer(serverId: string): Promise<void> {
  await call<void>((api) => api.delete_mcp_server(serverId), undefined)
}

export async function setMcpAgent(
  serverId: string,
  agentType: AgentType,
  enabled: boolean,
): Promise<void> {
  await call<void>(
    (api) => api.set_mcp_agent(serverId, agentType, enabled ? 'true' : 'false'),
    undefined,
  )
}
