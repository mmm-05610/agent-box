# Root 与插件架构审计（2026-09-01）

审计对象：Agent-Box 2.0（Execution Governance Core 与 Plugin SDK）。
审计方式：对抗式、以当前工作区源码为准（本仓库 worktree 处于 dirty 状态，本报告引用的行号均以当前未提交源码为准；既有未提交修改不属于本轮产物）。本轮只做了只读检查与无副作用验证，未修改任何实现、测试或配置，未执行任何 Git 写操作。
审计基线：当前源码 > 历史文档；不以测试通过替代架构判断；不把 agent 场景本身误判为污染，重点看 authority 与依赖方向。

---

# Verdict

**一句话判定：Root 实际是一个名为 `agent-box-cli` 的聚合发行包（Core + Extension SDK + 契约 + Runtime 组成 + CLI），`work_core/` 本体经全量核验保持中立；真实污染集中在 Root 的 Extension/组成层——其中 sandbox 契约的"一 id 双类型"已构成 contract authority 冲突（P0），另有 5 项 P1 结构性问题构成 Resource Routing 的实际阻塞。**

核心数字：Root 发行名 `agent-box-cli` 2.0.0a1、零依赖；`src/agent_box` 约 4,841 行 Python + 9 个 SQL migration；11 个活跃插件发行包 + 1 个空壳（agent-box-workboard）；插件 src 层零跨插件 import、零反向依赖（唯一的运行时软反向依赖是 Root CLI → agent-box-web，见 Packaging 一节）；全仓唯一 workload 原生 spawn 单边归 runtime-local 的 `LocalHostTransport`，无双重 spawn。

重点假设核验结论（8 项）：

| # | 假设 | 结论 | 关键证据 |
|---|---|---|---|
| 1 | Root 发行名 agent-box-cli 但同时含 Core/SDK/contracts/runtime composition/CLI | **成立** | `pyproject.toml:6,45-46,51-55`；wheel 打包整个 `agent_box/*` |
| 2 | Runtime assembler 硬编码 agent-box.workspace@1 与 /workspace | **成立** | `extensions/runtime_composition/assembler.py:58-59,73-76`，与其模块 docstring（`:1-6` 自称 "no harness names, native configuration"）自相矛盾 |
| 3 | ExtensionRegistry 默认预注册四契约 | **成立（且不止四个）** | `work_core/registry.py:143`（经 `resource_contracts/__init__.py:17-24` 的 `CONTRACT_TYPES`）+ 第 5 个 `SandboxTemplateV1` 在 `registry.py:144-148` 延迟注册 |
| 4 | AgentBoxProfileV1 携带 agent_type、默认 provider=agent-box-profile | **成立** | `resource_contracts/agent_box_profile_v1.py:13,16` |
| 5 | Root Extension API 混合三层 | **成立** | 通用 SPI 与 harness 协议同在 `extensions/api.py`（PluginRegistration :93-109 与 HarnessProfileManager :152-157、HostControl :170-174、ContinuationRoute :211-214 同文件）；host 编排器 `HostFinalizationCoordinator` 在 `extensions/finalization.py:11`；`extensions/__init__.py:1-121` 把全部 30+ 名字摊平再导出 |
| 6 | Root CLI 硬编码 Web Host / Quick Launch / Git doctor / Preview 组合 | **部分成立** | Web Host 与 `/quick-launch` 硬编码成立（`cli/__init__.py:71,86,92,107`）；**Git doctor 是通用 `which("git")`（:98），未硬编码插件名——该子假设证伪**；Preview 官方组合只存在于 pyproject extras（`pyproject.toml:34-42`），CLI 代码内无 |
| 7 | PluginRegistration 成为扩展点大杂烩 | **部分成立** | 现有 8 个扩展点字段（`api.py:97-104`）且方向健康（不是大杂烩问题）；真实缺陷是**缺** credential_materializers 通道（协议在 `extensions/credentials.py:42-48`，无处承载、loader 不转发）——注册面是"少了一个通道"而非"太杂" |
| 8 | Runtime composition/Sandbox/Terminal/Credential 协议抽象层级不一致等 | **成立（多条实证）** | ① sandbox@1 一 id 双类型（P0，见 Findings F1）；② 全局可变注册表 `_TRANSPORT_OPERATION_HANDLERS` + terminal-session import 时注册 → import-order 依赖（`runtime_composition/protocol.py:25`、`terminal-session/tmux.py:256`、`runtime-local/provider.py:163-174`）；③ execution_id/dispatch_id 渗透组合协议签名与 selector（`assembler.py:69,88`、`coordinator.py:74-77`、`api.py:149`）；④ guest layout 权威三分且靠跨插件字符串约定耦合；⑤ web 前端与 facade 硬编码官方组合（`QuickLaunch.tsx:11-13,38-43`、`facade.py:256,259`） |

其他独立发现（勘察假设之外）：`SandboxV1` 是**永远无法注册的死契约类型**（其 id 已被 SandboxTemplateV1 预占，注册即抛 already-registered，`registry.py:164-168`），而 dispatch 的 isinstance 校验（`services.py:345-355`）使真实链路只接受 SandboxTemplateV1 形状——这不是理论风险，是已经在三处代码里靠鸭子类型桥接的现实；双装配路径语义不一致；migrations 携带大量**每台新库都会实际建出来的死 schema**；两处真实代码 bug（详见 Findings F16）。

最终判定见文末：**NOT READY FOR RESOURCE ROUTING**。

---

# Actual package map

以下为 2026-09-01 实测（`ls plugins/` 共 12 个目录；agent-box-workboard 为空壳）。行号依据当前源码。

## Root

- 发行名：`agent-box-cli`，版本 2.0.0a1，`dependencies = []`（`pyproject.toml:6,26`）
- Python 包：`agent_box`（`src/agent_box`），wheel = 整个包树（`[tool.setuptools.packages.find] where=["src"]`，`pyproject.toml:51-52`）+ `migrations/*.sql`（`:54-55`）。**无插件实现误入 wheel**（dist 内陈旧 wheel 清单亦证实只有 `agent_box/*`）。
- entry point：唯一 console script `agent-box = agent_box.cli:main`（`:45-46`）；Root 自身**不**声明 `agent_box.plugins` 入口组。
- 注册的 contract（Root 默认）：WorkspaceV1、PromptFragmentV1、AgentBoxProfileV1、CredentialRefV1（`resource_contracts/__init__.py:17-24` → `registry.py:143`）、SandboxTemplateV1（`registry.py:144-148` 延迟注册）。
- ResourceProvider / ExecutionProvider：无（Root 不提供 provider）。
- HostControl / selector / manager / continuation route：无。
- 子模块：`work_core/`（registry/repository/services/models/projection/events/errors/finalization/resource_observations/db/runtime）、`extensions/`（api/loader/bootstrap/conformance/diagnostics/credentials/finalization + runtime_composition/ + sandbox/）、`resource_contracts/`、`cli/`（+`cli/commands/plugins.py`）、`migrations/`。

## 插件事实卡

