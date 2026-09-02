# Research notes — artificemachine/superharness

Cloned read-only to `<temp-home>/superharness` (depth 1). All `file:line` refs against that checkout. Real local paths sanitized.

## Identity

- Org/repo: artificemachine/superharness — https://github.com/artificemachine/superharness (verified via origin remote).
- Language: Python (`src/superharness/`), plus Ruby engine helpers (`engine/detect.rb`, `engine/recall.rb`, `engine/file_utils.rb`), bash launcher scripts, and a dashboards/UI layer.
- License: Apache-2.0 (LICENSE:1-3).
- Last commit seen: `9c2166d` "Merge pull request #128 from artificemachine/fix/session-start-backtick-substitution", 2026-08-28 (shallow clone, single commit).
- Size: 1129 tracked files; VERSION `1.77.0`; 537 test files under `tests/` (README claims "5,000+ tests"); published to PyPI (`pipx install superharness`), installable as a Claude Code plugin via a marketplace.
- Status: actively maintained (high PR cadence, dependabot, SECURITY.md, CHANGELOG).
- Product: multi-agent task coordination ("shux" CLI) — SQLite-backed shared contract, queue-based delegation, lifecycle rules, watchdogs, dashboard. The harness-adapter layer (our focus) is a recent subsystem ("Harness adapter registry" listed under Recent Highlights, README:34-35).

## Architecture summary

Delegation is routed through a two-layer registry: file manifests (YAML) declare what an adapter *is*; Python `Harness` objects declare how an adapter *is invoked*; a bash launcher script is the final argv authority.

Core abstractions:
- **Harness Protocol** — `src/superharness/harnesses/base.py:33-51`: `@runtime_checkable Protocol` with `name: str` and `build_invocation(task: dict, project_dir: str, non_interactive: bool) -> Invocation`; `discover_models(auth_mode) -> list[DiscoveredModel]` defaults to `[]` (`base.py:41-51`).
- **Invocation** — frozen dataclass `argv: tuple[str, ...]`, `env: dict`, `cwd: str`; argv coerced to tuple in `__post_init__` so both reassignment and item mutation raise (`base.py:16-30`). "An immutable, ready-to-spawn subprocess description."
- **Python object registry** — `src/superharness/harnesses/__init__.py`: `_REGISTRY: dict[str, Harness]` (`__init__.py:20`), `register()` (overwrites silently, no collision error — `__init__.py:23-24`), `get_harness()` raising KeyError with known list (`__init__.py:26-33`), eager `_register_builtins()` for claude-code/codex-cli/gemini-cli/opencode/pi (`__init__.py:36-45`), and a `KNOWN_HARNESSES` snapshot list (`__init__.py:52`).
- **Adapter Manifest (file-based)** — one YAML per adapter in `src/superharness/adapter_manifests/` (claude-code, codex-cli, gemini-cli, opencode, pi, prime-agent). Schema: `name`, `version`, `type: native`, `launcher_script`, `capabilities[]`, `supports_effort`, `model_tiers` (mini/standard/max; v1 `versions` map keyed by version pin with `"*"` default — claude-code.yaml; v2 `preferred`/`accept[]`/`auth_compat`/`capability_tags` — codex-cli.yaml), `requires: {bin, env}`, `validation: {check_bin, check_env}`.
- **Manifest registry** — `src/superharness/engine/adapter_registry.py`: `AdapterManifest` dataclass (`adapter_registry.py:104-128`), `from_dict` parsing both v1 and v2 tier schemas incl. `auth_compat` (`adapter_registry.py:75-100,161-183`), cached `load_manifest()` (`adapter_registry.py:197-227`), `list_adapters()` = sorted `*.yaml` stems (`adapter_registry.py:190-194`), `validate_adapter()` = manifest + runtime `shutil.which(bin)` and env checks (`adapter_registry.py:230-261`), `resolve_launcher()` = manifest `launcher_script` joined into the package `scripts/` dir with existence check (`adapter_registry.py:264-283`), `resolve_model(owner, tier, version)` (`adapter_registry.py:286-...`).
- **Lifecycle (dispatch)**: `commands/delegate.py::_launch_agent()` (`delegate.py:643-...`) → `get_harness(target)` (`delegate.py:680-690`, KeyError → clean abort) → `harness.build_invocation(...)` → `launch_args = list(invocation.argv)` → platform_runtime spawns `bash <launcher-script> ...`; the launcher script (e.g. `scripts/delegate-to-claude.sh`) re-parses flags and assembles the real CLI argv. Before spawn, a heartbeat row is upserted best-effort (`delegate.py:...` "Register agent daemon heartbeat before dispatching").
- **Model discovery** — `discover_via_probe()` (`base.py:64-90`): loads manifest, resolves an auth-mode-aware accept chain via `manifest.resolve_accept_chain(tier, auth_mode)` (`adapter_registry.py:130-145`: `auth_compat[tier][auth_mode]` when known, else `accept`, else `[preferred]`), then runs `ProbeDiscovery` (`engine/probe_discovery.py:46-100`): one real CLI invocation per candidate under a wall-clock budget with a per-candidate boot floor, classifying outcomes as discovered/rejected/unknown by error-text match (`probe_discovery.py:104-119`); first working model wins. `DiscoveredModel` + TTL cache in `engine/model_discovery.py:66-180`.
- **Shared argv helper** — `build_generic_invocation()` (`base.py:93-132`): assembles `bash launcher --project/--prompt/--non-interactive/--yolo/--codex-bypass/--model/--effort` for codex/gemini/opencode, applying `apply_model_prefix()` to model ids; claude-code is deliberately excluded because "Claude CLI rejects the anthropic/ prefix" (`base.py:100-103`).

