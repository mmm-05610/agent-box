# Work Order 41 — 核心产品合同与后端独立验收

日期：2026-09-14。当前状态：**`BACKEND_WINDOWS_RECONFIRM_IN_PROGRESS`**。分支
`feature/server-harness-extension-v1`；25方法/Windows基线检查点为 `72d6258`。此结论只代表后端独立门，不代表
真实模型或全栈 Green。41 全程使用显式 no-model ACP fixture，未读模型凭据、未发模型请求，
费用 ¥0；42 已有费用账继续单独累计。

## A — 单一 wire 合同（当前增量）

前端随后在同一权威补齐已批准的 Session目录/维护、消息角色与用户消息、history双游标、queue事件
及发送结果回查，并以 `3aba5c5c` 提交队列终态修订，总计28方法。当前 TS 摘要
`11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`，生成工件
`5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`。后端直接按工件
**29/29通过**，当前摘要已锁定，精确确认见 [wire-review.md](wire-review.md)。Windows r4
重确认完成前，本文件不冒称最终 READY。

### 已完成的25方法稳定基线

后端没有另造协议，直接消费前端执行树 `9881bb821176ecb59a5e71f32cdd9493fd065f6e`
的同源 TS/JSON Schema。双方接受记录见 [wire-review.md](wire-review.md)，锁定状态为
`WIRE_LOCKED_FOR_IMPLEMENTATION`：

| 工件 | 完整 SHA-256 |
| --- | --- |
| TS 权威 | `2874fae7c763a6e7fb488159bccc64903458ec6e4c3310ba306a4e0faa0060a9` |
| 生成 JSON Schema | `c9be8a63097aa6b1658da3b3450b669e128ed1f314780c93841fd34a52e3145a` |

真实 handler 在该生成工件下 25/25 通过，覆盖所有 HTTP JSON-RPC 请求/结果/错误；正式事件订阅为
认证 WebSocket `/wire/v1/event-stream`，帧使用同一 `EventFrame` 与持久 cursor。旧 SSE 只作历史
兼容面，Desktop 不需要接它。

## B — 资源、Profile 与 Provider/Model

- Workspace 以环境身份与规范路径识别，连接私有；附件先经真实 Worker `workspace.get` 做范围、
  canonical path/symlink、8 MiB 上限和摘要校验，再进入本机 ObjectStore。公开投影不泄露对象摘要。
- Profile 已有 `profiles.list/create/update/archive/updateConfig`；记录 `version` 与
  `configVersion` 分离，全部写入幂等且 CAS。归档不删除 Session/历史/项目或 native 数据；新执行
  拒绝使用已归档 Profile。
- Provider/Model 已有 `providerModels.list/create/update/archive` 与独立持久资源；Harness/provider
  均作 opaque 数据，credentialId 只是 SecretStore 引用。配置拒绝敏感控制名/字段，模型槽用
  `{providerId, modelId}` 稳定引用；被活跃 Profile 引用时归档返回 `CONFLICT_REFERENCE`，不静默替换。
- `config.describe` 对模型槽返回后端验证的 availability；保存成功和模型可运行性分开。Harness
  默认/校验仍由注册扩展提供，Server 无品牌分支。

数据 schema v5 非破坏迁移：在 v4 的 Profile/执行/Provider-Model 基础上增加 Session `pinned`、
队列公开消息投影与 gap-free wire 序号；v1→v5 连续迁移与二次初始化通过。

## C — 会话、队列、事件、审批与取消

- 首发在单事务中保存 Session、消息、执行及幂等回执，事务提交后唯一 owner 才派发；接受前失败
  不造空 Session，接受后启动失败保留事实。
- 排队项冻结消息、Profile、configVersion 与 effective config digest。正常完成在同一终态事务中
  claim 下一项并创建执行，清理前任隔离投影后续派；失败或确认取消则暂停所有 pending 项。
  回归直接证明后续 Profile 改动不会改写已排队配置。
- `message.delta` 在终止前抵达 Server 并先持久化再通知；快照/cursor 与 WS 续流无窗口丢失，
  越界/过期明确要求 resync。
- sidecar permission request 先进入 Server 审批仓储，再返回 native adapter；版本、operation、
  expiresAt 与决定均持久化。首个有效决定胜出，运行终止后不能批准。
- 停止为请求→sidecar/原生确认→`cancelled`；停止意图先持久化。完成/取消竞态由每运行锁裁决，
  无法确认不报已停止。Worker 断连主动唤醒 owner 并持久化 `WORKER_DISCONNECTED`。

## D — Core、Worker、隔离与恢复

生产装配入口 `build_runtime_from_sidecar_deployment` / CLI `--sidecar-deployment` 实际路径为：

```text
Windows Server → SessionService → Work Core → Harness extension port
  → wsl.exe / real Worker ABW1 interactive → bwrap
  → vendored harness-remote sidecar → native adapter
```

