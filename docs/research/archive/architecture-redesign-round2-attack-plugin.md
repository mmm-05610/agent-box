# Agent-Box 架构重设计第二轮攻击：插件生态、依赖与供应链
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

- 日期：2026-08-28
- 立场：第三方插件作者、依赖维护者、secret/供应链安全审计者、真实 Provider 集成者
- 目标：尽力推翻 Round 1 synthesis，而不是维护它
- 结论性质：红队报告；严重度分为 BLOCKER / HIGH / MEDIUM / LOW

# Executive attack verdict

Round 1 的产品中心没有被推翻，但其插件实现方案**尚不能作为公开架构实施**。如果现在直接创建 `agent-box-harnesses`、candidate input bundle 和未来 Sandbox 插槽，很可能得到一个只能在官方 monorepo、同一 Python 进程和同一作者知识下工作的“组合演示”，而不是第三方生态。

最严重的反例不是目录怎么拆，而是一次启动存在三个未闭合的协议断层：

```text
动态 Profile/driver 要求
  无法由静态 input_limits 约束

exact Ref + resolved value
  尚未保留一一对应和 authority routing

resolved data
  无法表达可恢复的 create/launch/attach/cleanup 操作
```

Round 1 同时建议“暂缓 Sandbox SPI”和“先设计多 Harness driver launch pipeline”。这两者可能冲突：如果先用 host-process/tmux 把 driver 固化成 `argv/env/cwd`，未来远程 Sandbox 的 upload、secret channel、PTY、snapshot、exec transport 会迫使整个 driver API重写。可以暂缓**公开通用 Sandbox Contract**，但不能暂缓一次真实 remote sandbox spike 对 driver/launch boundary 的约束。

本轮建议不是重开 Work Core，而是把实施门槛收紧为五个 P0 决策：

1. Resource resolution 必须无副作用；driver compatibility preflight 必须发生在任何 provisioning 前。
2. Start invocation 必须保留 exact Ref/value pairing，但 operational client/handle 不得进入可持久 Contract。
3. Plugin loader 改成两阶段注册：先收集全部 Contract，再校验/注册全部 Provider；不要先造一个通用依赖求解器。
4. Profile bundle 只能“提出依赖”，每个 exact Ref 必须由其 authority adapter准备，且 UI 显示 proposal authority 与 resolution authority。
5. 在冻结公开 HarnessDriver API 前，至少用一个本地 substrate 与一个真实远程 agent-oriented sandbox 做 launch compatibility spike。

# Threat model

Round 1 多处把“read-only”“exact digest”“trusted plugin”当成安全边界。它们不是同一件事：

- read-only SQLite 仍可返回恶意 MCP command、plugin path、environment 或 network endpoint；
- digest 证明 bytes 未变，不证明代码安全、来源可信或 secret 未泄露；
- Python plugin 是进程内任意代码，可以读 Agent-Box DB、secret、filesystem，拦截其他插件对象；
- frozen source identity 不等于 frozen credential value；
- ResourceProvider self-report 不等于独立 evidence；
- selector/choices 是 Web GET 路径触发的插件代码，也可能阻塞、访问网络或泄漏数据。

因此 Preview 最多声称“用户显式安装的受信任插件可组合”，不能声称插件隔离、供应链安全或秘密不泄漏。

# Attack matrix

