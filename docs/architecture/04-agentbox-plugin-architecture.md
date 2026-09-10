# AgentBox plugin architecture — proposal

Read `02-current-state-agentbox.md` first: this document is an **increment** on what AgentBox already
has, not a replacement. The starting point is unusually good — an entry-point loader, a transactional
registration, a catalog of typed contribution kinds, a conformance kit, a declarative harness registry
with a closed capability vocabulary, and golden-vector contract tests. The design below adds what is
missing (a declared manifest, capability negotiation, lifecycle, an environment/trust model, a
versioning policy) and removes one escape hatch (`_MATERIALIZERS`).

Design law for everything here: **a plugin is a capability provider, never a route.**
The service layer owns the API; plugins own behaviour behind it.

---

## 1. Manifest and schema

### 1.1 Keep entry points for loading; add a manifest for *declaration*

Loading stays `importlib.metadata.entry_points(group="agent_box.plugins")` — it works, it is what ADR-0007
decided, and it needs no discovery directory. What is missing is a **declaration** the host can read
without executing plugin code, so that discovery, validation, negotiation and admission can happen
before `build()` runs.

Proposal: a `plugin.toml` inside each distribution (read via `importlib.resources`, exactly as
`agent-box-harnesses` already reads `harnesses.toml`), with a closed schema that rejects unknown fields —
the same discipline as `harnesses/registry/schema.py:59-112`.

```toml
schema_version = 1

[plugin]
id            = "agent-box-harnesses"          # stable, dotted-or-kebab, globally unique
display_name  = "Agent harnesses"
version       = "2.0.0a1"                       # the *plugin's* version
abi           = { min = 2, max = 2 }            # kernel ABI range it was built against
description   = "Codex, Claude Code, OpenCode, Hermes, Pi harness providers."
docs_url      = "docs/plugins/HARNESSES.md"
config_namespace = "harnesses"                   # advisory today; see §1.3
realm         = "host"                           # host | worker  (see §4)

# What this plugin offers, by capability family. Ids are the catalog component ids.
[[provides]]
family      = "harness.execution"                # family vocabulary is closed per family (§3)
id          = "codex-execution"
contracts   = ["agent-box.execution-provider@1"]

[[provides]]
family      = "harness.continuation"
id          = "codex-continuation"
contracts   = ["agent-box.continuation.codex@1"]

# What it needs from elsewhere. Resolved through the catalog at bind time, never by string.
[[requires]]
family      = "credentials.materializer"
id          = "gateway-provider"
optional    = false

# What it needs from the machine. Recorded, reported, and used to refuse admission in
# realms that cannot satisfy it. NOT a sandbox (see §5).
[needs]
filesystem  = ["$AGENT_BOX_HOME/plugins/<id>"]   # only the plugin's own data dir
network     = ["registry.npmjs.org", "api.openai.com"]
secrets     = ["by-reference"]                   # never a value; locator-only

# Its own config, validated by the host before it is handed over.
[config]
schema = "config.schema.json"                    # JSON Schema, relative to the distribution
```

Rules:

1. **The manifest declares; the factory implements.** Nothing that changes runtime behaviour may live
   only in the manifest, and nothing that the host must know *before* loading may live only in code.
2. **Unknown fields are rejected**, not ignored, so a typo cannot silently drop a declaration.
3. **`contracts` ids must be registered** — validated pre-`build()` by the extended conformance kit
   (§8), so a manifest cannot claim a contract nobody implements.
4. **No route, no method, no HTTP declaration.** There is deliberately no `[api]` section (see §7).

### 1.2 Identity

`id` is stable and permanent; it is the catalog namespace and the plugin data directory name
(`$AGENT_BOX_HOME/plugins/<id>/`, already the convention at `extensions/loader.py:60-67`).
`display_name` is presentational. A renamed plugin is a new plugin with a migration note — never a
silent alias, because ids appear in persistence (provider ids are stored in sessions).

### 1.3 Compatibility and versioning

Today: `descriptor.api_version != PLUGIN_API_VERSION` → `INCOMPATIBLE` (`loader.py:116-120`,
`PLUGIN_API_VERSION = 2`). That is an ABI gate, and it is right for the ABI — but it is the *only*
compatibility mechanism, and contract versions are expressed as separate ids (`@1`, `@2`) with no pivot
policy.

Proposal, three separate mechanisms with three separate jobs:

| Mechanism | Job | Rule |
|---|---|---|
| `[plugin] abi` range | "can this plugin run on this host at all" | Host refuses outside the range with a typed `PLUGIN_ABI_INCOMPATIBLE` naming both versions. Keep the hard gate; widen it from equality to a range. |
| `contracts` ids with `@N` | wire/contract shape | A new version is a **new id**. A plugin that can serve both declares both and the host picks by negotiated capability, not by version comparison. |
| capability state | feature presence | Consume this, not versions: `supported | emulated | unavailable | not_implemented` (already the vocabulary in `registry.py:314-318` and `protocols/session/capabilities.py:14-43`). |

**Deprecation window:** a contract `@N` may be dropped only after (a) a written deprecation note in the
manifest set, (b) one preview release in which both `@N` and `@N+1` are provided, and (c) the golden
vector set for `@N` still passing. The `frozen/` practice (per-file sha256 in a `MANIFEST.json`) is the
pattern to reuse.

**`agent_box_version`:** plugins that depend on host *behaviour* (not ABI) should declare it via
`[requires]` capabilities instead of a version comparison. This keeps "which host am I on" out of
plugin logic, which is the same mistake as version-sniffing in the desktop client.

---

## 2. Capability declaration and discovery

### 2.1 Families

The current catalog has ~10 kinds (`agent-box.host.resource-selector@1`, `…finalization-contributor@1`,
`…control@1`, `…continuation-route@1`, `…resource-library@1`, `agent-box.session.store@1`,
`…codec@1`, `agent-box.credentials.materializer@1`, `agent-box.runtime.transport-operation@1`,
`agent-box.harness.skill-installer@1`). Keep them, and add a **family** layer so the desktop and the
host can reason at the right altitude:

| Family | Example members (existing kinds map here) | Who needs it |
|---|---|---|
| `harness.execution` | execution provider | Studio service, Desktop |
| `harness.continuation` | per-harness continuation contract + provider | Studio service, Desktop |
| `harness.profile` | profile store / resource library | Studio service, Desktop |
| `workspace` | workspace provider (`agent-box.workspace@1`) | Studio, Desktop (file tree), harnesses |
| `vcs` | git provider + selector + finalization contributor | Studio, Desktop (review pane) |
| `terminal` | terminal-session contract + transport operations | Studio, Desktop (PTY pane) |
| `runtime.host` | runtime host, sandbox | Studio, harnesses |
| `artifact` | artifact provider + selector | Studio, Desktop (preview) |
| `credential` | materializer | Studio, harnesses |
| `model-provider` | harness-model-provider, accounts, setup sagas | Studio, Desktop (settings) |
| `session.store` | session store, codec | Studio |
| `skill-installer` | skill installer, native home | Studio |

The family list is closed and versioned with the ABI. A plugin that needs a new family is asking for a
kernel change, which is the correct amount of friction (this is the "narrow waist" rule applied to the
plugin surface).

### 2.2 Discovery

`GET /api/v1/capabilities` and `GET /api/v1/readiness` already exist (`server/app.py:356-368`).
Extend — do not replace — their shape to a **capability map** the desktop can consume generically:

```json
{
  "abi": 2,
  "families": {
    "harness.execution": {
      "state": "ready",
      "providers": [
        { "id": "codex-execution", "harness_type": "codex",
          "capabilities": { "start": "supported", "observe": "supported",
                            "native_continuation": "supported", "steer": "unsupported" } }
      ]
    },
    "terminal": { "state": "unavailable",
                  "reason": "no terminal-session provider registered in this realm" },
    "artifact": { "state": "not_implemented" }
  }
}
```

Two rules that matter more than the shape:

- **`unavailable` and `not_implemented` are different states and must not be collapsed.** "This host
  cannot do it right now" (retryable, often environment) versus "nobody implements it" (a product gap)
  drive different UI. Today's `readiness` conflates them for the desktop's purposes.
- **A capability is not a boolean.** `emulated` is distinct from `supported`; the desktop must be able
  to say "this works, but not natively" (that is precisely the continuation story: `CROSS_HARNESS_CONTINUATION_UNSUPPORTED`
  exists today as a typed error, `app.py:178-179`).

---

## 3. Registration, enable/disable, dependencies, conflicts

### 3.1 Registration (keep, extend)

Keep the existing transactional pipeline: validate → `register_components` → commit
(`loader.py:127-147`), with per-plugin isolation and `strict=True` fail-fast. Extend the validation phase to:

1. Read and schema-validate `plugin.toml` **before** importing the plugin module.
2. Check `abi` range → `PLUGIN_ABI_INCOMPATIBLE`.
3. Check declared `provides` against the registry after all plugins are loaded (two-pass: collect
   declarations, then bind) so that a plugin may declare a contract that another plugin registers.
4. Check declared `requires` resolve; a missing non-optional requirement is
   `PLUGIN_REQUIREMENT_UNSATISFIED` naming the requirer and the missing capability.
5. Reject duplicate `(family, id)` — the catalog already does this for `(kind, component_id)`
   (`catalog.py:36-42`).

Two-pass binding is the change that makes `requires` possible at all; today everything is one pass and
cross-plugin needs are satisfied by *string lookup into a global dict* (see §6).

### 3.2 Enable/disable

Per-plugin enablement belongs in host config keyed by plugin `id`, not by distribution name, and must
be honest about the consequence: disabling a plugin removes capabilities, so the host must recompute
the capability map and the service must fall back to a typed `UNAVAILABLE` — never to a silent
substitute. The sidecar's existing `require_workspace=True` refusal (`cli.py:140-154`,
`server/app.py:277-283`) is the right pattern: refuse to bind rather than degrade invisibly.

### 3.3 Conflicts

Declare them rather than discovering them:

- **Duplicate capability**: two plugins provide the same `(family, id)` → load-time error naming both.
- **Exclusive capability**: a family may declare `exclusive = true` (today's reality for workspace and
  session store: the composition root hardcodes one provider id — `app.py:101`, `app.py:275`). Make it
  explicit: an exclusive family is resolved by configuration, and a second provider for the same
  exclusive family is a typed error, not "last one wins".
- **Ordering**: no ordering. If a plugin needs another's output, that is a capability dependency
  (`requires`), not a load order.

---

## 4. Which environment loads what

This is the constraint most likely to be got wrong, so state it plainly: **the worker realms are not
Python plugin hosts today.** The remote side is a Rust HostBridge peer over loopback TCP with a frozen
20-op wire contract (`AGENTBOX_HOSTBRIDGE_WIRE_CONTRACT.md`), driven by `workerEnsure/Inspect/Drain`,
secret projection, and process/view/artifact sub-contracts. There is no Python plugin loader on the
other side of that wire.

Therefore:

| Realm | Loads | How a capability reaches it |
|---|---|---|
| **Host** (Studio process, local Python) | all `realm = "host"` plugins | in-process, through the catalog and the service layer |
| **WSL Worker** | **nothing** (Python) — it executes the frozen HostBridge ops | a host-side plugin's capability is *projected* as ops: e.g. a Workspace plugin resolves a path host-side, then `workspaceEnsure`/process ops act in the worker |
| **Remote Worker** (SSH / Docker) | the same as WSL: ops only | same projection; credential materialization stays host-side and crosses as an execution-scoped projection (`AGENTBOX_CREDENTIAL_AUTHORITY_FREEZE.md`) |

Consequences the design must absorb:

1. A plugin that needs to *act inside* a worker must express that as a **runtime transport operation**
   (the existing `agent-box.runtime.transport-operation@1` kind is the right seam) or as a host-side
   orchestration of frozen ops — never by assuming it can run over there.
2. Worker-capability availability must be discoverable per worker: the capability map needs a
   `realm` dimension (`host`, `wsl:<worker>`, `remote:<worker>`) so the desktop can show "Terminal is
   available on this device but not on Homelab".
3. If a future requirement genuinely needs plugins inside the worker, that is a **new decision** (a
   plugin runtime in Rust or an embedded Python), not a silent extension of this design. Recorded as
   **D-6** in `07-risks-gaps-decisions.md`.

---

## 5. Permissions, credentials, filesystem, network — and what "fail-closed" means here

ADR-0007 is explicit: "Plugins are trusted in-process Python code, not sandboxed or signed extensions"
(`docs/plugins/PLUGIN_SDK.md:76`), "no plugin sandbox, no permission system, no remote marketplace, no
hot update" (`docs/adr/0007:47-48`). The user's requirement #5 asks for permission, credential, fs and
network boundaries plus typed fail-closed behaviour. Those two positions must be reconciled
**explicitly**, and the honest reconciliation is:

**Boundaries by capability, not by sandbox.** Keep the trusted-in-process model (a real sandbox is a
different project — **D-4**), and make the *interface* the boundary:

1. **No secrets by value.** A plugin receives `CredentialRefV1` locators and resolves through the
   catalog at the materialization boundary; `PreparedSecretMount` is read-only-only
   (`credentials/protocol.py:24-40`). This is already true and must stay true — the design's job is to
   make it structurally enforced rather than conventional.
2. **No raw paths.** A plugin receives `WorkspaceV1` refs from the workspace provider, not
   filesystem paths it invented. The provider is the only component that turns a ref into a path, and
   it declares its own coverage honestly (the WSL provider reports `coverage: "unknown"` rather than
   pretending — `workspace-wsl/provider.py:46-66`; that honesty is the model).
3. **Network and filesystem needs are declared** in the manifest `[needs]`, recorded by the host, and
   printed by `agent-box plugins inspect/doctor`. This is transparency, not enforcement — say so in the
   docs so nobody mistakes it for a sandbox.
4. **Fail-closed is about typed outcomes, and it has three states, not two:** refuse to start
   (`PLUGIN_ABI_INCOMPATIBLE`, `PLUGIN_REQUIREMENT_UNSATISFIED`), or start and report a capability as
   `unavailable`/`not_implemented`, or raise a typed error at use. What is never allowed: silently
   substituting a different provider, returning an empty success, or degrading the capability that the
   fallback was supposed to protect.
5. **Cross-plugin coupling must stop being a global dict.** `_MATERIALIZERS` (`protocols/credentials/__init__.py:13-23`)
   is written by one plugin at `build()` time and read by another by the literal string
   `"gateway-provider"`. Replace with the `[requires]` capability lookup (§3.1) so the dependency is
   declared, validated, visible to `plugins doctor`, and impossible to satisfy accidentally.

---

## 6. How plugins provide capability to the service layer

Keep the current direction — plugins register into the kernel, the **service layer** resolves and
invokes, and no plugin is ever called by HTTP directly. Formalise the one place it is weakest:

```
HTTP/WS  →  Studio service (owns the API, auth, typed errors)
              └── resolves a capability from the catalog by (family, id)
                    └── invokes the provider through its contract interface
                          └── provider (plugin) may itself resolve other capabilities via the catalog
```

Rules:

1. **Only the service layer sees the wire.** A provider returns domain objects, never serialised HTTP
   or a route.
2. **Resolution is by declared capability**, and failure to resolve is a typed error naming family and
   id (today `_workspace_provider` does exactly this, with "no memory/local fallback",
   `app.py:224-235` — that comment is the standard for every family).
3. **Provider ids are configuration, not literals in the host.** Today several are literals
   (`"local-live-workspace"` `app.py:101`, `"wsl-live-workspace"` `cli.py:148`,
   `"harness-profile"` `profile_store.py:44`, `"official-session-store"` `app.py:275`). Move them to
   host config with `exclusive` semantics (§3.3) so a plugin can be swapped without editing the host.

---

## 7. Which plugins may contribute APIs

**None, and keep it that way.** Today no contribution kind is an HTTP route and the route table is a
single hardcoded FastAPI app (`server/app.py:350-1337`). That is a feature, not a gap: it is exactly
what prevents "plugins can bypass the formal service layer and expose arbitrary APIs" — one of the
failure modes this design must not reintroduce.

The pattern when a plugin needs to be reachable:

1. The host adds a **generic, capability-gated** route (e.g. `GET /api/v1/capabilities/{family}`,
   `POST /api/v1/capabilities/{family}/{id}/…` only where a genuinely generic verb exists), authorised
   like every other route and versioned with the API.
2. If the need is genuinely plugin-specific, that is evidence the capability family is wrong — fix the
   family, do not open a route.

Rejected alternative: a manifest-declared route table. It would need per-route authz, contract
versioning, and error-shape ownership, and it would force the desktop to learn plugin-specific
vocabulary — the opposite of a stable protocol boundary.

---

## 8. How the Desktop discovers capabilities and drives UI

The Desktop must never ask "which harness is this?" to decide what to render. Design:

1. The Desktop consumes **one** capability document per connection (`/api/v1/capabilities` +
   `/readiness`, keyed by family, with `realm`), plus per-family provider lists.
2. Every Desktop feature is declared against a **family + minimum capability state**, in one table on
   the Desktop side (the analogue of `desktop-slash-commands.ts`, but for capabilities rather than
   command names). Missing → the feature renders its honest degraded state (`UNAVAILABLE` →
   "unavailable here, retry/other device"; `NOT_IMPLEMENTED` → "not supported by this backend").
