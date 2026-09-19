---
id: "105"
slug: hello-declares-harnesses
batch: b2
baseline: "198490d"
depends_on: [{"order": "097", "condition": "hello 的派生与发散门先落地（本单在同一方法上加字段，顺序避免撞车）"}]
write_paths: ["src/agent_box/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0013
terminal: ["HELLO_HARNESSES_DONE", "HELLO_HARNESSES_PARTIAL"]
waive: []
parallelism: "none"
parallelism_reason: "已收口的历史单：执行时未拆分单元，补记为单线程（不是本单引入的并行缺口）；再次触碰时按当时实际重declared。"
parallel_units: []
---

# Work Order 105 — `server.hello` 声明"服务端已注册的 harness 家族"（用户批准 AQ-0003）

## Objective

用户 2026-09-19 批准 **AQ-0003**（来源：前端审阅者 `AUD-F-003`，调度者复核）。
现状：wire 上**没有任何**"这台服务支持哪些 harness"的面——`harness` 只出现在**各记录里**（`profiles.*`/`providerModels.*`）
⇒ 前端建 profile 时的 harness 目录**只能从已有记录派生**，全新部署上只剩"自定义 Harness"一项（Stage 2「好日常」的直接障碍）。

本单给 `server.hello#result` 加 `harnesses`：**服务端注册的家族清单**（来自 `HarnessRegistry`，按 canonical 顺序稳定排序），
每条至少 `id`，并带上**服务端已知的**附属声明（`credentialKind`、`modelControlId`、`wireProtocols` 的键集）——
**只暴露声明，不暴露实现**；缺席即缺席，不猜、不补默认。

**依赖 097**：097 把能力表改成从派发表派生；本单在同一次 relock 里加字段，避免两次重锁撞车（可与 097 合并为一次重锁，报告里写明）。

## Current state（第一手）

| 事实 | 出处 |
| --- | --- |
| `server.hello#result` 只有 `{serverId, protocolVersion, capabilities, auth}` | 生成 schema；`wire/handlers.py` 的 `hello()` |
| 家族清单在服务端**已存在**：`HarnessRegistry.registered()`（`sorted(self._descriptors)`） | `server/execution/__init__.py`（`HarnessRegistry`） |
| 描述符已带 `credential_kind`/`model_control_id`/`wire_protocols`（后者来自 092 修订） | 同上（`HarnessDescriptor`） |
| 前端因此只能从记录派生目录（用户可见后果：只列"自定义"） | 前端审阅者 `AUD-F-003`（DOM + wire 双证） |
| 重锁流程：工件重生成 + 两仓登记同一对摘要 | 081 修订 / P21 修订 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `hello#result` | 增 `harnesses: [{id, credentialKind?, modelControlId?, wireProtocols?}]`；**稳定排序**（按 id）；**未知/未声明就不给该键** | 目录来源 |
| 注册表来源 | 从 `HarnessRegistry` 取，**不**从记录里派生（记录是用户数据，注册表是部署事实） | 单一真相 |
| 合同 | 生成的 wire 工件重生成；两仓按 081/P21 的规则登记**同一对**摘要（本单给出新一对） | 重锁 |
| 前端交回 | 在证据里写明"前端可据此渲染 harness 目录（见 P39）" | 配对 |

**必须保持不变**：`hello` 的既有字段与语义（`capabilities` 由 097 派生后的形状）；错误信封；**不**暴露任何凭据内容、
工件路径、宿主路径；注册表为空时给**空数组**（不是 500、不是省略字段）。

**明确不做**：把家族清单塞进 `capabilities`（那是方法表，不是族表）；暴露实现细节（命令、工件 digest、挂载路径）；
为前端方便而伪造未注册的家族。

## Requirements

### Requirement: hello 声明家族

#### Scenario: 与注册表逐项一致

**WHEN** 对一台注册了 N 个家族的 Server 调 `server.hello`
**THEN** `harnesses` 恰为这 N 条（顺序稳定、可复跑一致），每条含 `id`；有声明时才带 `credentialKind`/`modelControlId`/`wireProtocols`

#### Scenario: 反例（门要能咬）

**WHEN** 从注册表里摘掉一个家族（或加一个只存在于记录里的")
**THEN** `harnesses` 必须随之变化；gate 断言"注册表集合 == hello 集合"，不一致即红

#### Scenario: 空注册表

**WHEN** 无任何家族注册
**THEN** `harnesses: []`（200 的正常回答），**不是** 500、不是省略

### Requirement: 不泄漏、不伪造

#### Scenario: 只暴露声明

**WHEN** 逐字检查 hello 的响应与新字段
**THEN** 无凭据内容、无工件/宿主路径、无 digest；**每个 id 都真实存在于注册表**

## Stages

- [ ] 1. 观测：注册表与描述符的可得字段、现有 hello 的形状（提交）
- [ ] 2. 加字段（稳定排序、缺席即缺席、空数组）+ 定向测试（提交）
- [ ] 3. 合同：重生成工件 + 与前端登记同一对摘要（提交）
- [ ] 4. 门与账：注册表集合==hello 集合（含反例）+ 真机复跑 + status（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 一致 | 注册表集合 == hello 的 `harnesses` 集合（含顺序稳定） | 摘掉一个家族而 hello 不变必须门红 | fail (typed) |
| G2 不泄漏 | 响应里无凭据/路径/digest | 出现任一必须门红 | fail (typed) |
| G3 空态 | 空注册表 ⇒ `harnesses: []` 且 200 | 500 或省略字段必须门红 | fail (typed) |
| G4 重锁 | 工件重生成 + 两仓登记同一对摘要 | 只在一侧登记必须门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 实现（字段 + 排序 + 空态）· 2. 反例（G1/G3）· 3. 真机 hello 响应 + 工件摘要 · 4. 回归计数 · 5. 账务与清理
· 6. status 分账（含新的一对摘要）。缺一项 ⇒ `HELLO_HARNESSES_PARTIAL`。

## Acceptance

- 绿：`HELLO_HARNESSES_DONE`；否则 `HELLO_HARNESSES_PARTIAL` + 精确剩余

## Notes for the executor

- 用户已批准（AQ-0003）；本单在 **b2 追加**、**依赖 097**（可合并为一次重锁）。
- 与 092 修订的 `wireProtocols` 有交叠：本单只**暴露键集**，不重复声明实现。
