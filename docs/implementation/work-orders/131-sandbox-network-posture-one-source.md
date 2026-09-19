---
id: "131"
slug: sandbox-network-posture-one-source
batch: b2
baseline: "a46b1a5"
depends_on: []
write_paths: ["src/agent_box/server/execution/**", "src/agent_box/protocols/**", "plugins/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**"]
ruling: R-0046
terminal: ["SANDBOX_NETWORK_POSTURE_ONE_SOURCE_DONE", "SANDBOX_NETWORK_POSTURE_ONE_SOURCE_PARTIAL"]
waive: []
parallel_units: ["same-source", "gate"]
serialize_with: ["068", "069", "070", "072", "080", "081", "088", "090", "091", "092", "093", "094", "095", "096", "100", "102", "106", "107", "108", "109", "110", "111", "114", "116", "120", "121", "122", "126", "127", "130"]
---

# Work Order 131 — 沙箱网络姿态**两处默认值相反、无映射**：声明 `none` 而实际永远 `inherit`（`AUD-B-015` confirmed/medium）

## Objective

**来源：后端审阅者 `AUD-B-015`（`confirmed` / medium）＋ ops 第 122 轮转单。**

审阅者实测（逐字复跑）：
- **绑定的声明**：`SandboxRef.network_mode` 默认 **`'none'`**（`protocol.py:202`）；
- **真正递给 provider 的**：`SidecarRoomRequest.invariants.network_mode` 默认 **`'inherit'`**（`sandbox_port.py:92`＋`:128` 的 `default_factory`）；
- **两棵树 `src/` 内没有任何一处把前者映射到后者**（`RoomInvariants(` 显式设值 **0 处**）⇒ **生产上永远是 `inherit`**；
- 两个生产调用点 `sidecar.py:512` / `local_channel.py:498` **都不传 `invariants=`**；`coordinator.py:83-85` 读的是另一侧、**只在反方向拦** ⇒「**声明紧、执行松**」无人管；
- ⇒ **provider 那条"给不了就类型化拒绝"的诚实门（`SANDBOX_NETWORK_POSTURE_UNSUPPORTED`）在线上永远走不到**。

⇒ 这是审阅者归纳的**同族**之一：**「声明 / 判定 / 执行各记一本账」**（另两例＝`010` 有没有帧 vs 有没有编号、`013` 四处 Popen 三种回收形制）。

**本单要的是**：**同一事实只允许一处记账**——把声明**接到请求上**（或删掉那侧的默认值强制显式），并让"两处默认相反"这种形状**被门咬住**。

**明确不做**：改 provider 的诚实拒绝行为（审阅者已判：**它是这族里做得最对的一处**，`AUD-B-016` 已 `rejected`）；报"少一层 netns/容器"（provider 明说给不出，属 §6 纵深防御，不算）；改 `wire/**`。

## Current state（一手，`AUD-B-015`）

| 事实 | 出处 |
| --- | --- |
| 声明侧默认 `'none'` / 执行侧默认 `'inherit'`，**无映射** | `protocol.py:202`、`sandbox_port.py:92`/`:128`（审阅者逐字引用） |
| 两个生产调用点不传 `invariants=`（`src/` 内显式设值 **0 处**） | `sidecar.py:512`、`local_channel.py:498` |
| `coordinator.py:83-85` 只从另一侧拦（反方向） | 同上 |
| 后果：provider 的 `SANDBOX_NETWORK_POSTURE_UNSUPPORTED` 线上走不到；`none` vs `inherit` 实测**不一致** | 同上（`'none' vs 'inherit' ⇒ 两者一致？False`） |
| 诚实划界（审阅者自陈**未证**）：声明是否投影成用户可见文案；`tool_network_requirement`（含 `none`）在两棵树 src 内除校验与 digest 外**无消费者** | 同上（**本单只登记，不据此下结论**） |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 声明 → 请求 | **二选一，写清依据**：① 两个调用点构造 `SidecarRoomRequest(...)` 时传 `invariants=RoomInvariants(network_mode=binding.sandbox_ref.network_mode, …)`；② **删掉** `RoomInvariants.network_mode` 的默认值 ⇒ **必须显式给**（不显式就构造失败） | 两处默认相反＋无映射 ⇒ 实际永远是松的那侧 |
| 门（反例） | 断言「`SandboxRef.network_mode='none'` ⇒ 递给 provider 的 `invariants.network_mode` **也是 `none`**」；把默认值改回收紧前的形态（或删掉映射）⇒ 门**必须红** | 让"同源"被咬住 |
| 诚实门可达 | 报告里写清：修好之后，**provider 的 `SANDBOX_NETWORK_POSTURE_UNSUPPORTED` 是否终于可达**（可达 ⇒ 用一条定向门证明；不可达 ⇒ 写明还差什么） | 这条是"诚实门在线上走不到"的直接解药 |
| 未证两条 | 只**登记**（不据此改动）：声明是否投影成用户可见文案、`tool_network_requirement` 的消费者（两棵树 src 内除校验与 digest 外 0 处） | `R-0032 ⑤`：未证不动手 |

