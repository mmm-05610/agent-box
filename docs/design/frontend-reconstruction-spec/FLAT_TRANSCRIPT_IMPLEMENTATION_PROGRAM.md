# Profile/Provider Configuration and Flat Transcript Implementation Program

> Status: READY FOR GOAL EXECUTION AFTER WORKTREE CHECKPOINT
>
> Scope: Agent-Box Studio frontend only. This document authorizes the bounded
> P0–P6 program below; it does not authorize backend, Tauri host, Session,
> Execution Tree, cross-Harness translation, or Terminal docking changes.

This is the implementation authority for the next frontend Goal. Supporting
research in this directory remains useful evidence, but where it conflicts with
this document, this document wins.

## 1. Outcome

The Goal delivers two user-visible foundations:

1. Settings exposes Profile and Model Provider as separate, orthogonal
   configuration surfaces, and task launch represents an independent
   `Profile + Model Provider + Model` selection.
2. The conversation becomes a quiet Codex/ZCode-style work transcript:
   assistant prose sits directly on the canvas, ordinary work is represented
   by compact event rows, and containers appear only for real content or
   interaction boundaries.

It must not turn the application into a generic model-chat dashboard. It must
not create a second Session, message, tool, or execution authority.

## 2. Product invariants

### 2.1 Visual

- The transcript and Composer are the primary work surface.
- Assistant prose has no message card.
- A user message may have a restrained semantic surface, but no speech-bubble
  tail, gradient, glow, or decorative status edge.
- Thinking, search, read, edit, command, and generic tool events share a flat
  event frame.
- An ordinary event has no shadow, gradient, colored edge, status background,
  or pill-shaped outer shell.
- Expanded code, diff, terminal output, structured data, and forms may use one
  neutral bounded surface because they are real content boundaries.
- Permission, question, and recovery states may temporarily gain emphasis, but
  not a colored left rail. Emphasis uses hierarchy, icon, text, and at most a
  neutral semantic surface.
- Completed work recedes. Running work remains legible. Errors remain
  actionable. Color never carries meaning alone.
- The Composer remains the only persistent raised primary-action container.
- There is at most one primary action in the Composer: Send or Stop.

### 2.2 Authority

- Existing transport, runtime store, adapters, virtualization, queue, and
  backend ports remain authoritative.
- Presentation components never parse vendor payloads or infer lifecycle from
  display strings, timers, CSS, Harness names, or tool names.
- Profile, Model Provider, Model, Binding, continuation, permission, and
  Execution facts come from a port/backend fact or an explicitly labelled
  synthetic fixture.
- No assistant-ui runtime/provider/store is introduced.
- No Vercel AI SDK `UIMessage` type becomes the Studio domain authority.
- No product dependency is added without a separately recorded reason and
  human approval. The expected implementation adds none.

### 2.3 Preserved behavior

- Virtualization and stable item keys.
- Prepend/history-load scroll anchoring and stick-to-bottom behavior.
- Mounted/keep-alive and inert panel behavior.
- Markdown, CJK, file links, code, Mermaid, KaTeX, diff, image, and artifact
  rendering.
- Streaming reconciliation and completed-turn promotion.
- Queue ordering, editing, deletion, fallback, steer, fork, attachments, slash
  commands, and file mentions.
- Permission correlation and once-only response behavior.
- Theme initialization, background-image behavior, WebKit `rem` handling,
  zoom, reduced motion, keyboard paths, and static export.

## 3. Profile and Model Provider ontology

`Provider` in this program means **Model Provider / inference provider**, not an
Agent-Box Extension Kernel execution or resource provider. Product types and
labels must prefer `ModelProvider`, `InferenceProvider`, or
`ProviderConfiguration` to avoid ambiguity.

```text
Harness Type
├─ codex
├─ claude-code
├─ opencode
├─ hermes
└─ pi

Profile
├─ exact identity/revision
├─ one immutable harness_type association
├─ system instructions
├─ permission policy
├─ Harness-native configuration
├─ native-home/readiness/drift facts
└─ runtime defaults when the backend declares them Profile-owned

Model Provider
├─ independent identity/revision or version fact
├─ compatible harness_types
├─ endpoint/region/transport settings
├─ credential locator/readiness, never credential value
├─ model catalog/default model
└─ provider-native advanced settings

Execution Binding
├─ exact profile_ref
├─ exact model_provider_ref
├─ resolved model selection
├─ harness_type compatibility result
└─ backend preflight/readiness result
```

