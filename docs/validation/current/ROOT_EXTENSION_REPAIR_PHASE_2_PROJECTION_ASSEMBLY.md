# Root Extension Repair Phase 2 — ProjectionPlan / RuntimeBundle / Assembler 单一权威（2026-09-01）

实施范围：审计报告 P1-F2（assembler 对 `agent-box.workspace@1` 的字面量特判与 `/workspace` 硬编码、guest layout 权威三分）与 P1-F13（codex 双装配路径、coordinator 空计划 fallback、`hasattr(coordinator,"ledger")` 能力嗅探）。未进入 CredentialMaterializer 注册、Host Manifest、Transport Handler 实例化或 Web 重构（Phase 3+）。

约束遵守：Work Core ontology/schema/migrations/Binding schema/Dispatch/Freeze/Finalization 零修改；Core 不认识 Workspace/Profile/Skill/MCP；无真实模型请求；未读取/输出 credential；bwrap mount/network/symlink/secret 策略零放宽；无 git 写操作；dirty worktree 保留；真实 Codex 已验证链路的外层 bwrap + inner externalSandbox 行为未动（offline/fake 全量复验，见 Tests）。

---

# Verdict

**Phase 2 完成：guest layout 的唯一权威已移交各 Harness projector。Root shared assembler 现在是一个纯 generic 装配器——不搜索任何 Resource contract、不 import WorkspaceV1、不硬编码任何 guest 路径、不发明任何挂载目标；它只消费 projector 声明的 typed runtime sources，做 canonicalization、digest 验证、prepared source 注册、overlap/cwd fail-closed 校验，并构建唯一 MountPlan/RuntimeBundle。Codex fallback 装配路径、coordinator 空 MountPlan fallback、`hasattr(coordinator,"ledger")` 嗅探、workspace-relative argv 改写、重复 import 全部删除。六个执行入口（Codex×2/Claude/OpenCode/Hermes/Pi）全部走唯一 assembler。全部指定套件通过（web 仅剩与本轮无关的预存 node_modules 环境失败），12 个 wheel 的 clean venv 验证通过。**

数据流（目标形态，已实现）：

```
Frozen ResourceRefs (Core Binding, 未改动)
  → ResourceProvider typed resolve（未改动）
  → Harness Projector（决定 guest layout，声明 typed sources + cwd_token + projector_id）
  → Generic Runtime Assembler（校验/注册/组装，唯一）
  → Sandbox MountPlan（bwrap 验证并落实，未改动）
  → ProjectionReceipt（coordinator 内 PROJECTED 级，provider 观察载荷可见）
```

---

# Previous assembler leakage

本轮开工前以源码确认的泄漏点（全部消除）：

1. **契约特判**：`assembler.py:58-59` 字面量匹配 `"agent-box.workspace@1"`；`:71-76` 硬编码 `/workspace` 挂载与去重基准；`:71,84` 发明 `composition-workspace:`/`composition-source:` token；`:60-62` 要求 sandbox 提供 prepared-source 注册表（保留，已泛化）。
2. **guest layout 三分**：Root assembler 持 `/workspace`；Codex projector 持 `/runtime/home`、`/runtime/bin/codex`、`/runtime/hooks`；bwrap 持 `/runtime` 骨架与 `/runtime/home` secret 白名单——前两者的 workspace 部分此前靠 assembler 隐式补齐。
3. **Codex 双装配路径**：`composition_from_resolved_inputs(request, command=None)` 的 fallback factory（composition.py:142-159）带独立的 symlink 消毒分支（:148-154）与 `hasattr(i.value,"path")` 的 workspace 鸭子探测（:134），仅被一个测试使用。
4. **coordinator 空 MountPlan fallback**：`coordinator._default_bundle`（coordinator.py:38-42）——无 bundle_factory 时静默产出空计划。
5. **能力嗅探**：`compose()` 的 `if not hasattr(coordinator,"ledger")` 将 guest argv[0] 改写回宿主可执行名（composition.py:99-101），专为无 ledger 的测试 fake 服务。
6. **digest 实现三套**：codex `_source_digest`（对缺失源返回 "unverified:"，对 symlink 树宽松）、claude `_tree_digest`（json 序列化缺 separators，与 canonical 不一致——意味着 claude 目录源若真走 assembler 必然 drift）、以及 assembler `_content_digest`（canonical）。bwrap 的 `_tree_digest` 与 canonical 逐字节一致。
7. **重复 import**：codex composition.py:32-33。
8. **死参数**：codex/hermes/pi 的 `workspace_digest` 形参在函数体中从未使用。