| 发行名 | 版本 | 包名 | entry（agent_box.plugins） | 注册 contracts | ResourceProviders | ExecutionProviders | HostControl | selector | manager | continuation route | 依赖 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| agent-box-harnesses | 2.0.0a1 | agent_box_harnesses | `harnesses`（plugin.py:14-15） | CodexContinuationV1（:37） | codex-profile、codex-continuation、codex-login（:38） | codex-app-server、codex-interactive（:39） | 2 个专用 control（:40-43） | agent-box-profile、codex-login（:45） | CodexHarnessManager（:44） | codex-native-session（:46） | agent-box-cli==2.0.0a1；**agent-box-terminal-session==2.0.0a1（声明但 src 从不 import）** |
| agent-box-harness-claude | 0.1.0 | agent_box_harness_claude | `claude` | ClaudeContinuationV1 | claude-code-profile、claude-code-continuation | claude-code-execution | ProviderHostControl（通用） | claude-code-profile-selector | ClaudeManager（harness 版本硬编码 "2.1.247"，plugin.py:33） | claude-native-session（:19） | cli + terminal-session（声明未用） |
| agent-box-harness-hermes | 0.1.0 | agent_box_harness_hermes | `hermes` | HermesContinuationV1 | hermes-profile | hermes-execution | ProviderHostControl | hermes-profile | HermesManager（版本硬编码 "0.19.0"，plugin.py:19） | **无**（provider 自述 native-resume unsupported，provider.py:31） | 仅 cli |
| agent-box-harness-opencode | 0.1.0 | agent_box_harness_opencode | `harness-opencode`（descriptor id 与其余四家命名风格不一致） | OpenCodeContinuationV1 | opencode-profile、opencode-continuation | opencode-direct | **无**（plugin.py:16 未注册 host_controls） | opencode-profile-selector | OpenCodeManager（版本硬编码 "1.18.21"） | opencode-native-session | 仅 cli |
| agent-box-pi | 0.2.0 | agent_box_pi | `pi` | PiContinuationV1（**命名空间脱离统一格式**：`agent-box-pi.continuation@1`，contract.py:6） | pi-session、pi-profile | pi | ProviderHostControl | pi-profile-selector | PiManager（版本自标 "third-party"） | pi-native-session | agent-box-cli>=2.0.0a1,<2.1.0（范围 pin，与他家精确 pin 不同） |
| agent-box-runtime-local | 2.0.0a1 | agent_box_runtime_local | `runtime-local` | RuntimeHostV1（plugin.py:58） | runtime-host-local | —（无 execution provider） | LocalRuntimeHostDiagnostics | runtime-host-local | — | — | 仅 cli |
| agent-box-sandbox-bwrap | 2.0.0a1 | agent_box_sandbox_bwrap | `sandbox_bwrap` | **`()空`**（sandbox 契约靠 Root 预注册 + selector 声明 contract_id，plugin.py:19-31） | bwrap-sandbox | — | BwrapSandboxDiagnostics | bwrap-sandbox | — | — | 仅 cli |
| agent-box-terminal-session | 2.0.0a1 | agent_box_terminal_session | `terminal_session` + console script `agent-box-terminal-session-bridge` | TerminalSessionV1（类型实为 Root 所有，contract.py 仅再导出） | direct-stdio、tmux | — | — | direct-stdio-session、managed-tmux-session | — | — | 仅 cli |
| agent-box-git | 2.0.0a1 | agent_box_git | `git` | —（用 Root 的 WorkspaceV1） | git-workspace | — | — | git-workspace | — | — | 仅 cli；**全仓唯一 FinalizationContributor**（git-workspace，plugin.py:46-48） |
| agent-box-artifacts | 2.0.0a1 | agent_box_artifacts | `artifacts` | —（用 Root 的 PromptFragmentV1） | artifact-file（sha256 校验本地文件） | — | — | responsibility | — | — | 仅 cli |
| agent-box-web | 2.0.0a1 | agent_box_web | **无插件 entry point**（是 Host，不是 plugin） | —（facade 聚合） | — | — | 聚合 report.ready | 聚合 | 聚合 | 聚合 | 仅 cli（requires-python >=3.9） |
| agent-box-workboard | 无 pyproject | agent_box_workboard（空目录） | 无 | — | — | — | — | — | — | — | 仅残留 1.x egg-info（记录 Requires-Dist: agent-box-cli>=1.9.0） |

## 依赖分类

- **Python import 依赖**：所有插件 src 只 import Root（`agent_box.extensions` / `agent_box.work_core` / `agent_box.resource_contracts`，含 `runtime_composition`、`sandbox`、`credentials`、`bootstrap`、`finalization` 子模块）。grep 全量核对：**src 层零插件间 import、零插件→agent_box.cli import**。
- **runtime protocol 依赖**：harness 插件 → 运行时必须存在 RuntimeHostV1/Sandbox@1/TerminalSessionV1 的 provider（input_limits 声明，如 `app_server/provider.py:317`）；tmux 载体依赖 terminal-session 模块**被 import 过**（import-order，见 F4）。
- **optional integration 依赖**：Root CLI → `agent_box_web.cli`（ModuleNotFoundError 防护的软依赖，`cli/__init__.py:71-77,86-90,107-112`）；web(Python Host) → Root 深层（`facade.py:8-14` 直接 import work_core.services/repository、extensions.finalization/bootstrap——web 即 Host，属设计内）。
- **test-only 依赖**：Root tests → harnesses/runtime-local/sandbox-bwrap/terminal-session 插件模块（`tests/test_bwrap_formal_dispatch_vertical.py:19-22`，还用了 bwrap 私有符号 `_tree_digest`）；web tests → 六个插件模块（`test_real_tmux_codex_e2e.py:103-108` 等）；pi tests → runtime_local/sandbox_bwrap/terminal_session（`test_pi_runtime_composition_offline.py:7-9`）。
- **声明未用**：agent-box-harnesses 与 harness-claude 的 pyproject 声明 `agent-box-terminal-session==2.0.0a1` 但 src 从不 import（它们只是要求运行时存在 TerminalSessionV1 provider）——这是把"runtime protocol 依赖"错写成了"import 依赖"。

---

# Root responsibility audit

**1. Root 是 Core、SDK、CLI，还是三者聚合？** 是聚合发行包：`work_core/`（Core 本体，约 2,400 行）+ `extensions/`（插件 SDK + 装载 + runtime composition 协议/装配器/协调器 + sandbox 协议 + credential 协议 + host 编排，约 1,250 行）+ `resource_contracts/`（4 个冻结契约，119 行）+ `cli/`（产品 CLI）+ `migrations/`。五件事装在一个零依赖 wheel 里。

**2. 名称与描述是否准确？** 描述基本准确：pyproject description "Execution governance kernel and plugin SDK for coding agents" 与实际相符。**发行名 `agent-box-cli` 不准确**——它承载的远不止 CLI；安装者 `pip install agent-box-cli` 得到的是整个治理内核。另外 `src/agent_box/__init__.py:1` 的 docstring 仍是 v1 时代的 "bwrap-isolated config launcher for coding agents"，pyproject keywords 仍含 "claude-code","codex"（`pyproject.toml:12`，仅命名层面）。

**3. 哪些概念必须留在 Root？** `work_core` 全部（Work/Execution/Binding/Ref/Dispatch/Freeze/Observation/Evidence/Finish/Atomic Finalization + ExtensionRegistry + 持久化）；`resource_contracts` 的 4 个 envelope 契约（workspace/prompt-fragment/profile/credential 是 Core 本体论的直接延伸，provider 生态都依赖它们，作为 Root 默认注册目录是合理的）；插件发现与注册的机制面（loader/registry/diagnostics/conformance）；runtime composition 的**协议**（RuntimeHost/Sandbox/TerminalSession 端口 DTO 与 Coordinator——这是执行语义的一部分，不是插件能力）。

**4. 哪些应移入独立 SDK/contracts 包或插件？** 本轮不主张拆发行包（见 Architecture options），但模块边界必须重整：host 编排（`HostFinalizationCoordinator`，finalization.py:11）、HostControl/host 面聚合语义应归入独立的 host 扩展层；`extensions/sandbox/` 的旧协议（含带运行语义的 `ResolvedSandbox.start`，protocol.py:110-112）应退役或并入 runtime composition，不应与新协议并存；CLI 的 web/launch/doctor 产品命令应能移交 Web Host 发行包自有 console script（保留兼容 shim）。

**5. 哪些是可暂时保留的产品便利耦合？** CLI 硬编码 web（有 ModuleNotFoundError 防护与友好安装提示，`cli/__init__.py:74-78`）；`[preview]` extra 硬编码 7 个官方插件版本（pyproject 层面的安装便利，非运行时 owner）；migrations 中 001/003 的 v1 遗留表（历史库升级需要）；`db.py` 全局连接单例。

**6. 哪些已构成真正的 Core/SDK 污染？** （按严重度）
- sandbox 契约一 id 双类型、Root 预注册绕开插件注册权威（F1，P0）；
- `ExtensionRegistry.__init__` 反向延迟 import extensions 层（`registry.py:144-148`，work_core→extensions 层倒置，注释自认"to avoid importing the extension facade"）；
- 共享 assembler 特判具体契约并硬编码 guest 路径（F2）；
- `extensions/__init__.py` 把通用 SPI、harness 协议、credential 协议、host 编排摊平在同一命名空间（分层污染）；
- `AgentBoxProfileV1` 携带 harness 词汇字段 `agent_type` 与默认值 `provider="agent-box-profile"`（F9——判定见 Contract ownership 一节：作为 envelope 可保留，但语义须澄清）。

---

# Work Core neutrality

对 `src/agent_box/work_core` 与 `src/agent_box/migrations` 做了关键词 + 类型依赖 + schema + Registry 初始化四层核验（不止字符串搜索）：

| 关键词 | work_core 代码 | migrations | 判定 |
|---|---|---|---|
| codex / opencode / hermes / pi | 0 命中 | 0 命中 | 中立 |
| claude | 0 命中 | `001_init.sql` profiles 表 `claude_md_ref` 列（:17）、`002_rename_claude_md_ref.sql` 改名 prompt_ref | 仅历史 schema |
| harness | 0 命中 | 0 命中 | 中立 |
| profile | 0 命中（代码） | `profiles.agent_type`、`profiles.prompt_ref`、`sessions.agent_type`（001_init.sql） | **schema 携带 harness 词汇** |
| credential | 0 命中 | 0 专属列 | 中立（credential 只存在于 resource_contracts + extensions/credentials.py） |
| git | 0 命中 | 0 命中 | 中立 |
| workspace / artifact | `RefType.WORKSPACE/ARTIFACT`（models.py:27-28）、`core_works`、`core_resource_observations` 等 | 一致 | **Core 本体论，中立** |
| bwrap / tmux | src 全域 0 命中（唯一例外 `__init__.py:1` 陈旧 docstring） | 0 命中 | 中立 |
| sandbox | 仅 `registry.py:144-148` 对 SDK 协议类型的注册 | 0 命中 | 真实但中立的 SDK 耦合（见 F7 层倒置） |
| terminal | 全部是 `Phase.TERMINAL` 投影生命周期语义（projection.py、services.py:430-565），与 terminal-session 应用无关 | 0 命中 | 中立（命名巧合） |
| web / quick launch | 0 命中 | 0 命中 | 中立（仅 cli 有，见 F11） |