## Required focus points

(1) **Harness Protocol** — `base.py:33-51` (quoted above). Structural typing means Python launcher classes (e.g. `ClaudeHarness` at `harnesses/claude.py:20-...`) don't inherit from anything; conformance is by shape plus tests.

(2) **Invocation object** — `base.py:16-30`; immutability is tested (`tests/unit/test_harness_registry.py:71-77`: both attribute assignment and `argv[0] = ...` must raise). This is the handoff artifact across the process boundary — `delegate.py` only reads `invocation.argv/cwd`.

(3) **Adapter Manifest: file-based?** — Yes. YAML files in `adapter_manifests/*.yaml`, loaded from the packaged directory (`MANIFEST_DIR`, `adapter_registry.py:190-194`), parsed with `yaml.safe_load` (`adapter_registry.py:213-214`), cached per name (`adapter_registry.py:203-204`), with `clear_manifest_cache()` exported (`adapter_registry.py:31`). Declares identity/capabilities/model tiers/auth compat/launcher, but **not** argv — argv lives in Python Harness classes + bash launchers.

(4) **Capability/model discovery** — capabilities are declared lists in manifests (e.g. `code_generation`, `file_editing`, `test_execution`, `multi_file_refactor` — claude-code.yaml:8-11), validated non-empty against a vocabulary by contract tests (`tests/contract/test_manifest_compliance.py:426-432`). Model discovery is tier-based resolution (`resolve_model`, `adapter_registry.py:286-...`; `flagship()`/`flagship_1m()` convenience at `adapter_registry.py:305-321`) plus live probing (`discover_via_probe`, `base.py:64-90`) with a DB TTL cache (`engine/model_discovery.py:81-180`).

(5) **Auth compatibility checks** — v2 manifest `auth_compat` maps `tier → auth_mode → [model ids]` measured on a real host (codex-cli.yaml comments: chatgpt-account login only serves gpt-5.5/5.4 while apikey serves the full set; "measured live on this host 2026-08-07", codex-cli.yaml:12-19). Resolution order in `resolve_accept_chain()` (`adapter_registry.py:130-145`); probes record `auth_mode` on each `DiscoveredModel` (`probe_discovery.py:87-93`). Runtime gating remains permissive: `validate_adapter()` only checks `requires.bin` in PATH and `requires.env` set when `validation.check_bin/check_env` are true (`adapter_registry.py:245-259`); manifests currently set `check_env: false` everywhere seen.

