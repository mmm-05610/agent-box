# Root Extension Repair Phase 4 — Explicit Transport Registration（2026-09-01）

实施范围：消除 runtime composition 最后一个模块级全局注册表（`_TRANSPORT_OPERATION_HANDLERS`）与 import-order 耦合，将 RuntimeHost transport operation handler 变为 Phase 3 `ExtensionCatalog` 中的显式、可查询、可验证、事务化注册能力。未进入 Profile/Resource Routing/Web 产品功能/Core 修改（Phase 5+）。

约束遵守：Work Core ontology/Binding/Dispatch/Freeze/Finalization/schema/migrations 零修改；Ref identity、digest、持久化格式未变；PLUGIN_API_VERSION 保持 1（新增字段带默认值）；无真实模型请求；未读取 credential/auth/token/secret；无 git 写操作；dirty worktree 保留；未做 broad formatting。

---

# Verdict

**Phase 4 完成：`_TRANSPORT_OPERATION_HANDLERS` 全局表与 `register_transport_operation_handler`/`get_transport_operation_handler` 及其 import-time 注册全部删除（无兼容消费者，直接删除）。transport operation 现在走 Root SDK 的 typed SPI（`TransportOperationDescriptor` / `TransportOperationHandler` / `TransportOperationContribution`），经 `PluginRegistration.transport_operations` 显式注册，成为 Catalog 的第七个独立命名空间；terminal-session 插件声明 `tmux-respawn@1`；runtime-local 的 `LocalHostTransport` 通过 `CatalogBindable` 在 environment 激活期注入 resolver 消费。direct-stdio 保持为 HostTransport 内建 typed process primitive（非 handler）。全部套件通过（web 仅剩与本轮无关的预存 node_modules 环境失败），12 个 wheel 的 clean venv 验证通过。**

新链路：

```
PluginRegistration.transport_operations (terminal-session 声明 tmux-respawn@1)
        ↓ loader.prepare（descriptor/版本/能力校验 + 跨插件查重 + handler/descriptor 一致性）
        ↓ registry commit → catalog commit（事务化）
ExtensionCatalog.transport_operations ← get_transport_operation("tmux-respawn@1")
        ↓ activate_catalog_bindings（CatalogBindable：LocalRuntimeHostProvider.bind_catalog）
LocalRuntimeHostProvider._transport_operations = TransportOperationResolver.from_catalog(catalog)
        ↓ LocalHostTransport.submit（typed carrier → resolver.resolve → validate → execute（单次 token））
        ↓ execute 内 shell=False 的 tmux set-environment/respawn-pane（唯一 native carrier 动作）
```

---

# Previous global-state problem

开工前以源码确认（非旧报告推断）：

- 定义：`runtime_composition/protocol.py:27-45` —— 模块级 `_TRANSPORT_OPERATION_HANDLERS: dict[str, Callable]` + `register_transport_operation_handler`（防重复但禁止换绑）+ `get_transport_operation_handler`；注释自认 "deliberately a registry"。
- 注册：terminal-session `tmux.py:256` **模块顶层** `register_transport_operation_handler("tmux-respawn@1", _tmux_respawn_handler)` —— import side effect 是正式 authority。
- 消费：runtime-local `provider.py:22,164` —— `LocalHostTransport.submit` 对非 local 的运输种类调全局表；**若 terminal-session 模块未被 import 过，tmux 载体静默失效**（"unregistered provider transport operation"），clean-wheel 下依赖插件恰好被用户/测试先 import。
- direct-stdio：**不经全局表** —— runtime-local 内建 `local-stdio` 分支（独立 canonical process primitive）。
- 测试：无测试直接调用 register/get；native tmux vertical 与 web e2e 靠 terminal-session 的 import 副作用补全 discovery。
- handler 捕获状态：`_tmux_respawn_handler` 为无状态函数，仅消费 operation（bounded JSON + shell=False），未捕获 provider instance/全局状态——这点已是上限，但注册载体违规。

---

# Final Transport Operation SPI

`runtime_composition/protocol.py`（HostTransport 协议之后新增三件套）：

