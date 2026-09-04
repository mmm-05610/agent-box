# Execution Tree 与跨 Harness 连续会话设计

> 状态：核心产品裁决完成，READY FOR IMPLEMENTATION REVIEW
>
> 本文取代
> [`SESSION_HARNESS_SEPARATION.md`](./SESSION_HARNESS_SEPARATION.md) 中“每轮都从
> Official Session 重建目标原生 Session”以及“Session 只有一条线性有效上下文”的
> 设计。旧文档保留为决策演进记录，不再作为 Session 执行链的 canonical authority。
>
> 本文不要求修改 Work Core ontology、schema 或 migrations。

## 1. 产品目标

Agent-Box Studio 中，一个 Session 是一棵可继续、可分叉的 Execution Tree。

用户可以：

1. 在同一 Harness 中使用官方原生 resume 连续工作；
2. 从任意已完成 Execution 继续，而不删除其原有后继分支；
3. 在新分支中选择另一种 Harness；
4. 对跨 Harness 转译结果不满意时，回到原节点另开分支；
5. 保留每次 Execution 完成时冻结的原生 Session 事实；
6. 在 Studio 中查看跨 Harness 的统一公共历史。

本设计不把不同 Harness 的原生 Session 强行变成同一种可双向同步的文件。它采用
非对称数据流：

```text
来源 Harness 原生增量
        │
        │ NativeSessionImporter（始终静默导入）
        ▼
Official Canonical History
        │
        │ 仅在跨 Harness 或原生 checkpoint 不兼容时读取
        ▼
NativeContextMaterializer / NativeSessionResumer
        │
        ▼
目标 Harness 的 execution-scoped 可写 Session View
```

## 2. 固定裁决

以下内容是实施约束，不是留给实现者自行选择的建议。

1. Work Core 保持不变，继续负责 Binding、Freeze、Dispatch、Execution 和
   Finalization。
2. Execution Tree、父子关系、branch head、公共历史和 native Session checkpoint
   由 `agent-box-session` 插件持久化。
3. Harness 原生格式知识只存在于 `agent-box-harnesses`。
4. Studio 只选择父节点、Harness、Profile、Model 和其他 Binding 输入，不解析厂商
   Session 文件。
5. 每个 Execution 最多有一个父 Execution；第一版是树，不实现多父合并 DAG。
6. 创建兄弟分支不会删除、回滚或覆盖已有分支。
7. 每次 Execution 完成后，其成功导入的 native Session checkpoint 不可变。
8. “一个 checkpoint”是逻辑上的完整可恢复原生会话包，不要求厂商只使用一个文件。
9. 同 Harness 且 checkpoint 兼容时，直接使用官方原生 resume；公共历史不参与该次
   Harness 输入。
10. 每次 Execution 的新增事实都静默导入公共历史，无论之后是否发生 Harness
    切换。
11. 公共历史作为 Harness 输入只发生在跨 Harness、切回较早 Harness，或原生
    checkpoint 无法直接 resume 时。
12. 目标 Harness 永远看不到当前父节点祖先路径之外的兄弟分支内容。
13. 不在两个 Harness 原生格式之间直接转换。
14. Workspace 状态继续由 Workspace/Git provider 通过 Ref 表达；Session Store 不再
    实现第二套文件版本控制。
15. compact 只改变当前分支后继节点使用的有效上下文，不影响兄弟分支，也不删除
    完整审计历史。
16. 未知 native schema、未准入 writer、blocking loss 和不可证明的恢复状态全部
    fail closed。

## 3. 三种不同的历史

### 3.1 全局审计日志

全局审计日志 append-only，记录一个 Session 内发生过的所有操作：

- Execution 创建、开始、事件和终态；
- branch 创建和 head 移动；
- Binding 与 Ref 身份；
- native import、materialization、compact 和恢复；
- 用户确认的 Loss Report；
- 被放弃但未删除的分支。

全局 `seq` 只表示事件发生顺序。它不能决定某个 Harness 应该读取哪些上下文，因为
全局顺序可能交错包含兄弟分支。

### 3.2 Execution 祖先路径

某个节点的上下文由其唯一祖先路径决定：

```text
E1 ── E2 ── E3
       ├──── E4 ── E5
       └──── E6
```

从 `E5` 继续时，只能读取 `E1 → E2 → E4 → E5`。`E3` 和 `E6` 虽存在于全局审计
日志，但不属于该路径的上下文。

### 3.3 Harness 原生历史

