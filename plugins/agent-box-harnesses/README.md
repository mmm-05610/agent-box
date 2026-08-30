# Agent-Box Harnesses

The official multi-Harness extension package. Phase 2 implements Codex only.
It owns the Codex Harness descriptor, versioned Profile repository, exact
`ProfileRef`, selector, digest validation, and execution-scoped projection.

`agent-box-codex` remains a compatibility implementation for the canonical
App Server provider plus native launch/recovery/control code. It has no plugin
entry point, so the official `harnesses` entry point is the only discovered
Codex owner and registers exactly one formal ExecutionProvider.

Profiles are immutable JSON revisions under the plugin data directory. Only
non-secret configuration and credential locators are accepted. The projection
manifest contains identity and references, never credential values.