| ID | Attack | Severity | Round 1 claim at risk | Minimal correction |
| --- | --- | --- | --- | --- |
| A1 | 一个多 Harness Provider 的能力与输入语义不统一 | HIGH | 单 EP 可自然承载 Codex/OpenCode/Pi | Provider 只声明共同能力；driver-specific preflight；必要时拆 EP |
| A2 | 静态 input_limits 无法约束 Profile 选择后的动态要求 | BLOCKER | Host compatibility + start validation 足够 | pure resolve + preflight-before-provision；不要把 UI 当 authority |
| A3 | 插件加载按 entry point 顺序，跨插件 Contract 可能尚未注册 | HIGH | Python dependency + descriptor topology | Loader 两阶段 Contract-first 注册；P1 再做 dependency metadata |
| A4 | Contract class ownership/版本可能双重定义 | HIGH | `contract_id@N` 足够 | 唯一发行包拥有 class；ABI fixtures；禁止复制 class |
| A5 | candidate bundle 可能让 Profile adapter冒充其他 authority | HIGH | Profile 可展开 exact inputs | bundle 只产 proposals；owner adapter逐项 prepare；显示双重 provenance |
| A6 | cc-switch public snapshot 无法固定 credential/MCP secret | HIGH | read-only snapshot 可 exact bind | 拆 public definition 与 opaque secret source；限缩 exactness claim |
| A7 | read-only cc-switch 仍可注入可执行内容 | HIGH | bridge 风险低、只读即可 | trust/review gate；命令、路径、endpoint 明示；不宣传安全 |
| A8 | resolved operational object 不可序列化、不可恢复 | BLOCKER | resolve 返回能力对象可组合 | Contract 保持数据；operation由可重建 broker/controller按 Ref.provider 路由 |
| A9 | 暂缓 Sandbox spike 会把 driver API 固化在本地 argv | HIGH | 先 Harness 后 Sandbox 不会返工 | 公开 driver API前做远程 sandbox spike；SPI仍可暂缓 |
| A10 | Profile writable overlay 在并发/continuation 下污染 | BLOCKER | layered Profile 默认安全 | execution-private writable home；Profile overlay只读输入源 |
| A11 | 插件卸载后 Artifact 可能随 plugin data dir 消失 | HIGH | 历史仍可读 | material evidence进入 Host-owned immutable artifact store |
| A12 | 插件级 READY 掩盖单 driver 不可用 | MEDIUM | 一个包多 driver 可运维 | per-driver health DTO；共同 provider capabilities取交集 |
| A13 | Host extension schema 变成未治理的第二插件平台 | MEDIUM | Web/TUI 可共用 adapter | P0 限定纯 selector/proposal/action；无 arbitrary frontend/background jobs |
| A14 | shared skill/plugin 是代码，不是普通 capability data | HIGH | 共享 digest 即可安全复用 | 显示 executable/trust/source；用户批准；只证明版本，不证明安全 |

# Attack 1: `agent-box-harnesses` may be a disguised monolith

## Concrete counterexample

Codex interactive、OpenCode TUI 和 Pi 看似都有“启动、对话、Finish”，但 native contract 差异可能影响 accountability，而不只是 argv：

- Codex App Server 可以 thread/start、thread/resume、turn events、structured output；
- Codex TUI 的 session id 依赖 hook 异步出现；
- Pi 可以预先指定 session id，并以 JSONL/session directory 恢复；
- OpenCode 的 server/session/state path 与 terminal behavior 不必等价；
- 有些 driver 能 recover，另一些只能观察 pane 是否还活着；
- 有些 driver 支持 explicit steer/cancel，另一些只支持用户在 TUI 输入。

一个 Provider 级 `capabilities()` 无法诚实回答“支持 continuation/recover/steer 吗”：返回 supported 会对部分 Profile 过度承诺，返回 absent 又埋掉其他 driver 的真实能力。

更深的问题是第三方作者如何添加 Harness。若必须修改官方 `agent-box-harnesses` 的内部 driver registry，它不是第三方生态；若允许外部 entry point 注入 driver，则产生一个嵌套插件系统：driver API version、执行权限、故障隔离、Profile schema、secret access 和 accountability 都要另行治理。

## Severity

HIGH。Preview 官方包可以工作，但“它自然成为开放 Harness 生态入口”的说法不成立。

## Minimal correction

- Preview 将 driver registry 明确标为官方包内部 API，不承诺第三方 driver 插入。
- 只接 Codex + 一个第二 driver，验证复用价值；第三个不作为发布门槛。
- Provider `capabilities()` 只声明所有 driver 的共同交集。
- Profile resolve 后由 Host 显示 driver-specific capability matrix，但它只是 UX；Provider preflight 仍是最终门禁。
- 若一个 driver 的 lifecycle/correlation/finish 不能满足统一责任接口，拆成同一发行包内另一个 ExecutionProvider。
- 第三方 Harness 最初通过注册自己的 ExecutionProvider接入；只有两个外部 driver真实要求复用时，才公开 Driver SDK。