每个 Execution 保存其来源 Harness 的 native checkpoint。它是该 Harness 实际产生
的原生事实，用于：

- 同 Harness 官方 resume；
- 原生字段保真；
- 版本验证和故障恢复；
- 将来回到该 Harness 时选择可兼容的最近祖先 checkpoint。

它不是 Official Canonical History 的替代品，也不要求其他 Harness 理解。

## 4. Execution Node

Session Store 为每个 Work Core Execution 保存一个不可变节点事实：

```python
@dataclass(frozen=True)
class SessionExecutionNode:
    session_id: str
    execution_id: str
    turn_id: str
    parent_execution_id: str | None
    branch_id: str

    frozen_binding_ref: Ref
    binding_digest: str

    workspace_input_ref: Ref
    workspace_output_ref: Ref | None
    input_native_session_ref: Ref | None
    output_native_session_ref: Ref | None

    canonical_delta_ref: Ref | None
    canonical_delta_digest: str | None
    absorbed_path_head_execution_id: str | None
    absorbed_context_digest: str | None

    terminal_outcome: str | None
    committed_at: str | None
```

约束：

- `execution_id` 引用 Work Core 已存在的 Execution，不由 Session Store 伪造生命周期；
- `parent_execution_id` 必须属于同一 Session；
- 父节点必须在新节点 dispatch 前冻结；
- 节点提交后不能改父节点、Binding、输入 Ref 或输出 Ref；
-失败和取消节点仍保留，但只有具备可验证输出 Ref 的节点才能作为相应能力的父输入；
- 同一父节点可以拥有多个子节点；
- Session Store 不复制 Workspace 内容，只保存 provider 产生的 exact Ref。

## 5. Branch

Branch 是指向 Execution Tree 中某个 head 的可移动命名引用：

```python
@dataclass(frozen=True)
class SessionBranch:
    session_id: str
    branch_id: str
    name: str
    head_execution_id: str | None
    created_from_execution_id: str | None
    version: int
```

### 5.1 线性继续

在当前 branch head 上创建子 Execution。子节点提交后，用 CAS 把该 branch head 从
父节点移动到子节点。

### 5.2 从历史节点分叉

从非当前 head 的历史节点继续时：

1. 创建新 `branch_id`；
2. `created_from_execution_id` 指向所选历史节点；
3. 新 Execution 的 `parent_execution_id` 指向该节点；
4. 新 branch head 在子节点提交后指向新节点；
5. 原 branch 和其所有节点保持不变。

### 5.3 第一版并发

数据模型允许多 branch，但第一版仍保持一个 Session 同时一个写 Execution。不同
branch 并行执行属于后续调度能力；不得因为数据模型是树就提前宣称支持并行写入。

## 6. Workspace Ref

Execution Tree 不拥有 Workspace 文件版本。

```text
父节点 workspace_output_ref
        │
        ▼
Workspace Provider resolve/materialize
        │
        ▼
子节点 workspace_input_ref
```

### 6.1 Managed/Git Workspace

当 `workspace_output_ref` 是 exact、immutable、可重新物化的 Git/Workspace Ref 时，
用户可以真正从任意历史节点创建独立工作分支。commit、tree、worktree、capture 和
冲突语义全部由现有 provider 负责。

### 6.2 Live Workspace

`local-live-workspace` 是 externally mutable/unfrozen。它可以形成 Execution Tree 的
会话关系，但不能声称从历史节点精确恢复当时的文件状态。

因此：

- 线性快速执行可以继续使用 live workspace；
- “从历史节点精确分叉代码状态”要求父节点具有可物化的 exact
  `workspace_output_ref`；
- 若只有 live Ref，preflight 必须显示 `workspace_fork=UNAVAILABLE`，不得把当前
  磁盘目录冒充历史状态；
- 用户可以显式将 live 项目捕获为 Git/managed Ref 后再分叉；
- Session Store 不自行复制目录、生成 patch 或实现 Git。

## 7. Native Session Checkpoint

每次 Execution 的来源 Harness 完成写入后，Harness 插件冻结其原生会话：

```python
@dataclass(frozen=True)
class NativeSessionCheckpoint:
    checkpoint_id: str
    session_id: str
    execution_id: str
    harness_type: str
    harness_version: str
    native_format_version: str
    codec_version: str
    profile_ref: Ref
    native_bundle_ref: Ref
    continuation_locator_ref: Ref | None
    manifest_digest: str
    content_digest: str
    absorbed_path_head_execution_id: str | None
    absorbed_context_digest: str
```

