# C 中央预研报告：基线事实与环境核验（2026-09-23）

用途：供 FC/BC 及执行者引用，避免重复核验。所有事实为 C 本次实测；引用时注明证据路径。

## 1. 环境核验（实测 2026-09-23）

- FE 基线：`worktrees/desktop-minimal` @ `85cc3cd01497bb185be417a38dbeeeca4edb08e6`，clean（porcelain 0 行）。
- BE 基线：`worktrees/integration-linux/backend` @ `92a2d2ba66fc59b4d2e89bf0cea661ff3d7c0f6f`，clean。
- 新树：`worktrees/harness-desktop-001/{fc,f0,f1,f2,f3}` @ 85cc3cd（分支 `work/hd001-<role>`，clean）；`{bc,s,h,e}` @ 92a2d2b（同规则，clean）。
- budget/ledger.json：total 99 / review 10 / reserved 0 / real_calls_enabled=false。
- integration/checkpoint.json：PREPARATION_ONLY；FE/BE 集成树指向 fc/bc；contract_version null；paired_verified false。

## 2. FE 基线结构（desktop-minimal，package name=`ordessa-desktop`）

- npm workspaces：`apps/desktop`、`packages/desktop-host`、`packages/extension-api`、`packages/extension-loader`。
- `extensions/`：agent-codex、agent-connections、agent-conversation、agent-interactions、agent-pi、agent-sessions、commands、settings、shared、workbench + `build.mjs`、`product.json`、`agent-preview.json`、`dist/`。
- 根 scripts：dev/build/typecheck/test/test:electron/test:extensions/test:foundations/test:agent-{ui,shell,process}/build:foundations/build:examples。
- 顶层目录：apps、examples、extensions、packages（node_modules 已存在——旧树自带；新树无预装，符合 README）。

## 3. BE 基线结构（integration-linux/backend）

- `src/agent_box/`：cli、execution、extensions、migrations、resource_contracts、server、service、storage、work_core。
- `service/`：`facade.py` + `sessions/`（对应旧账 MB-S2a、MB-S2c1 已闭）。
- `execution/`：`contracts.py`、`first_run_lock.py`、`lifecycle.py`（对应 MB-E2a、MB-E2b 已闭）。
- `plugins/`（14 个）：agent-box-harness、-harnesses、-harness-{dsh,kilo,qwen}、runtime-local、runtime-wsl、sandbox-bwrap、sandbox-windows、terminal-session、git、artifacts、skills、web。

## 4. 旧 BE-LOOP-001 账目要点（C 读 control/reports/BE-LOOP-001/{goal/task-board.md,baseline/map.md}）

- 新 BE 基线 `92a2d2b` 即旧循环最后集成检查点（E2b lifecycle 集成 `92a2d2ba`）。基线链：`d12aa979`→E2a→S2a→kilo→S2c1(`321c883c`)→E2b(`92a2d2ba`)。
- **S2c2（wire 物理包，13 路径）批文已发但未交付**——README 裁定其不是本任务基线内容；BC 只读查证，必要时独立批次引入。
- 未提交保护：旧 b2 树 `ecf06a33` 带 S 未提交 delegation.py（＋13 行草稿），任何人不代提交。
- 延期登记（基线后另批）：B2 公开字段、bwrap 档 B、dsh settings.yaml 等价移除、旧 deploy 三资产、pi/hermes/claude/codex 逐家接入先报。
- 旧循环审阅账 Sol used=4/10 与本任务无关；本任务预算独立（99/10）。
- 包依赖图与禁反向边见 baseline/map.md（service→Profile/execution/Work Core；禁止反向；Host 唯一组合根）。

## 5. 对研究的含义（C 初步，非批文）

- FE 目标目录（PLAN Phase 1）与现结构的映射轴：extensions/* → plugins/*、packages/{extension-api,extension-loader} → platform/*、extensions/{workbench,commands,settings,shared} → contracts/ + plugins/foundations/。具体方案由 F0 提案、FC 汇合、C 审批。
- BE 接缝轴：F1+S 接口事实表应覆盖 service/facade.py、service/sessions/、wire/transport 位置（server 域）、plugins/agent-box-harness*（H 域）。S2c2 未合状态如实记录，不强引入。
- 各组研究引用本报告可免重复核验环境；但源码级结论（候选评估、复用账）必须各自亲读。
