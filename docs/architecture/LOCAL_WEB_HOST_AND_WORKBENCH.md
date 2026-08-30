# Local Web Host and Minimal Web Workbench

Status: Current supporting architecture, 2026-08-28.

`agent-box web` is an optional local Host and the current browser control
surface. It binds exact loopback,
acquires `AGENT_BOX_HOME/host/mutation.lock`, then opens the Core database,
runs migrations, loads plugins, and constructs the narrow `HostApplication`
facade. A second Host fails admission before database or provider effects.
The lock is not Dispatch recovery proof; Dispatch and Finalization retain
their own idempotency keys.

Finish is a Host-owned bounded operation. Records live below
`AGENT_BOX_HOME/host/operations` and are atomically persisted as JSON. A
restarted Host marks `accepted`/`running` operations `interrupted`; it never
replays an external effect automatically. The browser polls the operation
locator and Core's FinalizationReceipt remains the terminal fact.

The API is bounded JSON under `/api/v1`. Drafts are Host-owned files under
`host/binding-drafts` and contain only selector inputs, exact non-secret Refs,
summaries and revisions. Core remains authoritative after Freeze. Selectors
and controls are plugin contributions; Web does not name Git, Codex, tmux or
contract-specific behavior.

Browser terminal, WebSocket, DAG/canvas, accounts, remote access, marketplace
and arbitrary shell APIs are intentionally out of scope. Native Codex remains
in the user's terminal. This document describes the optional Web Host path;
other Hosts may drive the same Core contracts.
