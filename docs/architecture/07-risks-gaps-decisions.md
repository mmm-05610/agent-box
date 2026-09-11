# Risks, factual gaps, and decisions for the user

## 1. The recurring failure modes, mapped

The user named ten ways the Codeg episode repeated. Each is restated below as a *mechanism* this design
could reintroduce, with the specific countermeasure that is already written into
`04-agentbox-plugin-architecture.md` / `06-decision-and-migration.md` — not as a promise, as a rule with
an owner.

| # | Failure mode | Where it would recur here | Countermeasure in this design |
|---|---|---|---|
| 1 | **Multiple authorities** (Desktop / App Server / Harness Runtime) | Option A stacks a second service layer beside Studio's `/api/v1`; option B gives each adapter its own truth | One authority per datum, per connection (§Authority tables); a connection names exactly one backend and never merges stores |
| 2 | **Premature unified abstraction** | Designing Desktop Ports for N hypothetical harnesses before two real protocols exist | Ports ship only when a second real protocol implements them (§4 of `06-`); the first slice implements exactly two adapters |
| 3 | **Profile / Provider / Harness / Plugin concepts mixed** | The Hermes adapter must map Hermes *profiles* onto AgentBox's profile authority, and Hermes profiles are also "bots" | One family per concept (`harness.*`, `model-provider`, `profile`); the Desktop's capability table names families, never harness types; the adapter owns the mapping |
| 4 | **Synthetic green while the production combination is unwired** | AgentBox's `g6a` synthetic provider can satisfy a contract test; a capability can be advertised with no real provider | The **capability matrix CI gate**: every Desktop-consumed family needs a provider *and* a real-boundary test (§10 of `04-`) |
| 5 | **UI invents success** | The Desktop's bot-meta write classifies a rejection as the documented legacy `unsupported` fallback and keeps a local-only copy — the UI looks right while nothing was persisted. **This is observed, not hypothetical: see §2.1** | `unavailable`/`not_implemented` are distinct, rendered states; a capability that is not `supported`/`emulated` must not present a success affordance |
| 6 | **Host / WSL / Worker permission boundaries blurred** | Assuming plugins run in workers; assuming a worker can resolve credentials | Plugins declare `realm`; workers are **op-only** (frozen HostBridge wire), credentials stay host-side and cross as execution-scoped projections (§4, §5 of `04-`) |
| 7 | **A plugin bypasses the service layer and exposes arbitrary APIs** | Adding a route-contribution mechanism | **No plugin-contributed routes, ever**; capabilities flow through the service layer; a new endpoint is a host change (§7 of `04-`) |
| 8 | **Two implementations coexist indefinitely** | Option D's coexistence becomes permanent; the Desktop's own Git/fs/PTY keeps living beside AgentBox's workspace contracts | A written, measurable retirement condition (§5 of `06-`) plus the rule that no new feature may be built on the legacy adapter |
| 9 | **Build and test cost runs away** | Per-runtime Desktop adapters each needing a real CLI in CI; a slow E2E lane on every PR | One adapter per protocol; the shared golden vectors are the cross-repo contract test; the E2E lane stays **on-demand** (`workflow_dispatch`), not a PR gate |
| 10 | **Status documents diverge from the real user path** | AgentBox's authoritative contract set is **untracked**, and its `DISPATCH_STATUS.md` is a 666-line hand-maintained ledger; the Desktop's architecture docs are new | Track the frozen set; make the capability matrix a **test**, not prose; keep the doc set small and cite `file:line` |

Two extra failure modes worth naming because this design is exposed to them:

| Failure mode | Where | Countermeasure |
|---|---|---|
| **Session identity conflation** | The Desktop already juggles four identities (runtime id, stored id, lineage root, `(connection, profile)` scope) | Ports carry the durable/stored identity at the boundary and translate inward; a migration must not introduce a fifth |
| **Renderer trust creep** | The preload exposes 186 channels, several of them effectively a general escape hatch (`hermes:api`, `writeTextFile`, `terminal.start`, `git.*`) | Ports are narrow and typed; a capability grant model is named as future work in the Desktop's own `src/extension/sdk/index.ts:21-27` and must land before a second backend multiplies the surface |

