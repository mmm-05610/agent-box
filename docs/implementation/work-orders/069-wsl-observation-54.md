---
id: 069
slug: wsl-observation-54
batch: b1
baseline: "e39959f"
depends_on: [{"order": "068", "condition": "tree commit (its ledger rows land first so this round has somewhere to be recorded)"}]
write_paths: ["docs/server-round1/fullstack/**", "docs/implementation/status.md"]
forbidden: ["src/**", "plugins/**", "tests/**"]
ruling: R-0005
terminal: ["WSL_OBSERVATION_DONE", "WSL_OBSERVATION_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order 069 — 54 的 WSL 通道观测轮（c11）


## Objective

54 的**本机通道**切片已完成（`change_set` 模块 + 账本，schema 9），但 **WSL 通道的变更集此前如实记为 unknown**
（Worker 无 workspace 列举 op）。c11 上各家门已绿，本单用既有门跑一次**WSL 通道的观测轮**，把"经 WSL 执行的一轮里
变更集能不能拿到"变成一手事实——拿到就补解析/投影，拿不到就把**类型化原因**与协议缺口钉死并交回调度者。

## Current state

- 54 行（现状）："WSL 通道的变更集如实 unknown（Worker 无 workspace 列举 op，协议面待扩展）"
- c11 门与本轮八家全链门均 exit 0（`e39959f` 提交信息），观测轮的前置可用
- 本机通道已有实现可对照：`change_set` 模块与账本列（schema 9）在 `src/agent_box/**` 内（只读参考，不在本单写权内）

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| WSL 通道一轮真实执行 | 采集该轮的变更集事实（或类型化原因） | 把 unknown 变成一手事实 |
| `docs/server-round1/fullstack/**` | 观测报告 + 门/命令输出摘要 | 证据落点 |
| `docs/implementation/status.md` | 54 行刷新 + 本单终态 | 账 |

- 可以在**假端点**下跑（零真实模型调用）；需要真实模型时先取得授权并记账
- 不改协议、不改代码：若发现协议缺口，**记录并交回**，不自行扩展 wire

## Requirements

### Requirement: 用既有门产出 WSL 通道的一手事实

#### Scenario: 一轮经 WSL 通道的执行被采集

**WHEN** 用现有门脚本（`--keep` 以保留账本）跑一轮经 WSL 通道的执行
**THEN** 报告给出该轮 `change_set_object_digest` 的实际取值（非空）**或**类型化原因（例如"Worker 无 workspace 列举 op"），
并附命令、退出码与账本查询片段

### Requirement: 否定结果按否定入账

#### Scenario: 拿不到就如实记

**WHEN** 该轮仍拿不到变更集
**THEN** 54 的行写"WSL 通道 = unknown + 原因 + 协议缺口位置（文件:行）"，**不写成通过**，并把该缺口列为交回项

## Stages

- [x] 1. 确认 c11 门可跑并记录起点（提交：观测前状态）
- [x] 2. 跑一轮 WSL 通道并直查账本取变更集事实（提交：命令与输出摘要）
- [x] 3. 写观测报告 + 刷新 54 行 + 自查（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 轮次真实 | 报告中该轮在账本里可达（turn id + 终态） | 删掉该轮账本行即失败 | fail (typed) |
| G2 事实分级 | 变更集取值或类型化原因二者必居其一，且标明出处（账本列/报错码） | 写"看起来应该能拿到"即失败 | fail (typed) |
| G3 不改协议 | `git diff --stat -- src plugins` 为空 | 出现 src/plugins 改动即失败 | fail (typed) |

## Validation

```bash
python3 scripts/server-round1/<门脚本> --keep             # 具体脚本名以本树现状为准，报告里写明
sqlite3 <账本> "select id,state,change_set_object_digest from server_turns order by created_at desc limit 5"
git diff --stat -- src plugins
git diff --check && git status --short
```

## DoD

1. 实现：无需代码改动（若需，先交回调度者）。2. 反例：G3 的"改了 src"演练一次。3. 真实环境：WSL 通道真跑一轮。
4. 回归：套件沿用最近一次 879 的实测并标明提交。5. 账务：零真实模型调用；清理临时目录。6. 账：54 行刷新 + 本单终态行。

## Acceptance

- 绿：`WSL_OBSERVATION_DONE`（拿到事实，正或负）
- 否则：`WSL_OBSERVATION_PARTIAL` + 精确阻塞与命令
