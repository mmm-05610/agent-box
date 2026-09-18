---
id: 097
slug: hello-capability-table-sync
batch: b2
baseline: "f6cbc113791347e20acc85ec34c2e697d2345dd0"
depends_on: []
write_paths: ["src/agent_box/**", "plugins/**", "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0013
terminal: ["HELLO_CAPABILITY_SYNC_DONE", "HELLO_CAPABILITY_SYNC_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order 097 — `server.hello` 的能力表与派发表对齐（单一真相）

## Objective

试用实测（2026-09-19，调度者第一手）：对当前代码的 Server 调 `server.hello`，`capabilities` 只声明 **27** 个方法，
而派发表 `_handlers` 有 **64** 个——**37 个方法在服务端真实存在，却对外声明"没有"**（差集精确：见 §Current state）。
应用已经按这份表门控界面（P25 刚把探测按钮改成"跟着服务的声明走"），所以这份陈旧表会**继续生产假话**：
`Refresh from provider` / `Test connection` 会因为"服务没有这个方法"而禁用，尽管方法就在那里。

本单把能力表改成**从派发表派生**（单一真相），并加一道**发散即失败**的门，让它不能再悄悄落后。

**明确不做**：改 wire 形状（`capabilities` 的条目结构 `{id, supported, reason?}` 不变）；改 `_capability` 的**支持态语义**
（workspaces/sessions 的 blocker 行为逐字保持）；前端改动（P25 已就位）。

## Current state

| 事实 | 出处（第一手） |
| --- | --- |
| hello 表由**手工常量** `CAPABILITY_IDS` 驱动（27 条） | `src/agent_box/server/wire/handlers.py:34`；`hello()` 在 `:406` 遍历它 |
| 派发表 `_handlers` 有 **64** 个方法 | `handlers.py`（`"a.b": self.x` 形式的条目） |
| **差集 = 37**，逐条：`accounts.{list,create,bind,importAsset}`、`assets.{list,bind,bindings,catalog,installFromCatalog,probe,publishMcp,publishPlugin,publishSkill,syncCatalog,unbind}`、`executions.list`、`hooks.{create,delete,list,setEnabled,triggers,update}`、`profiles.{clone,grantSubagent,memory,revokeSubagent,setPermissions,subagentGrants}`、`providerArtifacts.{install,list,rollback}`、**`providerModels.{probeModels,probeConnection}`**、`server.hello`、`usage.{aggregate,export}`、`workspaces.gitStatus` | 本次实测（`server.hello` 的真实响应 vs 派发表） |
| 反方向差集 = **0**（表里没有派发不出来的方法） | 同上 |
| `_capability(id)` 是**前缀判定**且有 `return True, None` 兜底，所以它对**任意** id 都能给出结论 | `handlers.py:428-444` |
| 前端按该表门控（P25 的题目）；Q2 报告 ③ 已登记"后端能力表落后于 `_handlers`" | 前端 `work-orders/P25-probe-gating.md`；`docs/desktop-product-delivery/status.md` 的 Q2 检查点 |
| 派发表是**服务端**的真相；前端合同只登记它用到的子集（59）——两者不是同一张表 | 前端 `contracts/wire-v1/README.md` |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `CAPABILITY_IDS` 常量 | 改为**从派发表派生**（`_handlers` 的键，稳定排序）；`server.hello` 自身是否对外声明**显式决定并写明理由**（建议：声明，它是发现入口） | 单一真相 |
| `hello()` | 遍历派生集合；`{id, supported, reason?}` 形状不变 | 契约不变 |
| `_capability(id)` | 语义**逐字保持**（前缀判定 + 兜底）；给未知 id 的行为写进注释/测试 | 不回归 |
| 新增门 | **发散即失败**：派发表与 hello 表集合相等且无重复；反例是"摘掉一个 handler ⇒ hello 少一项" | 不再落后 |
| 测试 | 逐条断言 37 个新声明的方法出现；对 `providerModels.probeModels` 断言在模型配置服务就绪时为 `supported: true` | 试用可见 |

**必须保持不变**：`capabilities` 条目形状与顺序稳定性（客户端可缓存）；`auth` 字段；`workspaces.*`/`sessions.*` 的
blocker 语义与 reason 文案；既有 wire 测试全绿；不把内部/不可达方法混进表（若存在，列白名单并写明理由）。

**明确不做**：把能力表做成"按客户端版本裁剪"（那是另一个决定）；把前端合同的方法集当成本表来源；
为了让表变长而声明未实现的方法。

## Requirements

### Requirement: 能力表与派发表集合相等

#### Scenario: 完备且无重复

**WHEN** 调 `server.hello`
**THEN** `capabilities[].id` 的集合 **==** 派发表键的集合，且**无重复**；本次实测的 37 个方法全部出现
（其中 `providerModels.probeModels`/`probeConnection` 在模型配置服务就绪时 `supported: true`）

#### Scenario: 反例（发散必须失败）

**WHEN** 从派发表里摘掉一个方法（或加一个而不更新表）
**THEN** 门**失败**（集合不相等）；这是"以后不会再悄悄落后"的保证

### Requirement: 支持态语义不回归

#### Scenario: 既有 blocker 行为逐字保持

**WHEN** 在 workspace 有 readiness blocker / 未配置执行 的部署上调 hello
**THEN** `workspaces.*` / `sessions.*` 的 `supported=false` 与 `reason` 与今天**逐字一致**（同一部署对比）

#### Scenario: 未知 id 的兜底

**WHEN** 给 `_capability` 一个前缀未覆盖的 id
**THEN** 行为与今天一致（兜底 `True, None`），并有测试钉住

## Stages

- [ ] 1. 观测：跑一次真实 hello 与派发表差集，落表（提交）
- [ ] 2. 派生 + `server.hello` 自身的声明决定（提交）
- [ ] 3. 发散门 + 反例测试 + 37 条断言（提交）
- [ ] 4. 门与账：全套件 + 真机 hello 复跑（与前端 P25 的门一致）+ status（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 集合相等 | hello 的 id 集合 == 派发表键集合，无重复 | 摘掉一个 handler 后表未变必须门红 | fail (typed) |
| G2 试用可见 | `providerModels.probeModels`/`probeConnection` 声明为 supported（服务就绪时） | 仍缺这两项必须门红 | supported=false + reason |
| G3 语义不回归 | workspaces/sessions 的 blocker 与 reason 逐字一致 | 改动 reason 文案必须门红 | fail (typed) |
| G4 回归 | 既有 wire 测试 + 全套件计数入账 | 任一项变红即门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
# 真机复跑（Windows 侧 Server + 真实 hello）：
#   curl -s -X POST http://127.0.0.1:18770/wire/v1/server.hello -H "Authorization: Bearer <token>" \
#     -d '{"jsonrpc":"2.0","id":"1","method":"server.hello","params":{"clientVersions":["0.17.2"],"clientPresentationSupports":["text"]}}'
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 实现（派生 + 声明决定）· 2. 反例（G1）· 3. 真实环境（真机 hello 响应里 37 个方法出现，含两个 probe）· 4. 回归计数
· 5. 账务与清理 · 6. status 分账。缺一项 ⇒ `HELLO_CAPABILITY_SYNC_PARTIAL`。

## Acceptance

- 绿：`HELLO_CAPABILITY_SYNC_DONE`
- 否则：`HELLO_CAPABILITY_SYNC_PARTIAL` + 精确剩余

## Notes for the executor

- 本单在 **b2 追加**（试用抓到、且前端 P25 正等它把探测按钮点亮）。
- 前端 P25 已按"服务声明"门控：本单落地后**不需要**前端改动，按钮自然可用（P25 的反例路径仍成立）。
- 需要人拍的事 → 本树 status §Questions；契约问题交回调度者。
