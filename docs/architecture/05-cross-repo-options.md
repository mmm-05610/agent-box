# Cross-repository options

Four options, each described the same way so they can be compared honestly: what changes on each side,
how the plugin system is designed, the process/data flow, who is authoritative for what, how
workspace/Git attach, what the platform boundaries look like, the cost and test burden, and — the
column that matters most — **where a Codeg-style failure would recur**.

A note on naming, because two of these are easy to conflate:

- **Option A** is *protocol-shaped*: the Desktop keeps speaking a Hermes-shaped protocol and AgentBox
  learns to answer it. The Desktop changes little; the runtime boundary stays Hermes's.
- **Option C** is *capability-shaped*: the Desktop is rebuilt around AgentBox's capability model and
  harness diversity lives in AgentBox plugins. The Desktop changes a lot; the boundary becomes a
  harness-neutral one.

Both end with "the Desktop talks to AgentBox". They are not the same change, and C is not reachable by
increments of A.

---

## Option A — AgentBox replaces Hermes as the App Server

AgentBox grows a `serve`-compatible endpoint: the same JSON-RPC methods, the same event names, the same
port-announce line, the same token env var. Hermes becomes one AgentBox harness among several.

### Desktop

- Point the resolver's rung 4 at AgentBox's launcher instead of `hermes` (or add a rung), keep every
  other HTTP/WS/JSON-RPC assumption: `serve --host --port 0`, `HERMES_*_READY port=`, the `/api/ws`
  dial, `/api/health`, and the 46+ event names.
- The Hermes *product* pages keep working — because the vocabulary is preserved, `/api/skills`,
  `/api/cron`, `bot_relay.*` etc. must now be implemented by AgentBox or proxied.
- Net Desktop change: **small and deceptively so** — one resolver rung plus compatibility shims.

### AgentBox

- A new adapter layer that implements the Hermes App Server contract: method table, event emitter,
  token env, readiness line. Effectively a permanent compatibility mode.
- Harness work: an AgentBox `hermes` harness already exists in the registry (5 kinds today), so "run
  Hermes" is partly there — but the App-Server *protocol* is a separate, larger surface.
- Every Hermes product surface the Desktop still renders (skills, cron, mcp, kanban, bots, messaging,
  memory, starmap) must be either implemented or explicitly 501'd.

### Plugin design

Unchanged from today's kernel. Plugins provide capabilities; the App-Server adapter sits *above* them.
But the adapter is now a second service layer beside Studio's `/api/v1`, so the host has two route
vocabularies and two error shapes — a split the AgentBox survey already flags as a real problem between
Studio and the legacy web host (`AGENTBOX` survey §G.14).

### Process and data flow

```
Desktop → AgentBox Host ──(Hermes App Server adapter)──► capability catalog ──► harness plugins
                        └─(Studio /api/v1)─────────────► same catalog
```

### Authority

Unchanged on paper (AgentBox owns execution/session/credential; Desktop is a client) but *unstable in
practice*: the Desktop's Hermes-shaped assumptions — `source: 'desktop'`, profile-as-bot identity,
canonical `Bot Chat` titles, `session.cwd.set` semantics — would have to be honoured or reinterpreted
by the adapter, which makes Hermes's accidental behaviours part of AgentBox's contract.

### Workspace / Git

Untouched: the Desktop keeps its own Git/PTY/fs IPC (bucket E). AgentBox's workspace contracts go
unused by the Desktop.

### Platform boundaries

Unchanged; the Desktop keeps its own remote/SSH/WSL logic, which duplicates AgentBox's HostBridge and
WSL workspace/runtime plugins.

### Cost, risk, tests

- Cost: medium on AgentBox (a whole second protocol surface), low on Desktop.
- Test burden: the Hermes App Server contract must be re-verified *from the Desktop's side* — i.e. the
  Desktop's existing e2e suite becomes the acceptance test for an AgentBox component. That is a large,
  slow, cross-repo contract to keep honest.