# Attack 2: static `input_limits()` is not a truthful dynamic contract

## Concrete counterexample

假设统一 Provider 声明：

```text
Profile 1..1
Workspace 1..1
Prompt 1..N
CodexContinuation 0..1
PiContinuation 0..1
TmuxPane 0..1
Sandbox 0..1
```

用户冻结 `Profile(driver=pi) + CodexContinuation + TmuxPane`。Core 的静态数量检查通过。Round 1 提议由 `start()` 再拒绝，但当前 Dispatch 序列会先调用所有 ResourceProvider.resolve。现有 Git resolve 会创建 worktree，tmux resolve 甚至可能创建 session。结果是：非法 driver/input 组合在被拒绝前已经产生外部资源，Dispatch 记录 failed，却没有统一 compensation/cleanup。

Web UI 提前隐藏 CodexContinuation 不能修复这个问题：CLI、外部 workflow Host、旧客户端或恶意请求都可绕过 UI。

## Severity

BLOCKER。它会制造“治理验证通过、外部副作用已发生、随后才失败”的反例。

## Minimal correction

建立严格的两阶段调用：

```text
freeze/request Dispatch
-> side-effect-free resolve/validate exact refs
-> ExecutionProvider.preflight(resolved exact inputs)
-> provision/materialize resources
-> ExecutionProvider.start
-> accepted/failed + compensation facts
```

`preflight` 可以是 Host/Plugin SDK 的非持久调用，不需要成为 Core entity。它必须：

- 完整验证选中 driver 与 inputs；
- 无 network/process/filesystem mutation；
- 在 Git worktree、tmux session、sandbox instance 创建前完成；
- provider start 再重复关键校验，防止 TOCTOU。

如果不愿增加 preflight，最小诚实替代是 Codex/OpenCode/Pi 分别注册 ExecutionProvider。单 provider多 driver不能以隐藏副作用为代价。

# Attack 3: cross-plugin Contract loading is not solved by Python dependencies

## Concrete counterexample

`agent-box-harnesses` 的 provider import `TmuxPaneV1` 并在 `input_limits()` 中引用它。`pip` dependency保证 Python module 存在，但 registry loader 按 entry point 名称排序、逐插件立即 `register_components()`。若 consuming plugin 在 tmux plugin 前加载：

- Python class可以 import；
- 但 registry 尚未注册 `agent-box-tmux.pane@1`；
- ResourceProvider registration 会因 unknown Contract 失败；
- ExecutionProvider registration当前甚至可能先通过，直到 doctor/Dispatch 才暴露 unknown input contract。

新增 descriptor dependency graph 可以解决顺序，却马上引入 optional dependencies、cycles、version comparison、duplicate plugin ids、distribution name与plugin id映射。这已经接近依赖求解器，而且与 `pip` 的依赖图重复。

## Severity

HIGH。第三方安装顺序不应影响同一环境的可用性。

## Minimal correction

P0 不做完整 dependency solver，改 Loader transaction：

1. discover、instantiate、descriptor/build 所有插件（build 必须无副作用）；
2. 收集全部 registrations；
3. 验证并注册全部 unique Contract types；
4. 再验证/register ResourceProviders；
5. 再验证/register ExecutionProviders；
6. 任一插件组件失败时，原子移除该插件组件并重算依赖失败报告。

这解决 Contract load order，而 Python module dependency/version仍由 packaging metadata 管。P1 可增加轻量 `requires_plugins` 只用于 diagnostics/topology，不自动安装或求解。

必须补：ExecutionProvider registration 对 `input_limits()` 中 unknown Contract 的校验，不能只靠 doctor。

# Attack 4: Contract ownership and versioning are still ambiguous

## Concrete counterexample

两个插件各自复制一份：

```python
@dataclass(frozen=True)
class CredentialSourceV1:
    contract_id = "agent-box.credential-source@1"
```

字段完全相同也没有用：registry只允许一个 contract id，另一个 registration失败；即便绕过，Python `isinstance` 也取决于 class identity。若 owner 包在不改 `@1` 的情况下添加字段默认值、收紧验证或改变 Path normalization，旧 provider 与新 consumer可能出现 ABI 漂移。

