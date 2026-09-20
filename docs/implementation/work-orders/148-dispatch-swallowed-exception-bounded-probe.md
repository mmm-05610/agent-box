---
id: "148"
slug: dispatch-swallowed-exception-bounded-probe
batch: b2
baseline: "5256441"
depends_on: []
write_paths: ["docs/server-round1/**", "tests/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**", "src/agent_box/**"]
ruling: R-0046
terminal: ["DISPATCH_SWALLOWED_EXCEPTION_PROBED_DONE", "DISPATCH_SWALLOWED_EXCEPTION_PROBED_PARTIAL"]
waive: []
parallel_units: ["injection-a", "injection-b", "verdict"]
serialize_with: ["092", "120", "121", "122", "126", "127", "130", "131", "133", "134", "135", "136", "137", "138", "140", "141", "142", "146"]
---

# Work Order 148 — `_dispatch` 用 `except Exception: pass` 吞掉派发失败，而**durable 事实的兜底边界在 56 行之后**（`AUD-B-043` **needs_validation**）⇒ **一条都不写代码**的定档单

## Objective

**来源：后端审阅者 `AUD-B-043`（`needs_validation`，**未给严重度**）＋ ops 第 146 轮转单。**

**它确证了什么（静态读，两棵树一致）**：
- **吞异常位点**＝`wire/handlers.py:2318-2325`：`_dispatch` 里 `try: self.execution.accept(...) except Exception: pass`；
- **端口内兜底起点**＝`sidecar_backend.py:255`（`try: receipt = self.execution_service.dispatch_execution(...)`）⇒ `:274-278` 的 `except BaseException` 才做 `fail_turn` ＋ `resources.release`；
- **`try` 之外还有 56 行会抛的工作**（`sidecar_backend.py:199-254`）：`get_turn_context`、**两次 `objects.read`**（input 与 profile config 对象）、`resolve_all(rules, preset=...)`、`objects.publish(effective)`、`work_service.create_work(...)`、`execution…` 等 **8 类可抛操作**。

⇒ **影响形态（若可达）**：那 56 行里任一处抛错 ⇒ 该轮**永远停在 `accepted`**、**没有任何终态事实**，而**客户端手里已经有一张 202 回执**。

**它明确说了未确证什么（这就是不给严重度的原因）**：上面 8 类里**哪一类是产品可达的**——**桌面/WSL 形态下 `remote_path` 与 config 对象都由服务端自己写**，普通用户输入**未必**能造出抛错；**若确实造不出，本条按 `rejected` 收口**。

**本单要的是**：**一条都不写代码**——跑它给的两条注入路径**各一次**，把结果写成**反例或反证**。**这是定档单，不是修复单。**

**明确不做**：**不改 `src/agent_box/**`**（`forbidden` 里已禁）——**定档结论决定下一步**：可达 ⇒ ops 另开修复单（方向它已给）；不可达 ⇒ **本条按 `rejected` 收口**。

## Current state（一手，`AUD-B-043`）

| 事实 | 出处 |
| --- | --- |
| `_dispatch` 吞异常：`wire/handlers.py:2318-2325` 的 `except Exception: pass` | `AUD-B-043` |
| 端口内兜底起点＝`sidecar_backend.py:255`；`:274-278` 才 `fail_turn`＋`resources.release` | 同上 |
| **`try` 之外 56 行含 8 类可抛操作**（`get_turn_context`／两次 `objects.read`／`resolve_all`／`objects.publish`／`work_service.create_work`／…） | 同上 |
| **未确证**：8 类里哪一类**产品可达**（桌面/WSL 下 `remote_path` 与 config 对象由服务端自写） | 同上 |
| 修复方向（若可达）**它已给**：`_dispatch` 不再 `pass`——要么把兜底边界**前移到 `accept()` 入口**（`try` 包住 `199-254`），要么至少记一条**类型化失败事实** ＋ `_LOG.exception` | 同上 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 注入 A | 按它给的 A 路径跑一次（**起服务 ＋ 真 HTTP**，非直调私有函数） | 定档要有**真语料** |
| 注入 B | 按它给的 B 路径跑一次 | 两条都要（**A 通 B 不通**与**B 通 A 不通**结论不同） |
| 判据 | 注入后 **`server_turns` 里该轮必须进终态（`failed`/`unknown`）而不是停在 `accepted`** | 它给的判据，**照抄** |
| 结论 | 逐条写：**可达 / 不可达**，附**注入方式 ＋ 观察到的状态 ＋ 是否留下终态事实** | 定档＝可判定结论，**不是"疑似"** |
| 反证也要写 | 若**不可达** ⇒ **把"为什么造不出"写成可复核的反证**（哪一层挡住了） | 否则下一轮会重挖 |
| **不写代码** | `write_paths` **只有 `docs/**` 与 `tests/**`**（**证据文件**），`forbidden` 禁 `src/agent_box/**` | 本单是**定档**；修复单由 ops 按结论另开 |