类型依赖核验：`work_core/` 不 import 任何插件包；`services.py` 的 dispatch 管线（freeze→canonicalize→contract 校验→input_limits→早/晚两批 resolve→preflight→start，`services.py:102-219`）是纯契约驱动 + provider 泛型接口。Registry 初始化行为：每实例拷贝 `CONTRACT_TYPES`（:143），无模块级单例；唯一越层行为是延迟注册 SandboxTemplateV1（:144-148）。

**结论：Work Core 代码层中立性成立。** 不中立残留集中在三处且都不在 work_core 运行逻辑里：① migrations 的 profiles/sessions 死 schema（F10）；② resource_contracts 的 AgentBoxProfileV1 字段词汇（F9）；③ Registry 的 sandbox 延迟注册（F7）。另核验出 work_core 自身的小瑕疵：`repository.py:138,142` 两个完全相同的 `list_works`（后者静默遮蔽前者）。

---

# Extension SDK layering

现状：SDK 表面上是"一个 `agent_box.extensions` 命名空间"，实际由四组异质内容摊平（`extensions/__init__.py:1-121` 一次性再导出 30+ 名字）：

1. **通用插件 SPI**（`api.py`）：PluginDescriptor(:23)、PluginContext(:81)、PluginRegistration(:93)、ResourceSelector(:144)、FinalizationContributor(:126)、AgentBoxPlugin(:112)。
2. **Core provider SPI**（`work_core/registry.py`）：ResourceProvider(:36)、ExecutionProvider(:127) + Dispatch DTO。
3. **Harness SDK**（与 1 同文件 `api.py`）：HarnessProfileManager(:152)、HostControl(:170)/ProviderHostControl(:177)、ContinuationRouteDescriptor(:200)/ContinuationRoute(:211)/ProviderContinuationRoute(:217)——注释自称 "host-neutral"，但全仓只有 harness 插件实现它们。
4. **Host/UI 编排 API**：HostFinalizationCoordinator（`finalization.py:11`，由 web facade 使用）；web 自身的 presenter/facade 在 web 包内。
5. **执行 Runtime SDK**（`runtime_composition/`）：全部端口 DTO + RuntimeCompositionCoordinator(:27) + 共享装配器（`assembler.py:39`）+ conformance fake（`fake.py`）；**credential SPI**（`credentials.py`）；**旧 sandbox 协议**（`sandbox/protocol.py`，含运行语义 `ResolvedSandbox.start` :110-112 与新 wrap-only 并存）。

判定：**不该全在同一模块/命名空间**，但也不必机械拆发行包。真实收益与成本评估：
- 拆分收益真实的部分：a) 通用 SPI 与 harness 协议分离——第三方非 harness 插件（如未来的 storage/cron 插件）不需要看见 HarnessProfileManager/ContinuationRoute；b) host 编排移出通用面——第三方 Host 不应被迫 import "host-neutral" 名字里的 host 编排器；c) 旧/新 sandbox 协议收敛——这不是分层问题而是 authority 冲突（F1）。
- 拆分收益存疑的部分：把 runtime composition 协议拆出 Root SDK 会人为制造版本耦合——RuntimeHost/Sandbox/TerminalSession 端口语义与 Core 的 Dispatch 语义同步演化，分开发行会迫使两包锁步升级。
- 成本：`agent_box.extensions` 的扁平 import 被全部 11 个插件使用；拆子模块可用再导出 shim 零破坏迁移（成本约半天 + 全量测试），拆发行包则需版本/发布/兼容矩阵（成本高、当前无受益者）。

**建议分层（同一发行包内的模块边界）**：`extensions.spi`（descriptor/registration/loader/diagnostics/conformance）→ `extensions.runtime`（runtime composition 协议 + coordinator + assembler）→ `extensions.harness`（harness manager/route/host-control 协议）→ `extensions.credential` → `extensions.host`（HostFinalizationCoordinator + host 面聚合 manifest）。`extensions/__init__.py` 保留兼容再导出。

---

# Contract ownership matrix

| contract_id | 语义 owner | Python 类型 owner | 注册 authority | provider authority | consumer | Root 默认注册？ | 独立 contracts 发行包？ | 缺失插件时仍存在？ |
|---|---|---|---|---|---|---|---|---|
| agent-box.workspace@1 | Work Core 本体论（RefType.WORKSPACE） | Root `resource_contracts/workspace_v1.py:11` | Root 默认目录 | git 插件（`agent_box_git/provider.py:24-26`） | 全部 5 个 harness provider、Root assembler、git contributor、web | **是（合理）** | 否（现在不必） | 是（类型在，provider 缺失时无法 resolve，属预期） |
| agent-box.prompt-fragment@1 | Core 本体论 | Root `prompt_fragment_v1.py:10` | Root 默认 | artifacts 插件 | 5 个 harness provider | 是（合理） | 否 | 是 |
| agent-box.profile@1 | **有争议**：envelope（Root）承载 harness 绑定键 agent_type | Root `agent_box_profile_v1.py:9-27` | Root 默认 | 各 harness 插件（codex-profile/pi-profile/…） | harness providers、web profile 视图 | 是（合理，见下方裁决） | 否 | 是 |
| agent-box.credential@1 | Core/SDK（SecretMount 语义） | Root `credential_v1.py:12` | Root 默认 | harness credential source（codex-login 等） | harness providers、CredentialMaterializer 链路 | 是（合理） | 否 | 是 |
| agent-box.runtime-host@1 | 执行 Runtime（身份/能力/transport） | **Root** `runtime_composition/protocol.py:46-54`（RuntimeHostV1） | runtime-local 插件注册（plugin.py:58） | runtime-local | 全部 harness、assembler、coordinator | 否（正确） | 否 | 类型在；无 provider 时 composition 无法启动（预期） |
| agent-box.sandbox@1 | **冲突** | **两个**：Root `extensions/sandbox/protocol.py:115`（SandboxTemplateV1，被注册）与 Root `runtime_composition/protocol.py:58`（SandboxV1，死类型） | Root 预注册抢占（registry.py:147-148）；bwrap 插件 `contracts=()` 靠边（plugin.py:19-24） | bwrap | harnesses、assembler、coordinator | 是（**这正是问题**：Root 抢占了本应由 sandbox 插件或统一协议持有的 id） | — | — |
| agent-box.terminal-session@1 | 执行 Runtime（载体租约/运行边） | **Root** `runtime_composition/protocol.py:69`（TerminalSessionV1；插件 contract.py 仅再导出） | terminal-session 插件注册（plugin.py:16） | terminal-session（tmux/direct-stdio） | harnesses、assembler、web | 否（正确） | 否 | 类型在；无 provider 时同上 |
| continuation 契约（codex/claude/hermes/opencode 各 @1） | 各 harness | 各 harness 插件（如 `agent_box_harnesses/codex/contracts.py:8-10`） | 各 harness 插件 | 各 harness continuation ResourceProvider | web continuation_candidates（facade.py:240-254）、目标 harness provider | 否（正确） | 否 | 否（随插件存在，合理） |

**Profile 裁决**：`agent-box.profile@1` 应保留为 **Root 持有的通用 envelope**——理由：a) 它是 Binding 的通用输入（所有 harness 的 input_limits 都含它），语义是"被选中的一次性 profile 引用"，不含 harness 行为；b) 把它移给 harness SDK 会使 Root 的 input_limits 校验反向依赖 harness 层。但两处必须澄清：`agent_type` 字段应明确文档化为"harness 绑定键（routing key）"而非 harness 配置载体——它是 requested→exact Ref 路由中 profile→provider 的合法关联字段；`provider="agent-box-profile"` 的默认值是误导（提供者从来不是 "agent-box-profile" 这个 provider，而是各 harness 的 profile provider），建议移除默认值或改名为更诚实的语义。**判定：P2，非 harness-owned contract，不必迁移。**

---

# Runtime composition audit

实际链路（逐跳 file:line）：

