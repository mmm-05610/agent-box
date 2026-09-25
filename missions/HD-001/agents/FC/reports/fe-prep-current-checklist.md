# FE-PREP-001 当前生效检查清单（唯一权威摘要，2026-09-23 08:30）

批文文本 = **FC-0012 §批次边界 1-7 + A1(C-0036) + A2(C-0037) + A3(C-0042)**；执行者 F0（gen 2，F0-0009 已复活续作）。本清单替代逐消息回溯；行号引用一律以本清单与批文原文为准，不传递过期行号。

## 生效条款（按施工步序）

| 步 | 内容 | 修正/注意 |
|---|---|---|
| 1 ✅ | platform/ 迁移 + @ordessa/extension-host 更名 + native-bridge 独立包 + imports/workspaces/manifests 同步 | 已提交 4b08730bb2 + 7fcdfdf657；基线证据 /tmp/hd001-f0-baseline/（dist 快照+七门绿 log） |
| 2 🔄 | contracts/ 五域拆分、保持 2 个运行时 id（ordessa.contracts / ordessa.agent-contracts），域文件纯 re-export，Token 字符串不变 | **A2**：vitest.config.ts 两条契约 alias 同批改指新 contracts/ re-export 入口（F0 显式授权行）；前会话遗留 staged 现场由 F0 自己续作（F0-0009 已登记） |
| 3 | plugins/ 全映射（connections 整包落 service；agent-* 三包；connectors 两包）；每包四件套；shared 按消费方复制 | **A1**：5 个随包测试**不迁入 plugins/**，保留 apps/desktop/src/（步 6 后为 renderer/）仅重指向 import；验收加核验：无新增 `plugins/**/*.test.*` |
| 4 | products/agent-desktop/：extensions.json=原 agent-preview 11 id（D2）；lock 由 tooling 生成 | foundations-only 留附属文件；测试夹具显式列表（C-0016§4） |
| 5 | tooling/：build-all.mjs 发现式串行+lock；extensions/build.mjs 退役 | examples/build.mjs 迁入 |
| 6 | apps/desktop：src→renderer；scripts 只留应用级门（D4） | **A3**：vitest.config.ts 第三授权行 `test.include` src/**→renderer/**（步 6 同批）；tsconfig/build 相对路径同步属既有 §6 范围 |
| 7 | 依赖归位：assistant-ui→conversation 包、react-resizable-panels→workbench 包 | 根 devDep/lockfile 由 FC 串行安排 |

## 验收口径（不变）
串行全绿（build/typecheck/test/test:extensions/test:foundations/test:electron，隔离 userData+测试专用 --no-sandbox）；dist 逐字节比对（lock 除外，基线=/tmp 快照，预期差异仅 esbuild 路径注释）；ORDESSA_EMPTY_HOST 双模；examples 独立可建；A1 的 git-status 核验。

## 交付与集成
F0 完工 → HANDOFF_READY+最后 HEAD+差量摘要 → FC 按 agents/FC/reports/integration-checklist.md §1-4 核对集成（另核：A1 核验项、A2/A3 两处 vitest.config.ts 改动恰为三条授权行）→ RECEIPT（reply_to=C-0019）→ C 记 checkpoint 成套 SHA → 发布 clean baseline。

## 边界提醒
窗口内 F1/F2/F3 零 FE 源码写入；不 push、不 add -A、不 reset/stash/clean；零真实调用；公共契约零改动（域拆分纯 re-export），contract_version=wire/1（已于 BE checkpoint 正式转正，HD-001-C-017）。
