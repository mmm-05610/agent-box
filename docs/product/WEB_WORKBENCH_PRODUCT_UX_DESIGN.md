# Executive verdict

Agent-Box Web Workbench should be a **fact-and-decision desk**, not a workflow designer and not a generic launcher. Its governing sentence is: **the past is governed fact; the future is an open human decision.** A Work is therefore an objective with a chronological record of accountable attempts. An Execution is the only place where an attempt is composed, frozen, observed, finished, and audited.

The recommended information architecture is a three-area application: **Works**, **Executions**, and **Integrations**, with Settings as a utility route. The default is Works, not an invented global “pipeline” view. A Work overview tells the human what has happened and what they may decide next; an Execution detail owns the operational truth. The recommended P0 is deliberately narrower than the desired complete product: it can only render data actually exposed by the current Local Web Host. Missing descriptor/diagnostic APIs must be added in a later, explicitly approved backend slice, not simulated in Web.

This verdict is based on the current Host/API, `gui-web/src/App.tsx`, CSS/i18n, plugin SDK, and browser E1→E2 test as inspected on 2026-08-29. In particular: binding drafts and Host operations are Host-owned projections; frozen input and finalization are Core facts; selectors expose bounded fields/choices/preparation but no product UI adapter; and the Web must not name Git, Codex, tmux, or any contract in application code.

# Current UX audit

The current application is a single `App.tsx` with a sidebar plus one Work card. It has no stable browser route, no separate Execution page, no integrations page, and it renders all stages of every Execution inside the Work history card. `index.css` contains two overlapping base layers, which explains the inconsistent visual language. The existing i18n bootstrap is not used by this UI and its resource pack still describes the retired configuration product.

| Walkthrough step | Current behaviour and missing information | Unsafe/confusing action and demo risk |
| --- | --- | --- |
| Work list | Sidebar lists only objective and open/completed icon; no updated time, active/needs-decision signal, search, empty distinction, or independent URL. | Selecting a Work changes component state only, so reload/back/recording deep-links are unreliable. |
| Work detail | Objective and one mixed “History” region are shown. Work lifecycle, human closure reason, active execution, and the open decision are not separated. | “Complete work” sits beside “New execution” without a closure review. A completed Work’s inability to accept an Execution is not explained. |
| Create Execution | Modal asks responsibility and provider together. | It silently selects the first provider. The user cannot tell provider availability, capabilities, input limits, or why a provider is appropriate. |
| Provider selection | Only `display_name` in a native select is shown. | No provider input contract is visible before draft creation; no unavailable/degraded state; choice has no accountable summary. |
| Resource selection | Each selector is rendered as one button inside every non-terminal history card. | All selector fields are auto-filled. Critically, select fields call `/choices` then submit `choices[0]`; this is a false user choice. Selector-specific requirements, optionality, multiplicity, replace/remove, failures and loading are invisible. |
| Resolve | `prepare` immediately replaces one slot keyed by selector ID and returns a draft. | Requested and exact summaries are buried in a button subtitle. Multiple inputs of the same contract cannot be composed honestly by this UI, although provider limits permit them. |
| Review | The label says “Review & freeze”, but clicking it freezes and dispatches directly. The real `/binding-review` endpoint is unused. | There is no pause in which a human compares requested intent, exact Ref identity, counts, validation errors, and consequence of freezing. This is the largest trust break in a recorded demo. |
| Freeze & Launch | Freeze response becomes a toast saying launch accepted. | There is no durable dispatch receipt, binding view, dispatch state, failed/ambiguous recovery, or clear hand-off to native provider. |
| Active / Attach | Current cards do not expose `observe` or `attach`, even though Host routes exist. | The UI neither says whether projection is stale/unreachable nor offers the native attach command. It may look like a web-terminal was promised. |
| Finish | Any non-terminal card with a draft shows Finish, including an undispatched draft. | This calls the Host finalization path before the responsibility is dispatched; it violates the visual action boundary. The “Retry” button only clears local operation state, not a safe retry decision. |
| Evidence | Terminal card shows only an observation count. | Count implies certainty without showing each frozen input, observer, result, coverage, evidence Ref, or conflicts. It cannot demonstrate reconciliation. |
| Continue from output | It assumes `outputs[0]`, calls it “Source workspace”, and opens the same small provider modal. | Output contract/type can differ; users cannot select among outputs or see the immutable source Ref. This happens to pass the Git E1→E2 fixture but is not provider-neutral. |
| Complete Work | Calls complete with hard-coded reason “completed in Workbench.” | The human’s rationale is not captured. Completion can look like automatic workflow progression rather than an explicit governance decision. |

The current browser E2E demonstrates a narrow happy path—create Work, create draft, select one workspace, freeze, finish, use first output for E2—but it encodes the auto-choice and premature Finish bugs. It is evidence that Host can support a vertical slice, not evidence that the old GUI is replaced by a usable Workbench.

# Product mental model

Use this vocabulary consistently in UI copy:

