# Root Extension Repair Phase 3 — Canonical Extension Catalog + CredentialMaterializer 注册 + Host Extension Manifest（2026-09-01）

实施范围：审计报告 P1-F3（CredentialMaterializer 注册通道断裂）、P1-F5（host 面扩展点无 canonical 承载、web facade 为事实 owner）、P2-F15 相邻的 bind 嗅探（`facade.py:34-35` 的 `hasattr(x,"bind")`）。未进入 Transport Handler 重构（Phase 4）、Resource Routing（Phase 5+）、Web Quick Launch provider 映射替换（Phase 5）、guest layout/ProjectionPlan/assembler（Phase 2 已定）。

约束遵守：Work Core ontology/schema/migrations/Binding/Dispatch/Finalization 语义零修改；未执行真实模型请求；未读取/输出 credential；未修改 agent-box-studio；无 git 写操作；dirty worktree 保留；PLUGIN_API_VERSION 保持 1（新增字段带默认值，旧插件兼容加载）。

---

# Verdict

**Phase 3 完成：Root SDK 现在拥有唯一、不可变、可查询、带 ownership 的 `ExtensionCatalog` 与统一 bootstrap 结果 `ExtensionEnvironment`（registry + catalog + report）。Plugin loader 对每插件事务式提交（先全量预检 → Registry staged swap → Catalog 纯数据追加，任一失败即整插件无残留）；`PluginRegistration` 补齐 `credential_materializers` 通道并由 Codex `codex-login` 正式注册；`bind` 属性嗅探删除，改为显式 `RegistryBindable` 协议并在 environment 激活期每贡献恰好绑定一次；Web Host 全部扩展查询改由 Catalog 承载，自身聚合与 route 查重删除。全部指定套件通过（web 仅剩与本轮无关的预存 node_modules 环境失败），12 个 wheel 的 clean venv 验证通过。**

新数据流：

```
Plugin entry points
        ↓
Plugin loader（事务式：prepare → Registry staged swap → Catalog commit）
        ↓
ExtensionEnvironment（frozen）
├── ExtensionRegistry     ← contracts / ResourceProviders / ExecutionProviders
├── ExtensionCatalog      ← selectors / contributors / HostControls / managers /
│                            continuation routes / credential materializers（带 ownership）
└── PluginLoadReport      ← READY/FAILED/INCOMPATIBLE、descriptor、distribution、error（仅诊断）
```

---

# Previous extension ownership

开工前以源码确认的分散承载（全部收敛）：

1. `PluginRegistration` 8 个字段，**缺 credential_materializers**；协议存在于 `extensions/credentials.py:42` 但无处承载（SDK 注册路径断裂，审计 F3）。
2. loader 对 selector/contributor/control/harness/route 只做校验+跨插件查重（`_validate_host_extensions`），**不注册任何东西**，贡献只留在 `PluginLoadReport.registration`；materializer 连校验都没有。
3. Web `HostApplication.__init__`（facade.py:26-36）自行遍历 `report.ready` 构建 controls/selectors/harnesses 字典、手工查重 continuation routes、聚合 finalization contributors。
4. `hasattr(x,"bind"): x.bind(registry)`（facade.py:35）对 controls+selectors 全量嗅探绑定；5 个正式实现（artifacts selector、hermes selector、codex 两个 control、codex profile selector）+ 3 个测试 fake 依赖该嗅探。
5. CredentialMaterializer 由 harnesses plugin 构造注入内部接线（plugin.py:31-34 `credential_materializer=manager.credentials`），第三方 Host 无法发现。
6. 第三方 Host 若不用 Web，需要复刻 facade.py:26-36 的全部聚合 + 查重 + bind 嗅探逻辑（约 20 行不可复用代码）。

---

# ExtensionEnvironment

