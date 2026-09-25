# Sol#1 决定 — E design v0：**REJECT**（真实 gpt-5.6-sol 审阅，非 fake）

- request：E-DESIGN-FINAL-001 · milestone：design-final · 模型：`gpt-5.6-sol` · 沙箱：read-only · 退出：0 · 计次：used 1/10
- 原始输出：`sol/E-design-final-001.raw`（含 codex 会话头 model=gpt-5.6-sol / tokens 41473 / 完整推理）
- 首次调用遇 codex 预检（非受信任目录 + stdin）未达模型 → **未重复消费额度**，用同一已获配请求补正调用后完成。

## reviewer 判定：reject。6 条未决重大反例
1. 部分失败未过：cleanup/release 未进 provider Protocol、被静默跳过；wrap/allocate「先副作用后登记」仍系于**未确认的零副作用承诺**（= E 自提的 P-5 悬项）。
2. 下层替换未过：硬编码 `subagent-bridge.mjs` 视图布局；责任与替换契约**未指派** H/P（E 攻击2 自认的 (c) 项）。
3. 上层替换仅愿景：冻结的 `TurnExecutionPort` 收 turn_id，但 `SidecarExecutionBackend` 读 Session/Turn 仓储、造 Session-Turn 专属 Core 记录 → 非 Session 调度器须**伪造产品状态**才能用（违背「实现不知产品身份」）。
4. E-INC1 新增 Job 注册缝与 D1 的 RuntimeHost/TerminalSession 收敛**冲突**，可能把「E 第二套进程管理」制度化。
5. 失败模型把 timeout 等所有 run 异常塌成 AMBIGUOUS，无状态迁移表区分 timeout 观测 / 未知启停 / 确定拒绝 / 确定完成（违共同原则第3条；正是 block-1 三态要解决的）。
6. K9 inventory 被当 E 事实来源，未定义为 Core 派生投影 → 与「Work Core 唯一权威」冲突。

## C 处置（依状态机：驳回→回设计阶段）
- **E-INC1（产品实施）不批**，回 **CENTRAL_REVIEW/DESIGN** → E 出 **design v1** 逐条闭环上述 6 项（尤其 #3 中立内部执行请求 + Session-Turn 适配器、#5 显式状态迁移表、#1 把 cleanup/release 定成 provider 义务或取得并发布零副作用契约）。
- **E-INC0（本组 `/tests` 钉住测试）仍有效且鼓励先落**：其覆盖的「三态可分辨、未知不重放、终态权威在 S、stopReason 透传」正是 #5 所需回归网；不改产品、不依赖 design v1。
- **跨组依赖强化**：#1/#2 需 **P 答 IFR-05(P-5 零副作用、P-1 端口形状)** 与 **H 落 C-HARNESS（subagent-bridge/view 布局归属）** → E 定稿前 H 必须交付。
- **再核验预算**：design v1 若需第二次定稿核验，从**机动 8** 按风险/价值分配（E#1 已花；E impl-accept #2 仍预留）。C 也可先自审 v1 再决定是否再花。
- 与 block-1 一致：#5 印证 `C-EXEC@v1(block1)` 取消三态契约的正确方向；S 的公开形状锁测（4/4）为该反例提供回归。

## 不做
不把 reject 当通过；不擅自改 E 设计；不重启/代做 H；不为此再建调度器。
