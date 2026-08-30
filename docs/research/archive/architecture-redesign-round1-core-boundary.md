# Architecture Redesign Round 1: Work Core / Kernel Boundary
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

日期：2026-08-28
视角：Work Core / kernel 边界与形式一致性
范围：当前仓库只读审计；不做市场调研，不引入 workflow、DAG、scheduler、Agent、Harness 等 Core entity。

# Executive verdict

目标方向基本成立：Agent-Box 应收敛为一个 provider-neutral Execution kernel，外加
Host application、Plugin SDK、官方 Harness 插件和可选资源插件。`Work`、
`Execution`、frozen input associations、`Dispatch`、`Ref`、projection 和
`ResourceObservation` 仍是足够的 Core 语言；Profile、Workspace materializer、tmux、
Sandbox、MCP、credential、Harness driver 都不需要进入 Core ontology。

但“完全不用调整现有边界即可实现”不成立。当前代码有两个会阻碍目标结构的真实反例：

1. `ExecutionStartRequest.inputs` 只保存按 `contract_id` 分组的 resolved values，丢失了
   每个 value 对应的 exact `Ref`。Provider 因而无法可靠地将 projection/read-back
   observation 关联回 frozen input；多个同 Contract 输入时尤其无法区分。未来
   Sandbox/Console operational adapter 也无法通过 `Ref.provider` 选择正确实现。
2. `ResourceProvider.resolve()` 同时承担 validate、resolve、materialize：当前 Git
   resolve 创建 worktree，tmux resolve 创建 session。它没有 execution/dispatch context、
   cleanup lease、recover handle 或结构化 provisioning receipt。将未来 agent sandbox
   也塞进 `resolve()`，会制造隐藏生命周期和隐藏副作用。

因此建议不是重开 Core 设计，而是做两项窄修正：

- 将外部 Provider 调用协调从 kernel package 中拆到 Host application 的唯一 governed
  `DispatchCoordinator`，而 Dispatch identity、freeze、requested/accepted/failed
  状态仍由 Core 拥有；
- 将启动请求改为保留 `(contract_id, exact Ref, resolved value)` 的非持久 DTO。它不是
  Slot、Binding entity 或新领域对象，只是把 Core 已经持久化的 association 完整传递。

Sandbox 的具体操作协议应属于官方 Harness/Host 的插件互操作层，而不是 Work Core。
`ExecutionProvider.start()` 仍然是唯一 accountable 启动入口：Sandbox adapter 可以
创建空间、包装命令或启动远端进程，但不能形成第二次 Core Dispatch，也不能成为本次
Execution 的第二 accountable provider。

# Repository-verified current state

当前实现已经具备以下正确基础：

- `Execution.provider_id` 在创建时固定，一个 Execution 只有一个 accountable
  ExecutionProvider；
- `dispatch_execution()` 将全部 `(contract_id, Ref)` 与 requested Dispatch 在同一
  SQLite transaction 写入，第一次 Dispatch 后 inputs 不可修改；
- 数据库唯一约束保证一个 Execution 最多一个 Dispatch；
- `inputs_digest` 对规范化后的完整 input associations 计算；
- Dispatch accepted 重放不再次调用 `provider.start()`；failed 重放保持失败；requested
  重放明确返回 `DispatchAmbiguous`；
- terminal projection 单调密封；旧 terminal Execution 不恢复，continuation 可由新
  Execution 绑定旧 SessionRef 表达；
- ResourceObservation 必须精确命中 frozen `(contract_id, Ref identity)`，append-only，
  terminal 后仍可追加，且不改变 outcome；
- 第三方插件可注册 versioned frozen Contract、ResourceProvider、ExecutionProvider；
  历史 Ref/Binding/Observation 的读取不依赖插件仍在场。

这些不变量应保持不动。问题主要在 effect orchestration、operational resource
composition 与包依赖，而不是 Core 对象不足。

# Target dependency structure

```text
Web Workbench / CLI / external Workflow Host
                    |
                    v
          Host Application Services
          - Binding draft/composer
          - DispatchCoordinator
          - attach/finish/recovery
          - plugin/selector composition
                    |
          +---------+----------+
          |                    |
          v                    v
      Work Core          Plugin SDK / registries
      - facts            - discovery/conformance
      - invariants       - provider registration
      - persistence      - host-side adapters
          ^                    |
          |                    v
          |            Official / third-party plugins
          |            - harnesses
          |            - Git / tmux / cc-switch
          |            - future sandbox products
          +--------------------+
             typed commands and observations
```

