# FACTS — Gemini CLI (0.58.0 stable / main 4963a4456)

Verified 2026-09-02. `documented` = official docs; `observed` = isolated CLI probes on 0.58.0 with fresh temp HOME; `source` = repo source (shallow clone, main @ 2026-09-01). Full citations in `evidence.md`.

## Legend

- **D** documented (OFFICIAL_DOC) · **O** observed (CLI_OBSERVED) · **S** source (OFFICIAL_SOURCE) · confidence/stability per item in evidence.md.

## A. Identity & Distribution

- A1 Name/binary: `@google/gemini-cli`, bin `gemini`; Google (google-gemini org), Apache-2.0, node >=20. (D/O)
- A2 Stable 0.58.0 (npm latest; `--version` output). Main at 0.59.0-nightly.20260825 — nightly + stable channels, active changelogs. (O/S)
- A3 Monorepo: packages/cli, packages/core, a2a-server, sdk. Docs tree in-repo (`docs/cli/...`). (S)

## B. Executable Discovery

- B1 npm global bin `gemini` → `bundle/gemini.js` (Node). No arg0 helper binaries; no doctor subcommand. (O/S)
- B2 `--version` exit 0 unauthenticated; `--help` exits 0; invalid flag value → yargs error + usage, exit 1. (O)

## C. Launch Modes

- C1 TUI (default): ink alt-screen; positional query defaults to interactive (behavior change notice in source). Slash commands incl. `/mcp`, `/memory reload`, `/commands`, `/stats`, `/settings`, `/rewind`. (S/D/O)
- C2 Headless: `gemini -p <PROMPT>` (non-TTY auto-triggers); stdin appended; `-o text|json|stream-json`; exit codes 0/1/42/53 documented. (D/S/O)
- C3 `--prompt-interactive/-i`: run prompt then continue interactive. (S)
- C4 ACP: `--acp` (Agent Client Protocol stdio; `--experimental-acp` deprecated). (S)
- C5 Subcommands: `mcp`, `extensions`, `skills`, `hooks`, `gemma` (local Gemma routing). (S/O)
- C6 Sessions CLI: `--resume/-r latest|<index|uuid>` (empty → latest), `--session-id <uuid>`, `--session-file <json>`, `--list-sessions`, `--delete-session <index>`; mutually exclusive trio enforced by yargs check. (S)
- C7 Approval: `--approval-mode default|auto_edit|yolo|plan` (choices observed in binary validation error for the analogous qwen case; for gemini confirmed via source choices list + help); `-y/--yolo` legacy alias (mutually exclusive with --approval-mode). (S/O-help)
- C8 Policy engine: `--policy`/`--admin-policy` files-or-dirs; `--allowed-tools` deprecated. (S/D)

## D. Profile & Configuration

- D1 Homes: `<user-home>/.gemini` (GEMINI_CLI_HOME overrides home root); workspace `<project>/.gemini/`. (S)
- D2 Settings files: user settings.json, workspace settings.json, system `/etc/gemini-cli/settings.json` + `system-defaults.json` (+ env overrides GEMINI_CLI_SYSTEM_SETTINGS_PATH / GEMINI_CLI_SYSTEM_DEFAULTS_PATH). JSONC tolerated, comment-preserving writer. (S/D)
- D3 Merge order: System Defaults → System → User → Workspace (settings.ts:393-395). (S)
- D4 Trust: trustedFolders.json (+ path env override); untrusted workspaces restrict settings/tools; `--skip-trust` sets GEMINI_CLI_TRUST_WORKSPACE. (S/D)
- D5 Startup writes (fresh temp HOME, unauth `--list-sessions`): `.gemini/projects.json` (+ .tmp siblings), `.gemini/history/`, `.gemini/tmp/` — project registry; NO writes into the probed workspace. (O)

## E. Credentials

- E1 Files: oauth_creds.json (OAUTH_FILE), google_accounts.json, trustedFolders.json, installation_id, mcp-oauth-tokens.json, a2a-oauth-tokens.json — names only, contents never read. (S)
- E2 Env: GEMINI_API_KEY; GOOGLE_GENAI_USE_VERTEXAI; GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION (Vertex); GOOGLE_GENAI_USE_GCA; GOOGLE_API_KEY in AUTH_ENV_VAR_WHITELIST. Auth resolution: GCA > Vertex > GATEWAY > GEMINI_API_KEY. (S/D/O — auth error message printed the env names)
- E3 AuthType enum: LOGIN_WITH_GOOGLE, USE_GEMINI ('gemini-api-key'), USE_VERTEX_AI ('vertex-ai'), GATEWAY. (S)
- E4 Headless + Google login: not supported (docs: use API key or Vertex for headless). (D)