### 7.1 冻结规则

- Harness 运行期间只写 execution-scoped mutable view；
- terminal drain 和最终 import 完成后才能冻结 checkpoint；
- 冻结对象不可再次作为可写目录挂载；
- 子 Execution 使用 copy-on-write view 或 Harness 官方 fork/resume 机制；
- checkpoint 可以物理去重，但 Ref 语义必须 immutable/exact；
- native bundle 可能包含多个文件、SQLite 数据库、JSONL、索引和 metadata；
- credential 内容不得进入 checkpoint；
- 如果厂商把 credential 混入不可分离的 Session 文件，该格式不能获得持久化准入。

### 7.2 checkpoint 与 Profile

checkpoint 记录创建它时的 exact Profile Ref，但不复制 Profile native home。恢复时
必须再次验证：

- Harness 类型；
- Profile continuation compatibility；
- Harness/native schema version；
- executable identity；
- credential locator 可用性，但不读取 credential 内容。

默认只有 exact Profile continuation-compatible 才允许原生 resume。扩大兼容范围必须
由具体 Harness Resumer 明确声明和测试，不能由 Studio 猜测。

## 8. 公共历史的写入与读取

### 8.1 每次执行后都写入

公共历史始终静默记录每个 Execution 的新增公共语义：

```text
native execution delta
    ├── freeze NativeSessionCheckpoint
    └── NativeSessionImporter → CanonicalExecutionDelta
```

它用于：

- Studio transcript；
- 搜索、审计和诊断；
- 跨 Harness materialization；
- 分支路径重建；
- compact 输入；
- 后续统计和恢复。

### 8.2 同 Harness 不读取

若直接父节点满足：

- 相同 Harness；
- checkpoint 已冻结并通过验证；
- Profile/native format/executable continuation-compatible；
- checkpoint 的 `absorbed_context_digest` 等于父节点路径的有效上下文 digest；

则使用 `NATIVE_DIRECT_RESUME`：

```text
parent.output_native_session_ref
        │
        ▼
NativeSessionResumer
        │
        ▼
child mutable native view
```

该路径不从公共历史生成 prompt，也不重写历史原生消息。

### 8.3 跨 Harness 时读取

目标 Harness 与父节点不同时，使用以下两种路径之一。

#### A. 复用目标 Harness 的祖先 checkpoint

在当前祖先路径上寻找最近的 compatible target-Harness checkpoint：

```text
Codex E1 → Claude E2 → Claude E3 → 切回 Codex E4
```

E4 可以以 E1 的 Codex checkpoint 为原生基底，并把 `E1` 之后、当前父节点 `E3`
路径上的公共增量通过 Materializer/Resumer 注入新的 Codex view。E1 本身保持冻结。

#### B. 生成新的目标 Harness Session

若不存在可兼容 checkpoint，则从所选父节点的有效祖先公共历史生成一个新的目标
Harness Session view。

两种路径都属于跨 Harness 操作，必须执行 Loss Report、版本 probe、窗口检查和完整
view validation。

## 9. 三个 Harness-owned SPI

原来的对称 `HarnessSessionCodec` 拆成三个职责单一的 SPI。

### 9.1 NativeSessionImporter

```python
class NativeSessionImporter(Protocol):
    harness_type: str

    def probe(self, request: ImportProbeRequest) -> ImportProbeResult: ...
    def read_delta(self, request: NativeDeltaRequest) -> NativeDeltaBatch: ...
    def decode(self, batch: NativeDeltaBatch) -> CanonicalExecutionDelta: ...
    def validate_import(self, result: CanonicalExecutionDelta) -> ValidationResult: ...
```

只负责“来源原生事实 → 公共语义”，不得写 Official Session Store。

### 9.2 NativeContextMaterializer

```python
class NativeContextMaterializer(Protocol):
    harness_type: str

    def probe(self, request: MaterializationProbeRequest) -> ProbeResult: ...
    def analyze(self, request: ContextMaterializationRequest) -> LossReport: ...
    def materialize(self, request: ContextMaterializationRequest) -> NativeSessionView: ...
    def validate(self, view: NativeSessionView) -> ValidationResult: ...
```

只负责“冻结公共路径 → 新的 execution-scoped target view”。不得修改来源 checkpoint。

### 9.3 NativeSessionResumer

