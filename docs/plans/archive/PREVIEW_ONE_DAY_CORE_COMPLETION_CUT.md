# Agent-Box Preview：Core Execution 输入协议完成切片
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

本切片已经把 Preview 进入真实 Provider 注册前必须稳定的最小协议落到现有
Work Core。范围是 provider-neutral 的 Execution 输入冻结、资源解析、类型验证、
完整传递和资源状态观察；不扩展 Work lifecycle，也不引入 Binding 领域实体。

## 已实现的存储表示

Execution 的 Binding 表示就是现有 `core_execution_refs` 中冻结的：

```text
(contract_id, Ref)
```

以及 `core_dispatches.inputs_digest`。新增 migration
`006_resource_contract_inputs.sql`（`005` 已被早期本地 Preview 数据库占用，因此保留版本号而不复用）：

```sql
ALTER TABLE core_execution_refs ADD COLUMN contract_id TEXT;
ALTER TABLE core_dispatches ADD COLUMN inputs_digest TEXT;
CREATE UNIQUE INDEX ... ON core_dispatches(execution_id);
```

历史 row 继续允许 NULL；新 INPUT association 必须带 `contract_id`。Preview 每个
Execution 最多一个 Dispatch。第一个 Dispatch 创建后，INPUT 不能新增、替换或
删除；native/output Ref 仍可由 Provider observation 附加。当前测试 fixture 和
仓库内可检查的 Core 数据没有重复 Dispatch，因此 migration 加入唯一索引；若真实
部署数据库未来发现历史重复，必须先记录事实并仅依赖 Service/Repository 原子检查，
不能破坏性清理后再加索引。

## Shared Resource Contracts

`src/agent_box/resource_contracts/` 只提供四个版本化 immutable dataclass 和
只读类型 registry：

- `agent-box.workspace@1` → `WorkspaceV1`
- `agent-box.prompt-fragment@1` → `PromptFragmentV1`
- `agent-box.profile@1` → `AgentBoxProfileV1`
- `agent-box.codex-continuation@1` → `CodexContinuationV1`

这个包不包含数据库、Repository、Ref、Execution、Dispatch 或 Provider 实现，也不
导入 Work Core。Contract 不声明数量规则；数量规则属于 accountable
ExecutionProvider。

## 唯一 Dispatch 序列

公开入口只有：

```python
ExecutionService.dispatch_execution(
    execution_id,
    inputs: Sequence[tuple[str, Ref]],
    registry: ExtensionRegistry,
    idempotency_key: str,
) -> ExecutionStartRequest
```

实际序列：

```text
Host 选择 Ref 和 contract_id
  → Core 获取 accountable ExecutionProvider
  → Core 校验已注册 Contract 与 Provider input_limits()
  → canonicalize 全部 (contract_id, Ref)，计算 SHA-256 inputs_digest
  → 一个 SQLite 事务写入 INPUT associations + requested Dispatch + event
  → 按 Ref.provider 找 ResourceProvider.resolve(contract_id, ref)
  → 按 CONTRACT_TYPES 验证返回的 Python 类型
  → 按 contract_id 分组，保留每一个值
  → 构造 ExecutionStartRequest
  → 调用唯一 accountable ExecutionProvider.start(request)
  → accepted 或 failed event/state
```

`ExecutionStartRequest` 是不可持久化的 Provider invocation DTO，包含
`execution_id`、`dispatch_id`、`inputs_digest` 和完整 `Mapping[str, tuple[object,
...]]`。未知 Contract、Provider 不接受的 Contract、数量不满足、解析异常和类型
错误都不会被静默忽略；冻结后解析或启动失败会把 Dispatch 记录为 `failed`。

## Resource observation

`apply_observation` 新增 provider-neutral 参数：

```python
resource_states: Sequence[
    tuple[Ref, str] | tuple[Ref, str, ArtifactRef]
] = ()
```

Core 只验证 state 是有界非空字符串，并确认 Ref 是该 Execution 的冻结 INPUT。
状态变化使用既有 `EXECUTION_PROJECTION_CHANGED`，event data 以
`observation_kind = resource` 保存 Ref identity、state 和可选 ArtifactRef identity。
projection 不变但 resource state 改变仍产生 material event；相同 state 重复观察不
重复写入。这里没有 ResourceFact model、Coverage enum、resource facts table 或
新的 resource EventType。

## 明确不在本切片

不新增或修改 Execution、ExecutionProjection、Ref、Work lifecycle、Binding entity、
ExecutionInput、ResourceFact、Finish/continuation 字段或 API、WorkflowStep、Agent、
Harness、Participant、Message、Projector、Capability negotiation、retry/recovery、
scheduler 或 generic assurance engine。Work Core 不实现 Git、worktree、Artifact
读取、Profile materialization、Codex 参数、ACP、LangGraph、MCP、bwrap 或 GitHub
Actions。

真实 Provider 的下一步是分别实现 ResourceProvider（Git/Artifact/Profile）和
ExecutionProvider（Codex Interactive），然后用同一协议运行第一个 Demo Work。
