# 包说明 — `agent-box-harness-dsh`（第一格 Agent 接入插件包 · dsh）

> 交付位＝`control/reports/BE-LOOP-001/baseline/packages/agent-box-harness-dsh.md`（本件落本组
> `harness/reports/baseline-packages/` 镜像目录，**请 C 落盘**——control 由 C 唯一管理，H 零直写）。
> MB-1c 续件（六项格式）· **状态分清**：本包已随 **P-B 验收入 C 集成 `fe67317b`**
> （`checkpoint/CP-H-PB.md`：插件/093 同形 1F/279P→1F/281P 同 ID；根门相对 a-3 FAILED/ERROR ID 完全同一）·
> 源码提交＝H 树 `27bf6c2`（停写）· 绑定读数 2026-09-22 刚跑。

## 1. 职责

- **dsh 家族面唯一实现体**（字节平移自旧包 `agent_box_harnesses/dsh/`，M1-P-A① 起"实现唯一"纪律的首格样本）：
  - `production.py`（301 行）：部署模板渲染——`settings_document`/`render_settings_document`（YAML 渲染，PyYAML **函数内惰性** import，批文 `PB-dsh-pilot-release` §②）、`deployment_document`/`harness_deployment`/`projection_files`（投影 1 条：`deploy/dsh/settings.yaml`）、`capability_claims`（经**核心** registry 派生，非复制）、`model_aliases`/`native_model` 等 25 公开名。
  - `native.py`：家方言事实（P-A② 空表＋`NATIVE_TARGET=None`＝"未 pin 即拒"家规显式）。
  - `__init__.py`：PEP 562 惰性 facade（25 名冻结；惰性动机＝yaml 反例防线，随实现迁入）。
  - `deploy/dsh/{settings.yaml, loopback-guard.cjs}`：随迁资产（模板哈希对 `fe036abf…`/`5d3aaef3…` 逐字节）。
- **能力缺席保持**：零 entry-point（pyproject 刻意无段）；发现走未动的 `harnesses.toml dsh 段`（P-C 领地）。

## 2. 非职责

- 不持 Profile 权威／不做协议帧层／无凭据面（env 引用注入）／不扩能不加依赖（pyproject 仅 `pacthold==2.0.0a1`，**未加 PyYAML**＝再分发闭包宽度不变）。
- 不做通用职责下沉：`capability_claims` 经核心 import 消费；无 ProfileStore/ADAPTERS/entry-points（钉锁死，违禁词 0 命中）。
- 不动发现面/声明面（`harnesses.toml`、聚合器、`render_*`/分派、093 锚——均旧包零改）。

## 3. 公开接口

- **新包 import 面**：`agent_box_harness_dsh.{production, native}`＋惰性 `agent_box_harness_dsh.<25 名>`。
- **旧名兼容入口（薄、同对象）**：`agent_box_harnesses.dsh.{production, native}` 与包名本身＝**预注册式 3 行别名**（子模块先入 `sys.modules` 再替换包名；双键双名、值同一对象——四链 `is` 钉死）。
- pyproject：`name=agent-box-harness-dsh`、`2.0.0a1`、单依赖、**零 entry-points**（冻结钉锁死）。

## 4. 依赖

- **→ 核心** `agent_box_harness.registry.capability_claims`（家→核心方向＝目标包形本身，申报改码①）。
- **→ 旧共享包**：仅经 `native_materialization` 聚合一行（ADAPTERS 同位阶唯一品牌接触点，经别名落本包对象）。
- **→ 部署根契约（已知缝，见 §6-1）**：`projectionFiles` 的 `source="deploy/dsh/settings.yaml"` 为 plugin_root 相对路径，运行时由 `bootstrap/runtime.py:_sidecar_deployment_file(root=plugin_root, …)` 读取——**plugin_root 语义仍指旧包根**（`runtime/**`/`third_party/**` 同根被 S 钉死），故旧包该资产是活投影源（见 §6-1）。
- 无循环（四 import 次序子进程钉、双键单对象钉在插件面 19 枚等价钉内）。

## 5. 测试命令（刚跑读数）

| 面 | 命令（源码树根，PY 写零配方） | 读数 |
| --- | --- | --- |
| 插件面同形树 | `… pytest plugins/agent-box-harnesses/tests/ --ignore=…capability_declarations --ignore=…dsh_production_template -q -rf` | **7f/151p/3s**，FAILED-ID cmp==PA1（7 既有红单列） |
| 等价/身份钉（含本包） | 含于上行；本包贡献＝P-B 2 钉（四链同对象、零 EP 冻结） | 19 枚族钉全绿 |
| 093 方言锚 | `… pytest tests/server/test_native_materialization_093*.py` | **32 passed 零改** |
| node 门 | `cd plugins/agent-box-harnesses && node --test tests/*.test.mjs tests/harness_remote/*.test.mjs` | **85/85** |
| 核心身份/边界 | `… pytest plugins/agent-box-harness/tests/` | **34 passed** |

## 6. 已知缺口（登记不隐匿）

1. **旧 `deploy/dsh/settings.yaml` 是活投影源**（2026-09-22 只读核查，答 C 07:54Z 问）：运行时经 `plugin_root`（旧包根）读取——**须兼容保留**；等价移除＝`SETTINGS_SOURCE` 改指新包可解析路径＋plugin_root 语义跨包，属 **S 域契约变更，须另批、C 协调 S**。**H 未删、不自行删。**
2. **旧 `deploy/dsh/loopback-guard.cjs` 运行时零消费**（`LOOPBACK_GUARD` 常量零引用、bootstrap 三处 source 读取不含它、测试断言走新包路径、打包不含）——**候选等价移除**，候 C 另批（本批白名单不含删除）。
3. `test_dsh_production_template`/`test_capability_declarations` 两测试**文件自身** `import yaml` → 本环境 collection error（环境事实，状态不变；权威门环境有 yaml）。
4. 渲染调用面（YAML 两函数）需 PyYAML 环境才可跑＝与今日同（惰性化只改 import 时机不改调用需求）。

## 7. 样本件纪律（供后续家引用）

字节平移＋逐批文申报改码（本家＝三处：registry 直指/模板路径层/yaml 惰性）＋零 EP＋预注册别名＋哈希对＋五件验收＝**后续各 Agent 接入包一批一径的复制模板**；差异处（无 yaml 家、急切 `__init__` 家、多资产家）由各家先报点名，不照抄失真。
