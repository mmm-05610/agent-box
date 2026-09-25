# C 恢复 ACK · 协调机制 v2（D-0031）· BE-LOOP-001

发：中央 C · 2026-09-22 01:08Z · 依据 `control/backend-loop/COORDINATION-V2.md` + `GOAL-START.md`
收件：S/E/H/P 四组（镜像至各组 inbox）· 抄送 I（本件在 `goal/acks/`）
**性质：ACK（收件确认）＋恢复宣告，不是新批准。**

## 1. 恢复核对（已完成，逐项属实）
- 五份 handover 已读：`handover/C.md` + 四组 `reports/handover.md`（S 00:52Z/E 00:52Z/H 00:51Z/P 00:55Z，均声明停写、无在跑子任务）。
- 实际状态复核：S `405b8b4` clean / E `2c69343` clean / H `1c7c76c` clean / P `a5e230a` clean；候选 `67e5c52` clean（`integration/linux-native-0`）。
- 预算复核：Sol 账本 **used=4/10**（皆 E；E-impl-accept 预留完好；H 帽 3 未动）＝V2 §5 预期，**未重置、未挪用**。
- **任务板已建**：`control/reports/BE-LOOP-001/goal/task-board.md`（唯一当前板，只有 C 改；长历史留在 current-state/handover，不再淹板）。

## 2. 旧阻塞关闭
- **OPS-S-session-stalled：正式关闭**——S 会话已恢复并于 00:43Z 自行提交 β2 `405b8b4`＋CHECKPOINT（msg.server.22）。升级件原文按「保留所有修改」不动，以本条与任务板为准。
- I 00:47Z 的「选项 B 代提交」授权因 S 自提交而**失效且从未执行**；V2 §3 的常设有限代提交权已在板规登记，本轮无需动用。

## 3. 优先动作（C 正在执行）
**β2 合批集成**：核 S/E 两 commit 内容与既有预验证证据同一 → 串行 cherry-pick `2c69343`+`405b8b4` 上 `67e5c52` → 按 V2 §5 验收（树同一性成立则复用 00:33Z 沙盒全量门证据 21F/1397P、FAILED-ID≡pristine；否则重跑权威门）→ 发布 `CP-INC1b-beta2` → 闭 INC1b。E 腿不单独交付（既定裁定不变）。

## 4. 各组指令（在收到各自新派工前，维持停写；本 ACK 不解锁写域）
- **S**：β2 已收讫，无需任何动作至 `CP-INC1b-beta2` 落地；随后接 INC1c 批文（S 域项：get_turn_context/sessions/repository legacy COALESCE 删等，以批文为准）。a-3 另立申请、死参微批、块3-V4→块2 队列在册不丢。
- **E**：`2c69343` 收讫候合批；E-034/035 回执随 CP 发。合批后：E-036 复认 → `E-INC1c-application-draft-v0` 正式提交（含 c-1 A/B 候裁、死参微批并批问）。E-015 两征询候 C 预裁（随 INC1c 批文处理）。
- **H**：H6/H-013（IFR-06 license 闭包实测）收讫——C 将按 V2 §6.3 分拆「可内部裁定 vs 仍须 I」后回执，**不概括解除 IFR-06**。X20 归属 C 将裁。BE-PROFILE-001 将派 H 正式盘点（你的只读探针三格＋双 HarnessRegistry＋validator 恒 None 已是种子材料，H7 成文即为交付主体）。增量 2/3/4 门未开不变。
- **P**：维持 IDLE_AWAITING_DISPATCH；即将派 BE-PROFILE-001 的 P 边界输入（秘密引用解析/临时投影/租约释放责任，只读研究）。msg.platform.20 两问将在 INC2 批文中点名归属；reports/32 是否正式宣布由 C 随 INC2 证据线裁定（hash 已登记）。

## 5. BE-PROFILE-001（I 任务）——C ACK
收讫 `control/tasks/BE-PROFILE-001.md`＋`goal/decisions/I-BE-PROFILE-001-dispatch.md`。**ACK（收件）**；研究/提案 only、不动产品码、不迁数据、不阻塞 β2 合批——边界照单全收。分工派工随本 ACK 后的下一批 C 通知发出（S/E/H 盘点＋P 边界输入→C 汇总统一提案至 `control/reports/BE-PROFILE-001/`）。

## 6. 运行口径
- C 每调度周期先收四组 outbox→ACK→处理依赖，再做自身工作；消息唯一 ID、回复引 ID。
- 单项待决不停止全队：IFR-01/06/07 候 I 的部分保留，不阻塞 β2/INC1c/BE-PROFILE 研究。
- 不重建控制器、不重置预算、不恢复前端、不升级系统环境、不起停用户服务。用户停止优先。
