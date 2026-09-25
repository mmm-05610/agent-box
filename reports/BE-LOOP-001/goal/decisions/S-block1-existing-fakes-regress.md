# 裁定 — S-block1 合批集成后全量差量暴露 5 枚既有测试 AttributeError → 撤回候选、返 S 补测试 fake 扫面

2026-09-22 20:33Z（C）。候选曾 cherry-pick 合批（E `acadad7/e906cb4/f846cbc` + S `3a06783`）→ `792661e`，**C 全量 `tests/` 门 = 26F/1374P/33skip/1xfail vs baseline 21F → +5 新失败**。已 `reset --hard ac28ad5` 撤回（C 自己的合批 commit，未及他人工作）。

## 5 枚新失败（均非 baseline 集内、逐条实证）
- `test_wire_v1.py::test_stop_reports_requested_then_already_finished`
- `test_subagent_rule_liveness_086.py::test_cancelling_the_parent_reaches_the_child_turn_that_is_still_running` + `::test_the_wire_stop_applies_the_same_rule`
- `test_subagent_timeout_stops_141.py::test_timeout_cancels_the_child_and_keeps_the_typed_code` + `::test_timeout_leaves_the_child_not_active_on_the_ledger`

## 根因（C 亲判，非 M-1 回归）
`run.stop` 路径报 `internalCode: AttributeError`（fixture repr 直指 `test_wire_v1.RecordingExecution`、subagent 测试的同名 fake）。**这些既有测试的 fake execution port 只实现旧 `.cancel()`，未实现 S-block1 新消费的 `.cancel_execution()`** ⇒ 产品码从 `.cancel()` 切到 `.cancel_execution()` 后，对这些 fake 调新方法 → AttributeError。**生产端口无碍（INC1a `cancel_execution` 已在、S 形状锁 fake 已补、10/0xf 绿）；这是 S 的 fake 扫面不足**——S §2 只补了 `ConfigurablePort` 一枚，未穷尽 `tests/server/` 里所有会走取消/停止入口的 execution fake。

## 定性：测试脚手架缺口，非产品行为变更、非 M-1 破冻
- 公开投影未变（S 形状锁 4/4 绿已证）；坏的是**测试替身缺方法**。与 134（R1 语义后果）不同类：这是**换线后 fake 接口未同步**。
- **教训复现**：S 的 t17 自检只跑自门 shape-lock + E 入仓钉、把「全量差量」留给 C（§3「〔待落〕」）——**又一次「只跑新增/自有测试」漏了受影响既有套件**（P-T1 同型）。C 全量门兜住。

## 返 S（合批 E 腿不动，S 腿补扫面）
1. 在 `tests/server/`（S 域）把 **`test_wire_v1.RecordingExecution`** 与 **`test_subagent_rule_liveness_086` / `test_subagent_timeout_stops_141` 的 execution fake** 各**加性补 `cancel_execution(...)->CancelOutcome`**（返 `CONFIRMED_STOPPED`/`REFUSED_NO_ACTIVE_RUN` 按该测试原语义；**不改这些测试的断言意图**——它们是既有停止/级联契约回归锁，须继续锁住真行为，非为转绿而弱化）。
2. **主动扫净**：`grep` 全 `tests/` 实现 `.cancel(` 的 fake，确保 S-block1 换线触及的**每一处** execution fake 都补新方法（别只补撞红的这几枚）。
3. 交 S 腿**修订 CHECKPOINT**（新 commit 于 `work/be-goal-server-0`），并**自带全量 `tests/` baseline↔candidate 差量 0 新增失败**（用 `.venv` 口径，21F 同集），不再「留给 C 落」。
4. C 重集成合批（S 修订腿 + E `f846cbc`，E 腿已 C 逐件亲验：P5/P6-E 正确、P8 残余漏修复 matrix 30/0、P9 134 11/0）→ 全量再核 → 定 `CP-S-block1`、放行 INC1b。
- **E 腿无需动作**（acadad7/e906cb4/f846cbc 均已 C 验绿、保持）；E 候 S 修完即可合批。Sol 未用（4/10）。S 的 §2 方向对、只是范围不全。
