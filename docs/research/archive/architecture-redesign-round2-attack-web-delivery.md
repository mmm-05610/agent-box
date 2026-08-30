# Architecture Redesign Round 2: Attack on Web Host Delivery
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

Date: 2026-08-28

Perspective: delivery owner, first-time user, and local-control-plane security
auditor.

Scope: adversarial review of the Round-1 synthesis and the Core/plugin/Web
reports. This document deliberately does not defend the Round-1 Web proposal.

## Executive attack verdict

The Round-1 product boundary is credible. The proposed **Web delivery sequence
is not yet credible for Preview**.

The dangerous assumption is not React or HTTP. It is this sentence:

> Web, CLI, and transitional WorkBoard call the same application services, and
> one Host owns mutations.

Those two clauses do not follow from each other. Sharing Python functions does
not establish one operational owner. Today the CLI/TUI, WorkBoard, legacy GUI,
and preview scripts can all open the same SQLite database and invoke effects in
their own processes. Adding `agent-box serve` creates one more controller. A
file lock helps only after every old path agrees to honor it. SQLite uniqueness
can prevent a second Dispatch row, but it cannot generally prevent duplicated
observe/finish/recover effects, stale drafts, native attach races, or two
different processes holding incompatible provider state.

The second weak assumption is that a Web Workbench without an embedded terminal
has enough incremental Preview value to justify authentication, process
lifecycle, WSL networking, a new API, React routes, and migration risk. It may
be a good post-Preview product surface. For the current Preview it duplicates
the working WorkBoard flow and then sends the user back to tmux for the moment
that matters most.

The third weak assumption is that bounded selector/settings/action descriptors
avoid becoming a frontend platform. Selectors are justified by Binding.
Generic plugin settings, health actions, rich profile management, file pickers,
secret sources, install/update operations, and terminal actions together are
already a low-code control-plane framework. It will either be too weak for the
official harness plugin or expand until the Host SDK is larger and less stable
than the plugins it was meant to isolate.

The recommended delivery correction is:

1. **Keep WorkBoard as the only mutating Preview Host.**
2. Build the outer-ring application/Host extension boundary only as needed by
   the official harness plugin vertical slice.
3. If a Web artifact is needed for visual validation, make it read-only and
   polling-based: Work/Execution/Binding/Evidence/plugin status. Do not launch,
   finish, edit plugin settings, stream terminals, or own provider handles.
4. Do not delete the legacy GUI until each capability is explicitly retired,
   migrated, or assigned to an external product. “Architecturally impure” is
   not a migration plan.
5. After the Preview, choose one permanent mutation topology: either a daemon
   owns all mutations and every client talks to it, or each command is an
   embedded one-shot Host with an explicit exclusive operation lease. Do not
   promise both.

This attack does not require reopening Work Core ontology. It does require
deleting or postponing a large part of the Round-1 Web scope.

## Claims under attack

### Claim A: local Web Host is a controlled strangler migration

It is controlled only if the old and new control paths share a single
side-effect owner. They currently do not. The proposed sequence creates a
period where:

```text
legacy GUI -> direct legacy launch
WorkBoard  -> Core services + provider control adapter
CLI/REPL   -> direct library commands
Web        -> new application/server
scripts    -> direct repository/services/providers
```

All can exist against one `AGENT_BOX_HOME`. Calling this a strangler does not
make traffic automatically pass through the new boundary.

### Claim B: Web, CLI, and TUI can share one application layer

They can share DTOs and use-case code. They cannot safely share live provider
handles, locks, PTYs, operation progress, plugin registries, and recovery state
while running in separate processes unless one of these is true:

1. one daemon owns effects and the other clients are remote clients; or
2. provider operations are entirely reconstructible and idempotent, and every
   process acquires a common durable lease before acting.

Neither condition is currently true across all providers. Existing
`ExecutionControlAdapter` behavior is provider-specific, and WorkBoard's
operation state is Host-local. A sync Python application facade does not solve
the distributed ownership problem.