**必须保持不变**：`src/**` 一个字节都不改（本单的 `forbidden` 是**硬约束**）；既有兜底语义（`:274-278` 的 `fail_turn`＋`resources.release`）。

**边界**：若注入需要**改代码才能造出来**（例如需要一个调试开关）⇒ **那本身就是一个结论**（"不可达"），**如实写**，**不要**为了造出来而改 `src/**`（那就越界了）。

## Requirements

### Requirement: `accepted` 之后能不能**卡死无终态**，必须有一手答案

#### Scenario: 注入后进终态（正例）

**WHEN** 按 A（或 B）路径注入一次可抛错误
**THEN** 该轮在 `server_turns` 里**进终态**（`failed`/`unknown`），**不留 `accepted`**（可断言）

#### Scenario: 注入后卡死（**这是缺陷**）

**WHEN** 注入后该轮**停在 `accepted`** 且**无任何终态事实**
**THEN** 账里写明**可达**＋注入方式＋观察到的状态 ⇒ **回报 ops**（我另开修复单，方向它已给）

#### Scenario: 不可达（**也是合格结论**）

**WHEN** 两条路径都造不出可抛错误
**THEN** 账里写明**不可达**＋**"哪一层挡住了"的反证**（可复核）⇒ **本条按 `rejected` 收口**（**不是 PARTIAL**）

## Stages

- [ ] 1. 观测：复核三处静态事实（吞异常位点／兜底起点／`try` 之外 56 行的 8 类操作）（提交）
- [ ] 2. 注入 A（真服务＋真 HTTP）＋ 记 `server_turns` 状态（提交）
- [ ] 3. 注入 B ＋ 记状态（提交）
- [ ] 4. 结论（可达 / 不可达 ＋ 反证）＋ 证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 真语料 | 注入经**真服务 ＋ 真 HTTP**（非直调私有函数） | 直调/手工喂 frame ⇒ 门红 | fail (typed) |
| G2 状态可断言 | 每次都记 `server_turns` 里该轮的**状态**（终态 or `accepted`） | 只写"没报错"⇒ 不算过 | fail (typed) |
| G3 两条都跑 | A 与 B **各一次** | 只跑一条 ⇒ 门红 | fail (typed) |
| G4 结论可判 | **可达**（⇒回报 ops）或**不可达**（⇒附反证，按 `rejected` 收口） | 停在"疑似"⇒ 门红 | fail (typed) |
| G5 **未改源码** | `git status --porcelain -- src/` **为空** | 为造错误改了 `src/**` ⇒ 门红（**硬约束**） | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short && git status --porcelain -- src/
```

## DoD

1. 三处静态事实复核 · 2. 注入 A ＋ 状态 · 3. 注入 B ＋ 状态 · 4. 结论（可达/不可达 ＋ 反证）＋ 证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`DISPATCH_SWALLOWED_EXCEPTION_PROBED_DONE`
- 否则：`DISPATCH_SWALLOWED_EXCEPTION_PROBED_PARTIAL` + 精确剩余（**定档未完成 ⇒ 必须写 `needs_validation` 仍未决 ＋ 交回**，不许静默 PARTIAL）

## Notes for the executor

- **这是 `needs_validation` ⇒ 交付首先是事实**；**"不可达"是完全合格的结论**（审阅者自己说"若确实造不出，本条按 `rejected` 收口"）⇒ **不要**为了交一个"有缺陷"的答案而硬造。
- **归批（`132` 亚型）**：**「先落 durable 事实再 try」的界线必须与「吞异常」的范围对齐**——与 `AUD-B-035`（类型化出口）、`037`（兜底 except 说谎）**同族**：**三条都在治"错误路径上事实会丢"**。
- **`R-0062 ①`**：本单**不含 UI 面** ⇒ **不要求**先例对照节（如你判断需要，可自行加）。
- **前提待验**（`OF-02`）：引自 `AUD-B-043`（含三处行号与两条注入路径）；第一步自己复核。