1. **Frozen Binding**：Web Host `HostApplication.freeze`（`agent_box_web/application/facade.py:150-158`）调 `ExecutionService.dispatch_execution`（`work_core/services.py:102`）。
2. **resolved inputs**：`_resolve_inputs`（services.py:324-357）→ `ResolvedExecutionInput`；每值经 `registry.get_contract_type(contract_id)` isinstance 校验（**:345-355**）。`ExecutionStartRequest(execution_id, dispatch_id, inputs_digest, resolved_inputs)`（:186-194）。
3. **Harness 生成命令**：Codex `CodexLaunchAdapter._plan`（codex/launch.py:37-101）→ `command_from_plan`（codex/composition.py:36-91）产出 `HarnessCommandSpec`（guest layout 在此决定，见下）。
4. **shared assembler → RuntimeBinding**：`composition_from_resolved_inputs`（codex/composition.py:106-164）→ Root 唯一共享装配器 `assemble_runtime_composition`（assembler.py:39-95）；`RuntimeBinding(host.ref, sandbox_port.ref, terminal.ref)`（:57）。
5. **RuntimeBinding → RuntimeBundle**：Root assembler 的 bundle_factory（assembler.py:69-88，含 MountPlan + digest）；**并存** codex 自带 fallback factory（codex/composition.py:142-159）；coordinator 兜底空 plan（coordinator.py:38-42）。
6. **Coordinator.start（唯一授权/重放边界）**：`RuntimeCompositionCoordinator.start`（coordinator.py:62-101）：preflight(:50-60) → 控制面网络检查(:64-66) → `host.stage`(:70-73) → attempt_key(:74-77) → `sandbox.wrap`(:85) → `terminal.allocate`(:86) → `terminal.run`(:90)。
7. **Sandbox.wrap**：`ResolvedBwrapSandbox.wrap`（bwrap provider.py:210-235）纯编译 bwrap argv，"target not spawned"（:238）。
8. **TerminalSession.allocate/run**：tmux allocate 只建空 pane（tmux.py:90-104，注释明言 "not target launch"）；run 提交一次 typed operation（tmux-respawn@1，tmux.py:139-142）。
9. **RuntimeHost transport（唯一 native spawn 边）**：`LocalHostTransport.submit`（runtime-local provider.py:144-194）消费单次 spawn token；local-exec 路径 `subprocess.Popen`（:112-115）；tmux 载体路径经全局 handler 表分发到 `_tmux_respawn_handler`（tmux.py:233-253）→ bridge `os.execv`（bridge.py:21）。
10. **Harness handle**：`TerminalRunHandle` → `CodexAppServerClient`（app_server/provider.py:365-368），句柄按 dispatch_id 存 `_handles`（:451），产出 `ExecutionStartReceipt`（:452-463）。

**六个问题的回答：**

- **谁生成 MountPlan？** 三处：Root assembler bundle_factory（主路径，assembler.py:70-88）、codex fallback factory（composition.py:142-159，仅 `command=None` 时走——实测生产路径 app_server:360 与 interactive:59 都传 command，fallback 只被 `tests/test_bwrap_formal_dispatch_vertical.py:38` 使用）、coordinator 空 plan 兜底。secret_mounts 由 harness 的 CredentialMaterializer 准备（codex/composition.py:167-183）传入 assembler（assembler.py:88）。
- **谁决定 guest layout？** **权威三分，靠跨插件字符串约定耦合而非任何契约**：① Root assembler 决定 workspace→`/workspace`（assembler.py:73-76）；② Codex harness 决定 `/runtime/home`（CODEX_HOME，composition.py:48）、`/runtime/bin/codex`（:55,78）、`/runtime/hooks`（:80）、`cwd_token="/workspace"`（:85）、`/runtime/home/auth.json`（credentials.py:69）；③ bwrap 决定 `/runtime` 骨架目录（provider.py:216-218）并强制 secret 只能挂在 `/runtime/home` 之下（:196-199 `parents != ["/runtime/home"]` 即拒绝）。三方约定的耦合链示例：`codex/composition.py:178` 写死 `/runtime/home/auth.json` → `codex/credentials.py:69` 校验同一字面量 → `bwrap/provider.py:197` 白名单父目录。**换任何一个 sandbox 实现，都必须复刻这套未成文的约定。**
- **谁注册 prepared sources？** assembler 调 `sandbox_port.provider.register_prepared_source`（assembler.py:60,72,85）；secret 经 `CodexCredentialSource.bind_to_sandbox` → `register_prepared_secret_mount`（codex/credentials.py:78-82；bwrap :92-102）。
- **唯一 native spawn 归谁？是否双重 spawn？** 唯一目标进程创建单边归 RuntimeHost 的 LocalHostTransport（runtime-local）。**无双重 spawn**：allocate 只建空 tmux pane/lease；coordinator 注释确认 wrap/allocation 无 target 副作用（coordinator.py:83-84）。例外均为非 workload：bwrap probe、tmux 控制命令、web presenter 打开 attach。
- **execution_id 与 dispatch_id 为什么需要？** execution_id 是 Core 跨 dispatch 的持久身份（恢复、continuation、git worktree 所有权 scope `git/provider.py:56-64`、profile 投影目录）；dispatch_id 是单次尝试的幂等/重放身份（`services.py:113-138` 幂等键、attempt_key、receipt 身份校验 services.py:399-416）。两者对 Core 合法必需；**问题是它们以裸字符串渗入了组合协议签名**（coordinator.start / bundle_factory / RuntimeBundle digest，assembler.py:69,88、coordinator.py:74-77、protocol.py:417 附近）与 selector（`api.py:149` `prepare(*, execution_id)`——bwrap/terminal/runtime-local 的 selector 全都 `del execution_id`）。建议以不透明 `AttemptIdentity` 值对象替代两个裸参数。
- **换 bwrap/tmux/local host 是否零修改？** 对 **Root：是**（组合代码无 harness 名，grep 证实）。对**插件生态：否**——换 sandbox 需复刻 `/runtime/home` 白名单与 `/runtime` 骨架约定（上引三处）；换 tmux 载体需在**模块 import 时**向全局表注册 handler（F4）；换 local host 需保证能分发已注册的 carrier handler。三个"可替换"实际各有一根隐藏耦合桩。

**附加发现**：a) codex `compose()` 存在 `hasattr(coordinator, "ledger")` 鸭子类型分支（composition.py:99-101）决定是否剥离 argv[0]——coordinator 能力探测走属性嗅探而非协议方法；b) 两套 bundle_factory 对 profile 投影中 symlink 的语义不同：assembler 路径遇 symlink 直接抛错（assembler.py:33），codex fallback 做 tempdir 消毒（composition.py:148-154）——同一"共享装配"两种行为；c) `composition.py:32-33` 重复 import 行（复制粘贴残留）。

---

# Plugin boundary findings

- **Web**：Python 侧大体注册表驱动，但**非完全干净**——`facade.py:256,259` 硬编码 `get_resource_provider("git-workspace")`（repositories/add_repository 功能假定 Git 插件与其 provider id）；前端 `QuickLaunch.tsx:11-13` 硬编码 provider→harness→selector 三张映射表，`:24` 硬编码亲和串模板，`:38-43` 硬编码整套官方 selector id 组合（git-workspace、responsibility、runtime-host-local、bwrap-sandbox、direct-stdio-session/managed-tmux-session）与 `bwrap-offline` 模板名。Web 未绕过 Core（freeze/dispatch/finish 全走 Core API），且 `quick_launch` 的 credential 注入走 manager descriptor 约定（facade.py:271-282，注释明言不做 provider 分支）——比前端干净。
- **Harnesses/Codex**：不 import bwrap/tmux（tmux/ 已删净，仅 `hooks.py:1` 残留过时 docstring "used by the tmux interactive provider"）；沙箱依赖走 SandboxV1 契约端口；**绝不自 spawn**（composition.py:94-98 无注入 coordinator 直接 raise）；app-server spawn 明示 "This is the only Harness-to-runtime launch edge"（app_server/provider.py:357-366 注释）。CredentialRef→SecretMount 语义正确：locator-only、元数据检查、从不读凭据内容（credentials.py:71-75 注释 "do not open, parse, copy, hash"）。
- **Git**：边界正确——只做 Workspace authority（make_ref/resolve 精确 commit+tree 校验，provider.py:38-64）+ output capture（`refs/agent-box/executions/<id>/output`，:67-88）+ finalization 观察（contributor.py）。无 harness 知识。
- **Sandbox-bwrap**：无 harness 特有逻辑分支（grep 仅注释与模板名 `bwrap-cloud-harness`），wrap 只消费通用 MountPlan/HarnessCommandSpec。上述 `/runtime/home` 白名单是它对 harness layout 的**约定性**（非代码性）耦合。
- **Terminal-session**：grep codex/claude/harness 零命中；只消费不透明 `spec.carrier_argv`（tmux.py:126）。职责干净（载体租约 + 唯一运行边 + 观察）。
- **Runtime-local**：grep harness/bwrap 零命中；提供 RuntimeHostV1 + 类型化 transport + WSL/native 双 realm 身份。干净。
- **Credential**：与 Codex 的绑定是**插件内**的（CodexCredentialSource + CodexHarnessManager），协议面（PreparedSecretMount/CredentialMaterializer）在 Root 且 provider-neutral——绑定在正确的层。
- **五个 harness 的协议统一性**：**鸭子类型面统一，无共享基类**。真共享：同一 entry-point 工厂模式、同一批 SDK Protocol、全部经 RuntimeComposition 启动、全部不自 spawn。破坏统一的差异：无共享基类（Manager/Selector/ContinuationProvider 五份独立实现）；opencode 不注册 host_controls 而 claude/hermes/pi 用通用 ProviderHostControl、codex 用两个专用 control（四种形态）；hermes 无 continuation route；selector 命名各不相同（前端被迫写映射表即是症状）；pi 契约命名空间脱离 `agent-box.*` 格式；claude/hermes/opencode 在 descriptor 里硬编码二进制版本号（plugin.py:33 / plugin.py:19 / profiles.py:125）；claude 生产包内含 `fake_claude.py` 离线假执行体；opencode `provider.py:20-26` 存在别名 + 死类双定义（`agent-box.opencode-profile@1` 无人注册）。**结论：协议是真实的（SDK Protocol + 契约 + composition 入口一致），统一性是表面的（实现无共享、命名漂移、能力覆盖不齐）。**

