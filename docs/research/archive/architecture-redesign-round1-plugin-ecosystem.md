# Agent-Box 架构重设计第一轮：官方插件与第三方生态
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

- 日期：2026-08-28
- 视角：官方参考插件、第三方可复制性、跨插件组合边界
- 方法：只读审计当前仓库；复用仓库内已完成的 2026 官方资料研究，不重复市场调研
- 本轮限制：不修改 Core、不实现插件、不决定具体 Sandbox 产品

# Executive verdict

目标方向成立，但不能直接开始把一期 GUI/CLI 搬进一个大插件。推荐的形态是：

```text
Agent-Box Core
  只保存 Work / Execution / frozen inputs / Dispatch / Ref / Observation

Agent-Box Host + Web Workbench
  管理 draft、selector、展开候选输入、review、freeze、attach、finish

agent-box-harnesses
  一个 accountable InteractiveHarnessExecutionProvider
  + 多个内部 Harness driver
  + layered Profile authority/materializer

独立资源插件
  agent-box-tmux
  agent-box-git
  agent-box-cc-switch
  future agent-oriented sandbox plugin
```

“一个插件支持多个 Harness”是合理的，前提是它们共享同一种责任语义：用户在一个持续的交互责任窗口中使用原生 Harness，最后显式 Finish。Codex、OpenCode、Pi 可以作为同一个 `InteractiveHarnessExecutionProvider` 的内部 driver；Profile 决定 driver。若某个产品接受完整任务、自主管理 run、重试并给出 terminal outcome，它应注册另一个 ExecutionProvider，而不能假装成 driver 或 Sandbox。

现在最不应做的事情，是提前定义一个看似通用的 Sandbox Python 行为协议并把 bwrap 套进去。当前只有本地 bwrap 实现，没有第二种异构实现来校验字段和保证。可以保留 `SandboxRef` 这一产品概念及 Binding slot 设计，但正式 Contract 应等待至少一个 agent-oriented sandbox spike；bwrap 留作 experimental/local fallback。

本轮发现四个必须先补或明确的生态缺口：

1. 当前 `ResourceInputAdapter.prepare()` 只能返回一个 `PreparedInput`，不能在 freeze 前把一个 Profile declaration 展开成多个可见、独立的 capability/credential inputs。
2. Plugin SDK 只有 Core 的 Contract/ResourceProvider/ExecutionProvider 注册面；attach/recover/finish 和 selector 仍是 WorkBoard 私有 entry point，Web Host 尚无稳定的 Host extension SDK。
3. 跨插件 Python 依赖没有显式插件依赖和加载拓扑。`pip` 能保证模块存在，却不能保证依赖插件的 Contract 已先注册。
4. 现有 Profile 与 launch 仍在主包中直接依赖一期 `agent_types.json`、cc-switch SQLite schema 与 bwrap；直接迁移会把旧耦合原样复制到官方插件。

因此建议的决策是：**架构方向批准，先补 Host 插件面与依赖规则，再迁移 Codex vertical slice；Core 语义不需要重开。**

# Repository audit

## Core 与 Plugin SDK 当前事实

当前 Core 已具备正确的最小分界：

- `ExecutionService.dispatch_execution()` 在一个 Dispatch 前固定 `(contract_id, Ref)` 集合，计算 digest，按 `Ref.provider` resolve，并把类型化结果交给唯一 ExecutionProvider。
- `Resource Contract` 是注册到运行期 registry 的 frozen dataclass；Core 不认识 Git、Codex、tmux 等产品。
- `ResourceObservation` 是针对 frozen input 的追加事实，区分 projected、read-back 和 consumption-reported，不裁决 observer 的可信度。
- 插件通过单一 `agent_box.plugins` entry point 原子注册 Contract、ResourceProvider、ExecutionProvider。
- 卸载插件后，Ref、contract id、input association 与 observations 仍以数据形式可读；只是不能再 resolve/start。

这些边界足以承载新架构，不需要增加 Harness、Profile、Sandbox、MCP 或 Credential Core entity。

## 当前实现中的产品耦合

以下代码仍属于一期产品形态，而不是长期 Core/Host 边界：

