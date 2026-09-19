---
id: "109"
slug: second-delay-failure-hangs-http
batch: c2
baseline: "1709be2"
depends_on: []
write_paths: ["src/agent_box/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**"]
ruling: R-0019
terminal: ["HTTP_HANG_AFTER_SECOND_FAILURE_DONE", "HTTP_HANG_AFTER_SECOND_FAILURE_PARTIAL"]
waive: []
parallel_units: ["repro", "fix", "gate"]
---

# Work Order 109 — 同一会话第二次 `delay-failure` 轮之后，Server 的 HTTP 全面挂起

## Objective

**来源**：聊天线 P32 阶段 6 的**第一手实验**（交回调度者，证据与最小复现在其证据目录）——
**同一会话里第二次** `delay-failure` 轮（`sessions.send` / continue）之后，**Server 进程存活但 HTTP 全面挂起**：
`/live` 无响应、wire 请求的连接被半关。**用户可见后果**：任何后续操作都像"应用死了"，而服务其实还在。

**要的行为**：延迟失败轮**不得把传输面拖死**——第二次及以后照样能应答（哪怕照样以类型化错误失败）；
轮次的失败语义与既有终态（failed / unknown）不变。

## Current state（交回方证据，第一手）

| 事实 | 出处 |
| --- | --- |
| 复现：同会话第二次 `delay-failure` 轮 ⇒ 进程存活、`/live` 无响应、wire 连接半关 | 聊天线 `docs/desktop-product-delivery/evidence/P32-stage6/backend-hang-repro-server.log`、`app.log`、`server.log`；运行根 `/tmp/p32-exp` |
| 触发面：`sessions.send`/continue 的失败路径（延迟 ⇒ 失败） | 同上（转录与日志） |
| 表现层的诚实口径已对：传输挂起时客户端显示 `unknown`（措辞正确、无原码可显） | P32 收口记录（本单只修服务端，不动前端） |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 复现 | 在**本单自己的**假端点/夹具上把"第二次延迟失败 ⇒ HTTP 挂起"复刻出来（不得依赖聊天线的 /tmp 目录） | 门要有自己的证据 |
| 失败路径 | 找出把事件循环/线程池/连接池拖死的点并修（**有界**：超时、异常路径必须释放连接与执行槽） | 不拖死传输面 |
| 门 | 正例：连续两次（或 N 次）延迟失败轮之后，`/live` 与一次 `server.hello`/`profiles.list` 仍在**有界时间内**应答 | 可证伪 |
| 边界 | 不改 wire 形状、不改队列语义、不改前端 | 最小改动 |

**必须保持不变**：失败轮的终态与错误码语义（failed/unknown 与既有类型化码）；`/live` 与 wire 的既有契约；凭据纪律（不读内容）。

**明确不做**：把挂起"缓解"成更长超时；在客户端加重试掩盖；改前端的 unknown 呈现。

## Requirements

### Requirement: 第二次失败轮不再拖死传输

#### Scenario: 正例

**WHEN** 同一会话连续两轮延迟失败
**THEN** 之后 `/live` 与一次 `server.hello` **在有界时间内正常应答**（记录实测耗时）

#### Scenario: 反例门

**WHEN** 把修法退回当前实现
**THEN** 同一条用例**必须红**（复刻 HTTP 挂起）

#### Scenario: 失败语义不变

**WHEN** 两条轮次都失败
**THEN** 它们的终态与错误码与今天**逐字相同**（不许"修挂起把失败改成成功"）

## Stages

- [ ] 1. 复现（本单自带的夹具/假端点）+ 定位（线程/连接/事件循环哪一处被拖死）（提交）
- [ ] 2. 修（有界释放）（提交）
- [ ] 3. 门：正例 + 反例（退回必红）+ 失败语义不变（提交）
- [ ] 4. 收口：回归计数 + 账（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 不再挂起 | 两次延迟失败后 `/live` 与 `server.hello` 有界应答 | 退回旧实现必红 | fail (typed) |
| G2 语义不变 | 两轮的终态/错误码与今天逐字相同 | 任一变 ⇒ 门红 | fail (typed) |
| G3 有界 | 所有等待/重试有上界，超时类型化 | 无界 ⇒ 门红 | fail (typed) |
| G4 不越界 | wire/队列/前端零改动（diff 面点名） | 触碰 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest -q tests/server -k "delay or hang or live or transport"
python3 -m pytest -q tests/
git diff --check && git status --short
```

## DoD

1. 复现 · 2. 修法 · 3. 门（含反例）· 4. 回归计数 · 5. `§Spend` 与清理 · 6. 终态行。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`HTTP_HANG_AFTER_SECOND_FAILURE_DONE`；否则 `HTTP_HANG_AFTER_SECOND_FAILURE_PARTIAL` + 精确剩余

## Notes for the executor

- 交回方的证据在另一棵树（只读参考）：`agent-box-desktop-next-wsl-round1/docs/desktop-product-delivery/evidence/P32-stage6/`（**不要**写它，也不要依赖它做门）。
- 用户可见度高（"应用像死了"）⇒ 与 **110**（stop/cancel 后队列不采纳）同批；两条都在 `sessions/**` 面，**串行做**。
