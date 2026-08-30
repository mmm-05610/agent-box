# ADR-0006：Execution Resource Contract 输入协议

Status: Current — retained as an active architectural decision.

> 文档导航：[总目录](../README.md)

- 状态：Accepted for implementation
- 日期：2026-08-25
- 范围：Execution 启动输入在 ResourceProvider、Work Core 和 ExecutionProvider 之间的表示与传递
- 结论：**Resource Contract 是独立共享包中的带版本不可变 Python 数据类型，不是领域实体。ResourceProvider 构造它，ExecutionProvider 声明数量要求并消费它，Work Core 只固定、验证和完整传递。**

## 1. 问题

Execution 启动时可能使用 workspace、上下文文档、Agent-Box Profile 或 native continuation 等外部资源。

当前 `Ref(type, provider, native_id)` 能定位资源，却不能说明 ResourceProvider 解析后会交付什么结构。直接让 ExecutionProvider 识别每个具体 ResourceProvider，会形成供给方与消费方的两两适配。

需要在两者之间建立一个很薄的共享协议：

```text
ResourceProvider ──构造──> Resource Contract value ──消费──> ExecutionProvider
                                  ↑
                             Work Core 验证并传递
```

协议只回答“这个值是什么、长什么样”，不回答“谁消费、需要几个、怎样使用”。

## 2. 决策

### 2.1 Contract 在项目中的存在形式

Agent-Box 自带的 Contract 定义放在独立共享包中：

```text
src/agent_box/resource_contracts/
├── __init__.py
├── workspace_v1.py
├── prompt_fragment_v1.py
├── agent_box_profile_v1.py
└── codex_continuation_v1.py
```

这个包只包含：

1. 稳定、带版本的 `contract_id`；
2. 不可变 Python 数据类型；
3. 字段校验；
4. 字段语义文档。

例如：

```python
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar


@dataclass(frozen=True)
class WorkspaceV1:
    contract_id: ClassVar[str] = "agent-box.workspace@1"

    path: Path
    source_digest: str

    def __post_init__(self) -> None:
        if not self.path.is_absolute():
            raise ValueError("workspace path must be absolute")
        if not self.source_digest:
            raise ValueError("workspace source_digest is required")
```

`@1` 是不兼容版本边界。改变字段含义、删除字段或改变既有保证时，必须使用新的 `contract_id`。

第三方插件可以在自己的 Python distribution 中定义满足同一约束的 frozen
dataclass，并通过 `agent_box.plugins` entry point 注册。运行时
`ExtensionRegistry` 是 Dispatch 类型检查的唯一来源；`CONTRACT_TYPES` 只保留为
内置 Contract 的不可变兼容目录。第三方 Contract 不需要复制进 Agent-Box 源码。

### 2.2 Contract 明确不定义什么

Contract 不知道消费方是谁，因此不定义：

- 输入是否必需；
- 最少或最多数量；
- 多个值的选择和优先级；
- ExecutionProvider 如何使用它；
- 哪个 ResourceProvider 可以生产它；
- Ref、Execution 或 Dispatch identity；
- 数据库和生命周期。

数量规则属于具体 ExecutionProvider，不属于协议。

### 2.3 Contract 不是领域实体

Contract 不建立：

- 数据库表或实例 ID；
- Repository、CRUD 或领域事件；
- draft、revision history 或发布流程；
- 用户可修改的 Contract 配置；
- 新的 Core Provider 类型。

外部资源身份继续由 `Ref` 表达；Execution 选择哪个资源继续由 Execution–Ref association 表达。数据库只保存该 INPUT Ref 期望解析成的 `contract_id`。

### 2.4 依赖方向

ResourceProvider、ExecutionProvider 和 Work Core 都可以导入共享 Contract 包；Contract 包不得反向导入它们：

```text
ResourceProvider ─┐
ExecutionProvider ├──> resource_contracts
Work Core ────────┘

resource_contracts -X-> work_core
resource_contracts -X-> providers
```

这使协议定义独立于具体供给方和消费方，同时避免把 Git、Codex、ACP 或 Profile 实现导入 Work Core。

## 3. 三方职责

### 3.1 ResourceProvider

ResourceProvider 解释自己拥有的 `Ref`，并按指定 `contract_id` 构造对应对象：

