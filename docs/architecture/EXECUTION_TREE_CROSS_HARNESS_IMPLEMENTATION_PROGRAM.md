# Execution Tree 与跨 Harness 连续会话实施总纲

> 状态：IMPLEMENTATION PROGRAM READY — 等待 Agent-Box 后端 provenance 修复完成并完成人工 checkpoint
>
> 产品语义 authority：
> [`EXECUTION_TREE_AND_CROSS_HARNESS_SESSION.md`](./EXECUTION_TREE_AND_CROSS_HARNESS_SESSION.md)
>
> 后端基础蓝图：
> [`AGENTBOX_STUDIO_BACKEND_CORE_IMPLEMENTATION.md`](./AGENTBOX_STUDIO_BACKEND_CORE_IMPLEMENTATION.md)
>
> 本文是实施、拆阶段、派发子代理和验收的唯一 program plan。它不取代上面的产品
> 语义文档，也不恢复已经废弃的 Leg、摘要 handoff、对称 Codec 或每轮完整重建方案。

## 1. 最终用户能力

完成本计划后，用户在 Agent-Box Studio 中可以：

1. 在 Codex、Claude Code、OpenCode、Hermes 和 Pi 中创建真实会话；
2. 在同一 Harness 中继续时使用该 Harness 官方原生 resume，不经过公共历史重建；
3. 在一个 Session 中切换 Harness，新 Harness 能读取当前分支此前的有效工作历史；
4. 从任意可继续的历史 Execution 创建新分支，原分支和原生 Session 存档保持不变；
5. 切换 Harness 后如果效果不满意，可以回到切换前的 Execution 另开分支；
6. 切回曾经使用过的 Harness 时，复用当前祖先路径上最近的兼容原生 checkpoint，
   只补充它尚未吸收的公共历史；
7. 在执行前看到跨 Harness 转换的 Loss Report、上下文窗口风险和 workspace 是否能
   精确分叉；
8. 查看 Execution Tree、每个节点使用的 Harness/Profile/Model、Binding、Workspace
   变化和 continuation 方式；
9. 对当前分支执行 compact，而不删除完整审计历史、不影响兄弟分支；
10. 在进程重启、响应丢失和部分故障后查询确定结果，不产生重复 Execution、假终态
    或被改写的 provenance。

## 2. 已冻结的产品裁决

以下不是实现者可自行调整的建议。

### 2.1 Session、Execution 与 Harness

- 一个 Official Session 对应一个 Work；
- Session 不绑定 Harness，Harness/Profile/Model 是逐 Execution 的 Binding；
- 一个 Execution Tree 节点对应一个已存在的 Work Core Execution；
- 每个节点最多一个父节点；第一版是树，不实现多父 merge；
- 同一父节点可以有多个子节点；创建子节点不删除或覆盖其他分支；
- 第一版一个 Session 同时最多一个写 Execution；树结构不等于并行调度；
- Delegation Tree 是某个 Execution 内部的子 Agent 任务，不得与 Execution Tree 共用
  数据模型或 UI 语义。

### 2.2 Session 历史

- 每次 Execution 的公共语义都静默追加到 Official Canonical History；
- 同 Harness 且 checkpoint 兼容时，Harness 输入只使用原生 direct resume；
- 公共历史只在跨 Harness、切回较早 Harness并补充缺失路径、或原生 checkpoint
  不可直接 resume 时作为 Harness 输入；
- 不在两个 Harness 的原生格式之间直接转换；
- 跨 Harness 路径为：来源 native → canonical → 目标 native view；
- 每个来源 Harness 的原生记录/checkpoint 单独保留，以便同 Harness 无损 resume 和
  审计；
- Canonical History 保存可移植公共语义，不伪装保存所有厂商私有语义；
- 不允许用隐藏摘要或普通 prompt 冒充完整连续会话；
- 有损转换必须生成结构化 Loss Report，blocking loss 必须阻止执行。

### 2.3 Execution Tree 与 Workspace

- 回到历史存档点意味着从该父 Execution 创建新分支，不是删除或回滚旧分支；
- Session Store 只保存 Workspace provider 产生的 exact Ref，不复制项目目录；
- Git/managed Workspace 的 commit、tree、worktree、capture 和冲突由 Workspace/Git
  provider 负责；
- `local-live-workspace` 可以表达会话 lineage，但不能声称能恢复历史文件状态；
- 从历史节点精确分叉代码状态必须有可重新物化的 exact Workspace Ref；
- 只有 live Ref 时，必须显示 `workspace_fork=UNAVAILABLE` 或要求先 capture，不能
  把当前磁盘状态冒充历史快照。

