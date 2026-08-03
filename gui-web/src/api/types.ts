/**
 * API Types — Shared data models
 *
 * These match the Python backend's data structures.
 */

// ── Provider ───────────────────────────────────────────────────────────

export interface ProviderMeta {
  usage_script?: {
    enabled: boolean
    code: string
    timeout: number
    autoQueryInterval: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface Provider {
  id: string
  name: string
  category?: string
  websiteUrl?: string
  settings: ProviderSettings
  meta?: ProviderMeta
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
  /** Whether the skill's source directory exists locally (available to apply). */
  sourceAvailable?: boolean
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

export type AgentFeature = 'permissions' | 'plugins' | 'rules' | 'memories' | 'instructions'
export type ProviderApplyMode = 'overwrite' | 'additive'

/** Resource capability block — key = supported resource type. */
export interface ResourceConfig {
  apply_mode?: ProviderApplyMode
  config_file?: string
  file?: string
  format?: string
  key?: string
  [key: string]: unknown
}

/**
 * Agent-type registry contract (mirrors core/agent_types.json).
 *
 * The backend registry is the single source of truth; the frontend only
 * annotates the fields it consumes, with `[key: string]: unknown` as the
 * catch-all for everything else.
 */
export interface AgentTypeConfig {
  identity: {
    display_name: string
    binary: string
    [key: string]: unknown
  }
  runtime: {
    config_dir: string
    profile_dir_suffix: string
    config_files?: string[]
    data_dir?: string
    venv_preserve?: string
    extra_profile_files?: string[]
    launch?: {
      interactive?: string[]
      exec?: string[]
      resume?: string[]
      resume_by_id?: string[]
      [key: string]: unknown
    }
    acs_column: string
    [key: string]: unknown
  }
  resources: Record<string, ResourceConfig>
  sandbox?: {
    bind_mounts?: string[]
    dev_mounts?: string[]
    proc_mounts?: string[]
    tmpfs?: string[]
    unshare?: string[]
    share?: string[]
    [key: string]: unknown
  }
  presets?: Record<string, unknown>
  [key: string]: unknown
}

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

export interface ProviderPreset {
  id: string
  name: string
  cat: string
  url: string
  env: Record<string, string>
  notes?: string
  apiFormat?: string
  isPartner?: boolean
  apiKeyUrl?: string
  endpointCandidates?: string[]
  modelsUrl?: string
}
