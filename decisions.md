# Decisions currently in force

The old ruling ledger (`rulings.md`, 81 numbered ids `R-0001`…`R-0081`) is
preserved verbatim in `archive/legacy-scheduling/`. **This file is not a copy of
it.** It carries (1) the rules that still govern this workspace, (2) the product
decisions that are still binding, (3) the replacement chains, and (4) everything
the records do not settle. Where a fact lives in another file of this control
directory, it is linked, not restated.

Every entry names its source. Sources are `R-00xx` (old ruling ids, resolvable in
the archive snapshot) and `D-000x` (new entries created by this handover —
append-only; to overturn one, add a new entry that says `supersedes: D-000x`).

---

## Part 1 — Authority in force right now (handover state)

### D-0001 — `control/` is the single current scheduling authority
**In force.** Created 2026-09-20 by the cleanup, on the user's instruction to
migrate the scheduling entry point. The old authority
(`agent-box-server-round1/docs/implementation/`) is retired to history; the old
rules file keeps a migration pointer but no authority. Renaming this file's
directory is the only way to move the authority.
**Source:** user instruction 2026-09-20; see [migration-log.md](migration-log.md) M-9.

### D-0002 — `I` is the only interface to the user
**In force.** Direction, cross-layer trade-offs, authorisation boundaries and the
delivery conclusion belong to `I`. No other session, file or role may put a
question to the user, and the old one-way channels (`handoffs.md`, `bulletin.md`,
`approval-queue.md`, `rulings.md`) are retired with their authors.
**Source:** old `R-0067`, `R-0070` (I rules / ops executes), `R-0071`; preserved.

### D-0003 — No executor is appointed; therefore nothing may be dispatched
**In force.** The former formation is stopped (user, 2026-09-20): the background
scheduler `ops`, the acceptance poller `A`, the QA line, the two reviewers, the
scout, and the four executor trees (backend service, runtime, desktop chat,
desktop settings). `backlog.md` is a record of unfinished work, not a queue.
`I` appoints executors before any work order is issued.
**Source:** user instruction 2026-09-20; old `R-0054`, `R-0057`, `R-0062`,
`R-0079`, `R-0080` describe the formation that is now stopped.

### D-0004 — This control directory inherits no old machinery
**In force.** It carries neither the `incremental-work-order` skill's mandatory
polling loop nor any previous session's writer identity. The `ops` loop ended
with its session and is **not** restarted by anything in this workspace.
**Source:** user instruction 2026-09-20 (do not restart the loop, do not resume
its queue); the old loop is described at `scheduler-charter.md` §2–§3b.

### D-0005 — Hard boundaries carried over unchanged
**In force.** (a) No `git push`. (b) `R-0035` merge freeze: no merging product
branches into `main` until the user announces a first usable version — still in
force, never lifted. (c) The publishing `main` checkouts are not to be
overwritten. (d) Real model calls were authorised against the user's DeepSeek
account with itemised accounting and no fixed cap (`R-0011`, `R-0017`, relaxed
ceiling per order `46`); that authorisation belonged to the stopped sessions and
**does not transfer** — a new session may not spend on the user's account without
a fresh grant from `I`. (e) Credential contents are never read, printed or
copied; only locators are recorded.
**Source:** `R-0035`, `R-0011`, `R-0017`, `R-0001`; manifest `orders[46]`
`model_authorization`; see [environments.md](environments.md) for locator paths.

---

## Part 2 — Product decisions still binding

These do not depend on the old formation; they constrain whatever is built next.

