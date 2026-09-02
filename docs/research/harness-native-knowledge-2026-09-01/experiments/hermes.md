# Experiment log — Hermes Agent (harness id: hermes)

Date: 2026-09-02 · All probes isolated: `HOME=<temp-home>`, `HERMES_HOME=<temp-home>/hermes-home`. No model/API calls (no credentials present anywhere in the probe env; every model-touching path was expected to and did fail fast). Real `<user-home>/.hermes` never touched. No credential contents read. No git write ops.

## E1. Probe infrastructure finding (HOME override breaks user-site imports)

Naively overriding `HOME` for isolation breaks the harness:

```
$ HOME=<temp-home> hermes --version
Traceback (most recent call last):
  File "<user-home>/.local/bin/hermes", line 5, in <module>
    from hermes_cli.main import main
ModuleNotFoundError: No module named 'hermes_cli'
```

Cause: the console script runs `/usr/bin/python3`, and Python derives the **user site-packages** path from `$HOME` — move HOME and `hermes_cli` (installed under `<user-home>/.local/lib/python3.12/site-packages`) disappears from `sys.path`.

Fix used for all probes — wrapper `<temp-home>/run.sh`:

```bash
export HOME=<temp-home>
export HERMES_HOME=<temp-home>/hermes-home
export PYTHONPATH=<site-packages>
export NO_COLOR=1
exec /usr/bin/python3 <temp-home>/hermes-entry "$@"   # copy of the launcher script
```

**Load-bearing implication for Agent-Box (host-control):** `HERMES_HOME` alone is the correct and sufficient isolation knob — HOME must stay put (or the full site-packages tree must be mounted). Agent-Box's launch.py env allowlist `{LANG,LC_ALL,LC_CTYPE,PATH,HTTP_PROXY,HTTPS_PROXY,ALL_PROXY,NO_PROXY}` + `PATH=/usr/bin:/bin` + staging only the 214-byte launcher will not reproduce the interpreter's import context.

Version banner under the wrapper (identifies as pip because the entry script copy changed the install-detection heuristic — cosmetic):

```
Hermes Agent v0.19.0 (2026.7.20)
Install directory: <site-packages>
Install method: pip
Python: 3.12.3
OpenAI SDK: 2.24.0
Up to date
```

## E2. Full top-level `--help` transcript (sanitized, abridged where repetitive)

```
usage: hermes [-h] [--version] [-z PROMPT] [--usage-file PATH] [-m MODEL]
              [--provider PROVIDER] [-t TOOLSETS] [--resume SESSION]
              [--no-restore-cwd] [--continue [SESSION_NAME]] [--worktree]
              [--accept-hooks] [--skills SKILLS] [--yolo] [--pass-session-id]
              [--ignore-user-config] [--ignore-rules] [--safe-mode] [--tui]
              [--cli] [--dev]
              {chat,model,moa,fallback,secrets,migrate,gateway,proxy,lsp,setup,
               postinstall,whatsapp,whatsapp-cloud,slack,send,login,logout,auth,
               status,cron,webhook,portal,kanban,project,hooks,doctor,security,
               dump,debug,backup,checkpoints,import,config,console,pairing,
               skills,bundles,plugins,curator,pets,journey,learning,
               memory-graph,memory,tools,computer-use,mcp,sessions,insights,
               claw,version,update,uninstall,acp,profile,completion,dashboard,
               serve,desktop,gui,logs,prompt-size}
```

Key option help strings (verbatim, trimmed):

- `-z PROMPT, --oneshot PROMPT` — "One-shot mode: send a single prompt and print ONLY the final response text to stdout. No banner, no spinner, no tool previews, no session_id line. Tools, memory, rules, and AGENTS.md in the CWD are loaded as normal; approvals are auto-bypassed. Intended for scripts / pipes."
- `--usage-file PATH` — "One-shot mode only: after the run, write a JSON usage report (estimated cost, token counts, model, api_calls) to PATH. The report is written even when the run fails... No effect outside -z/--oneshot."
- `-m MODEL` — "...Also settable via HERMES_INFERENCE_MODEL env var."
- `--resume SESSION, -r SESSION` — "Resume a previous session by ID or title"
- `--continue [SESSION_NAME], -c` — "Resume a session by name, or the most recent if no name given"
- `--worktree, -w` — "Run in an isolated git worktree (for parallel agents)"
- `--accept-hooks` — "Auto-approve any unseen shell hooks declared in config.yaml without a TTY prompt. Equivalent to HERMES_ACCEPT_HOOKS=1 or hooks_auto_accept: true in config.yaml."
- `--yolo` — "Bypass all dangerous command approval prompts"
- `--ignore-user-config` — "Ignore ~/.hermes/config.yaml and fall back to built-in defaults (credentials in .env are still loaded)"
- `--ignore-rules` — "Skip auto-injection of AGENTS.md, SOUL.md, .cursorrules, memory, and preloaded skills"
- `--safe-mode` — "disable ALL customizations — user config, AGENTS.md/memory injection, plugins, and MCP servers (implies --ignore-user-config and --ignore-rules)"
- `--tui` / `--cli` — "modern TUI" vs "classic prompt_toolkit REPL (overrides display.interface=tui)"

