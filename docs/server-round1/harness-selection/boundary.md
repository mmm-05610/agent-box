# Stage C — recommendation and reuse boundary

## Recommendation

Set Work Order 38 to
`HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION` with one conditional
recommendation:

- Select `giuliastro/harness-remote` tag `v3.0.2`, commit
  `21ce6db49af708c4c7c3f96ef6a50f62dced8dab`, for a minimal extraction spike.
- Among candidates reviewed in the first screen, there was no fully
  qualifying backup. `agent-controller` is a useful Pi, OpenCode, and Claude
  component reference, but its Codex runtime uses `codex exec`. Replacing that
  runtime with Codex ACP requires a new ACP/app-server-to-ADL lifecycle
  translator and is outside thin glue.
- If a fixed source snapshot plus the small permission-resolver patch described
  below is unacceptable, the practical decision is `NO_FIT`. The selection
  must not fall back to an AgentBox-written multi-Harness implementation.

This recommendation authorizes discussion and, if the user chooses it, a new
implementation work order. It does not approve production code, credentials,
real Harness calls, or a real model run.

## Why this is reuse

Harness Remote already owns the multi-Harness mechanics in source:

- `harness-profiles.js` is its branded registry for OMP, Pi, Claude, and Codex;
  `resolveAcpLaunch` resolves their fixed ACP adapters.
- `acp-client.js` implements ACP process launch, initialize/authenticate,
  requests, streaming notifications, permissions, errors, cancel, and exit.
- `acp-service.js` implements session discovery/load/resume/prompt, native
  identity, configuration negotiation, per-session queueing, event mapping,
  transcript merge, action invocation, and error visibility.
- Its history readers preserve the distinct Codex, Pi, and OMP native journals.
- OMP undo/redo is retained through `extension-actions.js` and
  `omp-extension-action-state.js`, including process/runtime/session/revision
  authority checks.
- Its OpenCode path already supplies managed launch, authenticated HTTP, SSE
  fanout/reconnect, native routes, and Windows process-tree termination logic.
- Codex delegates to `@agentclientprotocol/codex-acp@1.1.14`; the fixed adapter
  source and experiment prove an `app-server` launch and JSON-RPC
  initialize/resume/interrupt path.

The AgentBox wrapper may select one of those registered profiles, supervise the
candidate process, and envelope its events. It may not implement ACP, native
resume, event translation, per-Harness registration, OMP actions, or OpenCode
HTTP/SSE itself. If the spike cannot use these source paths substantially
unchanged, the candidate fails.

## Fixed source closure

Harness Remote does not publish `bridge` as a stable library; its package is
private and has no runtime lock. Reuse therefore means an Apache-2.0 source
snapshot with file allowlist and hashes, rather than copying ideas or tracking
`main`.

The first ACP slice needs this upstream-owned closure:

```text
bridge/src/
├── acp-client.js
├── acp-prompt-echo-filter.js
├── acp-service.js
├── agent-model-catalog.js
├── transcript-cache.js
├── bounded-lru.js
├── harness-profiles.js
├── harness-capability-contract.js
├── codex-session-history.js
├── omp-session-history.js
├── pi-session-history.js
├── backward-line-scan.js
├── extension-actions.js
├── omp-extension-action-state.js
└── launcher.js
```

The candidate's registration block in `daemon-cli.js` remains the semantic
source for constructing `AcpClient`, the model catalog, capability contract,
and service options from one profile. A production extraction may move that
block into an exported upstream-owned factory as a mechanical patch; AgentBox
must not reproduce it as a branded switch.

Adding OpenCode later requires this second upstream-owned closure:

```text
bridge/src/
├── opencode-host.js
├── managed-event-fanout.js
├── agent-router.js
├── http-policy.js
└── task-model.js
```

The combined reviewed files are about 6,072 source lines. This demonstrates a
substantial third-party implementation and also sets a real maintenance cost.
Files must stay under an explicit upstream namespace with their original
license. AgentBox-specific code must not be mixed into them.

Do not run or adopt `machine-daemon.js`, `daemon-cli.js` as a complete control
plane, `machine-registry.js`, `task-*`, `worktree-*`, `work-thread-*`,
`session-link-store`, `session-operation-ledger`, or `task-run-store`. Those
parts own product tasks, worktrees, links, snapshots, and recovery. Running
them as authority would duplicate Server/Core governance.

## External artifact closure and license duties