| # | Decision | Source |
| --- | --- | --- |
| D-0006 | The product is named **Ordessa**. `AgentBox` survives only as internal/source naming. Contradictory documents must be fixed. | old `R-0072` |
| D-0007 | Model settings are two layers: **Provider** (account/credential) and **Profile** (provider + model binding). One profile per session. | old `R-0013`, `R-0008` |
| D-0008 | Three product stages: usable → daily-usable → bright core. "Daily usable" scope = configuration + subscription login + breadth across families. | old `R-0018`, `R-0037` |
| D-0009 | **Windows holds the persistent Profile/Session authority**; the WSL/remote side holds bounded execution projections, not a second authoritative store. | old `R-0012`, `R-0014`; master plan §所有权 |
| D-0010 | **Reuse existing third-party Harness integrations is mandatory** — an ACP SDK, a single adapter, or a "referenced and self-written" shim does not count as having reused the integration. | master plan §当前顺序与验收 |
| D-0011 | Truncation must be visible: a long answer is either complete or carries an explicit stop reason; silent loss of the tail is a defect. No new vocabulary — reuse the four ACP stop values. | old `R-0081` ① ; `status.md` round 167 |
| D-0012 | Child-turn lifecycle follows the parent's wait mode; watching turns die with the parent; background execution is a design card only, not implemented. | old `R-0075` |
| D-0013 | Slash-command text is split by source: backend-sourced strings stay as they are; desktop-local strings go through i18n. | old `R-0074` |
| D-0014 | A checkpoint must be tagged at every user-visible order close. | old `R-0053` |
| D-0015 | Facts are graded: **measured / quoted / unverified** must be labelled, and a mechanism (fake-endpoint) proof never substitutes for a real-model proof, or vice versa. | `README.md` §4; `status.md:31` |

---

## Part 3 — Replacement chains (which decision replaced which)

| Chain | Evidence |
| --- | --- |
| `R-0027` ⑦ → **`R-0028`** | rulings.md:70 |
| `R-0037` ④ → **`R-0038`** | rulings.md:60 |
| `R-0025` ③ → `R-0044` ③ → **`R-0054` ②** (who may write rulings/approvals) | rulings.md:52, :36 |
| `R-0040` (QA line created) → `R-0054` ① (cut) → **`R-0057`** (reopened, narrow) | rulings.md:36, :33 |
| `R-0054` ① (scout cut) → **`R-0062` ③** (scout restarted, UI-first) | rulings.md:36, :28 |
| `R-0040` counts "154/22/1042" → **`R-0046` ④** (voided) | rulings.md:50 |
| `R-0007` approval tiers → extended by **`R-0032` ⑤** | rulings.md:66 |
| order `45` design §6 → **`R-0012`** | rulings.md:95 |
| `R-0036` ② queue order → `R-0054` ⑥ → **`R-0079` ② / `R-0080`** (charter queues voided) | rulings.md:11, :10 |
| Window `ACC-R3` → **`R-0044`** (`superseded`) | rulings.md:52; gate-log window table |
| Window `ACC-R4n` → **`R-0063`** (`superseded`) | rulings.md:27; gate-log window table |

All of these are **history**: they explain how the records reached their present
shape. Only the parts listed in Part 1 and Part 2 are live instructions.

---

## Part 4 — Conflicts found in the records (both sides kept, nothing invented)

The cleanup was told not to decide these by timestamp. Each was checked against
the original text.