依赖纪律：

```text
Core                 -X-> Host/UI
Core                 -X-> concrete plugin
Core                 -X-> Profile/Git/tmux/Sandbox/Harness semantics
Plugin               ---> public Core/SDK types
Host application     ---> Core + Plugin SDK
Web UI               ---> Host API only
```

这里“Dispatch 属于 Core”和“Provider 调用协调属于 Host application”不矛盾：

- Dispatch 的 identity、一个 Execution 只能有一个 Dispatch、inputs freeze、状态迁移和
  append-only event 是 Core 事实；
- 查 registry、调用第三方 `resolve()`、组合 operational adapters、调用
  `ExecutionProvider.start()` 是外部副作用协调，属于 application service。

当前 `ExecutionService.dispatch_execution()` 同时做了两类工作。目标重构可以保持行为
和数据库不变量不变，只移动 effectful orchestration；不能重新开放免冻结 Dispatch
入口。

# Accurate responsibility boundaries

## Work Core

Core 只承担以下责任：

1. `Work` 的长期目标 identity 与显式完成/重开边界；
2. `Execution` 的一次责任尝试 identity、唯一 provider_id 与 provider-neutral
   projection；
3. frozen `(contract_id, Ref)` associations 及其规范 digest；
4. 一个 Execution 至多一个 Dispatch，及 requested/accepted/failed 的单调事实；
5. native/output Ref associations；
6. terminal sealing；
7. ResourceObservation 的结构校验、frozen-input 关联与 append-only ledger；
8. material Core events 和并发/幂等不变量。

Core 不应负责：

- Resource selector、Profile defaults 或表单；
- Git selector 解析、worktree 创建、tmux pane 选择；
- 配置拼装、mount、secret injection、sandbox provisioning；
- Harness argv、native session resume、terminal attach；
- workflow 当前节点、route、retry、scheduler；
- 比较 Git HEAD、判断 MCP 被调用、评估 sandbox 安全等级；
- Provider 组合兼容矩阵。

## Host application

Host application 是用户/外部 workflow 与 Core 之间的 use-case layer：

1. 根据 installed ExecutionProviders 创建 Execution draft；
2. 使用插件 input adapters 将 mutable selector 解析成候选 exact Ref；
3. 在 freeze 前展开 Profile 推荐的 capability/sandbox/console **候选 inputs**；
4. 呈现并校验 Binding draft，但不自己持久化 frozen facts；
5. 通过唯一 DispatchCoordinator 请求 Core 原子 freeze/request；
6. 调用资源解析与唯一 ExecutionProvider.start，随后让 Core记录 accepted/failed；
7. attach、observe、recover、explicit finish，并把 Provider observation 写入 Core；
8. 由 Human/external workflow 决定是否创建下一 Execution 或完成 Work。

Host 可保存 draft、wizard state、FINALIZING、terminal UI handle 等易失状态；这些不是
Core facts。Host 不得持有另一套 Execution lifecycle，也不得在 Provider start 成功后
绕开 Core 伪造 accepted。

## Plugin SDK

Plugin SDK 负责 distribution discovery、descriptor、API version、atomic registration、
conformance diagnostics 和可信 in-process 插件边界。它可承载两种不同扩展面：

- **Core-facing**：versioned Resource Contract、ResourceProvider、ExecutionProvider；
- **Host-facing**：selector/form adapter、control adapter，以及将来确有真实需求时的
  Sandbox/Console operational adapter registry。

Host-facing adapter 不是 Core Provider 类型。当前 WorkBoard 私有 entry-point 已证明
这种扩展方式可行，但未来 Web Host 应定义一个 UI-neutral Host adapter package，避免
把 `agent_box_workboard.*` 变成所有插件的长期依赖。

Plugin SDK 不提供 remote sandbox、permission isolation、marketplace、workflow 或
agent supervisor。第三方包是可信进程内代码；其自报 observation 仍只是 self-report。

## ResourceProvider

ResourceProvider 对自己 authority domain 的 Ref 负责：

- 验证 Ref 由自己拥有；
- 检查 exact identity/revision/digest；
- 按指定 Contract 构造 resolved value；
- 在其能力范围内提供 read-back facts。

