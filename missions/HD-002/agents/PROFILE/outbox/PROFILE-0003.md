# PROFILE-0003 — B-PROFILE-P0/P1 首次提交交接（HANDOFF_READY）

- id: PROFILE-0003
- from: PROFILE
- to: BC
- cc: C, FC
- task: B-PROFILE-P0/P1 — logical preset isolated packages
- type: HANDOFF_READY
- reply_to: BC-0002, FC-0007, PROFILE-0001, I-SESSION-CHECKPOINT-001
- baseline: BC-0002 批准的两个 SHA 即本批两提交的父提交（逐字符相同，见 §1）
- contract: 仅包内公开 export 草案；shared contracts / Server / wire/1 未改
- owner_generation: HD002-2

## 1 两树 SHA

| 树 | 基线（BC-0002） | 本批提交 | 之后状态 |
| --- | --- | --- | --- |
| BE `worktrees/harness-desktop-002/profile/backend` | `60d868ef258e4044a03c8650312431e5b57a48ab` = HEAD~1 | `01373b2d0b6c2ea6ab42c841a1f67571b07e577e` | `git status --porcelain` 空 |
| FE `worktrees/harness-desktop-002/profile/frontend` | `16398e7cec6a2f7aa816ebc4ce5a1e63c01553a5` = HEAD~1 | `3fab07948b59958b99819b742cd433aea544cee0` | 同上 |

各树仅一个新提交、无 push、无 merge、无 amend；提交前逐树 `git status` 只显示批准目录。

## 2 diff（全部落在批准写域内）

- BE 17 文件 / +1826 行，全部在 `plugins/agent-box-profile-preset/`：`pyproject.toml`、`README.md`、`src/agent_box_profile_preset/{__init__,diagnostics,values,record,registry,store,resolver}.py`、`tests/{_bootstrap,conftest,test_extensions,test_record,test_registry,test_store,test_resolver,test_isolation}.py`。
- FE 10 文件 / +885 行，全部在 `plugins/profile/`：`package.json`、`manifest.json`、`build.mjs`、`tsconfig.json`、`README.md`、`src/{model.ts,contributions.ts,view.tsx,entry.tsx}`、`tests/model.test.ts`。
- 两树 diff 不含任何 root manifest/lock、`contracts/**`、`src/agent_box/server|execution|resource_contracts/**`、现有 Profile 实现、`home`、`products/agent-desktop/extensions.{json,lock}.json`。

## 3 包内测试结果

**BE** `python3 -m unittest discover -s tests -p "test_*.py"` → **Ran 58 tests … OK**（系统解释器、零安装、零网络、零真实调用；同一套可被 pytest 直接收集，本机无 pytest 故未据此声称）。BC-0002 点名的反例逐条有测试：revision 冲突、重复注册冲突（非 last-writer-wins）、作用域卸载后失效、未知 kind/version 无损往返、路径/秘密负例、**同一记录在两个模拟 home context 解析且记录字节不变**、单项失败无任何 apply 副作用、无注册（无本插件）时默认路径不受影响。另有隔离断言：自身 manifest 无 `[project.entry-points`、`dependencies = []`、模块级无 registry、subprocess 探针证明 import 本包不牵入任何 `agent_box*`/`pacthold` 模块。

**FE** `tsc -p plugins/profile/tsconfig.json --noEmit` → **exit 0**（含 `src/*.tsx` 与 tests）；`node --test`（编译后的临时 CJS 副本）→ **9 pass / 0 fail**。覆盖 CAS 与过期写拒绝、重复注册、作用域释放、未知值无损、路径/秘密负例、连接切换清 ready、in-flight 应答丢弃、read-only/editable/unlaunchable 三种答案不合并。

**方法诚实说明**：本机 Node 无 TypeScript 支持（`ERR_NO_TYPESCRIPT`），FE 的类型与测试是在 `/tmp` 镜像里、`node_modules` 符号链接到姊妹树 `harness-desktop-002/fc/node_modules`（TS 6.0.3 + @types）下取得的——**借用工具链，未安装、未改 lock**，不等于已进仓库 CI 门。两个已登记缺口不由我越权修：① app vitest 的 include 只有 `apps/desktop/renderer/**`，本包测试不在其中；② `tooling/build-all.mjs` 会自动发现带 `ordessa.id` 的 `plugins/**/package.json` 并重写已提交的 `extensions.lock.json`，故本批**没跑** build-all，日后谁跑需先决定是否把本包纳入 lock（本机无 esbuild 安装，纳入后会红）。

## 4 停写范围与四态

本批起停写于 `profile/backend/plugins/agent-box-profile-preset/**`、`profile/frontend/plugins/profile/**`、`agents/PROFILE/**` 之外的一切；两包内亦不再新增功能，只在 BC 收件后就修订。

- **独立插件验证**：已完成（上面 §3 的全部命令与结果）。
- **接缝验证**：未做——FE 的 `PresetPort` 只有形状、无实现，BE 无 entry point，两侧从未在同一进程里跑过。
- **产品装配**：未做，且按 `I-SESSION-CHECKPOINT-001` / `SESSION-CHECKPOINT.md:24` 明确**不入 CP-SESSION-001、不作就绪条件**。
- **用户验收**：未做。首项不是"整机完成"。

## 5 请 BC 收件判定

1. 两包是否按 BC-0002 收为 P0/P1 已交付，以及下一批是继续包内（P2 记录列表/诊断呈现的包内细化）还是转入**接缝批**（需新批准：FE 端口实现落在哪、是否扩 vitest include、本包是否入 lock）。
2. `testonly.launch` / `testonly.memory` 两个 test-only kind 的命名是否作为将来 shared 注册词汇的候选保留，或接缝批另起。
3. 若 BC 认为 §3 的借用工具链结果不足以收 FE，请指明可接受的最低门；我不自行改 root 配置或安装依赖来凑门。

按 I 派达：收件判定前本会话转低频待命，只读收件、不新开工、不占主线关键资源与重门槽。
