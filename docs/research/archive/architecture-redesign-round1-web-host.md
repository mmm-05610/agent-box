# Agent-Box Architecture Redesign Round 1: Local-first Web Host
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

## Executive verdict

Agent-Box should move toward a **local-first Web Workbench backed by one Host
service running in the execution environment**. On Windows, that environment
is normally one selected WSL distribution. A future desktop application should
be only a WSL discovery/launch/connection shell around the same Web UI and Host
API.

This is not primarily a frontend rewrite. The necessary architectural change
is to introduce a single application boundary between every human-facing
client and Work Core/plugins:

```text
Web / CLI / optional TUI / future desktop shell
                    |
             Host application API
                    |
       Work Core + extension registry
                    |
           provider/resource plugins
```

The current repository is not at this boundary. It has several overlapping
control paths:

* `gui-web` uses a PyWebView bridge, a large `LinuxDataAccess`, and a one-process
  per-call WSL RPC shim. It directly understands profiles, harness types,
  cc-switch/ACS, files, process installation, and legacy launching.
* the root `agent-box` CLI defaults to the legacy profile TUI and still exposes
  the legacy REPL;
* `agent-box-workboard` separately implements the closest existing version of
  an application controller, Binding draft, provider-contributed selectors,
  observe/attach/finish controls, and a Core fact read model;
* legacy `launch.py` combines profile materialization, project projection,
  bwrap policy, process launch, and legacy session persistence;
* plugin discovery covers Contracts, ResourceProviders, and
  ExecutionProviders, while the selector/control adapter protocol currently
  lives inside the WorkBoard plugin rather than a Host-facing public SDK.

Therefore the safe recommendation is:

1. **Do not build the desktop shell now.**
2. **Do not rewrite all old GUI features into REST endpoints.** Most of those
   features belong in the future harness and cc-switch plugins.
3. Build a small Host/application facade using the already-working WorkBoard
   paths as the reference behavior.
4. Add a same-origin loopback Web server and migrate only the Preview control
   path: inspect history, create Execution, compose Binding, Freeze & Launch,
   attach, observe/finish, reconcile evidence, complete Work.
5. Keep WorkBoard usable during migration, but choose one control plane for a
   given rehearsal. Retire mutating legacy paths after Web parity rather than
   maintaining two permanent products.

No new Work Core ontology is required for this design. Drafts, selector
choices, operation progress, WSL identity, Web sessions, PTYs, desktop windows,
and plugin configuration remain Host/plugin concerns.

## Repository audit: current control surfaces

### Root CLI and legacy TUI

`src/agent_box/cli/__init__.py` currently makes `agent-box` with no arguments
open `src/agent_box/tui/app.py`. The CLI also exposes the old cmd2 REPL and the
new plugin inspection commands. Its package description is still an isolated
configuration launcher for specific coding agents.

This means the public executable currently identifies the product with the
Phase-1 profile launcher, not with governed Execution. It also makes the legacy
TUI, REPL, Web GUI, and WorkBoard look like peers even though they use different
application paths.

### Existing `gui-web`

The React application itself contains reusable visual primitives, forms,
internationalization, navigation, and tests. Its backend boundary is not
reusable as the future Host API:

* `bridge.py` exposes a large Python object directly to JavaScript;
* Linux/WSL mode imports `agent_box` legacy modules in `data_linux.py`;
* Windows mode launches a fresh WSL Python RPC process for calls through
  `data_wsl.py` and `rpc_server.py`;
* some filesystem operations bypass Agent-Box completely and use WSL shell
  commands;
* `launch_profile` bypasses governed Dispatch and calls the legacy launch
  library in a new console;
* frontend types and pages know ACS rows and individual harness configuration
  shapes;
* environment management includes binary installers, cc-switch binary
  provisioning, missing system library installation, release downloading, and
  application update behavior.

The frontend assets can be selectively reused. The bridge/data layer cannot be
kept as a second backend beside the new Host.