一个产品可以同时具备 Authority、Provisioner 和 Evidence source，但这不意味着全部
行为都应塞进 `resolve()`。推荐把概念拆开：

```text
prepare selector -> exact Ref       Host input adapter / authority
resolve Ref -> immutable value      ResourceProvider
materialize/launch/cleanup          plugin-level operational adapter
read back -> ResourceObservation    resource/host/external observer
```

Preview 可以暂时兼容现有 side-effectful resolve，但新 SandboxProvider 不应以此为范本。

## Accountable ExecutionProvider

ExecutionProvider 对一个 accepted Dispatch 的 native responsibility 负责。它必须拥有：

- start；
- native correlation；
- observe；
- crash/restart 后的 control recovery（可先作为 optional capability）；
- explicit finish/cancel 的 provider-owned completion signal；
- terminal outcome；
- native/output refs 和 resource observations 的生成。

它不是“只生成 argv 的 adapter”。也不是“任何被调用的资源 Provider”。只有它被 Core
记录在 `Execution.provider_id`，也只有它对这次 Dispatch 的责任闭合负责。

# Exact meaning of ExecutionProvider.start

`ExecutionProvider.start(request)` 是正式启动本次 native responsibility 的唯一入口。
它的责任至少包含：

1. 检查 request 的 dispatch/execution identity 与所需 inputs；
2. 选择本插件内部的 Harness driver；
3. 根据 resolved Profile、Workspace、context、capabilities 生成 native process spec；
4. 若有 Sandbox input，通过对应 operational adapter 准备执行空间；
5. 若有 Console input，通过对应 adapter 启动或连接用户可见交互通道；
6. 启动 native Harness 或恢复 frozen continuation SessionRef；
7. 在返回前产生足以 recovery/correlation 的 durable native locator；
8. 返回一个受控 start receipt；
9. 后续通过 observe/finish/recover 维护这次 Execution 的真实状态。

`start()` 可以委托具体动作，但不能委托 accountability：

```text
Core/Host -> one ExecutionProvider.start()
                     |
                     +-> HarnessDriver.prepare_process()
                     +-> SandboxAdapter.prepare/launch()
                     +-> ConsoleAdapter.launch/attach()
                     +-> native Harness
```

SandboxAdapter 启动了 OS process，不表示它成为第二 ExecutionProvider。区分标准是：

- “谁执行 `fork/exec` 或远程 API call”是机制；
- “谁接受本次 Dispatch 并对最终 responsibility outcome 负责”是 accountability。

如果某个 agent sandbox 产品自己接受完整 objective、管理 agent run、提供 run outcome 和
recovery，那么它可能应独立注册为 ExecutionProvider，而不是伪装成 SandboxRef。

## Required start semantics

- `dispatch_id` 是 Provider start 的幂等/correlation key；
- Provider 必须把 durable start record 写在不可逆 side effect 之前或使用 native
  idempotency key；
- 返回只表示 native responsibility 已被接受/建立，不表示 Execution 业务完成；
- completed turn、idle、pane close 都不能自动等于 explicit finish，除非该 Provider
  的责任 contract 明确就是一次非交互 run；
- Provider start 不得创建另一个 Core Execution 或 Dispatch；
- Provider 不得在 start 后动态添加 frozen inputs；
- Profile/capability 展开必须在 freeze 前完成。

当前 `start()` 返回 `Any`，Core 只试探 `provider_correlation_ref` 字段。这能跑 Preview，
但正式 SDK 应定义非持久 `ExecutionStartReceipt` DTO；它不需要新表，现有 correlation
字段可继续存储。

# Ref, Binding, Dispatch and Observation

## Ref

Ref 是 external identity locator，不是配置 payload、操作对象或 secret container。用户
口中的 ProfileRef、TmuxRef、SandboxRef 是产品/Contract 层名称，不要求给
`RefType` 枚举逐个新增类型：

| 用户概念 | 当前 Core Ref 表达 |
| --- | --- |
| exact workspace/source | `WorkspaceRef` |
| immutable Profile snapshot/spec | 通常 `ArtifactRef` |
| existing tmux pane | `SessionRef` |
| sandbox policy/spec | 通常 `ArtifactRef` |
| materialized sandbox instance | `RunRef` 或 `SessionRef` |
| native Harness session | `SessionRef` |
| continuation input | 旧 native `SessionRef` 经 provider-owned Contract 解释 |
| context/review criteria | `ArtifactRef` |

