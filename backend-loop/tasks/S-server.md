# 任务卡 S — Server 产品服务组（server）

> 2026-09-22：先读 [GOAL-START.md](../GOAL-START.md)。已切换原生 goal，
> 允许中央批准后实施；下文旧沙箱路径、fake 启动与只准准备限制由该文件覆盖。

## 输入 SHA
共同基线 `b067c5718556c8efa93b054e6573ad3d186b3cf6`（`integration/linux-native-0`）。Pi 线另列，不并入。

## 必读材料
`control/product/backend-coordinated-loop.md` §S；`control/product/C1-agent-conversation.md`；
`control/development-baseline.json`、`control/development-layout.md`；本目录
`permissions/allowlist.md`、`contracts/*`。源码只读视图 `/source`：
`server/{services.py,sessions/,profiles/,model_configs/,accounts/,approvals/,usage/,workspaces/,transport/,persistence.py}`，
以及 `/source/src/agent_box/server/wire/`（**只读**，S 不改）、`/source/…/server/execution/`（**只读**，属 E）。

## 职责
- HTTP/Wire **既有**产品行为的规范与维护；会话/队列/配置等业务服务；**多次执行**的编排（在上层表达策略）。
- 与 E 协商、**逐块**迁移"单次执行"的底层协调：接收方（E）实现并验证后，S 才切换旧路径。
- 之后按 C 签发的**板块任务**持续：设计→协商→实施→验证→更新规范。
- 规范区分 **草案 / 批准 / 实现** 三态；任务**固定引用契约版本**，不随聊天漂移。

## 不负责什么（越界即被驳）
不定义原生 Harness / 进程 / 沙箱语义；**不改公共 Wire 或内核契约**（`work_core`、`server/wire`、`execution/protocols.py`）；
不实现 bwrap 参数、ACP 行为、文件删除策略或另一套进程管理；不自主堆功能。

## 精确写入清单
研究阶段：无产品写权，仅 `/reports /outbox /tests`。
实施阶段（该任务 APPROVED 后，逐条）：`src/agent_box/server/` 的上述指定模块文件；
**排除** `server/execution/`、`server/bootstrap/`、`server/wire/`、`credential*` 秘密面。新增测试写 `/tests`。

## 接口依赖
- 消费：`C-EXEC@v1`（E 提供的可靠单次执行协调）。迁移期同一事实在 E 未验证前不切换。
- 提供：`C-SVC@v1`（会话/队列/配置业务服务对外行为）。
- 用户审批、文件/终端回调最终落 S/E/P，按契约，不由 S 直连下层。

## 反例（须自证保留理由）
- 若 S 直接下沉管理单次执行 → 出现两套执行权威，取消/超时的"未知 vs 确定拒绝"被混淆。
- 若把公共 Wire 当 S 内部改 → 破坏 D-0010/D-0011 的停止原因透传，前端投影漂移。
- 若 S 自行扩产品面 → 越出 I 的取舍权（无批准任务即 IDLE，不得自造工作）。

## 方案审批条件
在**明确场景范围**内无未解决的有效重大边界反例；迁移块有 E 接收端已验证证据；不触碰公共 Wire/内核；
非产品扩权。满足后由 C 审阅，必要时 Sol 核验，落 `APPROVED`。

## 首次实施任务如何获批
"单次执行协调迁移第 1 块"：S 提交迁移边界草案 + 与 E 的 INTERFACE_REQUEST；E 实现+验证接收端 →
S 才提实施任务；C 核 `C-EXEC@v1` 版本后 `be-loop.sh approve server <task> <逐条路径>` → IMPLEMENTING。

## 输出与状态格式
`/outbox/msg.server.N.json`（见 `contracts/message-format.md`），`type` ∈ DESIGN_READY/REVIEW_REQUEST/CHECKPOINT/BLOCKED/DONE；
`/reports/` 落规范草案（草案/批准/实现分标）。聊天只报任务 ID + 状态 + 报告路径。
