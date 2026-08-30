# Legacy ownership audit — repository restructure

Date: 2026-08-30
Scope: `src/agent_box/{core,resources,templates,presets,adapters,work}`, plus
`launch.py`, `project_space.py`, `config.py`, `edit.py`, and `cli/shell.py`.

This is a read-only audit. No source code or Git state was changed. Generated
`__pycache__` files are intentionally excluded from the inventory; they are
build/runtime residue, not source ownership.

## Executive conclusion

The old profile/runtime path is still a live dependency of the Preview in two
places: `work_core/providers/resources.py` imports
`resources.profile.ProfileRepo`, and the Preview selector in
`plugins/agent-box-preview-resources` imports the same repository. The new
`agent-box-harnesses` package has its own revisioned `ProfileRepository`, but
also subclasses the old Preview profile provider and the new Codex launch
adapter imports `agent_box.launch.LaunchPlan`. Thus the directory can be
cleaned, but only after extracting/redirecting these seams.

The old `work/` package is not the current Preview Work Core. It is the fixed
`plan → execute → review` implementation and should not be moved wholesale.
The one useful old capability is the Git worktree implementation, which can be
compared with (and selectively merged into) `agent-box-git`; the rest is
replaced by `work_core/` and the Host facade.

## Classification legend

- `RETAIN_CORE`: provider-neutral durable infrastructure or Core persistence.
- `MOVE_HARNESSES_PLUGIN`: agent profile/config/session/launch or native
  Harness behavior; target `plugins/agent-box-harnesses` (or a later official
  Harness plugin).
- `MOVE_WEB_PLUGIN`: Web Host/settings-only behavior.
- `MOVE_GIT_PLUGIN`: Git-specific implementation to merge into
  `plugins/agent-box-git`.
- `MOVE_OTHER_PLUGIN`: generic artifact/resource capability that belongs in an
  installed provider plugin, not Core.
- `TEMPORARY_COMPATIBILITY_SHIM`: mixed old public surface; split first and
  retain only a deliberately thin forwarding layer.
- `DELETE_AS_REPLACED`: old fixed-flow implementation or data replaced by the
  Preview Core/plugin path. Historical migrations may remain for upgrades.
- `UNKNOWN_REQUIRES_VALIDATION`: no safe ownership decision without a runtime
  call-site/compatibility decision.

## File-by-file inventory

### `src/agent_box/core/`

| File | Class | Responsibility / callers / Preview use | Target, risk, tests |
|---|---|---|---|
| `core/__init__.py` | `TEMPORARY_COMPATIBILITY_SHIM` | Re-exports DB, format I/O, and the agent-type registry. Imported by tests and old modules; indirectly on Preview paths. | Replace with explicit Core/SDK exports; do not leave agent-type/profile exports in the Core namespace. Risk: import breakage. Tests: Core repository, profile/resource, clean wheel. |
| `core/db.py` | `TEMPORARY_COMPATIBILITY_SHIM` | Singleton SQLite connection/migration runner and write lock. It currently serves `profiles`, `sessions`, legacy `works`, and new `core_*` tables; `work_core.repository` and old repositories both call it. Preview definitely uses it. | Split Core DB access from Harness profile/session storage, or retain one carefully versioned adapter temporarily. Highest schema risk. Tests: all Core repository/finalization tests, profile/session tests, concurrent Host admission. |
| `core/io.py` | `MOVE_HARNESSES_PLUGIN` (extract atomic primitive to SDK if needed) | JSON/JSONC/TOML/YAML profile config readers/writers, deep merge, atomic file writes. Used by old resources, launch, project space, and tests; not a Work Core concept. | Move format/profile I/O with Harnesses; keep only a format-neutral atomic write helper in SDK if required. Risk: YAML/JSONC round-trip and secret files. Tests: `test_profile`, `test_config_files`, provider/MCP/hooks/skills/prompt tests. |
| `core/library.py` | `MOVE_HARNESSES_PLUGIN` | Agent-type registry validation, binaries/config dirs, templates/presets, project surfaces, ACS extra types. Called by profile/resource/launch/project_space/ACS adapter and old CLI; Preview indirectly uses it through old profile provider. | Move registry plus agent-specific data to Harnesses; retain a provider-neutral extension registry only in `extensions`. Risk: registry path/data packaging. Tests: library/preset/project-space/launch and plugin discovery. |
| `core/agent_types.json` | `MOVE_HARNESSES_PLUGIN` | Four product-specific agent definitions (`claude`, `codex`, `hermes`, `opencode`), resource strategies, project surfaces, sandbox and binary settings. Consumed by `core.library`. | Package with Harness/plugin distributions, not Core. Risk: missing defaults changes launch/config behavior. Tests: registry validation, per-agent profile and project-surface tests. |
| `core/provider_endpoints.json` | `MOVE_HARNESSES_PLUGIN` | Curated provider → model endpoint candidates, consumed only by `adapters.models`. | Move with model/provider adapter; never expose as Core data. Tests: model adapter endpoint fallback tests (currently need adding). |

