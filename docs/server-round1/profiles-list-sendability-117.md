# 117 — `profiles.list` now says what it knows before the user types (QA-009 后端面，含修订 v2)

Tree `agent-box-env-provider`，baseline `bca7782`，run 2026-09-19 12:4x–13:0x UTC。
**真实模型调用 0**。已纳入 work order 117 修订 v2 @`bca7782`（`after_stage: 0`，本单一开始就按修订版做）。

## 1 前提复核（OF-02，第一步做）

| ops 的前提 | 本树一手复测 |
| --- | --- |
| `profiles.list` 逐行走 `profile_record(row)` | ✅ `wire/handlers.py:535-542` → `:544` |
| 投影不含任何阻塞/恢复状态，12 键 | ✅ `wire/projection.py:110-129`（`id/version/displayName/harness/accountId/permissionPreset/permissionRules/originProfileId/archivedAt/createdAt/updatedAt` + `capabilities`）|
| 行里有该列且发送路径偏读它 | ✅ `profiles/repository.py:67-75` 是 `SELECT *`，`server_profiles` 有 `recovery_pending`（`storage/database.py`），accept 路径读它回 409 |
| 修订 v2：模型/凭据绑定不在投影里 | ✅ `providerModelId` 根本不在行上——它在 Profile 自己的 **configuration 对象**里（行只带 `config_object_digest`）|

前提全部成立，没有需要交回的偏差。

## 2 加了什么（只增不改）

**`recoveryPending: true | false | null`**（`projection.py::_tri_state`）——`null` 是"读不到这一列"，
**不等于** `false`。这一条是 QA-009 的同族复发点（`C-43` 的 `Unknown`）：accept 路径读不到会 fail closed，
投影把"不知道"画成"没阻塞"就是让信息在中间被吃掉（`R-0032 ⑤`）。

**`sendability: {state, reason, message, actions, checks[]}`**（`handlers.py::WireService._sendability`）——
`state ∈ {"ready","blocked","unknown"}`。它把**一个 turn 真跑时会走的那条判定链**提前走一遍并如实报告：
`model_configs/service.py:134-180`（`freeze_execution_configuration`）依序看
harness 是否声明 model control → configuration 里该 control 是不是 `{providerId, modelId}` →
provider 记录在不在/是否归档/是否同 harness → 模型在不在这个记录上/是否 `unavailable` →
`credentials.get(credential_id, kind=descriptor.credential_kind)`。
这些**规则**在本树被复制成 `_profile_bindings`（`model_configs/**` 与 `sessions/**` 是 runtime 线的写面，章程 §3），
钉住两条腿不漂移的是门：`test_the_projection_names_what_the_freeze_path_would_hit`
——同一份数据直接叫产品自己的 freeze，拿它抛的码与投影给的码对表。

`reason` 用的是上线里已有的机器码（`PROFILE_RECOVERY_REQUIRED` / `CREDENTIAL_NOT_FOUND` /
`PROVIDER_MODEL_NOT_FOUND` / `PROVIDER_MODEL_UNUSABLE` / `PROVIDER_MODEL_REFERENCE_MISSING` /
`MODEL_UNAVAILABLE` / `PROFILE_CONFIGURATION_INVALID`），没新造词表。

**没做的事（按单的红线）**：不发明"解除面"。`recovery_pending` 一条**不给 action**——64 个方法里没有能清它的，
"这里你能做什么"的诚实答案是"从 wire 上什么都做不了"（清理解析属审批队列/产品决定）。

## 3 三个实测把本单的假设改掉了（写下来，因为它们比原计划更对）

1. **"没选模型的 Profile" 是 blocked，不是 ready。** 我第一版的门断言它该是 ready；产品纠正了我：
   这个 harness 声明了 `model_control_id`，configuration 里该 control 为空时 freeze 直接抛
   `PROFILE_CONFIGURATION_INVALID`（`service.py:144-147`）⇒ 它**真的**发不出去 ⇒ 投影必须说 blocked
   （`test_a_profile_that_chose_no_model_is_blocked_with_the_accept_reason`）。
2. **凭据要看 kind，不能只看 `exists()`。** 我第一版用 `credentials.exists(id)`；产品那条腿是
   `get(credential_id, kind=descriptor.credential_kind)` ⇒ "有一行但 kind 不对"在 exists 眼里是绿的、
   在 freeze 眼里是 `CREDENTIAL_NOT_FOUND`。投影改成同一种 kind-scoped 查法。
   而且 `server_provider_models.credential_id` 是**真外键**（想直接写一个不存在的 id 会
   `FOREIGN KEY constraint failed`）⇒ 门用"插入一行 kind 不匹配的凭据"来复现现场形态
   （"记录指向一个本机用不了的凭据"），这正好也是第 2 条能咬住的形状。
3. **overall state 的优先级**：blocked 压过 unknown（已知的阻塞比"不知道"更强），
   但**永不**让 unknown 冒成 ready——门按这个说法写（`state != "ready"` + 单条 check 是 unknown）。

## 4 门（`tests/server/test_profiles_list_sendability_117.py`，11 条）

全走真 HTTP（`raise_server_exceptions=False`），G4 单列一条明说这件事。

