# Batch 31 — Session routing policy sinks out of `app/composition`

**Baseline:** Batch 30 executor snapshot: `app/composition/routing/` 7 files / 1,186 lines;
three Session policy families account for 6 files / 1,096 lines. The adjacent
`application/session/request-router.ts` is 210 lines and remains in place.

> **Order:** Batch 30 must be merged and independently reviewed first. Batch 31 then
> runs alone. It does not overlap an active Batch 30 worktree and must not be folded
> into Batch 30's validation/fixup commit.

## Objective

Make `app/composition` describe UI assembly only. `overlay-routing.ts` stays because it
coordinates an application overlay. Opening a Session, resolving its owner and
dispatching a Session-scoped request are application use cases, so those three
families move intact to `application/session/`.

This is an ownership correction, not the Hermes-neutral vocabulary rewrite. Existing
function names, request method strings, owner ladders and Gateway behavior remain
unchanged. The terminal vocabulary pass is reserved separately after all `app/`
subdirectories have received semantic review.

## Before / after

```text
before
app/composition/routing/
├── overlay-routing.ts                       ✓ UI composition routing
├── open-session.ts + test                   ⚠ Session navigation policy
├── session-owner.ts + test                  ⚠ Session ownership policy
└── session-rpc-dispatcher.ts + test          ⚠ Session request orchestration

application/session/
└── request-router.ts                        ✓ owner-selected transport routing

after
app/composition/routing/
└── overlay-routing.ts                       ✓ only UI composition routing remains

application/session/
├── open-session.ts + test                   ◀ user intent → Session surface policy
├── session-owner.ts + test                  ◀ runtime/stored id and owner resolution
├── session-rpc-dispatcher.ts + test          ◀ resolve owner, then call request-router
└── request-router.ts                        ✓ unchanged downstream use case
```

## Exact scope

| From | To / action | Reason |
| --- | --- | --- |
| `app/composition/routing/open-session.ts` + test | `application/session/open-session.ts` + test | Opening/focusing a Session is application policy used by several surfaces, not implementation selection. |
| `app/composition/routing/session-owner.ts` + test | `application/session/session-owner.ts` + test | The stored/runtime identity and owner ladder are Session policy. |
| `app/composition/routing/session-rpc-dispatcher.ts` + test | `application/session/session-rpc-dispatcher.ts` + test | It orchestrates Session ownership resolution and the existing application request router. |
| `app/composition/routing/overlay-routing.ts` | Keep in place | Overlay presentation routing belongs to composition. |
| Importers, mocks and fixtures of the three moved modules | Repoint to `@/application/session/*` | Remove the old ownership path completely. |

Do not merge `session-rpc-dispatcher.ts` into `request-router.ts` in this batch. The
dispatcher determines the targeted Session and its owner; the router selects/leases
the owner's transport. Keeping that sequence explicit preserves the proven routing
ladder while putting both use cases under one owner.

## Invariants and non-goals

- Preserve open intents (`in-place`, `stack`, `tab`, `window`, `main`), modifier
  behavior, blank-draft reuse, unread clearing and pop-out fallback exactly.
- Preserve runtime-id → stored-id resolution order, owner precedence, fail-closed
  owner assertion, cross-profile probe and gone-session resume wake-up exactly.
- Preserve public exports and test behavior. Move tests with their implementations.
- Keep `overlay-routing.ts` in composition.
- Do not rename `RPC`, `Gateway`, Hermes bridge globals, storage keys, IPC channels or
  user-facing copy here. Batch 32 owns the coordinated vocabulary pass after its
  vocabulary table is approved.
- Do not add compatibility barrels or re-export the moved files from composition.
- Do not redesign `application/session/request-router.ts` or transport/store APIs.
- Do not read, modify or stage the protected untracked paths:
  `apps/desktop/src/agentbox/`, `apps/desktop/src/plugins/agentbox-lab/`,
  `docs/architecture/acp-desktop-phase1-design.md`, `docs/desktop-src-tree.md`.

## Stages and commit boundaries

1. Confirm Batch 30 is merged/reviewed and record the live tests/importers for the six
   files. Stop if their behavior changed after this handoff.
2. Move `session-owner` and `session-rpc-dispatcher` with their tests; repoint callers;
   run their narrow test group; commit the policy-routing sink.
3. Move `open-session` with its test; repoint all surfaces and the `lib/open-session`
   installation seam; run its narrow tests; commit the navigation sink.
4. Prove composition routing contains only overlay routing, run proportional/full
   Renderer validation, update the status and commit the record.

## Validation

```bash
cd apps/desktop
npm run typecheck
npm run test -- --run \
  src/application/session/open-session.test.ts \
  src/application/session/session-owner.test.ts \
  src/application/session/session-rpc-dispatcher.test.ts \
  src/application/session/request-router.test.ts
npm run test -- --run --project ui
cd ../..
! rg -n "@/app/composition/routing/(open-session|session-owner|session-rpc-dispatcher)" \
  apps/desktop/src
find apps/desktop/src/app/composition/routing -maxdepth 1 -type f -printf '%f\n' | sort
git diff --check
```

The final directory listing must contain only `overlay-routing.ts` unless an independently
approved UI-composition routing file was added after this work order.

## Stop and report when

- Batch 30 is not merged and independently reviewed.
- Moving a file requires changing Session behavior, RPC method shape, owner authority,
  persistence, transport selection or public product semantics.
- `session-rpc-dispatcher` and `request-router` prove behaviorally duplicated and a
  merge would require choosing a new contract; report the overlap instead of inventing it.
- A protected user path would need to be touched.
- Existing behavior tests require semantic assertion changes rather than path updates.

## Acceptance state

- Green: `APPLICATION_SESSION_ROUTING_SINK_GREEN`
- Otherwise: `APPLICATION_SESSION_ROUTING_SINK_PARTIAL` with exact remaining files and evidence.
