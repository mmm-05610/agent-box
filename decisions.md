# Decisions currently in force

The old ruling ledger (`rulings.md`, 81 numbered ids `R-0001`…`R-0081`) is
preserved verbatim in `archive/legacy-scheduling/`. **This file is not a copy of
it.** It carries (1) the rules that still govern this workspace, (2) the product
decisions that are still binding, (3) the replacement chains, and (4) everything
the records do not settle. Where a fact lives in another file of this control
directory, it is linked, not restated.

Every entry names its source. Sources are `R-00xx` (old ruling ids, resolvable in
the archive snapshot) and `D-000x` (new entries created by this handover —
append-only; to overturn one, add a new entry that says `supersedes: D-000x`).

---

## Part 1 — Authority in force right now (handover state)

### D-0001 — `control/` is the single current scheduling authority
**In force.** Created 2026-09-20 by the cleanup, on the user's instruction to
migrate the scheduling entry point. The old authority
(`agent-box-server-round1/docs/implementation/`) is retired to history; the old
rules file keeps a migration pointer but no authority. Renaming this file's
directory is the only way to move the authority.
**Source:** user instruction 2026-09-20; see [migration-log.md](migration-log.md) M-9.

### D-0002 — `I` is the only interface to the user
**In force.** Direction, cross-layer trade-offs, authorisation boundaries and the
delivery conclusion belong to `I`. No other session, file or role may put a
question to the user, and the old one-way channels (`handoffs.md`, `bulletin.md`,
`approval-queue.md`, `rulings.md`) are retired with their authors.
**Source:** old `R-0067`, `R-0070` (I rules / ops executes), `R-0071`; preserved.

### D-0003 — No executor is appointed; therefore nothing may be dispatched
**In force.** The former formation is stopped (user, 2026-09-20): the background
scheduler `ops`, the acceptance poller `A`, the QA line, the two reviewers, the
scout, and the four executor trees (backend service, runtime, desktop chat,
desktop settings). `backlog.md` is a record of unfinished work, not a queue.
`I` appoints executors before any work order is issued.
**Source:** user instruction 2026-09-20; old `R-0054`, `R-0057`, `R-0062`,
`R-0079`, `R-0080` describe the formation that is now stopped.

### D-0004 — This control directory inherits no old machinery
**In force.** It carries neither the `incremental-work-order` skill's mandatory
polling loop nor any previous session's writer identity. The `ops` loop ended
with its session and is **not** restarted by anything in this workspace.
**Source:** user instruction 2026-09-20 (do not restart the loop, do not resume
its queue); the old loop is described at `scheduler-charter.md` §2–§3b.

### D-0005 — Hard boundaries carried over unchanged
**In force.** (a) No `git push`. (b) `R-0035` merge freeze: no merging product
branches into `main` until the user announces a first usable version — still in
force, never lifted. (c) The publishing `main` checkouts are not to be
overwritten. (d) Real model calls were authorised against the user's DeepSeek
account with itemised accounting and no fixed cap (`R-0011`, `R-0017`, relaxed
ceiling per order `46`); that authorisation belonged to the stopped sessions and
**does not transfer** — a new session may not spend on the user's account without
a fresh grant from `I`. (e) Credential contents are never read, printed or
copied; only locators are recorded.
**Source:** `R-0035`, `R-0011`, `R-0017`, `R-0001`; manifest `orders[46]`
`model_authorization`; see [environments.md](environments.md) for locator paths.

---

## Part 2 — Product decisions still binding

These do not depend on the old formation; they constrain whatever is built next.

| # | Decision | Source |
| --- | --- | --- |
| D-0006 | The product is named **Ordessa**. `AgentBox` survives only as internal/source naming. Contradictory documents must be fixed. | old `R-0072` |
| D-0007 | Model settings are two layers: **Provider** (account/credential) and **Profile** (provider + model binding). One profile per session. | old `R-0013`, `R-0008` |
| D-0008 | Three product stages: usable → daily-usable → bright core. "Daily usable" scope = configuration + subscription login + breadth across families. | old `R-0018`, `R-0037` |
| D-0009 | **Windows holds the persistent Profile/Session authority**; the WSL/remote side holds bounded execution projections, not a second authoritative store. | old `R-0012`, `R-0014`; master plan §所有权 |
| D-0010 | **Reuse existing third-party Harness integrations is mandatory** — an ACP SDK, a single adapter, or a "referenced and self-written" shim does not count as having reused the integration. | master plan §当前顺序与验收 |
| D-0011 | Truncation must be visible: a long answer is either complete or carries an explicit stop reason; silent loss of the tail is a defect. No new vocabulary — reuse the four ACP stop values. | old `R-0081` ① ; `status.md` round 167 |
| D-0012 | Child-turn lifecycle follows the parent's wait mode; watching turns die with the parent; background execution is a design card only, not implemented. | old `R-0075` |
| D-0013 | Slash-command text is split by source: backend-sourced strings stay as they are; desktop-local strings go through i18n. | old `R-0074` |
| D-0014 | A checkpoint must be tagged at every user-visible order close. | old `R-0053` |
| D-0015 | Facts are graded: **measured / quoted / unverified** must be labelled, and a mechanism (fake-endpoint) proof never substitutes for a real-model proof, or vice versa. | `README.md` §4; `status.md:31` |