| Gate | 覆盖 | 反例 |
| --- | --- | --- |
| G1 发前可见 | `test_a_profile_waiting_on_recovery_reads_as_blocked`（`recoveryPending true` + `PROFILE_RECOVERY_REQUIRED` + recovery 这条 check 自己不给 action） | `test_counter_example_the_pre_117_projection_fails_the_same_judgement`：把两个新键摘掉（退回 12 键）⇒ 同一个判定函数必须抛 |
| G2 未知可区分 | `test_an_unreadable_blocker_is_unknown_and_not_ready` | `test_counter_example_reporting_unknown_as_ready_fails_the_gate`：把 `_tri_state` 退回 `bool(row.get(...))` ⇒ "读不到"就冒充 `false`（这条反例故意只证明形状会变，再由 `monkeypatch.undo()` 后复测 `_tri_state({}, ...) is None`）|
| G3 不回归 | `test_existing_keys_are_unchanged_and_only_the_two_new_ones_are_added`：键集合 = 原 12 + 恰好 2，`archived/includeArchived` 语义照旧 | 多一个键/少一个键都红 |
| G5 跑得起来可判定 | `test_a_binding_whose_credential_is_the_wrong_kind_is_blocked_before_sending`、`test_the_projection_names_what_the_freeze_path_would_hit`、`test_a_binding_the_host_can_satisfy_is_ready` | 退回 12 键（G1 的反例同样覆盖：判定函数直接抛）|
| G4 真 wire | `test_the_gate_reads_through_http_and_not_the_implementation` | — |

## 5 前端怎么消费（给桌面聊天线接单的契约面；本树不写前端）

```
profiles.list ⇒ items[i]:
  recoveryPending : true | false | null
  sendability: {
    state   : "ready" | "blocked" | "unknown",
    reason  : <machine code> | null,            # 稳定词表，就是上面那 7 个 + RECOVERY_STATE_UNREADABLE / CONFIGURATION_UNREADABLE
    message : <人话> | null,
    actions : ["provision_the_credential_on_this_host",
               "point_the_model_at_an_available_credential",
               "choose_an_available_model", "choose_a_model"]   # 可能为空 = 本机没有可做的动作
    checks  : [ {key, state, reason, message, actions, credentialId?}, ... ]   # 逐条事实，key 形如 "recovery" / "model:<providerModelId>"
  }
```

建议（不是命令）：
- 灰掉条件 `state != "ready"`；**`unknown` 也要灰**，但文案要说"这台机器还没问出来"，不能说"坏了"。
- 文案取 `sendability.message`（人话，已过截断，不含宿主路径），码取 `sendability.reason`（给用户截图/报障用）。
- 有 `actions` 就把它翻成动作（"给这台机器配好凭据" / "换一个可用模型"）；
  `actions == []` 且 `reason == PROFILE_RECOVERY_REQUIRED` ⇒ 明说"这个状态要等 Server 侧恢复，你在这里做不了什么"——
  别造一个"重试"按钮：409 `PROFILE_RECOVERY_REQUIRED` 不是重试能解决的（QA-009 的原始抱怨正是这句）。
- `checks[]` 是给"多模型槽"用的（一 Profile 多槽那一片在 092/093 的修订 v2 里）：将来一个 Profile 有多个绑定就有多条 `model:*` check，客户端不必改判法。

## 6 代价与已知边界（不藏）

- 每一行 Profile 现在多 **2 次对象读 + 1–2 次 DB 读**（configuration 对象、provider 记录、models 对象、凭据行）。
  `profiles.list` 是每次连接都会读的面 ⇒ 几十条 Profile 量级没感觉，**但没做批量优化**：真要省，
  该把"这个 Profile 的绑定能不能满足"下沉成 profiles 行上的一个派生列（写面在 `server/profiles/**`，runtime 线）
  ⇒ 记进本树 §待开单候选，本单不越界。
- 投影说的是**此刻这台机器**的事实；它不缓存（每次 list 重算）。
- 订阅型（harness 不声明 `credential_kind`、或 provider 记录 `credential_id` 为空）⇒ 这条腿**不判**，
  整体仍是 `ready`/`blocked` 由别的检查决定。理由：freeze 里那句是
  `if descriptor.credential_kind is not None and credential_id is not None` —— 产品自己就不查，跟着它，不自造规则。
- SecretStore 里字节是否真读得到，本单**不**声称（wire 层够不着一个 typed `exists`；公告 107 轮那类"缺席要可见"的口径下，
  这条留作 `unknown` 都不发的保守做法：不看它）。

## 7 计数与终态

```
python3 -m pytest tests/server/test_profiles_list_sendability_117.py \
  tests/server/test_wire_error_family_closure_115.py tests/server/test_wire_error_family_101.py \
  tests/server/test_wire_v1.py tests/server/test_server_capability_contract.py -q
→ 144 passed in 162.14s
```

**Worker 工件：不在**（`workers/agent-box-worker/target/{debug,release}` 未构建，`.acceptance-bundle-c*` 亦无）——
本轮这些腿不读它（`QA-007` 口径要求写明）。全量 `tests/server` / `tests/` 的批末计数记在 `status.md`，标 `待 QA 复算`。

DoD 六项：观测表 §1 · 投影带阻塞事实 + 未知态 §2 · 反例门 §4 · 前端消费说明 §5 · 回归计数 §7 · 账与证据（status 行 + 本报告）。
终态 **`PROFILE_ADMITTABLE_PROJECTION_DONE`**。
