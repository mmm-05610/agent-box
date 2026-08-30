# Agent-Box 架构重设计第三轮 Track B：最小可实施插件组合协议
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

- 日期：2026-08-28
- 范围：Plugin composition、Profile proposals、Harness drivers、Contract loading、snapshot retention
- 方法：对照现有 `PluginRegistration`、`ExtensionRegistry`、WorkBoard adapters 做只读设计
- 明确不做：插件市场、任意前端插件、通用 Sandbox SPI、Core ontology 扩张

# Executive verdict

Round 2 的 blocker 可以用一组兼容增量关闭，不需要重写 Plugin SDK，也不需要把 Profile、Driver、Proposal 或 Snapshot 变成 Core entity。

最小可实施方案是：

```text
现有 Core PluginRegistration
  继续只注册 Contract / ResourceProvider / ExecutionProvider

WorkBoard Host adapter v2
  在现有 prepare-one 基础上增加 profile proposals
  每个 proposal 委托目标 authority adapter 产生 exact Ref

agent-box-harnesses
  一个 official-harness-interactive ExecutionProvider
  Codex/OpenCode/Pi 私有 drivers
  一个 exact HarnessProfile ResourceProvider
  静态 input superset + side-effect-free driver preflight

Host SnapshotStore
  保存 Profile/capability 的 immutable non-secret snapshot

Loader
  build all -> Contract-first staged registration -> Provider registration
```

Preview 交互 Provider 先统一要求现有 `TmuxPaneV1`，而不是同时设计通用 Console SPI。Codex App Server structured review 继续是独立 ExecutionProvider。Sandbox 不进入本轮合同，官方 Provider 明确以 host-process + tmux运行；真实 remote sandbox spike在公开 Driver API 前完成。

本轮最关键的可实现性判断：**Profile adapter不能返回一个已经替其他 authority准备好的 bundle。它只能返回自己的 exact ProfileRef和一组 `InputProposal`；Host逐项调用目标 adapter的现有 `prepare()`，最终仍得到现有 `PreparedInput`。** 这最大程度复用当前 WorkBoard 代码并保持 authority可见。

# Current implementation delta

## `PluginRegistration`

当前只包含：

```python
PluginRegistration(
    contracts=(),
    resource_providers=(),
    execution_providers=(),
)
```

这部分不需要加入 Host adapters、drivers、profiles或snapshot stores。原因：

- Driver是 `agent-box-harnesses` 私有实现，不是全局插件组件；
- Resource selector/control是Host extension，当前已经通过独立 entry-point加载；
- SnapshotStore是Host service，不是Provider；
- Profile仍通过Contract+ResourceProvider进入Core路径。

本轮对 `PluginRegistration` 的唯一行为变化来自 loader：不再按每个entry point立即注册bundle，而是在所有插件build成功后做contract-first staged registration。

## `ExtensionRegistry`

当前优点：

- runtime contract catalog；
- ResourceProvider registration验证 `supported_contract_ids`；
- `register_components()` staged copy，单次调用原子；
- provider按descriptor id查找。

当前缺口：

- ExecutionProvider registration不验证 `input_limits()` 中的contract id；
- loader逐插件调用 `register_components()`，使跨插件Contract受entry-point排序影响；
- registry没有按Contract查候选input adapters，这是Host职责，保持不加。

最小修改：

1. `register_execution_provider()` 校验所有input limit contract均已注册；
2. loader先收集registrations，再用临时registry完成全局contract-first注册；
3. 成功后一次性commit聚合components到目标registry；
4. 不新增dependency entity或package installer。

## WorkBoard adapters

当前接口已经具备最重要的authority边界：

```python
ResourceInputAdapter.prepare(parameters, execution_id) -> PreparedInput
```

一个 adapter拥有selector语义并返回exact Ref。当前不足只有：

- `prepare()` 一次只返回一个input；
- adapter只 `bind(registry)`，拿不到Host-owned SnapshotStore与其他adapter catalog；
- proposal provenance没有标准结构；
-当前WorkBoard entry-point名带UI产品名，不适合作为长期Web/TUI共享SDK。

