# Architecture Redesign Round 3: Single-owner Host Migration
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Date: 2026-08-28

Track: Host/Web migration feasibility

Status: implementation-oriented migration design; no frontend design and no
code changes.

## Executive verdict

The long-term local Web Host is feasible without delaying the Preview, but only
if migration is split into two explicit ownership transfers:

```text
today
  WorkBoard process is the sole supported mutation owner

transition
  WorkBoard uses a reusable in-process application facade and holds a real
  per-home mutation lock; optional Web is strictly read-only

cutover release
  one Host daemon acquires that same lock; WorkBoard and CLI become clients

after cutover
  Web mutation is enabled against the already-single daemon owner
```

“Web/CLI/WorkBoard share an application layer” must mean shared commands, DTOs,
validation, and read models. It must not mean three processes may invoke
provider effects independently. At every migration stage exactly one process
owns:

* provider `start/observe/recover/finish` calls;
* Binding draft mutation and Freeze & Launch;
* effectful ResourceProvider resolution/materialization;
* live provider handles and operation serialization;
* Core migrations and supported Core mutations.

The Preview should stop after the first transition unless Web work is proven
not to delay the official harness plugin:

```text
WorkBoard = mutation owner
tmux/native harness = interaction
optional read-only Web = presentation
```

This still advances the final architecture. The application facade and owner
lock are not demo throwaways; they are the exact seam the later daemon will
take over. No Work Core ontology change is required.

## Verified starting point

Current code has the right semantic pieces but no cross-process owner:

* `agent-box-workboard` constructs `CoreRepository`, the extension registry,
  `WorkBoardController`, Binding draft store, and provider control adapters in
  its own process.
* WorkBoard `dispatch()` invokes `ExecutionService.dispatch_execution()`
  directly; observe/recover/finish callbacks call plugin code in the WorkBoard
  process.
* the database module has one process-local SQLite connection and one
  `threading.Lock`. It does not coordinate independent processes.
* Binding drafts and operation journal are WorkBoard-private files under
  `$AGENT_BOX_HOME/plugins/workboard/`.
* the root CLI defaults to the legacy profile TUI; plugin diagnostics are local
  process commands; legacy GUI and scripts still invoke library code directly.
* Codex and Pi control adapters can reconstruct some handles from frozen/native
  facts, but recovery support is provider-specific rather than universal.
* the old Web GUI has a Windows/WSL RPC bridge and direct legacy launch path; it
  is not a daemon client.

The migration cannot be enforced merely by SQLite's one-Dispatch constraint.
That constraint prevents two Dispatch rows, but does not serialize finish,
recover, attach, cleanup, draft updates, or plugin operation state.

## Ownership vocabulary

### Mutation owner

The one process holding the per-`AGENT_BOX_HOME` mutation lease. Only it may
invoke supported Agent-Box commands that persist Core facts or produce native
side effects.

### Read client

A process that opens a non-creating, non-migrating read view and never calls
plugins or resource resolution merely to render facts.

### Mutation client

A UI/CLI process that sends a typed command to the current owner. It never calls
providers or opens a writable Core repository itself.

### Application facade

The transport-neutral command/query contract. In the WorkBoard-owner phase it
is invoked in process. In the daemon-owner phase clients call a transport proxy
implementing the same DTO contract. “Same application layer” refers to this
semantic contract, not to shared memory or concurrent ownership.

## Per-home process and database lock

### Lock shape

Add a Host-only lease outside Work Core:

```text
$AGENT_BOX_HOME/host/mutation.lock       held with POSIX flock
$AGENT_BOX_HOME/host/owner.json          non-authoritative display metadata
```

The owner opens `mutation.lock`, obtains `fcntl.flock(fd, LOCK_EX | LOCK_NB)`,
and holds the file descriptor for its entire mutation-owning lifetime.
`owner.json` may contain PID, process start time, mode (`workboard` or `daemon`),
Agent-Box version, protocol version, home path digest, and server address. It is
diagnostic metadata only; stale JSON never overrides the kernel lock.

