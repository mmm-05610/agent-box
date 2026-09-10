# Decision and migration

This document answers: which option, why, what the steady state is, when Direct Hermes retires, what
each repository does in which order, and what the first slice touches. It assumes the reader has read
`05-cross-repo-options.md`, and it depends on **D-1** (which desktop is canonical) in
`07-risks-gaps-decisions.md` — if the Tauri app is canonical, this document is a study, not a plan.

## 1. Decision matrix

Criteria are weighted for the stated goal: a Desktop that is not tied to one runtime, harness diversity
via a real plugin system, and no repeat of the Codeg failure modes.

| Criterion (weight) | A protocol replacement | B Desktop Ports + per-runtime adapters | C AgentBox owns harnesses | D coexistence → C |
|---|---|---|---|---|
| Authority clarity (×3) | 1 — two service layers | 1 — N adapters each with their own truth | **3** — single | 2 — per connection, single |
| Harness diversity at low marginal cost (×3) | 2 — via emulation | 0 — reimplemented in the Desktop | **3** — plugin + adapter | **3** — same as C |
| Plugin system actually designed (×3) | 1 — not extended | 1 — not extended | **3** — the point | **3** — same as C |
| Desktop change size (×2) | **3** — one rung | 1 — Ports + N adapters | 2 — Ports + 2 adapters | 2 — staggered |
| Backend change size (×2) | 1 — a second protocol surface | **3** — none | 2 — kernel extension | 2 — as needed |
| Test cost to keep honest (×2) | 1 — a permanent cross-repo contract | 0 — one suite per runtime | **3** — shared golden vectors + matrix gate | 2 — staggered |
| Avoids premature abstraction (×2) | 2 | 1 — Ports designed for N consumers | **3** — Ports designed for 2 real protocols | 3 |
| Avoids long-term double implementation (×2) | 1 — the adapter is forever | 1 — N adapters forever | **3** | 1 — unless retirement is enforced |
| Time to first real value (×1) | 2 | 1 | 1 | **3** |
| **Weighted total (max 60)** | **29** | **21** | **53** | **48** |

C wins on the design criteria; D wins on sequencing. That is why the recommendation is **D as the
mechanism, C as the steady state** — not "pick one".

## 2. Recommendation

**Desktop owns the Ports. AgentBox owns the Harnesses.**

1. The Desktop defines narrow, harness-neutral Ports (list below) with **one adapter per protocol**:
   `agentbox` (strategic) and `hermes-direct` (legacy, time-boxed). Never one adapter per harness —
   that is option B, and it would put a second harness registry inside Electron.
2. AgentBox grows the plugin architecture in `04-agentbox-plugin-architecture.md`, and harness
   diversity (Codex, Claude Code, OpenCode, Hermes, Pi) lands as AgentBox plugins. AgentBox already has
   the registry, the capability vocabulary, the credential authority, the workspace/runtime ownership
   model, and golden-vector contract tests for exactly this.
3. The Desktop's feature set becomes capability-driven: a feature declares the capability family it
   needs; `unavailable` and `not_implemented` render as distinct honest states; nothing falls back
   silently.
4. The migration is per-connection and per-capability. A connection names exactly one backend, so there
   is never a merge of two session stores and never two live implementations of one capability on the
   same connection.

Why not A as the mechanism: it preserves the Hermes protocol as the boundary, which (a) makes AgentBox
a permanent emulator, (b) keeps the Desktop's Hermes-shaped event vocabulary, error codes and product
assumptions as the de-facto contract, and (c) leaves the Desktop unable to benefit from AgentBox's
capability model — the thing that makes harness diversity cheap. It also stacks a second service layer
with a different error shape beside Studio's `/api/v1`, which the AgentBox survey already identifies as
a live problem between Studio and the legacy web host.

Why not B as the primary: it designs a Port abstraction for hypothetical consumers and then implements
the hard parts (credentials, workspace, continuation, WSL/remote) twice. The Desktop would become a
second agent supervisor. It is B's *Port discipline* that is right — just with one adapter per protocol,
not one per runtime.

## 3. Steady state

```
Electron Desktop
├── src/app/*                      presentation, routes, panes, stores   (unchanged in kind)
├── src/harness/ports/*            typed Ports; capability table; typed unavailable
├── src/harness/adapters/agentbox/ the strategic adapter (HTTP/WS + capability map)
├── src/harness/adapters/hermes/   legacy adapter, until the retirement condition (§5)
└── src/plugins/*                  Desktop-side UI plugins (trusted, capability-granted)

AgentBox Host
├── /api/v1/*                      the service layer (owns routes, auth, typed errors)
├── capability catalog             families → providers → capability state
├── plugins (host realm)           harnesses, workspace, vcs, terminal, artifacts, credentials,
│                                  runtime-host, continuation, model-providers, session-store
└── worker realms                  ops only (frozen HostBridge wire) — no Python plugins
```

## 4. Ports (the Desktop side of the boundary)

Derived from `03-coupling-matrix.md` §2–§4. Each Port is small, typed, and capability-gated.