Hard rules:

- A Profile does not contain Model Provider configuration.
- A Model Provider does not contain Profile configuration.
- Editing one cannot create a revision of the other.
- A Profile is bound to one Harness type. Changing that association is not an
  ordinary edit; create a new Profile unless the backend explicitly exposes a
  safe migration.
- A Model Provider declares compatibility with one or more Harness types.
- Selecting a Profile filters compatible Model Providers but does not silently
  select the first result.
- UI/session preferences may remember the last valid pair, but this preference
  is neither the Profile nor Model Provider authority.
- Changing Profile clears an incompatible Provider and explains why.
- Changing Provider revalidates or clears the selected Model.
- Labels never masquerade as Refs. Only backend-returned exact identities enter
  a launch request.
- Credential secret values never enter Profile, Model Provider public DTO,
  localStorage, screenshots, diagnostics, Binding summaries, or logs.

## 4. Evidence and source-adoption policy

Before P1 design or implementation, inspect actual local components and ports,
then inspect upstream source. Reuse logic and information architecture before
inventing new forms.

Priority:

1. Existing Studio Settings, agent configuration, model picker, selector,
   form, credential-readiness, dialog, list, and validation components.
2. Agent-Box's current Profile/Resource Library/credential/model-provider
   contracts and Codex-first API, without copying Python code into this repo.
3. cc-switch's Profile/provider list organization, switching, validation,
   backup, import, and human-edited-file protection patterns.
4. Official Harness documentation and the existing Agent-Box Harness knowledge
   base for field meaning and ownership.
5. Vercel AI Elements, assistant-ui, Cline, OpenCode, and Open WebUI only under
   the modes recorded in `LICENSE_AND_PROVENANCE_LEDGER.md`.

For every proposed field or interaction, write:

| Field/interaction | Studio source | cc-switch pattern | Harness fact | Agent-Box/API fact | Final authority |
|---|---|---|---|---|---|

No authority means no production field. Unknown facts stay unknown.

Current Vercel AI Elements commit
`6a9d5b1822ffb10bba4bd97175f01edd7d8651cd` is Apache-2.0, not MIT. No exact
copy is approved by this program. Cline and OpenCode evidence without a pinned
SHA is `PATTERN_REFERENCE` and `COPY_ELIGIBILITY: NO`. Open WebUI remains
visual/product reference only.

## 5. Presentation model correction

Do not begin with a universal replacement `WorkEntry[]` pipeline. The existing
`MessageListView → VirtualizedMessageThread → ContentPartsRenderer` path remains
in place. P2 introduces a small presentation layer that existing specialized
renderers can adopt incrementally.

Separate orthogonal dimensions:

```ts
export type EntryPhase =
  | "queued"
  | "streaming"
  | "running"
  | "awaiting-decision"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"

export type EntryAttention =
  | "none"
  | "informational"
  | "decision-required"
  | "warning"
  | "error"

export type RecoveryDisposition =
  | "none"
  | "retryable"
  | "reconnectable"
  | "manual-action"
  | "terminal"

export interface EventPresentation {
  id: string
  phase: EntryPhase
  attention: EntryAttention
  recovery: RecoveryDisposition
  origin?: {
    executionId?: string
    harnessType?: string
  }
  disclosure?: {
    available: true
    defaultOpen: boolean
    labelKey: string
  }
  actions?: readonly PresentationAction[]
  copyPayload?: Readonly<CopyPayload>
}
```

`origin` is an opaque display-safe identity, not a raw Ref or native locator.
Accessible labels are produced from semantic fields and i18n. `interactive` is
derived from disclosure/actions and is not a separately writable boolean.
Disclosure state is local presentation state and is not part of the lifecycle.

Use explicit variants/children or compound components rather than accumulating
`isRunning`, `isError`, `isCommand`, `showBody`, and similar booleans. Context,
if needed, exposes only presentation state/actions/meta and never a new runtime
store.

## 6. Program phases

Each phase is independently testable, reviewable, and revertible. A phase may
prepare types/components for the next phase, but must not silently implement a
later product capability.

### P0 — Specification repair and preflight

Goal: make the documents and implementation ledger internally correct before
product edits.

Required work:

- Correct AI Elements license from MIT to Apache-2.0 everywhere.
- Replace the mixed `WorkStatus` model with the three axes in section 5.
- Fix example types so prose and prose claims agree.
- Remove all ordinary and error colored-left-guide recommendations.
- Move send-only fork behavior from open to decided: parent selection adds an
  information line; Send remains the sole launch action.
- Mark unpinned Cline/OpenCode findings as pattern reference only.
- Replace brittle class-name-only visual checks with semantic markers,
  computed-style checks, and whole-session screenshots.
- Update the migration plan so P2 creates a visual primitive, not a universal
  transcript replacement.
- Record the exact initial git status and distinguish pre-existing changes from
  this Goal.

Deliverable: corrected documents plus a phase file ledger. No product behavior
changes in P0.

Gate: all research documents agree on license, state axes, adoption mode, fork
behavior, and P2 scope.

### P1 — Profile and Model Provider configuration vertical

Goal: design first, then implement the frontend domain surface needed to
configure and select orthogonal Profile and Model Provider facts. Do not guess
an unfinished backend wire contract.

#### P1A — Current-system and upstream audit

Produce:

- `PROFILE_PROVIDER_CONFIGURATION_SPEC.md`
- `PROFILE_PROVIDER_FIELD_AUTHORITY_MATRIX.md`
- `PROFILE_PROVIDER_USER_FLOWS.md`

Audit:

- Existing Studio settings navigation and form primitives.
- Existing ACP/Harness settings, model picker, session configuration selector,
  credential state, and validation/error components.
- `src/core/ports` and especially any current Agent-Box backend adapter.
- Agent-Box Profile and Codex-first Model Provider API at its frozen revision.
- cc-switch information architecture and safe mutation behavior.
- Five Harness configuration knowledge, while implementing only fields the
  available port can truthfully expose.

#### P1B — Frontend domain ports and typed models

Define orthogonal frontend ports, names subject to local convention:

```ts
interface ProfilesPort {
  list(filter?: { harnessType?: string }): Promise<ProfileSummary[]>
  get(ref: ProfileRef): Promise<ProfileDetail>
  create(input: CreateProfileInput): Promise<ProfileDetail>
  update(ref: ProfileRef, input: UpdateProfileInput): Promise<ProfileDetail>
  readiness(ref: ProfileRef): Promise<ProfileReadiness>
}

interface ModelProvidersPort {
  list(filter?: { harnessType?: string }): Promise<ModelProviderSummary[]>
  get(ref: ModelProviderRef): Promise<ModelProviderDetail>
  create(input: CreateModelProviderInput): Promise<ModelProviderDetail>
  update(ref: ModelProviderRef, input: UpdateModelProviderInput): Promise<ModelProviderDetail>
  test(ref: ModelProviderRef): Promise<ModelProviderReadiness>
  disable(ref: ModelProviderRef): Promise<void>
  listModels(ref: ModelProviderRef): Promise<ModelOption[]>
}
```

These are UI domain ports, not a license to invent REST paths. An adapter may
only be implemented against the frozen backend schema. If it is unavailable,
use an explicitly synthetic test adapter and render production capability as
unavailable; never ship a fake success path.

Do not create a generic dynamic-form engine unless at least two real Harness
schemas prove the abstraction. Prefer an explicit field descriptor vocabulary
with an escape hatch for Harness-owned sections.

#### P1C — Settings surfaces

Settings navigation exposes sibling destinations:

```text
Harnesses
├─ Profiles
└─ Model Providers
```

Profiles must support, where the port truthfully exposes them:

- list/search/filter by Harness type;
- create and exact revision edit;
- immutable Harness association after creation;
- system instructions;
- permission policy;
- Harness-owned native fields;
- native-home/readiness/drift diagnostics;
- explicit save result and stale-revision conflict.

Model Providers must support, where the port truthfully exposes them:

- list/search/filter by compatible Harness;
- identity and compatibility;
- endpoint/region/connection fields;
- credential locator/readiness without secret read-back;
- models/default model;
- test/readiness, disable, and actionable diagnostics;
- provider-owned advanced fields.

Forms must use existing Studio controls and validation patterns. Avoid a grid
of decorative configuration cards. Use a compact list-detail or settings-form
layout with clear groups and one primary save action.

#### P1D — Launch selection infrastructure

