# Batch 16 — sink the session-recovery core (the enabler for 13)

**Edges paid off: 0.** This batch exists so that batch
[13](13-composer-last-edge.md) can pay the last ledger line. Run it first; the pair
together take the ledger to **0**, and neither is finished without the other.

**Why this is a work order and not a step inside 13.** 13 moves
`uploadComposerAttachment` to `application/session/`, and that function calls
`withSessionNotFoundResume`, which lives in
`app/session/hooks/use-prompt-actions/utils.ts`. Left where it is, the new
`application/` module would import upward — an `application → app` edge that is
**not in the ledger**, which is precisely what the ratchet forbids. The executor hit
this, proved it six ways and stopped instead of widening the ledger. It was right,
and its suggested remedy — sink the recovery core first — is what this order
specifies.

**The first version of this section measured the closure wrong, and a worker caught
it.** It said 38 modules with two inside `app/` and no upward edge, because the walk
matched `from '…'` only. `utils.ts:104` reaches the resolver through a **lazy dynamic
import**:

```ts
const { resolveSessionProfile } = await import('../use-session-actions/utils')
```

Re-measured with every specifier form (`from`, `import()`, `require()`, `vi.mock()`,
side-effect `import '…'`), the real numbers are:

```
183 modules in the closure — not 38
  of which in app/: 11 — utils.ts, single-flight-resume.ts, and nine in use-session-actions/
non-app → higher-layer edges: 4, all of them `store → application`, which is the
  SANCTIONED direction (src/AGENTS.md), i.e. no debt
```

So there **is** an app-root reachability, exactly as the worker reported, and the
first stop condition in this order fired. Two lessons, both now written into the
method this repository uses:

- **Walk closures over all specifier forms, never `from` alone.** Relative *and*
  dynamic spellings have caused seven misses in this migration; the last two were in
  work orders I wrote.
- **The ledger scanner was already right about this.** It follows `import()` — the
  ledger once carried `components/assistant-ui/directive-text.tsx -> @/app/open-session`,
  and that import is spelled `void import('@/app/open-session')`. Only the ad-hoc
  closure walk was blind. The ratchet would have caught the bad move; the work order
  should have caught it first.

## 16a · `single-flight-resume.ts` moves whole

```
app/session/hooks/use-prompt-actions/single-flight-resume.ts
  → application/session/single-flight-resume.ts
```

82 lines and **zero imports** — verified, not assumed. Move it verbatim. Its **four**
exports — `registerRecoveredRuntime`, `singleFlightSessionResume`,
`takeRecoveredRuntime` and `clearSingleFlightSessionResumeState` (the fourth was
missing from the first version of this list; a worker found it consumed by
`index.test.tsx`) — are re-exported from the old path, which is what keeps every
consumer where it is. *(Landed as `5028abd` on `stageA/16`.)*

## 16b.0 · sink the resolver leaf, and point the lazy import at it

**The dynamic import is the whole blocker, and the fix is one leaf plus one
specifier.** `defaultResolveProfile` asks the *barrel*
(`use-session-actions/utils.ts:34`) for `resolveSessionProfile`, and the barrel is
app-side because it also re-exports a cluster that reaches `components/`
(`live-projection-merge.ts`, 455 lines, and `resume-reconciliation.ts`, 462, both read
component modules). **Moving that whole cluster down is therefore rejected**: from
rank 2 it would open `application → components` edges, which the ledger does not
sanction and this order may not add.

The resolver itself is a different story. `session-registry-lookup.ts` (270 lines) is
a use-case in everything but address: it reads the session registry, falls back to a
REST fetch, and resolves a profile ladder. Measured with all specifier forms, its
whole dependency set is:

```
@/api/sessions · @/application/session/request-router · @/lib/session-source
@/store/profile · @/store/projects · @/store/session · @/store/session/types · @/types/hermes
```

— every one of them rank 2 or below, so it lands in `application/` clean. Its
production importers are all app-side, and the barrel re-exports it, so they do not
move.

```
app/session/hooks/use-session-actions/session-registry-lookup.ts
  → application/session/session-registry-lookup.ts
```

Then two specifier edits, no signature changes and no behaviour change:

- `use-session-actions/utils.ts:34` re-exports `resolveSessionProfile` from
  `@/application/session/session-registry-lookup` (its consumers are unmoved);
- `utils.ts:104`'s lazy import points at `@/application/session/session-registry-lookup`
  **directly** rather than at the barrel. It stays a dynamic import — the laziness is
  deliberate (it keeps a heavy fetch chain out of every importer of `utils.ts`), and
  `application/ → application/` is a same-layer edge, so the lazy load costs nothing
  in the ledger.

