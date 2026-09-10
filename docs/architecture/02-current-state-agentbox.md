# AgentBox backend — current state

Evidence base: read-only survey of `/home/maoqh/projects/agent-box-studio-codex-vertical` @ `9ad2044`,
branch `feat/studio-codex-product-vertical`, 1020 tracked files.

**Working-tree caveat that matters for any design decision:** the authoritative desktop contract set is
**untracked** — `docs/validation/current/frozen/` (4 frozen docs + `MANIFEST.json`),
`docs/validation/current/DISPATCH_STATUS.md`, `installer/`, `NON_CODEX_REMOTE_PARITY_GAP_MATRIX.md` —
and 96 files are modified but uncommitted. Read from the working tree, as instructed, but treat "it is in
the repo" as not yet true for that set.

## 1. Process topology

| Process | Entry | Notes |
|---|---|---|
| `agent-box` CLI | `pyproject.toml:51-52` → `src/agent_box/cli/__init__.py:174` | root diagnostics/launcher |
| Legacy Web Workbench Host | `agent-box web` → `plugins/agent-box-web/.../cli.py` | the previous host; still ships |
| **AgentBox Studio server** | `agent-box-studio serve [--host --port --token]` (`plugins/agent-box-studio/.../cli.py:223-283`) | the current Host |
| **Studio sidecar** | `agent-box-studio serve --sidecar` (`cli.py:33-216`) | what a desktop client launches |
| PyInstaller sidecar bundle | `installer/build_sidecar.py:31-35`, `installer/sidecar.spec:44-66` | Windows onedir; manifest schema `agent-box.sidecar-manifest@1` |
| Remote worker | **no Python entry point** — a Rust HostBridge peer over loopback TCP | wire contract frozen; 20 ops |

Sidecar discipline worth knowing before designing a client: it reads **two stdin frames before
binding**, binds `127.0.0.1:0`, emits exactly one `sidecar-ready@1` / `sidecar-error@1` frame, keeps
stdout permanently silent afterwards, logs to stderr, and kills itself on stdin EOF (`cli.py:86-216`).
It **fails closed before binding** if its required workspace provider is absent
(`require_workspace=True`, `cli.py:140-154` → `LookupError("WORKSPACE_PROVIDER_UNAVAILABLE: …")`,
`server/app.py:277-283`).

## 2. API surface and protocol

One FastAPI app, **hardcoded route table** (`plugins/agent-box-studio/.../server/app.py:350-1337`);
40 application routes, frozen as an OpenAPI snapshot (`docs/validation/current/STUDIO_API_OPENAPI_SNAPSHOT.md`).
Groups under `/api/v1`: health/`capabilities`/`readiness`; `ws-ticket`; harness profiles; the provider
authority block (`providers`, `provider-accounts`, `harness-provider-configs`, `provider-setups`);
projects + remote-projects; sessions/turns (`launch-preview`, `turns`, `turns/{id}/cancel`,
`permissions/{id}/respond`, `questions/{id}/respond`, `recovery`, `lease/break`); and
`GET /sessions/{session_id}/events` for the WS.

**Events:** envelope `{seq, event_id, event_type, turn_id, execution_id, payload, terminal, created_at}`
(`server/events.py:92-102`); frames `replay`/`events` with `watermark`; typed error frames
`resync_required`/`invalid_cursor`/`session_error` with close codes **4409/4410/4404**
(`events.py:130-151`). The **durable ledger is the only replay authority**; the in-process queue is a
latency optimization (`events.py:1-7`). The cursor gate is `store.assert_replay_cursor`
(`session/store.py:1662-1679`): negative → `InvalidCursor`, ahead of watermark → `ResyncRequired`.

**Typed errors:** `{error: {code, message, correlation_id, …}}` with `X-Correlation-Id`
(`server/errors.py:82-129`), defensive redaction of paths/credential-shaped values before they enter a
body (`errors.py:31-65`), content-free `INTERNAL_ERROR` for unexpected exceptions (`:163-189`), and a
typed→HTTP table (`app.py:119-204`) including `SESSION_NOT_FOUND` 404, `RECOVERY_REQUIRED` 409
(`recoverable: True`), `RESYNC_REQUIRED` 409 (`current_watermark`), `IDEMPOTENCY_CONFLICT`,
`LAUNCH_PREVIEW_STALE`, `CROSS_HARNESS_CONTINUATION_UNSUPPORTED`. 422 is deliberately lossy
(`errors.py:132-160`).