For the first proposal, distribution is limited to Codex, Pi, and OMP. Claude
is withheld pending review of the all-rights-reserved Claude Agent SDK terms;
OpenCode is a later slice. The registry reports only installed, reviewed
profiles.

The approved build must create one offline lock/SBOM containing:

- Harness Remote source at the exact commit, Apache-2.0;
- `@agentclientprotocol/codex-acp@1.1.14`, Apache-2.0, together with the lock's
  `@openai/codex@0.147.0` and ACP SDK `1.3.0`;
- `@automatalabs/pi-acp@0.5.0`, Apache-2.0, together with the exact Pi packages
  `0.84.2`, which report MIT;
- the separately installed OMP executable and its native extension, whose
  redistribution terms must be recorded before bundling;
- every transitive production package, artifact integrity, platform binary,
  and license. Build/dev-only dependencies receive a separate SBOM.

Apache-2.0 redistribution requires the license, retained attribution and
notices, and prominent modification notices. Runtime `npx --yes` is forbidden:
the build obtains exact tarballs, checks integrity, and installs them into the
plugin artifact. Native binaries are selected by absolute allowlisted path.
No automatic install, upgrade, permission widening, or model substitution runs
inside a Worker.

## Thin AgentBox glue

Only the following AgentBox-owned glue is acceptable:

1. A provider-neutral plugin entrypoint that receives a registered profile id
   and generic operation (`open`, `resume`, `prompt`, `cancel`, `invoke native
   extension`) and selects the candidate's own profile/factory without a
   Codex/Pi/OMP branch.
2. An NDJSON or local-socket envelope between the existing Worker and the Node
   sidecar. It carries opaque native ids, candidate capability declarations,
   common lifecycle events, and namespaced native extension payloads. The
   envelope does not reinterpret branded fields in Core or Server.
3. Worker process setup: absolute binaries, clean environment, isolated
   HOME/XDG/native roots, cwd, resource limits, network policy, process group,
   timeout, and recursive termination.
4. An artifact/provenance loader that checks source-file hashes, package lock,
   platform, and binary versions before launch. `CODEX_PATH` stays disabled;
   Codex ACP and its bundled Codex are upgraded as one reviewed artifact.
5. A persistence boundary that disables Harness Remote durable snapshots or
   points them only at the attempt projection. Native id/events/evidence flow
   back to Windows; the sidecar never decides authoritative Profile, Session,
   execution, idempotency, or role state.
6. One narrow upstream-shaped change to `AcpClient`: inject an asynchronous
   permission resolver and await its answer. Current source immediately picks
   static `allow_once`/`allow_always` when `permissionMode` is `allow`, or
   cancels. It cannot preserve Core/user approval policy. Until this callback is
   accepted and tested, approval-requiring tools remain disabled.

Environment injection does not require an upstream patch: the Worker sets the
sidecar environment before the candidate imports `harness-profiles.js`, and
passes reviewed adapter executables so `resolveAcpLaunch` never reaches its
`npx` fallback.

The spike fails with `NO_FIT` if it needs to modify `AcpService` lifecycle,
rewrite ACP/OpenCode translation, recreate the profile registry, keep Harness
Remote's task/control stores as authority, or expand the permission change into
a continuing lifecycle fork.

## Proposed production tree

This tree is a proposal for the next authorized work order; no path is created
by Work Order 38:

```text
plugins/agent-box-harnesses/
├── src/agent_box_harnesses/
│   └── harness_remote_provider.py       # generic plugin/Worker envelope only
├── runtime/
│   ├── worker-entry.mjs                 # isolation bootstrap + generic factory
│   ├── package.json
│   ├── package-lock.json                # exact offline production closure
│   └── artifacts/                       # verified adapter/platform artifacts
└── third_party/harness_remote/
    ├── SOURCE.json                      # origin, commit, allowlist, hashes
    ├── LICENSE
    ├── PATCHES.md                       # permission resolver/change notices
    └── bridge/src/…                     # fixed closure above

workers/agent-box-worker/
└── existing supervisor                  # owns bwrap/process group/projection
```

Trusted AgentBox plugin installation registers this provider as one extension
slot. The candidate's fixed profile registry controls which Harnesses it can
advertise. A user-selected executable/plugin runs out of process under Worker
isolation; arbitrary third-party JavaScript is never imported into Server or
Core. Neither candidate supplies a safe hot-load marketplace or arbitrary
Harness registration API, so those features stay out of scope.