- `src/agent_box/launch.py` 同时读取 Profile、agent type registry、project surface，生成 bwrap mounts 并启动 native binary。
- `src/agent_box/core/agent_types.json` 同时描述 Harness identity、路径、resource surface 与 sandbox 参数。
- `src/agent_box/adapters/acs.py` 直接理解 cc-switch/ACS SQLite 表与列，并依赖 Agent-Box agent type registry 选择列名。
- `src/agent_box/resources/*/apply.py` 将 MCP、skills、prompt、provider 配置复制/转换进 Profile tree。
- `src/agent_box/work_core/providers/resources.py` 仍含 Git、Artifact、Agent-Box Profile 等产品实现，虽然 Plugin SDK 已能让它们迁出 Core。
- `agent-box-codex` 直接调用主包的 `build_launch_plan()`，因此 Codex 插件实际上仍依赖 legacy Profile+bwrap launch stack。

这说明“把 Codex/OpenCode/Pi 合并成一个插件”本身不会自动清理架构；必须先把 declaration、materialization、driver 和 execution responsibility 分开。

## 当前 tmux 集成提供的有效范例

tmux 已经证明了可组合资源的基本形态：

```text
TmuxPaneInputAdapter
  selector (%N) -> exact pane Ref

TmuxConsoleResourceProvider
  exact Ref -> TmuxPaneV1/TmuxConsoleV1

Codex/Pi ExecutionProvider
  import tmux contract/controller -> launch into pane
```

它也暴露了生态问题：

- `TmuxConsoleResourceProvider()` 在 plugin `build()` 时查询 binary/version，发现阶段可能因宿主环境失败；这违反“发现无副作用、能力首次使用时才检查”的长期方向。
- Codex/Pi 直接依赖 `agent-box-tmux` 的 Python contract 和 controller。这对明确的官方集成可以接受，但不是一个通用 Console Contract。
- tmux Contract 是数据，真正的 `launch/inspect/capture/cleanup` 在 tmux 包的 controller 中；这说明跨插件的运行期行为不能假装只靠 frozen dataclass 解决。

# Is one plugin for multiple Harnesses appropriate?

## 支持的理由

Codex、OpenCode、Pi 的交互式路径有共同责任模型：

```text
accepted Dispatch
-> materialize exact inputs
-> launch native CLI/TUI
-> keep Execution ACTIVE across multiple turns/idle
-> observe native session/process
-> explicit Finish
-> collect outputs/evidence
-> terminal
```

它们也共享同一个组合管线：Profile、Workspace、context fragments、optional Console、optional Sandbox、optional continuation。因此一个官方包能避免三套重复的 profile selector、credential hygiene、manifest 和 Host control 实现，并成为第三方 driver 的参考。

## 成立的必要约束

`agent-box-harnesses` 必须是 driver registry，不是 agent supervisor：

```text
InteractiveHarnessExecutionProvider
  owns accountable start/observe/recover/finish
  selects exactly one driver from frozen Profile

HarnessDriver
  owns native argv/env/config/session extraction/resume semantics
  does not own Core lifecycle or Dispatch
```

一个 Execution 默认只选择一个 Profile/driver。多个 participant 若未来进入一次 team Execution，应由另一个明确的 Team ExecutionProvider 负责，不能让 interactive provider 暗中启动任意数量 Harness。

## 反例与拆分规则

下列能力不应被塞进同一个 interactive provider：

- Codex App Server 的一次结构化、无交互 review，如果它的 accepted Dispatch、completion 和 recovery 与 TUI 窗口不同，应成为单独的 Review ExecutionProvider（可以仍在同一发行包）。
- 一个远程 agent service 若直接接收 objective、管理 agent run/retry 并返回 run outcome，它是 ExecutionProvider。
- 一个产品若只提供 filesystem/process/PTY/secret injection，它是 Sandbox ResourceProvider。
- 一个 driver 若需要独立 retry/outcome/SLA，它已跨过 driver 边界，应升级为独立 Execution。

## 当前静态 input limits 的限制

Core 的 `input_limits()` 是 ExecutionProvider 级静态 mapping。一个由 Profile 动态选择 driver 的 provider，无法声明“Codex 必须有 CodexContinuation、Pi 必须有 PiContinuation”这类条件约束。

Preview 可接受的最小处理是：

