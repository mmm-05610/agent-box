# Work Order 41 — 核心产品合同与后端独立验收

日期：2026-09-14。状态：**`BACKEND_IMPLEMENTATION_READY`**。分支
`feature/server-harness-extension-v1`；检查点为本次提交。此结论只代表后端独立门，不代表
真实模型或全栈 Green。41 全程使用显式 no-model ACP fixture，未读模型凭据、未发模型请求，
费用 ¥0；42 已有费用账继续单独累计。

## A — 单一 wire 合同

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

数据 schema v4 非破坏迁移：为 Profile 增加独立记录版本，为执行/队列冻结 content-addressed
effective config，并增加 Provider/Model 表；v1→v4 连续迁移与二次初始化通过。

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
WebSocket cursor、取消、审批和清理。结果：

```json
{"result":"BACKEND_41_E_WINDOWS_WSL_WIRE_OK","windows_server":true,"distribution":"Ubuntu","server_id":"server_afe66eb19aa54f4c818fca607cbfb1c4","workspace_id":"ws_cae3f8fded1446cd85dde13930b012bc","attachment_execution":"execution_a4c29b292ac347509d5052604d23f7b6","cancelled_execution":"execution_625feaaa245e47468b7b6471cb4a0ca9","approval_execution":"execution_732a94ac015f43399fdef583c0b9dfff","profile_id":"profile_1ad682f987fb4bc0a8ec517b475bf997","provider_model_id":"provider_ea5e2549a50048af866a0b7dc43bd7a4","wire_event_stream":"wire.eventStream/1","worker_digest":"sha256:bb90e346bbd857f02eba8d267f47c3ce793d30c9894ca823dc09c482d886f5eb","fixture":"explicit no-model ACP peer"}
```

退出后复核：Windows data root=`false`、端口监听=`false`、WSL workspace cleanup exit=0，且无
Worker/Server/sidecar 残留进程。WSL 输出含本机 NAT/localhost 警告乱码，但进程 exit 0、所有断言通过。

首次尝试把 manifest 放 `/tmp`，Windows UNC 不可见，脚本在服务/数据创建前 exit 1；改为同一用户
缓存目录后通过。没有绕过权限或把此误记为平台阻断。

## 最终验证账

```text
AGENT_BOX_WIRE_SCHEMA=<c9be8a63…生成工件> pytest tests/server/test_wire_v1.py
→ 25 passed

同一 schema + pytest tests plugins/agent-box-runtime-wsl/tests plugins/agent-box-harnesses/tests
→ 266 passed, 4 skipped, 0 failed

node --test plugins/agent-box-harnesses/tests/harness_remote/*.test.mjs
→ 25 passed, 0 failed

cargo fmt --check && cargo test --locked --release
→ 4 passed, 0 failed
```

4 个 skip 是既有平台/显式环境条件项，未扩大。一次全套命令因 `PYTHONPATH` 漏插件目录在收集期
21 errors、0 tests，补齐所有插件 src 后取得上述最终结果；一次 Node 从 Worker 子目录展开通配符
得到 0 tests，回仓根重跑取得 25/25。两次命令错误均不计作通过。

## 终态边界

`BACKEND_IMPLEMENTATION_READY` 已满足；四家组件仍保持 40 的
`COMPONENT_VERIFIED / MODEL_NOT_VERIFIED` 分账。Pi/Hermes/OpenCode 的 DeepSeek Provider 配置与
独立真实模型门、Codex 协议不兼容记录，进入 42-D；前端仍由其独立 writer 施工，当前不具备跨仓
写权，未执行全栈联调。