## Process and data flow

```text
Windows Server (Profile/Session/execution/idempotency authority)
  │ generic frozen request + credential reference + prior native id
  ▼
Work Core (provider-neutral dispatch/cancel/event contract)
  │
  ▼
WSL Worker (owns projection, bwrap, limits, process group, cleanup)
  │ launches with minimal env and absolute reviewed binaries
  ▼
AgentBox plugin sidecar (thin envelope/provenance/approval bridge)
  │ selects Harness Remote's own profile/factory
  ▼
Harness Remote ACP service ──► fixed ACP adapter ──► native Harness child
  │ candidate event/native extension/error mapping
  ▼
Worker event stream ──► Server durable events/checkpoint ──► client
```

The candidate may keep in-memory queues and caches during one projection.
Snapshot paths, model-catalog state, native HOME, and journals are execution
artifacts inside a bounded projection. A successful checkpoint copies required
evidence/native continuation material to the Windows-owned Session record
before cleanup. A remote directory by itself never becomes recovery authority.

Codex, Pi, or OMP naming and native payload interpretation stay in Harness
Remote and its adapter. Server stores the profile id and opaque/native
namespaced data but does not switch on a brand to interpret it.

## Relationship to the four Work Order 37 findings

| 37 finding | Effect of this choice |
| --- | --- |
| Same idempotency key can be accepted twice and produce contradictory terminal state | **Independent.** The third-party adapter does not own HTTP admission or Core idempotency. A separate 37 repair must serialize or atomically reserve acceptance. |
| Messages are decoded and published only after the run ends | **Enables a fix but does not perform it.** Harness Remote emits running updates before prompt completion; Server/Worker must concurrently consume and publish them in a separate production repair. |
| Role native state is only a generation counter while capability says native memory | **Independent.** Runtime-advertised capabilities and strict mismatch rejection can improve honesty, but role state semantics, storage, and advertisement remain an AgentBox repair. |
| `server/composition/codex.py` owns native resume/capture/execution semantics | **Directly addressed by the proposed boundary.** Native session, stream, cancel, error, and proprietary behavior move into a third-party-backed Harness plugin. The current production file remains unchanged until a separately approved migration. |

Changing libraries cannot make Work Order 37 GREEN and must not overwrite its
retained real-run evidence.

## First minimal implementation slice after approval

Create a separate no-model work order with this bounded acceptance path:

1. Vendor and hash the ACP source closure; build offline locks for Codex ACP and
   Pi ACP; exclude Claude and OpenCode; preserve all licenses and change notes.
2. Start the candidate bridge for Codex and OMP/Pi inside the existing WSL
   Worker/bwrap path using fake native peers, a minimal environment, isolated
   homes, and absolute binaries. Prove every descendant dies with the Worker.
3. Through the real Server→Core→Worker path, prove a candidate event is durable
   and client-visible before terminal completion; retain exact native identity
   across a second turn; distinguish user cancel, peer disconnect, and timeout.
4. Prove two proprietary paths through the plugin envelope: Codex advertised
   reasoning/config or plan events, and OMP undo/redo authority. Unknown
   profile/capability/variant/action parameters must fail before execution.
5. Add the asynchronous permission-resolver patch and tests with allow, deny,
   timeout, disconnect, and stale-decision cases. Keep approval-requiring tools
   disabled until it passes.
6. Run the 37 idempotency and streaming repair gates separately; do not infer
   them from adapter tests. End the slice before any credential or real model
   use. A later source-authorized work order may add one real Harness at a time.

Acceptance is hands-on: the user sees the fixed third-party provenance, starts
the isolated fake slice, observes a live pre-terminal event and native
extension, resumes the same identity, cancels it, and sees the whole Worker
process tree disappear. Failure of the thin-glue gates returns the decision to
`NO_FIT` instead of expanding the implementation.

## Upgrade path

Never float a branch, npm range, `npx`, or native binary. To upgrade:

1. clone a new tag/commit into an owned research root;
2. regenerate the source allowlist, hashes, production lock, artifact
   integrities, licenses, and separate build SBOM;
3. inspect upstream diffs in every reused call path and rebase the small
   permission patch with prominent change notes;
4. run the Harness Remote seam against its new checkout and the Codex ACP seam
   against the newly locked downstream adapter; keep the Agent Controller and
   acpx experiments as comparison evidence for their own fixed sources;
