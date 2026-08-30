# Agent-Box repository restructure master plan

Date: 2026-08-30

## Verdict

Restructure the existing repository in place. Do not create a replacement
repository and do not redesign Work Core. The target is a small frozen kernel,
a provider-neutral extension SDK, and separately installable official plugins.

The migration must be replacement-first: establish the plugin-owned path and
its tests before removing the legacy implementation it replaces.

## Target repository

```text
agent-box/
├── src/agent_box/
│   ├── work_core/
│   ├── resource_contracts/
│   ├── extensions/
│   ├── migrations/
│   └── cli/
├── plugins/
│   ├── agent-box-web/
│   │   ├── src/agent_box_web/
│   │   ├── frontend/
│   │   └── tests/
│   ├── agent-box-harnesses/
│   ├── agent-box-git/
│   ├── agent-box-tmux/
│   ├── agent-box-pi/
│   └── agent-box-artifacts/
├── tests/
│   ├── core/
│   └── conformance/
├── e2e/
├── docs/
└── tools/
```

`agent-box-web` is an installable Host package, not an
`agent_box.plugins` Provider entry point. It loads Provider plugins through the
provider-neutral extension loader.

## Frozen ownership boundaries

### Root package

The root package owns only:

- Work, Execution, frozen inputs, Dispatch, Ref and Evidence semantics;
- atomic finalization and durable Core persistence;
- provider-neutral resource contracts and extension protocols;
- plugin discovery/conformance;
- a minimal CLI that can list/inspect plugins and delegate to installed Hosts.

It must not contain concrete Codex, Git, tmux, Web, Profile, MCP, workflow or
sandbox implementations.

### Web Host

`agent-box-web` owns the application facade, Host operations, mutation
ownership, HTTP API, static asset serving and React Workbench.

### Harnesses

`agent-box-harnesses` is the official owner of Harness descriptors, immutable
Profile revisions, capability projection, credential locators, native launch
drivers, continuation contracts and Host controls. Codex App Server and Codex
tmux interactive are two modes of the same Codex integration.

### Resource plugins

- `agent-box-git`: exact Git identity, worktree materialization and output
  capture;
- `agent-box-tmux`: exact console/pane identity and terminal operations;
- `agent-box-artifacts`: immutable file/content artifacts;
- workflow and sandbox products remain future independent plugins.

## Migration phases

### Phase 0 — Recovery checkpoint and baseline

1. Inventory every tracked, untracked and deleted path.
2. Preserve all currently untracked plugin source before moving anything.
3. Establish an allowlisted Git checkpoint or an external recovery snapshot.
4. Record baseline Core, plugin, frontend, browser and clean-wheel results.

Exit gate: every current Preview source file is recoverable and the baseline is
reproducible.

### Phase 1 — Extract the Web Host

Move:

- `src/agent_box/application/`;
- `src/agent_box/server/`;
- the production portion of `gui-web/`;
- Web/Host/browser tests;

into `plugins/agent-box-web`. Keep only a lazy CLI delegate in the root package.
Exclude prototype, legacy bridge files, `dist`, `node_modules` and generated
assets from source ownership. Build static assets as part of the Web wheel.

Exit gate: installing the root package without Web remains valid; installing
`agent-box-web` enables `agent-box web`; browser E1-to-E2 still passes.

### Phase 2 — Make Harnesses independent

1. Make the revisioned Harness Profile repository and ResourceProvider direct
   implementations of extension protocols.
2. Remove their dependency on `agent_box.resources.profile` and
   `work_core.providers.resources`.
3. Move the safe `LaunchPlan` value and launch-driver code into Harnesses;
   remove the formal dependency on `agent_box.launch`.
4. Preserve exact ProfileRef, locator-only CredentialSourceRef,
   execution-local projection and secret protections.

Exit gate: `agent-box-harnesses` works in a clean environment without legacy
Profile or launch modules.

### Phase 3 — Consolidate Codex

Move App Server client/provider, native tmux provider, continuation contract,
Host control and hook recorder from `agent-box-codex` into the Codex driver in
`agent-box-harnesses`.

There must be one official Harness plugin owner and no duplicate provider,
selector, control or contract registrations. A deprecated no-entry-point
import-forwarding package may exist for one compatibility window only.

Exit gate: both `codex-app-server` and `codex-tmux-interactive` pass clean-wheel
tests under the Harnesses distribution, including explicit Finish and new
Execution continuation.

### Phase 4 — Remove concrete implementations from Core

1. Move Git, Profile and Artifact implementations out of
   `work_core/providers/resources.py`.
2. Remove Profile-specific hard-coding from `ExtensionRegistry`.
3. Keep resource Contract registration provider-neutral.
4. Reduce root CLI to plugin/doctor/Host delegation.
5. Keep historical migrations for non-destructive upgrade, but stop new writes
   to legacy Profile/session/workflow tables.
6. Add static import-boundary tests.

Exit gate: Work Core imports no concrete Provider or product module and its
public protocol tests pass from a root-package-only installation.

### Phase 5 — Preserve useful 1.x experience through plugins

Migrate behavior, not old ownership:

- project selection to Web Host plus Git selector;
- Profile CRUD and selection to Harness manager;
- model/provider, MCP, skills, agent-native plugins, hooks, instructions and
  permissions to Harness capability adapters;
- cc-switch/ACS to a read-only ExternalConfigSource importer;
- fresh/resume to provider-owned launch and continuation input;
- interactive launch to the Codex native driver consuming a frozen tmux Ref.

Legacy profiles are imported once into immutable revision 1. Do not copy auth,
tokens, caches, histories or PID-based session authority.

Exit gate: the quick 1.x user journeys work through Web/CLI delegation without
direct legacy database writes.

### Phase 6 — Delete replaced code and release

Delete after call-site and import checks:

- legacy fixed `src/agent_box/work/` workflow;
- old Profile/session authority;
- old generic launch orchestration;
- duplicate Codex distribution implementation;
- WorkBoard/TUI/PyWebView/prototype production paths;
- preview-only duplicate providers;
- generated build/runtime residue from formal packaging.

Retain only explicitly time-bounded import/CLI shims, each with a removal test
and documented expiry.

Exit gate: clean source tree, clean wheels, no duplicate authority, full E1-to-E2
browser vertical and a real native Codex rehearsal.

## Parallel execution rules

After Phase 0, the following work may proceed in separate worktrees:

- Web Host extraction;
- Harness Profile independence;
- Core import-boundary tests.

Do not concurrently edit root `pyproject.toml`, root CLI dispatch, extension
registration or shared migration code. Codex consolidation starts only after
Harness Profile independence. Legacy deletion starts only after all replacement
paths pass clean-wheel tests.

## Decisions resolved from the audits

- Do not move all legacy code into Harnesses.
- Do not move the fixed legacy Work workflow anywhere; delete it after callers
  retire.
- Do not place tmux identity inside a Profile; it remains a frozen resource.
- Do not make Web an Execution/Resource Provider plugin; it is a Host package.
- Do not rewrite historical migrations merely to make the tree look pure.
- Do not keep two Profile authorities or two Codex owners.
- Do not add new Core ontology during this restructure.

## Required continuous gates

- import graph boundary checks;
- Core and extension conformance tests;
- every official plugin test suite;
- frontend tests and production build;
- clean wheel install and plugin discovery;
- `doctor --json`;
- browser E1-to-E2;
- credential leakage scan;
- `git diff --check`.