### WorkBoard

`agent-box-workboard` already contains the best reference implementation for
the future application layer:

* `WorkBoardController` calls public Work/Execution services for mutations;
* the read model renders frozen facts without resolving installed providers;
* Binding drafts remain Host-local until explicit Freeze & Launch;
* the composer derives accepted Contract multiplicities from the chosen
  ExecutionProvider;
* provider plugins contribute selector/prepare and control adapters through
  entry points;
* attach, observe, recover, and finish remain provider-owned behavior.

It is not yet the reusable Host layer:

* its adapter protocol is WorkBoard-specific and outside the main Plugin SDK;
* its controller also owns a `BindingDraftStore` path obtained from global
  config;
* its read model reads `CoreRepository` directly;
* the Textual application is a large module containing UI mechanics and Host
  orchestration callbacks;
* operation progress and provider handles are not yet a general server-side
  operation model.

The right migration is to extract reusable application/read/adapter services
from this behavior, not to translate 1,310 lines of Textual widgets into React
one-for-one.

### Legacy profile, launch, session, and ACS code

`config.py`, `core/agent_types.json`, `resources/`, `project_space.py`, and
`launch.py` collectively know individual harness binaries, native config homes,
profile copies, project surfaces, bwrap mounts, and legacy session storage.
`adapters/acs.py` and the old GUI directly understand cc-switch data.

This code must be split by ownership before deletion:

* harness-specific config and native session logic -> official harness plugin;
* cc-switch schema/read-only normalization -> optional cc-switch bridge plugin;
* terminal pane authority and attach -> tmux plugin;
* sandbox-specific launch/materialization -> future sandbox plugin (the current
  bwrap implementation can remain experimental until then);
* governed create/freeze/dispatch/observe/finish -> Host application service;
* Work/Execution/Binding/Dispatch/Ref/Observation facts -> Work Core.

Until the replacement vertical slice passes, the old code is a compatibility
source, not a deletion target.

## Target module boundaries

The target repository shape should be evolutionary rather than an immediate
filesystem reshuffle:

```text
src/agent_box/
  work_core/             stable kernel and repository
  application/           host use cases and read models
  extensions/            plugin discovery, contracts, diagnostics
  server/                HTTP, event stream, terminal broker
  cli/                   thin commands over application/server

web/                     React Workbench (may initially reuse gui-web assets)

plugins/
  agent-box-harnesses/   profiles, drivers, interactive provider
  agent-box-cc-switch/   optional read-only external catalog bridge
  agent-box-tmux/        pane identity and console integration
  agent-box-workboard/   transitional TUI client/reference host
  ...                    Git, workflow, CI, sandbox integrations

desktop/                 future only: WSL launcher + WebView shell
```

### Work Core

Core remains responsible only for stable governed facts and transitions. The
Web redesign must not add page state, drafts, selector fields, operation jobs,
Web sessions, terminal bytes, or WSL distributions to Core.

### Application layer

The application layer is the **single in-process semantic API**. HTTP, CLI,
TUI, tests, and embedded hosts call this layer. It should contain:

* Work and Execution queries/read models;
* create Execution and Work lifecycle commands;
* Binding draft storage and optimistic draft revisions;
* provider/Contract/resource-input catalogs;
* dynamic choice and exact Ref preparation;
* explicit freeze/dispatch orchestration through `ExecutionService`;
* provider-owned observe/recover/finish/attach invocation;
* evidence reconciliation read models;
* operation status for long Host actions.

The application layer may depend on Work Core and the extension registry. It
must not import Codex, tmux, cc-switch, Git, or another product implementation.

### Server layer

The server is a transport adapter. It owns:

* request validation, authentication, origin/CSRF checks;
* serialization of application DTOs;
* HTTP idempotency headers/keys;
* WebSocket/SSE connection lifecycle;
* terminal PTY byte transport;
* serving the same-origin static Web application;
* one Host-process lock per Agent-Box home.

