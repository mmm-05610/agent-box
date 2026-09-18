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
