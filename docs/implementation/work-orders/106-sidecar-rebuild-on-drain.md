---
id: "106"
slug: sidecar-rebuild-on-drain
batch: b2
baseline: "75db678"
depends_on: []
write_paths: ["src/agent_box/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0019
terminal: ["SIDECAR_DRAIN_REBUILD_DONE", "SIDECAR_DRAIN_REBUILD_PARTIAL"]
waive: []
parallelism: "none"
parallelism_reason: "已收口的历史单：执行时未拆分单元，补记为单线程（不是本单引入的并行缺口）；再次触碰时按当时实际重declared。"
parallel_units: []
---

# Work Order 106 — 排队回合在排空时撞上已退出的 sidecar ⇒ `SIDECAR_CLOSED`（应重建后再 prompt）

## Objective

**来源：验收第 2 轮 `ACC-R2-1`（confirmed / medium；用户第一手：忙时发的消息"直接发出去并报错"）。
归属与优先：与 R-0019 的"对话闭环"同优先——它让**队列功能在真实使用里等于没有**。**

排空（queue drain）在上一轮 **completed 的同一秒**开始，而那一刻**上一轮的 sidecar 已经退出**，
于是排空直接把消息发给一个死进程 ⇒ 1 秒内 `SIDECAR_CLOSED` 失败。**用户看到的形态是"排队 → 立刻失败"。**

**要的行为**：排空遇到"该 sidecar 已关闭/正在关闭"时，**先重建或等待 teardown 完成后再次 prompt**
（复用与新轮次同一条 "ensure running" 路径），**不得**让队列项以 `SIDECAR_CLOSED` 收场。

## Current state（来源＝验收第 2 轮记录，`docs/acceptance/round-2.md` §ACC-R2-1，第一手）

| 事实 | 出处 |
| --- | --- |
| 会话 `session_70d382e2cee641…`（工作区 `agentbox-chat`）：`4ba8429e`（非排队）**completed 02:17:38**；`333dc82e`（**排队项 `queue_3593d8823a…`**）**created 02:17:38 → failed 02:17:39**，`error_code=SIDECAR_CLOSED` | ACC-R2-1（DB + 日志） |
| 抛错点：`sidecar.py:1050 → SidecarError("SIDECAR_CLOSED: sidecar exited before answering")`，由 `sidecar_backend.py:331 prompt_worker` 走到 | 同上（日志） |
| **它不是"打断"**：排队项在上一轮 completed 之后才开跑（同秒），随后 1 秒即败 | 同上 |
| 前端侧行为正确（P32 的产物）：失败行带码 + Retry、输入栏 "Delivery unconfirmed"、草稿保留 | ACC-R2-1 附带 |

**反例门（本单的核心）**：忙时入队一条 ⇒ 上一轮结束后该条**必须成功跑完**；把实现退回今天的样子必须**门红**。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 排空路径 | 排空前**确保 sidecar 存活**：复用既有的 ensure-running 入口；若正在关闭，**等待 teardown 完成或重建**后再 prompt | 队列要真能跑 |
| 生命周期竞态 | 关闭/重建要有界、可重试、类型化失败；不得静默吞错、不得重复派发 | 有界且诚实 |
| 门 | 正例（入队→排空一轮跑完）+ **旧实现必红**（反例） | 门要咬 |
| 边界 | **不改 wire、不改队列语义**（入队/派发/幂等/CAS 全部不动），只修 sidecar 生命周期 | 最小改动 |

**必须保持不变**：`queue.withdraw` 的语义与 CAS；`server_idempotency` 的幂等链（同 requestId 重放仍不重复派发）；
失败仍要**如实**带码（不许把 `SIDECAR_CLOSED` 改成"成功"或含糊文案）。

**明确不做**：把上限/超时"调大"当修法；在 wire 上加"重试"方法；改前端的失败呈现（P32 已正确）。

## Requirements

### Requirement: 排空不再撞死 sidecar

#### Scenario: 上一轮 completed 后立刻排空（正例）

**WHEN** 忙时入队一条，上一轮结束时该 sidecar 已退出或正在退出
**THEN** 该排队项**成功执行完**（拿到终态，不出现 `SIDECAR_CLOSED`）

#### Scenario: 反例门（旧实现）

**WHEN** 把"确保存活"的修法退回当前实现
**THEN** 同一条用例**必须红**（复现 `SIDECAR_CLOSED` 的 1 秒失败）

#### Scenario: 有界与类型化

**WHEN** 重建/等待超过上界
**THEN** 类型化失败（写明是"重建失败/超时"这一类，带可诊断信息），**不是**静默、**不是**无限等待

## Stages

- [ ] 1. 观测：复现（真 Server 或既有假端点栈）＋把 `SIDECAR_CLOSED` 的时序钉到行级（提交）
- [ ] 2. 修法：排空走 ensure-running / 等 teardown / 重建（提交）
- [ ] 3. 门：正例 + 反例（旧实现必红）（提交）
- [ ] 4. 收口：回归计数 + 账（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 正例 | 入队→排空必须跑完（终态非 `SIDECAR_CLOSED`） | — | fail (typed) |
| G2 反例门 | 退回旧实现 ⇒ 用例红（复现 1 秒失败） | 退回仍绿 ⇒ 门没咬，fail | fail (typed) |
| G3 不越界 | 队列语义/幂等/CAS/wire 零改动（diff 面点名） | 触碰上述面 ⇒ 门红 | fail (typed) |
| G4 有界 | 重建/等待有上界且超时类型化 | 无界等待或静默 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest -q tests/server -k "queue or sidecar or drain"
python3 -m pytest -q tests/   # 根套件计数照实登记
git diff --check && git status --short
```

## DoD

1. 修法 · 2. 正例 + 反例门 · 3. 回归计数 · 4. `§Spend` 与清理 · 5. 终态行。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`SIDECAR_DRAIN_REBUILD_DONE`；否则 `SIDECAR_DRAIN_REBUILD_PARTIAL` + 精确剩余

## Notes for the executor

- **准序**：排在 **104（安全）之后、101 之前**（公告第 32 轮公布）。
- 验收方（`docs/acceptance/**`）会在真实栈上复验"忙时入队 → 排空成功"这一条；截图/转录由他们出。
