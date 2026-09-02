# AGENT_BOX_CURRENT_GAP_MAP — 当前链路差距图

基线：HEAD `1a3c308`，branch `feat/resource-routing-phase2`。审计日期 2026-09-01/02。
本文件只描述"现状与差距"；修改建议在 `FILL_AND_MODIFICATION_PLAN.md`。

## 1. 当前正式链路（自上而下）

```
pyproject [project.entry-points."agent_box.plugins"]        （6 个入口，同一 _Plugin）
  └─ extensions/loader.load_installed_plugins              （group="agent_box.plugins"）
       └─ generic/factory.build_registration(context, harness_type)
            ├─ registry.load_builtin_registry()            （harnesses.toml → HarnessDefinition）
            ├─ ProfileStore(root, validator=adapter.validate_native_payload)
            ├─ GenericExecutionProvider(definition, adapter)
            ├─ contributions: resource_selector(GenericProfileSelector)
            │                 host_control(ProviderHostControl)
            │                 resource_library(GenericProfileManager)
            └─ ADAPTERS[driver] = Codex/Claude/OpenCode/Hermes/PiAdapter
                 （全部是 GenericCliAdapter 空子类）

Web 门面（agent-box-web/application/facade.py）
  ├─ selectors/libraries/controls ← catalog.query(host kinds)
  ├─ prepare → GenericProfileSelector.prepare → ProfileStore.ref
  ├─ freeze → execution.dispatch_execution（Work Core）
  │     └─ resolve：contract_type(contract_id) 类型化产物
  │          （agent-box.profile@1 → AgentBoxProfileV1 信封，无 native_payload）
  └─ start（provider.start）
        ├─ adapter.build_command(definition, request, profileEnvelope)
        ├─ assemble_runtime_composition(request, command)
        │     （需要 RuntimeHostV1/SandboxV1/TerminalSessionV1 三输入）
        └─ coordinator.start → preflight → sandbox.wrap → terminal.run
```

## 2. 审计问题逐项结论（对应任务书第七节 1–15）

1. **harnesses.toml 每个字段是否被正式源码消费** — 详见
   `matrices/agent-box-field-consumption.md`。约 21 项未消费、11 项正式消费、
   3 组装饰性/半消费。
2. **未消费字段列表** — `bundle_members`、`version_probe`、`config_format`、
   `payload_schema`、`codec`、`overlay_policy`、`slots`、`inputs.selectors`、
   `inputs.target`（除校验）、`inputs.transformer`、`resume_contract`、
   `runtime.io/host_capabilities/sandbox_capabilities/network/terminal`、
   `continuation.kind/contract_id/target_provider`、
   `credential.contract/locator_provider/guest_target_class/materializer`、
   `profile.native_home`（正式路径条件失效）。
3. **消费但与官方事实不一致** —
   a. `profile.native_home=".codex"` 等被写为"相对名"，而 GenericCliAdapter 期望
      绝对 host 路径（仅 dict profile 生效）——声明语义与消费语义脱节；
   b. codex `launch_modes` 有 app-server 模式声明但永远取 `[0]`；
   c. claude exec 模式 `argv=["claude","--print"]` 缺少 `--output-format`/
      `--verbose` 等 headless 结构化输出参数（与官方 headless 语义不符）；
   d. opencode `skill_env="OPENCODE_CONFIG_DIR"`、hermes `HERMES_HOME`、
      pi（无 skill_env）——这些 env 是否真实存在待 harness 研究证实（ 初步：
      opencode 官方无 `OPENCODE_CONFIG_DIR` 概念，配置经 XDG 或 `OPENCODE_CONFIG`）；
   e. `capabilities=["stream","permissions",...]` 声明与 `observe/finish` 直通实现
      完全不符（回显 "supported"）。
4. **Adapter 方法是否真正被主链调用** — `build_command`、`validate_native_payload`
   被；`observe/finish` 被直通调用；`declare_runtime_sources`、`decode_observation`
   **死 SPI**。
5. **declare_runtime_sources / decode_observation 是否 dead** — 是（全仓库无调用者，
   包括 tests）。
6. **Profile exact Ref resolve 后 native payload 去向** —
   `ProfileStore.resolve` 返回 `AgentBoxProfileV1` 信封（name/agent_type/digest/
   revision/provider），**native_payload 不出 Store**；`build_command` 收到的
   `profile` 是该信封，非 dict，故 payload 对 argv/env/source **零贡献**。
   "exact Ref → payload → Adapter" 链路**不存在**。
7. **executable bundle 如何进入 /runtime/bin** — 没有路径。`/runtime/bin` 仅由
   bwrap `--dir` 建空目录；旧 `codex/executable.py` 的
   `CodexExecutableBundle.runtime_sources()` 是唯一成熟实现但只在 tests 被调用；
   formal vertical 用 fake 脚本 + workspace 源声明绕过。`resolve_executable`
   无调用者。