```python
class ResourceProvider(Protocol):
    supported_contract_ids: frozenset[str]

    def resolve(self, contract_id: str, ref: Ref) -> object: ...
```

一个 ResourceProvider 可以支持多个 Contract；同一个 Ref 也可以在语义成立时被解析成不同 Contract。ResourceProvider 不知道最终由哪个 ExecutionProvider 消费。

例如 Artifact ResourceProvider 可以把两个不同 ArtifactRef 分别解析成两份 `PromptFragmentV1`。

### 3.2 ExecutionProvider

ExecutionProvider 声明自己接受哪些 Contract，以及每种 Contract 的数量要求，并实现实际消费代码：

```python
class CodexExecutionProvider:
    input_limits = {
        "agent-box.workspace@1": (1, 1),
        "agent-box.prompt-fragment@1": (0, None),
        "agent-box.profile@1": (1, 1),
        "agent-box.codex-continuation@1": (0, 1),
    }

    def start(self, inputs: Mapping[str, tuple[object, ...]]) -> object:
        workspace = inputs["agent-box.workspace@1"][0]
        fragments = inputs.get("agent-box.prompt-fragment@1", ())
        profile = inputs["agent-box.profile@1"][0]
        continuation = inputs.get("agent-box.codex-continuation@1", ())
        # Codex adapter 在这里实际准备 prompt、profile、cwd 和 resume 参数。
        ...
```

这里的 `(min, max)` 是 Codex ExecutionProvider 的输入要求，不是 Contract 的属性。另一个 ExecutionProvider 可以对同一种 Contract 使用不同数量要求。

ExecutionProvider 不需要知道 `WorkspaceV1` 来自 Git、local directory 还是远程 workspace ResourceProvider。

### 3.3 Work Core

Work Core 只负责：

1. 固定 Execution 选择的 `(contract_id, Ref)` 集合；
2. 在 Dispatch 前按 ExecutionProvider 的要求检查实际数量；
3. 根据 `Ref.provider` 找到 ResourceProvider；
4. 验证解析结果的 Python 类型与 `contract_id` 一致；
5. 不丢失、不合并地把全部解析结果交给 ExecutionProvider；
6. 保存输入摘要和执行后返回的事实。

Work Core 不负责 workspace materialization、prompt 拼装、Profile 配置、sandbox、session resume 或 Harness 启动。

## 4. 初始 Contract

第一版只定义当前代码已有真实消费行为的类型。

### `agent-box.workspace@1`

```python
@dataclass(frozen=True)
class WorkspaceV1:
    path: Path
    source_digest: str
```

表示已经可以作为进程工作目录使用的 workspace。Git ResourceProvider 可以使用 worktree path 和 base SHA 构造它；Codex 和 ACP adapter 都可以使用 `path`。

### `agent-box.prompt-fragment@1`

```python
@dataclass(frozen=True)
class PromptFragmentV1:
    title: str
    content: str
    digest: str
```

表示需要作为启动提示内容交给 Harness 的一段文本。workflow context、implementation requirements 和 review requirements 可以产生多份该类型；不同语义由 `title` 明示，但它们共享“按顺序渲染到 prompt”的消费动作。

如果未来某种 requirements 不再作为 prompt 文本消费，而是需要结构化执行或强制检查，应为那种新行为定义新 Contract，不能继续复用本类型。

### `agent-box.profile@1`

```python
@dataclass(frozen=True)
class AgentBoxProfileV1:
    name: str
    agent_type: str
    digest: str
```

表示由 Agent-Box 现有 Profile 系统拥有、可交给 `build_launch_plan()` 使用的固定 Profile。它是 Agent-Box 协议，不声称是跨产品通用 Harness Profile 协议。

### `agent-box.codex-continuation@1`

```python
@dataclass(frozen=True)
class CodexContinuationV1:
    thread_id: str
```

表示 Codex CLI 可用 `exec resume` 恢复的 native thread。当前 ACP adapter 明确不支持 session resume，因此第一版不伪造通用 `continuation@1`。

### 暂不定义 runtime policy Contract

当前仓库已有 Profile 内 sandbox 设置和描述性的 permission intent，但没有一个独立 runtime policy 被多个 runtime adapter 按相同字段语义执行。第一版不定义一个看似通用、实际无法保证执行的 `runtime-policy@1`。