---

# Canonical Projection model

按"优先演进已有、不平行造第二套 DTO"执行——**未新增聚合类型**：

- `RuntimeSourceDeclaration`（唯一 source declaration）演进两个字段：
  - `provenance: str = ""`——projector 声明的来源语义（如 "workspace"/"profile"/"executable"/"helper"），进入 receipt 与 MountPlan 的 provenance 槽位；
  - `authorized_scope: str = "execution"`——prepared source 注册的授权范围（此前由 assembler 擅自写死 "execution"，现在由声明决定）。
  - `kind` 保持纯描述性，全仓无任何以 kind 为分支键的代码（grep 锁死）。
- `HarnessCommandSpec` 演进 `projector_id: str = ""`——声明方身份，仅用于 receipt，Root 不作分支键。
- `command.runtime_sources` + `cwd_token` 即 ProjectionPlan 的输入；`MountPlan` 是唯一 plan；`MountPlan.digest` 与 `RuntimeBundle.bundle_digest` 是唯一两级 digest。**没有第二套 plan digest**（新增 `RuntimeProjectionPlan` 聚合只会复制 runtime_sources，被明确否决）。
- secret mounts 继续走 typed `PreparedSecretMount`（独立参数合并进 MountPlan，未改动）。
- host source path 不进入 Core、Binding、公开 Evidence：与此前相同，argv/env/公开记录只含 guest 槽位（redaction 测试保持通过）。
- 新增唯一 source-integrity 实现：`runtime_composition.protocol.content_digest(path)`（strict：缺失/symlink/树内 symlink/special file 一律 ValueError；file=sha256；dir=canonical sorted tree rows）+ 共享声明辅助 `declare_source(kind, source_path, guest_target, *, access, provenance, authorized_scope)`——辅助函数只处理通用路径/digest/声明，不含任何契约、Provider 或 guest 路径知识。

---

# Harness projector ownership

每个 projector 显式声明自己的资源布局（guest target 全部是 projector 的决定，Root 无一认知）：

