# Work Order 41 — 核心产品合同与后端独立验收

状态：**BACKEND_IMPLEMENTATION_PARTIAL**（阶段 A/B/C 完成并验证；D/E 部分达成，见下）。
分支 `feature/server-harness-extension-v1`，本轮零真实模型调用、零凭据读取（费用 ¥0）。

## A — 合同：复用 P07 wire 候选（优先复用，未自造第二套）

前端 P07 检查点 2 已产出 `contracts/wire-v1/`（PROPOSED_WIRE）。**后端复用它**，
未在 `protocols/desktop/` 另造协议。核对记录与精确更正见
[wire-review.md](../wire-review.md)：结论 `ACCEPTED_WITH_MECHANICAL_CORRECTIONS`，
3 项需前端确认（hello 是否认证、认证引导编码、harness 仅作数据），
摘要登记请求为 `cd80103b3effbc4e`。**当前状态 `WIRE_CANDIDATE_ACCEPTED_BY_BACKEND`，
不称已锁定**：锁定需双方登记同一摘要，前端尚未答复。

### 实现落点

- `src/agent_box/server/wire/`：`envelope.py`（信封校验、**HMAC 签名的不透明游标**）、
  `errors.py`（11 个错误族映射，内部 code 保留在 `details.internalCode`）、
  `projection.py`（内部记录/事件 → 合同词汇：`executionId`、`version`、`environment`、
  8 个事件 kind）、`handlers.py`（16 个方法分派）。
- `POST /wire/v1/{method}`：单入口，所有方法（含 `server.hello`）需 Bearer 认证。
  `serverId` 持久化于 `server_bootstrap`，重启稳定（有测试）。
- 存储升到 schema v3：workspaces/sessions/profiles 增加
  `version`/`display_name`/`archived_at`，workspace 增加
  `env_kind`/`env_host`/`normalized_path`，turns 增加
  `stop_requested_at`/`terminal_reason`；新增 `server_queue_items`、`server_approvals`、
  `server_bootstrap`。**迁移非破坏**：只加列与回填，按表/列实际存在性判断
  （v1 精简 fixture 也能迁移），既有行身份不变。

### 合同能力逐项状态（core-semantics/1 §8）

| 能力 | 状态 | 落点 |
| --- | --- | --- |
| 服务状态/能力发现 | 真实 | `server.hello`（支持项 true，缺失项带 reason） |
| 环境准备/浏览 | 真实（WSL） | `workspaces.browse`；local/ssh 明确 `CAPABILITY_UNSUPPORTED` |
| 工作区打开/维护 | 真实 | `workspaces.open`（同环境+路径保 id、`created`）、`workspaces.archive` |
| 角色/模型维护 | 部分 | `profiles.list` 真实；Profile 写入仍走保留 REST 面（候选未定义写方法） |
| 配置描述/解析/切换 | 真实 | `config.describe`、`config.resolve`、`sessions.switchProfile` |
| 首次发送/继续发送 | 真实 | `sessions.createAndSend`、`sessions.send`（同事务接受，唯一派发者） |
| 查询接受结果 | 真实 | `sendOutcome.query`（`unknown` 不解释为可重发） |
| 队列管理 | 真实 | `queue.get`、`queue.withdraw`（`too_late` 明示） |
| 会话历史/订阅 | 部分 | `history.snapshot` 真实（游标/`resync_required`）；WS 长连通道未做，事件流仍走保留 SSE 面 |
| 停止/审批决定 | 真实 | `runs.stop`（三态）、`approvals.decide`（原子、`already_recorded`） |
| 续接/重试 | 组件 | Harness 层续接由 40 组件门覆盖；wire 面以新 requestId 建关联执行 |

### 认证引导（41-A 安全要求）

仅 loopback（Host/Origin 守卫保留）；每实例随机 token，写入
`<data_root>/secrets/http-token`（POSIX 0600 / Windows 仅当前用户 ACL）；
凭据不进 URL、argv、日志、事件与错误体（错误体只含 family + 内部 code）。
Windows 持久化秘密使用既有 DPAPI 秘密存储；WSL 侧文件仅是投递来源，不是角色权威。
**待确认**：前端是否接受「宿主读保护文件」作为引导方式（见 wire-review 差异 2）。

## B — 资源

- Workspace 身份含环境：`env_kind/env_host/user/normalized_path` 四元组；
  **不同环境的相同路径是不同位置**（有反例测试）。
- 每个 Workspace 拥有**私有逻辑连接** id（minted，不复用环境连接 id），
  符合 core §3「逻辑连接私有」。