`flock` releases on process death, avoiding “stale PID means permanently
locked.” The supported mutable home must live on the WSL/Linux filesystem. A
home under `/mnt/<drive>` should fail owner acquisition with a clear explanation
until cross-filesystem lock semantics are explicitly validated.

### What the lock does and does not prove

It coordinates supported clients from this version forward. It cannot prevent
an old binary, arbitrary Python import, or direct SQLite writer from ignoring
the protocol. Agent-Box is an extensible trusted-code system, not a security
hypervisor.

The release must therefore:

* update every supported mutation entry point to acquire or contact the owner;
* remove Preview scripts from the documented normal path;
* mark the legacy GUI/profile launcher as a separate frozen legacy surface,
  prohibited from operating on new plugin profile storage;
* clearly report “another Host owns mutations” rather than falling back to
  direct library calls.

### Database access rules

| Process | SQLite mode | May migrate/create | May call providers |
| --- | --- | --- | --- |
| current mutation owner | normal writable repository | yes, before serving commands | yes |
| read-only Web before daemon cutover | URI `mode=ro`, short-lived reads | no | no |
| daemon mutation owner | normal writable repository | yes, before readiness | yes |
| CLI/WorkBoard after daemon cutover | no direct DB for mutation; optional read cache only | no | no |

The current `db.get_conn()` creates the home and runs migrations even on the
first read. It must not be reused by the pre-cutover read-only Web process.
Provide an explicit read-only connection/snapshot reader that refuses a missing
database or unsupported schema. This is storage/application infrastructure, not
a new Core repository semantics.

Only the owner runs migrations. It acquires the mutation lease first, completes
migrations, constructs the plugin registry, and only then publishes readiness.

## Minimal target module tree

Do not move all existing files before the seam is proven. Add the smallest
outer ring:

```text
src/agent_box/
  application/
    models.py             transport-neutral command/query DTOs
    facade.py             AgentBoxApplication public use cases
    queries.py            Work/Execution/Binding/Evidence read models
    bindings.py           draft revision, choices/prepare bundle, review
    controls.py           action availability + provider control invocation
    operations.py         per-subject/idempotent Host operation coordination

  host/
    ownership.py          flock lease and owner metadata
    runtime.py            registry/repository/application lifecycle
    client.py             local Host client used by CLI/WorkBoard later

  server/
    app.py                same-origin local ASGI adapter
    read_routes.py        read-only routes, usable before cutover
    command_routes.py     installed but disabled until daemon cutover
    auth.py               loopback session/Origin/CSRF policy

  cli/
    commands/host.py      status/start/stop/connect
    commands/work.py      thin application/Host commands

plugins/agent-box-workboard/
  ...                     TUI client; first in-process, later HostClient

web/
  ...                     read UI first; no plugin-specific backend imports
```

The directory names are less important than the dependency rule:

```text
WorkBoard/Web/CLI -> application facade or Host client
application facade -> Work Core + extension registry
server -> application facade
application/host/server -X-> Codex/tmux/cc-switch/Git implementations
```

## Minimal application interface

The facade should be command-oriented rather than a table CRUD layer.

### Read interface

```python
class AgentBoxQueries:
    def list_works(self) -> tuple[WorkSummary, ...]: ...
    def get_work(self, work_id: str) -> WorkDetail: ...
    def get_execution(self, execution_id: str) -> ExecutionDetail: ...
    def get_binding(self, execution_id: str) -> BindingFacts: ...
    def get_evidence(self, execution_id: str) -> EvidenceReconciliation: ...
    def list_plugins(self) -> tuple[PluginSummary, ...]: ...
    def list_execution_providers(self) -> tuple[ProviderSummary, ...]: ...
```

Historical fact rendering must not resolve providers or require plugins still
installed. Pre-cutover read-only Web initially exposes only Core-derived facts
plus static plugin load status captured at server startup.

### Binding draft interface