## 2. Facts I established while investigating (not guesses)

These came out of the E2E investigation during this work and are directly relevant to the design.

### 2.1 The Desktop can silently downgrade a server-side write — observed

`bot-roster-user-sections` files a bot into a section and then asserts the membership landed in
`<HERMES_HOME>/profiles/<bot>/profile.yaml`. Run against Hermes `v2026.9.7`, the UI passes and the disk
assertion fails: the profile directory exists and is fully populated, but `profile.yaml` is **never
written**.

The mechanism is visible in the Desktop's own code: `saveBotMeta`
(`apps/desktop/src/plugins/hermes-bots/data.ts:305-435`) calls `profiles.configure` with
`ui_meta: {'hermes-bots': …}` and classifies the outcome three ways — `'persisted'` only when the
response carries `applied.ui_meta === true`, else `'unsupported'` (silent local fallback) or `'failed'`.
A rejection therefore looks exactly like an older gateway, and the UI proceeds on the local copy.

What I ruled out by measurement, not inference:

- `_configure_ui_meta` exists in `v2026.9.7` (`tui_gateway/methods_profiles.py:436-479`) and does write
  `profile_dir/profile.yaml` with `applied.ui_meta = True` on success — a direct `profiles.configure`
  from a plain gateway writes the file.
- The write lands at the path the test asserts. `profiles.list`, run inside the sandbox, reports
  `alpha → <sandbox>/hermes-home/profiles/alpha`, i.e. exactly `get_profile_dir('alpha')`. There was no
  path divergence to chase.
- The revision/conflict gate (`ui_meta_expected_revisions`) **cannot** fire here: the Desktop does not
  send it, and conflicts are only computed when it is a dict.
- The profile resolves correctly from **both** plausible scopes. With `HERMES_HOME=<sandbox>`,
  `get_profile_dir('alpha')` = `<sandbox>/profiles/alpha`; with `HERMES_HOME=<sandbox>/profiles/alpha`
  (the profile-scoped backend), `get_default_hermes_root()` strips the trailing `profiles/<name>`, so it
  resolves to the same directory. Both exist.
- The 64KB `ui_meta` cap cannot fire: the payload is a few hundred bytes.

**Root cause, confirmed by measurement.** The trigger is bot-backend pool contention. The pool defaults
to 3 concurrent non-primary backends (`electron/pool-limits.ts`, `maxBackends: 3`), and a save addressed
to a bot is routed to *that bot's own backend*. A device with more bot profiles than slots queues the
spare ones — `[hermes] Profile backend "alpha" waiting for a free local slot (2/3 busy, 1 queued)` in
`desktop.log` — the bot-addressed `profiles.configure` then fails, and the failure is swallowed into the
`'unsupported'` branch. The UI reports the filing as done; nothing was written. Raising the pool with
`HERMES_DESKTOP_POOL_MAX` — the documented scripted-setup knob — turns the same spec green, and the file
then contains the app's own write:

```yaml
ui_meta:
  hermes-bots:
    sectionId: sec-mtvgl4bv-uq45t
_ui_meta_revisions:
  hermes-bots: 3
```

**Design consequence — a confirmed reproducer, not a hypothetical.** A Port must distinguish "the
backend cannot do this" from "the backend refused this, or was not reachable", because the Desktop's
three-way classification lets both read as a legacy gateway. Failure mode #5 has a live, repeatable
example: *the UI reports a cross-machine write that provably did not happen, and the only precondition
that had to break was one backend sitting one slot behind in a pool.*

### 2.2 The advertised tool surface is a runtime-owned, version-sensitive fact

