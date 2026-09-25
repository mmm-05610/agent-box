# Backlog — unfinished work, recorded not dispatched

**Nothing in this file may be dispatched.** No executor is appointed
([decisions.md](decisions.md) D-0003). This is a preservation record: the point is
that the unfinished work is not lost, not that it is queued.

## Source and how this was derived

Machine-extracted from the retired authority's order registry on 2026-09-20:

- source: `agent-box-server-round1/docs/implementation/manifest.json`
- sha256: `9f0ccf6b55f6afb19f33c74ea3e2aaeb7c8cfc5d601cb651a090b21955eb9f11` (380 618 bytes)
- 156 orders total; **111 are not `DONE`** and are listed line-by-line in
  [backlog-full.tsv](backlog-full.tsv) (id, worktree, branch, state, terminal,
  depends_on, dependency_condition, document, progress, source, note).
- The full work-order texts live on the retained branches — the `document`
  column is a `repo:path@sha` pointer, resolvable in
  `worktrees/backend-service-env-provider`, `worktrees/backend-runtime-round1`,
  `worktrees/desktop-chat-wsl-round1`, `worktrees/desktop-settings-round1`.

## State vocabulary, and what it does *not* mean

| Recorded state | Count | Means |
| --- | --- | --- |
| `DISPATCHED` | 64 | handed to an executor; no acceptance record was appended before the sessions stopped |
| `PARTIAL` | 25 | an executor declared it only partly done |
| *(no `state` key)* | 20 | early orders (37–60 range) whose state was never migrated into this registry — see the caveat below |
| `RATIFIED_DISPATCHED` | 1 | order `099`, dispatched on a ratified decision |
| `SUPERSEDED` | 1 | order `P41` |

**`terminal` is a target code, not a completion.** 38 orders carry a `terminal`
value ending in `_DONE` while their `state` is still `DISPATCHED` (e.g. `116`,
`123`, `130`, `P56`, `P70`, `151`, `153`, `154`, `156`). Two of them settle what
it means: `154` carries `OUTPUT_CAP_LAYER_AND_CUT_VISIBILITY_DONE` while the same
records describe it as **never claimed**, and `151` carries
`CREDENTIAL_ENTRY_SURFACE_DONE` while its **stage 2 was still in flight**
(`status.md` round 177's unclaimed/awaiting list). So `terminal` records the
outcome *code the order aims at*, written at dispatch time — **it is not evidence
that any of it happened.** The manifest never says this; the cleanup states it
because the records only make sense that way. Do not promote any of those 38 rows
to DONE without the executing tree's own acceptance record.

## Where the work sits

| Worktree | Not-DONE orders | What the group is about |
| --- | --- | --- |
| `backend-service-env-provider` | 37 | wire-contract completeness, provider/profile model records, harness artifact management, and the user-facing credential-entry surface (`151`) |
| `backend-runtime-round1` | 27 | sidecar lifecycle and typed failure causes, sandbox network posture, provider login/registry, output-cap layer (`154`) |
| `desktop-chat-wsl-round1` | 24 | send-path honesty (`P32`), sidebar (`P33`), model pill (`P37`), wire-host failure visibility (`P70`), plus 20 small UI/gate orders whose terminal says the edit landed |
| `desktop-settings-round1` | 16 | provider page (`P28`), i18n catalog integrity (`P48`), thought-in-transcript parity (`P35`) |
| `server-round1-scheduling` | 6 | orders `37`–`42` — the original backend baseline; never migrated into the registry |
| `harness-expansion` | 1 | order `43` (depends on `42`) |

## Gaps — the work that is missing rather than merely open

1. **No independent acceptance for the backend baseline.** `BACKEND_IMPLEMENTATION_READY`
   was registered on user authorisation plus executor self-review; the fixed
   reviewer's `ACCEPT` never arrived (quota). Conflict **C-10**, unresolved as **U-1**.
2. **Integrated acceptance remains incomplete.** Historical integration ownership
   and five real UI replies are recorded; absence of independent review does not
   mean no integration happened. The new native Linux baseline needs its own
   verification ([current-state.md](current-state.md) §2).
3. **Two withdrawal-forcing gaps have no acceptance row**: order `42` and order
   `110`, the two that made the `ACC-R3` window be withdrawn (conflict **C-6**).
4. **The user's own credential entry does not exist yet** (order `151`). Until it
   does, the user cannot self-serve a provider without someone configuring it.
5. **The silent-truncation fix is not in the window the user is running** (orders
   `156` on the backend tree, `154` on the runtime tree; see
   [current-state.md](current-state.md) §4).
6. **No acceptance record exists for the currently running build.** The `ACC-R5`
   window is open and was walked by the user, but its findings (silent truncation,
   mislabelled service status, clipped model pill) have no closing row.

## Dependency shape (for anyone planning a next round)

- `P36`, `P41a`, `P41b`, `P43`, `P46` and `P37`/`P41` all reduce to **`P32`**
  (send-path honesty on the chat tree) and **`P42`** (no acceptance row).
- `P29`/`P30` (settings) depend on runtime orders **`092`/`093`** and **`094`/`095`**.
- `P28` depends on **`092`**; `P21` depends on env-provider **`58`–`64`**.
- Order **`43`** (harness-expansion) depends on **`42`**, which depends on both
  READY gates — i.e. it is blocked behind the integration question, not behind
  harness work.
- The truncation cluster — `108` → `122` → `134` → `156` (backend) and `154`/`150`
  (runtime) — is self-referential: `134`/`156` consume the contract that `108`'s
  fix must define. Conflict **C-4** says `108`'s status is inconsistent.

## Caveats (from the cleanup, not from the old records)

- The 20 orders with **no `state` key** (ids 37–42, 43–53 range) cannot be
  classified from the registry. The retired `status.md` has exactly one per-order
  table (`status.md:53–71`) and it covers only ids 37–42 and 45–54, is dated
  2026-09-15/16, and was never revised after dispatch — so it is stale even where
  it shows a state. The cleanup did not establish the real state of these rows and
  does not guess. Treat them as "state unknown, verify before relying on it".
- Four orders are `DONE` with **no `delivered_at`** (`61`, `62`, `63`, `64`).
  That is a record-completeness gap, not evidence of non-delivery.
- The registry's own counts were already known to be unreliable in this way:
  ruling `R-0040` was superseded by `R-0046` ④ precisely for publishing a count
  set that could not be compared across lines.
- **Highest-risk loss surface** if anyone resumes: the rows that were *unclaimed*
  or *in flight* when the sessions stopped — `154`, `153`, `156`, `131`, `133`
  (backend/runtime) and `P66`, `P67`, `P68`, `P70` (chat), plus `151`, `P28`,
  `137` mid-stage. These had live state in a session that no longer exists; the
  tree contents are preserved but the *intent* only survives in the snapshot.
