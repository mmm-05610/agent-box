# BE-LOOP-001 原生 goal 启动规则（2026-09-22，D-0029）

**当前协调方式：D-0031 [COORDINATION-V2.md](COORDINATION-V2.md)。**
五会话暂停交接完成，按新任务板恢复；本文件中旧交接限制以 v2 为准。

用户明确要求实施，并改用五个 Qoder 原生 goal 会话。此文件覆盖旧任务卡、
启动准备报告、隔离文档中的 fake-only、仅研究、等待 G1/G2、必须控制器启动等限制。
不是取消方案审批：研究→中央审批→实施→验收继续有效，不再等 I 逐项放行组内任务。
不使用 incremental-work-order，不恢复旧编队，不继续扩建自研控制器。

## 当前运行与权限事实

普通登录 Qoder 会话，各自独立 Git worktree。没有启用完整 bwrap：
源码分支隔离有效，跨目录访问/凭据不可读并无操作系统强制保证；写入范围靠任务约束
与中央差量核对，不宣称物理隔离。禁止执行者调用 Codex、改预算或跨树写入。
允许正常 Qoder 模型使用与公开资料检索，不允许读出秘密、真实 Harness 计费调用、
用户数据迁移、已有服务启停、push 或 publishing main 修改。

## 目录与角色

根：/home/maoqh/projects/ordessa
中央 C 在根目录运行，唯一管理 control 下的审批、契约、预算和集成记录。
四组源码为 worktrees/backend-loop/<group>/source；同级 reports/outbox 为该组输出。
server=S，execution=E，harness=H，platform=P。
四树共同起点 b067c5718556c8efa93b054e6573ad3d186b3cf6；分支 work/be-goal-<group>-0。
任务卡里的 /source 指本组 source；/reports、/outbox、/tests 指本组同级目录。
不要操作同级 home/cache 中测试遗留内容；既有 fake 消息全部忽略。
任务卡相对引用以 control/backend-loop 为根，产品方案位于 control/product。
任务卡和契约中的 v1 是草案占位，不是已实现事实；旧 order 引用及枚举值必须查证，
特别是 H 的 ACP stopReason 不得按任务卡中旧的“四个值”限制当前协议。

## 交接与审批（不依赖旧控制器）

会话先读本文件、tasks/INDEX.md、对应任务卡及 product/backend-coordinated-loop.md。
各组原生 goal 的最终目标包含实施，不在研究报告交付时自行宣布目标完成。
各组使用 reports/status-goal.md 写当前阶段、方案版本、阻塞和下一动作；
向 outbox/goal-<group>-<唯一ID>.md 发消息，附类型、版本、SHA、证据和所需决定。
C 写 control/reports/BE-LOOP-001/goal/ 下 approvals、acks、contracts、current-state.md。
不使用旧 fake 消息或 APPROVED 作为真实批准证据。
真实批准必须绑定组、任务、方案版本、基线、逐路径范围、契约版本和验收条件。
执行者可读其他组报告和中央记录，不能改；等待时使用原生唤醒，不空转，不自批。
C 主动收集并答复四组消息，批准范围内任务，不把每个内部决定推回 I。
全部工作完成才交付；依赖未满足时保留状态并等待，用户停止优先。

## 实施与集成

四组按任务卡职责提出首个可验收增量；C 批准后立即实施，无须再次请求用户。
Core 和公开 Wire 语义冻结。内部公共契约由提供/消费双方确认、C 发布并指定单写者。
H/P 插件调整允许协商获批；不能因旧白名单不合适就无限停止，也不能自行越界。
执行者只在本组源码修改获批文件，测试、生成操作同样不能跨范围。
每个增量报告 diff、测试命令/结果、已知缺陷和交接要求；可按明确路径提交本组分支，
不 add -A、不合并其他分支。C 核查范围并串行集成至 integration-linux/backend，
保持已验证检查点，集成前检查 dirty 状态；禁止自动 reset/stash 或覆盖他人工作。
Pi 修复分支单列保留，是否吸收须做范围/证据核查，不隐式进入四组基线。

## Sol（仅 C 可调用）

后端总十次独立于前端。E design-final 和 impl-accept 各预留一次；H 累计最多三次。
H/P 先经 C 审，C 可不给 Sol 直接批准；E 两次核验不可省略。
使用已有预算账本 controller/ledger/budget.json，不重置、不挪用前端额度。
C 首次调用前核对账本实际使用与后端申请记录；仅真实审阅时测试模型可用性。
调用前经 controller/budget.py consume 原子预扣；重复请求不得再次调用，
失败也计次，模型明确 gpt-5.6-sol。必须检查实际 help，禁止猜参数或偷偷换模型。
旧 be-loop.sh 仍可能是 fake reviewer，不把 fake ACCEPT 当真实核验。
允许 C 使用现有预扣入口后直接做真实只读审阅并 record，保留申请/原始结果/退出码/
精确版本和里程碑；不得为此再建设调度器。预算损坏或不可核验则拒绝消费并上报。
普通会话中的唯一入口是组织约束，不能声称其他进程在 OS 层无法绕过。

## 原生 goal

官方 https://docs.qoder.com/cli/goal-reference：无 --turns 通常默认100轮，
所以启动建议显式 --turns 1000000（极大有限上限，不是假称无限）。
/goal status 查看，/goal pause 暂停，/goal resume 恢复；进程异常退出后需恢复，
goal 不等于守护进程，不改变权限模式。禁止 yolo/bypass；权限询问仍可能暂停运行。
会话保持打开；用户手动启动五组，本次 I 不替用户启动模型进程。