3. **No version sniffing, no harness-name branching in the Renderer.** If the Desktop needs to know a
   harness type for presentation (e.g. "Codex session"), it reads it from the provider descriptor, not
   from a hardcoded list.
4. The capability map is part of the **connection** scope the Desktop already has
   (`(connection, profile)` — `src/store/gateway.ts:913`), so per-device differences are first-class.

---

## 9. Protocol version upgrade and plugin migration

| Step | Practice |
|---|---|
| ABI change | Bump `PLUGIN_API_VERSION`; plugins declare an `abi` range; the loader refuses outside it with a typed error; the preview distribution pins the set it ships. |
| Contract change | New `@N` id; provider that supports both registers both; host prefers the highest it knows; `frozen/` golden vectors per version. |
| Capability vocabulary change | Treat as a contract change: the family's capability names are versioned with the ABI, because the Desktop keys UI off them. |
| Plugin removal | Disable in config first (one release), then remove from the distribution set; sessions referencing a removed provider id must resolve to a typed `PROVIDER_UNKNOWN` rather than a 500. |
| Host downgrade | Out of scope, and should be said out loud: the preview gate already refuses to package a sidecar missing required distributions (`installer/sidecar.spec:44-66`). |

---

## 10. Test fixtures, contract tests, real-boundary tests

The repo already has the right shape; the addition is a **capability matrix gate**.

| Layer | Purpose | Existing anchor | Proposed addition |
|---|---|---|---|
| Conformance (no I/O) | structural validity of a registration | `extensions/diagnostics.py:73-198`, `extensions/conformance.py`, `agent-box plugins doctor` | extend to manifest + `provides`/`requires` + ABI range; every plugin must pass in CI |
| Contract tests | frozen vocabulary and shapes | `tests/test_work_core_contracts.py`, `test_session_protocol.py`, `test_resource_contracts.py`, `test_doc_contract_guards.py` | one per capability family, asserting the family's state vocabulary |
| Golden vectors | byte-exact wire replay | `host_bridge_golden_vectors.json` (53 vectors, self-verifying sha256) + `test_host_bridge_golden.py` | publish the vectors for the **Desktop** to consume as its adapter's contract test (same file, two repos) |
| Real-boundary integration | the capability actually works against a real machine/CLI | `tests/integration/native/*` (real bwrap, real harness verticals), platform-gated via `conftest.py:10-30` + `importorskip` | **one real-boundary test per capability the Desktop consumes** — the anti-synthetic-green gate |
| Capability matrix | "every capability the Desktop needs is provided and real-boundary-tested" | — | a CI gate that fails when a Desktop-consumed family has no provider or no real-boundary test |

The capability matrix gate is the single most valuable addition, because it is the mechanism that
prevents the "synthetic green but the production combination was never wired" failure: a synthetic
provider (like the existing `g6a` fixture) can satisfy a contract test, but it cannot satisfy the
matrix gate.

---

## 11. Summary of what changes

| # | Change | Rationale |
|---|---|---|
| 1 | Add `plugin.toml` (declaration only; entry points still load) | the host must know capabilities/needs before executing plugin code |
| 2 | `abi` becomes a range; keep `@N` contract ids; consume capability state instead of versions | exact-equality is a wall, not a policy |
| 3 | Add a closed **family** layer over the existing kinds | the Desktop and host need one altitude to reason at |
| 4 | Two-pass binding so `requires` can resolve cross-plugin capabilities | kills `_MATERIALIZERS`' string coupling |
| 5 | Add `on_start`/`on_stop`/`health` lifecycle | today `build()` mutates global state at load time; there is no drain |
| 6 | Enable/disable by plugin id, with typed `UNAVAILABLE` consequences | today it is all-or-nothing per distribution |
| 7 | Explicit exclusive-family + duplicate/conflict rules | three families are already de-facto exclusive by literal |
| 8 | Add `realm` to the capability map; workers stay op-only | the worker is not a Python plugin host |
| 9 | Manifest `[needs]` recorded and reported; **no sandbox claimed** | honesty; a real sandbox is a separate decision |
| 10 | No plugin-contributed routes, ever | prevents bypassing the service layer |
| 11 | Capability matrix CI gate + Desktop consumes the golden vectors | prevents synthetic green and protocol drift |