### `src/agent_box/resources/`

| File | Class | Responsibility / callers / Preview use | Target, risk, tests |
|---|---|---|---|
| `resources/__init__.py` | `TEMPORARY_COMPATIBILITY_SHIM` | Empty legacy package namespace. Imported by old CLI/tests. | Keep only while imports migrate; delete once plugin entry points replace it. |
| `resources/_shared.py` | `MOVE_HARNESSES_PLUGIN` | Resolves old profile metadata and fetches ACS resources. All old apply modules call it. | Move with Harness resource management. Risk: ACS lookup and error compatibility. Tests: all provider/MCP/skill/prompt paths. |
| `resources/profile.py` | `MOVE_HARNESSES_PLUGIN` | `ProfileRepo` CRUD in `profiles` table plus template/preset copy and profile metadata. Called by old CLI, launch, tests, `work_core/providers/resources.py`, and Preview selector. | Migrate behavior to revisioned Harness profile store/adapter; do not maintain two profile authorities. Risk: current Preview depends on this exact API. Tests: profile/preset, work-core real-resource and Web harness E2E. |
| `resources/config_files.py` | `MOVE_WEB_PLUGIN` | Format-aware read/write of GUI settings (`gui-settings.json`), used by settings UI/tests. | Move to Web Host settings service; not a Harness resource. Risk: persisted projects directory compatibility. Tests: `test_config_files`, Web settings. |
| `resources/hooks.py` | `MOVE_HARNESSES_PLUGIN` | CRUD for agent-specific hooks embedded in Claude/Hermes config. CLI ProfileCommands calls it. | Implement as Harness capability/config projection; preserve merge/replace/remove semantics. Risk: native format and hook key differ by agent. Tests: `test_hooks`, projection tests. |
| `resources/mcp/__init__.py` | `MOVE_HARNESSES_PLUGIN` | Legacy MCP apply-only public exports. | Move with MCP capability adapter; no generic MCP entity in Core. Test import compatibility. |
| `resources/mcp/apply.py` | `MOVE_HARNESSES_PLUGIN` | ACS MCP lookup, native config conversion, list/remove for Claude/Codex/Hermes/OpenCode. Called by CLI and tests. | Move to Harnesses; expose capability refs/config projection rather than Core MCP objects. Risk: conversion formats and credentials. Tests: `test_mcp`, native projection. |
| `resources/providers/__init__.py` | `MOVE_HARNESSES_PLUGIN` | Legacy provider-apply public exports. | Move with Harness profile capability. |
| `resources/providers/apply.py` | `MOVE_HARNESSES_PLUGIN` | ACS provider/model settings writers for JSON, multi-file, YAML and JSONC agents; profile provider store/list/remove. CLI and tests call it. | Move to Harnesses; model/provider fields must become profile revisions or capability refs. Risk: four format strategies and destructive overwrite. Tests: provider/profile/model tests. |
| `resources/prompts/__init__.py` | `MOVE_HARNESSES_PLUGIN` | Legacy prompt apply namespace. | Move with Harness prompt capability. |
| `resources/prompts/apply.py` | `MOVE_HARNESSES_PLUGIN` | ACS prompt fetch and write to registry-declared native prompt file; updates `prompt_ref`. | Move with Harnesses; preserve prompt content and immutable profile revision semantics. Tests: `test_prompts`. |
| `resources/skills/__init__.py` | `MOVE_HARNESSES_PLUGIN` | Legacy skill apply namespace. | Move with Harness capability adapter. |
| `resources/skills/apply.py` | `MOVE_HARNESSES_PLUGIN` | Copies ACS skill directories into profile skill locations and removes them. | Move with Harnesses; never make skill contents a Core Ref payload. Risk: filesystem deletion/path safety. Tests: `test_skills`. |
| `resources/sessions.py` | `MOVE_HARNESSES_PLUGIN` | PID/session history in `sessions` table, zombie cleanup, new/resume mode records. Called by `launch.py`, CLI commands and tests. | Move to native Harness launch/session control or retain a temporary adapter. Risk: old PID rows are not Codex App Server session facts. Tests: `test_sessions`, launch/CLI tests, restart behavior. |

