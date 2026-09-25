# 包说明 — `agent-box-harnesses`（旧包·兼容入口与品牌面）

> 交付位＝`control/reports/BE-LOOP-001/baseline/packages/harnesses.md`（本件落本组
> `harness/reports/baseline-packages/` 镜像目录，**请 C 落盘**——control 由 C 唯一管理，H 零直写）。
> MB-1c（task-board B 区，owner H，六项格式）· 绑定 HEAD `fa0d363`（候选链：`3c69770`＝20 增量 tip＋P-A② 在码）·
> 全部读数 2026-09-22 刚跑实测，非复述。

## 1. 职责

- **品牌面唯一持有者**：`ADAPTERS` 八家映射（`adapters/__init__.py`，全仓一份）；8 家 family 包
  （`{codex,claude,dsh,hermes,kilo,opencode,pi,qwen}/`：`production.py` 部署模板消费、provider、
  façade）；每家方言事实 `<family>/native.py`（P-A② `fa0d363`：`DIALECTS`＋`NATIVE_TARGET`，引证注释在旁）。
- **声明资源所有者**：`harnesses.toml`（`[harness.profile]` 13 字段 ×8 家＋驱动/能力声明段）——
  核心 loader 从此**按字节读取**（`find_spec`+路径读，不执行本包）。
- **兼容入口（薄、单向委托、零第二实现）**：20 个旧模块名＝核心模块的**同一模块对象**
  （`sys.modules[__name__] = …` 别名，实测 20/20；每实现文件两名下恰好一个模块对象）；
  `create_plugin` 经 PEP 562 惰性转发（防 PA① 抽离引入的 core-first 导入环，反例写在该文件 docstring）。
- **发现面**：pyproject 6 个 `agent_box.plugins` entry-point（`harness-profile-store`＋5 家族）——
  发现面自 PA① 起**不变**（核心 pyproject 刻意零 entry-point）。
- **方言引擎与聚合点**：`native_materialization.py`——引擎（词表/typed 拒绝/`materialize_family`
  分派/`render_*`×5）＋P-A② 后的**唯一品牌接触点**（两表经 8 行显式 import 聚合，ADAPTERS 同位阶）。
- **部署与 vendored 资产**（物理在本包源码树，随插件 bundle 分发）：`runtime/**`（worker/驱动接缝）、
  `deploy/**`（opencode 原生驱动等模板）、`third_party/harness_remote/**`（vendored ACP 桥，
  `SOURCE.json`+`PATCHES.md` 溯源＋运行时哈希校验）——物理位置被 S 的 `sidecar_bundle_files()`
  与 `sandbox_port.py` 钉死，**搬家＝跨组契约变更另议**。

## 2. 非职责

- **零第二实现**：全部实现在核心 `agent-box-harness`，本包只持别名与家事实数据（无复制体）。
- **不持 Profile 数据权威**：`ProfileStore` 实现已在核心（本包为别名）；权威切换归 BE-PROFILE-001，
  **从未获批、本轮不做**（板 D 红线）。
- **不持协议帧层与驱动语义**（帧/桩在 `third_party/` vendored 面，属插件 owns native semantics，
  但本包 Python 侧不实现 ACP 协议机）。
- **无凭据内容面**：凭据只经 env 引用注入；驱动诊断过 `redact`；秘密只记 locator。
- **不做数据迁移、不新增管理语义、不扩能**（dsh/qwen/kilo 无 entry-point＝能力缺席，登记不补）。

## 3. 公开接口

- **旧名 import 面（全部保持）**：`agent_box_harnesses.{registry,generic,resources,adapters}.*`、
  8 家 family 子包、`plugin`/`entrypoints`、`native_materialization`。
- **`nm.*` 公共面（P-A② 钉死不移）**：`CANONICAL_PROTOCOLS`（4 值）、`translate_protocol`、
  `is_pinnable`、`materialize_family`、`NativeMaterializationError`、`render_{codex_provider_section,
  pi_provider,claude_env,opencode_provider,hermes_config}`。