Subcommand one-liners of note: `acp` "Run Hermes Agent as an ACP (Agent Client Protocol) server"; `serve` "Start the Hermes backend server (headless; powers the desktop app and remote backends)"; `mcp` "Manage MCP servers and run Hermes as an MCP server"; `profile` "Manage profiles — multiple isolated Hermes instances"; `sessions` "Manage session history (list, rename, export, prune, delete)"; `dashboard` "Start the web UI dashboard (port 9119)".

## E3. `--print` flag refutation

```
$ hermes --print
usage: hermes [-h] [--version] [-z PROMPT] [--usage-file PATH] ... 
hermes: error: unrecognized arguments: --print     (argparse usage dump; no model call)
```

Agent-Box `harnesses.toml` declares `argv = ["hermes", "--print"]` — **refuted** for v0.19.0. The headless flag is `-z PROMPT` / `--oneshot PROMPT`.

## E4. Bare `hermes`, no TTY, no config (first-run fallback)

```
$ hermes < /dev/null
It looks like Hermes isn't configured yet -- no API keys or providers found.

  Run:  hermes setup

⚕ Hermes Setup — Non-interactive mode

  No interactive TTY detected for the first-run setup prompt.
  ...
  Configure Hermes using environment variables or config commands:
    hermes config set model.provider custom
    hermes config set model.base_url http://localhost:8080/v1
    hermes config set model.default your-model-name
  Or set OPENROUTER_API_KEY / OPENAI_API_KEY in your environment.
  Run 'hermes setup' in an interactive terminal to use the full wizard.
```

exit 0. **Bare argv is not a headless run mode.**

## E5. Oneshot failure semantics (no credentials — fails before any network call)

```
$ hermes -z "say hi" < /dev/null ; echo exit=$?
exit=1
--stdout-- (empty)
--stderr--
hermes -z: agent failed: No inference provider configured. Run 'hermes model' to
choose a provider and model, or set an API key (OPENROUTER_API_KEY, OPENAI_API_KEY, etc.) in ~/.hermes/.env.
```

## E6. Temp-HERMES_HOME diff (what first-run + read-only commands create)

```
<temp-home>/hermes-home/
├── audio_cache/        ├── image_cache/
├── cron/               ├── logs/{agent.log, errors.log, gui.log, curator/}
├── hooks/              ├── memories/
├── pairing/            ├── sessions/
├── skills/             ├── SOUL.md          (auto-created identity file)
└── .update_check
```

`state.db` not created until a session actually runs (sessions list: "No sessions found." without creating it).

## E7. `hermes config` status panel (read-only probe)

```
◆ Paths
  Config:       <temp-home>/hermes-home/config.yaml
  Secrets:      <temp-home>/hermes-home/.env
  Install:      <site-packages>
◆ API Keys
  OpenRouter (not set) · OpenAI (STT/TTS) (not set) · Exa · Parallel · Firecrawl ·
  Tavily · Browserbase · Browser Use · FAL · Anthropic   (all "not set")
◆ Model          Model: (empty)   Max turns: 90
◆ Terminal       Backend: local   Working dir: .   Timeout: 180s
◆ Context Compression  Enabled: yes  Threshold: 50%  Target ratio: 20% ...
◆ Messaging Platforms  Telegram: not configured  Discord: not configured
```

Confirms native config path = `$HERMES_HOME/config.yaml`, secrets file = `$HERMES_HOME/.env`, and the credential env vars Hermes probes for.

## E8. Read-only list probes

