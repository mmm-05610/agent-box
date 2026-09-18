# Work Order 67 — 并发准入按会话（让 45-G3 成真）

状态：**READY_FOR_EXECUTION**（2026-09-18 用户裁决："同一会话同时只能有一个 profile 推进"成立；
"同一个 profile 不能跑两个会话"**不合理**，改正）。
依赖：**45**（session-store 机制；本单让它那个未过的 G3 成真）。相关：66（跨 profile 并发规则）、60（G4 归属语义）。
配对前端：**无强制改动**——前端不消费 `run_state`（`apps/desktop/src` 零命中），变化只是"第二个会话从 409 变成能跑"。

## §0 目标与裁决

- **唯一性单位 = 会话**（不是 profile）：**同一会话任何情况下只允许一个活跃执行**（这是真正的写者不变量）；
  **同一 profile 的*不同*会话允许并行**。
- 用户 2026-09-18 两条：① 同一会话同时只能由一个 profile 推进 —— 已由 per-session 索引**结构性**保证；
  ② 同一 profile 不能跑两个会话不合理 —— **本单改正**。
- 用户另一条（平行推进的形态）：同一份工作要被两个 profile 同时做 ⇒ **clone 成两份**，不是共享同一会话。
  本单只落实原则（§7 明确不做会话 fork）；"克隆 profile" 在 60-G5，"带历史起新会话"是显式动作，不假装续接。
- 语义一致性：60-G4 已定"**会话属于工作区、profile 是当前绑定**"；per-profile 索引是"profile 拥有会话"
  时代的遗留 ⇒ 本单是**让实现与已定语义一致**，不是放宽约束。

## §1 第一手事实（2026-09-18，代码阅读）

| 事实 | 位置 |
| --- | --- |
| 闸门是**两条 partial unique index**（状态集 `('accepted','dispatching','running','capturing')`）：`server_one_active_turn_per_session`（按会话）/ `server_one_active_turn_per_profile`（按 profile） | `src/agent_box/storage/database.py:123`、`:125` |
| 迁移段会**补建** per-profile 索引（幂等重建） | `src/agent_box/storage/database.py:211` |
| 409 的抛出点：捕获 `UNIQUE constraint failed` → `TURN_CONCURRENCY_CONFLICT`，文案 "Session or Profile already has an active execution/Turn" | `src/agent_box/server/sessions/repository.py:226-227`、`:501-502` |
| 错误码到 HTTP 的映射（码本身不变） | `src/agent_box/server/wire/errors.py:86` |
| `run_state` 只是**上报字段**，没有任何准入逻辑读它 | `src/agent_box/server/profiles/service.py:66`、`src/agent_box/server/persistence.py:56` |
| **wire 合同里没有这条不变量**：服务端 wire-review/生成 schema 与前端 TS 合同 `TURN_CONCURRENCY_CONFLICT`/per-profile **零命中**；前端也不消费 `run_state` | ⇒ **不重锁**（28 方法形状与两摘要不变），但要在 wire-review 记一条"触发条件收窄" |
| 45-G3 原文："同一 Profile 两个**并行**轮都完成，两份记录都在 home 里" | `docs/implementation/work-orders/45-native-home-storage.md:22` |

## §2 范围（改什么）

1. **迁移**：`DROP INDEX IF EXISTS server_one_active_turn_per_profile`，**保留** per-session 索引；迁移幂等、
   只前向；同时删掉 `:211` 那段重建（否则下次启动又把它建回来）。
2. **准入与文案**：两处 409 的 message 改成只讲会话（如 `Session already has an active execution`）；**错误码不变**。
3. **`run_state` 派生**：定义改为"该 profile **任一**活跃执行即在跑"；字段名与 wire 形状不变，改的是定义 +
   结束/取消/失败路径上的正确递减；文档写明。
4. **profile home 并发可变态逐家判定**（本单的实质工作，见 G3）。
5. **文档**：45-G3 复跑后给 45 报告一条**补记**（按 45 的报告格式）；status 分账。

## §3 规则

- **不碰 wire 形状**（错误码、方法签名、摘要都不变）；只在 wire-review 如实记"触发条件收窄"的语义变更。
- **"同会话一个执行"只能更严不能更松**：per-session 索引保留；任何能旁路造出"同一会话两个活跃执行"的
  代码路径都算返工。
- **profile home 的并发可变态必须逐家判定**，不许默认"没问题"：登录态工作副本、OAuth/token 刷新、
  harness 内部锁、缓存、tmp。判不出来就**收窄锁**（见 G3 备案），不得用"应该没问题"结案。
- 审计与记录仍**按轮/会话归属**（60-G4、66-§3）；并发下的事实不许合并成一条。
- 默认零真实模型调用（假端点 two-round nonce 即可造并发证据）。
- 不 reset/stash/clean、不 merge main、不 push；父工作树与前端仓只读。

## §4 阶段

**A 迁移与准入**：去索引（含删重建段）、改文案、定向测试（同会话仍拒 / 同 profile 两会话放行）。
**B 归属与呈现**：`run_state` 派生 + 并发下事件/转写/用量归属正确。
**C home 并发可变态逐家判定**：至少覆盖有门的家，产出结论表（第一手）。
**D 门**：G1–G5。
**E 收口**：45-G3 补记 + wire-review 记录 + status + 报告。

## §5 门

| 门 | 断言 |
| --- | --- |
| **G1 同 profile 两会话并行**（45-G3 原文） | 同一 profile 两个**不同会话**各跑一轮（假端点）⇒ 两轮都 completed；两份记录各自在（追加型 journal 行数守恒 / SQLite 型两份都在）；native id 各自独立 |
| **G2 同会话排他** | 同一会话的第二个执行 ⇒ 409 + `TURN_CONCURRENCY_CONFLICT`；**跨 profile** 对同一会话的第二次尝试 ⇒ 同样被拒（两条第一手） |
| **G3 home 并发可变态** | 逐家结论表：每项写清"哪些路径会被写 / 两进程并发下是否冲突 / 依据"。冲突项必须给**收窄锁**方案并实施（例如"同一**登录态资产**同时只允许一个执行"——把排他单位从 profile 收窄到那份资产），不得只记录不处理 |
| **G4 不串号** | 并发两轮的 profile / revision / native_generation / 事件 seq 各自正确；无一条事实落到另一个会话或另一轮 |
| **G5 不退化** | 全量套件不降；四家假端点门 exit 0；wire 28 方法与两摘要不变；45 既有 G1/G2/G4/G6/G8 不退化 |

## §6 DoD 与报告

实现 / 定向测试与反例（G2 两条、G4 一条）/ 真机证据（G1 假端点并发）/ **逐家 home 并发结论表** /
回归计数与退出码 / status 分账 / 清理与费用（默认零真实调用）。
报告含：索引迁移 diff、文案变更、`run_state` 新定义、逐家结论表与收窄锁（若有）、wire-review 的语义变更记录、
**45-G3 补记**、未做项。

终态：`PER_SESSION_ADMISSION_DONE` / `PER_SESSION_ADMISSION_PARTIAL`。

## §7 明确不做

- **会话 fork / 克隆**（把同一会话复制成两个可独立推进的会话）：不做。平行推进的正确形态是**两个会话**；
  需要上下文就"**带历史起新会话**"（显式标注为新的原生会话，不假装续接）。
- **放宽**"同一会话一个执行"。
- **按 workspace 的准入**：先不动；workspace 的并发编辑按"允许 + 各自变更集如实归属"处理（54 的变更集语义不变）。
- **跨家族切换**：仍只能克隆（60-G5）。
