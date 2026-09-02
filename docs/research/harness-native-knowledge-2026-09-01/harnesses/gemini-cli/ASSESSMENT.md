# ASSESSMENT — Gemini CLI (harness id: gemini-cli)

Verified 2026-09-02. Evidence: `FACTS.md` (facts), `evidence.md` (per-fact citations), `../experiments/candidates-2.md` (probe log). All paths sanitized per SOURCE_POLICY.

## Identity

- Canonical name: **Gemini CLI**, npm package `@google/gemini-cli`, binary `gemini` (bin entry `bundle/gemini.js`).
- Maintainer: Google (github.com/google-gemini org; npm maintainers google-wombot/ofrobots/mrdoob, publisher google-wombot).
- Repository: https://github.com/google-gemini/gemini-cli — license **Apache-2.0**.
- Latest stable: **0.58.0** (npm registry latest, 2026-09-02; `gemini --version` observed `0.58.0` from isolated npm install). Repo main at `0.59.0-nightly.20260825.g812f7a2bc` (commit 4963a4456, 2026-09-01): nightly + stable cadence, very active.
- Engines: node >= 20.
- Docs: published from the repo `docs/` tree (geminicli.com per in-repo links); `docs/cli/*.md` are first-party reference pages.

## Admission criteria (8 answers)

1. **Official stable CLI?** YES. Google-maintained Apache-2.0 monorepo, npm stable channel + nightly channel, semver 0.x currently, weekly-ish releases with changelogs (docs/changelogs/). Version source: npm registry + `--version` probe. HIGH confidence.
2. **Non-interactive launch?** YES. `gemini -p|--prompt "..."` (headless; also auto-triggered in non-TTY). Prompt can also arrive on stdin (appended). Positional query now defaults to interactive (startup notice observed in source; `-p` is the documented headless path). `--output-format` selects text|json|stream-json. Exit codes documented: 0 success / 1 general error / 42 input error / 53 turn limit exceeded. HIGH.
3. **Parseable structured output?** YES. `--output-format json` → single JSON object `{response, stats, error(, warnings, session_id)}`; `--output-format stream-json` → NDJSON events typed `init|message|tool_use|tool_result|error|result` each with `timestamp`; `result` carries aggregated stats incl. per-model token breakdown. Verified in source (packages/core/src/output/types.ts) AND official docs (docs/cli/headless.md). HIGH; VERSION_SENSITIVE (0.x).
4. **Explicit config/credential/session boundaries?** YES. Config: user `~/.gemini/settings.json` (JSONC tolerated), workspace `<project>/.gemini/settings.json`, system `/etc/gemini-cli/settings.json` + `system-defaults.json` (+ env overrides `GEMINI_CLI_HOME`, `GEMINI_CLI_SYSTEM_SETTINGS_PATH`, `GEMINI_CLI_TRUSTED_FOLDERS_PATH`). Credentials: `~/.gemini/oauth_creds.json`, `google_accounts.json`, `mcp-oauth-tokens.json`, `installation_id` (never read; names only) + env keys. Sessions: `~/.gemini/tmp/<project_hash>/chats/`, checkpoints `~/.gemini/tmp/<project_hash>/checkpoints/`. HIGH.
5. **Verifiable without reading credentials?** YES. All probes done with a fresh temp HOME (`gemini --version/--help/--list-sessions` ran unauthenticated; startup writes only `projects.json`, `history/`, `tmp/`). Credential file names obtained from source constants, contents never read.
6. **Clear maintainer + version source?** YES. Google org + npm maintainers; version from registry/latest + local `--version`.
7. **Maps to generic runtime composition?** YES. spawn + argv + cwd + env + structured stdout; no pty required for `-p` headless (docs: triggered in non-TTY); TUI mode is ink/alt-screen but never needed for automation. Blockers: none. Minor caveats: trust/workspace prompts (folder trust) exist but `--skip-trust` and settings can bypass; auth error before model call exits non-zero without network.
8. **Full coding harness vs model chat CLI?** FULL coding harness: file tools, shell tool, MCP, skills, hooks, extensions, subagents (agents/*.md), checkpoints/rewind, worktrees, policy engine, sandbox flag, GEMINI.md memory.

## Tier decision: **A**

Official docs + official source (main @ 4963a4456, 2026-09-01) + isolated CLI probes (0.58.0) agree on launch modes, JSON/stream-json event schema, exit codes, settings scopes, credential file names, session/checkpoint layout, and resource surfaces. No admission criterion fails. Full Adapter candidate; recommended for formal support consideration.

## Key native facts (condensed; full detail in FACTS.md)

- Launch modes: TUI (default, ink), headless `-p` (text|json|stream-json), `-i/--prompt-interactive`, `--acp` (Agent Client Protocol over stdio), subcommands `mcp|extensions|skills|hooks|gemma`.
- Approval: `--approval-mode default|auto_edit|yolo|plan` (plan = read-only; new in 0.58+), legacy `-y/--yolo`; deprecated `--allowed-tools` superseded by policy engine (`--policy`, `--admin-policy`).
- Sessions: `--resume/-r latest|<index|uuid>`, `--session-id`, `--session-file`, `--list-sessions`, `--delete-session`.
- Config precedence: System Defaults → System → User → Workspace (settings.ts merge order), CLI flags top; JSONC comments preserved by settings writer.
- Credentials/auth: Google OAuth (Login with Google, interactive only), `GEMINI_API_KEY`, `GOOGLE_GENAI_USE_VERTEXAI`/`GOOGLE_CLOUD_PROJECT`/`GOOGLE_CLOUD_LOCATION`, `GOOGLE_GENAI_USE_GCA`; env fallback order read from env before settings; headless usage requires API key or Vertex per docs.
- Resource surfaces: GEMINI.md (global ~/.gemini/GEMINI.md, project + ancestor chain, subdirectory scans), `.geminiignore`; custom slash commands as TOML files in `~/.gemini/commands/` + `.gemini/commands/` (+ extensions); skills (user `~/.gemini/skills`, agent-skills `~/.agents/skills`, workspace, extensions); hooks (project hooks + `gemini hooks` CLI); MCP servers via settings `mcpServers` + `gemini mcp` CLI + `--allowed-mcp-server-names`; extensions with user/workspace scopes + registry URI; subagents as `agents/*.md` (user `~/.gemini/agents`, extensions); checkpointing (settings key; `--checkpointing` flag removed) with restore + /rewind; sandbox `-s`; experimental `--worktree`.
- System prompt override: `GEMINI_SYSTEM_MD` (=1 → ~/.gemini/system.md, or absolute path).

## Unresolved

- `stats` object exact field list (SessionMetrics serialization) not fully enumerated.
- Whether `--output-format json` also works in TTY/interactive runs (documented for headless; TTY behavior unverified).
- Exit code table beyond documented 0/1/42/53 (e.g., auth-failure code) — observed 41 once for `--list-sessions` without auth (VERSION_SENSITIVE, single observation).
- Windows platform support status this round (docs exist; not re-verified).
- Behavior of `--session-file` JSON schema (not inspected).
