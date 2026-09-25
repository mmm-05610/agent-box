# Current state

**当前开发起点：**[linux-native-dev-0](development-baseline.json) 已固定，
两仓集成工作区干净、四条源线为其祖先、协议摘要一致（I 复核）。
允许据此组织后续开发，已知缺陷分配见 [development-layout.md](development-layout.md)。
这不是 Linux 全链运行或用户验收通过。

**2026-09-21 更新：**已迁到 native Linux；下文服务 PID、端口可达性和 Windows
试用窗口均为 09-20 历史快照，不代表新环境运行状态。当前源码盘点及下一步见
[Linux 基线计划](linux-native-baseline-plan.md)。本轮未启动服务、未运行产品验收。

Written 2026-09-20 by the cleanup executor, from first-hand observation of the
live process table, the git worktrees, and the preserved records. Every claim
below is either **实测** (observed by the cleanup executor on 2026-09-20), or
**引用** (quoted from the preserved records with a pointer), and it is labelled.
Nothing here is a user-acceptance verdict.

**The three layers are not interchangeable.** Code being finished does not mean
the two sides are integrated, and integration does not mean the user can use it.

---

## 1. Implemented (code exists; targeted gates were run at some point)

Split by the worktree that owns it. `state` values are as recorded in the retired
manifest (`archive/legacy-scheduling/…/manifest.json`), not re-verified here.

### 1.1 Backend service — `worktrees/backend-service-env-provider` @ `feature/env-provider-v1`

- **实测**: working tree clean at **`003b52b2b18a86547d2819ea8875095442d2011b`** (2026-09-20 12:39).
- **引用** (manifest / status):
  - The 28-method wire was locked for implementation; TS digest `11e3b3e7…`, generated
    artifact digest `5d4fa3bf…` (`status.md:128–131`).
  - Four harness families (pi / hermes / opencode / codex) each have a production
    packaging, and on 2026-09-15 all four real-model `--live` gates exited 0
    (two real DeepSeek rounds each, same native id resumed, credential locators
    untouched, cumulative cost < ¥0.05; `status.md:79–82`).
  - Windows r4 platform gate passed; state-capture typed error boundary landed as
    bundle **c8**; four-family native `HOME` isolation implemented; harness
    capability contract unified (`status.md:74–89`).
- **引用 — the honest caveat**: `BACKEND_IMPLEMENTATION_READY` was registered on
  2026-09-15 on **user authorisation + executor self-review**; the fixed
  independent reviewer **never delivered an `ACCEPT`** (quota hard-stop until
  2026-09-20 12:11), and the same status file's dual-gate field still reads
  `BACKEND_IMPLEMENTATION_READY=否` (`status.md:32`, `:88–94`, `:123–127`).
  See [decisions.md](decisions.md) §Unresolved **U-1**.
- **引用**: 37 orders remain open/PARTIAL/undispatched in this tree, including
  `151` (wire-side controlled credential entry — this is the gap that makes
  user self-service credential entry impossible) and `156` (`message.final` must
  carry a stop reason). Full list: [backlog.md](backlog.md).

### 1.2 Runtime / control plane — `worktrees/backend-runtime-round1` @ `feature/env-provider-runtime`

- **实测**: clean at **`a7b7b6ff15ab127a168ec3715bb5eb4414aa8aaa`**; only an untracked
  `.qoder/settings.local.json` (client settings, not work product).
- **引用**: `091` and `092` PARTIAL; `150` closed as **PARTIAL**
  (`SIDECAR_CAUSE_TRANSPORT_PARTIAL`) — the typed upstream-cause mapping works for
  the `ENOENT`/`EACCES` and `EPIPE`/`ECONN*` families, but three branches
  (`HARNESS_CHANNEL_DEAD`, `OP_UNSUPPORTED`, `CREDENTIAL_UNAVAILABLE`) were never
  reproduced by a real fault; 27 of 41 orders still open.
