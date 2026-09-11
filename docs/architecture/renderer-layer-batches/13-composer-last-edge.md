# Batch 13 — the last composer edge: the attachment upload moves out

**Edges paid off: 1.** Shared rules and the verification recipe:
[README](README.md). Take the ledger's number when you start and subtract 1.

The edge:

```
components/assistant-ui/thread/user-edit-composer.tsx -> @/app/session/hooks/use-prompt-actions
```

**What it actually wants is one function, not the hook.** `user-edit-composer.tsx:57`
imports exactly `uploadComposerAttachment`, and calls it once (line 468). It never
touches `usePromptActions`. So this is not a batch that moves a 3,800-line hook
cluster — it is a batch that moves one use-case out of a hook module.

## 13a · `uploadComposerAttachment` → `application/session/upload-attachment.ts`

`uploadComposerAttachment` is declared at
`app/session/hooks/use-prompt-actions/index.ts:104`. It is already shaped like a
use-case, not a hook: it is `async`, it takes everything it needs as parameters
(including `requestGateway`, so it never reaches for the active gateway), and it
returns a value. `application/session/` is where this repo already keeps that kind
of thing (`request-router.ts`, `session-lists.ts`, `session-transcripts.ts`), and
**rank 2 is reachable from both sides**: `app/` may import it, and so may
`components/` — which is the whole point.

Move these five declarations, moving their doc comments verbatim:

| from | what |
| --- | --- |
| `use-prompt-actions/index.ts:104` | `uploadComposerAttachment` |
| `use-prompt-actions/index.ts:88` | `attachmentPathNeedsUpload` (private, its only caller is the upload) |
| `use-prompt-actions/utils.ts:430` | `readImageForRemoteAttach` |
| `use-prompt-actions/utils.ts:452` | `readFileDataUrlForAttach` |
| `use-prompt-actions/utils.ts:471` | `friendlyRemoteAttachError` |

The three helpers are exported from `utils.ts` and used by `utils.test.ts` as well.
**Re-export them from `utils.ts`** rather than repointing the test:

```ts
export { readImageForRemoteAttach, readFileDataUrlForAttach, friendlyRemoteAttachError }
  from '@/application/session/upload-attachment'
```

and re-export the upload from the hook module (`export { uploadComposerAttachment }
from '@/application/session/upload-attachment'`) so `app/chat/session-tile-actions.ts:42`
and `index.test.tsx`'s six references keep resolving. Then repoint the **one**
below-app caller — the edit composer — at the new module.

Check the moved code stands on rank ≤ 2 before you move it. It reads
`@/lib/*` and `@/types/*`; if it turns out to touch a store, that is still fine for
`application/` (rank 1 is below rank 2) — but if it reads anything from `@/app/` or
`@/components/`, stop, because the destination would keep an edge instead of
removing one.

## Why not move the whole hook cluster

Because it would be ~13 files and 4,000 lines to pay this one line, and the cluster's
own reason to exist is app-side: `slash.ts` reads `@/application/profile/*`, the
index hook orchestrates stores by the dozen, and the only below-app consumer needs a
pure upload. Moving the upload — and nothing else — is the smallest change that
removes the edge, and it leaves the prompt pipeline where its other consumers are.

The chain that 11 shortened stays where it is: `use-session-actions/utils.ts` and
friends are only needed if someone later wants the *hook* below `app/`. Nobody does.

## Verification

```bash
cd apps/desktop
npm run typecheck
npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers
npm run test:ui                                     # again: the ledger must not move
```

Baseline: tests **775 files / 7466**. The ledger drops by **1**. Run
`npx vitest run --project ui src/app/session/hooks/use-prompt-actions` explicitly:
`utils.test.ts` (585 lines) and `index.test.tsx` (5,300+ lines) own the upload's
behaviour — remote read failures and preview reuse among them — and they must pass
with no edits beyond the re-exports.

## Stop conditions

- **The moved code names `@/app/…` or `@/components/…`.** The destination is wrong;
  report the import rather than adding a re-export shim in `app/`.
- **A test has to change.** The re-exports exist so they do not. A required change
  means the extraction moved behaviour, not code.
- **`utils.ts` turns out to have a cycle with the new module.** Then the helper
  belongs in `application/` with its caller, and `utils.ts` should not re-export it —
  report which helper and why.
- Do not read, edit or stage `src/agentbox/`, `src/plugins/agentbox-lab/`,
  `docs/architecture/acp-desktop-phase1-design.md` or `docs/desktop-src-tree.md`.