| Projector | 声明（kind → guest, access） | cwd | projector_id |
|---|---|---|---|
| Codex `command_from_plan` | workspace → /workspace rw；profile-home → /runtime/home rw；executable/bundle 成员 → /runtime/bin/codex、/runtime/bin/codex-code-mode-host、/runtime/codex-path、/runtime/codex-resources ro；helper → /runtime/hooks ro | /workspace | `codex` |
| Claude `command_from_plan` | workspace → /workspace rw；profile-home → /runtime/home rw；executable → /runtime/bin/claude ro；helper → /runtime/hooks ro | /workspace | `claude-code` |
| OpenCode provider | workspace → /workspace rw；profile → /runtime/home rw；executable → /runtime/bin/opencode ro；helper → /runtime/helpers/helper-target-slot.json ro | /workspace | `opencode` |
| Hermes `command_from_plan` | workspace → /workspace rw；profile-home → /runtime/home rw；executable（staged 副本）→ /runtime/bin ro；helper → /runtime/helpers ro | /workspace | `hermes` |
| Pi `PiProjection.command` | workspace → /workspace rw；pi-profile-home → /runtime/home rw；pi-executable → /runtime/bin/pi ro；helper/instructions/mcp → /runtime/hooks、/runtime/home/*.md、/runtime/home/mcp.json ro | /workspace | `pi` |

- Codex 的 workspace 声明取自 `CodexLaunchSpec.cwd = workspace.path`（launch.py 既有事实——projector 本来就持有该路径）；Claude 取自 `ClaudeLaunchSpec.cwd`；OpenCode/Pi 取自 resolved `WorkspaceV1.path`。
- 五个 projector 全部改用共享 `declare_source`/`content_digest`；本地 digest 实现（claude `_tree_digest`、opencode `_tree_digest`+`source_digest`、hermes/pi `_digest`）删除。修复了一个真实潜伏 bug：claude 的树 digest 序列化与 canonical 不一致，旧实现下其目录源一旦真正走 assembler 必然 drift 拒绝。
- Pi 的 instructions/mcp 声明是 profile-home 的**子目标**——新的 assembler overlap 校验（与 bwrap 的 parent/child 校验一致）会在声明时 fail closed。这是诚实收紧：旧路径下这些嵌套挂载本来就会在 bwrap wrap 阶段被拒；pi 后续应把此类文件折叠进 profile-home 投影（见 Remaining limitations）。

---

# Generic assembler result

`assemble_runtime_composition(request, command, *, secret_mounts=())` 现在的行为（全部在 assemble 阶段 fail closed，早于任何 attempt）：

1. 消费 resolved inputs 中的 RuntimeHostV1/SandboxV1/TerminalSessionV1 三个 typed port（1..1、isinstance 缺一不可）——对其它 contract 一无所知；
2. 要求 resolved Sandbox port 暴露 prepared-source 注册表（通用能力，非 provider 判断）；
3. 逐条 canonicalize 声明（`guest_path` 校验 guest target）、拒绝 duplicate/parent-child 重叠目标；
4. 用唯一 `content_digest` 重验每条 source（drift → 拒绝；symlink/special → 拒绝）；
5. 以 `projection:` token（含 kind/provenance/path/digest 的 opaque digest）注册 prepared source，authorized_scope 来自声明；
6. 通用 cwd containment 校验：`cwd_token` 必须落在已声明 guest 目标内（不假设 /workspace）；
7. 构建唯一 `MountPlan`（含 typed secret mounts）并生成稳定 plan/bundle digest；
8. `bundle_factory` 仅按 attempt 组装 `RuntimeBundle(resolved_host.ref, plan, digest)`——同一 attempt 的 replay 复用同一 plan。

沙箱侧二次防线保持不变：bwrap 在 `wrap()` 内做 read-back digest 验证、symlink/特殊文件拒绝、cwd containment、secret 父/子校验——装配期检查是更早的 fail-closed 闸门，不是唯一一道。

---

# Guest layout authority

- `/workspace` 现在由**每个 Harness projector 显式声明**（`declare_source("workspace", <resolved workspace path>, "/workspace", access="rw", provenance="workspace")`），Root assembler 与 Sandbox 均无此知识。
- 反向证明（测试 `test_assembler_mounts_any_declared_tree_without_git_plugin`）：一个 fake harness 把同一资源声明到 `/project` 且以 `/project` 为 cwd，Root 零修改即可组装运行；该请求里**不存在** workspace contract 输入、也不存在 Git 插件。
- `/runtime/home` 等其余 guest 路径本就是各 projector 的声明；bwrap 的 `/runtime` 骨架目录与 secret 父目录白名单保持为 Sandbox 自身的策略（generic、无 harness 分支）。

---

# Source integrity

- 唯一正式实现：`content_digest`（Root runtime_composition，经 `from .protocol import *` 导出）。语义：缺失/符号链接源 → 拒绝；普通文件 → 内容 sha256；目录 → canonical sorted tree listing；树内 symlink/special file → 拒绝；声明后、装配前源发生变化 → 装配期重验拒绝。
- 各 projector 的本地 digest 实现删除；bwrap 保留自己的 read-back 实现（与 canonical 同构，模板 digest 未动）。
- symlink fail-closed 语义：需要 sanitized snapshot 的场景由 projector 在 assembler 之前生成 execution-local prepared source（例如 Hermes 已有的 staged executable 副本模式）；assembler 从不复制或改写 source。Codex fallback 里的 profile symlink 消毒分支随 fallback 一并删除——生产路径此前就走严格 assembler，该分支只服务于一个测试。
- 临时 source 不进 Core Ref：声明与 token 都是 dispatch-local，Ref/Biding 未动。

---

# Removed fallback paths

- Codex `composition_from_resolved_inputs(request, command)`：command 必选，函数体退化为"组装 secret mounts + 调唯一 assembler"；fallback bundle_factory、`_resolve_frozen_ports`、`_workspace_digest`、`_source_digest`、重复 import、死参 `workspace_digest` 全删。
- coordinator：`bundle_factory` 改为必选参数，`_default_bundle`（空 MountPlan fallback）删除。
- `compose()` 的 `hasattr(coordinator,"ledger")` 分支删除——guest argv 原样跨界；`test_codex_provider` 的 fake coordinator 断言更新为期望 guest argv（`"/runtime/bin/codex", ...`），并改为显式提供真实可执行文件供声明（`test_codex_launch_has_no_mcp_feature_hack` 同步）。
- 仅测试使用的第二装配路径：formal dispatch vertical 的 fake harness 重写为"声明 + 唯一 assembler"；claude native vertical 重写为经 `composition_from_resolved_inputs`（= assembler）与真实 bwrap 直跑，手搓 MountPlan/coordinator 删除。
- 全部由源码扫描测试锁死：`test_codex_composition_has_no_fallback_bundle_factory`、`test_no_ledger_capability_sniffing_in_formal_source`、assembler 知识面扫描。

---

# Five Harness result

六个执行入口（Codex App Server、Codex interactive、Claude Code、OpenCode、Hermes、Pi）：

- 全部经唯一 Root assembler（Codex provider 的 fake-coordinator 单测除外——它们显式注入 coordinator，属 provider 单元测试；真实链路与全部 offline vertical 均走 assembler）；
- 全部由自己的 projector 声明 workspace/profile/executable/helper 布局；
- 无任何 harness 依赖 assembler 的隐式 workspace（OpenCode 此前依赖，已补声明）；
- 零对 bwrap/runtime-local/tmux 的具体 import（grep 维持零命中）；
- 无共享基类；仅共享 `declare_source`/`content_digest` 通用辅助。

offline/fake 协议复验真实 Codex 链路语义（不跑真实模型）：guest cwd 仍为 /workspace（`test_codex_provider` thread/start cwd 断言）、CODEX_HOME 仍为 /runtime/home（composition adapter 测试）、auth exact child SecretMount 仍只读（bwrap secret 测试）、executable/helper guest 路径保持、outer bwrap 仍唯一 filesystem isolation authority、inner `externalSandbox` + `sandboxPolicy.networkAccess` 断言原样通过。

---

# Projection receipt/evidence

- Coordinator 在每个 attempt 记录 bounded receipt（`RuntimeCompositionCoordinator.projection_receipt(attempt_key)`）：`projector_id`、`sandbox_provider`、`plan_digest`、`bundle_digest`、`secret_mounts` 数、逐 source 的 {kind, provenance, guest_target, access, expected_digest, authorized_scope}、`status: "PROJECTED"`、`warnings: ()`。
- Codex 两个 provider 把 receipt 捕获进 handle 并放入观察载荷 diagnostics（`projection` 键）——真实已验证链路可见；其余 harness 的 receipt 经 coordinator API 可用。
- Evidence 阶梯未动：receipt 只声称 PROJECTED（计划已验证、prepared sources 已注册、wrap 前），不声称 LOADED/CONSUMED；mount 成功/文件存在/provider 自报未被提升。Core Observation/ResourceObservation schema 零改动（receipt 存于 extensions 层内存 + provider 载荷）。

---

# Core changes, if any

- **Work Core：零改动**。ontology/models、Binding schema、Dispatch/Freeze/Finalization、migrations、repository（Phase 1 已清重复 list_works）全部未触碰。
- 改动全部位于 extensions 层与插件：`runtime_composition/protocol.py`（RuntimeSourceDeclaration/HarnessCommandSpec 最小演进 + `content_digest`/`declare_source`）、`runtime_composition/assembler.py`（重写为 generic）、`runtime_composition/coordinator.py`（必选 bundle_factory、删 fallback、receipt）、六个 harness 的 projector/composition 及其测试。

---

# Tests

新增/更新：
- 新增 `tests/test_projection_assembly.py`（9 个）：assembler 知识面扫描（无 workspace 契约字符串、无 WorkspaceV1、无 "/workspace"、无 runtime/home）；无 Git 插件/无 workspace 输入下组装任意声明树到 /project 并跑完 start+receipt；codex projector 显式声明 workspace；cwd 越界 fail closed；duplicate/parent-child 重叠 fail closed；digest drift fail closed；symlink/fifo/声明后变链 fail closed（含 fifo stat 断言）；codex 无 fallback factory 源码扫描；全正式源码无 ledger 嗅探。
- 更新：`tests/test_bwrap_formal_dispatch_vertical.py`（fake harness 改走唯一 assembler，删除手搓 MountPlan/coordinator 与 codex fallback 调用）；`test_sandbox_contract_authority.py` unwrap 测试按新 cwd 规则补声明；claude 两个测试（声明断言 + native vertical 改走 assembler/bwrap）；codex provider/adapter 测试 fixture（真实可执行文件、guest argv 断言、projector_id 断言）。
- 既有测试继续证明：wrap/allocate 零 target、run 恰一次（composition vertical + formal vertical 的 `native_calls==1`/SentinelTransport count）、replay 幂等与 response-loss 不重放（vertical 的 StartAmbiguous 断言）、进程退出不自动 terminal（codex provider 显式 finish 测试）、explicit Finish/finalization 语义（formal vertical `apply_finalization`）。

最终结果：

| 套件 | 结果 |
|---|---|
| `tests/`（含 formal bwrap dispatch vertical、composition verticals、native bwrap/tmux、9 个新测试） | **117 passed** |
| harnesses / claude / hermes / opencode / pi | **34 / 3 / 1 / 2 / 1 passed** |
| sandbox-bwrap / runtime-local / terminal-session | **12 / 6 / 3 passed** |
| git + artifacts | **6 passed** |
| web | 16 passed / 1 skipped / **1 failed（预存环境：frontend/node_modules，与本轮无关）** |
| `compileall`（src + plugins/*/src + tests） | OK |
| `git diff --check` | OK |

