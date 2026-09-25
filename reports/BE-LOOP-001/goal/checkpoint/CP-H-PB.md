# CP-H-PB · dsh 第一格 Agent 接入包集成验收

C · 2026-09-22 07:52Z · 后端 integration `integration/linux-native-0` **`fe67317b47e249ce2ac23dcab9087f2a8d778aab`**（父 `f8bdf3fd`，快进；工作树 clean；未 push/main）。H 源提交 `27bf6c2`（父 `fa0d363`）已按 H-033 停写，H 原树保持；C 在隔离树仅 cherry-pick 此枚，qwen 后继 `7a1b2699` 未混入本批。

## 内容和包边界

- 10 路径恰合 `approvals/PB-dsh-pilot-release.md`；新 `plugins/agent-box-harness-dsh/` 有真实三模块、pyproject 与两部署资产，零 entry point；旧 `agent_box_harnesses.dsh` 三文件为同对象薄别名，`native_materialization.py`/093/声明与发现面零改。新旧模板 SHA-256 分别同为 `fe036abf…` 与 `5d3aaef3…`，无资产复制差异。
- 新家包依赖通用 Harness 核心 `capability_claims`，yaml 仅在两渲染函数内惰性加载，模板定位随物理路径改为 `parents[2]`；没有第二份注册表/方言实现。能力缺席（dsh 零 EP）保持。`git diff --check` 通过。
- **资产暂留事实**：旧包 `plugins/agent-box-harnesses/deploy/dsh/{settings.yaml,loopback-guard.cjs}` 两文件仍被 Git 跟踪；本批白名单未批准删除。新实现的 `DEPLOY_DIRECTORY` 已指新包资产，旧副本未见当前 Python 生产读取，但“资产只有一份”尚未成立。后续须核消费方后独立裁定旧副本的兼容保留或等价移除；文档不得写成旧包物理 `deploy/dsh` 已不存在。

## 串行验证

1. **插件/093 同形门**：C 以 integration `.venv` Python 3.12、全部插件 src、系统 PyYAML 6.0.3（只通过 `/usr/lib/python3/dist-packages` 提供）运行 `plugins/agent-box-harnesses/tests/ plugins/agent-box-harness/tests/ tests/server/test_native_materialization_093.py`。父 `f8bdf3fd` 前置核验 1F/279P/3S，P-B 隔离树 **1F/281P/3S**，同一 FAILED ID `test_skill_projection.py::test_all_five_registry_targets_are_lossless_and_read_only`，新增两钉通过。原始 P-B 日志 `/tmp/pb-codex-plugin.log` SHA-256 `19636bb3…`；该命令实际收集了 dsh/声明两测试文件，没有因 H 单树缺 PyYAML 而略过。
2. **全量根门**：C 用 CP-a3 同一沙箱/`.venv`、动态全部插件 src、无附加 PyYAML 路径，串行跑 `pytest tests/ -q -p no:cacheprovider -rf --tb=line`。父 `f8bdf3fd` **35F/1399P/45S/2E**，本批 `fe67317b` **35F/1399P/45S/2E**，XFAIL/XPASS 皆 0；FAILED＋ERROR ID 逐字相同（摘录 `baseline/evidence/pb-root-red-ids.txt` 对 `a3-merged-red-ids.txt` 的 `comm -3` 空）。日志 `/tmp/pb-codex-root.log` SHA-256 `2f6299fe…`。既有环境红灯仍单列，不宣称全绿。

P-B 终验闭合。旧 `packages/harnesses.md` 的 dsh 内容/读数需据 H-034 更正；新 `packages/agent-box-harness-dsh.md` 需收编。后继 qwen 已交 `7a1b2699`，须独立验收后再合入。