本轮先在WorkBoard实现兼容v2；稳定后平移到UI-neutral Host SDK。不要同时迁移Web。

# Package shape

```text
agent-box-harness-contracts/             # 很小的共享ABI包，可作为contract-only plugin
  HarnessCapabilityV1
  CredentialSourceV1

agent-box-harnesses/
  plugin.py
  contracts/profile_v1.py
  profiles/provider.py
  profiles/materializer.py
  execution/interactive.py
  drivers/base.py                         # 私有，不承诺第三方ABI
  drivers/codex.py
  drivers/opencode.py
  drivers/pi.py
  host/profile_input.py
  host/control.py

agent-box-tmux/
  现有TmuxPaneV1 + ResourceProvider + controller + input adapter

agent-box-cc-switch/
  read-only schema probes
  capability/credential ResourceProviders
  owning selectors

agent-box-git/
  exact revision/worktree provider

agent-box-workboard/
  Preview唯一mutation Host
  adapter catalog + proposal expansion + SnapshotStore binding
```

为什么需要小型 `agent-box-harness-contracts`：cc-switch生产capability/credential value，harnesses消费；任何一方拥有class都会造成反向implementation依赖。它只是frozen dataclass ABI和registration owner，不是Core功能。若Preview决定暂不接cc-switch capability，则可以暂缓该包，并使用provider-specific spike Contract；不能复制同一class到两个包。

# Official interactive provider

## Provider identity

```text
provider id: official-harness-interactive
responsibility: one visible interactive Harness responsibility window
completion: explicit Finish
drivers: codex, opencode, pi
console for Preview: exactly one TmuxPaneV1
```

不包含：Codex App Server reviewer、team supervisor、remote task-taking agent platform。

## Static input superset

Preview建议静态合同：

```python
def input_limits(self):
    return {
        HarnessProfileV1.contract_id: (1, 1),
        WorkspaceV1.contract_id: (1, 1),
        PromptFragmentV1.contract_id: (1, None),
        TmuxPaneV1.contract_id: (1, 1),
        HarnessCapabilityV1.contract_id: (0, None),
        CredentialSourceV1.contract_id: (0, None),
        CodexContinuationV1.contract_id: (0, 1),
        OpenCodeContinuationV1.contract_id: (0, 1),
        PiContinuationV1.contract_id: (0, 1),
    }
```

这是合法输入的静态superset，不声称任意组合都合法。`TmuxPaneV1` 在Preview设为required，避免为“未来Web terminal”提前造通用Console Contract。未来出现第二个console substrate时再版本化扩展Provider或拆Provider。

## Private driver protocol

Driver API保持包内私有：

```python
class HarnessDriver(Protocol):
    id: str

    def health(self, profile: HarnessProfileV1) -> DriverHealth: ...
    def validate(self, inputs: DriverInputs) -> tuple[DriverIssue, ...]: ...
    def materialize(self, request: DriverMaterializationRequest) -> MaterializedHarness: ...
    def launch_spec(self, materialized: MaterializedHarness) -> NativeLaunchSpec: ...
    def session_ref(self, native_observation: object) -> Ref | None: ...
    def recover(self, durable_facts: DriverRecoveryFacts) -> object: ...
```

它不是Plugin SDK。第三方Harness在Preview注册自己的ExecutionProvider，不向该registry注入driver。等两个外部作者要求复用并通过兼容测试后再考虑公开。

## Common capabilities

Provider级 `capabilities()` 只返回三driver共同成立的能力：

```text
start=supported
observe=supported
interactive=supported
attach=supported                 # 由required tmux保证
explicit-finish=supported
continuation=driver-dependent    # 不伪装成supported/absent
recovery=driver-dependent
```

现有capability值只接受普通字符串，Host可把 `driver-dependent` 当展示值，不能用Core `require_capability()` 放行。需要门禁的driver能力由preflight决定。若现有conformance只允许任意 `Mapping[str,str]`，无需改Core。

# Side-effect-free preflight

## Why it is required

