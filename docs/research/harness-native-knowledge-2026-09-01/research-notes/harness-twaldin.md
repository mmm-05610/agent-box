# Research notes — twaldin/harness

Cloned read-only to `<temp-home>/harness` (depth 1). All `file:line` refs below are against that checkout. Real local paths sanitized.

## Identity

- Org/repo: twaldin/harness — https://github.com/twaldin/harness (verified via `git remote get-url origin`).
- Language: Python (core, `src/harness/`) + TypeScript port (`ts/`) + a thin TS telemetry script (`ts/scripts/session-telemetry.ts`).
- License: MIT (LICENSE:1 — "Copyright (c) 2026 Tim Waldin").
- Last commit seen: `1f95668` "Add social-card banner to README", 2026-07-12 (shallow clone, single commit).
- Size: 153 tracked files; ~6.4k LOC across `src/` + `ts/` (excluding lockfiles). Core is tiny: `base.py` 225 lines, `registry.py` 55, `_subproc.py` 213, 13 adapter files.
- Packaging: `pip install harness-cli` (imports as `harness`; name squatted), npm `@twaldin/harness-ts` (README:24-28).
- Status: actively maintained as of mid-2026; published to PyPI/npm; used by sibling projects agentelo/hone/flt (README "Why" section).
- Docs: SPEC.md (normative cross-language contract), README.md, ADAPTER-MATRIX.md, RELEASE-NOTES.md. No separate docs site.

## Architecture summary

One-process-per-run subprocess launcher for 13 headless coding CLIs, deduplicated behind a single contract.

Core abstractions (`src/harness/base.py`):
- `RunSpec` — dataclass: harness, prompt, workdir, model, instructions, timeout_seconds, env, model_no_resolve (`base.py:14-41`). "Everything an adapter needs to invoke its CLI."
- `BuildCommand` — dataclass: cmd, args, cwd, env, instructions_file (`base.py:44-56`). "What to invoke — without invoking it." Docstring explicitly declares that writing the instructions file is a side effect of `build_command()`.
- `RunResult` — harness, model, exit_code, duration_seconds, stdout, stderr, timed_out, cost_usd, tokens_in, tokens_out, raw; `.ok` property (`base.py:83-101`).
- `Adapter` — ABC with class attrs `name`, `instructions_filename`, `scroll_ownership` (`base.py:104-128`); abstract `build_command()` ("MAY write files... MUST NOT fork a subprocess", `base.py:140-146`) and `parse_output()` ("MAY read files the CLI wrote (trajectory JSON, sqlite DB). MUST NOT block on I/O > 5s", `base.py:148-155`).
- `Adapter.run()` is the whole lifecycle: `build_command → run_subprocess → parse_output → RunResult` (`base.py:157-182`); `run_async()` mirror (`base.py:184-209`). Note: `parse_output` receives the raw `SubprocOutcome`, so parsing has full stdout/stderr access.
- Terminal-integration extras: `ScrollKeys` (tmux chord map, `base.py:59-70`), `scroll_ownership` policy ("tmux" | "app" | "fullscreen-aware", `base.py:118-128`), `get_current_scroll_keys()` (`base.py:130-138`).

Registry (`src/harness/registry.py`):
- Module-level dict `_REGISTRY: dict[str, type[Adapter]]` (`registry.py:7`), filled by import side effect of `harness.adapters` (`adapters/__init__.py:1-27` calls `register(...)` for all 13 names).
- `register()` raises `HarnessError("adapter name collision")` on duplicate name with a different class (`registry.py:10-13`).
- `get_adapter()` raises with the sorted available list on unknown name; lookup is case-sensitive (SPEC.md:383) (`registry.py:21-25`).
- `run()`/`run_async()`/`build_command()`/`parse_output()` all do `import harness.adapters` first to guarantee registration (`registry.py:28-55`).
- Instantiation is per-call: `get_adapter` returns `_REGISTRY[name]()` — a fresh adapter object each run (`registry.py:25`).

Lifecycle: build argv+env → `run_subprocess` (timeout → kill, never raises on non-zero exit; returns `SubprocOutcome` with exit_code/duration/stdout/stderr/timed_out, `_subproc.py:18-23,26-67`) → per-CLI parser extracts cost/tokens/raw. Env merge order: `os.environ.copy()` then `bc.env` then `spec.env` (`base.py:166`, `_subproc.py:33-35`).

Model normalization: `normalize_model_for_harness()` translates aliases ("sonnet" → concrete id) per harness, with `model_no_resolve` escape hatch (`base.py:29-31`, used at `claude_code.py:41`); cost derived via `pricing.py` `derive_cost()` when the CLI doesn't report cost (`gemini.py:52`).

