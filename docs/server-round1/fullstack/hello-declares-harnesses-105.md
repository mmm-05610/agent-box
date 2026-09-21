# 105 — `server.hello` 声明已注册的 harness 家族（证据）

工单基线 `198490d`；本单在 `2c39f8c`（104 收口后）上执行，是 R-0022 拆分后 **A 线队列第 2 张**。
§1–§4 属**阶段 1（观测）**。凡标 **实测** 为本单一手；**引用** 给出处。

## 1 实测：今天的 `hello` 确实没有这张面（真监听）

形态同 097：`build_runtime()` → `create_app` → `uvicorn.Server` 真 bind `127.0.0.1` 随机端口
→ `urllib` 真发 `POST /wire/v1/server.hello`。这一次注册表里**放了三个家族**（故意打乱顺序注册：
`zeta`、`alpha`、`mido`，其中只给 `alpha` 声明 `credentialKind`/`modelControlId`）：

| 项 | 实测 |
| --- | --- |
| `result` 顶层键 | `['auth', 'capabilities', 'protocolVersion', 'serverId']` ⇒ **没有 `harnesses`** |
| `capabilities` 条数 | **64**（097 的派生完好） |
| `HarnessRegistry.registered()` | `('alpha', 'mido', 'zeta')`——注册顺序是 zeta→alpha→mido ⇒ **顺序被丢弃、按 id 排序** |

⇒ 工单 §Objective 的"wire 上没有任何'这台服务支持哪些 harness'的面"成立；
且 §Scope 要的"稳定排序（按 id）"**注册表本来就给**（`registered()` 的实现是
`tuple(sorted(self._descriptors))`，实测见上），不需要在 handler 里再排一次。

## 2 实测：描述符上**可得**的字段（决定本单最多能声明什么）

`HarnessDescriptor` 是 dataclass，字段与默认值一手读（`dataclasses.fields`）：

| 字段 | 默认 | 本单是否暴露 |
| --- | --- | --- |
| `harness_type` | **必填** | 是 ⇒ 出成 `id` |
| `credential_kind` | `None` | 是（`credentialKind`），**`None` 就不给键** |
| `model_control_id` | `None` | 是（`modelControlId`），同上 |
| `credential_environment` | `None` | **否**（凭据环境是宿主细节，不是目录需要的东西） |
| `capability_claims` / `control_options` | 必填 | **否**（那是能力/控件表，不是家族目录；且 `capabilities` 是方法表，§明确不做 已点名别混） |
| `security_locked_controls` | `()` | **否** |
| **`wire_protocols`** | — | **不存在这个字段** |

⇒ **工单 §Current state 那一行是错的**：它写"描述符已带 `credential_kind`/`model_control_id`/
`wire_protocols`（后者来自 092 修订）"，而 `hasattr(descriptor, "wire_protocols") == False`（实测）。
092 还没落地（R-0022 之后它在 **runtime 线** 的 `c2`），所以 `wireProtocols` 这个键
**今天给不出来**。按工单自己的规则"未知/未声明就不给该键"，本单只暴露
`{id, credentialKind?, modelControlId?}`，**不发明** `wireProtocols`；
092 落地后由那张单在同样的位置补键（登记为交回，见 §5）。

## 3 实测：默认组合注册**零**个家族（G3 的空态就是今天每一次进程内组合的形状）

```
build_runtime(临时根).harnesses.registered() -> ()
```

而真机上的家族来自**部署文档**：`bootstrap/runtime.py:491` 起
`registry = HarnessRegistry()` 后遍历 `value["harnesses"]`，逐条读
`id` / `adapter` / `modelControlId` / `credentialKind`（`runtime.py:492-499`）——
**恰好就是本单要暴露的那两个可选键**（引用，出处给出）。

两条后果：

1. G3 的"`harnesses: []`"不是一条人造用例：本树每一次 `build_runtime()` 都是这个形状；
2. `bootstrap/**` 按 R-0023 属 **runtime 线**，本树**不写** ⇒ 本单只读它来核对键名拼写一致。

## 4 实测：重锁这一步**不在本树能做的范围里**（这是本单的硬约束）