## 5. 最小运行时接口

共享目录提供由 `contract_id` 到 Python 类型的只读索引：

```python
CONTRACT_TYPES: Mapping[str, type] = {
    WorkspaceV1.contract_id: WorkspaceV1,
    PromptFragmentV1.contract_id: PromptFragmentV1,
    AgentBoxProfileV1.contract_id: AgentBoxProfileV1,
    CodexContinuationV1.contract_id: CodexContinuationV1,
}
```

Dispatcher 的核心逻辑是：

```python
frozen_inputs = repository.list_input_refs(execution.id)
provider.input_limits()  # Core checks each provider-declared (min, max)

resolved: dict[str, list[object]] = {}
for contract_id, ref in frozen_inputs:
    resource_provider = resource_registry.get(ref.provider)
    value = resource_provider.resolve(contract_id, ref)
    expected_type = CONTRACT_TYPES[contract_id]
    if not isinstance(value, expected_type):
        raise ContractViolation(contract_id, expected_type, type(value))
    resolved.setdefault(contract_id, []).append(value)

provider.start(ExecutionStartRequest(
    execution_id=execution.id,
    dispatch_id=dispatch.id,
    inputs_digest=inputs_digest,
    inputs={key: tuple(values) for key, values in resolved.items()},
))
```

Dispatcher 不得：

- 忽略未知 Contract；
- 忽略不支持或解析失败的 Ref；
- 从多个值中擅自选择一个；
- 因为同一 Contract 出现多次而合并或覆盖；
- 把不符合类型的结果继续交给 ExecutionProvider。

## 6. 持久化与冻结

Contract 本身不持久化。现有表只需记录 INPUT Ref 对应的协议 ID，以及 Dispatch 对固定输入的摘要：

```sql
ALTER TABLE core_execution_refs
ADD COLUMN contract_id TEXT;

ALTER TABLE core_dispatches
ADD COLUMN inputs_digest TEXT;
```

约束：

- `relation = 'input'` 的新记录必须有 `contract_id`；
- `native` 和 `output` Ref 不使用 `contract_id`；
- 同一 Execution 可以有多条相同 `contract_id`，例如多份 `PromptFragmentV1`；
- 不增加 `(execution_id, contract_id)` 唯一约束；
- 第一个 Dispatch 创建后，Execution INPUT Ref 不可新增、替换或删除；
- native 和 output Ref 在 Dispatch 后仍可增加；
- Dispatch 保存按全部 `(contract_id, Ref identity)` 规范排序计算的 `inputs_digest`。

`inputs_digest` 证明 Dispatch 对应哪组固定输入，不证明外部资源内容。内容完整性由 Ref 指向的资源摘要和 ResourceProvider 解析校验负责。

Preview 的存储表示到此为止：frozen `(contract_id, Ref)` associations 加上
`Dispatch.inputs_digest`。这就是本次 Binding 的表示；不新增 Binding 实体、表、
revision、slot 或 ExecutionInput model。一个 Execution 的第一个 Dispatch 创建后，
INPUT 集合不可再变更；同一个 Ref 在同一个 Execution 中只能使用一个
`contract_id`。Preview 的 Codex 输入最多包含一个 `PromptFragmentV1`，因此第一版
不引入 prompt 顺序协议。

## 7. 精确运行序列

```text
Host/UI 选择若干已有 Ref，并为每个选择本次期望的 contract_id
    ↓
Work Core 在同一事务中写入 INPUT associations、冻结并创建 Dispatch
    ↓
Work Core 按 ExecutionProvider 的规则检查每种 contract_id 的实际数量
    ↓
按 Ref.provider 调用对应 ResourceProvider.resolve(contract_id, ref)
    ↓
ResourceProvider 返回共享 Contract 类型实例
    ↓
Dispatcher 按当前 ExtensionRegistry 中注册的 Contract 类型验证每个实例
    ↓
按 contract_id 分组，但保留每一个值
    ↓
ExecutionProvider.start(ExecutionStartRequest)
    ↓
ExecutionProvider 使用自己的 adapter 准备环境并启动真实实例
```

## 8. 当前代码依据

