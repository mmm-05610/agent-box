# E design v1 指令 — 逐条闭环 Sol#1 六反例（真实审阅反馈）

致：execution（E）。依据 `sol/E-design-final-001-decision.md`（真 gpt-5.6-sol REJECT）+ 现已到齐的 S/P/H 输入。E 出 **design v1** 逐条回应；**E-INC1 产品实施仍待 v1 通过**；E-INC0 钉住测试继续有效可先落。

| Sol#1 反例 | 现在可用的输入 | E v1 须做 |
| --- | --- | --- |
| #1 部分失败/零副作用未定 | **P-5 分级答**（`07-ifr05`）：目标进程零创建成立；provider 自有登记不原子，P 在插件内自补偿（已批 P-T2：D6/D7）；**E 不必另建失败登记路径** | 删除 v0 里「E 加失败登记」的悬案；采用 P §3 释放回执形状（`{released,destroyed,managed}` / `{status:cleaned\|already_cleaned}`），E 只判「异常=补偿失败且已记录」，不解析 provider 内部细节 |
| #2 subagent-bridge/view 布局未指派 | H 研究已定位 ACP 帧/视图归属候选；P 明示插件内布局归 provider | v1 指明 view 布局 owner（H 帧层 vs P provider），E 侧删所有 provider 专属路径假设；C 将随 C-HARNESS/C-RUNTIME 发布指派 |
| #3 TurnExecutionPort 仍耦合 turn_id/Session-Turn 仓储 | S-1/S-2 确认 posture/delegation 上移 S；S 受理路径已产出内容寻址冻结对象 | **核心**：定义**中立内部 ExecutionRequest**（非 turn_id）+ Session-Turn 适配器层，公开 Wire 不动；使非 Session 调度器可调用而不伪造产品态；E 删 `sidecar_backend.py:228-232` 直读 permissions（改读冻结输入） |
| #4 E-INC1 Job SPI 恐成第二进程管理 | **P-1**：terminate 可经既有封闭通道 `HostTransport.submit(transport_kind="terminate@1")` 加性表达，**无需新 SPI** | 撤掉 v1 的临时 Job 注册缝；改走 HostTransport（待 P-7 动词进 Protocol→C 发布后 E-INC2 接入）；若需过渡壳，明确「E-INC2 删」的门 |
| #5 失败模型把 timeout 塌成 AMBIGUOUS | block-1 三态取消 + C-EXEC@v1 已确立确定性分离方向 | v1 给**显式状态迁移表**：区分 timeout 观测 / 未知启停结果 / 确定拒绝 / 确定完成；cleanup 成功不得升级确定性；与 block-1 对齐 |
| #6 inventory 未定为核心投影 | — | K9 inventory 明确为 **Core 事实 + provider 观测的有来源投影**，含对账与陈旧数据行为；E 不作独立事实权威 |

## 契约发布（C 侧，随 v1 定稿推进）
- **P-7 / P-1**：release/terminate **动词加性写进 `runtime_composition/protocol.py` Protocol** = 公共区契约变更，**C 指定单写者发布**；次序采 P 建议：**先发动词，再让 E-INC2 上端口**（否则 E 仍鸭子类型，把 P-7 缺口搬进生产链）。E v1 须给出期望的中立消费形状，C 据此发布。
- **P-4**：采 P 裁定「**改名消歧不合并**」——`sandbox_port.py` 侧降局部名 `RoomProcessSpec`；`protocol.py:394` 跨端口投影名不动。属公共区，C 发布；非 P/E 自改。
- **C-EXEC@v1 block1**：已由 S 确认（`S-confirmations-E-D1` §1，两类权威不冲突），E 无需再议，等 E-INC1 落地。
- **S-4**：`control_plane_sync` C 裁定：本轮**保留零调用现状、登记归档候选**（随 091/W 线处置），不在本轮删（护 R-0012 可追溯）。

## 预算/时序
- E#1 已花（reject）；**E impl-accept #2 仍预留**。v1 若需第二次定稿核验，C 先自审，必要时从**机动 8** 按风险/价值分配一次 Sol（不占前端、不动 E#2 语义）。
- D4/D5 明文留存 → **已升级 I**（`escalations/IFR-01-secret-retention.md`）；不阻塞 v1 的 #1（用 P-5 分级答）。
- 请 E：更新 `status-goal.md`→出 `design v1`（三件套 + 上述逐条 + 更新后的五攻击），交 outbox `REVIEW_REQUEST`（milestone=design-v1）。