## F. State Isolation

- F1 Sessions: `<user-home>/.gemini/tmp/<project_hash>/chats/` (D); checkpoints `tmp/<project_hash>/checkpoints/` (D).
- F2 Copyable: settings/GEMINI.md/commands/skills/policies are static per profile. Never share: credential files (E1). Writable overlay needed: tmp/<project_hash>/, projects.json, history/, installation_id. (S/O)
- F3 `--session-file` enables external session JSON injection (schema unverified). (S)

## G. Native Resource Surfaces

- G1 Instructions: GEMINI.md — global `~/.gemini/GEMINI.md`; project cwd + ancestors to trusted root; subdirectory scans; name via settings.context.fileName; `.geminiignore` respected. (D)
- G2 Custom commands: `.toml` v1 prompt files; user `~/.gemini/commands/` < project `.gemini/commands/` (project wins); subdir namespacing; extension commands; `/commands list|reload`. (D/S)
- G3 Skills: user `~/.gemini/skills/`, agent skills `~/.agents/skills/` (Storage.getGlobalAgentsDir → `~/.agents`), workspace + extension skills; `gemini skills` CLI. (S)
- G4 MCP: settings `mcpServers`; `gemini mcp` CLI; `/mcp reload`; `--allowed-mcp-server-names`. (S/D)
- G5 Hooks: settings hooks + `gemini hooks` CLI + `/hooks`. (S/D)
- G6 Extensions: user/workspace scopes, enable/disable `--scope user|workspace`, registry URI env/settings. (D/S)
- G7 Subagents: `agents/*.md` markdown definitions at user `~/.gemini/agents/` and extension-provided. (S/D core/subagents.md)
- G8 Checkpointing: settings key (flag removed); /rewind restore. (D)
- G9 Sandbox: `-s/--sandbox` (seatbelt/docker per docs, unexercised). (S/D)
- G10 System prompt: GEMINI_SYSTEM_MD override. (D)
- G11 Experimental: `--worktree/-w` gated by experimental.worktrees. (S)

## H. Events & Observation (`--output-format json|stream-json`)

- H1 `json`: single object `{response, stats, error}` (docs) + optional session_id/warnings (source JsonOutput). (D/S)
- H2 `stream-json`: NDJSON `init{session_id,model}` → `message{role,content,delta?}` → `tool_use{tool_name,tool_id,parameters}` → `tool_result{tool_id,status,output?,error?}` → `error{severity,message}` → `result{status,error?,stats{...models breakdown}}`; every event has `type` + `timestamp`. (D/S)
- H3 ANSI sanitized in machine formats; `--raw-output` opt-out. (S)
- H4 Exit codes 0/1/42/53 documented. (D)
- H5 Session transcript: chats/ JSON; `result` event is the completion marker. (D/S)

## I. Runtime Control

- I1 Resume/fork: `--resume` (latest/index/uuid), `--session-file`, headless resume documented. (D/S)
- I2 Approvals in headless: cannot prompt; plan mode is the read-only posture; automation tutorial recommends approval-mode=yolo or tool allowlists for CI. (D)
- I3 Interrupt/steer for headless: unknown this round (interactive/Acp paths exist). (D-partial)

## J. Agent-Box Owner Mapping

| Fact cluster | Owner |
|---|---|
| Identity/version/channels (A) | harness-registry-declaration |
| npm discovery + `--version`/`--help` probe (B) | harness-native-adapter |
| Headless C2/C3/C6/C7/C8 argv+flags (launch) | harness-native-adapter |
| ACP mode C4 | runtime-host-protocol |
| Settings scopes/merge/trust (D) | profile-store — AUTHORITY_CONFLICT with harness-native-adapter (JSONC comment-preserving writer must not be flattened) |
| Credentials E | credential-materializer |
| Sessions/checkpoints/projects.json (F) | profile-store — AUTHORITY_CONFLICT with observation-envelope-candidate (session state) |
| GEMINI.md/.geminiignore/commands/skills/MCP/hooks/extensions/subagents (G) | resource-projector |
| json/stream-json envelopes (H) | observation-envelope-candidate |
| Exit codes + stderr split (H4/H) | terminal-session-protocol |
| Sandbox/worktrees/policy engine (C8/G9/G11) | sandbox-protocol |
| Resume/continuation (I) | host-control — AUTHORITY_CONFLICT with runtime-host-protocol (ACP owns interactive control) |
| npm install layout (A) | not-agent-box (environment concern) |

## UNRESOLVED

- stats field enumeration; json-in-TTY; full exit table (observed 41 single-shot); --session-file schema; Windows re-check; homebrew; concurrency semantics of tmp/<project_hash>.