```python
class NativeSessionResumer(Protocol):
    harness_type: str

    def probe(self, request: ResumeProbeRequest) -> ResumeProbeResult: ...
    def resume(self, request: ResumeRequest) -> NativeSessionView: ...
    def augment(self, request: ResumeAugmentRequest) -> NativeSessionView: ...
    def validate(self, view: NativeSessionView) -> ValidationResult: ...
```

- `resume()` 用于同 Harness direct resume；
- `augment()` 用于切回某 Harness 时，在兼容祖先 checkpoint 上加入其尚未吸收的公共
  增量；
- 不支持 `augment()` 的 Harness 可以退化为全量 materialization，但必须如实报告；
- 失败不能静默退化为普通摘要 prompt。

这三个 SPI 由 Root protocol pack 定义中立形状，由 Harness 插件实现具体格式。

## 10. Context Basis 与 absorbed frontier

分支存在后，不能再使用一个全局整数 watermark 表示“目标 Harness 已经读过哪里”。
兄弟分支可能拥有更大的全局事件 seq，但不属于当前上下文。

每个 committed Execution 计算：

```text
ancestry_digest = digest(
    ordered ancestor execution ids
    + each canonical delta digest
    + active branch compaction checkpoints
)
```

Native checkpoint 保存：

- `absorbed_path_head_execution_id`；
- `absorbed_context_digest`。

只有当 head 是当前父节点的祖先且 digest 验证一致时，才能计算待补充增量。不得用
`global_seq > absorbed_seq` 选择内容，否则会错误吸收兄弟分支。

## 11. Compact

compact 是 branch-scoped context operation。

```text
branch A: E1 → E2 → Compact C1 → E3
branch B: E1 → E4
```

`C1` 只影响 branch A 从该位置继续的有效上下文。branch B 仍从自己的祖先路径计算，
不会继承 C1。

约束：

- 完整公共历史和 native checkpoint 不删除；
- compact checkpoint 绑定 source branch、source head、ancestry digest 和执行者；
- 用户从 compact 之前的节点分叉时，不继承后来的 checkpoint；
- 同 Harness 官方 native compact 可以生成该分支 checkpoint 的原生证据；
- Studio 不自行调用隐藏模型摘要；
- 超窗时先返回 preflight，不静默裁剪。

## 12. Binding 组合

从父 Execution 创建子 Execution 时，上层只组合 Ref，不复制底层内容。

### 12.1 从父节点继承

- `parent_execution_id`；
- 父节点 `workspace_output_ref`，或用户显式选择的另一 exact Workspace Ref；
- 当前分支有效 ancestry；
- 可兼容的 native checkpoint；
- Session/Work identity。

### 12.2 用户重新选择

- Harness；
- Profile；
- Model/provider；
- launch mode；
- Runtime Host；
- Sandbox；
- Terminal/Session Driver；
- 本轮输入和其他 Resource Refs。

### 12.3 冻结 Binding

最终 Binding 至少冻结：

- parent node identity 和 parent facts digest；
- exact Workspace input Ref；
- context mode：`EMPTY`、`NATIVE_DIRECT_RESUME`、
  `NATIVE_AUGMENTED_RESUME` 或 `CANONICAL_MATERIALIZED`；
- input native checkpoint Ref（若有）；
- canonical ancestry/context digest；
- exact Profile revision/digest/native generation；
- Harness/provider/executable/native format/codec versions；
- Model、Runtime、Sandbox、Terminal 和 credential locator Ref；
- Loss Report/用户确认 Ref（跨 Harness时）；
- capability negotiation digest。

Work Core 只冻结和执行这些 Ref，不解释 parent、branch 或 native Session 语义。

## 13. 提交事务

一次子 Execution 的 Session 侧事务：