### Claim C: loopback Web security is a bounded addition

The moment Web can launch a harness, modify profiles, invoke plugin actions,
read filesystem choices, or bridge a terminal, it is a local code-execution
control plane. Loopback does not remove:

* cross-site requests to localhost;
* DNS rebinding/Host-header abuse;
* leaked bootstrap tokens in URLs, logs, browser history, screenshots, or
  referrers;
* WebSocket origin bypasses;
* malicious or merely buggy installed plugins invoked remotely through the
  browser;
* WSL-to-Windows forwarding behavior differing by networking mode, VPN, and
  firewall;
* stale Host processes and multiple Agent-Box versions.

The security work is not impossible. It is simply not free, and none of it
proves Binding/Dispatch/Evidence.

### Claim D: declarative plugin UI avoids product coupling

A field/choice/prepare adapter is a useful Binding selector. The Round-1 scope
then adds settings, diagnostics, typed actions, profile management, dynamic
search, secret fields, path selectors, install status, attach, and rich
first-party pages. This is two UI systems:

* a generic plugin form/action platform for third parties;
* a privileged first-party frontend API for the official harness plugin.

The distinction may be justified later. It is not a small Preview SDK.

### Claim E: native tmux attach is enough while Web owns control

It is enough for an operator who already understands Agent-Box, tmux, WSL, and
the distinction between a browser action and a native harness responsibility
window. It is poor first-use continuity:

```text
open browser
-> configure Binding
-> click Launch
-> copy/open tmux command
-> find terminal pane
-> interact
-> remember to return to browser
-> click Finish
```

WorkBoard already lives beside the terminal and can suspend/attach/recover in a
single terminal workflow. Without browser terminal or desktop-native attach,
the Web route risks being a more expensive and less coherent client.

## Failure scenario ledger

