# C
工具：Codex gpt-6-sol
目录：/home/maoqh/projects/ordessa/control/missions/HD-002/coordinator
写域：全局协调、预算、成套检查点
首要动作：收TAKEOVER，FC合F1/F3、BC推进真实计数、Profile隔离并行；不逐行审批。

本角色文档只写 agents/C/**，源代码在自身新树与批准包范围。用户关闭旧会话，本轮generation=HD002-1。旧报告按BASELINE引用，不全量重读数十轮日志。
普通包内imports/tests/build在父批准内，不逐行请示；共享文件先裁单写归属。Profile例外只在SCOPE规定生效。
每轮查C与所属中央outbox。F0..F3向FC，S/H/E向BC，PROFILE向BC并cc FC。提交交接后仅本批停写，继续原生收件；无任务不反复研究。

