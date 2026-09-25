# I 初审 LNX-002

2026-09-21。状态：SOURCE_SNAPSHOT_VERIFIED / CHANGES_REQUESTED。
两仓源码合流确已形成；尚未接受为通过验证的开发基线。

## I 实测

- backend HEAD：4f4587afb5a74b7e9e22435335809b7772f0d3ea。
- desktop HEAD：99a9d09f539aef9ace5cc5eca60458d3980d7778。
- 两个候选树 git status --short 为空。
- 两仓 schema 文件 sha256 相同：
  b1eb4762b2a8e13e873967b770854e5e73a948488d4d066da07bc584e693dcd1。
- I 在 backend 的现有 .venv 中设置 PYTHONPATH=src 加各 plugins/*/src，运行：
  `python -m pytest -q -p no:cacheprovider tests/server/test_artifact_absence_is_not_green_118.py tests/server/test_harness_sidecar.py::test_public_post_open_error_with_the_same_code_keeps_ambiguous_semantics tests/server/test_terminal_reason_consumer_134.py`
  得到 **3 failed / 24 passed，退出 1**，耗时 3.03s。
  首次未设 PYTHONPATH 时收集失败（agent_box 无法导入），未当测试结果。

## 返修（原 LNX-002 写者继续；I 不改候选代码）

1. **测试结论假绿**：上述有三个失败且零 skip，终端摘要仍打印
   `VERDICT=GREEN_NO_SKIPS`。检查 tests/conftest.py 到 artifact_presence 的
   失败计数传递；补失败/收集错误等适用情况的回归，进程退出码与自定义结论
   不得矛盾。不能只隐藏摘要或把所有 absent 情况改 skip。
2. **skip 扫描误报**：118 将普通 `terminal_reason="max_tokens"` 参数当作 skip
   原因，两处分别在旧测试 :75 与新增测试 :105。修复分类入口识别，保留真正
   pytest.skip/skipif/importorskip 的守卫；不要给 max_tokens 硬加 skip 分类。
3. **工件存在检查**：118 的另一个失败明确是缺 worker-debug/release/musl 与
   acp-npm-closure；分类为工件准备缺口，报告准确命名。本轮可继续明确阻塞，
   不要求拷贝旧树隐藏工件来制造通过。
4. **错误分类失败**：sidecar 用例并非断言 status=ready，而是预期 EXECUTION_FAILED、
   实际 CAPABILITY_REQUIREMENT_UNSATISFIED（test_harness_sidecar.py:1057）。
   查清实际是否到达 open_execution、是否提前能力门拒绝，保留 pre/post 对照。
   修正真实原因，不能直接把期望改成当前错误码；若需扩大产品语义范围，记录
   证据交 I。仅源文件相同不足以证明依赖整合后行为也是源线既有缺陷。
5. **截断链未完整验证**：新增测试直接调用 complete_turn 并读 execution_state，
   只覆盖 DB→投影。补独立 ACP fixture 模式，使 max_tokens 经实际 JS prompt
   返回和 Python 完成路径入库；保留 end_turn、cancel 对照。不需要真实模型。
6. **报告与重现**：source-checkpoint.md 直接固定最终两仓完整 SHA，不引用 live
   status 值。24 个失败的表格实际计 19 环境 + 2 既有归因待证 + 3 未解决，
   与摘要 18+2+4 矛盾，按最终结果重算；修复前后减少数量不证明都由合并引入。
   保存可执行的环境/生成命令；protocol.md 的 <tmp>/<gen.mjs> 占位描述还不是
   可直接复现入口。加入项目内可执行生成入口或完整明确步骤，验证当前摘要重现。
7. **候选树指令收敛**：backend/AGENTS.md 仍宣称旧 docs/implementation 是唯一
   权威、Windows 必须持有数据。将两棵新树中的过期调度入口明确标为历史，
   指向 control 当前规则，保留仍适用的工程约束；不修改原工作树或删除历史。

缺工具/下载失败的测试仍如实分账；完成返修再交独立 Sol 审阅。
允许本次列出的集成验证工具/测试/候选指令修复，原 D-0018 边界不变。
旧报告保留追溯，在自己的报告追加修订与新提交，不回写 I 的审阅文档。

## 时间口径

执行日志 17:58–18:56 至少跨 58 分钟；末尾 9min39s 不是已证实的整个任务耗时。
