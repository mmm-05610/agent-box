---
id: "152"
slug: sendability-requires-resolvable-credential
batch: b2
baseline: "c0ac0a8"
depends_on: []
write_paths: ["src/agent_box/server/wire/**", "src/agent_box/server/credentials.py", "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-runtime-round1/**", "src/agent_box/storage/**", "src/agent_box/server/bootstrap/**", "release/**"]
ruling: R-0080
terminal: ["SENDABILITY_RESOLVABLE_CREDENTIAL_DONE", "SENDABILITY_RESOLVABLE_CREDENTIAL_PARTIAL"]
waive: []
parallel_units: ["observe", "resolvability-probe", "binding-chain", "gate"]
serialize_with: ["087", "089", "097", "098", "099", "101", "103", "104", "105", "112", "113", "115", "117", "118", "119", "123", "124", "125", "128", "129", "132", "145", "147", "149", "151"]
revisions: []
---

# Work Order 152 — **`sendability: ready` 必须把「凭据在本机能否解析」算进去**（`ACC-R5-4`，A 线验收第一手发现）

## Objective

**来源：A 线验收第 5 轮（`ACC-R5`）的 `ACC-R5-4`，A 明说「要 ops 转单」（`docs/acceptance/gate-log.md` P-17 行 ＋ `docs/acceptance/round-5.md` §5b）。**

**A 的第一手读数（用户要点的这台 `18790` 上）**：`profiles.list` **22 行里 21 行报 `sendability: ready`**，
其中 **20 行的 `model:` check 直接带着一个 DPAPI 凭据 id**——**那个 locator 在 Linux 上根本解析不了**，却**仍被算作 ready**；
而**唯一凭据可解析的那一行（`pi-deepseek`）反而报 `blocked`**。⇒ **界面说"能发"，用户一点就失败**——这正是闭环 ⑤（失败可见/不骗人）与 ③④（发不出去）的交界处。

**ops 一手定位（读代码，不是推测）**：`sendability` 的重走链**只查"身份记录在不在 ＋ kind 对不对"**，
**从不问"这台机器的 secret store 能不能解析这个 locator"**：

| 事实 | 出处（一手） |
| --- | --- |
| 冻结链重走在 `_profile_bindings`：control → provider 记录 → model → **`credentials.get(credential_id, kind=kind)`** | `src/agent_box/server/wire/handlers.py:687-795`（凭据那一段在 `:781-795`） |
| `CredentialRecords.get()` 查的是 **`server_credentials` 表的行**（身份）＋ kind，**不碰 secret store** | `src/agent_box/server/credentials.py`（`get()`／`exists()`／`register_if_missing()`） |
| **secret store 的协议今天只有 `import_file` / `read` / `delete`——没有 `exists`/`can_resolve`** ⇒ "能不能解析"**没有现成查询** | `src/agent_box/storage/secrets.py:19-22`（`SecretStore` Protocol） |
| 于是 DPAPI locator 在 Linux 上：**行在、kind 对 ⇒ `ready`**；真去发才在更深处炸 | A 的 `ACC-R5-4` 读数；与 `R-0078 ①` 的"身份 ≠ 可解析"**同一条缝的另一面** |

**⇒ 本单要修的**：`sendability` 的 `ready` **必须**以"**这个 locator 在本机能解析**"为前提；
解析不了 ⇒ **`blocked`／`unknown`（并给出可读原因与可做的动作）**，**绝不 `ready`**。

**为什么归 A 线**：`_sendability`／`_profile_bindings` 全在 `src/agent_box/server/wire/handlers.py`（**本树写面**，`R-0022 ②`）。

## Current state（一手）

- 判定链（`_profile_bindings`，`:687-795`）：`descriptor.model_control_id` → 配置对象里的 `{providerId, modelId}` → `model_configs.records.get` → provider 的 `models[]` → `availability` → **`credentials.get(credential_id, kind=kind)`**。
  每一步失败都**类型化**（`PROVIDER_MODEL_NOT_FOUND`／`PROFILE_CONFIGURATION_INVALID`／`PROVIDER_MODEL_UNUSABLE`／`PROVIDER_MODEL_REFERENCE_MISSING`／`MODEL_UNAVAILABLE`／`CREDENTIAL_*`），**这一步的设计是对的**（QA-009 的成果）。