```python
class AgentBoxBindings:
    def get_draft(self, execution_id: str) -> DraftView: ...
    def put_draft(self, execution_id: str, expected_revision: int,
                  slots: tuple[DraftSlot, ...]) -> DraftView: ...
    def choices(self, adapter_id: str, field: str,
                parameters: Mapping[str, str]) -> ChoiceResult: ...
    def prepare_bundle(self, execution_id: str,
                       draft_revision: int) -> BindingReview: ...
```

`BindingReview` contains individual candidate `(contract_id, exact Ref)`
entries. A Profile may propose selectors, but each external authority's adapter
prepares its own exact Ref. No bundle becomes a Core entity.

Drafts move from the WorkBoard plugin directory to a Host-owned location only
after a format-compatible importer exists. Draft revision is Host concurrency
state, not a Core Binding revision.

### Mutation interface

```python
class AgentBoxCommands:
    def create_work(self, command_id: str, objective: str) -> WorkView: ...
    def create_execution(self, command_id: str, work_id: str,
                         provider_id: str, responsibility: str) -> ExecutionView: ...
    def freeze_dispatch(self, command_id: str, execution_id: str,
                        draft_revision: int) -> DispatchView: ...
    def observe_execution(self, operation_id: str,
                          execution_id: str) -> OperationView: ...
    def finish_execution(self, operation_id: str,
                         execution_id: str) -> OperationView: ...
    def complete_work(self, command_id: str, work_id: str,
                      reason: str) -> WorkView: ...
```

Each mutation is accepted only by the current owner. `command_id` or
`operation_id` is required for idempotency. The application layer serializes
operations per Execution and never retries an ambiguous provider effect.

Attach is a query/control capability rather than a Core mutation:

```python
def get_attach_descriptor(execution_id: str) -> AttachDescriptor | None: ...
```

It returns a typed native attach target/display command from the provider
adapter. The first Web version does not execute it.

## Minimal HTTP API tree

### Read-only phase

```text
GET /api/v1/health
GET /api/v1/works
GET /api/v1/works/{id}
GET /api/v1/executions/{id}
GET /api/v1/executions/{id}/binding
GET /api/v1/executions/{id}/evidence
GET /api/v1/plugins
GET /api/v1/providers/execution
```

Use bounded polling for Preview. SSE/WebSocket Core events are not required.
Every non-GET method except authentication returns `405 read_only_host` while
WorkBoard owns mutations. Plugin `choices`, `prepare`, `doctor`, settings, and
actions are excluded because they execute plugin code.

### Daemon-owner phase

After cutover, enable:

```text
POST /api/v1/works
POST /api/v1/works/{id}/executions
GET  /api/v1/executions/{id}/binding-draft
PUT  /api/v1/executions/{id}/binding-draft
POST /api/v1/resource-inputs/{adapter}/choices
POST /api/v1/executions/{id}/binding-review
POST /api/v1/executions/{id}/freeze-dispatch
POST /api/v1/executions/{id}/observe
POST /api/v1/executions/{id}/finish
GET  /api/v1/operations/{operation_id}
GET  /api/v1/executions/{id}/attach
POST /api/v1/works/{id}/complete
```

Web, CLI, and WorkBoard all call these owner commands. A loopback HTTP endpoint
is acceptable for all clients in Preview-like local mode; a Unix-domain socket
transport can be added for CLI/TUI only if it materially simplifies auth. Do
not implement two independent command servers.

## Migration phases with one owner at every point

## Phase 0 — Freeze and inventory

### Unique mutation owner

Procedurally, the one WorkBoard process used for the Preview rehearsal. The
current code does not enforce this yet.

### Work

* Freeze feature development in legacy GUI/TUI/REPL/direct launch.
* Inventory every documented mutating entry point and legacy GUI capability.
* Mark preview scripts as fixtures/recovery tools, not supported commands.
* Keep the current Demo runnable.

### Acceptance

* one canonical runbook starts exactly one WorkBoard controller;
* no legacy GUI or script is used concurrently on the same home;
* baseline provider/Core/WorkBoard tests are recorded.

