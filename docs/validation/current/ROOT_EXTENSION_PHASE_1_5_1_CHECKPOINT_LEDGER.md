# Root Extension Phase 1–5.1 checkpoint ledger

Manual staging boundary for `refactor: close root extension architecture boundaries`. The helper script is explicit and does not stage the worktree wholesale.

## Include

- Architecture/current validation: `docs/architecture/ARCHITECTURE.md`, `docs/plugins/PLUGIN_SDK.md`, `docs/validation/current/README.md`, the audit, and `ROOT_EXTENSION_REPAIR_PHASE_1` through `PHASE_5` documents.
- Root extension boundary: `src/agent_box/extensions` catalog, API, bootstrap, loader, diagnostics, credentials, ProfileEnvelope, runtime-composition, and sandbox paths.
- Allowed root plumbing: the listed `resource_contracts`, `work_core/registry.py`, `work_core/repository.py`, CLI plugin command, and `pyproject.toml`.
- Tests: Catalog, projection, sandbox, transport, runtime-composition vertical/protocol, bwrap formal dispatch, and resource-contract tests listed in the script.
- Plugin discovery: artifacts/Git selectors; Harnesses; Claude, Hermes, OpenCode, Pi; runtime-local, sandbox-bwrap, terminal-session; and tmux removal paths listed in the script.
- Web closure: provider-neutral Quick Launch API/component, current static bundle, Host facade/server, and the listed Web tests.
- Checkpoint metadata: this ledger and `tools/prepare_root_extension_phase_1_5_1_checkpoint.sh`.

Plugin source directories are included because their descriptors, catalog contributions, ProfileEnvelope adapters, sandbox/runtime authority, and Pi explicit-install behavior are part of the Phase 1–5.1 boundary. Native tmux/subscription rehearsal Web E2E files are not included.

## Exclude

`.zcode/`, `spikes/`, `build/`, `dist/`, `.pytest_cache/`, `.agent-box-test-tmp/`, frontend `node_modules/`, credential/auth/token material, the independent Native Codex credential/safety report, Native runtime tests, the Codex subscription rehearsal, the real-tmux Web E2E, and unrelated product/research/validation reports remain unstaged. No detected secret-shaped token was found.

## Boundary confirmations

- Work Core ontology, Binding, Freeze, Dispatch, Finalization, schema, migrations, and Ref semantics are unchanged. The only Work Core paths in the whitelist are registry/repository infrastructure for the extension boundary.
- ProfileEnvelope is the single public envelope; Harness-native payload remains plugin-owned. Web serializes it without Harness-specific reconstruction.
- Selector compatibility and Quick Launch candidates are Catalog-driven; the browser fixture uses generic discovery labels and does not map official providers/selectors.
- No Git staging operation was run while preparing this ledger.

## Verification evidence

- Branch/HEAD: `main` / `dd34b84de515f472fd4e436e8c0f045a5a357ef8`.
- Non-Native Python matrix: `224 passed`; Native tests and the cache-sensitive static-tree test were excluded and are not represented as passes.
- `git diff --check`: PASS; `python3 -m compileall`: PASS.
- Root plus 12 wheel build and clean-venv discovery/doctor evidence was produced in Phase 5.1; no real model request was made.
- Playwright was not counted as a clean-venv pass because that venv lacked the Playwright module. The repository environment's targeted Quick Launch test passes after its stale assertion was updated.

## Manual handoff

Run the helper, then inspect:

```text
git diff --cached --stat
git diff --cached --check
git status --short
```

Only after reviewing the cached diff should the checkpoint commit be created.