**Frozen contracts** live in `docs/contracts/work-core/v0_1/` (9 docs: core contract with 10 design
laws, execution identity, execution projection, execution-provider contract, ref governance, work
contract, event ledger, ownership matrix, execution contract) and in the untracked
`docs/validation/current/frozen/` (interface protocol, HostBridge wire contract v0.4, C2 remote plan,
credential authority freeze). `docs/specs/` is entirely `archive/`.

## 3. The extension kernel — what already exists

**One registration API, two registries.**

```python
PLUGIN_API_VERSION = 2                                    # extensions/api.py:9
@dataclass(frozen=True)
class PluginDescriptor:  id, display_name, version, api_version, description, docs_url, config_namespace
class PluginContext:     agent_box_version, agent_box_home, plugin_data_dir, host_operations
@dataclass(frozen=True)
class PluginRegistration: contracts, resource_providers, execution_providers, contributions
class AgentBoxPlugin(Protocol):  descriptor() -> PluginDescriptor;  build(context) -> PluginRegistration
```

- **Loading:** `importlib.metadata.entry_points(group="agent_box.plugins")`, sorted, per-plugin
  transactional (validate → `register_components` → commit), isolated by default, `strict=True` fails
  fast; statuses `READY`/`FAILED`/`INCOMPATIBLE` (`extensions/loader.py:20,51-57,116-174`).
- **Two bind protocols:** `RegistryBindable.bind_registry` (`api.py:57-59`) and
  `CatalogBindable.bind_catalog` (`catalog.py:55-57`), applied at bootstrap
  (`extensions/bootstrap.py:47-72`).

### Existing SPIs and registries

| Capability | Where | Shape |
|---|---|---|
| Harness registry | `plugins/agent-box-harnesses/.../harnesses.toml` + `registry/loader.py:22-38`, `registry/schema.py:59-112` | declarative TOML, `schema_version=1`, 5 harnesses (codex, claude-code, opencode, hermes, pi), duplicate/`>16`/unknown-field rejection, `sha256:<digest>` over the file, closed capability frozenset `{start, observe, finish, attach, steer, stream, permissions, native_continuation}` (`schema.py:8`) |
| Execution provider | `work_core/registry.py:127-132` | `descriptor()`, `capabilities() -> Mapping[str,str]`, `input_limits()`, `start()`, `observe()`; optional resume/cancel/send_input/stream/pause/retry/approve/attach/reconnect each `supported|unsupported|provider_native|emulated`; registered as `"{harness_type}-execution"` (`generic/execution_provider.py:113`); `require_capability` accepts `supported|emulated` (`registry.py:314-318`) |
| Workspace provider | `resource_contracts/workspace_v1.py:9-20` (`agent-box.workspace@1`) + plugins `agent-box-workspace-local`, `agent-box-workspace-wsl` | `ResourceProvider`: `descriptor()`, `supported_contract_ids`, `resolve()` (`registry.py:36-42`); **selected by hardcoded id** at the composition root (`app.py:101`, `cli.py:148`) |
| Runtime host / sandbox / terminal | `protocols/runtime/protocol.py:20-54`, `:470-546` | `agent-box.runtime-host@1`, `agent-box.sandbox@1`, `agent-box.terminal-session@1`; plugins `runtime-local`, `runtime-wsl` (0.1.0a1, deliberately not enabled), `terminal-session`, `sandbox-bwrap`; transport-operation extension point `protocols/runtime/transport.py:4-12` |
| Credential materializer | `protocols/credentials/protocol.py:42-48` | `resolve()`, `prepare_mount()`, `cleanup()`; contribution kind `agent-box.credentials.materializer@1`; **plus** a mutable module-global `_MATERIALIZERS` dict (`protocols/credentials/__init__.py:13-23`) written under the literal key `"gateway-provider"` (`model-providers/factory.py:63-70`) and read by the harnesses plugin (`harnesses/generic/factory.py:72-75`) |
| Continuation / native resume | `harnesses/generic/factory.py:42-64`, `:725-751`; `native.py` | per-harness `*ContinuationV1` contract + ResourceProvider; `[harness.continuation] kind="native_session"` in the TOML; the Host-level `agent-box.host.continuation-route@1` kind has **no producer** (only a legacy web consumer) |
| Profiles / accounts / model configs | `generic/profile_store.py:44` (id `harness-profile`), `generic/profile_envelope.py`, `plugins/agent-box-model-providers/.../factory.py:52-78` | `agent-box.profile@1`, `agent-box.harness-model-provider@1` (immutable `revision`, locator-only `credential_ref`), account credential write-only endpoints |
| Session store / codec | `protocols/session/store.py:151-351` (kind `agent-box.session.store@1`), `codec.py:103-121` (kind `…session.codec@1`) | store implemented by `agent-box-session` (SQLite); **codec has no implementor** |

