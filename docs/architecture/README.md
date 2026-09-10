# Cross-repository architecture: Desktop × AgentBox

Status: **research and design only.** Nothing here is implemented, and no production code in either
repository was modified. Written 2026-09-10 against:

- Desktop (Electron client): `/home/maoqh/projects/agent-box-desktop-next` @ `1751e49`
- AgentBox backend: `/home/maoqh/projects/agent-box-studio-codex-vertical` @ `9ad2044`
  (branch `feat/studio-codex-product-vertical`; note its `docs/validation/current/` set — including
  `DISPATCH_STATUS.md` and `frozen/` — is **untracked**, so the authoritative contract set is not yet
  in version control there)

## Read this first: the one decision that invalidates everything else

AgentBox's frozen desktop protocol (`docs/validation/current/frozen/AGENTBOX_INTERFACE_PROTOCOL.md`,
"APPROVED AND FROZEN", 2026-09-07) was synced **from a different desktop repo**:
`agent-box-studio-ui-reconstruction` — a **Tauri** app. Per that repo's `frozen/MANIFEST.json`, the
design flows *from* the Tauri desktop *into* AgentBox.

This repository is an **Electron** desktop. So before any of the design below can be built, one
question must be answered by the user:

> **Which desktop is canonical — the Electron app in this repository, or the Tauri app whose
> contracts AgentBox already froze?**

Every option in `05-cross-repo-options.md` assumes the Electron app. If the Tauri app is canonical,
this whole document becomes a study of a client that is not being built, and the work is instead
"finish the frozen C3.1 plan in the Tauri repo". See `07-risks-gaps-decisions.md` → **D-1**.

## The recommendation in one paragraph

**Desktop should own the *Ports*; AgentBox should own the *Harnesses*.** Concretely: the Electron app
defines a small set of narrow, harness-neutral Ports (capabilities, projects/workspaces, sessions,
launch-preview, submit turn, streaming/resync, cancel, approvals, model/profile/config, credential,
artifact, native resume, typed errors) with **exactly one adapter per protocol** — an AgentBox adapter
that is the strategic path, and today's Hermes-direct adapter which is legacy and retires. Harness
diversity (Codex, Claude Code, OpenCode, Hermes, Pi) lands as **AgentBox plugins**, because AgentBox
already has the registry, the capability vocabulary, the credential authority, the workspace/runtime
ownership model and the golden-vector contract tests for exactly that — and the Desktop has none of
them. Steady state is therefore option **C**, reached through option **D** (coexistence) as the
mechanism, using option **B**'s Port discipline on the Desktop side only. Option **A** (big-bang
replacement) is rejected as the *mechanism*, though it describes the *end state*.

The full argument, including why B-as-primary and A-as-mechanism are rejected, is in
`06-decision-and-migration.md`.

## Documents

| File | Contents |
|---|---|
| `01-current-state-desktop.md` | The Electron client as it is today: layers, mass, the backend contract it speaks, event/session projection, and the preload's trust surface |
| `02-current-state-agentbox.md` | The AgentBox backend as it is today: process topology, API/WS protocol, the extension kernel and every existing SPI, what plugins can and cannot do, and the honest gaps |
| `03-coupling-matrix.md` | Desktop × Hermes coupling inventory, classified into generic-desktop / generic-harness / Hermes-adapter / Hermes-product / workspace-git-terminal / mixed-legacy |
| `04-agentbox-plugin-architecture.md` | The proposed plugin architecture: manifests, identity/version/compatibility, capability declaration and discovery, lifecycle, load environments (Host/WSL/Remote), trust boundaries, typed fail-closed behaviour, how plugins reach the service layer, API contribution rules, how the Desktop discovers capabilities, versioning/migration, and the test pyramid |
| `05-cross-repo-options.md` | The four cross-repo options, each with Desktop changes, backend changes, plugin design, process/data flow, authority, workspace/Git, platform boundaries, cost/risk, and where a Codeg-style failure would recur |
| `06-decision-and-migration.md` | Decision matrix, the recommendation with reasoning, the final steady state, the plugin model, when Direct Hermes retires, the migration phases for each repository, and the first implementation slice with named files and tests |
| `07-risks-gaps-decisions.md` | Recurring failure modes mapped to this design, factual gaps (things I could not verify), and the decisions that require the user |

## What is deliberately out of scope here

- Any code change in either repository.
- Restoring the deleted in-repo Hermes runtime.
- The existing AgentBox POC (`apps/desktop/src/agentbox/`, `apps/desktop/src/plugins/agentbox-lab/`) —
  it is read as *evidence of a started direction*, not touched. `03-coupling-matrix.md` §F and
  `06-decision-and-migration.md` §First slice say what to do with it later, as a decision, not an action.
- Real model requests, credentials, dependency installation, large test runs.