1. Provider 声明所有 driver 的安全上界，driver-specific input 为 optional；
2. Host 根据已选择的 Profile 过滤/建议兼容输入；
3. `start()` 在任何副作用前再次验证 driver-specific constraints；
4. 不为此修改 Core 或发明 conditional slot language。

若未来两个以上 ExecutionProvider 都需要条件输入，才考虑扩展 Host-level compatibility schema；现在不要把它加入 Core。

# Layered Profile model

## 必须区分的三层

```text
Profile declaration（长期、版本化、无 secret）
  driver id
  base config revision
  defaults/recommended capability selectors
  compatibility requirements

Profile overlay source（Profile-local、可修改）
  local config overrides
  trust/approval defaults
  driver-required compatibility files

Execution materialization（Execution-scoped）
  effective config
  writable session/temp/cache roots
  projected capability files/links
  redacted runtime manifest
```

“独立 writable overlay + shared refs”不应理解为所有并行 Execution 共同写一个 Profile overlay。并发安全要求：**Profile overlay 是输入源；本次运行的可写状态必须 execution-scoped。** 如果 Harness 只能把 config 与 session 写在同一 home，driver 应从 profile source 生成本次私有 home，而不是把共享 profile tree 直接 writable mount 给多个 Execution。

continuation 是例外但不是共享整个 home 的理由。新 Execution 通过旧 SessionRef 指定 native session；driver 可以只映射/恢复该 session 所需状态。若 Harness 原生只能依赖同一 state home，插件必须把这个限制写进 compatibility/evidence，并在并发 continuation 时拒绝不安全启动。

## ProfileRef

ProfileRef 应表达一个 exact declaration revision，而不是只写 profile name：

```text
Ref.type: ArtifactRef（Preview 可继续使用现有枚举）
Ref.provider: official-harness-profiles
Ref.native_id: sha256:<canonical non-secret declaration>
Ref.uri: agent-box-harness-profile://codex-plus/revisions/3
metadata:
  name=codex-plus
  driver=codex
  revision=3
  schema=agent-box.harness-profile@1
```

完整 declaration 应在插件自己的 content-addressed store 中，不能塞进 Ref.metadata。metadata 有 16 项、每项 256 字符的边界，也不适合配置 payload。

`resolve()` 返回纯数据 `HarnessProfileV1`：profile name、driver id、revision、declaration digest、base/overlay snapshot locators、允许的 materialization mode。不得包含 secret value，也不得在 resolve 时偷偷追加 frozen inputs。

## Capability refs

以下能力应成为独立、可见的 Binding inputs，而不是藏进 ProfileRef：

- MCP definition/source revision；
- plugin/skill set revision；
- credential source identity；
- workspace；
- console；
- future sandbox；
- continuation session；
- context/prompt artifacts。

Profile 可以提出 defaults，但 defaults 是 Host draft 行为，不是 Dispatch 后的隐式依赖。用户在 freeze 前必须能看到展开结果，并能按 Provider 兼容性增删。

## Credential refs

CredentialSourceRef 只能固定来源 identity 和可公开 revision（若 authority 提供），不能固定 secret value：

```text
provider=cc-switch-credential / os-keyring / env-credential
native_id=<opaque source id>
metadata=authority, account label, optional public revision
```

若外部 authority 没有 secret revision，UI/Evidence 必须写明：source identity frozen，secret value/revision unverifiable。不能为了得到“exact digest”而 hash secret；可离线猜测的 API key hash同样是敏感衍生物。

# Freeze-before-expansion rule

正确时序必须是：

```text
选择 Profile selector
-> Profile Host/Input Adapter 读取 exact declaration
-> 产生 Binding draft proposal：
   ProfileRef
   + capability refs
   + credential source refs
   + recommended sandbox/console selectors
-> 各 Resource Input Adapter 把 selector resolve 为 exact Ref
-> UI 显示每个独立 input、来源、revision、assurance
-> 用户 review
-> Core freeze + Dispatch
-> ResourceProviders 分别 resolve frozen refs
```

当前 `ResourceInputAdapter.prepare()` 只返回一个 `PreparedInput`，不能实现该流程。最小 Host SDK 修正应允许返回一个**候选 bundle**：

```python
@dataclass(frozen=True)
class PreparedInputBundle:
    inputs: tuple[PreparedInput, ...]
    source_adapter_id: str
    explanation: str
```

