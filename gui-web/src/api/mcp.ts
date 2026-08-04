/**
 * MCP Servers API — CRUD operations for the MCP server library
 *
 * Calls PyWebView bridge functions via window.pywebview.api (async).
 * ACS rows are already snake_case — no conversion layer needed.
 */

import { call } from '@/lib/bridge'
import type { AgentType, McpServer } from './types'

export async function fetchMcpServers(agentType: AgentType): Promise<McpServer[]> {
  return call<McpServer[]>((api) => api.list_mcp_servers!(agentType), [])
}

export async function fetchMcpServerDetail(
  serverId: string,
): Promise<McpServer | null> {
  return call<McpServer | null>((api) => api.get_mcp_server!(serverId), null)
}

export async function saveMcpServer(
  serverId: string,
  dataJson: string,
): Promise<McpServer> {
  return call<McpServer>(
    (api) => api.save_mcp_server!(serverId, dataJson),
    {} as McpServer,
  )
}

export async function deleteMcpServer(serverId: string): Promise<void> {
  await call<void>((api) => api.delete_mcp_server!(serverId), undefined)
}

export async function setMcpAgent(
  serverId: string,
  agentType: AgentType,
  enabled: boolean,
): Promise<void> {
  await call<void>(
    (api) => api.set_mcp_agent!(serverId, agentType, enabled ? 'true' : 'false'),
    undefined,
  )
}

// ── Profile MCP (installed) ─────────────────────────────────────────────

export interface ProfileMcp {
  id: string
  name: string
  type?: string
  command?: string
  args?: string[]
  url?: string
  raw: Record<string, unknown>
}

export async function fetchProfileMcp(profileName: string): Promise<ProfileMcp[]> {
  const raw = await call<ProfileMcp[] | null>((api) => api.get_profile_mcp!(profileName), null)
  return raw ?? []
}

export async function applyMcpToProfile(profileName: string, mcpId: string): Promise<void> {
  await call<void>((api) => api.apply_mcp_to_profile!(profileName, mcpId), undefined)
}

export async function removeMcpFromProfile(profileName: string, mcpId: string): Promise<void> {
  await call<void>((api) => api.remove_mcp_from_profile!(profileName, mcpId), undefined)
}
