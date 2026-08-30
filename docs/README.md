# Agent-Box documentation

Agent-Box is an execution governance and control layer. It records governed
Work and Execution facts while external Hosts and workflows remain responsible
for progression, routing, retry, scheduling, and runtime policy.

## Start here

1. [Architecture](architecture/ARCHITECTURE.md) — Core/plugin boundary and handoff.
2. [Preview release process](getting-started/RELEASE.md) — installation and validation.
3. [Plugin SDK](plugins/PLUGIN_SDK.md) — discovery and extension contracts.
4. [Frozen Core contracts](contracts/work-core/v0_1/CORE_CONTRACT_V0_1.md).
5. [ADR index](adr/README.md) — decisions constraining implementation.

## Five-minute Core model

```text
External Host / Workflow / CLI
            ↓
        Work Core
            ↓
 Extension Registry / Contracts
            ↓
ExecutionProvider + ResourceProvider + Host integrations
            ↓
Native Harness / Git / tmux / Artifacts
```

The governed handoff is:

```text
requested resource → exact Ref → frozen Binding → accepted Dispatch
→ native execution → output/evidence reconciliation → atomic finalization
```

Core owns Work, Execution, Binding, Dispatch, Ref, Resource Observation /
Evidence, and atomic finalization. It does not own workflow progression,
routing, retry, scheduler state, harness runtime, Git/worktree lifecycle,
terminal behavior, or artifact materialization.

## 2.0.0a1 Developer Preview

```bash
pip install --pre --find-links . "agent-box-cli[preview]==2.0.0a1"
agent-box plugins list
agent-box doctor
agent-box web
agent-box launch
```

Root-only installation supports Core diagnostics and plugin discovery. Preview
adds Web, Harnesses, Git, tmux, and Artifacts. Web is an optional Local Host:
it provides Quick Launch, Profile/integration configuration, Binding review,
execution observation/control, and evidence inspection. It is not Core and is
not the only supported Host.

Quick Launch covers Fresh or Continue, exact Profile revision,
repository/revision and terminal selection, Binding Review, Freeze & Dispatch,
native execution, explicit Finish, and output-to-next-Execution input. Other
Hosts can use the same SDK and Core contracts. LangGraph, GitHub, and future
CLI/SDK integrations are proposed external Hosts, not completed integrations.

## Extending Agent-Box

Plugins register through the SDK and may provide ExecutionProvider,
ResourceProvider, ResourceSelector, HostControl, FinalizationContributor, and
ResourceObservation capabilities. Provider-owned UI and selector semantics
stay in the plugin; Core must not gain Codex, Git, tmux, Web, or product-
specific entities.

## Current evidence and limits

- [Current release evidence](validation/current/README.md)
- [Preview release checklist](plans/current/PREVIEW_RELEASE_CHECKLIST.md)
- [Contracts](contracts/work-core/v0_1/)
- [ADRs](adr/README.md)
- [Historical research and reports](archive/README.md)

Native Codex rehearsal remains an external validation step. No report proves a
real-model rehearsal unless it explicitly says so.
