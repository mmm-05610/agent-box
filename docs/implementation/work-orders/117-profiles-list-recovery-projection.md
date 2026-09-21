---
id: "117"
slug: profiles-list-recovery-projection
batch: b2
baseline: "bca77821fac530133d19a48bedea1d3f02969116"
depends_on: []
write_paths: ["src/agent_box/server/wire/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "release/**"]
ruling: R-0052
terminal: ["PROFILE_ADMITTABLE_PROJECTION_DONE", "PROFILE_ADMITTABLE_PROJECTION_PARTIAL"]
waive: []
parallel_units: ["projection", "gate"]
serialize_with: ["115"]
revisions: [{"at": "bca7782", "what": "修订 v2：加入「必须能判定哪些 profile 有本机可读凭据」这一条（来源＝A 的第一手 T6 §3.2：`providerModelId` 不在投影键并集里 ⇒ 客户端只能发一条看它崩不崩）。范围、写面、门不变。", "after_stage": 0, "ruling": "R-0032"}]
---

# Work Order 117 — `profiles.list` 不许把"发不出去"的 profile 画成正常可发（`QA-009` 后端面）

## Objective

**来源：`QA-009`（confirmed / wire 面；UI 面 `needs_validation`，`docs/qa/findings.md`）＋ `R-0052 ①(b)` ＋ `R-0054 ⑧(a)`。**

`profiles.list` 的投影**不含** `recovery_pending`：**实测 21/21 行都不带该键**，于是"发不出去"的 profile 在选择器里**长得和正常的一样**；
用户必须**打完字**才吃到 **409 `PROFILE_RECOVERY_REQUIRED`**，而且**64 个方法里没有任何一个**能解除这个状态 ⇒
失败**不是"重试"能解决的**，用户没有任何可做的动作。这正是 `R-0019`/`R-0036`"失败可见"要防的形状，也是 `R-0032 ⑤`"别让信息在系统中间被吃掉"的实例。

**本单只做"诚实"这一半**：把**阻塞状态与原因**放进投影，让前端能在**发之前**就灰掉并说清为什么。

**明确不做（越界）**：
- **不新造"解除面"方法**（清理解析/恢复那一类）——那是**新能力**，按 `R-0032 ⑤`/审批队列的既有口径属**产品决定**，由 I 落 `approval-queue.md`；本单**不批、不做**。
- 不改 409 的既有语义（`sessions/repository.py` 偏读该列并回 409 是既定的诚实行为）。
- 不写前端（桌面聊天线）、不写 runtime 树的 `server/sessions/**`。

## 修订 v2（2026-09-19 20:0x，ops；`at` = `bca7782`，**after_stage 0** ⇒ 若你尚未开始，直接按修订版做）

**新依据（A 的第一手 T6 真机链，`docs/acceptance/t6-e2e-chain.md` §3.2）**：`profiles.list` 的投影**也不含**模型/凭据绑定——
`providerModelId` **不在**实测的键并集里（`accountId/archivedAt/capabilities/createdAt/displayName/harness/id/originProfileId/permissionPreset/permissionRules/updatedAt/version` 共 12 键）。
⇒ 客户端**无法**判断"哪些 profile 在本机有可读凭据"，只能**发一条看它崩不崩**。这与 `QA-009` 是**同一件事的另一面**：
"发之前看不出来"→ 于是 A 在 18790 上的真实一轮就是这么失败的（执行段 `KeyError` ⇒ 转录只剩 `EXECUTION_FAILED`）。

**修订加的是一条要求**（见下 `Requirement: 投影要能判定"这个 profile 在本机能不能真跑"`）。**不新增写面、不新增门类型**（沿用同一批门）。

## Current state（一手，ops 逐行核对）

| 事实 | 出处（A 树 `bca7782`） |
| --- | --- |
| `profiles.list` 逐行投影走 `profile_record(row)` | `src/agent_box/server/wire/handlers.py:522`（`profiles_list`）→ `self._profile(row)` |
| `profile_record` 的键**不含**任何阻塞/恢复状态 | `src/agent_box/server/wire/projection.py:110-129`（`id/version/displayName/harness/accountId/permissionPreset/permissionRules/originProfileId/archivedAt/createdAt/updatedAt`） |
| DB 行里**有**该列，且发送路径**偏读**它 | `src/agent_box/server/sessions/repository.py:186`（`if bool(profile["recovery_pending"])` ⇒ 409 `PROFILE_RECOVERY_REQUIRED`；同文件 `:591/:657/:717` 亦用） |
| 用户视角（live） | `pi-deepseek` 被 409 挡下、`codex-main` 受理 ⇒ `docs/qa/e2e-runs/r1-2026-09-19.md` §S5 |
| 形状参考（不新造字段名，只借"三态"语义） | 只读查表 `docs/research/reuse-catalog.md` `C-43`（K8s `Condition`：三态 + 机器码 reason + 人话 message；**`Unknown` 是枚举成员**，对上我们的"缺席即未知"） |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `profile_record()` 的投影 | 每行带上**可判定**的阻塞事实：至少 `recoveryPending`（布尔）＋ 机器码 `reason`（沿用上线那个 `PROFILE_RECOVERY_REQUIRED`）；**未能判定时必须是"未知"而不是"可发"** | 用户发之前就能看出不可发（`R-0032 ⑤`） |
| 语义 | "缺席/未知"与"已知可发"**必须可区分**（不许用 `false` 同时表示"可发"与"不知道"） | 这条是 `QA-009` 的同族复发点（`C-43` 的 `Unknown`） |
| 门 | **反例门**：构造一个 `recovery_pending=1` 的 profile，断言 `profiles.list` 的输出**能**判出"不可发 + 原因"；再构造"该列读不到"的行，断言输出是**未知**而不是"可发" | 单元门咬不到的那类（`QA-008` 的同族教训） |
| 报告 | 把"前端怎么消费"写清（键名/取值域/灰掉文案建议），供聊天线接单时引用 | 前端那半是另一棵树，本单只给契约面 |

**必须保持不变**：`profiles.list` 的**方法名与既有键**（只增不改）；409 的触发条件；64 方法集合。
**边界**：前端选择器的"灰掉并说为什么"＝**桌面聊天线**的活（另单；激活条件＝本单收口行出现在本树 `status.md`）。

## Requirements

### Requirement: 不可发的 profile 在发之前就看得出来

#### Scenario: 投影带阻塞事实

**WHEN** 某 profile 的 `recovery_pending` 为真时调用 `profiles.list`
**THEN** 该行**能**被判为"不可发"，并带**机器码原因**（`PROFILE_RECOVERY_REQUIRED`），不需要先发一次

#### Scenario: 未知不得装成可发

**WHEN** 该阻塞事实**读不到/无法判定**
**THEN** 输出是**未知**（可区分于"可发"），**不得**缺省成"可发"

#### Scenario: 反例（门要能咬）

**WHEN** 把投影退回当前实现（不带该事实）
**THEN** 本单新增的门**必须红**

### Requirement: 投影要能判定"这个 profile 在本机能不能真跑"（**修订 v2 加**）

#### Scenario: 凭据绑定可见

**WHEN** 某 profile 绑定的凭据/模型绑定在本机**取不到**（A 在 18790 上的真实情形：10 条 provider 记录只有 1 条指向本机种进去的凭据）
**THEN** `profiles.list` 的输出让客户端**在发之前**就能判定"这个 profile 在本机跑不起来"（缺什么、能做什么），**而不是**发出去等到执行段崩

#### Scenario: 反例（门要能咬）

**WHEN** 把该绑定信息从投影里去掉（或退回当前 12 键）
**THEN** 本轮新增的门**必须红**

### Requirement: 既有投影面不回归

#### Scenario: 既有键与既有行

**WHEN** 跑既有 `profiles.list` 用例
**THEN** 既有键**逐字不变**，只**新增**阻塞事实；`archived`/`includeArchived` 语义不变

## Stages

- [ ] 1. 观测：复现"发之前看不出来"（一手：投影键集合 + 409 的触发链），把行号落表（提交）
- [ ] 2. 投影带上阻塞事实（含"未知"态）**＋ 凭据/模型绑定（修订 v2）**（提交）
- [ ] 3. 门：不可发/未知两条正例 + "退回旧实现必红"的反例（提交）
- [ ] 4. 前端消费说明（键名/取值域/灰掉文案建议）写进 `docs/server-round1/` 报告（提交）
- [ ] 5. 账与证据（本树 `status.md` 一行）（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 发前可见 | `recovery_pending=1` 的行在 `profiles.list` 里能判为不可发 + 带原因 | 退回旧投影必须门红 | fail (typed) |
| G2 未知可区分 | 无法判定时输出"未知"，与"可发"可区分 | 让"读不到"缺省成可发必须门红 | fail (typed) |
| G3 既有面不回归 | 既有键逐字不变（快照比对） | 删/改任一既有键必须门红 | fail (typed) |
| G5 跑得起来可判定（**修订 v2**） | 绑定凭据/模型在本机取不到时，投影里**发之前**就看得出来（含可做的动作） | 退回当前 12 键必须门红 | fail (typed) |
| G4 真 wire | 门**驱动真实 wire**取 `profiles.list`（不是直调 `profile_record`） | 改成直调实现必须门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 观测表（行号）· 2. 投影带阻塞事实 + 未知态 · 3. 反例门（旧实现必红）· 4. 前端消费说明 ·
5. 回归计数（带「Worker 工件在/不在」行，`QA-007`）· 6. 账与证据。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`PROFILE_ADMITTABLE_PROJECTION_DONE`
- 否则：`PROFILE_ADMITTABLE_PROJECTION_PARTIAL` + 精确剩余

## Notes for the executor

- **前提是待验的**（`OF-02`）：键集合与 `repository.py:186` 由 ops 逐字核过；第一步**先自己复核**，被推翻就交回。
- **"解除面"（让用户能清掉 recovery）不是本单**：它是新能力 ⇒ 归 I 的审批队列。若你判断"不做解除面就没法诚实"，
  写进交回说明，**不要**顺手新造方法（`R-0032 ⑤`：宁可让缺席可见，也不要静默发明协议）。
- 前端那半（选择器灰掉 + 文案）属**桌面聊天线**，另单跟进；你只负责本树契约面与报告。
- **修订回执（`README §3.5b`）**：纳入本修订后，在下一个阶段提交信息或本树 status 里记一行「已纳入 work order 117 修订 @<sha>」。