### Catalog contribution kinds (the real capability surface)

`agent-box.host.resource-selector@1`, `…finalization-contributor@1`, `…control@1`,
`…continuation-route@1` (**no producer**), `…resource-library@1`,
`agent-box.session.store@1`, `…session.codec@1` (**no implementor**),
`agent-box.credentials.materializer@1`, `agent-box.runtime.transport-operation@1`,
`agent-box.harness.skill-installer@1`, `agent-box.harness.native-home@1` (**not registered**) —
all in `protocols/**`, typed constructors that raise `TypeError` on a structurally-invalid component,
duplicate `(kind, component_id)` rejected (`catalog.py:36-42`).

## 4. Plugins today

15 distributions, each a separate pip package with its own `pyproject.toml`. Discovery is **entry
points only** — no `plugin.json`, no manifest, no directory scan. Example:

```toml
[project.entry-points."agent_box.plugins"]
harnesses = "agent_box_harnesses.plugin:plugin"
```

Notable members: `agent-box-harnesses` (2.0.0a1, 6 entry points), `agent-box-studio` (the Host —
**registers nothing**), `model-providers`, `session`, `web` (legacy Host, different route vocabulary),
`git`, `artifacts`, `skills`, `terminal-session`, `sandbox-bwrap`, `runtime-local`, `runtime-wsl`
(0.1.0a1 skeleton), `workspace-local`, `workspace-wsl` (0.1.0a1), `acp` (engine library, no entry point).

Author guide: `docs/plugins/PLUGIN_SDK.md` (147 lines) — states explicitly that plugins are "trusted
in-process Python code, not sandboxed or signed extensions" (`:76`) and that "there is no runtime
dependency manifest" (`:86-91`).

**Plugins cannot contribute HTTP routes.** Every contribution kind is a non-HTTP capability object; a
new endpoint means editing `app.py` + `schemas.py`.

**Conformance kit:** `extensions/diagnostics.py:73-198` + `extensions/conformance.py:10-43`, surfaced as
`agent-box plugins list|inspect|doctor` (exit codes 0/1/2 documented at `PLUGIN_SDK.md:98-102`).

## 5. What the docs already commit to

- `docs/architecture/ARCHITECTURE.md:33-35` — the intended dependency direction
  `Work Core → Extension Kernel → Protocol Packs → Concrete Plugins → Optional Hosts`
  (violated in practice: the kernel imports Work Core and Protocol Packs — see §6).
- `docs/adr/0007-third-party-provider-plugin-loading.md` — entry-point discovery, contract/provider
  requirements, same-Python-environment plugins, and the explicit non-goals (no sandbox, no permission
  system, no marketplace, no hot update, no inter-plugin dependency resolution).