It must not open Core SQLite directly, launch harnesses, inspect tmux, or parse
cc-switch data.

### Web Workbench

The Web UI is not merely a profile editor. Its durable role is the human
surface for consequential governance moments:

* inspect Work/Execution history;
* select one accountable ExecutionProvider;
* compose and review the resource Binding;
* Freeze & Launch;
* attach to a native interactive responsibility window;
* explicitly Finish/Submit;
* compare frozen expectations with actual observations/evidence;
* make Human Work lifecycle decisions;
* inspect plugins, integrations, and harness profiles.

Users should not be required to stay in it while the harness works. Native
CLI/TUI remains a legitimate interaction surface.

### Future desktop shell

The desktop shell should own only:

* enumerating WSL distributions;
* selecting one deployment target;
* starting/stopping or reconnecting to `agent-box serve` in that distribution;
* consuming a machine-readable readiness handshake;
* opening the exact same Web bundle in a WebView;
* optional native notifications, protocol links, and Windows Terminal launch.

It must not own the database, plugin registry, Core, profile files, or provider
lifecycle. A selected WSL distribution is a deployment target, not a
`SandboxRef`, Work, Execution, or Core identity.

## Plugin contribution model for the Web Host

### Current gap

The public Plugin SDK currently registers Contracts, ResourceProviders, and
ExecutionProviders. WorkBoard separately discovers `ResourceInputAdapter` and
`ExecutionControlAdapter` entry points. This proves the boundary but leaves a
Web Host with the wrong dependency direction if it imports WorkBoard's private
protocol.

### Recommended bounded Host extension surface

Promote a small, product-neutral Host presentation protocol into the public
extension/application package after the Web spike validates it. Do not permit
plugins to ship arbitrary JavaScript into the Workbench.

The bounded contribution types should be:

```text
ResourceInputAdapter
  contract_id
  title/description
  small declarative field list
  choices(field, current parameters)
  prepare(parameters, execution_id) -> exact candidate Ref preview

ExecutionControlAdapter
  provider_id
  available_actions(facts)
  attach / observe / recover / finish

PluginSettingsAdapter
  redacted current values
  bounded fields
  validate/update
  health links / docs link
```

Supported field mechanics should initially remain deliberately small: text,
secret input, boolean, select, path selector, and secret-source selector.
Dynamic choices are server-side adapter calls with timeout/cancellation. A
plugin returns data and actions; it does not inject markup, CSS, scripts, raw
shell commands, or database queries.

### Rich official UI without arbitrary plugin frontend code

The official harness plugin will eventually need richer profile/capability
management than a generic field list can express. Two levels should coexist:

1. every third-party plugin gets the generic configuration and Binding surfaces;
2. the first-party Web bundle may contain a richer **Harness management client
   for a stable harness-management application API**, shown only when that
   capability is installed.

The richer page knows the public protocol (`profiles`, revisions, capability
references, validation), not Codex filesystem paths or the plugin's Python
classes. This is preferable to either extreme: hardcoding each provider into
React, or designing a universal UI-schema language before Preview.

### Why arbitrary plugin frontends are rejected for Preview

Loading plugin JavaScript into a privileged local control plane creates an
unreviewed code execution and supply-chain surface, frontend dependency
conflicts, incompatible design systems, and version coupling with the Host.
Python plugins are already trusted local code, but that does not make injecting
their scripts into a browser origin harmless. The browser origin may hold API
credentials and terminal access. A future isolated iframe/extension protocol
can be considered only after a real plugin cannot fit the bounded data model.

## Target deployment graph

### WSL/local browser deployment

```text
Windows browser
  http://127.0.0.1:<ephemeral-or-configured-port>
                         |
                  WSL localhost forwarding
                         |
Ubuntu WSL distribution |
  agent-box serve -------+
    single Host process / one AGENT_BOX_HOME lock
    same-origin static Web assets
    HTTP command/query API
    Core-event stream
    terminal broker
    application services
    extension registry
    SQLite + Host draft/operation files
                         |
       +-----------------+-------------------+
       |                 |                   |
  harness plugin     tmux plugin       resource plugins
       |                 |                   |
  Codex/OpenCode/Pi  native panes     Git/cc-switch/etc.
```

