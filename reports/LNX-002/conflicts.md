# LNX-002 — conflict resolution and trade-offs

Every conflict from both merges, the side taken, and why. Rule of record:

- **Product code** — resolved by *semantic* integration. No whole-file `ours`/`theirs`
  was used as a substitute for understanding a seam. Where a whole-side pick was taken,
  the side is shown to be a behavioural superset of the other and the residual is named.
- **Retired scheduling text** (`docs/**`) — one side taken, the other kept in git via the
  merge parents (I's review, item 5: "旧文档冲突可选择一侧并保留另一侧 git 来源，调度权威只在 control").
- **Modify/delete in `work-orders/`** — git's own outcome kept: the file survives with the
  side that *modified* it (no non-empty evidence disappears).

---

## 1. Backend merge — `e393812`

Merge commit `e39381243…`; parents `a7b7b6ff15ab127a168ec3715bb5eb4414aa8aaa` (runtime)
and `003b52b2b18a86547d2819ea8875095442d2011b` (service); merge base
`a4f82566f6718c4af0c58062a44c2107e04e6106`. Both source histories are therefore
ancestors of the checkpoint — nothing was dropped by rebase or squash.

Common product-source files: exactly **3**, as LNX-001 predicted.

### 1.1 `src/agent_box/server/model_configs/service.py` — conflict → **took runtime (`ours`)**

Two hunks. This is the one真 "either/or" file, and the claim "runtime wins" was verified
line by line rather than assumed:

| Surface | runtime version | service version | superset |
| --- | --- | --- | --- |
| `_validate` harness rule | `harness is None` ⇒ shared record, credential check skipped | `harness not in self.harnesses` (None ⇒ `HARNESS_UNAVAILABLE`) | runtime — schema 20 makes `harness_type` nullable, so shared records must be creatable |
| protocols | `normalize_protocols` / `validate_endpoints` / `normalize_model_facts`, `PROTOCOL_INCOMPATIBLE` | absent | runtime |
| `project()` | emits `protocols` / `endpoints` / `protocolsDeclared` / `compatibility` | absent | runtime |
| `freeze_execution_configuration()` | emits `protocols` / `endpoints`, enforces `PROTOCOL_INCOMPATIBLE` | absent | runtime |
| `validate_references` | tolerates `harness_type = None` | `!= harness` fails on None | runtime |
| `update()` KEEP semantics (Order 112) | present, plus the Order 126 union comment | present (docstring only wording) | equal |
| published config object | `_config_payload(body, norm)` | inline `{schema_version, configuration}` | runtime — identical **byte** output when no protocols are declared, richer when they are |

No service-line behaviour is lost: every error code and message the service version raises
is still raised. The conflict blocks were `-` (imports of `provider_protocols`) and the
config-publication body — both resolve to the runtime text.

### 1.2 `src/agent_box/server/model_configs/repository.py` — conflict → **took runtime (`ours`)**

Conflict was **comment-only**. The behavioural difference rode through auto-merge:
runtime's `harness_type: str | None` (the schema-20 nullable form) survived, service's
`harness_type: str` did not. Service cannot pass `None` anyway (see 1.1), so no callable
signature narrows. Residual vs service after resolution is 5 comment lines + the nullable
annotation, all enumerated in the diff recorded in `status.md`'s run log.

### 1.3 `src/agent_box/server/sessions/repository.py` — **auto-merged, then verified**

Regions were disjoint, so git merged without a conflict. Verified explicitly rather than
trusted, because this file is the union that matters most:

- `WIRE_VISIBLE_EVENT_KINDS` **retains service's 4 additions** (`usage.updated`,
  `thought.delta`, `plan.updated`, `mode.updated`) — and that is *required*, not cosmetic:
  runtime's own `wire/projection.py:36-51` `_EVENT_KIND_MAP` already maps all four to
  frames, so without the additions `event_frame` falls back to the storage `seq` and one
  stream carries two number spaces (`AUD-B-010`). The equivalence gate
  `tests/server/test_wire_seq_numbering_spaces_128.py` came in with the service side.
- runtime's `terminal_reason` parameter (Order 134) and `turn_message_deltas` (Order 146)
  are both still present.

### 1.4 `docs/**` — content conflicts → **took the base (runtime) side**

`docs/implementation/status.md`, `docs/implementation/worktree-charter.md`,
`docs/implementation/work-orders/queue.json`.

`queue.json` was checked before choosing: the runtime list
(`scripts/server-round1/**`, `protocols/**`, `workers/**`) is a strict **superset** of the
service list, so nothing is lost there. `status.md` is *not* a clean union — the two lines
restructured the ledger at the same insertion point (runtime 327 lines vs service 1329), so
concatenating would interleave sections under the wrong headings and duplicate `## 工单 104`.
With no product authority in these files and an explicit licence for one-side selection,
the base side was taken.

### 1.5 `docs/**` modify/delete — **kept the modified side**

30 work-order files. In every case git's own resolution was kept: the file survives holding
the content of whichever side *modified* it (`DU` ⇒ service's, `UD` ⇒ runtime's). This
preserves the file set as a union while respecting the explicit deletions of the other
side's *renames*. No file that either side edited vanished.