因此当前 `RefType` 不需要 `PROFILE`、`SANDBOX`、`TMUX`、`MCP` 等外部产品枚举。

## Binding

Binding 仍是 frozen input association set + inputs digest，不需要 entity、slot 表或 revision
object。UI 可以按 Contract 分组并显示“Profile”“Sandbox”“Console”，但 Core 只保存：

```text
(harness.profile@1, Profile ArtifactRef)
(workspace@1, WorkspaceRef)
(sandbox.environment@1, Sandbox spec ArtifactRef)   # future/optional
(console.pane@1, tmux SessionRef)
(prompt-fragment@1, context ArtifactRef)
(harness.continuation@1, previous SessionRef)
```

Profile 可以在配置里声明 defaults/recommendations，但不能在
`ResourceProvider.resolve()` 时展开为新 frozen inputs。正确时序是：

```text
select Profile
-> Host adapter reads its declaration
-> proposes capability/credential/sandbox/console inputs
-> user reviews exact Refs
-> freeze all inputs together
```

UI 可把这些 inputs 折叠显示在 Profile 下；历史账本必须保留它们各自的 authority。

## Dispatch

Dispatch 是 responsibility submission boundary，不是资源 provision 或 workflow node。
最安全的时序：

```text
1. Host prepares exact Ref candidates (no native launch)
2. User/Host reviews complete input set
3. Core atomically freezes inputs + creates requested Dispatch
4. Application resolves exact inputs
5. Accountable ExecutionProvider.start(request)
6. Core records accepted receipt or failed error
7. Provider observation moves projection to ACTIVE/TERMINAL
```

步骤 3 之后失败不会解冻 inputs；不同依据必须创建新 Execution。步骤 4/5 的 crash
window必须保持 `DispatchAmbiguous`，不能自动重试 start。

## Observation

Projection 回答“这次责任现在是否 active/terminal”；ResourceObservation 回答“关于某个
frozen input，某个 observer 实际观察到了什么”。二者不得合并。

ExecutionProvider/ResourceProvider/Host/external authority 可以提交 observation，但必须：

- 精确引用 request 中原来的 `(contract_id, Ref)`；
- 区分 PROJECTED、READ_BACK、CONSUMPTION_REPORTED；
- 区分 provider self-report 与 independent observer；
- 不把 visible/projected 升级为 model consumed；
- 不把 Sandbox 创建成功升级为安全 attestation；
- 不含 secret 或 raw transcript。

# Concrete input composition for official harnesses

建议官方 `agent-box-harnesses` 注册一个主要 accountable provider：

```text
official-interactive-harness
```

不同 Codex/OpenCode/Pi 是 provider-internal driver，由 frozen Profile Contract 选择，而
不是每个 profile 或 transport 都注册成新的 ExecutionProvider。独立 Codex structured
review 若责任/交互/输出合同不同，可以继续作为单独 ExecutionProvider。

一次交互式启动的资源组合：

| Input | 数量 | owner | 作用 |
| --- | ---: | --- | --- |
| HarnessProfile | 1 | harnesses plugin | driver、profile revision、non-secret effective config |
| Workspace | 1 | Git/workspace plugin | exact source + materialized working path |
| Prompt/context | 1..N | artifact/workflow adapters | 当前责任与 upstream context |
| Harness capability | 0..N | local/cc-switch/third party | versioned MCP/plugin/skill definitions |
| Credential source | 0..N | credential bridge | opaque secret source handle；不含 value |
| Console | 0..1 | tmux/terminal plugin | visible PTY identity/attach |
| Sandbox | 0..1 | future sandbox plugin | execution space policy/capability |
| Continuation | 0..1 | native session provider | previous SessionRef interpreted by selected driver |

`input_limits()` 只能表达 Contract 数量，不能表达跨输入兼容性。例如远程 sandbox 未必
可接本机 tmux pane，Pi continuation 未必兼容新的 profile revision。兼容性应由：

1. Host composer 提前 preview；
2. ExecutionProvider 在 start 前 fail closed 再验证；
3. tests 固定已支持矩阵；

共同承担。不要向 Core 加 generic constraint/policy engine。

# Sandbox and accountable-provider boundary

用户当前理解正确：Sandbox 是与运行进程相关的 execution space；tmux 是用户看到和
操作进程的 console/PTY。两者正交：