---

# Authority and registration audit

- **契约重复**：机制上禁止（`registry.py:164-168` already-registered fail-fast）；唯一实际冲突正是 Root 自己造成的 sandbox@1 双类型（F1）。
- **ResourceProvider / ExecutionProvider 重复**：禁止（registry.py register_* 查重）；实测所有 provider_id 唯一。
- **selector / HostControl / manager / continuation route 重复**：loader 跨插件 fail-fast（`loader.py:75-110` "duplicate {kind} id"）；web facade 对 route 再查重（facade.py:28-32）；实测无重复（git 的 selector 与 contributor 同名 "git-workspace" 属不同命名空间，合法）。
- **import-order 依赖**：**一处实质存在**——terminal-session 在模块顶层 `register_transport_operation_handler("tmux-respawn@1", ...)`（tmux.py:256），runtime-local 在 submit 时查全局表（provider.py:163-174）；若 terminal-session 模块未被加载，tmux 载体 operation 将被拒为 "unregistered provider transport operation"。这是全系统唯一的 import 副作用注册（插件注册本体走 entry point 运行时发现，无 import 副作用）。
- **模块级可变注册表**：`_TRANSPORT_OPERATION_HANDLERS`（runtime_composition/protocol.py:25，进程级全局、防重复注册但禁止换绑）；`db.py:10-12` 的 `_conn` 全局连接单例（有意的，配 `_reset_connection_for_tests`）。
- **"测试 import 才触发正式注册"？** 半真：正式注册路径是 entry point 运行时发现（`loader.py:111-131`），测试的普遍模式是**绕过 entry point、直接 import 插件模块手工装配**（`test_quick_launch_e2e.py:48-55`、`test_bwrap_formal_dispatch_vertical.py:19-22` 等）——即"正式注册路径在单测里覆盖薄弱，主要靠 web 集成测试与真实安装验证"。另有一个真实 import 时注册（tmux handler）混在其中。
- **host 面扩展点的承载真空**：loader 只把 contracts/resource_providers/execution_providers 注入 registry（loader.py:163-167）；selectors/contributors/controls/harnesses/routes 只做去重校验后**仅存于 `PluginLoadReport`**（loader.py:153-172），聚合完全由 web facade 完成（facade.py:26-36）。也就是说：**host 面扩展点没有 canonical 承载结构，web 是事实上的唯一 owner**——第三方 Host 必须复刻这段聚合逻辑，且对 `bind` 属性的探测（facade.py:34-35）无协议约束。
- **Root 内部的加载顺序约束**：`ExtensionRegistry.__init__` 延迟 import extensions.sandbox（registry.py:144-148，注释自认避免循环）；loader 以 `(name, value)` 排序加载 entry points（loader.py:132），加载顺序不影响正确性（除 tmux handler 外）。

---

# Packaging audit

- **Root wheel 内容**：只有 `agent_box/*` + migrations SQL（`pyproject.toml:51-55`；dist wheel 清单证实）。无插件实现混入。异常：`dist/` 内现存 wheel 为**陈旧构建**（缺 `resource_contracts/credential_v1.py`，与当前源码和 egg-info SOURCES 不符）——发布前必须 clean build。
- **optional extras 反向依赖**：`[preview]`（7 个官方插件精确 pin）与 `[web]` 是安装便利，非架构 owner；Root 运行时代码对它们零 import——**唯一例外是 Root CLI 对 `agent_box_web.cli` 的运行时软反向依赖**（`cli/__init__.py:71,86,107`）。这是全系统唯一的反向依赖，有 ModuleNotFoundError 防护，但使 agent-box-web 成为被 Root CLI 特判的特殊发行包（而非可发现的 Host）。
- **插件是否反向依赖 Web**：无（grep 证实零 import）。
- **独立插件能否只依赖稳定 SDK**：能——插件只 import `agent_box.extensions/work_core/resource_contracts`；pi（按第三方姿态编写：范围 pin、独立命名空间 `agent-box-pi.*`、无任何外部 pi 发行依赖、binary 走 `shutil.which`）证明该路径可行。但"稳定 SDK"的边界当前靠约定（扁平命名空间），无版本化 API 面（`PLUGIN_API_VERSION=1` 只覆盖 descriptor 层）。
- **Preview extra**：纯安装便利，非隐式架构 owner（CLI 代码不引用 preview 概念）。但 ARCHITECTURE.md:48 声称 preview "installs Web, Harnesses, Git, tmux and Artifacts" 已过时（实际含 runtime-local/sandbox-bwrap/terminal-session，无独立 tmux 包）。
- **Pi 边界**：守得住（上条）；`config.py:49-53` 固定 `provider="deepseek"` 默认属产品选择非边界违规。
- **版本一致性**：不一致——claude/hermes/opencode=0.1.0、pi=0.2.0、其余=2.0.0a1；插件 descriptor 版本与 pyproject 大面积脱节（harnesses "0.1.0" plugin.py:21、artifacts "0.1.0" plugin.py:10、git "0.1.0" plugin.py:11、terminal-session "1.0.0" plugin.py:12；bwrap provider descriptor 甚至 "3.0.0a1" provider.py:76）；pi 用范围 pin `>=2.0.0a1,<2.1.0` 而其他家用 `==2.0.0a1`。
- **entry point 唯一性**：Root 一个 console script；每个插件 pyproject 恰好一个 `agent_box.plugins` key；web 无插件 entry（Host 定位，但意味着它只能被 Root CLI 硬编码发现，见 F11）；terminal-session 额外一个 bridge console script（合理，carrier 需要）。
- **`agent-box-cli` 名称是否仍合理**：不准确（见 Root responsibility §2）。更诚实的名字是 `agent-box`（保留 `agent-box-cli` 作兼容提供者别名）或至少在描述/README 中明确聚合定位。改名收益低、破坏性中，列为 P3 择机。

---

# Findings by severity

评级标准：P0=已破坏 authority / Core 中立性 / 正确性；P1=进入 Resource Routing 前必须修；P2=架构债，下一轮收敛；P3=命名/文档/发行体验。风格偏好不评级。每条含：证据 / 现状 / 危害 / 影响 / 是否已致 bug / 修复收益 / 修复风险 / 推荐阶段 / 是否阻塞 Routing。

## P0

### F1 · `agent-box.sandbox@1` 一 id 双类型，contract authority 冲突
- **证据**：类型 A `SandboxTemplateV1`（`extensions/sandbox/protocol.py:10,114-118`，注册值，且同文件保留带运行语义的旧 `ResolvedSandbox.start` Protocol :110-112）；类型 B `SandboxV1`（`runtime_composition/protocol.py:18,57-65`，"resolved port" 值）。Root 把 A 预注册进每个 Registry 实例（`registry.py:144-148`），因此 **B 永远无法注册**（`register_contract` 撞 already-registered，`registry.py:164-168`）。dispatch 的 isinstance 校验只认 A（`services.py:345-355`）。
- **现状**：三方靠鸭子类型桥接——Root assembler `getattr(sandbox,"port",sandbox)`（assembler.py:54）；codex 同样桥接并留注释自认双形态（composition.py:127-133,180-181）；bwrap 以 `SandboxTemplateV1` 子类充当 resolved 值（provider.py:127-136）。opencode 测试直接构造 `SandboxV1(...)`（tests/test_opencode_p0.py:51）——该值若走真实 dispatch 会被 :351 判为 ContractViolation。
- **为什么是问题**：一个 contract_id 的类型 authority 没有答案；组合协议声明的类型（B）与 dispatch 实际接受的类型（A）不一致；任何按新协议（B）实现沙箱的第三方插件都过不了 dispatch 校验。authority 已被破坏，只是被三处补丁遮住。
- **影响**：所有 sandbox 生态位；Resource Routing 的契约解析正确性。
- **已致 bug？** 尚无生产故障（桥接生效），但 opencode 测试与真实 dispatch 语义已经分叉；三处鸭子类型补丁本身就是债务实体。
- **修复收益**：恢复契约单一 authority；删除三处桥接；第三方 sandbox 成为可能。
- **修复风险**：低——收敛为一个类型（建议 SandboxV1 语义 + 保留 template 元数据字段，或给旧类型换 id 后退役），迁移点集中在 bwrap/assembler/codex composition。
- **推荐阶段**：第 1 步（最先修）。
- **阻塞 Routing**：**是**。

## P1（Resource Routing 前必修）

