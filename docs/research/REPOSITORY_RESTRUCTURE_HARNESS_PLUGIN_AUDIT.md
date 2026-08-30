# Agent-Box Harness 插件迁移审计

- 审计范围：`plugins/agent-box-harnesses`、`plugins/agent-box-codex`、`plugins/agent-box-pi`、`plugins/agent-box-tmux`，以及根包的 Profile/config/template/resource/launch/session 路径
- 审计方法：只读检查源码、entry point、调用方与已有测试；本报告未修改代码、未执行 Git 操作、未修改 docs 索引
- 结论状态：当前 Codex vertical slice 可作为迁移起点，但官方 Harness 插件尚未达到“独立 wheel、无 Core/旧包依赖”的最终形态

## 结论摘要

官方目标应是 **一个 `agent-box-harnesses` 分发包拥有 Harness/Profile authority，并在内部包含 Codex driver/runtime**。`agent-box-codex` 不应继续作为另一个可发现的 Codex 产品或长期公共 owner；其现有实现可以在过渡版本作为无 entry point 的 compatibility distribution，但最终应把 Codex contract、App Server/native CLI runtime、tmux 控制和 hook recorder 收入 `agent-box-harnesses`，删掉对 `agent-box-codex` 的运行时 import。

Harness 的边界是：Profile revision、native config projection、capability references、credential locator、native launch/continuation/observation/finalization，以及 Harness-specific diagnostics。Work Core 只接收 Contract、Ref、Binding、Dispatch、ExecutionProjection 和 Evidence/ResourceObservation。Web Host 只负责选择、命令幂等、mutation ownership 和调用 manager/control；tmux、Git、artifact 等外部资源仍由各自 ResourceProvider 管理。

当前最重要的阻断点有四个：

1. `agent_box_harnesses.plugin` 直接 `from agent_box_codex.plugin import CodexPlugin`，并通过继承 `AgentBoxProfileResourceProvider` 间接依赖 `src/agent_box/resources.profile`；这会使所谓官方插件无法独立演进。
2. `agent_box_harnesses.codex.launch` 依赖根包 `agent_box.launch.LaunchPlan`，而旧 `build_launch_plan` 仍绑定 bwrap、旧 profile DB、项目挂载和 `resources.sessions`。
3. 旧 `ProfileRepo` 是 SQLite + 目录复制模型，新 `ProfileRepository` 是 immutable JSON revision 模型；`preview-resources` selector 仍读取旧 repo，存在双 authority 和同名 ProfileRef 不一致。
4. 新 `ProfileRef`/`CredentialSourceRef` 尚未成为统一的 plugin-owned contract 族：Codex 使用 `agent-box-profile@1` + `Ref` metadata，Pi 使用独立 continuation；需要明确版本化 schema、secret redaction 和 exact resolution 规则。

## 当前实现事实

### `agent-box-harnesses`

`pyproject.toml` 暴露唯一 `agent_box.plugins` entry point `harnesses`，依赖 `agent-box-cli` 和 `agent-box-codex`。`HarnessesPlugin.build()` 创建 `CodexHarnessManager`，调用 `CodexPlugin().build(context)`，取其第一个 App Server provider，再替换 `_launch_adapter`；最终注册一个 `codex-profile` ResourceProvider、一个 `codex-app-server` ExecutionProvider、一个同 id HostControl、一个 selector 和一个 manager。这个测试事实由 `tests/test_codex_wiring.py` 固定：官方注册应只有一个 Codex ExecutionProvider。

已有的 Profile 路径是当前最接近目标的部分：

- `profiles/repository.py`：按 `profiles/<id>/r<revision>.json` 写入 immutable revision；使用 canonical JSON + SHA-256；拒绝 secret-like key；文件目录 0700、文件 0600；支持 optimistic revision conflict。
- `profiles/models.py`：`ProfileRef(harness_id, profile_id, revision, digest, provider)`，可转为 Core `Ref(ARTIFACT, ...)`。
- `profiles/projection.py`：按 execution id 创建 projection；生成 `config.toml` 与 `manifest.json`；credential 只通过 plugin-owned source projection；cleanup 删除执行目录。
- `codex/credentials.py`：只接受 `codex/codex-login/default` locator，实际 auth source 从 native Codex home 读取，执行目录以受控 symlink 访问，不把 credential value 放入 manifest。
- `codex/manager.py`：负责 Codex profile CRUD、sandbox_mode 约束、selector、diagnostics、projection preview。
- `codex/runtime.py`：当前继承 Core 的 `AgentBoxProfileResourceProvider`，但实际 repo 是 Harness JSON repo；这是应消除的继承关系。