| ID | Scenario | Severity | Why current proposal does not contain it | Minimum containment |
| --- | --- | --- | --- | --- |
| W1 | Web and WorkBoard both act on one active Execution; one finishes while the other observes/recovers using stale facts. | Critical | Same application code does not coordinate separate processes; Core terminal sealing does not undo native duplicate effects. | One designated mutating Host. Other clients read-only or proxy to it. |
| W2 | Host crashes after native provider start but before Dispatch accepted is recorded. User restarts Web and sees `requested`/ambiguous with no live handle. | Critical | Core truthfully records ambiguity, but generic Web recovery cannot reconstruct every provider. | Preview supports only providers with tested fact-based recover; show blocked ambiguity, never blind retry. |
| W3 | Two `agent-box serve` processes start against the same home due to stale PID/WSL restart. | High | File locks and PID files have cross-process/stale semantics that are not yet implemented; Windows launcher may start another distro/version. | OS advisory lock held for process lifetime plus compatibility handshake; refuse second mutating Host. |
| W4 | A hostile webpage triggers localhost launch/finish or probes plugin/resource endpoints. | Critical | Loopback binding alone is not authentication; permissive CORS is not the only attack route. | Same-origin assets, no CORS, random bootstrap secret, HttpOnly session, CSRF and Origin/Host validation. Or keep Web read-only. |
| W5 | Bootstrap token appears in query string/browser history/OBS recording and gives terminal/launch authority. | Critical | “One-time token” is underspecified; Preview is explicitly recorded. | Never put reusable token in query/log. One-time fragment exchange, immediate history cleanup, short session, no terminal authority in P0. |
| W6 | Plugin `choices()` blocks, reads secret config, makes network calls, or mutates state when a browser opens a form. | High | Declarative output does not sandbox Python plugin execution; cancellation cannot kill arbitrary in-process code. | Trusted-plugin model stated explicitly; run calls in bounded worker/process, timeout/result caps; no automatic choice calls for secret sources. |
| W7 | Official harness profile editor cannot express nested Codex/OpenCode/Pi settings in generic fields; raw file editor is reintroduced. | High | Bounded schema is intentionally weak; rich first-party page creates a parallel contract. | Preview supports select/import/validate existing profiles, not full editing. Design rich management post-vertical-slice. |
| W8 | User launches from Web, but WSL localhost forwarding fails under VPN/mirrored/NAT mode or server binds the wrong interface. | High | `127.0.0.1` inside WSL is not a universal Windows discovery/lifecycle protocol. | Preview starts browser from WSL and tests target environment; keep WorkBoard fallback. Desktop/Windows launcher later. |
| W9 | Browser closes or refreshes during Launch/Finalizing; server loses ephemeral operation progress/provider handle. | High | Host operations are proposed but not yet durable or reconstructible. | Operation identity and provider recovery must exist before mutating Web; otherwise prevent/label nonrecoverable operations. |
| W10 | User installs/uninstalls a plugin while Host registry is alive; Web shows stale driver/provider/selector state. | Medium | Plugin loader is process-local and no reload lifecycle is specified. | P0 requires Host restart after package changes; display registry generation and restart-required status. |
| W11 | One WSL distribution's desktop shell connects to another distribution's port/token or wrong Agent-Box version. | High | Port is not environment identity. Multiple distros can each own separate homes and servers. | Structured readiness handshake with distro/install/home/protocol identity; desktop is postponed until this exists. |
| W12 | Browser file/path picker exposes broad WSL filesystem or accepts unsafe path; Windows-native picker returns a path the WSL Host cannot use. | High | Current GUI has platform conversion code; generic Web path fields lose that behavior. | P0 repository choices are server-scoped to configured roots; no arbitrary browser filesystem management. |
| W13 | Web evidence page renders plugin-provided metadata/detail containing scriptable or huge content. | High | “Structured data” still needs output encoding, size bounds, and content policy. | Text-only escaped rendering, CSP, metadata/artifact size caps, explicit download types. |
| W14 | Web launches correctly but first-time user cannot install/configure Codex, Node, cc-switch dependencies, or WSL prerequisites after old environment page is removed. | High | Round-1 excludes installers but also schedules old GUI deletion. | Keep old environment tooling frozen or replace with doctor + exact manual guidance before deletion. |
| W15 | Provider action returns an argv tuple; server treats it as safe and exposes arbitrary shell via terminal/attach API. | Critical | Typed tuple is not authorization or command safety. Plugins are trusted code, but browser-triggered execution expands exposure. | P0 Web does not execute attach argv. Native operator runs/copies it; later broker uses capability-specific launchers, no shell. |
| W16 | Browser polling/event tail reports a newer Core fact while local draft is based on older provider requirements/registry generation. | Medium | Core version and Host draft revision do not cover plugin registry/schema changes. | Draft pins provider descriptor/input schema generation; force re-review on drift. |
| W17 | Old GUI and new harness plugin both mutate the same profile directories with incompatible isolation semantics. | Critical | “Migrate then delete” creates an interval with two authorities over profile content. | New plugin imports/copies into a namespaced store; no shared writable legacy directory. Mark legacy profile read-only after import. |
| W18 | Read-only Web grows into plugin/config manager before any external plugin vertical slice proves the Host protocol. | High | Product desire, not architecture, drives fields/actions. | Gate new UI primitives on two real consumers; Preview Web, if any, is fact inspector only. |

## Delivery analysis

### The actual critical path

The Preview's differentiating path is:

```text
third-party/official provider discovered
-> exact resource candidates prepared
-> Binding reviewed and frozen
-> accountable provider starts a real harness
-> native SessionRef captured
-> explicit Finish
-> observations/evidence reconciled
```

The current WorkBoard already supplies a human control surface for much of this.
The current blockers identified in Round 1 are lower-level:

* exact Ref/value pairing in `ExecutionStartRequest`;
* hidden side effects in `ResourceProvider.resolve()`;
* candidate input bundle expansion;
* plugin dependency/load topology;
* official harness plugin migration and driver isolation.

