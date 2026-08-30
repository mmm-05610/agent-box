# Round-4 · 第三方插件 SDK、包结构与 Conformance

日期 **2026-08-27**。任务:把"能加载若干插件"升级为第三方开发者能理解、创建、安装、验证与维护的 Agent-Box Plugin SDK/规范(Preview→v1 最小方案,不实现)。

依据:round-3 两份输出([01 红队](../round-3/01-single-kernel-multi-host-red-team.md)、[03 Kernel 边界](../round-3/03-kernel-substitution-and-package-boundary.md))、[ADR-0006](../../../adr/0006-resource-contract-input-protocol.md)、[WorkBoard Composer 设计](../../../product/WORKBOARD_BINDING_COMPOSER_DESIGN.md),以及本轮对 `src/agent_box/extensions/`、`work_core/registry.py`、`resource_contracts/`、`cli/`、五个插件(pyproject/README/src)与三份指定测试的逐项核验。未读取其他 round-4 输出;未修改代码;未执行 Git。

标签:

| 标签 | 含义 |
|---|---|
| **REPOSITORY VERIFIED** | 本轮亲核源码/测试/配置 |
| **ROUND-1/2/3 EVIDENCE** | 前三轮验证确立的结论 |
| **REASONED PROPOSAL** | 本设计稿主张 |
| **REQUIRES USER VALIDATION** | 须由真实第三方开发者行为检验 |

背景约束(全部遵守):Core 不 import 具体产品;插件是普通 Python distribution + 标准 entry point;一插件可贡献多角色;七类可贡献角色;WorkBoard schema/UI 不进 Core;provider config/binary/model/secret/MCP JSON 不进 Binding;Binding 只存本次冻结 Ref;不建 Agent/Harness/Participant/Message entity;不做远程 marketplace/容器平台。

---

# Executive verdict

**判词:B. 当前 entry-point 机制(单组 + Plugin 对象)保留,但需要 Plugin SDK(descriptor 增强 + 配置标准 + doctor/inspect/scaffold/validate)+ conformance kit;另有一处注册路径违例必须在 P0 收紧。**

三点概括:

1. **机制骨架是健康的**:单 entry-point 组、api_version 门禁、原子 bundle 注册、重复 id 拒绝、坏插件可见但不注册——每一条都有对应测试(test_extensions.py 五个用例)**[REPOSITORY VERIFIED]**。discovery 不需要重设计,推倒重来只会摧毁已验证的正确性。
2. **SDK 缺的是"从注册到可信"的后半程**:descriptor 只有三件套(id/name/version/api_version),没有组件清单、能力声明、config 版本;没有 inspect/doctor/validate/scaffold;合同命名空间两种风格并存;registry 存在 discovery 之外的运行时突变通道(GitWorkspaceInputAdapter 首次 `prepare()` 时才 `register_resource_provider`,且一进程锁死一个 repo)**[REPOSITORY VERIFIED]**。第三方拿到的现状是"蒙着眼睛 pip install,出错后只有 list 一条命令可看"。
3. **conformance 是把这套东西变成公共协议的唯一杠杆**:ADR-0006 与 round-1 已把 dispatch 冻结/类型校验/幂等语义写成可测规格;这些测试目前散在自家 tests/ 里,第三方无法执行。抽成 kit 后,"Agent-Box 兼容插件"才第一次成为可验证命题而非自我声明。

---

# Current plugin reality

## 审计表

