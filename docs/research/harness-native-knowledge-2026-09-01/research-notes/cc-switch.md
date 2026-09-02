# Research note: Hortus-Edenensis/cc-switch

Reviewed: 2026-09-02 from a `--depth 1` clone at `<temp-home>/cc-switch` (HEAD `origin` = https://github.com/Hortus-Edenensis/cc-switch, last commit 2026-06-08, "fix(presets): add Kimi affiliate links (#3809)"). File:line citations are repo-relative.

## Identity

- Org/repo: Hortus-Edenensis/cc-switch — https://github.com/Hortus-Edenensis/cc-switch. Important identity note: the repo's README, badges, sponsor links, and Trendshift all point at **farion1231/cc-switch** (`README.md:7-12,22`) and PR numbering (#3809) matches that upstream; the cloned origin is best understood as a mirror/fork of the active upstream project "CC Switch".
- Language: Rust (Tauri 2 backend under `src-tauri/`) + TypeScript/React (Vite frontend under `src/`); package manager pnpm.
- License: MIT (`LICENSE`).
- Last activity seen: 2026-06-08 on this mirror; upstream actively maintained (very high PR numbers, v3.16.x release notes in `docs/release-notes/`).
- Official docs: in-repo `docs/user-manual/` (en/zh/ja), `docs/guides/`, `CHANGELOG.md`, plus external site ccswitch.io. Self-description: "The All-in-One Manager for Claude Code, Claude Desktop, Codex, Gemini CLI, OpenCode, OpenClaw & Hermes Agent" (`README.md:5`).
- Purpose: GUI desktop app that manages API providers (50+ presets) for 7 AI tools from one SQLite-backed store, plus unified MCP/prompt/skill projection into each tool's native config, a local proxy with failover, usage tracking, and a session browser.

## Architecture summary

Core abstractions and lifecycle:

1. **AppType enum** — the 7 managed targets: `Claude, ClaudeDesktop, Codex, Gemini, OpenCode, OpenClaw, Hermes` (`src-tauri/src/app_config.rs:341-356`). Nearly every service branches on it via `match`.
2. **SQLite database as authority** — `src-tauri/src/database/` (`mod.rs`, `schema.rs`, `migration.rs`, `backup.rs`, `dao/`). `SCHEMA_VERSION: i32 = 10` (`database/mod.rs:52`); on open, if an existing DB has version > 0 and < current, a pre-migration backup is taken before `apply_schema_migrations` (`database/mod.rs:123-138`). Legacy v2 config.json (`MultiAppConfig`) is migrated into SQLite with a dry-run mode that validates in an in-memory DB first (`database/migration.rs:7-30`).
3. **Providers as rows** — `providers` table with composite PK `(id, app_type)`, `settings_config` JSON blob, `is_current` flag, `in_failover_queue` (`database/schema.rs:27-46`); per-provider `provider_endpoints` (`:50-62`). `is_current` marks the live provider; switching writes the row's `settings_config` into the app's live config file (`write_live_with_common_config`, called throughout `services/provider/mod.rs:1212-1425`) and updates `is_current` ("c. Update database is_current (as default for new devices)", `services/provider/mod.rs:1570`).
4. **Projection engine (DB → live files)** — per-resource services push DB state into each app's native config: MCP (`services/mcp.rs`, per-app writers in `src-tauri/src/mcp/{claude,codex,gemini,opencode,hermes}.rs`), prompts (`services/prompt.rs`, cross-app CLAUDE.md/AGENTS.md/GEMINI.md), skills (`services/skill.rs`, symlink/copy from an SSOT dir into per-app skills dirs), settings/env (`services/env_manager.rs`). All file writes funnel through `atomic_write` (`config.rs:204-265`).
5. **Live-config reading / backfill (live files → DB)** — `services/provider/live.rs`: `read_live_settings` (`live.rs:1004`), `import_default_config` (`:1121`), and per-app live import for OpenCode/OpenClaw/Hermes (`:1361,1418,1487`); skill-side equivalents `scan_unmanaged` + `import_from_apps` (`services/skill.rs:1384,1447`).
6. **Local proxy with takeover** — `src-tauri/src/proxy/` + `proxy_config`, `provider_health`, `proxy_request_logs`, `proxy_live_backup` tables (`database/schema.rs:124-258`); app-level takeover rewrites the app's profile to point at a local gateway (see test asserting `inferenceGatewayBaseUrl` points at `http://127.0.0.1:<port>/claude-desktop` while the takeover backup is preserved, `services/provider/mod.rs:560-640` test module).
7. **Session manager** — read-only parallel scan of 6 apps' session stores (`session_manager/mod.rs:58-91`), message loading including SQLite-backed stores (`:93-113`), deletion (`:114+`), and a `terminal/` module for resume commands.
8. **Sync layer** — WebDAV and S3 sync of the DB as SQL with ETag-tracked remote manifests (`services/webdav_sync.rs:91-153`, `services/webdav_sync/archive.rs`), skipping ephemeral tables (`database/backup.rs:14-33`).

Lifecycle: on startup the app migrates JSON→SQLite if needed, imports/normalizes live configs, syncs current providers to live, and syncs enabled MCP/skills to app dirs; user actions (tray switch, toggle, edit) re-run the relevant projection.

## Required focus points

### SQLite as authority — schema for providers/profiles

Tables created in `database/schema.rs::create_tables_on_conn` (`:21-`):

- `providers` (`:27-46`): `id TEXT`, `app_type TEXT` (composite PK), `name`, `settings_config TEXT` (the provider's JSON settings payload — where API keys live), `website_url`, `category`, `created_at`, `sort_index`, `notes`, `icon`, `icon_color`, `meta JSON default '{}'`, `is_current BOOLEAN`, `in_failover_queue BOOLEAN`.
- `provider_endpoints` (`:50-62`): FK `(provider_id, app_type)` → providers, `url`, `added_at`; cascade delete.
- `mcp_servers` (`:64-74`): `id` PK, `server_config TEXT`, plus per-app enablement columns `enabled_claude / enabled_codex / enabled_gemini / enabled_opencode / enabled_hermes BOOLEAN` — cross-app projection state lives *in the row*, not a join table.
- `prompts` (`:76-82`): PK `(id, app_type)`, `content`, `enabled`, timestamps — prompts are per-app scoped here (unlike MCP/skills).
- `skills` (`:84-106`, "v3.10.0+ unified structure"): `id` PK, `directory`, repo provenance (`repo_owner/repo_name/repo_branch/readme_url`), per-app enablement columns (same five apps), `installed_at`, `content_hash`, `updated_at`.
- `skill_repos` (`:108-116`): managed GitHub skill sources.
- `settings` (`:118`), `proxy_config` (`:124`), `provider_health` (`:175`), `proxy_request_logs` (`:184`), `model_pricing` (`:221`), `stream_check_logs` (`:232`), `proxy_live_backup` (`:250`), `usage_daily_rollups` (`:259`), `session_log_sync` (`:280`). Later migration blocks re-create some tables (`:601,633,750,820,937`).
- Note: there is **no `profiles` table** — "profile" in this project means a provider row per app; the `is_current` flag is the activation pointer.

### Provider/profile management UX

One-click switching with tray quick switch and drag-and-drop sorting (`README.md:181-186`); 50+ built-in presets with categories like "aggregator" (`src-tauri/src/provider.rs:692`); **Universal providers** — one config synced to Claude Code + Codex + Gemini simultaneously (`src-tauri/src/provider.rs:516-592`, `UniversalProviderApps`/`UniversalProviderModels`); import/export to file (`commands/import_export.rs:21-60`); deep-link import `ccswitch://` (`README.md:209`); switching under proxy takeover hot-routes instead of rewriting files (`services/provider/mod.rs:1646-1650`, "The proxy server will route requests to the new provider via is_current"). Live-vs-DB divergence is handled by "优先从本地 settings 读取，验证后 fallback 到数据库的 is_current 字段" (prefer local settings, validated, fall back to DB `is_current`) (`services/provider/mod.rs:1167`).

### Skills / MCP / prompt cross-application projection

- **Skills** — SSOT directory: `<app-config-dir>/skills` or, in "Unified" mode, `<user-home>/.agents/skills` (`services/skill.rs:480-493`). Projection `sync_to_app_dir` (`:1586-1650`): per-app target dir resolved with settings overrides then defaults (`get_app_skills_dir`, `:505-558`, e.g. Claude → `<home>/.claude/skills`, OpenCode → `<home>/.config/opencode/skills`); `SyncMethod::Auto` prefers symlink and falls back to recursive copy if symlink creation fails or the dest is a real dir; `SyncMethod::Symlink`/`Copy` force one mode (`:1607-1644`). Windows uses `symlink_dir` (`:1563-1567`). Enable/disable per app toggles the DB columns then syncs (`toggle_app`, `:1357`). Reverse direction: `scan_unmanaged` (`:1384`) finds app-dir skills absent from the DB and `import_from_apps` (`:1447-1580`) copies them into SSOT, parsing an agents-lock file for repo provenance. Updates use `compute_dir_hash` vs stored `content_hash` (`:830-877`); update/uninstall create backups under `<app-config-dir>/skill-backups` (`:497-501`, `:1230+`) and can restore (`:1283`).
- **MCP** — DB is the single source; `sync_server_to_app_no_config` dispatches per app to format-specific writers (`services/mcp.rs:110-139`): Claude (JSON), Codex (TOML, "must use the correct function"), Gemini, OpenCode, Hermes. Claude Desktop is skipped ("3P profiles do not use CC Switch MCP sync") and OpenClaw MCP is "still in development (Issue #4834), skip" (`:117-121,134-138`). `sync_all_enabled` (`:180-203`) iterates all apps: enabled servers are written, disabled ones removed — a converge-to-DB loop. "Bidirectional sync" in the README (`README.md:193-196`) means: DB→apps converge plus deep-link/import paths; per-app conflicts (a server edited both in the app's own config and in CC Switch) are resolved by overwrite on next sync, with no merge.
- **Prompts** — `prompts` rows projected to CLAUDE.md/AGENTS.md/GEMINI.md with "backfill protection": before overwriting a live file whose content differs, the service backfills the live content into the currently enabled prompt row, or if none matches, creates a backup prompt entry (`services/prompt.rs:74-115`, log lines "回填 live 提示词内容到已启用项" / "创建备份").

### Preview / import / export

Provider configs: `export_config_to_file` / `import_config_from_file` (`commands/import_export.rs:21-60`) round-trip the full DB state as a file; deep-link import (`commands/deeplink.rs`) covers providers/MCP/prompts/skills. Database: full SQL export/import (`database/backup.rs:47-100`) plus binary snapshot via `rusqlite::backup::Backup` (`:7` import). Skills: install from GitHub repos or ZIP (`README.md:196-198`; `install_from_zip`, `services/skill.rs:2538`). UI preview of provider configs exists in the frontend (add/edit provider dialog), but no dry-run diff preview of what a projection will change was found in the backend.

### Atomic write strategy

`atomic_write` (`config.rs:204-265`): write to sibling temp file `<name>.tmp.<nanos-timestamp>` → flush → preserve existing unix permissions (`:243-249`) → `fs::rename` onto target. Windows caveat handled explicitly: "rename 目标存在会失败，先移除再重命名（尽量接近原子性）" — on Windows the target is removed first, "as close to atomic as possible" (`:251-257`). All JSON writes sort keys for deterministic output (`write_json_file`, `:180-193`). SQLite itself is protected by pre-migration backups (`database/mod.rs:123-138`) and the transactional JSON migration with dry-run (`database/migration.rs:23-30`).

### Backup strategy

Layered: (1) DB SQL export/import with table filtering — sync exports skip ephemeral tables (`SYNC_SKIP_TABLES`: proxy_request_logs, stream_check_logs, provider_health, proxy_live_backup, usage_daily_rollups, `database/backup.rs:14-19`); sync imports preserve local-only tables from the device snapshot (`SYNC_PRESERVE_TABLES`, `:22-33` + `import_sql_string_for_sync`, `:87-92`); (2) user-managed DB backups: list/restore/rename/delete (`:516-668`); (3) automatic pre-migration backup on schema upgrade; (4) skill-dir backups on uninstall/update with restore (`services/skill.rs:1230-1355`); (5) `proxy_live_backup` table preserving each app's pre-takeover live config (test at `services/provider/mod.rs:560+` asserts the original config is preserved).

### Bidirectional sync (conflicts?)

Two directions exist — DB→live (projection/converge, e.g. `services/mcp.rs:180-203`, `sync_current_to_live`, `services/provider/live.rs:975`) and live→DB (import/backfill, `import_default_config` `live.rs:1121`, prompt backfill `services/prompt.rs:74-115`, skill `import_from_apps` `skill.rs:1447`). But there is **no three-way merge or conflict UI**: live→DB import is an explicit user action, and DB→live sync overwrites. Conflict mitigation is limited to: backfill-before-overwrite for prompts; the "prefer validated local settings over DB is_current" heuristic for provider activation (`services/provider/mod.rs:1167`); and Cloud-sync conflict avoidance via ETag tracking + skip/preserve table partitioning rather than row-level merge (`services/webdav_sync.rs:91-153`, `database/backup.rs:14-33`).

### Session discovery (does it read session stores? which apps?)

Yes — `session_manager/mod.rs::scan_sessions` (`:58-91`) spawns six parallel scans: **Codex, Claude Code, OpenCode, OpenClaw, Gemini, Hermes** (Claude Desktop has no session provider). Sources are native stores: Claude reads JSONL files under the Claude config `projects/` dir (`session_manager/providers/claude.rs:14-27`); OpenCode and Hermes sessions are SQLite-backed, signalled by a `"sqlite:"`-prefixed `source_path` with dedicated loaders (`session_manager/mod.rs:95-101`). Each `SessionMeta` carries title/summary/project dir/`last_active_at` and a `resume_command` (`:11-29`); the app can browse, search, delete, and re-open sessions in a terminal (`session_manager/terminal/`, PRD `session-manager.md`: "一键复制 / 一键终端恢复"). This is strictly read/observe/delete — it does not write into sessions or transfer them.

### App-specific service bloat (how per-app code scales, what the code admits)

The per-app `match` pattern replicates across the codebase: `app_config.rs` (1,183 lines) hosts `AppType` plus per-app config modules (`claude_desktop_config.rs`, `codex_config.rs`, `gemini_config.rs`, `openclaw_config.rs`, `opencode_config.rs`, `hermes_config.rs`, `claude_mcp.rs`, `gemini_mcp.rs`, `claude_plugin.rs`, `codex_history_migration.rs`); `services/provider/mod.rs` alone is 2,780 lines with dozens of per-app arms; `services/` has per-app files (`session_usage_codex.rs`, `session_usage_gemini.rs`, `session_usage_opencode.rs`); each new app touched ~10 modules (config, MCP writer/remover, skills dir, session provider, usage reader, env manager, overrides in settings). The code itself admits the scaling cost: `lib.rs` (1,910 lines) registers ~35 command modules (`commands/` dir listing); deprecated v3.6.x compatibility shims are kept alive with `[deprecated(since = "3.7.0", note = "Use get_all_servers instead")]` and "已废弃，将在 v4.0 移除" comments (`services/mcp.rs:207-240`); capability gaps are handled by per-arm skip logs rather than a capability table (`services/mcp.rs:117-121,134-138`).

## Patterns worth borrowing for Agent-Box

1. **SQLite authority with dry-run migration and pre-migration backups** — `database/migration.rs:7-30`, `database/mod.rs:123-138` → owner: **profile-store** (Agent-Box's profile/credential registry should validate migrations in an in-memory copy before committing, and snapshot before upgrading).
2. **Per-app enablement as columns + converge-to-DB projection loop** (`database/schema.rs:64-106`; `services/mcp.rs:180-203` syncs enabled servers and *removes* disabled ones per app) → owner: **resource-projector** (projection must be a full convergence pass — including deletion of previously projected resources that were disabled — not just additive writes).
3. **SSOT dir + symlink-with-copy-fallback + content-hash update detection** (`services/skill.rs:480-493,1586-1650,830`) → owner: **resource-projector** (exactly the skills-projection model Agent-Box needs; note the SSOT location can be the standard `<user-home>/.agents/skills`).
4. **Backfill-before-overwrite protection for human-editable projected files** (`services/prompt.rs:74-115`) → owner: **resource-projector** (when a projected file like CLAUDE.md/AGENTS.md was edited locally, capture the edit into the store or a backup before clobbering).
5. **Ephemeral vs authoritative table partitioning for sync/export** (`database/backup.rs:14-33`) → owner: **observation-envelope** (logs/health/rollups are device-local and excluded from portable exports; Agent-Box observation data should be tagged exportable vs local).
6. **Atomic write with deterministic key-sorted JSON and permission preservation** (`config.rs:180-265`) → owner: **credential-materializer** and **resource-projector** (baseline discipline for every file Agent-Box writes into harness homes).
7. **Takeover with live-config backup + hot-switch through a local proxy** (`proxy_live_backup` table; `services/provider/mod.rs:1646-1650`) → owner: **runtime-host-protocol** (a proxy indirection layer lets Agent-Box switch credentials/providers without rewriting or relaunching harness processes).
8. **Parallel read-only session-store scanning with per-provider adapters and typed `SessionMeta`** (`session_manager/mod.rs:11-91`) → owner: **terminal-session-protocol** (resume commands and project-dir metadata are the useful bits for Agent-Box session continuity).

## Anti-patterns / risks observed

- **Enum-driven per-app explosion**: adding the 8th app means editing ~10+ modules of `match AppType` arms, new `enabled_<app>` columns in two tables (a schema migration), and a new config module — no adapter trait or capability registry exists. Compare agent-harness's data-driven (if still enum-locked) `ProviderDefinition`.
- **Overwrite-based "bidirectional sync"**: no merge, no conflict markers, no UI for divergent edits; users who edit `config.toml` by hand while CC Switch manages it can lose edits silently on the next sync (prompt backfill is the only resource family with explicit protection).
- **Sponsor-heavy README/UX**: the README's top ~150 lines are affiliate sponsor banners; preset links carry referral codes (last commit is literally "add Kimi affiliate links"). Trust/monetization noise a neutral tool should avoid.
- **Compatibility shims accumulate**: deprecated v3.6.x MCP command surface still present, promised removal in v4.0 (`services/mcp.rs:207-240`) — a reminder that CLI/API compat needs a real removal process.
- **Windows atomicity is degraded**: remove-then-rename is not atomic and can lose the file on crash between the two steps (`config.rs:251-257`).
- **Schema-as-column-per-app** (`enabled_claude`, `enabled_codex`, ...) means every new app changes the DB schema and all row shapes — versus a normalized `resource_targets(app, resource_id)` table.

## Verification status

- Verified from source read (file:line above): full SQLite schema; `SCHEMA_VERSION` and migration flow incl. dry-run; `atomic_write` (all branches incl. Windows); backup/sync table partitioning; skills SSOT + symlink/copy + hash update + import-from-apps; MCP per-app sync + skips; prompt backfill; provider live write/switch + `is_current` heuristic + proxy hot-switch; session manager scan/load/delete for 6 providers incl. SQLite-backed ones; `AppType` enum; universal providers; deprecated compat shims; takeover test asserting live-backup behavior.
- Verified from README/docs only: 7-app/50+ preset marketing claims, proxy features (failover/circuit breaker/health monitoring details), usage dashboard, WebDAV/S3/Deep Link features, platform install instructions, session-manager PRD scope ("v1 macOS only").
- Not verified: frontend React code (only file listing); proxy implementation internals (`src-tauri/src/proxy/` not read); actual runtime behavior (no GUI execution); upstream farion1231/cc-switch repo directly (only this mirror); GitHub issue #4834 referenced in code comments.