- **Work**: a long-lived objective. It is open until a human completes it; it does not prescribe a future graph.
- **Execution**: one bounded, accountable attempt. A new attempt is always a new Execution, including a continuation.
- **Binding**: the exact `(contract, Ref)` inputs frozen immediately before Dispatch. A draft is a Host convenience, not a Core fact.
- **Dispatch**: the recorded transfer of that exact responsibility and Binding to an ExecutionProvider.
- **Ref**: an external resource identity. Show its type, provider, native ID, URI when present, and bounded metadata; do not reinterpret it as a Web-native object.
- **Evidence**: claims about a frozen input from a named observer. It is not a global verdict and “complete” coverage is only within the stated observation surface.

The UI may use friendly labels such as “Prepared input”, “Frozen input”, “What was observed”, and “Check the audit details.” Audit detail must retain the exact Core terms (projected/read back/consumption reported; match/mismatch/unknown/unverifiable; observer role; coverage).

# Information architecture options

## Option A — Work-first chronicle (recommended)

Works is the home and historical lens. Work overview contains a compact chronicle and a single “Decide next” rail. Every Execution has a canonical, deep-linkable detail route. A compact Execution row in the chronicle links to that route rather than expanding into a form. Integrations is a separate system-health destination.

Strengths: preserves the Work as context without creating a DAG; lets a demo narrate one objective then one accountable attempt; keeps complex Binding and Evidence readable. Cost: one additional navigation move to inspect an Execution.

## Option B — Execution-first operations console

The landing page is a cross-Work table of active/recent Executions; Work is a grouping and detail screen. This is efficient for an operator watching many live native sessions.

Strengths: fast active monitoring. Risks: makes Work feel secondary, pressures a queue/scheduler metaphor, and makes first-use and the E1→E2 narrative less comprehensible. It also overweights a global activity feed that current API cannot paginate or filter.

# Recommended information architecture

Choose **Option A: Work-first chronicle**.

Primary navigation (prototype extension):

The unified Web Shell now keeps **Works**, **Harness**, **Integrations**, and **Settings** as its four quiet primary destinations. Harness is a plugin-owned configuration studio, distinct from Execution. Integrations contains Installed plugins, Execution providers, Resources, and Diagnostics. Resources intentionally remain nested in Integrations: they are independently managed plugin objects that Binding can reference, never a new Core ontology or a Harness launcher. See `WEB_HARNESS_RESOURCE_STUDIO_DESIGN.md` for the ownership, secret boundary, projection preview and implementation cut.

Primary navigation:

- **Works** — default `/works`; list and Work overview.
- **Executions** — `/executions` is a recent/active index only when the Host can provide it; until then it is a route shell reached through Work links, not a fabricated cross-Work list.
- **Integrations** — plugin and runtime capability health.
- **Settings** — language, display and local Workbench preferences; no provider-specific configuration editor.

Independent routes are required for all Work and Execution detail. The New Work and New Execution entry points are modal/drawer flows that retain a route-safe return location; Binding Composer is a full-page Execution sub-route, not a modal. Attach is a small drawer that displays/copies the Host-returned command (never executes a shell command). Ref detail and evidence detail use a right-side audit drawer, linkable through anchors but not separate pages. Work completion is a confirmation dialog requiring a reason.

`/works` is the default home. First use has one calm empty state: “No Work yet. Start with an objective you want to govern over time.” Its only primary action is **Create Work**; it explains that an Execution comes later and no provider is needed to create a Work.

Work Chronicle contains only historical facts and dated human decisions: Work created, Execution created, Binding frozen/Dispatch accepted or its recorded state, observed projection changes, finalization outcome, outputs available, and Work completed with reason. It must not show hypothetical downstream nodes. Binding field values, raw Ref metadata, native correlation, detailed operation progress, all output choices, and per-observation reconciliation live only in Execution detail.

# Route map

| Route | Purpose | Current Host support / P0 decision |
| --- | --- | --- |
| `/works` | Work list, filters, create Work | supported (`GET/POST /works`) |
| `/works/:workId` | objective, lifecycle, chronicle, active execution, Decide next | supported enough (`GET /works/:id`); dates/reason/event feed need API expansion for full design |
| `/works/:workId/new-execution` | responsibility + provider entry | supported for creation; provider contract display needs an API expansion |
| `/executions/:executionId` | canonical overview | supported (`GET /executions/:id`) |
| `/executions/:executionId/binding` | composer before freeze; immutable binding after | draft/review/freeze/binding endpoints supported; multiplicity UI needs draft representation/API expansion |
| `/executions/:executionId/activity` | projection, freshness, native correlation, observe/attach/finish | routes supported; correlation is only whatever `observe` records, and attach returns argv |
| `/executions/:executionId/outputs` | output Refs and continuation entry | supported after terminal |
| `/executions/:executionId/evidence` | expected-vs-observed reconciliation | raw observations supported after terminal; richer grouping is client projection |
| `/integrations` | installed plugins and currently exposed execution providers/selectors | plugins/providers/selectors supported; resource providers/profiles/doctor/config editing are not exposed |
| `/settings` | language and local display preferences | browser-local only; supported without Host mutation |