| 事实 | 一手 |
| --- | --- |
| `server.hello#result` 根对象 `additionalProperties: false`，properties 只有那四个键 | 前端**权威工件** `contracts/wire-v1/generated/wire-v1.schema.json`（321,485 B，`sha256:1a3604ee9dd543ee…`，`$protocolVersion="wire/1"`，覆盖 **64** 个方法 / 134 条目） |
| 本树那份是**证据副本**：`docs/server-round1/fullstack/generated/wire-v1.schema.json`（212,653 B，`sha256:a1bd52a4fb684360…`，只覆盖 **33** 方法） | `sha256sum` ＋ `git ls-files` 命中；与工单 102 §Current state 记的两个摘要**逐字相同** |
| 全树（`src/agent_box/**`、`scripts/**`）**没有任何生成 wire 工件的代码** | `grep -rln "json-schema.org/draft-07\|\"\\$schema\""` 只命中 `scripts/server-round1/shared-store-concurrency-gate.py`（无关）；`src/agent_box/server/wire/*.py` 里没有 schema 发射器 |
| 权威是**前端 TS** `apps/desktop/src/types/wire/wire-v1.ts`，工件由它生成 | `docs/server-round1/wire-review.md` 的历次登记（同一对摘要成对出现）；工单 081/P21 的重锁流程 |

⇒ **"重生成工件"这一步在本树没有工具也没有写权**：TS 权威在前端树（本树 `forbidden`）。
历史上（`wire-review.md` 四段登记）流程是**前端提交新权威 → 后端按新工件跑 `AGENT_BOX_WIRE_SCHEMA` 校验 → 两树登记同一对摘要**。
⇒ 本单能做的是：把字段实现好、把门做硬、把"新形状"以**可校验的证据**交出去（含我建议的 `harnesses` 条目 schema 片段），
并如实把 G4 标成**未绿**——不拿"本树改了证据副本"冒充重锁（那份副本本身是 102 的射程）。

## 5 阶段 1 的落点（供阶段 2 起跳）

1. 形状：`harnesses: [{id, credentialKind?, modelControlId?}]`，来源 `self.harnesses.registered()`
   ＋ `self.harnesses.get(id)`（`WireService` 已持有注册表：`handlers.py:282`）。
2. 排序：**沿用注册表的 `sorted()`**，不在 handler 里另立一套顺序（两处排序迟早分叉）。
3. 空态：`[]`，不是省略、不是 500。
4. `wireProtocols` 键**不给**（§2：字段不存在）；092 落地后补，登记成交回而不是现在发明。
5. 不泄漏：只出这三个键 ⇒ 无凭据内容、无路径、无 digest；但**要有一条真断言**（G2），
   因为"只出声明"最容易在下一次加字段时被顺手破掉。

## 6 阶段 2 实施：字段来自注册表，排序沿用注册表

`hello()` 的返回值多出 `harnesses`（`handlers.py`，紧跟在 `auth` 之后）：

```
for harness_id in self.harnesses.registered():
    descriptor = self.harnesses.get(harness_id)
    entry = {"id": harness_id}
    if descriptor.credential_kind is not None:   entry["credentialKind"] = …
    if descriptor.model_control_id is not None:  entry["modelControlId"] = …
```

三条决定与理由：

1. **不在 handler 里再排一次**：`registered()` 已经是 `tuple(sorted(...))`（§1 实测），
   两处排序迟早分叉；顺序的真相只有一个持有者。
2. **`None` 就不给键**：`credentialKind`/`modelControlId` 是"这一家声明了什么"，
   给 `null` 会让客户端把"没声明"和"声明为无"混成一件事（工单 §必须保持不变的"缺席即未知"语义）。
3. **只出三个键**：`credential_environment`（凭据环境）、`control_options`、`capability_claims`、
   `security_locked_controls` 一概不出——它们是实现细节，不是目录；G2 有一条专断言扫这件事。

`WireService` 本来就持有注册表（`self.harnesses`，`handlers.py:282`）⇒ **没有新注入、没有新参数**。

**真机复跑**（uvicorn 真 bind `127.0.0.1:33471`，`urllib` 真发两次）：

```
harnesses: [{"id":"alpha","credentialKind":"api_key","modelControlId":"model"},
            {"id":"mido","credentialKind":"oauth"},
            {"id":"zeta"}]
两次逐字节相同: True
顶层键: ['auth','capabilities','harnesses','protocolVersion','serverId'] | capabilities: 64
```