- **`create_plugin`**（惰性）、**`ADAPTERS`**（八家，一份）、**`harnesses.toml`** 资源路径。
- **6 个 entry-point**（发现面＝公开协议，改＝扩能须批）。
- **私有（非公开，钉可直读）**：`_FAMILY_DIALECTS`/`_NATIVE_TARGET` 聚合表。

## 4. 依赖

- **旧→新单向**：全部别名指向 `agent_box_harness`（本包→核心；反方向仅下述三条登记缝）。
- **→主机**：`agent_box.extensions`（selector 的 `ResourceSelection` 等类型；envelope 管理器在主机）。
- **核心→本包的三条过渡缝（全部登记、AST 边界钉枚举，出现第四条即红）**：
  1. `generic/factory.py:9` import `ADAPTERS`（品牌映射引用，非复制）；
  2. `plugin.py:15` 调用时 import Codex 凭据源；
  3. `registry/loader.py:51` `find_spec("agent_box_harnesses")` **数据读** `harnesses.toml`（不执行包）。
- **无循环**：core-first/core-last 四种 import 次序由子进程身份钉验证（34P 内）。
- **→ S 域（部署契约）**：`runtime/**`+`third_party/**` 物理路径被 `sidecar_bundle_files()`
  （按 `--plugin-root`）钉死。

## 5. 测试命令（全部刚跑读数）

| 面 | 命令（cwd＝`plugins/agent-box-harnesses` 除外注明） | 读数 |
| --- | --- | --- |
| 插件 pytest（源码树根，PY 写零配方） | `PYTHONPATH=src:$(ls -d plugins/*/src\|paste -sd: -):<venv-sp> python3.12 -m pytest plugins/agent-box-harnesses/tests/ --ignore=…/test_capability_declarations.py --ignore=…/test_dsh_production_template.py -q -p no:cacheprovider -rf` | **7f/146p/3s**（7 既有红单列：hermes 模板×6 同源 yaml＋skill_projection×1；两 ignore 文件缺 PyYAML＝环境事实） |
| 插件 node 门 | `node --test tests/*.test.mjs tests/harness_remote/*.test.mjs` | **85/85** |
| 093 方言锚（源码树根） | `… pytest tests/server/test_native_materialization_093*.py` | **32 passed，GREEN_NO_SKIPS** |
| 核心身份/边界钉 | `… pytest plugins/agent-box-harness/tests/` | **34 passed** |
| 等价钉（P-A②） | 含于插件 pytest 面 | 17/17 |

## 6. 已知缺口（登记不隐匿；扩能/修码须批）

1. **8 个 adapter 全为 `pass` 壳**；`dsh`/`qwen`/`kilo` 无 entry-point＝能力缺席登记（板 B 裁定不补）。
2. **校验缺口**：8 家 `*-profile-v1` 的 `payload_schema` 解析后**零消费者**；`validate_native_payload`
   仅 `isinstance(dict)` ⇒"原生配置不支持 vs 配置无效"今日不可分（H11 §A6；扩能须批）。
3. **核心→品牌两 import 缝**待 P-B/P-C 收敛（H11 §A8；另案候批）。
4. **`dsh/production.py:50` 顶层 `import yaml`**：本包 `dsh/__init__` 已按 P-A② 申报惰性化
   （H11 §C4）；production 本体依赖未解，dsh 独立成包时一并处置。
5. **幽灵契约** `agent-box.opencode-profile@1`（`opencode/provider.py:24`，全仓仅定义行）——［待裁］（H11 §B5）。
6. **hermes/opencode façade 仅测试实例化**（自建 authority 报写点＝反向漂移面，H11 §B8）。
7. **`materialize_family` 零生产调用方**（能力存在未接线；接线归消费侧，H11 §A7）。
8. **两条同名 `HarnessRegistry`**（主机 `server/execution/__init__.py:100` vs 核心 loader）互不灌数据——
   同名≠重复，不合并（H11 §B4）。
9. `test_capability_declarations.py`/`test_dsh_production_template.py` 在无 PyYAML 环境
   collection error（既有；权威门环境具备 PyYAML，由 C 覆盖判据 4）。
