# REQUIRED DECISIONS — Harness Native Chain Determined Repairs（2026-09-02）

本轮实施过程中遇到、且按"不阻塞原则"记录的产品/架构决策点。每项均未擅自实现，
其余不受阻塞的工作已全部完成。

## RD-1 Root 协议缺少"内存 RenderedArtifact → execution-scoped materialization"正式契约

- **当前代码位置**：`plugins/agent-box-harnesses/src/agent_box_harnesses/adapters/staging.py`
  （`ExecutionStagingArea`，插件内唯一 execution-scoped 写入者）；消费方
  `generic/execution_provider.py:start()` → `adapters/lowering.py:lower()`。
- **冲突事实**：Root Runtime 协议（`agent_box.protocols.runtime`）的 prepared-source
  注册只接受**已存在的宿主路径**；Composer 产出的内存渲染物（config.toml /
  settings.json / opencode.json / config.yaml）没有正式的 Root 级 materialization
  端口。 adjudication 8 禁止私建第二套 writer，故本轮在插件内收敛为**单一**
  staging 写入者，并经 lowering→assembler→sandbox 的既有 digest 链暴露。
- **可选方案**：
  1. 维持插件内单一 staging writer（现状），Root 侧不感知；
  2. 将 staging 提升为 Root-owned Materializer 端口（新增 `agent_box.protocols`
     类型化 seam，与其他 provider 共享）；
  3. 扩展 prepared-source 注册以接受内存字节（sandbox 直接落盘/挂载）。
- **各自影响**：1＝零 Root 改动但 materialization 语义对 Root 不可见；2＝Root 协议
  扩张，需要单独一轮设计；3＝sandbox 实现负担加重，secret/provenance 语义需重审。
- **推荐方案**：2（下一轮将 staging 语义提升为 Root Materializer 端口），迁移期间
  方案 1 保持兼容。
- **是否阻塞 vertical**：不阻塞；当前链路完整可用。

## RD-2 Pi 项目资源 trust 策略（是否自动 `--approve`）

- **当前代码位置**：`plugins/agent-box-harnesses/src/agent_box_harnesses/adapters/pi.py`
  （`diagnostics_notes` / `_plan_warnings`：`PI_PROJECT_TRUST_UNDECIDED_*`）。
- **冲突事实**：pi headless（`-p`/`--mode json`/`--mode rpc`）从不弹 trust 提示；
  guest HOME 无 `trust.json` 决策时按 `defaultProjectTrust`（默认 `ask`）处理，
  项目 `.pi/` 资源被**静默忽略**（pi FACTS C.8）。Agent-Box workspace 是执行本地
  物化目录，`--approve`（本 run 信任）语义上是安全的，但这是授权面决策。
- **可选方案**：1. 默认不信任（现状），仅 diagnostics 提示；2. 默认加 `-a`；
  3. 由 Profile payload 显式声明（`defaultProjectTrust` 渲染进 settings.json）。
- **各自影响**：1＝项目内 `.pi/skills` 不可用（可经 guest home 全局技能补齐）；
  2＝最大化资源可用性，但构成默认信任决策；3＝最显式，但需要 Profile UI 支持。
- **推荐方案**：3（Profile 显式声明），过渡期维持 1。
- **是否阻塞 vertical**：不阻塞（diagnostics 已明示）。

## RD-3 Codex/managed profile payload 键策略（严格白名单 vs 容忍+诊断）

- **当前代码位置**：`adapters/codex.py`、`adapters/opencode.py`
  （`known_payload_keys=None` + `_payload_diagnostics`；渲染时仅映射
  documented native keys）。
- **冲突事实**：Web 管理的 profile `config` 使用自有词表（provider_endpoint、
  native_plugins、mcp、skills…），与各家原生 config 键不完全重合；OpenCode 原生
  **硬拒绝**未知顶层键（FACTS D7），Codex 无 `--strict-config` 时静默忽略。
  实施中发现：adapter 层的严格白名单会破坏现有 Web profile 创建 vertical。