- **TransportOperationDescriptor**（frozen）：`operation_type`（稳定带版本标识，正则 `^[a-z][a-z0-9.-]+@[1-9][0-9]*$` 强制，如 `tmux-respawn@1`）、`version`（descriptor schema 版本，≥1）、`display_name`、`supported_runtime_host_capabilities`（命名能力元组，如 `("process.spawn.typed@1",)`）、`replay_policy="single_use_token"`、`response_loss_policy="start_ambiguous"`——后两者由 Root SPI **固定**，handler 无法 opt-out（违反任一策略值即拒绝注册）。
- **TransportOperationHandler**（`@runtime_checkable` Protocol）：`descriptor()` / `validate(operation)` / `execute(transport, operation)`。合约：不持有 Core Execution authority；不自行完成 Execution；不绕过 RuntimeHost；不接受任意 shell string（payload 必须 typed/sealed DTO 且先验证类型/版本/边界）。
- **TransportOperationContribution**（frozen）：`descriptor + handler` 对；plugin provenance 由 loader/Catalog 记录，handler 不自报。
- 承载的载体 payload 保持既有 sealed JSON（binary/socket/pane_id/token_path/bridge），validate 拒绝非 JSON、NUL、非 `%` pane、非固定 bridge 名。

---

# Registration ownership

- **注册者**：terminal-session 插件（`PluginRegistration.transport_operations=(TransportOperationContribution(respawn.descriptor(), respawn),)`，实例每次 build 新建——无跨环境共享状态）。
- **校验者**：`ExtensionCatalogBuilder.prepare` 新增 TRANSPORT_OPERATION 分支：item 必须是 contribution 对；handler 实现 typed SPI（`isinstance` 于 runtime_checkable Protocol）；`handler.descriptor() == contribution.descriptor`（不一致 fail closed）；operation_type 非空；跨插件/插件内 duplicate fail closed（"duplicate transport operation id"）。
- **承载者**：Catalog 第 7 命名空间 `transport_operation`（`TRANSPORT_OPERATION` 常量、`CONTRIBUTION_KINDS` 已含）；查询 `get_transport_operation(operation_type)` / `transport_operations()` / `owner_of`；与 selector/control 等命名空间互不冲突（同 id 跨命名空间合法沿用 Phase 3 语义）。
- **不放回** ExtensionRegistry；**不进** PluginLoadReport（dataclass 字段无 transport，loader 源码无 transport 字样，clean venv 断言）；**不创建**第二个全局注册表；Web 不聚合。

---

# ExtensionCatalog result

- `get_transport_operation("tmux-respawn@1")` 返回 `TransportOperationContribution`（descriptor+handler）；`owner_of` 返回 `plugin_id="terminal-session"`、`distribution_name="agent-box-terminal-session"` 的 ownership 记录（clean venv 实测）。
- 不可变性：Catalog frozen + MappingProxy 未变；resolver 的 `_contributions` 亦为 MappingProxy（变异 TypeError 测试）。
- 两个独立 environment 各持有独立 catalog 与独立 handler 实例（测试 4：a 有 tmux-respawn@1、b 有 other.op@1，互不泄漏）。

---

# tmux-respawn migration

- terminal-session `tmux.py`：删除模块顶层注册；`_tmux_respawn_handler` 函数迁移为 `TmuxRespawnOperationHandler` 类（descriptor/validate/execute），执行体逐字节保留（`shell=False`、固定 bridge 名 `agent-box-terminal-session-bridge`、`%` pane 校验、AGENT_BOX_LAUNCH_TOKEN 注入、respawn-pane 一次）。`validate` 在 token 消耗**之前**执行（畸形载体是干净拒绝而非 ambiguous 提交）；`execute` 在 token 消耗后执行（失败 → 既有 AMBIGUOUS 语义）。
- 无 import side effect：`agent_box_terminal_session.tmux` 模块 import 不再执行任何注册（子进程测试：仅靠 canonical loader + entry point 即可完成发现，无需先 import handler 模块）。
- RuntimeHost 不认识 tmux（runtime-local 源码零 tmux 字面量，扫描测试）；Harness 不解析 carrier（harnesses 源码零 tmux）；Web 无 tmux-respawn（扫描测试；web presenter 的既有 tmux attach 呈现是 Phase 1 前的 AttachDescriptor 消费行为，不注册/不枚举 transport handler）；Root 只认识通用 SPI（protocol.py 中唯一的 "tmux-respawn@1" 出现在 `TransportOperationDescriptor` docstring 作为示例，非代码分支）。

---

# RuntimeHost consumption path

