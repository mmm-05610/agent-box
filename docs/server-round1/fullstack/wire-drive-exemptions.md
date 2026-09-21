# wire 驱动豁免册（103）

**当前行数：0。** 这张表是**例外**的登记处，不是缺口的收容所：
只有"这台机器上确实无法用真实 wire 驱动"的方法才进得来，且每行必须给
**理由 / 类型（需真机·需真模型·需外部服务·内部面）/ 复验条件**三格，缺一格即门红
（`tests/server/test_wire_drive_coverage_103.py::test_the_register_explains_every_row_and_hides_nothing_drivable`）。

| 方法 | 理由 | 类型 | 复验条件 |
| --- | --- | --- | --- |

## 为什么是空的（这一句才是这张表的内容）

工单 103 的出发点是"36 个方法从未被驱动"，那是**在 `tests/server/test_wire_v1.py` 一个文件里**量的
（本单一手复算：该文件确实只驱动 **28/64**，与调度者的数字逐字相同）。
把整个 `tests/` 当语料重新扫，103 想要的证据**已经全部存在**：
`assets.*` 在 `test_asset_hubs.py`、`hooks.*` 在 `test_hook_models.py`、`accounts.*` 在 `test_accounts.py`、
`profiles.clone/setPermissions` 在 `test_profile_permissions.py`、`profiles.memory` 在 `test_profile_memory.py`、
`profiles.subagentGrants/revokeSubagent` 在 `test_delegation.py`、`executions.list` 在 `test_execution_inventory.py`、
`workspaces.gitStatus` 在 `test_git_status.py`、`sessions.switchProfile` 在 `test_shared_session_store.py`、
`providerModels.probe*` 在 `test_usage_parsing.py`（loopback 假端点），
而 101 那五条（`usage.*`、`providerArtifacts.*`）**在本批之前确实是零驱动**——
它们现在的证据是 101 自己补的 `test_wire_error_family_101.py`。

⇒ 所以本单**不需要豁免，也不新写覆盖**；它交付的是"这件事从此是断言而不是印象"：
派发表 ⊆ 证据 ∪ 豁免，文档与生成器逐行一致，且**藏起一个文件的证据就必然出现缺口**。

## 如果将来要往这里加一行

按 097 的教训，一条没有复验条件的豁免就是永久的盲区。加行时同时加：
谁来复验（哪张单/哪台机器）、在什么条件下必须回到"有真证据"、以及**为什么不能在本仓造一个假端点**——
`providerModels.probeModels` 就是反例：它曾被认为"要真供应商"，实际用 loopback discard 端口就能类型化驱动。
