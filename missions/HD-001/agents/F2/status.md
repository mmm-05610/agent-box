# F2
phase: PAUSED_BY_USER（用户 2026-09-23 09:30 指令"暂时停下、完成交接"；F2 施工就绪态=候 C 签 P2-3 FE-SESSIONS 批文）
mission: HD-001
source_directory: /home/maoqh/projects/ordessa/worktrees/harness-desktop-001/f2
source_baseline: 85cc3cd01497bb185be417a38dbeeeca4edb08e6
head: 85cc3cd01497bb185be417a38dbeeeca4edb08e6 (work/hd001-f2)
dirty: false
implementation_approved: false
approved_paths: none yet（职责域 plugins/agent/sessions/** + renderer 测试坐标，P2-3 批文到达时逐字段钉死）
current_action: **交接封存**。F2 侧全部输入冻结完毕，唯一交付面=reports/sessions-batch-readiness.md 的"终版冻结摘要+增补一/二/三/四"（后续者只需读冻结摘要起，历史段为论证轨迹）；goal 未经用户叫停不得自行 complete。
dependency_msgs: 等待链现状（09:30）=P2-1 交付 **F1-0015@HANDOFF_READY**（基线 16398e7c 上单批提交，additive runs[].stoppable? 随批）∥ P2-2 交付 **F3-0041@fb87a292**（第 4 点挂起候 C 裁甲/乙，对 F2 零影响=F2-0012 §2）→ **FC 集成 baseline1**（F3-0042 已供两批耦合补证）→ **C 签 P2-3 → F2 开工**。未读新件=**F0-0013**（监视器停止前最后落盘，报头未读）。F2-0012 已发被采纳（F3-0041 §4/§9 引用）。
next（恢复时按序）: ①收件：`ls -t agents/*/outbox/*.md | grep -v README | head`，先读 F0-0013 及此后新件；②盯 FC baseline1 集成 RECEIPT 与 C 的 P2-3 批文＋第 4 点裁决；③批文到达→f2 树快进对齐 baseline1→按"冻结摘要+增补一~四"执行，开工首步=E 清单六项（含 ⑥lock/测试文件/vitest.config 三核验）；④完工 HANDOFF_READY→FC。恢复待命建议：低频 sleep 轮询（580s/轮，勿用重复 find -newermt 本地时区陷阱）或重建 Monitor。
record_maintenance: 口径基线=FC-0015 谓词（hasOpenRun/hasAwaitingInteraction，state 判定 kind 无关，全量扫描）；S-0005 facade 纪律（不索新聚合接口，徽标自 sessions 列表推导）；方案 A（S-0004/E-0005：data-root 专用目录、workspaces.open、archive-only、FE 持清理）；§5 共用条款现为**七条**（⑥范围变更整表重跑可达性、⑦容器断言先读 entry 注册点，FC-0018 升格）；断言纪律 D1–D5（含阳性对照+空壳 div 禁断 null=F3-0034 判据）；契约引用=符号锚点唯一路径（agent-ui contract.ts 现为两行 `export *` 转发）；测试坐标=`apps/desktop/renderer/agent-sessions.test.*`（A3），5 件包测试留应用目录仅改 import（A1）；验收=乙案 vitest 半边（C-0046/0049）。
stop_writing: true（用户暂停指令生效；恢复前 F2 不写 outbox、不动源码树；本文件+报告为唯一合法落笔处）
standby_rule: C-0003/C-0017+用户 09:30 指令——暂停期间不再轮询；goal 保持登记不结束；恢复仅凭用户指令或新会话接管（按 START.md 程序，引用本文件为接管点）
wake_mechanism: 已停用（Monitor b4m0acbjx 已 TaskStop）。恢复点三件套=本文件、reports/sessions-batch-readiness.md（冻结摘要起）、outbox 尾件清单
updated: 2026-09-23 09:31 +0800 （**用户指令暂停+交接封存**；F1-0015/F3-0041 双交付在册、候 FC baseline1→C 签 P2-3；F0-0013 未读登记；f2 树 @85cc3cd clean、dirty=false、零源码写入、零真实调用 0/99；F2 gen1 单代单写者）