### `agent-box-codex`

该分发包没有 entry point，包含：

| 文件 | 当前事实 |
|---|---|
| `contract.py` | 定义 `CodexContinuationV1`，native thread id 作为 continuation input |
| `provider.py` | App Server JSON-RPC stdio client、thread/turn、stream、finish、native evidence |
| `tmux_provider.py` | 可见 Codex TUI，接受 `TmuxConsoleV1` 或 `TmuxPaneV1`，显式 finish、scrollback/session-start evidence |
| `host_control.py` | 从 frozen Binding 恢复 tmux provider handle，解析 workspace/profile/console |
| `hook_recorder.py` | 记录 Codex SessionStart，用于 tmux session identity recovery |
| `plugin.py` | 同时注册 App Server 与 tmux 两个 Codex provider；仅被 harnesses compatibility build 调用 |
| `__init__.py` | 导出 contract/provider |

这套实现已经有重要的生命周期语义：turn 完成、TUI idle 或 pane dead 不自动结束 Core Execution，只有 provider `finish()` 提交 terminal projection；continuation 是新 Core Execution 的 frozen SessionRef input，不是旧 Execution 被重开。

### `agent-box-pi`

Pi 是目前最完整的独立 Harness plugin 参考：entry point `pi` 注册 `PiContinuationV1`、`PiSessionResourceProvider` 与 `PiTmuxInteractiveExecutionProvider`；`config.py` 由插件读取 binary/model/thinking/agent_dir/session_root；`sessions.py` 仅扫描无秘密 session metadata；`resources.py` 以 digest 校验 native JSONL session identity；`provider.py` 通过 tmux 启动、显式 finish，并以 session JSONL + scrollback 提供证据。

Pi 仍是独立产品插件，不应被机械并入 `agent-box-harnesses`。其配置、continuation 和 runtime 可作为多 Harness SDK 的参考；如果产品决定官方 Harnesses 单包统一分发，则 Pi/Codex 应共享内部 SDK，却保留各自 driver 和 plugin feature flags，不能把 Pi 的 DeepSeek、session-dir 或 tmux 细节提升到 Core。

### tmux ResourceProvider

`agent-box-tmux` 定义 `TmuxConsoleV1`（Agent-Box 创建的专用 console）和 `TmuxPaneV1`（用户已有 exact pane），并提供 `TmuxConsoleController`。`TmuxPaneV1` 含 socket path、server/session/window/pane id、pane pid、cwd、current command 和 replace policy，且 resolve/inspect 前验证完整 identity。Codex/Pi 只能把它作为输入 ResourceRef；不能在 Harness 中自行发现并替换任意 pane，也不能把 tmux 资源状态写入 Profile。

## 1. `agent-box-codex` 是否完全合并

答案分两阶段：

### ownership 结论：是

对用户和 entry point 而言，Codex 的官方 owner 应只有 `agent-box-harnesses`。不得同时安装两个 `codex` execution provider、两个 profile selector 或两个 Codex continuation authority。最终 `agent-box-codex` 的 pyproject 应被废弃/转为迁移壳，不再暴露公共 entry point；升级期间可以保留一个无 entry point 的 wheel，满足旧 import 的 deprecation forwarding。

### source 迁移结论：应全部收入 Harnesses

以下 Codex-specific source 应迁入 `agent-box-harnesses/src/agent_box_harnesses/codex/`（或者同包内明确的 `drivers/codex/`）：

- `agent-box-codex/src/agent_box_codex/contract.py`
- `provider.py` 的 App Server client/provider
- `tmux_provider.py` 的 native interactive driver
- `host_control.py`
- `hook_recorder.py`
- `__init__.py` 的 compatibility exports

迁移完成后 `HarnessesPlugin` 不再调用 `CodexPlugin().build()`，而是直接构造 Codex registration。`agent-box-codex` 只能在一个迁移窗口内 re-export 新路径；不得让正式代码反向依赖旧包。必须保留两个 transport 的语义：App Server 是 structured automation/Host operation 的 canonical provider，native CLI/tmux 是可见、可 attach 的 interactive provider；二者不是两个“Codex owner”，而是同一 Harness 的两个 provider mode。

