# CP-S-block1 — S-block1 切换合批集成检查点（S 腿 + S-P9 + E 腿一次性合批）

> **✅ 验收通过（21:04Z）：自洽集成入候选 `b15c435`。**
> 组成：E 腿 `acadad7`(R1 干净集+Q1)+`e906cb4`(P8 残漏处置 (i))+`f846cbc`(P9 134 消费者) + S 腿 `3a06783`(P1-P4 消费三态 `cancel_execution`)+ S-P9 `2ec4a86`(9 枚既有 fake 加性补 `cancel_execution`)。
> **C 权威门全绿**：① 全量 `tests/` baseline↔candidate **FAILED-ID 逐字节相同**（base `b067c571` 21F/1328P/33skip ↔ cand 21F/1379P/33skip/1xfail，`diff` 空、`comm -13` 空）⇒ **0 新增失败**（候选 +51 通过钉、不移动任何既有失败）；② 合批 12 目标文件定向**正证** 151 passed / 1 xfailed / 0 failed；③ E-019 文档口径矩阵+block1 **51P/1xf** 在集成树精确复现（S 第二见证之的）。**免 Sol**（承 INC1a：两腿码此前已 Sol#2 双确认 + C 逐件亲验；本轮为消费端切换合批，无新语义需 Sol）。

## 1. 集成动作（C 亲做）
- 落点：`worktrees/integration-linux/backend`（branch `integration/linux-native-0`），onto 候选 `2bbf7bf`。
- 方式：`git cherry-pick -n acadad7 e906cb4 f846cbc 3a06783 2ec4a86`（E 腿先、S 腿后）→ **干净应用、零冲突**（15 文件全入）→ 单一 squash 候选 commit `b15c435`（message 记全五源 SHA + 批次组成）。

## 2. 逐件亲验（不采信自报，读实码 hunk）
| 源 | 内容 | C 核验结论 |
| --- | --- | --- |
| `acadad7` | `_CLEAN_STOP_REASONS` `{end_turn,stop,complete,""}`→`{end_turn,""}`（历史自造值移出、非干净值透传落库）+ `test_e_inc0_block1_pins` 1 钉 | 仅 R1 批准常量窄化，**未新铸/改名协议枚举**，无越界面 ✅ |
| `e906cb4` | 前置窗口 `port is None` → 返 `CancelOutcome.UNKNOWN` **且不落回执**（回执只守实际下发）；置于 prior-receipt 复核**之后**、`port.cancel` try **之前** | 处置 (i) 逐字一致、位置正确（重放仍返 prior）✅；含 2 枚强制交错钉（矩阵）✅ |
| `f846cbc` | 134 消费者钉：`"stop"` 非干净、透传 verbatim | 1 行、R1 后果闭环 ✅ |
| `3a06783` | S 腿 `sessions/service.py`+`wire/handlers.py` 四处调用点消费三态投影 | P1-P7 批准消费面 ✅ |
| `2ec4a86` | S-P9 九枚 fake 加性 `cancel_execution`（委派 `.cancel()`、`CONFIRMED_STOPPED==old True`） | **零断言改动**（P-T1 扫净反弱化）✅；2 处 `-` 仅 import 折行 |

## 3. 权威门（ENV-NOTICE-001 统一口径 · 集成树 `.venv` 3.12.14/pytest 9.1.1）
- 调用：`PYTHONPATH=src:<全部 plugins/*/src> .venv/bin/python -m pytest tests/ -q -p no:cacheprovider -rf --tb=line`。
- baseline `b067c571`：21 failed / 1328 passed / 33 skipped（166.63s）。21 皆固有环境失败（pi_gate_cleanup×5、opencode_gate_cleanup×11、child_limits×2 缺 Rust worker、gate_worker_defaults×1、hermes×1、sidecar_lease×1），**无一触 execution/cancel/session/wire/terminal**。
- candidate `b15c435`：21 failed / 1379 passed / 33 skipped / 1 xfailed（172.29s）。FAILED-ID 集与 baseline **逐字节相同**。
- 定向正证：合批 12 文件 151P/1xf/0F；2 枚残漏强制交错钉 nodeid 级 PASSED；矩阵+block1 = 51P/1xf。

## 4. 残余与延后（登记，非本批缺口）
- **残漏第三类 = X18/H-009**（OpenCode 控制腿 abort 审计不诚实 → 端口层可能谎报 CONFIRMED_STOPPED）：**现状零实跑暴露**（该停止腿未接 E cancel 消费）。已裁 `decisions/H-009-X18-abort-audit-honesty-ownership.md`：修复归 H（D-H18、随增量 2 on IFR-06）；E 契约假设钉准入 INC1b b-5（N4）。**不阻塞本批**。
- **壳删（bool `cancel`）在 INC1b b-1**：S-block1 消费端已离开 bool 面，删壳前提达成 → 见 `approvals/INC1b-release.md`。
- INC1b/INC1c 相关既有钉维持 strict-xfail，正常。

## 5. 放行
S-block1 验收 → **放行 INC1b**（见 `approvals/INC1b-release.md`）。次序 1a→Sblk1→**1b**→1c→块3V4 不变。
S 待交：集成树 `b15c435` **第二见证**（形状锁 4/4 + 三态消费锁 + 差量对表 51P/1xf）。