```text
Tmux/Browser Console
        |
        v
Sandbox launch/attach transport
        |
        v
Harness process
```

但不是所有 Sandbox × Console 都能任意组合。需要插件级 capability negotiation，最小
方式是支持受控形态并拒绝未知组合，而不是设计万能 bridge。

## SandboxProvider owns

- Sandbox selector -> exact policy/template/image Ref；
- policy/template/image 的 exact validation；
- sandbox-specific create/launch/attach/observe/cleanup API；
- native sandbox instance identity；
- mount/network/image/process facts及其保证边界。

## Accountable ExecutionProvider owns

- 是否需要 Sandbox；
- 将 Harness process spec、workspace、profile/capabilities 交给 Sandbox adapter；
- 选择并验证 Console compatibility；
- 调用一次 create/launch；
- 保存 native correlation；
- aggregate observe/recover/finish；
- 对 Core 提交一个 terminal outcome。

## Core owns

- frozen Sandbox Ref association；
- accepted Dispatch；
-实际 Sandbox instance native Ref；
-关于 frozen Sandbox input 的 observations；
-不解释 image/mount/network policy。

## Operational contract is not a Core Contract

一个 data-only Resource Contract 只能表达 resolved sandbox selection，例如 image/policy
digest 和 capability declaration。`create()`、`launch()`、`attach()`、`cleanup()` 是
有副作用的 operational interface，不应成为 Work Core Protocol，也不应让 Core 调用。

可以由独立互操作包提供：

```text
agent-box-harness-runtime-contracts   # name illustrative, plugin-level
  ProcessSpec
  ResolvedSandboxSpec
  SandboxLaunchAdapter
  PreparedSandbox
  ConsoleLaunchAdapter
```

Host application 组装这些 operational adapters，并依赖注入给官方 Harness
ExecutionProvider。第三方 sandbox 插件依赖这个互操作包，而不是要求 Work Core 知道
sandbox。若以后第二类非 Harness ExecutionProvider 也真实复用它，再考虑提升到通用
Plugin SDK；Preview 不要预先泛化。

不要把 live launcher/controller 塞进 frozen dataclass Contract。虽然 Python 技术上可以
在 frozen dataclass 字段里放可变对象，这会破坏 Contract 的“可验证值”语义、restart
recovery 和 conformance diagnostics。

# The strongest current counterexamples

## Counterexample 1: start request loses exact Ref

当前 `ExecutionStartRequest`：

```python
inputs: Mapping[str, tuple[object, ...]]
```

Core resolve 后丢失了 value 对应的 Ref。假设同一 Execution 有三份
`harness-capability@1`：MCP M、skill S、plugin P。Provider只收到三个 Python value，
之后想提交 PROJECTED observation 时必须重新猜哪个 value 对应哪个 exact Ref。Contract
可能带 digest，但这不是完整 Ref identity，也无法保证第三方 Contract 都复制 Ref。

推荐非持久 DTO：

```python
@dataclass(frozen=True)
class ResolvedExecutionInput:
    contract_id: str
    ref: Ref
    value: object

@dataclass(frozen=True)
class ExecutionStartRequest:
    execution_id: str
    dispatch_id: str
    inputs_digest: str
    resolved_inputs: tuple[ResolvedExecutionInput, ...]

    # convenience view, derived only
    def values_by_contract(self) -> Mapping[str, tuple[object, ...]]: ...
```

这不是 `ExecutionInput` entity、slot 或新的持久化关系；Core 已经存了前两个字段，只是
不再在进程边界丢失它们。它应列为目标架构唯一必要的启动 API 修正。

## Counterexample 2: side-effectful resolve has no lease

当前 Git resolve 创建 worktree；tmux console resolve 创建 session。若后续另一个 input
resolve 或 ExecutionProvider.start 失败：

- 已创建资源没有统一 cleanup owner；
- `resolve()` 不接收 dispatch_id，难以建立可恢复实例；
- Core只能记录 Dispatch failed，无法表达哪一步 provision 成功；
- idempotency/recovery 依赖 Ref metadata 中的人为 materialization key；
- 把远程 sandbox create 放进去会放大资源泄漏和重复收费风险。

解决不是让 Core管理 lease，而是：新资源的 resolve 保持 validation/data resolution；
provision 由 accountable ExecutionProvider 在 start 内调用 operational adapter，并把
dispatch_id 作为 idempotency key。cleanup/recovery handle 属于 Provider/plugin。