这仍是 Host draft，不是 Core Binding entity；每个 `PreparedInput` 最终仍按原有 `(contract_id, Ref)` 交给 Core。UI 可把它们视觉折叠到 Profile 下面，但 review 中必须展开，且用户移除 required dependency 时 Host 应阻止 Launch 或显示 provider validation error。

更保守的 Preview 方案是：Profile adapter 只准备 ProfileRef，随后 UI 根据 declaration 自动打开/预填其他已有 adapter。无论哪种实现，都不能让 `ProfileResourceProvider.resolve()` 在 freeze 后“展开”输入。

# agent-box-harnesses design

## 包内结构

```text
agent-box-harnesses/
  plugin.py
  contracts/
    profile_v1.py
    continuation contracts（仅共享语义成立时）
  profiles/
    declaration.py
    store.py
    provider.py
    materializer.py
  drivers/
    base.py
    codex.py
    opencode.py
    pi.py
  execution/
    interactive.py
    handles.py
    observations.py
  host/
    profile_selector.py
    profile_bundle_adapter.py
    interactive_control.py
  manifests/
    runtime.py
    redaction.py
```

## InteractiveHarnessExecutionProvider

它是唯一 accountable launch owner，必须实现：

- 在任何 native side effect 前检查 Profile/driver 及全部 resolved inputs；
- 调 driver 生成 native `ProcessSpec` 和 projection plan；
- 若有 Sandbox capability，委托 Sandbox 创建/启动；否则明确走 host-process mode；
- 若有 TmuxRef，使用 tmux controller 将最终命令放入 pane；
- 获取 native SessionRef/RunRef；
- observe/recover/attach/explicit finish；
- 最终收集 output refs、manifest digest 和 ResourceObservations。

Driver 不应接收整个 `ExecutionStartRequest` 后自行寻找任意 input；provider 应先形成一个经过验证的内部 `HarnessExecutionPlan`，再交给 driver/materializer。这避免每个 driver 重新实现 Binding 解释。

## 一个插件的发布风险

一个包多 Harness 会扩大版本与依赖 blast radius。Preview 应采取：

- Python 包不硬依赖 Codex/OpenCode/Pi binary；doctor 按 driver 分别显示 READY/PARTIAL/UNAVAILABLE；
- driver import 延迟到选择该 Profile 后；
- 每个 driver 有独立 conformance/vertical tests；
- Profile schema 与 driver implementation version 分开；
- 一个 driver 故障不得使整个插件 discovery 失败；
- 可以用 Python extras 管理可选 SDK，但 CLI binary 仍是外部 requirement。

如果做不到 per-driver failure isolation，一个 monolithic plugin 会比三个插件更脆弱。此项是采用单包方案的验收门槛。

# agent-box-cc-switch bridge

## 定位

`agent-box-cc-switch` 是 optional、read-only catalog/resource authority bridge：

```text
cc-switch owns mutable catalog and credential sources
agent-box-cc-switch probes schema, normalizes, snapshots, prepares Refs
Agent-Box freezes selected Refs
agent-box-harnesses consumes resolved standard capability values
```

它不是 Profile store、ExecutionProvider、双向同步器，也不能成为 Web UI 的私有数据库后端。

## 隔离 schema 耦合

当前 `adapters/acs.py` 直接写 SQL 并用 `agent_types.json` 中的 `acs_column` 选择产品列。迁移时应把耦合压缩在：

```text
schema/probe.py
schema/vX.py
fixtures/cc-switch-vX.db
normalization/public_definition.py
normalization/secret_locator.py
```

插件必须：

- 用 read-only SQLite URI 打开数据库；
- probe 支持的 schema signature/version；
- 未知 schema fail closed，不自动 migration；
- fixture 测试每个支持版本；
- 不依赖 Agent-Box agent type registry 来拼列名；
- 不将 cc-switch row 原样暴露成 Contract。

若 cc-switch 未来提供稳定 API，只替换 authority adapter，Ref/Contract 与 Harness 消费端不变。

## Mutable source 与 exact Ref

MCP/plugin/skill 公共定义应 canonicalize、redact secret locator 后计算 digest，并保存 immutable snapshot Artifact。Binding 冻结 snapshot Ref；Dispatch 时 bridge 可读回 snapshot，必要时也可比较 live catalog 并报告 drift，但不能静默升级到最新 row。