5. run the future Server→Worker fake acceptance, then Windows/WSL process tests;
6. require a new explicit source authorization before any real provider test.

There is no unattended upgrade. A change that breaks the source closure or
requires a lifecycle fork triggers a new selection review.

# Round-two Stage C addendum

## Updated decision

**Retain** the conditional Harness Remote `v3.0.2` recommendation for a future,
separately authorized minimal extraction spike. The broader search did not find
a stronger candidate under the same evidence standard. This is a conclusion
about the source-locked candidates in [search-coverage.md](search-coverage.md),
not a claim that every public or private project in the ecosystem is unsuitable.

**Defer** `beyond5959/acp-adapter v0.3.8` as the best newly found prospective
backup. It has the clearest alternative reuse boundary and three real embedded
lower implementations, but the unavailable Go 1.24 toolchain prevented its
fake suites from running. It is not behavior-qualified, Windows-supported, or
WSL-qualified in this round.

Keep `openclaw/acpx` as a reusable ACP-host component. Its imported fixed
runtime passed the bounded experiment, but a complete multi-Harness solution
still depends on separately fixed native adapter packages. The experiment did
not prove two different Harness-specific extension paths, and acpx's default
registry is a dynamic range/`npx` supply chain. It therefore does not replace
Harness Remote or count as a fully qualified backup.

The remaining source-locked candidates are eliminated or retained only as
references: LinkCode has the strongest large native adapter set but a BUSL-1.1
Competitive Offering clause that may block the contemplated use pending
legal/product review, plus about 55k relevant lines; Paseo, Mjolnir and
CodexHost need
large product/control-plane extraction; AgentPool has multiple current safety
and lifecycle defects; Agent API and Agent Mux lack the required native
lifecycle fidelity.

This addendum updates the recommendation only. It does not authorize the
Harness Remote extraction, production edits, real Harness/provider/model calls,
login, credential reads, or Work Order 37 repairs.

## Same-standard final comparison

| Option | Upstream source that would be reused | AgentBox-owned glue required | State/control-plane fit | Native fidelity evidence | License / upgrade cost | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| Harness Remote `v3.0.2` | About 6,072 reviewed bridge lines: profile registry, ACP client/service, three native journal readers, OMP actions, OpenCode host/SSE/router; fixed Codex ACP lower artifact | Generic sidecar envelope, Worker isolation/cleanup, artifact verifier, projection-only persistence, and one asynchronous permission-resolver patch | Candidate task/registry/worktree stores are excluded; Windows remains authoritative and Worker owns the bounded projection | Separate fixed-component fake seams passed pre-terminal events, resume, cancel/disconnect, invalid variants, the Codex ACP app-server path, and OMP/OpenCode-specific paths | Apache-2.0 source snapshot; exact offline npm/native artifacts and patch rebase required per upgrade | **Retain conditional leader** |
| `acp-adapter v0.3.8` | About 17.3k Go lines: public embedded Codex/Claude/Pi runtimes, shared ACP server, provider clients/supervisors, and fake fixtures | Go sidecar or Worker bridge, generic AgentBox event envelope, isolated native roots, artifact/SBOM packaging | No product DB/scheduler; native processes and sessions stay in provider backends; Windows remains authoritative | Source has Codex app-server, Pi RPC, Claude stream-json, native resume/approval/cancel/errors; no suite executed here | MIT, no third-party Go module requirements; Go 1.24 build, Windows packaging and WSL behavior unresolved | **Prospective backup; qualification deferred** |
| `acpx ffbefbb` | About 10.5k TypeScript ACP/runtime lines: client, manager, public contract, injected store/registry/env/process lifecycle | Generic sidecar envelope, outer minimal environment, in-memory/projection store, exact registry, plus separately sourced and licensed lower adapters | Store injection fits bounded projections; CLI file store and queue/flow features are excluded | Imported runtime passed common lifecycle, identity, config, permission, cancel/disconnect and cleanup observation; two native extension paths and its own Codex app-server are absent | MIT; fixed core lock is available, but default adapter ranges and `npx -y` must be replaced by exact artifacts | **Reusable component, not full backup** |
| LinkCode `22c337f` | Roughly 55k relevant TypeScript lines plus workspace schema/transport/common | Major workspace extraction, environment/home hardening, persistence replacement, package/build separation | Daemon SQLite can be excluded, but engine/session types and private monorepo remain coupled | Strong source evidence for Codex app-server, Pi, OpenCode and Claude native behavior | BUSL-1.1 Competitive Offering clause may cover the contemplated paid hosted/embedded use; legal/product applicability review is required | **Do not recommend** |
| Paseo `d1b705a` | Provider registry/contract plus Codex, OpenCode, Claude, Pi, OMP and ACP adapters | Large contract cut from AgentSession/timeline/workspace/git/process/MCP/history | Daemon stores can be excluded, but provider code is deeply shaped by Paseo product state | Rich source evidence; no directed build/test in this round | Apache-2.0; about 105k provider-tree lines and large dependency closure | **Reference only** |
| CodexHost `38903be` | Strong Harness plugin loader/contract and Pi/OpenCode/Claude/OMP adapters | Codex would require extracting official host, persistence/account/remote logic, renderer protocol and Rust shim | Codex is part of the Desktop control plane and explicitly reserved from plugins | Four plugin adapters are strong; no reusable Codex plugin exists | MIT root; multi-package Node/Rust closure and dependency-license audit required | **Reference only; full candidate fails** |
| AgentPool `b6ddbea` | Codex/Claude/ACP agents plus broad shared framework | Multiple safety fixes and a 20k+ line lower-bound framework extraction | Full object creates storage/jobs/process/todo control planes and real-home side effects | Current source loses denial, EOF, finish and cancel fidelity in critical paths | MIT root, 389 locked packages, dynamic registries/installers | **NO_FIT** |

