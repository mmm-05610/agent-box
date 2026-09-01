# Root Extension Repair Phase 1 — Sandbox Contract Authority（2026-09-01）

实施范围：审计报告 `ROOT_AND_PLUGIN_ARCHITECTURE_AUDIT_2026-09-01.md` 中 P0（F1 sandbox 一 id 双类型）、P2-F7（Registry 反向 import）以及 shared runtime contract authority、两个直接 bug。未进入 assembler/ProjectionPlan 重构、CredentialMaterializer 注册通道、transport handler 实例化、Host manifest、Resource Routing 或 Web 重构（Phase 2+）。

约束遵守：Work Core ontology/schema/migration/Dispatch/Freeze/Finalization/terminal 语义零修改；未执行真实模型请求；未读取/输出 credential；无 git stage/commit/push/reset/checkout；dirty worktree 保留；无兼容性第二契约类型；未恢复 `Sandbox.start()` 路径。

---

# Verdict

**Phase 1 完成：`agent-box.sandbox@1` 现在全仓只有一个 Python 类型（canonical `SandboxV1`），由 Root Extension bootstrap 统一注册一次；`work_core.registry` 不再 import 任何 `agent_box.extensions` 模块；正式路径上的全部 `getattr(sandbox, "port", sandbox)` 鸭子类型桥接（assembler、codex×2、hermes、pi）与 `SandboxTemplateV1` 子类伪装已删除；两个直接 bug 已修复并有回归测试。全部指定测试套件通过（web 套件存在 2 个与本次改动无关的预存失败，见 Tests 一节），clean venv wheel 验证通过。**

核心变更清单：

| 文件 | 变更 |
|---|---|
| `src/agent_box/extensions/runtime_composition/protocol.py` | canonical SandboxV1（不变）；新增自旧模块原样迁入的 sandbox 支持类型（SandboxError 族、SandboxRequirements、guest_path、digest_json 别名） |
| `src/agent_box/extensions/sandbox/protocol.py` | **删除**（旧 SandboxTemplateV1/ResolvedSandbox.start/SandboxedProcess/旧 Mount 族消失） |
| `src/agent_box/extensions/sandbox/__init__.py` | 改为兼容 shim：仅再导出支持类型 + `CONTRACT_ID`（指向 canonical `SANDBOX_CONTRACT_ID`） |
| `src/agent_box/work_core/registry.py` | 删除 `__init__` 内的 `from ..extensions.sandbox.protocol import SandboxTemplateV1` 延迟注册；新增 Root-owned shared contract 机制（`register_root_shared_contract` / `root_shared_contract_ids` / 注册权威区分） |
| `src/agent_box/extensions/bootstrap.py` | `SHARED_RUNTIME_CONTRACTS = (RuntimeHostV1, SandboxV1, TerminalSessionV1)`；`register_shared_runtime_contracts()`；`build_extension_registry()` 统一注册一次 |
| `src/agent_box/extensions/runtime_composition/assembler.py` | sandbox isinstance 校验 + 直接使用 canonical 值；`ResolvedComposition` 统一解包 `.port` |
| `plugins/…/codex/composition.py` | 删除 2 处桥接；`_resolve_frozen_ports`/`_prepare_credential_mount` 使用 canonical 类型 |
| `plugins/…/harness-hermes/composition.py`、`plugins/…/pi/projection.py` | 各删除 1 处桥接，补 canonical isinstance |
| `plugins/…/sandbox-bwrap/provider.py` | `resolve()` 返回 canonical `SandboxV1(ref, port)`；`ResolvedBwrapSandbox` 去掉 SandboxTemplateV1 基类、退化为纯 port 对象；import 全部改 canonical 路径 |
| `plugins/…/sandbox-bwrap/plugin.py`、`plugins/…/runtime-local/plugin.py`、`plugins/…/terminal-session/plugin.py` | `contracts=()`——不再重复宣称公共 contract authority |
| `plugins/…/codex/app_server/provider.py` | `diagnostics()` 补 `return limits` |
| `src/agent_box/work_core/repository.py` | 删除重复的第二个 `list_works` |

---

# Canonical sandbox contract