⇒ 注册顺序 zeta→alpha→mido 出去是 alpha→mido→zeta；只声明了 `credentialKind` 的 `mido` 不带 `modelControlId`；
什么都没声明的 `zeta` 只有 `id`。临时根跑完 `TEMP_ABSENT True`。

## 7 阶段 3/4：门（`tests/server/test_hello_harnesses_105.py`，10 条）

| 用例 | 钉哪道门 | 断言的形状 |
| --- | --- | --- |
| `test_hello_lists_exactly_the_registered_families` | G1 | 条目集合**等于** `runtime.harnesses.registered()`（不是等于一份写死的名单） |
| `test_the_order_is_the_registries_own_and_reproducible` | G1 顺序 | 两次调用的 `json.dumps` 逐字节相同；且**不是**注册顺序（乱序注册是这一条能成立的前提） |
| `test_removing_a_family_from_the_registry_removes_it_from_hello` | **G1 反例**（工单点名的"摘掉一个家族"） | 先建一条引用 `alpha` 的 Profile 记录，再把 `mido` 从注册表摘掉 ⇒ 名单跟着变 ⇒ **同时证明它不是从记录派生的**（派生版会留下 `alpha`、丢不掉 `mido`） |
| `test_a_family_declaring_nothing_shares_only_its_id` | §必须保持不变 | `zeta` 的条目就是 `{"id": "zeta"}`；全表**没有值为 `None` 的键** |
| `test_a_deployment_with_no_families_answers_an_empty_list_not_an_error` | **G3** | `harnesses == []`、200、`capabilities` 仍 64 条（§3 的默认形状） |
| `test_the_family_list_publishes_declarations_and_nothing_else` | **G2** | 键集 ⊆ `{id, credentialKind, modelControlId}`；整段 JSON 小写后扫 `credentialenvironment`/`adapter`/`controloptions`/`capabilityclaims`/`securitylockedcontrols`/`sha256`/`digest`/`c:\`/`/home/`/`/mnt/`/`.agentbox`/`token`/`secret` **一个都不许出现** |
| `test_harness_ids_do_not_leak_into_the_capability_table` | §明确不做 ① | 家族 id 集合 ∩ `capabilities` 的 id 集合 `== ∅` |
| `test_wire_protocols_is_not_published_because_the_descriptor_has_no_such_field` | 阶段 1 §2 的**钉子** | `dataclasses.fields(HarnessDescriptor)` 里没有 `wire_protocols` **且**响应里没有 `wireProtocols` ⇒ 092 落地加字段时这条会红，逼一次**有意的**修改而不是顺手 |
| `test_the_locked_wire_artifact_still_refuses_the_new_key` | **G4 的现状**（见 §8） | 拿本树那份已锁工件校验真响应 ⇒ `jsonschema` 必须抛错且消息里有 `harnesses` |
| `test_the_four_old_fields_are_exactly_unchanged` | 回归 | 顶层键集合恰为旧四件＋`harnesses`；`protocolVersion`/`auth` 逐字不变；`capabilities` 每行仍是 `{id, supported}`（不支持才多 `reason`），条数==派发表长度（097 的不变量） |

**反例是真跑的**：门文件拿去咬 `f9bc012` 的 `handlers.py`（`/tmp` 副本，`PYTHONPATH` 排前，工作树未动，
跑完 `rm -rf` 并核实缺席）⇒ **10 failed / 0 passed**。连"工件仍拒绝新键"那条也红：
旧码没有 `harnesses` ⇒ 响应**恰好通过**旧工件的校验，`pytest.raises` 落空。
这条恰好说明 G4 的两半是一件事：**字段存在**与**工件放行**必须一起成立，任一半单独绿都不算绿。

定向回归（`test_hello_capability_sync_097 ＋ test_provenance_wire_098 ＋ test_wire_v1 ＋ 本文件`）
⇒ **65 passed**（7＋11＋37＋10），hello 的既有消费者一个没掉。

## 8 阶段 3（合同）：这一半本树做不了，交出去的是可校验的东西

**为什么做不了**（一手，§4 已给出处）：`server.hello#result` 的权威是**前端树的 TS**，
生成的 JSON 工件由它导出；本树既没有生成器（全树 grep 命中为零），也不能写前端树（工单 `forbidden` 与本树章程）。
按 `wire-review.md` 的四段先例，流程本来就是"前端提交新权威 → 后端用新工件跑 `AGENT_BOX_WIRE_SCHEMA` 校验 → 两树登记同一对摘要"。

