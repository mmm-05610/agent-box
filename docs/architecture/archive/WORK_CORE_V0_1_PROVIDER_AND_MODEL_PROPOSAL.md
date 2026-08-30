# Agent-Box Work Core v0.1 Provider and Model Proposal
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

> 状态：v0.1 实现前工程选型候选，不是正式 schema，也不是终局架构
>
> 调研日期：2026-08-20（Asia/Shanghai）
>
> 核心验收句：**Work survives provider replacement.**
> 目标工期：1–2 周原型

## 1. Executive Recommendation

### 1.1 一句话结论

Agent-Box Work Core v0.1 应是一个很薄的、local-first 的 **Work identity + role binding + attempt provenance + handoff** 层：用现有 SQLite 保存少量权威关联，用一个固定的 `Plan → Execute → Review → (Plan | Execute | Complete)` transition table 推进流程，用 Git worktree 保存代码现场，用 ACP-first Session Adapter 驱动 Claude Code / Codex / Hermes，用现有 Profile、配置投影与 bwrap 启动能力物化每次实际运行。

它不保存 native transcript，不复制完整 Profile config，不自建 workflow engine、artifact store、Git manager、sandbox runtime 或 observability platform。

### 1.2 明确首选

- **Work identity / persistence**：现有 Agent-Box SQLite，新增少量 Work 表与 repository API。
- **Workflow**：A — 固定、小型、显式 transition table；不是通用 DAG engine。
- **Role**：由 Workflow 定义稳定 `role_key`；Work 只保存 `role_key → ProfileRef` 绑定与 revision。
- **Profile consumption**：引用现有 Profile，启动每个 Attempt 时生成不可变的最小 Effective Resolution snapshot。
- **Harness transport**：ACP-first，使用官方 `agent-client-protocol` Python SDK；每个 harness 仍有启动/探测 adapter，保留 native escape hatch。
- **Workspace**：一个 Work 一个 Git worktree；Planner / Executor / Reviewer 串行共享同一 worktree。
- **Sandbox**：继续消费现有 bwrap launch adapter，但准确标为“Profile/config namespace isolation”；当前配置不是强 filesystem/network sandbox。
- **Environment**：复用现有 System + Project + Profile 投影，叠加 Work/Attempt overlay；保存 refs、版本/摘要与非秘密 effective manifest，不保存 secret value。
- **Capabilities**：新增 10 项以内的 capability resolver；安全相关缺口 fail closed，普通功能缺口显式 degraded。
- **Handoff**：Core DB metadata + Agent-Box work 目录中的小型 Markdown package；不复制 transcript。
- **Artifacts**：Git + filesystem 为 blob source of truth，SQLite 只维护 Artifact Index。
- **Observability**：结构化 JSONL log + SQLite Decision ledger；只预留 `trace_ref`，v0.1 不接 OTel SDK/Collector。
- **Interaction**：CLI 是 Must Have；复用现有 GUI/bridge 做最小 Work view/control 是 Should Have。

### 1.3 明天开始写代码时，实际只需要五个 Core objects

1. **Work**：目标、验收条件、Project/Workflow 引用、当前 phase/status、role bindings、workspace ref、最终结果。
2. **Attempt**：一次 Workflow 对某个 Role 的连续 dispatch；包含不可变 Effective Resolution、native session ref、输入/输出 handoff/artifact refs、状态。
3. **Decision**：少量、显式、可追加的关键决定；不是 universal event。
4. **Handoff**：跨 Role 或跨 Profile 的 provider-neutral continuation contract。
5. **ArtifactRef**：对 Git commit/diff、plan、test/review report、handoff 文件的轻量索引。

`RoleBinding` 是 `Work` 的字段；`EffectiveResolution` 是 `Attempt` 的不可变字段；`ExternalRef` 是上述对象中的 typed ref；都不需要独立实体。

### 1.4 三条执行路径

```text
Start path
  intake → create Work → create worktree → resolve Role/Profile
  → capability closure → create Attempt → ACP session → run Role

Loop path
  Role output → artifact/handoff → workflow transition
  → next Role Attempt → ... → Review outcome

Replacement path
  cancel/settle active turn → freeze Git projection → create Handoff
  → increment Role binding revision → new Effective Resolution
  → new Attempt + new native session → continue from Work State

Completion path
  review pass → index final commit/diff/reports → complete Work
  → close native sessions/processes → safe worktree cleanup
  → retain Core records and durable artifact refs
```

### 1.5 关键否决

- **不选 LangGraph 作为 v0.1 首选**：固定三节点、一条回路不值得引入第二套 checkpoint/state authority；它是升级首选，而不是原型首选。
- **不选 Temporal**：其 durability、Workflow ID、Event History 和 replay 很强，但需要 Temporal Service、worker 和 deterministic workflow discipline，明显超过本地原型需要。
- **不选 Prefect**：它擅长 Python flow/task deployment、worker、scheduling 和 operational states，本场景不是数据/批处理编排，收益不抵状态与服务面增加。
- **不直接把 Kandev 作为 v0.1 WorkflowProvider**：Kandev 已覆盖 task/worktree/workflow/multi-agent 大量能力，但这会把原型变成产品集成；其最接近本题的 Office provider-routing 仍是 feature-flagged/in progress。
- **不选 AHP 作为 Core**：AHP 解决多客户端共享 agent session 的权威状态与同步，不解决 Role workflow 或 provider-neutral Work State；且仍处 active development。
- **不把当前 bwrap 声明成强安全边界**：仓库当前 launch plan `--bind / /` 且 `--share-net`，无法证明 workspace-only write 或 network control。

---

## 2. Target Scenario

### 2.1 v0.1 唯一验证闭环

```text
Create Work
  → select one local Git Project
  → select built-in plan-execute-review Workflow
  → bind Planner / Executor / Reviewer to Profiles
  → resolve and validate actual runtime
  → create shared Git worktree
  → run Planner / Executor / Reviewer
  → replace one Role's Profile
  → start a fresh provider-native session
  → continue from Core Work State + Handoff + Git
  → pass Review
  → retain result/provenance
  → cleanup runtime resources
```

### 2.2 不变量

Profile 或 provider 替换后，以下语义必须保持不变：

- `work_id`；
- objective 与 acceptance criteria；
- Project identity、base revision 与同一个 Work workspace；
- Workflow definition/version、当前 phase 和合法 transition；
- `Planner` 这个逻辑 Role key；
- 已完成工作、Decision ledger、Reviewer findings、open questions、pending actions；
- Git HEAD/index/worktree 的实际现场；
- durable artifacts 与 provenance；
- Work-level permission intent 和 required capabilities。

以下内容允许改变，并且必须被新的 Attempt 明确记录：

- Profile ref/revision/digest；
- harness、model provider、model；
- adapter/transport/version；
- native session ID；
- available/effective/degraded capabilities；
- 实际 environment/sandbox refs；
- harness-specific settings、approvals 和 runtime flags。

### 2.3 明确不承诺

- 不迁移 Claude Code/Codex/Hermes 的内部 reasoning、token cache 或私有 transcript 格式。
- 不保证替换前后 agent 行为完全等价。
- 不允许因换 provider 而降低安全要求，除非用户看到降级并明确批准；安全要求默认 fail closed。
- 不提供运行中 tool call 的无缝 hot swap；v0.1 采用 cancel/settle → snapshot → restart。

---

## 3. Lifecycle Breakdown

本节按一次真实 Work 的生命周期给出能力、provider、ownership、首选、替代和替换不变量。`Own` 表示 Work Core 必须拥有语义；`Reference` 表示只保存引用；`Delegate` 表示把执行与状态交给成熟 provider；`Adapter` 表示反腐层；`External` 表示完全外部。

### 3.1 Work Intake / Objective

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | 稳定 Work identity、objective、acceptance criteria、可选来源引用、去重提示 |
| 成熟 provider | GitHub Issue、Linear、Jira、Kandev Task 都能做 task source；它们不是跨 harness Work identity |
| Ownership | Work ID/objective/criteria snapshot：**Own**；Task source：**Reference/External**；fetch/import：Later **Adapter** |
| 首选 | 手工输入 objective + criteria；可选 `TaskRef` 仅作为 embedded external ref |
| 为什么 | 一条外部 Task 可产生多次 Work；一次 Work 也可无 Task。独立 Work ID 用来关联多个 Attempt/native session/worktree/artifact，已不是无意义 UUID |
| 第二选择 | 从 GitHub Issue 只读导入 title/body/checklist，同时保存 issue ref 与 fetched revision/time |
| 替换不变量 | objective/criteria 的 Work snapshot 不随外部 issue 后续编辑而静默变化；外部来源仍可刷新为显式 Decision |

**MVP 推荐**：需要独立 `work_id`，形式可为 opaque `work_<uuid>`。需要可选 `TaskRef`，但不要创建 `Task` domain。Core 拥有本次 Work 的 objective 与 acceptance criteria；外部 task provider 只拥有原始 task。去重只做 `(task_ref, project_ref, non-terminal Work)` 的提示，不做全局唯一约束。