A Web server solves none of those. Starting it before the provider vertical
slice increases the number of moving parts while the underlying invocation
contract remains unsettled.

### Realistic schedule cost

Even a “minimal” mutating local Web Host requires:

* application/query extraction from WorkBoard;
* an HTTP framework and serialization model;
* static asset build/packaging;
* one-instance process lifecycle;
* authentication/CSRF/origin/Host policy;
* draft concurrency/idempotency behavior;
* plugin call timeouts and error surfaces;
* operation recovery semantics;
* WSL networking validation;
* React Work/Execution/Binding/Evidence pages;
* migration tests proving Web and WorkBoard fact parity;
* first-use documentation and failure recovery.

This is a product increment, not a shell around existing functions. It should
not share the same short critical path as the official harness plugin and
Preview rehearsal.

## Is one shared application layer realistic?

### What can be shared now

The following can and should become reusable in-process services:

* provider/resource catalogs;
* Work/Execution read models;
* Binding draft validation;
* selector `choices/prepare` calls;
* exact input review DTOs;
* Core command wrappers;
* evidence reconciliation read models;
* action availability calculation.

### What cannot be shared merely by importing a module

The following require an operational owner, not only common code:

* provider start/finish/recover calls;
* live native handles;
* PTY ownership and resize/input stream;
* long operation state;
* plugin registry generation/reload;
* process-wide locks;
* secret-bearing resolved values;
* compensation/cleanup after partial failure.

### Forced topology choice

The design must choose one permanent topology.

#### Topology 1 — daemon owner

```text
Web/CLI/TUI -> HTTP/local socket -> one Host daemon -> Core/providers
```

Benefits: one provider registry, one operation owner, natural Web support.
Costs: daemon lifecycle, auth, version negotiation, offline/SSH complexity,
every client becomes a remote client.

#### Topology 2 — one-shot embedded owner

```text
one CLI/TUI process -> application services -> Core/providers
```

Benefits: simple local trust/lifecycle, matches WorkBoard today.
Costs: no persistent Web server, live operations must be native/recoverable,
concurrent callers need durable leases, desktop is less natural.

Round 1 tries to combine both by saying clients share application services
while one Host owns mutations. That combination needs an explicit rule:

> When daemon mode is active, every mutating client is a daemon client; no
> client imports and invokes provider effects locally.

Until CLI and WorkBoard are converted to that rule, the Web Host must remain
read-only or isolated to a separate demo home.

## Security attack in detail

### Local plugin trust does not eliminate Web risk

Installed Python plugins are already trusted local code. This means a Plugin
SDK cannot sandbox a malicious plugin. It does **not** mean any webpage should
be allowed to trigger that trusted code. Web exposure changes the attacker from
“can install a Python package” to “can cause the user's browser to call a local
service.”

Therefore:

* `choices`, `prepare`, `doctor`, settings updates, attach, and finish are all
  privileged actions even when their result shape is declarative;
* GET endpoints must not cause plugin effects;
* dynamic discovery should be explicit and rate limited;
* browser API responses must never include credential values or raw resolved
  Contract objects;
* plugin detail strings must be escaped, bounded, and treated as untrusted
  display data;
* no arbitrary CORS origins;
* WebSockets need the same Origin/auth policy as HTTP.

### Minimal secure local session is still nontrivial

A viable mutating local server needs at minimum:

1. bind only loopback and reject unexpected Host headers;
2. serve assets and API same-origin;
3. launch with a high-entropy one-time bootstrap secret;
4. exchange it for a short Host session without persisting the secret in URL
   query/history/logs;
5. use HttpOnly/SameSite cookies and CSRF tokens;
6. validate Origin on mutations and socket upgrades;
7. expire sessions when Host restarts;
8. add CSP including `frame-ancestors 'none'`;
9. never place reusable auth on OBS-visible screens or attach commands.

If the project will not implement and test these, it should not expose mutating
or terminal endpoints in Preview.