Each WSL distribution has its own Agent-Box installation, home, database,
plugins, binaries, and native identities. The Web server inside one distro must
not attempt to administer other distros.

### Future desktop deployment

```text
Agent-Box Desktop on Windows
  WSL distribution picker
  `wsl.exe -d <name> -- agent-box serve --stdio-ready ...`
  readiness/auth bootstrap
  WebView -> same Host URL and same Web bundle
```

The Host should emit one structured readiness record containing protocol
version, PID, bind address, port, environment identity, and a one-time auth
bootstrap value. Desktop reconnects to an existing compatible Host rather than
silently starting a second writer.

## Data and process layout

A possible Host-owned layout is:

```text
$AGENT_BOX_HOME/
  agent-box.db                 existing Core store
  host/
    host.lock                  single writer/serve-instance lock
    host.json                  non-secret readiness metadata
    drafts/<execution>.json    Host-only, revisioned Binding drafts
    operations/<id>.json       bounded recoverable Host operation status
    logs/                      redacted service diagnostics
  plugins/<namespace>/         plugin-owned data, never Core-owned
```

Do not put the bearer token, credentials, terminal transcript, or secret
material in `host.json`, a Binding draft, operation JSON, Core event metadata,
or browser local storage. Plugin data directories remain namespaced by the
Plugin SDK.

The SQLite file does not need to move for this redesign. A risky storage
reorganization adds no Preview value. What must change is ownership: Web and
server code call application services; they do not query tables directly.

## Minimal API surface

The first API should be command-oriented and small, not a generic CRUD mirror
of every table or legacy GUI method.

### System and extension discovery

```text
GET  /api/v1/health
GET  /api/v1/environment
GET  /api/v1/plugins
GET  /api/v1/plugins/{id}
POST /api/v1/plugins/{id}/doctor
GET  /api/v1/providers/execution
GET  /api/v1/resource-inputs
```

`environment` reports only the current execution environment and installed
capabilities. Installing arbitrary system packages is not part of P0.

### Work and Execution queries/commands

```text
GET  /api/v1/works
POST /api/v1/works
GET  /api/v1/works/{work_id}
POST /api/v1/works/{work_id}/complete
POST /api/v1/works/{work_id}/reopen

POST /api/v1/works/{work_id}/executions
GET  /api/v1/executions/{execution_id}
GET  /api/v1/executions/{execution_id}/evidence
```

If standalone Execution is supported by the Core revision, expose it through a
separate command without inventing an invisible Work. The Preview Workbench may
still choose a Work-first navigation model.

### Binding preparation and Dispatch

```text
GET  /api/v1/executions/{id}/binding-draft
PUT  /api/v1/executions/{id}/binding-draft
POST /api/v1/resource-inputs/{adapter_id}/choices
POST /api/v1/resource-inputs/{adapter_id}/prepare
POST /api/v1/executions/{id}/freeze-dispatch
```

Draft updates carry an optimistic draft revision. `prepare` returns a candidate
exact Ref and readable requested/exact/assurance preview but writes no Core
fact. `freeze-dispatch` takes the reviewed draft revision and an idempotency
key, revalidates it, invokes the existing governed dispatch service, and
returns Dispatch/native correlation facts. It must not silently add plugin
resources after review.

### Active execution controls

```text
POST /api/v1/executions/{id}/observe
POST /api/v1/executions/{id}/recover
POST /api/v1/executions/{id}/finish
POST /api/v1/executions/{id}/attach-tickets
GET  /api/v1/operations/{operation_id}
```

These commands dispatch to the selected ExecutionProvider's Host control
adapter. `FINALIZING`, progress percentage, and operation logs are Host facts;
only resulting projection, refs, observations, and evidence go to Core.