静态superset会允许 `Pi Profile + CodexContinuation` 通过Core数量检查。若到`start()`才拒绝，Git/tmux等effectful resolve可能已经发生。

Round 2已拒绝“所有resolve必须pure”的绝对规则，因此最小做法是区分preflight需要的identity/config contracts与materializing contracts。

## Optional provider extension

不立即修改基础 `ExecutionProvider` Protocol的五个既有方法。Plugin SDK增加可选duck-typed extension：

```python
@dataclass(frozen=True)
class FrozenInputRef:
    contract_id: str
    ref: Ref

@dataclass(frozen=True)
class ResolvedPreflightInput:
    contract_id: str
    ref: Ref
    value: object

@dataclass(frozen=True)
class ExecutionPreflightRequest:
    execution_id: str
    dispatch_id: str
    inputs_digest: str
    frozen_inputs: tuple[FrozenInputRef, ...]
    resolved_inputs: tuple[ResolvedPreflightInput, ...]

class PreflightExecutionProvider(Protocol):
    def preflight_contract_ids(self) -> frozenset[str]: ...
    def preflight(self, request: ExecutionPreflightRequest) -> None: ...
```

`official-harness-interactive` 的preflight contracts：Profile、三个Continuation、capability descriptors、credential source descriptors。Workspace和Tmux无需materialize即可按Ref存在性做静态检查，但其resolved path/pane value不参与driver选择。

## Resource effect declaration

ResourceProvider增加可选查询，不改现有required Protocol：

```python
class ResolutionEffect(str, Enum):
    PURE = "pure"
    IDEMPOTENT_MATERIALIZATION = "idempotent_materialization"

class ResolutionSemanticsProvider(Protocol):
    def resolution_effect(self, contract_id: str) -> ResolutionEffect: ...
```

兼容默认必须保守：没有该方法的legacy provider视为 `IDEMPOTENT_MATERIALIZATION`，不能被preflight提前调用。Profile、prompt、continuation、capability和credential descriptor providers必须声明PURE；Git worktree与managed tmux console声明materialization。现有exact existing `TmuxPaneV1.resolve()`若只read-back可以标PURE，但创建managed console的Contract不能。

## DispatchCoordinator sequence

本Track依赖Round 3 Track A提供exact Ref/value envelope与accepted replay修复。组合时序：

```text
1. Core static limits + freeze/requested
2. Host读取provider.preflight_contract_ids()
3. 只调用声明PURE的相关ResourceProvider.resolve()
4. provider.preflight()验证driver-specific组合
5. resolve其余inputs；effectful resolve必须由exact Ref幂等
6. 构造唯一ResolvedExecutionInput序列
7. provider.start()再次验证并启动
8. accepted/failed
```

若preflight要求的Contract由legacy/effectful provider生产，Dispatch在任何resolve前失败并提示plugin不兼容，不能偷偷降级到late validation。

## Driver preflight rules

```text
selected driver = profile.driver_id
exactly one matching continuation or none
all nonmatching continuation contracts forbidden
profile driver/version supported
capability kinds compatible with driver
credential source kinds/materialization channel compatible
no duplicate effective config destinations
continuation lease/concurrency safe
```

Preflight不创建目录、不读取secret value、不启动binary、不访问网络。`start()`重复检查关键driver/continuation identity以防TOCTOU。

# Profile contract and exact Ref

## `HarnessProfileV1`

```python
@dataclass(frozen=True)
class HarnessProfileV1:
    contract_id: ClassVar[str] = "agent-box.harness-profile@1"

    name: str
    driver_id: str
    revision: str
    declaration_digest: str
    snapshot_ref: Ref                 # Host-owned ArtifactRef
    materialization_schema: str
```

Contract不包含：secret、MCP payload、plugin bytes、session state、writable path、Sandbox policy。

Profile Ref：

```text
type=ArtifactRef
provider=official-harness-profiles
native_id=sha256:<canonical declaration>
uri=agent-box-artifact://sha256:<same or snapshot digest>
metadata=name,driver,revision,schema
```