### Read-only is safer but not automatically safe

Work objectives, prompts, paths, native IDs, evidence, and plugin metadata can
still be sensitive. A read-only Web server needs auth and origin controls unless
the data is deliberately public. However its compromise cannot start agents or
write credentials, so severity and test scope are materially smaller.

## Plugin selector/action platform attack

### Keep only what Binding actually needs

Binding requires:

```text
field/choice collection
-> exact Ref preparation
-> candidate bundle preview
```

That is a defensible Host extension. The following are separate product
features and should not be smuggled into the same P0 protocol:

* arbitrary plugin settings CRUD;
* nested configuration editors;
* package/system installers;
* long-running plugin jobs;
* custom dashboards;
* raw filesystem editors;
* arbitrary commands;
* embedded plugin frontend bundles.

### Typed actions are not a security boundary

An action named `finish` can still execute arbitrary Python. An argv tuple can
still invoke a shell. A `secret=True` field can still be copied into Ref
metadata by a buggy plugin. Declarative descriptors improve UI consistency and
validation; they do not establish plugin isolation or permission.

The truthful P0 model is:

> Plugins are trusted local code. Host adapters provide a bounded compatibility
> contract and protect the user from accidental UI coupling, not from a
> malicious plugin.

### Rich official Harness UI should wait

For Preview, users already have named profiles. The official harness plugin
needs:

* list/select profile;
* inspect redacted declaration/revision/driver health;
* import legacy profile;
* validate materialization;
* use the profile in a Binding.

It does not yet need a browser editor for every Codex/OpenCode/Pi setting. Build
that only after the layered profile model and two drivers are proven. Otherwise
the old GUI's per-harness complexity will be recreated before its ownership is
settled.

## Does Web have value without browser terminal?

### Genuine value

Web can present Binding comparison and evidence history better than a terminal
TUI. It also supports shareable read-only audit views and future desktop reuse.

### Why that may not justify Preview mutation

The principal Preview moment is a user selecting resources and seeing a real
harness start with correct context. If Web then says “run this tmux command,”
the experience fragments. The user must return to Web for Finish, and losing
the browser or terminal can create uncertainty about responsibility state.

The minimum coherent alternatives are:

1. **WorkBoard + tmux for Preview**: one terminal-oriented workflow, already
   close to working.
2. **Read-only Web inspector + WorkBoard control**: browser improves history and
   evidence visuals but does not claim to be the controller.
3. **Desktop/Web + embedded/native terminal integration**: coherent but too
   large for the current critical path.

The weakest alternative is the Round-1 middle ground: mutating Web control with
manual terminal handoff and a second mutating fallback UI.

## Can the strangler cross the double-control stage?

Only with explicit gates.

### Unsafe crossing

```text
Web mutations added
while WorkBoard/CLI/legacy GUI/scripts still mutate directly
then “eventually” migrate them
```

This is not acceptable because the most dangerous period is also the period
with the least test coverage and most schema/plugin churn.

### Safe crossing A — read-only Web first

```text
WorkBoard remains sole mutating Host
Web reads Core facts only
official harness plugin vertical slice completes
daemon ownership is designed/tested
all mutating clients switch in one release boundary
```

This is the recommended Preview path.

### Safe crossing B — separate home

Run experimental Web mutation against a separate `AGENT_BOX_HOME` and do not
claim compatibility with the live WorkBoard home. This is suitable for API/UI
development but not the final demo.

### Safe crossing C — daemon cutover first

Build the Host daemon, convert WorkBoard and CLI to clients, then add Web
mutations. This is architecturally clean but too large for the current Preview
unless all other product work stops.

## Old GUI capability deletion audit

The old GUI is architecturally coupled, but several capabilities cannot simply
be deleted without changing the product promise.