credential source 只能冻结 opaque identity。若 cc-switch 没有 credential revision，则不能声称 exact secret pin。`resolve()` 在启动时读取当前 secret 并以 env/private file/OS credential channel 注入，Observation 只能报告 source reference projected，不能记录 value。

## 不建议的依赖方向

`agent-box-harnesses` 不应 import `agent-box-cc-switch`。两者只通过 neutral capability Contract 连接。否则卸载 cc-switch 会使所有 Harness driver import 失败，也会使“local profile + local MCP”这种组合不存在。

# tmux and Git resource plugins

## tmux

tmux 与 Sandbox 正交：

```text
SandboxRef -> 进程在哪里运行、filesystem/network/secret policy
TmuxRef    -> 本地用户在哪里看到/控制 PTY
```

本地 bwrap/Docker 可以形成 `tmux pane -> sandbox launcher -> harness process`。远程 sandbox 则可能需要 stream bridge；若做不到，TmuxRef 应为 optional，Web terminal 直接连接远程 PTY。不能要求所有 Sandbox 都支持 tmux。

Preview 保留现有 tmux plugin-specific Contract/controller，不急于抽象 Console SPI。应先修 discovery 时 binary 探测，以及把 attach/recover/finish 的 Host adapter 从 WorkBoard 私有协议提升为 Web Host 可复用协议。

## Git

Git 应从 `preview-resources` 和 `work_core/providers/resources.py` 迁成 `agent-box-git`：

- selector -> exact commit/tree Ref；
- Dispatch 后 materialize execution worktree；
- Harness start 前 read-back actual HEAD；
- finish 输出 commit/tree/diff artifact；
- cleanup 使用 provider-owned safety policy。

Git Contract 可以继续使用现有 `WorkspaceV1`，但要明确其 `source_digest` 是 commit/tree 哪一种，避免两个 provider 对字段使用不同语义。Git plugin 不应依赖 Harness plugin。

# SandboxProvider position

## SandboxRef 与责任判定

判断标准不是产品是否叫 Sandbox，而是谁接受 Dispatch 的责任：

| Native product behavior | Agent-Box role |
| --- | --- |
| 提供 environment、filesystem、process、PTY、snapshot、secret injection；不知道本次 objective | ResourceProvider / Sandbox capability |
| 直接接受 prompt/objective，选择/运行 agent，管理 run/retry，返回 native run outcome | Accountable ExecutionProvider |
| 两者都提供 | 可以注册两种角色，但一次 Dispatch 仍只有一个 accountable ExecutionProvider |

SandboxRef 在 freeze 时通常指向 exact image/snapshot/policy/template，Dispatch 后产生的 sandbox instance id 是 native/output Ref。二者不能混成同一个“已创建实例”假象。

## 暂不固化 bwrap Contract

可行且推荐。理由：

- 现有 bwrap launch plan 绑定 `/`、共享 network，主要证明 config/mount projection，并不是高保证 sandbox；
- 目前没有第二个 agent-oriented sandbox implementation 校验统一字段；
- 当前 Resource Contract 被 ADR-0006 定义为纯数据，而可替换 Sandbox 需要的不只是数据，还包括 create/launch/attach/observe/cleanup 行为；
- 过早把 callback/client 塞进 frozen dataclass 会破坏 Contract 的数据协议性质和第三方版本边界。

Preview 可明确支持 `host-process` launch，并把 bwrap 留在 legacy/experimental adapter。第一款真实 agent-oriented Sandbox spike 应检查：exact template/image identity、workspace projection、PTY、native instance ref、restart/recovery、artifact/diff、secret injection、network policy、cleanup。

## 未来最难的 Contract 问题

若多个 SandboxProvider 都要被同一个 Harness ExecutionProvider 无特判消费，需要一个 neutral operational SPI。当前 registry 只把 ResourceProvider resolve 的 frozen dataclass 交给 ExecutionProvider，缺少“由 provider 拥有行为、consumer 通过稳定接口调用”的正式约定。

有三种候选，必须等两个真实实现后对抗验证：

1. 数据 Contract + Host `SandboxBroker` 根据原始 Ref.provider 回调对应 provider；
2. neutral `agent-box-sandbox-spi` 包定义 data Contract 和受信任的 resolved capability protocol；
3. Sandbox 自己负责 native process start，使它成为 ExecutionProvider（仅适用于它同时接受任务的产品）。