**Rejected alternative, recorded so nobody re-litigates it:** parameterising the
resolver — deleting `defaultResolveProfile` and making every caller inject
`resolveProfile` through `SessionRecoveryDeps`. It needs no file move, but it moves a
*safety default* to every call site, and that default is what prevents a resume from
landing on whichever gateway is active and forking the conversation into the wrong
profile's DB (#67603, quoted in `SessionRecoveryDeps`). A mechanical batch does not get
to weaken that, and the closure above shows it does not have to.

## 16b · the recovery core moves to `application/session/recovery.ts`

Move these declarations out of `utils.ts`, verbatim including their doc comments —
the comments are the bulk of the value here (one of them explains the #67539
draft-has-no-DB-row case, another the #67603 wrong-profile fork):

| `utils.ts` | what |
| --- | --- |
| `:51` | `isSessionNotFoundError` |
| `:64` | `SessionRecoveryAborted` |
| `:74` | `SessionRecoveryDeps` |
| `:102` | `defaultResolveProfile` (private; its only caller is the resume) |
| `:114` | `resumeStoredRuntimeSession` |
| `:154` | `withSessionNotFoundResume` |
| `:266` | `isGatewayTimeoutError` |

**The one dependency that cannot travel is the `GatewayRequest` type**, because it is
declared in `utils.ts` and a rank-2 module may not name an app type. It does not need
to move either: `@/types/gateway.ts:18` already exports

```ts
export type GatewayRequester = <T>(method, params?, timeoutMs?, signal?) => Promise<T>
```

— the same shape with one extra optional parameter, which every current call site
satisfies (a function with fewer parameters is assignable to a type with more). So:

- the moved code names **`GatewayRequester`** from `@/types/gateway`;
- `utils.ts` keeps `export type GatewayRequest = GatewayRequester` as an alias, so its
  many consumers (`uploadComposerAttachment`, `/rewind`, `/slash`, `submit`,
  `resolve-target-session`) do not move.

This is the same move as batch 03's A.0b: when a name already exists on a rank-0 leaf,
name it instead of transporting the alias. Do **not** move `GatewayRequest` itself —
that would give one function type two rank-0 spellings.

`markSessionRecentlyInterrupted`, `isSessionRecentlyInterrupted`,
`shouldInterruptBeforeRewind`, `withSessionBusyRetry` and the submit-in-flight
bookkeeping **stay in `utils.ts`**: nothing in the upload path needs them, and moving
them would drag consumers for no edge. If `typecheck` says otherwise, report which
symbol and why rather than moving the file.

## 16c · the old path keeps its consumers

`utils.ts` re-exports every name it gave up, one block, with a comment saying the
implementation moved and why:

```ts
// The session-recovery core lives in application/session/recovery.ts so that
// below-app modules (the composer's attachment upload) can use it. Re-exported
// here because every current consumer of these names is app-side.
export { isGatewayTimeoutError, isSessionNotFoundError, SessionRecoveryAborted, … }
  from '@/application/session/recovery'
export type { SessionRecoveryDeps } from '@/application/session/recovery'
```

Nothing else in `utils.ts` changes. `utils.test.ts` and
`single-flight-resume.test.ts` must pass **unmodified** — they are the proof that this
is a relocation and not a rewrite.

## Verification

```bash
cd apps/desktop
npm run typecheck
npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers
npm run test:ui                                     # again: the ledger must not move
```

Baseline: tests **776 files / 7466**. **The ledger must still read 1 after this
batch** — it pays nothing. If it drops to 0 here, you moved the composer's edge
without doing 13; if it grows, the closure above was wrong.

Then run 13. That one pays the single remaining line, and the ledger reads **0**.

## Stop conditions

- **The moved code needs anything from `app/` other than the `GatewayRequest` type.**
  The corrected closure says it does not; a real import means the measurement is wrong
  again. Report the symbol — do not add a re-export shim in `app/` to bridge it.
- **You find another `import()`/`require()`/`vi.mock()` that the closure tables in this
  order do not list.** That is the trap this order has already fallen into once, from
  both directions. Re-run the closure with every specifier form before reporting, and
  say which form you used.
- **`single-flight-resume.ts` turns out to have imports.** Measured as zero. If it has
  any, re-run the closure before deciding, because the destination may change.
- **A test needs editing.** The re-exports exist so that it does not. A required edit
  means behaviour moved with the code.
- Do not read, edit or stage `src/agentbox/`, `src/plugins/agentbox-lab/`,
  `docs/architecture/acp-desktop-phase1-design.md` or `docs/desktop-src-tree.md`.
