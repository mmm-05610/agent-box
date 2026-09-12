# Workbench boundary — this repo becomes the workbench frontend

**Status: decided (2026-09-12).** This repo is the **workbench frontend**; the core
stays in Agent-Box and is consumed, not rebuilt. The `agent-box-studio-*` line stays
as reference material — its target blueprint, its session model and its wire
contract are mined for what they already solved, but the Tauri shell is not the
destination.

The reasoning, in the words it was decided with: *a workbench with a solid core,
harness at the centre, growing into workspace/sandbox management and extensibility
through that core's abstraction — built here, because the Codeg line is an ACP-shaped
frontend that is expensive to change.*

Everything below is measured. Where a number comes from a tool run, the tool is named.

## 1 · The core already exists, and it is not in this repo

| what | where | state |
| --- | --- | --- |
| Governance kernel: Work · Execution · Binding · Dispatch · Ref · Evidence · atomic finalization | `agent-box/src/agent_box/work_core/` (2,544 lines) | implemented; `tests/test_work_core_*.py` cover it |
| Design laws: Work is stable identity; native runtime state is provider-authoritative; a new provider must not require a Core special branch; external resources are referenced by Ref, never owned | `agent-box/docs/contracts/work-core/v0_1/CORE_CONTRACT_V0_1.md` | frozen candidate |
| Harness SPI: `ExecutionProvider.descriptor/capabilities/input_limits/start/observe` | `agent-box/src/agent_box/work_core/registry.py:127-133` | implemented |
| The five harnesses, declaratively | `plugins/agent-box-harnesses/src/agent_box_harnesses/harnesses.toml` | codex · claude-code · opencode · hermes · pi |
| **ACP is one launch mode of one driver**, not the architecture | `HarnessSessionDriver` SPI + five native drivers | implemented |
| Session identity and turn binding: `session_id` is the identity, `work_id` 1:1, **Session outranks Harness and Harness is a per-turn execution parameter** | `plugins/agent-box-session/` (Official Session Store) + `EXECUTION_TREE_AND_CROSS_HARNESS_SESSION.md` | implemented; "READY FOR FRONTEND BINDING" |
| The service a frontend talks to | `plugins/agent-box-studio/` (FastAPI) | implemented; honest `NOT_IMPLEMENTED` where unimplemented |

**Consequence: this phase is a client rewrite plus a peel, not a core build.** The
"solid core" requirement is already satisfied; what is missing is a frontend whose
port layer is as disciplined as that core, and an Electron host that owns everything
the browser host cannot.

## 2 · Two contracts, two layers

There are two published surfaces and they are for different layers. Getting this
split right is the single most important structural decision in the phase.

```
  ┌─────────────────────── this repo ───────────────────────┐
  │  renderer (React)   ·  workbench UI                      │
  │      │  HTTP/JSON + WS  ← the UI contract                │
  │  Electron main      ·  Desktop Host                      │
  │      │  host-bridge@1 (length-prefixed TCP)               │
  └──────┼───────────────────────────────────────────────────┘
         ▼
   agent-box sidecar (Python)  →  Work Core · Session Store · harness drivers
```

**UI contract — `agent-box-studio` `/api/v1`.** HTTP/JSON for commands, one
WebSocket per session for events. `GET /capabilities` reports honestly; sessions,
turns, `transcript?after=`, recovery, permissions, questions and lease are the
surface. Auth is a REST bearer token, and **loopback still requires it**; the WS
needs a short-lived single-use ticket. Events replay from a durable ledger by
`after={seq}`, and a bad cursor gets a typed resync rather than silence. Source:
`plugins/agent-box-studio/src/agent_box_studio/server/app.py`.

**Shell contract — `agent-box.host-bridge@1` (v0.4, APPROVED AND FROZEN).** How the
desktop shell starts and supervises the sidecar: loopback TCP on `127.0.0.1:0` — an
ephemeral port per start, which is the same shape this repo already uses when it
spawns `hermes serve --port 0` and reads the announced port back — frames of
`u32 big-endian length + JSON`, 64 KiB cap, bootstrap ≤ 4 KiB over the sidecar's
inherited stdin as the only secret channel, 20 frozen ops, unknown op → fail closed.
Source: `agent-box-studio-ui-reconstruction/docs/design/AGENTBOX_HOSTBRIDGE_WIRE_CONTRACT.md`.