## 2. 通用 Harness 抽象与 Codex 分层

建议仅在 `agent-box-harnesses` 私有 SDK（必要时以后独立 `agent-box-harness-sdk`）定义下列窄接口，不扩张 Work Core：

```text
HarnessDescriptor
  id, display_name, version, supported_modes, capability_schema_version

HarnessProfileStore
  list/get/create/update(expected_revision)/disable/validate
  -> immutable ProfileRevision + exact ProfileRef

HarnessProfileProjector
  preview(ProfileRef, workspace facts)
  materialize(execution_id, ProfileRef)
  cleanup(execution_id)

HarnessCredentialSource
  validate(locator), diagnostics(), project(execution_root, locator), cleanup()

HarnessLaunchDriver
  preflight(ProfileRef, workspace, mode)
  plan(execution_id, ProfileRef, resolved inputs) -> LaunchPlan
  recover(start record / frozen refs)

HarnessContinuation
  plugin-owned Contract + ResourceProvider; continuation always starts a new Core Execution

HarnessControl
  attach/observe/finish; returns provider observations, refs and evidence with explicit ceiling
```

通用层只处理 revision/digest、secret policy、execution directory、launch plan 的 value object、fresh/resume 分流、错误分类和生命周期。Codex 层负责：Codex TOML/schema、`CODEX_HOME`、App Server JSON-RPC methods、Codex thread id、`codex resume`、SessionStart hook、Codex auth locator、Codex-specific capability projection。Pi 层负责 Pi agent_dir/session JSONL/DeepSeek credential；未来 Claude/OpenCode 层负责各自 native config and session semantics。任何 `model_provider`、`sandbox_mode`、`CODEX_HOME` 或 Codex API method 都不能出现在通用接口或 Core。

### App Server 与原生 CLI 共存规则

| 模式 | Provider identity | 启动 | 观察/证据 | 适用 |
|---|---|---|---|---|
| App Server | `codex-app-server` | `codex app-server --stdio`，配置来自 execution projection | JSON-RPC turn/thread events、native refs、protocol evidence | Web structured operation、可审计自动执行 |
| Native interactive | `codex-tmux-interactive` | `codex` CLI 在专用或 frozen existing pane 中运行 | pane observation、bounded scrollback、SessionStart record | 交互式终端、attach、用户接管 |

两个 provider 可共享 ProfileRef、WorkspaceV1、PromptFragmentV1 和 Codex continuation contract；不能共享 process handle、session overlay、tmux pane 或 finish state。App Server 不能冒充完整终端控制，native TUI 不能冒充 structured consumption proof。

## 3. Profile schema 与 secret boundary

Profile 应保持 Harness-owned immutable revision，建议稳定 schema 如下：

```json
{
  "schema_version": 1,
  "harness_id": "codex",
  "profile_id": "research",
  "name": "Research",
  "revision": 3,
  "provider": "codex-profile",
  "config": {
    "model": "...",
    "model_provider": "...",
    "approval_policy": "...",
    "sandbox_mode": "read-only",
    "instructions_ref": {"provider": "artifact-file", "native_id": "..."},
    "permissions": {"...": "..."}
  },
  "capability_refs": [
    {"kind": "mcp", "provider": "...", "native_id": "...", "digest": "..."},
    {"kind": "skill", "provider": "...", "native_id": "...", "digest": "..."},
    {"kind": "plugin", "provider": "...", "native_id": "...", "digest": "..."},
    {"kind": "hook", "provider": "...", "native_id": "...", "digest": "..."}
  ],
  "credential_source_ref": {"provider": "codex", "native_locator": "codex-login/default"},
  "session_overlay_policy": {"mode": "execution-local"},
  "digest": "sha256:..."
}
```

这里 `config` 只能有非秘密声明和 locator/reference；环境变量必须 allowlist 且拒绝 TOKEN/SECRET/KEY/PASSWORD/CREDENTIAL/AUTH 名称。`capability_refs` 是 source identity，不是 MCP command、plugin source 或 credential value；其具体 materializer 是 Harness driver/ResourceProvider。`instructions_ref` 可以指向不可变 prompt/artifact，正文不进入 Core Binding metadata。`permissions` 只表达 native Harness 的声明配置，不应变成 Core authorization policy。