| Port | Replaces | Notes |
|---|---|---|
| `capabilities` | nothing (new) | the gate for every other Port and for UI features |
| `projects` / `workspaces` | `resolveHermesCwd()`, workspace-cwd, fs tree roots | refs, not paths |
| `sessions` | `session.list/resume/create/close` | identity translation stays Desktop-side |
| `launchPreview` | nothing (new) | AgentBox has it; the Desktop has no equivalent |
| `submitTurn` | `prompt.submit` + `session.create` pairing | turn/execution identity, not just a method call |
| `stream` | WS event handling + `session.events.since` replay | one event vocabulary, adapter-translated |
| `cancel` | `session.interrupt` | with a receipt shape, not a bare call |
| `approvals` | `approval/clarify/secret/sudo.respond` | one Port, four kinds |
| `modelProfileConfig` | `config.*`, `profiles.*`, `agents.*` | profile/model/account are one family |
| `credential` | credential-adjacent IPC | locator-only; never a value in the renderer |
| `artifact` | preview/artifact/media IPC | ref-based |
| `nativeResume` | continuation semantics | capability-gated; `emulated` is a distinct state |
| `errors` | Hermes-shaped codes | typed vocabulary, mapped per adapter |

Two rules that keep the Ports honest:

- **No Port is designed from a single consumer.** Each Port ships only when a second real protocol needs
  it (the Hermes adapter and the AgentBox adapter both implementing it is the test).
- **The Port does not leak harness nouns.** No `session.cwd.set`, no `bot_relay.*`, no
  `source: 'desktop'` — those live in the adapter.

## 5. When Direct Hermes retires

Not on a date — on a condition, written down now so coexistence cannot become permanent:

1. Every capability in the Desktop's consumed capability table is provided by AgentBox with state
   `supported` or `emulated`, **or** the corresponding Desktop feature has been explicitly dropped by a
   product decision (see D-2).
2. The Desktop's e2e suite passes against AgentBox for every ported feature, with a real-boundary test
   per capability (not a synthetic provider).
3. No Desktop feature has depended on the Hermes adapter alone for one full release cycle.

Until all three hold: the Hermes adapter stays, and **no new Desktop feature may be built on it** — new
work goes through a Port and the AgentBox adapter. Without that rule, coexistence becomes option A by
accident.

## 6. Migration blueprint

### 6.1 Desktop, in phases

**Phase 0 — fences (no behaviour change).** Split the mixed files so later work has somewhere to land:
extract the backend lifecycle out of `electron/main.ts` (18,291 lines) into `electron/backend/*`
(resolution already lives in pure modules — this is registration, not redesign); extract the
`hermes:api` proxy's routing/policy out of `main.ts:16715`. The existing suite must stay green; that is
the whole acceptance criterion.

**Phase 1 — Ports + the legacy adapter.** Add `src/harness/ports/*` and re-house the *existing* Hermes
calls behind them, unchanged in behaviour. Add the capability table (family → feature) with everything
gated on `supported` by the legacy adapter. Acceptance: identical e2e results, plus a new unit suite
that every Port call goes through the Port (no direct `requestGateway` from feature code).

**Phase 2 — the AgentBox adapter, read-only first.** Implement `capabilities`, `sessions` (list/resume),
`stream` (replay/resync) against AgentBox, using the **shared golden vectors**. Ship it behind an
explicit connection setting; no feature cut over yet. Acceptance: contract tests from the vectors, plus
one real-boundary test against a real AgentBox sidecar.

**Phase 3 — capability-driven UI.** Make one feature per family read its availability from the
capability map and render `unavailable`/`not_implemented` honestly. Start with the families where
AgentBox is strongest (sessions, workspace, terminal) and where the Hermes product surfaces are
weakest. Acceptance: a screenshot/assertion per capability state, including the degraded ones.

**Phase 4+ — feature-by-feature cutover**, each with its own real-boundary test and a decision recorded
in the matrix (§5 condition 1). The Hermes product pages (bucket D) are re-decided here — ported to a
capability or dropped, one at a time, never wholesale.

### 6.2 AgentBox, in phases

**Phase 0 — manifest and conformance.** Add the manifest reader and extend the conformance kit
(§1–§3 of `04-`), starting with two distributions (`agent-box-harnesses`, `agent-box-workspace-local`)
so the shape is proven on real plugins. No behaviour change.

**Phase 1 — capability map.** Extend `/capabilities` + `/readiness` to the family/provider/state shape
with a `realm` dimension, and add the **capability matrix CI gate** (every Desktop-consumed family has a
provider and a real-boundary test). This is the anti-synthetic-green mechanism; it is worth doing early.

**Phase 2 — replace the global-dict coupling.** `_MATERIALIZERS` → `[requires]` capability resolution
via two-pass binding. Small, high-value: it removes the one place two plugins couple by literal string.

**Phase 3 — lifecycle and enable/disable.** `on_start`/`on_stop`/`health`; enablement by plugin id;
exclusive-family configuration for workspace/session-store/profile instead of literal ids in the host.