## Required focus points

(1) RunSpec — `base.py:14-41`. Includes `instructions` (system-prompt-ish text) and `model_no_resolve`. No permission-mode / yolo / sandbox fields exist — autonomy level is fixed inside each adapter (see below).

(2) BuildCommand — `base.py:44-56`. The key design move: it is returned by `build_command()` so interactive consumers (flt) can reuse command construction without executing (SPEC.md:47-48).

(3) RunResult — `base.py:83-101`. `raw` carries the adapter-specific parsed payload; subprocess failures never throw, they are reflected in `exit_code`/`timed_out` (SPEC.md:112).

(4) Adapter interface — `base.py:104-225`. Plus optional protocol: `session_log_path()` / `parse_session_log()` → `SessionTelemetry` (`base.py:211-222`, dataclass at `base.py:73-80`) implemented by most adapters.

(5) Registry — `registry.py:7-55` (import-side-effect registration, collision detection).

(6) Per-harness argv builders + output parsers (one file per CLI under `src/harness/adapters/`):
- claude-code: `claude -p PROMPT --model M --output-format json --dangerously-skip-permissions [--append-system-prompt INSTRUCTIONS]` (`claude_code.py:40-53`); parser reads JSON envelope `usage.input_tokens/output_tokens` + `total_cost_usd` (`claude_code.py:55-68`).
- codex: `codex exec -m M --dangerously-bypass-approvals-and-sandbox --json -C workdir PROMPT` (`codex.py:23-33`); parser sums `turn.completed` JSONL usage events (`codex.py:66-88`).
- gemini: `gemini -p PROMPT -y -m M --output-format json` (`gemini.py:36-38`); parser reads `stats.models[*].tokens.{input,candidates}` with line-scan fallback (`gemini.py:40-68,71-...`).
- aider: `aider --config <workdir>/.agentelo-aider.yml --no-restore-chat-history --chat-history-file ... --model M --message PROMPT --yes-always --no-auto-commits --no-analytics --no-show-model-warnings` (`aider.py:40-56`); parser regex-scrapes `Tokens: N sent, M received` from stdout+stderr (`aider.py:59-62`, regex `aider.py:34`). Docstring warns aider treats `instructions` as YAML config, not prompt text (`aider.py:5-9`).
- opencode/crush/kilo: parsers query the CLI's session **sqlite DB** read-only (`opencode.py:97`, `crush.py:76`, `kilo.py:101` — `sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=5.0)`), with schema-drift-tolerant lookups; adapters can set env like `OPENCODE_DB`/`KILO_DB` via `BuildCommand.env` (SPEC.md:365).
- swe-agent: reads trajectory file (SPEC.md + adapter `swe_agent.py`).

(7) Session telemetry — what/where:
- `SessionTelemetry` = session_log_path, tokens_in, tokens_out, cost_usd, model, raw (`base.py:73-80`).
- claude-code: log dir `~/.claude/projects/<workdir-with-slashes-and-underscores-dashed>/*.jsonl`, newest-mtime match, optional `session_started_after` mtime filter (`claude_code.py:67-80`); `parse_session_log` sums per-line `message.usage.{input,output}_tokens` and `costUSD`/`total_cost_usd`, skipping `model == "<synthetic>"` (`claude_code.py:82-...`).
- Same pattern per CLI: qwen (`qwen.py:39,49`), factory-droid (`factory_droid.py:59,79`), continue-cli (`continue_cli.py:56,82`), openclaude (`openclaude.py:62,76`), sqlite-based ones above.
- Cross-language parity of this telemetry is enforced by a golden test that shells out to the TS port and compares dicts: `tests/adapters/test_session_parity.py:16-37` (`_ts_call` runs `<binary> ts/scripts/session-telemetry.ts`, `_py_telemetry_dict` normalizes both sides; fixtures under `tests/fixtures/session-logs/`).

