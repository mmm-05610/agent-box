# Session multi-surface ownership decision

**Status:** decided on 2026-09-13. This is an ownership decision, not a frozen
wire-protocol specification.

## Decision

AgentBox Work Core owns the lifetime of Sessions and Executions, their event ledger,
replay/live fan-out, control operations and every backend Ref. A running Execution is
not owned by a Desktop window and must survive the loss or replacement of any one UI
consumer.

The Desktop application layer exposes one Session projection to any number of surfaces:

```text
Harness Runtime
      │
      ▼
AgentBox Work Core
Session / Execution / event ledger / replay / live fan-out / backend Refs
      │
      ▼
Desktop application Session projection
      ├── main window: full Session view
      ├── HUD: compact Session view
      └── Pet: activity-only view
```

Main window, HUD and Pet are concurrent consumers. Opening HUD must not transfer,
resume or steal a backend stream from the main window. Reconnecting a client may use an
opaque wire identity and cursor inside the transport/application boundary, but those are
not Renderer product concepts.

## Renderer boundary

Window components receive ViewModels and emit user Intents. They may use an opaque
`id` for rendering and selection, but they never construct, parse, compare or persist a
Ref and never decide replay, continuation, runtime or transport ownership.

```text
UI                    SessionViewModel / ActivityViewModel + Intent
application           projection, current selection, multi-window distribution
port / transport      opaque wire ids, cursor, replay/live calls
Work Core             SessionRef, ExecutionRef, ContinuationRef, process and ledger
```

The distinction between an opaque UI `id` and a backend Ref is mandatory. A ViewModel
identifier is only presentation identity; it carries no capability, revision, native
thread, provider, runtime or continuation semantics.

## Consequence for the current Hermes adapter

The existing HUD handoff compensates for a Hermes Gateway behavior in which resuming a
Session can move its live stream to another WebSocket. That is legacy transport policy,
not a product feature. Generic window coordination may retain focus, visibility,
selected Session and draft behavior. Hermes resume/socket ownership must be hidden below
the UI boundary and is retired when the Work Core multi-consumer contract replaces the
direct adapter.

## Deferred protocol work

The later cross-repository protocol design must specify opaque Session/Execution wire
identity, cursor/replay, live fan-out, terminal-once, cancel/input/approval and restart
recovery. This decision deliberately does not choose those payloads or add them to the
Desktop now.
