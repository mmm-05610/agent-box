---
id: 099
slug: worker-home-put-dispatch
batch: b2
baseline: "ace4ecd2e531d545aac5489cfc905092434d325e"
depends_on: [086]
write_paths: ["workers/agent-box-worker/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0003
terminal: ["WORKER_HOME_PUT_DISPATCH_DONE", "WORKER_HOME_PUT_DISPATCH_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order 099 — Worker 的 `home.put` 从未接上分发线（086 阶段 2 第一手抓到）

> **调度者追认（2026-09-19）**：本单由**后端执行者**按 086 阶段 2 的第一手发现**自行起草**
> （动机正确：`workers/**` 不在 086 的 `write_paths`，它没有越界改代码，而是把缺陷开成新单）。
> 调度者**追认其内容与全部门**，并纠正两处流程：① **契约文本与编号由调度者投递**——下一张单从 **100** 起，
> 执行者**不再自起草**，发现写进本树 `status.md` 的 §Questions（或"待开单"一段）等当轮投递；
> ② 本单 frontmatter 的 `ruling: R-0003` 系自起草时的**误引**（R-0003 是树写权），真实依据是
> **086 的第一手发现 + R-0011 的真机授权范围**；保留原字段以便溯源，此处以追认说明为准。

## Objective

58 的资产写入（用户 MCP 文件、技能、以及 65 的委派桥）在**真实通道**上一发即死：Server 发
`home.put`，Worker 回 `OP_UNSUPPORTED / "operation is unsupported"`。

原因是**接线缺口**，不是实现缺口：`handle_home` 实现了 `home.put`
（`workers/agent-box-worker/src/main.rs:2153`，含大小上限、转义拒绝、非普通文件拒绝），
但唯一分发它的 `match` 臂（`main.rs:355`）只列了
`"home.prepare" | "home.list" | "home.get" | "home.delete"` —— 少了 `"home.put"`，
于是落到兜底臂 `main.rs:491` 的 `OP_UNSUPPORTED`。

它为什么烂到现在：Worker 自己的单测**直接调 `handle_home`**（`main.rs:3055` 起），绕过分发线，
所以实现与线各自绿、合起来必炸。这就是本单要补的那一类覆盖。

**明确不做**：改 `home.put` 的语义/参数形状/边界（`locator`+`name`+`data`(base64)、
空或超限 ⇒ `HOME_IO`、非普通文件 ⇒ 拒绝、转义 ⇒ `PATH_INVALID` 逐字保持）；
改 wire 版本；顺手重构 `serve()` 的分发。

## Current state

| 事实 | 出处（第一手） |
| --- | --- |
| 真跑一次即失败：`WorkerError: operation is unsupported` | 2026-09-18，`tests/server/test_subagent_harness_real_round_086.py` 的父轮：`sidecar.py:593 client.request("home.put", …)` → `agent_box_runtime_wsl/client.py:448` |
| 同一轮的**子/播种轮**（无资产）走通了 | 同上：beta 零授予那一轮 `completed`，失败只发生在有资产文件的父轮 |
| `home.put` 实现在 `handle_home` 内 | `workers/agent-box-worker/src/main.rs:2153-2205` |
| 分发臂不含 `home.put` | `main.rs:355`（`home.prepare|list|get|delete`） |
| 兜底臂产 `OP_UNSUPPORTED` | `main.rs:491` |
| Worker 侧测试绕过分发线直调 handler | `main.rs:3055` 起的 `handle_home(&root, "home.put", …)` |
| Server 侧唯一调用点 | `src/agent_box/server/execution/sidecar.py:593`（58 的 `asset_files` / 56 的订阅文件共用） |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `main.rs:355` 的臂 | 补上 `home.put`（或与 `handle_home` 支持集派生一致，执行者选，写明理由） | 接线 |
| 覆盖 | 新增**穿过真实 Worker 进程**的 `home.put` 用例（真实二进制 + 真实 stdio 线） | 缺失的正是这一层 |
| 防复发 | 钉一条"实现集 == 分发集"的发散门 | 新增 op 忘登记即门红 |

**必须保持不变**：`home.prepare/list/get/delete` 的既有行为；`home.put` 的边界与错误码；
Server 侧 `materialize_subscription` 的调用形状；既有 `.acceptance-bundle-c4|c8|c9|c10|c11|musl` 目录（新二进制投递到**新** bundle 目录）。

## Requirements

### Requirement: 真实通道上 `home.put` 可用

#### Scenario: 一发即中

**WHEN** 测试启动构建出的 Worker 二进制，`home.prepare` 一个 Profile home 后发 `home.put`
**THEN** 返回成功，字节落在 prepare 答复的那条主机路径下，且 `home.get`/`home.list` 读回同一份

#### Scenario: 修复前必须红（反例）

**WHEN** 用**修复前**的 bundle（`.acceptance-bundle-c11`）跑同一条用例
**THEN** 它必须失败并显式指出 `OP_UNSUPPORTED` 或 `operation is unsupported` —— 门不能对旧二进制为绿

### Requirement: 边界不因接线而放松

#### Scenario: 坏输入仍是类型化拒绝

**WHEN** `home.put` 载荷为空/超限、目标已存在且是目录或符号链接、`name` 试图逃出 home
**THEN** 依次得到既有错误（`HOME_IO` / 拒绝 / `PATH_INVALID`），**不是** `OP_UNSUPPORTED`，也不是 200

### Requirement: 实现集与分发集不许发散

#### Scenario: 新增 op 忘接线的反例

**WHEN** `handle_home` 里出现一个未列进分发臂的 op
**THEN** 发散门必须红（读两处源码比对集合，逐字相等）

## Stages

- [ ] 1. 观测：第一手复现（真二进制上 `home.put` ⇒ `OP_UNSUPPORTED`）+ 钉死两处行号（提交）
- [ ] 2. 接线：补分发臂（或派生），保持边界逐字不变（提交）
- [ ] 3. 门：真实进程 wire 用例（新二进制绿、c11 红的反例断言）+ 三条边界用例 + 发散门（提交）
- [ ] 4. 收口：重建 bundle 到新目录并登记 sha256、复跑 086 阶段 2 的父轮、本树 status 解除阻塞 + 终态行（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 接线 | 真实 Worker 进程上 `home.put` 成功且字节落在 prepare 的主机路径 | 对 c11（旧二进制）同一条用例必须红 | fail (typed) |
| G2 边界 | 空/超限、非普通文件、转义 ⇒ 既有类型化错误而非 `OP_UNSUPPORTED` | 任一被放宽成 200 必须门红 | fail (typed) |
| G3 发散即失败 | `handle_home` 支持的 op 集合 == 分发臂列出的集合（逐字比对） | 人为从臂里删掉一个 op，门必须红 | fail (typed) |
| G4 回归 | `cargo test` 全绿 + 根套件计数不降 + 四个既有 home op 行为不变 | 任一变红即门红 | fail (typed) |
| G5 下游复证 | 086 阶段 2 的父轮（真 harness 资产写入）不再死于 `OP_UNSUPPORTED` | 仍报 `OP_UNSUPPORTED` 即门红 | fail (typed) |

## Validation

```bash
cargo test --locked --manifest-path workers/agent-box-worker/Cargo.toml
bash scripts/server-round1/build-worker.sh workers/agent-box-worker/.acceptance-bundle-c12
python3 -m pytest tests/server -q -k "home_put or worker_home"
python3 -m pytest -q tests/server
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 实现（接线，最小）· 2. 反例（G1 对旧 bundle 必红 + G3 删臂必红）· 3. 真实环境（真二进制进程）·
4. 回归计数（cargo + 根套件）· 5. 账务：新 bundle 的 sha256、下游复跑结果、清理临时 root · 6. 账：本树 status 阻塞行 + 本单终态行。
缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`WORKER_HOME_PUT_DISPATCH_DONE`
- 否则：`WORKER_HOME_PUT_DISPATCH_PARTIAL` + 精确剩余

## Notes for the executor

- 本单是 **086 阶段 2 的硬前置**（086 的 `write_paths` 不含 `workers/**`，故另立单）。做完立刻回 086 复跑父轮。
- 影响面比"委派"更大：**任何** 58 资产（用户 MCP、技能）在真实通道上都写不进去；如复现到别的家，一并记进证据文件。
- 别改 `handle_home` 的边界逻辑；那是 45 的地盘，只动接线与测试。