## Severity

HIGH。

## Minimal correction

- 每个共享 Contract 有唯一 owner distribution；consumer只 import，不重复 register。
- `@N` 内只允许 validation bugfix，不允许字段/语义演化；增加 canonical ABI fixture/hash文档。
- Contract owner plugin卸载时，consumer plugin必须诊断为 dependency unavailable，而不是自己 fallback复制定义。
- neutral contract包只有在至少两个 producer或consumer真实复用后建立；不要让 `agent-box-harnesses` 私有类型伪装通用。
- Python distribution version constraints继续由 `pip` 管，Contract semantic version由 `contract_id@N` 管，两者必须在 SDK 文档中区分。

# Attack 5: candidate input bundle can hide authority rather than reveal it

## Concrete counterexample

Profile declaration写：

```text
mcp = cc-switch/knowledge-brain
credential = cc-switch/deepseek-main
sandbox = e2b/default
```

若 Profile adapter直接返回三个 exact Refs，它必须理解 cc-switch/E2B selector、调用对方私有 `make_ref()`，甚至读取凭证 catalog。此时 Profile adapter冒充三个 authority，且 bundle显示“由 Profile准备”，掩盖真正的 resolution authority。

若 bundle只返回 string selectors，用户在 Review 看到的仍不是 exact Ref。若它在后台递归调用其他 adapters，则要处理选择歧义、异步 refresh、secret fields、缺失插件、同 Contract多个 provider和循环 proposal。

## Severity

HIGH。Binding hero moment会变成视觉上透明、实际上隐藏的自动配置。

## Minimal correction

将 bundle降级为 **InputProposal**，不能直接伪造其他 provider的 PreparedInput：

```text
InputProposal
  contract_id
  preferred_provider/adapter id
  non-secret selector parameters或已有 exact Ref
  required_by/profile-default/user-selected
  proposed_by
```

Host 必须把每项交给 owner adapter `prepare()`；最终 Review 逐项显示：

```text
Suggested by: profile codex-plus@3
Resolved by: cc-switch MCP authority
Exact Ref: sha256:...
Required by: selected driver / optional default
```

已有 exact Ref可直接转交，但仍需 owner provider validate。InputProposal和bundle是 Host ephemeral DTO，不进 Core。循环 proposal禁止；一个 adapter不能在 prepare中再次触发 bundle expansion。

# Attack 6: cc-switch read-only SQLite does not provide the claimed exactness

## Concrete counterexamples

### Mixed snapshot

cc-switch正在写 provider、MCP、skill多张表。Bridge 分多次 SELECT 且没有显式 read transaction，可能把更新前 provider与更新后 MCP组成一个从未真实存在的“snapshot”。WAL/read-only并不自动保证跨 connection/query的一致业务 revision。

### Secret redaction collision

两个 MCP rows的 public command/name相同，但 env token不同。Redacted digest相同，Binding声称 exact M1；Dispatch时读取的 secret已经轮换。该 digest只能证明 public definition，不证明 effective launch config。

### Executable injection

MCP `command` 指向恶意 binary、plugin path指向可写目录、skill中包含任意 instructions/code。数据库只读不阻止 Harness执行这些内容。

### Schema drift

cc-switch没有稳定外部 API/版本保证时，列名相同也可能改变JSON字段含义。schema signature只能检测结构，不能证明语义兼容。

## Severity

HIGH。

## Minimal correction

- 一次 catalog snapshot使用同一 SQLite read transaction；记录 DB path/file identity、schema signature和snapshot timestamp。
- MCP public definition与 secret locator彻底拆分；public digest明确命名 `definition_digest`，不叫 effective config digest。
- credential source Ref只冻结 row/source identity；若无 revision，Evidence写 `secret revision: unverifiable`。
- 在 UI 展示会执行的 command、binary/path、network endpoint和来源，首次使用要求信任确认；digest不替代批准。
- bridge禁止写 DB、禁止迁移、未知 signature fail closed。
- 必须用真实 cc-switch fixture测试 concurrent update、secret fields、unknown JSON、deleted row和rotation。

# Attack 7: resolved operational objects break recovery and process boundaries