### Event and terminal streams

```text
GET /api/v1/events?after=<cursor>       SSE initially, or WebSocket
WS  /api/v1/terminals/{one_time_ticket}
```

The fact stream should use existing committed Core events and a monotonic
database cursor. On reconnect the client obtains a snapshot and resumes after
the cursor. Polling the event ledger behind the server is acceptable for
Preview; a new message bus or tracing backend is not.

Terminal bytes are not Core events and must use a separate authenticated
stream. A one-time, short-lived ticket binds the stream to an authorized
Execution/native attach target.

## Terminal and tmux attach design

Sandbox, harness, and console are orthogonal. The Web Host should not collapse
them merely because all appear during Launch.

For Preview, the least risky path remains:

1. the provider starts the real harness in a frozen tmux pane resource;
2. the Workbench shows native session and pane identities;
3. Attach either presents/copies an exact provider-owned tmux command or, when
   launched from the future desktop shell, asks the shell to open Windows
   Terminal;
4. the user interacts in the real terminal;
5. explicit Finish occurs in the Workbench.

An embedded xterm.js terminal is P1, not a prerequisite for the Web control
boundary. When implemented, the Host terminal broker must:

* accept only a typed attach target produced by the provider control adapter;
* allocate and resize a PTY server-side;
* never concatenate user input into a shell command;
* authenticate the socket and expire one-time tickets;
* impose byte/rate/backpressure limits;
* avoid persisting terminal bytes as Core evidence;
* distinguish disconnection from process exit and Execution finish.

Using tmux makes multiple attach/reconnect practical, but tmux is still a
resource. The Web server must not make tmux a required Core or Host dependency.

## Security boundary

“Localhost only” is necessary but insufficient. A malicious webpage can make
requests to local services, and a browser terminal/control API is materially
dangerous.

P0 safeguards:

* bind to `127.0.0.1` by default; remote binding requires an explicit unsafe or
  authenticated deployment mode not used by Preview;
* serve UI and API from one origin;
* generate a per-Host secret with restrictive filesystem permissions;
* use an explicit one-time bootstrap exchange followed by a SameSite=Strict,
  HttpOnly session cookie;
* validate `Origin` on every state-changing HTTP request and WebSocket upgrade;
* use CSRF tokens for mutating requests;
* require idempotency keys for launch/finish commands;
* never expose secret values in GET responses, diagnostics, Web events, logs,
  Binding previews, or evidence;
* validate plugin-returned descriptors and cap choice/result sizes;
* time out/cancel plugin choice and doctor calls;
* prohibit arbitrary shell/SQL/frontend contributions;
* maintain a single Host instance lock for one `AGENT_BOX_HOME`.

If remote access is later supported, it is a different threat model requiring
TLS, user authentication, authorization, audit of terminal access, and explicit
network policy. Do not make “bind `0.0.0.0`” the remote mode.

## CLI, TUI, and Web relationship

### Desired end state

There is one semantic application interface and several clients:

```text
Web Workbench      normal human observe/control/configuration
CLI                automation, diagnostics, daemon lifecycle, headless commands
WorkBoard TUI      transitional/fallback inspector and compact operator client
Desktop shell      environment selection and WebView only
```

The CLI must not retain a parallel direct-launch path. Headless launch should
invoke the same create/draft/freeze/dispatch application command, either
in-process with the Host lock protocol or through the running Host API.

### Avoiding two control planes during migration

WorkBoard may remain available while the Web UI is built, but permanent dual
mutation paths are unacceptable. The migration rules should be:

* while the Web Host is incomplete, WorkBoard remains the Preview control
  client;
* once Host application services exist, WorkBoard is adapted to call them
  in-process rather than owning divergent orchestration;
* when `agent-box serve` owns the home lock, other local clients send commands
  to it; they do not start a second provider action against the same Execution;
* during a rehearsal, one control client is designated; another client may be
  read-only;
