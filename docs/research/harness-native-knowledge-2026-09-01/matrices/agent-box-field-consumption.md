# 矩阵：harnesses.toml 字段消费审计（agent-box-field-consumption）

基线：branch `feat/resource-routing-phase2`，HEAD `1a3c308`（refactor: separate
extension kernel from protocol packs）。审计日期 2026-09-01/02。
"正式路径" = 通过 `agent_box.plugins` entry points 装载、被 Work Core / Web 门面
实际调用的代码（`src/` 与 `plugins/*/src`，排除 `build/` 与 tests）。

## 1. 逐字段消费状态

图例：✅ 正式消费 · 🟡 仅校验/仅展示 · ❌ 未消费（dead declaration） ·
⚠️ 消费但与预期行为不符

| TOML 字段（registry/schema.py 定义处） | 状态 | 消费点 / 证据 |
| --- | --- | --- |
| `schema_version` | 🟡 | `registry/loader.py:24`、`registry/schema.py:52` 仅校验 |
| `driver` | ✅ | `generic/factory.py:16,18` 用 driver 查 `ADAPTERS` |
| `capabilities` | ⚠️ | `generic/execution_provider.py:11` 直接回显 `{key:"supported"}`；`stream/permissions/attach/steer/native_continuation` 无任何对应行为方法（无事件解码、无权限响应、无 attach 实现） |
| `identity.harness_type` | ✅ | registry key（`loader.py:15`）；entrypoint 绑定（`entrypoints.py`） |
| `identity.display_name / description / version` | 🟡 | 仅 descriptor 展示（`factory.py:25`、`execution_provider.py:10`） |
| `executable.identity` | ✅ | `adapters/generic_cli.py:10-11` 作为 `/runtime/bin/<identity>` argv[0] 名 |
| `executable.resolver_kind` | ❌ | `resources/executable.py:6` 校验合法值，但 `resolve_executable` 全仓库无调用者（含 tests） |
| `executable.bundle_members` | ❌ | 仅 schema 解析（`schema.py:22,56`），无任何读取 |
| `executable.version_probe` | ❌ | 仅 schema 解析；无探测实现 |
| `profile.native_home` | ❌ | `generic_cli.py:17-19` 仅当 profile 是 dict 才读；正式路径 resolve 产物是 `AgentBoxProfileV1`（非 dict）→ 实际不生效 |
| `profile.guest_home` | ⚠️ | 同上条件分支 + schema 校验（`schema.py:59-60`） |
| `profile.config_format` | ❌ | 仅 schema 解析 |
| `profile.payload_schema` | ❌ | 仅 schema 解析；payload 无 schema 校验器（Adapter 只查 dict 类型，`generic_cli.py:6-7`） |
| `profile.codec` | ❌ | 仅 schema 解析；`resources/profile_codec.py` 只有 canonical_json，无 per-harness codec |
| `profile.overlay_policy` | ❌ | 仅 schema 解析；实际 overlay 由 envelope `session_overlay_policy` 默认值顶替（`profile_store.py:81`） |
| `profile.slots` | ❌ | 仅 schema 解析（唯一性校验）；无消费者 |
| `profile.skill_target` | ✅ | `generic_cli.py:22-35`（skill 投影目标模板） |
| `profile.skill_env` | ✅ | `generic_cli.py:37-38`（env 注入） |
| `inputs[].contract_id/minimum/maximum` | ✅ | `execution_provider.py:12` `input_limits()`；Web review 用（`facade.py:177-181`） |
| `inputs[].required` | 🟡 | schema 派生（`schema.py:90`）；无独立消费 |
| `inputs[].selectors` | ❌ | 仅 schema；真实 selector 是代码固定（`generic/profile_selector.py`） |
| `inputs[].target` | ❌ | 仅 schema 校验 skill 值（`schema.py:95`）；无行为读取 |
| `inputs[].transformer` | ❌ | 仅 schema；`"agent-skills"` 字符串无消费者 |
| `launch_modes[]` | ⚠️ | **永远只取 `[0]`**（`generic_cli.py:9`）；`name` 被忽略；codex 的 app-server、claude 的 interactive 等全部 dead；`mode.io` 传入 `HarnessCommandSpec.io_mode` |
| `launch_modes[].resume_contract` | ❌ | 仅 schema（`schema.py:28,80`）；TOML 中也未使用 |
| `runtime.io / host_capabilities / sandbox_capabilities / network / terminal` | ❌ | 仅 schema（`schema.py:81-85`）；`HarnessCommandSpec.requires_control_plane_network/tool_network_requirement` 从未被这些值设置（generic_cli.py 全程缺省） |
| `continuation.kind / contract_id / target_provider` | ❌ | 仅 schema（`schema.py:97-103`）；generic factory 从不构造 `ContinuationRoute` contribution（协议存在：`protocols/host/__init__.py:26-33`） |
| `credential.contract / locator_provider / guest_target_class / materializer` | ❌ | 仅 schema（`schema.py:104-109`）；generic 链无 credential 装配。唯一材料化代码在 `plugin.py:21` 门面里硬编码 `CodexCredentialSource`（旧原生子目录），非 registry 驱动 |