- **Codeg-style recurrence:** *dual authority* (two service layers with different vocabularies) and
  *double implementation long-term* (the adapter is forever). Also "profile / provider / harness /
  plugin concepts mixed": the adapter must map Hermes's profile semantics onto AgentBox's profile
  authority, and the two do not agree — this is exactly where the mixing shows up as bugs.

---

## Option B — Desktop defines generic Ports; Hermes and AgentBox both implement an Adapter

The Desktop stops assuming Hermes and defines a Port interface per capability, with per-runtime
adapters — including, in the strong form of this option, adapters that drive Codex / Claude Code /
OpenCode **directly from Electron**.

### Desktop

- New `src/harness/ports/*`: typed Ports (capabilities, projects/workspaces, sessions, launch-preview,
  submit-turn, streaming/resync, cancel, approvals, model/profile/config, credential, artifact,
  native-resume, typed-errors) plus a harness registry and capability-based feature gating in the
  Renderer.
- The Hermes-shaped vocabulary in `src/lib/gateway-events.ts` and the slash-command tables become
  adapter-local.
- `electron/main.ts` (18k lines) must be split so process supervision is per-adapter, not fused.

### AgentBox

- Little or nothing: it becomes one adapter's backend.

### Plugin design

Not extended — and this is the option's central weakness: the harness diversity the user wants would be
implemented **on the Desktop side**, where it duplicates AgentBox's existing harness registry,
execution-provider SPI, capability vocabulary, continuation contracts and credential materializer.
Two registries, two capability vocabularies, two continuation stories.

### Process and data flow

```
Desktop Host (Electron main)
  ├─ Hermes adapter  → hermes serve   (exists today)
  ├─ AgentBox adapter → AgentBox Host
  ├─ Codex adapter   → codex CLI      (new: spawn, parse, project)
  └─ Claude adapter  → claude CLI     (new: …)
```

Electron main becomes a second agent supervisor with N CLIs, N auth models, N event vocabularies.

### Authority

