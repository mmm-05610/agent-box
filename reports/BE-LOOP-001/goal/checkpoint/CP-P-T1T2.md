# CHECKPOINT CP-P-T1T2 — P-T1(修)+T2 已验证集成（取代作废的 CP-P-T1）

- 候选 `integration/linux-native-0`：**`4917f56ad18f56ed012108e3dcd63508641bb34c`** = b067c571 ⊕ `218ef4c`(T1) ⊕ `d484547`(T2)
- 组 platform · 批准 `approvals/P-T1-idempotent-cleanup.md` + `approvals/P-T2-failure-window-leaks.md`；回归处置 `decisions/P-T1-regression.md`
- Sol：未用（内部收敛，C 直批）· 回退点：`git reset --hard b067c571`（仅撤 C 并入的这两提交，无他人工作）

## 范围（C 核 diff：15 文件，全在四插件内部+tests，未触公共出口）
git provider.py(+D2/D3)、bwrap provider.py(+D1/D7/wrap 回滚)、sidecar_room.py(+D8b entrypoint 单拼)、terminal-session tmux.py(+D5/D6 allocate 自补偿)、runtime-local provider.py(+D8a 显式 no-op release) + 各自 `tests/`（含 2 处**既有测试**）。

## 验证（C 亲跑，非二手）
- baseline 三插件全套 **143 passed**；候选三插件全套 **168 passed / 0 failed**（143 + 25 P 新增，**0 回归**）。
- **上轮两处回归已修且未弱化断言**：
  - `test_secret_mount_p0`：`ProjectionRejected "another attempt"` 重放守卫**保留**（移到 cleanup 前、仍断）；新增 `_secret_attempts` 回收完整性断言 → **更强**（既保守卫又验回收）。
  - `test_git_vertical`：containment 守卫仍在码内；把旧「二次 cleanup 抛错」改为**更强安全断言**（`../outside` 净化后为直接子项、无任何外部路径被建/删、`.ownership` 空）→ 是 D2 no-op 语义的正当调和 + 附理由（走「既有公共测试变更须 C 核」，C 已核可）。
- D6/D7/D8 新钉全绿（allocate 补偿、wrap 失败回滚、entrypoint 单拼、host 释放明确回答）。
- **加宽差量验证（18:25）**：五插件全套（git/sandbox-bwrap/terminal-session/runtime-local/skills）baseline **157** → candidate **186 passed / 0 failed**（+29 全为 P 新增，未触面 skills/runtime-local 无回归）。P-T2 改了共享面（sidecar_room/runtime-local/tmux），跨插件消费者无回退。
- **环境注记（非回归）**：`plugins/agent-box-artifacts/tests/test_plugin.py` 在 baseline 与 candidate **同样** collection error（预先存在的 import/env 问题，非本集成引入）→ 记入待查，不阻塞 P；artifacts 面本就受 IFR-01（交 I）挂起。
- 分级：机制/夹具证明（无真 tmux/真机、无 pytest 环境外）≠ 真机（D-0015）。

## 派发 P 下一步
- T1/T2 已入候选；P 无新批准即推进项：
  - **D4/D5（artifacts/change_set 明文留存）**仍挂 **IFR-01（交 I）**，不实施。
  - **P-7/P-1 的 Protocol 动词**属公共区：等 C 指定单写者批文（`C-RUNTIME@v1` 已发，代码编辑待批）。
  - **ssh（P-6）** 属新插件/格局，C 排期中。
  - P 可继续：把 D6/D7 的反例钉补强、或按 `C-RUNTIME@v1` §2 释放回执形状自审其插件是否全部对齐（不改公共面）。
- 状态：P 当前无**已批准可写**的新产品增量；不自行扩范围，等 C 下一批文或 I 对 IFR-01 裁定。

## 追加核验 18:42 — C 独立**全量根 `tests/`** baseline↔candidate 差量（升级本 CP 的验证强度）
- 承 CP 原有「受影响三插件全套 168/0 + P 自报 clean-clone」之外，C **亲在一次性分离 worktree** 跑**整仓根 `tests/`** 于 baseline `b067c571` 与 candidate `4917f56`，用 PYTHONPATH-first 强制解析到各自源码树（已 import 探针确认 `agent_box -> /tmp/c-baseline.../src`）：
  - baseline `b067c571`：**21 failed / 1328 passed / 33 skipped**（165.18s）
  - candidate `4917f56`：**21 failed / 1328 passed / 33 skipped**（166.30s）
  - **排序 FAILED-ID 集逐字节相同**（`diff` 空）→ 全量层面 P-T1(修)⊕T2 入候选 = **0 新增失败**，且既有 21 条为 baseline 固有（`test_pi_gate_cleanup.py`×4、`test_sidecar_lease_keepalive.py` 等）。
- 一次性 worktree 用后即 `git worktree remove --force` + `prune`，未触碰任何组树/候选树。
- 结论：本 CP 的集成验证由「插件子集差量 + 执行者自报」升级为「**C 独立全仓差量**」。候选 `4917f56` 维持。

## 追加披露 18:49 — 集成后发现 D6 的 latent 收口未达（D16），修复排入 P-T4
- 全量 0 新增失败 = **测试层**成立（既有套件不覆盖该掩异常路径，故不红）。但 P 于 `P-AUDIT-CHECKPOINT-006` 撞出、C 亲读 `tmux.py:109-125` 证实：**D6 的已批准收「best-effort kill-session 后原样重抛」未达**——`check=False` 只压 `CalledProcessError`，spawn 级 `OSError` 在裸 `raise`（`:125`）前逃逸即掩真因（P 实测 `exc is ORIGINAL==False`）。
- 定性：**非回归**（baseline 无此码；`4917f56` 相对 baseline 仍 0 新增失败），但为**已批准验收条件的实装缺口**，诚实登记。修复已批 **`approvals/P-T4-shape-alignment-d16-fix.md`**（补偿包 `try/except: pass`、D3 同款，附现红新钉），随 P-T4 CHECKPOINT 集成。在 P-T4 落地前，候选 `4917f56` 的 D6 视为「已集成、真因保全待修」。