(6) **Dual-authority risk between Manifest registry and Python object registry** — real and acknowledged in-code:
- `list_adapters()` (YAML dir) currently returns 6 names including `prime-agent`; `KNOWN_HARNESSES` (Python) has 5 — `prime-agent` has a manifest + launcher script (`scripts/delegate-to-prime-agent.sh`) but **no** Python Harness object.
- The watcher must compute the **intersection** and documents why: "The manifest registry discovers new adapters automatically, while the harness registry excludes manifest-only/inert entries such as ``prime-agent`` that the watcher cannot execute." (`commands/inbox_watch.py:599-607`).
- Conversely, `delegate.py`'s CLI help text and `--to` validation use `list_adapters()` (`delegate.py:1519-1527`, `delegate.py:1674-1676`), so a user can be offered a target that `get_harness()` will then reject; `get_harness` failure is handled (`delegate.py:681-686` KeyError → `_abort`), but the two registries disagree about the *set of valid agents*.
- Registration asymmetry compounds it: manifest side fails loudly on malformed YAML, Python side `register()` silently overwrites (`harnesses/__init__.py:23-24`). There is no test asserting `set(KNOWN_HARNESSES) == set(list_adapters())`; the contract tests only validate the manifest side (`tests/contract/test_manifest_compliance.py:398-427` checks launcher exists/executable for every manifest — prime-agent passes because its script exists).
- The design intent is documented: manifests are the discovery layer, Python objects the execution layer; the gap is handled per-callsite by intersection or abort, not by a consistency invariant.

(7) **Golden/parity tests — what they compare**:
- "Capture first, hardcode, then extract" methodology: golden argv tuples were captured from the LIVE legacy inline code path (`delegate.py::_launch_agent` with `platform_runtime.launch_agent` mocked to record argv/cwd) *before* the Harness adapters existed (`tests/unit/test_harness_registry.py:1-19` docstring).
- `test_claude_invocation_parity` (`test_harness_registry.py:39-66`) asserts the new `build_invocation()` output argv/cwd/env is byte-identical to the legacy tuple, resolving the launcher through the same manifest path.
- `test_harness_adapters.py` repeats it for codex/gemini/opencode incl. model-prefix behavior (`openai/gpt-5-codex`, `test_harness_adapters.py:32-46` and the gemini/opencode cases below it).
- `tests/unit/test_bug_q_yolo_forwarding.py:1-25` is a regression pair: structural AST/signature checks that `yolo` is threaded through every layer, plus behavioral checks that `--yolo` lands in argv (Bug Q: flag parsed but never forwarded, so submissions "stayed permanently unauthorized").
- `tests/contract/test_manifest_compliance.py` compares manifests against reality for all six adapters: required fields, exactly three tiers, tiers resolve to distinct models, launcher script exists AND is executable, capabilities from an approved vocabulary, effort-flag acceptance (`test_manifest_compliance.py:50-127,398-436,496-527`).
- Invocation immutability test (`test_harness_registry.py:71-77`).

(8) **Where the dangerous flags actually live** — the Python/manifest layer only forwards intent flags; launchers hardcode the real ones:
- `delegate-to-claude.sh:36-37`: in non-interactive mode, `CLAUDE_ARGS+=("-p" "--dangerously-skip-permissions")` — unconditional in non-interactive mode (not gated on `--yolo`).
- `delegate-to-codex.sh:72`: `CODEX_ARGS+=("--dangerously-bypass-approvals-and-sandbox")`.
- `delegate-to-gemini.sh:76-78`: `--yolo` → `GEMINI_ARGS+=("-y" "--skip-trust")`; `--non-interactive` → `--skip-trust` (`delegate-to-gemini.sh:79-81`). Also note launchers `cd "$2"` for `--project` (`delegate-to-gemini.sh:60-66`) and preflight-validate the protocol GEMINI.md (`delegate-to-gemini.sh` tail).
- In Python, `--yolo`/`--codex-bypass` are explicit per-task opt-ins (`base.py:117-126`, `harnesses/claude.py:44-51`) — a contrast with twaldin/harness where full autonomy is unconditional.

## Patterns worth borrowing for Agent-Box

