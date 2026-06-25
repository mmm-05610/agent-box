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