**当前这一对的摘要**（本单一手 `sha256sum`，不是引用）：

| 工件 | sha256 |
| --- | --- |
| 前端 TS 权威 `apps/desktop/src/types/wire/wire-v1.ts` | `1019b38b069899137440f22f0e8cebedefb7b13b8e95784651b96189ad977556` |
| 前端生成工件 `docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json`（64 方法 / 134 条目） | `1a3604ee9dd543eedacc4be33af8e87b44f8ed3aaa7d395484c28973b6d8e5be` |
| 本树证据副本 `docs/server-round1/fullstack/generated/wire-v1.schema.json`（33 方法，未动） | `a1bd52a4fb68436079ae2d2e439953e8ac7f345ab5934a936a9434952bee0729` |

**给前端的按键**（`server.hello#result.properties` 增加，其余一字不改；`required` 里加 `harnesses`，
因为空态是 `[]` 而不是省略——这一条由 §7 的 G3 用例钉住）：

```json
"harnesses": {
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {"type": "string", "minLength": 1},
      "credentialKind": {"type": "string", "minLength": 1},
      "modelControlId": {"type": "string", "minLength": 1}
    },
    "required": ["id"],
    "additionalProperties": false
  }
}
```

`credentialKind` **故意不收枚举**：枚举词汇属各家声明（092 的射程），今天收进来就等于
本单替 092 决定词汇——那是 §5 第 4 条要避免的那类"顺手"。

**顺带照亮 102 的一条**：权威工件（`1a3604ee…`）的 `providerModels.update#params`
**同样没有** `provenance`（本单一手读键集）⇒ 098 §9.2 发现的漂移**不是本树副本独有的陈旧**，
两边一致地缺这一条。

## 9 计数与账

| 项 | 结果 |
| --- | --- |
| 门文件 | `10 passed in 3.91s`；旧码对照 **`10 failed`**（§7） |
| `tests/server -q` | **697 passed in 269.87s**（**697 = 687 ＋ 本单 10**，一条未掉） |
| `tests/ -q` | **997 passed in 289.77s**（**997 = 987 ＋ 本单 10**；本轮无并发全量，用时也比前两轮短，与 104 §11 的负载观察一致） |
| hello 的既有消费者组合跑 | `097 ＋ 098 ＋ test_wire_v1 ＋ 105` ⇒ **65 passed** |
| `validate_order.py --strict` | 30 OK / 31 FAIL（FAIL 恰为 37…67） |
| `git diff --check` | 干净 |

**费用**：真实模型调用 **0 次 / ¥0**（只发本地发现方法；凭据 locator 未访问）。
**清理**：真监听的一次性数据根 `real105-` 跑后 `TEMP_ABSENT True`；
咬旧码的 `/tmp/105-oldcode` 跑后核实缺席；假注册表是进程内对象，无落盘。

## 10 终局判定与交回

**本单判 `HELLO_HARNESSES_PARTIAL`**，剩余只有 G4 一半，且**为什么剩**写清楚了：
字段、排序、空态、不泄漏、反例、真机响应都已绿；重锁要做的是**前端树的 TS 权威 ＋ 由它导出的工件**，
本树既无生成器（§4 的 grep）也无写权（工单 `forbidden`、R-0023 的线切分）。
交出去的是：§8 的**可直接采纳的 schema 片段**、当前三个摘要（TS 权威 / 前端工件 / 本树副本），
以及一条会自己找上门的门——`test_the_locked_wire_artifact_still_refuses_the_new_key`
现在要求"工件必须拒绝新键"，重锁落地后它变红，**改成正向校验这一步就是重锁完成的凭据**。

**交回**：

1. **给调度者/前端**：`server.hello#result` 增 `harnesses`（§8 片段，`required: ["harnesses"]`、
   条目 `required: ["id"]`、`additionalProperties: false`）。前端 P39 的 harness 目录可以按这个渲染。
   顺带：权威工件的 `providerModels.update#params` 缺 `provenance`（§8 末），与 098 的发现同源 ⇒ 一次重锁两件事一起做。