## Counterexample 3: current provider IDs encode transport

当前同时存在 `codex-app-server` 与 `codex-tmux-interactive`，Pi provider 也把 tmux 写入
类型和 display name。若目标是一个官方 Harness provider + Profile/Console/Sandbox
资源组合，这些 provider IDs 把“责任模型”和“显示 transport”混在一起。

不是所有 Provider 都必须合并：structured non-interactive review 与持续 interactive
author 是不同责任 contract，可以是两个 providers。但仅因 tmux/browser console 不同
就分裂 provider 会削弱 Binding 的组合价值。

## Counterexample 4: concrete providers remain inside work_core

`src/agent_box/work_core/providers/resources.py` 直接 import Agent-Box config、ProfileRepo，
并实现 Git、file artifact、Profile provider。即使 Core模型本身不知道产品，这个包路径
仍让 kernel distribution 看起来拥有这些 integrations。

目标应将它们迁移到插件：

- Git/worktree -> Git/preview resource plugin；
- artifact file -> generic local artifact plugin or Host utility；
- Profile -> official harnesses plugin。

`src/agent_box/resource_contracts/agent_box_profile_v1.py` 也应随 phase-1 Profile 迁出；
workspace/prompt 是否继续作为内置 interop contracts可以保留，因为它们已经跨多个
Provider且不包含产品语义。

## Counterexample 5: profile exactness without snapshot retention

现有 ProfileRef 是 name + digest；resolve 时重读当前目录，改变后就拒绝。这能防止
silent drift，却不能保证历史 revision 仍可重新 materialize。目标 Profile provider
必须拥有 immutable snapshot/revision retention，或者诚实声明旧 source unavailable。
不能让 Core 成为 profile archive，也不能静默使用最新版。

## Counterexample 6: arbitrary SandboxRef is not yet composable

当前 PluginRegistration 只有 contracts/resource providers/execution providers，没有
Sandbox operational adapter registry；start request 也没有 Ref。于是“安装任意 sandbox
插件，官方 Harness provider 自动会用”目前只是愿景，不是 SDK 已有能力。

Preview 可暂不实现 Sandbox，先以 host-process 明确标注无 isolation。等选定一个真实
agent sandbox 后，用一次 vertical slice 固定最小 operational interface，避免从 bwrap/
Docker 猜万能协议。

# Existing coupling and invariant audit

| Current fact | Assessment | Target action |
| --- | --- | --- |
| `work_core/services.py` 调 ExtensionRegistry 和 Provider native methods | package-layer impurity，语义可保留 | effect orchestration 移到 application DispatchCoordinator |
| Core atomic freeze + requested Dispatch | 正确且不可丢 | 保留在 Core repository command |
| `ExecutionStartRequest` 丢 Ref | blocker for exact observation/composition | 增加非持久 resolved-input envelope |
| `provider.start` / result 是 `Any` | SDK 边界过弱 | typed request/receipt；不新增表 |
| concrete Git/Profile providers 位于 work_core | concrete integration 泄漏 | 迁出插件 |
| phase-1 `AgentBoxProfileV1` 内置 | legacy product语义 | 迁入 harnesses plugin versioned Contract |
| Git/tmux resolve materialize | lifecycle/cleanup 隐藏 | 新 Provider禁止照搬；逐步拆 operation adapter |
| Codex provider直接 import launch.py/tmux plugin | harness/transport/profile紧耦合 | Harness driver + Console adapter + Profile materializer |
| WorkBoard-specific plugin entry points | 证明 Host扩展可行，但 UI耦合 | 提炼 UI-neutral Host adapter；Web/TUI复用 |
| ResourceObservation exact association | 正确 | 保留；request 必须把 exact Ref交回 Provider |
| observer_role由插件自报 | in-process信任限制 | UI永远展示 self-report；不虚构信任评分 |
| Dispatch requested crash -> ambiguous | 正确的诚实状态，但 recovery缺失 | optional provider recovery/Host reconciliation，Core不自动 retry |
| apply_observation整包非原子 | 已明确的限制 | 不影响本轮架构；不要宣传 bundle atomic |
| Ref metadata 有界 | 正确 | 大 manifest/context 用 ArtifactRef，不扩大 metadata |

# Does the target require Core changes?

