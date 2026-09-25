# CP-H-increment1+1b — H 截断可见性 + 帧缓冲 ⑤⑥（C 已核，待 H commit 入候选）

> **✅ 验收通过并入候选（20:04Z）：H `f896fe8`（9 文件=已验树）cherry-pick onto `24f4679` → 候选 `ac28ad5`。** C 亲跑：`node --test` 集成后 **59/0**；根 `tests/` **21F/1377P/33skip/1xfail、FAILED 与 baseline 逐字节同 → 0 新增失败**。免 Sol。以下保留核验记录。


更新：2026-09-22 19:36Z（C）。批准书 `approvals/H-increment1-truncation.md`（增量1）+ `approvals/H-increment1b-framebuffer.md`（仅⑤⑥）。H-007 CHECKPOINT。真实核验，未用 Sol（H 0/3；fake 可验直批）。

## C 独立核验（不采信自报）
- **范围**：6 modified + 3 untracked，**全落纠正后允许清单**（`deploy/opencode/driver-native.mjs`、`runtime/profile_extensions.mjs`、`third_party/harness_remote/{PATCHES.md,SOURCE.json,bridge/src/acp-{client,service}.js}`、`tests/harness_remote/**` + `tests/opencode_driver_tail.test.mjs`）；**零越界**；未触公共出口/`src/agent_box/**`。
- **JS `node --test`（C 亲跑）**：候选（H 树）= **59 passed / 0 failed**；`git archive HEAD` pristine 基线同命令 = **38 passed / 0 failed**；差量 **+21 全来自 3 个新 test 文件**，`git diff --name-only` **零 tracked 测试被改** ⇒ **纯加性、0 回归、无既有断言弱化**（P-T1 关切已过）。
- **Python 门（C 替 H 跑，H 沙箱无 pytest = H-007 §4.1）**：`tests/server/` harness/sidecar 八文件 = **136 passed / 12 skipped（real-bwrap/worker 工具门控）/ 1 failed**，唯一失败 `test_sidecar_lease_keepalive::production_default_lease_is_five_seconds` **在 baseline 21 既有失败集内**（WORKER_ARTIFACT=ABSENT，非 H 引入）⇒ **H 改动 0 新增 Python 回归**。
- **成对纪律**：`PATCHES.md §5/§6` + `SOURCE.json` 生效哈希（`acp-client.js current_sha256 47d34b48…`、`acp-service.js patched_sha256 39f4c5e4…`）——与 C 19:17 读值一致，`verifyProvenance()` 不炸（sidecar_envelope 在 59 例内实跑）⇒ X11 vendored 哈希锁守。
- **公开面**：Wire / `message.final` **零变更**（M-1 冻结面不动）；⑤⑥ 走既有 `protocol-error` 通道、**无新事件类型**；③④ 保持静默（孤儿事件未改数）。已知红 `ambiguous_semantics` **未顺手改绿**。

## C 裁定（H-007 §4 三问）
1. **§4.1（全链到 `execution_state().reason`）**：H 段 + S 段各自 measured、真实 Worker 内 Node↔Python 信封往返**本 loop 不可测**（不真实模型/无 worker artifact=D-0015「机制≠真机」）。C 已替跑仓级 Python harness 门（上）→ 0 新增失败。**判：增量1 在 fake 可验范围内达标；真机端到端 e2e 属本 loop 之外的真实宿主验证，登记为已知延后、非本轮静默缺口。** H 处理正确。
2. **§4.2（完成事实晚于排空窗关闭的次序改造）**：**不在增量1 强制范围**。批准验收写「到齐 **或** 明确报告丢量」，H 走「报告丢量」支已满足。改结算/持久化**相对次序**是更深的 D6 族行为变更，仅凭 fake 对端证据不宜动、且会触既有对端行为 ⇒ **随增量2（迁 SDK/帧层，本已挂 IFR-06）统一处置**，本轮不扩范围、H 未做正确。
3. **§4.3（X16 30→32）**：增量1 给 `AcpService` 加 2 集合，H 已在三 teardown 点 `.delete()` + 断言计数不跨轮串味，**且把 30→32 写进已知缺陷而非改掉仪器读数**、未造假场景「证明」未观察的串味结论。**判：认可此纪律**（分级诚实，范本）。

## 集成（待 H commit，同 E 打包情形）
- H 增量**当前未 commit**（`harness/source` HEAD=`b067c57`、dirty=9、commits=0）。请 H `git add` 6 改 + 3 新（全在允许清单）并提交到 `work/be-goal-harness-0`，交一条小 CHECKPOINT 报 commit sha。
- C 随后 cherry-pick 该 commit onto 候选 `28b5f70`（含 PATCHES/SOURCE 成对）→ C 跑全量 `node --test` + 根 `tests/` 差量（0 新增失败 + 59/0 复现）→ **定本 CP 验收、集成入候选**。不花 Sol。
- H 可并行推进非审批工作（OpenCode SSE fake 化接缝清单、增量4 对账门脚本形状，已批准）；增量2 等 IFR-06、增量3 等 D5/C-RES。Sol 0/3 不变。