The same E2E work established that the runtime's model-facing tool list is not "the toolsets": with the
fixture's own config, `get_tool_definitions` returned **19** tools while toolset resolution produced 49
names, dropping `todo_list` (and keeping `write_file`/`terminal`/`clarify`) because
`tools.tool_search` defaults to `auto` and collapses the list behind the
`tool_search`/`tool_describe`/`tool_call` bridge. A scripted client cannot self-correct against that,
and the runtime's rejection surfaces as "Model generated invalid tool call".

**Design consequence:** anything a client scripts by name — tool calls, RPC methods, event types — needs
either an explicit negotiation or a pinned, declared surface. This is the same class of problem as
"which capabilities does this backend have", which is why the capability map must be **authoritative
and consumer-visible**, not inferred.

### 2.3 An open bot-mode instability I did not explain (reported, not fixed)

Two specs fail intermittently — sometimes on both attempts, sometimes green on retry:
`bot-mode-row-click-mirrors-registry.spec.ts:114` and `correction-session-switch.spec.ts:188`. Both
had already failed on every attempt before any of this work (runs `34463723865`, `34465537625`).

The captured page snapshot for the first one is worth reading, because it does not look like slowness:

```
- tablist:
  - tab "Alpha Close"
  - tab "Draft — nothing sent yet New session Close" [selected]
...
  - textbox "Message" [active] [ref=e164]: What's next?
```

The bot's tab is open, but **a Draft session tab is the selected one**, and the spec's locator
(`[data-slot="composer-root"] [contenteditable="true"]` filtered to visible, `.first()`) resolves to a
composer that is present in the DOM but not visible — while a different, visible composer sits at
`ref=e164`. So clicking the bot row lands somewhere other than the Bot Chat a non-trivial fraction of
the time, and the two composers coexist.

I am **not** claiming this is a product bug or a spec bug — I could not establish which without
investigating the draft-tab creation path, and that is a different piece of work from making the lane
run. What matters for this design is that it is a *third* example of the same theme as §2.1 and §2.2:
the client's own view of "which chat am I in / did my write land" is derived, not authoritative, and a
test (or a user) can be looking at a truthful UI that answers a different question than the one asked.

### 2.4 A session's visible name is derived twice, and the two derivations disagree (explained)

`correction-session-switch` failed on both attempts in two of three full runs and passed on retry in the
third. It is the same class of problem, and this one I did run to ground.

`session.create` from the Desktop sends **no `title`**
(`src/app/session/hooks/use-session-actions/index.ts:319-331`). A sidebar row is therefore labelled from
the gateway's `preview`, which the runtime shapes to `_PREVIEW_MAX_CHARS = 60` plus an ellipsis
(`hermes_state_common.py:23,102`). Meanwhile the client's own optimistic row is labelled from the text
the user submitted — untruncated. So the label **changes under the user** when the gateway's roster row
replaces the optimistic one, and a locator filtering on the full prompt matches only inside that window:

| Prompt | Length | Row label from the gateway | Locator on the full prompt |
|---|---|---|---|
| `E2E persisted session used for a warm resume.` | 45 | renders in full | matches |
| `E2E_CORRECTION_SWITCH_TRIGGER: original prompt must remain singular after a correction.` | 84 | first 60 chars + `...` | **never matches** |

That is why the failing lookup was always the second one, and why the spec intermittently passed. The fix
is a test fix — identify the row by a prefix present in both derivations — because the product never
promised to render the full prompt. The stable specs already sidestep it by passing a short title to
`session.create`.

**Design consequence.** The same label means different things to the two sides of the wire, and neither
is wrong. A client that wants to *find* something the backend named must consume the backend's identity
(a stable id), never re-derive a display string and search for it. This is precisely why the Ports must
carry identities rather than labels, and why "the client and the backend agree on what this thing is
called" cannot be an assumption anywhere in the design.

## 3. Factual gaps (things I could not verify, and what would verify them)