## No ontology or schema change

目标不需要：

- Binding entity/table/revision；
- Slot entity；
- Profile/Sandbox/Console/Harness Core entity；
- Resource lifecycle entity；
- generic policy/compatibility engine；
- second Dispatch 或 child Dispatch；
- workflow/node/edge/retry/scheduler；
-新的 RefType 枚举项。

现有数据库关系足以保存目标 Preview 的事实。

## One necessary invocation-shape correction

Provider start 必须收到 exact Ref 与 resolved value 的配对。最好将该 DTO 放在 public
extension/application API，而不是继续扩张 domain model。若为了兼容暂时保留
`inputs` grouped view，可以同时提供 `resolved_inputs`，但两者必须由同一 canonical
tuple 派生，禁止两份可冲突数据。

## One necessary package-boundary refactor

将 `dispatch_execution()` 的 provider调用部分迁到 application coordinator；Core保留
原子 freeze/request 与 accepted/failed commands。这不是把 Dispatch 移出 Work Core，
而是阻止 kernel import Plugin registry 并执行第三方 native effects。

## Recommended but not blocking SDK corrections

- typed `ExecutionStartReceipt(provider_correlation_ref, native_refs?)`；
- optional `recover(dispatch facts)` capability，解决 requested ambiguous window；
- UI-neutral Host input/control adapter interfaces；
- plugin-level Sandbox/Console operational interfaces，仅在真实 vertical slice 后固定。

# Sequenced implementation boundary

建议按以下顺序，避免架构重写阻塞 Preview：

1. 冻结现有 Core ontology/schema/invariants；
2. 定义 `ResolvedExecutionInput` + typed start receipt，并保持旧 grouped values 的临时
   compatibility view；
3. 建 application `DispatchCoordinator`，将现有行为搬迁而非重写；用测试钉住原子
   freeze、one Dispatch、idempotency 和 ambiguous 状态；
4. 创建 `agent-box-harnesses`，迁入 phase-1 Profile、launch plan 与 Codex driver；
5. 将 Profile Contract/Provider 从内置 preview resources 迁出；
6. 先支持 host-process + optional tmux Console，明确无 Sandbox；
7. OpenCode/Pi 只新增 driver，不新增 Core类型；
8. Web Host复用 UI-neutral selector/control adapters；
9. 选择一个真实 agent sandbox 做 vertical slice后，再固定 plugin-level operational
   contract；bwrap仅作 experimental对照，不决定通用协议；
10. 新路径完全跑通后，删除 legacy GUI/CLI/direct launch和 concrete core providers。

# What must not happen during migration

- 不得为了拆 application layer 重新出现免冻结的 `request_dispatch()`；
- 不得让 Web API 直接写 Core SQLite；
- 不得让 Profile resolve 在 freeze 后追加 capability inputs；
- 不得把 Profile defaults藏成 provider-owned未显示资源；
- 不得让 Sandbox provider自己创建第二 Dispatch；
- 不得在 accountable provider中按 `if ref.provider == bwrap/docker/...` 永久硬编码；
- 不得把 credential value、完整 effective config 或 live launcher塞进 Ref metadata；
- 不得把 tmux pane关闭、sandbox process退出或 Harness idle自动等同 Work完成；
- 不得在删除一期路径前先失去 Codex vertical slice与legacy import fallback。

# Recommended boundary

最终推荐边界是：

```text
Core
  owns Work/Execution/frozen associations/Dispatch/projection/observations

Application Host
  owns drafts, selector orchestration, governed provider invocation,
  attach/finish/recovery and next-step UX

Official Harness Plugin
  owns Profile model, per-Harness drivers, effective-config materialization,
  one accountable interactive ExecutionProvider

Resource Plugins
  own exact Refs, resolution, product-specific provision/read-back adapters

Plugin-level Interop
  owns ProcessSpec, Console and future Sandbox operational contracts
  only after a real cross-plugin implementation proves the surface
```

`ExecutionProvider.start()` 是唯一 accountable launch入口；它可以组合 Sandbox、tmux、
Workspace、Profile，但 Core只看见一次 Dispatch。

# Invariants that must remain