### Rollback

No architecture change; use current runbook.

## Phase 1 — Application seam inside WorkBoard

### Unique mutation owner

WorkBoard process, now formally holding `mutation.lock` before any mutation or
provider registry use.

### Work

* Extract transport-neutral queries, Binding draft operations, provider action
  availability, and command wrappers from WorkBoard controller/model.
* Keep Textual UI behavior unchanged.
* Add owner lease acquisition to normal mutating WorkBoard startup.
* Add explicit `--read-only` WorkBoard mode that does not acquire the lease and
  hides/rejects mutation actions.
* Make CLI Core mutation commands either contact the owner (if client exists)
  or fail with owner metadata; no silent direct fallback.
* Keep plugin `list/inspect/doctor` local because they do not mutate Core/native
  execution state; document that plugins are trusted local code.

### Acceptance

* existing WorkBoard vertical slice passes through `AgentBoxApplication`;
* a second WorkBoard cannot acquire mutation ownership;
* read-only WorkBoard can inspect while the owner runs;
* killing the owner releases the kernel lock; stale `owner.json` does not block;
* no new Core schema or UI ontology.

### Rollback

Application facade remains a thin compatibility wrapper. Disable lease
enforcement and point WorkBoard back to its existing controller only before any
second client relies on the lock. No data migration has occurred.

## Phase 2 — Official plugin vertical slice and optional read-only Web

### Unique mutation owner

WorkBoard process holding `mutation.lock`.

### Work

* Complete official harness plugin vertical slice using the application seam.
* Add read-only database/query path that cannot create or migrate.
* Add loopback, authenticated, same-origin Web server with only the read API.
* Web polls Work/Execution/Binding/Evidence/plugin summary.
* No Web Binding draft, selector, plugin settings, attach execution, Finish, or
  browser terminal.
* Keep native tmux attach controlled from WorkBoard.

### Acceptance

* Web responses and WorkBoard render the same frozen facts, unknowns, and
  conflicting observations;
* all non-read API routes return `405 read_only_host`;
* starting/stopping Web does not obtain the mutation lease or change DB/files;
* read server refuses missing/outdated schema rather than running migrations;
* official Codex plus one second driver run end-to-end through WorkBoard;
* Web work has not become a dependency of provider tests or Preview recording.

### Rollback

Stop/remove the read-only server and Web assets. WorkBoard and the plugin
vertical slice remain unaffected. This is why Web must be read-only here.

## Phase 3 — Daemon shadow and client conversion

### Unique mutation owner

Initially WorkBoard. Then, at an explicit cutover step, one Host daemon. There
is never a supported interval where both hold the lease.

### Work before cutover

* Implement Host daemon lifecycle, lock acquisition, readiness metadata,
  registry generation, application facade, and authenticated command API.
* Run it in `--shadow-read-only` mode while WorkBoard owns mutations.
* Implement `HostClient` for WorkBoard and CLI.
* Test every command against fake providers and an isolated home.

### Cutover procedure

```text
1. ensure no Execution operation is FINALIZING/ambiguous
2. close mutating WorkBoard and release lock
3. start daemon; it acquires lock, migrates, loads registry, publishes ready
4. reopen WorkBoard in client mode
5. CLI detects owner.json and sends commands to daemon
6. Web remains read-only during burn-in
```

WorkBoard client mode does not construct a writable repository or provider
registry for commands. It may cache presentation DTOs but the daemon is the
source of current facts and action availability.

### Acceptance

* daemon rejects a second daemon and an embedded mutating WorkBoard;
* WorkBoard client completes the same vertical slice over Host API;
* CLI create/inspect/finish uses HostClient and never calls providers locally;
* daemon restart reconstructs each advertised provider support level honestly:
  `none`, `observe`, or `control`;
* an active provider lacking restart control becomes visibly non-controllable,
  not automatically retried;
* all known supported mutation entry points honor the owner protocol.

### Rollback

Only when no Host operation is running:

```text
stop daemon -> release lock -> start WorkBoard embedded owner
```