### 1.6 `docs/server-round1/wire-review.md` — **union (kept both blocks)**

Not retired scheduling text: it is first-hand measurement. The conflict was purely additive
(runtime 25-line `## Work Order 092 …` section vs service 95-line `## 工件口径（Order 113…）`
section). Both blocks were kept verbatim; no text was rewritten.

### 1.7 The wire artifact rename/rename — **kept both names, deleted the ambiguous default**

Merge base had `docs/server-round1/fullstack/generated/wire-v1.schema.json`. Runtime renamed
it to `…/snapshot-33methods-stale.json`; service renamed it to
`…/contract/wire-v1.schema.registered-c4255b31.json`. Resolution:

- keep `generated/wire-v1.schema.snapshot-33methods-stale.json` = runtime's bytes
  (`a1bd52a4…`, 33 methods, self-labelled stale);
- keep `contract/wire-v1.schema.registered-c4255b31.json` = service's bytes (`c4255b31…`);
- **delete** `generated/wire-v1.schema.json` — both sides moved it away, and a file sitting
  at the default path is exactly the "stale artifact picked by default" hazard the task
  forbids (task item 4).

⚠️ Git's rename/rename resolution had written the **service** bytes into *both* targets.
That was caught by digesting each file against its source (`a1bd52a4` vs `c4255b31`) and
the stale snapshot was restored from `HEAD`. This is recorded because a silent
content swap across a rename is invisible to a conflict-marker scan.

---

## 2. Desktop merge — `0aa7a945`

Merge commit `0aa7a945…`; parents `08b4eac7fe10aacc3220cca94c52659aaf043cc5` (chat) and
`01083212aaade2ead3a1be9323943ea3eae3284e` (settings). Both histories preserved.

### 2.1 `apps/desktop/src/lib/desktop-fs.ts` — the media decision → **semantic union**

This is `AUD-F-030`. Both lines fixed the same leak (a bearer token in a query string, which
lands in history, access logs, proxies and `Referer`) with different mechanisms:

- **chat (P54)**: hand out *no* URL for a remote file — `mediaExternalUrl` returns a
  `file://` path — and add a token-free download route: `mediaRemoteDownloadUrl` +
  `mediaRemoteAuthHeaders` + `mediaRemoteObjectUrl` (blob) + `openRemoteMediaFile`.
- **settings (P55)**: route both remote URL producers through the app's **managed
  `hermes-media://` protocol** (already the merge-base behaviour for the stream route).

I's review (item 6) directs the managed-protocol direction and requires the check to be
made before choosing. Findings:

- **Auth — passes.** `media-protocol.ts` resolves the connection **in the main process** per
  scope key; the bearer is obtained there (`ensureRemoteBearer` OAuth, or the
  `x-hermes-session-token` header in token mode). The renderer URL carries only
  `connectionId` / `profile`, which are *identity*, not credentials.
- **Target constraints — partly checked, gap recorded.** Hostname must be
  `remote|stream` and the path non-empty, but the handler also enforces
  `isStreamableMediaPath` — an extension allow-list (`avi flac m4a mkv mov mp3 mp4 ogg opus
  wav webm`). **Images (`.png/.jpg`) are outside it and get 415.** There is no `..`
  traversal check inside the handler; local resolution is delegated to the injected
  `resolveLocalFile` and remote resolution to the gateway's `/api/files/stream`.
- **Resource release — gap recorded.** The handler returns the upstream `Response` straight
  through; it does not cancel the upstream body if the renderer aborts.

Resolution (`desktop-fs.ts`):

- `mediaGatewayStreamUrl` → settings' form (managed protocol).
- `mediaExternalUrl` → settings' form; **this is the P55 shape winning over P54's "no URL"**.
  The credential-free property both sides were protecting is kept.
- **chat's `mediaRemoteDownloadUrl` / `mediaRemoteAuthHeaders` / `mediaRemoteObjectUrl` /
  `openRemoteMediaFile` are retained**, because they are not a duplicate of the protocol —
  they serve the one case the protocol provably cannot: an explicit "open/save this gateway
  file" **download of a non-streamable path**, which the protocol answers 415 for. This also
  keeps the build coherent: `markdown-text.tsx:108` **calls** `openRemoteMediaFile`, so
  deleting chat's side wholesale would not compile.

Consequence recorded as a known gap (not papered over): with `mediaExternalUrl` now
returning `hermes-media://` for remote paths, `generated-image-result.tsx`'s bridge-less
image fallback and its `openExternal(mediaExternalUrl(image))` action get a scheme the OS
shell cannot open. That path was already non-functional under chat's `file://` (wrong host),
so this is a pre-existing gap whose *shape* changed, not a new capability loss.

### 2.2 `apps/desktop/src/lib/media.remote.test.ts` — **union of both assertion sets**

