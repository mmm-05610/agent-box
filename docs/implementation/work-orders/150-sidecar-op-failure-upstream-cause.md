---
id: "150"
slug: sidecar-op-failure-upstream-cause
batch: b2
baseline: "3e68608"
depends_on: []
write_paths: ["plugins/agent-box-harnesses/runtime/**", "src/agent_box/server/execution/**", "src/agent_box/server/sessions/**", "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "src/agent_box/server/wire/**", "release/**"]
ruling: R-0078
terminal: ["SIDECAR_CAUSE_TRANSPORT_DONE", "SIDECAR_CAUSE_TRANSPORT_PARTIAL"]
waive: []
parallel_units: ["observe", "worker-cause", "durable-cause", "gate"]
serialize_with: ["079", "089", "092", "093", "094", "095", "096", "097", "098", "099", "101", "103", "106", "107", "108", "109", "111", "113", "121", "122", "125", "126", "127", "128", "129", "130", "131", "133", "134", "135", "136", "137", "138", "139", "140", "141", "142", "144", "145", "146", "148"]
revisions: []
---

# Work Order 150 — **失败的「上游原因」必须回传到产品状态**：不得只留一个 `SIDECAR_OP_FAILED`（`R-0078 ②`）

## Objective

**来源：`R-0078`（用户 2026-09-20 10:00「跑了这么久还是不能用，卡在哪里」）＋ ops 第 152 轮开单。**

`R-0078` 的第二处卡点：**发送被受理**（`D4` `http 200`，session 建起来了），随后 turn 终态 `["queued","failed"]`、
**`reason = SIDECAR_OP_FAILED`**、**助手回复 0 字**（`a-r5-cause-split.json` `D5`）。用户拿到的**只有一个码**，
**看不到上游为什么失败**——所以"卡在哪里"答不出来。

**ops 一手定位（三源取二，读的是代码不是猜测）**——**原因在传输路上被丢掉了，不是没产生**：

| 事实 | 出处（一手） |
| --- | --- |
| Worker **确实**发出了原因：op 失败时回 `error:{code: error?.code ?? "SIDECAR_OP_FAILED", message: safeText(error?.message ?? error, 500)}` ⇒ **message 是有界的、也是发出来的**；只有 `code` 缺失时才落到那个**兜底码** | `plugins/agent-box-harnesses/runtime/worker-entry.mjs:341-347`（`:345` 是兜底） |
| Python 侧**收下了 message**：`SidecarError(str(error.get("code","SIDECAR_ERROR")), str(error.get("message","")))` ⇒ 上游原因**到过服务端** | `src/agent_box/server/execution/sidecar.py:1046-1056`（`request()` 的两处 `raise SidecarError`） |
| 但**落账时只剩 code**：`fail_turn(turn_id, _safe_code(exc))` ⇒ `UPDATE server_turns SET error_code=?` 且只发 `turn.state {state, error_code}`、`turn.capture {state, error_code}` ⇒ **message 从未进入任何可读的产品状态** | `sidecar_backend.py:584-590`；`sessions/repository.py:983-1023`（`error_code=code[:128]`，事件体里没有 message 位） |
| `_safe_code()` 只取码、并按 `[A-Z][A-Z0-9_]{2,127}` 形状白名单**故意**不把自由文本放进事件位（既有纪律，`65:36`） | `sidecar_backend.py:952-970`（注释原话：'The typed event can only carry a code'） |

**⇒ 本单要修的**：让**上游原因**（**类型化的原因码 ＋ 有界文本**）**回传到产品可见状态**，而不是只留一个兜底码。
**"今天只给一个码"这个事实本身就是缺陷**：兜底码把**互不相同的上游故障**压成**同一个**，用户与门都无从判别。

**为什么归 runtime 线（ops 归属判据）**：Worker 侧（`plugins/agent-box-harnesses/runtime/**`）、
`server/execution/**`、`server/sessions/**` **全在本树写面**（章程 §写面：`plugins/**`、`server/execution/**`、`server/sessions/**`）；
`wire/**` **不碰**（见下面的协议边界）。

## Current state（一手）

- 用户可读的失败面今天只有：`server_turns.error_code`、事件 `turn.state.error_code` / `turn.capture.error_code`（`repository.py:1011-1023`）。
- `SidecarError` 的 `message` 字段在异常对象上存在，但**没有任何持久化路径**；只有 `logging.exception(...)` 进服务端日志（`sidecar_backend.py:586`）。
- 兜底码 `SIDECAR_OP_FAILED` 同时覆盖：adapter 抛的普通 `Error`、harness 协议错误、spawn/通道故障……**今天不可判别**。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| Worker 的兜底码 | **不再把互不相同的上游故障压成同一个码**：能判别的类（如 adapter 起不来 / op 不支持 / 通道读端已死 / 凭据不可用）各自给出**自己的**类型化码；`SIDECAR_OP_FAILED` **只作最后一档兜底** | `R-0078 ②` 的本体：一个码＝不可判 |
| 上游原因的可读性 | **回传到产品状态**：至少让 `error_code` **可判别**（零协议变更，见协议边界）；若判定**必须有文本**才能回答"卡在哪"，**阶段 1 就交回 ops** 走字段单（`R-0071 ①`），**不要**自己往事件体加键 | 新增事件键＝合同变更 ⇒ 触发 `110`/`113` 那一族的重锁链 |
| 有界与形状 | 任何新增/透出的文本必须**有界**（沿用 `safeText(...,500)` 量级）且**不夹带**路径/凭据/内部结构；码必须落在既有白名单形状内 | `65:36`；凭据红线 |
| 既有语义 | `TURN_CANCELLED` 与 `{WORKER_DISCONNECTED, DISPATCH_AMBIGUOUS} → unknown` 的既有分流**逐字不变** | 那是 `109`/`126` 一族已落地的判据 |

**协议边界（重要）**：本单的**必做**部分**零协议变更**（只改"给出哪个码"＋在**既有**字段里承载）。
**若**你要新增事件字段（例 `turn.state.reasonDetail`）⇒ **阶段 1 交回 ops**，由 ops 开字段单并排进**下一次重锁窗口**（与 `151` 同一族），
**本单不得**自行改 `wire/**` 或自行加键（章程：`wire/**` 属 A 树）。

**边界（与 `149`/`151` 不重叠）**：`149`＝凭据身份与注入对齐（A 线）；`151`＝wire 受控凭据录入口（A 线）。
本单**不修**凭据身份，**只修"失败原因能不能回传"**。`R-0076 ④` 已钉：**`D6 不截断` 是本单的下游**，`108` 的截断另算，**不得**把 `D6` 当第二格。

## Requirements

### Requirement: 一个失败 turn，必须让**判别上游原因**成为可能

#### Scenario: 两个不同的上游原因 ⇒ 两个不同的可见原因（正例，本单主目标）

**WHEN** 分别制造**两个已知不同**的上游失败（例：adapter 起不来 vs harness op 不支持）
**THEN** 两次的 `error_code`（或既有字段里承载的原因）**不同**，且各自对应其真实类

#### Scenario: 原因在**产品状态**里可读，不只是日志（正例）

**WHEN** 走真 wire 读该 session 的事件／turn 记录（不是读服务端日志）
**THEN** 能读到**判别性原因**；**不得**出现"日志里有、产品面只有一个兜底码"

#### Scenario: 兜底仍然类型化（反例，必须）

**WHEN** 制造一个**真正无法归类**的失败
**THEN** 仍回**类型化**兜底码（`SIDECAR_OP_FAILED` 或等价），**且**码位不含自由文本、不夹带路径/凭据

#### Scenario: 反例（门要能咬）

**WHEN** 把原因判别改回"一律回兜底码"
**THEN** 上面**正例 1 必须红**

#### Scenario: 既有分流不变（正例）

**WHEN** 跑 `TURN_CANCELLED` 与 `WORKER_DISCONNECTED` 的既有用例
**THEN** 行为**逐字不变**（取消仍 `cancelled`，断连仍 `unknown`）

## Stages

- [ ] 1. 观测：一手复现"发送受理 → `failed` ＋ 单一兜底码 ＋ 0 字回复"，并**量出 message 在哪一步被丢**（代码位置＋实测）（提交）
- [ ] 2. Worker 侧：让可判别的上游类各自带**自己的**类型化码（兜底降为最后一档）（提交）
- [ ] 3. 服务端侧：把上游原因**落到产品可见状态**（零协议变更；要加键 ⇒ 阶段 1 交回 ops）（提交）
- [ ] 4. 门与反例（两个不同原因 ⇒ 两个不同码／兜底仍类型化／既有分流不变）（提交）
- [ ] 5. 账：写清"今天为什么只有一个码"的因果链（一段话＋行号）（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 可判别 | 两个已知不同的上游失败 ⇒ 两个**不同**的可见原因码 | 都回兜底码 ⇒ 门红 | fail (typed) |
| G2 产品面可读 | 经真 wire 读 session 事件／turn 记录即能读到判别性原因（**不依赖日志**） | 只改日志 ⇒ 门红 | fail (typed) |
| G3 兜底类型化 | 不可归类的失败 ⇒ 仍类型化兜底码，码位无自由文本、无路径/凭据形状 | 透出原始 message 当码 ⇒ 门红 | fail (typed) |
| G4 既有分流 | `TURN_CANCELLED` ⇒ `cancelled`；`WORKER_DISCONNECTED` ⇒ `unknown`（逐字不变） | 任一被改动 ⇒ 门红 | fail (typed) |
| G5 有界 | 任何透出的文本 ≤ 500 字符且已做形状清洗 | 无界文本 ⇒ 门红 | fail (typed) |
| G6 无凭据外泄 | 证据/事件/日志里 `grep` 不到凭据形状 | 出现密钥形状 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现并**指出 message 被丢的确切一步** · 2. Worker 侧原因码可判别（兜底降档） · 3. 原因**在产品状态**可读（零协议变更，或按边界交回） ·
4. 门与反例（G1–G5） · 5. 账里给出因果链。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`SIDECAR_CAUSE_TRANSPORT_DONE`
- 否则：`SIDECAR_CAUSE_TRANSPORT_PARTIAL` + 精确剩余

## Notes for the executor

- **排序（`R-0079 ②`）**：本单排在 `146` 收尾**之后**（`146` 已在飞，别与它抢 `sessions/**`）；与 `148`（被吞异常的有界探针）**同族**，
  两单都要动 `plugins/agent-box-harnesses/runtime/**` ⇒ **串行**（`parallel_code_with` 未授权跨单并行）。
- **`R-0076 ④`**：本单**不**承诺"0 字回复"变好；`R-0078` 已定 D6 是本单下游。若你的修法**顺手**让回复到达了，**照实记**，但**别**把它当 DoD。
- **不要**为了"多给信息"而放宽 `_safe_code` 的形状白名单（G3 就是钉这条）；也不要把内部异常 `str()` 直接塞进事件体。
- **前提待验**（`OF-02`）：本单引用的行号（`worker-entry.mjs:341-347`、`sidecar.py:1046-1056`、`repository.py:983-1023`、`sidecar_backend.py:584-590`／`952-970`）
  是 ops 一手读的；**第一步自己复核**，与本单不符 ⇒ 在 `status.md` 写明并交回。
