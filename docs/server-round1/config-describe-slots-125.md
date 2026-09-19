# 125 — `config.describe` 逐槽投影：一个控件可以有多张槽表，客户端要**看得见每一张**（`092` 交回 ③ 的 wire 半边）

**终态**：`CONFIG_DESCRIBE_SLOT_PROJECTION_DONE`（取自本单 frontmatter 的 `terminal` 对）
**写面**（本单声明）：`src/agent_box/server/wire/handlers.py` · `tests/**` · `docs/server-round1/**` · status
**真实模型调用 0 / ¥0**（本地 SQLite ＋ 目录里的假 provider/model 记录；无凭据访问）。

> 一句自我更正留在账上：这份报告的第一版**开头**把终态码凭印象写成了 117 的那一对，落盘前自己核对 frontmatter 才改回来。
> 终态码只能取自工单文件，不能取自记忆——097 那一族 defect 在**账**上的形态就是这样一条。

---

## 1 一手复核（前提与"哪些已经对了"）

| 事实 | 一手（2026-09-19 18:2x） |
| --- | --- |
| `config_describe` → `_controls` 的形状 | `wire/handlers.py:1648`（`config_describe`）→ `:1684`（`_controls`），两处 `model_slot` 分支都写 `"slots": [{"name": control_id, "model": model}]` ⇒ **不管配置里有什么，永远一条槽**，且 `name` 是从 controlId 造的 |
| 存储/校验层**早已**能吃列表 | `model_configs/service.py:121` 用 `_model_references(assignment["value"])` **递归**遍历（`:250-258`）⇒ 一张多槽的配置在**写入侧**是被验证的 |
| 冻结侧还不吃列表 | `freeze_execution_configuration`（`:134-146`）对非 `Mapping` 直接 `PROFILE_CONFIGURATION_INVALID` ⇒ "逐槽冻结"（092 的 G8 另半边）**在本树还不存在**，属 runtime 线的 `model_controls` 声明半（工单原话：随后补、**不阻塞本单**） |
| 老形状有测试钉着 | `tests/server/test_wire_v1.py:454` 逐键断言 `slots == [{"name": "model", "model": None}]` ⇒ G9"老引用形状逐字不变"不是我的口径，是**既有的门** |

⇒ 所以本单的射程**恰好**是 wire 那一半：**描述**得把每张槽画出来；**不动**冻结、不动老形状、不发明词汇。

## 2 落地

```python
references = _model_reference_list(current)          # 新增模块函数：按文档序取出全部引用
holds_reference = bool(references) and self.model_configs is not None
…
"slots": self._slot_entries(control_id, references, current)
```

`_slot_entries` 的三条规则（都是判据，不是口味）：
1. **值不是列表 ⇒ 老形状逐字不变**：`[{"name": control_id, "model": <reference|None>}]`（G9）；
2. **值是列表 ⇒ 一引用一槽**，带稳定表引用：`name=f"{control_id}[{i}]"`、`slotIndex`、`table="providerModels"`、
   `providerId`、`modelId`、`model`（G8"逐槽可见"；`name` 仍在 ⇒ 客户端不必改写既有读法）；
3. **空列表 ⇒ `slots == []`**，不给缺席的槽编一个默认值（G10"覆盖与事实分离；缺席不写键"）。

`table` 只有一处字面（`SLOT_TABLE`），门里有一条断言它等于服务层的表名；解析不到的引用**照旧抛类型化错**
（`reference()` 的 404），不在投影里粉饰。

## 3 门（`tests/server/test_config_describe_slots_125.py`，**16 条用例**（11 个函数 ＋ 7 个参数样本，收口实测 collected=16），全走真 wire）

