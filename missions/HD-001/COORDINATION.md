# 协同：总中央 C → FC/BC → 包执行者
C 负责全局接缝、范围、预算、资源与成套验收；FC 负责前端研究/体验/契约/集成；BC 负责后端包边界/实现/集成。执行者只向中央反馈，不绕过总中央向用户索权。
F1 与 S 可以直接发技术消息，需 CC FC/BC；公共契约由 C 决策记录，FC/BC 确认，单一写入者实施。避免 C 逐句转述。
授权分层：C批准共同方案、跨前后端契约和批次总边界后，FC/BC可在父批准范围内细化并批准本方包任务，不必每次再等C。扩大范围/改公共契约/真实调用仍回C。FC/BC审批须引用C的父批准ID；C task-board记录该授权，不靠隐式默认。
文件所有权：C 写 task-board.md decisions.md budget/** integration/**；各角色只写 agents/<ROLE>/**；方案汇总分别在 agents/FC/reports 与 agents/BC/reports。所有源代码只在自己树批准路径。

## 消息
发送者在 agents/<ROLE>/outbox/ 写不可覆盖的 <ROLE>-0001.md，包含：
id/from/to/cc/task/type（TAKEOVER、ACK、PROPOSAL、QUESTION、APPROVED、REVOKED、HANDOFF_READY、RECEIPT）
base_sha/contract_version/owner_generation、事实与证据路径、请求动作。
接收方从发送者 outbox 收取，以 reply_to 消息 ACK。ACK 不等于实施批准。
各组轮首、阶段变化、提交前先查 C/本方中央消息与 owner_generation；每约15分钟写有内容的进展，不刷空日志。
status.md 包含 phase、HEAD、dirty、approved_paths、当前动作、依赖消息ID、下一动作、更新时间、是否停止写入、唤醒事实。
审批必须带 task、baseline、精确路径、验收场景、contract_version、owner_generation。临时跨包补丁先申请，不能藏语义绕白名单。

## 不再发生撤令撞车
转移写权必须收旧 owner STOPPED + 最后 HEAD/差量摘要，再发新 generation 批文；新 owner ACK 后写。
旧 owner 提交前再核批准代号。仅“通知撤销”不等于撤销已送达，中央不得提前授予另一人同树写权。
不响应≠停写；中央可用已提交快照在自己独立树推进，不读取不断变化的 dirty 差量当稳定交付。
F0 迁移准备批期间其他前端组只研究，不在旧目录实施。共同目录基线集成后各组接收 clean baseline 再施工。

## 循环与资源
使用 zcode 原生 /goal，不写守护进程/自研调度器/后台 watcher。
首先实际验证：C→FC→执行者派件、ACK、交付、第二次派件与待命续接，测试内容只写角色报告。明确谁靠原生 goal 轮询，谁能被原生唤醒，不凭文档假称支持。
若无可靠跨会话唤醒，所有会话各自 goal 中定期读消息；原生循环确实结束则如实上报，不保证“后台仍跑”。在用户睡前把是否可无人值守告知。
IDLE不是DONE，阶段交付后继续收件；不创建假任务占用资源。各轮做实质推进，不无限重复研究。
启动先 C/FC/BC，再按准备任务启动执行者。重安装/全量测试/构建/Electron串行；C 同时最多放行一个重任务、一个真实模型测试流。普通源码研究可并行，内存紧张优先减少运行会话，不自行杀用户进程。
C 维护重任务许可及实际运行者。中央不要整晚只巡检，要主动解除契约与依赖阻塞。
可逆且范围内跨层选择 C 有裁决权，FC/BC 不为普通实现决定反复找用户；预算、真实调用限制、数据/配置边界不可自行放宽。
终止条件：用户停止；或C确认本轮交付+缺口清单完成；或全部可授权路径耗尽且确需用户输入。局部阻塞不停止全队。
