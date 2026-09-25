# FC 集成接收清单 — HD-001-FE-PREP-001（预写于 F0 施工期间，2026-09-23）

依据：C-0019 第 3 条（HANDOFF_READY+HEAD+差量摘要→fc 树核对暂存区→集成→RECEIPT）、FC-0012 §验收口径、F0-0008 承诺边界。HANDOFF 到达后逐项执行并留证据路径。

## 1. HANDOFF 消息要素核验
- [ ] 引用批号 HD-001-FE-PREP-001；含最后 HEAD（完整 SHA）与差量摘要（路径清单）
- [ ] 验收声明四项：串行全绿（build/typecheck/test/test:extensions/test:foundations/test:electron）、dist 逐字节比对（lock 除外）、ORDESSA_EMPTY_HOST 双模启动、examples 独立可建
- [ ] 声明零真实调用、零 push、无 add -A/reset/stash/clean

## 2. F0 树交付状态实测（worktrees/harness-desktop-001/f0）
- [ ] `git log -1` HEAD 与消息一致；`git status --porcelain` 为空（全部已提交）
- [ ] 提交范围核对：`git log --stat 85cc3cd..work/hd001-f0` 每笔提交仅涉批准路径；无 extensions/dist 旧路径残留写入（dist 新根按步 6）
- [ ] contracts 域文件为纯 re-export：Token 字符串（'ordessa.commands.v1' 等）与 manifest hostApi='2' 不变（`git diff 85cc3cd..work/hd001-f0 -- contracts/` 抽查）
- [ ] products/agent-desktop/extensions.json=原 agent-preview 11 id 内容（D2）；lock 为新增生成工件

## 3. fc 树集成
- [ ] 确认 worktrees 同仓共享对象：`git worktree list` / `git branch -a` 能见 work/hd001-f0
- [ ] 合并前范围比对：`git diff --stat 85cc3cd..work/hd001-f0` 对照 FC-0012 §批次边界 1-7（platform/4、contracts/2 包 5 域、plugins/9+2 契约包、products/、tooling/、apps/desktop、依赖归位）
- [ ] 合并 work/hd001-f0 → work/hd001-fc（遇冲突即停，QUESTION 报 C，不自行裁决语义）
- [ ] 本树重跑验收四项（串行；Electron smoke 隔离 userData+测试专用 --no-sandbox）
- [ ] dist 字节级比对：以合并后构建产物对 F0 交付产物复核（lock 除外）

## 4. 回执与登记
- [ ] RECEIPT 消息（reply_to=C-0019，随带 FC-0011/FC-0012 时间戳笔误声明）：交付 HEAD、集成 HEAD、门禁结果、比对证据路径
- [ ] 更新本 status.md；C 记 integration/checkpoint.json 成套 FE SHA
- [ ] 通知 F1/F2/F3 clean baseline 可接收（发各自 outbox 指向 C 的 checkpoint 登记）

## 5. 异常路径
- 任一门禁红/比对不符/越批路径：停集成，QUESTION 报 C（附证据），F0 侧修复后重走 §1-4。
- F0 超时无 HANDOFF：不催促代写；按 loop-registry 口径报 C 证据停滞。