`resolve()`从Host SnapshotStore按digest读取immutable declaration，验证Ref与snapshot一致并返回`HarnessProfileV1`。Profile目录的当前内容改变不影响旧Ref；若Host snapshot缺失则明确unavailable。

# Host-owned SnapshotStore

## Minimum service

```python
class SnapshotStore(Protocol):
    def put_json(
        self,
        value: Mapping[str, object],
        *,
        media_type: str,
        producer_id: str,
    ) -> Ref: ...

    def read_json(self, ref: Ref) -> Mapping[str, object]: ...
```

约束：

- content-addressed、immutable、atomic write；
- path由digest派生，不接受插件提供filesystem path；
- JSON类型和size有界；
- producer负责传入non-secret allowlisted结构；Host做明显secret-key诊断但不声称能发现全部secret；
- URI由Host可解析，插件卸载后仍可读取；
- WorkBoard evidence/read model对missing snapshot明确显示unavailable。

它不是Core Artifact entity。Core仍只保存普通ArtifactRef/Ref association。

## Adapter context compatibility

新增：

```python
@dataclass(frozen=True)
class HostInputContext:
    registry: ExtensionRegistry
    snapshot_store: SnapshotStore
    adapters: "InputAdapterCatalog"

class HostBoundInputAdapter(Protocol):
    def bind_host(self, context: HostInputContext) -> None: ...
```

加载兼容逻辑：

```python
if hasattr(adapter, "bind_host"):
    adapter.bind_host(host_context)
else:
    adapter.bind(host_context.registry)       # v1 unchanged
```

现有Git/Artifact/Profile/tmux adapters无需立即修改。新Harness Profile adapter使用SnapshotStore和adapter catalog。

# ProfileInputProposal protocol

## Data shape

```python
@dataclass(frozen=True)
class InputProposal:
    target_adapter_id: str
    contract_id: str
    parameters: Mapping[str, str]       # non-secret selectors only
    reason: str
    requirement: Literal["required", "recommended"]
    proposed_by: str

@dataclass(frozen=True)
class PreparedInputExpansion:
    primary: PreparedInput
    proposals: tuple[InputProposal, ...] = ()
```

不新增Core Binding bundle。`primary`是Profile adapter自己有权准备的exact ProfileRef；proposal只是Host draft指令。

## Compatible adapter extension

保持现有：

```python
prepare(...) -> PreparedInput
```

增加optional方法：

```python
class ProposingResourceInputAdapter(ResourceInputAdapter, Protocol):
    def proposals(
        self,
        prepared: PreparedInput,
        parameters: Mapping[str, str],
        *,
        execution_id: str,
    ) -> tuple[InputProposal, ...]: ...
```

为什么不用把`prepare()`返回值改成union：现有WorkBoard调用、测试和第三方adapter都继续成立；Host先调用prepare，再探测proposals。

## Host expansion algorithm

```text
profile_adapter.prepare()
-> exact Profile PreparedInput
-> profile_adapter.proposals()
-> for each proposal:
     lookup target_adapter_id
     verify adapter.contract_id == proposal.contract_id
     reject secret FormField supplied by proposal
     call target_adapter.prepare(parameters, execution_id)
     record proposed_by + resolved_by(adapter.id)
-> show all items in Binding review
-> user may replace recommended item through owning adapter UI
-> required item removal blocks Host Launch; provider.preflight remains authority
```

安全边界：

- expansion depth固定为1；目标adapter的proposals不递归执行；
- proposal总数有界；
- adapter id必须exact匹配，不按title/contract猜；
- proposal parameters不能填目标adapter的`secret=True`字段；
- owning adapter仍可拒绝invalid/missing selector；
- Profile adapter不能访问cc-switch DB、tmux或Git实现。

## Draft provenance

Host draft item增加非Core字段：

```text
proposed_by
resolved_by
proposal_reason
requirement
```

Freeze时仍只提交 `(contract_id, Ref)`。ProfileRef本身及其Host snapshot保留“为什么这些defaults被提出”的长期来源；无需把draft provenance加入Core schema。

# Execution-private materialization

## Directory model