- 缺的只有一格：**"记录在"≠"本机能解析"**。
- 冻结链的**规则是照抄**（`model_configs/service.py:134-180`），**不是 import**（`model_configs/**` 属 runtime 线）⇒ **本单也只能照抄/复用同一条语义，不得另立**。
- `149` **正在本树在飞**（`credentials.py` 的 `register_if_missing` ＋ `tests/server/test_credential_identity_seam_149.py` 未提交）⇒ **本单与它串行**，见边界。

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 绑定的最后一格 | 在 `credentials.get(...)` **之后**加一格**可解析性**：**能解析 ⇒ 继续 ready；不能 ⇒ `blocked`（类型化原因 ＋ 可做动作）；问不出来 ⇒ `unknown`**（绝不 `ready`） | `ACC-R5-4` 的本体 |
| 怎么问"能不能解析" | **二选一，写清选哪支与依据**：**(a) 推荐**＝用**既有** `secret_store.read(locator)` 试读（**成功即丢弃**，值只在本进程内存里活一瞬、**不打印/不落盘/不进事件/不进证据**）；**(b) 若判定"为查询而读密"不可接受** ⇒ 需要给 `SecretStore` 加 `exists(locator)`——**那要改 `src/agent_box/storage/**`，不在本单写面** ⇒ **阶段 1 交回 ops**，由 ops 开存储面单并**串行**排（别自己越界） | 没有现成查询（`secrets.py:19-22`）；**红线＝凭据内容绝不过线** |
| `pi-deepseek` 那一行 | **顺手答掉一格**：它**凭据可解析却 `blocked`** ⇒ 用同一条重走链**写出它到底卡在哪一步**（一行事实＋码）。**若那是第二个缺陷 ⇒ 交回 ops**（别在本单里顺手修） | 防止"把过报修好了、把另一条真故障留在原地" |
| 既有语义 | 上面列的**每一步类型化拒绝逐字不变**；`unknown` 的语义（读不出来就是 unknown，**不当 ready**）不变 | QA-009 的成果，别回退 |
| 门 | 反例夹具**必须**含一个**DPAPI locator**（本机不可解析） | `ACC-R5-4` 的原始形态 |

**硬约束**：
- **凭据内容绝不过线**：任何返回、事件、日志、证据里 `grep` 不到密钥形状（`sk-` 等）；**只用 id/locator 与"能不能解析"这个布尔**。
- **不得**放宽既有的 `CREDENTIAL_*` 类型化拒绝（`R-0078 ①` 的反例仍要红）。
- **不写** `storage/**`、`bootstrap/**`、`model_configs/**`（分别属存储面/runtime 线）——需要就**交回 ops**。
- **本单不修** `149` 的身份缝（`register_if_missing` 是它的），**只修投影侧的"过报 ready"**。

**边界（与 `149`／`151` 对齐，`R-0077 ②`「别两处各修一半」）**：
- `149`＝**身份**（注入的凭据必须成为一个可绑定的身份）→ **本单**＝**可解析性**（记录在，但本机解析不了，不能叫 ready）。**两条合起来**才是"能发"的完整判据。
- `151`＝**让用户能录凭据**（新方法 ＋ 重锁）。**本单不新增 wire 方法**；若你判定必须有新字段/新方法 ⇒ **阶段 1 交回 ops**。
- `117` 是本单的**前身**（`sendability` 就是它落的）⇒ **修订 `117` 的链，不要另立第二条链**；`117` 的 `test_a_blocker_the_freeze_path_would_hit_is_named` 必须继续绿（防漂移）。

## Requirements

### Requirement: `ready` 只能是"**这台机器上真的能发**"

#### Scenario: 记录在、但本机解析不了 ⇒ 不得 `ready`（**反例，本单主目标**）

**WHEN** Profile 绑的凭据**记录存在且 kind 正确**，但它的 locator 在**本机**解析不了（例：DPAPI locator 在 Linux 上）
**THEN** 该 `model:` check 为 **`blocked`**（类型化原因 ＋ 可读 message ＋ 非空 `actions`），**整个 `sendability` 不为 `ready`**

#### Scenario: 能解析 ⇒ 仍 `ready`（正例）

**WHEN** 凭据记录在、kind 对、且 locator 在本机能解析
**THEN** 该 check 仍 `ready`（**不许把正常情形也打成 blocked**）

