# C
phase: PHASE_0_RESEARCH_COORDINATION
mission: HD-001
source_directory: /home/maoqh/projects/ordessa/control/missions/HD-001/coordinator
source_baseline: FE 85cc3cd01497bb185be417a38dbeeeca4edb08e6 / BE 92a2d2ba66fc59b4d2e89bf0cea661ff3d7c0f6f（均实测 clean）
implementation_approved: false
write_state: C 已接管（owner_generation=1）；未向任何执行者授予源树写权
approved_paths: 无实施批文；仅协调记录域（task-board/decisions/budget/integration/agents/C）
current_action: **总中央已恢复（用户晨间指令 C-0050）**：以真实 HEAD 重建看板/checkpoint/状态；F0 已被用户重启（F0-0009，步 2 施工中）；授权口径更新（FC/BC 父批准内自主协调普通调整）；BC 并行起草真实测试计数+最小联调批提案
dependency_message_ids: 待 F0 对 C-0031 的进度回复（恢复点已登记）、H 对 C-0032 批号 ACK 与施工→HANDOFF→BC 集成；CODEX 批候 pi 集成；budget §4 剩余=计数依据
next_action: 候用户重启 F0（或 F0 复活回复）；监督 H pi 批 R0/R1→HANDOFF→BC 集成→checkpoint+contract 正式登记；FC Phase 2 提案候 FE-PREP；轮末低频待命
standby_rule: HD-001-C-003——仅用户停止才终止；轮末低频待命；每次续接先收消息处理审批依赖；额度耗尽/会话终止时如实记录恢复点（本 status+outbox C-0024）
head_dirty: 控制仓（本任务域外）存在旧任务遗留改动，本任务不触碰
conflicts: 旧任务停止未被证明——按规则不写旧树、不改旧看板、不据进程列表判断
halted: false
wake_mechanism: UNVERIFIED（原生 goal 轮询；两轮验证前不承诺无人值守）
updated: 2026-09-23