**Which layer speaks which.** The blueprint is explicit that a frontend must not
import Agent-Box and that "desktop, server and Docker frontends consume the same
HTTP/WS contract" (`AGENTBOX_STUDIO_BACKEND_CORE_IMPLEMENTATION.md:74-75`). The
host-bridge is the *shell*'s bootstrap boundary, not the UI's. So: renderer → `/api/v1`;
main → host-bridge. Electron can do either for the UI (its renderer can speak HTTP/WS
directly), and this repo already has that muscle — `api/client.ts` is the only file
that names the platform bridge, and `api/**` is a guarded leaf. Keep that shape and
the UI transport stays swappable.

## 3 · What has to change in this repo

Measured today, excluding the two in-flight directories:

| coupling | where | size | notes |
| --- | --- | --- | --- |
| Hermes backend lifecycle | `apps/desktop/electron/legacy-hermes/` | 35,447 lines / 131 files | resolution → probe → readiness → spawn → profile pool → local/SSH/Windows |
| Hermes protocol | `apps/desktop/src/api/**` + `application/**` | ~6,600 lines | 74 distinct `/api/…` paths + JSON-RPC; `api/client.ts` is the single door |
| Plugin ABI | `extension/sdk/` + `plugins/` | 418 lines / 172 import sites | after the layer work: names no `app/` module |
| `@/hermes` compatibility barrel | was 180 renderer files | — | **removed** — work order 05 executed; call sites import `@/api/*` directly |
| Naming and branding | renderer + electron + i18n + package.json | ~6,000 / ~3,700 / 1,072 / 33 hits | `HERMES_HOME` alone is 382 references |

The one seam that already has the right shape is
`electron/legacy-hermes/lifecycle.ts` (222 lines, imported by exactly one production
file): it exports **descriptors and launch plans**, not implementations —
`HermesConnectionDescriptor`, `HermesLaunchPlan`, `hermesServeArgs`,
`hermesBackendEnv`, `hermesLocalWsUrl`. That is a harness-launch contract with a
product name on it. It becomes the Electron host's harness-lifecycle port.

## 4 · Target shape

```
apps/desktop/
├── electron/
│   ├── app/ windows/ ipc/ update/ security/ host-capabilities/     ← unchanged; this is the Electron advantage
│   ├── host/                          ◀ new: the Desktop Host
│   │   ├── sidecar.ts                      start/supervise agent-box, host-bridge@1, ephemeral port, stdin bootstrap
│   │   ├── bridge.ts                       the 20 ops, typed, fail-closed
│   │   └── desktop-ports.ts                windows · file pickers · notifications · updater · tray/HUD — Electron-only, and
│   │                                       exactly the DesktopHostPorts the blueprint reserves for the shell
│   └── adapters/
│       └── hermes/                     ◀ the only place that spells hermes: resolution · argv · env · health
└── src/
    ├── core/{ports,transport,domain,registry}   ◀ new: the port layer — UI depends on ports, never on a transport
    ├── api/                            ← becomes the transport implementation behind the ports
    ├── features/                       ← session · harness · workspace · terminal · executions
    ├── components/ lib/ store/         ← already layered; this is what the core abstraction grows into
    └── app/                            ← composition only, and now a leaf: nothing below it imports it
```

The acceptance test for the whole structure is the blueprint's own sentence, and it
is the right one: **adding a harness must not require changing the directory
structure.** A harness is registry data; a capability is a port plus a token; the UI
hides what the backend honestly reports as unavailable.

## 5 · The peel: hermes out, one layer at a time, never broken

The criterion this phase is accepted against: **hermes is peeled away layer by
layer and the app always still works.** That rules out a big-bang rewrite, and it
needs a number rather than a feeling. Same machine as the layer migration:

