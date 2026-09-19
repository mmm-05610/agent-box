---
id: "110"
slug: queue-not-adopted-after-stop
batch: c2
baseline: "1709be2"
depends_on: []
write_paths: ["src/agent_box/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**"]
ruling: R-0019
terminal: ["QUEUE_ADOPTION_AFTER_STOP_DONE", "QUEUE_ADOPTION_AFTER_STOP_PARTIAL"]
waive: []
parallel_units: ["repro", "fix", "gate"]
revisions: [{"at": "7445180", "what": "调度者裁定（执行者交回语义冲突后）：67 的 stop/fail ⇒ pause 语义保留；本单改为\"paused 必须可见、带类型化原因、可继续\"，不再要求停止后自动采纳", "after_stage": 1, "ruling": "R-0032"}]
---

# Work Order 110 — 轮被 stop/cancel 之后，服务端队列**不自动采纳**下一项

## Objective

**来源**：聊天线 P32 阶段 6 的第一手观察（交回调度者）——**hold 轮被 `runs.stop`/cancel 终止后，服务端队列不采纳下一项**
（45 秒观察 `left=1`；Stop 在 AgentBox 权限下不 park、cancel 已送达、轮已结束）。

**用户可见后果**：忙时排队的消息在"上一轮被停掉"之后**一直躺着**，用户看到"队列里有东西但不动"，直到下一次交互才可能被排空
（这与 R-0019 的对话闭环"排队可见且能动"直接相关）。

**要的行为**：轮进入终态（completed / failed / cancelled）都**必须触发一次队列采纳检查**——
被 stop/cancel 终止也算轮结束，队列应当继续往前走（或**类型化**说明为什么不能）。


## 修订 v2（2026-09-19，调度者；执行者交回语义冲突后裁定，判据＝R-0032 ⑤）

**冲突**：本单原写"任何终态（含 stop/cancel）都触发队列采纳"，与 **order 67 的既定语义**（`finish_cancelled`/`fail_turn` ⇒
`pause_pending`，排队项转 `paused`；在册测试 `test_stop_or_failure_pauses_queued_turn` 钉着）直接对立。

**裁定（改本单，不改 67）**：

1. **67 的语义保留**：用户 **stop/cancel ⇒ 排队项 `paused`（带类型化 reason，如 `cancelled`）**；失败轮同理（带失败码）。
   **不自动采纳**——用户按了停止却又自动开跑下一轮，等于把"我停了"这句话吃掉（R-0032 ⑤ 的判据）。
2. **本单要修的变成"暂停必须是可见、带原因、可继续"**：
   - **可见 + 类型化**：`paused` 状态与它的 `reason`（记录里已有）必须到得了 wire（`queue.list`/会话视图）；今天若只到得了状态、到不了原因，就补上（**不新增 wire 方法**，用既有形状）；
   - **可继续**：文档化的继续路径＝**`queue.withdraw` + 重发**（两者都已存在且类型化）——UI 必须给出这个动作；若产品要"一键恢复"，那是**新 wire 方法 ⇒ 交回调度者**（不自行发明）；
   - **采纳检查必须在该跑的地方真跑**：轮 **completed** 之后（以及任何显式继续动作之后）必须触发采纳；不能采纳时给出**类型化事实**（paused + reason），不静默。
3. **反例门相应改写**：退回"paused 但不可见/无原因/无继续路径"的实现必须**门红**；**不再**要求"停止后自动开跑"。
4. **P32 的 G4 口径同步更正**（在公告里点名）："排队项在轮结束后被采纳"适用于 **completed** 轮；**stop/fail 轮的正确行为是 paused + 可见 + 原因 + 可继续**。

## Current state（交回方证据，第一手）

| 事实 | 出处 |
| --- | --- |
| hold 轮被 stop/cancel 后，45s 内队列 `left=1`（未采纳） | 聊天线 P32 阶段 6 记录（`evidence/P32-stage6/`，驱动 r16/r17 转录） |
| Stop 按钮在 AgentBox 权限下不 park；cancel 已送达；轮已结束 | 同上 |
| 与 `106`（排空撞死 sidecar）不同：那条修的是"排空撞上已退出的 sidecar"，**本单是"排空根本没被触发"** | 两条的触发点不同，不要互相替代 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 终态钩子 | 轮进入 **cancelled/stopped** 终态时也走既有的"队列采纳检查"（与 completed/failed 同一条路径） | 一致 |
| 有界与类型化 | 采纳失败/不能采纳 ⇒ 类型化事实（例如依赖不可用），**不静默** | 不说假话 |
| 门 | 正例：hold 轮 → stop ⇒ 队列项**在界内开始跑**（或类型化拒绝，二者都必须可见）；反例：退回旧实现必红 | 可证伪 |
| 边界 | 不改队列语义（FIFO、幂等、CAS、withdraw）、不改 wire、不改前端 | 最小改动 |

**必须保持不变**：`queue.withdraw` 语义与 CAS；`server_idempotency`；失败/停止轮的终态与码；`106` 修的 sidecar 存活语义。

**明确不做**：把"停止"改成"暂停"；顺手改前端的排队呈现（P32 阶段 4 已对）。

## Requirements

### Requirement: 任何终态都触发采纳

#### Scenario: 停止后继续

**WHEN** 队列里有一项、当前轮被 stop/cancel
**THEN** 该队列项**在有界时间内开始跑**（或给出类型化的"为何不能"）；不得静默滞留

#### Scenario: 反例门

**WHEN** 把"停止也算终态"的修法退回
**THEN** 同一条用例**必须红**（队列项 45s 不动）

#### Scenario: 与 106 不冲突

**WHEN** 采纳发生时上一轮 sidecar 恰好已退出
**THEN** 106 的语义生效（确保存活/重建后再 prompt），本单不改它

## Stages

- [ ] 1. 复现（本单夹具：hold 轮 + 队列项 + stop）+ 定位采纳检查的触发点（提交）
- [ ] 2. 修（终态钩子）（提交）
- [ ] 3. 门：正例 + 反例 + 与 106 的交叉用例（提交）
- [ ] 4. 收口：回归计数 + 账（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 停止后采纳 | stop/cancel 后队列项在界内开始跑（或类型化不可采纳） | 退回旧实现必红 | fail (typed) |
| G2 语义不变 | 队列 FIFO/幂等/CAS/withdraw 与今天逐字相同 | 任一变 ⇒ 门红 | fail (typed) |
| G3 与 106 交叉 | 上一轮 sidecar 已退出时仍能采纳（走 106 的确保存活） | 该用例红 ⇒ 门红 | fail (typed) |
| G4 不越界 | wire/前端零改动 | 触碰 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest -q tests/server -k "queue or stop or cancel or drain"
python3 -m pytest -q tests/
git diff --check && git status --short
```

## DoD

1. 复现 · 2. 修法 · 3. 门（含反例与交叉）· 4. 回归计数 · 5. `§Spend` 与清理 · 6. 终态行。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`QUEUE_ADOPTION_AFTER_STOP_DONE`；否则 `QUEUE_ADOPTION_AFTER_STOP_PARTIAL` + 精确剩余

## Notes for the executor

- 与 **109** 同属 `sessions/**` 面 ⇒ **串行做**；两条都是"对话闭环"里用户直接撞到的形状（R-0019）。
- 交回方的证据只读参考（另一棵树 `evidence/P32-stage6/`）：**不要**写它、也不要拿它当门。