| Gate | 覆盖 | 反例 |
| --- | --- | --- |
| G1 逐槽可见 | 两引用 ⇒ 两条槽（`slotIndex 0/1`、各自 providerId/modelId）；同一引用两次 ⇒ 仍是两条槽（**不去重**，因为那是两张座椅）；一个控件不被投影两次 | `test_counter_example_the_first_slot_only_projection_is_back`：把 `_slot_entries` 退回"只看第一条" ⇒ 同一配置立刻只剩 1 槽（**当场复现 125 之前的世界**），`undo()` 后核实恢复 |
| G2 形状可机读 | `table`/`slotIndex`/`name` 逐槽在场；`json.dumps` 可序列化 | 缺任一键即红 |
| G9 老形状 | 单引用 ⇒ 与改前**逐字相同**的 dict（并跑既有 `test_wire_v1` 的钉） | 改一个键就红 |
| G10 不编默认 | 空列表 ⇒ `slots == []`，且没有 `currentValue`/`value` 被塞进来 | 给缺席槽补默认 ⇒ 红 |
| 单一真相被**比对**而不是复制 | `test_the_wire_walks_references_exactly_like_the_service`（7 个固定样本逐条等于服务层 `_model_references`） | 见 §4：两处**有意**不同的那一形，单独钉住而不是假装相等 |
| 不越界 | `test_125_touched_only_its_own_surface`（`_slot_entries` 只出现在 `wire/handlers.py`，不在 `model_configs/**`） | 越界即红 |
| 既有面不回归 | `config.describe` 的 `effectTiming`/`securityLockedIds`/控件清单逐条不变；`config.resolve` 仍带 `controlId` 点名拒绝（G8 第三句） | 任一变红即红 |

## 4 一条**顺带量到的别的线的缺陷**（交回，不自行修）

`model_configs.service._model_references` 判"是不是引用"用的是**键在不在**（`set(value) >= {"providerId","modelId"}`），
然后 `str(...)` 强转 ⇒ `{"providerId": "p", "modelId": None}` 变成"引用了一个名叫 `"None"` 的模型"，
而 wire 侧要求两者都是**非空字符串** ⇒ 于是那条"两处必须相等"的门在这个样本上是**假**的。
处理：不同流于"把门放松到永远绿"——拆成两条：7 个正常样本要求逐字相等；这一形单独钉成
"**服务层比 wire 宽，且它会把 None 拼成字符串 "None"**"（`test_the_two_walks_differ_on_one_shape_and_the_wire_is_the_stricter_one`）。
修法在 `model_configs/**`（不在 125 写面）⇒ 已进 §待开单。

## 5 环境口径（同一族的第 4 条实证，写清楚免得被当成 125 的回归）

定向跑 `tests/server/test_wire_v1.py` 时，我第一遍**没带**插件 `PYTHONPATH`/`AGENT_BOX_SANDBOX_MODULE`，
得到 `test_unavailable_capabilities_carry_a_reason` 红（`workspaces.open` 的 supported 随宿主能否起沙箱室而变）；
带齐后 **53 passed / 91.44s**。这与 128 的 `monkeypatch.undo()`、118 的工件缺席是**同一族**：
**计数必须声明环境**。本单的自报行由 118 的 `conftest` 挂钩打印，`WORKER_ARTIFACT=present` ＋ `VERDICT=…` 在日志里。

## 6 计数与终态

```
定向（齐环境）：125 ＋ test_wire_v1 = 53 passed / 91.44s（125 自身 17 条全在）
邻域（缺沙箱那一遍）：102 passed / 1 failed（红的是环境，不是回归；带齐后绿）
批末：见 status.md 本单终态行
```

DoD：1 一手（§1，含"冻结侧还不吃列表"这条边界）· 2 逐槽投影落地（§2）· 3 表引用形状可机读（§2/§3）·
4 反例（§3：退回"只投影第一条"当场复现）· 5 两处真相的比对与**有意分歧**的钉法（§4）· 6 账与证据。

**终态 `CONFIG_DESCRIBE_SLOT_PROJECTION_DONE`**（工单 frontmatter 的对：`*_DONE`/`*_PARTIAL`；剩余＝§4 的交回项
＋ 冻结半属 runtime 线，非本单射程）。