`CredentialSourceRef` 当前只是 dict locator，尚缺一个统一 typed contract。最终应有 plugin-owned `CredentialSourceRefV1` 或至少严格 schema validator：provider、native_locator、revision/digest 可选，禁止 arbitrary path/value。Web API 只返回 identity/status；Projection manifest 记录 locator、method、materialized=false/true 和 cleanup，不记录 auth 文件内容。凭证投影最好优先 keyring/IPC；Codex 当前 controlled symlink 是兼容实现，应明确其证明上限：只能证明链接指向 source，不能证明 Harness/model 如何消费。

### session overlay

默认每次 Execution 独立 session/transcript/history/log/approval/cache root。Profile revision 不保存 session file、pane identity、process PID 或 mutable native DB。Continuation Ref 只保存 native session identity + digest/locator，由 provider 在新 Execution resolve；如果 native session 漂移或不存在，fail closed。`session_overlay_policy` 是 Harness 内部 driver policy，不是 Core entity；Preview 只暴露有限的 `execution-local`/明确 supported modes。

## 4. 旧版快捷体验保留方案

旧版体验应保留用户路径，替换底层 authority：

| 体验 | 迁移后 owner | 必须保留的行为 |
|---|---|---|
| 选择项目 | Web Host project selector + Git/Workspace ResourceProvider；CLI 传 workspace path/selector | persisted projects dir 可由 Web settings 保留；Core 只冻结 WorkspaceRef |
| 创建/选择 Profile | Harness manager + `ProfileSelector` | name/id、disabled filter、revision/digest、save creates new revision |
| Model/Provider | Harness profile `config` + provider capability refs | non-secret fields、provider endpoint locator、digest；禁止旧 ACS secret copy |
| MCP | Harness capability adapter + MCP ResourceProvider | list/select/preview；运行时 execution-local materialize，server credentials external |
| Skills/plugins/hooks | Harness capability adapters，native format mapper | preserve source reference/version and native merge rules; do not confuse agent-native plugins with Agent-Box extension distributions |
| Instructions/permissions | Harness config + immutable artifact refs | preview exact refs; native driver maps to TOML/JSON/YAML/JSONC/markdown |
| Prompt | PromptFragmentV1/artifact selector | input is frozen before dispatch; no hidden profile mutation |
| fresh/resume | Host creates new Execution; provider chooses new native id or continuation input | old session remains immutable historical ref; never reopen terminal Core Execution |
| interactive terminal | tmux provider + Harness native TUI provider | exact attach command, explicit finish, bounded evidence, dead-pane behavior remains explicit |
| cc-switch import | Harness-owned ExternalConfigSource adapter | read/import proposal diff only; credential becomes locator, never copy value; absent implementation must be reported as unavailable |

CLI shell can keep familiar commands (`list`, `create`, `use`, `apply`, `launch`, `resume`) as thin forwarding adapters. It must not instantiate `resources.profile` or `resources.sessions` directly after migration.

## 5. `TmuxPaneV1` 作为资源的使用规则

`TmuxPaneV1` 是一个 exact, user-owned Resource Contract，不是 Harness lifecycle state。Selector 通过 `agent-box-tmux` provider 选择 pane 并冻结完整 socket/server/session/window/pane identity、pane pid、cwd、command 和 replace policy。Codex/Pi provider 的 Binding requirements 可声明 `TmuxPaneV1` optional/required：

1. Dispatch resolution 校验 frozen identity 仍指向一个 pane。
2. `idle-shell-only` 只允许替换 shell；`force-replace` 必须是显式用户选择并在 UI/receipt 中标注。
3. Harness 使用 `TmuxConsoleController.launch/inspect/capture/cleanup`，不得自行 `send-keys`、按 session name 猜 pane、或杀掉整个 user session。
4. finish 先 capture scrollback/session-start，再按 provider policy 恢复 existing pane shell或清理专用 session。
5. evidence 只声明 pane identity/state/scrollback observation；不能声明 prompt 被消费、模型调用成功或 sandbox 安全。

专用 `TmuxConsoleV1` 可由 tmux ResourceProvider 创建；已有 pane `TmuxPaneV1` 必须要求 identity revalidation。Harness Profile 不存 pane ref，Continuation 不隐式绑定旧 pane。

## 6. 旧代码逐文件迁移表

