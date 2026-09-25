# S 接缝事实：F1 connections/stoppable 契约的 Server/Service 面（只读核查）

- owner_generation: HD002-1; author: S; date: 2026-09-23
- 树/SHA: BE `60d868ef258e4044a03c8650312431e5b57a48ab`（本树实测 clean）；FE 引用 `ce791930`（f1 树，只读）
- 输入: F1-0015/F1-0016、BASELINE、TASKS §4/§7、roles/S.md 首要动作
- 性质: 零代码改动、零契约动作；供 BC/F1/FC 答复集成问题

## 一、F1 留在服务端消费的两层闸——现状逐层核实

F1-0015 §契约说明："服务端两层（switchProfile 拒绝/executions.list）随 baseline0 后联调批消费"。两层均已在本基线存在，无需新建：

1. **switchProfile 拒绝（会话级硬闸）**：`src/agent_box/service/sessions/repository.py:296-338`。同会话存在 `accepted|dispatching|running|capturing` 任一 turn 时返回 `{"outcome":"rejected","reason":"execution_running", session:<旧状态>}`（200+幂等记录，非异常），拒绝时回真实旧态。wire 面 `handlers.py:2097-2110`（`sessions.switchProfile`）纯委托，replay 原样返回。
   - 相邻类型化拒绝（同一函数）：`PROFILE_HARNESS_MISMATCH`（跨族切换=409，同族才可 switch，跨族走 clone 规则）、`TURN_CONCURRENCY_CONFLICT`（目标 Profile 有活 turn=409）、`PROFILE_ARCHIVED`、版本冲突 `VERSION_CONFLICT`、`SESSION_STORE_GUARD_UNAVAILABLE`（非 local 环境 fail-closed）。
2. **executions.list（跨连接盘点）**：`handlers.py:1408-1427` + `src/agent_box/server/execution/inventory.py:39-95`。只读账本，行含 `sessionId/profileId/state`（STATE_MAP 归一，默认 running），limit 1..200、越界类型化拒绝不静默截短；无取消面。F1 谓词 `hasOpenRun` 的"全连接扫描"可按 profileId 直接投影消费。

## 二、口径对照与已识别接缝（供联调批裁量，S 不先动码）

- **state 口径一致性**：F1 的 `hasOpenRun/hasAwaitingInteraction`（FC-0015 锁定，FE state 口径）与上面服务端活跃态集合方向一致；服务端比 FE 多收 `stop_requested_at` 列但**不**把"已请求停止"从活跃集合剔除——停止确认前服务端仍视为 open run。这与"运行/待审批禁切、以服务事实判定"（SCOPE）兼容，联调时按此事实写测试，勿按 FE 乐观态推断。
- **待交互（awaiting interaction）不在服务端拒绝集合内**：服务端只按活跃 turn 拒绝；审批挂起会话若无活跃 turn，switchProfile 不会被服务端拒。第一层（跨连接器选择闸）由 F1 workspace.ts 承担是既定设计（两层分工），但整机验收须确认该差异是有意的，S 侧如实登记，不擅自扩服务端语义（wire/1 未变）。
- **`runs[].stoppable?`**：纯 FE agent 契约 additive（连接器 client 投影：pi running/starting=true；codex turn/started、send=true，stop-requested/interrupt-fail=false）。Server wire 无 stoppable 字段，也不需要——停止能力事实由 wire 的停止面错误码回给 FE。S 面零动作。
- **`AgentConnections.workspace`/`AgentConnectionWorkspace`**：connections 域自有机制面（additive），不触 Server/wire；候 C 决定是否补记 contract（I-005 已裁 baseline1 内部增量收编），S 无异议。

## 三、结论

S 写域对 F1 契约的消费面**已齐**：两层服务端闸在 `60d868ef` 均可用、语义与 F1 交接记录相符，无需为真实闭环先做服务端修复。剩余为联调批行为验证（含上节两条口径差异的测试钉住），非实现缺口。F1 若有接口问题按 S-0001 请直发，我按本文件同源行号答复。

## 四、补测证据（2026-09-23，本机离线，非重门）

两层闸由"读源码"升级为"测试绿"：

- `tests/server/test_execution_inventory.py`：**4 passed / 0 skipped（GREEN_NO_SKIPS）**（空表非错误、终态消失、pid 未报留 null、行数有界、零宿主路径）。
- `tests/server/test_wire_v1.py::test_switching_role_is_refused_while_an_execution_runs`：**1 passed**（`reason == "execution_running"` 端到端 wire 形）。
- 环境事实（如实）：本树 ad-hoc 解释器缺 pytest，用 `uv run --no-project --with pytest …` 临时环境（非全局安装、树零污染）；**单独收集这两个文件会触发既有循环导入**（`server.sessions→service.sessions→service.__init__→facade→server.sessions` 部分初始化），全树收集因先导入其它模块天然免疫——targeted 运行需先 `import agent_box.service` 预暖。此为本基线既有脆弱点、非本轮任何改动造成，登记供 F0/root 门后续参考；S 未动码。
- 零真实调用、零密钥读取、无 root 重门占用（仅 5 项小单测）。