不推荐让 Harness provider写 `if provider == e2b/daytona`，也不推荐让第一个 sandbox 插件拥有“行业通用”Python type。bwrap spike 代码可作为测试素材，但不能决定 SPI。

# Plugin SDK gaps

## P0：Host extension SDK

当前 SDK 文档明确说 WorkBoard resource-input/control adapters 不属于 Plugin SDK。Web Workbench 需要一个 Host-owned、但稳定公开的扩展面：

- selector/form/choices；
- prepare one or multiple candidate exact inputs；
- dependency/compatibility preview；
- attach/recover/observe/finish actions；
- side-effect-free discovery；
- structured errors/diagnostics。

这不进入 Work Core。可以放在 `agent_box.host_extensions` 或 application SDK，并由 TUI/Web 共用。不要让第三方同时实现 `workboard_*` 和 `web_*` 两套 adapter。

## P0：跨插件依赖与加载拓扑

SDK 文档目前只要求 consuming distribution 在 `pyproject.toml` 声明 Python dependency，并承认没有 runtime dependency manifest。这不足以保证 Contract 注册顺序。

需要最小增加 descriptor dependency，例如：

```python
PluginDependency(plugin_id="tmux", version=">=0.1,<1", optional=True)
PluginDependency(plugin_id="harness-contracts", version=">=1,<2")
```

Loader 应先 discover descriptors，再拓扑排序 build/register；缺失 required dependency、版本不兼容、cycle 都应被 doctor 明确报告。optional dependency 不应阻止插件加载，只禁用相关 driver/adapter。

如果暂不实现拓扑，Preview 至少要求所有跨插件 Contract 进入 neutral shared contract distribution，并禁止 ResourceProvider 在 build 时依赖另一个插件刚注册的 Contract。但这是短期约束，不是完整生态方案。

## P0：driver-level health

一个多 Harness 插件需要组件级状态：Codex READY、OpenCode READY、Pi UNAVAILABLE，不能因为 Pi binary 缺失让整个 plugin FAILED。现有 PluginLoadRecord 只有插件级 READY/FAILED；doctor 需要允许插件贡献 side-effect-controlled diagnostics，或官方插件自己提供 Host diagnostics API。

## P0：side-effect boundary

Conformance 当前只保证 doctor 不调用 `start/observe/resolve`，但 plugin `build()` 本身仍能探测 binary、读 config、创建对象副作用。tmux 当前就在 build 时查询 binary/version。应把 provider construction 调整为 lazy，并增加 conformance fixture 验证 discovery 不创建目录、不启动进程、不要求 native binary 存在。

## P1：Contract ownership 与兼容矩阵

需要记录：

- Contract owner plugin/distribution；
- consumer plugin 支持的 contract versions；
- driver 与 profile schema/materializer version；
- provider version 与 Ref snapshot schema；
- 插件卸载后 UI 对未知 contract 的 raw rendering fallback。

Contract class 不能在两个 distribution 中复制定义；即使 `contract_id` 相同，Python `isinstance` 也会失败或 registry 会拒绝重复注册。

## P1：secret hygiene kit

当前 FormField 有 `secret=True`，但 Ref.metadata、events、manifest 和 observation detail 没有自动 secret scanner。SDK 应提供：

- redacted canonicalization helper；
- secret locator 类型/规则；
- forbidden key/value diagnostic；
- manifest allowlist serializer；
- fixture 验证 API key 不出现在 Ref/event/evidence/runtime manifest。

这不是 secrets manager，也不能证明恶意 trusted plugin 不泄漏 secret；只是官方插件和 conformance 的卫生边界。

# UI selector and Web implications

Web UI 应是通用 Host，不是 Codex/cc-switch 管理后台。它只渲染插件贡献的结构化 selector、choices、preview 与 candidate refs。

```text
Execution draft
  1. 选择 accountable ExecutionProvider
  2. 选择 Profile
  3. Host 展开/建议独立资源 inputs
  4. 用户 review requested -> exact
  5. Freeze & Launch
```

配置文件管理什么：Profile declaration、driver defaults、catalog connection、non-secret policy。TUI/Web 管理什么：选择哪一个、当前 draft、resolve preview、freeze、attach、finish、facts。Core 管理什么：不可变事实。