| # | Gap | Why it matters | How to close it |
|---|---|---|---|
| G-1 | **Which desktop is canonical** — this Electron app or the Tauri app whose contracts AgentBox froze (`agent-box-studio-ui-reconstruction`) | Decides whether this whole study is a plan or a comparison | The user (D-1) |
| G-2 | AgentBox's authoritative contract set (`docs/validation/current/frozen/`, `DISPATCH_STATUS.md`) is **untracked**, with 96 modified files uncommitted | A cross-repo contract that is not in version control cannot be pinned or reviewed | Commit the frozen set; cite hashes from `MANIFEST.json` |
| G-3 | ~~The remaining E2E failure's cause~~ | **Closed.** It was bot-backend pool contention, not protocol drift — see §2.1. The Desktop's call is made and fails; the failure is swallowed | — |
| G-4 | Whether AgentBox has been run against this Electron desktop at all | "Already frozen with the desktop" refers to the Tauri desktop; the Electron app is unproven against it | One real-boundary run of the first slice |
| G-5 | Hermes harness parity inside AgentBox | `REAL_HARNESS_READINESS_MATRIX` exists, but the parity gap matrix names open blockers (`REMOTE_OBSERVATION_ARTIFACT_UNRESOLVED`, `REMOTE_CONTINUATION_LOCATOR_UNADJUDICATED`, `CONTINUATION_PROVIDER_ABSENT`); `REQUIRED_DECISIONS.md` RD-5 says Hermes needs "full Python-runtime projection" | Read the readiness matrix per harness before promising retirement (D-7) |
| G-6 | The Desktop's own E2E state | **Three root causes closed; a residual flake class remains.** Six full runs against `v2026.9.7`, best fully green (67 passed / 1 flaky / 11 skipped / 0 failed). Every failure before this work and during it was one of three explained causes (§2.1, §2.4, and the pool) plus one load-shaped class: a single 30 s locator/waitFor timeout in **whichever spec hits a slow moment** — `bot-mode-row-click-mirrors-registry`, `correction-session-switch`, `worktree-branch-status`, `zoom-preservation` and `large-session-resume` have each played that role in a different run (in the `zoom-preservation` case the *adjacent* test passed in 920 ms). Always green on retry or in the neighbouring run, never the same spec twice after its cause was fixed | Restore one variable at a time: the lane is 79 Electron specs each spawning Python backends on a shared 4-core runner at 1 worker, so the flake rate is a property of the lane's shape before it is a property of any spec. Not a gate until it is green twice running |
| G-7 | Installer ownership and compatibility | `docs/installer-ownership.md` records that the Windows orchestrator's producer is external and compatibility is **UNVERIFIED** | An owner decision + a cross-product lane |
| G-8 | Whether AgentBox's Python floor accommodates the Desktop's WSL story | The sidecar bundle and the WSL plugin pair (0.1.0a1) are unfinished; `runtime-wsl` is "intentionally not enabled" | Read the sidecar manifest's required distributions and the G7 staging gate |
| G-9 | Plugin trust posture | AgentBox ADR-0007 says no sandbox, no permissions; the user's requirement #5 asks for boundaries | D-4 |

## 4. Decisions the user must make

### D-1 — Which desktop is canonical? (blocking)

Options: (a) this Electron app, and the Tauri contracts are an input to re-derive for it; (b) the Tauri
app, and this repo's architecture work is a comparison study; (c) both, deliberately.

Recommendation: **(a)**, because this repository is the one with a pruned, external-runtime client, a
mature event projection, a hardened transport and a working on-demand E2E lane — while the frozen
AgentBox contract set is portable (it is a protocol, not a UI). But the cost of (a) must be stated: the
frozen `AGENTBOX_INTERFACE_PROTOCOL.md` Port mapping and the C3.1 "restricted proxy" target were written
for Tauri's `invoke`; on Electron the analogue is the main process, and the mapping must be re-derived,
not copied.