Provide a typed `ExecutionBindingSelection` and a compact Composer integration
surface, without changing backend execution semantics:

```text
Codex · Profile: work · Provider: Codex Subscription · Model: default
```

Flow:

```text
Profile selection
→ harness_type fact
→ compatible Provider filtering
→ Provider selection
→ model options
→ preflight/readiness
→ read-only resolved summary
→ existing Send action
```

Rules:

- No implicit first-item selection.
- A previously remembered exact compatible selection may be offered as a
  labelled preference, not silently committed.
- An incompatible Provider is cleared with a reason.
- Missing/unavailable Profile or Provider blocks Send with a repair route.
- Model defaults are displayed as resolved Provider facts.
- Full Binding details live behind one disclosure/popover; no five permanent
  pills.
- Until the Agent-Box adapter is frozen, this infrastructure is verified with
  synthetic ports and capability-unavailable production behavior.

P1 gate:

- Profile and Model Provider remain independently editable and testable.
- Settings and launch selection work against synthetic ports.
- If a frozen real adapter exists, add contract tests; otherwise no fake READY.
- Secret values are absent from DOM snapshots, localStorage, logs, fixtures,
  screenshots, and request models.
- 1440/1024/390, light/dark, 150%, keyboard, empty/loading/error/stale/readiness
  states pass.

### P2 — Flat event presentation infrastructure

Goal: build reusable visual infrastructure for later migration without
replacing the transcript model.

Introduce locally named equivalents of:

```text
WorkEventFrame
├─ Trigger
├─ Icon
├─ Summary
├─ Status
├─ Actions
└─ Details
```

Requirements:

- Compound/explicit variants; no boolean-prop explosion.
- Stable DOM root and `data-visual-treatment="flat"` for ordinary events.
- Native button disclosure with `aria-expanded` and `aria-controls`.
- No trigger for bodyless events.
- Default completed collapsed; running readable; supplied error policy may
  open details once; user choice is not repeatedly overwritten.
- Details can host existing specialized content without owning its facts.
- No new context provider unless siblings truly share presentation state.
- Direct imports and conditional loading preserve bundle boundaries for heavy
  code/diff/terminal/rendering components.
- No list-wide subscriptions or per-token remapping of settled entries.

P2 migrates only one representative synthetic event and one existing low-risk
event as a vertical proof. Other renderers remain unchanged.

### P3 — Prose, user message, reasoning, and streaming

Goal: flatten the lowest-risk transcript content.

- Assistant prose renders directly on canvas.
- User messages retain only a restrained semantic surface.
- Reasoning uses a flat disclosure row, opens while streaming unless manually
  closed, and collapses once when settled.
- Empty streaming state uses a non-card placeholder.
- Preserve all Markdown and rich-content behavior.
- Preserve actions and keyboard access on hover and focus.

Gate: empty, short, long, streaming, completed, interrupted, code, Mermaid,
KaTeX, CJK, file-link, 390px, 150%, and screen-reader fixtures pass.

### P4 — Search, read, edit, command, and generic tools

Goal: remove ordinary tool-card stacking while preserving specialized content.

Migration order:

1. search;
2. file read;
3. file edit;
4. command/terminal invocation;
5. generic/unknown tool;
6. remaining ordinary registered tool renderers proven compatible.

Each migration keeps vendor parsing and lifecycle mapping behind the existing
adapter/dispatcher. Only the presentation shell converges.

Behavior:

- one-line default summary;
- no empty disclosure;
- running status is text plus neutral activity indication;
- completed status recedes;
- failure uses explicit supplied attention/recovery facts;
- expanded output is bounded and independently scrollable where appropriate;
- command, code, diff, JSON, image, and artifact contents keep their specialized
  renderer inside neutral details;
- unknown tools have a safe generic representation;
- consecutive events read as a work log, not a stack of cards.

Gate: current tool fixtures plus a consecutive-event visual fixture pass
without changing callback payloads or event order.

### P5 — Permission, question, plan approval, and failures

Goal: unify human-decision and recovery presentation without changing their
authority.

- Awaiting permission/question/plan approval is an inline decision block.
- Correlation identity, option payload, queue depth, expiry, and once-only
  response remain owned by the existing runtime/port.
- Resolved decisions become compact immutable history.
- Recoverable failure presents only supplied actions.
- Fatal failure remains visible and actionable; acknowledgement may reduce
  visual weight but cannot erase terminal history.
