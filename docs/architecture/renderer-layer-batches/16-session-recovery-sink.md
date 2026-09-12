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

**The enabler is small, and that is measured, not guessed.** A closure walk from
`utils.ts` (`from '…'` followed transitively, every layer resolved) returns:

```
38 modules in the closure
  of which in app/: 2 — utils.ts itself, and single-flight-resume.ts beside it
  non-app → app edges: 0
```

So the recovery core is a self-contained pair. Nothing outside those two files has
to move, and nothing below them reaches up.

This is also the second time the same mistake shaped a batch: my instruction in 13
said "it reads `@/lib/*` and `@/types/*`", which checked only `@/`-prefixed imports
and missed that the function reaches its helpers through `./utils`. Relative
specifiers have now caused six misses in this migration. **Check closures, not
prefixes.**

## 16a · `single-flight-resume.ts` moves whole

```
app/session/hooks/use-prompt-actions/single-flight-resume.ts
  → application/session/single-flight-resume.ts
```

82 lines and **zero imports** — verified, not assumed. Move it verbatim. Its three
exports (`registerRecoveredRuntime`, `singleFlightSessionResume`,
`takeRecoveredRuntime`) are consumed by `utils.ts` and `single-flight-resume.test.ts`;
re-export them from the old path or repoint the two importers, and say which.

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
  The closure says it does not; a real import means the measurement was wrong. Report
  the symbol — do not add a re-export shim in `app/` to bridge it.
- **`single-flight-resume.ts` turns out to have imports.** Measured as zero. If it has
  any, re-run the closure before deciding, because the destination may change.
- **A test needs editing.** The re-exports exist so that it does not. A required edit
  means behaviour moved with the code.
- Do not read, edit or stage `src/agentbox/`, `src/plugins/agentbox-lab/`,
  `docs/architecture/acp-desktop-phase1-design.md` or `docs/desktop-src-tree.md`.
