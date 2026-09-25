# HD-001 — 通用 Harness Desktop 夜间闭环
状态：PREPARATION_OPEN；用户已批准本任务与后续范围内实施，当前只开放调研/接管/环境核对。C 收取 FC/BC 统一方案后批准分批实施，不需要再次等用户批准范围内可逆选择。
本目录是本次任务唯一协调记录，覆盖旧任务中与本任务冲突的派工/模型调用禁令；历史纪律、安全约束继续适用。不使用旧 incremental-work-order 技能，不复活旧编队，不造控制器。
先完整阅读 CHARTER.md、COORDINATION.md、BUDGET.md、PLAN.md、自己的 roles/<ROLE>.md。中央还读所有角色卡。启动提示见 START.md。

## 实测起点
- FE: /home/maoqh/projects/ordessa/worktrees/desktop-minimal @ 85cc3cd01497bb185be417a38dbeeeca4edb08e6，准备前 clean。
- BE: /home/maoqh/projects/ordessa/worktrees/integration-linux/backend @ 92a2d2ba66fc59b4d2e89bf0cea661ff3d7c0f6f，准备前 clean。
- 产品 pyproject name 是 pacthold；不要凭名字猜测对外协议。
- 新工作树 worktrees/harness-desktop-001/{fc,f0,f1,f2,f3,bc,s,h,e}；分支 work/hd001-<role>。
- 旧后端 S2c2 等未合分支不是此基线内容；BC 只读查证，必要且停止交接后才按独立批次引入。不重做整条旧拆包路线。
- 所有新树无 node_modules/venv 预装；不要并行安装多个环境或复制旧用户配置。
- 密钥仅 stat 核验：/home/maoqh/.config/ordessa-testing/deepseek-api-key，0600；未读内容。
- 旧会话是否停止未被可靠证明。本任务不写旧树、不改旧看板、不据进程列表空判断无人写入。

## 入口
C: 本目录/coordinator；FC/BC: 自己的集成树；执行者: 自己的树。
每角色只写本目录 agents/<ROLE>/ 下的 status.md、outbox/、reports/；消息通过发送者 outbox 收取，不写收件者 inbox。
C 独占 task-board.md、decisions.md、budget/、integration/；FC/BC 各自维护本方任务拆分，不更改总预算。