## Concrete counterexample

假设 Sandbox `resolve()` 返回：

```python
ResolvedSandbox(client=E2BClient(...), launch=bound_method, lease=...)
```

它在同一进程的 `start()` 中很方便，但：

- 无法 JSON/IPC 序列化，Web Host未来不能把 Dispatch worker放进另一个进程；
- Host crash后 object消失，无法 recover；
- bound client可能含 secret/token，被日志/dataclass repr泄漏；
- provider upgrade后旧 object class不存在；
- ExecutionProvider需要 import/理解具体 operational object，形成两两依赖；
- Core type check只能验证外壳 class，不能验证 lease生命周期。

当前 tmux能工作，是因为 Contract保持数据、controller由 Codex/Pi直接 import。这是 tmux-specific integration，不证明 generic Sandbox composition。

## Severity

BLOCKER，若其被当作正式 Sandbox方案。

## Minimal correction

```text
Contract value = serializable-ish immutable data snapshot
Ref = authority + exact identity
Operational controller = plugin registry中可按 Ref.provider重新取得的无状态/可重建对象
Native lease/instance = external identity persisted as native Ref/evidence
In-memory handle = cache only，永不作为恢复唯一依据
```

Start invocation需携带 `ResolvedExecutionInput(contract_id, ref, value)`，Host/EP才能按 Ref.provider路由 controller。Controller方法必须接受 dispatch/execution context并返回 durable locator；recovery从 frozen Ref + native locator重建，不反序列化旧 Python object。

尚未决定 Controller归 Host broker还是 neutral Sandbox SPI，因此不得公开 generic operational object contract。

# Attack 8: postponing Sandbox SPI can still poison HarnessDriver API

## Concrete counterexample

若 Codex driver API先固定为：

```python
prepare() -> argv, env, cwd, mounts
```

本地 tmux/bwrap很自然。但真实远程 Sandbox可能要求：

- upload/git clone workspace，而不是本地绝对 path；
- image/template snapshot id；
- secret injection API，而不是 env value；
- remote PTY/WebSocket exec，而不是本地 subprocess argv；
- files/artifacts download，而不是直接读取 worktree；
- pause/reconnect/TTL，而不是 PID；
- sandbox内未安装 Codex/OpenCode/Pi binary；
- 产品只支持其自己的 agent task API，根本不允许 native TUI。

这意味着“以后加 SandboxRef”不是添加一个 input，而可能改变 Workspace、Profile、Console和Driver的整个 materialization边界。

## Severity

HIGH。

## Minimal correction

可以继续暂缓通用 SPI，但在公开 HarnessDriver API前必须做两个 spike：

1. local host/tmux launch；
2. 一个真实 remote sandbox的 arbitrary process + PTY launch（若产品不支持，则把它归类为ExecutionProvider）。

Driver P0 API先保持插件私有，并分成：

```text
native requirements (binary/version/features)
config artifacts/projection intent
session identity/resume mapping
process intent (argv/env names/cwd semantic path)
observation parser
```

不要把本地绝对 path、subprocess handle或bwrap mount作为公开 Driver ABI。

# Attack 9: layered Profile can still corrupt concurrent sessions

## Concrete counterexample

两个 Execution同时选择 `codex-plus`。若 Profile overlay目录被 writable bind到两个 Codex home：

- history/session SQLite/JSONL并发写；
- auth refresh/token state竞争；
- MCP OAuth state互相覆盖；
- trust/approval设置被某次Execution修改；
- plugin cache/update锁冲突；
- continuation S1可能被E2意外发现/修改。

“一 Profile一 overlay”只是namespace隔离，不是Execution并发隔离。

## Severity

BLOCKER，对多 Execution和multi-Harness Demo。

## Minimal correction

- Profile declaration和overlay source在启动时只读；
- 每个 Execution materialize私有 writable home/state/session/temp/cache；
- shared plugin/skill source只读；
- credential通过runtime channel注入；
- continuation显式选择旧 SessionRef，并仅复制/挂载所需session state；
- Harness无法做到细粒度恢复时，driver声明exclusive session-home lease并拒绝并发，不得静默共享。

# Attack 10: plugin uninstall history is weaker than claimed

