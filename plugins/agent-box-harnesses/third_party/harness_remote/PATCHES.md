# PATCHES — harness-remote v3.0.2 (commit 21ce6db49af708c4c7c3f96ef6a50f62dced8dab)

Apache-2.0 notice: this directory contains unmodified source from the upstream
repository listed in `SOURCE.json` except for the changes recorded here.
Upstream copyright and the Apache License 2.0 text in `LICENSE` apply; the
AgentBox modifications below are marked in-file with `PATCH (AgentBox ...)`.

## 1. `bridge/src/acp-client.js` — asynchronous permission resolver

Upstream `#respondPermission` answers `session/request_permission` immediately:
with `permissionMode: "allow"` it statically picks `allow_once` (falling back to
`allow_always` and any `allow*`), otherwise it answers `cancelled`. That
shortcut cannot preserve a Core/user approval policy, so approval-requiring
tools could never be enabled safely.

The patch adds two constructor options and keeps the static path unchanged when
they are absent:

- `permissionResolver`: an async function `({ toolCall, options }) => optionId | null | undefined`.
  Its awaited decision owns the answer. Returning an `optionId` present in
  `options` selects it; returning `null`/`undefined`, throwing, or timing out
  denies (`{ outcome: "cancelled" }`). Unanswered requests therefore default to
  deny, never allow.
- `permissionTimeoutMs`: optional bound; expiry denies.

After the await the patch re-checks child identity and stdin writability, so a
decision that arrives after a disconnect or reconnect is never written to the
wrong child.

## 2. `bridge/src/acp-registration.js` — new file, mechanical factory export

Upstream builds one profile's ACP registration inline inside `daemon-cli.js`
(one user-facing `AcpClient`, one prompt-less `AcpAgentModelCatalog`
connection, the capability contract, and `AcpService` options). Harness
Remote's embedders must not adopt `daemon-cli.js`/`machine-daemon.js` as a
second product authority, so this block was moved into an exported,
upstream-namespace factory `createAcpRegistration()` with identical
construction. The only behavioral addition is forwarding the Section 1
permission options into the user-facing client.

Adopted as allowed by the Work Order 38 reuse boundary ("a production
extraction may move that block into an exported upstream-owned factory as a
mechanical patch").

## 3. `bridge/src/acp-service.js` — grouped config options in model selection

An ACP `select` config option may arrive grouped: each top-level entry carries
a `group`/`name` header plus its own nested `options` array of the real
candidates. DeepSeek dsh 0.1.5-rc.1 ships its `model` picker in exactly this
shape (observed first-hand over `session/new`; see
`docs/server-round1/fullstack/dsh-production-packaging.md`). Upstream
`setModel()` matched only the top level, where group headers carry no `value`,
so every model selection against a grouped picker failed with "Harness model
is not available" - the harness could never be driven to the model the product
selected.

The patch flattens exactly one level of nested `options` before the existing
match chain (exact value, value after the synthesized provider separator,
then the Claude `[1m]` selectable-value rule). Nothing else changes: the
selection is still sent as `session/set_config_option` with the harness's own
opaque value, non-grouped pickers flatten to themselves, and no harness name
appears in the patch. Provenance is recorded in `SOURCE.json`
(`patched_sha256`).

## Not adopted

`machine-daemon.js`, `daemon-cli.js`, `machine-registry.js`, `task-*`,
`worktree-*`, `work-thread-*`, `session-link-store`,
`session-operation-ledger`, `task-run-store`, `server.js`, `cli.js`,
`config.js`, `project-catalog.js`, `session-claim-server.js`,
`agent-model-server.js` and remaining bridge files stay out of this snapshot:
they own product tasks, worktrees, links, snapshots, and recovery, which are
Server/Core authority in AgentBox.

## Upgrade procedure

Never float a branch, npm range, or native binary. Clone the new tag into an
owned research root, regenerate `SOURCE.json` hashes, rebase these patches,
re-run the fake seams (`plugins/agent-box-harnesses/tests/harness_remote/`),
and require a new explicit authorization before any real provider test.
