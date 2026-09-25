# C 验收前置核对 · H P-B `27bf6c2` · 2026-09-22 07:27Z

状态：**内容与定向门通过；尚未入集成候选，CP-H-PB 终验待 a-3 后串行排根门**。H-033 已声明停写；本纸不提前宣称整批入候选。

- `27bf6c2` 的 10 路径全在 `approvals/PB-dsh-pilot-release.md` 白名单；H 树仅 `.qoder/` 未跟踪。候选 `2e69e3f` 与 H 父 `fa0d363` 在 `agent-box-harness(es)` 两插件路径差量为零。`git diff --check` 通过；`harnesses.toml`、`native_materialization.py`、两现有 pyproject、093 根钉均零改。
- 新旧 `deploy/dsh/settings.yaml` SHA-256 同为 `fe036abf…`；`loopback-guard.cjs` 同为 `5d3aaef3…`。
- C 在 H 源树与候选基线串行同命令验证：集成 `.venv` Python 3.12，`PYTHONDONTWRITEBYTECODE=1`，`PYTHONPATH=src:<全部插件 src>:/usr/lib/python3/dist-packages`（系统 PyYAML 6.0.3），pytest `plugins/agent-box-harnesses/tests/ plugins/agent-box-harness/tests/ tests/server/test_native_materialization_093.py --tb=line -rf -p no:cacheprovider`。基线 **1F/279P/3S**，H 提交 **1F/281P/3S**；失败 ID 均为 `test_skill_projection.py::test_all_five_registry_targets_are_lossless_and_read_only`，新增 2 钉通过。此环境还实际收集并运行了 H 自树因缺 yaml 跳过的 dsh/声明测试，未新增红灯。
- 以上是 P-B 定向等价与独立包形证据；a-3 终合批未过，H 全量根门未排。后续候选合入顺序固定为 a-3→P-B，逐批同环境失败 ID 对照。
