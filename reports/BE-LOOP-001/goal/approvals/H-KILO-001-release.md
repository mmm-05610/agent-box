# H-KILO-001 · kilo Agent 接入包等价抽离批文（第三格）

C · 2026-09-22 13:02Z · 基线 backend integration **`d12aa9791464f1e8c0b680960dc1b126090d1beb`**（qwen 已验收集成，`CP-H-QWEN.md`）。
H 为本批唯一产品码写者。H 原 `work/be-goal-harness-0@7a1b2699` 已停写并保留；**请在 H 组
`work/` 下新建从本基线出发的隔离任务树（新分支，不复用旧分支），先报树路径/HEAD/clean，
ACK 后再实施。**本轮 H 会话为 Flash 接替；恢复后须重新 ACK，不写旧任务。

依据：H-038 先报（绑 `7a1b2699` 只读实测）＋样本件 `PB-dsh-pilot-release`、
`P-QWEN-001-release`。方案＝字节平移＋薄别名，零新增能力、零 EP、零发现面变化。

## 允许的精确路径（10 条，其余须另报）

新增 6：
- `plugins/agent-box-harness-kilo/pyproject.toml`
- `plugins/agent-box-harness-kilo/src/agent_box_harness_kilo/__init__.py`
- `plugins/agent-box-harness-kilo/src/agent_box_harness_kilo/production.py`
- `plugins/agent-box-harness-kilo/src/agent_box_harness_kilo/native.py`
- `plugins/agent-box-harness-kilo/deploy/kilo/kilo.json`
- `plugins/agent-box-harness-kilo/deploy/kilo/egress-guard.c`

修改 4：
- `agent_box_harnesses/kilo/__init__.py`（→预注册式 3 行同对象别名）
- `agent_box_harnesses/kilo/production.py`（→别名；先报两处改码行 `:37` 核心 import、
  `:71 PLUGIN_ROOT=parents[2]` 随迁落地于新包）
- `agent_box_harnesses/kilo/native.py`（→别名）
- `tests/test_family_dialect_tables.py`（扩钉）

明确不动：`harnesses.toml`、两 pyproject EP、聚合器（nm 家方言表零改）、
`test_kilo_production_template.py`（**零改硬验收**：编译门 `cc -ldl`、`aliases⊆families`
漂移断言、`REPO`/`RUNTIME` 自算路径全部原样仍绿）、`test_capability_declarations.py`、
093 两文件、`render_*`/分派、`runtime/**`、`third_party/**`、dsh/qwen 已交付面、核心包、
其余各家（codex/pi/hermes/claude 逐家候批）、**三份旧 deploy 资产**
（处置见 `decisions/H-old-assets-disposal-ruling.md`，本批不删）。

## 等价与边界要求

- 旧/新模块对象身份 `is` 全链为真；旧三文件零 `def`/`class` 第二实现；依赖方向唯一新边
  ＝kilo 包→核心；`__init__` 急切形态原样随迁（零形态变化）。
- `kilo.json` 与 `egress-guard.c` 迁移前后逐字节哈希对；`kilo.json` 渲染期读取须落新包。
- 能力缺席保持：零 EP、空方言表显式、无新增配置面。

## 硬验收（H 定向跑，报告同环境读数）

① 前缀树红-绿（新包缺席→新钉红；只退本批面，sha 回退核对）；② 四链 `is`＋nm 穿透＋
双键单对象；③ 零 EP＋单依赖 pyproject 冻结钉＋禁双实现反例；④ 资产哈希对（2 文件）；
⑤ 插件面同形树 FAILED-ID 与 PA1 基线一致（`7f/151p/3s` 口径只增不减）＋093 零改仍绿＋
node 85/85＋公开面 diff 空；**kilo 特有三枚**：⑥ 编译门零改且绿；⑦ `aliases⊆families`
漂移断言零改且绿；⑧ `kilo.json` 渲染读新包＋模板哈希对。

## 纪律

提交仅显式暂存上述 10 路径，不 add -A、不 push、不触用户数据或服务、不改公开语义。
`HANDOFF_READY` 须含：精确提交、逐路径差量摘要、测试环境/命令/结果（含同环境既有
FAILED/ERROR/skip/xfail ID）、已知问题、**明确停止写入**。C 收停写回执后独立串行根门、
合入。全量测试归 C 唯一排队。守望器已死：会话内自行守候 inbox，无消息时如实 IDLE。