### `src/agent_box/templates/`

All files below are agent-native defaults and therefore `MOVE_HARNESSES_PLUGIN`.
They are copied by `resources.profile._copy_template`, not read by Work Core.

| Files | Responsibility / destination / risk |
|---|---|
| `templates/claude/CLAUDE.md`, `settings.json`, `settings.local.json` | Claude system profile baseline, permissions and telemetry settings. Move to Claude Harness package/data. Risk: default deny/permission behavior. Tests: profile + launch. |
| `templates/codex/auth.json`, `config.toml` | Codex native config/auth placeholders and defaults. Move to Codex Harness; never copy credential values into Profile API. Risk: old config schema vs revisioned projection. Tests: launch/Codex projection/secret-boundary. |
| `templates/hermes/.env`, `config.yaml` | Hermes model/provider and environment defaults. Move to Hermes Harness. Risk: `.env` secret boundary and optional YAML dependency. Tests: provider/launch. |
| `templates/opencode-data/auth.json`, `opencode/opencode.jsonc` | OpenCode secondary auth and JSONC provider defaults. Move to OpenCode Harness. Risk: auth data and JSONC comments/trailing commas. Tests: model/provider/launch. |

### `src/agent_box/presets/`

| Files | Class / details |
|---|---|
| `presets/provider_presets.json` | `MOVE_HARNESSES_PLUGIN`; ACS-style provider catalog used by the old profile/provider experience. Move with model/provider adapter; verify no credential values. |
| `presets/claude/blank/CLAUDE.md`, `decision-maker/CLAUDE.md`, `python-dev/CLAUDE.md`, `python-dev/hooks.json`, `python-dev/settings.overlay.json`, `spec-writer/CLAUDE.md`, `ui-designer/CLAUDE.md` | `MOVE_HARNESSES_PLUGIN`; Claude profile seed content and hook/permission overlays. Move as Harness-owned seed data. Risk: users expect exact preset names and merge behavior. Tests: `test_preset`, profile create. |

### `src/agent_box/adapters/`

| File | Class | Responsibility / callers / Preview use | Target, risk, tests |
|---|---|---|---|
| `adapters/__init__.py` | `MOVE_HARNESSES_PLUGIN` | Public exports for ACS lookup functions. | Move with ACS adapter; temporary import shim only if old CLI remains. |
| `adapters/acs.py` | `MOVE_HARNESSES_PLUGIN` | Read-only SQLite adapter for cc-switch/ACS providers, skills, MCP and prompts. Called by all old resource apply modules and tests; no Core durable ownership. | Move to Harness/ExternalConfigSource adapter. Risk: schema drift and `agent_type` column mapping. Tests: ACS stub/resource tests and clean-wheel behavior. |
| `adapters/models.py` | `MOVE_HARNESSES_PLUGIN` | Fetches model lists over HTTP/curl using `provider_endpoints.json`; used by provider UI/old model flow. | Move with provider/model capability. Risk: network/error behavior and endpoint table packaging. Tests: add deterministic mocked curl/endpoint tests. |

### `src/agent_box/work/` (legacy fixed workflow)