- `frozen/AGENTBOX_INTERFACE_PROTOCOL.md` (approved/frozen 2026-09-07) — Ports↔endpoints, the
  LaunchSelection 3-part Refs, the frozen `resolution_digest` algorithm, blocker vocabulary, submitTurn
  with preview-digest verification, session creation converged to `project_id`, `CreateProfileRequest`
  + `launch_defaults`, the provider-setup saga with `awaiting_credential`, status projection, transcript
  / WS / ticket / error contracts, and the **C3.1 target**: all Ports behind a restricted proxy with the
  sidecar address+bearer never returned to the renderer (`:280-290`), while honestly recording that web
  mode still leaks the token to renderer `localStorage` (`codeg_token`, `:12-16`).
- `frozen/AGENTBOX_HOSTBRIDGE_WIRE_CONTRACT.md` v0.4 — 20 frozen ops, response status set, error codes,
  process/view/secret/events/artifact sub-contracts, `partial:{spawned}` timeout semantics.
- `frozen/AGENTBOX_CREDENTIAL_AUTHORITY_FREEZE.md` — the local AgentBox is the sole holder of long-lived
  credentials; a remote gets execution-scoped projection only; five mandatory counter-example tests.
- `docs/validation/current/REQUIRED_DECISIONS.md` — RD-1..RD-7, the open architectural gaps (notably
  RD-1 a Root Materializer port for rendered artifacts, RD-4 a TerminalSession incremental-read port,
  RD-5 full Python-runtime projection for Hermes, RD-7 launch-mode selection).
- `docs/research/archive/architecture-redesign-round1-plugin-ecosystem.md:430-491` — a "Plugin SDK gaps"
  list that names P0 host extension SDK, cross-plugin dependency/load topology, driver health,
  side-effect boundary, and P1 contract-ownership/compatibility matrix + secret hygiene kit. It is
  archived, but it is the same list this design reopens — useful as corroboration that these gaps are
  known, not invented here.

## 6. Honest gaps (what a plugin architecture must add)

1. **No plugin manifest** of any kind — discovery is one hardcoded entry-point group
   (`extensions/loader.py:20`); no declarative provided/required contracts, capabilities, dependencies
   or needs. The only declarative registry is `harnesses.toml`, and it is harness-scoped data inside one
   distribution.
2. **No capability declaration or negotiation at the plugin level** — `PluginDescriptor` carries
   identity only; provider capabilities are untyped `Mapping[str,str]`; the only closed vocabulary is
   the 8-item harness frozenset.
3. **Version negotiation is exact equality** — `api_version != PLUGIN_API_VERSION` → `INCOMPATIBLE`
   (`loader.py:116-120`); contract versions are separate `@N` ids with no pivot or deprecation policy.
4. **No lifecycle hooks** — no start/stop/health/reload anywhere; `build()` is the only callback and it
   runs at load time, so plugins mutate process-global state during discovery
   (`model-providers/factory.py:63-70`, providers constructed in `build()`).
5. **Plugins cannot contribute routes** — by design, and worth *keeping* (see the plugin-architecture
   doc §7), but it means every new desktop-facing endpoint is a core edit.
6. **The documented layer order is violated** — `extensions/api.py:7` imports `..work_core.registry`,
   `extensions/loader.py:9` imports `..work_core.runtime`, `extensions/bootstrap.py:25` imports
   `..protocols.runtime.protocol`.
7. **Hardcoded harness/provider wiring** — 6 entry-point factories in one module, `_continuation_wiring`
   and `_credential_materializer` if-chains (`generic/factory.py:42-82`), a registry cardinality cap of
   16 with a single packaged TOML read (no merging from multiple distributions), and literal provider
   ids at the composition root (`"local-live-workspace"`, `"wsl-live-workspace"`, `"harness-profile"`,
   `"official-session-store"`, `"gateway-provider"`).
8. **One cross-plugin coupling is a mutable global dict** — `_MATERIALIZERS`, written under a literal
   string by one plugin and read by another; not in the catalog, not duplicate-checked, invisible to
   `plugins doctor`.
9. **Two declared SPIs have zero implementations** — `HarnessSessionCodec` and `ContinuationRoute`
   (consumer exists, producer does not).
10. **SPI conformance does not cover the method the Host depends on** — `SessionEventStream` calls
    `store.assert_replay_cursor` (`server/events.py:66`) but that method is **not** on the
    `SessionStore` Protocol, so a store lacking it registers fine and fails later as a 500.