# Work experience

The Work overview has three vertical bands, not a card wall:

1. **Objective bar**: Work objective, lifecycle, ID/copy affordance, and human-only completion action. Completion opens a dialog: current terminal/active/draft count, a required “Why is this Work complete?” reason, and explicit confirmation. It never claims all possible work is done.
2. **Chronicle**: time-ordered, compact event blocks. Each Execution block has responsibility, accountable provider display name/ID, factual state, and a single **Open Execution** action. An active block is visually keyed but is not a progress lane.
3. **Decide next**: one bounded decision panel. For open Work it offers “Create new Execution” and, when an output exists, “Use an output as input”; it lists available outputs by exact summary/type rather than choosing the first. For completed Work it explains that a new Execution requires reopening support, which current Web Host does not expose; do not show New Execution.

When an Execution becomes active, it is surfaced once as “Current active Execution” above the chronicle; multiple active attempts are shown as a count and compact links, never as parallel workflow branches.

# Execution experience

Execution detail uses a persistent factual header: responsibility, accountable provider (dynamic descriptor name and stable ID), Core projection phase/outcome/freshness, dispatch state, and creation timestamp. A local sub-navigation switches **Overview**, **Binding**, **Activity**, **Outputs**, and **Evidence**. It is tabs visually but routes semantically.

Overview is a factual receipt, not a command center: responsibility; provider; current projection versus dispatch state; frozen Binding availability; last operation; and next permitted action. The user never edits responsibility/provider after creation in P0, because current draft updates can write `provider_id` without rebuilding Core Execution, an integrity ambiguity. Treat that Host capability as not an exposed UI action until its contract is made safe.

Activity renders provider-neutral facts: projection (`active`, `terminal`, or `unknown`), outcome if terminal, freshness (`observed`, `stale`, `unreachable`), observed time, native Refs, and Host operation status. **Observe** appears only after an accepted Dispatch and only where a host control exists. **Attach** appears on the same condition and opens a copy-only command drawer. **Finish** appears only after dispatch is accepted, the projection is non-terminal, a host control is available, and no finalization operation is accepted/running. The UI asks “Finish this Execution?” and states it will ask the provider to end responsibility then atomically capture what it can; it never promises a success outcome.

Outputs show all output Refs after terminal state, including contract/type, provider, exact native ID, URI, metadata and source Execution. Each eligible output offers **Use as input for a new Execution**, preselecting this Ref but still requiring a new provider and responsibility. If Host cannot determine an input contract for an output, show it read-only; do not offer continuation.

# State/action matrix

These are UI projections over actual Core/Host records, not new Core states. Core projection phases are only `unknown`, `active`, and `terminal`; dispatch states are persisted separately (current service explicitly handles `requested`, `accepted`, `failed`, and an ambiguous requested state). `draft`, `reviewed`, and `finalizing` are Host/UI conditions.

| Execution state shown in UI | Viewer sees | Allowed actions | Forbidden actions |
| --- | --- | --- | --- |
| **Draft** *(Host draft; Core projection normally unknown; no Dispatch)* | responsibility, selected provider, mutable requested/prepared slots, revision, unmet resource counts | edit/add/remove/replace draft slots; resolve; run Review; abandon the screen without changing Core | attach, observe, finish, claim frozen inputs, claim launched |
| **Ready for review** *(Host draft passes local field completeness, not authoritative validation)* | draft revision and “Review exact inputs” call-to-action | review | Freeze & Launch until review has a current successful result |
| **Reviewed** *(Host draft `reviewed=true`; revision-specific Host projection)* | requested vs exact inputs, limits result, confirmation statement | Freeze & Launch with same revision; return to Binding to modify, which invalidates review | edit a claimed frozen Binding; attach/finish before accepted dispatch |
| **Dispatch requested / ambiguous** *(Core Dispatch record; provider start side effect cannot be proven)* | exact frozen Binding, Dispatch ID/state, unambiguous warning | observe if Host/provider can establish state; inspect receipt/support details | change Binding, re-dispatch with a new command, Finish as if active, claim no side effect occurred |
| **Dispatch accepted + projection unknown** | frozen Binding, accepted receipt, “state not yet observed” | Observe; Attach if control exposes it; Finish only if Host control supports it and product policy permits direct finish | edit binding/provider/responsibility, relaunch |
| **Active** *(Core projection)* | provider observation, freshness, native correlations, frozen Binding | Observe, Attach, Finish (when available) | edit frozen input, new dispatch, duplicate finish |
| **Finalizing** *(Host operation `accepted` or `running`, not a Core phase)* | operation ID, non-fictional progress labels, last update | observe operation; copy operation ID; return to Work | a second Finish, modify Binding, assert terminal until receipt exists |
| **Finalization failed/interrupted/ambiguous** *(Host operation status)* | error code, whether Host restart interrupted it, Core terminal check prompt | refresh Execution, Observe, inspect operation; initiate a separately confirmed recovery only where API semantics later support it | silently retry/replay external effects; show “Retry” when no defined retry endpoint exists |
| **Terminal** *(Core projection)* | immutable outcome, outputs, evidence, frozen Binding, late evidence if returned | view/copy; create a new Execution from a compatible output; complete Work is still a separate human choice | reopen/rerun the same Execution, alter Binding/outcome, Finish |