---

## Part 3 — Replacement chains (which decision replaced which)

| Chain | Evidence |
| --- | --- |
| `R-0027` ⑦ → **`R-0028`** | rulings.md:70 |
| `R-0037` ④ → **`R-0038`** | rulings.md:60 |
| `R-0025` ③ → `R-0044` ③ → **`R-0054` ②** (who may write rulings/approvals) | rulings.md:52, :36 |
| `R-0040` (QA line created) → `R-0054` ① (cut) → **`R-0057`** (reopened, narrow) | rulings.md:36, :33 |
| `R-0054` ① (scout cut) → **`R-0062` ③** (scout restarted, UI-first) | rulings.md:36, :28 |
| `R-0040` counts "154/22/1042" → **`R-0046` ④** (voided) | rulings.md:50 |
| `R-0007` approval tiers → extended by **`R-0032` ⑤** | rulings.md:66 |
| order `45` design §6 → **`R-0012`** | rulings.md:95 |
| `R-0036` ② queue order → `R-0054` ⑥ → **`R-0079` ② / `R-0080`** (charter queues voided) | rulings.md:11, :10 |
| Window `ACC-R3` → **`R-0044`** (`superseded`) | rulings.md:52; gate-log window table |
| Window `ACC-R4n` → **`R-0063`** (`superseded`) | rulings.md:27; gate-log window table |

All of these are **history**: they explain how the records reached their present
shape. Only the parts listed in Part 1 and Part 2 are live instructions.

---

## Part 4 — Conflicts found in the records (both sides kept, nothing invented)

The cleanup was told not to decide these by timestamp. Each was checked against
the original text.

