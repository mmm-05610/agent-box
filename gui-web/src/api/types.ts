/**
 * API Types — Shared data models
 *
 * These match the Python backend's data structures.
 */

// ── Provider ───────────────────────────────────────────────────────────

export interface Provider {
  id: string
  name: string
  category?: string
  websiteUrl?: string
  settings: ProviderSettings
  createdAt?: number
  isCurrent?: boolean
}

export interface ProviderSettings {
  name?: string
  description?: string
  env: Record<string, string>
  [key: string]: unknown
}

// ── Claude.md ──────────────────────────────────────────────────────────

export interface ClaudeMd {
  id: string
  name: string
  description?: string
  content: string
  createdAt?: number
}

// ── MCP Server ─────────────────────────────────────────────────────────

/** Unified MCP server_config shape (matches Python backend). */
export interface McpServerConfig {
  type: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  [key: string]: unknown
}

export interface McpServer {
  id: string
  name: string
  description?: string
  homepage?: string
  docs?: string
  tags: string[]
  /** Agent types this server is enabled for (resolved from join table). */
  agentTypes: AgentType[]
  /** Raw server_config JSON string from the DB. */
  serverConfig?: string
  /** Parsed server_config object (only on detail / show response). */
  serverConfigParsed?: McpServerConfig
}

// ── Skill ──────────────────────────────────────────────────────────────

export interface Skill {
  id: string
  name: string
  description?: string
  directory?: string
  repoOwner?: string
  repoName?: string
  repoBranch?: string
  readmeUrl?: string
  /** Agent types this skill is enabled for (resolved from join table). */
  agentTypes: AgentType[]
  installedAt?: number
}

// ── Profile ────────────────────────────────────────────────────────────

export interface Profile {
  name: string
  agentType: AgentType
  displayName?: string
  description?: string
  providerRef?: string
  claudeMdRef?: string
  createdAt?: number
}

export type AgentType = 'claude' | 'codex' | 'hermes' | 'opencode'

export const AGENT_TYPES: AgentType[] = ['claude', 'codex', 'hermes', 'opencode']

export const AGENT_TYPE_COLORS: Record<AgentType, string> = {
  claude: 'warning',    // orange
  codex: 'success',     // green
  hermes: 'info',       // blue
  opencode: 'primary',  // neutral
}

// ── Session ────────────────────────────────────────────────────────────

export interface Session {
  id: number
  profile: string
  agentType: AgentType
  cwd: string
  mode?: string
  pid?: number
  launchedAt: number
  exitedAt?: number
  exitCode?: number
}

export type SessionStatus = 'running' | 'exited'

// ── Preset ─────────────────────────────────────────────────────────────

export interface Preset {
  name: string
  agentType: AgentType
}