# Binding Composer

The Composer is the product’s trust moment. It is a full page with a left step rail and one decision surface; back navigation preserves Host draft revision. Its first release must use only descriptor data that exists today. The desired provider-input contract display needs a small Host read endpoint because `/providers/execution` currently exposes ID/name/version only, while `input_limits()` is revealed only by review.

1. **Responsibility** — write one bounded accountable outcome. Explain this is intent, not an input Ref.
2. **ExecutionProvider** — the user explicitly chooses from available dynamic descriptors. Do not preselect the first option. Show name, stable ID, version, and any Host-known availability. If no provider is available, block creation and link to Integrations.
3. **Input requirements** — after selection, show contract rows from provider input limits: contract ID, required/optional, minimum and maximum. P0 cannot truthfully show this before the draft exists without a new descriptor endpoint; in current API P0 should create the draft after provider choice and call Review to receive authoritative errors, with an explicit “Requirements will be checked in review” notice. P1 adds read-only input-limit descriptors.
4. **Required resources** — each required contract row shows count `selected / min–max`, an Add action, and valid selectors associated with that contract. A required count is not a fake checkmark until exact Refs have been prepared.
5. **Optional resources** — collapsed by default with `0 / max` count; the same exact semantics apply.
6. **Provider-owned selector forms/pickers** — selecting a selector opens a generic form from its bounded `fields`: text input, select picker (load `/choices`, require an explicit option click), or unsupported field warning. Labels/help/defaults come from selector descriptor; field values are local until **Resolve exact Ref**. There is no `if provider ===` or `if selector ===` branch.
7. **Resolve preview** — submit parameters to selector `prepare`. Show “Requested” (selector summary) beside “Prepared exact Ref” (exact summary, type/provider/native ID). A mutable selector has now become a concrete Ref in the Host draft, but not Core Binding.
8. **Validation** — inline field errors stay with the field; selector service failure keeps prior prepared slots unchanged and offers retry/edit. A contract count error names the contract and current/max range. Removing/replacing a prepared input increments revision and invalidates review.
9. **Review exact Refs** — a dedicated route calls `/binding-review`, displays its revision and exact return. It groups inputs by contract and shows every Ref, including same-contract multiples. It makes the ownership transition explicit: “Launch will freeze these exact identities and dispatch them. You cannot edit them afterward.”
10. **Freeze & Launch** — one destructive/committing primary action, disabled unless review passed for exactly the displayed revision. It submits `expected_draft_revision`; success renders accepted/requested dispatch receipt and links to Activity. Conflict re-loads draft and asks the human to review the changed revision. Dispatch failure or ambiguity preserves frozen facts and never silently retries.

### 15–30 second Binding Hero Moment

For a recording, start at an already-created draft: choose a provider (no default), see “needs 1 WorkspaceRef”; open its provider-owned picker; deliberately choose a named revision rather than a prefilled first result; press **Resolve exact Ref**; the row transforms from a muted request to a crisp receipt line—`requested: release candidate` → `exact: WorkspaceRef · git-workspace · 4b1… · tree 9aa…`. Open Review, compare the one requested and one exact row, then press **Freeze & Launch**. The visual signature is the animated but reduced-motion-safe “request → exact” ruled line, not an animated node graph. The entire moment proves accountable choice, resolution, and irreversible freezing.

Current Host draft slots are keyed/replaced by selector ID, so it cannot faithfully persist more than one input from one selector. P0 must either constrain each supported selector to one input and visibly state that limitation, or wait for an approved Host draft slot-ID/multiplicity change. The complete multi-input/min/max Composer is P1 after that contract work; the UI must not present unsupported add-another controls.

# Evidence reconciliation

## Summary view

The Evidence tab begins with a reconciliation ledger, not a “resources used” boolean:

| Frozen input | Requested / resolved | What was observed | Status |
| --- | --- | --- | --- |
| exact Ref identity | selector request + exact summary | 0..n observer claims | No observation / Match / Mismatch / Mixed / Unknown / Unverifiable |

“Projected” maps to **expected by the system**; “read back” to **independently checked**; “consumption reported” to **provider self-report**. A claim’s `match`, `mismatch`, `unknown`, and `unverifiable` results remain visible. “Partial” is coverage, not a fifth result: show it as “partial surface” beside the claim. “Mixed” is a UI summary when claims conflict; Core does not derive it. No observation is “not recorded”, not “unused.”

## Per-resource audit detail

Opening a ledger row reveals: requested summary; prepared exact Ref; frozen contract/Ref; each observation’s kind, result, observer role/ID, observed time, coverage and stated surface, detail, evidence ArtifactRef, and recorded time. Sort by observed time and visibly label **late evidence** when recorded after terminal finalization or after the first terminal receipt. Conflicting observations remain separate; the UI says “claims differ” and never chooses an authority automatically. A small “Authority” column names the role but says it is a claimed role, not a trust score.

