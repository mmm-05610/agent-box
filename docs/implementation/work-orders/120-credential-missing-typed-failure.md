---
id: "120"
slug: credential-missing-typed-failure
batch: b2
baseline: "d12e9917771f4be4972a8abd194b0b1fb8393e67"
depends_on: []
write_paths: ["src/agent_box/server/bootstrap/**", "src/agent_box/storage/secrets.py", "src/agent_box/server/execution/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/server/wire/**"]
ruling: R-0032
terminal: ["CREDENTIAL_MISSING_TYPED_FAILURE_DONE", "CREDENTIAL_MISSING_TYPED_FAILURE_PARTIAL"]
waive: []
parallel_units: ["typed-error", "transcript-reason"]
serialize_with: ["092", "116", "121"]
---

# Work Order 120 — 凭据缺席不许崩成 `KeyError`／不许在转录里只剩 `EXECUTION_FAILED`（**主路径**，A 的第一手 T6 现场）

## Objective

**来源：验收轮询 A 的第一手 T6 真机链**（`docs/acceptance/t6-e2e-chain.md` §1，`docs/acceptance/gate-log.md` 的「新开的前置 (b)」）——A 明确把这条列为**下一窗口的硬前置之一**（`AQ-0009`：主路径上不得有已知未修缺陷）。

A 在 18790 上真发了一句（`codex-main`），结果是：

```
KeyError: 'credential_e08793049b1949f0bc519051e12f72a1.dpapi'
  runtime.py:830  port_factory → credential = secret_store.read(record["secret_locator"])
  storage/secrets.py:159 MemorySecretStore.read → self.values[locator]
→ DispatchAmbiguous: Execution Dispatch is ambiguous for exec_e8fbc08c…
→ 日志自己写着：execution failed without a typed code
```

转录侧用户看到的是：`execution.state: failed, reason: "EXECUTION_FAILED"` ⇒ **没有原因、没有可做的动作**。这正是 `R-0032 ⑤`
（"选不让信息消失的那一侧"）与 `R-0036`（失败可见）要防的形状：**一个可判定的配置事实（凭据 id 在 store 里不存在）在系统中间被吃掉了**。

**本单要的是**：同一条缺失**在每一层都保持类型化、可行动**——store 读到不存在的 locator ⇒ 类型化错误；port_factory 的凭据解析 ⇒ 类型化错误（沿用本文件已有的 `CREDENTIAL_STORE_UNAVAILABLE` 同款形状）；
dispatch/执行段 ⇒ **把原因带进转录**（用户能看到"哪个凭据/哪个 profile/能做什么"，而不是 `EXECUTION_FAILED` 三个字）。

**明确不做**：把任何真 key 种到别的 credential id 上（**红线**：`credential_e08793…` 同时被 8 条用户网关记录引用 ⇒ 种下去＝把 key 发往第三方；A 已明确不做）；
改 wire 方法集/协议；改 091/092 正在动的东西；**不**在本单里决定"试用环境该指哪棵后端树"（那是 ops/A 的装配决定，见公告 112 轮）。

## Current state（一手，A 在 18790 上实测；ops 逐字核过源码）

| 事实 | 出处 |
| --- | --- |
| `MemorySecretStore.read` 是**裸 dict 取键** ⇒ 缺键就是 `KeyError` | `src/agent_box/storage/secrets.py:159`（`return self.values[locator]`；两棵树**逐字相同**） |
| `port_factory` 读凭据：`credential = secret_store.read(record["secret_locator"])`；**同文件已有**类型化先例 `raise RuntimeError("CREDENTIAL_STORE_UNAVAILABLE")` | `src/agent_box/server/bootstrap/runtime.py:830` 一带（两棵树**已分叉**） |
| 真实数据根上 10 条 provider 记录**只有 1 条**的 credentialId 被种进内存（其余 9 条＝Windows DPAPI id，Linux 读不到） | A 的 T6 §3.3（一手；A 用 `profiles.list` 的键并集 + 启动器日志核对） |
| 用户可见结果：`execution.state: failed, reason: "EXECUTION_FAILED"`（无原因、无动作） | A 的 T6 §1（转录侧原文） |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `MemorySecretStore.read`（缺键） | 抛出**类型化**错误（点名 locator 这个**不敏感**的标识，**不许**带任何 key 内容） | 结构事实不该是 `KeyError` |
| `port_factory` 的凭据解析 | 缺凭据/读不到 ⇒ **类型化**失败（沿用 `CREDENTIAL_STORE_UNAVAILABLE` 同款形状，可加 `details.credentialId`）；**必须在 dispatch 之前**，不许等到执行段 | 让失败发生在最知道原因的那一层 |
| dispatch / 执行段 | 失败**带 typed reason 进转录**（用户可读 + 机器可读；含"该 profile 引用的凭据在本机取不到"这类可行动信息） | 失败可见（`R-0036`） |
| 门 | **反例门**：构造"记录引用的 locator 不在 store 里"，断言出站/转录是**类型化失败**且**不是**裸 `KeyError`/`EXECUTION_FAILED`；退回旧实现必须红 | 这一类"只在真实装配组合上触发"（`QA-008` 同族教训） |