- `agent_box/extensions/bootstrap.py`：`@dataclass(frozen=True) ExtensionEnvironment(registry, catalog, report)`。
- `build_extension_environment(*, strict=False, entry_points=None)` 是**唯一 canonical loader path**（源码扫描断言 bootstrap 中 `load_installed_plugins(` 恰出现一次）：创建 Registry → 注册 Root shared runtime contracts → loader 事务式装载进 Catalog builder → `builder.build()` → `activate_registry_bindings(catalog, registry)`。
- `build_extension_environment_from_parts(registry, report)`：为手工装配（测试/嵌入方）提供同一条构建/校验/绑定路径。
- `build_extension_registry(*, strict=False, entry_points=None)` 保持兼容签名（新增 entry_points 透传），**纯委托** environment builder 并丢弃 catalog——无第二套加载逻辑（测试 20 断言 bootstrap 源码中 loader 调用恰一次）。

# ExtensionCatalog

- `agent_box/extensions/catalog.py`：`@dataclass(frozen=True) ExtensionCatalog`，内部 `MappingProxyType` 只读索引。
- 六个独立命名空间（kind）：`resource_selector` / `finalization_contributor` / `host_control` / `harness_manager` / `continuation_route` / `credential_materializer`——不同命名空间可合法持有相同 id（测试 12：selector 与 control 同为 "selector-only-selector"）。
- 查询接口：`selectors()/get_selector`、`finalization_contributors()/get_finalization_contributor`、`host_controls()/get_host_control`、`harness_managers()/get_harness_manager`、`continuation_routes()/routes()/get_continuation_route`、`credential_materializers()/get_credential_materializer`、`owner_of(kind, id)`、`contributions()`；未命中 raise `KeyError`（fail loudly，不返回 None 静默）。
- 不可变性：frozen dataclass（setattr 拒绝）+ MappingProxy（变异拒绝）+ 返回 tuple——测试 1 三路断言。
- 不依赖 Web（catalog.py 仅 import api）；不含 transport handler（Phase 4）；不是 Work Core entity（work_core 零引用，边界扫描为空）。

---

# Plugin registration changes

- `PluginRegistration.credential_materializers: tuple = ()` 新增；tuple 校验纳入 `__post_init__` 与 `check_registration_conformance` 的字段清单（diagnostics 同步覆盖 harness_managers/continuation_routes）。
- 向后兼容：默认空 tuple，PLUGIN_API_VERSION 不变，旧插件描述符/注册无需修改即可加载（clean venv 10 插件 READY 证实）。

# CredentialMaterializer registration

- **注册**：harnesses 插件正式注册 `credential_materializers=(manager.credentials,)`——CodexCredentialSource（provider_id="codex-login"，supported_contract_ids={agent-box.credential@1}）本就同时是 ResourceProvider，满足"同一对象双角色"。
- **校验（loader/builder 内 fail closed）**：provider_id 非空；`supported_contract_ids` 必须为非空 frozenset[str]；每个 contract 必须已注册（registry 现有目录 ∪ 本插件 contracts）；跨插件重复 provider_id 拒绝。
- **发现**：`catalog.get_credential_materializer(ref.provider)`（真实链路 ref.provider="codex-login" ✓）。
- **使用边界不变**：Catalog 只负责发现；materializer 仍只接受 exact CredentialRef；SecretMount 仍 execution-scoped；Codex provider 内部构造注入保持（组合路径零改动）；Claude/OpenCode/Hermes/Pi **未伪注册**（catalog 中 materializer 恰 1 个，测试 13）；测试 fake materializer 的 resolve/prepare_mount/cleanup 为显式 AssertionError，证明发现层永不触碰 secret。
- Quick Launch 的 credential 选择行为未改变；Web 未新增 raw credential editor。

---

# Ownership/provenance

- `ExtensionContribution(kind, component_id, plugin_id, distribution_name, distribution_version, component)`——frozen；`component` 字段 `compare=False, repr=False`（live 对象必要保留，但公开 repr 只含五元 bounded 字段，测试 3/14 断言）。
- 不含配置值、credential、runtime handle；`owner_of(kind, id)` 返回完整归属。
- PluginLoadReport 继续独占 READY/FAILED/INCOMPATIBLE、descriptor、distribution、error 诊断；Catalog 只含 READY 插件成功提交的 components（测试 4）。

---

# Transactional loading

loader 重构为每插件三段式（`loader.py`）：