- **CatalogBindable**（catalog.py 新增 `@runtime_checkable Protocol`）：`bind_catalog(catalog)`。
- `LocalRuntimeHostProvider.bind_catalog`：`self.transport_operations = TransportOperationResolver.from_catalog(catalog)`——激活期注入，非 service locator。
- `LocalRuntimeHost` 构造时把 `provider.transport_operations` 传给 `LocalHostTransport`；`submit` 对非本地种类：resolver 未绑定 → 明确 `CompositionRejected("no transport operation resolver is bound…")`；`resolver.resolve(kind)` 未命中 → `unregistered provider transport operation`；命中 → `handler.validate(op)`（耗 token 前）→ `self._consumed.add(key)` → `handler.execute(self, op)`。
- 激活顺序：`activate_registry_bindings(catalog, registry)` **双面遍历**——Catalog 贡献 + Registry 的 resource/execution providers（新增只读访问器 `registry.resource_providers()/execution_providers()`）——因为 runtime-local provider 本身存活于 Registry；Phase 3 语义扩展（绑定仍恰好一次、失败传播、seen 去重、顺序确定）。
- 无 global/hasattr/异常字符串能力猜测；无调用点重 build catalog；handler 不重新选择 RuntimeHost。

---

# direct-stdio boundary

- `TerminalSession.run()` 仍是唯一协议启动入口；最终 native spawn 仍由 HostTransport 执行。
- direct-stdio 走 `LocalHostTransport.submit` 的**内建 typed process primitive**（`local-stdio` 分支：cwd="/"、空 env、与 local-exec 同款的 `_default_executor` Popen + 单次 token）——不注册为插件 handler。理由：普通 process spawn 不是"受限 carrier 原生操作"，伪装成 extension operation 只会削弱"只负责一种受限 native transport operation"的 SPI 语义；边界 = 内建 primitive（HostTransport 自带能力，`transport.local-exec@1` 能力声明）vs 扩展 operation（Catalog 注册、插件实现、resolver 分发）。
- **单个 target-creation authority 证明**：两条路径都汇聚于 `LocalHostTransport.submit` 的单一 `_consumed` token 消耗点——direct-stdio 与 tmux 分别经 `_default_executor` Popen 与 respawn 处理，但都是同一 submit 内的一次 token 消耗（vertical 断言 `SentinelTransport.count == 1` / `target_creation_count == 1`）。

---

# Single-spawn proof

既有 vertical 全部保持并作为回归门槛（测试 11-18 显式引用）：

- wrap/allocate 零 target、run 恰一次：`test_execution_runtime_composition_vertical.py`（SentinelTransport count 断言）、`test_bwrap_formal_dispatch_vertical.py`（`native_calls == 1`）、native bwrap/tmux vertical（`target_creation_count == 1`）。
- replay 后仍一次：formal vertical `dispatch_execution` 幂等重放断言 + native tmux `coordinator.start` 二次调用等值断言。
- response loss → START_AMBIGUOUS、不盲重试：vertical 的 `StartAmbiguous` 断言（协调器 `except Exception → AMBIGUOUS` 路径不动）。
- wrap/allocate 失败 target 为零：vertical `lose_wrap`/`clean.count == 0` 断言。
- process exit 不自动 Finish、explicit Finish 才进 Atomic Finalization：codex provider 测试与 formal vertical `apply_finalization` 断言。
- attach descriptor 不含任意 shell/host path：vertical Presenter 断言（descriptor 无 argv/environment）。

---

# Replay/ambiguity result

原始语义未变：token 单次消耗（`_consumed`）；执行失败后 token 不恢复（注释保留"response or native-operation failure after submission is ambiguous"）；协调器 `start()` 的 replay 幂等（`prior in ledger → 返回同一 handle`）与 AMBIGUOUS 阻断重放逻辑为零改动。`validate` 前置是**新增的干净拒绝面**：畸形/越界 payload 在 token 消耗前即被拒绝（测试 7：坏 JSON 与 unsafe bridge 均抛 `SPAWN_TOKEN_INVALID: invalid/unsafe tmux carrier payload`）。

---

# Transaction/failure isolation

- 复用 Phase 3 事务语义：loader 对 transport contribution 走 `prepare`（纯校验，零突变）→ Registry staged swap → Catalog `commit`；任一环节失败整插件零残留（测试 5：registry 侧坏 provider + transport contribution 的混合插件 → 插件 FAILED、Catalog 无 handler、Registry 无 provider）。
- duplicate operation_type fail closed（测试 6）；空 operation_type/非法版本/descriptor 不匹配/handler 未实现 SPI 均经 builder 校验 fail closed（非法版本与空类型由 `TransportOperationDescriptor.__post_init__` 强校验；handler/descriptor 不一致由 prepare 强校验）。
- handler bind/activation 失败 → environment 构建失败（`activate_*` 不捕获，协议文档与 Phase 3 测试 16 模式一致）。
- failed/incompatible 插件不进 Catalog（Phase 3 语义 + 测试 5）；clean reload（每次 `build_extension_environment` 全新 provider/handler/实例）不复用旧 handler（测试 4 双环境）；无跨实例全局状态（全局表已删，parallel 无共享可变面）。