## Concrete counterexample

Core rows确实还在，但 Profile snapshot、cc-switch normalized artifact、tmux scrollback、runtime manifest都存于：

```text
$AGENT_BOX_HOME/plugins/<plugin-id>/...
```

用户卸载/清理插件数据后，Ref仍可显示，Artifact内容与Evidence却消失。历史“可读”退化为只剩locator。

## Severity

HIGH，对Evidence reconciliation叙事。

## Minimal correction

- Plugin运行数据与 Work material evidence分离；
- finish/finalize把需长期保存的 immutable evidence交给 Host-owned artifact store；
- Core仍只保存 ArtifactRef association，不新增Artifact entity；
- UI在 artifact缺失时显示 unavailable，而不是假装 evidence完整；
- conformance增加“plugin unavailable/uninstalled后raw facts + host artifacts仍可读”测试。

# Attack 11: executable capabilities are a supply-chain surface

## Concrete counterexample

MCP command、plugin、skill、hook都可能执行代码或改变 agent behavior。把它们称为 shared capability refs并显示绿色 digest，会让用户误以为已安全验证。一个 immutable malicious plugin同样危险；一个 skill prompt可以诱导Harness泄漏credential。

## Severity

HIGH。

## Minimal correction

- Contract标注 capability kind和 `executable/behavioral/data-only` 展示属性（Host/plugin字段，不进入Core enum也可）；
- UI显示来源、digest、将执行的入口、信任状态；
- 首次或来源/digest变化需用户批准；
- Sandbox/credential policy独立，不能因 capability已冻结就自动授权secret/network；
- Observation只证明 projected/read-back/consumption-reported，不证明safe。

# Attack 12: Web Host extensions increase attack surface

## Concrete counterexample

Web打开Binding Composer时调用插件 `choices()`。第三方 adapter可以：

- 做无限网络请求导致Host卡死；
-读取secret并放进choice detail；
-遍历filesystem；
-返回十万选项耗尽内存；
-利用path selector读取任意文件并在prepare时hash/展示；
-在GET/preview阶段创建资源。

插件是trusted Python并不意味着Web路径可以没有限时、边界和redaction。

## Severity

MEDIUM（安全模型已是trusted install），但Preview可用性与secret hygiene会受损。

## Minimal correction

- selector/choices/prepare必须有Host超时、结果数量/字符串长度限制和structured error；
- diagnostic/choices默认禁止网络，若需要必须显式声明并在UI显示；
- secret input只能传opaque token给prepare，不能出现在response/log/draft；
- arbitrary React bundle与background job不进入P0；
- 插件adapter调用最好进入可取消worker边界，至少不能阻塞唯一Web event loop。

# Minimal corrected architecture

红队接受的最小形态如下：

```text
Web/TUI/CLI
   -> one Host application API
      -> proposal/selector adapters (bounded, side-effect-free)
      -> exact candidate Refs
      -> Core freeze + requested Dispatch
      -> ResourceProviders pure resolve/validate
      -> ExecutionProvider preflight (dynamic driver rules)
      -> operational controllers provision
      -> one ExecutionProvider start/accountability
      -> Core accepted/failed
      -> native refs + observations + Host-owned artifacts
```

包图：

```text
agent-box Core/Host/SDK
  owns two-phase loader, Host adapter surface, artifact persistence

agent-box-harnesses
  owns private driver API, Profile authority/materializer,
       one interactive EP only for genuinely shared responsibility semantics

agent-box-tmux / agent-box-git / agent-box-cc-switch
  independent authorities/controllers; no mutual implementation imports

future sandbox product
  spike first; role and SPI extracted from real API
```

# Required spikes before implementation commitment

## Spike S1 — Dynamic driver invalid Binding

构造 Pi Profile + CodexContinuation + Git selector + tmux selector。验收：preflight拒绝，且没有创建worktree、tmux session、sandbox或profile runtime。

## Spike S2 — Two-phase plugin load

随机打乱 tmux/harnesses/cc-switch entry point名字和发现顺序。验收：同一已安装集得到相同ready registry；missing contract owner给确定性诊断；duplicate owner失败。

