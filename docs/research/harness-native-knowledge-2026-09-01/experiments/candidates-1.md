# Experiments — Candidates (batch 1: zcode, grok-build, kilo-code)

Date: 2026-09-01. Environment: <user-home> workspace `<workspace>`. Read-only probes only; no model/API calls, no installs, no credential contents read. Sanitization: `/home/<user>` -> `<user-home>`, `/tmp` -> `<temp-home>`, workspace repo -> `<workspace>`, absolute binary paths -> `<binary>`.

## zcode

- P1 `command -v zcode` (also `zcode-cli`) -> NOT ON PATH. (CLI_OBSERVED, 2026-09-01)
- P2 Directory-name listing of `<user-home>/.zcode/` -> `cli/`, `server/`, `tmp/`, `v2/`. (CLI_OBSERVED, layout only)
- P3 `<user-home>/.zcode/cli/` names -> `agents/`, `artifacts/`, `db/`, `exec/`, `image-cache/`, `log/`, `plugins/`, `rollout/`. (CLI_OBSERVED)
- P4 Session artifacts named `sess_<uuid>` under `agents/`, `exec/`, `artifacts/`; `rollout/model-io-sess_<uuid>.jsonl`; `db/db.sqlite(+ -shm/-wal)`; `log/zcode-YYYY-MM-DD.jsonl`. (CLI_OBSERVED, names only)
- P5 `<user-home>/.zcode/cli/plugins/` -> `cache/zcode-plugins-official/<plugin>/<version>/skills/...` (observed plugins: android-emulator, browser-use, document-skills, ios-simulator, restore-legacy-sessions, skill-creator, zcode-guide), plus `data/`, `marketplaces/`. (CLI_OBSERVED)
- P6 `<user-home>/.zcode/server/` -> `zcode-server.cjs`, `agents/`, `build/`, `node/`, `tools/` (Node-bundled server runtime). `<user-home>/.zcode/v2/` -> `certs/`, `tasks-index.sqlite*`, `telemetry-state.json`. (CLI_OBSERVED, names only)
- P7 Official docs probe (WebFetch): zcode.z.ai/en/docs/welcome + /install + /commands + /hooks; docs.z.ai/devpack/tool/zcode -> desktop ADE only, v3.10.2 installers; NO CLI/headless/npm documented; project-level hook configs ignored by design. (OFFICIAL_DOC)
- Caveat: binary probing unavailable (binary not on PATH); all "CLI_OBSERVED" items are directory NAME listings only, file contents never read.

## grok-build

- P1 `command -v grok` / `grok-build` / `grok-cli` -> NOT ON PATH. NOT_LOCALLY_OBSERVED. (CLI_OBSERVED)
- P2 Shallow clone of official repo to `<temp-home>/grok-build-inspect` (read-only): README "Grok Build (grok) is SpaceXAI's terminal-based AI coding agent"; SOURCE_REV `d761e8ba...`; Apache-2.0 LICENSE; vendored ports of openai/codex + sst/opencode tools in THIRD-PARTY-NOTICES. (OFFICIAL_SOURCE)
- P3 Source read: `crates/codegen/xai-grok-pager/src/headless/cli.rs:8-18` -> OutputFormat { plain (default), json, streaming-json (NDJSON one ACP session update per line), streaming-messages-json (Anthropic wire NDJSON) }. (OFFICIAL_SOURCE)
- P4 Source read: `crates/codegen/xai-grok-pager/src/headless/reducer/mod.rs:41-110` -> StreamEvent enum (AgentMessage, AgentThought, ToolCall, ToolCallUpdate, Plan, AvailableCommands, Lifecycle, ResponseStarted, ReasoningCompleted, ResponseCompleted). (OFFICIAL_SOURCE)
- P5 Source read: `crates/codegen/xai-grok-pager/src/app/cli.rs:475-476` -> `-p` short / `--single` long confirmed; subcommands login/logout/models/sessions/usage/export/share/mcp/plugin/memory/inspect/doctor/trace/update/worktree/disk-usage/workspace/dashboard/agent. (OFFICIAL_SOURCE)
- P6 Source read: `crates/codegen/xai-grok-pager/src/config_toml_edit.rs:29` -> `~/.grok/config.toml`; `app_view.rs:1176` config loaded once at startup; `app_view.rs:632` `~/.grok/pager.toml` hot-reload; `headless.rs:1267` non-blocking flock on `~/.grok` in headless exit. (OFFICIAL_SOURCE)
- P7 Docs probe (WebFetch): docs.x.ai/build/overview + /build/cli/headless-scripting -> install scripts, `-p`, `--output-format`, `-m`, `-s/-r/-c`, `--cwd`, `--always-approve`, `XAI_API_KEY`, `~/.grok/sessions`, `grok inspect`. (OFFICIAL_DOC)
- P8 WebFetch `x.ai/build/changelog` -> HTTP 403 (automated fetch blocked); version data via search index only ("Grok Build 0.2.97", Aug 2026). (RELEASE_NOTE, MEDIUM confidence)
- No binary execution attempted; no installer run (no-global-install rule).

## kilo-code

- P1 `command -v kilo` / `kilo-code` / `kilocode` -> NOT ON PATH. NOT_LOCALLY_OBSERVED. (CLI_OBSERVED)
- P2 npm registry (WebFetch, registry.npmjs.org/@kilocode/cli): latest 7.5.6; dist-tags rc 7.5.3 / next 1.0.8 / alpha 0.0.5; license Apache-2.0; repository Kilo-Org/kilocode (directory: cli); maintainers emilie_kilo, melaniecrisseykilocodeai, catrielmuller, rso, brianc. (OFFICIAL_SOURCE)
- P3 Docs probe (WebFetch): kilo.ai/docs/code-with-ai/platforms/cli -> `kilo run [--auto]` exit codes 0/124/1, fail-closed auto-reject without --auto; `kilo serve|acp|attach|auth|session|export|import|models|stats|roll-call|daemon|github|pr|cloud`; config `~/.config/kilo/kilo.json[c]` + project `kilo.json[c]`/`.kilo/` (legacy opencode names read); env `KILO_CONFIG`, `KILO_CONFIG_CONTENT`, `KILO_PROVIDER`, `KILO_ORG_ID`. (OFFICIAL_DOC)
- P4 Repo probe (WebFetch): github.com/Kilo-Org/kilocode -> monorepo, FAQ "Kilo CLI is a fork of OpenCode"; README license MIT (conflicts with npm Apache-2.0 — UNRESOLVED); install matrix npm/curl/brew/AUR. (OFFICIAL_SOURCE)
- P5 Not installed (no-global-install rule); `kilo --version`, `kilo run --auto` live probes deferred to an isolated sandbox experiment.
