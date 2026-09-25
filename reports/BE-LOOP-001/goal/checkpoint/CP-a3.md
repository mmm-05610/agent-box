# CP-a3 · S⊗E a-3 终线合批验收

C · 2026-09-22 07:42Z · 后端 integration `integration/linux-native-0` **`f8bdf3fd17a2dce667e8608fe4419b9a9306dda6`**（父基线 `2e69e3f`，快进；未触 publishing main、未 push）。候选工作树 clean，与隔离验证树 `f8bdf3fd` 字节同一 HEAD。

## 来源与写权

- S `work/be-a3-1`：原 a-3 栈 `8385407^..0578115`，终续修 `df3bb00f`（`test_delegation.py` 父权限先设后冻结），S 两次 HANDOFF_READY/停写回执在 `goal-server-20260922-a3-takeover-handoff.md` 与 `goal-server-20260922-a3-terminal-followup.md`；S 树 clean。E `work/be-goal-execution-0`：`92ede84`、`e08c001`、`90b8a77`，E-058 停写回执；E 树仅 `.qoder/` 未跟踪。
- C 仅在 `/tmp/ordessa-a3-codex-verify` 自建隔离树按 S 栈→E 三枚→S `df3bb00f` 组装。唯一内容冲突 `server/execution/delegation.py` 子 turn INSERT：S 的 `captured_profile_revision` 与 E 的 `execution_key` **两列、两值并存**，SQL 占位数随之为 7；零新默认/回填/公开字段。候选与原 `2e69e3f` 差量恰 20 路径，均为 a-3 批文及续修已交路径，`git diff --check` 通过。
- 首次合批定向发现 `test_the_parents_denials_narrow_the_child_and_its_own_allow_set_stands` 新红：S 旧夹具先发布父 Turn、后设 plan/webfetch deny，与 K3' 冻结语义冲突。C 只退这一枚给 S；S `df3bb00f` 改为先设权限再接受父 Turn，**原 deny/ask/inheritedFrom 行为断言不动**，单 ID C 复跑 1P/0skip。没有由 C 代 S 提交仍在写的文件。

## 权威根门与差量

同一沙箱、同一 integration `.venv` Python 3.12、`PYTHONDONTWRITEBYTECODE=1`、`PYTHONPATH=src:<本树全部 plugins/*/src>`、`pytest tests/ -q -p no:cacheprovider -rf --tb=line`，**串行**：先合批隔离树，再原候选 `2e69e3f`。各自原始日志 SHA-256：基线 `f59ea0b5…`，合批 `48bcc6eb…`；日志在 `/tmp/a3-codex-{baseline,merged}-root.log`，红灯 ID 持久摘录在 `baseline/evidence/a3-{baseline,merged}-red-ids.txt`。

| 树 | FAILED | PASSED | SKIPPED | ERROR | XFAIL/XPASS |
| --- | ---: | ---: | ---: | ---: | ---: |
| `2e69e3f` | 37 | 1379 | 45 | 2 | 0/0 |
| `f8bdf3fd` | 35 | 1399 | 45 | 2 | 0/0 |

`comm -3` 逐 ID 结果：**零新增 FAILED/ERROR**；仅基线两枚 `test_child_limits_production_path_136.py::{test_model_widening_is_rejected_on_the_production_path,test_pinned_model_is_accepted_and_unpinned_child_is_not_over_rejected}` 在合批转绿。两枚 ERROR node ID 均为 `test_claude_bridge_production` 的同名 setup 错误。其余共同 FAILED ID 未改名；错误摘要差异除上述两枚 `_FakeRegistry not iterable` 消失外，仅 worker 缺席路径随 worktree 根变化。既有红灯包括本沙箱 bwrap namespace 权限、worker 二进制/claude 缺席、PyYAML 缺席及本机 workspace capability；**不宣称全绿，也不把环境红误算成产品修复**。

本批 a-3 到此闭合。全量根门下一批仍由 C 串行排队；H P-B `27bf6c2` 尚在分支，另以 `CP-H-PB-preflight.md` 前置核对，须单独集成/验收。