* Core idempotency and terminal sealing remain the last defense, not the UI
  coordination mechanism.

After Web parity, the legacy profile TUI and REPL should be deprecated. A small
TUI inspector may survive because it is useful over SSH and in failure
recovery, but it must not remain a second product architecture.

## Migration map

| Current area | Transitional use | Target owner | Final action |
|---|---|---|---|
| `work_core/` | Keep stable | Work Core | Keep; no Web semantics added |
| WorkBoard controller/read model | Reference behavior | `application/` | Extract/generalize |
| WorkBoard selector/control adapters | Compatibility entry points | Host-facing Plugin SDK | Promote a bounded version, retain adapters |
| WorkBoard Textual UI | Preview fallback | optional TUI client | Thin or retire after Web parity |
| `gui-web/src` visual system | Reuse selected components | Web Workbench | Replace old data/domain assumptions incrementally |
| `gui-web/bridge.py` | Temporary old GUI only | none | Delete after Host API cutover |
| `data_linux.py`/`data_wsl.py`/`rpc_server.py` | Audit source for features | Host + plugins + desktop shell | Do not migrate wholesale; delete |
| legacy profile/resource code | Source for driver migration | harness plugin | Delete after profile migration |
| `launch.py` hardcoded bwrap launch | Compatibility fallback | harness + sandbox plugins | Retire governed-bypass path |
| legacy sessions store | Migration source | native SessionRefs/Core facts + plugin state | Import/retire, do not mirror indefinitely |
| `adapters/acs.py` and direct ACS GUI code | Schema knowledge source | cc-switch bridge plugin | Remove Host/Web direct dependency |
| `core/agent_types.json` | Driver migration source | harness plugin driver descriptors | Remove after all supported drivers migrate |
| installer/update code in GUI | Keep out of P0 | packaging/desktop later | Do not port into Host API now |

## Migration stages

### Stage 0 — Freeze boundaries and keep Preview runnable

* Declare WorkBoard the current Preview control path.
* Freeze new feature work in the legacy GUI/REPL/profile launcher.
* Record the exact legacy functions required by harness and cc-switch plugins.
* Do not delete working bwrap/profile/ACS code yet.

Exit: current Preview tests remain green and no new GUI feature lands on the
bridge/data layer.

### Stage 1 — Extract application services

* Create application read models and commands based on WorkBoard controller and
  model behavior.
* Move Binding draft/operation storage behind application interfaces.
* Build catalogs over the extension registry and existing adapters.
* Keep Core unchanged.
* Make WorkBoard use these services or a compatibility facade.

Exit: application-level tests can complete create -> prepare -> freeze/dispatch
-> observe/finish without importing Textual or product-specific plugins.

### Stage 2 — Read-only Host and Web skeleton

* Add `agent-box serve` with loopback authentication, static asset serving,
  Host lock, health, plugin/provider, Work/Execution, and evidence endpoints.
* Add snapshot plus committed-event streaming.
* Build Work/Execution history, plugin status, Binding facts, and evidence
  screens.

Exit: Web facts match WorkBoard for the same database, including unknown and
conflicting observations.

### Stage 3 — Binding Composer and governed controls

* Expose dynamic selector/prepare through bounded adapter APIs.
* Add server-owned revisioned Binding drafts.
* Add Freeze & Launch with idempotency and explicit review.
* Add observe/recover/finish operations and operation status.
* Initially expose native tmux attach instructions rather than embedding PTY.

Exit: one real external plugin Execution can be created and finished entirely
through Web + native terminal, without preview scripts or legacy launch.

### Stage 4 — Official harness and cc-switch plugin migration

* Move profile/harness config and session handling into the official harness
  plugin.
* Move cc-switch read-only catalog/schema behavior into its bridge plugin.
* Build generic plugin configuration plus the bounded first-party Harness page.
* Keep secrets opaque.

Exit: Web has no imports, types, or conditionals for cc-switch tables or
individual harness config directories.

