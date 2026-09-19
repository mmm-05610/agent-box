---
id: "116"
slug: wire-500-fork-parity
batch: b2
baseline: "d12e9917771f4be4972a8abd194b0b1fb8393e67"
depends_on: [{"order": "external: agent-box-env-provider 的 wire 正确形态", "condition": "agent-box-env-provider tree commit bca77821：src/agent_box/server/wire/handlers.py 的正确形态（UNAVAILABLE + details.internalCode）与守卫测试 tests/server/test_wire_error_family_101.py 均在（只读核验即成立、现已成立）"}]
write_paths: ["src/agent_box/server/wire/handlers.py", "tests/server/test_wire_error_family_101.py", "docs/implementation/status.md", "docs/server-round1/**"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/errors.py"]
ruling: R-0052
terminal: ["WIRE_500_FORK_PARITY_DONE", "WIRE_500_FORK_PARITY_PARTIAL"]
waive: []
parallelism: "none"
parallelism_reason: "单线程：本单是两处调用点的等价替换 + 把一份守卫测试带进本树，拆成并行单元没有可分离的产物（拆了反而要两次提交同一文件）。"
parallel_units: []
---

# Work Order 116 — 500 那条缺陷的**另一侧**在本树：`wire/handlers.py` 两处 family 位 + 守卫测试缺席（`QA-008` runtime 面）

## Objective

**来源：`QA-008 (v2)`（confirmed / 中高）＋ `QA-013`/`D-005`（"守卫只在一侧存在 ⇒ 合并即回退"）＋ ops 第一轮交接单（`R-0054 ⑧`）。**

`101` 只把 **A 树** 修对了。**本树（runtime）带着同一个缺陷往前走**，因为：

1. 本树 `src/agent_box/server/wire/handlers.py:1196` 与 `:1244` 仍然把**内部码写进 family 位**（`ARTIFACT_STORE_UNAVAILABLE` / `USAGE_AGGREGATOR_UNAVAILABLE`）
   ⇒ 构造 `WireError` 时 `ValueError` ⇒ **HTTP 500 ＋ 21 字节纯文本**（合同破裂）；
2. 能咬住它的**守卫测试只存在于 A 树**（`tests/server/test_wire_error_family_101.py`）⇒ 本树全量套件**永远不会红**（`D-002` 的集合差里就有它）。

**为什么必须在**本树**就地修**：`R-0035` 合并冻结（不得主动提合并）＋验收环境**直接跑分支源码**（`scheduler-charter.md` §3.8）
⇒ "等合并把 A 的修法带过来"**不是**可判定谓词；而 `usage.aggregate`/`providerArtifacts.list` 的 500 已在**本树快照**上 live 复现 2/2。

**一次性例外（`QA-004` 口径，先例 `108` 的 `234fa08`）**：本树章程 §2 写明 `server/wire/**` 属 A 树、本树只读。ops 在此**只开两处调用点**的例外——
**只准动 `handlers.py` 里那两个 `WireError(...)` 的第一参（与 `details`）**；`wire/errors.py` 与 `wire/**` 的其它内容**仍在禁写面**（`forbidden` 已逐条列出）。
这是"归属"层面的**临时例外**，不是边界迁移；`115` 收口后 A 树仍是 `wire/**` 的唯一 owner。

**明确不做**：改 12 项 `FAMILIES`；改 `errors.py` 的兜底收敛（那是 `115`，属 A 树）；改这两个方法的**行为**（只改错误构造）；
写 A 树任何文件（跨树只读核验可以）；借本单顺手重构 `wire/**`。

## Current state（一手，ops 逐行核过）

| 事实 | 出处 |
| --- | --- |
| 本树 `_artifact_store()` 把内部码当 family 传 | 本树 `d12e9917` `src/agent_box/server/wire/handlers.py:1196`（`WireError("ARTIFACT_STORE_UNAVAILABLE", …)`） |
| 本树 `usage.aggregate` 同形 | 同文件 `:1244`（`WireError("USAGE_AGGREGATOR_UNAVAILABLE", …)`） |
| 用户视角：这两个面在该组合下必 500 | `QA-008 (v2)`；live 2/2（`usage.aggregate` + `providerArtifacts.list`，`docs/qa/e2e-runs/r1-2026-09-19.md` §3） |
| 正确形态（A 树，逐字） | A 树 `wire/handlers.py:1238`/`:1297`：`WireError("UNAVAILABLE", <msg>, {"internalCode": …})` |
| 守卫测试在本树**缺席** | 本树 `tests/server/` 无 `test_wire_error_family_101.py`（A 树有，1 个） |
| 计数口径提示（`QA-007`） | 本树跑全量须附「Worker 工件在/不在」行；不补工件天然 18 红，别被读成回归 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `handlers.py:1196` | 改成 `WireError("UNAVAILABLE", <原 msg>, {"internalCode": "ARTIFACT_STORE_UNAVAILABLE"})` | 与 A 树逐字一致（可对表） |
| `handlers.py:1244` | 改成 `WireError("UNAVAILABLE", <原 msg>, {"internalCode": "USAGE_AGGREGATOR_UNAVAILABLE"})` | 同上 |
| 守卫测试 | 把 A 树的 `tests/server/test_wire_error_family_101.py` **带进本树**（逐字或按本树路径适配；**不许**改断言强度） | 让本树套件能咬住这一族（`D-005` 的根因） |
| 报告 | 在本树 `status.md` 写一行"与 A 树对表"的证据（两侧文件 sha256 + 行号） | 两仓一致**可核对**，不靠信任 |

**必须保持不变**：这两个方法的返回值与参数表；`errors.py`（不写）；`FAMILIES` 集合。
**边界**：`115` 负责"未登记码不得再冒裸 500"的**闭合**（A 树）；本单只做**等价替换 + 守卫在场**。

## Requirements

### Requirement: 本树不再有那两个裸 500

#### Scenario: 无服务的组合

**WHEN** 在未注入 usage aggregator / artifact store 的组合上调用 `usage.aggregate`/`usage.export`/`providerArtifacts.{list,install,rollback}`
**THEN** 回**类型化** `UNAVAILABLE` 信封（`details.internalCode` 保留内部码），**不是** HTTP 500

#### Scenario: 反例（门要能咬）

**WHEN** 把任一处第一参改回内部码（或退回旧实现）
**THEN** 本树的门（守卫测试）**必须红**

### Requirement: 守卫在本树在场

#### Scenario: 套件能咬

**WHEN** 跑本树 `tests/server`
**THEN** 存在并执行 `test_wire_error_family_101.py`（或同名守卫），且它在旧形态下**红**

## Stages

- [ ] 1. 观测：在本树复现两个 500（真 wire 或进程内），落行号与 traceback（提交）
- [ ] 2. 两处调用点等价替换（与 A 树逐字对表，记 sha256）（提交）
- [ ] 3. 守卫测试带进本树 + 反例验证（旧形态必红）（提交）
- [ ] 4. 账与证据：`status.md` 一行 + 对表证据；补「Worker 工件在/不在」行（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 不 500 | 五方法在无服务组合下回类型化 `UNAVAILABLE` | 退回旧实现必须门红 | fail (typed) |
| G2 与 A 树一致 | 两处调用点与 A 树 `:1238`/`:1297` 形态逐字一致（sha256 对表） | 任一侧不同必须门红 | fail (typed) |
| G3 守卫在场 | 本树 `tests/server` 跑到 `test_wire_error_family_101.py`（或同名守卫） | 守卫缺席必须门红（`D-005` 的根因） | fail (typed) |
| G4 不越界 | 本单提交**只**触碰 `handlers.py` 的两处调用点 + 守卫测试 + 账/报告 | `wire/**` 其它改动即门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 两个 500 的一手复现 · 2. 两处等价替换 + 与 A 树对表 sha256 · 3. 守卫在场且旧形态必红 ·
4. `status.md` 一行（含 Worker 工件行）· 5. 未提交改动清空（或如实列出剩余）。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`WIRE_500_FORK_PARITY_DONE`
- 否则：`WIRE_500_FORK_PARITY_PARTIAL` + 精确剩余

## Notes for the executor

- **本单是"一次性例外"**：例外**只覆盖** `handlers.py` 的两个 `WireError(` 调用点。`wire/**` 其它一切照旧只读；
  你若判断需要改 `errors.py` 或别的 wire 文件 ⇒ **交回 ops**，不要扩面（先例 `108` 的 `234fa08`）。
- `095`/`096` 等本树在飞单**不受本单影响**；本单是**插队**项（主路径缺陷，`AQ-0009`：主路径不得有已知未修缺陷）。做完立刻回你原队列。
- 与 `115` 的关系：`115` 在 A 树做**闭合**（未登记码不得冒裸 500）。**本单不依赖 `115` 收口**——
  它只依赖 A 树那份**已存在**的正确形态（`bca77821`，谓词见 `depends_on`）。
