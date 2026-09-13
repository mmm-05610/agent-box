# Batch 34 — AgentBox Desktop frontend branch

**Baseline:** the renderer layer ledger is `0`; Batches 30–33 are merged and reviewed.
The product model is partly fixed by
[`app-product-semantics.md`](../app-product-semantics.md) and
[`session-multi-surface-ownership.md`](../session-multi-surface-ownership.md).

> **DESIGN HOLD (2026-09-13): do not execute this work order.** The owner paused the
> branch before implementation. Finish the remaining UI semantic audit and approve the
> frontend ↔ Work Core protocol first. Only a later explicit ruling may remove this hold.

## Objective

Turn the current Hermes Desktop renderer into a small, product-semantic **AgentBox
Desktop frontend** without changing the main branch or pretending the AgentBox backend
already exists. The renderer presents Workspaces, Sessions and Profiles; Harness and
Execution stay infrastructure. Existing Hermes-direct behavior may survive only behind
an adapter boundary while the branch proves that the UI can consume neutral view models
and emit neutral intents.

The branch is allowed to reorganize code progressively, but is not allowed to invent a
backend implementation, a new execution protocol, or any Renderer-visible backend Ref.
It must leave an auditable checkpoint after each layer.

## Branch and checkpoint discipline

Create a sibling worktree rather than switching the active construction checkout:

```bash
git switch main
git pull --ff-only
git worktree add ../agent-box-desktop-next-agentbox-ui \
  -b experiment/agentbox-desktop-frontend main
```

If the branch name or sibling directory already exists, inspect it and report rather
than overwriting it. Record the base commit in
`docs/architecture/agentbox-desktop-frontend-branch.md` on the experiment branch.

Every stage below ends with a focused validation, an implementation commit on
`experiment/agentbox-desktop-frontend`, and a branch-journal update that records the
resulting tree, remaining Hermes leaks, exact test result and next permitted stage.
Do not merge the branch, rebase `main`, reset, stash, or stage unrelated files. The
untracked AgentBox POC is not copied, modified, or staged.

### Every stage ends with an independent review, and that is not an approval gate

A stage is **not complete** when its commit lands. It is complete when an **independent
subagent** has reviewed it and returned its own measured numbers. This is the rule the
main line already runs on — a status row may only say `merged` when it names a commit
*and* a reviewer's numbers — and a branch programme does not get a weaker bar just
because it does not touch `main`.

The reviewer must:

1. run the commands itself rather than read the implementer's summary;
2. re-derive the stage's claimed tree and diff, not accept the journal's description;
3. report the numbers it measured: affected tests passing/failing, the full `test:ui`
   totals against the recorded baseline, `git diff --check`, and the count of remaining
   Hermes/Gateway/RPC leaks in the surfaces this stage touched;
4. walk the stage's own disposition row and confirm nothing it was told to remove is
   still reachable, and nothing it was told to keep was quietly removed;
5. verify the branch discipline held — no `main` commit, no rebase/reset/stash, no
   protected path touched or staged, no unrelated file staged;
6. state a verdict and append it to the branch journal, with its own numbers, next to
   the implementer's.

A stage whose reviewer did not pass it is **not done**, and the next stage does not
start. That is a correctness barrier between stages, not a permission gate: nothing
here waits for a human. The executor runs the whole programme; what it cannot do is
call a stage finished on its own say-so.

Stage 5 is the programme's acceptance review and follows the same rule, at the whole
branch's scope: an independent reviewer re-runs the acceptance validation and reports
the after tree, the remaining-leak table and the test comparison itself.

## Product target

```text
AgentBox Desktop
├── Workspaces                              ✓ fixed primary surface
│   ├── local Workspace
│   └── remote Workspace → one private Connection
│       └── Connection is edited from its Workspace, never Settings
├── Sessions                                ✓ shown under current Workspace
│   ├── may request a Workspace change for future activity
│   └── show Ready / Working / Waiting / Failed / Stopped, never Execution
├── Profiles                                ✓ fixed primary surface
│   ├── reusable roles (Main / Reviewer / Researcher ...)
│   ├── grouped by a weak “powered by” toolbench label when useful
│   └── static role configuration; Session overrides never mutate it implicitly
├── Settings                                ✓ application preferences and diagnostics only
└── contextual / contributed capabilities
    ├── Workspace: files, git/worktree, terminal, preview
    ├── Session: transcript, composer, session output
    ├── Profile: instructions, model behavior, skills, memory, tools/MCP, permissions
    └── Automation: dynamic feature/plugin contribution, not fixed navigation
```

## Decided content disposition