### Stage 5 — Cut over and clean legacy control planes

* Make `agent-box` a help/status entry and `agent-box serve` the normal local
  workbench command.
* Deprecate/remove old PyWebView bridge, WSL per-call RPC, direct-launch profile
  GUI, and duplicate legacy TUI/REPL mutation paths.
* Keep a thin TUI inspector only if it proves useful.
* Archive/import legacy profiles and sessions explicitly rather than reading
  two stores forever.

Exit: all mutations use one application boundary and one Host instance owns
interactive operations.

### Stage 6 — Optional desktop and browser terminal

* Build WSL selection/readiness/reconnect shell.
* Embed the same Web bundle.
* Add native Windows Terminal launch; add browser PTY only after threat-model
  and reconnect tests pass.

Exit: closing the desktop window does not terminate or corrupt Host,
Execution, sandbox, tmux, or harness lifecycles; reconnect shows the same facts.

## Active attack on the Web proposal

### Objection 1: this is a Preview-killing rewrite

This is the strongest objection. The existing WorkBoard already performs the
demo's important control flow. A Web server, authentication, React pages,
streaming, and WSL deployment can consume the entire schedule without proving
new Core value.

Response: Web P0 must be strictly a second client over extracted application
services, not a full replacement. The Preview can still ship with WorkBoard if
Stage 3 misses its deadline. Do not block the provider vertical slice on a
browser terminal, desktop packaging, profile editor parity, or installers.

### Objection 2: Web creates a permanent double control plane

If Web calls Host API while WorkBoard/CLI continue direct repository/provider
mutations, race conditions and ambiguous responsibility become more likely,
not less. SQLite serialization does not prevent two `start()` calls or stale
draft decisions.

Response: introduce the application boundary before Web mutation. Use the Host
lock and route clients to the running Host. Core idempotency helps but cannot be
the only coordination mechanism. If this routing is not accepted, do not add
mutating Web endpoints.

### Objection 3: browser terminal turns a local inspector into a shell RCE API

A terminal WebSocket, filesystem editor, plugin-provided commands, and
credential configuration under one localhost origin create a high-impact
attack surface. Localhost is reachable from hostile browser contexts unless
defended.

Response: omit embedded terminal from P0, use typed attach tickets, same-origin
auth, Origin/CSRF checks, no arbitrary command input, and no arbitrary plugin
frontend. If those controls feel excessive, that is evidence that Windows
Terminal/tmux attach is the correct Preview surface.

### Objection 4: a browser cannot naturally choose WSL environments

A Web app running inside one distro cannot reliably enumerate and manage other
WSL distributions without crossing into a Windows-side agent. Adding that to
the Host recreates the current bridge problem.

Response: environment selection belongs exclusively to the future desktop or a
small Windows launcher. Browser mode connects to an already-selected Host. Do
not model WSL in Core or make the WSL server call back into Windows for normal
operations.

### Objection 5: declarative plugin forms will be too weak

MCP editors, profile overlays, secret sources, connection testing, Git
selectors, and sandbox policy inspectors can exceed simple fields. An overly
generic schema becomes a bad low-code UI framework; hardcoded pages reintroduce
coupling.

Response: keep the generic surface deliberately bounded and build a small
number of stable first-party application protocols where real product need
exists. Do not solve hypothetical plugin UI. The first plugin that demonstrably
cannot fit provides the input for a version-2 extension design.

### Objection 6: old React code gives a false sense of reuse

The existing frontend is organized around profiles, agent types, ACS rows,
file editors, installers, and direct launching. Reusing every page would preserve
the old product architecture in TypeScript.

Response: reuse the design tokens, components, forms, i18n infrastructure, and
tests selectively. Build new Work/Execution/Binding/Evidence routes against the
Host API. Delete old domain pages only after migration; do not bend new API
contracts to satisfy them.

### Objection 7: service lifecycle and port/auth friction may be worse than TUI

