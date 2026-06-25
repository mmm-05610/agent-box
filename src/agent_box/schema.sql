-- agent-box schema (v1, adapted from cc-switch v11)
-- Source: workspace/cc-switch-study/cc-switch/src-tauri/src/database/schema.rs
-- Differences from upstream:
--   * mcp_servers / skills: dropped enabled_claude/codex/gemini/opencode/hermes columns
--   * mcp_server_agents / skill_agents: new association tables
--   * proxy_config: dropped CHECK (app_type IN (...)) constraint
--   * profiles / sessions: new agent-box tables (replaces YAML + sessions.db)
--   * No seed data (providers, model_pricing, proxy_config rows)

-- 1. providers (cc-switch)
CREATE TABLE IF NOT EXISTS providers (
    id TEXT NOT NULL,
    app_type TEXT NOT NULL,
    name TEXT NOT NULL,
    settings_config TEXT NOT NULL,
    website_url TEXT,
    category TEXT,
    created_at INTEGER,
    sort_index INTEGER,
    notes TEXT,
    icon TEXT,
    icon_color TEXT,
    meta TEXT NOT NULL DEFAULT '{}',
    is_current BOOLEAN NOT NULL DEFAULT 0,
    in_failover_queue BOOLEAN NOT NULL DEFAULT 0,
    cost_multiplier TEXT,
    limit_daily_usd TEXT,
    limit_monthly_usd TEXT,
    provider_type TEXT,
    PRIMARY KEY (id, app_type)
);

-- 2. provider_endpoints (cc-switch)
CREATE TABLE IF NOT EXISTS provider_endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id TEXT NOT NULL,
    app_type TEXT NOT NULL,
    url TEXT NOT NULL,
    added_at INTEGER,
    FOREIGN KEY (provider_id, app_type) REFERENCES providers(id, app_type) ON DELETE CASCADE
);

-- 3. mcp_servers (cc-switch, sans enabled_* columns)
CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    server_config TEXT NOT NULL,
    description TEXT,
    homepage TEXT,
    docs TEXT,
    tags TEXT NOT NULL DEFAULT '[]'
);

-- 4. mcp_server_agents (agent-box new — replaces mcp_servers.enabled_*)
CREATE TABLE IF NOT EXISTS mcp_server_agents (
    mcp_server_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    PRIMARY KEY (mcp_server_id, agent_type),
    FOREIGN KEY (mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);

-- 5. prompts (cc-switch)
CREATE TABLE IF NOT EXISTS prompts (
    id TEXT NOT NULL,
    app_type TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER,
    PRIMARY KEY (id, app_type)
);

-- 6. skills (cc-switch, sans enabled_* columns)
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    directory TEXT NOT NULL,
    repo_owner TEXT,
    repo_name TEXT,
    repo_branch TEXT DEFAULT 'main',
    readme_url TEXT,
    installed_at INTEGER NOT NULL DEFAULT 0,
    content_hash TEXT,
    updated_at INTEGER NOT NULL DEFAULT 0
);

-- 7. skill_agents (agent-box new — replaces skills.enabled_*)
CREATE TABLE IF NOT EXISTS skill_agents (
    skill_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    PRIMARY KEY (skill_id, agent_type),
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

-- 8. skill_repos (cc-switch)
CREATE TABLE IF NOT EXISTS skill_repos (
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    enabled BOOLEAN NOT NULL DEFAULT 1,
    PRIMARY KEY (owner, name)
);

-- 9. settings (cc-switch)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- 10. proxy_config (cc-switch, CHECK constraint removed)
CREATE TABLE IF NOT EXISTS proxy_config (
    app_type TEXT PRIMARY KEY,
    proxy_enabled INTEGER NOT NULL DEFAULT 0,
    listen_address TEXT NOT NULL DEFAULT '127.0.0.1',
    listen_port INTEGER NOT NULL DEFAULT 15721,
    enable_logging INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 0,
    auto_failover_enabled INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    streaming_first_byte_timeout INTEGER NOT NULL DEFAULT 60,
    streaming_idle_timeout INTEGER NOT NULL DEFAULT 120,
    non_streaming_timeout INTEGER NOT NULL DEFAULT 600,
    circuit_failure_threshold INTEGER NOT NULL DEFAULT 4,
    circuit_success_threshold INTEGER NOT NULL DEFAULT 2,
    circuit_timeout_seconds INTEGER NOT NULL DEFAULT 60,
    circuit_error_rate_threshold REAL NOT NULL DEFAULT 0.6,
    circuit_min_requests INTEGER NOT NULL DEFAULT 10,
    default_cost_multiplier TEXT NOT NULL DEFAULT '1',
    pricing_model_source TEXT NOT NULL DEFAULT 'response',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    live_takeover_active INTEGER NOT NULL DEFAULT 0
);

-- 11. provider_health (cc-switch)
CREATE TABLE IF NOT EXISTS provider_health (
    provider_id TEXT NOT NULL,
    app_type TEXT NOT NULL,
    is_healthy INTEGER NOT NULL DEFAULT 1,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_success_at TEXT,
    last_failure_at TEXT,
    last_error TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (provider_id, app_type),
    FOREIGN KEY (provider_id, app_type) REFERENCES providers(id, app_type) ON DELETE CASCADE
);

-- 12. proxy_request_logs (cc-switch v11 — pricing_model column included)
CREATE TABLE IF NOT EXISTS proxy_request_logs (
    request_id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    app_type TEXT NOT NULL,
    model TEXT NOT NULL,
    request_model TEXT,
    pricing_model TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    input_cost_usd TEXT NOT NULL DEFAULT '0',
    output_cost_usd TEXT NOT NULL DEFAULT '0',
    cache_read_cost_usd TEXT NOT NULL DEFAULT '0',
    cache_creation_cost_usd TEXT NOT NULL DEFAULT '0',
    total_cost_usd TEXT NOT NULL DEFAULT '0',
    latency_ms INTEGER NOT NULL,
    first_token_ms INTEGER,
    duration_ms INTEGER,
    status_code INTEGER NOT NULL,
    error_message TEXT,
    session_id TEXT,
    provider_type TEXT,
    is_streaming INTEGER NOT NULL DEFAULT 0,
    cost_multiplier TEXT NOT NULL DEFAULT '1.0',
    created_at INTEGER NOT NULL,
    data_source TEXT NOT NULL DEFAULT 'proxy'
);

-- 13. stream_check_logs (cc-switch)
CREATE TABLE IF NOT EXISTS stream_check_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    app_type TEXT NOT NULL,
    status TEXT NOT NULL,
    success INTEGER NOT NULL,
    message TEXT NOT NULL,
    response_time_ms INTEGER,
    http_status INTEGER,
    model_used TEXT,
    retry_count INTEGER DEFAULT 0,
    tested_at INTEGER NOT NULL
);