### F2 · 共享 assembler 特判 workspace 契约并硬编码 /workspace；guest layout 权威分裂
- **证据**：assembler.py:58-59 字面量匹配 `"agent-box.workspace@1"`（未用 `WorkspaceV1.contract_id`）；:73-76 硬编码 `/workspace` 挂载与去重；:71,84 组合 token 前缀字面量；模块 docstring :1-6 自称 provider-neutral。layout 三分见 Runtime composition 一节（codex composition.py:48,55,73,78,80,85；bwrap provider.py:196-199,216-218；credentials.py:69）。
- **现状**：组合层对"哪种契约资源要进沙箱、挂到哪"做了单一契约特判；其余 guest 路径由 harness 投影与 sandbox 白名单各自为政，靠字符串约定对齐。
- **为什么是问题**：Root 组成代码的输入应完全由 frozen Binding 契约驱动；特判使"新增一类需进沙箱的核心资源"必须改 Root；guest layout 无唯一 authority，跨插件约定不成文、不可测试。
- **影响**：Resource Routing 的核心场景（契约驱动的资源→沙箱投影）。
- **已致 bug？** 无（行为正确），但 layout 约定一旦漂移（如改 `/runtime/home`）会静默破坏 secret 挂载。
- **修复收益**：composition 变成纯契约驱动；layout 声明进入 Binding/spec 可冻结可审计。
- **修复风险**：中——涉及 Binding 语义扩展（增加 guest 路径声明），需与 Freeze 语义对齐，但不能改变 Work Core 语义（建议：workspace→guest 映射改为 Binding 输入的显式声明，assembler 只做校验）。
- **推荐阶段**：第 2 步。
- **阻塞 Routing**：**是**。

### F3 · CredentialMaterializer 无注册通道（SDK 面断裂）
- **证据**：协议存在（`extensions/credentials.py:42-48`），但 `PluginRegistration` 八个字段无一承载（api.py:97-104），loader 不转发（loader.py:163-167），web facade 也不聚合。实际接线是插件**内部构造函数注入**（harnesses plugin.py:31-34 把 `manager.credentials` 塞给 provider）。
- **现状**：Root SDK 宣告了一个 SPI，却没有任何发现/装配路径；第三方 Host 无法发现 materializer。
- **为什么是问题**：SDK 面承诺与机制不符；credential 是治理语义（SecretMount），其装配 authority 应可见。
- **影响**：第三方 harness/Host 的 credential 集成；Routing 后的自动化 Binding。
- **已致 bug？** 否（官方插件自接线可用）。
- **修复收益**：SPI 面完整；credential 能力可被发现与审计。
- **修复风险**：低——加字段 + loader 转发 + facade 聚合，官方插件行为不变。
- **推荐阶段**：第 3 步。
- **阻塞 Routing**：**是**（Routing 需要能自动装配 credential 输入）。

### F4 · 全局 transport handler 注册表 + import 时注册 → import-order 依赖
- **证据**：`_TRANSPORT_OPERATION_HANDLERS`（runtime_composition/protocol.py:25-43）；terminal-session 模块顶层注册（tmux.py:256）；runtime-local 消费（provider.py:163-174）。
- **现状**：tmux 载体可用性取决于 terminal-session 模块是否**曾被 import**，与插件 entry point 加载无关。
- **为什么是问题**：hidden global registry + import 副作用；与"entry point 声明式注册"的正式机制双轨；测试顺序/懒加载 Host 下会静默失效（错误信息 "unregistered provider transport operation" 很难归因）。
- **影响**：tmux 载体、未来任何自定义 carrier。
- **已致 bug？** 无生产故障（preview 全装时 import 顺序凑巧成立），属潜伏地雷。
- **修复收益**：注册回归声明式；消除顺序敏感。
- **修复风险**：低——handler 表随 Registry/Coordinator 实例传递，模块级函数保留一个弃用 shim。
- **推荐阶段**：第 4 步。
- **阻塞 Routing**：**是**（Routing 要求组合关系全部显式）。

### F5 · host 面扩展点无 canonical 承载，web facade 是事实 owner
- **证据**：loader.py:75-110 只校验、:163-167 只注入 3 类；selectors/contributors/controls/harnesses/routes 仅存于 PluginLoadReport；web facade.py:26-36 聚合并做 `bind` 属性探测（:34-35）。
- **现状**：5 类 host 面扩展点的聚合逻辑不在 SDK 里，而在 Web Host 的构造函数里。
- **为什么是问题**：第三方 Host 必须复刻聚合+去重+bind 探测；这些扩展点的 authority 归属含糊（SDK 声明协议、Host 决定承载）；Routing 需要一个可查询的扩展点总目录。
- **影响**：第三方 Host、Routing 配置面。
- **已致 bug？** 否。
- **修复收益**：一份 SDK 级 host manifest；web 降为消费者。
- **修复风险**：低-中（facade 构造签名不动，内部改为读 manifest）。
- **推荐阶段**：第 5 步（可与第 3 步合并实施）。
- **阻塞 Routing**：**是**。

### F6 · Web 硬编码官方插件组合（前端映射表 + facade git provider id）
- **证据**：QuickLaunch.tsx:11-13（provider→harness→selector 映射）、:24（亲和串模板）、:38-43（整套官方 selector id + 模板名）；facade.py:256,259（硬编码 "git-workspace"）。
- **现状**：Quick Launch 的 provider 组合知识写死在前端 TS 与 facade；新增第五个 harness 需要改 Root SDK 之外的两处 Web 代码。
- **为什么是问题**：Host 应从注册表/descriptor 能力发现组合；这恰是 Resource Routing 要泛化的对象。
- **影响**：Web Host；新增插件的开箱体验。
- **已致 bug？** 否（但 pi 接入时前端映射已出现一次人工同步）。
- **修复收益**：新插件零前端改动；Routing 的能力发现可直接复用。
- **修复风险**：中（前端重构 + descriptor 能力字段约定）。
- **推荐阶段**：与 Routing 同期（作为 Routing 的第一个受益方）。
- **阻塞 Routing**：**是**（Routing 落地即应替换这张表，避免两套机制并存）。

## P2（架构债，下一轮收敛）

### F7 · `ExtensionRegistry.__init__` 反向延迟 import extensions 层
- **证据**：registry.py:144-148（work_core → extensions.sandbox，注释自认）。现状：work_core 层依赖 extensions 层。危害：层图倒置，任何未来拆包（方案 B/C）都会在此断。已致 bug：无。收益：层图恢复单向。风险：低（默认注册动作移到 `extensions/bootstrap.py`）。阶段：第 1 步附带。阻塞 Routing：否（间接相关：F1 修复时自然消除）。

### F8 · execution_id/dispatch_id 渗透组合协议；selector 强收 execution_id
- **证据**：coordinator.start 签名与 attempt_key（coordinator.py:74-77、protocol.py 组合签名）；bundle_factory 签名与 RuntimeBundle digest（assembler.py:69,88；codex composition.py:159）；`ResourceSelector.prepare(*, execution_id)`（api.py:149）被 bwrap/terminal/runtime-local selector 接收后立即 `del`（plugin.py 各处）。现状：两个 Core 身份进入本应 provider 中立的协议。危害：协议面携带 Core 词汇，未来分布式/远程 transport 时身份语义含糊。已致 bug：无。收益：协议以不透明 AttemptIdentity 承载。风险：中低（签名变更，SDK 内可控）。阶段：第 2 步同期。阻塞 Routing：否（但 Routing 触及同一签名，建议同批做）。

### F9 · AgentBoxProfileV1 携带 harness 词汇；provider 默认值误导
- **证据**：agent_box_profile_v1.py:13（agent_type）、:16（默认 "agent-box-profile"）；migrations profiles.agent_type。现状：envelope 契约带 harness 绑定键。判定：**保留为 Root envelope**（裁决见 Contract ownership），但需文档化 agent_type 语义并处理默认值。已致 bug：无。收益：契约语义诚实。风险：极低。阶段：文档随时，字段变更随下一 major。阻塞 Routing：否（routing 需要的正是 agent_type 作绑定键——先裁决再路由）。

### F10 · migrations 携带死 schema 且每台新库实际建表
- **证据**：`db.py:15-27` 按文件名顺序执行全部 migration；`001_init.sql` 建 profiles/sessions（含 agent_type、claude_md_ref→prompt_ref）；`003_work_core.sql` 建 works/work_attempts/work_decisions/work_artifacts/work_handoffs（v1 工作流词汇 :7-89）；而 repository.py 只使用 `core_*` 表（grep 全量：core_works/core_executions/core_dispatches/core_events/core_execution_refs/core_resource_observations/core_execution_finalizations）；`004` 头注释明言 "Legacy works/work_attempts remain untouched"。现状：v1 遗留表在每次全新安装都会创建。危害：schema 面积与所有权噪音；新读者误判 authority。已致 bug：无。收益：库瘦身、语义清晰。风险：中（需要"归档旧表"的显式迁移或版本断点策略）。阶段：延期到 Routing 后单列一轮。阻塞 Routing：否。