| Legacy capability | Can delete now? | Reason / target |
| --- | --- | --- |
| Direct profile launch bypassing Binding | Yes after harness vertical slice | It violates the new governed path; retain only until replacement launches real harness reliably. |
| Profile list/create/edit/delete | No | Official harness plugin needs at least import/list/inspect/validate. Full edit may be postponed, not silently removed. |
| Per-harness nested config editors | Postpone/retain frozen | Generic forms are not parity. Decide whether config files or external tools become authoritative before deletion. |
| Provider/model endpoint forms and speed tests | No blanket deletion | They may move to cc-switch/external catalog or harness plugin diagnostics. Users still need a way to configure and verify endpoints. |
| MCP/skills/prompts catalog browsing/apply | No blanket deletion | New model changes “copy/apply” to explicit capability Refs, but discovery/selection remains necessary. cc-switch bridge covers only supported sources. |
| cc-switch binary launch/dependency install | Can leave Agent-Box only if cc-switch becomes independently managed | A read-only bridge does not replace onboarding/opening the external app. Documentation or desktop integration is required. |
| Binary detection and driver health | Must keep | Official harness plugin requires per-driver doctor/readiness. |
| One-click binary/system installers | May postpone, not claim parity | Replace with exact doctor guidance first. System package installation through Web is high risk. |
| Session list/cleanup | Partly keep | Native SessionRefs/history move to governed executions; orphan runtime/profile cleanup still needs plugin-owned diagnostics/actions. |
| File tree/raw config editor | Prefer remove from core product | Keep files externally editable; do not build a generic privileged browser file manager. |
| Windows folder picker/path conversion | Cannot reproduce in pure browser | Use configured WSL repository roots in P0; future desktop owns native picker/conversion. |
| Application update download/install | Postpone to packaging/desktop | Not Host API responsibility, but deletion requires a documented update path. |
| Environment/setup page | Must retain a reduced replacement | First-time users need WSL, Python, plugin, harness, tmux/console, and connection health guidance. |
| i18n/design system/frontend tests | Reusable | These are implementation assets, not old product semantics. |

The migration inventory must classify every legacy capability as **migrated,
externalized, explicitly dropped, or retained temporarily**. “Delete after Web
parity” is meaningless unless parity is defined capability by capability.

## Minimum viable alternatives

### Alternative 1 — Preview-first, no Web mutation (recommended)

```text
Core invariants
-> Host extension bundle preparation
-> official harness plugin (Codex + one second driver)
-> WorkBoard as sole mutating Host
-> tmux native interaction
-> evidence reconciliation
-> optional read-only Web history/evidence page
```

Benefits:

* proves the product center;
* avoids daemon/security/WSL lifecycle critical path;
* no new double-control plane;
* keeps browser-terminal decision open;
* gives Web design real plugin/application DTOs later.

Cost: the Preview remains terminal-oriented and does not demonstrate the future
management UI.

### Alternative 2 — Read-only Web inspector

Expose only health, installed plugin/provider descriptors, Works, Executions,
Binding facts, native/output refs, and observations/evidence. Use polling rather
than SSE/WebSocket. No drafts, prepare calls, plugin actions, launch, finish,
settings, terminal, or file access.

Benefits: visual demo value, low side-effect risk, validates serialization and
React information architecture.

Cost: two UIs are visible; it must be labeled inspector, not unified control
plane.

### Alternative 3 — Commit to daemon-first architecture

Stop Preview feature work, build one Host daemon and convert CLI/WorkBoard to
clients before building Web mutation.

Benefits: clean long-term control ownership.

Cost: likely Preview delay; plugin/provider work competes with infrastructure;
users lose simple embedded use unless local socket/library mode is designed.

### Rejected alternative — Web mutates while old clients remain direct

This offers fast screenshots but creates an untestable operational model and
incentivizes keeping compatibility paths forever. Reject.

## Scope to delete, defer, or retain

### Delete from the current Preview plan

* desktop shell;
* browser PTY/xterm bridge;
* remote access mode;
* generic plugin settings platform;
* arbitrary path/file editor;
* system/binary installation through Web;
* live plugin reload;
* Web-owned long provider operations;
* full old GUI parity;
* permanent simultaneous Web/CLI/TUI mutation.