(8) Side-effectful build methods (all write into the user's workdir):
- `write_instructions()` writes `<workdir>/<instructions_filename>` (CLAUDE.md / AGENTS.md / GEMINI.md / .aider.conf.yml), **overwrites idempotently, creates workdir if missing** (`_subproc.py:128-141`; called from every adapter's `build_command`, e.g. `claude_code.py:42`).
- aider additionally writes `.agentelo-aider.yml` (content literally `{}`) and points history files into the workdir (`aider.py:38-39,44-47`).
- Newer, safer projection API exists: `project_instructions()` writes with backup `.harness-backup-<filename>` and returns an `InstructionProjection` (workdir, filename, file_path, existed_before, backup_path) that `restore_projected_instructions()` can undo, including pruning empty dirs (`_subproc.py:25-31,144-206`). Adopters include prepend mode (`_subproc.py:160-166`). Not yet used by all adapters.

(9) Dangerous flags hardcoded:
- `--dangerously-skip-permissions` — claude-code (`claude_code.py:44`) and openclaude (`openclaude.py:28`).
- `--dangerously-bypass-approvals-and-sandbox` — codex (`codex.py:27`).
- `gemini -y` (auto-approve) (`gemini.py:37`); aider `--yes-always` (`aider.py:50`).
- None of these are configurable through `RunSpec` — there is no `permission_mode`/`auto_approve` field (`base.py:34-41`). Overriding requires subclassing the adapter and replacing `build_command`, or post-editing the returned `BuildCommand` args. SPEC.md's contract freezes these argvs (example at SPEC.md:339), i.e. full-autonomy-by-default is a deliberate, documented design decision, not an accident. superharness's launcher scripts show the same flags but gated behind an explicit `--yolo`/`--codex-bypass` opt-in — see superharness.md.

## Patterns worth borrowing for Agent-Box

- `BuildCommand` as a pure, inspectable pre-exec artifact → **harness-registry-declaration** (build vs run split; "what to invoke without invoking it").
- Adapter ABC with normative side-effect contract in docstrings ("MAY write files", "MUST NOT fork", "MUST NOT block I/O > 5s") → **harness-native-adapter**.
- Collision-detecting import-time self-registration (`registry.py:10-13`) → **harness-registry-declaration**.
- `project_instructions()` + `InstructionProjection` + `restore_projected_instructions()` — write-with-backup-then-undo for workdir instruction files → **resource-projector** / **credential-materializer** (the exact shape Agent-Box needs for projected config that must be cleaned up).
- `SessionTelemetry` + per-adapter `session_log_path()`/`parse_session_log()` reading native session stores (JSONL, sqlite read-only `?mode=ro`) → **observation-envelope**.
- `run_subprocess` shared runner: single place for timeout-kill, env merging, never-raise semantics → **runtime-host-protocol**.
- Cross-language golden parity test on telemetry output (`tests/adapters/test_session_parity.py`) → **test-strategy**.
- `model_no_resolve` escape hatch next to normalization → **harness-registry-declaration** (normalization with an off-switch).
- Adapter-set env channel (`BuildCommand.env`, SPEC.md:365) with an explicit rule: adapters MUST NOT read user secrets; caller merges onto process env → **credential-materializer**.

## Anti-patterns / risks observed

- Full autonomy hardcoded: `--dangerously-skip-permissions` etc. fire on every run with no RunSpec-level opt-out (see (9)); a downstream library inherits "agent can edit anything, run anything" by default.
- `write_instructions()` clobbers an existing CLAUDE.md/AGENTS.md with no backup and no restore path (`_subproc.py:128-141`); the safer `project_instructions()` exists but is not wired into the adapters shown here — two generations of instruction-projection coexist.
- Adapters pollute the user's real workdir with dotfiles (`.agentelo-aider.yml`, chat history files, `.harness-backup-*`) — no staging/temp-dir abstraction.
- Output parsers are schema-fragile: happy-path scrapes of stdout (gemini line scan, aider regex) and of undocumented sqlite schemas; README itself admits drift ("when opencode changed its session DB schema, only agentelo learned").
- `BuildCommand.env` and `spec.env` are merged over `os.environ` wholesale (`_subproc.py:33-35`) — no allowlist, so adapter env can leak or shadow.
- Telemetry discovery keys off `Path.home()` and workdir-name encoding (`claude_code.py:70-76`) — breaks under custom `HOME` or containerized runs (their own tests must fake `HOME` with `tmp_path` fixtures).

## Verification status

- Verified from source read (file:line): all Architecture and focus-point claims above (base.py, registry.py, _subproc.py, adapters/claude_code.py, codex.py, gemini.py, aider.py, adapters/__init__.py, SPEC.md excerpts, tests/adapters/test_session_parity.py, grep over all 13 adapter files for flags/telemetry).
- README-only: PyPI/npm install instructions, sibling-project history ("Why" section), publisher status.
- Not verified: actual behavior of remaining adapters (qwen, pi, kilo, crush, swe-agent, continue-cli, factory-droid) beyond flag/telemetry grep; TS port internals (`ts/`) beyond the telemetry script reference; npm/PyPI availability (no network install attempted).