11. **No plugin configuration API** — `config_namespace` is advisory; each plugin rolls its own
    (`git/plugin.py:14` reads a JSON file); no schema, validation, reload or watcher.
12. **No plugin health/lifecycle surface** — `/readiness` aggregates *harness-provider* truth;
    `plugins doctor` runs structural conformance only. Worker lifecycle (`workerEnsure/Inspect/Drain`)
    exists in the wire contract but not as a Python-side plugin concept.
13. **The WSL/remote plugin pair is deliberately unfinished** (0.1.0a1; runtime-wsl "intentionally not
    enabled by the root distribution yet"), and the remote parity matrix names three open typed blockers
    (`REMOTE_OBSERVATION_ARTIFACT_UNRESOLVED`, `REMOTE_CONTINUATION_LOCATOR_UNADJUDICATED`,
    `CONTINUATION_PROVIDER_ABSENT`).
14. **Two hosts, two route vocabularies** — `agent-box-web` still ships a hand-written dispatcher on a
    different surface (`/quick-launch`, `/works`, `/executions`, `/resource-selectors`) with a different
    error shape and CSRF-by-Origin; nothing reconciles it with Studio's `/api/v1`. A desktop would have
    to learn both.
15. **Documentation drift** — ADR-0007 still references `plugins/agent-box-tmux`, which is not in the
    tree; `docs/specs/` is all archive; the frozen contract set is untracked.

## 7. Tests and fixtures (the evidence base a design should reuse)

| Category | Where | Note |
|---|---|---|
| Contract tests | `tests/test_work_core_contracts.py`, `test_session_protocol.py`, `test_resource_contracts.py`, `test_protocol_business_vocabulary.py`, `test_runtime_composition_protocol.py`, `plugins/agent-box-studio/tests/test_doc_contract_guards.py` (guards the frozen docs), `test_error_envelopes.py`, `test_ws_replay.py` | assert frozen vocabulary/shape |
| Golden vectors | `plugins/agent-box-studio/tests/fixtures/host_bridge_golden_vectors.json` (216,271 B, schema `agent-box.host-bridge-golden@1`, 53 vectors, self-verifying sha256 header) + `test_host_bridge_golden.py`; `installer/tests/fixtures/sidecar_manifest_v1.json` + `sample_bundle/` | positive byte-exact replay, negative fail-closed, responseOnly decodes |
| Synthetic fixtures | `plugins/agent-box-studio/tests/g6a_sidecar_fixture.py` (test-only synthetic execution provider + synthetic WSL project running the real sidecar stack) | honest, but see the capability-matrix gate in the plugin-architecture doc |
| Real-boundary integration | `tests/integration/native/*` (13 modules: real bwrap harness verticals for claude/hermes/opencode/pi, dispatch vertical, runtime composition, projection assembly, sandbox authority, transport registration, extension catalog) | platform-gated by a real bwrap probe via `pytest_collection_modifyitems` (`harnesses/conftest.py:10-30`) and `importorskip` |
| Readiness matrix | `docs/validation/current/DISPATCH_STATUS.md` REAL_HARNESS_READINESS_MATRIX, `SMOKE_REAL_HARNESS.md` (`REAL-CREDENTIAL SMOKE PENDING`) | per-harness independent evidence |

## 8. Where the kernel already satisfies the design's requirements

Worth stating, because the design is an increment:

- Declarative, schema-validated, version-gated discovery: **exists** for harnesses; generalising it to
  plugins is a small step, not an invention.
- Capability truth as a 4-state value with `emulated` distinct from `supported`: **exists**
  (`GenericExecutionProvider`, `protocols/session/capabilities.py`).
- Typed, redacted, correlated errors with a typed→HTTP table: **exists**.
- Durable-ledger-authoritative replay with typed resync: **exists**, frozen, with golden vectors.
- Credential values never cross a boundary (locator-only refs, read-only mounts, execution-scoped
  remote projection): **exists and is frozen**.
- Fail-closed refusal to bind without a required provider: **exists** (sidecar `require_workspace`).
- Conformance kit + `plugins doctor` + exit-code contract: **exists**.