### Defer until after official plugin vertical slice

* mutating Host daemon;
* Web Binding Composer;
* profile creation/edit UI;
* rich official harness management pages;
* desktop WSL picker and native attach;
* browser terminal;
* SSE/WebSocket Core event streaming (polling is enough initially);
* plugin settings/action SDK beyond Binding selector and provider control;
* legacy GUI deletion.

### Keep for Preview

* WorkBoard observe/control;
* current tmux native interaction;
* Core fact/evidence read models;
* small Host extension protocol for selector/prepare bundle and provider
  controls;
* official harness plugin and per-driver doctor;
* existing legacy setup/config tools, frozen and clearly labeled, until their
  successor is proven;
* optional static/read-only Web inspector if it does not delay the vertical
  slice.

## Decision gates

### Gate 1 — provider vertical slice before Web mutation

Required proof:

```text
official profile selected
-> exact candidate bundle visible
-> Core freezes individual refs
-> Codex launches through official provider
-> SessionRef and observations recorded
-> explicit Finish
-> second driver reuses the pipeline
```

If this is not green, Web work stops.

### Gate 2 — operational ownership choice

Write and test one rule:

* daemon owns every mutation; or
* one-shot Host owns an exclusively leased operation.

If neither is chosen, Web remains read-only.

### Gate 3 — security acceptance

Before Web mutation, tests must cover hostile Origin, unexpected Host header,
missing/expired session, CSRF, WebSocket auth if present, token nonlogging,
output escaping, and no secret values in responses.

### Gate 4 — first-use continuity

A new user must complete launch -> native interaction -> Finish without knowing
which backend module, pane command, or WSL path conversion to invoke. If manual
handoff takes more steps than WorkBoard, Web is not the primary controller.

### Gate 5 — legacy capability disposition

Every old GUI capability in the audit table has a named target or explicit
drop decision. No deletion based only on package location.

## Strongest counterarguments to this attack

### “The Web UI is essential to show product value”

Binding and evidence are easier to understand visually, and a TUI limits
adoption. True. That supports a read-only Web inspector or a later coherent Web
controller. It does not prove the safe middle ground of Web mutations plus
manual terminal plus mutating TUI fallback.

### “Core uniqueness already prevents duplicate Dispatch”

It protects the one-Dispatch invariant. It does not coordinate drafts,
provider handles, observe/recover/finish side effects, plugin registry versions,
terminal ownership, or cleanup.

### “Plugins are installed code, so browser security adds little”

Installation is a deliberate local authority grant. A hostile site reaching a
loopback API is not. Browser exposure lowers the bar for triggering trusted
code and reading sensitive facts.

### “A desktop shell will solve WSL and attach friction”

It may, but then desktop process lifecycle, WSL discovery, readiness/version
handshake, token exchange, native terminal launch, installer, signing, and
updates become required. That confirms it is a later product layer, not a
Preview shortcut.

## Final adversarial verdict

**The local Web Host is a plausible long-term architecture but a likely Preview
killer in the Round-1 scope.** The safe migration is not “build Web read-only,
then gradually let it mutate while old clients still work.” The safe migration
is:

```text
one existing mutating Host (WorkBoard)
-> prove official plugin and outer-ring contracts
-> decide daemon vs one-shot operation ownership
-> cut mutating clients to that owner
-> only then add Web mutation
```

For the current delivery window, the recommended product shape is:

```text
WorkBoard = control
native tmux/harness = interaction
optional Web = read-only Binding/Evidence presentation
```

The minimum replacement for the old GUI is **not** a generic Web plugin
platform. It is:

```text
plugin doctor + profile import/list/validate + Binding selector
```

Everything else waits until two real harness drivers and one external catalog
prove the contracts. This preserves the architectural direction while removing
the work most likely to delay or destabilize the Preview.