Secrets must never be present in descriptors, Binding, observations or Ref metadata. If the Host returns a deliberate redaction marker in future, show `Redacted by provider` and retain stable non-secret identity fields; do not provide a reveal action. Current API has no redaction schema, so P0 cannot fabricate a “secret hidden” state—it should simply handle bounded values safely and avoid logging them.

# Integrations management

Integrations is a unified read-only registry view, with “installed” separate from “ready for this operation.” It does not configure, launch, or infer vendor semantics.

- **Plugins** (P0): plugin ID, dynamic display name, load status, version when exposed, and bounded load error. `/plugins` currently provides ID/status/display name/error but not descriptor version/docs/config namespace; show only what is returned.
- **ExecutionProviders** (P0): dynamic name, ID, version from `/providers/execution`; show “available to select” only if listed. Do not derive a plugin owner unless an API provides it.
- **Selectors** (P0): dynamic title, ID, contract ID, fields; state “used to prepare an exact Ref,” not “resource type.”
- **ResourceProviders, Profiles, Doctor/health, plugin configuration** (P1 API prerequisite): the current Host has no endpoints for these. Target view can list dynamic descriptors/statuses and link only to `docs_url`/plugin-owned configuration surfaces supplied by future descriptor APIs. It must never invent a configuration form or read/write secrets.
- **Degraded/missing**: a plugin error means historical data remains readable but new resolve/start requiring it may fail. An Execution with a no-longer-available provider shows the stable provider ID and “unavailable for new action,” not a generic failure.

The current `/health` proves only local Host owner status. It is not a plugin doctor. Do not label it “all systems healthy.”

# Frontend architecture

Proposed medium-sized Vite/React structure:

```text
src/
  app/                 # AppShell, router, route guards, error boundary
  api/                 # typed client, error normalization, endpoint modules
  features/
    works/             # list, overview, chronicle, completion
    executions/        # detail, activity, output continuation
    bindings/          # draft, selector form renderer, review receipt
    evidence/          # ledger and audit drawer
    integrations/      # plugins/providers/selectors/diagnostics views
    operations/        # polling and finalization operation presentation
    settings/          # language/local preferences
  components/          # shared semantic primitives, no domain policy
  design-system/       # tokens, typography, status/ref/receipt components
  i18n/                # bootstrap, locales, formatter helpers
  lib/                 # IDs, date/number formatting, accessibility helpers
  test/                # factories, MSW/API fixtures, setup
```

- **React Router: introduce.** Stable deep links, browser back/forward, independent Execution detail, and preview recording make it necessary. Use nested routes and route-level error boundaries; do not use URL routes as Core state.
- **TanStack Query: introduce only if approval permits a dependency.** The current hand-written effect/polling pattern is the source of stale and duplicated state. Query caching, invalidation after mutations, and operation polling fit exactly. If no dependency change is allowed, write a minimal keyed query layer first; do not imitate Query ad hoc in every component.
- **React Hook Form: use.** Already installed; appropriate for the generic selector field renderer, draft revision-aware submission, and completion confirmation. It should not own frozen Binding facts.
- **Zod: use.** Already installed; validate API payload boundaries and dynamic selector field descriptor shape, while the plugin/Host remains authoritative. Do not encode provider-specific contracts in Zod schemas.

Use a typed API client that retains `error.code`, HTTP status, request/operation IDs and safe message. Queries: Work list stale-on-focus; Work/Execution invalidate after a mutation; active Execution and accepted/running operation poll only while visible; terminal facts do not poll. Never optimistic-update Freeze/Dispatch/Finish/Complete; fetch the authoritative receipt afterward.

# i18n architecture

Adopt the existing **i18next + react-i18next + `useTranslation()`** implementation consistently. Keep language preference in `localStorage` under one versioned key. `system` resolves `navigator.languages` to supported `zh`/`en`, falling back to `zh`; explicit `zh`/`en` wins. Configure `fallbackLng: 'zh'`, `supportedLngs`, and `nonExplicitSupportedLngs` deliberately.

```text
src/i18n/
  index.ts
  formatters.ts
  locales/
    zh/{common,works,executions,bindings,evidence,integrations,errors,settings}.json
    en/{common,works,executions,bindings,evidence,integrations,errors,settings}.json
```

Rules:

- No user-visible string is hard-coded in JSX, including aria-labels, empty states, toasts and error recovery copy.
- Keys describe meaning (`bindings.review.freezeWarning`), never English source text or layout position. Do not concatenate translated fragments; use interpolation/context/plural forms.
- Provider/selector display names, contract IDs, Ref types, native IDs, URIs and plugin-owned error detail are data and are not translated. Surrounding UI labels are translated.
- Map stable Host/backend error codes to `errors.json`; append a safe raw code in an audit disclosure. Unknown codes use one generic, actionable fallback.
- Central formatters use `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`, `Intl.NumberFormat`, and a single status-label mapping. Never localize identifier contents.
- CI asserts zh/en namespace/file/key shape equality, runs i18next missing-key detection, and renders every route in both languages. Remove old configuration-product keys only as part of a conscious GUI-retirement cleanup, after finding no Web references; do not carry stale vocabulary into the Workbench.

