# FC
phase: BASELINE0 PUBLISHED (FE-PREP-001 integrated: fc @16398e7cec, all gates green; RECEIPT FC-0019 sent; P2-1+P2-2 signing requested for today)
mission: HD-001
source_directory: /home/maoqh/projects/ordessa/worktrees/harness-desktop-001/fc
source_baseline: 16398e7cec (fc integration HEAD; delivery=b3d8492b48 via fast-forward + lock base-field regen; file hashes byte-identical to F0 delivery)
implementation_approved: FE-PREP-001 DONE+INTEGRATED; P2-1/P2-2/P2-3 approved structurally (C-0051/HD-001-C-023), batches signed on baseline0
approved_paths: agents/FC/**; fc 集成树集成动作已按 C-0019§3+C-0050 完成

## 持续运行与编队规则（用户指令，生效中）
- 用户叫停前不主动结束整体任务；阶段交付/无任务→原生低频待命收件；先收消息、处理审批与依赖，再做自己的工作。
- 不以交提案代替推进；已结论事项不空转；引用 fe-prep-current-checklist.md 与符号锚定，不传过期行号。
- C-0050 口径：机械修正自主协调+登记；公共契约/范围/跨线语义/真实调用/禁改面归 C。

## 状态
current_action: **FE-PREP-001 集成完成**——HANDOFF(F0-0010)→§1-4 核验（8 提交批内、A1 零 plugins 测试、Token/hostApi 不变、D2 11id、hostApi 抽查）→FF 合并→fc 独立复跑九门全绿（build+examples/typecheck/vitest 60/60/extensions/foundations/electron 双模/agent-shell/agent-ui/agent-process）→lock base 字段再生成提交（文件 hash 与 F0 交付 byte-identical）→FC-0019 RECEIPT。F0 §六更名问题（FE-RENAME 微批）已转呈 C/用户
depends_on: C 记 checkpoint 配对 SHA 并当日签发 P2-1+P2-2（C-0051§5）；F1/F3 接批后并行施工（f1/f3 树各对齐 baseline0=16398e7cec）；F2 候 baseline1
next: 收 C 签发→监督 P2-1∥P2-2→两批 HANDOFF→集成→baseline1→P2-3→尾批（F0 应用半边专批+夹具、F3 styles 清理、[F3-NEW-1] 候裁）
stop_writing: false (sole writer of fc tree)
wake_mechanism: native goal loop（ZCode 保留角色）；恢复点=本文件+FC outbox 最新件（FC-0019）
last_update: 2026-09-23 08:56 +0800