| File | Class | Responsibility / callers / Preview use | Target, risk, tests |
|---|---|---|---|
| `work/__init__.py` | `DELETE_AS_REPLACED` | Exposes old Work v0.1 model names and explicitly describes legacy launch/session path. | Delete after CLI/tests migrate to `work_core`; no new imports. |
| `work/models.py` | `DELETE_AS_REPLACED` | Persists `Attempt`, `Decision`, `Handoff`, `ArtifactRef`, role bindings and fixed phase/status enums. | Replaced by provider-neutral `work_core` Work/Execution/Ref/Evidence. Do not add new semantics here. |
| `work/repository.py` | `DELETE_AS_REPLACED` | SQL repository for legacy `works`, attempts, decisions, handoffs and artifacts. | Replaced by `work_core.repository`; retain only historical DB migration/read strategy if upgrade requires it. Risk: migration compatibility. |
| `work/service.py` | `DELETE_AS_REPLACED` | Orchestrates fixed Plan→Execute→Review, profile replacement, handoffs, patch capture and cleanup. | Directly conflicts with Host-decides-next-action architecture. Delete after CLI retirement. |
| `work/state.py` | `DELETE_AS_REPLACED` | Provider snapshot plus old attempt/decision/handoff projection. | Replaced by Core projection and Host queries; no plugin destination. |
| `work/workflow.py` | `DELETE_AS_REPLACED` | Hard-coded workflow routing and transitions. | Explicitly prohibited as new Core behavior; delete. |
| `work/providers.py` | `DELETE_AS_REPLACED` | Old `SessionProvider`, `WorkspaceProvider`, `ArtifactProvider` protocols and `SessionResult`. | Replaced by Extension `ExecutionProvider`/`ResourceProvider` protocols. Extract only compatible DTO ideas after API review. |
| `work/resolution.py` | `DELETE_AS_REPLACED` | Role/profile capability resolution and profile digest for old Attempts. | Replaced by frozen Binding + Harness ProfileRef/projection. Risk: users may depend on digest redaction semantics; port tests before delete. |
| `work/acp.py` | `MOVE_HARNESSES_PLUGIN` (selective extraction) | Large ACP subprocess/session implementation for old Attempts; `cli/commands/work.py` builds it. Not used by Web Preview. | If ACP remains an official Harness transport, extract transport/session code into Harnesses and rewrite against `ExecutionProvider`; do not copy old Attempt coupling. Otherwise delete as replaced by Codex app-server. Tests: ACP optional integration only. |
| `work/workspace.py` | `MOVE_GIT_PLUGIN` (selective extraction) | Git worktree create/snapshot/export/cleanup and runtime-injection filtering. Used only by old Work service/CLI, not Web Preview; responsibility is still needed by Git plugin. | Merge safe Git-specific behavior into `agent-box-git` after comparing its exact-commit/ref and cleanup semantics. Risk: old mutable dict refs vs new exact WorkspaceRef and materialization key. Tests: `test_work_providers` plus Git plugin vertical tests. |
| `work/artifacts.py` | `MOVE_OTHER_PLUGIN` (selective extraction) | Filesystem text artifacts, SHA-256 refs and path-segment safety for old Work. | Extract generic artifact provider into preview-resources/artifacts or a future artifact plugin, using current `ArtifactRef` contract; old model coupling is replaced. Tests: artifact tests and Core output/evidence tests. |
| `work/acp.py` callers | `DELETE_AS_REPLACED` for old service wiring | `cli/commands/work.py` instantiates `AcpProcessSessionProvider` alongside all other legacy providers. | Remove old CLI wiring rather than preserving a second Work execution path. |

### Standalone modules

| File | Class | Responsibility / callers / Preview use | Target, risk, tests |
|---|---|---|---|
| `launch.py` | `MOVE_HARNESSES_PLUGIN` | bwrap `LaunchPlan`, system/profile/project mounts, native binary lookup, process launch, session recording. Imported by `agent-box-codex`, `agent-box-harnesses` Codex adapter, old ACP and CLI; therefore currently Preview-adjacent/live. | Move launch planning/runtime into Harness SDK/plugin; keep a tiny compatibility import if needed during package transition. Risk: new Codex adapter currently imports `LaunchPlan`, and bwrap vs projection semantics differ. Tests: `test_launch`, plugin Codex wiring, clean wheel. |
| `project_space.py` | `MOVE_HARNESSES_PLUGIN` | Registry-driven project profile discovery, native surface selection and safe mount materialization. Called by `launch.py` and project-space tests. | Move alongside Harness launch/project overlay; Git WorkspaceRef materialization remains Git plugin-owned. Risk: symlink/path safety and project-layer precedence. Tests: `test_project_space`, launch E2E. |
| `config.py` | `TEMPORARY_COMPATIBILITY_SHIM` | Mixed global paths/constants, profile paths, agent registry lookup, ACS/cc-switch paths, GUI projects directory, history, project surfaces and validation. Imported almost everywhere, including Host and plugins. | Split into Core home/DB paths, Harness profile/runtime paths, Web settings, and ExternalConfigSource locator; preserve old functions only as forwarding shims for one release. Risk: broadest import blast radius and accidental credential/path changes. Tests: full suite, clean wheel, Web and plugin discovery. |
| `edit.py` | `TEMPORARY_COMPATIBILITY_SHIM` | Opens configured editor; called by old `cli/commands/core.py` profile/config edit paths and test mock. | Keep a tiny CLI/Host utility or move to Harness management adapter; it is not Core. Risk: command selection and test monkeypatch paths. Tests: editor mock and CLI edit tests. |
| `cli/shell.py` | `TEMPORARY_COMPATIBILITY_SHIM` | cmd2 REPL context stack; imports `CoreCommands`, old `ProfileCommands`, and old `WorkCommands`; provides the old fast interactive UX. Not used by browser Preview. | Retain as a thin CLI adapter while profile/harness commands migrate; remove `WorkCommands` fixed workflow and dispatch profile operations through plugin/Host APIs. Risk: users depend on command names, context prompt and script mode. Tests: `test_cli_repl`, `test_cli_commands`, script-mode tests. |