- 唯一类型：`agent_box.extensions.runtime_composition.protocol.SandboxV1`（frozen dataclass，`ref: SandboxRef` + `port: object (compare=False)`，`__getattr__` 委托 port——与 `RuntimeHostV1`/`TerminalSessionV1` 同一形态）。
- 语义：exact `SandboxRef` + 已解析的 Sandbox port；不表示 runtime instance、不拥有进程、不提供 `start()`；真实执行仍只有 `Sandbox.wrap()`；RuntimeHost/TerminalSession 启动路径未动。
- `SandboxRef(provider, native_id, policy_digest, affinity, schema_version, network_mode)` 未改动；bwrap 的 Core Ref identity（`RefType.ARTIFACT, "bwrap-sandbox", template_id, metadata{revision,digest,schema_version,affinity,network_mode}`）未改动。
- 旧 `SandboxTemplateV1` 的 template 元数据（template_id/revision/template_digest/capabilities 字符串集）保留为 port 对象上的普通属性，Registry 值不再继承任何 template 字段。
- 支持类型迁移（原样搬迁，digest 逐字节稳定）：`SandboxError/SandboxUnsupported/SandboxUnavailable/SandboxAmbiguous/ProjectionRejected`、`SandboxRequirements`（含 `_CAPABILITY` 正则）、`guest_path`、`digest_json`（= `digest` 的精确别名；bwrap 模板 digest 输入输出完全不变，测试 `test_bwrap_template_digest_is_stable_across_retired_module` 用独立重实现锁死该值）。
- 未迁移（无任何使用者，直接删除）：旧 `Mount`/`MountPlan`/`PreparedMountSource`/`SandboxEntrypoint`/`SandboxObservation`/`SandboxCleanupReceipt`/`SandboxedProcess`/`ResolvedSandbox`/`SandboxCapabilities`/旧 `CapabilityStatus`。新 `CapabilityStatus`/`CapabilitySet`（runtime_composition 原有）不受影响。

---

# Shared runtime contract registration

- **谁注册**：`agent_box.extensions.bootstrap.register_shared_runtime_contracts(registry)`，由 `build_extension_registry()` 在加载任何插件之前调用，恰好一次。`SHARED_RUNTIME_CONTRACTS = (RuntimeHostV1, SandboxV1, TerminalSessionV1)`。
- **Root-owned vs plugin-owned 的区分（非"同类型即忽略"）**：
  - `ExtensionRegistry.register_root_shared_contract(contract)`：仅 Root bootstrap 使用；把 id 记入 `_root_shared_contract_ids`；同 id 不同类型直接 raise（`Root shared contract id collision`）。
  - `register_contract()`（插件通道）：id 在 Root-owned 集合内时，只容忍**完全相同的 canonical 类型**（多个同类 Provider 共存），不同类型 raise（`contract id is Root-owned shared runtime authority`）；id 不在集合内时维持原 fail-closed（`resource contract already registered`），同类型也不例外。
  - envelope 四契约（workspace/prompt-fragment/profile/credential）不在 Root-owned 集合内，插件重复注册照旧 fail closed。
- **插件收敛**：runtime-local（曾注册 RuntimeHostV1）、terminal-session（曾注册 TerminalSessionV1）、bwrap（本就 `contracts=()`）现在都只注册 provider/selector/host_control。插件侧不再有公共 contract 的第二个注册权威。
- Root-only bootstrap 行为有专门测试（`test_root_only_bootstrap_registers_shared_contracts_without_plugins`：无插件时三个 shared 契约在目录中、`root_shared_contract_ids()` 恰为三者、`report.ready == ()`）。

---

# Registry dependency direction

- `work_core/registry.py` 现在只依赖 `resource_contracts`（CONTRACT_TYPES 目录）与 stdlib；`agent_box.extensions` 的 import 在该模块中为零。
- 测试 `test_work_core_registry_does_not_import_extensions` 用子进程新鲜 import `agent_box.work_core.registry` 并断言 `sys.modules` 中不存在任何 `agent_box.extensions.*`。
- 层图恢复单向：`work_core ← extensions ← plugins`；bootstrap 是 extensions 层内部对 shared 契约的唯一注册点。