### 3.2 Project

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | 找到一个 local Git repository、冻结 base SHA、定位工作根 |
| 成熟 provider | Git CLI；GitHub repository 仅是 forge/ref；现有 Agent-Box `project_space.py` 管项目配置投影 |
| Ownership | Project identity：**Reference**；Git object/state：**Delegate to Git**；Project/Profile surfaces：复用现有 **Adapter** |
| 首选 | 单 local Git repo；`ProjectRef` 概念字段保存 canonical repo root、可选 remote URL/repo identity、selected subpath |
| 为什么 | 当前闭环只需一个可重现代码根，不需 repository manager |
| 第二选择 | GitHub repository clone/ref；由外部 clone provider 物化后仍转为 local ProjectRef |
| 替换不变量 | repo identity、base SHA、root mapping 与 Work worktree 不因 harness 替换而改变 |

Work Core 最少保存：ProjectRef、精确 `base_sha`、WorktreeRef、primary root mapping。多 repo、clone credential、fetch/pull、branch protection 均 Later。

### 3.3 Workflow

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | `Plan → Execute → Review`，Review 可回到 Planner 或 Executor；边界 pause/resume；重启后知道下一 Role |
| 成熟 provider | LangGraph checkpoint/interrupt；Temporal durable replay；Prefect states/pause；Kandev task workflows |
| Ownership | built-in Workflow definition/cursor：v0.1 **Own**；通用 durability/DAG：未来 **Delegate** |
| 首选 | **A：固定 transition table + SQLite boundary commit** |
| 为什么 | 只有三个 phase、一个 review loop；现有 Python/SQLite；不产生第二套 checkpoint source of truth；1–2 周可实现 |
| 第二选择 | **B：LangGraph + SQLite checkpointer**，当出现动态分支、更多 HITL、并行或 node checkpoint 需求时升级 |
| 第三选择 | **C：Kandev Workflow external provider**，当决定复用其 Kanban/task/worktree/UI 产品面时集成 |
| 替换不变量 | Workflow role key、phase、transition outcome 和 cursor 与具体 Profile/session 解耦 |

固定 outcome 可限于：`planned`、`implemented`、`approved`、`needs_replan`、`needs_fix`、`blocked`、`failed`。每个 Role dispatch 前后用一个 SQLite transaction 保存边界。v0.1 不做节点内 replay；节点内 session durability 仍属于 harness。

### 3.4 Role

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | Planner/Executor/Reviewer 的稳定逻辑身份、输入/输出契约和能力要求 |
| 成熟 provider | Workflow frameworks 都能定义 node/agent role；Kandev workflow step/Office identity、VS Code agent roles 提供相似分离 |
| Ownership | Role key 与 role contract：**WorkflowProvider**；Work Core 保存 binding/continuity：**Own** |
| 首选 | built-in workflow 定义三个稳定 role keys；Work 内嵌 binding map |
| 为什么 | Role 是流程职责，不是 Profile、Harness 或 Session |
| 第二选择 | 外部 WorkflowProvider 返回稳定 role keys 与 contracts；Core 不重新命名 |
| 替换不变量 | `planner` key、其 workflow contract 与历史 provenance 不变；binding revision 和 Attempt 改变 |

关系必须保持：

```text
Workflow defines Role
Work binds Role → ProfileRef
Resolver compiles ProfileRef → Effective Runtime
Attempt instantiates Effective Runtime → Native Session
```

### 3.5 Profile Resolution

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | 把 Profile 的 harness/provider/model/instructions/MCP/skills/permissions/runtime preference 与 Project/Work overlay 编译成可运行计划 |
| 成熟 provider | 当前 Agent-Box Profile + ACS resource refs + `agent_types.json` + `launch.py`/`project_space.py` |
| Ownership | Profile content：现有 Profile subsystem；resolution algorithm/snapshot：Work Core **Own**；projection：现有/新增 **Adapter** |
| 首选 | 启动 Attempt 时 resolve once，并把最小不可变 snapshot 嵌入 Attempt |
| 为什么 | Profile 会被编辑；只有实际使用的 resolution 才能重现 provenance，但复制整个 config 会泄漏秘密并产生漂移 |
| 第二选择 | 增加正式 Profile revision/version entity；v0.1 先用 Profile ref + materialized-config digest |
| 替换不变量 | Work/Role 不变；新 Attempt 必须生成新的 resolution，不能把旧 provider flags/env 与新 Profile 混合 |

概念 snapshot 只需：Profile ref、Profile revision 或 digest、harness/version、provider/model、transport、adapter/version、capability result、environment/sandbox/workspace refs、permission intent 与 enforcement summary、launch-plan digest。原始 auth/config/secret values 不进入 Work DB。

### 3.6 Harness / Session Provider

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | create session、prompt、stream、cancel、permission bridge、close；可选 load/resume |
| 成熟 provider | ACP v1 + 官方 Python SDK；Claude `claude-agent-acp`；Codex `codex-acp`；OpenCode `opencode acp`；Hermes `hermes acp` |
| Ownership | native session/history：harness **External**；transport：**Adapter**；Work correlation：Core **Own** |
| 首选 | **ACP-first**，ACP subprocess 仍由 Profile-aware launch adapter 启动 |
| 为什么 | ACP 已有 capability negotiation、session new/load/resume/close、prompt/update、cancel、tool/permission/terminal；比逐个解析 CLI JSONL 更适合作为共同控制面 |
| 第二选择 | native CLI/App Server adapter；按 harness 明确实现，不伪装成 ACP 等价能力 |
| 替换不变量 | Work State 不从 native transcript 恢复；换 Profile 必须建新 native session，并记录 supersedes/continuation provenance |

ACP 统一的是 session transport，不统一 workflow、sandbox、完整 permission policy、Profile 格式或 session portability。native escape hatch 保留 model/mode、provider-specific config、hooks、slash commands、fork/branch、background agents 和 ACP 暂未覆盖/实现不稳定的能力。

### 3.7 Workspace

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | 共享、隔离、可查询、可清理的代码现场 |
| 成熟 provider | Git worktree；Kandev/VS Code 也用 worktree 作为 task/session isolation |
| Ownership | Git state：**Delegate to Git**；Worktree lifecycle wrapper：**Adapter**；ref/correlation：Core **Own** |
| 首选 | **Git worktree**；一个 Work 一个 worktree，三个 Role 串行共享 |
| 为什么 | 最小依赖、原生 diff/commit/base、与 provider 无关、resume 简单 |
| 第二选择 | 当前 working directory，限非隔离 demo；不作为默认 |
| 替换不变量 | path、base SHA、branch、HEAD/index/worktree state 不变 |

创建、status/diff、remove/prune 直接调用 Git。Core 保存 worktree path、base SHA、可选 branch ref、created-by-work 标记和最后一次观测摘要。Git 是 HEAD/index/diff 的权威来源。

### 3.8 Sandbox / Execution

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | Profile 配置隔离、进程启动、尽可能的执行边界与诚实 capability report |
| 成熟 provider | 当前 bwrap；Anthropic sandbox-runtime；Docker/Docker Sandboxes；harness native approval |
| Ownership | policy intent：Core；实际 enforcement：SandboxProvider；launch mapping：Adapter |
| 首选 | 继续消费现有 **bwrap adapter**，但只声明被参数实际证明的能力 |
| 为什么 | 已实现并经过测试；更换重型 runtime 会吞掉原型工期 |
| 第二选择 | Anthropic sandbox-runtime：仍基于 Linux bwrap，但增加 filesystem/network policy；当前是 research preview |
| 替换不变量 | permission intent/required security capabilities 不变；新 backend 只能提高或显式改变 effective report |

当前 bwrap 计划全根读写且共享网络，所以 `workspace_write=true` 不代表“只能写 workspace”；`network_control=false`，`sandbox_enforcement=degraded`。若某 Work 要求强 workspace-only write 或 deny-by-default network，v0.1 必须启动前拒绝，而不是依赖 prompt 或 native approval 假装满足。

### 3.9 Environment

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | `System + Project + Profile + Work/Attempt overlay` 的确定性 resolve |
| 成熟 provider | 当前 Agent-Box environment/project/Profile projection；harness native config/env；外部 secret manager |
| Ownership | composition/provenance：Core；source values：Reference/External；projection：Adapter |
| 首选 | 同时保存 EnvironmentRef 和最小 Effective Environment snapshot |
| 为什么 | 只存 ref 无法解释 mutable source；复制全部 env 会泄漏 secret 并产生重复状态 |
| 第二选择 | 只存 ref + digest，适合所有 source 都版本化后 |
| 替换不变量 | logical bindings、source versions、permission intent 不变；harness projection 可变 |

必须 snapshot：source refs/version/digest、precedence、选中的非秘密值或其摘要、变量名到 secret/resource ref 的映射、runtime dependency/command fingerprints、redaction record。只能引用：secret value、credential、live service health、external allocation、完整 native config。

