# 包说明 — `agent-box-harness-qwen`（第二格 Agent 接入插件包 · qwen）

> 交付位＝`control/reports/BE-LOOP-001/baseline/packages/agent-box-harness-qwen.md`（本件落本组
> `harness/reports/baseline-packages/` 镜像目录，**请 C 落盘**）。MB-1c 续件（六项格式）·
> **状态分清**：本包＝H 树停写提交 **`7a1b2699`**（父 `27bf6c2`，9 路径＝批文
> `P-QWEN-001-release.md` 逐字对），**候 C 下一格独立验证**——尚未入集成（C-notice 07:54Z 口径）·
> 绑定读数 2026-09-22 刚跑。

## 1. 职责

- **qwen 家族面唯一实现体**（字节平移自旧包 `agent_box_harnesses/qwen/`，第二格样本件）：
  - `production.py`（≈250 行，12 函数/类）：部署模板渲染——`deployment_document`/`harness_deployment`/`loopback_environment`/`model_aliases`/`native_model`/`projection_files`（**恒返空元组**＝env-only 家规一手证据）/`capability_claims`（经核心派生）等。
  - `native.py`：家方言事实（P-A② 空表＋`NATIVE_TARGET=None`）。
  - `__init__.py`：**急切** `from .production import …`（24 导出原样字节平移——惰性动机＝yaml，本家无 yaml，**零形态变化**）。
  - `deploy/qwen/loopback-guard.cjs`：随迁单资产（哈希对 `85ec7770` 逐字节）。
- **能力缺席保持**：零 entry-point；发现走未动的 `harnesses.toml qwen 段`（P-C 领地）。
- **qwen 特有反例保持**：`settings.json` **不存在**断言（env-only：qwen 首启自规整设置文档、只读投影会 EBUSY——一手门发现写在 `projection_files` docstring）。

## 2. 非职责

- 同 dsh 格：无 Profile 权威／无帧层／无凭据面／不扩能不加依赖（pyproject 单 pacthold）／通用职责不下沉（违禁词 0 命中）／发现与声明面零动。
- **无 yaml 第三处申报不适用**（本家恰两处改码，见 §4）。

## 3. 公开接口

- **新包 import 面**：`agent_box_harness_qwen.{production, native}`＋急切 24 导出（`agent_box_harness_qwen.<NAME>`）。
- **旧名兼容入口（薄、同对象）**：`agent_box_harnesses.qwen.{production, native}` 与包名＝预注册式 3 行别名（四链 `is`＋nm 穿透钉死；24 导出经别名可达＝急切形迁移等价的关键钉）。
- pyproject：`name=agent-box-harness-qwen`、`2.0.0a1`、单依赖、**零 entry-points**（冻结钉锁死）。

## 4. 依赖

- **→ 核心** `agent_box_harness.registry.capability_claims`（申报改码①，家→核心）。
- **→ 旧共享包**：仅经 `native_materialization` 聚合一行（经别名落本包 `DIALECTS`）。
- **→ 部署根**：`projection_files()` **恒空** ⇒ **无投影 source、无 plugin_root 读取依赖**（与 dsh 的 §6-1 缝**无关**——qwen 旧资产无活投影源问题）；`PLUGIN_ROOT parents[3]→parents[2]`（申报改码②）使 `DEPLOY_DIRECTORY` 指本包 `deploy/qwen/`。
- 无循环；`runtime/**` 硬编码旧包的测试路径不受影响（runtime 不迁）。

## 5. 测试命令（刚跑读数）

| 面 | 读数（命令同 `harnesses.md` §5 配方） |
| --- | --- |
| 插件面同形树 | **7f/151p/3s**，FAILED-ID cmp==PA1（+3 新钉：身份链/零 EP 冻结/**禁双实现**〔旧面无 def/class、真身唯一在新包〕） |
| **`test_qwen_production_template` 零改且绿（qwen 特有硬验收）** | **13 passed**、`git status` 对该文件 0 行（含 `settings.json` 缺席反例；`production.DEPLOY_DIRECTORY` 跟随迁移、`REPO=parents[3]` 自算不受影响） |
| 前缀树红-绿 | 新钉**恰 3 红**（红因＝新包缺席，sha 回退三枚 SAME）、19 枚族钉绿 |
| 093／node／核心 | 32P 零改／**85/85**／34P |

## 6. 已知缺口（登记不隐匿）

1. **旧 `deploy/qwen/loopback-guard.cjs` 运行时零消费**（2026-09-22 只读核查，答 C 07:54Z 问）：qwen `projection_files()` 恒空、`LOOPBACK_GUARD` 常量在 production 内零引用、bootstrap 三处 source 读取不含它、测试断言走新包路径、打包不含 ⇒ **候选等价移除**，候 C 另批——**H 未删、不自行删**。（与 dsh 差异：dsh 旧 `settings.yaml` 是活投影源须保留，qwen 无此约束。）
2. `test_capability_declarations` 该文件 collection error（环境事实，状态不变）。
3. qwen 先报"新增 6"计数笔误已认账（批文 9 条＝新增 5＋修改 4 为权威）。
4. 候 C 独立验证后方入集成（本包现停写于 H 树）。

## 7. 与首格（dsh）差异速览（防模板照抄失真）

| 维度 | dsh（已集成 `fe67317b`） | qwen（停写 `7a1b2699` 候验） |
| --- | --- | --- |
| yaml | 顶层→两函数惰性（申报③） | **无 yaml，恰两处改码** |
| `__init__` | 惰性 facade 随迁 | **急切原样字节平移（零形态变化）** |
| 资产 | 2 文件（settings.yaml 活投影源＋guard） | 1 文件（guard，零运行时消费） |
| 投影 | 1 条 source→plugin_root 旧包读（§6-1 缝） | **恒空，无投影依赖** |
| 活绿硬验收 | dsh 模板测试＝collection error 环境事实 | **`test_qwen_production_template` 13P 零改** |