### F11 · Root CLI 硬编码 Web Host 与 /quick-launch
- **证据**：cli/__init__.py:69-92（import agent_box_web.cli；initial_route="/quick-launch"）、:106-114（doctor 读 web_readiness）、:122-124（健康判定绑定前端静态产物）。现状：产品便利耦合，防护良好。危害：agent-box-web 成为被 Root 特判的特殊发行包；第三方 Host 无法接管 `agent-box web`。已致 bug：无。收益：Host 可发现化。风险：低（entry point 组 `agent_box.hosts` + 保留现行为）。阶段：Routing 同期可选。阻塞 Routing：否。

### F12 · 五 harness 协议表面统一（无共享基类、命名/能力漂移）
- **证据**：见 Plugin boundary findings 一节（plugin.py 五处、硬编码版本、opencode 无 controls、hermes 无 route、pi 命名空间、死类与 fake）。现状：接入第五个 harness 时前端需要人工同步（已发生）。危害：新 harness 接入成本高且易漏（controls/route/descriptor 字段）。已致 bug：无（漂移均被 web 兼容）。收益：conformance 检查器（extensions/conformance.py、diagnostics.py 已有基础）补齐 harness 必选项。风险：低（加检查不改行为）。阶段：Routing 后。阻塞 Routing：否。

### F13 · 双装配路径语义不一致 + coordinator 能力嗅探
- **证据**：assembler.py:69-88 vs codex composition.py:142-159（symlink：前者报错 :33，后者 tempdir 消毒 :148-154）；fallback 仅被 `tests/test_bwrap_formal_dispatch_vertical.py:38` 使用（生产路径均传 command：app_server:360、interactive:59、claude:55、hermes:42）；`hasattr(coordinator,"ledger")` 分支（composition.py:99-101）；重复 import（composition.py:32-33）。现状：名义唯一装配器，实际两套 factory。危害：共享语义漂移；测试覆盖的路径≠生产路径。已致 bug：无。收益：单一装配权威。风险：低（把 symlink 消毒上收进 assembler，fallback 退役为测试 helper）。阶段：第 2 步附带。阻塞 Routing：间接（Routing 假定单一装配权威）——建议随第 2 步一并清。

### F14 · 异常消息字符串匹配充当协议版本探测
- **证据**：services.py:336-344 与 finalization.py:36-38（`TypeError` + `"context" not in str(exc)` 判断 provider 是否支持 context 参数）；loader.py:186（`"incompatible" in str(exc)` 分类状态）。现状：三处用异常文本做控制流。危害：provider 实现里任何恰好含 "context" 的 TypeError 消息都会改变行为；协议演进无显式版本探针。已致 bug：无（当前消息可控）。收益：显式能力探测（hasattr/Protocol 运行时检查）。风险：低。阶段：Routing 后。阻塞 Routing：否。

### F15 · ProviderHostControl 直插 provider 私有属性
- **证据**：api.py:187-192（回退到 `self.provider._handles[dispatch_id]`）。现状：SDK 适配器依赖 provider 私有命名约定。危害：第三方 provider 不叫 `_handles` 即静默失效（走 getter 分支则抛 "HostControl requires dispatch identity"）。已致 bug：无。收益：HostControl 协议加 `get_handle` 为必选。风险：低。阶段：Routing 后。阻塞 Routing：否。

### F16 · 两处真实代码 bug（非架构，顺带记录）
- **证据**：① `codex/app_server/provider.py:219-238` `CodexAppServerClient.diagnostics` 构造 `limits` 字典后**无 return**，调用点（:601-605）得到 None 作 "lifecycle" 诊断；② `work_core/repository.py:138,142` 两个相同 `list_works`（后者遮蔽前者）。已致 bug：①是（诊断输出缺 lifecycle 字段）；②否（遮蔽无害）。收益/风险：修复收益直接、风险极低。阶段：可立即修（本轮未修，属实现任务）。阻塞 Routing：否。

## P3（命名/文档/发行体验）

### F17 · 版本与元数据混乱
- **证据**：版本表（claude/hermes/opencode 0.1.0、pi 0.2.0、其余 2.0.0a1）；descriptor 版本脱节（plugin.py:21/10/11/12、provider.py:76）；pi 范围 pin；harnesses/claude 声明未用的 terminal-session 依赖；agent-box-workboard 空壳（无 pyproject、空包、1.x egg-info）；dist 陈旧 wheel 缺 credential_v1.py；`agent_box/__init__.py:1` v1 docstring；ARCHITECTURE.md:48 的 tmux/preview 描述过时、未覆盖 runtime composition 层；migrations `001_init.sql:2-8` 头注释引用不存在的 `agent_box.adapters.acs`；PLUGIN_SDK.md 未提 materializer 通道缺失、sandbox 双类型、route 不进 registry 三个 SDK 缺口。收益：可信的元数据。风险：极低。阶段：随时小步清理。

### F18 · `db.py` 全局连接单例（可接受债，见 Acceptable debt）

### F19 · `agent_box/__init__.py` import 期读 pyproject.toml
- **证据**：__init__.py:7-17（源码态 fallback）。现状：仅源码 checkout 触发。危害：import 副作用；打包后无影响。收益：无实质。阶段：接受或改为懒属性。风险：零。

---

# Architecture options

对比维度按用户指定。前提事实：Root wheel 已干净（无插件混入）、插件零跨包 import、SDK 消费面 = 11 个官方插件 + 0 个已知第三方、当前 Alpha 阶段、唯一真实用户链路是官方 preview 组合。

| 维度 | 方案 A：单发行包，只整理源码模块边界 | 方案 B：拆 core / sdk / cli / contracts 四包 | 方案 C：最小 Root Core，协议全走独立 extension packages |
|---|---|---|---|
| 边界清晰度 | 中-高（模块边界 + import lint 可机器化；发行边界仍一层） | 高（物理边界，`pip install agent-box-sdk` 即 SDK） | 最高（但 runtime-host/sandbox/terminal 协议也要各立包，碎片化风险） |
| 第三方插件开发体验 | 现状已够用（pi 已验证）；SDK 面需模块分层 | 更清晰，但第三方要装两个包、对两个版本 | 最灵活，但第三方要先弄懂"哪些协议包构成一个可用 runtime" |
| 版本兼容 | 单版本号，插件 `==2.0.x` 锁定 | SDK/contracts/core 三版本需兼容矩阵；pi 的范围 pin 模式要推广 | 协议包各自演进，compat 矩阵最大 |
| 发布复杂度 | 最低（现状 8 个发行包已是上限） | +3 包，release 流水线/交互测试×4 | 协议包数量随能力增长 |
| 循环依赖风险 | 无（F7 修掉后层图单向） | contracts←core←sdk 可单向；cli 依赖 sdk；风险可控 | runtime 协议包若引用 core 类型（Ref/DTO）极易拉出环 |
| migration 成本 | 低（子模块重排 + 再导出 shim，1-2 天） | 高（4 包骨架 + 版本策略 + CI 矩阵 + 全部插件 pyproject 改依赖） | 最高 |
| 当前 Alpha 用户影响 | 零（同发行名同 import 路径） | 需 compatibility shim（`agent-box-sdk` 空包转依赖）或破坏性升级 | 同 B 且更碎 |
| 是否需要 shim | 不需要 | 需要（发行名级） | 需要（协议包级） |

**结论：推荐方案 A，保留 B 的"contracts 先行"作为唯一的未来拆包候选。** 理由：本审计发现的所有真实问题（F1-F6、F13）都是**模块边界与注册路径**问题，没有一个因为"包没拆"而产生；反过来，全部 11 个插件已经证明了"单 Root SDK + entry point"的第三方路径可用。拆包解决的唯一真实收益是"第三方只依赖稳定 SDK 面"——这可以用 A 里的模块分层 + `PLUGIN_API_VERSION` 语义扩展先拿到 80%。C 的碎片化对当前规模是负资产。

---

# Recommended target architecture

保持单发行包 `agent-box-cli`（中期可更名为 `agent-box`），Root 内部重排为（import 只允许向下）：

```
agent_box
├── work_core/            # 不变：ontology、dispatch、persistence、ExtensionRegistry
├── resource_contracts/   # 不变：4 个 envelope 契约（profile 的 agent_type 语义文档化）
├── extensions/
│   ├── spi/              # descriptor / context / registration / loader / diagnostics / conformance
│   ├── runtime/          # runtime composition 协议 + coordinator + 唯一 assembler + (协议内)AttemptIdentity
│   ├── harness/          # HarnessProfileManager / ContinuationRoute / HostControl 协议
│   ├── credential/       # CredentialMaterializer / PreparedSecretMount（注册通道补齐）
│   ├── host/             # HostFinalizationCoordinator + host 扩展点 manifest（selectors/controls/managers/routes）
│   └── __init__.py       # 兼容再导出（过渡期）
├── cli/                  # 治理 CLI；web/launch/doctor 改为 host 发现 + 兼容回退
└── migrations/           # Routing 后单轮归档 v1 死 schema
```