# Visual direction options

## Direction A — Instrument ledger (recommended)

An operations notebook made of ruled surfaces and exact receipts: cool mineral background, graphite text, restrained cobalt for deliberate actions, and a warm amber only for “human attention.” The signature is the **binding ledger rule**: an input line has a left “requested” column that becomes an aligned, indented immutable “exact” column on resolution. It is a visual proof of transformation, not decoration.

## Direction B — Local control room

Dark dense console with a narrow activity rail, large monospaced identifiers, and state lamps. It would make native/provider activity immediately legible but risks looking like a terminal emulator or generic developer dashboard, and darker recordings make Chinese detail/evidence harder to scan.

# Recommended visual system

Choose **Instrument ledger**. It is recognizably about governed external facts and is quieter than trendy SaaS cards or a workflow canvas.

| Token | Value / role |
| --- | --- |
| `canvas` | `#F3F5F4` — cool paper ground |
| `surface` | `#FFFFFF` — only for focused forms/drawers, not every section |
| `ink` | `#17221F` — primary text |
| `muted` | `#60706A` — metadata |
| `rule` | `#C9D2CE` — ledger separators |
| `action` | `#155E75` — primary deliberate action/focus |
| `attention` | `#A65A18` — needs decision/unknown |
| `danger` | `#A23B3B` — mismatch/failure only |
| `success` | `#276749` — observed match/success outcome, never a generic decoration |

Typography: use a system CJK-safe text stack (`Inter, "Noto Sans SC", "PingFang SC", sans-serif`) for interface/body; a compact mono stack (`"SFMono-Regular", "Cascadia Code", "Noto Sans Mono CJK SC", monospace`) only for Ref IDs, contracts, timestamps and operation IDs. Roles: 28/34 Work objective, 20/28 Execution responsibility, 14/20 body, 12/16 ledger metadata. Do not use display typography for dense facts.

Use a 4px spacing base: 8/12/16/24/32/48; content maximum 1280px; 240px navigation rail on desktop; 320px audit drawer; 16px minimum touch targets plus 40px action height. Pages use ruled horizontal sections, not rounded-card grids. Radius is 4px for inputs and 0–2px for factual ledger rows. Status combines label, icon and color: slate unknown/stale, blue active, green terminal-succeeded/match, red terminal-failed/mismatch, amber attention/unverifiable/partial. Respect `prefers-reduced-motion`; the request→exact line becomes an instant state change. All focus rings use 3px action color with 3:1+ contrast; body text meets 4.5:1.

# Wireframes

```text
WORK OVERVIEW /works/:id
┌ Works ───────────┐  ┌ Work / OPEN ───────────────────────────────────────────────┐
│ + Create Work    │  │ Improve release recovery                    [Complete Work] │
│ • Release ...    │  ├─────────────────────────────────────────────────────────────┤
│ ✓ Older ...      │  │ CURRENT: E-17  Active · Provider name      [Open Execution] │
└──────────────────┘  ├ Chronicle ──────────────────────────────────────────────────┤
                        │ Aug 29  Execution E-17 · repair handoff · Binding frozen  │
                        │         Provider name                         [Open →]     │
                        │ Aug 28  Execution E-16 · terminal · 2 outputs              │
                        ├ Decide next ───────────────────────────────────────────────┤
                        │ [Create new Execution]   Output: WorkspaceRef 4b1… [Use →] │
                        └─────────────────────────────────────────────────────────────┘

BINDING REVIEW /executions/:id/binding
┌ Steps ──────────────┐ ┌ Review exact inputs · draft revision 7 ─────────────────────┐
│ ✓ Responsibility    │ │ Provider: Dynamic provider name (provider.id)              │
│ ✓ Provider          │ │ needs: workspace@1  1/1                                     │
│ ✓ Prepare inputs    │ ├ requested ────────────────┬ exact Ref (will freeze) ────────┤
│ ● Review            │ │ release candidate          │ WorkspaceRef · git · 4b1…      │
│   Launch            │ │                            │ tree 9aa…                      │
└─────────────────────┘ ├ Validation: Ready · selector authority: provider-owned ────┤
                          │ [Back to edit]                 [Freeze & Launch]          │
                          └─────────────────────────────────────────────────────────────┘

EVIDENCE /executions/:id/evidence
┌ Frozen input ────────────────────┬ Observations ────────────────┬ Status ─────────┐
│ WorkspaceRef git 4b1…            │ read back · resource provider │ Match           │
│ requested: release candidate     │ complete surface · evidence →  │                 │
├──────────────────────────────────┼────────────────────────────────┼─────────────────┤
│ ProfileRef profile p-7           │ consumption reported · provider│ Partial / unknown│
│ requested: reviewer profile      │ partial: prompt injection only │                 │
└──────────────────────────────────┴────────────────────────────────┴─────────────────┘
```