Core facts and draft format remain compatible. If a Dispatch is ambiguous or a
provider operation is active, rollback is blocked until provider-specific
observe/recovery or explicit operator acknowledgement; switching owners must
never imply retry.

## Phase 4 — Enable Web mutations

### Unique mutation owner

Host daemon. Web, CLI, and WorkBoard are clients only.

### Work

* Enable server-side Binding draft, resource choices/prepare bundle, review,
  Freeze & Launch, observe, Finish, and Work completion routes.
* Add Web mutation UI incrementally; no complete frontend platform is required.
* Enforce command/operation idempotency and per-Execution serialization.
* Keep plugin configuration limited to profile import/list/inspect/validate and
  Binding selection until the official plugin contracts prove richer editing.
* Pure-browser Attach displays/copies a provider-owned native tmux descriptor;
  it does not execute arbitrary argv.

### Acceptance

* the same Execution launched from Web is immediately visible to CLI and
  WorkBoard clients;
* simultaneous duplicate Freeze/Finish requests invoke provider effects once;
* a stale draft/provider registry revision forces re-review;
* hostile Origin, missing/expired session, invalid CSRF, unexpected Host, and
  unauthenticated socket requests are rejected;
* no secret value is returned through API, draft, logs, event detail, or
  evidence;
* Web can complete launch -> native interaction -> Finish without manual
  scripts.

### Rollback

Disable Web command routes/UI feature flag. The daemon continues owning
mutations for CLI/WorkBoard, so rollback does not transfer ownership or affect
active provider handles.

## Phase 5 — Legacy GUI capability migration and deletion

### Unique mutation owner

Host daemon.

### Work

Migrate capabilities by explicit gates rather than deleting a directory:

| Legacy capability | Required successor or explicit decision before deletion |
| --- | --- |
| direct profile launch | official harness provider complete through frozen Binding and Dispatch |
| profile list/create/edit/delete | plugin import/list/inspect/validate; editing either plugin API or documented config-file authority |
| per-harness config editors | explicit drop to native config files, or stable official harness-management API |
| provider/model endpoint configuration and tests | cc-switch/external authority or plugin-owned redacted settings/doctor |
| MCP/skills/prompts browse/apply | explicit capability Ref discovery/selection; no legacy copied state required |
| cc-switch launch/dependency handling | cc-switch independently managed with integration health/docs, or later desktop open action |
| binary detection/readiness | per-driver plugin doctor |
| one-click system installers | documented external install path or packaging owner; never silently removed |
| session list/cleanup | native SessionRefs/history plus plugin-owned orphan runtime cleanup |
| raw file manager/editor | explicit product removal with external editor workflow |
| Windows folder picker/path conversion | configured WSL roots now; desktop native picker later |
| application updater | packaging/desktop update path |
| setup/environment guidance | reduced Host/plugin health onboarding page |

Legacy profile data is imported into plugin-namespaced storage; old and new
systems never share a writable profile directory. The old GUI may remain a
frozen compatibility binary until all used capabilities have a disposition,
but it must not operate on the daemon's new plugin state.

### Acceptance

* capability-by-capability migration ledger is complete;
* no Web/server/Host import of `data_linux.py`, `data_wsl.py`, PyWebView bridge,
  ACS schema adapter, legacy `launch.py`, or `agent_types.json`;
* current users can import existing profiles without secret leakage;
* historic Work/Execution/Ref/Observation remains readable after legacy and
  plugin uninstall.

### Rollback

Retain a read-only export/import backup of legacy profile metadata. Reinstalling
the old GUI must not make it owner of the new home or new profile directories.
Rollback is data export to an old isolated home, not simultaneous control.

## Phase 6 — Optional WSL desktop shell and terminal evolution

### Unique mutation owner

Host daemon inside one selected WSL distribution.

### Desktop responsibility

The desktop shell may:

