# Work Order 50 — 按内容吸收能力层（报告）

结果：**CAPABILITY_LAYER_ABSORBED**

来源：`feature/capability-entry-v1` @ `1c74d1559ca791cdac914f881b5a20ba123af8b7`
（工作树 `/home/maoqh/projects/agent-box-capability-entry-v1`；**未合并该分支**——不 merge、不
cherry-pick、不并其 `dispatch/agentbox-system/` 与 `docs/capability-entry-v1/**`；只读作设计输入）。

## 一、逐文件移植清单

**新增（整包复制，内容等价）**：
- `src/agent_box/extensions/capability/` 七模块：`__init__.py`、`ids.py`、`requirements.py`、
  `match.py`、`selection.py`、`documents.py`、`errors.py`（+ 本单新增 `slots.py`，见 §四）。
- `plugins/agent-box-sandbox-bwrap/src/agent_box_sandbox_bwrap/declarations.py`（245 行）。
- `tests/capability/**` 八组（authorization/documents/errors/fake_refusals/ids/match/requirements/
  selection）+ 本单新增 `test_capability_slots.py`。
- `plugins/agent-box-sandbox-bwrap/tests/test_declarations.py`。
- `tests/server/test_capability_gate.py`（258 行，七用例）。

**签名/行号适配（逐条理由）**：
1. `declarations.py` 证据锚点 `_NETWORK_ARGV_LOCATOR` / `_NETWORK_ABSENCE_LOCATOR`：
   `provider.py:259-263` → `provider.py:297-300`。理由：锚点必须指向**本树**真实的
   sidecar argv 组装块（192 行函数 `compile_remote_sidecar_bwrap_argv` 内），源分支行号
   在本树是错误位置；锚点的设计承诺就是"bound to the execution environment"，指向错位置
   等于证据失效。
2. `declarations.py` 注释里的 `provider.py:241-253` → `provider.py:241-288`（同理由，
   本树的关系校验段落更长）。
3. `tests/.../test_declarations.py::test_evidence_binds_the_execution_and_never_expires`
   的 `expected_locators` 字面值随 1 同步（**断言语义未变**：仍是"锚点等于预期位置"）。
4. `test_harness_sidecar.py` 的 `_fixture_capability_material` 插入位置修正：源分支把它
   插在 `@pytest.mark.skipif(...)` 与它装饰的测试之间，静默解除了那个 skip 守卫
   （sidecar entry 未构建时该测试会真跑）；本树重放时把 helper 放在第一个 skipif 测试
   **之前**，skip 守卫完整。这是对源分支缺陷的修正，已在测试注释里记录。

**按意图合并（共享文件，逐段重放）**：
- `src/agent_box/server/execution/sidecar.py`：`SidecarHarnessPort.__init__` +4 参数
  （documents/grants/authorized/binding）与实例属性；当前树签名已含 44/45 的
  `native_platform`/`home_locator`/`preferred_auth_method`，按当前签名重放。
- `src/agent_box/server/execution/sidecar_backend.py`：五处——import（capability +
  `ExecutionStartRejected`）；`_CoreSidecarProvider.start` 的 `CapabilityGateRefusal` →
  `ExecutionStartRejected`（带码）转换；`_start_run` 中 `open_execution` **之前**的
  `_capability_gate(port, turn_id)`；`CapabilityGateRefusal` 类 + `_capability_gate` 函数；
  `_safe_code` 的异常链遍历**与本树既有日志回退合并**（f753e60 引入的 `logging.error`
  保留在遍历之后，两者不冲突）。
- `src/agent_box/server/bootstrap/runtime.py`：`import time` + `capability`；
  port_factory 内 `_capability_material(context, deployment)` 调用与四个构造参数；
  `_APPROVED_CAPABILITY_DECLARERS` / `_capability_binding` / `_capability_material` 三函数
  （当前树插入位置在 `build_runtime_from_sidecar_deployment` 返回后、`_CREDENTIAL_*` 区前）。
- `tests/server/test_harness_sidecar.py`：helper + `_local_sidecar_runtime` /
  permission round-trip 两处注入 + 两个新测试（post-open 同名码 ambiguous、
  装配未注入时门拒绝零启动）。
- `tests/server/test_server_capability_contract.py`：附件拒绝测试的 Port fixture 注入
  最小中立材料（新门要求装配材料齐备，否则 fail-closed）。

## 二、等价性（G1）

移植测试计数（本树实跑，HEAD 见 §五）：

| 套件 | 计数 |
| --- | --- |
| `tests/capability/`（八组 + 本单 slots 守卫） | **144 passed**（138 移植 + 6 新增） |
| `plugins/agent-box-sandbox-bwrap/tests/test_declarations.py` | **16 passed** |
| `tests/server/test_capability_gate.py` | **7 passed** |
| `tests/server/test_harness_sidecar.py` | **全部 passed**（含 2 新用例） |
| `tests/server/test_server_capability_contract.py` | **全部 passed** |

除 §一列出的三处适配外，**无任何断言语义改动**。

## 三、接线与反例（G2/G3）

装配边界注入点：`build_runtime_from_sidecar_deployment` 的 port_factory →
`_capability_material(context, deployment)` → `SidecarHarnessPort(capability_*=…)`；
门在 `_start_run` 的 `open_execution` 之前（零 launcher/spawn）。