- Reconnect notices disappear only when the authority reports recovery.
- No colored left rail, full-card gradient, or color-only state.
- Do not replace a non-modal decision with `alertdialog` semantics.

Gate: approve, deny, cancel, timeout, duplicate response, queued permission,
reconnect, retry, terminal failure, keyboard, screen reader, and mobile tests.

### P6 — Responsive, theme, performance, and accessibility closure

Goal: close the program across the real route, not isolated component shots.

- Semantic tokens only; exact values remain reviewable.
- 1440, 1024, and 390 widths.
- Light/dark and workspace background image.
- 100% and 150% zoom.
- Reduced motion.
- Keyboard-only and focus restoration.
- Screen-reader names/state announcements.
- No horizontal page overflow.
- Bounded details and stable virtualization measurements.
- Composer remains reachable and the sole primary action.
- No regression to initial-load bundle from eager heavy-renderer imports.

P6 may add shared tokens, fixtures, semantic visual markers, and test helpers.
It must not redesign Composer information architecture, StatusBar, Terminal,
Aux, Execution History, or Delegation.

## 7. Deferred product work

Not authorized in P0–P6:

- Agent-Box backend API integration beyond a separately frozen adapter
  contract;
- Tauri sidecar lifecycle or packaging;
- Execution History/branch UI;
- Delegation panel redesign;
- Terminal docking or Aux composition;
- Binding detail final layout beyond P1's compact selection infrastructure;
- Composer-wide reorganization;
- StatusBar information audit;
- default-theme migration or deletion of old themes;
- cross-Harness materialization, Loss Report implementation, compact, MCP
  Resource, or backend mutation;
- broad deletion of `ContentPartsRenderer` or specialized renderers;
- copying Open WebUI code or introducing an external chat runtime.

P1 prepares ports/models/components for real Profile/Provider integration. P2
prepares presentation primitives for future transcript families. These
foundations must stay dormant or capability-gated where their real authority is
not yet available.

## 8. Implementation strategy

### 8.1 Test first

For every migrated component:

1. capture current behavior with focused tests;
2. add a failing test for the intended new visual/semantic contract;
3. implement the smallest change;
4. run focused tests;
5. run the affected transcript/runtime suite;
6. run full frontend lint/test/build at the final gate.

Do not weaken an assertion, delete a fixture, or convert a deterministic test
to a snapshot merely to make the migration pass.

### 8.2 Incremental adoption

- Keep the old renderer available only at the immediate migration seam, not as
  a permanent user-selectable legacy mode.
- Migrate by event family and remove the obsolete chrome only after parity.
- Do not fork the entire message tree behind a long-lived feature flag.
- Preserve stable keys and memo boundaries.
- Derive simple presentation facts during render; do not mirror props into
  effects or subscribe to raw stores for callback-only data.
- Load heavy diff, terminal, syntax, Mermaid, and artifact views only when the
  existing route/renderer already needs them.

### 8.3 Sub-agent delegation

If sub-agents are available, use at most three and assign disjoint work:

1. `profile_provider_audit`: read-only P1 local/upstream/API field-authority
   audit; no product edits.
2. `transcript_behavior_audit`: read-only inventory of renderer families,
   lifecycle mappings, virtualization and regression tests.
3. `visual_a11y_audit`: read-only review of fixtures, computed styles,
   responsive, keyboard and screen-reader coverage.

The primary agent must read all authority documents, resolve conflicts, write
P0 corrections and RED tests, own cross-cutting types/primitives, integrate all
changes, and run final verification. Do not delegate overlapping product edits.

## 9. Visual verification

Use the real `/workspace` route with synthetic transport/ports and isolated
environment. Do not read real credentials, real sessions, or call a model.

Required scenarios as applicable to the phase:

- empty session;
- Profile list/editor and Provider list/editor;
- incompatible Profile/Provider;
- credential configured/missing/unknown without a secret value;
- loading, stale revision, validation error, readiness failure;
- short and long assistant response;
- user message;
- running/completed/failed/interrupted event;
- consecutive search/read/edit/command events;
- bodyless and expanded event;
- permission/question resolved and unresolved;
- reconnect/recovery;
- 1440/1024/390;
- light/dark;
- 100%/150%;
- keyboard focus;
- reduced motion.

Automated visual semantics:

- ordinary event roots identify the flat treatment semantically;
- computed root styles have no shadow, gradient, colored side border, or
  status fill;
- approved inner code/diff/terminal/form surfaces are scoped exceptions;
- disclosure/labels/toggles have correct ARIA;
- no nested interactive controls;
- no horizontal page overflow;
- transcript ordering, stable keys, prepend position, and composer focus stay
  stable.

Manual review judges the whole flow: prose must outweigh chrome, completed work
must recede, consecutive tools must read as a log, and only an unresolved human
decision or actionable failure may temporarily demand attention.

## 10. Verification commands

Run the narrowest useful tests while editing, then finish with:

```bash
pnpm eslint .
pnpm test
pnpm build
git diff --check
```

Also run the existing UI-1 real-route Playwright fixtures and the new P1/P2–P6
fixtures. Record exact test counts and skipped tests. A missing browser is a
clear blocker, not a silent pass. Do not commit `node_modules`, `.next`, `out`,
coverage, browser caches, temporary clones, or screenshot server state.

## 11. Security and privacy

- Do not read, print, screenshot, persist, or echo credential values.
- Use synthetic Provider credentials and readiness states in tests.
- Public UI models contain credential status/locator identity only where the
  backend contract explicitly permits it.
- Do not expose host absolute paths, native session blobs, private payloads, or
  raw backend diagnostics in generic event UI.
- Copy actions use an explicit safe payload and never hidden raw JSON by
  default.
- Research clones belong in `/tmp`; no submodule or vendored upstream tree.

## 12. Git and workspace discipline

- Work only in the dedicated frontend worktree.
- Record branch, HEAD, merge base, and initial status.
- Preserve all pre-existing checkpoint content.
- Do not touch `/home/maoqh/projects/agent-box` or any Agent-Box worktree.
- Do not reset, checkout, clean, stash, or broadly format unrelated files.
- Do not add, commit, push, or merge unless the user explicitly requests the
  checkpoint after review.
- Keep a precise intended-file ledger per phase.

## 13. Human decisions and fixed decisions

Fixed for this program:

- send-only branch behavior; no second launch/confirmation button;
- Profile and Model Provider are orthogonal;
- Settings exposes them as sibling configuration surfaces;
- launch selects Profile + Model Provider + Model independently;
- Flat Transcript visual rules in section 2;
- no second runtime or universal transcript rewrite in P2.

Still open and therefore deferred:

- Terminal/Aux docking;
- final Aux tab order;
- Execution node density;
- StatusBar contents;
- default theme and old-theme retention;
- usage/cost entry point;
- final Binding details layout after the backend contract stabilizes.

## 14. Completion criteria

The Goal may report complete only when:

1. P0 documents are internally consistent and license-correct.
2. P1 research identifies field authority instead of inventing a generic form.
3. Profile and Model Provider are separate typed ports, settings surfaces, and
   selection facts.
4. No Provider is stored inside Profile and no Profile is stored inside
   Provider.
5. Missing/incompatible/unavailable selections fail visibly and never choose
   the first item silently.
6. No secret value enters frontend state, fixtures, DOM, storage, logs, or
   screenshots.
7. P2 introduces a bounded presentation primitive without replacing the
   transcript/runtime authority.
8. P3–P5 migrate the approved entry families with behavior parity.
9. Ordinary events have no decorative card, colored edge, gradient, shadow, or
   status fill; expanded real content surfaces remain usable.
10. Virtualization, scrolling, streaming, queue, permissions, attachments,
    theme, static export, and keyboard behavior remain green.
11. P6 passes the real-route visual matrix.
12. Lint, full tests, build, and `git diff --check` pass.
13. No backend, Tauri, protocol, package dependency, lockfile, or unrelated
    product scope changed.

Final report must distinguish:

```text
PROFILE/PROVIDER UI FOUNDATION: COMPLETE | BLOCKED
FLAT TRANSCRIPT P2–P6: COMPLETE | PARTIAL | BLOCKED
REAL AGENT-BOX ADAPTER: NOT IN SCOPE | CONTRACT-TESTED IF ALREADY FROZEN
READY FOR HUMAN FRONTEND CHECKPOINT: YES | NO
```

Do not claim that real Codex can be launched from this UI unless a separately
approved Agent-Box adapter integration and real end-to-end test have actually
passed.