环境环境卫生问题按预案处理：tmux 残留会话（运行前后 `kill-server`，e2e 通过）；未删除任何用户数据。过程中发现并精确移除一个**陈旧构建中间产物**（根 `build/lib/.../sandbox/protocol.py`，删除文件后由 setuptools 复用的 build/lib 残留，未跟踪可再生文件）——它曾污染 wheel，已在重建后用 zipfile 断言锁死（wheel 中无该文件）。

---

# Clean-wheel result

构建（`python -m build --wheel --no-isolation` → `/tmp/abx-wheels2/`）：Root、runtime-local、sandbox-bwrap、terminal-session、harnesses、claude、opencode、hermes、pi、git、artifacts、web 共 **12 个 wheel 全部成功**。

Clean venv（`python3 -m venv /tmp/abx-phase2-venv`）：

- Root-only install：`import agent_box.work_core.registry` 零 extension 加载；shared contract catalog 就绪（sandbox → SandboxV1）；doctor exit 0。
- 全部 11 个插件 wheel 安装后：entry point 发现 **10 个插件 READY、0 FAILED**（web 为 Host 无插件 entry）；五个 Harness execution providers（codex-app-server、codex-interactive、claude-code-execution、opencode-direct、hermes-execution、pi）全部 READY；`agent-box.sandbox@1` 仍恰好一个 Python 类型；shim 无 legacy 符号；site-packages 全树 `class SandboxTemplateV1` 零命中。
- **exactly one assembler path**：site-packages 全树仅 `agent_box/extensions/runtime_composition/assembler.py` 定义 `assemble_runtime_composition`；安装后的 codex composition 源码无 `bundle_factory`、无 capability 嗅探。
- doctor（全部插件 + web wheel）：plugin_registry=true、execution_providers=true、web_plugin/frontend_static=true、exit 0。
- Root wheel：无任何 provider 实现（zipfile 断言），无陈旧 sandbox/protocol.py。