```text
NODE_PREPARED
→ BINDING_FROZEN
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

关键不变量：

1. parent 和 branch expected head 在 lease 内重新验证；
2. branch head 使用 CAS，不能覆盖另一个已提交子节点；
3. native import、canonical delta、output checkpoint Ref 和节点 terminal 具有明确提交点；
4. branch head 只指向 committed node；
5. `DispatchAmbiguous` 不得伪装为 FAILED；
6. 无法证明 Harness、Work Core 或 Session Store 的结果一致时进入
   `RECOVERY_REQUIRED`；
7. 已提交节点不会因 branch-head 更新响应丢失而回滚；
8. 临时 view 清理失败只产生清理诊断；
9. 重试通过 operation request digest 精确 replay；
10. 父节点和兄弟节点在任何失败窗口都不可变。

## 14. 模块职责

### 14.1 `agent_box.protocols.session`

只定义中立协议：

- Execution node、branch、checkpoint 和 ancestry DTO；
- 三个 Session SPI；
- Loss Report；
- typed Ref 和 contribution kinds；
- transaction/capability/failure vocabulary。

它不包含厂商品牌、路径、CLI 参数、SQLite schema 或 FastAPI。

### 14.2 `agent-box-session`

负责：

- Session/Work 映射；
- Execution Tree 与 branch head；
- append-only audit ledger；
- canonical execution delta 索引；
- native checkpoint Ref 索引和受保护存储策略；
- ancestry projection 和 digest；
- lease、idempotency、事务和恢复；
- exact read/query。

它不解析任何厂商原生内容。

### 14.3 `agent-box-harnesses`

负责每家 Harness 的：

- Importer、Materializer、Resumer；
- native schema/version probe；
- official resume/fork/compact 行为；
- stable identity 与结构校验；
- continuation compatibility；
- Loss Report；
- checkpoint capture 和执行 view。

### 14.4 Workspace/Git plugins

负责：

- Workspace input/output Ref；
- commit/tree/worktree/capture；
- 从 exact Ref 派生新工作空间；
- workspace 冲突与 finalization。

### 14.5 Agent-Box Studio

负责：

- 展示 Execution Tree 和 branch；
- 选择父节点；
- 收集新 Harness/Profile/Model 选择；
- 调用 preflight；
- 组合和提交新 Binding；
- 展示 Loss Report、capability truth 和 recovery；
- 更新用户当前选中的 branch/head。

Studio 不写 native Session，不执行 Git 底层操作，也不复制 Agent-Box 状态。

### 14.6 Work Core

保持现有职责：

- Work/Execution identity；
- Binding/Freeze；
- Dispatch；
- Evidence/Observation；
- Finalization。

禁止为本功能向 Work Core 增加：

- `parent_execution_id`；
- `branch_id`；
- `native_session` 字段；
- Harness 品牌字段；
- canonical transcript 字段。

如果实现者认为必须修改 Work Core，必须先证明现有 Ref、Binding、Evidence 和
Finalization 无法表达，并单独提交架构决策；默认不得修改。

## 15. Catalog 与插件数量

本设计不要求新增插件。

建议复用：

```text
agent-box-session          # tree/branch/history/checkpoint refs
agent-box-harnesses        # per-Harness session implementations
agent-box-git              # exact Git workspace
agent-box-workspace-local  # live quick mode
agent-box-artifacts        # 仅在其安全/immutable contract 满足时承载 blob
agent-box-studio           # upper orchestration/API
```

若现有 Artifact provider 不满足 native private blob 的访问控制、完整性或删除语义，
应在 `agent-box-session` 内增加受保护 blob component，而不是新增一个理解 Harness 的
插件，也不能降低安全要求强行复用普通 Artifact。

## 16. API 草案

```text
GET  /api/v1/sessions/{session_id}/tree
GET  /api/v1/sessions/{session_id}/branches
POST /api/v1/sessions/{session_id}/branches
POST /api/v1/sessions/{session_id}/turns/preflight
POST /api/v1/sessions/{session_id}/turns
GET  /api/v1/sessions/{session_id}/executions/{execution_id}
POST /api/v1/sessions/{session_id}/branches/{branch_id}/select
```

创建 Turn 的请求增加：

```text
parent_execution_id: string | null
branch_id: string | null
fork_if_not_head: boolean
harness_type
profile_ref
model_selection
workspace_ref | null
launch_mode
prompt
idempotency_key
```

服务端返回最终冻结的 context mode、Binding summary、Loss Report、workspace fork
capability 和 node identity。`fork_if_not_head=false` 且 parent 不是 head 时必须拒绝，
不能悄悄创建分支。

## 17. UI 语义

用户看到的是执行树，而不是数据库术语：

- 每个节点显示 Harness、Profile、Model、时间、状态和文件变化；
- “继续”从当前节点创建子节点；
- 从历史节点继续时明确显示“创建新分支”；
- 原分支不会消失；
- 用户可以命名分支、切换 branch head 和比较结果；
- 同 Harness direct resume 不显示转译提示；
- 跨 Harness 时显示 Context Transfer/Loss Report；
- live workspace 无法精确分叉时明确阻止，而不是假装成功；
- native original 默认不在普通消息详情中暴露。

## 18. 安全

- Native Session checkpoint 与 Session 至少使用同等访问控制；
- native blob 默认不进入普通 transcript、日志或 diagnostics；
- credential value 不进入 checkpoint、canonical delta、Loss Report 或 Binding；
- public API 不返回宿主绝对路径和 continuation secret；
- materialized view 使用 execution-scoped 权限并在确定终态后清理；
- 删除 branch 默认只删除 branch 引用，不立即删除共享祖先对象；
- blob GC 只能删除无任何 node/branch/audit 引用且满足保留策略的对象；
- 导出 Session 必须区分 public canonical export 与受保护 native export。

## 19. 实施顺序

### Phase A：当前五 Harness 真实执行

- 完成可靠的 Turn transaction；
- 五家真实 provider/Profile/runtime 接入；
- 每次 Execution 返回或预留 output native Session Ref；
- 不实施跨 Harness materialization；
- 不继续扩展旧对称 `HarnessSessionCodec`。

### Phase B：Execution Tree 基础

- execution node/parent；
- default branch/head；
- Binding 中记录 workspace input/output 和 native input/output Ref；
- tree query 和从历史节点 fork；
- managed Git workspace exact fork；
- 现有线性 Session 映射到 default branch。

### Phase C：Importer 与同 Harness resume

- 五家逐一实现 Importer；
- 冻结 per-Execution native checkpoint；
- 五家逐一实现 Resumer；
- 证明同 Harness 不读取 canonical history；
- native schema drift/admission matrix。

### Phase D：双 Harness 转移

- Materializer 与 Loss Report；
- A → B；
- A → B → 回到 A 的 compatible ancestor checkpoint + canonical delta；
- 从转移前节点创建兄弟分支；
- 证明兄弟分支内容隔离。

### Phase E：五家与 compact

- 五家分别通过 read/write/resume/materialize admission；
- branch-scoped compact；
- 超窗 preflight；
- Studio tree、branch、compare 和 loss UI。

## 20. 验收场景

### 20.1 同 Harness

```text
Codex E1 → Codex E2 → Codex E3
```

- E2/E3 使用官方原生 resume；
- canonical history 持续增长但不参与 resume 输入；
- 每个 Execution 的 checkpoint immutable；
- E1/E2/E3 的 Binding 与 Workspace Ref 可精确审计。

### 20.2 跨 Harness

```text
Codex E1 → Claude E2
```

- Claude 只读取 E1 祖先路径公共语义；
- 转换前产生 Loss Report；
- Codex checkpoint 不被修改；
- Claude 结果导入公共历史并冻结 Claude checkpoint。

### 20.3 切回来源 Harness

```text
Codex E1 → Claude E2 → Codex E3
```

- E3 可以选择 E1 compatible Codex checkpoint；
- 只补充 E1 之后到 E2 的祖先公共增量；
- E3 不覆盖 E1；
- E3 checkpoint 表明其已吸收 E2 路径的 context digest。

### 20.4 不满意后另开分支

```text
Codex E1
├── Claude E2
└── OpenCode E3
```

- E2 永久保留；
- E3 从 E1 的 Session/Workspace Ref 创建；
- E3 看不到 E2 内容；
- 两个 branch head 可独立继续；
- 不发生覆盖式 rollback。

### 20.5 故障

- materialization 失败：无子节点提交，父节点不变；
- dispatch ambiguous：子节点 recovery-required，父节点不变；
- native import 不完整：不冻结伪 checkpoint；
- branch head CAS 冲突：保留已提交节点并要求重新选择 head；
- HTTP response 丢失：相同 request digest 精确 replay；
- unknown native version：preflight fail closed。

## 21. 非目标

本设计第一版不实现：

- 多父节点 merge；
- 同一 Session 多 branch 并发写；
- 自动选择“最佳”分支；
- 自动合并 workspace；
- 用隐藏摘要代替公共语义；
- 任意 Harness 间字节级无损；
- 为 live workspace 伪造历史快照；
- 将 Session graph 放进 Work Core；
- MCP Resource、多人协作和远程分布式调度。

## 22. 最终判断

Execution Tree 与跨 Harness Session 是同一能力的两个侧面：

- Execution Tree 保留用户的选择路径；
- native checkpoint 保留来源 Harness 的原生连续性；
- Official Canonical History 只承担跨 Harness 公共语义；
- Workspace/Git Ref 保留代码状态；
- Binding 把这些能力组合成下一次可冻结执行。

该模型不需要修改 Work Core，也不需要新增插件。它只要求现有 Session 插件从线性
会话索引升级为 Execution Tree authority，并要求 Harness 插件把原来的对称 Codec
拆成 Importer、Materializer 和 Resumer。
