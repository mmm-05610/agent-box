# Extension Kernel Boundary Repair — Manual Checkpoint Ledger

## Scope and verdict

- Branch: `feat/resource-routing-phase2`
- Base: `80d2017`
- HEAD at audit: `80d2017e9a708421556914cd99d843573daf4c68`
- Intended checkpoint: Extension Kernel API v2, generic CatalogContribution, Host/Runtime/Credential protocol packs, Harness-owned Profile API/HostControl, generic Resource Library, Web/Skills discovery, migrations, tests, docs, and packaging.
- Explicitly excluded: MCP Resource, Resource Routing Phase 2 capability work, Work Core/schema/migrations semantics, credential/runtime/model evidence changes, generated caches/build/dist/node_modules/egg-info, and other worktrees.
- No staging, commit, push, or merge was performed.

## API and boundary audit

- `agent_box.extensions` is the canonical pure kernel and exposes API v2 (`PLUGIN_API_VERSION == 2`).
- `PluginRegistration` uses only contracts, resource providers, execution providers, and generic contributions.
- Catalog queries are generic `query(kind, component_id=None)`; Catalog has no Profile, Skill, Harness, Host, Runtime, Credential, Transport, or Web semantics.
- Official plugin registrations are API v2 and use typed contribution wrappers. The clean Preview has 12 READY entry points and no failed entry points.
- The API v1 fake-plugin conformance test reports `INCOMPATIBLE`, does not execute build, and leaves no Registry/Catalog state.
- Canonical imports are `agent_box.protocols.host`, `agent_box.protocols.runtime`, and `agent_box.protocols.credentials`. The old extension namespace imports are absent from active source/tests/fixtures and the new architecture/SDK/checkpoint documentation.
- `ProfileEnvelope` and Profile management are Harness-owned. Root Extension has no Profile implementation or `HarnessProfileManager`.
- Work Core, schema, and migrations have no diff from `80d2017`.

## Resource Library cardinality audit

Clean Preview discovery reports exactly six libraries:

| Library view | contribution kind | component_id | owner plugin / entry point | contract_id | authority / store identity | harness scope |
|---|---|---|---|---|---|---|
| claude-code profile view | `agent-box.host.resource-library@1` | `claude-code` | `claude-code` / `agent_box_harnesses.claude` | `agent-box.profile@1` | `harness-profile` / shared `ProfileStore` at the Preview `AGENT_BOX_HOME/profiles` authority | `claude-code` |
| codex profile view | `agent-box.host.resource-library@1` | `codex` | `codex` / `agent_box_harnesses.codex` | `agent-box.profile@1` | `harness-profile` / same shared `ProfileStore` | `codex` |
| hermes profile view | `agent-box.host.resource-library@1` | `hermes` | `hermes` / `agent_box_harnesses.hermes` | `agent-box.profile@1` | `harness-profile` / same shared `ProfileStore` | `hermes` |
| opencode profile view | `agent-box.host.resource-library@1` | `opencode` | `opencode` / `agent_box_harnesses.opencode` | `agent-box.profile@1` | `harness-profile` / same shared `ProfileStore` | `opencode` |
| pi profile view | `agent-box.host.resource-library@1` | `pi` | `pi` / `agent_box_harnesses.pi` | `agent-box.profile@1` | `harness-profile` / same shared `ProfileStore` | `pi` |
| agent-skills library | `agent-box.host.resource-library@1` | `agent-skills` | `skills` / `agent_box_skills.plugin` | `agent-box.skill@1` | `agent-skills` / canonical `SkillStore` | none |

The number is six because the five Harness-specific views are distinct
contract/library contributions for user-facing scope, while all five delegate to
one `harness-profile` ProfileStore and therefore share one revision/digest
authority. The sixth contribution is the one canonical Skills library. A
Harness-filtered view is not a second Profile authority. Codex, Claude, OpenCode,
Hermes, and Pi are all present; no MCP Resource is involved.

Catalog reports these as namespaced contributions and does not know that the first
five are Profiles or that the sixth is Skills. Web discovers descriptors and does
not maintain a Harness mapping or select the first library implicitly.

## Validation evidence

- Python closure suite after the Skills Library fix: `142 passed`.
- Frontend: Vitest `6 passed`; lint passed; production build passed; generated static bundle was refreshed; Playwright/browser regression passed where available as part of the Web validation run.
- Native/integration suite: `54 passed`; fake/protocol tests ran. No native capability skip was required in this environment.
- Root wheel plus eight official plugin wheels built successfully: 9 wheels in `/tmp/ek-cardinality-verified-wheels.MgI2EY`.
- Root-only clean venv: import/API v2 passed, `plugins list --json` returned `[]`, doctor returned degraded JSON without traceback, and the root wheel contained no Harness/Profile/runtime-composition implementation paths.
- Preview clean venv: all official entry points discovered; 12 READY, 0 FAILED; inspect/doctor and the six-library cardinality/authority assertions passed.
- `compileall` and `git diff --check` passed.
- Boundary scans found no active old canonical imports, old registration fields, dedicated Catalog methods, Root Profile API, HarnessProfileManager, or HostControl runtime reflection. Historical audit/archive prose is excluded from the active-source scan.
- Secret/path scan found no credential value or secret path in Binding, Evidence, manifest, or public argv. Locator-only identity, execution-scoped materialization, exact read-only mounts, cleanup, and reuse rejection remain covered by protocol tests.

## Exact intended staging set

The companion script stages only the explicit paths listed below. It does not use
`git add -A`, `git add .`, directory globs, or execute any staging operation itself.

### Documentation

- `docs/architecture/ARCHITECTURE.md`
- `docs/plugins/PLUGIN_SDK.md`
- `docs/validation/current/EXTENSION_KERNEL_BOUNDARY_REPAIR.md`
- `docs/validation/current/EXTENSION_KERNEL_BOUNDARY_REPAIR_CHECKPOINT_LEDGER.md`
- `docs/validation/current/ROOT_AND_PLUGIN_ARCHITECTURE_AUDIT_2026-09-01.md`
- `docs/validation/current/ROOT_EXTENSION_REPAIR_PHASE_1_SANDBOX_AUTHORITY.md`
- `docs/validation/current/ROOT_EXTENSION_REPAIR_PHASE_3_EXTENSION_CATALOG.md`

### Source, plugins, and tests

The exact source/test move, deletion, and modification list is encoded one path per
`git add --` command in `tools/stage-extension-kernel-boundary-repair.sh`, including
the old deleted paths and their canonical replacements.

### Excluded from staging

No Work Core, schema, migration, MCP, Resource Routing Phase 2, generated cache,
build/dist, node_modules, egg-info, credential evidence, or unrelated worktree path
is part of this checkpoint.

## Handoff

Suggested commit message: `refactor: separate extension kernel from protocol packs`

After this manual checkpoint is independently reviewed, committed, and merged, the
next task may create a new main-based Resource Routing Phase 2 branch. This repair
does not begin that work.