- **引用**: `154` (output-cap layer + cut visibility) is dispatched and was the
  single highest-priority order when the sessions stopped (`status.md` round 167).

### 1.3 Desktop chat — `worktrees/desktop-chat-wsl-round1` @ `feature/agentbox-desktop-product`

- **实测**: clean at **`08b4eac7fe10aacc3220cca94c52659aaf043cc5`**; untracked `.qoder/` only.
- **引用**: `P32` `SEND_PATH_HONESTY_PARTIAL`, `P33` sidebar PARTIAL, `P37` pill restore
  PARTIAL, `P70` (wire-host failure must be visible) dispatched. 24 of 30 orders open.

### 1.4 Desktop settings — `worktrees/desktop-settings-round1` @ `feature/agentbox-desktop-settings`

- **实测**: clean at **`01083212aaade2ead3a1be9323943ea3eae3284e`**; untracked `.qoder/` only.
- **引用**: `P28` `PROVIDER_PAGE_PARTIAL`, `P34` lint hygiene PARTIAL, `P35` thought-in-transcript
  PARTIAL, `P48`/`P55` PARTIAL; 16 of 20 orders open.

### 1.5 Historical Studio trees — not part of the current product

- `worktrees/studio-ui-reconstruction`: **实测** 898 tracked modifications (mostly
  deletions) + 277 untracked, uncommitted. `worktrees/studio-codex-vertical`:
  57 tracked modifications + 51 untracked. Both **preserved and snapshotted**;
  neither is under the current product line. See [workspaces.md](workspaces.md).

---

## 2. Integrated (the two sides actually run together, verified)

**历史主链路曾跑通；完整验收未闭环，新 Linux 基线尚未验证。**
2026-09-21 校正：原清理报告据独立审阅缺失推导“从未联调”，该推导不成立。

- **引用**: order `42` required two gates (backend READY *and* desktop READY) plus a
  released writer lease before taking over integration. The desktop side recorded
  `writer_lease=RELEASED` and self-reported `DESKTOP_IMPLEMENTATION_READY`
  (`status.md:102–127`), but the backend side's independent closure never arrived,
  which leaves an independent-review evidence gap, not proof that integration never ran.
  The archived `status.md:90–101` records registration on user authorisation plus
  executor self-review and an integration owner; `docs/acceptance/round-5.md`
  `ACC-R5-10` records five real UI messages and replies through the full chain.
- **引用 — what *is* real**: both sides were built against the **same wire**: the TS
  and generated-artifact wire digests were recomputed in place in the front-end
  worktree and matched the locked values (`status.md:128–131`). So the *contract*
  was aligned; runtime integration evidence is separately recorded in `ACC-R5-10`.
- **实测**: as of this cleanup, the running trial server loads the backend tree and
  the user's app is a Windows-side frozen copy of the chat tree — that is a
  historical pairing in front of the user (see §3), with recorded end-to-end
  replies and open defects, not a completed acceptance or a current Linux result.

---

## 3. User-tryable (a user can actually reach it and see something)

This layer is described with the distinction the cleanup was asked to keep.

### 3.1 实测可达 — there is a live window open right now

