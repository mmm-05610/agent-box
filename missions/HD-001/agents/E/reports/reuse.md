# E 复用账（HD-001 Phase 0，2026-09-23）

模板：REUSE-TEMPLATE.md。E 为后端执行域，无新增可见组件；本账覆盖"执行组装/归属/交互路由/停止错误语义"各能力位。

| 能力/组件 | 候选项目+版本/commit | 源码路径/官方链接 | 许可证 | 检查/实验结果 | 直接/适配/参考/不用 | 修改边界/拒绝原因 | 本地落点/升级方式 | owner |
|---|---|---|---|---|---|---|---|---|
| 中立执行生命周期状态机（submit/cancel三态/observe/证据） | 仓内 `agent_box.execution`（BE 基线 92a2d2ba，MB-E2a/E2b 已合） | src/agent_box/execution/{contracts,lifecycle,first_run_lock}.py | 产品自有 | 全文亲读（4 文件 534 行）；委托/别名/pin 实测见 seam-facts §2；无第二机器 | 直接复用 | 仅在真实闭环必需时最小补缝，禁双机/副本（B5 单写者 pin 已锁） | 原位；若汇合裁定接中立 submit 需 C 批精确路径 | E |
| 停止/取消错误语义（CONFIRMED/REFUSED/UNKNOWN） | 同上 CancelOutcome + wire 调用方 | execution/contracts.py:23-30；wire/handlers.py:2168 | 产品自有 | 亲读；pre-port 不记录、receipt 在 cancel_lock 内写、重放返回原答复均已 pin | 直接复用 | 不改拼写、不并枚举值集（stop≠delivery） | 原位 | E |
| 并发原语 | Python 标准库 threading（Lock/RLock/Event），3.13 运行时 | lifecycle.py:19 / first_run_lock.py:18；stdlib docs | PSF | 亲读用法：单 RLock+per-run cancel_lock 纪律正确；FirstRunGate 有界等待实测逻辑核 | 直接复用 | 不引入外部状态机/asyncio 重构（stdlib 已满足且被 pin 白名单允许：threading/uuid，E2b 修正案） | 原位 | E |
| 首跑库串行（多会话共享库） | 仓内 FirstRunGate（Order 80 实战证据内嵌 docstring） | execution/first_run_lock.py:1-121 | 产品自有 | 亲读；键 (placement:profile) 粗粒度理由成立（假通过是唯一不可有失败） | 直接复用 | 不改粒度；真实测试若见 300s 超时误伤再报 C | 原位 | E |
| 外部执行编排库（如通用 workflow/state-machine 包） | 候选评估 | — | 未逐一核证 | 拒绝原因：既有机器已测试锁定且承担"诚实 unknown"产品语义；换依赖=重写风险+许可证核查成本，无闭环收益 | 不用 | 不从零新写第二实现；如未来必需，按 PLAN 走"从零实现须中央批准" | — | E |
| 交互/审批答复路由 | 仓内 backend approvals + `_approval_ports`（sidecar_backend.py:219） | server/execution/sidecar_backend.py；server/approvals/ | 产品自有 | 亲读到 port 归属层；wire 消息名与 respond 细节属 S/F3 域，待汇合核对表 | 直接复用（不新造路由） | E 不接管独立插件资源实现、不加品牌分支 | 原位 | E(执行段)/S(路由段) |

结论：执行域今晚闭环预估**零新组件、零从零实现**；最小工作面是接缝保持与（若 C 裁定）中立入口接线。真实模型/审阅预算消费：0。

## 补记（2026-09-23 09:3x，候批待命轮实测）

pi/Codex 两批已入集成树 @60d868ef。bc 树只读实测 `git diff --stat 92a2d2ba..60d868ef` =
**6 文件、+378/−8**，全部落在 `plugins/agent-box-harnesses/**`（pi/codex production.py 各 2 行 G3 旗标、
harnesses.toml 注释、capability-matrix 1 行）与新增 `scripts/hd001/harness-linux-{pi,codex}.sh`。
**`src/agent_box/execution/**、server/**、wire/** 零差量**——E 执行域在上游两批 VERIFIED 后端点与
92a2d2ba 逐字节同形，本方 lifecycle/boundary pins（95P/0F 基线）在合入 E 树时无需改锚，配对纪律
（C-0025 第 6 项）继续按 92a2d2ba 同形执行。上表"直接复用"结论在上游最新基线上复核仍成立。
真实模型/审阅预算消费：0。