---

# Remaining limitations

- **Pi 嵌套声明**：instructions/mcp 作为 profile-home 子目标的声明现在会在装配期 fail closed（与 bwrap 现有 parent/child 拒绝一致）。Pi 应在后续把这类文件折叠进 execution-local profile 投影后再声明为单一 home 源。
- **装配期注册语义**：prepared source 现在在 assemble 时注册（此前在 start 内）。同一 attempt 的 replay 复用同一 token/路径；跨 attempt 的 token 确定性重复注册为幂等覆盖。若未来出现长生命周期的 sandbox provider 实例，需要 companion cleanup 语义（sandbox 已有 `cleanup` 撤销 secret/source 的租约机制）。
- **receipt 覆盖面**：仅 Codex 两个 provider 将 receipt 接入观察载荷；其余 harness 经 coordinator API 可得。Phase 3 的 Extension Catalog 可统一 receipt 的宿主可见性。
- 既有 P1/P2 未动项（Phase 3+）：CredentialMaterializer 注册通道、transport handler 全局表、host manifest、web 前端硬编码组合、harness 表面统一、死 schema、`test_static` 的 node_modules 断言与 tmux e2e 会话清理两处预存测试债。
- entry point key 命名风格不一致（`runtime-local` vs `sandbox_bwrap`，Phase 1 已记录）仍未修。

---

# READY / NOT READY FOR PHASE 3 EXTENSION CATALOG

**READY FOR PHASE 3 EXTENSION CATALOG。**

依据：guest layout 权威已单边归属 projector，Root assembler 契约无知且唯一（源码扫描 + clean venv 双重锁死）；六入口全部走唯一装配路径，fallback/嗅探/双路径清零；source integrity 单实现 fail-closed；真实 Codex 链路语义经 offline/fake 全量复验未变；Work Core 零改动；全部指定套件与 12-wheel clean venv 验证通过。Phase 3（Extension Catalog / capability 发现）可在此基础上开工，其所需的能力声明面（descriptor 能力字段 + projector_id + receipt）已就位。