插件不应直接贡献任意 React bundle作为 Preview P0；先使用 Host schema 渲染统一 UI。复杂 picker 可通过 server-side choices/search/page protocol 演进。secret 字段不能回显，也不能自动进入 draft。

# Uninstall and historical readability

历史不能依赖插件仍安装。最低规则：

- Core DB 持久化 contract id + Ref identity + observations；
- Profile/capability 的 exact non-secret snapshot必须是 ArtifactRef，不能只存在 plugin mutable directory；
- Web UI 对未知 contract/provider 仍显示 raw Ref、digest、observer 和 evidence artifact；
- 不尝试在插件卸载后重新构造 Python Contract value；
- continuation/retry 需要缺失插件时明确不可用，但旧 Execution 仍可审计。

若 Artifact store 也属于被卸载插件的私有目录，所谓历史可读仍是假的。正式 Host 需要一个 provider-neutral material artifact store，或插件 finish 时把证据复制到 Host 管理的 artifact persistence；此问题不要求新 Core entity，但需要 application/storage 责任明确。

# Recommended package graph

```text
agent-box (host distribution)
  src/agent_box/work_core        stable kernel
  src/agent_box/application      Host use cases
  src/agent_box/extensions       Core Plugin SDK
  src/agent_box/host_extensions  selector/control/diagnostic SDK
  src/agent_box/server           HTTP/WebSocket
  web/                           Workbench

agent-box-harnesses (official)
  depends: agent-box public SDK
  optional integration: agent-box-tmux contract/controller
  owns: HarnessProfile contract/provider, InteractiveHarness EP,
        Codex/OpenCode/Pi drivers, profile materialization, Host adapters

agent-box-cc-switch (official optional)
  depends: neutral capability contracts + public Host SDK
  owns: read-only schema probes, normalized snapshot providers/selectors

agent-box-tmux (official optional)
  owns: tmux contracts/provider/controller/selectors

agent-box-git (official)
  owns: Git authority/worktree materializer/observations/selectors

agent-box-bwrap (experimental, optional)
  legacy local projection reference only; no universal Sandbox Contract claim

future agent-box-sandbox-<product>
  role decided from real API: ResourceProvider or ExecutionProvider
```

依赖方向：

```text
Core <- public SDK <- plugins
Host extension SDK <- plugin selectors/controls
agent-box-harnesses <- neutral capability contracts
agent-box-harnesses -X-> cc-switch implementation
agent-box-cc-switch -X-> Harness driver implementation
Core -X-> all product plugins
```

# Minimum contracts

Preview 只需要以下最小合同集合：

| Contract | Producer | Consumer | Notes |
| --- | --- | --- | --- |
| `agent-box.harness-profile@1` | harness profile provider | interactive harness EP | exact non-secret declaration revision |
| existing `agent-box.workspace@1` | Git/local workspace provider | interactive harness EP | exact source + materialized path |
| existing `agent-box.prompt-fragment@1` | artifact/workflow context providers | interactive harness EP | multiple allowed |
| tmux plugin-specific pane/console v1 | tmux | interactive harness EP | optional visible console |
| driver-specific continuation v1 | session authority | selected driver | optional; do not force false genericity |
| capability definition v1 | local/cc-switch catalog | harness materializer | only once two producers agree on fields; otherwise keep provider-specific for spike |
| credential-source v1 | cc-switch/keyring/env authority | harness materializer | opaque identity; no secret value/revision claim |

Preview 暂不冻结：

- universal Sandbox Contract；
- generic Console Contract；
- generic Harness/Participant entity；
- generic Profile policy language；
- plugin marketplace/signature/permission model。

# Preview scope

必须实际完成：

1. Host extension SDK 支持 Profile bundle 在 freeze 前展开为多个 candidate inputs；
2. `agent-box-harnesses` 的 Codex driver 跑通 Profile -> Workspace/context/tmux -> native SessionRef -> explicit Finish -> observations；
3. OpenCode 或 Pi 至少一个第二 driver 复用同一 provider/profile/materialization pipeline；
4. per-driver doctor，不安装/不可用的第三 driver 不拖垮插件；
5. Profile source 与 execution writable state 分离；
6. 一个 cc-switch read-only MCP 或 credential-source vertical slice，证明 bridge 可选且 secret 不持久化；
7. Git 独立 exact/ref/read-back 路径；
8. 插件卸载后历史 Execution/Binding/Observation UI 仍可读。

