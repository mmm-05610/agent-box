# Work Order 102 — 两个合同面的漂移：处理账

终态：见本树 `status.md` 102 行（`CONTRACT_DRIFT_TWO_FACES_DONE`）。

## AUD-B-002 · Worker op 枚举落后（合同面之一）

- `protocols/worker/v1.schema.json` 的 `op.enum` 原 22 项，落后 `main.rs` 分发：**补 `workspace.get` `workspace.list`
  `home.put` `attempt.write` `stdin.close` 五项**（现 27，与分发一致）。逐一在 `main.rs` 有分发臂：
  workspace.get:323 / workspace.list:338 / home.put:355 / attempt.write+stdin.close:436。
- `golden/` 补 5 个正例请求（形状取自真实发送方，非杜撰）：
  `home.put {locator,path,data(base64)}`（`sidecar.py:593`）、`workspace.get {path,offset,maxLength}`
  （`ssh_connector.py:181`）、`workspace.list {}`（`sidecar.py:419`）、
  `attempt.write {data}` +attemptId/generation（`client.py:334`）、`stdin.close {}` +attemptId/generation（`client.py:341`）。
- **第三个合同面常驻门** `tests/server/test_worker_protocol_triad_102.py`：一份受审 `WORKER_OPS` 常量＝权威；
  schema 枚举须等于它、其每一项须在 `main.rs` 出现（`"<op>"`）、5 个新 op 须各有 golden、且每个 golden 的 op 须在枚举内。
  **反例两条内建**（G1 要"删/加一项必红"）：从枚举删 home.put ⇒ 相等断言红；声明一个无分发臂的 op ⇒ 存在性扫描红。
  不靠脆弱的 Rust AST 解析（091/102 关注的正是"没人守第三面"，故以受审常量为单一真相）。
- **不变**：Worker 路由行为、既有 golden 命名/格式、`PROTOCOL_VERSION`（081 重锁规则）未动。

## AUD-B-003 · 前端 wire 工件"证据副本"诱导假绿（合同面之二）

- `docs/server-round1/fullstack/generated/wire-v1.schema.json`（33 方法，`sha256 a1bd52a4…`）与前端权威对脱节，
  且以"当前工件"同名躺在 `generated/` 下 ⇒ 未来门若默认喂它，会在只覆盖 33/64 时假绿。
- **选 ②（改名/消除"当前工件"暗示）**，理由：①"刷新到权威摘要"需取前端树现物、且受 081 重锁配对规则管辖
  （跨树依赖，本单不宜自取）；②自洽于本树、直接根除假绿面。
  - `git mv` → `wire-v1.schema.snapshot-33methods-stale.json`（内容不变，`sha256sum` 仍 `a1bd52a4…`）；`generated/` 下
    不再有同名 `wire-v1.schema.json` 可被误当现物。
  - `wire-review.md`：7 处引用同步改到新名；副本行改标"**陈旧快照，非当前工件**"；
    **新增防假绿提示**：严格校验的门必须显式 `AGENT_BOX_WIRE_SCHEMA=<前端权威工件>`，**不得**默认取本树快照。

## 回归 / §Spend / 清理

真实模型调用 0。回归（本单定向）：`test_worker_protocol_triad_102` + 相邻 `test_state_capture_error_boundary`
+ `test_worker_home_put_wire_099` = **10 passed / 8 skipped**（跳＝需预置 worker/bwrap 的真机腿）；全量计数随 c2/c3 批末报告。

## 与工单数字的偏差（如实记）

工单 `op.enum 22 vs 分发 24，差 5` 三数不自洽（22+5=27）。以**分发实际集**为权威：补 5 → **27**；门以受审常量比对，不写死"24"。
`Requirement` 说"三者相等(24)"，但 `golden` 历来只对部分 op 备正例（非一 op 一 golden），强行凑 24 份 golden 需杜撰 20 个 op 的请求形状
（违"不说假话"）⇒ 采 Scope 的字面"补 5 个正例"，门只要求"新 op 有正例 + golden⊆枚举 + 枚举==受审集"。此取舍已在此写明。