```text
current surface                         branch destination
────────────────────────────────────────────────────────────────────────────
New Session                             Workspace action; not a fixed navigation item
Profiles                                fixed primary role library/editor
Skills / Toolsets / MCP                 Profile-contextual capability configuration
Artifacts global library                remove; Session output remains intact
Agents / subagents aggregate            remove the current UI surface and route;
                                        do not invent its replacement yet
Cron                                    retain only as harness-neutral Automation
                                        contribution; no fixed nav, profile-on-disk
                                        semantics, Gateway restart or Hermes wording
Starmap                                 optional Profile Memory contribution, not fixed nav
Webhooks / messaging delivery           remove from the core Desktop product surface
Command Center                          dissolve into its actual destinations:
                                        Session utility, Settings diagnostics/updates,
                                        or removal; never preserve a renamed junk drawer
Gateway / Connections in Settings       remove; a private Connection lives under a
                                        Remote Workspace only
```

Session-local artifacts, transcript output, attachments and generated files are not
removed. They are generic Session content, not the old global Artifacts product.

## Before / after

```text
before — fixed/sidebar/route product vocabulary
├── Chat / New Session                    ⚠ runtime-shaped entry
├── Skills · Artifacts · Cron             ⚠ fixed navigation despite contextual meaning
├── Agents · Starmap · Webhooks           ⚠ Hermes-specific product surfaces
├── Command Center                        ⚠ sessions + maintenance + gateway/update junk drawer
├── Settings
│   └── Gateway / Connections             ⚠ infrastructure as a global preference
└── direct Hermes names leak through product components

after — frontend product vocabulary
├── Workspaces                             ◀ primary navigation + Workspace actions
├── Profiles                               ◀ primary navigation + role editor
├── Settings                               ◀ app preferences / diagnostics only
├── features/
│   ├── workspace/                         ◀ files/git/worktree/terminal/preview context
│   ├── session/                           ◀ transcript/composer/output/activity context
│   ├── profiles/                          ◀ instructions/model/resources/permissions
│   ├── automation/                        ◀ optional neutral contribution shell
│   └── memory/                            ◀ optional Profile contribution shell, if retained
├── api/workcore/                          ◀ neutral frontend Port draft and models only
└── legacy compatibility adapter           ◀ direct Hermes details below UI boundary only
```

Exact file names may be refined by the executor after each audited layer, but a
refinement may not change the dispositions above.

## Exact scope and non-scope

| Area | Authorized work | Boundary |
| --- | --- | --- |
| `src/app/` and registrations | reshape routes, primary navigation, command palette and Settings classification | no direct Runtime/Harness/Execution concepts in product UI |
| `src/features/` | relocate/retire the decided surfaces; extract contextual feature boundaries | preserve Session output and current user-visible behavior where its destination remains |
| `src/application/`, `src/store/` | introduce neutral UI intents/view-model coordination at the narrowest authority | do not move process ownership into Renderer |
| `src/api/workcore/` | add a versioned, transport-free `DesktopWorkCorePort` draft and product DTOs | no HTTP endpoints, no AgentBox server edits, no credentials, Refs, cursors or harness homes |
| `electron/legacy-hermes/` and renderer bridge seams | adapt existing Hermes behavior behind the Port only when needed to preserve the branch | do not rename preload/IPC/storage/persistence identifiers blindly |
| docs/tests/i18n | update user copy, tests and branch journal alongside every visible change | never use source-text assertions as tests |

Protected paths — never read for implementation decisions, modify, copy, or stage:

```text
apps/desktop/src/agentbox/
apps/desktop/src/plugins/agentbox-lab/
docs/architecture/acp-desktop-phase1-design.md
docs/desktop-src-tree.md
```

## Stages and commit boundaries

Each stage's `Commit:` line is where that stage's implementation lands. **It is not
where the stage ends.** Before the next stage begins, the stage must carry an
independent reviewer's verdict and measured numbers in the branch journal (see
"Every stage ends with an independent review" above). A stage without that review is
an open stage, and the next one does not start.

### 0. Branch baseline and semantic map

- Verify Batch 32 and 33 review records, clean `main`, base commit and protected-path exclusion.
- Create the dedicated worktree/branch and the branch journal.
- Audit route/sidebar/command-palette/Settings registrations against the disposition table.
- Commit: `docs(agentbox-ui): establish semantic branch baseline`.

### 1. Top-level product surfaces

- Make Workspaces and Profiles the only fixed product navigation surfaces.
- Move New Session to a Workspace action.
- Remove global Agents and Artifacts entries/surfaces without touching generic Session output.
- Remove Webhooks/messaging core entry points and Connection/Gateway as Settings concepts.
- Dissolve Command Center by moving only already-decided utilities to their destination; stop if an item has no destination.
- Commit: `refactor(agentbox-ui): establish workspace profile navigation`.