状态含义：`MOVE` 迁入官方 Harness plugin；`EXTRACT` 仅抽出与 Harness 相关部分；`SHIM` 过渡转发；`DELETE` 新路径稳定后删除；`RETAIN` 保留在 Core/其他 plugin。

### Harness/Codex/Pi 当前文件

| 当前文件 | 状态 | 目标与说明 |
|---|---|---|
| `plugins/agent-box-harnesses/src/agent_box_harnesses/plugin.py` | MOVE/REWRITE | 直接构造官方 Codex registration；移除 `CodexPlugin` import；未来按 driver registry 扩展 Pi/Claude/OpenCode |
| `harnesses/profiles/models.py` | MOVE/REWRITE | 保留 immutable `ProfileRef`，补 typed schema/version/validation；不要依赖 Core old profile |
| `harnesses/profiles/repository.py` | MOVE | 作为 Harness profile authority；补 atomic fsync/backup/recovery 和 import adapter |
| `harnesses/profiles/projection.py` | MOVE/REWRITE | 通用 execution overlay + capability projection；Codex TOML 与 auth link 下沉 Codex driver |
| `harnesses/codex/credentials.py` | MOVE | Codex credential source；以后统一 CredentialSource protocol |
| `harnesses/codex/runtime.py` | REWRITE | 不再 subclass `AgentBoxProfileResourceProvider`；实现 Harness-owned ResourceProvider 接口 |
| `harnesses/codex/manager.py` | MOVE/REWRITE | profile CRUD/selector/diagnostics；移除 unused old `profile_contract_digest` import |
| `harnesses/codex/launch.py` | MOVE/REWRITE | 定义 plugin-owned LaunchPlan/driver；不要 import `agent_box.launch` |
| `agent-box-codex/src/.../contract.py` | MOVE then SHIM | 合并 Codex continuation contract；旧路径只 re-export 一个版本 |
| `agent-box-codex/src/.../provider.py` | MOVE then SHIM | App Server client/provider 全部收入 Codex driver |
| `agent-box-codex/src/.../tmux_provider.py` | MOVE then SHIM | Native TUI provider 收入 Codex driver，依赖 tmux plugin public API |
| `agent-box-codex/src/.../host_control.py` | MOVE then SHIM | Codex tmux control 收入 driver/control |
| `agent-box-codex/src/.../hook_recorder.py` | MOVE then SHIM | Codex-specific helper；避免旧 package runtime dependency |
| `agent-box-codex/src/.../plugin.py` | DELETE/SHIM | 不再发现、不再作为 owner；迁移期间仅 compatibility factory，拒绝重复 registration |
| `plugins/agent-box-pi/src/agent_box_pi/config.py` | RETAIN in Pi | 作为 Pi driver config，未来实现通用 profile projector，不把 DeepSeek 语义上提 |
| `plugins/agent-box-pi/src/agent_box_pi/contract.py` | RETAIN in Pi | Pi continuation remains Pi-owned Contract |
| `plugins/agent-box-pi/src/agent_box_pi/provider.py` | RETAIN/ADAPT | lifecycle/evidence 作为官方 Harness driver reference；独立包可继续发现 |
| `plugins/agent-box-pi/src/agent_box_pi/resources.py`、`sessions.py` | RETAIN in Pi | native session ResourceProvider/scanner；不迁至 Core |
| `plugins/agent-box-tmux/src/agent_box_tmux/*` | RETAIN in tmux | tmux remains independent ResourceProvider; Harness consumes contracts/controller only |

### 根包旧 Profile/config/resource/launch/session