---

# Web/Host result

- 零改动面：Web 不枚举/聚合/注册 transport handler（扫描断言 web src 无 `transport_operation`/`tmux-respawn`）；HTTP API 无 operation_type+payload 远程执行入口；浏览器仍只触发既有受控产品动作；Presenter 仍只消费 AttachDescriptor；terminal open/copy 不成为注册入口。
- Web 经 environment（canonical 或 from_parts shim）间接获得 resolver——实际生效链路：web real-tmux e2e 现在**不需要**任何 import 顺序手段，通过 facade shim 的 `build_extension_environment_from_parts` 完成双面激活，tmux 载体正常执行（该 e2e 通过）。
- 顺带修复一处预存测试卫生债：web real-tmux e2e 与 native tmux vertical 的 `finally` 现在会 `kill-server` 清理自己创建的 tmux 会话（跨运行 "duplicate session" flake 根因消除；连续 3 次 native vertical 无泄漏；用户自有的 `agent-box-demo` 会话未触碰）。

---

# Removed global/import-order paths

- `_TRANSPORT_OPERATION_HANDLERS`、`register_transport_operation_handler`、`get_transport_operation_handler` **全部删除**（无真实兼容消费者；无 deprecated shim）。
- terminal-session 模块顶层注册调用删除；无测试 import-order workaround（native vertical 改为显式 catalog 构造 + `bind_catalog`，走正式 contribution 形态）。
- 无 global reset helper 需要删除（Phase 1 已无；`db._reset_connection_for_tests` 是 DB 重置非 handler 表）。
- 无 `getattr`/`hasattr` handler probing（runtime-local 直接 resolver.resolve）；无 RuntimeHost 对 tmux 的特判（"local-stdio"/"local-exec" 为内建本地运输种类，属 HostTransport 自身能力而非插件特判）。

---

# Core changes, if any

- `work_core/registry.py`：仅新增两个只读访问器 `resource_providers()`/`execution_providers()`（扩展基础设施层，供激活函数遍历；无任何 ontology/Binding/Dispatch/DB/Binding-schema 语义改动）。
- 其余全部改动位于：`extensions/runtime_composition/protocol.py`（SPI 三件套 + 删全局表）、`extensions/catalog.py`（TRANSPORT_OPERATION 命名空间、builder 校验、resolver、CatalogBindable、双面激活）、`extensions/api.py`（`transport_operations` 字段）、`extensions/bootstrap.py`（catalog 激活接线）、`extensions/__init__.py`（清理重复头部 + 再导出）、terminal-session（handler 类 + 注册 + 导出）、runtime-local（resolver 注入）、nginx 无关。`extensions/sandbox` 等 Phase 1/2 兼容面未动。

---

# Tests

新增 `tests/test_transport_registration.py`（11 个测试，覆盖要求的 20 项证据点）：

1-3. 真实 TerminalSessionPlugin 经 canonical loader 把 `tmux-respawn@1` 放进 Catalog（descriptor 策略断言 + ownership plugin_id/distribution）；子进程（无预 import handler 模块、仅 entry point）完成发现；3b. 无 import side effect 子进程证明。
4. 双环境互不污染（a:tmux-respawn@1 / b:other.op@1 互不可见）。
5. 失败插件（registry 侧坏 provider + 正常 transport contribution）全零残留。
6. duplicate operation_type fail closed（精确错误消息）。
7. 畸形 payload（坏 JSON / unsafe bridge）在 validate 层 fail closed。
8+9. runtime-local 与 harnesses 源码零 tmux（扫描）；10+19. web 零 transport 聚合、loader/PluginLoadReport 无 transport 字段（dataclass fields 断言 + 源码扫描）；20. 正式源码无 `_TRANSPORT_OPERATION_HANDLERS`/register/get（扫描，排除测试自身）。
7b. resolver typed + readonly（MappingProxy 变异拒绝、resolve 未命中 KeyError）。
11-18. 单次 spawn/replay/ambiguity/wrap-zero/exit-not-finish/finalization/descriptor 卫生由既有 vertical 显式引用为回归门槛（全部通过）。