1. 一个 Execution 只有一个 accountable provider_id；
2. 一个 Execution 至多一个 Dispatch；
3. freeze inputs 与 requested Dispatch 原子写入；
4. Dispatch 后 inputs 永不可变；
5. accepted Dispatch重放不再次 start；requested ambiguous不自动 retry；
6. terminal Execution不可回到 active/unknown，不可改变 outcome；
7. continuation永远是新 Execution + 新 Binding + 旧 SessionRef input；
8. ResourceObservation只能命中 exact frozen association；
9. Observation不改变 Execution outcome或 Work lifecycle；
10. Provider terminal不自动完成 Work；
11. Core不解释外部产品状态、资源消费或业务 verdict；
12. 插件卸载后历史 facts仍可读。

# Questions requiring adjudication

1. `DispatchCoordinator` 是放入 `src/agent_box/application/`，还是保留 public service
   facade、仅把内部 effect runner移出？建议前者，但需要一次兼容迁移。
2. `ResolvedExecutionInput` 是直接替换 `inputs`，还是先双轨一个版本？建议双轨一版，
   grouped view为只读派生属性。
3. 官方 Harness provider是否只保留 interactive provider + structured review provider
   两种责任模型，还是继续按 transport暴露多个 provider IDs？建议按责任模型，不按
   tmux/browser分裂。
4. tmux operational interface是否先作为 harnesses plugin optional dependency，还是现在
   就提炼为 UI-neutral Console adapter？建议 Harness vertical slice中提炼，Sandbox等
   真实产品选定后再抽共同点。
5. Profile snapshot retention最小周期和存储位置是什么？这是 harnesses plugin policy，
   但必须在历史 replay承诺前裁决。
6. start receipt最小字段是否只保留 correlation，还是允许 Provider立即返回 native Refs？
   建议 correlation必需、native refs可选，随后 observation仍是最终事实来源。
7. crash后 requested Dispatch的 recover hook是否列为Web Preview P0？若录制可能展示Host
   restart，应是P0；否则可以P1但必须维持Ambiguous诚实状态。

# Strongest objections

## Objection 1: “ResourceProvider.resolve 返回一个带 launch() 的对象就够了”

这是最短代码路径，但会把 live mutable controller伪装成 frozen Resource Contract。它
不能持久化、无法安全重建、难以conformance、也让一个普通 resolve调用拥有未声明的
生命周期。短期可用，长期会成为新的 phase-1耦合。反对成立，不推荐。

## Objection 2: “既然 ExecutionProvider最终调用Sandbox，那SandboxProvider就没有意义”

不成立。SandboxProvider/adapter拥有外部 authority和机制；ExecutionProvider拥有
aggregate accountability。正如Git provider验证/物化workspace，而Harness provider
消费workspace启动，两者责任域不同。调用方不等于实现方，机制所有权不等于Dispatch
责任所有权。

## Objection 3: “把 provider调用移出work_core，就是Dispatch不属于Core”

不成立。领域事实和副作用协调不是同一层。Core仍独占创建/迁移Dispatch状态的命令与
不变量；application仅按这套命令执行外部调用。相反，让kernel直接运行任意插件native
effects才会让“纯Core”边界名存实亡。

## Objection 4: “为Sandbox/Console建立插件级接口会重造通用runtime平台”

这是最强的现实反对意见，成立一半。因此本报告不建议现在设计完整Sandbox SPI。先以
host-process和现有tmux完成Harness插件；选定一个真实agent sandbox后，只抽取它与第二个
真实实现共同需要的最小surface。若永远只有一个实现，provider-private adapter即可，
不应晋升标准。

## Objection 5: “一个官方Harness ExecutionProvider会成为opaque composite provider”

风险真实存在。防线不是让Core跟踪每个driver生命周期，而是Binding必须显式列出
Profile、Workspace、Console、Sandbox、capabilities与continuation exact Refs；start
request保留每个Ref；observations逐input对账。只有driver选择和launch composition留在
Provider内部。若内部某participant或sandbox run需要独立retry/outcome/SLA，它必须升级为
独立Execution，而不是继续藏在aggregate provider。

## Objection 6: “当前Core零修改最好，不要碰请求形态”

严格零改动会保留一个信息丢失bug：Core持久化了exact Ref，却在责任交接时只传value。
这直接妨碍Evidence reconciliation，也是任意Sandbox provider路由的隐藏前提。增加一个
非持久envelope不是ontology膨胀；相反，它只是让Dispatch不再丢掉已经治理的事实。这个
小修正比让每个Contract重复嵌入Ref更小、更一致。
