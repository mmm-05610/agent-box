# Grok Build — Harness Native Assessment

- Candidate id: `grok-build`
- Researched: 2026-09-01 (official docs, official source clone read-only, registry/press checks; binary not installed locally)
- Evidence kinds used: OFFICIAL_DOC, OFFICIAL_SOURCE, RELEASE_NOTE (via search index), PEER_PROJECT, INFERENCE

## Identity

CONFIRMED.

- Official name: **Grok Build**, binary **`grok`**. README: "Grok Build (`grok`) is SpaceXAI's terminal-based AI coding agent ... full-screen TUI ... interactively, headlessly for scripting/CI, or embedded in editors via the Agent Client Protocol (ACP)" (OFFICIAL_SOURCE, <temp-home>/grok-build-inspect/README.md, clone of main @ SOURCE_REV d761e8ba538084df023de79d26892eaf73ed7411, 2026-09-01, HIGH). "SpaceXAI" is the org's own branding in the README/asset URLs (media.x.ai/.../spacexai-...) — treat xAI/SpaceXAI as the same vendor.
- Maintainer: **xAI** (official docs at docs.x.ai/build/overview; install scripts hosted at x.ai/cli; model via xAI API) (OFFICIAL_DOC, 2026-09-01, HIGH).
- Official repository: **https://github.com/xai-org/grok-build** — full Rust source repo (Cargo workspace), Apache-2.0 for first-party code (vendored ports of openai/codex and sst/opencode tools keep original licenses; see THIRD-PARTY-NOTICES), external contributions not accepted, no GitHub Releases used (OFFICIAL_SOURCE + repo page, 2026-09-01, HIGH).
- Distribution: shell/PowerShell installers `curl -fsSL https://x.ai/cli/install.sh | bash` (macOS/Linux/Git Bash) and `irm https://x.ai/cli/install.ps1 | iex` (Windows); build-from-source via Cargo (DotSlash + protoc needed). No npm package mentioned anywhere (OFFICIAL_DOC, docs.x.ai/build/overview + README, HIGH).
- Version source: official changelog https://x.ai/build/changelog (HTTP 403 to direct fetch; search index shows "Grok Build 0.2.97" entries ~2026-08) (RELEASE_NOTE via WebSearch, MEDIUM). Source `xai-grok-version` crate stamps `"<version> (<shortcommit>)"` and formats channel labels like `"0.2.5 [stable]"` (OFFICIAL_SOURCE, crates/codegen/xai-grok-version/src/lib.rs:11-44). docs.x.ai/developers/release-notes states Grok Build is in **beta** (OFFICIAL_DOC, MEDIUM). Third-party blog claims v1.0.4 exists (kie.ai, PEER_PROJECT, LOW) — exact latest version UNRESOLVED. Cadence: high-frequency (100+ changelog entries per community accounts, PEER_PROJECT, LOW).

## Admission criteria

1. **Official stable CLI exists?** — YES, beta-labeled but real and widely shipped: `grok`, xAI, repo github.com/xai-org/grok-build, Apache-2.0, installers + cargo; docs.x.ai/build reference docs live (OFFICIAL_DOC/OFFICIAL_SOURCE, 2026-09-01, HIGH). Latest version: ~0.2.97 (official changelog index, Aug 2026); exact latest unresolved.
2. **Non-interactive/headless launch mode?** — YES, documented: `grok -p "prompt"` (`-p, --single <PROMPT>`), plus `--prompt-json`, `--prompt-file`, `--json-schema`, `-m/--model`, `--cwd <PATH>`, `--always-approve`, `--permission-mode`, `--max-turns`, `--allow`/`--deny`, `-c/--continue`, `-r/--resume <ID>`, `-s/--session-id <ID>`, `--fork-session`, `--no-alt-screen`, `--no-auto-update` (OFFICIAL_DOC, docs.x.ai/build/cli/headless-scripting + docs.x.ai/build/overview, 2026-09-01, HIGH; corroborated by OFFICIAL_SOURCE crates/codegen/xai-grok-pager/src/app/cli.rs:475-476 for `-p`/`--single`, and app/cli.rs arg table for the rest).
3. **Parseable structured output?** — YES, best-in-class among candidates researched today: `--output-format plain|json|streaming-json` documented (OFFICIAL_DOC, HIGH); source adds a 4th value `streaming-messages-json` (NDJSON in Anthropic Messages API wire format) (OFFICIAL_SOURCE, crates/codegen/xai-grok-pager/src/headless/cli.rs:8-18, HIGH but VERSION_SENSITIVE). `streaming-json` = newline-delimited JSON, one ACP session update per line; event kinds enumerated in source `StreamEvent`: `AgentMessage`, `AgentThought`, `ToolCall` (tool_call_id, title, tool_kind, status, tool_name, raw_input, content, locations), `ToolCallUpdate` (status, raw_output, locations), `Plan`, `AvailableCommands{tools,commands,skills}`, `Lifecycle{CompactStarted/CompactCompleted/CompactFailed/CompactCancelled/AutoContinue,...}`, `ResponseStarted{message_id,model,input_tokens,cache_*}`, `ReasoningCompleted{signature}`, `ResponseCompleted{message_id,stop_reason,usage,signature,stop_sequence}` (OFFICIAL_SOURCE, crates/codegen/xai-grok-pager/src/headless/reducer/mod.rs:41-110,314-322, HIGH, VERSION_SENSITIVE). Changelog: "Headless JSON output now includes token usage and cost per prompt and session" (RELEASE_NOTE via search, MEDIUM).
4. **Explicit config/credential/session boundaries?** — YES:
   - Config: `~/.grok/config.toml` (user; `[cli] auto_update`, `[models] default`, `[model.<name>]` with `model/base_url/name/env_key`), `~/.grok/pager.toml` (appearance, hot-reload), `managed_config.toml` referenced in docs index (OFFICIAL_DOC overview/headless-scripting + OFFICIAL_SOURCE config_toml_edit.rs:29, app_view.rs:1176, app_view.rs:632; HIGH).
   - Credentials: `grok login` browser OAuth flow; headless/non-browser via `export XAI_API_KEY="xai-..."`; CLI flags `--oauth`, `--device-auth`, `--reauth`; logout subcommand; bearer auth to `cli-chat-proxy.grok.com/v1/responses` (OFFICIAL_DOC + OFFICIAL_SOURCE app/cli.rs, error_display.rs:769; HIGH). Category: env-var key OR OAuth token store under ~/.grok.
   - Sessions: `~/.grok/sessions` (OFFICIAL_DOC, headless-scripting, HIGH); subcommands `sessions`, `export`, `share`, `usage`; flags `-s/--session-id`, `-r/--resume`, `-c/--continue`, `--fork-session`; non-blocking flock on ~/.grok in headless exit path (OFFICIAL_SOURCE headless.rs:1267, MEDIUM).