## Spike S3 — Profile proposal authority

Profile推荐一个cc-switch MCP和credential source。验收：UI分别显示proposed_by与resolved_by；删除cc-switch插件后Profile仍可查看但不能prepare；无隐藏input进入Dispatch。

## Spike S4 — Concurrent Profile

同一Profile并行启动3个Execution。验收：config/session/cache/temp无交叉写；共享skill/plugin source digest一致；credential value不出现在任何runtime manifest/ref/event/evidence。

## Spike S5 — cc-switch concurrent mutation

在snapshot期间更新MCP和rotate credential。验收：public definition来自一致read transaction；drift明确；secret revision若不可得标unverifiable；没有混合revision假象。

## Spike S6 — Host restart recovery

启动interactive Execution后杀死/重启Host。验收：不依赖旧Python handle，能从Dispatch、frozen Refs和native locator重建observe/attach/finish控制；不能恢复时明确PARTIAL而不是重启Harness。

## Spike S7 — Remote sandbox launch

选一个真实agent-oriented sandbox，验证arbitrary process、workspace materialization、PTY、secret injection、native instance id、reconnect、cleanup。若不支持native Harness TUI，记录其应为ExecutionProvider而不是SandboxProvider。

## Spike S8 — Plugin uninstall evidence

完成Execution后移除harness/tmux/cc-switch distributions与plugin runtime dirs。验收：Core history和Host-owned material artifacts仍可查看；resolve/continue明确unavailable。

# Severity-ranked corrections

## BLOCKER before official harness migration

1. Pure resolve/preflight/provision side-effect ordering。
2. Exact Ref/value pairing in invocation。
3. Execution-private writable state；Profile source不得共享写。
4. Operational object不得成为不可恢复唯一状态。

## HIGH before third-party SDK claim

1. Contract-first two-phase loader与unknown input contract runtime validation。
2. Unique Contract ownership/version discipline。
3. Proposal authority与resolution authority分离。
4. cc-switch exactness/secret claim限缩。
5. Host-owned evidence artifacts。
6. 至少一个remote sandbox spike约束Driver API。

## MEDIUM before Web Preview

1. per-driver health/capability matrix；
2. Host adapter timeout/result bounds/redaction；
3. executable capability trust presentation；
4. TUI/Web共用同一Host extension surface。

# Strongest case for rejecting the Round 1 package plan

如果团队拒绝 pure resolve、preflight、两阶段loader、execution-private state和Host-owned artifact store，那么应拒绝 `agent-box-harnesses` 合并方案，继续维持每个Harness一个ExecutionProvider。因为在那种条件下，统一插件只会：

- 把driver动态规则藏在start；
- 在失败前产生外部副作用；
- 依赖monorepo加载顺序；
- 分享不可恢复的Python object；
- 让Profile bundle冒充其他resource authority；
- 把secret/cc-switch drift包装成“exact Binding”。

这比三个重复但边界清晰的插件更糟。

# Final red-team verdict

Round 1 的 Core/Host/Plugin方向仍可保留，但**不能按当前 synthesis 直接实施完整包图**。建议裁决：

```text
KEEP
  Work/Execution/Binding/Dispatch/Ref/Observation ontology
  one accountable ExecutionProvider
  Profile as plugin resource
  cc-switch as optional read-only authority bridge
  Sandbox and tmux as orthogonal concepts

CHANGE BEFORE BUILD
  pure resolve + dynamic preflight + provision ordering
  exact Ref/value invocation envelope
  Contract-first loader
  Profile proposals resolved by actual authorities
  execution-private writable state
  Host-owned evidence artifacts

SPIKE BEFORE PUBLIC API
  second Harness driver
  cc-switch mutation/secret behavior
  Host restart recovery
  one real remote agent sandbox

DEFER
  public third-party HarnessDriver SDK
  generic Sandbox Contract/SPI
  arbitrary plugin frontend
  plugin marketplace/security claims
```

没有发现必须新增 Core entity 的反例。真正的风险是：团队用“Core很干净”掩盖 Host/Plugin 调用协议仍不完整。下一轮必须决定上述 BLOCKER 的最小落点和迁移顺序，而不能继续只讨论目录结构。