| 当前文件/目录 | 状态 | 迁移决策 |
|---|---|---|
| `src/agent_box/resources/profile.py` | SHIM → DELETE | 旧 SQLite profile CRUD、template copy 与 preset orchestration 迁为 Harness manager；保留一版 import/read adapter 迁移旧 home |
| `src/agent_box/resources/sessions.py` | EXTRACT/SHIM → DELETE | PID zombie/session history 是旧 CLI 进程 tracker，不等同 native continuation；Harness provider 自己保存 start/recovery facts |
| `src/agent_box/resources/mcp/*` | MOVE selective | ACS lookup/native writers 入 Harness capability adapters；Core 不拥有 MCP objects |
| `src/agent_box/resources/skills/*` | MOVE selective | source lookup + native materializer 入 Harness adapters；禁止无版本 copy into Core |
| `src/agent_box/resources/providers/*` | MOVE selective | model/provider native format writers 入对应 Harness；credential values 改 locator |
| `src/agent_box/resources/prompts/*` | MOVE selective | prompt source/import 可进 Harness/ExternalConfigSource；frozen prompt 是 PromptFragment/artifact provider |
| `src/agent_box/resources/hooks.py`、`config_files.py` | MOVE selective | native hooks/config mapping 入 Harness driver；通用文件安全工具才可留 SDK |
| `src/agent_box/adapters/acs.py`、`models.py` | MOVE | 作为 Harness ExternalConfigSource/ModelCatalog adapter；不进 Core；网络查询须可审计/可 mock |
| `src/agent_box/templates/*` | MOVE | 按 Harness 分发 native base config；禁止将 auth template 当 credential source |
| `src/agent_box/presets/*` | MOVE | 作为 Harness seed revisions/capability packages；保留 preset 名称兼容映射 |
| `src/agent_box/launch.py` | EXTRACT → SHIM | 从中抽 `LaunchPlan` value object、路径检查和必要安全函数；bwrap/旧 profile mounts 迁出；旧 import 暂时转发 |
| `src/agent_box/project_space.py` | EXTRACT | native project-surface planning 迁 Harness/project capability；Workspace materialization/cleanup 归 Git plugin |
| `src/agent_box/config.py` | SHIM then SPLIT | 拆 Core home/DB、Harness paths、Web settings、ExternalConfigSource；旧 functions 保留一版转发 |
| `src/agent_box/edit.py` | SHIM/CLI | editor utility 不是 Core；可留 CLI thin utility |
| `src/agent_box/cli/commands/profile.py` | SHIM → MOVE | 命令名保留，调用 manager/Host API；移除对 old resources 的直接 import |
| `src/agent_box/cli/shell.py` | SHIM | 保留快速 REPL 和 script mode；只做 Host/plugin delegation |
| `src/agent_box/work_core/providers/resources.py` | RETAIN then DECOUPLE | Git/artifact providers可留对应资源插件；`AgentBoxProfileResourceProvider` 与 `resources.profile` 依赖必须删除，Profile provider 由 Harness 注册 |
| `src/agent_box/resource_contracts/agent_box_profile_v1.py` | RETAIN/REVIEW | 若继续作为通用 input contract，去掉 `agent_type` 产品假设；Codex exact ProfileRef schema 由 Harness plugin 版本化 |
| `src/agent_box/migrations/*.sql` | RETAIN historical | Core migrations 保留顺序；旧 profiles/sessions 表仅用于升级/导入，不再作新 authority；Harness profile storage 自有 schema/version |

## 7. 目标目录树

推荐最终结构（保留 Pi 独立插件的情况下）：

```text
plugins/agent-box-harnesses/
├── pyproject.toml                 # 唯一 official harnesses entry point
├── README.md
├── src/agent_box_harnesses/
│   ├── __init__.py
│   ├── plugin.py                  # descriptor + registration
│   ├── sdk/
│   │   ├── profile.py             # schema, revision, ProfileRef
│   │   ├── projection.py          # execution-local materialization
│   │   ├── credentials.py         # locator-only protocol
│   │   ├── launch.py              # small LaunchPlan/driver protocol
│   │   └── capabilities.py        # versioned refs/materializers
│   ├── codex/
│   │   ├── contract.py
│   │   ├── app_server.py
│   │   ├── native_cli.py
│   │   ├── tmux_control.py
│   │   ├── credentials.py
│   │   ├── projection.py
│   │   ├── manager.py
│   │   └── hook_recorder.py
│   └── profiles/
│       ├── repository.py
│       ├── selector.py
│       └── import_legacy.py
├── tests/
│   ├── test_profile_revision.py
│   ├── test_secret_boundary.py
│   ├── test_codex_app_server.py
│   ├── test_codex_native_tmux.py
│   ├── test_legacy_import.py
│   └── test_clean_wheel.py
└── data/                           # native defaults/presets, no secrets

plugins/agent-box-pi/                # optional independent Pi driver/plugin
plugins/agent-box-tmux/              # independent tmux ResourceProvider
plugins/agent-box-git/               # Workspace/Git provider
```