Users can understand `agent-box-workboard WORK_ID`; a daemon, port, browser,
token, WSL forwarding, stale PID, and reconnect failures can feel heavier.

Response: `agent-box serve` must be one command, print a usable URL, recover a
stale lock safely, select an available port, and expose actionable health. The
desktop shell is justified only if it removes this friction without duplicating
the Host. If service startup remains unreliable, keep TUI as the primary local
client.

## Architectural invariants and non-goals

* A Web route is not a Core entity.
* Binding draft is Host state; frozen inputs are Core facts.
* Server operation progress is Host state; projection/outcome/observations are
  Core facts.
* Terminal stream is transport; SessionRef is the native identity.
* A disconnected browser, closed tmux pane, one harness turn, or process idle
  does not automatically complete an Execution.
* Plugins contribute typed capabilities/data/actions, not arbitrary frontend
  code.
* Host does not invent provider observations or claim resource consumption.
* Web/desktop does not own workflow progression.
* The redesign does not require a scheduler, message bus, tracing backend,
  sandbox platform, secret store, workflow builder, or plugin marketplace.

## Must-decide questions before implementation

1. **Preview cut line:** Is Web Stage 3 required for the Preview recording, or
   may WorkBoard remain the recording client while Web is an announced next
   surface? The schedule cannot honestly assume full Web parity plus provider
   migration plus rehearsal.
2. **Single-writer policy:** When `agent-box serve` is active, must CLI/TUI
   mutation route through it, or is concurrent in-process mutation allowed?
   The recommendation is mandatory routing for provider side effects.
3. **P0 attach:** Is copying/opening a native tmux attach command acceptable, or
   is embedded browser terminal a release requirement? The recommendation is
   native attach for P0.
4. **Plugin presentation ownership:** Should the current WorkBoard adapter
   protocol be promoted almost unchanged for P0, or replaced immediately by a
   public Host SDK? The recommendation is a compatibility facade first, then a
   small public protocol after one Web vertical slice.
5. **Official rich pages:** May the first-party Web bundle implement stable
   Harness-management views in addition to generic plugin forms? The
   recommendation is yes, provided those views depend only on a public
   harness-management API and disappear cleanly when unavailable.
6. **Legacy profiles/sessions:** Are they imported once into the harness plugin,
   or supported indefinitely in place? The recommendation is explicit import
   plus a time-bounded compatibility reader.
7. **cc-switch direction:** Is the bridge read-only and cc-switch authoritative?
   The recommendation is yes; no bidirectional synchronization in Preview.
8. **Deployment target:** Is one selected WSL distro per Host instance the
   supported Windows model? The recommendation is yes; multi-distro control is
   desktop-launcher territory.
9. **Framework choice:** Is adding a Python ASGI stack acceptable? FastAPI or a
   comparably small Starlette-based server is the practical choice, but the
   application DTOs must not become framework models.
10. **Old GUI scope:** Which old environment installation/update features are
    truly product requirements? The recommendation is to exclude all of them
    from the first Host API and handle packaging separately.

## Final recommendation

Adopt the local-first Web Host architecture, but treat it as a **control-plane
cleanup with a thin Web client**, not as a broad GUI rewrite. The decisive
sequence is:

```text
extract one application boundary
-> prove read parity with WorkBoard
-> expose governed Binding/Dispatch/Finish
-> migrate harness and cc-switch ownership into plugins
-> retire old control paths
-> add desktop shell and browser PTY only if still valuable
```

The best near-term success criterion is not “the desktop looks like ChatGPT.”
It is:

> A browser can create and review one provider-neutral Binding, invoke the same
> governed Dispatch as every other Host, attach to the real native harness, and
> later show reconciled Core facts—without importing a harness, tmux,
> cc-switch, or SQLite implementation into the Web/server layer.

If that vertical slice cannot be achieved without copying WorkBoard logic or
hardcoding plugin products into the server, the architecture is not ready for
a desktop shell and the project should keep WorkBoard as the operational client
until the application boundary is fixed.