### 2.4 Compact

- compact 是 branch-scoped context operation；
- compact 改变该分支后继 Execution 使用的有效上下文；
- 完整公共历史、原生 checkpoint 和兄弟分支内容不删除；
- Studio 不自行调用隐藏模型生成摘要；
- 原生 compact 只有在对应 Harness 明确支持并有证据时才能调用；
- 超出窗口时先 preflight 阻止，不得静默截断。

### 2.5 模块边界

- Work Core 不增加 `parent_execution_id`、`branch_id`、Harness 品牌、native session
  或 canonical transcript ontology；
- `agent_box.protocols.session` 只定义中立 DTO、SPI、failure 和 contribution kind；
- `agent-box-session` 拥有 Session/Work 映射、Execution Tree、branch、canonical
  ledger、checkpoint 索引、事务与恢复；
- `agent-box-harnesses` 拥有五家 native schema、Importer、Materializer、Resumer、
  compatibility 与 Loss Report 事实；
- Workspace/Git 插件拥有文件状态物化和 capture；
- `agent-box-studio` 只做上层选择、preflight、Binding 组合、API 和事件编排，不解析
  厂商 Session 文件；
- Agent-Box Studio 前端只消费 Studio API，不复制 Agent-Box Python 包；
- 本计划不需要新增一个“理解所有 Harness”的 ACP/Session 专用插件。

## 3. 已完成基线与开工前置

### 3.1 已完成能力

当前 Agent-Box 后端分支已经实现或正在收口：

- `agent_box.protocols.session` 基础协议包；
- `agent-box-session` SQLite Store、WAL、FULL synchronous、lease、idempotency、event
  ledger、watermark、recovery saga；
- Session = Work 持久映射；
- Turn = 1..N Execution link；
- `local-live-workspace` provider；
- `agent-box-studio` FastAPI/WS/auth/service shell；
- 五家 Harness 独立执行；
- 五家现有原生 continuation；
- per-Execution set-once provenance：
  `parent_execution_id`、`input_session_ref`、`output_native_session_ref`、
  `workspace_input_ref`、`workspace_output_ref`；
- OpenCode ACP 可选模式，但 ACP 不作为跨 Harness Session 的统一前提。

这些能力不等于已经实现 Execution Tree、canonical materialization 或跨 Harness
连续会话。

### 3.2 Goal 模式启动前必须完成

1. 当前 provenance 修复通过人工复验；
2. committed `TurnRunView.execution_id` 是 continuation parent 的唯一权威；
3. v1 → v2 → v3 migration 在 commit 前验证严格逐级前进；
4. Session isolation、set-once 原子性和 output provenance failure 全部有反例测试；
5. 当前后端 dirty worktree 完成人工 staging、commit、CI 和 merge；
6. 从新的 `origin/main` 创建专用 worktree/branch，例如：

   ```text
   feat/execution-tree-cross-harness-session
   ```

7. 新分支开工时工作树必须 clean；
8. 记录 base commit、插件发现数量、schema version、全量测试基线；
9. 不在旧 `agent-box-studio-backend-core` dirty worktree 上继续叠加本计划。

## 4. 目标数据流

### 4.1 同 Harness direct resume

```text
parent committed Execution
  → exact output_native_session_ref
  → compatibility probe
  → NativeSessionResumer.resume()
  → execution-scoped writable native view
  → Harness official resume
  → terminal drain
  → freeze new native checkpoint
  → Importer appends canonical delta
  → commit child node and move branch head
```

Canonical History 仍然记录本次新增事实，但不参与该次 Harness 输入。

### 4.2 首次跨 Harness

```text
selected parent ancestry
  → canonical effective context
  → target Materializer.analyze()
  → Loss Report + context-window preflight
  → explicit confirmation when required
  → Materializer.materialize()
  → target native view validation
  → target Harness starts a new native session
  → freeze target checkpoint
  → Importer appends target canonical delta
```

### 4.3 切回祖先 Harness

```text
current parent ancestry
  → find nearest compatible target-Harness ancestor checkpoint
  → verify absorbed_context_digest belongs to current ancestry
  → calculate canonical deltas after absorbed frontier
  → NativeSessionResumer.augment()
  → validate execution-scoped writable view
  → execute and freeze a new checkpoint
```

不得修改祖先 checkpoint，也不得吸收兄弟分支事件。

## 5. Authority 模型

