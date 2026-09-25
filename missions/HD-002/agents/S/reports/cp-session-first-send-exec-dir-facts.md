# CP-SESSION-001 · BE 首发/执行目录链只读事实（S 域）

- from: S; baseline: `60d868ef`；全部为读码核实，未运行服务、零真实调用、零源码改动
- 目的：响应 BC-0013「S-0006 处置答复」段所述在核事项（`createAndSend`、项目执行目录、幂等事实），给 BC 提供 S 域行号级证据；非提案、非扩批。

## 一、首次发送创建链（现码即支持，无需新接口）

1. wire `sessions.createAndSend`（`server/wire/handlers.py:2017-2055`，BC-0011 §2 同引）→ `service/sessions/service.py:64-80 accept_intent`：`session_id=None` 时于首发内创建会话（`repository.py:154-167`，S-0004 已核），随后 `_assert_profile_executable`（`service.py:123-142`）缺 Harness/Execution/必需 credential 类型化拒绝。
2. 幂等：create 走 `repository.py:95-127 create_session` 的 scope `POST:/sessions` + requestDigest 重放（与既有 IdempotentRecords 一致）；重发同 payload 返回原会话，不双建。
3. 结论：**「首发才建会话」在 BE 现码零缺口**；FE 只需按裁决消费 createAndSend 并取真实 ID。REST 纯建（`transport/http/app.py:309-313`）仍可用但按 I/C-0012 不再是本轮前置。

## 二、项目执行目录链（workspace → 实际 harness cwd，S 域证据）

按 turn 派发逐跳核实：

1. `service/sessions/repository.py:687-706 get_turn_context`：join `server_workspaces`，随行带出 `w.env_kind, w.normalized_path, w.remote_path, w.connection_id, w.distribution, w.remote_user`。会话行的 `workspace_id` 即权威（`s.workspace_id`，:701）。
2. `server/bootstrap/runtime.py:1114-1150`：WSL/SSH placement → `WorkerSidecarLauncher(workspace={... remote_path ...})`；`:1151-1153` else 分支（local）→ `LocalSidecarLauncher(workspace_path=context.get("normalized_path") or context["remote_path"])`。
3. `server/execution/local_channel.py:498-509`：`sandbox_port.compose_sidecar_room(SidecarRoomRequest(workspace=self.workspace_path, ...))` —— 工作区路径进沙箱 room 挂载；`:524` 启动前对 `workspace_path` 做 before-snapshot（Order 54 变更集）。即 **local 链的实际执行目录就是会话绑定 workspace 的 normalized_path**，经 `workspaces.open` 验证链（`server/workspaces/local_environment.py:75-120`）写入（`server/workspaces/service.py:92, :151-178`：open 按环境+路径 upsert，normalized_path 来自验证结果）。
4. placement 无声明/未知 → 类型化拒绝（`server/execution/placement.py:61-73`），不会静默落到别处。

**S 域结论**：「选项目 → 该项目实际执行」的 Server 侧链路完整且有类型化失败面；BC-0006/FC-0017 所指缺口在 **FE connector 侧**（Pi/Codex 直连原型固定 `ORDESSA_AGENT_CWD`，不在 BE 树，本树 grep 零命中已复核）。「不选项目 = Agent 既有默认工作区」的**来源与映射归 BC/H 核实**（runtime 的 `home_root/native_home/_state_target` 等部署量在 `runtime.py` 组合期注入，非会话级 workspace 记录），S 不猜路径、不发明回退。

## 三、可供验收的最小证据点（若 BC 下联调包，S 域可配合）

- 同 requestId 重放 createAndSend → 同一 sessionId（幂等）。
- open 真实项目目录 → 首发 → 从 turn 上下文断言 `normalized_path == 所选项目`（离线 fake sidecar 即可证 room compose 输入，不触模型）。
- `env_kind=None/未知` placement 反例 → `PLACEMENT_UNKNOWN` 类型化拒绝。

以上不申请写域、不排期；待 BC 按「联调只对确证缺口下最小修复包」点名。

---

## 附：2026-09-23 11:00 运行级核验补记（详见 S-0009；本文 §一 的 `POST:/sessions` scope 引用系 REST 纯建面，createAndSend 实际走 `sessions.send` scope——BC-0016 纠错生效）

合成 host（`RecordingExecution` block、临时 data-root，全在 /tmp）实测：
E0 无 sandbox provider 组合下 local open 类型化 `LOCAL_SANDBOX_UNAVAILABLE/retryable`（不猜可运行纪律运行级复现；印证 sandbox-bwrap 硬依赖。**2026-09-23 按 BC-0023 校正**：E0 的探测发生在工具沙箱内，非特权 namespace 被拒是该上下文的读数；BC 在沙箱外重跑同一短探针得 `available/ok`。本行不得作为「本机 host bwrap 判死」引用，host 真实能力以候选 Server 原地 probe 为准）→ E1 注入可运行答案后真实目录 open 得 `ws_f812…/normalizedPath=realpath(projA)` → E2 createAndSend accepted、会话绑 A、同 requestId 重放同 session/execution → E3 open projB 后 send 会话 A：入队（queueItemId、executionId 空），`server_turns→sessions→workspaces` 联结仍 `workspace==A, normalized_path==projA`。**S 域无证实断裂。**