---

# Removed legacy sandbox API

- `extensions/sandbox/protocol.py` 文件删除；`agent_box.extensions.sandbox` 保留为 shim（再导出支持类型与 `CONTRACT_ID`）。
- `class SandboxTemplateV1`、`SandboxTemplate =` 别名、`class ResolvedSandbox`、`SandboxedProcess`、`ResolvedSandbox.start()`：正式源码（`src/agent_box/**` 与 `plugins/*/src/**`）零命中，由两个源码扫描测试锁死（`test_formal_source_defines_no_second_sandbox_contract_type`、`test_formal_source_has_no_legacy_resolved_sandbox_start_protocol`）。
- shim 有测试（`test_legacy_sandbox_shim_points_at_canonical_types`）：`CONTRACT_ID == SandboxV1.contract_id`、各支持类型与 canonical 模块同一对象、且 `SandboxTemplateV1/SandboxTemplate/ResolvedSandbox/SandboxedProcess` 不可再导入。
- 正式代码已全部改用 canonical import 路径（bwrap provider/plugin、formal vertical 测试）；shim 仅为一个周期的第三方兼容面。

---

# bwrap result

- `BwrapSandboxProvider.resolve()` 返回 canonical `SandboxV1(resolved.ref, ResolvedBwrapSandbox(...))`；`ResolvedBwrapSandbox` 是普通 port 对象（provider/ref/template_id/revision/template_digest/capabilities 字符串集），不再是契约类型的子类、无 `contract_id` 属性。
- 保持不变：selector/ref 的 revision、digest、network_mode、affinity 生成逻辑；`bwrap-offline`/`bwrap-cloud-harness`/`safe-default` 模板身份与 digest（独立重实现测试锁死）；native probe（`/usr/bin/true` + 生产同款只读系统根、`--proc /proc`）；SecretMount 全链路（scope 校验、attempt 租约、路径不泄漏、`/runtime/home` 父目录白名单）；路径/symlink/network/credential 策略零放宽（`test_mount_path_scope_symlink_and_digest_guards` 等 12 个 bwrap 测试全绿）。
- dispatch 真实校验：`services._resolve_inputs` 的 isinstance 现在接受 bwrap 返回值（`test_canonical_sandbox_value_passes_real_dispatch_validation` 走真实 `ExecutionService.dispatch_execution`）。
- 附带发现（记录，不在本轮修）：四个插件 entry point key 命名风格不一致（`runtime-local` 连字符 vs `sandbox_bwrap`/`terminal_session`/`harnesses` 下划线），P3 元数据问题。

---

# Codex diagnostics bug

- 修复：`CodexAppServerClient.diagnostics()`（`plugins/agent-box-harnesses/src/agent_box_harnesses/codex/app_server/provider.py`）构造 `limits` 后补充 `return limits`。
- 返回内容为既有 bounded 缓冲（各 16–64 条截尾 + process_exit），无新增字段、无敏感内容（沿用既有 `_redact` 面）。
- 回归测试：`plugins/agent-box-harnesses/tests/test_codex_diagnostics.py`（断言返回 dict、键集合精确匹配、turn 状态正确入列）。调用点（同文件 `observe` 的 lifecycle 诊断）此前拿到 `None`，现在拿到完整 dict。

---

# Repository duplicate bug

- 修复：`work_core/repository.py` 删除第二个逐字相同的 `list_works` 定义（原 :142-144 静默遮蔽 :138）。
- 行为不变；AST 回归测试 `test_repository_defines_list_works_exactly_once` 锁死单一定义；现有 `test_work_core_repository.py` 全绿。

---

# Core changes, if any

- `work_core/registry.py`：① 删除对 extensions 的延迟 import 与 sandbox 预注册（行为变化：**裸 `ExtensionRegistry()` 不再自带 sandbox 契约**——bootstrapped registry 才有，这是本修复的语义核心）；② 新增 Root-owned shared contract API 与容忍规则；③ `register_components` 原子 staging 拷贝新增的 `_root_shared_contract_ids`。
- `work_core/repository.py`：去重 `list_works`。
- **未改动**：ontology/models、Dispatch/Freeze/Finalization 管线、SQL/migrations、projection/terminal 语义、Ref identity、幂等键语义。