### 5.1 复用现有 TurnExecutionLink

已经落地的 set-once provenance 不再复制为第二套可写字段：

```text
parent_execution_id
input_session_ref
output_native_session_ref
workspace_input_ref
workspace_output_ref
```

未来 `SessionExecutionNode` 应当以这些字段和现有 Turn/Run/Binding facts 为底座扩展，
或作为只读 projection；禁止建立两个可以各自修改 parent/input/output Ref 的 authority。

### 5.2 新增的 Session Store authority

建议逻辑实体：

```text
session_branches
  session_id
  branch_id
  name
  head_execution_id
  created_from_execution_id
  version

session_execution_nodes
  session_id
  execution_id
  turn_id
  branch_id
  binding_digest
  canonical_delta_ref
  canonical_delta_digest
  ancestry_digest
  context_mode
  loss_report_ref
  committed_at

native_session_checkpoints
  checkpoint_id
  session_id
  execution_id
  harness_type
  harness_version
  native_format_version
  profile_ref_json
  native_bundle_ref_json
  continuation_locator_ref_json
  manifest_digest
  content_digest
  absorbed_path_head_execution_id
  absorbed_context_digest

canonical_execution_deltas
  delta_id
  session_id
  execution_id
  parent_execution_id
  schema_version
  records_ref
  digest
  record_count

branch_compaction_checkpoints
  compaction_id
  session_id
  branch_id
  source_head_execution_id
  source_ancestry_digest
  effective_context_ref
  effective_context_digest
  provenance_ref
```

最终表名由 Phase 1 schema review 确认，但 authority、唯一性和不可变性不能改变。

### 5.3 Canonical Record

Canonical Record 至少表达：

- user/assistant/system 可见消息；
- tool request/result 及其关联；
- permission 请求与裁决；
- attachment/resource Ref；
- workspace/file-change Ref；
- usage/cost（来源提供时）；
- error/cancel/interrupt/terminal；
- compact 操作；
- Harness/Profile/Model/Execution 来源；
- `native_original_ref`，只指向来源 Harness 原始记录，不内联敏感 blob。

记录 append-only。修正通过新记录表达，不 UPDATE 历史 payload。

### 5.4 Native checkpoint

一个 checkpoint 是逻辑完整的原生会话包，可以包含 JSONL、SQLite、WAL、索引和
metadata，不等于一个文件。

要求：

- execution-scoped view 在运行时可写；
- terminal drain 和 Importer 完成后才能冻结；
- 冻结 Ref exact、immutable、digest-addressed；
- credential、auth cache、socket、lock、device 和不安全 symlink 不进入 checkpoint；
- 未知 native schema fail closed；
- 不能安全排除 credential 的 Harness 不获得 checkpoint admission；
- Profile native home 不被复制成第二个 Session Profile authority。

## 6. 三个 Harness-owned SPI

旧 `HarnessSessionCodec` 保持未接线，拆为三个单向职责。

### 6.1 NativeSessionImporter

```python
class NativeSessionImporter(Protocol):
    harness_type: str

    def probe(self, request: ImportProbeRequest) -> ImportProbeResult: ...
    def read_delta(self, request: NativeDeltaRequest) -> NativeDeltaBatch: ...
    def decode(self, batch: NativeDeltaBatch) -> CanonicalExecutionDelta: ...
    def validate_import(self, result: CanonicalExecutionDelta) -> ValidationResult: ...
```

- 只读来源 native 增量并转换为 canonical delta；
- 不写 Session Store；
- 不读取 credential；
- 支持 cursor/idempotency；
- 未识别字段通过受保护 Native Original Ref 保留，不伪造公共语义。

### 6.2 NativeContextMaterializer

```python
class NativeContextMaterializer(Protocol):
    harness_type: str

    def probe(self, request: MaterializationProbeRequest) -> ProbeResult: ...
    def analyze(self, request: ContextMaterializationRequest) -> LossReport: ...
    def materialize(self, request: ContextMaterializationRequest) -> NativeSessionView: ...
    def validate(self, view: NativeSessionView) -> ValidationResult: ...
```

- 只从冻结 canonical ancestry 生成 execution-scoped target view；
- 不修改来源 checkpoint；
- `analyze()` 必须是纯函数或只读操作；
- materialization 前必须有 Loss Report 和 context-window 结果；
- 不支持的 canonical record 不能静默丢弃。

### 6.3 NativeSessionResumer