**必须保持不变**：凭据内容永不进日志/错误体（**只**点名 id 与结构原因）；`CREDENTIAL_STORE_UNAVAILABLE` 的既有语义；`wire/**`（属 A 树）。
**边界**：A 树同样带这两处源码（`secrets.py` 逐字相同、`runtime.py` 已分叉）——**本单只管本树**；两树在场面清单/合并前置由 ops 记账（`D-002`/`D-005`）。

## Requirements

### Requirement: 缺凭据不崩成 KeyError

#### Scenario: 记录引用了一个不存在的 locator

**WHEN** 一条 provider 记录引用的 credentialId 在本机 store 里不存在，然后发起一轮
**THEN** 得到**类型化**失败（点名凭据/配置事实），**不是** `KeyError`，**也不是**无原因的 `EXECUTION_FAILED`

#### Scenario: 反例（门要能咬）

**WHEN** 把任一处退回裸取键/无原因失败
**THEN** 本单新增的门**必须红**

### Requirement: 转录里带原因，且可行动

#### Scenario: 用户视角

**WHEN** 该轮失败
**THEN** 转录/错误行里有**原因与可做的动作**（例如"该 profile 引用的凭据取不到 ⇒ 换一个凭据已就绪的 profile"），并且**不含任何凭据内容**

## Stages

- [ ] 1. 观测：在本树复现（构造"记录引用不存在的 locator"）并落 traceback 与转录原文（提交）
- [ ] 2. store 读缺键 ⇒ 类型化；port_factory 解析 ⇒ 类型化（均在 dispatch 前）（提交）
- [ ] 3. dispatch/执行段把原因带进转录（typed reason + 可行动）(提交)
- [ ] 4. 反例门（退回旧实现必红）+ 计数与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 不崩 | 缺凭据 ⇒ 类型化失败（非 KeyError） | 退回旧实现必须门红 | fail (typed) |
| G2 有原因 | 转录/错误行带原因 + 可行动信息，且**零凭据内容** | 出现 `EXECUTION_FAILED` 单字而无可行动信息 ⇒ 门红 | fail (typed) |
| G3 时机 | 该失败发生在 dispatch **之前**（最知道原因的一层） | 变成执行段裸崩 ⇒ 门红 | fail (typed) |
| G4 不回归 | 既有凭据面测试与计数不变（附「Worker 工件在/不在」行，`QA-007`） | 任一变红即门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现（traceback + 转录原文）· 2. 两处类型化（dispatch 前）· 3. 转录带原因 ·
4. 反例门（旧实现必红）· 5. 零凭据内容的自查证据 · 6. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`CREDENTIAL_MISSING_TYPED_FAILURE_DONE`
- 否则：`CREDENTIAL_MISSING_TYPED_FAILURE_PARTIAL` + 精确剩余

## Notes for the executor

- **排序**：**插到今晚焦点之前**（`R-0054 ⑥` 的 091 链与 `AQ-0009` 的"主路径不得有已知未修缺陷"都要求它先落地；A 已把它列为下一窗口硬前置）。
  做完立刻回 `092 → 093 → 094 → 095 → 096`。
- **红线自查**：**任何**真 key 都不许被种到本条涉及的其它 credential id 上；错误体/日志里**零凭据内容**（只点名 id 与结构原因）。
- **前提待验**（`OF-02`）：行号与转录原文引自 A 的 T6 一手记录，第一步自己复核；被推翻就交回。