配套裁决：
- sandbox@1 单一类型 owner（收敛进 `extensions/runtime`；旧 `extensions/sandbox/` 协议退役或换 id 存档）；
- transport handler 注册进 Registry/Coordinator 实例（消灭模块级全局表）；
- PluginRegistration 增 `credential_materializers`（第 3 步），host manifest 承载其余 5 类扩展点（第 5 步）；
- guest 路径声明进 Binding 输入（第 2 步），`/workspace`、`/runtime/home` 从"散落字面量"变为"Binding 声明 + sandbox 校验"；
- Web Host 保持独立发行包，获得自有 console script（`agent-box-web`），Root CLI 命令经 host entry point 发现，未装时保留现行提示。

明确**不做**：拆 core/sdk/contracts 发行包（除非出现真实第三方 SDK 消费者）；为"好看"给五 harness 抽共享基类（用 conformance 检查替代）；动 Work Core 语义。

---

# Incremental migration plan

原则：每步单独可测试、不改 Work Core 语义、不同时大改多个边界、失败可回退（每步独立 commit/revert 单元，dirty worktree 先落盘为基线 commit 再开工——实施期事项，本轮不执行）。

**第 1 步 · sandbox 契约 authority 收敛（含 F7）**
- 移动/变更：`SandboxV1` 与 `SandboxTemplateV1` 收敛为一个类型（建议：`extensions/runtime/protocol.py` 持有唯一 Sandbox 契约类型，包含 template 元数据 + port 语义；旧 `ResolvedSandbox.start` Protocol 退役）；`registry.py:144-148` 的延迟注册移入 `extensions/bootstrap.py`。
- import 迁移：`agent_box.extensions.sandbox` 保留 shim 再导出（bwrap/plugin 与测试改新路径）；assembler/codex composition 删除 `getattr(sandbox,"port",sandbox)` 桥接。
- 兼容：shim 一个 minor 周期；`extensions.sandbox.CONTRACT_ID` 常量不变。
- 测试门槛：`services.py:345-355` isinstance 校验全绿；bwrap resolve/wrap、composition vertical、codex app_server/interactive 离线测试全绿；新增"注册 SandboxV1 形状契约成功"反测。
- clean-wheel 验证：`pip install dist/*.whl` 后 import `agent_box.extensions.sandbox` shim + 新路径双通。
- 回退：单 commit revert。

**第 2 步 · assembler 去特判 + 唯一装配权威（F2、F13，协议签名顺带 F8）**
- 移动/变更：契约 id 改用 `WorkspaceV1.contract_id`；workspace→guest 映射改为 Binding 输入显式声明（`RuntimeSourceDeclaration` 或 Binding 字段），assembler 只校验不发明路径；symlink 消毒上收进 assembler，删除 codex fallback factory（composition.py:142-159 转测试 helper）；`hasattr(coordinator,"ledger")` 改为显式协议方法/标志。
- import 迁移：无跨包（都在 Root+harnesses）。
- 兼容：`HarnessCommandSpec.cwd_token` 语义不变；Binding 增量字段带默认值（旧 draft 兼容）。
- 测试门槛：全部 composition 垂直测试 + `test_bwrap_formal_dispatch_vertical` 改走唯一路径后全绿；新增"Binding 未声明 workspace 路径时明确报错"。
- clean-wheel：同上。
- 回退：单 commit。

**第 3 步 · 注册面补全（F3）**
- 变更：`PluginRegistration.credential_materializers` 字段 + loader 转发进 host manifest；官方 harnesses 插件同时保留构造注入（行为不变，双通道过渡）。
- 测试门槛：loader 单测（含 materializer 去重）；web facade 回归。
- 回退：单 commit。

**第 4 步 · transport handler 实例化（F4）**
- 变更：handler 表移入 Registry/Coordinator 实例（bootstrap 时从插件 registration 收集 `transport_operation_handlers` 字段）；模块级 `register_transport_operation_handler` 保留为弃用 shim（写进实例表）。
- 测试门槛：新增**顺序无关测试**（仅 import runtime-local、不 import terminal-session 时，tmux operation 得到明确"未注册"错误且 direct-stdio 正常）；native tmux 组合测试全绿。
- 回退：单 commit。

**第 5 步 · host manifest（F5）**
- 变更：SDK 新增 `HostExtensionManifest`（selectors/contributors/controls/harnesses/routes/materializers），`load_installed_plugins` 填充；facade 改读 manifest；`bind` 探测改为协议可选方法。
- 测试门槛：web 全量回归；新增第三方 Host 最小聚合示例测试。
- 回退：单 commit（facade 内部改回直读 report）。

**第 6 步 · Routing 能力发现（F6 的修法）**
- 变更：harness/runtime/sandbox/terminal 的 descriptor 增加能力字段（execution_provider_ids 已有先例，facade.py:277-278）；QuickLaunch 前端映射表替换为从 `/selectors`+`/harnesses` 能力数据渲染；facade `repositories()` 改为按 Workspace 契约发现 provider。
- 测试门槛：web e2e（现有 quick_launch e2e 扩展到 5 harness）；前端构建。
- 回退：前端独立 revert。

**第 7 步 · CLI host 发现（F11，可选并行）**
- 变更：entry point 组 `agent_box.hosts`；`agent-box web/launch/doctor` 优先发现已装 Host，回退现行 agent-box-web 行为；agent-box-web 增自有 console script。
- 测试门槛：CLI 单测（未装/已装两态）。
- 回退：单 commit。

**第 8 步 · 元数据与文档（F17，随时小步）**
- 版本统一到 2.0.0a1（或明确各 harness 独立版本策略并写进文档）；descriptor 版本与 pyproject 对齐；删 workboard 空壳与未用依赖；`__init__.py` docstring；ARCHITECTURE.md/PLUGIN_SDK.md 补 runtime composition 层与本审计三缺口；clean build 验证 wheel 清单。

**与 Resource Routing 的时序**：第 1-5 步 = **Routing 前必修**；第 6 步 = **与 Routing 同期**（Routing 的第一个应用）；第 7-8 步 = 可并行/延后。**明确延期**（避免无止境重构）：harness 共享基类抽取（用 conformance 检查替代，F12）；migrations 死 schema 归档（F10）；发行包拆分（B/C）；`agent-box` 更名。

---

# Resource Routing blockers

进入 Resource Routing 前**必须**完成：

1. **F1** sandbox 契约单一 authority——Routing 的契约解析以 registry 类型目录为准，双类型使解析结果依赖桥接巧合。
2. **F2** assembler 契约特判与 guest layout 权威——Routing 生成的 Binding 必须能无特判地表达"资源→guest 投影"。
3. **F3** credential materializer 注册通道——Routing 自动装配 credential 输入的前提。
4. **F4** transport handler 显式注册——Routing 的组合必须不依赖 import 顺序。
5. **F5** host 扩展点 manifest——Routing 需要一个可查询的扩展点总目录作为路由数据源。
6. **F9 的裁决**（非代码）：profile 是否 envelope、agent_type 是否路由键——Routing 设计输入，先裁决再写路由器。

**可与 Routing 同期**：F6（Routing 的第一个受益方）、F11、F8（签名在同一批变更里收口）。
**应延期**：F10（死 schema 归档）、F12（harness 统一性检查加强）、F14/F15（协议探测与私有属性）、B/C 拆包、更名。

---

# Acceptable debt

以下明确**不**要求在 Routing 前处理，理由如各条：

- **v1 死 schema（F10）**：运行时无权威、无行为影响；归档需要谨慎的迁移策略，收益/风险比在 Routing 前不划算。
- **`db.py` 全局连接单例（F18）**：有锁、有测试重置钩子，单进程 SQLite 语义下是合理实现。
- **`__init__.py` import 期读 pyproject（F19）**：仅源码态，无实际危害。
- **CLI web 便利耦合（F11）**：防护完善，Host 发现化是改进而非止血。
- **五 harness 无共享基类（F12）**：鸭子协议 + conformance 检查优于继承树；在只有 5 个实现且仍在演化时抽基类是过早收敛。
- **migrations 005 空占位（F17 内）**：文件内已自解释（`005_resource_contract_inputs.sql:1-6`），006 接续编号的行为由 db.py 文件名排序保证。
- **`agent-box-cli` 发行名（P3）**：改名破坏性 > 当前收益；先在描述/README 说清聚合定位。

---

# Final READY / NOT READY FOR RESOURCE ROUTING

**NOT READY FOR RESOURCE ROUTING。**

理由：Routing 的三个设计前提——契约类型目录是唯一解析权威（被 F1 破坏）、组合层完全契约驱动（被 F2/F13 破坏）、全部扩展点有显式可查询的注册面（被 F3/F4/F5 破坏）——当前均不成立。好消息是：Work Core 本体中立且语义扎实（freeze→resolve→preflight→start 幂等管线、sealed dispatch、terminal 单调性），插件依赖方向全对、无重复注册、spawn 权威单一；上述阻塞全部是 Root Extension/组成层的模块级问题，按第 1-5 步（估 5 个独立小变更，每步带回归门槛）修复后即可 READY，无需拆发行包、无需触碰 Work Core 语义。