```text
$AGENT_BOX_HOME/plugins/harnesses/
  declarations/<profile>/...             mutable authoring source

$AGENT_BOX_HOME/artifacts/sha256/...      immutable Host snapshots

$AGENT_BOX_HOME/runtime/<execution-id>/
  config/                                 private effective config
  state/                                  private Harness writable state
  sessions/                               private unless explicit continuation import
  cache/
  tmp/
  manifest.json                           redacted
```

Profile authoring source绝不直接writable mount给Harness。materializer从frozen Profile snapshot和capability snapshots生成execution-private tree。

## Materialization transaction

```text
create temp runtime dir
-> render allowlisted config
-> link/copy immutable skills/plugins read-only
-> install credential locators/channels, not values in manifest
-> import explicit continuation state under driver lock
-> write redacted manifest
-> atomic rename to execution runtime dir
```

若同execution/idempotency replay发现同manifest digest的runtime已存在，read-back并复用；digest不同则拒绝。cleanup由Provider/Host policy执行，Host-owned evidence snapshot在cleanup前完成。

## Driver-specific mapping

| Driver | Private writable root | Shared/read-only inputs | Continuation rule |
| --- | --- | --- | --- |
| Codex | execution `CODEX_HOME`/state | base config、skills、MCP definitions | exact thread/session Ref；必要state受锁导入 |
| OpenCode | execution config/data/state roots | plugin/skill sources、MCP definitions | exact native session locator；不扫描其他profiles |
| Pi | execution `agentDir` + `sessionDir` | extension/skill/prompt sources | explicit session file/id；同session并发拒绝 |

若实测某Harness无法把session与global auth分开，driver必须声明限制并使用credential reference重新注入；不能退回复制整份host home。

# cc-switch proposal path

Profile snapshot可声明non-secret defaults：

```json
{
  "mcp": [{"adapter": "cc-switch.mcp", "selector": "knowledge-brain"}],
  "credential_sources": [
    {"adapter": "cc-switch.credential", "selector": "deepseek-main"}
  ]
}
```

Profile adapter只转成InputProposal。cc-switch adapters：

- 在一个SQLite read transaction内prepare public definition snapshot；
- MCP adapter返回definition Ref/digest，不含env/header secret values；
- credential adapter返回opaque source Ref；
- unknown schema或deleted row拒绝prepare；
- Resolve阶段public definition可从Host snapshot读取；credential value只在materialization时按opaque source读取；
- secret value/revision不可证明时Observation标unknown/unverifiable。

这条路径证明cc-switch不是Harness plugin依赖：Harness只消费neutral Contract value，Profile只持selector default。

# Contract-first loader

## Required behavior

不增加package manager或完整dependency descriptor。依赖来源分两层：

- Python import/version：`pyproject.toml` / pip；
- runtime semantic dependency：provider的 `supported_contract_ids` 与 `input_limits()` 自动推导。

## Staged fixed-point algorithm

为了保留“失败插件不污染registry”，建议：

```text
1. discover/factory/descriptor/build all plugins without registry mutation
2. reject duplicate plugin ids and duplicate contract owners
3. candidate set = structurally valid registrations
4. repeat:
     create clean trial registry with built-ins
     register all candidate contracts first
     register each candidate ResourceProvider and ExecutionProvider
     validate input_limits against full contract catalog
     collect failed plugins and plugins with missing contracts
     remove failures
   until no changes
5. aggregate remaining components into target registry once
6. report deterministic dependency failure chain
```

为什么需要fixed point：若A拥有Contract但自身provider invalid，原子plugin语义要求A整体退出；消费A Contract的B随后也必须退出。简单“先把全部Contract永久注册”会留下ghost owner。

PluginLoadRecord增加可选结构化failure code/detail即可，不新增Core对象：

```text
MISSING_CONTRACT
DUPLICATE_CONTRACT_OWNER
PROVIDER_INVALID
DEPENDENCY_FAILED
API_INCOMPATIBLE
```

P0不做：自动安装、semver solver、optional dependency graph、hot reload。可选integration由plugin在build时不注册相关input/driver，或Preview直接把tmux声明为Python required dependency。