---

# Tests

新增（17 个）：
- `tests/test_sandbox_contract_authority.py`（15 个）：唯一契约类型；正式源码无第二类型定义；无 legacy start 协议；work_core registry 零 extensions import（子进程）；Root-only bootstrap；shared 契约恰好注册一次 + impostor 类型双向拒绝；两个 sandbox provider 共享 Root 契约不失败；plugin-owned duplicate 仍 fail closed（registry 直注 + loader 双插件两路验证）；bwrap resolve 返回 canonical 值；模板 digest 稳定；canonical 值通过真实 Dispatch isinstance 校验；assembler 拒绝非 canonical 形状；assembler 精确解包 canonical port；shim 指向 canonical；repository 单一 `list_works`。
- `plugins/agent-box-sandbox-bwrap/tests/test_bwrap.py` +1：canonical registry value。
- `plugins/agent-box-harnesses/tests/test_codex_diagnostics.py` +1：diagnostics 返回 dict。

既有测试更新（装配点改为显式 bootstrap，共 7 处）：`tests/test_bwrap_formal_dispatch_vertical.py`（并改用 canonical import）；`plugins/agent-box-web/tests/` 的 quick_launch_e2e、harness_profile_e2e、real_tmux_codex_e2e、harness_host_integration、codex_subscription_rehearsal；`plugins/agent-box-harness-opencode/tests/test_opencode_p0.py`（删除 `SandboxV1(sandbox.ref, sandbox)` 双重包装——旧写法在真实 dispatch 下本会 ContractViolation，正是审计指出的"测试与 dispatch 使用不同值类型"）。

最终结果（当前环境，PYTHONPATH 注入插件 src）：