测试更新：native tmux vertical 改显式 catalog 构造（正式 contribution 形态）+ `bind_catalog`；web real-tmux e2e 无源码改动需求（shim 激活已覆盖）；hooks.py 陈旧 docstring（"used by the tmux interactive provider"）更正（tmux 已删）。

最终结果：

| 套件 | 结果 |
|---|---|
| `tests/`（147 = Phase 1-4 全量，含 11 个新 transport 测试 + native tmux/bwrap vertical） | **147 passed** |
| terminal-session / runtime-local / sandbox-bwrap | **3 / 6 / 12 passed** |
| harnesses / claude / hermes / opencode / pi | **34 / 3 / 1 / 2 / 1 passed** |
| git + artifacts | **6 passed** |
| web（干净 tmux 状态） | 16 passed / 1 skipped / **1 failed（预存 node_modules 环境失败）** |
| `compileall` | OK |
| `git diff --check` | OK |
| 边界扫描 | 全局表无残留（唯一命中为扫描测试自身）；runtime-local/harnesses/web 无 tmux-respawn 认知；loader/report 无 transport 字段 |

环境处理：tmux 残留（先前 `native-awn_creates0` 等跨运行泄漏）精确诊断为本测试套件自身的会话泄漏并修复 finally 清理；`frontend/node_modules` 未触碰；用户自有 `agent-box-demo` tmux 会话未删除。

---

# Clean-wheel result

构建：**12 个 wheel 全部成功**（构建前清理陈旧 `build/`）。

Clean venv（`/tmp/abx-phase4-venv`，仅 pip install 的 11 个 wheel）：

- canonical `build_extension_environment()`：**10 插件 READY、0 FAILED**（不依赖源码 PYTHONPATH、不依赖测试 import 顺序）。
- `catalog.get_transport_operation("tmux-respawn@1")` 可查；ownership `terminal-session / agent-box-terminal-session`。
- `registry.get_resource_provider("runtime-host-local").transport_operations.operation_types() == ("tmux-respawn@1",)`——resolver 双面激活注入成功。
- `PluginLoadReport`/`PluginLoadRecord` 字段无 transport（dataclass fields 断言）；loader 源码无 transport 字样。
- doctor exit 0。
- **Root wheel**：zipfile 断言无任何 provider 实现；**runtime-local wheel**：无 terminal-session implementation（双包独立）。
- 无 duplicate authority：全树仅一个 transport 来源（catalog namespace）与一个消费点（LocalHostTransport.submit）。

---

# Remaining limitations

- **Phase 5（Resource Routing / Web Quick Launch 泛化）**：前端 provider 映射、facade `git-workspace` 硬编码保持；Catalog 能力面已就绪支撑替换。
- web presenter 的 tmux attach 呈现（`terminal.py:29` 校验 attach 命令二进制名）为预存产品行为，属 AttachDescriptor 消费面；若 Phase 5 统一 presenter 能力声明可再收敛。
- facade 中其余 `hasattr`（diagnostics/choices/list_repositories）为无关键的可选能力探测（非 bind/handler 协议嗅探），保留。
- P2 遗留（execution_id/dispatch_id 渗透、profile 契约裁决、死 schema、harness 表面统一、entry point key 命名）与前几轮一致，未在 Phase 4 触碰。
- `TransportOperationDescriptor.supported_runtime_host_capabilities` 目前由 handler 声明但消费端（LocalHostTransport）暂只校验 operation_type；能力交验（handler 声明 vs host capability set）留待 Phase 5 Central capability 面统一实施——已在 descriptor docstring 与报告记录为已知边界，非本轮缺陷。

---

# READY / NOT READY FOR PHASE 5 ROUTING CLOSURE

**READY FOR PHASE 5 ROUTING CLOSURE。**

依据：最后一个模块级全局注册表与 import-order 耦合清零；transport operation 成为 Catalog 显式命名空间（唯一注册通道、事务化、带 ownership）；RuntimeHost 经激活期注入的 typed resolver 消费，零 tmux 知识；single-spawn/replay/ambiguity 语义经 vertical 全量复验未变；Work Core 仅新增两个只读访问器，ontology/Binding/Dispatch/DB 零改动；全部套件与 12-wheel clean venv 验证通过。Phase 5（Resource Routing 与 Quick Launch 泛化、能力面统一）可在该基础上开工，无需再触碰 transport/extension 边界。