```python
class NativeSessionResumer(Protocol):
    harness_type: str

    def probe(self, request: ResumeProbeRequest) -> ResumeProbeResult: ...
    def resume(self, request: ResumeRequest) -> NativeSessionView: ...
    def augment(self, request: ResumeAugmentRequest) -> NativeSessionView: ...
    def validate(self, view: NativeSessionView) -> ValidationResult: ...
```

- `resume()`：同 Harness direct resume；
- `augment()`：基于祖先 checkpoint 补入未吸收 canonical delta；
- 不支持 augment 时可以声明 full materialization，但不得静默改成摘要 prompt；
- continuation compatibility 必须由 Harness 实现声明，Studio 不猜。

## 7. Session 事务状态

建议在现有 Turn transaction 上增量扩展，不平行创建第二个无关状态机：

```text
NODE_PREPARED
→ BINDING_FROZEN
→ CONTEXT_PREFLIGHTED
→ NATIVE_VIEW_READY
→ DISPATCH_REQUESTED
→ DISPATCH_ACCEPTED
→ RUNNING
→ NATIVE_IMPORT_STAGED
→ OUTPUT_REFS_FROZEN
→ EXECUTION_TERMINAL
→ NODE_COMMITTED
→ BRANCH_HEAD_MOVED
```

不变量：

1. parent、branch expected head 和 writer lease 在事务内重验；
2. Binding 冻结后不能更换 Harness/Profile/Workspace/context mode；
3. branch head 只指向 committed node；
4. head move 使用 CAS；CAS 失败不回滚已提交 node；
5. native import、canonical delta、checkpoint 和 terminal 具有明确 write-ahead intent；
6. response loss 通过 request digest/exact read 重放；
7. dispatch ambiguous 与 import ambiguous 进入 `RECOVERY_REQUIRED`；
8. 任何失败不得修改父节点、祖先 checkpoint 或兄弟 branch；
9. cleanup failure 只产生诊断，不改写已经证明的 commit；
10. set-once provenance 冲突永远不能被日志吞掉后继续提交。

## 8. 分阶段实施计划

每个 Phase 都必须先写反例测试，再改产品代码；必须独立形成可 review checkpoint。
Goal 模式可以持续推进，但不得跨越本节列出的 Human Gate。

### Phase 0：基线、事实审计与 schema preflight

目标：在 clean、已合并的 Agent-Box main 上确认所有前置事实。

工作：

- 记录 branch/base/status/plugin inventory/schema version；
- 重跑 Session/Studio/Harness/native integration 基线；
- 核对五家 native session 事实与证据文档；
- 审计现有 `HarnessSessionCodec` 零调用；
- 输出旧字段复用/新增字段/migration ledger；
- 明确 native blob 是否可安全复用 `agent-box-artifacts`；不能满足访问控制时，设计
  `agent-box-session` 内部 protected blob component。

Human Gate 0：确认 schema/authority ledger，才进入 Phase 1。

### Phase 1：Execution Tree 与 Branch authority

目标：先完成不依赖任何 native Codec 的树和分支。

工作：

- 扩展中立 Session DTO；
- 在 Session Store 增加 node/branch schema 和显式 migration；
- 将现有线性 Session 映射为 default branch；
- `parent_execution_id` 继续复用现有 set-once fact；
- branch create/select/rename/head CAS；
- ancestry 查询和 digest；
- 从当前 head 线性继续；
- 从历史节点创建 sibling branch；
- live workspace 精确 fork capability 如实为 unavailable；
- tree/branch exact read API；
- crash、CAS、response loss、cross-session isolation 测试。

验收：

- E1→E2→E3 与 E1→E4 两个分支可持久化、重启恢复；
- E4 看不到 E2/E3 的 ancestry；
- branch head 永不指向未提交节点；
- 不实现跨 Harness materialization。

Human Gate 1：人工审 node/branch authority 和 migration。

### Phase 2：Canonical ledger 与 Native checkpoint foundation

目标：建立公共历史和原生 checkpoint 的安全持久层，但先不做目标 Harness 写入。

工作：

- CanonicalRecord/CanonicalExecutionDelta DTO；
- append-only delta store、digest、record count、exact read；
- Native Original 受保护 Ref；
- checkpoint manifest/digest/admission；
- execution-scoped native view 生命周期；
- credential/path/symlink/special-file 排除策略；
- ancestry-based effective history；
- sibling branch isolation；
- transaction/recovery/GC retention 基础。

验收：

- synthetic native delta 可以冻结 checkpoint 并导入 canonical delta；
- 同一 Execution 重放幂等；不同内容冲突；
- checkpoint 不含 credential 或宿主路径；
- global event seq 不能被用来选择 branch context。

