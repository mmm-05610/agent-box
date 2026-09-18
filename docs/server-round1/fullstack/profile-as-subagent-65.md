# 工单 65 进展 —— 子代理（profile 调用 profile）：阶段 A/B 已落地

执行：2026-09-18，env-provider 工作树。终态：**SUBAGENT_DELEGATION_PARTIAL**（授权与工具契约完成；执行桥与归属待下腿）。

## 阶段 A：授权模型（已落地，schema 17）

- **表** `server_subagent_grants(parent_profile_id, child_profile_id, created_at)`：**默认无授权**；
  API `grant_subagent/revoke_subagent/subagent_grants`；**授予时即拒环**（A→B→A 无法表达）、
  拒自调（`SUBAGENT_CYCLE`）。
- **求解**（`server/profiles/subagents.py`）：`resolve_roster` **只列被授权项**（未授权零出现，
  含"不可用"状态项也不出现）；不可用的**被授权**子仍列出但带类型化 reason
  （父有权知道其存在）；`has_delegation` 为"零授权不物化"的判定位。

## 阶段 B：两个工具的契约（已落地）

- `tool_definitions(roster, include_run)`：`list_subagents`（完整细节）与 `run_subagent`
  （`{subagent, description(3–5 词), prompt, task_id?, model?, permission?, timeout?, max_turns?}`
  ——原生形态）；**`run_subagent` 描述内嵌花名册摘要**（name+harness+一句话，有界），
  一次调用即可派活；**roster 为空 ⇒ 工具列表为空**（不塞永远失败的工具）；
  `include_run=False` 即**孙代形态**（只有 list；深度限制是默认拒绝）。
- `validate_run_arguments`：必填/形状校验（描述 3–5 词、prompt 自包含且 ≤32K）、
  **可选参数只收紧**（`permission` 仅 default/plan 且不得宽于子自身规则 → `SUBAGENT_PERMISSION_WIDENED`；
  `model` 必须在子允许集 → `SUBAGENT_MODEL_WIDENED`）、上限（**timeout ≤600s**=10 分钟、
  `max_turns ≤4`）、**未授权名类型化拒绝且只内联被授权名列表**（`inline_available`，≤8 项，
  **不回显请求名**——存在性零泄露）。
- `check_depth`：**先环后深**（"更具体的拒绝更有用"），链 >2 ⇒ `SUBAGENT_DEPTH_EXCEEDED`。

## 验证（3 条测试，全绿）

只列授权/不可用标注/环与自调拒绝/零授权无工具；深度与环各自的码；工具 schema 必填项与
描述含花名册、子代无 run 工具；未授权拒绝的 payload 只含被授权名且**不含请求名**；
放宽（permission/model）与上限（timeout/max_turns）与描述形状各自类型化拒绝。

## 65 未做（下腿）

- **C 执行桥**：把两个工具做成**真实 MCP server**（经 58 物化进父 harness）并把 `run_subagent`
  落到一次**正常子执行**（子 profile 的沙箱/home/模型/权限），回**有界最终摘要**；
- **归属**（用量/费用记父轮次）、**审批中断浮到父轮次**、**取消传播**（父取消 → 子取消）；
- **`task_id` 续接**（=子 native session 引用；跨家族续接类型化拒绝）与**并发扇出**（每轮 ≤4）；
- **继承规则实现点**（父的 deny 与工作区限制传播到子；允许集仍由子自己决定）；
- **授权分区的 wire 面**（父 profile 的"可调用哪些 profile"）与 P20 的"智能体"卡接入。

## 阶段 C 首块（已落地）：真实桥与子执行编排

- **委派服务**（`server/execution/delegation.py`）：
  - `list_for()`：零授权 ⇒ `{tools: [], roster: []}`；有授权 ⇒ 两工具（描述含**实时花名册**）。
  - `run()`：授权→`validate_run_arguments`（只收紧/上限/3–5 词）→ 可用性检查 →
    **深度链**（`check_depth`，环与超深各自类型化）→ 每轮扇出 ≤4（`SUBAGENT_TURNS_EXCEEDED`）→
    解析 `task_id`（=子会话 native 引用；**跨家族拒绝** `SUBAGENT_TASK_FAMILY_MISMATCH`；
    未知句柄 `SUBAGENT_TASK_UNKNOWN`）→ 建**正常子轮**（新会话或续接同会话）→
    **链接 `parent_turn_id`**（schema 18）→ 现有执行链起轮 → 10 分钟内有界等待 →
    **有界最终消息**（≤4096 字符，子结果不直接对用户可见）+ **同源用量**（子轮自己的 usage 列，
    父的归并=一次 join，不搬数字）+ `task_id` 句柄 + `canDelegate`（子的授权边，如实转述）。
  - 失败子轮 ⇒ `state=failed + errorCode`（类型化结果，不吐裸输出）。
  - **取消传播**：`cancel_children(parent_turn_id)` 列出活动子轮（父取消时逐个取消）。