## Legacy database/migration note

The migration files are not in the requested legacy directory inventory, but
their ownership affects cleanup:

| Migration | Disposition |
|---|---|
| `001_init.sql` | `TEMPORARY_COMPATIBILITY_SHIM`: creates old `profiles`/`sessions` plus base schema. Keep for upgrade compatibility; stop using it as new ownership. |
| `002_rename_claude_md_ref.sql` | `TEMPORARY_COMPATIBILITY_SHIM`: old Claude-specific column rename. Keep as historical upgrade. |
| `003_work_core.sql` | `DELETE_AS_REPLACED` semantically, but retain the migration file and old tables for non-destructive upgrades/forensics. Do not route new operations to them. |
| `004_minimal_work_core.sql` | `RETAIN_CORE`: creates current Core tables. |
| `005_resource_contract_inputs.sql` | `RETAIN_CORE`: reserved migration number; retain to preserve version ordering. |
| `006_resource_contract_inputs.sql`, `007_resource_observations.sql`, `008_resource_observation_evidence_metadata.sql`, `009_execution_finalization.sql` | `RETAIN_CORE`: current binding, observation/evidence and finalization persistence. |

The eventual split must not rewrite an existing user's DB in place without a
versioned migration. In particular, `core/db.py` currently runs every schema
family through one singleton connection.

## Old fast-usage experience coverage

| Experience | Current legacy implementation | Preview/new owner | Audit result |
|---|---|---|---|
| Quickly select a project | `config.projects_dir()`/`set_projects_dir()`, Web settings, `project_space.resolve_launch_root()` | Web Host project selector + Git Workspace selector; Harness project-surface adapter for native config | Behavior is split. Preserve persisted `gui-settings.json` and exact selected path; do not put project UI in Core. |
| Create/select Profile | `resources.profile`, `ProfileCommands`, old `profiles` table | Harness manager/profile repository + plugin selector | New Codex store exists, but old profiles are not automatically migrated. Need one-way import/compatibility plan and exact ProfileRef mapping. |
| Model and Provider config | `adapters.acs`, `adapters.models`, `resources.providers.apply`, templates | Harness profile revision/config projection and credential locator | Native format writers are not yet represented by generic new profile API. Preserve provider/model fields without secrets. |
| MCP | `resources.mcp.apply`, ACS | Harness capability refs / provider-owned projection | New profile has `capability_refs`, but old ACS MCP apply UX is not fully represented; migration gap. |
| Skills | `resources.skills.apply` | Harness-owned capability/resource projection | Copy/remove behavior exists only in old path; decide whether to import as capability refs or keep native source locator. |
| Plugins (agent-native) | Registry resource types and old profile config writers | Harness profile `config`/capability refs, plugin-owned projection | Must distinguish Agent-native plugins from Agent-Box extension distributions; never add either as Core entities. |
| Hooks | `resources.hooks`, Claude preset overlay | Harness config/projection | Preserve agent-specific key/format and merge semantics; no generic Core hook model. |
| Instructions/permissions | templates, presets, registry resource declarations | Harness profile config and projection | New Codex profile can hold non-secret config, but Claude/Hermes/OpenCode adapters need explicit mapping. |
| New session / resume session | `config.MODE_NEW/MODE_RESUME`, `launch(extra_args)`, `resources.sessions` | Harness native launch/control; continuation is a new Core Execution with old SessionRef input | Old PID session rows do not equal Core SessionRef. Preserve CLI flags but avoid recording provider lifecycle in Core. |
| Harness launch | `launch.py` + `project_space.py` + old ACP | `agent-box-harnesses` and future Harness plugins | Current Codex plugin imports old launch types; extraction is a hard prerequisite. |
| cc-switch import | `config.acs_binary()` and `adapters.acs` read from ACS; no complete import implementation found in audited Python path | Harness ExternalConfigSource adapter; Web flow is prototype-only | Phase-2 validation explicitly says cc-switch import remains out of scope. Treat as a tracked gap, not silently “preserved.” |