- **实测 (2026-09-20 13:2x)**:
  - WSL Server on **`127.0.0.1:18790`** is listening (pid 749) and answers
    `GET /live` with **HTTP 200**. (`/health` is 404 — the product has no such route;
    404 here means nothing about health.)
  - WSL Server on **`127.0.0.1:18810`** (the QA line's own instance, pid 302) also
    answers **HTTP 200**.
  - A Windows-side leg is listening on **18830** (pid 25484), and an Electron app
    (5 processes, started 11:15–11:16) holds **CDP 9222**.
  - The trial data root `/home/maoqh/.agentbox-trial-chat` exists (mode 755).
- **引用**: the acceptance window recorded as **`ACC-R5` = `handed`** (open, never
  closed): the user, *in the app*, sent 5 messages and got assistant replies —
  the first time the chat loop was walked end-to-end through the real UI
  (`gate-log.md:16`, `:121`, `:126`, `:136`; `docs/acceptance/round-5.md` `ACC-R5-10`).
  **What that window is pinned to**: front end = chat-tree checkpoint
  **`Q2-P58` = `c585e82f`**, delivered as **`ordessa@0.17.2`**; back end = the
  `agent-box-env-provider` commit **`b630acd`**. The app leg was moved from the WSL
  side to a **Windows frozen copy at `C:\Users\maoqh\agentbox-wsl-round1`**
  (`gate-log.md:108`, `:114`, `:121`) — the window table's header row still says
  "WSL 侧" and was not updated (conflict **C-14**). The environment was declared
  frozen for the duration of user verification.
- **引用 — the window deliberately lacks the newest fixes**: the running `18790`
  process (pid 749, started 09:45) contains neither `149` nor `152`
  (`gate-log.md:112`, `:122`), nor `156` (dispatched 12:39).
- **引用 — what the user saw that is wrong**: replies were cut at a stable
  magnitude (87/89/77/96 characters) while every turn still reported
  `completed` with `reason: None` — i.e. **the truncation is silent**
  (`round-5.md` `ACC-R5-9`). The status bar said `Service Connected` while the
  main process logged 4 failed `agentbox:wire:request` calls (`ACC-R5-7`), and the
  composer's model pill is visually clipped with no `title` (`ACC-R5-8`).

### 3.2 仅历史记录 — recorded as handed to the user before, since closed or withdrawn

**引用** (`gate-log.md`): `ACC-R1` closed, `ACC-R2` closed, `ACC-R3` withdrawn
(`superseded`, user ruling `R-0044`), `ACC-R4n` withdrawn (`superseded`, `R-0063`).
Their findings were turned into orders (`P41`, `P42`, `106`, `108`, `110`, `120`,
`122`, `134`, `117`). Nothing in them is a claim about the current build.

### 3.3 尚未验证 — no evidence, and cannot be established without disturbing live state

- The **truncation fix**. `156` (stop reason on `message.final`) was dispatched at
  12:39 — *after* the running server process started (09:45), so the running
  instance cannot contain it. Verified by construction, not by测试 the running leg.
- `150` (typed upstream cause) and `154` (output-cap layer) exist on the **runtime**
  tree, which the window is not running at all.
- Whether the user's own credential entry works — `151` is still dispatched.
- Any claim that the current build is "good enough": **no acceptance record exists
  for it**, and the cleanup did not create one.

---

## 4. The gap between §1 and §3 (what "implemented" still does not deliver)

| What | Where it is | Why the user cannot have it |
| --- | --- | --- |
| Silent truncation fixed | `156` on the env-provider tree (dispatched 12:39), `154` on the runtime tree | the running process imported code from the tree at **`b630acd`** (09:29), i.e. **10 commits behind** the current clean HEAD `003b52b`; a restart would be needed, and a restart changes the现场 the user is validating |
| Typed upstream cause on the live leg | `150` on the runtime tree | the window is not running the runtime tree at all; structurally invisible in this window |
| Credential self-service | `151` (not implemented) | no wire surface exists yet |
| Visible wire-host failure | `P70` stage 2 (in flight on the chat tree) | not in the frozen Windows copy the user is running |
| Complete integrated acceptance | order `42`, `ACC-R5` | historical end-to-end replies exist; independent review and defect closure remain incomplete; native Linux must be reverified |

**Note on version identity (实测):** the running server's *process* started at 09:45
and its `PYTHONPATH` points at the env-provider worktree, whose HEAD is now
`003b52b` (10 commits ahead of `b630acd`, which is what the acceptance record
pinned). The tree on disk has therefore moved since the process started; the
running instance must be treated as **`b630acd`**, not as the current HEAD.