Human Gate 2：审安全模型和 protected blob authority。

### Phase 3：Importer + 五家同 Harness direct resume

目标：证明五家都能冻结自己的原生输出，并从自己的 checkpoint 官方 resume。

顺序：Pi → Codex → Claude Code → OpenCode → Hermes。顺序只表示实施风险，不表示
产品优先级。

每家必须独立完成：

- native schema/version probe；
- bounded read/import cursor；
- Importer decode + Native Original capture；
- checkpoint manifest；
- Resumer.resume；
- Profile/executable/native-format compatibility；
- direct resume 不读取 canonical history 的反例测试；
- session locator 与 bundle/checkpoint identity 一致性；
- synthetic/offline native fixture；
- 可选真实 CLI `--help/--version` probe，不发模型请求。

验收场景：

```text
Harness A E1 → Harness A E2 → Harness A E3
```

- E2/E3 使用官方 resume；
- canonical ledger 仍增加 delta；
- input Ref 精确等于父 committed Execution 的 output Ref/checkpoint；
- E1/E2 checkpoint 不被修改。

Human Gate 3：五家 admission matrix 逐家签字；UNKNOWN 不得标 READY。

### Phase 4：双 Harness vertical

目标：先用两家完成真实跨 Harness 架构，不同时铺开五家。

建议组合：Codex → Claude Code → Codex。若事实审计证明另一组合的 native format 更
适合首个安全 vertical，可在 Gate 3 明确调整，但不得静默换目标。

工作：

- Materializer SPI 正式接线；
- canonical ancestry → target native view；
- Loss Report schema、severity、blocking reason；
- context-window preflight；
- `CANONICAL_MATERIALIZED` context mode；
- 切回来源 Harness 时使用 compatible ancestor checkpoint + augment；
- absorbed frontier/path digest；
- target view structure validation；
- Studio preflight/confirm token；
- 分支隔离。

验收：

```text
Codex E1 → Claude E2 → Codex E3
```

- E2 只读取 E1 ancestry；
- E2 前生成 Loss Report；
- E3 复用 E1 Codex checkpoint，只补 E1→E2 delta；
- E1 checkpoint 不变；
- 从 E1 再开 OpenCode/synthetic sibling 时看不到 E2/E3；
- blocking loss 不 dispatch。

Human Gate 4：人工查看实际 canonical/native fixtures 和 Loss Report，不只看测试数。

### Phase 5：五 Harness materialization admission

目标：把 Phase 4 的已验证架构逐家适配，而不是修改公共架构迎合某一家。

每家分别交付：

- Materializer capability truth；
- supported canonical record matrix；
- private/unrepresentable field policy；
- context-window estimator；
- Loss Report golden；
- native view golden；
- resume/augment/full-materialize 决策；
- version drift tests；
- failure taxonomy；
- A→B、B→A 和 branch sibling tests。

任何一家未通过只能标 `UNAVAILABLE`/`NOT_IMPLEMENTED`，不能降低整个协议的安全
要求，也不能用普通 prompt fallback 冒充 native materialization。此时可以形成诚实的
阶段性 checkpoint，但 Phase 5 和整个 Goal 均不得标记 complete；必须等待补齐该家
能力或由用户明确修改产品范围。

Human Gate 5：五家 capability truth 与 fidelity matrix 审核。

### Phase 6：Branch-scoped compact

目标：支持有效上下文缩短，同时保留完整历史。

工作：

- compaction checkpoint DTO/store；
- source branch/head/ancestry digest 绑定；
- effective context projection；
- Harness native compact adapter（仅支持者）；
- 非原生 compact 的显式、可审计策略；
- 超窗 preflight；
- compact 前节点分叉不继承后续 compact；
- sibling branch isolation；
- complete audit export。

默认禁止自动调用模型生成摘要。若未来要增加 model-assisted compact，必须另立能力、
成本、模型选择和审计设计，不属于本 Phase 的隐含权限。

Human Gate 6：审 compact 语义和完整历史不丢失证据。

### Phase 7：Studio API 与后端产品闭环

目标：向前端提供稳定、无厂商细节泄漏的 Session/Tree/Preflight API。

建议 API：