Ambiguous by construction. Each adapter brings its own session identity, credential handling and
workspace notion; the Desktop must impose one. Credentials in particular would have to work in two
places (AgentBox's authority model and whatever the Desktop does for a direct-CLI adapter).

### Workspace / Git

The Desktop already owns these (bucket E), so this option is *consistent* with them — but it means the
Desktop's Git/workspace implementation must then also satisfy harnesses, duplicating AgentBox's
workspace/runtime contracts.

### Cost, risk, tests

- Cost: **highest of the four**, and it grows per runtime.
- Test burden: every adapter needs its own real-boundary suite (a real Codex, a real Claude Code), on
  top of the existing Playwright suite.
- **Codeg-style recurrence:** *premature unified abstraction* (a Port designed before more than one real
  consumer exists), *double implementation long-term*, and *concept mixing* (harness, provider,
  profile all as Desktop-level concepts).

---

## Option C — Desktop connects only to AgentBox; all harnesses are AgentBox plugins

The Desktop becomes a capability client. Harness diversity lands in AgentBox as plugins. The Desktop
renders what the capability map says is available.

### Desktop

The largest Desktop change, but the one that removes whole categories of code:

- **Ports with one adapter per protocol** (`hermes-direct` legacy, `agentbox` strategic). Deliberately
  *not* one adapter per harness.
- Feature gating driven by the capability map instead of hardcoded Hermes knowledge: the slash-command
  table, session-source taxonomy, error codes and event projection all key off capabilities.
- The Hermes product pages (bucket D, ~40k lines) are re-decided one by one — ported to a capability, or
  dropped. **This is the product decision the user must make** (D-2 in `07-risks-gaps-decisions.md`).
- Workspace/Git/Terminal/Preview move behind Ports whose first implementation stays the Desktop's own
  (no behavior change), so AgentBox can later become the authority without a rewrite.

### AgentBox

- Extend, don't rebuild: the plugin architecture in `04-agentbox-plugin-architecture.md` — manifest,
  capability families, lifecycle, two-pass binding, realm-aware capability map.
- New harness plugins land as plugins (the registry already supports 5; adding a 6th is data + an
  adapter, not a kernel change).
- The Desktop's needs must be expressible as capability families; anything that is not becomes a
  family proposal, not a Desktop special case.

### Plugin design

This option *is* the plugin design. Everything in `04-agentbox-plugin-architecture.md` applies;
nothing else in these four options needs it.

### Process and data flow

```
Desktop Host (Electron main: no agent supervision)
   └── AgentBox adapter (typed Ports) → AgentBox Host (/api/v1 + /sessions/{id}/events)
                                          ├── capability catalog
                                          ├── harness plugins (codex/claude/opencode/hermes/pi)
                                          └── workspace/runtime/terminal/artifact/credential plugins
                                                └── WSL / Remote worker over the frozen HostBridge ops
```

### Authority

Clean and single:

| Datum | Authority |
|---|---|
| Session / turn / event ledger | AgentBox (durable store + watermark) |
| Credential | AgentBox host; workers get execution-scoped projections |
| Workspace | AgentBox workspace provider (may be the Desktop's machine — see below) |
| Profile / model config | AgentBox |
| Git / terminal / artifact *execution* | whatever realm the workspace lives in, addressed through AgentBox |
| Presentation, window, focus, layout | Desktop |

### Workspace / Git

The interesting case, and the one the user's requirement #6 targets. Two viable resolutions, and the
design must pick one rather than drift:

1. **AgentBox owns it, the Desktop is a client.** Git/terminal/file operations run through AgentBox
   capabilities, executed in the realm that owns the workspace (host, WSL, remote). The Desktop's
   existing `git-ipc.ts`/`terminal-ipc.ts` become a *local* implementation of the same Port.
   Pro: one authority, WSL/remote work uniformly, capabilities are advertised.
   Con: the Desktop's Git UX (25 IPC channels, review ops, worktrees) must be re-expressed through the
   capability API; latency for local operations goes through a socket.
2. **Split by realm**: local workspaces use the Desktop's direct implementation; remote/WSL workspaces
   go through AgentBox. Pro: no latency regression, no rewrite of the local Git UX. Con: two
   implementations of one capability — precisely the "double implementation" failure mode, and the
   Desktop and AgentBox must agree forever on semantics.

The recommendation (`06-decision-and-migration.md`) is (1) with a **local fast path kept behind the same
Port** only where a measurement proves it necessary — i.e. one authority, one semantic, and an
optimization that is invisible to the caller.

### Platform boundaries

Windows/WSL/remote become AgentBox's problem (it already has workspace-wsl, runtime-wsl, HostBridge,
and an explicit credential projection freeze). The Desktop stops owning SSH spawn argv and token-file
protocols — a real reduction of bucket C.5 (5,221 lines) and bucket C.6 (1,037+).

### Cost, risk, tests

- Cost: high on both sides, but the *shape* is right: Desktop work is deletion and Port extraction;
  AgentBox work is extension of an existing kernel.
- Test burden: bounded and reusable — golden vectors shared by both repos; one real-boundary test per
  Desktop-consumed capability; the capability matrix gate.
- **Codeg-style recurrence:** the risk here is *synthetic green* (a capability advertised but only
  exercised by a synthetic provider) and *UI faking success*. Both are addressed by the capability
  matrix gate and by the rule that the Desktop renders `unavailable`/`not_implemented` rather than
  inventing a fallback.

---

## Option D — Coexistence, progressive cutover (the migration mechanism)

Not a separate end state — the way to reach C without a big-bang. Both adapters exist; features move one
capability at a time; the Hermes adapter stays until parity, and is the only fallback.

### Desktop

- Ports land first, with the **Hermes adapter re-housed unchanged** behind them (no behaviour change;
  the existing e2e suite must stay green throughout).
- The AgentBox adapter lands beside it, initially implementing only the capabilities the Desktop needs
  for the first slice (readiness/capabilities, sessions, submit, stream, cancel).
- **One feature at a time** moves from the Hermes adapter to the AgentBox adapter, each with its own
  real-boundary test and a visible capability gate. No feature has two live implementations at once —
  the port is either on the Hermes adapter or on the AgentBox adapter, chosen per connection.
- The connection model (`local | remote | cloud | ssh`) gains a `backend` dimension
  (`hermes | agentbox`), making the choice explicit in the UI rather than implicit in a resolver rung.

### AgentBox

- No change required to *start* — the frozen protocol already covers readiness, projects, sessions,
  launch-preview, turns, cancel, approvals(permissions/questions), transcript, WS replay/resync,
  credentials, accounts, and typed errors. The first AgentBox work is the plugin-architecture
  increments of `04-` only where the Desktop needs a missing capability.

### Plugin design

Identical to C; D simply delays which families the Desktop consumes first.

### Process and data flow

Two backends, one at a time per connection:

```
Desktop Host
  ├─ active backend = hermes   → hermes serve        (legacy adapter)
  └─ active backend = agentbox → AgentBox Host       (strategic adapter, capability-gated)
```

The Desktop never runs both for the same connection, and never merges their session stores.

### Authority

Per connection, not per datum — the key discipline. Each connection names exactly one backend and that
backend is authoritative for everything on that connection. Sessions are not migrated between
backends; a user who switches backends gets a different, correctly-populated session list.

### Workspace / Git

Phase-dependent: in the early phases the Desktop keeps bucket E; later phases move capabilities behind
Ports as in C. The critical rule is that a capability has exactly one live implementation per
connection.

### Platform boundaries

Coexistence is exactly where the "which machine runs this" question gets answered per backend:
Hermes-direct inherits the Desktop's current Windows/WSL/SSH handling; AgentBox brings its own. Do not
attempt to unify them during the migration — unify the *Port*, not the plumbing.

### Cost, risk, tests

- Cost: the sum of both adapters, staggered — the reason to keep the legacy adapter thin and to retire
  it on a schedule rather than "when convenient".
- Test burden: the existing Hermes e2e suite stays as the legacy adapter's regression net; the AgentBox
  adapter gets contract tests from the shared golden vectors plus real-boundary tests per capability.
- **Codeg-style recurrence:** the classic risk is *double implementation long-term* — coexistence that
  never ends. Mitigation: a written retirement condition and a date, plus the rule that no new Desktop
  feature may be built on the Hermes adapter once the AgentBox adapter covers that capability.

---

## Side-by-side

| | A (protocol replacement) | B (Desktop Ports + per-runtime adapters) | C (AgentBox owns harnesses) | D (coexistence → C) |
|---|---|---|---|---|
| Desktop change | minimal (one rung + shims) | Ports + N harness adapters | Ports + 2 adapters (hermes, agentbox), capability-driven UI | Ports first, then incremental |
| AgentBox change | a second protocol surface (large) | none | kernel extension (as designed) | kernel extension, when needed |
| Harness diversity | AgentBox (behind an emulation) | **Desktop** | AgentBox plugins | AgentBox plugins |
| Plugin system | not extended | not extended | extended — the point | extended |
| Authority | unstable (two service layers) | ambiguous (N adapters) | single | per connection |
| Workspace/Git | Desktop keeps it | Desktop keeps + must serve harnesses | Port; AgentBox authority, realm-executed | phase-dependent, one impl per connection |
| WSL/remote | Desktop keeps duplicating | Desktop keeps duplicating | AgentBox owns | moves late |
| Test cost | cross-repo App-Server contract forever | per-runtime suites | shared golden vectors + capability matrix | staggered sum |
| Recurrence risk | dual authority, double impl, concept mixing | premature abstraction, double impl, concept mixing | synthetic green, fake-success UI | coexistence never ends |
| Verdict | rejected as mechanism | rejected as primary | **steady state** | **mechanism** |