| 套件 | 结果 |
|---|---|
| `tests/`（含 formal bwrap dispatch vertical、composition verticals、native bwrap/tmux、15 个新 authority 测试） | **108 passed** |
| sandbox-bwrap | **13 passed** |
| runtime-local | **6 passed** |
| terminal-session | **3 passed** |
| harnesses（含新 diagnostics 回归） | **35 passed** |
| harness-claude / hermes / opencode / pi（offline vertical 中全部涉及 sandbox 的测试） | **3 / 1 / 2 / 1 passed** |
| git + artifacts | **6 passed** |
| web | 16 passed / 1 skipped / **1 failed（预存环境问题）** |
| `compileall`（src + plugins/*/src + tests） | OK |
| `git diff --check` | OK |

web 套件的 1 个失败为**预存环境问题，与本轮改动无关**：`test_static.py::test_package_static_tree_is_complete_and_vite_is_the_sync_owner` 断言 `frontend/node_modules` 不存在，但本 worktree 存在前次 `npm install` 留下的未跟踪 `node_modules/`（该测试文件自 `dd34b84` 后未改动，本轮零触碰 web 前端）。
另记录一个**预存测试卫生债**（同与本轮无关）：`test_real_tmux_codex_e2e` 的 `finally` 不清理 tmux 会话，而会话名为内容 digest（跨运行同名），上一次运行泄漏的 `abx-*` 会话会让下一次运行以 `duplicate session` 失败；清理 tmux server 后该测试通过（已在干净状态下复验）。建议后续为该测试补 `kill-server` 清理。

---

# Clean-wheel result

构建（`python -m build --wheel --no-isolation` → `/tmp/abx-wheels/`）：`agent_box_cli-2.0.0a1`、`agent_box_sandbox_bwrap-2.0.0a1`、`agent_box_runtime_local-2.0.0a1`、`agent_box_terminal_session-2.0.0a1`、`agent_box_harnesses-2.0.0a1` 全部成功。

Clean venv（`python3 -m venv /tmp/abx-phase1-venv`）验证：

- **Root-only install**：`import agent_box.work_core.registry` 不加载任何 extension 模块；`build_extension_registry()` 无插件时 shared 契约目录就绪（sandbox → `SandboxV1`，runtime-host/terminal-session 同理）；`agent-box doctor` exit 0。
- **Root wheel 内容**：无任何 bwrap 实现（zipfile 清单断言）；`resource_contracts/credential_v1.py` 在场（旧 dist 陈旧 wheel 的缺件不再复现——本次为全新构建）。
- **Preview 组合（+4 插件 wheel）**：entry point 发现恰好 4 个 READY、0 FAILED；`agent-box.sandbox@1` 在注册表中恰好一个 Python 类型（`SandboxV1`）；RuntimeHost/Sandbox/TerminalSession 的 provider authority（runtime-host-local / bwrap-sandbox / direct-stdio / tmux）全部可解析；bwrap inspect（descriptor + probe = `available/ok` + resolve → canonical SandboxV1）正常；execution providers 含 codex-app-server/codex-interactive；`agent-box doctor --json`：plugin_registry=true、execution_providers=true、exit 0。

---

# Compatibility

- 公共 contract id 全部保持：`agent-box.sandbox@1` / `agent-box.runtime-host@1` / `agent-box.terminal-session@1` / 四个 envelope id；SandboxRef/TerminalSessionRef/RuntimeHostRef schema 不变；Ref identity（Core Ref 与 composition Ref）不变；frozen Binding 数据、数据库、持久化格式零改动；插件 entry point 不变。
- `agent_box.extensions.sandbox` 保留一个周期的再导出 shim（支持类型 + CONTRACT_ID）；旧契约类型名 `SandboxTemplateV1` 刻意**不**提供别名（避免诱导对 frozen dataclass 的子类化，符合"不增加兼容性第二契约类型"）。
- 行为差异（有意、已记录）：① 裸 `ExtensionRegistry()` 不再含 shared runtime 契约——必须经 `build_extension_registry()`/`register_shared_runtime_contracts()`（官方代码与测试已全部收敛）；② provider 插件的 `contracts=()` 变化不影响其对外能力（supported_contract_ids 经 bootstrap 注册后校验通过）；③ 第三方 sandbox provider 若曾子类化 SandboxTemplateV1 需改返回 `SandboxV1`（当前无已知第三方）。

---

# Remaining architecture blockers

进入 Phase 2（ProjectionPlan / assembler 去 workspace 特判）之前，Phase 1 范围内的阻塞已清零。仍开放的审计发现（按审计编号）：

- **P1-F2**：assembler 对 `agent-box.workspace@1` 的字面量特判与 `/workspace` 硬编码、guest layout 权威三分（`/runtime/home` 跨插件字符串约定链）——**Phase 2 的主体工作**（本轮按约束未触碰；assembler 本轮仅移除 sandbox 形状桥接）。
- **P1-F13**：codex fallback bundle_factory 与共享 assembler 双路径（symlink 语义不一致）、`hasattr(coordinator, "ledger")` 能力嗅探——建议随 Phase 2 一并收敛。
- **P1-F3/F4/F5/F6**：CredentialMaterializer 注册通道、transport handler 全局表与 import-order、host 扩展点 manifest、web 前端硬编码组合——Phase 3+。
- **P2/P3**：execution_id/dispatch_id 渗透、profile 契约裁决、死 schema、harness 表面统一、异常字符串匹配协议、entry point 命名不一致（本轮新记录）等。
- 预存测试债（建议随手修）：tmux e2e 的会话清理；`test_static` 对 node_modules 的断言在含 npm 产物的 worktree 中会失败。

---

# READY / NOT READY FOR PHASE 2 PROJECTION ASSEMBLY

**READY FOR PHASE 2 PROJECTION ASSEMBLY。**

依据：契约 authority 唯一且由 Root bootstrap 持有（Routing/组合的解析前提已成立）；dispatch isinstance 校验与组合协议使用同一 canonical 值，三处鸭子类型桥接全部消失；Registry 层图单向；bwrap 行为/digest/策略逐项保持并有回归锁；全部指定套件 + clean venv wheel 验证通过（两个 web 失败均为与本轮无关的预存问题，已定位并记录）。Phase 2 可在"契约驱动 Binding 输入声明 guest 路径 + 单一装配权威"的方向上开工，且不得改变 Work Core 语义。
