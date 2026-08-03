/**
 * API Types — Shared data models
 *
 * These match the Python backend's data structures.
 */

// ── Provider ───────────────────────────────────────────────────────────

/**
 * Provider row from the ACS query layer (src/agent_box/adapters/acs.py).
 * Backend returns snake_case and filters by agent type itself, so no
 * agentTypes / createdAt fields are needed here.
 */
export interface Provider {
  id: string
  name: string
  category: string | null
  website_url: string | null
  is_current: boolean
  /** Parsed settings object — the frontend reads provider settings config. */
  settings: Record<string, unknown>
  meta: Record<string, unknown>
  [key: string]: unknown
}

// ── Prompt ─────────────────────────────────────────────────────────────

/**
 * Prompt row from the ACS query layer (acs.list_prompts).
 */
export interface Prompt {
  id: string
  name: string
  content: string
  description: string
  [key: string]: unknown
}

// ── MCP Server ─────────────────────────────────────────────────────────

/**
 * MCP server row from the ACS query layer (acs.list_mcp_servers).
 * server_config is already JSON-parsed by the backend query layer.
 */
export interface McpServer {
  id: string
  name: string
  description: string
  homepage: string
  docs: string
  tags: string[]
  server_config: Record<string, unknown> | null
  [key: string]: unknown
}

// ── Skill ──────────────────────────────────────────────────────────────

/**
 * Skill row from the ACS query layer (acs.list_skills).
 */
export interface Skill {
  id: string
  name: string
  description: string
  directory: string
  repo_owner: string
  repo_name: string
  repo_branch: string
  readme_url: string
  /** Whether the skill's source directory exists locally (available to apply). */
  source_available: boolean | null
  source_path: string | null
  [key: string]: unknown
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

/** Agent type id — fully dynamic; the backend registry is the source of truth. */
export type AgentType = string

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
