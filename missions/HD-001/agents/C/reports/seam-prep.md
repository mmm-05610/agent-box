# C 中央接缝预研笔记（2026-09-23，第二轮等待期间）

用途：为裁决 F1+S 接缝事实表、FC 迁移准备批与各包 PROPOSAL 建立判断基础。只读实测，非批文；各组研究结论仍以其亲读为准。

## 1. FE 契约与接缝现状（desktop-minimal @ 85cc3cd 实读）

- 中心契约：`packages/agent-ui-contracts/src/contract.ts`（126 行）——Phase 1 `contracts/` 拆分的自然源头（F0 机械迁移；跨包 token/类型身份是 C 关切的 contract_version 载体）。
- Token：`ordessa.agent.connections.v1`（AgentConnectionsToken）、`ordessa.agent.sessions.v1`（AgentSessionsToken）。
- `AgentCapabilities`：history/reasoning/tools/stop/interactions/models/modes × Availability（supported/unsupported/unknown/unavailable）——"能力缺失不伪造"已有建模基础。
- `AgentInteraction`：kind=approval/choice/confirm/input/editor；state=pending/responding/resolved/expired/unknown——F3 审批融入对话流的现有模型基础。
- `RunStatus` 含 `stop-requested`/`unknown`——停止请求与确认区分已建模（F3 保留语义、不得合并二者）。
- `AgentOption`（models/modes）：机制保留，UI 按章程隐藏入口；不得借机扩配置管理。
- **F1 迁移缝确认**：`extensions/agent-sessions/src/model.ts`（78 行）持有 client Map、selectedConnectionId、connectingId、reconnect/connect/inFlight——roles/F1.md "从 sessions 迁出 client 持有/当前选择/重连" 的确切落点。契约注释明言 AgentSessions "Owns connected instances independently of mounted Workbench views"：迁移是**公共契约语义变更**（AgentSessions 收窄、连接服务接管实例所有权），须 C 决策记录后由单一写入者实施。
- 现有扩展极薄：agent-connections/entry.ts 30 行（纯注册表+connect 分发）、agent-conversation 约 173 行、agent-interactions 约 69 行（F3 实测一致）。

## 2. BE 公开面现状（integration-linux/backend @ 92a2d2b 实读）

- `service/facade.py` ProductService（109 行）：聚合 workspaces/profiles/sessions/harnesses/credentials/execution/notifier；`readiness()` 按 HarnessRegistry 实际注册 + credential_registered 逐 Harness 报 available——"以服务事实判定，不凭品牌名宣称"在后端已成立。
- `service/sessions/`：repository.py/queue.py/service.py（S 写域）。
- `plugins/agent-box-harness/`：generic/ + registry/ + adapters/ + plugin.py/entrypoints.py（H 域复用核心）。
- **F1+S 待钉事实**：FE AgentConnector.id/title ↔ BE HarnessRegistry harness_type 的映射轴；wire/transport 仍在 server 域（S2c2 未合）；项目/目录权威接口（WorkspaceService）。

## 3. 裁判预判（供汇合时对照，非决定）

- 迁移准备批（F0）：contracts/ 拆分从 agent-ui-contracts 起步最自然；extensions/dist 构建产物不入新树。
- 连接语义变更顺序：先 C 记录契约决策（AgentSessions 收窄 + 连接服务接管实例），后 F1 实施；F2 sessions 包只持会话列表/选择，不持连接实例。
- Harness 二级选择：临时 UI 属连接区（F1），身份源用后端 readiness 事实；运行/待审批时禁切换的判定依据 AgentClient/BE 状态而非页面可见性。
- 隐藏入口：options 通道保留、UI 不渲染 models/modes——删除入口与删通道是两件事，避免破坏既有直连回归。

## 4. 中央待办提醒

- BUDGET.md §诚实处理99次：开真实测试批前，C 必须先查明 Harness 重试/多步循环可否设可验证请求上界；未查明不开批。此为 C 独有职责，Phase 2 后、Phase 3 前完成调研。
- contract_version 在汇合批准时记入 decisions.md + integration/checkpoint.json。