- **可选方案**：1. 容忍未知键+诊断，渲染时只映射 documented keys（现状）；
  2. 严格白名单拒绝（会破坏 Web 面，需要 Web 与 Registry 词表统一先行）；
  3. 为 managed payload 定义独立 Agent-Box schema（新增正式契约）。
- **推荐方案**：过渡维持 1，最终采纳 3（与 RD-1 的 Materializer 端口同轮推进）。
- **是否阻塞 vertical**：不阻塞。

## RD-4 Live streaming observation 的 Runtime 侧泵

- **当前代码位置**：`generic/execution_provider.py:observe()`（仅 post-exit
  有界 drain）；capability truth 将 `stream` 恒报 `unavailable`
  （"decoder exists but no live stdout pump is wired"）。
- **冲突事实**：五家结构化 stdout 流的**解码器**已实现并有 fixture 测试；但
  TerminalSession 协议没有非阻塞读/订阅语义，进程存续期间读取会阻塞。完整
  streaming 属于 Runtime/terminal 侧能力。
- **可选方案**：1. TerminalSession 增加增量读端口（Root 协议扩展）；
  2. Harness provider 内起旁路线程泵（有 concurrency/生命周期成本）；
  3. 维持 post-exit drain + `stream=unavailable`（现状）。
- **推荐方案**：1；在落地前 `stream` 保持 unavailable 并带 diagnostics。
- **是否阻塞 vertical**：不阻塞（observe/finish 已覆盖确定性观测）。

## RD-5 Hermes 沙箱化执行需要完整 Python 运行时投影

- **当前代码位置**：`adapters/hermes.py`（`HERMES_REQUIRES_SITE_PACKAGES_…
  SINGLE_FILE_STAGING_INSUFFICIENT` warning；`executable_warnings`）。
- **冲突事实**：hermes console script 依赖其 site-packages 才可导入（hermes
  FACTS B/J 实证 ModuleNotFoundError）；单文件 ro-bind 进沙箱无法运行。
  现状 LaunchPlan 仍可生成（planning 纯净），真实沙箱运行需完整 venv 投影。
- **可选方案**：1. 把 `<venv>` 目录整体作为 bundle 成员 ro-bind（体积大）；
  2. 用 `PI_PACKAGE_DIR` 式覆盖/打包 wheel；3. hermes 走非沙箱 runtime-host
  （与现行 sandbox 协议的关系需裁决）。
- **推荐方案**：1，但体积与装载耗时需实测后定阈值。
- **是否阻塞 vertical**：不阻塞 plan/codec 层；沙箱内真实 hermes 运行在决策前
  应视为不可用（diagnostics 已声明）。

## RD-6 Credential 的 config merge / 多账号语义

- **当前代码位置**：`harnesses.toml [harness.credential]`（codex）；
  `generic/execution_provider.py:_prepare_secret_mounts()`（typed boundary）；
  `codex/credentials.py`（locator-only materializer，保留未改）。
- **冲突事实**：五家 credential 机制差异大（OAuth 刷新 vs env key vs keychain）；
  多账号/账号池（hermes credential pool、codex ChatGPT vs API key）需要产品层
  的账号选择语义，且涉及 Profile 与 credential 的联动 UI。
- **可选方案**：1. 每家单 locator（现状，codex-login/default）；2. per-account
  locator 命名空间 + selector；3. credential pool 策略面。
- **推荐方案**：2，按 harness 渐进开放。
- **是否阻塞 vertical**：不阻塞（synthetic secret fixture 已证明 typed boundary）。

## RD-7 启动模式（launch mode）的选择面

- **当前代码位置**：`adapters/start_context.py:select_launch_mode()`（首选
  `exec`，否则第一项，选择依据记入 `HarnessStartContext.launch_selection`）。
- **冲突事实**：Registry 已声明 interactive/app-server 等多模式，但 Dispatch/
  Binding 请求面没有 mode 选择参数（Phase C 的 ADD_TYPED_SPI 未获本轮授权）。
- **可选方案**：1. 维持"首选 exec"确定性策略（现状）；2. Binding 增加可选
  launch_mode 槽位；3. per-Profile 声明默认模式。
- **推荐方案**：2 + 3 组合（请求可覆盖、Profile 给默认）。
- **是否阻塞 vertical**：不阻塞。