# Error and recovery UX

| Condition | Honest UI and next action |
| --- | --- |
| No Work | Explain the difference between objective and Execution; **Create Work**. |
| No Provider | Block New Execution after responsibility; link to Integrations, refresh providers. No silent default. |
| Plugin degraded | Show plugin ID/status/error; history stays readable; refresh/restart Host or follow plugin docs when exposed. |
| Selector unavailable | Keep draft unchanged, identify selector, offer retry/edit or select another compatible selector. |
| Ref resolve failed | Keep entered parameters locally, show safe error code, let user correct/retry; do not create a fake Ref. |
| Draft revision conflict | Reload latest draft, show what changed if known; discard stale review and require a fresh review. |
| Dispatch rejected | Preserve review receipt and show code; return to Binding only if no dispatch was frozen. |
| Dispatch ambiguous | Freeze the editor, show dispatch ID and “start side effect cannot be proven”; Observe/inspect, never “launch again.” |
| Native session unreachable | Show Core freshness `unreachable`, last observation time and Attach/Observe only if control supports them; do not call it failed. |
| Finalization failed/interrupted | Show operation ID/progress/error and distinguish Host interruption from provider failure; refresh/observe and escalate. No fake retry. |
| Output capture failed | Terminal outcome may exist without output; show it plainly, allow Evidence review; do not offer Continue without a compatible output Ref. |
| Evidence missing | “No observation was recorded for this frozen input”; link to Activity/operation context, never infer use. |
| Host mutation lock conflict | State another Local Web Host owns mutation; offer read-only diagnostic/retry after it stops. Do not propose bypassing the lock. |

# P0/P1/P2

## P0 Preview Web — required before recording

Planning estimate: **3–4 engineer-weeks** for one experienced frontend engineer plus timely API/UX review, assuming the existing Host endpoints remain stable and the real-provider rehearsal environment is available. It is not a promise for the P1 descriptor gaps; those require separately scoped Host work. A clickable prototype should take 3–5 working days and is the gate before this implementation estimate begins.

- Router/App shell, Work list/detail and independent Execution detail routes.
- Work chronicle plus Decide next; explicit complete dialog/reason.
- Create Execution with **explicit** provider choice (no default); no unsupported provider requirement preview.
- Generic selector form renderer that requires explicit select choice; resolve preview; real `/binding-review`; revision-aware Freeze & Launch receipt.
- Correct action gates: no Finish pre-dispatch; Activity uses observe/attach/finish only where Host control exists; operation polling and terminal outputs/evidence route.
- Output picker (not `outputs[0]`) for E1→E2 where output contract is supplied.
- P0 integrations: plugin/provider/selector read-only data actually exposed.
- i18n migration for all new Workbench UI, zh/en, accessibility baseline, and a browser rehearsal with a real Codex provider only if its local environment is available.

P0 deliberately excludes browser terminal, workflow canvas, remote account/login, marketplace, arbitrary plugin config editor, and a fake full integrations console. It also cannot promise multi-input-per-selector, provider requirements preflight, profiles/resource providers/doctor, detailed Work event chronology, or full late-evidence/redaction handling until their narrow Host APIs exist.

## P1 — after Preview, with approved Host/API additions

- Provider input-limit descriptors before draft creation; selector-to-contract discovery and slot IDs/multiplicity.
- ResourceProvider/Profile/doctor/config-link descriptors; Work event feed, completion reason/date, cross-Work Executions index.
- Exact output contract typing, richer native correlation, late-evidence/redaction schema, conflict grouping.
- Query library adoption if not done in P0; saved filters and stronger responsive tablet views.

## P2 — product maturity

- Permissioned plugin configuration surfaces via schema/link contracts, richer diagnostics history, exports/audit reports, advanced search and accessibility audits with assistive technology users.
- Only consider remote/marketplace functionality as separate product initiatives. Do not turn them into implied Workbench requirements.

# Acceptance criteria

- **Usability walkthrough:** a new user can create a Work, create an Execution, explicitly choose provider/resource, see requested→exact→frozen distinction, attach/observe it, finish it only after dispatch, reconcile evidence, create E2 from a chosen E1 output, and explicitly complete the Work without encountering a DAG metaphor.
- **Browser E2E:** covers no-work, no-provider, explicit selector choice (assert no first choice submission), review-before-freeze, no pre-dispatch Finish, dispatch ambiguous/rejected presentation, Host operation polling/interruption, output chooser E1→E2, and completion reason.
- **Provider-neutral conformance:** fixture plugins with different IDs/labels/contracts/field combinations render without Web conditionals; assert no source strings branch on provider/selector ID. Test 0/1/many choices, optional fields, and unavailable control.
- **State/action matrix tests:** parameterized API fixtures assert visible and absent actions for every row above; terminal never reopens and frozen Binding never exposes edit.
- **i18n completeness:** zh/en shape equality, missing-key failure, both-language route snapshots, system/localStorage/fallback tests, no visible literal lint rule where feasible.
- **Accessibility:** keyboard-only Composer and drawer flows, focus return, semantic headings/table labels, live operation status, contrast checks, 200% zoom, reduced motion, screen-reader names for Ref copy controls.
- **Responsive minimum:** 1024px recording layout; 768px two-column collapse; 375px readable Work/Execution and no horizontal loss of Ref identity (audit tables become labeled rows).
- **Screenshot review:** canonical empty Work, active Execution, Binding review, finalizing, terminal Evidence, degraded integrations, zh and en at desktop/mobile.
- **E1→E2:** assert selected E1 output native ID/type/metadata becomes E2 prepared then frozen input; do not merely assert a source card exists.
- **Real Codex rehearsal:** local, disposable repository; verify actual provider selection, native attach command display, observed freshness, finalization receipt, output capture and evidence without browser shell control. If environment unavailable, the gate is not passed.