| # | 审计项 | 状态 | 事实(均 REPOSITORY VERIFIED 除注明外) |
|---|---|---|---|
| 1 | Entry-point group | READY | Core 面 `agent_box.plugins` 一个([loader.py:19](../../../../src/agent_box/extensions/loader.py#L19));Board 私有两个:`agent_box.workboard_resource_inputs` / `agent_box.workboard_execution_controls`(五个插件 pyproject 均核验) |
| 2 | Discovery | READY | `importlib.metadata.entry_points().select(group)`,按 (name,value) 排序加载;失败逐插件隔离进 `PluginLoadRecord`,`strict=True` 才 fail-fast |
| 3 | Manifest/descriptor | PARTIAL | `PluginDescriptor(id, display_name, version, api_version)` 四字段而已([api.py:14](../../../../src/agent_box/extensions/api.py#L14));无组件清单(capabilities/provides/config schema/docs locator) |
| 4 | api_version | READY(门禁)/PARTIAL(策略) | 加载时严格等值比较,不符→记录 error 且不注册(incompatible-visible 测试护住);无兼容区间/deprecation 语义 |
| 5 | id/version/display_name | READY+风险 | id 正则约束、非空校验齐备;version 为手写字符串("0.1.0"),与 pyproject 各写一份——双 manifest 漂移点 |
| 6 | ExecutionProvider 注册 | READY | 经 `PluginRegistration.execution_providers`;descriptor 必填;原子 staged 替换;同 id 拒绝(codex 2 个、pi/tmux 各 1) |
| 7 | ResourceProvider 注册 | **INCONSISTENT** | 三条并存路径:①bundle 注册(pi 注册 PiSessionResourceProvider);②**包装 core 内部类**:preview-resources 直接 `from agent_box.work_core.providers.resources import …` 再 bundle 注册;③**运行时突变**:GitWorkspaceInputAdapter 在首次 `prepare()` 时构造 `GitWorktreeResourceProvider(repo,…)` 并 `registry.register_resource_provider(...)`,且明示一进程一个 repo([inputs.py:31](../../../../plugins/agent-box-preview-resources/src/agent_box_preview_resources/inputs.py#L31))——违反"discovery 期不写运行时状态"的精神(api.py 的 PluginContext docstring 明文要求只在被使用时创建数据,这里变成了在被使用时改全局注册表) |
| 8 | Contract 注册 | READY 核心/INCONSISTENT 规范 | versioned frozen dataclass 校验、未知 contract 拒绝 provider、重复拒绝;命名两风格并存:`agent-box.codex-continuation@1`(vendor 内嵌产品名)vs `agent-box-pi.continuation@1`/`agent-box-tmux.console@1`(伪 vendor 连字符)。ADR-0006 §2.1 把 codex_continuation_v1.py 列在 `resource_contracts/` 目录下,实际在 codex 插件内——文档已漂移 |
| 9 | WorkBoard adapters 发现 | PARTIAL | Board 自带 `load_adapter_factories(group)`:逐 adapter try/except,坏的以 `(group,name,None,error)` 记录并继续渲染([adapters.py:81](../../../../plugins/agent-box-workboard/src/agent_box_workboard/adapters.py#L81));协议面 `ResourceInputAdapter(bind/fields/choices/prepare)` + `ExecutionControlAdapter(bind/attach_command/recover/observe/finish)`;但无任何校验把 control adapter 关联到已注册的 ExecutionProvider id(名字仅是约定:"codex-tmux"/"pi") |
| 10 | Config 放哪里 | INCONSISTENT | pi:`$AGENT_BOX_HOME/plugins/pi/config.json`,非 secret 白名单 `_CONFIG_KEYS`,懒读取、错误延迟到首次使用([config.py](../../../../plugins/agent-box-pi/src/agent_box_pi/config.py));codex/tmux:无 config 模块,binary/版本隐式;workboard:drafts 在 `$AGENT_BOX_HOME/plugins/workboard/drafts/<execution_id>.json`。无共享 config schema/version 面 |
| 11 | Secret 处理 | PARTIAL | 方向正确零强制:FormField 有 `secret` 掩码位;Pi 显式排除凭据只引用 env(`DEEPSEEK_API_KEY`)或 Pi 自有 auth;Ref metadata(bounded str map)可塞任何字符串,无扫描、无证明手段 |
| 12 | install/list/doctor | PARTIAL | 安装=README 手工 `pip install -e ./plugins/…`(codex README 手写 tmux 先装顺序);CLI 仅 `agent-box plugins list [--json]`(含 status/error/exit-code 语义);**inspect/doctor/validate/scaffold 全部 ABSENT** |
| 13 | Error isolation | READY | core loader 每插件隔离 + duplicate-id 拒绝 + "可见但不注册"测试;Board 每 adapter 隔离;两层互不知晓是合理分层 |
| 14 | 版本兼容 | PARTIAL | api_version 单值硬门禁;contract `id@N` 不可变边界经测试固定;descriptor↔pyproject 双写无机制;无 deprecation 流程 |
| 15 | 测试 | PARTIAL | 强:`test_extensions.py`(动态注册参与真实 dispatch 类型检查、原子性、不兼容可见)、`test_resource_contracts.py`(**依赖方向有专门测试**:contract 包不得依赖 core/provider;core 模块不得 import 产品实现)、`test_work_core_input_dispatch.py`(freeze/digest/顺序无关/persist 前拒绝/resolve-type 失败记 failed/post-dispatch 禁增 input)。缺:无第三方可执行的 conformance;descriptor 声明与对象实际无一致性检查 |

## 五插件不一致清单

1. **角色组成五花样**:codex=1C+2EP;pi=1C+1RP+1EP(+唯一 config 模块);tmux=2C+RP+control+input adapter;preview-resources=0C(复用 core 的)+2RP+3input adapters;workboard=独立 Host 应用,**根本不带 `agent_box.plugins` 组**(pyproject 无该组,released as `agent-box-workboard` script)。"一插件多角色"已是现实,没有人被迫一产品一类——约束 3 已满足。
2. **contract 命名双风格**(见上第 8 行)。
3. **ResourceProvider 三条注册路径**(见上第 7 行)——本轮最严重发现。
4. **capabilities 名存实亡**:Protocol 有 `capabilities()`,但各 EP 返回稀疏;resume 等依赖 require_capability 的路径因此从未激活(round-1/03 判定)。
5. **control/input 组名与 provider id 无形式化绑定**;"卸载 codex 插件后 board 上残留死的 control 按钮"这类问题当前没有任何检测面。
6. **README 成色参差**:codex/pi 讲清了角色与安装顺序,pi 补了并发与 continuation 立场;无一回答"Evidence ceiling/不能证明什么"(Composer 设计三层边界的语言没有被插件文档继承)。
7. **版本手写双份**(见上第 5 行)。

---

# Standard package layout

最小第三方插件目录(以假想 `agent-box-example` 为例):

```text
agent-box-example/
├── pyproject.toml          # 必须:[project] 元数据 + [project.entry-points."agent_box.plugins"]
├── README.md               # 必须(§Documentation standard 清单)
├── LICENSE                 # 必须
├── src/agent_box_example/
│   ├── __init__.py         # 必须(空)
│   ├── contracts.py        # 可选:仅当贡献 Resource Contract(frozen dataclass,id@N)
│   ├── providers.py        # 可选:ExecutionProvider / ResourceProvider 实现
│   ├── config.py           # 可选(若插件有自己的长期配置):照 Pi 模式(
│   │                       #   $AGENT_BOX_HOME/plugins/<id>/config.json,
│   │                       #   非 secret 白名单,懒读,首用报错)
│   └── plugin.py           # 必须:create_plugin() -> AgentBoxPlugin
│                           #   descriptor()+build(context)->PluginRegistration
├── workboard.py            # 可选:仅当贡献 Board 私有组(input/control)
├── evidence.py             # 可选:v1 起(evidence exporter 角色)
└── tests/
    ├── conftest.py         # 可选
    └── test_conformance.py # 推荐:直接 import agent_box_conformance 跑套件
```

裁决:**必须项只有 pyproject(entry-point)+plugin.py+README+LICENSE**;其余按贡献角色选装。理由:(a) preview-resources 只有 inputs+plugin.py 也是合法插件——约束"不得要求所有插件包含所有角色";(b) contracts/providers 分文件不是技术必需而是审阅卫生,让 reviewer 一眼看到信封数据与副作用代码的分界;(c) scaffold(§10)生成的正是这个骨架的最小子集。

**明确禁止出现在包里的东西**(违反即 conformance FAIL):core imports 之外的产品补丁(monkeypatch agent_box.*)、import 时副作用(写文件/起进程)、descriptor 声明与 build() 返回不一致的组件。

---

# Descriptor

现四字段之上做**纯增量、向后兼容**的扩展(P0):

```python
@dataclass(frozen=True)
class PluginDescriptor:
    id: str                      # 现状保留(正则不变)
    display_name: str            # 现状保留
    version: str                 # 现状保留(过渡期)
    api_version: int = 1         # 现状保留
    # ---- P0 新增(全部带默认值,旧插件不写也 READY)----
    provided_contracts: tuple[str, ...] = ()      # 静态声明:contract_id 集
    execution_providers: tuple[str, ...] = ()     # 静态声明:EP descriptor id 集
    resource_providers: tuple[str, ...] = ()      # 静态声明:RP descriptor id 集
    capabilities: Mapping[str, str] = {}          # 聚合声明:见 §Capabilities 键表
    config_schema_version: int = 0                # 0 = 插件无 config 面
    docs_url: str = ""                            # documentation locator
```

静态 vs 动态来源(避免两份会漂移的 manifest):

| 信息 | 来源 | 说明 |
|---|---|---|
| plugin id / api_version | **半静态**:entry-point 指向的模块 import 后调用 descriptor() 获得 | 不放 pyproject:描述符带逻辑(id 正则/默认值)且有既有测试基线;单纯搬进 [project.metadata] 会创造第二事实源 |
| version | **理想为单一来源**。P0 裁决:descriptor.version 改为可选 — 未提供时 loader 从 `importlib.metadata.distribution(name).version` 自动填充;显式提供则 doctor 比较两者,不一致告警 | 消灭双写漂移而不破坏现有五个插件 |
| 组件清单(provided_*) | **动态为准、静态为快照**:build() 返回的 registration 是真值;descriptor 声明用于 install 前 inspect(免 import 依赖检查)与 P0 的 doctor 对账。两者不一致 = doctor FAIL(降级 warning→P1 升 hard error) | 这是"避免漂移"的正解:**让两份可自动对比**,而不是砍掉一份(砍静态则 inspect 无从谈起;砍动态则失去原子注册的真值) |
| capabilities | §Capabilities:聚合自各 ExecutionProvider.capabilities(),P0 允许缺省(由 doctor 从对象回填核对) | |
| config_schema_version / docs_url | 纯静态 | |

---

# Entry-point decision

审判四案(比较维度:discovery/lazy load/error isolation/dependency/versioning/third-party simplicity/WorkBoard 可选/Core 边界):

| 方案 | 内容 | 主要优点 | 致命缺点 |
|---|---|---|---|
| **A. 单一 `agent_box.plugins`,返回 Plugin 对象**(现状 core 面) | 一次入口,一次 build,任意角色组合 | discovery 简单;原子注册;错误按插件隔离(已有测试);api_version 单点门禁;零 lazy-load 复杂度(registration 本身轻量,provider 状态本来就规定懒创建——PluginContext docstring) | descriptor 信息需 import 后获得(P0 用快照缓解);不解决 Board 私有面 |
| B. 每种扩展一个 group(ExecutionProvider/ResourceProvider/Contract/InputAdapter/Control/Exporter/Host 七个 group) | 点菜式 | 真·lazy load:未用到的类别不 import | 七分之一粒度的 python 包要拆七个组或一份代码注册七处;**跨组件一致性(contract 先于 provider、同名对账)没人再担保**——现在靠"一次 build 内先 contracts 后 providers"的顺序规则(loader.py 注释明文);错误隔离碎片化,半残插件更难诊断;第三方从"写一个对象"变成"读懂七个 schema" |
| C. pyproject 静态 manifest + entry point | TOML 里声明组件清单 | inspect 免 import | 第二份必漂移清单(version/组件集),doctor 要同时信任并怀疑它;Python 生态里静态插件税反直觉 |
| D. 现状完全不动 | — | 零成本 | 留下 §审计第 5/7/8/12 行的全部缺口;第三方故事不成立 |

**裁决:A 为首选,B/C 否,D 不够。**迁移策略=不迁移:P0 只做增量(descriptor 新字段 + config 标准化 + CLI),entry-point 语义一字不改;Board 私有的两个 group 保持原样,但在 SDK 文档中正式命名为 **Host-owned extension pattern**(任何 Host 可自定义自己的 group,自己负责隔离与校验——WorkBoard 已经示范了完整做法:独立 group、逐 adapter 隔离、不触碰 Core)。这也正是 round-3 定下的"Kernel 扩展面只有三种组件,其余是 Host 私有协议"的执行化。[ROUND-3 EVIDENCE]

---

# Registration lifecycle

八个阶段映射到现状(✅已有)与增量(➕P0/P1):

```text
discover   ✅ entry_points select+sort                ➕ (不动)
inspect    ➕ plugins inspect <id>:import descriptor-only 快照
           (风险提示:import 即执行模块顶层代码——文档必须警示第三方保持顶层纯净;
            P1 可加"import 隔离沙箱评估",Preview 用文档纪律即可)
compat     ✅ api_version 等值门禁                    ➕ doctor 显示 host/plugin API 与
           contract 版本对照表
load       ✅ 逐插件 try/except → record             (不动)
register   ✅ register_components 原子staged;        ➕ 唯一性错误信息带冲突方
           先 contracts 后 providers                  descriptor 全文(现在只有 message)
validate   ✅ 同 id/contract 冲突拒绝                 ➕ descriptor.provided_* ↔ registration
                                                      对账(doctor);control/input adapter
                                                      ↔ EP id 弱引用提示(warning)
health     ➕ plugins doctor:每插件逐项——READY?
           声明一致?capability 可实例化?config 存在
           且 schema 匹配?secret 扫描?历史 Ref 可读?
ready/error ✅ READY 或 error 记录;list --json 已暴露 ➕ exit code 表扩张(inspect/doctor)
```

边界情形处置(**REASONED PROPOSAL**,依现有机制推导):

- **partial failure**:registration 原子性保证"要么全进要么全不进"(staged copy 有测试);不会出现半个插件。
- **ID 冲突**:第二家同 id 插件整体不入册(record 标错);`plugins list` 能看到两家 entry_point 名——第三方排障靠这个,不加覆盖语义,**永不后到者胜**(预测性优先于便利)。
- **contract 冲突**(同 contract_id):同样拒后到者;`@N` 版本共存走不同 id(contract id 本身含版本),不需要特殊逻辑——这正是 ADR-0006 版本即 id 设计的红利。
- **optional dependency 缺失**(如 pi 缺 tmux 包):import 失败进 record,list 显示;文档要求插件把重依赖移入 provider 构造期(Pi 模式:bundle 时 `del context`,用到才查 binary)。
- **插件升级**:Python distribution 层 pip 重装,新进程生效;进程内不允许热替换(见下条)。
- **卸载后历史 Ref**:DB 行永存;ref.provider 解析将 ProviderUnavailable——evidence 仍可读(native_id/uri/metadata 都是数据),只是不可 re-resolve;此性质必须进 conformance(uninstall-readability 测试,§9)。
- **同一进程重复注册**:现行为即拒绝(register_components 覆盖语义不存在);SDK 文档写死"registry per process,构建一次"。
- **thread/process safety**:SQLite WAL + busy_timeout 承担多进程(限单机);in-process registry dict 非线程安全——文档约定宿主单线程加载后只读共享(dispatch 并发发生在 services 层,访问只读 dict 安全)。[REASONED PROPOSAL 依据 REPOSITORY VERIFIED WAL 现状与 dict 语义]

---

# Configuration and secrets

六层存放位置与优先级(高→低作用于一次 Dispatch 时的资源解释,彼此不合并、各自 owner 明确):

| 层 | 存放 | Owner | 进 Binding? |
|---|---|---|---|
| native product config(binary/model/MCP JSON/approval policy) | 产品自有目录(pi agent_dir 等) | 产品 | ❌ 永不 |
| secret value | env(HOSTED 运行环境注入)或产品 auth store | 产品/env 管理 | ❌ 永不;也不进 events/evidence/descriptor |
| global plugin config | `$AGENT_BOX_HOME/plugins/<pid>/config.json`(Pi 模式标准化) | 插件 | ❌(其 digest 见下) |
| named provider profile | `$AGENT_BOX_HOME/plugins/<pid>/profiles/<name>.json` | 插件 | 仅以 ProfileRef(profile@1 同构)+ **digest 字符串**进入 |
| project config | `.agent-box/plugin-settings.json`(per-repo 默认值,如默认 repo path) | Host/UI 起草 | 其值物化为 Ref 参数;文件本身不进 Binding |
| execution Binding | `core_execution_refs` frozen `(contract_id, Ref)` | **Core** | ✅ 唯一冻结层 |

优先级规则一句话:**越靠近 Binding 的层说了算;每层只能影响"本次选择什么 Ref",不能影响"Provider 如何启动"。**(Composer 三层边界的配置版复述)[REPOSITORY VERIFIED 产品设计一致性]

强制要求逐条落实:

- **secret value 不进任何持久面**:descriptor/binding/events/evidence 四处均为结构化禁止——P0 以 conformance 的 secret-scan(§9)与 FormField.secret 掩码实现;Pi 白名单模式(config.py 顶部 `_CONFIG_KEYS`)升格为 SDK 文档标准模板,scaffold 直接生成同构文件。
- **Core 不解析产品配置**:现状已成立(core 无任何 product config import;resource_contracts 依赖方向测试护住)——规则化写入 SDK 文档第 1 条。
- **Plugin 可以返回 config digest/profile Ref**:provider.descriptor() 增补可选 `config_fingerprint()`(稳定摘要,来自白名单键排序 canonical json)——dispatch provenance metadata 记录之(bounded value),Binding 本身不含。
- **配置漂移检测**:两次 dispatch 的 fingerprint 不同 = doctor/report 层面警告"长期配置在两次责任窗口之间变化";这复用 Binding 冻结思想而无需新表。**[REASONED PROPOSAL]**
- **第三方创建 profile**:scaffold 生成 `profiles/example.json` 模板 + 文档三步(写文件→`plugins inspect --config`→composer choices() 自动出现——ProfileInputAdapter.choices 已演示从 repo 列举的通路 [REPOSITORY VERIFIED])。

---

# Provider/adapter protocols

每种扩展面的最小协议与归属(P0 视角;每条只保留 ≥2 个真实插件需要的能力——判定随附现状证据):

| 面 | 最小协议 | 归属 | ≥2 插件? |
|---|---|---|---|
| ExecutionProvider | 现 Protocol 五方法不动(descriptor/capabilities/input_limits/start/observe) | Core SPI | ✅ 4 家(codex×2 形态、pi、未来 CI 类) |
| ResourceProvider | 现 Protocol 不动(supported_contract_ids/descriptor/resolve) | Core SPI | ✅ tmux、pi-session、profile/artifact/git(preview-resources 包装) |
| Resource Contract | ADR-0006 全套(frozen dataclass、id@N、字段校验、负空间清单) | 共享数据类型(可位于插件包或 agent_box.resource_contracts) | ✅ 3 家自有 contract |
| ResourceInputAdapter | bind/fields/choices/prepare → PreparedInput(contract_id/ref/requested/exact/assurance)——保持 Board 私有,**但收紧一条:prepare 只产 Ref 候选,禁止在体内注册 registry 组件**(§审计发现 ③ 号路径废除,git provider 回归显式 bundle 或独立 local-resources 包) | WorkBoard | ✅ 4 家 |
| WorkBoard control adapter | bind/attach_command/recover/observe/finish——不变;新增弱关联声明:`provider_ids: tuple[str,...]`(board 用它过滤失效按钮 + doctor 提示孤儿 control) | WorkBoard | ✅ codex-tmux、pi 两家 |
| Evidence collector/exporter | v1 引入最窄接口:`collect(execution_id) -> Iterable[EvidenceClaim-like dict]`(只读 store/snapshot)与 `export(execution_id, fmt) -> bytes/path`;格式为 additive(fmt 自声明) | Host 侧包(evidence.py;不含 Core) | ⏳ P1 起才有第二家(pr 卡片导出器),故 P0 只定 shape 不建 protocol 类 |
| workflow Host adapter | **永远不设协议类**:LangGraph/Temporal wrapper 是普通 Python 包函数族(sdk in/out),注册进任何 registry 都违背 round-3 裁决 | 独立 adapter 包 | n/a(概念堆叠警戒名单成员)[ROUND-3 EVIDENCE] |

原则重申(与 §Extension protocol 概念堆叠黑名单一致):新协议面准入条件 = ≥2 异构真实实现 PR 或一桩"没有它会出 bug"的事故引用;optional capability 优先于胖基础 Protocol(round-3 已裁定 Capability flags 吸收 observation/recovery 差异)。

---

# Capabilities

键表(ExecutionProvider.capabilities() 的受控词表,P0 固化九键;缺省视作 absent):

| key | 取值 | 谁消费 |
|---|---|---|
| `contracts.supported` | csv of contract_id | Core(dispatch 数量检查前置) |
| `interactive` | supported/emulated/absent | Host(UI 选择 provider、等待模式决策) |
| `attach` | 同上(附 attach_command 由 control 提供) | Board control 过滤 |
| `explicit_finish` | 同上 | Core 不强制;settlement 语义归属方(host policy)依赖 |
| `recover` | 同上(recover 钩子存在且可实现指纹检索) | reconcile_pending 消解流程 |
| `continuation` | 同上或具体 contract 引用(如 consumes `*-continuation@1`) | Composer OPTIONAL 区展示 |
| `observe` | supported(实质必配,start 的孪生) | Core projection 采集 |
| `post_run_evidence` | emulated 起(capture scrollback/jsonl digest 属此类) | evidence collector 建议源 |
| `cancel` | **谨慎引入**:仅当 ≥1 真实 substrate 有原生 interrupt(app-server turn interrupt 现成 [ROUND-1 EVIDENCE]);absent 不是缺陷,如实申报即可 | Host/用户决定是否给按钮 |

三方分工:

- **Core 硬检查**:`start` 隐含必配;`observe` 在 observe_projection 路径上;`cancel/resume(如启用)` 走 require_capability(stated policy 维持:supported/emulated 才放行)——现 require_capability 门禁就是执行点 [REPOSITORY VERIFIED registry.py:201]。
- **Host/adapter 软消费**:interactive/attach/explicit_finish 用于 UX 与等待策略,缺失时降级而不是崩溃(board 现在"no adapter installed"提示语已是模板)。
- **conformance suite 行为抽查**:宣称 recover=true 的 provider 必须通过注入 fake pending receipt 的恢复剧本;宣称 explicit_finish=false 则 finish 调用应抛 CapabilityUnsupported——声明与行为的差距在这里暴露。

**descriptor 声明与实际不一致时怎么办**(题设必答):分两级——(a) 结构级(provided_* 名单、contracts.supported 与对象属性矛盾):doctor FAIL,发布阻断;(b) 行为级(宣称 supported 但剧本不过):conformance 报红,不影响运行(Core 只信 runtime 检查);对外徽章(label=v1-conformant)只有全绿可挂。运行时永不因声明不符而静默采用保守假设以外的东西——保守方向一律按 absent 处理,保证能力收缩安全。

---

# Conformance kit

发行一个 `agent-box-conformance` 包(pytest plugin 形态):第三方在自己 tests/ 里 `pytest --abx-suite=all` 即可执行;不要求第三方把插件代码交给 Agent-Box 仓库。

```python
# 第三方 tests/test_conformance.py 全部内容(设计目标)
from agent_box_conformance import abx_suite
abx_suite(fixtures={"plugin": my_plugin, "store": tmp_path})
```

套件分组与最小测试单(16 项指定能力 → 分桶):

**generic(所有贡献形态必过)**
1. descriptor 合法性:id 正则/非空/api_version int
2. ID uniqueness:与宿主内置及常驻 mock 插件同 id 时拒后到且给出双方信息
3. contract registration:frozen dataclass/id@N 正则/重复拒绝/未知 contract 拒 provider
4. Ref round-trip:make_ref→serialize→Re hydrated equality(metadata bounded)
5. secret scan:descriptor 全字段+Ref metadata+PreparedInput summaries 无 secret 模式(hit 高熵串/key 类词/绝对路径里的 token)——报告制(非硬失败,V1 转 hard)

**ExecutionProvider 组**
6. resolve type:注入错误类型 resolver → dispatch 必 failed 且 persist 了失败行(对应 test_dispatch 现有用例移植)
7. input limits:超 max/min 不满足 → persist 前拒绝
8. dispatch idempotency:同键同 digest 二次调用返回既有 receipt 且 start 恰好 1 次(start 计数器 fixture)
9. start failure:start 抛异常 → failed 行落库、无 correlation 幽灵
10. native refs:返回后的 NATIVE attach 去重幂等
11. terminal monotonic expectation:terminal 投影后再喂 active → 拒绝/忽略且 ended_at 一致(round-3 I3 验收的 conformance 化——注意这同时是给 Core 的回归标的)
12. finish capability:explicit_finish=true ⇒ finish剧本产出 settlement 数据;false ⇒ 抛 CapabilityUnsupported
13. recovery:pending(recovered)/ambiguous 二分支收敛,禁止第三态与二次 start(round-3 K4 的机械执法)

**ResourceProvider 组**
14. resolve type/limits 共享 6–7;另加 read-back 时点承诺声明(resolve 后何物必须仍成立)不可虚标

**WorkBoard adapter 组**
15. fields/choices/prepare 契约:choices 崩溃不炸 UI(孤立 ChoiceResult(error));prepare 不 mutate registry(§7 新规则的可执行版)

**Evidence adapter 组**
16. claim schema:必填字段(level/disposition/coverage/issuer/method)存在且取值在词表;plugin uninstall history readability:未安装状态下打开 store 读 refs/events 报告可生成

分发形态 Preview=P0 一个 wheel + 文档页;成熟前允许第三方选择性跳过 11/13(标注 skip reason 显示于徽章)。**[REASONED PROPOSAL]**

---

# CLI and developer experience

命令矩阵(✅=已存在;/=P0/=P1):

| 命令 | 输出概要 | 阶段 |
|---|---|---|
| `agent-box plugins list [--json]` | 现状保留(status/error/组件聚合) | ✅ |
| `agent-box plugins inspect <id>` | descriptor 全文 + pyproject 对账(version drift 警告)+ 组与合同清单 + docs_url;`--config` 附带 config schema 摘要与示例路径 | P0 |
| `agent-box plugins doctor` | 逐插件:READY?/声明一致/capability 可实例化/config 存在&schema 匹配/secret 扫描/历史可读;退出码非零当有任何 FAIL(exit code 语义沿用 list 先例) | P0 |
| `agent-box plugins validate <path>` | 不安装地检查一个 checkout:pyproject 组存在、plugin.py 可构建(临时 venv 外 dry-import 说明 limitation)、README 必答节齐全、conformance generic 子集试跑 | P1 |
| `agent-box plugins scaffold <name> [--roles ep,rp]` | 生成 §Standard package layout 骨架:pyproject(空 entry-point 指 plugin.create_plugin)+plugin.py(descriptor/build 骨架)+所选角色 stub(contracts.py 带 @dataclass 示例/providers.py 带 Protocol 签名注释)+config.py(Pi 模式)+README 骨架(§12 十三问占位)+tests/test_conformance.py(六行 import)+tests 直接可跑的 generic 套件 | P1 |

Preview 必须=P0 三个(list 增强/inspect/doctor):理由——没有 inspect,install 前"我在装什么"不可答;没有 doctor,"装坏了为什么"不可答;scaffold/validate 属提升体验,不属止血。`scaffold` 只生成骨架不产业务逻辑——按题设硬约束,stub 内全部 raise NotImplementedError 并留 ADR-0006/本文档链接。**[REASONED PROPOSAL]**

---

# Versioning

六个版本轴,一张表说清(拒绝远程协商;一切以本地静态对账完成):

| 轴 | 载体 | 兼容规则 | 谁 bump |
|---|---|---|---|
| Core API(plugin 所见) | extensions/api PLUGIN_API_VERSION=int | 相等才加载;host 升 major 时旧插件可见错误记录+迁移指引(doctor) | Core 仓库 |
| Plugin API | 同上(plugin 侧填写) | 同上 | 插件作者 |
| Contract | `vendor.name@N`(id 内嵌版本) | N 内字段含义恒定;破坏=N+1 新 id,二者可在库中并存(registry 支持多 id 并存天然成立) | contract 拥有方 |
| Ref schema | models.Ref 五元组+RefType 枚举 | **additive-bump 约定**:新增枚举值=minor(老 reader 见未知 type 应显示 raw 而非崩溃——Board 已经"Unknown Ref contracts remain viewable generically"[REPOSITORY VERIFIED workboard README]);改动既有五元组=major(PLUGIN_API 同时动) | Core 仓库 |
| config schema | config_schema_version(descriptor) | 插件自管;读取端(mismatch)降级为告警+首次使用报错的 Pi 语义 | 插件作者 |
| Evidence schema | 每 claim 携 `schema: "abx.evidence@1"` | 词表数值开放区间(round-2 D 结论采纳);major 变更=新 schema 串并存 | Core+共识 |

Backward compatibility/deprecation:deprecation 仅两个传播位——doctor 输出 WARNING 行 + docs changelog 页;不做 runtime 多版本 shim。Major coexistence 的实现全部仰赖「id 即版本」(contract)与「目录隔离」($AGENT_BOX_HOME/plugins/<id>)两条既有性质,不新建机制。**[REASONED PROPOSAL]**

---

# Documentation standard

第三方 README 必答十三问(P0 成为 validate 的机检子集:标题锚点检测):

1. 提供什么角色(EP/RP/Contract/Board adapters/…)——对应 descriptor provided_*
2. 支持哪些 contracts(id@N 列表+每个一句消费语义)
3. 如何安装(pip 来源、要求的先装依赖——codex README 的 tmux-先装段为范例)
4. 如何配置(层次表:global/project/profile;secret 用 env ref 声明)
5. 如何创建 exact Ref(selector→pin 示例代码块)
6. 如何 Launch(dispatch 最小调用片;幂等键建议公式)
7. native identity(会产出哪些 Session/Run/ArtifactRef,谁拥有它们)
8. 如何 Finish(显式动作=哪个调用/按钮;idle≠finish 的立场句)
9. 如何 Recover(recover 场景与 ambiguous 诚实条款)
10. **Evidence ceiling**:每个 slot 最强可达 level(projected/provider-reported/process-observed/external-authority/attested/unknown 六档+[ROUND-1 EVIDENCE 词表])
11. **不能证明什么**(negative claims/attention/undeclared inputs 一律 unknown 的红线声明)
12. secret handling(哪里存放、为何不进 binding/evidence)
13. known limitations(已知缺陷/单 repo/进程限制之类)

现五家 README 对照:coding 3/4/12 基本达标(codex/pi 强,tmux 中),10/11 全员缺席(Evidence ceiling 无人写)——P0 内置插件先行补齐作为范文。"每一问在 ui/composer 上的镜像"沿用 Composer 设计的三层边界话语(TUI 选什么/插件管什么/Core 记什么),让文档与 UI 说同一种话。

---

# P0/P1/P2 implementation

## P0 — Preview(目标:第三方能自助排障;~最小侵入)

**改**:
1. PluginDescriptor 增 6 个带默认值新字段(§Descriptor);loader 对账轻微增强(provided_* mismatch=record warning);
2. `plugins inspect`/`plugins doctor` 两命令;
3. Git ResourceProvider 归位:从"input adapter 运行时突变注册"改为 preview-resources bundle 显式注册(多 repo 支持改造顺延,先消除违例路径);
4. `agent-box-conformance` v0:generic 5 项 + EP 组 8 项中可直接移植自现测试的 6 项;
5. README 十三问模板 + 五个内置插件补 Evidence ceiling/不能证明什么;
6. SDK 文档页(scope:ADR-0006 导读+三层边界+package layout+config 标准模板+versioning 表)。

**不改**:entry-point 机制/discovery/loader 主干/migration/schema/既有五插件行为语义(除 git-provider 注册途径这一处修复)/无 marketplace/installer。

**验收条件**:①doctor 对五个内置包全绿,人为破坏其一(重复 contract_id)时 list+doctor 给出可行动错误;②示例插件=prompt-scaffold 产物可过 conformance generic 全部+EP 组 6/8;③`plugins list --json` 向后兼容(旧消费者解析不炸——新字段皆 optional);④test_extensions/test_resource_contracts/test_input_dispatch 零回归(135 基线 continue-passing)。

**兼容风险**:descriptor 动态默认与新静态快照的短暂双轨(round-3 红队的"stable 是过期支票"教训在此重现:凡承诺必须与 doctor 实现同步上线,否则第二份谎报面);双写 version 漂移在过渡期只 warn 不 error。

## P1 — v1(目标:第三方从 0 到兼容插件 ≤半天)

**改**:scaffold/validate 两命令;capability 行为一致性剧本(recovery/finish/monotonic)全量入 kit 且可挂徽章;evidence exporter 最窄接口定稿+PR-card 参考导出器;Host-owned extension pattern 文档化(Board 私有组的正式规范);多 repo git-resolver 支持(解除一进程一 repo)。
**不改**:七类角色的协议形状;Core ontology;entry-point 拓扑。
**验收**:外部志愿者用 scaffold+docs 完成 demo 插件并过全套件(用时记录,目标 ≤半天);dashboard/board 徽章显示 conformance 结果。
**兼容风险**:kit 与内核演进耦合(每次 Core 语义变更=kit 更新义务——用 135 基线同跑守护)。

## P2 — ecosystem(仅在 P1 徽章出现第二、第三个外部佩戴者后启动)

**考虑**:非 Python Host 的 sidecar/gRPC ABI 预留评估(round-2 D 遗留问题#3 的正名时刻);conformance 版本化(v1/v2 套件并存);签名与信任立场的白皮书(**仍是文档,不做 infra**)。
**不做**(红线续期):远程 marketplace、容器平台、中央插件仓库、runtime 远程协商。
**验收(触发式)**:≥2 个与我方无关的组织提交过兼容插件;此前 P2 项目一律不开工。
**兼容风险**:生态诉求倒逼 Core 私货(例如为了某大插件放宽 isolation)——以 kill 条款对应:任何为此放松 §新规则的 PR 直接触发架构评审。

---

# Final verdict

## **B. 当前 entry-point 可保留,但需要 Plugin SDK + conformance。**

排除法论证:

- **不是 A(只补文档和 scaffold)**:audit 第 5/7/8/9/12 行的每一个缺口都不是文档病——descriptor 无组件清单使"装前自查"不可能;register_resource_provider 的运行时突变是一条会被第三方效仿的违例路径,必须以机制收紧;contract 命名分叉若无 conformance 提名规范化,第二个外部插件会把第三种风格带进来。文档治不了缺失的接口面。
- **不是 C(重新设计 discovery/registration)**:被攻击的主干恰好是被测试钉得最死的部分——单组+Plugin 对象+原子注册+隔离+api_version 门禁,五个用例与"未知 contract 拒绝 provider""不兼容可见不注册"共同构成良性回路。现有病不在发现机制而在宣告机制(absence of rich descriptor)与纪律 enforcement(absence of conformance/doctor),换骨架是高成本低指向的动作。[REPOSITORY VERIFIED]
- **不是 D(拆成多个互不相关协议)**:多角色一体恰是当前优点(codex 一包带着 contract+两个 provider+control);真正分离的边界已经自然长出来了——Core SPI 三组件 vs Board 私有两 group vs 未来 Host 纯约定包。人为把它们切成"互不相关"等于放弃 build() 内部的顺序契约(contracts-before-providers)与原子性担保,把系统一致性换成注册拓扑的一致性税。[ROUND-3 EVIDENCE 概念堆叠黑名单同向]
- **不是 E**:本报告 15 项审计均有行级代码证据;缺口(declare surface/doctor/conformance)与现有资产(bootstrap/loader/registry/tests)一一相邻,不存在"证据不足以判断"的问题——不足的从来只是这三样交付物本身。

一句收束,回应 round-3 红队"第四轮别再审文档,去结 diff"的叮嘱:

> 本轮交付的不是又一份分析——是把那 11 项欠账里属于"插件边界"的三样工具(descriptor 宣告、doctor/inspect、conformance kit)画成了可以直接开工的图纸,并且点名了一条必须先拆除的违例(git provider 的运行时突变注册)。图纸之外的部分,同意红队:一周内应该看到的是 diff,不是第五轮文档。