1. `pending = builder.prepare(registration, plugin_id=…, distribution…, known_contracts=…)`——全量预检（六类贡献 id 非空 + 跨插件/插件内查重 + materializer 契约知识），**零突变**；
2. `registry.register_components(contracts, resource_providers, execution_providers)`——Registry 自身的 staged 原子交换；
3. `builder.commit(pending)`——纯数据追加，commit 之后不可能失败。

任一环节抛出 → 该插件 FAILED，pending 丢弃、Registry 未变、Catalog 未变——**不存在 Registry 已提交而 Catalog 未提交的半成功状态**。原 `_validate_host_extensions` 与 seen_* 手工 staging 字典删除（由 builder 统一承担，错误消息保持 "duplicate {kind} id: X" 兼容）。

测试覆盖：contract duplicate（既有 test_extensions）、provider/selector/contributor/control/harness/route/materializer duplicate（新参数化测试，全部 ["READY","FAILED"] + 精确错误消息）、以及"registry 侧坏 provider + catalog 侧正常贡献"的混合插件——断言 Catalog 与 Registry **均无任何残留**（测试 4/5）。

---

# Explicit registry binding

- `extensions/api.py` 新增 `@runtime_checkable class RegistryBindable(Protocol): def bind_registry(self, registry) -> None`——显式命名协议取代任意 `bind` 属性嗅探。
- 绑定发生在 `build_extension_environment` / `build_extension_environment_from_parts` 的**激活阶段**（`activate_registry_bindings`）：按 catalog 顺序每贡献**恰好一次**（测试 15 计数断言）；绑定失败向上传播，environment 构建失败——不得伪装 READY（测试 16）。
- 迁移为显式协议：artifacts `ResponsibilitySelector`、hermes `HermesProfileSelector`、codex `CodexProfileSelector`/`CodexAppServerHostControl`/`CodexInteractiveHostControl` + 3 个测试 fake（test_product_loop FakeSelector/FakeControl、test_quick_launch_e2e FakeControl）。实现均为幂等赋值（同 registry 重复绑定是无害 no-op，语义在协议文档中明确）。
- 合约：绑定不得创建模型进程、runtime lease 或写 credential（协议文档载明；责任在实现方，Catalog/Environment 只保证一次性）。
- 构造注入优先原则：无需 registry 的贡献（路由、materializer、多数 manager）不实现协议、不被绑定。

---

# Web Host migration

- `HostApplication.__init__(registry, report, home=None, *, terminal_presenter=None, catalog=None)`：
  - `catalog` 给定（canonical 路径，`create_server` 经 `build_extension_environment` 获取）→ 直接消费；
  - `catalog` 缺省（旧 `(registry, report)` 调用方）→ **薄 shim**：调 `build_extension_environment_from_parts`（SDK canonical 构建 + 绑定激活），Web 自身零聚合逻辑。
  - controls/selectors/libraries/routes 字典改由 namespaced `catalog.query(kind)` 构建；facade 自做的 duplicate route 检查删除（Catalog 已保证唯一）；`hasattr(x,"bind")` 循环删除；`HostFinalizationCoordinator` 的 contributors 改从 generic query 获取。
- `server/host.py create_server`：registry/report 缺省时走 `build_extension_environment(strict=False)`（canonical），并新增 `catalog` 透传参数。
- 保持不变：Web API 路由、Quick Launch 行为、Profile 管理、continuation、Finish、terminal presenter、浏览器可见 payload、旧构造签名（薄 shim）。
- `report` 在 Web 中仅剩 diagnostics 用途（/api/v1/plugins 列表 + 存储字段）——边界扫描确认 web src 无任何 `for … in report.ready` 聚合（测试 17）。

---

# Finalization/continuation/control result