```text
GET  /api/v1/sessions/{session_id}/tree
GET  /api/v1/sessions/{session_id}/branches
POST /api/v1/sessions/{session_id}/branches
POST /api/v1/sessions/{session_id}/branches/{branch_id}/select
GET  /api/v1/sessions/{session_id}/executions/{execution_id}
POST /api/v1/sessions/{session_id}/turns/preflight
POST /api/v1/sessions/{session_id}/turns
POST /api/v1/sessions/{session_id}/compact/preflight
POST /api/v1/sessions/{session_id}/compact
GET  /api/v1/sessions/{session_id}/recovery
```

要求：

- REST/WS 共用认证；
- preflight 返回 context mode、Loss Report、workspace fork capability、Binding summary；
- 从非 head 继续且 `fork_if_not_head=false` 时拒绝；
- WS replay/gap 与 committed ledger 一致；
- public DTO 不暴露宿主绝对路径、native secret locator 或 credential；
- API 无 `if harness == ...` 业务分支。

Human Gate 7：冻结 API contract 后，才允许前端正式换绑。

### Phase 8：Agent-Box Studio 前端接入

该 Phase 在 `/home/maoqh/projects/agent-box-studio` 的独立 clean 分支/worktree 执行，
不能与后端 schema 开发混在同一 dirty workspace。

目标：保留现有产品 UI 与 UI-1 视觉方向，接入新的后端能力。

工作：

- Transport/Domain Ports 增加 tree/branch/preflight/compact；
- Conversation 默认仍保持安静；
- Execution Tree 放在按需 Aux panel；
- Delegation 独立 tab，不与 Execution Tree 混淆；
- 选择历史节点只显示信息条，发送消息是唯一主动作；
- 同 Harness 显示“原生继续”；
- 跨 Harness 显示“从公共历史转换”及 Loss Report；
- live workspace 无 exact fork 时明确阻止；
- Terminal/Binding/StatusBar 的未冻结视觉细节按独立 UI checkpoint 处理；
- 不恢复已删除的 Codeg backend 业务 fallback。

验收：

- 默认会话不常驻展示树、Binding 明细或统计卡；
- 用户可从 E2 选择父节点并在发送时创建新分支；
- 原分支可继续选择；
- 390px、1024px、1440px、light/dark、150% 可用；
- keyboard/a11y/console/overflow/WS reconnect 全部验证。

Human Gate 8：真实产品截图与交互验收。

### Phase 9：系统级收口

目标：证明整个设计可以发布，而不是只证明各模块单测。

工作：

- Root + 全部官方 plugin wheels；
- root-only clean venv；
- preview clean venv discovery/doctor；
- v1/v2/v3/... schema upgrade chain；
- process crash、response loss、lease conflict、branch CAS、import ambiguity；
- native capability unavailable truth；
- five-Harness synthetic vertical；
- 有明确授权时再做真实 credential/model smoke；
- desktop/server/Docker；
- frontend lint/test/build/browser；
- secret/path/bundle scan；
- current docs/decision ledger；
- staged-file ledger 和人工 checkpoint。

## 9. Goal 模式运行方式

### 9.1 Goal objective

启动 Goal 模式时使用一个具体 objective，不设置虚假的“一次完成全部”口号：

```text
Implement the approved Execution Tree and cross-Harness continuous-session
program phase by phase, preserving Work Core boundaries and stopping at every
human gate. Begin from Phase 0 on the clean post-backend-checkpoint main branch.
```

除非用户明确给出 token budget，否则不要自行设置 budget。

### 9.2 主代理职责

主代理始终负责：

- 完整阅读本文件和 canonical 产品设计；
- 维护当前 Phase、事实表、修改范围和验收清单；
- 决定 schema/transaction/authority；
- 处理跨模块接口；
- 合并子代理结果；
- 运行最终测试；
- 在 Human Gate 停止并请求人工裁决；
- 只有目标真正完成且无剩余必需工作时才将 Goal 标为 complete。

主代理不得把“读架构文档并决定含义”整体外包给子代理。

### 9.3 子代理通用规则

最多同时运行三个子代理（主代理占一个并发槽）。只有相互独立、文件范围不重叠的
任务才并行。

每个子代理任务必须包含：

```text
- 当前 Phase 和明确交付物
- 可修改的精确目录/文件类别
- 禁止修改的目录
- 需要先写的 RED tests
- 必须保持的 authority/invariant
- 验证命令
- 不得 add/commit/push/merge
- 完成时报告 changed files、tests、assumptions、remaining risks
```

共享工作树规则：

- 子代理的修改会立即对所有代理可见；
- 不允许两个代理同时修改同一文件；
- schema.py、store.py、service orchestrator 和公共 protocol `__init__` 默认由主代理
  单写；