Worker 只持有带生命周期的运行投影；Server 是 Session/Profile/队列/事件权威。每个执行保存 Core
work/execution/dispatch identity 与原生 Session id。当前组件声明 `resumable:false` 时 checkpoint
如实记录，不假装原生进程可跨重启恢复。Server 重启把未完成执行封为 unknown/recovery_required，
恢复队列记录但不自动重派；Worker 失联、投影回收和清理失败均有持久状态。

## E — Windows 独立验收

入口：`scripts/server-round1/accept-e.ps1`。最终轮使用 Windows `py.exe -3.12` 启动真实 Server，
由真实 `wsl.exe` 启动 digest 固定的 release Worker，再经 bwrap 运行显式 no-model ACP fixture。
验证了 hello、Workspace、Profile/Provider-Model 维护、配置描述/拒绝、附件投递、终止前增量、
WebSocket cursor、取消、审批和清理。28方法增量后又在隔离 r3 重跑，并新增验证 Session目录、
置顶/重命名/归档及归档后历史保留、用户消息角色恢复。结果：

```json
{"result":"BACKEND_41_E_WINDOWS_WSL_WIRE_OK","windows_server":true,"distribution":"Ubuntu","server_id":"server_9eab21747f244cdbadf90640c9225237","workspace_id":"ws_62b4cf6c24144f09aba84e61d75a9994","session_id":"session_d4b2dce5deae4bc487d005b2e182dc96","attachment_execution":"execution_81921ef3716149f7b59df6fe91d64d5d","cancelled_execution":"execution_4405d51ef2624043a90e620c51ff6b89","approval_execution":"execution_6d114a16de354c85ad3c0e94a14866f5","profile_id":"profile_4c5c25e96dbc4e6f9ccd1daf170c25fe","provider_model_id":"provider_6c195f2d68c744ccb86910780dbb300e","wire_event_stream":"wire.eventStream/1","worker_digest":"sha256:bb90e346bbd857f02eba8d267f47c3ce793d30c9894ca823dc09c482d886f5eb","fixture":"explicit no-model ACP peer"}
```

退出后复核（r3端口18743）：Windows data root=`false`、端口监听=`false`、WSL workspace cleanup exit=0，且无
Worker/Server/sidecar 残留进程。WSL 输出含本机 NAT/localhost 警告乱码，但进程 exit 0、所有断言通过。

首次尝试把 manifest 放 `/tmp`，Windows UNC 不可见，脚本在服务/数据创建前 exit 1；改为同一用户
缓存目录后通过。没有绕过权限或把此误记为平台阻断。

## 最终验证账

```text
AGENT_BOX_WIRE_SCHEMA=<d3f74127…28方法生成工件> pytest tests/server/test_wire_v1.py
→ 28 passed（队列终态门加入前）

pytest tests/server/test_wire_v1.py
→ 29 passed；对当前schema定向执行终态门按预期1 failed，唯一差异为缺completed枚举

pytest tests plugins/agent-box-runtime-wsl/tests plugins/agent-box-harnesses/tests
→ 270 passed, 4 skipped, 0 failed

node --test plugins/agent-box-harnesses/tests/harness_remote/*.test.mjs
→ 25 passed, 0 failed

cargo fmt --check && cargo test --locked --release
→ 4 passed, 0 failed
```

4 个 skip 是既有平台/显式环境条件项，未扩大。本轮增量全套首次命令再次因 `PYTHONPATH` 漏
runtime-local/skills 等插件目录在收集期 7 errors、0 tests，补齐全部插件 src 后取得270/4；
原25方法基线曾有一次收集期21 errors、0 tests；一次 Node 从 Worker 子目录展开通配符
得到 0 tests，回仓根重跑取得 25/25。两次命令错误均不计作通过。

### 28 方法队列终态重锁（12:15）

前端提交 `3aba5c5c` 后，TS 权威摘要为
`11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`，生成工件摘要为
`5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`。后端直接读取该工件执行：

```text
AGENT_BOX_WIRE_SCHEMA=<5d4fa3bf…前端生成工件> pytest -q tests/server/test_wire_v1.py
→ 29 passed in 67.57s
```

新工件接受 `completed/failed/cancelled` 终态事件，同时将 `queue.get` 限定为活动三态；此前唯一
schema 失败关闭。当前 wire 已恢复 `WIRE_LOCKED_FOR_IMPLEMENTATION`。Windows r3 证据仍有效，
但按本轮调度另跑 r4 重确认后才重新登记 `BACKEND_IMPLEMENTATION_READY`。

## 终态边界

`72d6258` 已满足当时25方法的 `BACKEND_IMPLEMENTATION_READY`；当前同一合同的28方法及队列终态
已经锁定，后端代码检查点为 `847c818`。只待 Windows r4 对锁定工件重确认后恢复 READY。
四家组件仍保持 40 的
`COMPONENT_VERIFIED / MODEL_NOT_VERIFIED` 分账。Pi/Hermes/OpenCode 的 DeepSeek Provider 配置与
独立真实模型门、Codex 协议不兼容记录，进入 42-D；前端仍由其独立 writer 施工，当前不具备跨仓
写权，未执行全栈联调。