| id | Conflict | Both pointers |
| --- | --- | --- |
| **C-1** | `AQ-0013` (Worker `stopReason` field) is recorded as **approved** by the user, but its row still sits under the `## proposed` heading in the approval queue. | approved: `rulings.md:24` ("`AQ-0013` 获批（用户 22:38「我同意」）"), and `R-0081` ② cites it as an approved precedent (`rulings.md:13`); still proposed: `approval-queue.md` AQ-0013 row. Contrast: `AQ-0012` *was* moved to `approved` (`approval-queue.md`, `rulings.md:29`). Not determinable from the records which is authoritative. |
| **C-2** | The QA line is simultaneously described as frozen and as reopened. | frozen: `scheduler-charter.md:254` ("`R-0040` QA 线（**已被 `R-0054` 冻结**）"); reopened: `scheduler-charter.md:205` ("QA＝集成验证线（2026-09-19 20:1x **重开**，窄口径，`R-0057`）") and `rulings.md:33`. The charter's own "currently in force" list is stale. |
| **C-3** | The scout role is simultaneously cut and restarted — same shape as C-2. | cut: `rulings.md:36`; restarted: `rulings.md:28`, `scheduler-charter.md:207`. |
| **C-4** | `108` (output cap) has three mutually inconsistent recorded states. | `gate-log.md:73` says the symptom disappeared **and**, in the same line, that `108` stays PARTIAL; `gate-log.md:45`, `:60`, `:86` say PARTIAL; the manifest says `PARTIAL`; `rulings.md:9` re-affirms silent truncation is still happening. Only "PARTIAL / not judged DONE" is consistent. |
| **C-5** | `134` is recorded `DONE` in one place and still un-done in another. | `rulings.md:24` ("消费侧 `134` 已 `DONE`") vs manifest `orders[134].state = DISPATCHED`, and `rulings.md:9` still lists the visible-truncation work as un-done. |
| **C-6** | Several orders are `DONE` in the manifest with no matching acceptance row — including `P42` and `110`, the two gaps that forced the `ACC-R3` window to be withdrawn. | manifest `orders[42]/[110]`; window withdrawal: `gate-log.md` ACC-R3 row. No later window covers them. Not determinable whether an acceptance happened outside `gate-log.md`. |
| **C-7** | Two decided `AQ`s have no row at all in the approval queue. | `rulings.md:77` (`AQ-0004` approved) and `rulings.md:35` (answer to `AQ-0010`) vs `approval-queue.md`, which contains no `AQ-0004` or `AQ-0010` row. |
| **C-8** | The recorded formation size is stale. | `prefs.md:27` ("ops + A + 审阅者×2 + 执行者×4（8 个 Qoder 会话）") does not include the reopened QA line (`R-0057`) or the restarted scout (`R-0062` ③). |
| **C-9** | `rulings.md` is described as append-only but its ids are not in monotonic line order. | e.g. `R-0072` at line 16 precedes `R-0073`/`R-0074`; `R-0064` at line 24 precedes `R-0065`/`R-0066`. Content is unaffected; possibly intentional back-fill. |
| **C-10** | `BACKEND_IMPLEMENTATION_READY` is recorded as both registered and not. | registered: `status.md:74`, `:90–94` (registered on user authorisation + executor self-review); not achieved: `status.md:32`, `:88`, `:123–127` (still "否", missing the fixed reviewer's stage closure). The closure-source field itself says the reviewer never returned `ACCEPT`. |
| **C-11** | Orders `52` and `54` are `PARTIAL` in the registry but "`READY_FOR_EXECUTION`（实现未开始）" in the retired status table. | registry: `manifest.json` `orders[52]/[54].state = PARTIAL`; retired text: `status.md:67`, `:69` (table dated 2026-09-15/16, never revised after dispatch). Both readings are kept; the table is stale, but "stale" is a judgement the cleanup does not make. |
| **C-12** | Order `146` is `PARTIAL` in the registry but recorded `DONE` in the polling ledger. | `manifest.json` `orders[146].state = PARTIAL`, `terminal = DELEGATION_RECOVERY_GATE_AND_LATEST_READ_PARTIAL`; `status.md:2033`, `:2035` ("`146` 收口 ⇒ `DONE`", "`DISPATCHED`→`DONE`"). |
| **C-13** | Orders `128`, `129` and `P36` are `DISPATCHED` in the registry, but their own round announces 收口 — and that round's own ledger lists only `140`→DONE. | `manifest.json` `orders[128]/[129]/[P36].state = DISPATCHED`; announcement: `status.md:1907–1908`; contradicting ledger: `status.md:1913`. Not determinable whether the transition was recorded. |
| **C-14** | The `ACC-R5` window header says the app runs on the WSL side, but every later note says it is the Windows frozen copy. | header: `gate-log.md:16` ("应用 `ordessa@0.17.2`（WSL 侧、CDP 9222）"); later: `gate-log.md:108` (P-22, "应用这条腿从 WSL 换到 Windows 侧"), `:114` (P-24), `:121` (P-26) — Windows frozen copy at `C:\Users\maoqh\agentbox-wsl-round1`. The header row was simply not updated. Same table also predates the `Q2-P58-rev1 = 6f5a10cb` tag (`gate-log.md:124`), which was recorded as *not* a re-pin. |
| **C-15** | `terminal` codes ending in `_DONE` sit on rows that are demonstrably not done. | `154` = `OUTPUT_CAP_LAYER_AND_CUT_VISIBILITY_DONE` while the same records list it as never claimed; `151` = `CREDENTIAL_ENTRY_SURFACE_DONE` while stage 2 was in flight. 38 rows total. The manifest never defines `terminal`; see [backlog.md](backlog.md) for why it must be read as a dispatch-time target code. |

---

## Part 5 — Unresolved: needs `I` (see cleanup-report §7 for the short list)

| id | Question the records do not answer |
| --- | --- |
| **U-1** | Was `BACKEND_IMPLEMENTATION_READY` actually banked, and on what authority? The records show a registration whose own closure-source field says the independent reviewer never accepted. This determines whether the two sides ever counted as "both ready" (order `42`'s dual gate). |
| **U-2** | Is `108` (output cap / silent truncation) still an open defect at the level the user cares about, or was the symptom superseded by later orders? `R-0081` treats it as live; `gate-log.md:73` treats the symptom as gone. |
| **U-3** | Did the Worker `stopReason` contract change (`AQ-0013`, approved) actually land? It determines whether order `156` is building on a contract that exists. |
| **U-4** | Merge window: `R-0035` freezes merges until the user announces a first usable version. No announcement is recorded. Does the freeze still hold as written? |
| **U-5** | Role truth: is the QA line / scout alive or cut (C-2, C-3)? This matters only if the formation is rebuilt; it does not affect the product. |
| **U-6** | Cloud verification line (old `R-0047`/`R-0048`/`R-0049`): the records say "mechanism proven" and leave three user decisions open (`rulings.md:54`). No follow-up. Whether that mechanism is still wanted is a `I` decision. |
| **U-7** | Skill repository version: whether to tag 0.3.0 and re-sync the installed copy was left to the user (`rulings.md:29`, `:31`). No decision recorded. Out of scope for this cleanup. |

## Part 6 — 2026-09-21 native Linux direction

### D-0016 — Native Linux first (user decision)

Source: user-facing session, 2026-09-21: Windows remote-to-WSL product line is
deferred; native Linux is the first delivery target. Preserve existing Windows/
WSL code and history; deferral is not deletion or a compatibility guarantee.
**Supersedes D-0009's mandatory Windows location for this native Linux line.**
Retain the single-authoritative-store invariant; the precise local service/data
layout must be specified and verified during baseline integration. No credential
or user-data migration is authorised by this direction alone.

### D-0017 — Converge before business parallelism (user direction; plan pending)

First inspect current trees and establish one product checkpoint, then split
worktrees by business outcome. See `linux-native-baseline-plan.md` for the
proposed checkpoint gates, roles and boundaries. This records the direction,
not approval of all implementation details. Product branch merging remains
prohibited by AGENTS.md; a scoped exception is needed for integration branches.
No executor has been appointed and no feature order has been dispatched.

### Evidence correction E-001 — integration history

The cleanup inference “no cross-repository integration ever occurred” is
withdrawn: archived `status.md:90–101` records authorised takeover and
`docs/acceptance/round-5.md` ACC-R5-10 records five UI replies. This does not
manufacture independent-review ACCEPT, close defects, or grant user acceptance.
Original archive and cleanup report remain unchanged as provenance.

### D-0018 — Integration branches and native Linux development authorised

2026-09-21, user explicitly confirmed the proposal: create new branches, combine
existing work into the new product line, then develop native Linux there.
**Supersedes D-0017's pending-authorisation condition and the blanket product
merge/code freeze only for this scope.** Each of backend and desktop may create
`integration/linux-native-0` in a dedicated worktree, integrate the four primary
implementation lines, and implement native Linux adaptations. Other historical
branches require relevance/content audit before selecting additional changes;
this is not an instruction to merge every branch blindly.

These branches together form the candidate product mainline; publishing `main`
branches remain unchanged. No push, deletion of old worktrees, user-data or
credential migration, or interference with existing services is authorised.
No executor has yet been appointed. This is implementation authority, not a
claim that a branch, unified checkpoint or user acceptance already exists.

### D-0019 — Appoint Qoder investigation assistant

2026-09-21: user has opened Qoder and requested its task prompt. I appoints that
session as the bounded investigation assistant for `tasks/LNX-001-qoder-audit.md`.
It may read scoped product sources and write only `control/reports/LNX-001/`.
This updates the previous “no executor appointed” state only for investigation;
no product implementation executor or background scheduler is appointed.
Task issued; receipt/running/completion require the assistant's own report.

### D-0020 — Integration baseline and bounded assignments

2026-09-21 I reviewed LNX-001; findings and qualifications are in
`LNX-001-review.md`. This supersedes the earlier proposed backend service starting
point: use runtime as backend base and retain service wire changes; desktop starts
from chat and incorporates settings. Use isolated test roots, no user-data migration.
LNX-002 appoints one user-launched DeepSeek session as candidate integration writer;
LNX-003 appoints the Qoder assistant for bounded read-only follow-up. Tasks are issued,
not yet acknowledged/running. No old scheduler or feature-development queue resumes.

### E-002 — Candidate stop-reason claim corrected

I verified `003b52b2` changes only the 156 work-order document (134 added lines).
It is not evidence that message.final stop-reason production was implemented.
The candidate manifest is corrected accordingly. Static absence of a field spelling
does not establish runtime reproduction; truncation repair remains unverified.

### E-003 / D-0021 — Follow-up evidence and integration test scope

LNX-003 supersedes LNX-001's broad media-choice and absent-stopReason claims.
See `LNX-003-review.md` for I's qualifications and binding LNX-002 update:
test PNG through the actual handler, controlled max_tokens through persistence/
projection, and default Linux credential refusal. Existing credential import
HTTP/IPC code is recognised; Linux persistent SecretStore remains absent in the
inspected composition. Backend main's additional plugin lineage is preserved
but excluded from this two-source integration pending architectural evaluation.
No new feature executor is appointed. Qoder's LNX-003 investigation is concluded;
the DeepSeek writer continues LNX-002 and must acknowledge this update.

### D-0022 — Source snapshot recorded; bounded changes requested

I verified LNX-002 candidate HEADs and matching schema digests, then reproduced
3 failures / 24 passes in a targeted run. The run incorrectly printed
GREEN_NO_SKIPS despite pytest exit 1. `LNX-002-review.md` records the findings
and authorises the existing integration writer's bounded follow-up fixes.
No promotion to runnable/user-accepted checkpoint or business parallelism yet.

### D-0023 — Resolve ambiguity mapping and ACP result loss

I authorises the existing LNX-002 writer to perform the two bounded fixes in
`LNX-002-runtime-ruling.md`: preserve dispatch ambiguity independently of cause
codes, and carry the actual ACP turn stop reason through the existing bridge.
The strict xfail is temporary evidence, not a resolution. No real-model calls,
new harness integration, user-data migration or unrelated feature expansion.
Independent review follows the corrected candidate and its regression evidence.

### D-0024 — Organisation first; development baseline fixed

User corrected the priority: organise worktrees before extending bug repair.
Already-completed LNX-002 repairs are retained at the SHAs in development-baseline.json.
I records linux-native-dev-0 as the shared source starting point with known defects;
this supersedes D-0022's prohibition on business worktree derivation. Independent
review and all-green tests are not prerequisites for organising/branching development.
LNX-001/002/003 assignments are concluded; no further repairs under their old cards.
development-layout.md defines current vs preserved tree roles and next business lanes.
No new feature writer appointed yet; new implementation requires a bounded task card.
No push, publishing-main change, historical-tree deletion or user-data migration.

### D-0025 — First Pi GUI loop

User requests mcode to map conversation capabilities and then attempt a first real
Pi loop through our Desktop, before expanding product scope. I appoints one mcode
writer for tasks/C1-001-pi-loop.md. It may create work/pi-loop-0 in the two dedicated
worktrees from dev-0 and make the minimum changes/isolated runs required. This is
a scoped extension of the branch-write boundary beyond integration/linux-native-0;
the fixed baseline and old trees stay unchanged. Necessary limited real Pi requests
may use an existing authorised account via application credential handling under
the task's stated limits; no secret disclosure or user-data migration. Missing
account/access is reported to I, not bypassed. Task issued, not yet acknowledged.

### D-0026 — Frontend extensibility first; backend work deferred

User explicitly prioritises a generic slot-based Harness GUI: adding a service
should use adapter/component registration without modifying the core for already
supported semantics. This supersedes D-0025's backend/real-loop-first execution.
The same mcode session follows tasks/C1-001-frontend-first.md, writes only its
desktop task tree, preserves existing backend work, and pauses new backend/model
work. Reuse the existing contribution/Slot framework where suitable; validate a
neutral session boundary with the existing service adapter and a labelled test
adapter. Pi real-loop verification follows frontend readiness. Task amendment
is issued; the running session must explicitly acknowledge receipt.

### D-0027 — Architecture implementation on hold; design-loop preparation

User supersedes the frontend implementation direction: first discuss product
intent, then prepare an adversarial design/refinement loop. Confirmed intent is
an extensible Agent-oriented Desktop independent of a mandatory Ordessa backend;
conversation/tool/model is not predetermined as its core. Current reference:
product/agent-desktop-design-brief.md. Scenarios and loop limits there are I's
proposal, not a launched overnight job. Prior C1 frontend refactoring is on hold;
preserve current work and services. No new implementation or unattended loop started.

### D-0028 — Backend coordinated research and implementation design

User approves the S/E/H/P groups and central coordination model documented in
product/backend-coordinated-loop.md. This supersedes the backend-deferred planning
direction of D-0026, but does not resume C1, legacy queues or any existing writer.
Research precedes design approval and bounded implementation. H is ACP-first;
P prioritises reuse; E must withstand boundary attacks; S first coordinates the
execution migration then accepts centrally assigned product-module tasks.
Backend Sol budget is ten calls, separate from frontend's ten: two reserved for
E design and implementation acceptance; H at most three, not reserved. Only the
central coordinator may invoke Sol, with risk-based allocation after central review.
The plan is recorded, not a running formation. Exact write allowlists, filesystem
isolation tests, immutable baseline and startup controls require I's readiness
acceptance before launching groups. Existing code/data/services remain untouched.
Public protocol/Core changes and real-Harness credential/model use require explicit
scope approval; general overnight persistence does not grant that authority.

### D-0029 — Native Qoder goals, implementation enabled

User explicitly requests switching to native goal sessions with implementation,
not a research-only night. backend-loop/GOAL-START.md supersedes D-0028 startup
gates and historical sandbox/fake-only instructions. Five user-launched Qoder
sessions may research, obtain C approval, implement bounded tasks, and integrate.
I created four source worktrees at fixed dev-0, branches work/be-goal-<group>-0.
No models launched by I. Full bwrap isolation is not active; ordinary-session
path/credential/reviewer restrictions are task rules, not OS-enforced guarantees.
E's mandatory two reviews, H cap three and backend total ten remain in force.
Only C invokes actual Sol with prior budget reservation; fake tests never qualify.
No push, publishing-main changes, old-service operations or credential disclosure.

### D-0030 — Profile as an independent capability

User confirms independent Profile ownership for identity, versions, persistence,
configuration composition and immutable execution snapshots. H retains only
Harness-specific configuration declaration, validation and native translation.
I dispatches tasks/BE-PROFILE-001.md to C for S/E/H research and a coordinated
separation proposal; implementation/data migration under this new task awaits
I's proposal approval. Existing approved S/E snapshot work continues unchanged.
No new group, model replacement or review quota is authorised by this decision.

### D-0031 — Resume backend goals with coordination v2

User confirms all five sessions paused and requests inspection and restart prompts.
I verified five handovers, group HEADs and the existing budget (4/10 consumed).
backend-loop/COORDINATION-V2.md governs the resumed C/S/E/H/P formation: C-owned
short task board, explicit ownership and handoff, active collection, scoped
approval and integration, and task-local rather than formation-wide blocking.
C may commit explicitly handed-off, stopped, approved work after exact scope
verification; unresponsive writers are not presumed stopped. Stable-snapshot
takeover requires a separate tree and recorded ownership transfer, never an
unannounced concurrent writer. Product authority, review caps and D-0030 remain.
S 405b8b4 resolves the old missing-commit blocker; C first verifies and integrates
the paired S/E beta2 increment, then dispatches bounded continuation and Profile
research. I updates instructions only; user launches/resumes the five sessions.

### D-0032 — Implement minimal ACP-centric H structure; user controls expansion

User approves the minimal H structure: generic ACP core plus per-Agent integration
packages, with host request handlers injected rather than implemented inside H.
I issues tasks/BE-H-MINIMAL-001.md through C. C may approve bounded equivalent
refactoring and migration; new capabilities, custom extensions or boundary
expansion require user approval through I. Moving generic file/terminal/Profile/
credential/runtime responsibilities into per-Agent helpers or adapters is forbidden.
OpenCode native ACP is the preferred migration target, subject to actual pinned
version and behavior verification. No premature deletion or unapproved data
migration; D-0030 Profile authority migration remains proposal-gated. Existing
in-flight work is preserved. Review budget and other safety boundaries unchanged.

### D-0033 — Product rulings for completion, streaming and retention

User approves truthful distinguishable terminal/cancellation facts and timely
upstream streaming without a per-character or fixed-latency promise. Minimal
compatible public protocol changes necessary for those facts are authorised,
subject to C-reviewed S/E/H design, versioning and verification; unrelated
capability expansion remains I-gated. OpenCode ACP migration takes priority over
expanding the legacy SSE driver. Retention approval is principles-only: temporary
execution copies, recovery copies and version history are separate classes;
no existing-data deletion or new automatic cleanup policy is authorised before
a concrete retention/recovery proposal. Profile authority migration and unresolved
redistribution remain separately gated. Dispatch and precise bounds are recorded
in reports/BE-LOOP-001/goal/decisions/I-product-rulings-0033.md.

### D-0034 — Implement modular Agent Desktop v1 in an isolated tree

User approves creating a new Desktop worktree and a basic plan for a user-launched
Sol executor to refine and implement. Task: tasks/FE-MODULAR-001.md. Scope is a
small extensible shell, capability contracts, Ordessa connector, conversation UI
and a separate model-settings extension. Functional reference is the user's
description of DeepSeek Harness Web UI, not an independently verified parity claim.
The new apps/desktop-modular entry preserves the old application. Branch
work/desktop-modular-v1 starts at 80872f556c001b42217d43bf5f73ab08029bfcb9 in
worktrees/desktop-modular-v1. D-0027 implementation pause is superseded only for
this task/tree; the previous frontend research loop is not resumed. In-scope
design refinement, implementation, tests and local explicit-path commits are
authorised without a second design gate. No executor/model is started by I.
No backend writes, publishing-main changes, push, existing-service operations,
real credential access or real model calls are authorised. Existing FE/BE reviewer
budgets remain unchanged. Product acceptance remains the user's decision.

## Part 7 — 2026-09-25 baseline closeout

### D-0035 — Local baseline main created per user's "merge with small issues" ruling

User (direct instruction to the closeout session, 2026-09-25): merging a baseline
main while carrying the known small issues is acceptable. Acting on it, the
closeout session created local branch `main-cp-001` in each of the three repos,
pointing at the frozen CP-SESSION-001 candidate tips: backend `a0b343e0`
(work/hd002-bc-native), desktop `450944bd` (work/hd002-fc-functional), bridge
`41d9d94` (work/round-h). Branch pointers only — no working tree moved, nothing
pushed, publishing `main` branches untouched (backend publishing main is still
the studio-era `6c14ea8d`, a diverged lineage; promotion to it remains a
separate explicit release decision, not granted here). The carried issues are
exactly CP-SESSION-001 §5 (stop does not interrupt in-flight tools; approval
card lacks timeout feedback; one uncharacterized flaky bridge test; input-box
scroll pending confirmation; deliberate old-chain test reds). This entry is the
user's acceptance of merging WITH those issues; it is not by itself
`USER_ACCEPTED` for CP-SESSION-001, which still awaits the user's own trial
verdict. **Source:** user instruction 2026-09-25; see
missions/HD-002/integration/CP-SESSION-001.md.