**必须保持不变**：provider 侧行为（含它的诚实拒绝）；`coordinator.py` 的反方向拦截；`wire/**`。
**边界**：若你判断改动落在 `plugins/**` 或 `protocols/**` 之外的第三处（例如桌面合同），**交回 ops** 并附行号。

## Requirements

### Requirement: 同源

#### Scenario: `none` 传下去

**WHEN** 绑定声明 `network_mode='none'` 并起一次沙箱/房间
**THEN** 递给 provider 的 `invariants.network_mode` **也是 `none`**（或按选路②，构造时**必须显式**给出，不给就失败）

#### Scenario: 反例（门要能咬）

**WHEN** 把默认值改回"两处相反、无映射"的形态
**THEN** 本单新增的门**必须红**

### Requirement: 诚实门可达（或被证明仍不可达）

#### Scenario: 拒绝路径

**WHEN** 在"provider 给不出 `none`"的环境上按声明传入 `none`
**THEN** 出站/执行侧出现**类型化拒绝**（`SANDBOX_NETWORK_POSTURE_UNSUPPORTED` 一族）；若仍不可达 ⇒ 报告写明还差什么

## Stages

- [ ] 1. 观测：一手复现两处默认相反＋无映射（含 `none` vs `inherit` 的一致性与 `src/` 内显式设值计数）（提交）
- [ ] 2. 选路（接到请求上／删默认值强制显式）并实现（提交）
- [ ] 3. 门：同源断言 ＋ 反例（退回即红）（提交）
- [ ] 4. 诚实门可达性的一手结论（可达则有定向门；不可达则写清差什么）（提交）
- [ ] 5. 未证两条只登记 ＋ 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 同源 | 声明 `none` ⇒ 递下去也是 `none`（或强制显式） | 退回两处相反必须门红 | fail (typed) |
| G2 一账 | `src/` 内**不再存在**"同一事实两处默认值"（有门咬住） | 再引入一处相反默认 ⇒ 门红 | fail (typed) |
| G3 诚实门 | `SANDBOX_NETWORK_POSTURE_UNSUPPORTED` 可达（或有定向门证明不可达的原因） | 含糊带过 ⇒ fail | fail (typed) |
| G4 不越界 | provider 行为与 `coordinator.py` 的反方向拦截未改；`wire/**` 未动 | 越界 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现（含设值计数）· 2. 选路＋实现 · 3. 门（同源＋反例）· 4. 诚实门可达性结论 · 5. 未证两条登记 ＋ 账。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`SANDBOX_NETWORK_POSTURE_ONE_SOURCE_DONE`
- 否则：`SANDBOX_NETWORK_POSTURE_ONE_SOURCE_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：**排在 `120`/`122`（主路径）之后、`093` 之前**；与 `130` 同族（都是"声明/执行各记一本账"），批末还有一张对账门（`132`，A 线）。
- **不许"顺手把松的那侧也改成 none"**：那是**改语义**（会让声明变成实际约束）；选路①或②，依据写清。
- **前提待验**（`OF-02`）：行号与实测引自 `AUD-B-015`（它逐字复跑过两块 reproduction）；第一步自己复核。