- 可读/可写/可执行分列：`accessibility.readable/writable` 当前由连接核验状态决定；
  `executableForRole` 明确报 `null`（未知）而非假设 true。
- 归档保留记录与项目文件，仅改元数据；版本冲突回 `current`。

## C — 会话

- 首发/续发同一事务接受：`createAndSend` 在接受前完成配置校验，
  失败不建 Session、不排队；成功后同一事务写入执行（或队列项）与幂等回执。
- **并发同 requestId 恰好一次接受与一次派发**（barrier 强制窗口的回归测试）。
- 冻结：队列项保存提交时的 profile 与 `configVersion`，后续选择变更不改写。
- 运行中 `switchProfile` 拒绝并回旧记录；`runs.stop` 无法确认时不报已停止。
- 审批：单行事实、首个有效决定原子接受、同 requestId 重试 `already_recorded`、
  矛盾/过期/已结束 `invalid`；版本冲突回 `current`。
- 事件：先持久化再发布；`history.snapshot` 快照 + `resumeCursor` 续流无缝；
  游标越界答 `resync_required`；游标 HMAC 签名，跨会话或伪造被拒。

## D — 恢复

| 场景 | 证据 |
| --- | --- |
| Server 重启封存在途执行为 unknown、不重派发 | `test_restart_seals_unfinished_turn_as_unknown_without_redispatch`（保留并通过） |
| Server 身份跨重启稳定 | `test_server_identity_is_stable_across_restart` |
| 游标越界/伪造 | `test_history_snapshot_...`（resync + 篡改签名拒绝） |
| 幂等重放不二次派发 | 并发与顺序重放两组测试 |
| 停止后终态不误报 | `runs.stop` 三态测试 |
| 秘密扫描（事件/错误体不含秘密） | 见下「未达成」——**仅部分覆盖** |

## E — 独立验收（**未达成 Windows 真机段**）

本会话运行在 WSL2 Linux 内，**无法**执行 41-E 要求的「Windows 本机起真实 Server +
真实 WSL 通道 + 隔离目录」。已完成的平台内验收：

```text
python3 -m pytest -q tests plugins/agent-box-runtime-wsl/tests plugins/agent-box-harnesses/tests
→ 255 passed, 4 skipped, 0 failed（含 sidecar 集成 6 项）
node --test plugins/agent-box-harnesses/tests/harness_remote/*.test.mjs → 25/25
cargo test --release (workers/agent-box-worker) → 4/4
```

未执行且必须由 42 在 Windows 侧补做：真实 Windows Server 进程、
真实 WSL Worker 通道与隔离目录、终端 HTTP 全流程、平台 skip 的 POSIX/Windows 条件项。

## 未达成 / 明确缺口（不掩饰）

1. **41-E Windows 真机段未做**（平台不可用，如上）。
2. **Harness 执行路径已打通（本阶段新增）**：`server/execution/sidecar.py`
   实现 AgentBox 侧的 envelope 客户端与 `SidecarHarnessPort`，
   证据 `tests/server/test_harness_sidecar.py`（6/6）：隔离未启用即拒启、
   profiles+provenance、**终止前 message.delta 在完成前可见**、
   两个执行各自独立原生会话身份、未知 op/未知执行类型化报错。
   真实 native peer 仍是受控 fake，因此这不是真实模型证据。
   生产默认仍为 `EXECUTION_CAPABILITY_UNAVAILABLE`：
   **经 WSL Worker（bwrap + interactive 通道）的部署接线尚未完成**，
   目前只在本地进程启动器上验证。
3. 事件长连通道仍为保留 SSE 面，wire 的 `wire.eventStream/1` 帧流未实现。
   侧车的授权往返（`permission_request` → `approvals.decide` → `permission_decision`）
   已在 envelope 层实现并投影为 `approval.requested`，但**尚未接进 Server 的审批仓储**。
4. 附件内容读取/投递未实现（只存不透明引用）。
5. 秘密扫描目前覆盖「配置字段拒绝」与「事件/错误体未包含凭据字段」，
   **未**做执行期投影回传的全量秘密扫描。
6. Profile 写入方法未在候选内，仍走保留 REST 面。

## 终态

`BACKEND_IMPLEMENTATION_PARTIAL`。**不是** READY：41-E 与真实 Harness 执行路径缺失，
因此不满足 42-B 的 `BACKEND_IMPLEMENTATION_READY` 门。41 的 wire 与业务行为已可用，
后续补 Windows 真机段与 Worker→sidecar 串接后方可转 READY。