# Six counterexample validations

## C1 — Codex Profile + Pi continuation

Inputs通过static superset。Profile pure resolve得到driver=codex，preflight发现PiContinuation并在任何Git/tmux materialization前拒绝。

验收：没有新worktree、pane runtime、profile runtime；Dispatch failed包含driver mismatch，无provider.start。

## C2 — OpenCode binary缺失但其他drivers可用

Plugin build不得`which(opencode)`失败。driver health显示OpenCode UNAVAILABLE；Codex/Pi Profile仍可preflight/start。选择OpenCode Profile时preflight side-effect-free失败。

验收：plugin整体READY，driver health分项；Provider common capabilities不谎报OpenCode能力。

## C3 — Pi同一Session并发continuation

E2/E3使用同一Pi SessionRef。preflight或materialization lease只允许一个active importer/controller，另一Execution在写session前失败。

验收：两个Core Execution identity仍存在；没有共享writable session dir；失败者不污染成功者。

## C4 — tmux entry-point排序在harnesses之后

随机改entry-point names使harnesses先被discover。contract-first trial先注册TmuxPaneV1，再注册interactive provider。

验收：registry结果与排序无关。卸载tmux后harnesses明确DEPENDENCY_FAILED，不能半READY却在Dispatch才报unknown contract。

## C5 — cc-switch在Profile选择后发生变化

Profile proposal指定MCP selector。cc-switch adapter在prepare时把public definition存Host snapshot并返回exact digest；freeze后live row变化。

验收：Dispatch使用旧snapshot或明确报告drift，不能静默使用新definition。credential secret轮换不改变public digest；Evidence明确secret revision不可验证。

## C6 — cc-switch插件缺失

Profile declaration仍可从Host snapshot查看；proposal target adapter缺失，Host Binding draft显示unavailable，不能让Profile adapter自己读SQLite或伪造Ref。

验收：用户可替换为local capability provider；否则required proposal阻止Launch。

## C7 — Codex/OpenCode共享skill source但独立可写state

两个Execution绑定同一skill ArtifactRef、不同Profile和tmux pane。materializer以read-only/link或verified copy投影相同digest，分别创建private state/cache。

验收：skill source digest一致；修改Codex runtime state不改变OpenCode；不能修改shared source。

## C8 — Host崩溃后snapshot和plugin状态

Execution运行中重启Host。内存driver handle消失；Profile/capability snapshot仍在Host store，native SessionRef/tmux Ref仍在Core/Provider evidence。

验收：按provider声明的recovery level恢复observe/attach或明确none；绝不重新start/resolve accepted Dispatch。

# Compatibility migration

## Phase 1 — Protocol support without moving products

1. Track A先落地accepted replay不resolve和exact Ref/value envelope。
2. ExtensionRegistry增加ExecutionProvider contract validation。
3. Loader改contract-first staged fixed point，保持entry-point和PluginRegistration shape不变。
4. WorkBoard adapter loader支持`bind_host()` fallback到旧`bind(registry)`。
5. WorkBoard Host支持optional `proposals()`，现有adapter零修改继续工作。
6. 增加Host SnapshotStore和临时draft provenance字段。

## Phase 2 — Codex vertical slice

1. 新建HarnessProfileV1和profile provider/adapter；不要复用legacy `AgentBoxProfileV1` 含义。
2. `agent-box-harnesses` 只启用Codex driver和required TmuxPaneV1。
3. materialize execution-private config/state；可临时调用抽取后的legacy Codex mapping，但不能调用会硬编码bwrap的`build_launch_plan()`。
4. 跑fresh、multi-turn、Finish、new Execution + continuation。
5. 旧`agent-box-codex`保留但provider id不同，Demo只选择新provider。

## Phase 3 — Prove multi-driver

1. 加OpenCode或Pi其一；优先选择session/state root最可控者。
2. 跑C1/C2/C3/C7。
3. 只有复用代码真实减少且lifecycle仍一致，才加入第三driver。

## Phase 4 — cc-switch bridge