-- 14. usage_daily_rollups (cc-switch v11 — 6-column PK)
CREATE TABLE IF NOT EXISTS usage_daily_rollups (
    date TEXT NOT NULL,
    app_type TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    model TEXT NOT NULL,
    request_model TEXT NOT NULL DEFAULT '',
    pricing_model TEXT NOT NULL DEFAULT '',
    request_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost_usd TEXT NOT NULL DEFAULT '0',
    avg_latency_ms INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date, app_type, provider_id, model, request_model, pricing_model)
);

-- 15. proxy_live_backup (cc-switch)
CREATE TABLE IF NOT EXISTS proxy_live_backup (
    app_type TEXT PRIMARY KEY,
    original_config TEXT NOT NULL,
    backed_up_at TEXT NOT NULL
);

-- 16. session_log_sync (cc-switch)
CREATE TABLE IF NOT EXISTS session_log_sync (
    file_path TEXT PRIMARY KEY,
    last_modified INTEGER NOT NULL,
    last_line_offset INTEGER NOT NULL DEFAULT 0,
    last_synced_at INTEGER NOT NULL
);

-- 17. model_pricing (cc-switch, no seed rows)
CREATE TABLE IF NOT EXISTS model_pricing (
    model_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    input_cost_per_million TEXT NOT NULL,
    output_cost_per_million TEXT NOT NULL,
    cache_read_cost_per_million TEXT NOT NULL DEFAULT '0',
    cache_creation_cost_per_million TEXT NOT NULL DEFAULT '0'
);

-- 18. profiles (agent-box new — replaces profiles/<name>/meta.yaml)
CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    agent_type TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    provider_ref TEXT,
    claude_md_ref TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 19. sessions (agent-box new — supersedes sessions.db)
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    cwd TEXT,
    mode TEXT,
    pid INTEGER,
    launched_at TEXT NOT NULL,
    exited_at TEXT,
    exit_code INTEGER
);

-- ---------- Indexes (9 total: 7 on proxy_request_logs + 1 providers + 1 stream_check_logs) ----------

CREATE INDEX IF NOT EXISTS idx_request_logs_provider
    ON proxy_request_logs(provider_id, app_type);

CREATE INDEX IF NOT EXISTS idx_request_logs_created_at
    ON proxy_request_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_request_logs_model
    ON proxy_request_logs(model);

CREATE INDEX IF NOT EXISTS idx_request_logs_session
    ON proxy_request_logs(session_id);

CREATE INDEX IF NOT EXISTS idx_request_logs_status
    ON proxy_request_logs(status_code);

CREATE INDEX IF NOT EXISTS idx_request_logs_app_created_at
    ON proxy_request_logs(app_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_request_logs_dedup_lookup_expr
    ON proxy_request_logs(app_type, COALESCE(data_source, 'proxy'),
                          input_tokens, output_tokens, cache_read_tokens,
                          created_at, cache_creation_tokens);

CREATE INDEX IF NOT EXISTS idx_providers_failover
    ON providers(app_type, in_failover_queue, sort_index);

CREATE INDEX IF NOT EXISTS idx_stream_check_logs_provider
    ON stream_check_logs(app_type, provider_id, tested_at DESC);