Both sides' assertions were kept and reconciled against the union implementation above; the
only genuinely contradictory expectations were the two describing `mediaExternalUrl` for a
remote path, and chat's version of that block asserts only "carries no token/secret", which
the managed URL satisfies. Nothing was deleted to hide a missing behaviour.

Mechanical note: git had aligned the shared suffix so that **both** sides' final `it(...)`
was left unclosed, to be closed by the common trailing `})`. A naive concatenation would
have nested settings' tests *inside* chat's dangling test body (syntactically valid, silently
wrong). The union was rebuilt structurally: settings' three `mediaExternalUrl` cases were
placed inside `describe('mediaExternalUrl')`, and chat's `describe('mediaRemoteObjectUrl')`
was closed before the common tail resumes.

### 2.3 ⚠️ Integration defect found and fixed across the seam — `activity-timer.ts`

**This is the one defect the merge itself created**, and it is exactly the class the task
warns about ("集成新增失败必须解决"):

- `activity-timer.ts` merged cleanly and kept **settings' 2-arg**
  `formatElapsed(seconds, labels)` (the i18n increment: the unit comes from the locale, not
  a hardcoded `"s"`).
- chat's `thoughtLabelFor` also merged in, and it called `formatElapsed(seconds)` — **one
  argument**. The pair is incoherent; the call site is only reachable at runtime.

Fix: extended `ThoughtReportCopy` with `durationSeconds` (production already passes
`t.assistant.thread`, which has it — `activity-timer-text.tsx:25` passes that object as the
labels argument), and `thoughtLabelFor` now calls `formatElapsed(seconds, copy)`.

Follow-on, same seam: chat's `activity-timer.stamps.test.ts` called `formatElapsed(x)` while
settings' `activity-timer.test.ts` calls `formatElapsed(12, zh)`. Both files are new on
their own side (chat-only / settings-only) so both merged in, and the two arities cannot
coexist. The stamps test's fixture gained `durationSeconds` and the call gained the labels
argument — **expected values unchanged** (`'12s'`, `'Thought for 12s'`, `'Thought for ≈9s'`).

### 2.4 `apps/desktop/src/components/assistant-ui/thread/message-parts.tsx` — conflict → **took chat (`ours`)**

Settings' block computes the thought label inline from `thoughtFor` / `formatElapsed`, but
`thoughtFor` **does not exist** anywhere in the merged file (the merged `activity-timer.ts`
exports `thoughtLabelFor`, `stampDurationSeconds`, `useMeasuredDuration` … and no `thoughtFor`).
Chat's block calls `thoughtLabelFor(t.assistant.thread, {completedAt, pending, stopwatch:
measuredFor, timestamp})`, which matches the merged module. Taking settings' text would have
introduced two undefined identifiers; this is a superset check, not a preference.

### 2.5 `apps/desktop/src/features/chat/agentbox-chat-view.tsx` — **union import**

`useId` (chat) vs `useEffect` (settings). The merged body uses **both**
(`useId` at the composer surface id, `useEffect` at the send/effect path), so the import is
the union: `{ type ReactNode, Suspense, useEffect, useId, useMemo }`.

### 2.6 `apps/desktop/src/i18n/index.ts` — **union export**

Chat re-exports `withRuntimeI18nLocale`, settings re-exports the type `CountNounKey`. Both
targets were verified to exist after the merge (`runtime.ts:70`,
`types.ts:49`), so the union is coherent: all three functions + all four types.

### 2.7 `.agents/skills/incremental-work-order/README.md` — **took settings (`theirs`)**

Both sides state the same rule (no skill copy in this directory); settings' text is the later
one and names the order/round (`P45` / `R-0029 ③`). Not product code — repo-tracked agent
documentation that both source lines already carried.

### 2.8 `docs/desktop-product-delivery/**` — same rule as §1.4

`status.md` and `worktree-charter.md` content conflicts → base (chat) side; the 19
`work-orders/P2*.md` modify/delete entries → kept the modified side. i18n (`en/zh/ja/ar/ru/
zh-hant/types.ts`) needed **no** manual resolution — every locale file auto-merged, and the
result is checked by the i18n parity gate and the typecheck rather than by eye.

---

## 3. Trade-offs the reviewer should weigh

1. **`mediaExternalUrl` for remote now yields `hermes-media://`** (P55 over P54). Chosen on
   I's tentative direction; the two binding gaps found (extension allow-list excludes
   images → 415; no upstream-body cancel on abort) are recorded above and are *not* fixed by
   this task, which integrates sources and does not add behaviour.
2. **Retired scheduling docs lose one line's ledger text from the working tree.** The
   service line's `docs/implementation/status.md` restructuring is not carried; it stays
   reachable at `003b52b2`. Same for `worktree-charter.md`.
3. **`generated/wire-v1.schema.json` no longer exists.** Any tool that read the *default*
   path now fails loudly instead of silently reading a stale 33-method artifact. The gates
   were re-run explicitly against a named artifact (see `protocol.md`).
4. **`docs/implementation/**` is still present** in the candidate tree. LNX-001 left its
   disposition (keep / drop / move to `archive/`) as an open question for I; this task
   integrates and does not decide it.