- **Finalization**：Git contributor（唯一 contributor）经 Catalog 承载，仍按 provider/contract 匹配；contributor id duplicate fail closed；explicit Finish → HostFinalizationCoordinator → Core atomic finalization 全链路未动（web product loop / real tmux e2e 通过）；`NO_WORKSPACE_CHANGES` fail-closed 保持；Catalog 不执行 finalization，只是 authority/query surface；finalization 逻辑未移入 Web。
- **Continuation**：route descriptor id 为 Catalog key；compatibility 判定仍在 plugin（`ProviderContinuationRoute.supports`）；hermes 无 native route 保持诚实（不生成假 route）；web 的 continuation_candidates 消费 `self.routes`（来源已换 Catalog）。
- **HostControl**：key 为 execution provider id；codex 双专用 control 可查询；opencode 缺 control 时 Catalog 如实为空——facade `attach/observe/finish/open_terminal` 的 `CONTROL_UNAVAILABLE` 行为不变，无任何假 control 生成。
- **Manager**：key 为 harness_id；provider 缺失时 facade 既有 `HARNESS_NOT_FOUND`/`CONTROL_UNAVAILABLE` 显式错误路径保持，Web 不修补。

---

# Credential safety

- Catalog 公开面（contribution 五元字段 + repr）不含 credential source path、secret value、auth content、secret digest、private environment——测试 14 用真实 Codex plugin（credential home 指向 tmp）断言 `auth.json`/`codex-secret`/home 路径均不出现在 `repr(catalog.contributions())` 与 ownership 字段。
- `get_credential_materializer` 返回协议对象本身（与 ResourceProvider 同一对象），不新增任何读取通道；无 raw credential editor；无 credential 值/路径日志（codex manager diagnostics 的 `secret_policy` 声明保持）。

---

# Core changes, if any

- **Work Core：零改动**。改动全部位于 extensions 层（api/credentials/loader/bootstrap/catalog/diagnostics/__init__）、web（facade/host）与插件（harnesses 注册 materializer、5 处 bind→bind_registry 改名）。
- 兼容性：`build_extension_registry` 签名/返回不变（新增 keyword-only entry_points 透传）；`load_installed_plugins` 新增 keyword-only `catalog` 参数（缺省行为等价）；`PluginRegistration` 新增带默认字段；`PLUGIN_API_VERSION = 1` 未变。

---

# Tests

新增 `tests/test_extension_catalog.py`（19 个，覆盖要求的 20 项——其中测试 4/5 合并断言 failed-plugin 的双面无残留）：

1. Catalog frozen + MappingProxy 双路不可变；2. 六类按 id 查询 + KeyError；3. ownership/provenance（含 repr 不含 live 组件）；4+5. 失败插件 Catalog/Registry 双面零残留（registry 侧坏 provider + catalog 侧正常贡献的混合插件）；6-11. 六类 duplicate 参数化 fail closed（精确错误消息）；12. 跨命名空间同 id 合法；13. Codex materializer 经 Catalog 可查（且全 catalog 恰 1 个 materializer）；14. provenance 不泄漏 credential/path/token；15. 绑定恰好一次；16. 绑定失败不伪装 READY；17+边界. Web 无 report 聚合/bind 嗅探（源码扫描）；18. 第三方 fake Host 纯 SDK 消费 Catalog 且进程内无 agent_box_web（subprocess 隔离）；19. 兼容 wrapper 行为不变；20. environment 为唯一 canonical path（bootstrap 源码 loader 调用恰一次）。

既有测试更新：3 个测试 fake 的 `bind` → `bind_registry`（test_product_loop ×2、test_quick_launch_e2e ×1）。

最终结果：

| 套件 | 结果 |
|---|---|
| `tests/`（含 19 个新 Catalog 测试 + Phase 1/2 全部回归） | **136 passed** |
| harnesses / claude / hermes / opencode / pi | **34 / 3 / 1 / 2 / 1 passed** |
| sandbox-bwrap / runtime-local / terminal-session | **12 / 6 / 3 passed** |
| git + artifacts | **6 passed** |
| web（干净 tmux 状态） | 16 passed / 1 skipped / **1 failed（预存环境：frontend/node_modules，与本轮无关）** |
| `compileall` | OK |
| `git diff --check` | OK |
| 边界扫描 | web 无 report 聚合/bind 嗅探；catalog 不 import web；work_core 不 import catalog；插件不 import web——全部为空 |

环境问题按预案处理：tmux 残留会话（`kill-server` 前后清理；一次 5-fail 级联经干净复跑确认为残留 flake，非回归）；未触碰 `frontend/node_modules`。