5. **Facts verifiable WITHOUT reading credentials?** — YES. All flags/paths from docs and source; no credential contents read; binary not even installed.
6. **Clear maintainer + version source?** — YES: xAI; versions via x.ai/build/changelog + `grok --version`; repo SOURCE_REV pins the source commit.
7. **Maps to generic runtime composition?** — YES cleanly: spawn `grok -p <prompt> --output-format streaming-json` with cwd via `--cwd`, env `XAI_API_KEY`, parse NDJSON stdout, exit code. Quirks: interactive mode is a fullscreen TUI (alt-screen) — use headless mode for automation (no pty needed documented); `--no-alt-screen` exists for constrained terminals; open source (Rust), no GUI dependency for headless. ACP mode (`session/prompt`, `session/update` with `sessionUpdate:"agent_message_chunk"`, `stopReason`) available for editor embedding (OFFICIAL_DOC, HIGH).
8. **Full coding harness?** — YES: edits files, executes shell, web search, subagents, plan mode, skills/commands/plugins/hooks surfaces (`grok inspect` shows "config sources, instructions, skills, plugins, hooks, and MCP servers"), MCP client, permission system (`--permission-mode`, `--allow`/`--deny`, `--always-approve`, `--trust`), memory, worktrees (OFFICIAL_DOC overview + OFFICIAL_SOURCE subcommand list, HIGH).

## Tier decision

**Tier A — full Adapter candidate; recommended for formal support (pending one live smoke test).**

Justification: official docs + official source agree on every adapter-relevant fact: argv contract, four output formats with a fully enumerated NDJSON event schema, config/credential/session paths, permission controls, and env overrides. The only missing input is a live binary run (binary not installed in the observation environment; no global installs permitted), which is a smoke test, not a research gap. Caveat: product is beta-labeled and event schema is VERSION_SENSITIVE — pin adapter behavior to observed versions.

## Key native facts (verified depth)

- Headless one-shot: `grok -p "Explain this codebase" --output-format streaming-json -m <model>`; headless sessions resume with `-c`/`-r <ID>`/`-s <ID>`.
- Output formats (source of truth): `plain` (default), `json`, `streaming-json` (NDJSON ACP session updates — "the agent's native format"), `streaming-messages-json` (NDJSON Anthropic Messages wire format) — headless/cli.rs:8-18.
- `--json-schema <SCHEMA>` enforces a JSON Schema on the final answer (headless/cli.rs:25-33).
- Prompt can be text, ACP content blocks via `--prompt-json '[...]'` or `{"type":"acp","content":[...]}`, or `--prompt-file <path>` (.json parsed as content blocks) (headless/cli.rs:38-120).
- Custom model providers in `~/.grok/config.toml` via `[model.my-model]` (`model`, `base_url`, `name`, `env_key`) + `[models] default = "my-model"` — i.e., BYO OpenAI-compatible endpoint with per-model env-key indirection (OFFICIAL_DOC overview, HIGH).
- Subcommand surface (source app/cli.rs:10-148): login, logout, models, sessions, usage, export, share, trace, mcp, plugin, memory, inspect, doctor, setup, update, version, completions, worktree, disk-usage, workspace, agent, leader, dashboard.
- `grok inspect` = diagnostics dump of config sources/instructions/skills/plugins/hooks/MCP servers (OFFICIAL_DOC overview, HIGH).
- Update channel control: `--no-auto-update` flag and `[cli] auto_update = false` in config.toml (OFFICIAL_DOC, HIGH).

## Unresolved

- Exact latest version and whether 1.0.x is GA (changelog page returns 403 to automated fetch; search-index shows 0.2.97 ~Aug 2026; third-party claims 1.0.4) — needs a manual browser check or `grok --version` after install.
- Full JSON field casing/shape of each streaming event as actually emitted (enum read from source; wire casing not captured) — mark VERSION_SENSITIVE until a live capture.
- Session file format inside `~/.grok/sessions` (undocumented).
- Credential token store path/format (deliberately not inspected).
- Windows behavior parity (docs show install.ps1; headless flags not re-verified per-OS).
