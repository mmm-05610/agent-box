# Agent-Box Studio Product UI Reconstruction Phase 2

> Status: AUTHORIZED FOR GOAL EXECUTION AFTER DOCUMENT CHECKPOINT
>
> Scope: Agent-Box Studio frontend product code, frontend tests, and portable
> visual-review tooling. Backend, Rust/Tauri, Agent-Box protocol, database, and
> cross-Harness Session semantics are out of scope.

## 1. Authority and correction

This document is the execution authority for the next frontend Goal. Read it
with the following existing documents:

- `DESIGN_CONSTITUTION.md`
- `frontend-reconstruction-spec/FLAT_TRANSCRIPT_SPEC.md`
- `frontend-reconstruction-spec/COMPONENT_ARCHITECTURE.md`
- `frontend-reconstruction-spec/COMPOSER_INFORMATION_ARCHITECTURE.md`
- `frontend-reconstruction-spec/VISUAL_ACCEPTANCE_MATRIX.md`
- `frontend-reconstruction-spec/FLAT_TRANSCRIPT_IMPLEMENTATION_PROGRAM.md`

Where those documents permit a narrower proof, this document wins.

The previous checkpoint, commit `194a3cc8`, established useful tokens,
research, tests, and implementation plans. It did not complete the product UI
reconstruction. Its actual product change was approximately 13 frontend files
and `+217/-91`, while most added lines were documents, previews, fixtures, and
screenshots. The page layout, Settings information architecture, launch
selection, most transcript renderers, and Composer information hierarchy
remained substantially unchanged.

This Goal must not report completion for another documentation-only,
token-only, or two-example vertical. It must change the real user-facing
product routes and the real rendering chain.

## 2. Design read

Read this as a high-density coding workbench for technical users, with a
Codex/ZCode-like quiet and efficient visual language. The transcript and the
next user action are the center of gravity. Functions appear where they are
needed instead of competing for attention.

Working dials:

```text
DESIGN_VARIANCE: 3
MOTION_INTENSITY: 2
VISUAL_DENSITY: 7
```

This is not a marketing surface. Do not introduce expressive hero typography,
glassmorphism, gradients, decorative cards, colored rails, dashboard tiles, or
attention-seeking animation. Precision in alignment, density, typography,
spacing, disclosure, and state transitions is the design work.

## 3. User-visible completion target

After this Goal, a user must immediately perceive a different product rather
than a lightly reskinned Codeg:

1. Settings has two sibling, usable management surfaces: Profiles and Model
   Providers.
2. A Profile is visibly tied to one Harness type and configures agent behavior,
   including system instructions, permissions, and only the Harness-native
   fields supported by the active contract.
3. A Model Provider is configured independently and can declare compatibility
   with Harness types. The first version may directly edit the provider
   configuration exposed by the current backend; provider revision/history
   management is deferred.
4. Starting or continuing work uses an explicit compatible
   `Profile + Model Provider + Model` selection. No first item is silently
   selected.
5. The conversation reads as prose plus a compact work log. Ordinary tool,
   search, read, edit, command, reasoning, and diagnostic activity no longer
   appears as a stack of capsules or cards.
6. The Composer has one persistent primary action and one compact execution
   identity summary. Detailed configuration is available through disclosure,
   not permanent pills.
7. The existing project/session navigation remains recognizable, but chrome
   recedes behind the work.

The Goal is incomplete if only component playgrounds, isolated screenshots,
synthetic types, dormant ports, or documentation demonstrate these outcomes.

## 4. Non-negotiable boundaries

### 4.1 Existing authorities remain authoritative

- Keep `MessageListView -> VirtualizedMessageThread ->
  ContentPartsRenderer/tool dispatch` as the data and ordering path.
- Keep the existing Session runtime/store, transport, adapters, streaming
  reconciliation, queue, permissions, continuation, and execution facts.
- Presentation components receive typed facts; they do not parse vendor
  payloads, tool names, Harness strings, CSS, or timers to infer lifecycle.
- Do not introduce assistant-ui runtime/store/provider or Vercel AI SDK
  `UIMessage` as a second authority.
- Do not create a second Profile, Provider, Binding, message, or Session store
  in React context or localStorage.
- Preserve stable item keys, virtualization, prepend anchoring,
  stick-to-bottom, mounted/keep-alive behavior, and inert hidden panels.

### 4.2 Frontend-only boundary

Do not modify:

- `src-tauri/`;
- Agent-Box Python repositories or worktrees;
- backend API semantics;
- Session/Execution/Binding ontology;
- SQLite schema or migrations;
- cross-Harness translation, compact, Loss Report, or Execution DAG;
- dependency manifests or lockfiles unless a separately documented blocker is
  presented for human approval. The expected implementation adds no package.

### 4.3 Security boundary

- Never read or render a credential secret value.
- Never store credential values in React state beyond an explicitly ephemeral
  controlled input required by an existing mutation contract.
- Never persist credential values in localStorage, fixtures, screenshots,
  logs, diagnostics, test snapshots, or Binding summaries.
- Provider UI displays configured/missing/unknown/readiness facts and an
  opaque credential source identity only when the backend permits it.
- Do not expose native Session locators, private payloads, or host absolute
  paths in generic transcript entries.

## 5. Product ontology

`Model Provider` means inference/model provider, not an Agent-Box Extension
Kernel provider.

```text
Harness Type
  codex | claude-code | opencode | hermes | pi

Profile
  exact identity and revision
  one Harness type association
  system instructions
  permission policy
  Harness-native behavioral configuration
  native-home/readiness/drift facts

Model Provider
  independent identity
  compatible Harness types
  endpoint/region/transport configuration
  credential locator/readiness, never secret read-back
  model catalog and default model
  provider-native advanced settings

Execution Binding Selection
  exact Profile ref
  exact Model Provider ref
  resolved Model
  compatibility result
  readiness/preflight result
```

Hard rules:

- Profile and Model Provider are independently created and edited.
- Provider configuration is never embedded in a Profile payload.
- Profile configuration is never embedded in a Provider payload.
- Changing one must not create a revision or mutation of the other.
- Profile has one immutable Harness association after creation. A change means
  creating another Profile unless the backend exposes an explicit migration.
- Selecting a Profile filters compatible Providers; it never silently chooses
  one.
- Changing Profile clears an incompatible Provider and explains the change.
- Changing Provider revalidates or clears Model.
- Labels are not refs. Launch requests use exact identities from the backend.
- A remembered last valid selection is a preference, not authority, and must
  be revalidated before use.

## 6. Mandatory phases

The primary agent owns integration across all phases. Complete them in order;
each phase begins with RED behavior/semantic tests and ends with focused GREEN
tests. Do not stop after an intermediate phase unless genuinely blocked by a
missing contract that cannot be safely represented.

### R0: Preflight and truthful baseline

Before product edits:

1. Record branch, HEAD, merge base, and exact initial `git status --short`.
2. Read repository `AGENTS.md` and all authority documents in section 1.
3. Inspect the actual Settings routes, current model-provider settings,
   Agent-Box Profile facade, backend selector, launch/Composer selection,
   content dispatcher, registered tool renderers, and virtualization tests.
4. Produce a compact implementation map in the phase ledger. Do not create a
   new broad research corpus.
5. Capture an actual baseline whole-page screenshot from current HEAD using
   the same fixture data and viewport that will produce the final screenshot.
6. Add RED tests for the user-visible contracts about to change. A class-name
   snapshot alone is insufficient.

R0 deliverable: a phase file ledger, baseline screenshot, and recorded RED
failures. R0 cannot be reported as completion of this Goal.

### R1: Real Profile and Model Provider Settings

Implement the real Settings information architecture, not dormant component
types.

#### R1.1 Information architecture

Expose sibling destinations under the Harness/Agent configuration area:

```text
Profiles
Model Providers
```

Use a compact list-detail or master-detail settings layout. Do not use a grid
of decorative cards. Existing Studio form, select, textarea, dialog,
validation, credential readiness, and model-picker components should be reused
before creating new primitives.

#### R1.2 Profile surface

Where supported by the active Agent-Box contract, implement:

- list, search, and Harness filter;
- create Profile with immutable Harness type;
- exact revision edit and stale-revision handling;
- system instructions;
- permission policy;
- Harness-owned native settings through explicit sections;
- readiness, native-home, and drift diagnostics;
- explicit save result, retry, and repair route;
- empty, loading, unavailable, error, and conflict states.

Do not invent a universal dynamic-form engine. Use explicit field groups and a
small typed field vocabulary only where at least two real schemas prove reuse.

#### R1.3 Model Provider surface

First inspect and reuse the logic and organization of the existing Codeg model
provider UI and the cc-switch-inspired patterns recorded in the research. Then
implement, where the current contract permits:

- independent provider list and detail editor;
- compatible Harness types;
- endpoint, region, and transport configuration;
- credential source/status without secret read-back;
- model catalog and default model;
- provider-specific advanced fields;
- test/readiness action and actionable diagnostics;
- explicit disable/remove behavior only if the backend contract supports it.

This phase intentionally keeps first-version direct configuration mutation.
Do not build provider revision history, central provider registry, migration,
backup, or rollback management. Preserve human-edited configuration behavior
defined by the existing backend.

#### R1.4 Contract behavior

Use the current real frontend port and Agent-Box facade when the method exists.
Do not invent REST paths. When a required backend method is absent:

- define the smallest typed frontend port seam;
- render production capability as unavailable with the missing method named;
- use a clearly labelled synthetic adapter only in tests and visual fixtures;
- record the exact missing backend contract for the integration Goal.

R1 is complete only when the real Settings routes render the new surfaces.
Synthetic tests alone cannot satisfy R1.

### R2: Launch `Profile + Provider + Model` selection

Implement a real selection surface in the existing Composer/launch path.

Default collapsed summary example:

```text
Codex · work · Codex Subscription · default
```

Expanded disclosure presents Profile, Model Provider, and Model as independent
controls plus a read-only compatibility/readiness result.

Required behavior:

- Profile selection determines the Harness fact.
- Provider choices are filtered by declared compatibility.
- No implicit first Profile, Provider, or Model selection.
- Existing exact compatible preference may be offered but must be revalidated.
- Incompatible Provider is cleared with an inline reason.
- Provider change revalidates Model.
- Missing, unavailable, unready, or incompatible facts block Send and provide
  a direct repair route to the corresponding Settings surface.
- The existing Send/Stop button remains the only persistent primary action.
- Binding details do not become a row of permanent pills.
- continuation mode remains system-derived and read-only.

Integrate with the existing launch request only if the frozen port accepts the
exact refs. Otherwise keep the request capability-gated and report the precise
remaining adapter method. Never put display labels into a real launch request.

### R3: Complete Flat Transcript migration

This phase must migrate the real production dispatcher and all ordinary event
families present in the current repository. It is not a two-example proof.

#### R3.1 Shared presentation structure

Create a small compositional structure, locally named as appropriate:

```text
WorkEvent
  Trigger
  Icon
  Summary
  Status
  Actions
  Details
```

Use explicit variants and children/compound composition rather than boolean
prop accumulation. Presentation state may own disclosure only; it may not own
runtime facts. Ordinary event roots expose a stable semantic marker such as
`data-visual-treatment="flat"` for tests.

#### R3.2 Required migrations

Migrate the actual render paths for:

- assistant prose;
- user message;
- reasoning/thinking;
- search;
- file read;
- file edit/diff;
- command and shell-session invocation;
- generic and unknown tool;
- diagnostics and context compaction;
- streaming/running placeholder;
- completed, interrupted, cancelled, recoverable-error, and fatal-error
  presentations;
- consecutive mixed work events.

Delegation-specific content may retain its current behavior and model, but its
ordinary chrome must follow the flat transcript rules where safe. Do not
implement the future Execution History or Delegation panel in this Goal.

#### R3.3 Visual rules

- Assistant prose is directly on the canvas.
- User message has at most one restrained semantic surface.
- Ordinary events are compact rows, not pills, bubbles, capsules, or cards.
- Ordinary events have no shadow, gradient, colored edge, status fill, or
  decorative outer border.
- Bodyless events are non-interactive and have no empty container.
- Completed events default collapsed and visually recede.
- Running events remain readable through icon, text, and restrained motion.
- Errors are supplied semantic states, never inferred from strings.
- Expanded code, diff, terminal output, JSON, image, artifact, and forms may
  use one neutral bounded inner surface because they are real content
  boundaries.
- Existing specialized content renderers stay inside the new presentation
  shell; do not rewrite syntax highlighting, diff, Mermaid, KaTeX, images, or
  artifacts.
- User disclosure choice is not repeatedly overwritten by streaming effects.

#### R3.4 Performance rules

- Preserve stable DOM/list identity and virtualization measurement behavior.
- Do not subscribe every settled entry to list-wide raw runtime state.
- Derive simple display facts during render instead of mirroring props in
  effects.
- Use primitive effect dependencies and stable callbacks.
- Import heavy renderers directly and conditionally; do not add broad barrel
  imports or eagerly load terminal/diff/Mermaid/artifact code.
- Keep rapid token updates isolated from settled entries and Composer state.

### R4: Decision states and Composer hierarchy