- 子代理不得 reset/restore/clean 其他代理的变更；
- 子代理发现需要越界时，只报告，不自行扩大范围；
- read-only auditor 不得修代码；
- 主代理在采纳结果前必须亲自 review diff 和重跑测试。

### 9.4 各 Phase 推荐派发

#### Phase 0

- 子代理 A：只读五 Harness native facts/admission audit；
- 子代理 B：只读 Session schema/transaction gap audit；
- 子代理 C：只读 wheel/CI/API surface inventory；
- 主代理：authority ledger 与最终 Phase 1 方案。

#### Phase 1

- 主代理：schema、migration、Store transaction、branch CAS；
- 子代理 A：protocol DTO/failure/conformance tests，避免修改 Store；
- 子代理 B：tree/branch API tests 与 adversarial fixtures；
- 子代理 C：只读 crash/isolation review。

#### Phase 2

- 主代理：canonical/checkpoint authority 与事务；
- 子代理 A：canonical DTO/golden tests；
- 子代理 B：native bundle safety scanner/fixture tests；
- 子代理 C：只读 secret/path/recovery audit。

#### Phase 3

先固定共享 SPI，再派发，禁止五家各自修改 SPI：

- 子代理 A：Pi + Codex Importer/Resumer 与独立测试目录；
- 子代理 B：Claude + OpenCode；
- 子代理 C：Hermes + cross-Harness-neutral conformance tests；
- 主代理：共享 SPI、Registry、Composer、集成与五家 parity。

若文件结构导致范围重叠，改为分批串行，不为追求并行强行共享文件。

#### Phase 4

- 主代理：Materializer orchestration、Loss Report authority、Studio preflight；
- 子代理 A：Codex materializer/golden；
- 子代理 B：Claude materializer/golden；
- 子代理 C：只读 Codex→Claude→Codex fidelity/adversarial audit。

#### Phase 5

- 子代理 A：OpenCode admission；
- 子代理 B：Hermes admission；
- 子代理 C：Pi admission；
- 主代理：公共 conformance、capability truth、cross-pair matrix。

#### Phase 6

- 主代理：compaction authority/store/transaction；
- 子代理 A：effective context projection tests；
- 子代理 B：Harness native compact capability audit；
- 子代理 C：branch isolation/retention adversarial tests。

#### Phase 7

- 主代理：API contract 与 Studio service integration；
- 子代理 A：REST handlers/DTO tests；
- 子代理 B：WS replay/reconnect tests；
- 子代理 C：auth/path/secret/capability audit。

#### Phase 8

在前端仓库另开 Goal 或在后端 Goal 完成后切换，不允许两个仓库无 checkpoint 并行写：

- 主代理：Domain Ports、真实数据流、最终 UI integration；
- 子代理 A：Execution Tree/Aux panel；
- 子代理 B：preflight/Loss Report/composer state；
- 子代理 C：Playwright/a11y/responsive，只在测试与 fixture 范围工作。

### 9.5 子代理提示词模板

```text
You are sub-agent <name> working on Phase <N> of
EXECUTION_TREE_CROSS_HARNESS_IMPLEMENTATION_PROGRAM.md.

Read the canonical design sections referenced by the parent, but do not make
architecture decisions outside this task.

Deliverable: <one bounded deliverable>.
Allowed edits: <exact directories/files>.
Forbidden edits: <schema/store/service/core/etc.>.

Work test-first:
1. add the specified failing tests;
2. show that they fail for the expected reason;
3. implement only the bounded fix if implementation is authorized;
4. run the specified tests.

Preserve these invariants: <list>.
Do not run git add/commit/push/merge/reset/clean/checkout/stash.
Do not read credentials or make model requests.
Do not overwrite other agents' changes.

Return: findings, changed files, RED evidence, GREEN evidence, assumptions,
unresolved risks. If the task requires an out-of-scope edit, stop and report it.
```

## 10. 测试策略

### 10.1 Test-first

每个 Phase：

1. 先写反例；
2. 在旧实现上确认 RED；
3. 保存失败原因摘要；
4. 实现最小修复；
5. 同一测试 GREEN；
6. 跑完整受影响套件；
7. 再跑 clean-wheel/integration；
8. 不允许删除断言、吞异常或用 skip 代替修复。

### 10.2 必须长期保留的反例