1. 增加neutral capability/credential contracts；
2. profile proposals逐项委托cc-switch adapters；
3. 通过C5/C6和secret absence tests；
4. 删除Host/Web对`adapters/acs.py`直接import，但暂不删除legacy代码。

## Phase 5 — retire legacy

新路径跑通并录制后才按调用链删除：legacy profile GUI/TUI、直接launch、ACS apply、Core内product ResourceProviders。bwrap代码保留experimental/spike，不纳入本协议。

# Minimal test plan

## Loader

- entry-point permutation property test；
- duplicate Contract owner；
- missing owner；
- owner provider invalid导致consumer fixed-point removal；
- ExecutionProvider unknown input contract拒绝；
- old single plugin registration继续通过。

## Host adapters

- v1 prepare-only adapter完全兼容；
- proposal delegated toexact target adapter；
- wrong contract/adapter mismatch拒绝；
- proposal secret field拒绝；
- no recursion/max count；
- draft显示proposed_by/resolved_by；
- missing adapter可替换/阻止Launch。

## Profile/materialization

- snapshot content-addressed且修改source不影响旧Ref；
- plugin runtime dir删除后Host snapshot仍可读；
-三并发Execution无writable path共享；
- manifest不含secret；
- same execution same digest idempotent reuse；
- same execution different digest拒绝；
- continuation lease冲突拒绝。

## Provider

- static superset counts；
- preflight在effectful resolver前；
- driver mismatch不产生副作用；
- per-driver health；
- start重复关键validation；
- native session Ref与exact inputs observations逐项关联。

# What remains deliberately private

以下内容不进入本轮公共SDK：

- HarnessDriver Protocol；
- NativeLaunchSpec跨sandbox语义；
- generic Console/Sandbox controller；
- driver package entry point；
- capability policy language；
- credential injection implementation；
- arbitrary React page/plugin；
- plugin background worker；
- plugin marketplace/install/update/signature。

# Risks

## Fixed-point loader complexity

它比当前逐插件循环复杂，但范围仍小：只处理已安装的Python entry points与contract dependencies，不安装、不求semver、不热更新。若实现成本超出Preview，可采用更保守的临时规则：官方cross-plugin contracts全部放入一个必装contract-only plugin，并在Host bootstrap中先加载该entry-point组；但不能依赖字母排序。

## Preflight drift

preflight与start之间外部资源可能变化。exact Ref/digest validate与start重复关键检查仍必需；preflight只消除已知invalid combination的早期副作用，不承诺消除TOCTOU。

## Snapshot secret hygiene

Host secret scanner不可能证明没有secret。官方adapters必须使用allowlist serializer，测试常见token/header/env字段不出现。第三方plugin仍是trusted code，产品文案不能说“Agent-Box保证插件不会泄密”。

## Static superset UX

如果Composer直接展示所有三种continuation，会很混乱。Host在Profile选择后按driver health/compatibility隐藏不相关selector，但Audit/Provider detail仍显示这是static superset。UI过滤不是Core校验，preflight仍必须。

# Final implementation decision

本Track建议批准以下最小协议：

```text
KEEP unchanged
  PluginRegistration shape
  agent_box.plugins entry-point
  existing ResourceInputAdapter.prepare() -> PreparedInput
  Work Core ontology

ADD compatibly
  contract-first staged loader
  EP input contract registration validation
  optional ResolutionEffect declaration
  optional ExecutionProvider preflight
  HostInputContext + SnapshotStore
  optional adapter.proposals() -> InputProposal[]
  execution-private profile materializer

IMPLEMENT privately first
  one official interactive EP
  Codex/OpenCode/Pi driver registry
  static input superset
  driver health/validation

DEFER
  public Driver SDK
  generic Sandbox/Console SPI
  Web mutation
  marketplace/security claims
```

结论：**可实施，但必须按“协议支持 -> Codex vertical slice -> 第二driver验证 -> cc-switch bridge”的顺序。** 如果跳过preflight、authority delegation或execution-private writable state，单插件多Harness方案应被取消，继续使用分离的ExecutionProviders。