可以延期：

- Web 内嵌 PTY（可继续 attach tmux）；
- bwrap 正式插件；
- agent-oriented sandbox；
- Hermes；
- profile editor 的高级 GUI；
- capability policy language；
-远程插件市场与签名。

# Strongest objections

## 反对意见 1：一个多 Harness 插件会成为新的 monolith

这是最强反对意见。若 Profile store、cc-switch adapter、tmux、Git、sandbox、Web UI 和所有 native clients 都进入 `agent-box-harnesses`，它只是把一期 monolith 改了包名。必须用依赖反向测试和 per-driver failure isolation防止。

## 反对意见 2：一个 ExecutionProvider 的静态 input limits 无法诚实表达不同 driver

属实。Preview 可以用 Host compatibility + provider preflight 解决，但长期若 driver 输入差异巨大，应拆 ExecutionProvider，而不是扩一个动态 DSL。

## 反对意见 3：Layered Profile 仍可能污染并发 Session

属实，如果“writable overlay”被多个 Execution 直接共享。必须把 runtime writable state execution-scoped；Profile overlay只作为 materialization source。continuation 只显式恢复所需 SessionRef。

## 反对意见 4：跨插件运行期行为没有标准

属实。当前 tmux 通过直接 import controller 解决，不能自动推广到 Sandbox。必须等两个真实 Sandbox 再固定 operational SPI。

## 反对意见 5：cc-switch exactness 是伪命题

对 credential value 属实。只能冻结 credential source identity；若 authority 不提供 revision，Evidence 必须是 unknown/unverifiable。MCP/skill 的非秘密定义可以 snapshot/digest。

## 反对意见 6：Web selector schema 会变成另一套插件平台

风险真实。P0 只允许 fields/choices/prepare bundle/control/diagnostic，拒绝任意前端代码、workflow、custom database 与后台任务。准入新能力必须有两个真实插件。

# Assumptions to validate next

1. Codex、OpenCode、Pi 是否都能使用 execution-scoped writable state root，同时保留 native session continuation？
2. Codex/OpenCode/Pi 的 shared MCP/skills/plugins 能否用 read-only source + generated config，而不要求把 source 复制到 writable home？
3. Profile declaration 变化后，旧 exact snapshot 是否能由 Host artifact store继续读取，而不是依赖 mutable profile directory？
4. 一个 Provider 级静态 `input_limits()` 加 Host dynamic compatibility，是否足以覆盖两个真实 driver而不造成错误 UX？
5. cc-switch 当前 schema 是否有可稳定 probe 的版本/signature，以及 credential row 是否能分离 public definition 与 secret locator？
6. Web Host adapter 的 bundle 展开如何保证原子 preview，同时允许用户替换其中一个建议资源？
7. 插件 loader 的 dependency topological ordering 能否在不扩张 Core ontology 的情况下只作为 extension infrastructure实现？
8. per-driver diagnostics 如何做到不执行 network/login、不创建 profile runtime，又能报告 binary/config readiness？
9. 未来 agent-oriented sandbox 能否提供统一的 PTY/process API，还是产品本质上都是 task-taking ExecutionProvider？
10. Host 管理的 Artifact persistence 是否足以保证插件卸载后的 snapshot/evidence readability？

# Final recommendation

批准以下方向进入第二轮对抗设计：

```text
Core 保持冻结
-> 先设计 Host extension SDK + plugin dependency lifecycle
-> 建 agent-box-harnesses 的 Codex-only vertical slice
-> 用 OpenCode/Pi 验证一个 provider 多 driver
-> 独立 cc-switch/tmux/git plugins
-> 用真实 sandbox spike 再固定 Sandbox Contract
-> 最后删除 legacy GUI/launch/ACS 耦合
```

不要先删除一期代码，也不要先写 Web 大后台。先让新插件路径能从 selector 到 exact refs、freeze、start、finish、evidence 完整跑通，再按调用链迁移和清理。当前没有推翻 Work Core 的反例；需要补的是 Core 外围的 Host/Plugin 圆环，而不是继续增加领域语义。
