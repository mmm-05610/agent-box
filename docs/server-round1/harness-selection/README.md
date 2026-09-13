# Work Order 38 — Harness extension selection

Work Order 38 is **ready for user decision** after a second, broader candidate
screen. Retain the conditional recommendation to investigate a minimal
extraction of `giuliastro/harness-remote` tag `v3.0.2`, commit
`21ce6db49af708c4c7c3f96ef6a50f62dced8dab`, in a separately authorized,
no-model work order.

This recommendation is limited to the source-locked candidates reviewed in the
two screens. It is not an ecosystem-wide `NO_FIT` finding. The broader search
found a credible prospective backup in `beyond5959/acp-adapter v0.3.8`, but its
fake suites could not run because this host has no Go toolchain, so backup
qualification is deferred. `openclaw/acpx` passed an imported-runtime fake
experiment and is reusable as an ACP host; it lacks fixed lower adapters and
proof for two different Harness-specific capabilities, so it is not the full
multi-Harness answer.

Harness Remote remains conditional on a fixed Apache-2.0 source snapshot,
offline adapter locks, Worker-owned isolation/process cleanup, Windows-owned
product state, and one narrow asynchronous permission-resolver patch. If the
spike needs a lifecycle fork, branded logic in AgentBox Core/Server, or the
candidate's control stores as authority, it returns `NO_FIT`.

No production code or dependency changed. No native Harness, provider request,
model invocation, login, or credential read was used. Fake-peer evidence proves
only the specified adapter seams. Work Order 38 does not approve the extraction
or any real call.

Evidence:

- [Final recommendation and reuse boundary](boundary.md)
- [Candidate comparison](candidates.md)
- [Search coverage](search-coverage.md)
- [Behavior verification](verification.md)
