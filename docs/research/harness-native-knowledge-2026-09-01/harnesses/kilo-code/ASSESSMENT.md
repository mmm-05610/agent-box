# Kilo Code CLI — Harness Native Assessment

- Candidate id: `kilo-code`
- Researched: 2026-09-01 (official docs, npm registry, GitHub repo; binary not installed locally)
- Evidence kinds used: OFFICIAL_DOC, OFFICIAL_SOURCE (registry/repo metadata), PEER_PROJECT (OpenCode lineage), INFERENCE

## Identity

CONFIRMED.

- Official name: **Kilo Code CLI** (docs title "Run the AI Coding Agent from Your Terminal — Kilo Code CLI"; npm package description "Terminal User Interface for Kilo Code"; product page calls it "Open Source CLI Coding Agent"). Binary: **`kilo`** (OFFICIAL_DOC, https://kilo.ai/docs/code-with-ai/platforms/cli and https://kilo.ai/cli, 2026-09-01, HIGH).
- Maintainer: **Kilo (Kilo Code)** — kilo.ai; GitHub org **Kilo-Org**; npm maintainers `emilie_kilo`, `melaniecrisseykilocodeai`, `catrielmuller`, `rso` (+`brianc` in later versions) (OFFICIAL_SOURCE, registry.npmjs.org/@kilocode/cli, 2026-09-01, HIGH).
- Official repository: **https://github.com/Kilo-Org/kilocode** — monorepo (`packages/`); CLI published as `@kilocode/cli` from repo subdirectory `cli` (npm `repository.directory` = "cli"; repo listing shows `packages/` + `packages/kilo-jetbrains/`; both forms appear in different metadata — exact path unresolved but repo itself is confirmed) (OFFICIAL_SOURCE, HIGH).
- Lineage: repo FAQ: "Kilo CLI is a **fork of OpenCode**, enhanced to work within the Kilo agentic engineering platform" (OFFICIAL_SOURCE, repo README/FAQ, HIGH). Explains legacy `opencode.json[c]` config support and the ACP/serve surface. Config schema URL: `https://app.kilo.ai/config.json` (OFFICIAL_DOC, HIGH).
- Distribution: `npm install -g @kilocode/cli` (also pnpm/bun), `curl -fsSL https://kilo.ai/cli/install | bash`, Homebrew `Kilo-Org/tap/kilo`, AUR `kilo-bin`, plus GitHub-release baseline (no-AVX) builds e.g. `kilo-linux-x64-baseline.tar.gz` (OFFICIAL_DOC, HIGH). Requires Node.js v20+ (github.com/Kilo-Org/kilocode/issues/5780, OFFICIAL_SOURCE issue, MEDIUM).
- License: npm package metadata says **Apache-2.0**; repo README license section says **MIT**. Discrepancy UNRESOLVED — verify the LICENSE file for the cli package before redistribution decisions (OFFICIAL_SOURCE both, HIGH for the conflict, LOW for resolution).
- Version source: npm dist-tags — **latest 7.5.6**, rc 7.5.3, next 1.0.8, alpha 0.0.5 (registry.npmjs.org/@kilocode/cli, 2026-09-01, HIGH, VERSION_SENSITIVE). Cadence: frequent prerelease channels imply rapid releases; exact cadence not documented.

## Admission criteria

1. **Official stable CLI exists?** — YES: `kilo`, vendor Kilo/Kilo-Org, npm `@kilocode/cli` (latest 7.5.6) + installer + brew + AUR, repo Kilo-Org/kilocode, Apache-2.0(npm)/MIT(repo) license question pending, Node v20+ runtime (OFFICIAL_DOC + OFFICIAL_SOURCE, 2026-09-01, HIGH).
2. **Non-interactive/headless launch mode?** — YES, documented: `kilo run [message..]` (one-shot); `kilo run --auto "Implement feature X"` — autonomous mode, approvals from config, "CLI exits automatically when the task completes or times out"; without `--auto` a non-interactive run **auto-rejects any permission request** and exits `1` if it did; **exit codes: 0 success, 124 timeout, 1 error**; `kilo serve` = headless kilo server; `kilo acp` = Agent Client Protocol server; `kilo attach <url>` = connect to a running server; also `kilo daemon`, `kilo github` (GitHub agent), `kilo pr`, `kilo cloud` (OFFICIAL_DOC, https://kilo.ai/docs/code-with-ai/platforms/cli, 2026-09-01, HIGH).
3. **Parseable structured output?** — PARTIAL. No `--json` stdout flag for `kilo run` is documented (OFFICIAL_DOC, HIGH for absence-in-docs; docs may be incomplete). Structured routes that ARE documented: `kilo export [sessionID]` (session data as JSON) / `kilo import <file>`; ACP JSON-RPC via `kilo acp`; `kilo serve` + `kilo attach`; utility JSON surfaces `kilo stats`, `kilo models [provider]`, `kilo roll-call <filter>` (OFFICIAL_DOC, HIGH). Per-run streaming events: UNKNOWN.
4. **Explicit config/credential/session boundaries?** — YES, well documented:
   - Config: global `~/.config/kilo/kilo.json[c]` (legacy `opencode.json[c]` still read); project `./kilo.json[c]` or `./.kilo/` (legacy `./.kilocode/` also read); **project overrides global**; TUI settings `~/.config/kilo/tui.jsonc` / `.kilo/tui.json` (OFFICIAL_DOC, HIGH).
   - Env overrides: `KILO_CONFIG`, `KILO_CONFIG_CONTENT`, `KILO_PROVIDER`, `KILO_ORG_ID`, `KILO_<FIELD_NAME>`, `KILOCODE_<FIELD_NAME>` (OFFICIAL_DOC, HIGH).
   - Credentials: `kilo auth` (manage providers/credentials); first-time `/connect` in TUI; chosen org "stored in the CLI auth file and reused automatically" — auth file PATH not documented (OFFICIAL_DOC, HIGH for mechanism, gap for path).
   - Sessions: `kilo session` (manage); `kilo --continue`/`-c` resumes last workspace session (incompatible with `--auto`); slash commands `/sessions /new /fork /compact /export`; cross-tool resume `/resume-claude <uuid>` (reads `~/.claude/projects/`) and `/resume-codex <uuid>` (reads `~/.codex/sessions/`); storage location for its own sessions NOT documented (OFFICIAL_DOC, HIGH for commands, gap for path).
   - Permissions in config: `"allow" | "ask" | "deny"` with wildcard patterns, e.g. `"git *": "allow"` (OFFICIAL_DOC, HIGH).
5. **Facts verifiable WITHOUT reading credentials?** — YES. Paths, env var names, and command surface all from official docs; no credential contents needed or read.
6. **Clear maintainer + version source?** — YES: Kilo-Org; authoritative version source = npm dist-tags for `@kilocode/cli` (plus `kilo --version`).
7. **Maps to generic runtime composition?** — YES: spawn `kilo run "<msg>" --auto` with cwd = workspace, parse stdout + exit code (0/124/1); or speak ACP JSON-RPC to `kilo acp`/`kilo serve` for event-level integration. Quirks: requires Node.js v20+; non-auto non-interactive runs auto-REJECT permissions (fail-closed, exit 1) — adapters must use `--auto` with config-declared permissions; baseline (no-AVX) binaries needed on old CPUs; OpenCode fork (behavior drift possible upstream-vs-fork).
8. **Full coding harness?** — YES: agents, plan/debug workflows, permissions (allow/ask/deny), sessions with fork/compact, MCP (`kilo mcp`), plugins/skills (OpenCode lineage), GitHub automation (`kilo github`, `kilo pr`, `kilo cloud`), model routing incl. 500+ models (OFFICIAL_DOC + product page, HIGH).

## Tier decision

**Tier B — major facts clear; events/session-credential internals incomplete.**

Justification: identity, distribution, headless mode, exit-code contract, config boundaries, env overrides, and permission model are all officially documented and current. What keeps it below Tier A: (a) no documented per-run streaming/JSON stdout event schema (only post-hoc `kilo export` JSON and ACP), (b) session storage and auth-file paths undocumented, (c) license conflict npm-vs-repo unresolved. All three are closeable with a local install experiment (`npm` user-level sandbox or tarball into <temp-home>) — recommended next step before Registry admission.

## Key native facts (verified depth)

- One-shot automation: `kilo run "Implement the new feature" --auto` (documented GitHub Actions example); exits automatically on completion/timeout; timeout exit code 124.
- Fail-closed default: non-interactive run without `--auto` auto-rejects permission requests and exits 1 if any request occurred.
- Config precedence: project `kilo.json[c]`/`.kilo/` > global `~/.config/kilo/kilo.json[c]`; legacy opencode filenames honored.
- `KILO_CONFIG` / `KILO_CONFIG_CONTENT` allow pointing the CLI at arbitrary config — the natural isolation seam for agent-box profile injection.
- `kilo acp` gives an Agent Client Protocol server; `kilo attach <url>` reuses a running `kilo serve` — server mode enables multi-client orchestration.
- Update path: `kilo upgrade` or `npm update -g @kilocode/cli`; `kilo --version` for version probe.
- Identity lineage: OpenCode fork — behavior contracts likely track upstream sst/opencode; treat upstream docs as PEER_PROJECT evidence, kilo.ai docs as authoritative.

## Unresolved

- Per-run streaming event format for `kilo run` (if any) — UNKNOWN.
- Auth file path and format (`kilo auth`) — path undocumented.
- Kilo's own session storage directory — undocumented (only import/export and cross-tool read paths are documented).
- License resolution: npm Apache-2.0 vs repo README MIT.
- Exact repo path of CLI sources (npm says `directory: cli`; repo listing shows `packages/`) — verify during clone.
- Release cadence; semantics of `next`/`rc` dist-tags channels.