# GUI retirement gate

The old GUI must **not** be treated as deletable merely because the current browser happy-path test passes. The architecture document currently says WorkBoard/TUI/PyWebView were retired after an E1→E2 gate, but the audited Web does not yet support the claimed usable Workbench surface; that statement needs revalidation rather than being relied upon as proof.

Retirement can enter a checkpoint only after all P0 acceptance criteria pass, the real provider rehearsal is recorded and reviewed, no required old-GUI user journey lacks a documented replacement or intentionally retired decision, plugin-neutral checks pass, and release owner signs a rollback/communication plan. Deletion itself is outside this design round and must be a separate approved change.

# Self-critique

Initial proposal risks and revisions:

| Attack | Revision in this final plan |
| --- | --- |
| It could still look like workflow software. | No canvas, no future nodes, no auto-progression, no runnable arrows. Chronicle contains only past facts; “Decide next” contains a human choice. |
| It could be only a launcher. | Binding Review, frozen receipt, activity/freshness, outputs and evidence are first-class Execution routes; launch is one transition, not the home screen. |
| Binding could remain hidden. | Binding is a named route, header receipt, Hero Moment and precondition for Activity actions. Requested/exact/frozen labels are repeated deliberately. |
| Plugin semantics could leak into Web. | Renderer consumes IDs, labels, bounded fields and summaries only. Git/Codex/tmux are examples in documentation/testing, never product code branches. |
| There are too many pages. | Four primary destinations; Execution subroutes share one header and are used only when detail is needed. Composer replaces an overloaded modal. |
| Demo could be too slow. | Record a pre-created draft and use the 15–30 second resolution/review/freezing moment; Work and terminal screenshots bracket it. No terminal-in-browser detour. |
| First use could be too complex. | First screen creates only a Work. Execution complexity arrives only after the objective exists, with requirements stated as consequence of provider choice. |
| Beauty could hide evidence uncertainty. | Ledger labels preserve observer, coverage, result, conflict and absence; green is never “resource used.” |
| P0 could still be too large. | P0 explicitly excludes missing Host capabilities and full integrations. If delivery pressure remains, preserve routing + real Review + action gates + E1→E2, and defer visual polish/filtering before deferring truthfulness. |

# Final recommendation

Approve the Work-first chronicle with independent Execution detail and an explicit Binding Composer. Start the next phase with a **clickable prototype**, not direct implementation: validate the 15–30 second Binding Hero Moment, Work/Execution boundary, evidence ledger language, and Chinese/English density with product stakeholders. Then implement P0 in small vertical slices beginning with route shell + execution action gates + real Review; request the narrow P1 Host descriptor APIs separately rather than smuggling Core/product ontology into the frontend.

# Prototype validation appendix (2026-08-29)

The standalone clickable prototype lives at `gui-web/prototype.html` and deliberately does not call the Local Web Host or any provider API. It validates information architecture and truth-language only; every displayed record is clearly local mock data.

Validation scope:

- Work-first list, objective bar, past-only Chronicle, and one bounded Decide-next decision surface.
- A draft Execution cannot finish; Provider and every resource choice require an explicit click; no choice is silently selected.
- Binding composition visibly transforms requested identity into the exact Ref that will freeze. Review precedes Freeze & Launch; freezing makes Binding immutable and activates the separate Activity surface.
- Finish shows a FINALIZING operation rather than a fake outcome. Terminal provides Outputs and the evidence reconciliation ledger; continuation is a new E3, while E1/E2 remain historical entries in the Work Chronicle.
- Chinese and English use an isolated prototype i18next namespace. `system`, `zh`, and `en` preferences persist under `agent-box-prototype-language`, with Chinese fallback.

The prototype is a UX review instrument only. It must not be taken as proof of P0 API support, real-provider dispatch, evidence capture, or GUI retirement readiness.

## Prototype acceptance record — revision 1

Revision 1 corrects the review-critical semantic issues: Evidence is now ledgered by frozen resource (with multiple observations, observer/authority, coverage, reconciliation and audit fields), and Binding distinguishes six required slots from one optional slot using stable slot identities. The prototype remains mock-only. Screenshot review uses a clean 1440×900 Chromium viewport and records the Required, Optional, Review, Active, Evidence, Audit, continuation and English review states.