```
$ hermes mcp list
  No MCP servers configured.
  Add one with:
    hermes mcp add <name> --url <endpoint>
    hermes mcp add <name> --command <cmd> --args <args...>

$ hermes profile list
 Profile          Model    Gateway    Alias   Distribution
 ◆default         —        stopped    —       —

$ hermes sessions list
No sessions found.
```

All safe, no writes beyond the bootstrap skeleton, no network.

## E9. Installed-package layout findings (OFFICIAL_SOURCE)

- `<site-packages>/hermes_agent-0.19.0.dist-info/`: METADATA (author Nous Research, MIT, Requires-Python <3.14,>=3.11, pinned deps), entry_points.txt (3 console scripts), RECORD (data files: 17 locale YAMLs; `optional-mcps/{linear,n8n}/manifest.yaml`).
- Top-level runtime modules: `cli.py` (REPL engine), `run_agent.py` (fire-based programmatic runner; `main(query, model, api_key, base_url, max_turns, enabled_toolsets, list_tools, save_trajectories, ...)`), `batch_runner.py`, `toolsets.py`, `model_tools.py` (spawn-subagents tool), `mcp_serve.py`, `hermes_state.py` (state.db SQLite store), `hermes_constants.py` (HERMES_HOME resolution — single source of truth).
- `hermes_cli/` (100+ modules): config.py (DEFAULT_CONFIG, 9k+ lines), oneshot.py, auth.py (per-provider `api_key_env_vars` registry + auth.json locking), env_loader.py (credential-suffix sanitization), mcp_config.py (`mcp_servers` key in config.yaml), plugins.py (bundled→user→project→entrypoint precedence), skill hub, profiles, gateway, web_server, kanban, secrets/onepassword, hooks.
- `agent/`: agent_init.py (context files docstring: SOUL.md, .hermes.md, AGENTS.md, CLAUDE.md, .cursorrules from cwd/HERMES_HOME), memory/learning modules (`memories/` = MEMORY.md + USER.md base), skill_utils.py (`$HERMES_HOME/skills` + `skills.external_dirs`), adapters (anthropic/bedrock/codex/gemini-native), coding_context.py.
- `gateway/`, `acp_adapter/`, `cron/`, `locales/`.

## E10. Agent-Box internal hypotheses vs observation (summary)

| Hypothesis (Agent-Box source) | Verdict |
|---|---|
| `native_home = ".hermes"` | CONFIRMED on POSIX (`~/.hermes`); Windows differs (`%LOCALAPPDATA%\hermes`); home is a full state home, not config-only |
| `skill_env = "HERMES_HOME"` | CONFIRMED — HERMES_HOME is the home override; skills root `$HERMES_HOME/skills`; caveat: `HOME` must remain valid for imports (E1) |
| `argv = ["hermes","--print"]` | REFUTED — `--print` does not exist; headless = `hermes -z <PROMPT>`; protocol io = `hermes-acp` |
| `config_format = "json"` | PARTIALLY REFUTED — native format YAML; Agent-Box JSON works only as a YAML subset |
| Continuation "native state is not resumable P0" | Native resume exists (`--resume/--continue`, state.db, JSONL export) — the claim is Agent-Box scoping, not a native gap (authority conflict) |
| projection materializes `<home>/config.yaml` + `skills/` + manifest, no secrets | Viable and matches native layout; secrets would natively materialize as `$HERMES_HOME/.env` (unimplemented → observed "No inference provider configured" failure) |
| launch env allowlist drops credential env vars; PATH=/usr/bin:/bin; stages bare launcher | Not viable as-is — interpreter import context (user site-packages keyed to real HOME) is lost (E1) |

## E11. Cross-checks against upstream

- GitHub repo page: org/repo `NousResearch/hermes-agent`, MIT, install script for Linux/macOS/WSL2/Termux + PowerShell for Windows, platforms incl. native Windows and Termux, 7 terminal backends, model-agnostic. Matches installed METADATA exactly (author, license, README body).
- GitHub releases API: latest `v2026.8.31` = "Hermes Agent v0.21.0 (v2026.8.31)", published 2026-08-31 — local v0.19.0 is 2 monthly releases behind; v0.21.0 adds subagent steering, `hermes peer`, MCP command center (VERSION_SENSITIVE items flagged in FACTS.md).
- Official docs site: unreachable from the research sandbox (3 WebFetch timeouts) — NOT_LOCALLY_OBSERVED; all doc-derived facts come from the installed official distribution (which embeds the README/docs index).