### 3.10 Capability Resolution

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | Required / Available / Effective / Unsupported / Degraded 五类结果与证据 |
| 成熟 provider | ACP negotiation、MCP initialization、harness probe、workspace provider、sandbox provider、interaction surface |
| Ownership | vocabulary/closure/fail policy：Core；事实：各 provider 报告；映射：Adapter |
| 首选 | 10 个 capability，按 Attempt resolve，记录 provider/version/evidence |
| 为什么 | 只有会影响当前闭环、替换安全或用户控制的能力才进入 Core |
| 第二选择 | provider-specific `_meta` 扩展，不提升为 Core capability |
| 替换不变量 | required set 不变；available/effective 可变；安全项不允许静默 degraded |

详细 vocabulary 见第 10 节。

### 3.11 Work State

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | 新 provider 不读旧 transcript，也能知道目标、进展、决策、findings、Git、artifacts、环境与限制 |
| 成熟 provider | Workflow state、Git、artifact store、task provider、native session 各只覆盖一部分 |
| Ownership | Work identity/cursor/bindings/decisions：Core；Git/artifact content/session/env live state：动态 projection |
| 首选 | 每次 dispatch 前计算 `EffectiveWorkState`，不是持久化巨型快照 |
| 为什么 | 区分 source of truth，避免复制和漂移；替换时可重新构造 |
| 第二选择 | 当外部 workflow provider 成为 authority 时，引用其 checkpoint 并投影到相同概念字段 |
| 替换不变量 | provider-neutral fields 与各自 authority 不变；native session 仅作 provenance/ref |

### 3.12 Handoff

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | 小而完整的 continuation input，支持 Role transfer 和同 Role Profile replacement |
| 成熟 provider | Kandev durable task/repo continuation、VS Code handoff、LangGraph state、Temporal payload/history、Agents SDK/AutoGen agent routing |
| Ownership | provider-neutral handoff contract/provenance：Core；native conversation handoff：External optional |
| 首选 | **Core DB metadata + immutable Markdown artifact** |
| 为什么 | 可读、可调试、可直接进 prompt、无需 object store；DB 可做因果关联和完整性校验 |
| 第二选择 | 小型 JSON document；当出现机器消费/跨进程 provider 后再升级 |
| 替换不变量 | objective、completed、decisions、constraints、findings、pending、refs、provenance；不要求 transcript |

### 3.13 Artifact / Provenance

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | Plan、Patch/Commit、Test Report、Review Report、Handoff 的寻址、producer 和 digest |
| 成熟 provider | Git object database + filesystem |
| Ownership | bytes/content：Git/filesystem；causal index：Core |
| 首选 | Git + `$AGENT_BOX_HOME/works/<work_id>/artifacts/` + SQLite Artifact Index |
| 为什么 | 本地、小规模、天然可检查；object store/database blob 都没有真实需求 |
| 第二选择 | 外部 object store，仅在 remote/multi-host/large artifact 时升级 |
| 替换不变量 | artifact URI/ref、digest、producer attempt、type 和 retention 不变 |

### 3.14 Correlation

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | 从 Work 查询 workflow cursor、Role、Profile、Attempt、native session、workspace、artifact、trace |
| 成熟 provider | Temporal Workflow/Run ID、ACP session ID、Git refs、OTel trace ID 各负责自己的域 |
| Ownership | cross-provider correlation：Core；provider-native IDs：Reference |
| 首选 | Work ID + stable role key + binding revision + Attempt ID + typed refs |
| 为什么 | `Attempt` 正好表达一次 immutable resolution 下的 role dispatch；provider replacement 必然创建新 Attempt |
| 第二选择 | 没有 Attempt，仅把 session 数组塞进 Work；会丢失 replacement/retry/producer 因果，否决 |
| 替换不变量 | Work/Role 不变，Attempt/native session/resolution 改变，supersedes/consumes 链可追踪 |

### 3.15 Observability

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | 开发调试、状态解释、失败定位、跨 Attempt correlation |
| 成熟 provider | Python logging、SQLite ledger、OpenTelemetry |
| Ownership | semantic decisions：Core；runtime logs：provider/adapter；trace backend：External |
| 首选 | structured JSONL logs + Decision ledger + correlation IDs |
| 为什么 | 零平台依赖；当前项目仍支持 Python 3.9，而当前 OTel Python 文档支持 3.10+；本地三进程不需要 Collector |
| 第二选择 | OTel API/SDK + OTLP exporter；远程/并行/多进程定位成为瓶颈时升级 |
| 替换不变量 | work_id/attempt_id/native_session_ref/trace_ref 关联格式不变 |

### 3.16 Interaction / Approval

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | view/start/stop/replace/approve |
| 成熟 provider | 现有 CLI/GUI；ACP permission request；harness native approval |
| Ownership | user intent and Work controls：Core/Application；permission mechanics：Adapter |
| 首选 | CLI control plane + ACP approval bridge；GUI 最小 read/control view |
| 为什么 | CLI 最快完成可测试闭环；ACP 给 GUI/CLI 同一结构化 approval path |
| 第二选择 | native terminal approval passthrough，只作为 adapter degraded mode |
| 替换不变量 | approval request 关联 Work/Attempt/tool；决策与 enforcement provider 均可审计 |

无活动用户 surface 时，approval 不应自动 allow；Attempt 进入 waiting 状态。Stop 先发 ACP cancel/close，再对进程做有界 graceful terminate；Work identity 保留为 paused/stopped，而不是删除。

### 3.17 Persistence

| 问题 | v0.1 决定 |
|---|---|
| 需要什么 | Work mapping、bindings、cursor、Attempt/resolution、Decisions、Handoffs、Artifact/external refs |
| 成熟 provider | SQLite；Git；native harness stores |
| Ownership | 少量 Work records：Core；workflow/session/Git native state：各 provider |
| 首选 | 现有 `agent-box.db` + migrations + repository classes |
| 为什么 | 单机、低写并发、已有连接/migration/repository pattern；足以在状态边界做 transaction |
| 第二选择 | 独立 SQLite DB，仅当 Work retention/locking 与现有 library DB 生命周期冲突 |
| 替换不变量 | typed refs、digests 和 authority label；不复制 provider state |

---

## 4. Provider Landscape

### 4.1 证据基线

