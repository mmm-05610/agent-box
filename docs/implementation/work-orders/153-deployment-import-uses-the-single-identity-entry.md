---
id: "153"
slug: deployment-import-uses-the-single-identity-entry
batch: b2
baseline: "b1e21dc"
depends_on: []
write_paths: ["src/agent_box/server/bootstrap/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**"]
ruling: R-0078
terminal: ["DEPLOYMENT_IMPORT_SINGLE_ENTRY_DONE", "DEPLOYMENT_IMPORT_SINGLE_ENTRY_PARTIAL"]
waive: []
parallel_units: ["observe", "consolidate", "gate"]
serialize_with: ["079", "089", "092", "093", "094", "095", "096", "097", "098", "099", "100", "101", "103", "106", "107", "108", "109", "111", "113", "121", "122", "125", "126", "127", "128", "129", "130", "131", "133", "134", "135", "136", "137", "138", "139", "140", "141", "142", "144", "145", "146", "148", "150", "151"]
revisions: []
---

# Work Order 153 — **部署导入改走「唯一一条幂等身份入口」**（`149` 的跨树另一半）

## Objective

**来源：A 线 `149` 的收口交回（`f164412`，终态 `CREDENTIAL_IDENTITY_SEAM_DONE`）＋ ops 第 159 轮转单。**

`149` 在 A 树收出了**唯一一条幂等身份入口** `CredentialRecords.register_if_missing()`（`src/agent_box/server/credentials.py`，
一事务内先查后插、名字已解析则原样返回、不重复行、不覆盖 locator、绝不重读密钥、回 `created: bool`），
并**明确交回两处"不在它写面"的改动**，其中**这一处在 runtime 线**：

> **`src/agent_box/server/bootstrap/runtime.py:1353`：`register` → `register_if_missing`。**

**为什么这格必须做（不是锦上添花）**：`149` 的 Requirement 是"**幂等语义只有一条**"；
而今天 `_import_declared_credentials`（`:1325-1353`）**自己在调用点实现了一遍幂等**——
`:1336` 先 `records.exists(...)` 再 `:1353` 裸 `register(...)`，**这与 `register_if_missing` 是同一件事的第二份实现**。
⇒ 不合并 ⇒ **同一个语义两处维护**，正是 `R-0077 ②`「别两处各修一半」要防的形态；而且**检查与插入不在同一事务**，
两次并发声明之间有真实的竞态窗口（`register` 是裸 `INSERT`，撞上就是 `IntegrityError`）。

## Current state（一手）

- `_import_declared_credentials(runtime, declarations)`（`src/agent_box/server/bootstrap/runtime.py:1325-1353`）：
  逐条 `records.exists(declaration["credentialId"])` ⇒ 命中即 `continue`（`:1336-1337`）；否则 `store.import_file(...)` 取 locator，再 `records.register(...)`（`:1353`）。
- `runtime.py:238` 在 `start()` 里调它（**schema 起来之后**），注释自述"the store and the records table both exist only once the schema is up"。
- 失败语义：声明了凭据但 store 缺失 ⇒ `RuntimeError("SIDECAR_DEPLOYMENT_CREDENTIAL_STORE_MISSING")`；读不到源 ⇒ `SIDECAR_DEPLOYMENT_CREDENTIAL_UNREADABLE`（`:1339-1351`）。
- A 树侧：`credentials.register_if_missing(credential_id, kind, secret_locator)` 已存在并**有门**（`tests/server/test_credential_identity_seam_149.py`）。
  **注意**：该入口**不 import 密钥**（"it names the identity, it does not import a secret"）⇒ **`import_file` 那一步仍归你**。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 调用点自己实现的幂等 | `_import_declared_credentials` 的 `exists()`＋裸 `register()` **换成** `register_if_missing(...)`；**`import_file` 的先后顺序与失败语义逐字不变** | 唯一一条语义（`149` 的 Requirement）＋ 关掉"检查与插入不同事务"的竞态窗口 |
| 顺序（**别改坏**） | 必须**先**拿到 locator（`store.import_file`），**再**登记身份；**不得**因为改成 `register_if_missing` 就变成"先登记后取密钥" | 今天"密钥读不出来 ⇒ 启动失败"这条语义（`:1344-1351`）靠这个顺序成立 |
| 失败语义 | `SIDECAR_DEPLOYMENT_CREDENTIAL_STORE_MISSING`／`..._UNREADABLE` 两条**逐字不变**；`start()` 里"宁 fail start 不静默"的行为**逐字不变** | `149` 的分支 (a) 与既有纪律同源 |
| 已解析的名字 | 命中已有身份 ⇒ **不重复行、不覆盖 locator、不重读密钥**（与 `149` 的门 G3 同口径） | 幂等的定义 |
| 门 | 见 Gates；**反例必须会红** | `OF-14`：门要走真腿 |

**硬约束**：
- **不写** `src/agent_box/server/credentials.py`（属 A 树）——**只调用**它。
- **不新增**任何协议/字段；**不改** `wire/**`。
- **凭据内容绝不过线**（只作 locator；不打印、不落盘、不进日志、不进证据）。

