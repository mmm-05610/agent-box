# Sol#2 round-2 E impl-accept 决定 — **代码经 Sol+C 双方确认正确**；REJECT 仅因**验收件未入仓**→ 撤回候选、返 E 打包轮

- 请求 `--milestone E-impl-accept --request-id 3eb6faff-eaa3-4091-88e8-409157af35f9`，consume GRANTED → used **4/10**（path=flexible）、`record ok`、raw `sol/E-impl-accept-002.raw`。
- 审阅对象 = 修复版候选 `a4f7ca4`（`d35b5d6`+`bf21839`）。

## Sol 判定（VERDICT: REJECT，但实质是 ACCEPT-on-code）
Sol **逐条确认生产修复正确**：submit 查在/占位在**同一 `self._lock` 临界区**、竞态 submit 重放胜者 dispatch_id、factory 失败释占位、open 失败保占位 `start_uncertain`（不洗白）、cancel 在 `target.cancel_lock` 内**双查+先写回执后放锁**、全局锁不跨 `port.cancel`；且既往不变量全在（无 Core/objective、correlation 不透明、observe 纯读、closure 免兼容字面量、bool 壳 unknown→False）。
**唯一 `blocks:impl`**：`tests/test_e_inc1a_matrix_pins.py` **不在被审树/`HEAD`** → 判不了 criterion-3（并发钉是否**强制交错、非假绿**）。

## C 复核：这是打包/放置缺口，非代码缺陷
- 事实：E 的 INC1a/INC0 回归测试**只存在于组同级 `execution/tests/`**，`d35b5d6` 提交**零 in-tree 测试**；而**仓内本就有 `tests/server/`（107 文件）落点**，且 **P-T1/T2 先例把测试提交进仓**（`plugins/*/tests/`、本候选含 `test_bwrap_wrap_failure_rollback.py` 等）。C 早先 cherry-pick 只带入 4 源文件 → 候选携产品码却无 CI 回归钉。**我批准 §13 写 `execution/tests/` 未同时要求集成时入仓，此为我侧规格缺口，共同纠正。**
- C 已**自行读码确认两竞态闭合**（与 Sol 一致），并自跑：E 组套 **51/1xfail/0**、S 公开形状锁 **4/4**、全量 **0 新增失败**——但那些跑的是**同级 tests**，非候选 CI；criterion-3「钉能否证伪」我**未独立证**（Sol 亦因文件缺失未证）。

## 决定：撤回候选、返 E「打包 + 强化钉」轮（代码勿动）
1. **候选 `reset --hard 4917f56`**（INC1a 暂不入；保持候选为末个自洽已验状态，P-T1 先例）。
2. **返 E（不改已确认正确的产品码）**，仅两件：
   - (a) 把 INC1a/INC0 回归测试**提交进仓 `tests/server/`**（匹配 P 先例的持久落点；`test_e_inc1a_matrix_pins.py`、`test_e_inc0_block1_pins.py`），使候选自带 CI 钉。
   - (b) **强化 cancel 并发钉 ②**：E-010 §2 自陈 ②「未在 30×6 压力循环自然复现、属分析性预防钉」；Sol 警告此类无强制交错的钉**可假绿**。改为**确定性 force**（event/屏障令竞态者必落在 `port.cancel` 已派发、回执未写入之窗，或阻塞式 fake port），钉**修复前红、修复后绿**。submit 钉 ① 若已能复现 4/4/4 则保留。
3. **C 侧重验**：重新集成**自洽版**（源+入仓测试）→ 我在候选上跑全量（含新入仓测试）→ **我亲写一条确定性交错反证**（对未修复码红、对修复码绿）以自证 criterion-3，**不第 5 次花 Sol**（Sol 已两度独立确认码正确；缺的是可见的入仓钉 + 我对可证伪性的自证）。

## 下游
- S-block1 仍挂（INC1a 未自洽验收）。P-T3 与本轮无关，正集成于 `4917f56` 之上（见当轮心跳）。

## 追补 19:29Z — C 以**可执行红-绿复现**替代第 3 次 Sol，直接坐实 criterion-3
- E-011 交**确定性强制交错钉**（gate 停泊 fake port_factory + `_GateLock` 计数锁获取，令 racer 必落入窗口）。**C 亲跑复现**（非采信）：
  - **RED**：一次性 pristine `d35b5d6` worktree（`/tmp`，用后即删）跑 `forced_interleave` → **2 failed**（`same key started through two ports` / `abort re-dispatched through the receipt window`），与 Sol round-1 实测 4/4/4、2/1 同构。证**钉能证伪**（非假绿）。
  - **GREEN**：E 当前源（`bf21839`）跑矩阵套全量 → **28 passed / VERDICT=GREEN_NO_SKIPS**（3.13s，含 1s/2s 有界窗口=确定性非运气）。
- 判定：round-2 Sol 唯一 `blocks:impl`（看不到钉、判不了可证伪性）**已由 C 可执行红-绿直接解决**——比 Sol 读码更强（Sol 无写盘跑不了）。**故不再花第 5 次 Sol**（GOAL-START「不浪费 Sol」；两次核验=design-final✓ + impl-accept-review✓ 且码已双确认正确）。
- **余唯一打包件**：E 已把两钉移入仓 `source/tests/server/` 但**仍未 commit**（`git status` 显示 `??`，且 in-tree 副本 sha `1e2df5fe…` ≠ E-011 报 `5380d9a7…`=E 尚在编）。→ 请 E **`git add tests/server/test_e_inc1a_matrix_pins.py test_e_inc0_block1_pins.py` 并提交**（自洽、进 CI），提交后 C 把 `d35b5d6`+`bf21839`+钉 commit 一并 cherry-pick 至候选 `28b5f70`、跑全量差量（含入仓钉转绿）→ **即定 CP-E-INC1a 验收、放行 S-block1**，无需再 Sol。