8. **launch_modes 是否永远只取第一项** — 是（`generic_cli.py:9`）。
9. **TOML capability 是否有行为方法和测试** — 无。`capabilities()` 仅回显
   `{key:"supported"}`；无 stream 解码、permission 处理、attach 实现；
   测试只测回显与 input_limits。
10. **streaming / permission / continuation / telemetry 落地状态** —
    - streaming：无（观察通道只有 handle 直通与 HostControl.observe 直通）；
    - permission：无（协议层 `PreparedSecretMount` 是 secret 挂载，不是审批流；
      bwrap 拒绝 credential 形状 env）；
    - continuation：协议存在（`ContinuationRoute`），generic factory 不装配；
      旧实现（codex/claude/opencode/hermes/pi 各自 continuation）仅测试引用；
    - telemetry：无 usage/cost/token 解码路径。
11. **五个空 Adapter 丢失的旧原生实现**（现仅存在于旧子目录、测试可达）：
    - `codex/`：app_server JSON-RPC 客户端（provider.py，622 行）、可执行 bundle
      解析（executable.py）、credential source（credentials.py）、launch、
      hooks 注入（composition.py 中 `/runtime/hooks/session-start` 重写）、
      continuation；
    - `claude/`：launch/settings 投影、profile provider、composition、fake_claude；
    - `opencode/`：OpenCodeExecutionProvider（provider.py，179 行）、profile
      authority/selector、projection、continuation contract；
    - `hermes/`：launch/profile/projection/provider/composition；
    - `pi/`：config（agent-box home 集成）、provider（自管 coordinator）、
      projection、sessions、contract。
12. **旧实现哪些仍在正式路径** — 仅两处：`plugin.py:21` 门面的
    `CodexCredentialSource`（门面路径，非 entry point）；其余 2405 行全部仅测试。
13. **Skill 语义所在层** —
    - 合同/快照：`agent_box.resource_contracts.agent_skill_v1` + SkillStore
      （不可变 revision、digest、frontmatter 校验）；
    - 解析端口：`ResolvedAgentSkill.source.projection_source()`（私有）；
    - 投影决策：`GenericCliAdapter.build_command`（skill_target/skill_env）；
    - 证据：`adapters/skill_observation.py`（fake/native 目标的 LOADED 证据）；
    - Registry 声明：`harness.inputs`（agent-box.skill@1）+ `profile.skill_target/env`。
14. **增加 MCP/Prompt/Rules 是否会继续改 GenericCliAdapter** — 会。当前唯一投影
    决策点是 `GenericCliAdapter.build_command`（硬编码 workspace/profile-home/skill
    三类 source），没有可插拔的 per-resource projector SPI；新增资源必然继续膨胀
    该方法（违反任务书"Resource-owned projector"方向）。
15. **六 entry points 的实质影响** — 六入口同一实现，仅 harness_type 参数不同；
    registry 是全局单份 builtin；多入口带来的唯一差别是注册哪个
    provider_id/selector/library。对知识模型无实质影响；记录在案，本轮不改。

## 3. HarnessAdapter SPI 无法表达的真实能力（对照真实 CLI 形态）

| 真实能力 | 现 SPI 表达 |
| --- | --- |
| 多 launch mode（exec/app-server/interactive/resume） | ❌ 永远 `[0]`，无 mode 选择入参 |
| 结构化事件流（stream-json / --json / JSON-RPC） | ❌ observe 直通，无事件信封 |
| 权限审批请求/响应 | ❌ 无通道 |
| native resume / session locator 提取 | ❌ continuation 未装配；无 session id 解码 |
| usage/token/cost 观测 | ❌ 无字段、无解码 |
| prompt 经 stdin / 协议传递 | ❌ build_command 只会 argv 追加拼接 |
| 可执行 bundle 成员（多文件/native binary+companion）声明与 staging | ❌ bundle_members 无消费、无 runtime_sources 装配 |
| 每模式不同 env/网络要求（control-plane vs tool network） | ❌ HarnessCommandSpec 字段存在但从未由 registry/adapter 填充 |
| profile native payload 影响 argv/env/config 文件 | ❌ payload 停在 Store，信封到 Adapter |
| per-harness credential materializer 选择 | ❌ credential spec 无消费，门面硬编码 |
| version 探测/可用性预检 | ❌ version_probe 无消费 |
| 中断/steer/attach 的 harness 侧实现 | ❌ HostControl.attach_command 返回 None |

## 4. 不能安全统一、应保留 native extension 的候选

初步清单（待 harness 研究佐证后终稿）：

- codex app-server JSON-RPC 会话协议（有状态、双通道）；
- claude stream-json input mode（双向 stdin 控制协议）；
- 各家 credential 机制差异（OAuth 刷新 vs API key vs keychain）；
- opencode 的 server/attach 形态（HTTP + SSE）；
- pi 的 extension/RPC 形态。
