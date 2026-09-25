# P-T1 回归 — 撤回集成，修复后重验（阻塞 T2）

发现方式：C 集成验证 = 对**受影响插件的既有测试**做 baseline↔candidate 差量跑。
- baseline `b067c571`：git/sandbox-bwrap/terminal-session 三插件 tests = **143 passed / 0 fail**。
- candidate `4674a2a`（含 P-T1）：**2 failed**。→ C 已 `git reset --hard b067c571` 撤回该集成（仅撤 C 自己并入的 218ef4c5，无他人工作）。

## 两处回归（真缺陷，非陈旧断言）
1. **D1 bwrap = 安全护栏削弱（阻断级）** `test_secret_mount_p0.py::test_nested_readonly_secret_is_private_and_execution_scoped`
   - 现象：`cleanup` 后重新 `register_prepared_secret_mount(mount, secret)` 再 `wrap` 同一 token，应 `ProjectionRejected("another attempt")`，现 **DID NOT RAISE**。
   - 根因：P-T1 在 cleanup 循环里 `_secret_attempts.pop(token)` **删掉了** 该 token 的历史 attempt 绑定；而「同 token 二次 attempt 拒绝」正是**依赖 `_secret_attempts` 留存**。回收内存 ⟂ 削弱重放/作用域守卫。
   - 要求：重新设计回收，**不得**移除 used-token 的重放拒绝面。可行方向：cleanup 后把 token 标记为 `consumed`（保留键、清值/清来源引用）而非 `pop`；或把无界增长治理移到带上限的 attempt 历史（保留「已见 token」判定）。二者都要：① 保持 `another attempt` 拒绝；② 不无界增长；③ 不读/打印秘密。**新增钉**同时断这两点。
2. **D2 git = 与既有语义测试冲突** `test_git_vertical.py::test_empty_capture_is_rejected_and_cleanup_keeps_workspace_safe`
   - 现象：capture 失败后 `cleanup("E1")`，测试期望**二次 cleanup 抛 ValueError**（守「不重复清理已消失资源/防掩盖」）；P-T1 把「marker 无且 worktree 无」改为 no-op → **DID NOT RAISE**。
   - 处置：P 二选一并**说明**：(a) 收窄幂等范围——区分「本执行已成功清理后再清理=已达目标态 no-op」与「空 capture 后资源从未建立=应拒」，令该既有测试成立；或 (b) 若确要双清理 no-op，则**显式修订该既有测试**并附理由，走「公共测试断言变更须核」——**不得默默留红或顺手改绿**。C 需见到对既有断言的正当处理。

## 对 T2 的影响
- **T2 暂缓**：D6/D7/D3 改动触及**同一 `provider.py`（git/bwrap）**；先修 T1 的 D1 守卫与 D2 语义，避免在回归码上叠增量。
- P 下一步：修 T1（1、2）→ **重跑三插件既有全套**（不只新增），交更新版 CHECKPOINT（附：affected suites baseline↔candidate 差量=0 新增失败 + 双守卫钉）。通过后 C 再集成，且 **T2 依赖其成**。

## C 自省（记入 rubric）
接受「内部方法体修复」不能只跑执行者新增测试；必须跑**受影响既有套件**做差量（本次 143↔149 抓出 2 回归）。CP-P-T1 作废。