**Phase 4 — worker realm honesty.** Make the capability map realm-aware end to end (WSL/remote show what
they can and cannot do), and finish or explicitly shelve the 0.1.0a1 WSL plugin pair.

**Phase 5 — retirement inputs.** Whatever the Desktop's capability table still lacks (per D-2's product
decisions) gets either a plugin or an explicit `not_implemented` that the Desktop renders honestly.

## 7. First slice (the smallest change that proves the direction)

Deliberately not the harness adapter, not a plugin for Codex, not the POC promotion. The first slice
proves three things at once: the Port boundary is real, the AgentBox adapter can be written against the
frozen contract, and capability state drives the UI honestly.

### Desktop — files

| Action | File |
|---|---|
| add | `apps/desktop/src/harness/ports/types.ts` — the Port interfaces (§4), no implementations |
| add | `apps/desktop/src/harness/ports/capabilities.ts` — family vocabulary + the feature→capability table (one home for gating) |
| add | `apps/desktop/src/harness/adapters/agentbox/client.ts` — HTTP + WS against AgentBox's frozen protocol, incl. ws-ticket, `after=<seq>`, `resync_required` |
| add | `apps/desktop/src/harness/adapters/agentbox/capabilities.ts` — `/api/v1/capabilities` + `/readiness` → the Port shape |
| add | `apps/desktop/src/harness/adapters/agentbox/sessions.ts` — `sessions` list/resume + `stream` replay only |
| add | `apps/desktop/src/harness/selection.ts` — per-connection backend choice (`hermes | agentbox`), default `hermes` |
| modify | `apps/desktop/electron/main.ts` — only to route the connection's backend choice through `selection.ts`; no lifecycle refactor in this slice |
| modify | `apps/desktop/src/app/settings/gateway-settings.tsx` — surface the backend choice as an explicit setting (no silent switching) |

### Desktop — tests

| Test | What it pins |
|---|---|
| `src/harness/adapters/agentbox/client.test.ts` | envelope decode, ticket flow, cursor/resync — driven by the **same golden vectors AgentBox ships** (`host_bridge_golden_vectors.json`, 53 vectors) |
| `src/harness/ports/capabilities.test.ts` | the feature→capability table has no entry for a family the runtime cannot express; every feature has a degraded state |
| `src/harness/selection.test.ts` | a connection names exactly one backend; switching never merges session stores |
| `e2e/agentbox-adapter.spec.ts` | one real-boundary run against a real AgentBox sidecar: capability map, session list, one turn's stream, one cancel — the first honest end-to-end proof |

### AgentBox — files

| Action | File |
|---|---|
| add | `plugins/agent-box-harnesses/plugin.toml` and `plugins/agent-box-workspace-local/plugin.toml` — the manifest shape proven on two real plugins |
| add | `src/agent_box/extensions/manifest.py` — read + schema-validate the manifest before import |
| modify | `src/agent_box/extensions/api.py`, `loader.py` — `abi` range, `provides`/`requires` declarations, two-pass binding |
| modify | `plugins/agent-box-studio/src/agent_box_studio/server/app.py` (`/capabilities`, `/readiness`) — family/provider/state/realm shape |
| add | `docs/plugins/PLUGIN_MANIFEST.md` — the author-facing contract |

### AgentBox — tests

| Test | What it pins |
|---|---|
| `tests/test_plugin_manifest.py` | schema rejection (unknown field, bad abi, unregistered contract), typed errors |
| `tests/test_capability_families.py` | every family in the vocabulary is either provided by ≥1 plugin or reported `not_implemented` |
| `tests/test_capability_matrix.py` | **the gate**: every Desktop-consumed family has a provider *and* a real-boundary test |
| extended `plugins/*/tests/test_*_conformance.py` | the two manifest-carrying plugins pass the extended kit |

### Explicitly NOT in the first slice

- No harness adapter for Codex/Claude/OpenCode in the Desktop (that is AgentBox's job, and doing it now
  is option B by accident).
- No promotion of `src/agentbox/*` — it stays a reference; the new adapter is written against the frozen
  contract, and the decision to keep or delete the POC comes with D-3.
- No plugin-contributed routes, no route-contribution framework.
- No change to how `hermes serve` is launched, so the legacy path keeps working untouched.

## 8. What must be decided before implementation (see `07-risks-gaps-decisions.md`)

- **D-1** Which desktop is canonical: this Electron app, or the Tauri app whose contracts AgentBox froze.
- **D-2** The fate of the Hermes product surfaces (bucket D): port to capabilities, or drop.
- **D-3** Whether the AgentBox POC becomes the adapter's foundation or is deleted.
- **D-4** Whether plugin trust stays "trusted in-process Python" (with capability boundaries) or becomes
  real isolation.
- **D-5** Whether the Desktop is allowed to serve as the *authority* for local workspaces, or only as a
  client of AgentBox's workspace provider.
- **D-6** Whether any plugin must run inside a worker realm (which would require a plugin runtime there —
  a new project, not an increment).
- **D-7** The commitment level: is AgentBox the single backend (option C) with Hermes as a time-boxed
  fallback, or are both long-term peers?