反例实测（均通过）：
- **未批准 provider**：`authorized=("some-other-provider",)` → `CAPABILITY_REQUIREMENT_UNSATISFIED`，
  `port.opened == []`（门在原生接触前拒绝）；
- **伪造/未批准提供者的声明文档**：把 `_APPROVED_CAPABILITY_DECLARERS` 换成不含
  `sandbox-bwrap` 的集合 → 材料为空集（门随后拒绝），不按声明自报放行；
- **空授权集 ≠ 不限制**：空 `authorized` 被当作"未注入"拒绝；
- **需求来自 launcher 计划**：未声明的面被拒（`test_demands_come_from_the_launcher_plan…`）；
- **post-open 同名码不得被误标**：`ImpostorPort` 抛同名 `SidecarError` → turn 记
  `EXECUTION_FAILED`、Core 账本记 `ExecutionDispatchAmbiguous`（非 Failed），
  与"门拒绝→failed"形成 pre/post 对照。

授权来源三分（G3）：授权 = 部署文档显式字段推导的 grants（`sidecar_grants`，独立路径）
+ 模块常量 `_APPROVED_CAPABILITY_DECLARERS`（不取自声明文档自身）；插件 descriptor id
与声明自报 provider 逐字比对，两者都必须在批准集内。

## 四、收敛 `network.none@1`（G4）与词汇关系（G5）

第一手观测（2026-09-17，本树）：
- `compile_remote_sidecar_bwrap_argv(...)` 产物：unshare 标志 = `--unshare-user/pid/ipc/uts`，
  **无 `--unshare-net`** → sidecar 模板 `network.none@1` = **unavailable**（argv 缺失锚点）；
- `_minimal_rootfs_argv(bwrap, "none")`（bwrap-offline/safe-default 模板路径）：
  **有 `--unshare-net`** → 那两个模板的 none 声明属实。

处理（工单 §1.E 推荐项）：声明按**模板/执行**构造——
`declarations.sandbox_declaration_document` 逐执行产出
`network.inherit@1=supported / network.none@1=unavailable`，被能力门消费；
`provider._CAPS` 保留为**跨模板并集**并写明这一语义（新增注释：它不是 per-template
claim，sidecar 执行的承诺以逐执行声明为准；给房间补网络姿态留给 47 的中立计划）。

词汇关系（G5）新增 `capability/slots.py`：`COMPONENT_SLOT_CAPABILITIES` 登记三个槽位
（`isolation.wrap@1` / `process.spawn.typed@1` / `terminal.run@1`）各自当前可声明的具体
能力全集与 `slot_of_capability` 守卫；测试锁定：sandbox 声明与需求 ⊆ isolation 组、
`_CAPS` == isolation 组（互不成为第二套词汇）、host provider 声明 ⊆ host 组且不越位
认领别的槽位、拼造的 id（`filesystem.bogus@1`）无槽位、形状错误（无主版本）在登记入口
即类型化拒绝。`harness_capabilities.py`（canonical 8 项产品能力）与这三层是**不同层**：
那是"产品能力"（start/observe/finish/…），本单的两层是"组件槽位 + 沙箱细节能力"，
互不重叠、不需要合并。已知未收敛项：terminal 组件今天用非版本化短名（记录在
`slots.py` docstring；收敛留给后续工单）。

## 五、回归（G6）

HEAD：本单实现提交；范围与命令：

- 根套件（`tests/`，含全部插件 src 的 PYTHONPATH）：
  `python3 -m pytest tests/ -q` → **748 passed / 0 failed**（基线 601/0；+147 为本单移植
  测试 + 45/46 期间合法增量之后的净增）。
- 插件套件（`plugins/agent-box-harnesses/tests/` + `plugins/agent-box-sandbox-bwrap/tests/`）：
  **331 passed / 3 skipped / 0 failed**。
- 四家全链门（显式 `--worker .acceptance-bundle-c8/agent-box-worker`，假端点；同一口径
  向 49 的 G2 对齐：缺省即失败，显式 c8 通过）：
  pi `PI_PRODUCTION_CHAIN_GATE_OK`（exit 0，49 的 G2 轮，c8 sha256 `ce7fdeb2…`）、
  hermes `HERMES_PRODUCTION_CHAIN_GATE_OK`（exit 0）、
  opencode `OPENCODE_PRODUCTION_CHAIN_PREPARED`（exit 0，该门既有 result 名）、
  codex `CODEX_PRODUCTION_CHAIN_GATE_OK`（exit 0）。
- wire 零改动：28 方法、`wire/1`、事件 kind 与载荷、TS/工件摘要不变（本单只改
  Server 内部装配与插件声明路径）。

## 六、清理与来源

- 来源可审计：本节与提交信息均注明 `feature/capability-entry-v1 @ 1c74d15`；
  未合并其历史/调度/语料。
- `git diff --check` 干净；Git 状态见提交记录；零真实模型调用（全部假端点/单元）。
- 未做项：47 的中立计划与房间网络参数（本单不做）；CAP-02..05 队列（不娶）；
  terminal 短名词汇版本化（记录待后续）；父分支回合并（之后单独一步）。