如果最终决定 Pi 也由一个 official `agent-box-harnesses` wheel 统一分发，则保留 `pi/` sibling driver 和独立 `agent_box_pi` compatibility namespace，但仍不得合并 Codex/Pi 的 native configs、credential source 或 continuation contracts。

## 8. 兼容策略

1. **旧 profile import 一次性、只读源**：首次发现旧 `$AGENT_BOX_HOME/profiles/<name>` 和 SQLite row 时，由 Harness import adapter 生成 revision 1；记录来源、旧 digest、agent type 和 warnings。旧目录不原地改写，不复制 auth/token/history/cache。
2. **旧命令名保留一版**：`create/use/apply/launch/resume` 保持参数兼容，内部转 manager/selector/Host；输出可增加 revision/digest，但不要改变 fresh/resume 的新 Execution 语义。
3. **旧 imports 转发**：`agent_box_codex.*` 和必要 `agent_box.launch.LaunchPlan` 保留 deprecated re-export；正式 plugins 不得 import 它们。删除前用 import compatibility tests 和 clean-wheel tests 固定。
4. **ProfileRef 双格式验证窗口**：接受旧 `agent-box-profile` metadata 及新 `codex-profile` revision Ref，但 resolve 后立即输出 canonical new ProfileRef；禁止依据 mutable old digest 继续 dispatch。
5. **DB migration non-destructive**：旧 `profiles`/`sessions` tables 的 migrations 保留，新增 Harness JSON store 不与 Core DB 共用写事务。若必须写 legacy DB，只在 explicit import command 下进行。
6. **凭证 fail closed**：不支持的 locator、source 不存在、projection target 已存在、digest drift 都拒绝 launch；secret-like key scan 不因 nested capability/config 变深而绕过。
7. **fresh/resume 明确分叉**：fresh 生成新 native id/session overlay；resume 必须绑定已冻结 continuation Ref 并验证 native digest/identity；二者均创建新 Core Execution。

## 9. 实施顺序与门禁

### Phase 0：冻结事实

- 增加 import graph 检查：`work_core` 不得导入 `resources.profile`、`launch`、Codex/Pi/Git/tmux 产品模块。
- 记录旧 profile/session DB schema 与一组真实 fixture；建立 old→new migration fixture。
- 固定 ProfileRef/CredentialSourceRef schema、secret redaction 和 digest canonicalization。

### Phase 1：拆出 Harness SDK value objects

- 将 `LaunchPlan` 从 `src/agent_box/launch.py` 抽到 plugin-owned/SDK module，保留旧 re-export。
- 将 revision repository、projection、credential locator validator 组合成无 Core old profile 依赖的 SDK。
- 把 `CodexProfileProvider` 改为直接实现 ResourceProvider；去除 `AgentBoxProfileResourceProvider` subclass。

### Phase 2：合并 Codex source

- 把 `agent-box-codex` 的 contract/App Server/native tmux/control/hook 迁入 harnesses。
- `HarnessesPlugin` 直接构造两个 Codex providers；`agent-box-codex` 只留 compatibility shim；安装时验证无重复 entry point/provider/control。
- 更新 tests/imports，建立 App Server 与 native CLI 独立 handles、projection 和 finish recovery tests。

### Phase 3：迁移旧 Profile UX

- 实现 old SQLite/directory importer。
- 将 ACS model/provider/MCP/skills/prompts/hooks/presets 的只读查询和 native writers 按 Harness driver 迁移。
- `preview-resources` profile selector 改为 manager selector，不再 import `agent_box.resources.profile.ProfileRepo`。
- CLI profile commands 改为 manager delegation，保留旧脚本语法。

### Phase 4：项目与 session ownership

- 迁移 Harness native project surfaces 与 execution overlay；Git worktree 仅由 agent-box-git 负责。
- 删除 `resources.sessions` 的新写入；provider start records/continuation scanner 负责恢复，旧 session rows 只读展示/导入。
- 将 Web profile mutation/preview 作为 manager API 的 Host facade，确保 mutation owner 和 idempotency 仍在 Web Host。

### Phase 5：清理与发布

- 删除旧 `resources.profile`/launch orchestration/legacy work CLI 的生产调用方。
- 发布一个包含 re-export 的 compatibility release，再发布移除旧实现的 major release。
- 每个 wheel 在 clean venv 中安装并执行 `plugins list`、entry-point discovery、profile create/resolve/launch-plan dry run。