**边界**：
- `149`（A 树）＝**入口本身**；**本单**＝**让部署导入改走它**（`R-0077 ②` 的"别两处各修一半"）。**本单不重复实现幂等**，只调用。
- `151`（A 树）＝wire 受控录入口 ⇒ 它也**复用**同一个入口；三处（部署声明／启动器注入／wire 录入）**共用一条**。
- **主树启动器**（`scripts/server-round1/trial-serve-linux.py`）**不在本单写面**，也**不在 ops 与 A 的写面** ⇒ 那一半由 ops 在公告里**点名待指派**（见 Notes）。

## Requirements

### Requirement: 部署声明的导入必须与其它注入路径**共用同一条幂等语义**

#### Scenario: 已解析的名字不被重复登记（正例）

**WHEN** 部署声明里的 `credentialId` 已在 `server_credentials` 里
**THEN** **不新增行、不覆盖 locator、不重读密钥**，`start()` 照常成功

#### Scenario: 新名字被建立（正例）

**WHEN** 声明里的 `credentialId` 尚不存在，且 `store.import_file` 能读到源
**THEN** 身份被建立，`start()` 成功；**且登记用的是 `register_if_missing`（唯一入口）**

#### Scenario: 源读不出来 ⇒ 启动类型化失败（反例，必须）

**WHEN** 声明了凭据但源读不出来（或 store 缺失）
**THEN** 仍是 `SIDECAR_DEPLOYMENT_CREDENTIAL_UNREADABLE`／`..._STORE_MISSING`，**启动失败**，**且不留下半条身份行**

#### Scenario: 反例（门要能咬）

**WHEN** 把 `register_if_missing` 换回"`exists()` ＋ 裸 `register()`"（或把顺序倒成先登记后取密钥）
**THEN** 上面**正例/反例至少一条必须红**

#### Scenario: 第二份实现消失（正例，可机检）

**WHEN** 静态读 `bootstrap/**`
**THEN** **不再有**"先 `exists()` 再裸 `register()`"这一对调用（幂等只活在 `credentials.py` 一处）

## Stages

- [ ] 1. 观测：一手读 `_import_declared_credentials` 现状，写出"第二份幂等实现"与"检查/插入不同事务"的事实（提交）
- [ ] 2. 换成 `register_if_missing`（**保持 `import_file` 在前、失败语义逐字不变**）（提交）
- [ ] 3. 门与反例（已解析／新名字／读不出即失败／换回旧写法必红／静态机检无第二份实现）（提交）
- [ ] 4. 账：计数 ＋ "为什么这一格必须做"（一段话）（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 幂等 | 同名声明两次 ⇒ 不重复行、不覆盖 locator、不重读密钥 | 重复行／抛 `IntegrityError` ⇒ 门红 | fail (typed) |
| G2 新名字 | 新 `credentialId` ⇒ 身份建立且 `start()` 成功 | 建不出来 ⇒ 门红 | fail (typed) |
| G3 失败语义 | 源读不出／store 缺失 ⇒ 原两条 `RuntimeError` **逐字**、启动失败、无半条行 | 静默通过 ⇒ 门红 | fail (typed) |
| G4 顺序不变 | 仍是"先 `import_file` 取 locator，后登记身份" | 倒序 ⇒ 门红 | fail (typed) |
| G5 唯一实现 | 静态机检：`bootstrap/**` 里不再有"`exists()` ＋ 裸 `register()`"这对调用 | 仍在 ⇒ 门红 | fail (typed) |
| G6 无凭据外泄 | 日志/证据 `grep` 不到密钥形状 | 出现密钥 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict --legacy-ok
git diff --check && git status --short
```

## DoD

1. 一手写出"第二份实现"与"不同事务"的事实 · 2. 改走 `register_if_missing`（顺序与失败语义逐字不变） ·
3. 门与反例（G1–G5） · 4. 账。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`DEPLOYMENT_IMPORT_SINGLE_ENTRY_DONE`
- 否则：`DEPLOYMENT_IMPORT_SINGLE_ENTRY_PARTIAL` + 精确剩余

## Notes for the executor

- **排序（`R-0080 ①②`）**：本单在**闭环**上（新鲜装配的凭据身份必须真建得起来），但**改动极小** ⇒ **与 `150` 同优先级、可插在 `150` 的阶段边界之间做**；
  与 `150` **不同文件**（本单只碰 `bootstrap/**`）⇒ 不冲突；**`150` 仍在飞 ⇒ 别抢 `plugins/**` 与 `sessions/**`**。
- **`149` 的另一半（主树启动器）不在你写面**：`scripts/server-round1/trial-serve-linux.py:83-90` 的注入支必须"登记身份、建不出即启动类型化失败"。
  **ops 已在公告里点名待指派**（A 无写权、ops 无写权）⇒ **你只做 `bootstrap/**` 这一半**，**不要**去改主树。
- **顺手一条（不改也记账）**：既然部署声明路径**今天就是正确的产品路径**，那 **fresh 装配不必然要等启动器改动**——
  在 Notes 里写一行"用声明路径做 fresh 装配是否已足够"的判断（**给 ops 用于 `R-0080 ④` 的窗判据**），**不要**改 `trial-serve-*`。
- **前提待验（`OF-02`）**：本单引用的行号（`runtime.py:1325-1353`／`:1336`／`:1353`／`:238`）是 ops 一手读的；**第一步自己复核**，不符 ⇒ `status.md` 写明并交回。