* enumerate WSL distributions;
* select one distro;
* start/reconnect to `agent-box serve --stdio-ready`;
* verify protocol/version/home/distro identity;
* open the same Web bundle;
* launch Windows Terminal with a typed native attach descriptor;
* provide notifications and updater integration.

It may not open SQLite, load plugins, resolve Binding resources, or invoke
providers locally on Windows.

Each distro is a separate Host/home/plugin universe. The readiness handshake
includes distro identity, Agent-Box/version/protocol, home digest, owner PID,
server address, and a one-time authentication bootstrap. Port alone is never
identity.

### Browser terminal

Remain optional. If implemented, it is a daemon-owned terminal broker using a
short-lived attach ticket and provider-approved target. Terminal bytes, resize,
and disconnect are transport facts, not Core events. tmux stays a resource; a
remote sandbox may expose a different PTY stream.

### Acceptance

* closing desktop/WebView does not end Execution, harness, tmux, or daemon;
* reconnect to the same distro/home restores facts and supported controls;
* wrong distro/version/home handshake fails closed;
* desktop attach never changes Core terminal state and never treats window close
  as Finish.

### Rollback

Close/uninstall desktop and connect to the same daemon via browser/CLI. No Core
or plugin data migration is involved.

## CLI calling path by phase

| Phase | Read commands | Mutation commands | Provider/plugin effects |
| --- | --- | --- | --- |
| 0 | local existing code | WorkBoard/runbook only | WorkBoard process |
| 1 | local application queries | embedded WorkBoard owner; CLI fails or connects if supported | WorkBoard process |
| 2 | local or read-only Web | embedded WorkBoard owner only | WorkBoard process |
| 3 after cutover | HostClient | HostClient to daemon | daemon only |
| 4+ | HostClient | HostClient to daemon | daemon only |

`agent-box plugins list/inspect/doctor` can remain local diagnostics because it
does not mutate Core/native execution state. Package installation/uninstallation
requires daemon restart and is not performed by a live Web request in Preview.
The daemon exposes its registry generation; clients never assume a newly
installed distribution is live until restart.

## tmux attach across migration

### WorkBoard-owner phases

WorkBoard obtains the provider control adapter's exact attach descriptor and
runs/suspends into native tmux according to current behavior. tmux pane identity
remains a frozen input/native fact as applicable.

### Daemon-owner, TUI/CLI clients

Client requests the descriptor from the daemon. The client may execute a known
native tmux attach command locally after explicit confirmation because it is an
interaction transport, not a second Execution mutation. It must not call
provider Finish locally.

### Pure Web client

Web displays a sanitized descriptor/copy command. Browsers cannot safely open a
WSL terminal generically. The future desktop shell can translate a typed attach
descriptor into Windows Terminal launch. Do not expose generic shell execution
through Web to hide this limitation.

### Future browser terminal

The daemon owns the PTY bridge. Authentication, one-time ticket, Origin check,
rate limits, and resize/backpressure tests are required. Browser disconnect is
not Execution terminal.

## Double-control counterexample test suite

These tests are mandatory before the relevant phase gate.

### Ownership tests

1. Start mutating WorkBoard, then start a second mutating WorkBoard: second exits
   before registry/provider construction and identifies current owner.
2. Start WorkBoard owner, then start daemon in mutation mode: daemon refuses;
   `--shadow-read-only` succeeds without mutation routes.
3. Start daemon owner, then run legacy/current CLI mutation: CLI contacts daemon
   or fails; it never falls back to direct services.
4. Start two daemons concurrently: exactly one acquires `flock`; the loser never
   migrates, loads operational providers, or binds command routes.
5. Kill owner with `SIGKILL`: lock releases; stale metadata is shown but does
   not block next owner.
6. Put `AGENT_BOX_HOME` on an unvalidated Windows-mounted path: mutation owner
   refuses with migration guidance.

### Dispatch and operation tests

7. Two clients send identical Freeze & Launch command IDs concurrently:
   provider `start` is called once and both receive the same result.
8. Two clients send different command IDs for the same Execution concurrently:
   one Dispatch wins; the loser receives existing/frozen conflict without a
   second resolve/materialize/start.