### D-2 — The Hermes product surfaces: port or drop? (blocking for scope)

Bucket D is ~40k lines: bots/relay (24,059), kanban (5,521), skills/MCP (3,790), starmap (3,644), cron,
artifacts, messaging/webhooks, model catalog, memory/curator, subagents. Each needs a decision:
**port to an AgentBox capability family**, or **drop from the Desktop**.

Recommendation: decide per surface, with this default: anything that is really "a view over sessions and
tools" (skills, subagents, artifacts, starmap) is a port candidate; anything that is a Hermes-specific
product (bots-as-profiles, kanban as a Hermes plugin, messaging adapters) is a drop candidate unless
AgentBox grows the same product. Do not port them wholesale before the Port boundary exists.

### D-3 — The AgentBox POC: foundation or deletion?

`apps/desktop/src/agentbox/*` + `agentbox-lab/*` (untracked, lint-dirty, synthetic dev token) already
models the right boundary. Options: (a) promote and clean it as the adapter's foundation; (b) treat it as
a reference and write the adapter fresh against the frozen contract; (c) delete it.

Recommendation: **(b)** — the POC was written against a *synthetic* shape, and the frozen AgentBox
contract (`launch-preview` with a `resolution_digest`, ws-ticket, `after=<seq>`, `resync_required`,
`turn_id`/`execution_id`) is richer and stricter. Reusing the POC's *structure* as a checklist is
valuable; promoting its code would import its shortcuts. Decide (c) only after the first slice exists.

### D-4 — Plugin trust: capability boundaries, or real isolation?

Recommendation: **capability boundaries now, isolation explicitly deferred** — and say so in the plugin
docs so nobody mistakes `[needs]` for enforcement. Real isolation is a project (separate processes,
manifest-mediated RPC, a capability gate on every call), not an increment.

### D-5 — Who is authoritative for a local workspace?

Options: (a) AgentBox is authoritative everywhere, including on the machine the Desktop runs on
(uniform, but local Git/file operations gain a socket hop); (b) split by realm — local operations stay
direct, remote/WSL go through AgentBox (fast, but two implementations of one capability); (c) one
authority with a *local fast path behind the same Port* where a measurement justifies it.

Recommendation: **(c)**. It keeps one semantic, one authority and one test surface, and makes the
optimization invisible to callers — whereas (b) recreates the double-implementation failure mode.

### D-6 — Must any plugin run inside a worker realm?

If yes, this is a new project (a plugin runtime on the worker side: Rust, or an embedded Python), and the
frozen HostBridge wire contract must be extended deliberately. Recommendation: **no, not now** — express
worker-side needs as transport operations and host-side orchestration, as the design does.

### D-7 — Commitment level: AgentBox as the single backend, or both long-term?

Options: (a) AgentBox is the target and Hermes-direct is time-boxed (§5 of `06-`); (b) both are
long-term peers.

Recommendation: **(a)**, with the retirement condition written down. (b) means paying for two
implementations forever and leaving failure mode #8 permanently open — the reason option A was rejected
as a mechanism.

## 5. What I would tell a reviewer to check first

1. Does the answer to **D-1** make the frozen AgentBox Port mapping meaningful for Electron, or does it
   need re-derivation? (Read `frozen/AGENTBOX_INTERFACE_PROTOCOL.md:18-58` against
   `apps/desktop/electron/preload.ts`.)
2. Is the **capability matrix gate** in place before any capability is advertised to the Desktop? Without
   it, failure mode #4 has no detector.
3. Does every new Port have **two** real implementations (or a written plan for the second)? One
   consumer is how premature abstraction gets in.
4. Is anything in this design depending on a fact from §3 that is still open? In particular G-2 (an
   untracked contract set) and G-5 (Hermes harness parity) both gate the retirement condition.
5. **Is the POC still untracked and untouched?** It should be, until D-3 is answered.