## Alternative reuse trees

The retained Harness Remote tree and process/data flow above remain the proposed
first slice. The two new options would have these boundaries if a later work
order investigates them; no directory is created now.

```text
acp-adapter prospective backup
plugins/agent-box-harnesses/             AgentBox generic registration only
└── runtime-go-sidecar/                   generic envelope + provenance
    └── third_party/acp-adapter-v0.3.8/   upstream-owned Go module
        ├── pkg/{codexacp,claudeacp,piacp}/  embedded public runtimes
        └── internal/{acp,codex,claude,pi}/  native lifecycle implementations

WSL Worker                              process group, bwrap, limits, cleanup
└── Go sidecar
    └── chosen embedded runtime
        └── native Harness child         isolated HOME/XDG/provider state

Windows Server                         Profile/Session/execution authority
```

The acceptable AgentBox changes would be the sidecar envelope, provider-neutral
selection, environment/process setup, provenance validation, and opaque
checkpoint transfer. Implementing ACP or any of the three branded lifecycles in
AgentBox would fail this reuse boundary.

```text
acpx component option
plugins/agent-box-harnesses/             AgentBox generic registration only
└── runtime-node-sidecar/                 outer env + generic envelope
    ├── third_party/acpx/                 fixed upstream runtime/ACP host
    └── artifacts/adapters/               separately fixed ACP executables
        ├── codex-acp + bundled Codex     app-server lower path
        └── second native adapter         still must prove proprietary behavior

WSL Worker                              process group, bwrap, limits, cleanup
└── acpx createAcpRuntime
    ├── injected in-memory projection store
    ├── injected absolute-command registry
    └── candidate-owned child lifecycle observer

Windows Server                         Profile/Session/execution authority
```

This option has a clean host boundary but a weaker completeness claim: acpx
owns ACP client semantics, while the required multi-Harness native
implementations and their supply chain live in separate projects. If AgentBox
must add branded translation or compose a new adapter framework around those
artifacts, the option becomes `NO_FIT` under Work Order 38 rather than a backup.

## Outstanding proof before any implementation decision

Harness Remote still needs the previously listed thin-glue spike gates. The
round-two evidence adds these decision facts:

- `acp-adapter` needs a Go 1.24 environment to run only its fake fixture suites,
  then a source-locked Windows/WSL packaging and process-tree review. A pass
  could promote it to a genuine backup without changing the current leader.
- acpx would need exact offline lower adapters and two distinct proprietary
  capability paths. Its outer sidecar must start from a minimal environment
  because `agentProcessEnv` is an overlay on the parent environment.
- LinkCode cannot advance without legal/product review of whether the contemplated
  use falls within its Competitive Offering restriction; no code test can resolve
  that applicability question.
- No selected candidate repairs Work Order 37 idempotency, Server event
  publication timing, role-state honesty, or Windows state authority. Those
  remain separately dispatched production work.

The user decision remains whether to authorize a new no-model Harness Remote
extraction work order under the original bounded gates. This research does not
make that decision on the user's behalf.