- **桥**（`plugins/agent-box-harnesses/runtime/subagent-bridge.mjs`，入 sidecar bundle）：
  最小 stdio MCP server——`initialize`/`tools/list`（**实时向 Server 要花名册**，
  描述不携带未授权名）/`tools/call`（两个工具转发，类型化错误带 `available` 内联）；
  env=`AGENTBOX_BRIDGE_URL`（loopback）+`AGENTBOX_BRIDGE_TOKEN`（**按次令牌**，非用户令牌）。
- **端点**（`POST /internal/delegation/{token}`，FastAPI 内、非 wire/1）：令牌→(父轮, 父 profile)；
  未知令牌 404；服务类型化拒绝以 409 + 码 + available 返回。
- **渲染**：装配时父 profile **有授权边才**合成 `agentbox-subagents` 条目（claude=JSON
  `mcpServers`、codex=TOML `[mcp_servers.*]`），并铸一次性令牌；**零授权零条目**
  （端到端测试断言两种形态）。
- **测试**：7 条（服务级 5 + 端点 1 + 渲染 1），全量见提交记录。

## 65 仍未做（如实）

1. **真实沙箱端到端**：桥在 guest 内实际起进程 → 打到 Server 端点 → 子轮完成回摘要（本机通道一趟）；
2. **审批中断浮到父轮次**（子的 `ask` 以父会话事件镜像）；
3. **继承规则实现点**：父的 `deny` 与工作区/外部目录限制传播进子轮的冻结姿态；
4. **授权分区的 wire 面**（`profiles.subagentGrants` 增删查）与 P20"智能体"卡；
5. 并发扇出的真机证据（服务级已覆盖调用路径；真实并行两子调用未跑）。

## 阶段 C 第二块（已落地）：继承、审批镜像、授权 CRUD

- **继承规则实现点**（G6）：委派时算 **merged posture** —— 子的冻结姿态 = 子自身
  `resolve_all`（预设+按序规则）**再被父的 `deny` 逐键收紧**（"限制可继承、允许集仍是子的"；
  不变量：委派只能收紧）；结果作为子轮的 **effective config 对象**发布并写进
  `effective_config_object_digest`（运行时读姿态的既有位置），并在姿态里记 `inheritedFrom`。
  测试：父 `plan`+deny webfetch、子 `default` ⇒ 子轮冻结 edit/bash/webfetch=deny、
  read=ask（未被父的允许集放宽）。
- **审批镜像**（G3 的 ask 部分）：子的 `approval.requested` 追加一条**同 id** 的镜像事件到
  **父轮**（`from_subagent: {turnId, sessionId}`）——父轮用既有 `approvals.decide` 往返即可裁决，
  **不另造机制**。测试直接驱动后端 `_native_event` 并断言父会话出现该中断。
- **授权分区 wire**（G1 的产品面）：`profiles.subagentGrants`（授予的出边 + 被谁调用）、
  `profiles.grantSubagent`（环/自调即拒，300 已测）、`profiles.revokeSubagent`；测试覆盖
  空态→授予→双向可见→环拒绝→撤销。
- **测试**：10 条（服务 5 + 端点 1 + 渲染 1 + 继承 1 + 镜像 1 + 授权 CRUD 1），全量见提交记录。

## 65 仍未做（如实，收窄后）

1. **真实沙箱端到端**：桥在 guest 内起进程 → 打到端点 → 子轮完成回摘要（本机通道一趟，
   需要真实 room；当前以服务级 + 端点级 + 渲染级三段覆盖）；
2. **并发真机证据**（服务级调用路径已覆盖；真实并行两子调用未跑）；
3. **P20"智能体"卡**与前端同步（授权分区 UI 属 P17/P20）。