## 10. 测试矩阵

| 领域 | 必测断言 |
|---|---|
| plugin discovery | 只出现一个 harnesses owner；Codex provider ids/control ids 无重复；Codex compatibility package 不会自动注册 |
| profile revision | create/update 产生 immutable r1/r2；expected revision 冲突；digest drift 拒绝；disabled profile 不出 selector |
| secret boundary | nested secret-like keys、auth/token/env/header、legacy auth/template 不进入 Ref/Binding/manifest/evidence/Web JSON；credential source 仅 locator |
| projection | 每 execution 独立目录；config/capability source digest 固定；cleanup 幂等；symlink target path safety；materialization failure fail closed |
| Codex App Server | initialize/thread start/turn start/completion；server request decline/error policy；process crash；observe active；只有 finish terminal；resume 传 exact thread id |
| Codex native CLI | fresh/resume argv；native config and hook projection；explicit attach；pane dead/active handling；scrollback/session-start evidence bounded |
| tmux PaneRef | exact socket/server/session/window/pane identity revalidation；idle-shell-only refusal；force-replace explicit；cleanup 不杀 user session |
| Pi reference | Pi native session JSONL digest/locate；new execution continuation；DEEPSEEK_API_KEY 不写入 config/refs/evidence；四并发 session ids 不串线 |
| old import | old profile rows/templates import once；name/preset/provider/MCP/skills/hooks mapping；auth/history/cache 不复制；bad schema warning/fail closed |
| CLI UX | list/create/use/apply/launch/resume script compatibility；项目选择保留；错误不绕过 Host/manager；无旧 DB direct writes |
| Web Host | profile list/detail/save revision/validate/projection preview；idempotent command；mutation ownership；selector choices 来自 Harness manager；clean wheel static packaging |
| Core boundary | import graph、contract-first registration、Core 数据不含 Harness native fields；Core finalization 不由 provider 以外代码写 terminal；resource observations evidence ceiling |
| packaging | 独立 clean venv 安装 `agent-box-harnesses`；无 `agent-box-codex` 仍可 import/runtime；兼容包安装时版本约束清晰；wheel 不含秘密模板 |

## 11. 应删除而不是迁移的旧代码

- 旧 `resources.profile` 中把 template 目录整棵复制到 profile、复制 auth/data/cache 的逻辑；新 Profile 必须由受控 base/capability projection 产生。
- 旧 `resources.sessions` 的 PID 作为 Harness/native session authority 的假设；PID 记录不能恢复 Codex thread 或 Pi JSONL continuation。
- `src/agent_box/launch.py` 中以 `build_launch_plan(name)` 自动读取旧 SQLite profile、bwrap bind `/`、旧 project mounts 并启动任意 agent type 的 orchestration；只抽取安全 value object/兼容入口。
- `work/` 固定 Plan→Execute→Review workflow 与其旧 session/provider wiring；不应迁入 Harness。
- Codex plugin 中并行注册 App Server + tmux 的 `CodexPlugin` 作为独立 entry-point owner（正式实现要保留两个 provider，但只有 harnesses owner）。
- 将 Agent-Box plugin distribution、agent-native plugin、MCP server、skill source 混为一个 Core resource type 的旧 apply 逻辑。

## 最终判定

四个问题的硬判定如下：

- `agent-box-codex`：**ownership 必须完全合并，source 应在过渡后完全合并；短期仅允许无发现的 compatibility shim**。
- Profile：**Harness-owned immutable revision + exact ProfileRef + locator-only CredentialSourceRef + execution-local overlay**；模型/provider、MCP、skills/plugins/hooks、instructions/permissions 都是 Harness native projection 或 versioned capability refs。
- fresh/resume/交互终端：**保留用户体验，改为 Host 选择 + frozen Binding + provider-owned lifecycle；resume 永远是新 Core Execution**。
- Core/Web/Resource 边界：**Core 不拥有 Harness/Profile/credential/native session；Web 不写 native config；tmux/Git/artifact 等由 ResourceProvider 解析和观察；Harness 只使用已冻结资源并负责自己的 runtime/projection/evidence ceiling**。

在 Phase 1–2 的 import graph、profile dual-authority、secret-boundary 和 clean-wheel 门禁通过前，不应删除旧 Profile/launch 文件，也不应宣称 `agent-box-harnesses` 已是独立官方 Harness SDK。