9. Two clients send Finish concurrently: provider `finish` runs once; replay
   returns the durable/Host operation result.
10. Daemon crashes after `start` side effect and before accepted fact: restart
    shows Dispatch ambiguous; it does not resolve or start again.
11. Daemon crashes during Finalizing: only a provider advertising tested
    `control` recovery may reacquire; others show a blocked operation.
12. Attach from two clients does not produce Dispatch, terminal projection, or
    duplicate provider start; closing either attach does not Finish.

### Read-only isolation tests

13. With WorkBoard owner active, read-only Web polls facts without acquiring
    lock or changing DB mtime/schema/event count.
14. Every pre-cutover non-GET command returns `405 read_only_host` before any
    plugin adapter is called.
15. Missing database or pending migration makes read-only Web unavailable; it
    does not create home/schema.
16. Uninstalled provider/Contract still renders historical raw Ref and evidence
    without plugin resolution.

### Registry/draft tests

17. Draft prepared under registry generation A cannot Freeze after daemon
    restarts with generation B until re-prepared/reviewed.
18. Profile candidate bundle change or external selector drift invalidates the
    preview rather than silently changing frozen inputs.
19. Installing a plugin while daemon runs produces restart-required status; it
    does not hot-mutate the registry.
20. WorkBoard client disconnect/reconnect never transfers ownership or loses a
    server-held active operation.

## API and data compatibility rules

* Application DTOs carry `api_version` and registry generation where relevant.
* Drafts carry Host draft revision, provider id/version, and adapter schema
  generation; none is a Core Binding revision.
* Commands carry caller-generated idempotency identity.
* A Host operation response distinguishes `accepted`, `running`, `completed`,
  `failed`, `ambiguous`, and `blocked_recovery`; these are Host operation
  states, not generic Execution outcomes.
* The daemon never serializes resolved secret-bearing Contract values to
  clients.
* Historical queries use Core persisted envelopes and do not import plugin
  Python types.
* Read-only Web never calls `resolve()`, `choices()`, `prepare()`, `doctor()`,
  or provider control methods.

## What is deliberately not designed here

* complete React page hierarchy or visual design;
* remote/multi-user Agent-Box deployment;
* generic plugin frontend bundles;
* browser file manager;
* package/plugin marketplace and live updates;
* universal sandbox or console SPI;
* workflow progression;
* generic retry engine;
* distributed lock across machines;
* enforcement against arbitrary direct SQLite/Python access.

## Go/no-go gates

### Preview go

Proceed with Preview when Phase 1 plus the official harness vertical slice are
green. Phase 2 read-only Web is optional and may be dropped without changing
the recorded execution path.

### Web mutation go

Enable only after Phase 3 proves daemon ownership, WorkBoard/CLI client mode,
operation idempotency/recovery honesty, and local Web security. Do not use Web
mutation as the mechanism to prove the daemon.

### Desktop go

Begin only after Web mutation and daemon lifecycle are stable without desktop.
Desktop must reduce WSL/attach friction, not become a second backend.

## Final recommendation

The migration can satisfy both product goals:

* **Preview is not rewritten:** WorkBoard remains the sole mutating owner while
  the official Harness/Profile/Binding path is proven.
* **Long-term Web is real:** the application seam, lock, DTOs, and later daemon
  are intentionally designed as the permanent Host boundary.

The decisive invariant is operational rather than visual:

> For one `AGENT_BOX_HOME`, exactly one supported process may invoke native
> provider effects and Core mutations at a time.

The exact safe sequence is:

```text
WorkBoard direct controller
-> WorkBoard-owned application facade + flock
-> optional read-only Web
-> daemon shadow
-> explicit owner handoff
-> WorkBoard/CLI daemon clients
-> Web mutation
-> legacy GUI deletion gates
-> optional WSL desktop/browser terminal
```

No stage requires two mutation owners, and every stage has a rollback that does
not reinterpret an active Execution or retry an ambiguous Dispatch.
