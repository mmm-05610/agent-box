# HD-002 — 固定中央、按包增量施工（接续HD-001）
**最新执行路径：**[I-NATIVE-AGENT-001](agents/I/outbox/I-NATIVE-AGENT-001.md)：本阶段后端走所选项目目录中的本机原生 Agent，经 Server/Execution/Harness 插件；旧 bwrap/sidecar/SecretStore 投影链不再是 CP 前置。C-0024 已撤相冲突旧批，保留旧成果。
**执行路径纠正：**[I-NATIVE-AGENT-001](agents/I/outbox/I-NATIVE-AGENT-001.md)：本阶段走已配置原生Agent，不以bwrap/旧Profile凭据投影链为前置；C/BC立即收讫重排最小接线，并排查未入用户审批队列的真实阻塞。
**用户审批入口：**[USER-DECISIONS.md](USER-DECISIONS.md)，由[队列工具](decision-queue/README.md)生成。C只能入队和读答复，不能直接编辑该文件；用户可开终端持续选择回答。
**决策方式：**[I-DECISION-REUSE-001](agents/I/outbox/I-DECISION-REUSE-001.md)：上报或查成熟开源共识；有源码证据、符合范围则复用，不自行扩设计。
**最新范围收缩：**[I-PROJECT-REQUIRED-001](agents/I/outbox/I-PROJECT-REQUIRED-001.md)：启动对话必须有项目，恢复当前连接上次选择，首次/失效必须选；取消默认工作区分支，首发才创建。覆盖下文旧默认工作区描述。
**当前收尾方向：**[目标基线目录与准入](SESSION-BASELINE-TARGET.md)。用户暂不设计新功能；优先收尾Session检查点，未收敛内容留其他分支，不带入候选main。C/FC/BC收取I-BASELINE-CLOSEOUT-001。
**必须交付的大阶段：**[CP-SESSION-001](SESSION-CHECKPOINT.md)，Session闭环单独交用户验收，Profile及后续增量不得混入或成为前置。
**最新用户产品裁决：**[I-SESSION-FIRST-SEND-001](agents/I/outbox/I-SESSION-FIRST-SEND-001.md)，C/FC/BC及F1/F2/F3/S/H先收讫；撤销纯创建空会话与独立workspace分配的错误前置，按首条消息创建、无项目使用Agent默认工作区推进。
**当前会话管理指令：**先读 [SESSION-OWNERSHIP.md](SESSION-OWNERSHIP.md)。用户确认独立 FC/BC 已关闭且未另存前任回执；C 已用 [现场重建记录](handover/site-reconstruction-c.md) 核查后复用原有 `/root/fc`、`/root/bc`，底层 Qoder 原会话保留并按文件收管理 ACK。禁止照旧启动表再开一套；当前真实归属以 [C 会话登记](agents/C/sessions.md) 为准。
用户已明确关闭上一轮全部会话并授权本次重编队。旧树保留、只读追溯，不清理不重置。
这是组织换代，不是重做或重置额度；main不动、禁止push、保留用户服务与数据。
当前调度唯一入口本目录；HD-001材料按需引用，旧角色/待审批行号不自动成为新指令。
主线目标仍是单Harness Desktop闭环。Profile独立插件获新增授权；Provider/Model仅设计，等待用户讨论确认。

## 必读
所有角色读 COORDINATION.md、SCOPE.md、BASELINE.md、TASKS.md、自己的roles/<角色>.md。
中央还读 BACKLOG.md、INCREMENTS.md。Profile还读 ../../product/profile-logical-preset-v0.1.md。
共同历史范围/预算细则：../HD-001/CHARTER.md、../HD-001/BUDGET.md；冲突以本轮用户授权及SCOPE.md为准。
上级 C/FC/BC 使用Codex gpt-6-sol；下级 F0/F1/F2/F3/S/H/E/PROFILE 使用Qoder Qwen3.8-Flash。
启动目录和命令见START.md；暂不启动E（无明确实现任务），F0按需。其余按任务实际依赖分批启动。

## 配额单一来源
继续使用 /home/maoqh/projects/ordessa/control/missions/HD-001/budget/ledger.json，只由新C写。I-DEC-0001 用户最新答复取消次数上限与计数要求；C-0025 已在同一账本保留旧 99/10、零预留/无 grant 作为历史，并登记当前无次数上限政策。不建副本，不补造历史调用。
上级日常决策模型gpt-6-sol不是独立审阅，不冒领review证据；独立审阅仍gpt-5.6-sol，测试Codex仍gpt-5.6-luna。
未创建新预算副本。此处登记路径而不存密钥：/home/maoqh/.config/ordessa-testing/deepseek-api-key。
