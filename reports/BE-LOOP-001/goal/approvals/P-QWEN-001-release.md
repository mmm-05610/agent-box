# P-QWEN-001 · qwen 独立 Agent 接入包批文

C · 2026-09-22 07:34Z · 依据 H-034 先报、已验 P-B 样本 `27bf6c2`。**H 源树基线 `27bf6c2`；C 集成基线仍为 `2e69e3f`，P-B 尚待 a-3 后串行入候选**。本批只允许等价搬迁，不补 qwen 能力/entry point，不改变发现或公开语义。

## 单写与逐路径

H 唯一写 `worktrees/backend-loop/harness/source` 中以下 **9 条精确路径**（H-034 的“新增 6”计数笔误；实列为新增 5、修改 4，以路径为准）：

- 新增 `plugins/agent-box-harness-qwen/pyproject.toml`
- 新增 `plugins/agent-box-harness-qwen/src/agent_box_harness_qwen/{__init__,production,native}.py`
- 新增 `plugins/agent-box-harness-qwen/deploy/qwen/loopback-guard.cjs`
- 修改 `plugins/agent-box-harnesses/src/agent_box_harnesses/qwen/{__init__,production,native}.py` 为旧名同对象薄别名
- 修改 `plugins/agent-box-harnesses/tests/test_family_dialect_tables.py` 加身份、零 EP 与禁双实现钉

实施只含：三模块与单资产真实搬迁；`production.py` 的 `..registry` 指向通用核心、`PLUGIN_ROOT parents[3]` 随目录变为 `parents[2]`；旧名预注册式别名保证包/production/native 两名同对象。`__init__` 保持既有急切形；新 pyproject 零 EP、现 pacthold 依赖照旧。`harnesses.toml`、聚合器、已有 qwen 测试、093、核心、dsh、其他家、`runtime/**`/`third_party/**` 均不得改。docstring 包名机械更正须 CHECKPOINT 点名。

## 验收与停点

H 自验：新旧/nm 对象身份与零重复实现；资产字节哈希对；`test_qwen_production_template.py` **零改且绿**、`settings.json` 仍缺席；新身份钉在前缀树红、完整树绿；插件面失败 ID 对 H 基线不增、093 32P、node 85/85、公开发现面 diff 空。H 只跑定向/插件面；**全量根门由 C 串行排**。新增 import/装配环、需要公开语义变化或批文外路径时停点报 C。交精确提交、路径、测试/已知项与**停写**回执；C 在 P-B 入候选后再集成此批。

Sol 不调用；禁 push/main/凭据读取/服务启停/数据清理。此批批准不放行其余 Agent 家族。