- [`models.py:43`](../../src/agent_box/work_core/models.py#L43) 的 `Ref` 已表达外部资源 identity，不需要 Contract 实体重复表达。
- [`repository.py:146`](../../src/agent_box/work_core/repository.py#L146) 已使用 `core_execution_refs` 保存 Execution 与 Ref 的关系，只需为 INPUT 增加 `contract_id`。
- Codex launch and continuation are now owned by `agent-box-harnesses`.
- Git worktrees are now owned by `agent-box-git` and artifacts by
  `agent-box-artifacts`; Core receives only typed Refs.
- Provider-specific continuation remains provider-owned; Core does not assume
  a cross-provider resume primitive.

## 9. 测试边界

第一版至少验证：

1. ResourceProvider 返回错误 Python 类型时 Dispatch 失败；
2. ExecutionProvider 的数量要求由它自己检查，不来自 Contract；
3. 同一 Contract 的多个 INPUT 值全部按原集合传递，不覆盖；
4. 未声明接受的 Contract 使 Dispatch 失败，不能静默忽略；
5. 同一组 `(contract_id, Ref)` 产生稳定 `inputs_digest`；
6. Dispatch 后不能改变 INPUT Ref，仍可增加 native/output Ref；
7. Work Core 不导入 Git、Codex、ACP、Profile、tmux 或 bwrap 实现模块；
8. `resource_contracts` 不导入 Work Core 或任何 Provider 模块。

## 10. 明确不做

本决策不引入：

- Contract 数据库实体；
- Resource Contract CRUD 或插件市场（标准 Python entry-point discovery 不属于市场）；
- Binding、Slot、Capability 或 Manifest；
- 通用资源装配、mount 或 inject 平台；
- 动态协议协商引擎；
- Core 内的 Git、Harness、MCP、bwrap 或 session resume 语义；
- 把数量规则放进 Contract；
- 把 Provider 私有 payload 塞进 Ref metadata。

Resource observation 继续复用 `apply_observation(..., resource_states=())` 和
`EXECUTION_PROJECTION_CHANGED`。Core 只验证 resource state 是有界非空字符串，
并在固定 INPUT 的状态变化时保存 material event；相同状态重复观察不产生事件。
Evidence 只允许可选的 ArtifactRef identity。不增加 ResourceFact、Coverage、
resource facts 表或新的 Resource EventType；Core 也不解释 provider 定义的状态值。

Work Core 拥有唯一公开 Preview dispatch 入口：
`ExecutionService.dispatch_execution(execution_id, inputs, registry, idempotency_key)`。
它协调固定 INPUT、数量检查、ResourceProvider.resolve、Contract 类型验证、完整
分组和 `ExecutionProvider.start`，但不实现 Git、Artifact、Profile、Codex、MCP、
LangGraph、bwrap 或 continuation。Continuation 仍由 Host 创建新 Execution，使用
`agent-box.codex-continuation@1` INPUT 后走同一 dispatch 入口；旧 Execution 不被
原地恢复。

最终边界只有一句话：

> **Resource Contract 是共享代码包中的带版本不可变数据类型；ResourceProvider 构造它，ExecutionProvider 决定接受几个并实际使用，Work Core 固定 Ref、验证类型并完整传递。**

## 11. 附录：与结构化 Resource Observation 的衔接（2026-08-27）

本 ADR 第 10 节曾把 Preview 的观察边界钉死为
`apply_observation(..., resource_states=())` 加自由字符串。该边界已被
[ADR-0008](0008-structured-resource-observations.md) 有条件突破，本附录只
记录衔接点，不改动上述协议正文：

- frozen `(contract_id, Ref)` association 仍是唯一关联键：一条结构化
  observation 必须精确命中该 Execution 的一个冻结 input association
  （contract_id + 完整 Ref identity），不能给任意 Ref 提交 observation。
  ADR-0006 的"不新增 Binding 实体、表、revision、slot"禁令不变——
  observation 表按 Ref identity 寻址，正是为了不需要引入 slot；
- `observation` 是关于某个 frozen input 的被声明事实，不建立 Contract 实体、
  不建立 Binding 实体，也不参与 Dispatch 数量检查与类型验证；
- 同一 `(contract_id, Ref)` 的多个 input（如多份 PromptFragmentV1）靠完整
  Ref identity 精确区分，各自独立接受 observation；
- legacy 自由字符串 `resource_states` 通道保留为 deprecated shim，语义见
  ADR-0008 §2.9。