2. **给 092（runtime 线）**：`wireProtocols` 今天**不是**"选择不暴露"，是**字段不存在**（§2 实测）。
   092 加上之后，105 的钉子用例（`test_wire_protocols_is_not_published_…`）会红，
   那一次红就是"把键集补进 hello"的入口，别顺手删测试。
3. **给 103**：`harnesses` 是 hello 的第二个面，元门如果要按方法粒度算，
   应把"发现面的字段级覆盖"记在 `server.hello` 上（本单的 10 条已经是字段级）。

## 12 更正与升级：重锁到达（`ed6592b7`），G4 变绿 ⇒ 终态改判 **DONE**

§9/§10 写下之后，桌面 settings 线把合同那一半做了（`ed6592b7`，2026-09-19 11:44：
`wire-v1.ts` ＋14 行、测试 ＋35 行、生成工件 ＋21 行、`contracts/wire-v1/README.md` 同步）。
本节是**就地更正**，不删旧文：PARTIAL 的判定在当时是唯一诚实的答案（那一刻工件里确实没有 `harnesses`，
本树也确实没有生成器），世界变了就把判定改掉并留下痕迹。

**一手核对**（不是采信公告文字）：从**对方提交的那个 commit** 里取出工件（`git show ed6592b7:…/wire-v1.schema.json`）——

| 项 | 实测 |
| --- | --- |
| `hello#result.properties` | `['auth','capabilities','harnesses','protocolVersion','serverId']` ⇒ **有 `harnesses`** |
| `items` | `{id, credentialKind?, modelControlId?}`、`required: ["id"]`、`additionalProperties: false` ⇒ 与本单发射的形状**逐键相同** |
| 工件摘要 | `c4255b31dba1ab2c92b57ae668f00eee8c11d17f1a6f0f37a22fba766d2c8c4d` |
| TS 权威摘要（同一 commit） | `58d61ebb359381b652a4e687d6e652a8322e726714ea28a9592912b87f8b091b` |

**两处分歧，都按对方为准**：
① 我 §8 建议把 `harnesses` 写进 `required`，锁下来的版本**没有**（只在 properties 里）⇒ 服务端无论如何都发这个键，
所以行为一致，但**合同不强制**它——这件事记在这里，将来若有人删掉该键，锁不会拦住，只有本单的门会（`test_the_four_old_fields_are_exactly_unchanged` 钉着顶层键集合）。
② `credentialKind` 在锁里是**裸 `{"type": "string"}`**，没收枚举 ⇒ 与 §8 的"故意不收枚举"一致。

**本树做了什么**：把那份重锁后的工件**原样**放进本树的证据副本路径
`docs/server-round1/fullstack/generated/wire-v1.schema.json`（覆盖此前 33 方法的陈旧副本），
门里再**按摘要钉住**它（`hashlib.sha256(ARTIFACT) == ARTIFACT_SHA256`），
于是"两棵树说的是同一份工件"是断言而不是口头承诺。
被覆盖的旧副本（`a1bd52a4fb68…`）的摘要与它比锁当时缺什么，都留在 §4 的表里可查。

**门随之翻转**（这正是 §10 预告的那一步）：
`test_the_locked_wire_artifact_still_refuses_the_new_key`（要求工件**拒绝**新键）
→ 拆成两条：
`test_the_relocked_artifact_accepts_what_the_server_emits`（正向：摘要对得上 **且** 真响应过 schema）
＋ `test_the_locked_shape_still_refuses_what_must_not_be_sent`（三条篡改反例：
多一个 `credentialEnvironment` 键、把 `credentialKind` 写成 `null`、去掉 `id` ⇒ 都必须被 schema 拒）。
**没有把反例删掉**，只是把它从"合同还没宽"换成"合同宽了但仍是笼子"。

**复跑**（`AGENT_BOX_WIRE_SCHEMA=` 指向这份重锁工件）：

| 跑法 | 结果 |
| --- | --- |
| 本单门文件 | `13 passed`（默认模式同一数字） |
| `tests/server/test_wire_v1.py` | **37 passed** ⇒ 既有 wire 全套对**新锁**仍然一致（081/21 那套"后端按新工件复跑"的登记动作，本单补上了） |

**终态改判：`HELLO_HARNESSES_DONE`**。§10 列的三条交回里，第 1 条（重锁）已完成；
第 2 条（092 落地后补 `wireProtocols`）与第 3 条（103 的字段级覆盖）仍然有效。