#### R4.1 Permission, question, and recovery

- Awaiting permission/question/plan approval is the only inline state allowed
  to temporarily rise above the transcript.
- Use hierarchy, icon, text, and neutral surface, not a colored left rail.
- Preserve correlation identity, option payload, queue order, expiry, and
  once-only response authority.
- Resolved decisions become compact immutable history.
- Recoverable failure exposes only supplied recovery actions.
- Fatal failure remains visible; acknowledgement may reduce weight but never
  erase history.
- Reconnect notice disappears only after authoritative recovery.
- Do not use `alertdialog` without actual modal focus behavior.

#### R4.2 Composer

Permanent elements:

- editor;
- Send or Stop;
- add/reference entry;
- one compact `Harness · Profile · Provider · Model` summary.

Conditional or disclosed elements:

- Binding details;
- permission mode;
- continuation explanation;
- attachment and slash-command surfaces;
- queue details;
- steer/fork controls;
- readiness and repair guidance.

Remove redundant permanent chips and labels only after behavior parity tests.
Preserve queue ordering/edit/delete, steer/fork, offline composition,
attachments, drag/drop, slash commands, file mentions, editor height, focus,
and submit-key behavior.

### R5: Chrome calibration and product closure

Calibrate the real app shell so the change is obvious without becoming a
different navigation model:

- make transcript width, rhythm, and typography the visual center;
- reduce Sidebar/TopBar/StatusBar contrast and decorative surfaces;
- keep selected navigation as a low-contrast row state, not an accent card;
- use 1px separators and spacing instead of nested surfaces;
- keep existing grouping, sorting, drag/drop, collapse, project/session state,
  and responsive behavior;
- do not redesign Terminal docking, Aux composition, Execution History,
  Delegation, theme inventory, or StatusBar information semantics.

Exact color, spacing, and radius values may be tuned during implementation,
but must satisfy the frozen design direction. Do not spend the phase on
imperceptible token changes; judge the whole route.

## 7. Required test-first method

For every phase:

1. Add or strengthen behavior tests around the current authority.
2. Add RED semantic tests for the new user-visible contract.
3. Run them against the pre-change implementation and record the intended
   failures.
4. Implement the smallest coherent production slice.
5. Run focused GREEN tests.
6. Run affected runtime, virtualization, adapter, Composer, Settings, and
   accessibility suites.
7. Update the intended-file ledger.

Forbidden shortcuts:

- deleting or weakening existing assertions;
- replacing behavior assertions with broad snapshots;
- asserting only Tailwind class strings;
- testing only a newly created primitive while leaving real consumers intact;
- using a fake route or duplicate HTML implementation as product evidence;
- adding `skip`, swallowing exceptions, or treating capability-unavailable as
  success;
- reporting test counts as proof of visible reconstruction.

## 8. Visual and interactive review contract

Use the actual `/workspace` and Settings React routes. Synthetic network data
is allowed only through test interception; do not add a production fixture
flag or duplicate product route.

Create portable review tooling that supports both:

```text
headless matrix: deterministic screenshots and assertions
headed review: opens the actual route with the same intercepted dataset and
               remains open for human interaction until explicitly closed
```

Do not hardcode a username, browser version, or `/home/...` path. Do not assume
port 3000 is free. Production static output plus a temporary server is
acceptable; the tool must own and clean up its server and browser lifecycle.

Required whole-page scenarios:

- Profile list, create, edit, stale conflict, readiness/drift;
- Model Provider list, edit, missing credential, readiness failure;
- compatible and incompatible `Profile + Provider + Model` selection;
- empty session;
- assistant prose and user message;
- long CJK/English response with code;
- consecutive reasoning/search/read/edit/command/generic events;
- running/completed/interrupted/error/bodyless/expanded events;
- pending and resolved permission/question;
- queue and recoverable connection state;
- 1440, 1024, and 390 widths;
- light and dark;
- 100% and 150%;
- keyboard focus and reduced motion.

Assertions:

- no page, console, hydration, request, or unhandled errors except explicitly
  modelled synthetic failures;
- no horizontal page overflow;
- no nested interactive controls;
- disclosure has correct `aria-expanded` and `aria-controls`;
- icon-only actions have accessible names;
- keyboard operation and focus restoration work;
- ordinary event computed styles have no shadow, gradient, colored side
  border, status fill, or decorative card surface;
- Profile/Provider secret values are absent from DOM, storage, network fixture
  logs, screenshots, and serialized results;