1. **Inventory and classify** every Hermes coupling into: *protocol* (`api/**`),
   *lifecycle* (`legacy-hermes/`), *vocabulary* (types/UI/i18n), *branding* (names,
   paths, env), and *harness-specific features* (Bot Mode, MCP config, skills
   panels — which Agent-Box assigns to harness plugins, and whose descriptor API it
   has not published yet).
2. **A generated ledger** — `hermes-debt.ts` — one line per remaining coupling, with
   a guard that fails on an unlisted one *and* on a stale line. The layer ledger is
   the template; it is what turned "cleaning up the architecture" into a number that
   could reach zero.
3. **Per-item work orders** that each keep the app working: the sidecar path grows
   beside the current one, features move across one at a time, and the ledger is
   regenerated rather than hand-edited.
4. A **master plan** with waves, review gates, and the silent-failure catalogue —
   the four documents from tonight are the template.

Two things are already banked for this: **work order 05** (the `@/hermes` barrel —
executed: the barrel is deleted and every call site imports `@/api/*` directly) and the
layer migration, well underway, which is what makes a port layer possible at all —
`app/` is a leaf, `components/` and `lib/` are reusable, and the plugin ABI no longer
points at app files.

## 6 · Phases

Each phase ends in a state that works and can be reviewed.

**P0 · Bind the core (no peel).** Spawn the sidecar from the Electron main process
over `host-bridge@1` (ephemeral port, stdin bootstrap, 20 ops, typed errors). Read
`/api/v1/capabilities` and render an honest capability list. Nothing Hermes is
removed. *Proof:* the app starts, the sidecar starts, capabilities are truthful, and
the existing Hermes path still works beside it.

**P1 · The port layer.** Introduce `core/{ports,transport,domain,registry}`; make the
existing `api/**` one transport implementation behind it. No behaviour change.
*Proof:* the same tests pass, and no feature imports a transport directly — enforced
by a guard, not by review.

**P2 · Session and turns on the core.** The canonical model: one continuous session,
the composer picks **which harness executes the next turn**, each turn shows its
harness/profile/model origin, and a Loss Report appears before sending when the
choice loses something. This is where "harness is the centre" becomes visible.
*Proof:* a session with two turns on two different harnesses, driven from the UI.

**P3 · Native execution surface.** The thing a browser host cannot do: the
provider's attach descriptor rendered in a real terminal, plus multi-window, HUD,
tray and popout — i.e. the `DesktopHostPorts` the blueprint reserves for the shell.
*Proof:* attach to a live turn from the desktop and from a second window.

**P4 · Workspace and sandbox as ports.** The first extension of the core's
abstraction: workspace selection and sandbox policy as ports with capability tokens,
declared by the backend and rendered generically. *Proof:* a new capability appears
in the UI without touching feature code.

**P5 · The peel proper.** Protocol, lifecycle, vocabulary, branding — ledger-driven,
in waves, with `adapters/hermes/` as the end state: the only file that spells
hermes.

## 7 · Open items — verify before building on them

- **Real-credential smoke is pending upstream** (`FIVE_HARNESS_BACKEND_PHASE2`):
  the five harnesses are wired with synthetic/bwrap integration tests, not a real
  model run. Do not claim a working harness on the strength of the current evidence.
- **Which service is the long-term backend**: `agent-box-web` (loopback HTTP, no
  WebSocket, poll `/operations/{id}`) or the `agent-box-studio` sidecar (HTTP+WS with
  replay). They are different products with different scopes. The plan above assumes
  the sidecar, because it is the one built for a frontend and it carries sessions,
  turns and an event stream — but that assumption should be confirmed against
  upstream before P0 is closed.
- **Initiation**: how the sidecar is started is fixed by `host-bridge@1` (ephemeral
  port + stdin bootstrap), but the *supervision* policy — restart, health, one
  writer, what happens with two windows — is this repo's to design, and
  `legacy-hermes/`'s lifecycle code is the honest starting point for it.
- **The descriptor gap**: the HTTP surface exposes only `{id, display_name, version,
  status, supported}` per harness; capability and input limits come from a separate
  endpoint, and launch/argv is not exposed at all. Harness-specific surfaces
  (profiles, MCP, skills, permissions) are plugin-owned and **not yet published** —
  a frontend cannot invent them, so those features wait on an upstream slice.