- **Golden-parity extraction workflow**: record the legacy argv from the live path first, then extract the adapter, then prove byte-identity in tests → **test-strategy** (the single most transferable pattern in this repo; de-risks any adapter refactor in Agent-Box).
- **Frozen `Invocation(argv, env, cwd)` value object** as the only cross-boundary handoff, with tuple-coercion immutability → **runtime-host-protocol** / **harness-native-adapter**.
- **Two-layer registry: YAML manifests (identity/capabilities/model tiers/auth compat) + Python objects (invocation build)** → **harness-registry-declaration** (manifests give Agent-Box declarative metadata, static analysis, and tooling hooks that code-only registries lack).
- **auth_compat accept chains with measured per-auth-mode model availability + ordered probing under a time budget** → **profile-store** (per-auth-mode profiles) and **harness-native-adapter** (probe TTL cache).
- **Launcher-script indirection with preflight validation** (manifest names the script; script validates protocol files and flag-maps before exec) → **harness-native-adapter** (though see anti-patterns: it doubles the argv authority).
- **Capability vocabulary validated by contract tests** (manifests may only declare known capabilities) → **harness-registry-declaration**.
- **`--print-only` dry run**: `_launch_agent(print_only=True)` prints `would launch: <launcher>` without spawning (`delegate.py:694-697`) → **runtime-host-protocol** (cheap plan/dry-run mode).
- **Heartbeat upsert before dispatch, best-effort, never blocks dispatch** (`delegate.py:698-712`) → **observation-envelope**.

## Anti-patterns / risks observed

- **Dual-authority drift is live**: 6 manifests vs 5 Python harnesses; user-facing validation (`--to` choices) and execution readiness come from different registries (`delegate.py:1527` vs `delegate.py:680-686`; `inbox_watch.py:599-607`). A manifest-only adapter is selectable in some paths and aborts in others.
- **Triple authority over argv**: manifest (launcher_script) → Python Harness (flag assembly) → bash launcher (flag re-parse + real CLI flags). Golden tests pin Python↔legacy parity, but nothing pins launcher-script ↔ Python semantics; the launcher can reinterpret flags (e.g. gemini `--non-interactive` → `--skip-trust`) invisibly to the Protocol layer.
- **`--dangerously-skip-permissions` fires on every non-interactive claude run** (`delegate-to-claude.sh:37`) regardless of `--yolo`; the yolo opt-in does not actually gate the most dangerous flag for that harness.
- Silent-overwrite Python registration (`harnesses/__init__.py:23-24`) vs loud manifest validation — inconsistent failure modes between the two authorities.
- Probe discovery executes real agent CLIs with real prompts (cost/latency) and classifies by error-text substring match (`probe_discovery.py:8-19,104-119`) — brittle against provider rewording; mitigated only by the TTL cache and budget floor.
- Launcher scripts `cd` into the project dir and mutate their own CWD (`delegate-to-gemini.sh:60-66`), and gemini uses CWD-as-project-root — behavior differs per launcher despite the uniform Invocation contract.
- Enormous single-package surface (1.77.0, 537 test files, coordination+dispatch+dashboard in one repo) — the harness layer is small but coupled to `engine/` (taxonomy, platform_runtime, model_discovery) rather than isolated.

## Verification status

- Verified from source read (file:line): everything in Architecture summary and focus points (1)-(8) — `harnesses/base.py`, `harnesses/__init__.py`, `harnesses/claude.py`, `engine/adapter_registry.py`, `engine/probe_discovery.py`, `engine/model_discovery.py` (outline), `commands/delegate.py` (`_launch_agent`), `commands/inbox_watch.py`, manifests claude-code.yaml + codex-cli.yaml, launcher scripts claude/codex/gemini, tests `test_harness_registry.py`, `test_harness_adapters.py`, `test_bug_q_yolo_forwarding.py`, `test_manifest_compliance.py`.
- README-only: product positioning (status screen sample, plugin install, "5,000+ tests", PyPI availability).
- Not verified: remaining harnesses (opencode.py, gemini.py, pi.py) beyond the shared helper they call; prime-agent launcher behavior; SQLite telemetry/events tables (migration v31) beyond README claims; runtime execution (no live dispatch attempted).