- [ACP v1 initialization](https://agentclientprotocol.com/protocol/v1/initialization) 明确协商 protocol/client/agent capabilities；未声明 capability 必须视为 unsupported。
- [ACP v1 session setup](https://agentclientprotocol.com/protocol/v1/session-setup) 覆盖 new/load/resume/close、cwd、MCP server 和 additional roots；load/resume 都是同一个 agent/provider 的 native session 语义，不是跨 provider migration。
- [ACP tool calls and permission](https://agentclientprotocol.com/protocol/v1/tool-calls)、[cancellation](https://agentclientprotocol.com/protocol/v1/cancellation) 与 [terminals](https://agentclientprotocol.com/protocol/v1/terminals) 给出 streaming/tool/approval/cancel/process primitives。
- [ACP official Python SDK](https://agentclientprotocol.com/libraries/python) 提供 Pydantic models、async base classes 和 JSON-RPC plumbing，适合当前 Python 项目，不应重写协议栈。
- [codex-acp](https://github.com/agentclientprotocol/codex-acp)、[claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp)、[OpenCode ACP](https://dev.opencode.ai/docs/acp/) 与 [Hermes programmatic integration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/programmatic-integration.md) 提供四条现实 adapter 路径；支持度仍需 conformance probe，不能只按名称假设。
- [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence) 提供 thread/checkpoint、SQLite checkpointer 与故障恢复；[interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts) 支持持久 pause/resume。
- [Temporal Workflow Execution](https://docs.temporal.io/workflow-execution) 通过 Event History/replay 提供强 durability；[Workflow ID / Run ID](https://docs.temporal.io/workflow-execution/workflowid-runid) 说明 business identity 与 execution run 的成熟分离，但其完整 runtime 对本地三节点原型过重。
- [Prefect states](https://docs.prefect.io/v3/concepts/states) 和 [interactive workflows](https://docs.prefect.io/v3/advanced/interactive) 支持 pause/suspend/resume，但其 deployment/worker/flow run 面不是当前核心缺口。
- [Kandev feature guide](https://github.com/kdlbs/kandev/blob/main/docs/features.md) 已有 task workflow、多 repo worktree、documents、executor；Office mode 明确仍 in progress。其 [execution profile routing ADR](https://github.com/kdlbs/kandev/blob/84a132399dea6988af1d73f68075765417bd77bc/docs/decisions/2026-07-15-office-agent-execution-profile-routing.md) 是最强参考：稳定 identity 与 concrete execution profile 分开；换 provider 时保留 task/run/environment/worktree，丢弃 native session，从 durable task/repo state 继续。
- [VS Code sessions/handoff](https://code.visualstudio.com/docs/agents/concepts/sessions) 与 [Agent Host](https://code.visualstudio.com/docs/agents/concepts/agent-host) 证明 host-owned session/harness handoff 的价值；官方仍标记 Agent Host/AHP active development。[AHP and ACP](https://github.com/microsoft/agent-host-protocol/blob/main/docs/guide/ahp-and-acp.md) 明确 AHP 是多 client coordination，ACP 是 host-to-agent transport。
- [Git worktree](https://git-scm.com/docs/git-worktree) 已定义 add/list/lock/remove/prune/repair 和 clean removal 规则；无需自研 workspace state。
- [Bubblewrap](https://github.com/containers/bubblewrap) 明确它是构造 sandbox 的低层工具，安全级别完全取决于调用参数；它不是开箱即用的完整 policy。
- [Anthropic sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime) 增加 filesystem/network policy，但仍是 beta research preview；[Docker Sandboxes security](https://docs.docker.com/ai/sandboxes/security/) 更强但明显更重。
- OpenAI Agents SDK 的官方 orchestration 文档将 handoff 定义为 agent 之间的对话所有权转移，并允许通过结构化输入、metadata 与 history filter 控制上下文；这仍是 SDK 内 agent routing，不是 coding harness native-session migration，也不应成为 Work State authority：[OpenAI Agents SDK orchestration](https://developers.openai.com/api/docs/guides/agents/orchestration)。
- [AutoGen Swarm](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/swarm.html) 通过 `HandoffMessage` 选择下一 agent，并让参与者共享同一 message context；它证明了显式 handoff/target 的价值，但其 authority 仍是 AutoGen team context，不是 Git/workspace 或跨 harness continuation。
- [OpenTelemetry Python](https://opentelemetry.io/docs/languages/python/) 当前支持 Python 3.10+，且 Python logs 状态仍为 Development；v0.1 只预留 TraceRef 更合适。

### 4.2 Landscape 结论

| Provider / protocol | 已成熟解决 | 没解决 | v0.1 用法 |
|---|---|---|---|
| ACP | 单 client ↔ coding agent session transport、capability、stream、approval、cancel | Work identity、workflow、cross-provider continuation、sandbox | **Adapter / 首选 session transport** |
| Native CLI/App Server | 完整 harness 特性与 native state | 跨 harness 一致性 | **Escape hatch / second transport** |
| LangGraph | Python graph state、checkpoint、interrupt | 外部 coding harness semantics、Profile resolution | **第二选择，Later** |
| Temporal | 强 durable workflow、replay、signals、identity | 本地轻量、低运维成本 | **否决 v0.1，scale trigger 后升级** |
| Prefect | flow/task operational orchestration | coding role/handoff semantics | **否决 v0.1** |
| Kandev | task/workflow/worktree/executor/product surface | 通用稳定 Level-3 contract；Office 尚预览 | **Reference；产品方向变化时 Delegate** |
| AHP / VS Code Agent Host | host-owned multi-client session、handoff、remote host | role workflow、agent-to-agent coordination、Work criteria | **Reference；多客户端需求出现时 External** |
| Git worktree | repo isolation、base/head/diff/cleanup | OS/network security | **Delegate / 首选 WorkspaceProvider** |
| existing bwrap | namespace + Profile/config projection isolation | 当前策略下的 workspace-only FS/network control | **复用，但 capability degraded** |
| filesystem + Git | 小 artifact 与 code provenance | remote/global blob distribution | **首选 ArtifactProvider** |
| SQLite | local transactional metadata | distributed queue/HA | **首选 Core store** |

---

## 5. Recommended v0.1 Stack

### 5.1 Agent-Box Work v0.1 Recommended Stack

| 层 | 首选 | 为什么 | 第二选择 | 何时升级/替换 |
|---|---|---|---|---|
| Work Core | 现有 SQLite + thin Python service | 复用 migration/repository；单机足够 | 独立 Work SQLite | retention/locking 需要与 Profile DB 分离 |
| Intake | 手工 objective/criteria + embedded TaskRef | 不建立重复 Task domain | GitHub Issue read-only import | 用户反复从同一 tracker 创建 Work |
| Project | local Git ProjectRef | 当前代码已能按 cwd/git root 做项目投影 | GitHub clone adapter | remote repo 成为主入口 |
| Workflow | fixed transition table | 三 phase/一 loop；边界持久化即可 | LangGraph + SQLite checkpointer | 动态 DAG、并行、复杂 HITL、节点级 checkpoint |
| External workflow | none | 避免双状态源 | Kandev | 决定复用其 Kanban/task/worktree 产品面 |
| Role/Profile | workflow role key + Work embedded binding | Role 与 concrete runtime 分离 | 外部 workflow role refs | workflow 外包时 |
| Resolution | new resolver over existing Profile/registry/project launch plan | 复用现有配置物化 | formal versioned Profile service | digest 不足以治理 profile change 时 |
| Session transport | ACP-first + official Python SDK | 结构化、可协商、四 harness 有现实路径 | native CLI/App Server | ACP adapter 缺 capability 或有已知稳定性问题 |
| Workspace | Git worktree | provider-neutral、可恢复、低依赖 | current folder | 仅单用户、非隔离 demo |
| Sandbox | existing bwrap launch adapter | 现有能力、低成本 | Anthropic sandbox-runtime | 强 FS/network policy 成为 Must Have |
| Strong isolation | none in v0.1 | 不引入重型系统 | Docker Sandboxes / container | 不可信代码、跨平台、network/credential isolation 必须可证明 |
| Environment | existing projection + Work overlay manifest | 复用 System/Project/Profile | Dev Container ref | 构建环境复现成为核心 |
| Capability | new small resolver | provider replacement 的安全门 | policy engine/OPA | 多租户、复杂组织策略 |
| Handoff | DB metadata + Markdown file | 可读、可 prompt、可 hash | JSON/protobuf package | 外部 workflow/remote agents 机器消费 |
| Artifact | Git/filesystem + Artifact Index | 无 blob 系统需求 | object store | multi-host/large/binary/retention SLA |
| Observability | JSONL + Decision ledger + TraceRef | 足够调试，零平台 | OTel | remote/distributed/parallel 调试 |
| Interaction | existing CLI first，GUI minimal control second | 1–2 周可达闭环 | AHP/AG-UI host | 多 client/remote/sync 成为产品需求 |

---

## 6. Role/Profile/Harness Boundary

### 6.1 Ownership

```text
Built-in WorkflowProvider
  owns: role keys, order, input/output contract, transition outcomes

Work Core
  owns: stable Work ID, role bindings + revisions, attempt correlation,
        required capabilities, decisions, handoffs, completion

Profile subsystem
  owns: reusable concrete execution configuration
        (harness/provider/model/instructions/skills/MCP/permissions/preferences)

Harness Adapter
  owns: probe + config/launch/session translation for one harness

Native Runtime
  owns: conversation/session, agent loop, tool execution, native history
```

### 6.2 四个“绝不相等”

- `Role ≠ Profile`：Planner 是 workflow 责任；`claude-architect` 是当前绑定。
- `Role ≠ Harness`：Planner 可以由 Claude Code 或 Hermes 实现。
- `Role ≠ Session`：一个 Planner 可在多轮 workflow 中产生多个 Attempts/sessions。
- `Profile ≠ Attempt`：同一个 Profile 可服务很多 Work；Attempt 是一次 immutable resolution 的事实记录。

### 6.3 Role binding 的最小语义

Work 内保存 conceptual map：role key、ProfileRef、binding revision、changed_at、changed_by、change reason。它不需要单独表/实体。替换 Planner 时只更新该 map 并追加 Decision；过去 Attempt 继续引用旧 binding revision，不能回写。

### 6.4 Effective Resolution

不是正式 schema，只是 Attempt 必须能回答的概念问题：

- 哪个 Profile ref 与哪一版/哪一个 digest？
- 哪个 harness binary/version？
- 哪个 provider/model？
- ACP 还是 native，adapter contract/version 是什么？
- cwd/worktree/additional roots 是什么？
- Environment sources/versions/digest 是什么？
- permission intent 被谁以什么程度 enforcement？
- Required/Available/Effective/Unsupported/Degraded capabilities 是什么？
- launch plan/config projection 的 digest 是什么？
- 有哪些 native overrides，是否 bypass 了 Core capability？

当前 Profile 没有正式 revision 字段，因此 v0.1 必须计算 materialized input digest，并记录 `profile_ref + digest`。不要把 config/auth 文件复制进 Attempt。

### 6.5 ACP-first adapter boundary

共同 SessionProvider surface 只包含：

```text
probe() → implementation/version/capability evidence
create_session(cwd, roots, mcp_refs, session_options) → NativeSessionRef
prompt(session_ref, handoff_or_role_input) → normalized stream
cancel(session_ref)
close(session_ref)
load_or_resume(session_ref) → optional, capability-gated
respond_permission(request_ref, decision)
```

Normalized stream 只需覆盖 message delta/final、tool call status、diff/location、terminal status、permission request、plan update、error/stop reason。它服务 UI 和 lifecycle，不成为通用 event schema，也不复制成完整 transcript。

native escape hatch 必须带 `provider/harness/version` guard，并在 resolution 中留下 bypass evidence；否则 capability report 会失真。

---

## 7. Workflow Choice

### 7.1 排名

| 排名 | 选择 | 判定 |
|---:|---|---|
| **A** | Fixed small state machine | **v0.1 首选** |
| **B** | LangGraph + SQLite checkpointer | **明确第二选择** |
| **C** | Kandev external workflow/task provider | **产品级替代路线** |
| 4 | Temporal | scale/durability upgrade，不进原型 |
| 5 | Prefect | 不匹配当前核心问题 |

### 7.2 v0.1 transition table

```text
PLAN    + planned       → EXECUTE
EXECUTE + implemented   → REVIEW
REVIEW  + approved      → COMPLETE
REVIEW  + needs_replan  → PLAN
REVIEW  + needs_fix     → EXECUTE
ANY     + blocked       → WAITING
ANY     + failed        → FAILED or manual retry decision
```

Core 只保存 current phase、last outcome、next role 和 status。每个 Role 是外部 side effect；dispatch 前创建 Attempt，dispatch 结束后在一个 transaction 中完成 Attempt、索引 artifacts/handoff、追加 Decision（如有）、推进 cursor。

这不是自研 workflow engine，因为明确不实现：DAG DSL、任意 node、queue、scheduler、retry policy language、parallel join、time travel、generic checkpoint、worker fleet 或 workflow version migration framework。

### 7.3 Pause/resume

- phase boundary：SQLite 是 authority，直接恢复 next dispatch。
- approval wait：Attempt waiting + permission request ref；恢复后继续同 ACP session（若支持）或新 Attempt + handoff。
- process crash：旧 Attempt interrupted；重新 probe Git/native session。能安全 resume 同 provider 时可继续；否则建新 Attempt。
- provider replacement：永远建新 Attempt/native session，不依赖 old session resume。

### 7.4 LangGraph upgrade boundary

当需要动态图、并行 Role、多个人工 interrupt、node-level failure recovery 时，新增 `LangGraphWorkflowProvider`。其 `thread_id` 可映射 `work_id`，checkpoint 成为 workflow cursor/state authority；Core 仍拥有 Work/Role binding/Attempt/Handoff/correlation。不要同时让 Core transition table 和 LangGraph checkpoint 决定 next role。

---

## 8. Workspace Choice

### 8.1 选择 Git worktree

Work 创建时：

1. canonicalize repository root；
2. resolve exact base SHA；
3. 默认要求所选 base 可由 committed state 表达；dirty source changes 不自动复制；
4. `git worktree add -b <work-branch> <worktree-path> <base-sha>`；
5. 保存 WorktreeRef；
6. 后续三个 Role 的 cwd 都是该 worktree。

建议目录是 Agent-Box managed workspace root，不把 worktree 放进 repository 自身。

### 8.2 Source of truth

| 信息 | Authority | Core 保存 |
|---|---|---|
| base object | Git | exact base SHA |
| branch/HEAD | Git | ref + last observed HEAD |
| index/worktree dirty state | Git live projection | last observed summary，仅诊断 |
| diff | Git | diff/patch artifact ref + digest，不复制到 Work row |
| worktree path/ownership | Core + Git worktree metadata | path、created_by_work、cleanup state |
| commits | Git object DB | commit ArtifactRef |

### 8.3 Cleanup

- 先关闭/取消 session 和进程。
- 记录 final HEAD、status、diff summary、test/review refs。
- 只有结果已由 commit/patch artifact 保留，且 worktree 符合 clean removal 条件，才自动 `git worktree remove`。
- dirty/untracked 或无 durable result 时绝不 `--force` 自动删除；标记 cleanup pending，交给用户。
- branch 可保留作为结果 ref；删除 branch 是 Later/显式操作。
- stale administrative metadata 使用 `git worktree prune`，不直接删除 `.git/worktrees`。

### 8.4 暂不支持

multi-repo、submodule 特殊 lifecycle、dirty source snapshot、merge/rebase/PR、并行 Role worktrees。Kandev 已有这些能力；出现真实需求时优先集成/复用，不扩张 v0.1。

---

## 9. Sandbox Choice

### 9.1 继续复用，但重新命名其承诺

当前实现的真实价值是：

- 每个 Profile 的 user-level config/data 目录覆盖；
- Project/Profile 原生配置 surface 的隔离投影；
- PID/IPC/UTS namespace；
- 临时 `/tmp`；
- 统一 cwd 与 launch plan；
- 现有测试覆盖 mount 顺序、project isolation、路径和冲突。

当前实现不能证明：

- 宿主 filesystem 仅 workspace 可写（因为 bind `/` 为 rw）；
- 网络 deny/allow policy（因为 share net）；
- secret/credential isolation；
- syscall/seccomp enforcement；
- worktree 是安全边界。

因此 v0.1 仍选它作为 `BwrapLaunchAdapter`，但 UI/diagnostics 必须显示 enforcement provider 与 status。

### 9.2 provider 排名

1. **existing bwrap**：首选，成本最低，能力诚实降级。
2. **Anthropic sandbox-runtime**：需要 filesystem/network policy 时的最近升级；先做 conformance 和 preview-risk 评估。
3. **Docker**：项目本来已有 container/devcontainer 时可用，不为 Work Core 强制。
4. **Docker Sandboxes**：需要 microVM/credential/network 强隔离且平台允许时。
5. **E2B/remote sandbox**：remote/elastic workload 后再考虑。

Harness native approval 只是交互/工具策略，不等于 OS sandbox；不能作为 `sandbox_enforcement=true` 的唯一证据。

---

## 10. Capability Resolution

### 10.1 五类集合

- **RequiredCapabilities**：Workflow/Role/permission intent 为成功或安全所要求。
- **AvailableCapabilities**：各 provider 在当前版本、配置和 host 上报告/探测到的事实。
- **EffectiveCapabilities**：组合后真正可用的 closure，带 scope/enforcer。
- **UnsupportedCapabilities**：required 但不可用；启动前失败。
- **DegradedCapabilities**：可运行但语义比 intent 弱；安全项默认不可自动接受。

### 10.2 v0.1 最小 vocabulary

| Capability | 为什么影响当前闭环 | 主要报告者 | 组合规则/当前判断 |
|---|---|---|---|
| `headless` | workflow 要无人值守 dispatch | Harness Adapter | CLI/ACP probe；三条 Must harness path 必须 true |
| `session_resume` | crash/同 provider continuation 优化 | ACP agent + Harness Adapter | ACP load/resume capability；**不是 replacement requirement** |
| `workspace_read` | Planner/Reviewer 必须读代码 | Workspace + Sandbox + ACP client/harness | roots/mount/FS method closure |
| `workspace_write` | Executor 必须改代码 | Workspace + Sandbox + harness | Planner/Reviewer 可不要求；scope 必须说明是否 exclusive |
| `terminal` | tests/build/git inspection | ACP client capability + harness + sandbox | 缺失则 Executor unsupported |
| `mcp` | Profile 可能要求 MCP tools/resources | Profile + ACP/harness + MCP negotiation | 同时有 config、transport 与 server 可达才 effective |
| `background` | turn/session 可在 UI 切换后继续 | Process supervisor + session transport | local supervisor 可给 process-level；ACP 本身不保证 durable host |
| `user_approval` | 风险 tool call 可停下等用户 | ACP permission + InteractionProvider | native passthrough 只能标 partial/degraded |
| `network_control` | permission intent 可能要求 deny/allow | SandboxProvider | 当前 bwrap **unsupported** |
| `sandbox_enforcement` | 防止把 prompt/approval 当安全边界 | SandboxProvider | 当前 bwrap policy **degraded**，必须列 bypass surfaces |

### 10.3 provider report mapping

```text
ACP initialize
  → session_resume, terminal(client), MCP transports, optional session methods

Harness Adapter probe
  → headless, native resume, stream/cancel behavior, harness version

WorkspaceProvider
  → workspace_read/write paths, base/head/diff availability

SandboxProvider
  → enforcement status, write/read scopes, network control, bypass surfaces

InteractionProvider
  → approval response, active controller, timeout/cancel behavior

Profile/Environment resolver
  → MCP requirements, permission intent, configured tools and refs
```

### 10.4 closure 规则

1. Omitted/unknown 不等于 supported。
2. capability 必须带 provider、detected version、scope、evidence/tested range。
3. 同名功能与安全 enforcement 分开；例如能写 workspace 不代表不能写别处。
4. provider-specific feature 留在 native metadata，除非至少两个实现且影响 Work decision。
5. Role replacement 重新 resolve 全部 Available/Effective，不复用旧 report。
6. `network_control`、`sandbox_enforcement` 等安全 Required 缺失时 fail closed。
7. `session_resume` 缺失不阻止 replacement，因为 Handoff 是正式 continuity path。

---

## 11. Effective Work State

`EffectiveWorkState` 是 dispatch 前按权威来源生成的只读 projection，不是第六个持久 domain object，也不是完整 transcript。

### 11.1 概念字段

```text
identity
  work id, objective, acceptance criteria, task refs

workflow
  workflow ref/version, current phase, next role, last outcome, status

role context
  logical role, current binding/profile ref, binding revision,
  prior attempts relevant to this role

progress
  completed items, key decisions, reviewer findings,
  open questions, pending actions, blockers

workspace projection
  project ref, base SHA, worktree ref/path,
  current HEAD, dirty/index summary, diff/commit refs

artifacts
  relevant plan/test/review/handoff/commit refs and digests

runtime constraints
  environment refs/summary, required/effective/degraded capabilities,
  permission intent and enforcement notes

provenance
  source labels, producer attempts, timestamps/digests,
  prior native session refs only as optional evidence
```

### 11.2 Source-of-truth matrix

| 信息 | Authority | Core-owned 还是 projection |
|---|---|---|
| Work ID/objective/criteria | Work | Core-owned |
| current phase/status/transition | built-in Workflow state in Work | Core-owned；换外部 provider 后由其 checkpoint projection |
| Role/Profile binding/revision | Work | Core-owned |
| completed/pending/open questions | latest accepted Handoff + explicit Decisions | Core-owned semantic record |
| key decisions | Decision ledger | Core-owned |
| Reviewer findings | Review Artifact/Handoff | artifact content，Core indexes/links |
| Git base/head/diff/dirty | Git | dynamic projection |
| Plan/Test/Review bytes | filesystem/Git | dynamic projection via ArtifactRef |
| native conversation | harness | external optional；不进入 required state |
| native session status | SessionProvider | dynamic projection |
| environment source/config | Environment providers | referenced；effective summary snapshot on Attempt |
| live service/secret/credential | external providers | reference/probe only |
| capabilities | resolver over current provider reports | per-Attempt immutable result + current projection |

### 11.3 Prompt assembly

新 Planner D 收到：role instruction（来自新 Profile）+ latest Handoff + selected EffectiveWorkState sections + artifact/Git refs。默认不内联完整 diff、logs 或历史 artifacts；让新 agent通过 Git/filesystem/tool 按需读取。这样 continuation 对 provider-neutral state 有依赖，对旧 Claude session 没有依赖。

---

## 12. Handoff

### 12.1 现有系统给出的边界

- Kandev 的强参考是保留 task/run/environment/worktree/instructions/skills，清除旧 provider session，从 task/repo durable state 继续。
- VS Code 当前 handoff 可携带完整 conversation/context，但那是 Agent Host-owned session 模型；Agent-Box 不应为复刻它而建立 transcript authority。
- LangGraph/Temporal 的 state/checkpoint/history 适合同一个 workflow runtime 的 durable continuation，不自动定义跨 coding harness 的语义摘要。
- OpenAI Agents SDK/AutoGen 的 handoff/agent routing 服务框架内 agent collaboration；AutoGen Swarm 还默认依赖共享 message context。它们不能替代 Git/workspace/provenance contract。

### 12.2 v0.1 最小 Handoff Package

```text
identity/provenance
  handoff id, work id, from/to role, from/to attempt if known,
  reason, created time, producer, digest

objective
  objective + acceptance criteria reference/short copy

completed
  verified completed work, not claims copied from chat

decisions
  accepted decisions with Decision refs

constraints
  permission/environment/capability constraints relevant to next role

findings
  reviewer/test findings with evidence refs

open questions
  unresolved choices or missing information

pending actions
  ordered next actions and expected output

artifact refs
  plan, review, test, patch/commit, other reports

workspace/git refs
  project/worktree, base, current HEAD, dirty/diff summary/ref

session provenance
  prior profile/harness/model/native session ref, optional and non-portable
```

### 12.3 最简单物理实现

- DB：Handoff record 保存 identity、from/to、reason、artifact URI、digest、created/consumed attempt refs。
- filesystem：`$AGENT_BOX_HOME/works/<work_id>/handoffs/<handoff_id>.md` 保存 payload。
- Artifact Index：同一文件登记为 `kind=handoff`，不复制 bytes。
- Workflow：只保存 latest input/output HandoffRef，不复制 payload。

当旧 provider 正常结束时，可要求它输出 compact handoff draft；Core 必须用 Work/Git/Artifacts 校验并补齐。旧 provider 崩溃或被替换时，Core 仍可从 durable sources 合成 handoff，因此 outgoing session 不是强依赖。

---

## 13. Artifact / Provenance

### 13.1 v0.1 足够使用 Git + filesystem

| Artifact | Content authority | Core index locator |
|---|---|---|
| Plan | work artifact directory Markdown | path/URI + digest + producer Attempt |
| Patch | Git diff or patch file | base/head + path/digest |
| Commit | Git object database | repository ref + commit SHA |
| Test Report | file/log excerpt | path + digest + command/exit summary |
| Review Report | Markdown/file | path + digest + reviewer Attempt |
| Handoff | handoff Markdown | Handoff ID + path + digest |

不需要 object store，也不需要把 artifact body 放进数据库。ArtifactRef 必须记录 kind、locator、digest、producer Attempt、created time、media/format、retention 与可选 git coordinates。Artifact bytes 丢失时 index 应报告 broken，而不是把陈旧 metadata 当结果。

### 13.2 Provenance 最小要求

- 谁产生：role + attempt + profile resolution digest；
- 在什么代码状态产生：base/head/diff refs；
- 用什么环境/能力：Attempt resolution ref/summary；
- 内容完整性：digest；
- 被谁消费：Handoff/Attempt refs；
- 最终结果：commit/patch/report refs，而不是一句“完成”。

---

## 14. Correlation / Attempt Model

### 14.1 最小 correlation graph

```text
Work(work_id)
  ├── workflow_ref + cursor                 # v0.1 WorkflowRunRef = internal work_id
  ├── role_bindings[role_key, revision]
  ├── workspace_ref                         # Git worktree
  ├── Attempt(attempt_id, role_key, binding_revision)
  │     ├── effective_resolution snapshot
  │     ├── native_session_ref
  │     ├── sandbox/environment/trace refs
  │     ├── input/output handoff refs
  │     └── produced artifact refs
  ├── Decision(decision_id)
  ├── Handoff(handoff_id)
  └── ArtifactRef(artifact_id)
```

### 14.2 Attempt 是必要 abstraction

定义：**一次 Workflow 向一个 logical Role 的连续 dispatch，在一份 immutable Effective Resolution 下运行，直到产出 outcome、被取消、被替换、失败或进入不可恢复等待。**

新 Attempt 的触发：

- Workflow 再次 dispatch 一个 Role；
- Role binding revision 改变；
- Effective Resolution 的 Profile/harness/model/permission/enforcement 发生 material change；
- 无法安全 resume 的 crash/restart；
- 用户显式 retry。

同一 Attempt 内可以有多个 prompt/approval turn；一次普通工具重试不必创建 Attempt。Attempt 不是模型 turn，也不是 process PID。

示例：

```text
Planner Attempt 1
  binding rev 1 → claude-architect → Claude Code → native session C1

Planner Attempt 2
  binding rev 2 → deepseek-analyst → Hermes/DeepSeek → native session H1
  consumes Handoff P1-to-P2
  supersedes Planner Attempt 1 for future Planner dispatch
```

### 14.3 WorkflowRun

v0.1 中一个 Work 恰好对应一个 built-in workflow run，因此不创建 WorkflowRun entity：`workflow_ref/version/cursor` 放在 Work，内部 run ref 可等于 Work ID。只有一个 Work 需要多次 workflow execution，或外部 provider 产生独立 run ID 时，才增加 typed `WorkflowRunRef`，仍优先是 reference 而不是 Core object。

---

## 15. Persistence

### 15.1 SQLite 保存什么

- Work identity、objective/criteria、status/phase/cursor；
- embedded role bindings + revisions；
- Project/Workspace/Workflow/Task external refs；
- Attempts 与 immutable resolution summaries；
- native session/sandbox/environment/trace refs；
- Decisions；
- Handoff metadata/refs/digests；
- Artifact Index；
- cleanup state 和 final outcome refs。

### 15.2 SQLite 不保存什么

- native transcript、reasoning、token cache；
- LangGraph/Temporal/Kandev provider state 的副本；
- Git object、完整 diff、worktree state；
- artifact blob；
- 完整 Profile config/auth 文件；
- secret/credential value；
- universal normalized tool/event history。

### 15.3 Transaction boundary

最重要的 transaction 是：

1. 创建 Attempt + 冻结 resolution；
2. dispatch 前标记 active；
3. dispatch 结束后原子完成 Attempt、登记 output refs、推进 workflow cursor；
4. replacement 时原子追加 Decision、更新 binding revision、登记 Handoff、新建 next Attempt intent；
5. completion 时原子保存 final refs/status/cleanup pending。

SQLite 对单机低并发足够。若未来用 LangGraph SQLite checkpointer，必须明确两个 store 的 authority，不能双写同一 workflow state。

---

## 16. Minimal Core Domain Candidate

### 16.1 逐项挑战

| 候选 | 结论 | 理由 |
|---|---|---|
| `Work` | **独立实体，必须** | 稳定 identity 跨多个 provider/session/attempt/workspace artifact |
| `RoleBinding` | **作为 Work 字段** | 只有三个 role；单独实体/表没有生命周期收益；用 binding revision 保留历史 |
| `Attempt` | **独立实体，必须** | immutable actual runtime/provenance；replacement/retry/producer correlation 的最小单位 |
| `EffectiveResolution` | **Attempt 内 immutable value** | 生命周期完全依附 Attempt；单独 ID 只增加 join；可用 digest 引用 |
| `Decision` | **独立 append-only entity，保留** | 决策随时间累积、需 provenance/handoff 引用，不能反复改写 Work JSON；限定类型，不做 event sourcing |
| `Handoff` | **独立实体，必须** | provider replacement 的核心 contract；需要 produced/consumed/supersedes/digest 关系 |
| `ArtifactRef` | **独立轻量 index entity，保留** | 一个 Work 多 artifact、多 producer/consumer；DB 不存 body |
| `ExternalRef` | **通用嵌入字段，删除实体** | Task/Project/Workflow/Session/Workspace/Sandbox/Trace 都只需 typed locator/version/digest |

### 16.2 最终五个 Core domain objects

1. Work
2. Attempt
3. Decision
4. Handoff
5. ArtifactRef

这五个已经是上限。Role、Profile、Project、Workflow definition、Workspace、Sandbox、Environment、NativeSession 都由既有 subsystem/provider 拥有，Core 只引用或投影。

### 16.3 Decision 不等于 event

Decision 只记录会影响后续 agent 的语义事实，例如：接受的设计方向、Reviewer 要求、用户批准的显式降级、Role Profile 替换、终止/重试原因。message delta、tool progress、PID start、每次 SQL update 不进入 Decision ledger；它们属于 structured logs 或 provider session。

---

## 17. End-to-End Example

### 17.1 初始设置

```text
Work objective:
  给 Agent-Box 增加 capability resolver

Acceptance criteria:
  - resolve Required/Available/Effective/Unsupported/Degraded
  - replacement re-runs capability resolution
  - security-required gaps fail before launch
  - tests cover Claude → Hermes Planner replacement

Workflow:
  Plan → Execute → Review → (Plan | Execute | Complete)

Bindings rev 1:
  Planner  → claude-architect   → Claude Code
  Executor → codex-coder        → Codex
  Reviewer → claude-reviewer    → Claude Code
```

以下表格中，“保存”只指 Agent-Box Work Core 新增数据；Git、artifact bytes 和 native session 仍由 provider 保存。

| Step | Core object 变化 | 调用 provider | 新 external ref | 权威来源 | Agent-Box 自己保存 |
|---:|---|---|---|---|---|
| 0. Create Work | 创建 `Work W1`；bindings rev 1；phase=PLAN；status=ready | manual Intake；Git Project probe；Git worktree add | optional TaskRef；ProjectRef；base SHA；WorktreeRef | objective/criteria=Work；base/worktree=Git | W1、criteria、workflow ref/cursor、bindings、refs、worktree path/base |
| 1. Planner 制定方案 | 创建/运行/完成 `Attempt P1`；创建 Plan Artifact A1 与 Handoff H1；phase→EXECUTE | Profile resolver；Claude ACP adapter；existing bwrap；Git/filesystem | Profile `claude-architect`；resolution digest R1；Claude native session C1；A1/H1 paths | session=Claude；plan bytes=filesystem；phase=Work | P1、R1 summary、C1 typed ref、A1/H1 index、outcome=planned |
| 2. Executor 修改代码 | 创建/完成 `Attempt E1`；Patch/commit/test artifacts；phase→REVIEW | Codex ACP；bwrap；Git worktree；terminal/tests | Codex session X1；diff/commit G1；test T1 | code/diff/commit=Git；test bytes=file | E1/resolution、X1 ref、artifact refs/digests、implemented outcome |
| 3. Reviewer 发现 enforcement 问题 | 创建/完成 `Attempt Rv1`；Review A2；Decision D1；Handoff H2；outcome=needs_replan；phase→PLAN | Claude reviewer ACP；Git read/status；test report reader | Claude session C2；review path A2；H2 | findings=Review artifact；Git state=Git；phase=Work | Rv1、refs、D1“当前 bwrap 不满足 enforcement”、H2 metadata |
| 4. Work 回到 Planner | Work cursor 已是 PLAN；计算 EffectiveWorkState | Work projection；Git；Artifact index | none | phase/binding=Work；code=Git；findings=A2/H2 | 不复制 projection；只更新 last_observed/status if needed |
| 5. 用户替换 Planner | binding `planner` rev 1→2；Decision D2；若有 active P attempt则先 cancel/settle；为 replacement 创建/确认 Handoff H3 | InteractionProvider；old SessionProvider cancel/close best effort；Git snapshot | new ProfileRef `deepseek-analyst`；old session ref retained | binding=Work；Git=Git；old session=Claude | D2 reason/actor；new binding ref/revision；H3 metadata/digest |
| 6. 新 Planner 获取 Work State/Handoff | 创建 `Attempt P2`，freeze resolution R2；consumes H3；不加载 C1/C2 | Profile resolver；Hermes ACP；bwrap；EffectiveWorkState projector | Hermes native session HN1；Hermes/DeepSeek/provider/adapter refs | session=Hermes；state fields各自 authority | P2、R2 summary、HN1 ref、consumes H3、capability result |
| 7. 新 Planner 继续规划 | 完成 P2；新 Plan A3/Handoff H4；phase→EXECUTE | Hermes ACP prompt/stream；Git/filesystem | A3/H4 | plan=A3；code=Git；decisions=ledger | outcome=planned、A3/H4 refs；不保存 Hermes transcript |
| 8. Executor 修复 | 创建 `Attempt E2`；可创建新 Codex session或同 provider capability-gated resume；产生 commit G2/test T2；phase→REVIEW | Codex ACP；Git；terminal | X2（或 X1 resume evidence）；G2/T2 | Git/test providers | E2/resolution/session ref、G2/T2 refs、implemented outcome |
| 9. Reviewer 通过 | 创建/完成 `Attempt Rv2`；Review A4；outcome=approved；phase→COMPLETE | Claude reviewer ACP；Git/test reader | C3；A4 | approval finding=A4；final Git=Git | Rv2、refs、approved outcome、final refs transaction |
| 10. Complete + cleanup | Work status=completed；cleanup state 推进；Attempts closed | ACP close/cancel；process supervisor；Git worktree status/remove | final commit G2；optional retained branch；cleanup refs | result=Git/artifacts；native cleanup=harness；worktree=Git | final result refs、completed time、cleanup result；保留 Decisions/Handoffs/Attempts/Index |

### 17.2 Step 6 实际给 Hermes 的 continuation input

概念上包括：

- objective/criteria；
- phase=PLAN、role=Planner、binding rev 2；
- completed：初版 plan、Executor 修改与测试；
- accepted decision：需要 capability resolver，并且 enforcement capability 不能从 bwrap 配置隔离推断；
- Reviewer finding：当前 broad rw root mount/share-net 导致 `sandbox_enforcement` degraded、`network_control` unsupported；
- pending：修订 capability vocabulary/closure/fail-closed 方案；
- Git：base SHA、current HEAD、dirty/diff/commit refs；
- artifacts：A1/A2/T1/H3 refs；
- environment/capability constraints；
- provenance：旧 Planner Claude session ref 仅作记录，不作为恢复输入。

Hermes 可以按路径读 plan/review/test、按 Git 命令查看代码，然后给出新方案；这个成功条件就是 provider replacement spike 的核心测试。

### 17.3 中途替换的安全顺序

```text
replace requested
  → stop accepting new prompt/tool dispatch for old Attempt
  → ACP cancel; wait bounded time; terminate process if needed
  → record old Attempt completed/cancelled/interrupted truthfully
  → query Git + artifacts + decisions
  → create immutable Handoff
  → update binding revision
  → resolve new Profile/capabilities from scratch
  → create new Attempt/native session
  → send EffectiveWorkState + Handoff
```

v0.1 不支持在未 settle 的工具副作用中间进行透明 handoff；那会产生无法证明的重复/半完成操作。

---

## 18. Must / Should / Later / Do Not Build

### 18.1 Q1：最小闭环需要写哪些新代码

按模块，而非正式文件/schema：

1. **Work repository/service**：Work/Attempt/Decision/Handoff/ArtifactRef persistence、transactions、queries、cleanup state；新增 migration。
2. **Built-in workflow**：固定 transition table、role contracts、outcome validation、boundary resume。
3. **Role binding + resolver**：消费现有 Profile/registry/ACS refs/project projection，计算 digest 与 Effective Resolution。
4. **Capability resolver**：10 项 vocabulary、provider reports、closure、unsupported/degraded diagnostics、fail-closed rules。
5. **ACP session layer**：官方 Python SDK client、process supervisor、normalized minimal stream、permission bridge、cancel/close；Claude/Codex/Hermes command/probe descriptors。
6. **Workspace adapter**：Git repo probe、worktree create/status/ref/safe cleanup；不做 Git manager。
7. **EffectiveWorkState projector**：从 Work DB + Git + Artifact Index + environment/session probes 组合 dispatch input。
8. **Handoff/artifact writer**：Markdown package、digest、index、producer/consumer correlation。
9. **Application controls**：CLI `work create/show/start/stop/replace/approve/cleanup` 的最小路径；GUI 只接相同 service API。
10. **Tests**：fake ACP agent、Git worktree integration、resolver matrix、crash/boundary resume、真实 Claude→Hermes Planner replacement smoke test。

实现上可以合并模块；不要为了目录漂亮拆出十个小框架。

### 18.2 Q2：现有 Agent-Box 可以直接复用什么

| 已有能力 | 复用方式 | 仍缺什么 |
|---|---|---|
| Profile CRUD/metadata/config directories | Role binding 直接引用 Profile name/ref | formal revision；v0.1 用 digest |
| ACS provider/MCP/skill/prompt refs 与 apply | Resolver 引用并解释实际资源 | Work-level immutable resolution summary |
| `agent_types.json` 四 harness registry | harness identity/binary/launch/resources/sandbox descriptor source | ACP command/capability/tested-version descriptors |
| `launch.py` bwrap plan | Profile-aware process launch、mounts、cwd、env | async/stdin/stdout managed process；不要沿用同步 wait-only API |
| `project_space.py` | Project/Profile native config surface isolation | Git Project entity/worktree lifecycle（另加薄 adapter） |
| existing bwrap config/tests | 配置 namespace 和 project Profile 投影 | 强 FS/network enforcement；必须 degraded report |
| SQLite/migrations/repository pattern | 直接新增 Work persistence | Work transactions/indexes |
| existing sessions table/PID cleanup | 复用进程观测思路 | 它不是 native session/Attempt model，不能直接冒充 |
| CLI cmd2/TUI 与 GUI bridge/RPC | 新 Work commands/view 复用入口 | Work-specific service/API/actions |
| provider model fetch/config adapters | Resolution diagnostics | 不等于 session transport adapter |

特别说明：当前 `src/agent_box/adapters/` 主要是 ACS 和 model catalog adapter；当前仓库还没有统一的 Claude/Codex/OpenCode/Hermes Session Adapter。`agent_types.json` 有 native launch/resume 命令，但这不等于已经实现 ACP/native session control plane。

### 18.3 Q3：1–2 周原型如何砍功能

#### Must Have

- manual objective + acceptance criteria；独立 Work ID；可选 TaskRef 字段但无 tracker integration；
- 一个 clean committed local Git repo；一个 Work worktree；
- built-in Plan/Execute/Review + review loop；
- Planner/Executor/Reviewer stable role keys 与 bindings；
- Work、Attempt、Decision、Handoff、ArtifactRef；
- resolve snapshot + 10-capability report；
- Claude、Codex、Hermes 三条 ACP/probe path，足够跑题目中的 replacement；
- phase-boundary/cancel-then-restart Profile replacement；
- EffectiveWorkState + Markdown Handoff；
- Git/filesystem artifacts；SQLite persistence；
- CLI create/show/start/stop/replace/approve/cleanup；
- 真实 E2E smoke：Claude Planner → Codex Executor → Claude Reviewer → Hermes Planner → pass。

#### Should Have

- GUI Work list/detail/start/stop/replace/approval；
- same-provider ACP load/resume；
- OpenCode ACP adapter；
- structured JSONL logs 与 explain view；
- graceful crash recovery、worktree cleanup diagnostics；
- native CLI escape hatch for one failing ACP adapter；
- read-only GitHub Issue import。

#### Later

- LangGraph WorkflowProvider；
- Kandev/Temporal external provider；
- multi-repo、parallel worktrees、branch/PR automation；
- Dev Container/Docker Sandboxes/E2B；
- formal versioned Profiles；
- dynamic workflow definitions、parallel roles、budgets/retry policy；
- AHP/AG-UI/remote multi-client host；
- OTel export；
- object store、remote artifact retention；
- Linear/Jira/Kandev bidirectional task sync。

#### Do Not Build

- universal Task domain；
- general workflow/DAG engine or visual builder；
- native transcript converter / conversation migration；
- agent loop、memory system、generic multi-agent framework；
- artifact blob database/object store；
- Git/repository manager；
- new sandbox runtime；
- secret store/IAM/network proxy；
- universal event schema/event sourcing；
- permission abstraction that claims enforcement without provider evidence；
- mid-tool-call transparent hot swap；
- Slack/Discord/notification surfaces；
- RBAC/teams/billing/scheduler/control plane。

---

## 19. Open Questions

这些问题不改变首选 stack，但应在编码第一天作出窄决定：

1. **Dirty source policy**：建议原型默认拒绝把未提交主工作区隐式带入 Work；是否需要用户显式选择 current folder fallback？
2. **Profile digest boundary**：digest 计算哪些 materialized files/refs，如何排除 auth/secret bytes同时仍检测有意义变化？
3. **Adapter tested ranges**：Claude/Codex/Hermes ACP 的最小已验证版本是什么？每次 upstream upgrade 如何 canary？
4. **Review outcome contract**：Reviewer 如何最小结构化输出 `approved / needs_fix / needs_replan` 与 evidence refs？
5. **Replacement boundary**：原型是否只允许 phase boundary，还是允许 active turn cancel 后替换？建议实现后者，但不做 mid-tool transparent swap。
6. **Artifact retention**：Work 完成后 handoff/plan/review/test 保存多久；worktree branch 是否默认保留？
7. **Approval timeout**：无人响应时保持 waiting、自动 cancel 还是超时 fail？建议 waiting + user stop。
8. **Existing sessions table**：继续只做 legacy launch history，还是逐步让 Work Attempt 成为新路径而保持兼容？建议不强行迁移旧 session rows。
9. **GUI scope**：1–2 周若不足，应先保证 CLI E2E，把 GUI 降为 read-only Work detail。

---

## 20. Final v0.1 Recommendation

### 20.1 最终答案

如果明天开始写代码，Agent-Box Work Core v0.1 应由：

**五个对象**

- Work
- Attempt
- Decision
- Handoff
- ArtifactRef

**八类 provider/adapter**

- SQLite Work Repository
- built-in fixed WorkflowProvider
- existing Profile/Environment Resolver inputs
- ACP-first Harness SessionProvider（Claude/Codex/Hermes；OpenCode second）
- Git WorktreeProvider
- existing BwrapLaunchAdapter
- Git/Filesystem ArtifactProvider
- existing CLI/GUI InteractionProvider

**三条核心路径**

- Start/dispatch path
- Review loop path
- cancel-snapshot-handoff-rebind-restart replacement path

以及一条 completion/cleanup tail。

### 20.2 最小成功判据

原型只有在以下测试通过时才证明 Work Core 有价值：

1. 同一个 `work_id` 先由 Claude Planner 产出 plan，再由 Codex Executor 修改，再由 Claude Reviewer 提出问题。
2. 删除/忽略旧 Planner native session ref 后，将 Planner binding 改为 Hermes + DeepSeek。
3. Hermes 仅通过 EffectiveWorkState、Handoff、Git 和 indexed artifacts 正确复述当前目标、已完成工作、Reviewer finding、关键决定、代码状态和下一步。
4. Hermes 产出修订 plan，Codex 修复，Reviewer 通过。
5. 查询 Work 能准确回答每个 Role 的每次 Attempt 实际使用了哪个 Profile/harness/provider/model/capability/enforcement/worktree/artifact/native session。
6. cleanup 不删除唯一未保存结果，也不删除 Work provenance。

如果这条测试不能明显优于人工复制 plan/review + 共用 worktree，就不应扩展为通用 Work platform。

### 20.3 最终边界

> Work Core 的价值不是“恢复每个 agent 的对话”，而是让 objective、workflow role、decision、code state、artifact 和 provenance 在对话不可迁移时仍然连续。

因此 v0.1 的正确工程形态不是更大的 agent framework，而是一个小型、可解释、fail-closed 的 correlation and continuation core：**Role 保持逻辑身份，Attempt 冻结实际运行，Handoff 搬运必要语义，Git 保留代码事实，native session 始终可替换。**