- before/after screenshots use the same content, viewport, theme, and state.

Human review must be able to answer, from the whole-page screenshots alone:

1. Is the answer and current work more prominent than chrome?
2. Do consecutive events read as a compact work log rather than cards?
3. Can Profile and Provider be understood as separate concepts?
4. Is the next action obvious without a dashboard of controls?
5. Is the visual difference from `194a3cc8` unmistakable?

If the fifth answer is no, the Goal is not complete.

## 9. Sub-agent strategy

If sub-agents are available, the primary agent should use them deliberately.
Maximum three concurrent sub-agents in addition to the primary, with disjoint
ownership.

Recommended first wave, read-only:

1. `profile_provider_contract_audit`: inspect current Settings, Agent-Box
   facade, existing Codeg provider logic, and tests; return exact field and API
   authority plus proposed file list. No product edits.
2. `transcript_migration_map`: map every real dispatcher/renderer family to the
   flat presentation shell, including state authority and regression tests. No
   product edits.
3. `visual_a11y_fixture_audit`: inspect existing UI-1 fixtures, browser launch,
   accessibility, responsive and whole-page gaps; propose portable headed and
   headless review changes. No product edits.

After the primary resolves their findings and creates RED tests, a second wave
may delegate disjoint implementation:

- one agent may own Profile/Provider Settings files and their focused tests;
- one agent may own transcript presentation primitives and mapped renderer
  migrations;
- one agent may own visual/a11y fixture tooling and assertions.

The primary agent must own Composer/launch integration, cross-cutting types,
conflict resolution, final visual calibration, full tests, and the final
report. Never let two agents edit the same files. Agents must not independently
change shared runtime authority or invent backend contracts.

## 10. Verification

Run focused tests throughout, then at minimum:

```bash
pnpm exec tsc --noEmit
pnpm eslint .
pnpm test
pnpm build
git diff --check
```

Also run the headed/headless real-route review tooling and report:

- exact screenshot inventory;
- viewports/themes/zoom/state matrix;
- console, page, request, hydration, and overflow failures;
- accessibility assertions;
- baseline versus final product-code diff;
- product code lines/files separately from documents and screenshots;
- exact skipped tests with reasons.

Do not commit `node_modules`, `.next`, `out`, `dist`, coverage, browser caches,
temporary clones, temporary server state, or real user data.

## 11. Git and worktree discipline

- Work only in the dedicated frontend reconstruction worktree.
- Preserve pre-existing changes and record them before work.
- Do not touch any Agent-Box repository or another worktree.
- Do not reset, checkout, clean, stash, or broadly format unrelated files.
- Do not execute `git add`, commit, push, merge, or branch deletion unless the
  user explicitly requests the checkpoint.
- Maintain a per-phase intended-file ledger and classify product, test,
  fixture, and document changes separately.

## 12. Completion gate

The final report must use this exact high-level verdict table:

| Area | Allowed result |
|---|---|
| Profile Settings | COMPLETE or BLOCKED |
| Model Provider Settings | COMPLETE or BLOCKED |
| Launch Profile + Provider + Model | COMPLETE or BLOCKED |
| Flat Transcript real renderer migration | COMPLETE, PARTIAL, or BLOCKED |
| Composer hierarchy | COMPLETE or BLOCKED |
| Whole-route visual reconstruction | COMPLETE or BLOCKED |
| Real Agent-Box adapter | CONTRACT-TESTED, PARTIAL, or NOT AVAILABLE |
| Ready for human visual checkpoint | YES or NO |

The overall Goal may say `COMPLETE` only when:

1. Real Settings routes contain usable, orthogonal Profile and Provider
   surfaces.
2. Real Composer/launch UI contains compatible independent selection.
3. All ordinary real transcript families listed in R3 are migrated or each
   remaining family is explicitly reported as `PARTIAL`; any `PARTIAL` makes
   the overall verdict not complete.
4. The real page visibly differs from the baseline in whole-page comparison.
5. Behavior, virtualization, streaming, queue, permission, attachment,
   keyboard, theme, zoom, static export, and responsive tests remain green.
6. Visual and interactive review tooling is portable and human-runnable.
7. No backend, Rust/Tauri, dependency, lockfile, secret, or unrelated scope was
   changed.

Do not claim that a real Codex task can be launched unless the Agent-Box
adapter accepts exact Profile and Provider refs and a separately authorized
real end-to-end model run has passed. A truthful `PARTIAL` or `BLOCKED` result
is preferable to another foundation-only completion claim.