- 跨 Session 读取/写入 Execution facts；
- migration 跳级、停滞、中途崩溃；
- 非 committed Execution 冒充 continuation parent；
- set-once 多字段部分写入；
- branch head CAS 丢失更新；
- global seq 污染 sibling ancestry；
- stale/foreign checkpoint 被 resume；
- native schema drift；
- credential 混入 checkpoint；
- symlink/traversal/special file；
- materialization blocking loss 后仍 dispatch；
- response loss 重复创建 node；
- import cursor 重放产生重复 canonical record；
- compact 泄漏到兄弟分支；
- live workspace 冒充 exact fork；
- output provenance 写入失败后仍 commit。

### 10.3 真实 Harness 测试边界

默认允许：

- synthetic native fixtures；
- fake/offline Harness executable；
- `--help`、`--version` 和隔离 HOME probe；
- 无 credential 的协议握手；
- bwrap/tmux capability probe。

默认禁止：

- 读取用户真实 credential；
- 发真实模型请求；
- 修改用户真实 Harness home/session；
- 把开发者 HOME 路径写入 fixture/report。

真实 credential/model smoke 必须用户单独授权，并使用隔离 Profile、成本上限和明确的
测试请求。

## 11. 每阶段验证基线

根据实际仓库命令调整，但至少覆盖：

```text
pytest -q tests
pytest -q plugins/agent-box-session/tests
pytest -q plugins/agent-box-studio/tests
pytest -q plugins/agent-box-harnesses/tests
pytest -q plugins/agent-box-workspace-local/tests
pytest -q tests/integration/native
python -m compileall
git diff --check
```

涉及前端时：

```text
pnpm eslint .
pnpm test
pnpm build
Playwright real-route fixtures
```

涉及发布面时：

- Root + 全部官方 plugin wheels；
- root-only clean install；
- preview clean install；
- plugin discovery/inspect/doctor；
- API v2 incompatible plugin test；
- public path/secret scan；
- wheel contents scan；
- CI matrix 与 wheel 数量一致。

## 12. Human Gate 汇报模板

每个 Phase 完成后必须报告：

1. Verdict；
2. branch/base/HEAD；
3. 开工前与当前 dirty 状态；
4. 本 Phase 用户可感知能力；
5. authority/schema/module tree；
6. RED tests 与原始失败原因；
7. 实现策略；
8. transaction/crash/recovery 结果；
9. security/credential/path 结果；
10. capability truth；
11. 定向与完整测试；
12. wheel/clean install/discovery/doctor；
13. Work Core diff；
14. 未实施内容；
15. exact modified files；
16. git operations；
17. remaining limitations；
18. 下一 Phase proposal；
19. READY / NOT READY FOR HUMAN GATE。

不得只报告测试数量。必须附最关键的反例、真实数据流和边界证据。

## 13. 全计划完成定义

只有同时满足以下条件，Goal 才能标记 complete：

1. Execution Tree/branch 持久化、重启和 CAS 正确；
2. 五家同 Harness direct resume 使用官方原生 checkpoint；
3. 五家 public canonical delta 都有明确 admission/capability truth；
4. 至少 Codex→Claude→Codex 完成跨 Harness vertical；
5. 五家 Materializer 全部 READY；任一家仅被门控为 unavailable 时只能报告阶段性
   NOT READY，不能把全计划标记 complete；
6. sibling branch 上下文严格隔离；
7. live workspace 不冒充 exact history fork；
8. branch-scoped compact 不删除完整历史；
9. Studio REST/WS contract 稳定；
10. 前端可以查看树、选择父节点、发送创建分支、查看 Loss Report；
11. Work Core ontology/schema/migrations 零业务扩张；
12. credential/native private data 不泄漏；
13. crash/response-loss/recovery 反例全部通过；
14. wheels、clean install、discovery、doctor、frontend/browser、native tests 通过；
15. current canonical docs 与实际实现一致；
16. 所有 Human Gate 完成人工确认；
17. 完成 staging/commit/CI/merge 仍由用户单独授权，Goal 实现过程不自行执行。

## 14. 明确非目标

本 program 不隐含实现：

- 多父 Execution merge；
- 自动合并分支或 workspace；
- 同一 Session 多 branch 并发写；
- 自动选择“最佳 Harness/分支”；
- 任意 Harness 间字节级无损；
- 隐藏摘要 handoff；
- live workspace 历史快照伪造；
- Session graph 进入 Work Core；
- MCP Resource；
- 多人实时协作；
- 远程分布式 lease；
- 自动成本优化或 Agent 评测产品层。

这些能力未来可以组合在 Execution/Branch 基础之上，但不能借本计划偷偷进入当前
实现范围。