---

# Clean-wheel result

构建：**12 个 wheel 全部成功**（Root、runtime-local、sandbox-bwrap、terminal-session、harnesses、claude、opencode、hermes、pi、git、artifacts、web → `/tmp/abx-wheels3/`；构建前清理陈旧 `build/` 中间产物）。

Clean venv（`/tmp/abx-phase3-venv`）：

- **Root-only**：`build_extension_environment()` → registry（shared 契约就绪）/catalog（空）/report（空）三件套；doctor exit 0。
- **Preview + opt-in（11 插件 wheel）**：entry point 发现 **10 插件 READY、0 FAILED**；`environment.catalog` 查询全绿——`get_credential_materializer("codex-login")`、selectors（agent-box-profile/responsibility/bwrap-sandbox/runtime-host-local）、host controls（codex 双）、harness managers（codex/hermes）、routes（codex/pi-native-session）、finalization contributor（git-workspace）；ownership（plugin_id="harnesses"、distribution="agent-box-harnesses"）正确。
- **doctor（全部插件 + web wheel）**：plugin_registry/execution_providers/web_plugin/frontend_static 全 true、exit 0。
- **无 Web 依赖**：catalog/环境构建不 import agent_box_web（源码扫描 + 测试 18 subprocess 断言）。
- **Root wheel**：zipfile 断言无任何 provider 实现、无陈旧 sandbox/protocol.py。

---

# Compatibility

- 公开 SDK 路径：`agent_box.extensions` 提供 ExtensionCatalog/Contribution/Builder、RegistryBindable、ExtensionEnvironment、build_extension_environment(-from-parts)、build_catalog_from_report；Host/Runtime/Credential 协议 canonical 路径为 `agent_box.protocols`，不提供旧 shim。
- 旧 import 无需一次性迁移：插件现有 `from agent_box.extensions import …` 与 `from agent_box.work_core import ExtensionRegistry` 继续有效。
- 行为差异（有意、已记录）：① Host 贡献若需 Registry 必须实现 `bind_registry`（旧 `bind` 不再被触发）；② facade 的 duplicate-route 异常由 Catalog 构建期等价保证取代；③ `build_extension_registry` 现在会激活绑定（幂等，行为外延无害）。
- 未拆发行包；未改 PLUGIN_API_VERSION；未修改数据库/持久化。

---

# Remaining architecture blockers

- **Phase 4（Transport Registration）**：`_TRANSPORT_OPERATION_HANDLERS` 全局表 + terminal-session import 时注册 + runtime-local 消费的 import-order 耦合原样保留（本轮明确不动）。Phase 4 可将其纳入 Environment/Catalog 的显式注册面（transport handler 命名空间）。
- **Phase 5（Resource Routing / Web Quick Launch 泛化）**：web 前端 `QuickLaunch.tsx:11-13,38-43` 的 provider→harness→selector 映射与 facade `repositories()` 的 git-workspace 硬编码保持（本轮禁改）；Catalog 的能力查询已为替换铺路。
- **P2 遗留**：execution_id/dispatch_id 渗透组合协议签名、Profile 契约 harness 词汇裁决、死 schema、harness 表面统一、异常字符串匹配协议探测、entry point key 命名不一致。
- **预存测试债**：`test_static` 的 node_modules 断言；tmux e2e 的会话清理（两处均与本轮无关，已精确定位）。

---

# READY / NOT READY FOR PHASE 4 TRANSPORT REGISTRATION

**READY FOR PHASE 4 TRANSPORT REGISTRATION。**

依据：扩展发现的唯一权威（Environment = Registry + Catalog + report）已落地并被 Web/CLI/测试三方消费；加载事务化且失败零残留；materializer 通道补齐并经真实 Codex 链路验证；bind 嗅探清零、显式协议绑定一次性完成；全部指定套件与 12-wheel clean venv 验证通过；Work Core 零改动。Phase 4 可将 transport operation handler 纳入同一 Environment 注册面（消除最后一个模块级全局注册表与 import-order 耦合），无需触碰本轮任何边界。