| id | Conflict | Both pointers |
| --- | --- | --- |
| **C-1** | `AQ-0013` (Worker `stopReason` field) is recorded as **approved** by the user, but its row still sits under the `## proposed` heading in the approval queue. | approved: `rulings.md:24` ("`AQ-0013` 获批（用户 22:38「我同意」）"), and `R-0081` ② cites it as an approved precedent (`rulings.md:13`); still proposed: `approval-queue.md` AQ-0013 row. Contrast: `AQ-0012` *was* moved to `approved` (`approval-queue.md`, `rulings.md:29`). Not determinable from the records which is authoritative. |
| **C-2** | The QA line is simultaneously described as frozen and as reopened. | frozen: `scheduler-charter.md:254` ("`R-0040` QA 线（**已被 `R-0054` 冻结**）"); reopened: `scheduler-charter.md:205` ("QA＝集成验证线（2026-09-19 20:1x **重开**，窄口径，`R-0057`）") and `rulings.md:33`. The charter's own "currently in force" list is stale. |
| **C-3** | The scout role is simultaneously cut and restarted — same shape as C-2. | cut: `rulings.md:36`; restarted: `rulings.md:28`, `scheduler-charter.md:207`. |
| **C-4** | `108` (output cap) has three mutually inconsistent recorded states. | `gate-log.md:73` says the symptom disappeared **and**, in the same line, that `108` stays PARTIAL; `gate-log.md:45`, `:60`, `:86` say PARTIAL; the manifest says `PARTIAL`; `rulings.md:9` re-affirms silent truncation is still happening. Only "PARTIAL / not judged DONE" is consistent. |
| **C-5** | `134` is recorded `DONE` in one place and still un-done in another. | `rulings.md:24` ("消费侧 `134` 已 `DONE`") vs manifest `orders[134].state = DISPATCHED`, and `rulings.md:9` still lists the visible-truncation work as un-done. |
| **C-6** | Several orders are `DONE` in the manifest with no matching acceptance row — including `P42` and `110`, the two gaps that forced the `ACC-R3` window to be withdrawn. | manifest `orders[42]/[110]`; window withdrawal: `gate-log.md` ACC-R3 row. No later window covers them. Not determinable whether an acceptance happened outside `gate-log.md`. |
| **C-7** | Two decided `AQ`s have no row at all in the approval queue. | `rulings.md:77` (`AQ-0004` approved) and `rulings.md:35` (answer to `AQ-0010`) vs `approval-queue.md`, which contains no `AQ-0004` or `AQ-0010` row. |
| **C-8** | The recorded formation size is stale. | `prefs.md:27` ("ops + A + 审阅者×2 + 执行者×4（8 个 Qoder 会话）") does not include the reopened QA line (`R-0057`) or the restarted scout (`R-0062` ③). |
| **C-9** | `rulings.md` is described as append-only but its ids are not in monotonic line order. | e.g. `R-0072` at line 16 precedes `R-0073`/`R-0074`; `R-0064` at line 24 precedes `R-0065`/`R-0066`. Content is unaffected; possibly intentional back-fill. |
| **C-10** | `BACKEND_IMPLEMENTATION_READY` is recorded as both registered and not. | registered: `status.md:74`, `:90–94` (registered on user authorisation + executor self-review); not achieved: `status.md:32`, `:88`, `:123–127` (still "否", missing the fixed reviewer's stage closure). The closure-source field itself says the reviewer never returned `ACCEPT`. |
| **C-11** | Orders `52` and `54` are `PARTIAL` in the registry but "`READY_FOR_EXECUTION`（实现未开始）" in the retired status table. | registry: `manifest.json` `orders[52]/[54].state = PARTIAL`; retired text: `status.md:67`, `:69` (table dated 2026-09-15/16, never revised after dispatch). Both readings are kept; the table is stale, but "stale" is a judgement the cleanup does not make. |
| **C-12** | Order `146` is `PARTIAL` in the registry but recorded `DONE` in the polling ledger. | `manifest.json` `orders[146].state = PARTIAL`, `terminal = DELEGATION_RECOVERY_GATE_AND_LATEST_READ_PARTIAL`; `status.md:2033`, `:2035` ("`146` 收口 ⇒ `DONE`", "`DISPATCHED`→`DONE`"). |
| **C-13** | Orders `128`, `129` and `P36` are `DISPATCHED` in the registry, but their own round announces 收口 — and that round's own ledger lists only `140`→DONE. | `manifest.json` `orders[128]/[129]/[P36].state = DISPATCHED`; announcement: `status.md:1907–1908`; contradicting ledger: `status.md:1913`. Not determinable whether the transition was recorded. |
| **C-14** | The `ACC-R5` window header says the app runs on the WSL side, but every later note says it is the Windows frozen copy. | header: `gate-log.md:16` ("应用 `ordessa@0.17.2`（WSL 侧、CDP 9222）"); later: `gate-log.md:108` (P-22, "应用这条腿从 WSL 换到 Windows 侧"), `:114` (P-24), `:121` (P-26) — Windows frozen copy at `C:\Users\maoqh\agentbox-wsl-round1`. The header row was simply not updated. Same table also predates the `Q2-P58-rev1 = 6f5a10cb` tag (`gate-log.md:124`), which was recorded as *not* a re-pin. |
| **C-15** | `terminal` codes ending in `_DONE` sit on rows that are demonstrably not done. | `154` = `OUTPUT_CAP_LAYER_AND_CUT_VISIBILITY_DONE` while the same records list it as never claimed; `151` = `CREDENTIAL_ENTRY_SURFACE_DONE` while stage 2 was in flight. 38 rows total. The manifest never defines `terminal`; see [backlog.md](backlog.md) for why it must be read as a dispatch-time target code. |

---

## Part 5 — Unresolved: needs `I` (see cleanup-report §7 for the short list)

| id | Question the records do not answer |
| --- | --- |
| **U-1** | Was `BACKEND_IMPLEMENTATION_READY` actually banked, and on what authority? The records show a registration whose own closure-source field says the independent reviewer never accepted. This determines whether the two sides ever counted as "both ready" (order `42`'s dual gate). |
| **U-2** | Is `108` (output cap / silent truncation) still an open defect at the level the user cares about, or was the symptom superseded by later orders? `R-0081` treats it as live; `gate-log.md:73` treats the symptom as gone. |
| **U-3** | Did the Worker `stopReason` contract change (`AQ-0013`, approved) actually land? It determines whether order `156` is building on a contract that exists. |
| **U-4** | Merge window: `R-0035` freezes merges until the user announces a first usable version. No announcement is recorded. Does the freeze still hold as written? |
| **U-5** | Role truth: is the QA line / scout alive or cut (C-2, C-3)? This matters only if the formation is rebuilt; it does not affect the product. |
| **U-6** | Cloud verification line (old `R-0047`/`R-0048`/`R-0049`): the records say "mechanism proven" and leave three user decisions open (`rulings.md:54`). No follow-up. Whether that mechanism is still wanted is a `I` decision. |
| **U-7** | Skill repository version: whether to tag 0.3.0 and re-sync the installed copy was left to the user (`rulings.md:29`, `:31`). No decision recorded. Out of scope for this cleanup. |