## 2. Adapter SPI 消费状态（adapters/base.py）

| 方法 | 状态 | 证据 |
| --- | --- | --- |
| `validate_native_payload` | ✅ | `generic/factory.py:16`（ProfileStore 写入校验） |
| `build_command` | ✅ | `generic/execution_provider.py:15` |
| `observe` | ✅（形式上） | `execution_provider.py:21` → 但 `GenericCliAdapter.observe` 只是 `return handle`（`generic_cli.py:46`），无事件解码 |
| `finish` | ✅（形式上） | `execution_provider.py:22-24` → `return handle` |
| `declare_runtime_sources` | ❌ **dead SPI** | 定义于 base.py:7、generic_cli.py:44，全仓库无调用者 |
| `decode_observation` | ❌ **dead SPI** | 定义于 base.py:8、generic_cli.py:45，全仓库无调用者 |

## 3. 计数汇总（harnesses.toml 全部字段）

- 正式消费（✅，含条件生效）：`driver`、`identity.harness_type`、
  `identity.display_name/description/version`（展示）、`executable.identity`、
  `profile.skill_target`、`profile.skill_env`、`inputs.contract_id/minimum/maximum`、
  `launch_modes[0].argv/io`、`mode.io` → **11 项**
- 仅校验/展示（🟡）：`schema_version`、`inputs.required` → **2 项**
- 消费但行为缺失/装饰性（⚠️）：`capabilities`、`launch_modes[] 其余项`、
  `profile.guest_home` → **3 组**
- 未消费（❌）：`resolver_kind`（除合法性校验）、`bundle_members`、`version_probe`、
  `native_home`（正式路径）、`config_format`、`payload_schema`、`codec`、
  `overlay_policy`、`slots`、`inputs.selectors/target/transformer`、
  `resume_contract`、`runtime.*`（5 字段）、`continuation.*`（3 字段）、
  `credential.*`（4 字段）→ **约 21 项**

## 4. 相关结构（非 TOML 但同一链路）

| 事实 | 状态 | 证据 |
| --- | --- | --- |
| Profile resolve 产物 | `AgentBoxProfileV1(name, agent_type, digest, revision, provider)`——**不含 native_payload** | `resource_contracts/agent_box_profile_v1.py`；`generic/profile_store.py:88-94` |
| native payload 进入 Adapter？ | **否**。`build_command` 仅在 profile 为 dict 时读字段（`generic_cli.py:10,17`）；正式信封非 dict → payload 零贡献 | `generic/execution_provider.py:14-15` |
| 可执行 bundle 落地 `/runtime/bin` | **不存在**。bwrap 只 `--dir /runtime/bin` 建空目录（`agent-box-sandbox-bwrap/provider.py:226`）；旧实现 `codex/executable.py`（`CodexExecutableBundle.runtime_sources()`）未被正式路径引用；formal vertical 测试用 fake 脚本声明为 workspace 源（`test_bwrap_formal_dispatch_vertical.py:44-59`） |
| `resources/executable.py` | 无调用者（连 tests 都不用） | 全仓库 grep |
| ProfileEnvelope / ProfileEnvelopeManager | 定义完整但 generic factory 未使用（factory 用裸 dict envelope） | `generic/profile_envelope.py` vs `factory.py:20-21` |
| `GenericProfileManager.disable` | 重复定义两次（后者覆盖前者），`generic/profile_manager.py:11` 与 `:14` | dead code |
| Web 门面期望 `validate/projection_preview/import_sources/import_candidates/import_preview/confirm_import` | GenericProfileManager **均未实现**；只有旧原生 provider 时代的方法面 | `agent-box-web/application/facade.py:137-165` |
| 旧原生子目录（codex/claude/opencode/hermes/pi 共 2405 行） | 仅被 tests 引用（`plugins/agent-box-harnesses/tests/test_codex_*.py`、`tests/integration/native/harnesses/test_*_real_bwrap.py`），不在 entry point 链上；例外：`plugin.py:10` 门面引用 `codex.credentials.CodexCredentialSource`（门面"非 entry point"） | grep 证据 |
| 六个 entry points | `pyproject.toml [project.entry-points."agent_box.plugins"]`：harness-profile-store / codex / claude / opencode / hermes / pi，全部指向同一 `_Plugin`（仅 harness_type 不同） | `entrypoints.py` |
| Skills 链 | SkillStore 快照 + `ResolvedAgentSkill.source.projection_source()` 私有端口；`generic_cli.py:20-35` 是唯一正式消费方 | `agent-box-skills/store.py` |
