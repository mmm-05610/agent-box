# ZCode — Harness Native Assessment

- Candidate id: `zcode` (requested alias "Zcode CLI")
- Researched: 2026-09-01 (desk research + local layout observation; no binary probing possible)
- Evidence kinds used: OFFICIAL_DOC, CLI_OBSERVED (layout names only), INFERENCE, PEER_PROJECT

## Identity

CONFIRMED (product), with an important caveat: **no standalone public CLI is documented.**

- Official name: **ZCode** — "an Agentic Development Environment (ADE) built to bring GLM-5.3 into real coding workflows". Official docs: https://zcode.z.ai/en/docs/welcome (OFFICIAL_DOC, 2026-09-01, v3.10.2, confidence HIGH, stability VERSION_SENSITIVE).
- Maintainer: **Z.ai (Zhipu AI)** — evidenced by zcode.z.ai and docs.z.ai/devpack/tool/zcode ("ZCode integrates AI agents into your existing toolchain"), downloads hosted on cdn-zcode.z.ai, account binding to BigModel/Z.ai (OFFICIAL_DOC, 2026-09-01, HIGH).
- Distribution: desktop installers only, v3.10.2 labeled "Latest" (OFFICIAL_DOC, https://zcode.z.ai/en/docs/install, 2026-09-01, HIGH): macOS arm64/x64 .dmg, Windows x64/arm64 .exe, Linux x64 AppImage (page claims deb/rpm and Linux ARM64 support but shows no URLs). All under `cdn-zcode.z.ai/zcode/electron/releases/3.10.2/` — Electron app ("electron" in URL path).
- Official repository: **NONE FOUND** (closed source presumed; INFERENCE, LOW). No GitHub org/repo for ZCode itself was located. The npm package `zcode-app-cli` is explicitly **unofficial** ("terminal client for the agent runtime shipped with ZCode Desktop", libraries.io/npm/zcode-app-cli, PEER_PROJECT, MEDIUM) — do not confuse with an official CLI.
- Alias mapping: request name "Zcode CLI" / binary `zcode` → official product "ZCode" (Z.ai). A third-party GitHub issue also calls `zcode` "Zhipu AI's command-line interface tool" (github.com/nexu-io/open-design/issues/4692, PEER_PROJECT, MEDIUM), consistent with an internal/undocumented CLI runtime inside the desktop product. The `zcode` binary is NOT on PATH in this environment; the desktop app embeds a CLI-side runtime (observed layout below).

## Admission criteria

1. **Official stable CLI exists?** — NO (as of 2026-09-01). Official docs describe only a desktop ADE; no CLI binary name, npm package, pip package, or headless invocation is documented anywhere on zcode.z.ai/en/docs or docs.z.ai/devpack/tool/zcode (OFFICIAL_DOC, HIGH). Version source: download page version stamp (3.10.2 "Latest"). Release cadence: not documented.
2. **Non-interactive/headless launch mode?** — UNKNOWN (never false). Not documented in official docs; no flags can be cited. The session running this research is executed by the ZCode harness with subagent sessions, but that runtime exposes no public CLI contract (INFERENCE, LOW).
3. **Parseable structured output?** — UNKNOWN. Not documented. (Docs describe a GUI "Usage Stats" page; no machine-readable output mode.)
4. **Explicit config/credential/session boundaries?** — PARTIAL (config yes; headless boundaries no):
   - User config: `<user-home>/.zcode/cli/config.json` — hooks must set `hooks.enabled: true` there (OFFICIAL_DOC, https://zcode.z.ai/en/docs/hooks, 2026-09-01, HIGH).
   - Custom commands: `<user-home>/.zcode/commands` (user scope) and project-directory workspace scope; built-in `/goal`, `/compact` (OFFICIAL_DOC, https://zcode.z.ai/en/docs/commands, HIGH).
   - Project-level hook configs (`<workspace>/.zcode/config.json`, `<workspace>/zcode.json`) are **ignored entirely** for security (logged as `config_project_hooks_ignored`); team sharing goes through plugins (OFFICIAL_DOC, HIGH, STABLE-ish — behavior doc says "current version").
   - Credentials: GUI binding of BigModel/Z.ai account; API key entry via Settings → Model Providers (OpenAI base URL `https://api.z.ai/api/coding/paas/v4`, Anthropic base URL `https://api.z.ai/api/anthropic`) (OFFICIAL_DOC, docs.z.ai/devpack/tool/zcode, HIGH). Storage mechanism undocumented.
   - Session storage (CLI_OBSERVED, layout names only, HIGH for existence, MEDIUM for semantics): `<user-home>/.zcode/cli/agents/sess_<uuid>/`, `<user-home>/.zcode/cli/rollout/model-io-sess_<uuid>.jsonl`, `<user-home>/.zcode/cli/db/db.sqlite` (+ -shm/-wal), `<user-home>/.zcode/cli/exec/sess_*/`, `<user-home>/.zcode/cli/artifacts/sess_*/`.
   - Full locally observed config surface (CLI_OBSERVED, names only, 2026-09-01): `<user-home>/.zcode/{cli,server,tmp,v2}`; `cli/{agents,artifacts,db,exec,image-cache,log,plugins,rollout}`; `log/zcode-YYYY-MM-DD.jsonl`; `plugins/{cache,data,marketplaces}` with `cache/zcode-plugins-official/<plugin>/<version>/skills/...`; `server/zcode-server.cjs` (+ `server/{agents,build,node,tools}` — Node-bundled server); `v2/{certs,tasks-index.sqlite*,telemetry-state.json}`; `tmp/prompt-attachments`.
5. **Facts verifiable WITHOUT reading credentials?** — YES. All above from directory NAME listing and official docs; no file contents or credential material read.
6. **Clear maintainer + version source?** — Maintainer: YES (Z.ai). Version source: PARTIAL — download page version stamp (3.10.2); no changelog or versioned release notes found for the app itself.
7. **Maps to generic runtime composition (spawn process, argv, cwd, env, structured stdout)?** — NOT ESTABLISHED. No documented argv contract or stdout protocol. Blocking quirks: GUI/Electron desktop dependency, closed source (INFERENCE, MEDIUM).
8. **Full coding harness?** — YES as a product: ZCode Agent with execution modes, subagents, hooks (7 events: SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest, PostToolUse, PostToolUseFailure, Stop), skills, plugins, MCP, commands, memory, safety confirmation (OFFICIAL_DOC, welcome/agents/hooks/plugin/skill/mcp-services pages, HIGH). But it is a desktop ADE, not a scriptable CLI harness.

## Tier decision

**Tier C — identity-only registration; not recommended for the formal Registry.**

Justification: identity, maintainer, and product shape are confirmed from official sources, and a config-surface layout was observed locally — but admission criteria 1-3 (stable standalone CLI, headless mode, structured output) all fail/unknown and there is no official repository or license. Without a spawn/argv/structured-stdout contract, no generic Adapter can be built. If Z.ai later ships a documented `zcode` CLI, re-assess (the internal `~/.zcode/cli` runtime suggests one exists behind the desktop app).

## Key native facts (verified depth)

- Hooks engine (OFFICIAL_DOC, https://zcode.z.ai/en/docs/hooks, 2026-09-01): 7 events; matcher grammar = missing/`*` matches all, `Name|Name` exact list, otherwise JavaScript regex (invalid regex skipped with diagnostic); hook type `process` with `command`, `args`, `enabled`, `timeoutMs`; order = user hooks then enabled plugin hooks; per-session config snapshot at startup.
- Legacy `.agents/settings.json` / `.claude/settings.json` are displayed read-only, NOT executed (OFFICIAL_DOC, hooks page, HIGH).
- Commands: markdown-defined `/commands` at user (`<user-home>/.zcode/commands`) and workspace scope; import from Claude Code (OFFICIAL_DOC, commands page, HIGH).
- Model endpoints for GLM Coding Plan: `https://api.z.ai/api/coding/paas/v4` (OpenAI-compatible) and `https://api.z.ai/api/anthropic` (OFFICIAL_DOC, docs.z.ai/devpack/tool/zcode, HIGH, STABLE).
- Plugin marketplace cache layout: `<user-home>/.zcode/cli/plugins/cache/zcode-plugins-official/<plugin>/<version>/` containing `skills/<skill>/SKILL.md` (CLI_OBSERVED, HIGH for layout).

## Unresolved

- Whether an official `zcode` CLI binary is or will be distributed separately (name, npm/channel, headless flags) — UNKNOWN.
- Credential file location/format for CLI-side runtime — UNKNOWN (deliberately not inspected).
- License of the desktop app (no license document found) — UNKNOWN.
- Linux deb/rpm and Linux ARM64 installer URLs — claimed by docs but not shown on install page.
- Exact semantics of `cli/rollout/*.jsonl` and `v2/tasks-index.sqlite` (existence observed, contents not read) — UNKNOWN.
- Release cadence and changelog for the desktop app — UNKNOWN.
