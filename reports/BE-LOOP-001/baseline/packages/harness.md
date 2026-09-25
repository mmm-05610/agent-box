# 包说明 — `agent-box-harness`（新核心·品牌中立 Harness 核心）

> 交付位＝`control/reports/BE-LOOP-001/baseline/packages/harness.md`（本件落本组
> `harness/reports/baseline-packages/` 镜像目录，**请 C 落盘**——control 由 C 唯一管理，H 零直写）。
> MB-1c（task-board B 区，owner H，六项格式）· 绑定 HEAD `fa0d363`（由 `M1-PA1-release.md` 抽离，
> 候选入 `ebbe168`）· 全部读数 2026-09-22 刚跑实测。

## 1. 职责

品牌中立的 Harness **核心实现体**（全仓唯一一份，旧包名全部别名至此）：

- **`registry/`**：`schema`（harness 定义解析）· `loader`（`harnesses.toml` 发现与装载，数据读
  经 `find_spec` 不执行旧包）· `definitions` · `validation` · `capability_claims`
  （`supported == declared ∧ observed` 的 fail-closed 核对）。
- **`generic/`**：`factory`（`build_registration`——6 个 entry-point 共用的唯一组装链）·
  `profile_store`（插件侧 Profile 通用半：身份/版本 CAS/摘要/五落盘守卫）· `profile_manager` ·
  `profile_selector`（选择→`ResourceSelection` 执行资源）· `profile_provider` · `execution_provider`。
- **`adapters/`**：`base.HarnessAdapter`（适配器协议）＋ `generic_cli.GenericCliAdapter`
  （唯一通用实现；八家品牌 adapter 在旧包、经别名 import 此类，同一 class 对象）。
- **`resources/`**：`executable` · `profile_codec`。
- **`plugin.py` / `entrypoints.py`**：`create_plugin` 与 6 个工厂函数的实现体
  （旧包 entrypoints 别名转发；`create_plugin` 旧包侧惰性以免 core-first 环）。

## 2. 非职责

- **零品牌分支**：不持 `ADAPTERS`、不列八家字面量、不按品牌 if/else——品牌面在旧包（边界钉锁死，
  出现新品牌 import 即红）。
- **不注册 entry-point**：pyproject 刻意零段（发现面归旧包，PA① 批文明示）。
- **不持声明资源**：`harnesses.toml` 归旧包（loader 只读它，不复制）。
- **不持 Profile 数据权威**：`ProfileStore` 只是插件侧通用件的现居地（等价抽离）；
  权威切换/数据迁移归 BE-PROFILE-001，**从未获批**（板 D 红线：本轮仅等价抽离/接口收窄/兼容接线）。
- **不实现主机通用能力**：文件/终端/沙箱/凭据库/策略/编排一律声明+委托，缺声明＝答 `-32601`
  而不是造私有兜底（BE-H-MINIMAL-001 强制条款，边界钉锁死）。
- **无协议帧层/驱动/部署资产**（`runtime`/`deploy`/`third_party` 物理在旧包源码树）。
- **不扩能**：不新增能力、不改公开投影（Half-B B2 公开面列板 D 基线后）。

## 3. 公开接口

- **pyproject**：`name=agent-box-harness`、`version=2.0.0a1`、`requires-python>=3.10`、
  `dependencies=["pacthold==2.0.0a1"]`（主机扩展 API）；**零 entry-points**（purpose 注释在文内）。
- **对生产链的现消费方式＝旧名面**（经旧包别名）；本包直接消费方＝旧包别名、
  6 工厂实现体、自身 tests。
- 主要符号：`create_plugin`＋6 工厂 · `HarnessAdapter`/`GenericCliAdapter` ·
  `build_registration` · `ProfileStore`/`GenericProfileManager`/`GenericProfileSelector` ·
  registry 装载/校验面。
- **非公开**：`generic/factory` 的 `ADAPTERS` 引用、`plugin` 的 Codex 凭据源导入（登记过渡缝）。

## 4. 依赖

- **→ 主机**：`agent_box.extensions`（`PluginContext`、`ResourceSelection`/`Selector*`、
  `runtime_composition` 错误码）；`agent_box.resource_contracts`（协议面）。
- **→ `pacthold==2.0.0a1`**（pyproject 声明的唯一依赖）。
- **→ 旧包三条登记过渡缝（AST 边界钉枚举到文件+形式，第四条即红）**：
  1. `generic/factory.py:9`——`from agent_box_harnesses.adapters import ADAPTERS`（引用唯一映射）；
  2. `plugin.py:15`——调用时 import `agent_box_harnesses.codex.credentials`（凭据源）；
  3. `registry/loader.py:51`——`find_spec("agent_box_harnesses")` **数据读** `harnesses.toml`。
- **无循环**：core-first / core-last / 四种 import 次序子进程钉成立（34P 内）；别名机制保证
  两名下每实现文件**恰好一个模块对象**（防双 `REGISTRY`／跨边界 `isinstance` 失败）。

## 5. 测试命令（全部刚跑读数）

| 面 | 命令（cwd＝源码树根，PY 写零配方） | 读数 |
| --- | --- | --- |
| 身份＋边界钉 | `PYTHONPATH=src:$(ls -d plugins/*/src\|paste -sd: -):<venv-sp> python3.12 -m pytest plugins/agent-box-harness/tests/ -q -p no:cacheprovider` | **34 passed**（20 模块名双名同一对象＋`REGISTRY`/`ProfileStore` 同一对象＋四 import 次序子进程＋核心零品牌/零私有兜底 AST 钉） |
| 等价与行为面（旧包 tests，消费核心实现） | 同前缀 `… pytest plugins/agent-box-harnesses/tests/ --ignore=…capability_declarations --ignore=…dsh_production_template -q` | **7f/146p/3s**，FAILED-ID 与 PA1 基线逐字节同 |
| node 门（运行时链在旧包目录） | `cd plugins/agent-box-harnesses && node --test tests/*.test.mjs tests/harness_remote/*.test.mjs` | **85/85** |
| 方言 093 锚 | `… pytest tests/server/test_native_materialization_093*.py` | **32 passed** |

## 6. 已知缺口（登记不隐匿；扩能/修码须批）

1. **两条 import 过渡缝＋一条数据读缝**未收敛——收敛归 P-B/P-C 另案候批（板 D：P-C/双链收敛另案）。
2. **双消费链不收敛**（entry-point 链 vs 直接链）＝PA① 保留裁定：re-export 门面保两链恒等即其价值。
3. **每-Harness 校验未做实**：`payload_schema` 零消费者、`validate_native_payload` 仅 `isinstance`
   （H11 §A6）——把声明变真校验器＝扩能须批。
4. **`ProfileStore` 权威问题挂 BE-PROFILE-001**（H11 §A1/A2：通用半迁独立能力的未来归属；
   既有 P1 disable 清 payload／P2 create 静默 upsert 两缺陷随登记，修码须另批）。
5. **`configuration_validator` 生产恒 `None`**（唯一构造点在 S 的 `bootstrap/runtime.py:757`
   不传；`TURN_OVERRIDES_INVALID` 不可达）——S 域事实，接线计划挂 H7 §4.3，须批（H11 §B3）。
6. 核心对品牌仅"引用"但**方向仍是核心→品牌**（过渡性）：目标形态（品牌包单向依赖核心）由
   P-B 试点起逐家迁移达成，不在本包现势主张内。