## Current call-site facts

- `src/agent_box/work_core/providers/resources.py` imports and instantiates
  `resources.profile.ProfileRepo` for `AgentBoxProfileResourceProvider`.
- `plugins/agent-box-preview-resources/src/agent_box_preview_resources/web_selectors.py`
  imports `resources.profile.ProfileRepo` for its profile selector.
- `plugins/agent-box-harnesses/src/agent_box_harnesses/codex/runtime.py`
  subclasses the old `AgentBoxProfileResourceProvider`, while replacing its
  repository implementation.
- `plugins/agent-box-harnesses/src/agent_box_harnesses/codex/launch.py` imports
  `agent_box.launch.LaunchPlan`; `agent-box-codex` imports both `LaunchPlan`
  and `build_launch_plan`.
- `src/agent_box/cli/commands/work.py` still constructs the complete legacy
  Work service (`FixedPlanExecuteReviewWorkflow`, `GitWorktreeProvider`, old
  ACP and artifact providers).
- `src/agent_box/server/host.py` and `application/facade.py` use the new
  Work Core/Host path; they do not use `cli/shell.py` or legacy `work/`.

## Ten most dangerous migration points

1. **Single mixed SQLite connection/schema** — splitting profile/session DB
   ownership from Core can break existing migrations, locks, and test fixtures.
2. **`resources.profile.ProfileRepo` has live Preview callers** — deleting it
   before changing two selectors/providers breaks Web binding preparation.
3. **`LaunchPlan` is imported by installed plugins** — moving `launch.py`
   requires an SDK compatibility module or coordinated wheel release.
4. **Profile authority duplication** — old mutable `profiles` rows and new
   revisioned Harness profiles can produce different ProfileRefs/digests.
5. **Secret boundary during template/provider migration** — `auth.json`,
   `.env`, ACS settings and credential locators must never enter Web JSON,
   Core Ref metadata, or immutable profile snapshots.
6. **Agent-native format differences** — provider/MCP/hooks writers encode
   four different JSON/YAML/JSONC/TOML layouts; a generic copy risks silently
   changing runtime behavior.
7. **Project surface and symlink safety** — `project_space.py` materializes
   native paths and layering; changing order or boundary checks can overwrite
   real project files.
8. **Legacy workflow leakage** — retaining `work/service.py` or
   `cli/commands/work.py` as a “temporary” path can reintroduce automatic
   planner/executor/reviewer progression into the new Host/Core product.
9. **Git ref semantic mismatch** — old mutable workspace dicts and new exact
   `(contract_id, WorkspaceRef)` inputs differ in identity, materialization and
   cleanup guarantees.
10. **Resume/session semantics** — old PID-based session history, ACP sessions,
    and native Codex App Server sessions have different recovery guarantees;
    mapping them all to one Core SessionRef would overclaim control.

## Recommended migration gates

1. Freeze this inventory and add import-graph tests that fail if Core imports
   `resources`, `launch`, agent names, Git, or Harness modules.
2. Introduce a profile/Harness compatibility adapter and migrate both current
   Preview callers before moving `resources.profile`.
3. Extract a provider-neutral `LaunchPlan`/launch SDK boundary, then update
   `agent-box-codex` and `agent-box-harnesses` in one coordinated change.
4. Move agent registry, templates, presets, ACS/model adapters and profile
   resource writers into Harness plugin packages; preserve old CLI names only
   as forwarding commands.
5. Port Git behavior into `agent-box-git`, port any generic artifact provider
   into an artifact plugin, and delete the fixed `work/` service/CLI path.
6. Split `config.py` and the mixed DB only after clean-wheel, plugin discovery,
   Web E1→E2, profile revision, and legacy-home upgrade tests pass.

## Verdict

The old tree is not safe to delete in one pass because profile, launch and
`LaunchPlan` symbols remain on active Preview/plugin import paths. It is safe
to remove the fixed legacy `work/` runtime after replacing its CLI wiring, with
selective Git/artifact/ACP extraction. The safe end state is: Core owns only
durable Work/Execution/Binding/Dispatch/Ref/Evidence facts; Harness plugins own
profiles, native config, credentials locators, launch and session control; Web
owns GUI settings/Host API; Git and artifact behavior stay in their own
providers.
