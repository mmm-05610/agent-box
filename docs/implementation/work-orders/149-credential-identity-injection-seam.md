---
id: "149"
slug: credential-identity-injection-seam
batch: b2
baseline: "b630acd"
depends_on: []
write_paths: ["src/agent_box/server/credentials.py", "src/agent_box/server/model_configs/**", "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "release/**", "src/agent_box/server/wire/**", "src/agent_box/server/bootstrap/**"]
ruling: R-0078
terminal: ["CREDENTIAL_IDENTITY_SEAM_DONE", "CREDENTIAL_IDENTITY_SEAM_PARTIAL"]
waive: []
parallel_units: ["localize-seam", "identity-adoption", "startup-judgement", "gate"]
serialize_with: ["087", "089", "097", "098", "099", "101", "103", "104", "105", "112", "113", "115", "117", "118", "119", "123", "124", "125", "128", "129", "132", "145", "147", "151"]
revisions: []
---

# Work Order 149 — **注入的凭据必须是一个身份**：新鲜装配下「绑注入凭据」不得再 `CREDENTIAL_NOT_FOUND`（`R-0078 ①`）

## Objective

**来源：`R-0078`（用户 2026-09-20 10:00「跑了这么久还是不能用，卡在哪里」的一手定量）＋ ops 第 152 轮开单。**

`R-0078` 的第一处卡点：在**新鲜装配**（新数据根 ＋ 新种凭据）上，把 provider 记录绑到**注入的**凭据 ⇒
**`NOT_FOUND` / `CREDENTIAL_NOT_FOUND`**（`a-r5-cause-split.json` 的 `D2`；`a-r5-credential-isolation.json` 的 `C1` 同码），
而**只换模型 id、凭据不动就成功**（`D2b ✓`）、profile 控件重绑也成功（`D3 ✓`）⇒ **模型那一段没问题，凭据那一段对不上**。

**ops 一手定位（不是推测，三源取二）**——**"注入"与"身份"是两件事，没有任何东西保证它们一致**：

| 事实 | 出处（一手） |
| --- | --- |
| 记录层**只认 `server_credentials` 表**：`providerModels.create` 与 `update` 在绑 `credentialId` 前 `SELECT 1 FROM server_credentials WHERE id=?`，查不到即 `CREDENTIAL_NOT_FOUND`(404) | `src/agent_box/server/model_configs/repository.py:63`／`:95` |
| **产品的正确路径**是"部署声明 ⇒ 登记身份 ＋ 导入密钥"：`_import_declared_credentials` 逐条 `records.exists()` 幂等跳过、否则 `store.import_file()` | `src/agent_box/server/bootstrap/runtime.py:1325-1350`（`runtime.py:238` 在 `start()` 里调） |
| **试用启动器的注入路径**只把密钥**放进内存**、**不登记身份**：`--credential-id <已有 id>` ⇒ 打印 `credential seeded in memory: …`；只有**不带** `--credential-id`（临时铸新 id）那一支才 `register_credential(...)` | 主树 `scripts/server-round1/trial-serve-linux.py:83-90`；**实测日志**＝`/tmp/a-trial-r5.log` 第 1 行＝`credential seeded in memory: credential_7dec0e4b…` |
| 新鲜根里**确实存在另一个身份**（seed 自己登记的那条）⇒ 所以"绑 seed 那条"能过（`D2b ✓`）、"绑注入那条"过不去（`D2`） | `a-r5-cause-split.json`：`D1b` 记录 `credentialId=credential_cb880c9f…`；`D2` 绑 `credential_7dec0e4b…` ⇒ 404 |
| 启动器**不是产品路径**（A 的写权不含它）；**64 个 wire 方法里也没有任何 `credentials.*` 录入面** ⇒ 用户/界面**无法**把一个身份建出来 | 主树 launcher 文件头自述「Nothing here is a product path」；`A` 的早间交接 §2.2「WSL Server 上没有任何凭据录入面」 |

**⇒ 本单要修的是那条缝本身**：**凡"受支持的注入路径"给了一条凭据，它就必须同时是一个可被记录层绑定的身份**；
**不允许**出现"服务起来了、看着正常、但记录层认不出它"的**半状态**。

**为什么归 A 线（ops 归属判据）**：身份记录层在 `server/model_configs/**` ＋ `server/credentials.py`，**都是本树写面**（`R-0022 ②`）；
`wire/**` 属本树但**本单不碰**（新方法归 `151`）；`bootstrap/**` 属 runtime 树 ⇒ 需要动它**交回**。

## Current state（一手）

- 记录层身份判据＝`server_credentials` 表一行（`repository.py:63`／`:95`；`credentials.py:36-49` 的 `exists()`／`register()`）。
- `credentials.register()` 是**裸 `INSERT`**（`:19-25`）⇒ 对**已存在**的 id 会抛 `IntegrityError`（**不是幂等**）；
  幂等语义今天只存在于 `bootstrap/runtime.py` 的 `_import_declared_credentials` 里（**调用方各自实现一遍**）。
- `CredentialRecords.get()`（`:52-59`）在 `kind` 不匹配时也回同一个 `CREDENTIAL_NOT_FOUND` ⇒ **"不存在"与"种类不符"今天不可区分**（可选收口项，见 Scope）。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 身份的**幂等建立** | 在 `credentials.py` 收出**一条**幂等入口（如 `register_if_missing(credential_id, kind, locator)`／`adopt(...)`），**部署导入与启动器注入共用它** | 今天"幂等"只活在 `bootstrap/runtime.py` 一个调用点里；再让启动器各写一份＝**第二套语义**（`151` 也要用它 ⇒ 必须只有一条） |
| 注入路径的**半状态** | 二选一（**写清选哪支与依据**）：**(a)** 让"注入但无身份"在**启动时判死**（类型化、不静默）；**(b)** 若判死会误伤合法用法，则至少让它在**启动输出与一个可判读数**里显形（例：`server.hello` 的某字段或一条 `credentials.list` 结果）——**(b) 里凡要动 `wire/**` 形状的 ⇒ 交回 ops**（协议面） | "起了、看着正常、记录层认不出"正是这次卡了半天的形状 |
| 记录层的**错误语义** | **保持** `CREDENTIAL_NOT_FOUND` 的类型化（`wire/errors.py:47` → `NOT_FOUND`；`handlers.py:292` 已给 `provision_the_credential_on_this_host` 提示）——**别放宽成"查不到也放行"** | 放宽＝把"绑错凭据"变成"跑到执行时才炸" |
| **可选**收口（不做也行，做了要记账） | `get(kind=…)` 的种类不符与"不存在"分开成两个码 | 可判性；但**若会动 `wire/errors.py` 的家族映射 ⇒ 交回 ops** |
| 门 | 见 Gates；**反例必须会红** | `OF-14`：门要走真腿 |

**必须保持不变**：`CREDENTIAL_NOT_FOUND` 的家族位与文案；`providerModels.create/update` 的**既有**绑定行为（本单只让"该被认出的身份"能被认出）；
**凭据内容绝不过线**（只作 locator，`0600`，不打印、不落盘、不进日志、不进证据文件）。

**边界（与 `151` 对齐，别两处各修一半）**：
- `151`＝**给 wire 加受控的凭据录入口**（用户能在界面上建身份）。**本单不新增任何 wire 方法**；`151` 落地时**必须调本单收出的那条幂等入口**，不得另造语义。
- 主树 `scripts/server-round1/trial-serve-linux.py` **不在你的写面**（调度树工具，`A` 的写权亦不含它）⇒ 若修法需要它，
  在 `status.md` 写清「**ops 需执行的确切改动**」（一行级的原文即可）并**交回 ops**，**不要**去改主树。
- `bootstrap/**` 属 runtime 树 ⇒ 需要动它**交回**，不要越界。

## Requirements

### Requirement: 受支持的注入路径给出的凭据，必须同时是一个**可绑定的身份**

#### Scenario: 新鲜装配 ＋ 注入凭据 ⇒ 绑定成功（正例，本单主目标）

**WHEN** 用一个**全新的数据根**起一台 Server，并按**受支持的注入路径**（部署声明，或启动器的注入参数）提供一条凭据
**THEN** 以该 `credentialId` 新建／改绑 provider 记录**成功**（**不再** `CREDENTIAL_NOT_FOUND`），且该身份可由记录层查到

#### Scenario: 绑不存在的凭据 ⇒ 仍类型化拒（**反例，必须**）

**WHEN** 以一条**任何注入路径都没有提供过**的 `credentialId` 新建／改绑 provider 记录
**THEN** 仍是 **`CREDENTIAL_NOT_FOUND`**（`family=NOT_FOUND`、`details.internalCode` 在），**且记录行不增**

#### Scenario: 幂等（正例）

**WHEN** 同一条身份被**声明两次**（重启、或部署与启动器各注入一次）
**THEN** **不抛错、不重复行、不重读密钥**（与 `_import_declared_credentials` 的既有语义**逐字一致**）

#### Scenario: 半状态可见（正例，按你选的 (a)/(b) 支）

**WHEN** 注入了一条凭据而身份**没有**建起来
**THEN** **要么启动即类型化失败**，**要么**该事实在启动输出与一个可判读数里**显形**（不得静默）

#### Scenario: 反例（门要能咬）

**WHEN** 把"身份建立"那一步**注释掉**（或改回"只注入内存、不建身份"）
**THEN** 上面**正例 1 必须红**

## Stages

- [ ] 1. 观测：一手复现"新鲜根 ＋ 注入 ⇒ 绑定 404"，并把**注入与身份的差异**量成一行事实（含启动器打印的那一行）（提交）
- [ ] 2. 在 `credentials.py` 收出**一条**幂等身份入口，并让**部署导入**改走它（行为逐字不变）（提交）
- [ ] 3. 按你选的 (a)/(b) 支处理"注入但无身份"的半状态（提交）
- [ ] 4. 门与反例（正例 1／反例／幂等／半状态可见）（提交）
- [ ] 5. 账与证据：写清「ops 需执行的启动器改动」原文（若需要）＋ `151` 必须复用的入口名（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 新鲜装配可绑 | 新数据根 ＋ 注入凭据 ⇒ 绑该 `credentialId` **成功**（HTTP 200 且记录行 +1） | 注释掉身份建立 ⇒ 门红 | fail (typed) |
| G2 反例：不存在的 id | 绑未注入过的 id ⇒ `CREDENTIAL_NOT_FOUND`、`family=NOT_FOUND`、`details.internalCode` 在、记录行不增 | 放行 ⇒ 门红 | fail (typed) |
| G3 幂等 | 同一身份声明两次 ⇒ 无异常、无重复行、不重读密钥 | 抛 `IntegrityError` 或重复行 ⇒ 门红 | fail (typed) |
| G4 半状态可判 | 注入而身份缺失 ⇒ **启动类型化失败** 或 **可判读数显形**（按所选支断言） | 静默通过 ⇒ 门红 | fail (typed) |
| G5 真链 | 门经**真 wire 方法入口**驱动（`providerModels.create`/`update`），非直调 `credentials.*` | 直调内部函数 ⇒ 门红 | fail (typed) |
| G6 无凭据外泄 | 证据/日志/账里 `grep` 不到凭据形状（`sk-` 等），身份只用 id | 出现密钥形状 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 一手复现并量出"注入 ≠ 身份" · 2. 幂等身份入口**只有一条**且部署导入改走它 · 3. 半状态按 (a)/(b) 一支处置 ·
4. 门与反例（正例 1 ＋ 不存在的 id ＋ 幂等 ＋ 半状态） · 5. 账里给出「ops 需执行的启动器改动」原文与 `151` 复用的入口名。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`CREDENTIAL_IDENTITY_SEAM_DONE`
- 否则：`CREDENTIAL_IDENTITY_SEAM_PARTIAL` + 精确剩余

## Notes for the executor

- **排序（`R-0079 ②`）**：本单排在 `089` 收尾 → `103` → `099` **之后**；`151`（wire 受控录入口）**排在你这条之后**（它复用你的入口）。
- **与 `151` 的关系（`R-0077 ②`「别两处各修一半」）**：本单＝**身份与注入对齐**（服务端内部，零协议变更）；`151`＝**把身份建出来这件事变成用户可做的产品面**（新增 wire 方法 ＋ 重锁）。
  **判据**：`151` 落地后，用它的新方法建出的身份**必须**能被本单的记录层绑定，且**不出现第二条幂等语义**。
- **`R-0076 ④` 提醒**：`D6 不截断` 是 sidecar 失败（`150`）的**下游**，**本单不得**把它当第二格；`108` 的截断另算。
- **不要**为了让门变绿而放宽 `CREDENTIAL_NOT_FOUND`（G2 就是钉这条）。
- **前提待验**（`OF-02`）：ops 引用的行号与 `/tmp/a-trial-r5.log` 那一行是一手读的；**第一步自己复核**，与本单不符 ⇒ 在 `status.md` 写明并交回。
