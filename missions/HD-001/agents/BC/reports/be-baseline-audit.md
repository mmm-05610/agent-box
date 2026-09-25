# BC 旧账核查（BE-LOOP-001 vs HD-001 基线，2026-09-23 实测）

引用 C 报告 `agents/C/reports/baseline-facts.md` §4 与 `control/reports/BE-LOOP-001/{goal/task-board.md,baseline/map.md}`；git 事实为本会话在本树亲测。

## 1. 基线定位（实测）

- 本树 HEAD=`92a2d2ba`（分支 work/hd001-bc，clean）＝旧循环最后集成检查点 **MB-E2b lifecycle 集成**；`git merge-base --is-ancestor 321c883c 92a2d2ba` 通过 → **S2c1 已在基线**，README 声明一致。
- 旧循环恢复轮集成链：`d12aa979`(qwen)→`a67c47c9`(E2a)→`fe59016b`(S2a)→`0c042f54`(kilo)→`321c883c`(S2c1)→`92a2d2ba`(E2b)。基线后无未收集成。
- **S2c2（wire 物理包，13 路径）批文已发未交付**：分支 `work/be-s2c2-1` 在册（旧树 `worktrees/backend-loop/**` 仍在，未删）。wire 代码现 physically 位于 `src/agent_box/server/wire/{envelope,errors,handlers,projection}.py`（handlers.py 2364 行）。按 README：不假设已合，需要时按独立批次只读查证后引入。
- 未提交保护件在册：`work/be-b2-1`＝旧 b2 树 `ecf06a33` 带 S 未提交 delegation.py（+13 行 SIM 草稿，C 保护令：任何人不代提交）。b2＝公开字段延期批（B2-fields），HD-001 不触碰。
- 其余旧执行树/分支（e2a/e2b/kilo/guards/s2a/s2c1/goal-*）均已在基线内或停写归档；旧 Sol 审阅账 4/10 与本任务预算无关。

## 2. 旧循环已闭格与 HD-001 可复用成果

- 已合入基线可直接用：service facade（S2a）＋sessions 物理包（S2c1）＋execution 契约（E2a：九 DTO＋TurnExecutionPort 单实现）＋lifecycle 中立账（E2b：NeutralRunTracker/三态 cancel/first_run_lock）＋dsh/qwen/kilo 三家 Agent 接入包＋六资源包＋harness 通用核心（PA①）。
- 边界反例钉在册可跑：`tests/server/test_s_mb_service_boundary.py`(8)、`test_s_mb_sessions_boundary.py`(7)、`test_e_modular_execution_boundary.py`(11)、lifecycle pins(11)、`test_e_inc1b_b5_pins`；既有红灯＝本环境根门 20F 族（旧账 E2b 配对 20F/1465P/33S），HD-001 差量验收须同形树同环境配对。
- 延期登记不在本轮范围（README：不重做旧拆包路线）：B2 公开字段、bwrap 档 B、dsh settings.yaml、旧 deploy 三资产/scripts 遗留线、pi/hermes/claude/codex 逐家接入（**pi 先报已收讫**，H-044；实施批文候旧循环规则——HD-001 若需 pi/codex 闭环按本任务角色 H 重新核）。

## 3. 与 HD-001 章程的账面对齐结论

- 章程闭环所需品牌＝Pi/Codex 优先；基线只含 dsh/qwen/kilo 三家接入包。`plugins/` 实测 14 包中无 harness-pi/harness-codex 独立包（codex 语义现由 bwrap 模板/旧兼容面承载——待 H 查证）。**这是本组第一个跨包缺口**：基础闭环要 Pi/Codex，需 H 域接入批（旧 pi 先报可作为证据输入，批文须走 HD-001 C）。
  > **更正注记（2026-09-23 01:05，依 H-0004/H feasibility §0 与 BC 树实证；原文保留为历史）**：本条"缺口1"口径失真——Pi/Codex 在 legacy 单体 `plugins/agent-box-harnesses` 内**注册链全齐**（harnesses.toml codex:3/pi:371、ADAPTERS、entry-points、runtime vendor pin），且 2026-09-15 已在 Linux 真实模型全链门 exit 0。真缺＝①Linux 产品启动装配②两家 production CLI 各 2 行坏码③显式 profile seeding（既有 wire 方法）④codex luna 参数单列⑤持久 SecretStore（章程禁区，今晚走 MemorySecretStore 现役路径）。两批性质＝**"启用＋验收"非"从零接入"**；独立包缺口的正确表述仅限"包装形态未拆"（旧拆包线，HD-001 不依赖）。权威收口见 BC-0006 §2.1＋BC-0009。
- Work Core 冻结、Profile/Provider/Model 零新增与旧 map.md 禁反向边一致；wire/S2c2 不强引入——本轮 FE 接线只读现公开面（见 interface-facts.md），若 S2c2 是必要前置再按独立批次申请。