#### Scenario: 问不出来 ⇒ `unknown`，不是 `ready`（正例）

**WHEN** 解析性查询本身失败/不可判定
**THEN** `unknown`（沿用既有"读不出来就是 unknown"的语义）

#### Scenario: 凭据内容不过线（**反例，红线**）

**WHEN** 走完整个 `profiles.list`
**THEN** 响应、事件、日志、证据里 **`grep` 不到密钥形状**；**只有 id 与布尔**

#### Scenario: 反例（门要能咬）

**WHEN** 把可解析性那一格**去掉**（回到"只看记录在不在"）
**THEN** 上面**正例 1 必须红**

#### Scenario: 既有类型化链不变（正例）

**WHEN** 跑 `117` 既有用例（含 `test_a_blocker_the_freeze_path_would_hit_is_named`）
**THEN** **全绿**、语义逐字不变

## Stages

- [ ] 1. 观测：**一手复现** A 的读数（22 行里 21 行 ready、其中 20 行带 DPAPI id）并**量出**"记录在≠能解析"（附命令与计数）（提交）
- [ ] 2. 可解析性那一格：按 (a) 支（试读即弃）落地；**写清为什么选它**（提交）
- [ ] 3. 接进 `_profile_bindings`／`_sendability`：`blocked`/`unknown` 的分类与 `actions` 文案（**翻人话、给动作**）（提交）
- [ ] 4. 门与反例（正例 1／正例 2／unknown／不过线／去掉那一格必红／`117` 既有门全绿）（提交）
- [ ] 5. 账：`pi-deepseek` 那一行**卡在哪一步**的一行事实（若是第二个缺陷 ⇒ 交回 ops，别修）（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 过报被治 | DPAPI locator（本机不可解析）⇒ 该 check `blocked`、整体非 `ready` | 仍报 `ready` ⇒ 门红 | fail (typed) |
| G2 正常仍绿 | 可解析凭据 ⇒ `ready` | 打成 `blocked` ⇒ 门红 | fail (typed) |
| G3 unknown 语义 | 查询不可判定 ⇒ `unknown`（非 `ready`） | 报 `ready` ⇒ 门红 | fail (typed) |
| G4 不过线 | 响应/事件/日志/证据 `grep` 不到密钥形状 | 出现密钥 ⇒ 门红 | fail (typed) |
| G5 既有链不变 | `117` 既有用例全绿（含冻结链对照那条） | 任一红 ⇒ 门红 | fail (typed) |
| G6 真链 | 门经**真 wire 方法入口**（`profiles.list`）驱动，非直调私有函数 | 直调 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict --legacy-ok
git diff --check && git status --short
```

## DoD

1. 一手复现并量出"记录在 ≠ 能解析" · 2. 可解析性那一格落地（(a) 支 ＋ 依据） · 3. 分类与 `actions` 文案可读 ·
4. 门与反例（G1–G6） · 5. `pi-deepseek` 那一行的**卡点事实**（若属第二缺陷 ⇒ 交回）。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`SENDABILITY_RESOLVABLE_CREDENTIAL_DONE`
- 否则：`SENDABILITY_RESOLVABLE_CREDENTIAL_PARTIAL` + 精确剩余

## Notes for the executor

- **排序（`R-0080 ①②`）**：本单在**闭环**上（⑤ 不骗人 ＋ ③④ 能不能发）⇒ **本树第一梯队**；**排在 `149` 之后**（`149` 在飞且同改 `credentials.py` ⇒ **别抢**；本树单执行者，天然串行）。
- **修订而不是另立**：`sendability` 是 `117` 落的 ⇒ **改 `117` 那条链**，别造第二条；`117` 的漂移守卫必须继续绿。
- **`R-0076 ④`**：`108`/`122` 的截断是**另一格**，**不许**并进本单。
- **红线**：凭据内容绝不过线（G4）；**"为了查询而读密"** 若你判断不可接受 ⇒ **走 (b) 并交回 ops**，**不要**自己改 `storage/**`。
- **前提待验（`OF-02`）**：本单引用的行号（`handlers.py:687-795`／凭据段 `:781-795`／`secrets.py:19-22`）与 A 的读数（`gate-log` P-17／`round-5.md` §5b）都是 ops 一手读的；**第一步自己复核**，不符 ⇒ `status.md` 写明并交回。