### 2. Contextual and contributed feature boundaries

- Re-home Skills/Toolsets/MCP as Profile-contextual configuration.
- Turn Cron into a neutral Automation contribution shell: it may be unavailable until a
  later backend/plugin exists, but must not lie or retain Hermes profile/Gateway wording.
- Re-home Starmap only as an optional Profile Memory contribution, or remove its current
  route if that extraction cannot preserve an honest capability boundary.
- Update localized copy and navigation/command-palette tests.
- Commit: `refactor(agentbox-ui): contextualize optional capabilities`.

### 3. Product-model coordination below the surfaces

- Make Session Workspace-change, Profile selection, Profile edit and Session-local
  override explicit generic UI intents.
- Keep Profile persistence distinct from Session overrides.
- Ensure Connection is only rendered as Remote Workspace infrastructure; no global shared Connection library is introduced.
- Remove user-facing Harness/Execution terminology in changed UI. Compatibility names
  at storage/preload/IPC seams remain untouched and documented for the final pass.
- Commit: `refactor(agentbox-ui): coordinate neutral product intents`.

### 4. Work Core frontend Port draft

- Define `DesktopWorkCorePort@v0` as TypeScript contracts plus an in-memory/test
  implementation. It models only user-level views and intents: Workspaces, Sessions,
  Profiles, Session state, Session Workspace change, Profile selection/overrides, input
  submission, stop request, and capability contributions.
- It contains no Hermes/Gateway/RPC/Harness/Execution/Ref/cursor/credential/native-home
  vocabulary. Opaque UI IDs are allowed.
- Route the branch's product UI through this Port where behavior can be preserved; put
  existing Hermes-direct mapping behind one explicit compatibility adapter. If a needed
  AgentBox operation is unknown, record it as an unimplemented Port capability rather
  than fabricating a wire format.
- Commit: `feat(agentbox-ui): draft work core frontend port`.

### 5. Branch acceptance review

- Produce an after tree, remaining compatibility-leak table, and proposed AgentBox-facing
  protocol document. The latter is a frontend proposal, not a cross-repository contract.
- Test changed behavior through injected ports, not source-text scans or mocks of internals.
- Run full renderer validation and compare failures against the recorded baseline.
- Commit: `docs(agentbox-ui): record frontend branch acceptance`.

## Invariants

- The renderer remains a client: no runtime is bundled, imported from this checkout or moved into the frontend.
- Electron owns app/process infrastructure only; Work Core owns future Harness/Execution child processes.
- Existing Hermes support may remain as a compatibility adapter, never as a product concept above that boundary.
- Every changed user-facing string is localized in all required catalogs.
- A feature may leave core navigation without deleting generic user data or Session output.
- No fake AgentBox success, hidden fallback, credentials in records/tests, destructive cleanup, `git add -A`, or main-branch implementation commit.

## Validation

At every checkpoint run affected typecheck/tests plus `git diff --check`. At final acceptance:

```bash
cd apps/desktop
npm run typecheck
npm run test
cd ../..
git diff --check
git status --short
```

**The stage reviewer runs these commands itself** and records its own numbers; the
implementer's run is evidence about the work, not evidence that the stage passed. Where
a number cannot be compared to a baseline, say so rather than reporting it bare.

Retain a manual classification of every changed route/sidebar/menu/Settings entry. A
grep may aid review but may not be made into a brittle source-text test.

## Stop and report when

- Batch 32 or 33 lacks an independent reviewed merge.
- A disposition needs persistent-data, public preload/IPC or cross-repository protocol changes.
- An unlisted surface needs a new product meaning.
- Preserving a feature requires UI Ref/cursor/Execution/Harness details.
- The Hermes adapter cannot implement a Port intent without runtime behavior changes.
- The branch adds a new failure, touches a protected path, or needs destructive Git.
- **Two review rounds on the same stage disagree, or a reviewer's numbers contradict the
  stage's own claim.** Do not resolve it by re-running the review until it passes, and do
  not proceed to the next stage on the implementer's reading.

## Acceptance state

- Green: `AGENTBOX_DESKTOP_FRONTEND_BRANCH_GREEN` — semantic UI boundary and a tested
  frontend Port proposal exist on the experiment branch; **every stage carries an
  independent reviewer's passed verdict with its own measured numbers**, and Stage 5's
  acceptance was re-derived by a reviewer rather than accepted from the implementer's
  summary. No claim of backend integration.
- Partial: `AGENTBOX_DESKTOP_FRONTEND_BRANCH_PARTIAL` — exact stage, blocked capability
  and evidence are recorded in the branch journal; name which stage(s) lack an
  independent passed review, because a partial with unreviewed stages is not the same
  as a partial with reviewed ones.
