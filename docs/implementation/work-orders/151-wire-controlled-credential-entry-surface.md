---
id: "151"
slug: wire-controlled-credential-entry-surface
batch: b2
baseline: "b630acd"
depends_on: []
write_paths: ["src/agent_box/server/wire/**", "src/agent_box/server/credentials.py", "src/agent_box/server/model_configs/**", "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "release/**"]
ruling: R-0077
terminal: ["CREDENTIAL_ENTRY_SURFACE_DONE", "CREDENTIAL_ENTRY_SURFACE_PARTIAL"]
waive: []
parallel_units: ["observe", "wire-methods", "gate", "relock-material"]
serialize_with: ["089", "097", "098", "099", "101", "103", "104", "105", "112", "113", "115", "117", "118", "119", "123", "124", "125", "128", "129", "132", "145", "147", "149"]
revisions: []
---

# Work Order 151 — `T6-1b`：给 wire 加一个**受控、可审计的凭据录入口**（`R-0077 ①`）

## Objective

**来源：`R-0077 ①`（`T6-1b` 单，用户 2026-09-20 拍「给 wire 加受控录入口」）＋ ops 第 152 轮开单。**

**今天的事实（一手）**：WSL Server 的 **64 个 wire 方法里没有任何 `credentials.*`** ⇒ **界面/用户无法把一个凭据身份建出来**。
`credentials.list` 也没有 ⇒ 连"这台机器上现在有哪些身份"都读不到。
⇒ 用户在一台**新鲜装配**上**只能**依赖"部署声明"或"启动器注入"这两条**非产品路径**——而启动器那条今天**只注入密钥、不建身份**
（`149` 的第一手定位），于是掉进 `CREDENTIAL_NOT_FOUND`。**这就是 `R-0078` 说"每次都掉同一条缝"的根子。**

**本单要做的**：给 wire 加**一条受控、可审计的**凭据录入口（**新方法**，因此**必然**触发一次合同变更 ⇒ **排进下一次重锁窗口**），
让"建身份"成为**产品能力**而不是操作者的手工活。

**为什么归 A 线（ops 归属判据）**：新方法＝`src/agent_box/server/wire/**`（参数表／handler）＋ `credentials.py` 的记录面，
**都是本树写面**（`R-0022 ②`：`wire/**` 属 A 树）。与 `149` **同一写面** ⇒ **串行**，且**复用 `149` 的身份入口**。

## Current state（一手）

- `CredentialRecords`（`src/agent_box/server/credentials.py`）：`exists()`／`register()`（**裸 INSERT，非幂等**）／`get()`／`list()`。
- 记录层身份判据＝`server_credentials` 表一行；`providerModels.create/update` 绑 `credentialId` 前查它（`model_configs/repository.py:63`／`:95`）。
- `wire/handlers.py:786` 只在 `model_configs.credentials.get(credential_id, kind=kind)` 里**读**凭据，**没有**任何 `credentials.*` 的**写/录**入口。
- 部署声明的导入路径已存在且正确（`bootstrap/runtime.py:1325-1350`，幂等）——**本单的语义必须与它一致**，不得另造一套。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| **新方法**：录入 | 一条**受控**的凭据录入口（命名与形状按既有参数表风格；**只录身份 ＋ 指向密钥的 locator，密钥内容绝不过线**） | 让"建身份"成为产品能力 |
| **新方法**：列举 | 一条**只读**列举（id／kind／createdAt，**永不含密钥**） | 没有它，用户与门都判不了"这台机器上有什么" |
| 语义一致性 | 录入必须是**幂等**的，且**调用 `149` 收出的那条身份入口**（不是第二套语义） | `R-0077 ②`「别两处各修一半」 |
| 可审计 | 每次录入留下**可读的**事实（谁/何时/哪条 id/哪种 kind）——不引入用户身份概念，就用既有时间戳与来源字段 | `R-0077 ①` 的"可审计" |
| 重锁材料 | 把新方法**编进 wire 工件**、重生成、并在 `113` 那一族的**两仓重锁**里登记（材料备齐、**别自己重锁别仓**） | 新方法＝合同变更，走 `40/52/58` 的既有次序 |

**硬约束（红线级）**：
- **凭据内容绝不过线**：方法只接受/返回 **id、kind、locator 引用**；**任何**返回值、事件、日志、证据文件里**不得**出现密钥内容（`sk-` 形状 `grep` 必须为空）。
- **不得**放宽既有的 `CREDENTIAL_NOT_FOUND` 类型化拒绝（`R-0078 ①` 的反例就是钉这条）。
- **不得**在本单里改 `bootstrap/**`（runtime 树）或主树启动器（调度树工具）⇒ 需要就**交回 ops**。

**边界（与 `149` 对齐）**：`149`＝**身份与注入路径对齐**（服务端内部、零协议变更）；`151`＝**把身份建出来这件事变成产品面**（新方法＋重锁）。
**判据**：`151` 落地后，用新方法建出的身份**必须**能被 `149` 的记录层绑定，且**全仓只有一条幂等语义**。

## Requirements

### Requirement: 用户/界面必须能把一个凭据身份**建出来**，并且**只能以受控方式**建

#### Scenario: 录入成功（正例，本单主目标）

**WHEN** 以合法入参调用新的录入口（id/kind/locator 形状正确）
**THEN** 身份可被记录层查到（`providerModels.create/update` 能绑它）、**幂等**（重复调用不抛错、不重复行）、**密钥内容未出现在任何返回**

#### Scenario: 无凭据 ⇒ 类型化拒绝（**反例，必须**）

**WHEN** 调用录入口而**没有**可用的密钥来源（locator 指不到任何东西）
**THEN** **类型化拒绝**（既有家族内的码，例如 `CREDENTIAL_*`），**且不留下半条身份记录**（不留孤儿行）

#### Scenario: 列举只读且不含密钥（正例）

**WHEN** 调用列举
**THEN** 返回 id／kind／createdAt 等**非密**字段；**任何**密钥形状都不出现

#### Scenario: 越权/畸形入参 ⇒ 类型化拒绝（反例）

**WHEN** 入参畸形（kind 不在允许集、id 形状不合法、多余键）
**THEN** **类型化拒绝**，不落行、不静默吞

#### Scenario: 反例（门要能咬）

**WHEN** 把录入改成"不建身份、只回 ok"
**THEN** 上面**正例 1 必须红**

## Stages

- [ ] 1. 观测：一手确认"64 方法无 `credentials.*`"、并写清**产品侧今天为什么建不出身份**（提交）
- [ ] 2. 参数表 ＋ handler：录入 ＋ 列举（复用 `149` 的幂等入口）（提交）
- [ ] 3. 门与反例（录入／无凭据拒绝／列举不含密／畸形拒绝）（提交）
- [ ] 4. **重锁材料**：wire 工件重生成 ＋ 两仓登记所需材料（**只备材料，不重锁别仓**）（提交）
- [ ] 5. 账：写清"排进下一次重锁窗口"的**确切位置**（`113` 一族里的哪一行）＋ 与 `149` 的复用点（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 录入可用 | 合法入参 ⇒ 身份可被 `providerModels.create` 绑定成功 | 不建身份只回 ok ⇒ 门红 | fail (typed) |
| G2 无凭据拒绝 | 无可用密钥来源 ⇒ **类型化拒绝**、**无孤儿行** | 落半条行/静默 ok ⇒ 门红 | fail (typed) |
| G3 幂等 | 重复录入 ⇒ 无异常、无重复行、不重读密钥 | 抛 `IntegrityError`／重复行 ⇒ 门红 | fail (typed) |
| G4 无密外泄 | 返回/事件/日志/证据 `grep` 不到密钥形状；列举只有非密字段 | 出现密钥 ⇒ 门红 | fail (typed) |
| G5 畸形拒绝 | kind/id 形状不合法、多余键 ⇒ 类型化拒绝 | 静默接受 ⇒ 门红 | fail (typed) |
| G6 真链 | 门经**真 wire 方法入口**驱动（参数表校验在位） | 直调内部函数 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手确认现状（无 `credentials.*`） · 2. 录入 ＋ 列举落地（复用 `149` 的幂等入口，**不造第二套**） ·
3. 门与反例（G1–G5） · 4. 重锁材料备齐并**写清**它在下一次重锁窗口里的确切位置 · 5. 账里给出与 `149` 的复用点。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`CREDENTIAL_ENTRY_SURFACE_DONE`
- 否则：`CREDENTIAL_ENTRY_SURFACE_PARTIAL` + 精确剩余

## Notes for the executor

- **排序（`R-0080 ①②` 覆盖 `R-0079`）**：本单是**「对话区闭环」根子那一格**（没有录入口 ⇒ 新鲜装配每次掉同一条缝），**本树第二优先**；
  排在 `149` **之后**（复用它的幂等入口）；`149` 未收口时**不要**先落第二套登记语义。`089` 收尾 / `103` / `099` 让位给闭环。
- **重锁窗口**：**下一次重锁**＝`113` 那一族的"wire 工件重生成 ＋ 两仓登记"（材料已备的先例：`R-0051 ①`／公告 40/52/58）。
  你**只备材料并登记位置**；**别**去改别的仓、**别**自称已重锁。
- **`R-0071 ①` 纪律**：新增**方法**要走合同变更链——**本单已授权**新增这两个方法（`R-0077 ①` 用户已拍）；
  但**除这两个方法之外**的任何新键/新字段 ⇒ **交回 ops**，别顺手加。
- **不要**为了让门绿而返回"看起来能用"的假身份（G1 走真绑定）。
- **前提待验**（`OF-02`）：`credentials.py` 的方法集与 `handlers.py:786` 的读点、`repository.py:63/95` 的判据是 ops 一手读的；**第一步自己复核**，不符 ⇒ `status.md` 写明并交回。
