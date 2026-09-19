# wire 驱动覆盖账（103）— 每个登记方法都要被真实 wire 驱动过一次

**这份表是生成的，不是手写的。** 重跑（唯一作者）：

```bash
python3 scripts/server-round1/wire_drive_coverage.py --markdown
python3 scripts/server-round1/wire_drive_coverage.py            # 计数与缺口
python3 scripts/server-round1/wire_drive_coverage.py --check     # 有缺口即非零退出
```

门在 `tests/server/test_wire_drive_coverage_103.py`：它比对派发表与"证据 ∪ 豁免"的差集、
**逐行核对本文与生成器一致**（方法集合、每条的引用行、条数列），并带着
"把某个文件的证据藏掉 ⇒ 缺口必须出现"的反例。手抄一份账正是 097 那张能力表落后 37 条的方式。

判"驱动"的规则（工具里那条，写在这是为了让读账的人知道它不宽）：
一行的**调用位置**上出现该方法名（`ok("m", …)` / `call("m", …)` / `_wire(…,"m", …)` /
`client.post("/wire/v1/m" …)`），且该文件本身含 `/wire/v1/`。
**数据字面量里出现名字不算**——097 的 37 名元组、101 的 `FIVE_METHODS` 与 `PARAMS` 表都是一行字符串，
它们不驱动任何东西（门里有一条用例专门钉住这一点）。

| 项 | 值 |
| --- | --- |
| 派发表方法数 | **64** |
| 有真实 wire 驱动证据 | **64** |
| 豁免 | **0** |
| 无证据（差集） | **0** |
| 证据行数合计 | 367（含 117/123/128/129/145/125/147 的新门；分布仍很偏）|
| 只被**一个文件**驱动的方法 | **40** 个，列在下面当观察名单 |

## 观察名单（单源证据：删掉那一个文件，该方法即成缺口）

这些不是缺口，是**脆**。101 那五条（`usage.*`、`providerArtifacts.*`）此前是零驱动、今天仍是
**只有一处驱动**：115 的门也发这五个方法，但它把方法名放在 `FIVE_METHODS` 常量里再传变量，
按本页那条规则（"数据字面量里出现名字不算驱动"）**不给它们添第二处证据**——这条不是疏漏，
正是这条规则存在的原因：换名字的改动不该悄悄把覆盖变绿。

* `accounts.bind` → `tests/server/test_accounts.py`
* `assets.bind` → `tests/server/test_asset_hubs.py`
* `assets.bindings` → `tests/server/test_asset_hubs.py`
* `assets.catalog` → `tests/server/test_asset_hubs.py`
* `assets.installFromCatalog` → `tests/server/test_asset_hubs.py`
* `assets.list` → `tests/server/test_asset_hubs.py`
* `assets.probe` → `tests/server/test_asset_hubs.py`
* `assets.publishMcp` → `tests/server/test_asset_hubs.py`
* `assets.publishPlugin` → `tests/server/test_asset_hubs.py`
* `assets.publishSkill` → `tests/server/test_asset_hubs.py`
* `assets.unbind` → `tests/server/test_asset_hubs.py`
* `config.describe` → `tests/server/test_wire_v1.py`
* `config.resolve` → `tests/server/test_wire_v1.py`
* `hooks.create` → `tests/server/test_hook_models.py`
* `hooks.delete` → `tests/server/test_hook_models.py`
* `hooks.list` → `tests/server/test_hook_models.py`
* `hooks.setEnabled` → `tests/server/test_hook_models.py`
* `hooks.triggers` → `tests/server/test_hook_models.py`
* `hooks.update` → `tests/server/test_hook_models.py`
* `profiles.archive` → `tests/server/test_wire_v1.py`
* `profiles.clone` → `tests/server/test_profile_permissions.py`
* `profiles.memory` → `tests/server/test_profile_memory.py`
* `profiles.revokeSubagent` → `tests/server/test_delegation.py`
* `profiles.setPermissions` → `tests/server/test_profile_permissions.py`
* `profiles.subagentGrants` → `tests/server/test_delegation.py`
* `profiles.update` → `tests/server/test_wire_v1.py`
* `providerArtifacts.install` → `tests/server/test_wire_error_family_101.py`
* `providerArtifacts.rollback` → `tests/server/test_wire_error_family_101.py`
* `providerModels.archive` → `tests/server/test_wire_v1.py`
* `providerModels.probeConnection` → `tests/server/test_usage_parsing.py`
* `queue.get` → `tests/server/test_wire_v1.py`
* `queue.withdraw` → `tests/server/test_wire_v1.py`
* `sendOutcome.query` → `tests/server/test_wire_v1.py`
* `sessions.archive` → `tests/server/test_wire_v1.py`
* `sessions.update` → `tests/server/test_wire_v1.py`
* `usage.aggregate` → `tests/server/test_wire_error_family_101.py`
* `usage.export` → `tests/server/test_wire_error_family_101.py`
* `workspaces.archive` → `tests/server/test_wire_v1.py`
* `workspaces.browse` → `tests/server/test_wire_v1.py`
* `workspaces.list` → `tests/server/test_wire_v1.py`
## 逐方法（按名字排序）

| 方法 | 驱动证据（第一条） | 证据行数 |
| --- | --- | --- |
| `accounts.bind` | `tests/server/test_accounts.py:372` — `bound = call("accounts.bind", {` | 1 |
| `accounts.create` | `tests/server/test_accounts.py:351` — `created = call("accounts.create", {` | 7 |
| `accounts.importAsset` | `tests/server/test_accounts.py:358` — `imported = call("accounts.importAsset", {` | 14 |
| `accounts.list` | `tests/server/test_accounts.py:378` — `listed = call("accounts.list", {})["result"]["accounts"]` | 2 |
| `approvals.decide` | `tests/server/test_harness_sidecar.py:1319` — `decided = client.post("/wire/v1/approvals.decide", headers=headers, js` | 8 |
| `assets.bind` | `tests/server/test_asset_hubs.py:489` — `bound = call("assets.bind", {` | 2 |
| `assets.bindings` | `tests/server/test_asset_hubs.py:494` — `bindings = call("assets.bindings", {` | 2 |
| `assets.catalog` | `tests/server/test_asset_hubs.py:544` — `refreshed = call("assets.catalog", {"sourceId": "community"})["result"` | 2 |
| `assets.installFromCatalog` | `tests/server/test_asset_hubs.py:540` — `installed = call("assets.installFromCatalog", {` | 1 |
| `assets.list` | `tests/server/test_asset_hubs.py:486` — `listing = call("assets.list", {})["result"]["assets"]` | 3 |
| `assets.probe` | `tests/server/test_asset_hubs.py:558` — `probe = call("assets.probe", {` | 2 |
| `assets.publishMcp` | `tests/server/test_asset_hubs.py:479` — `mcp = call("assets.publishMcp", {` | 2 |
| `assets.publishPlugin` | `tests/server/test_asset_hubs.py:793` — `response = client.post("/wire/v1/assets.publishPlugin", headers={` | 2 |
| `assets.publishSkill` | `tests/server/test_asset_hubs.py:472` — `skill = call("assets.publishSkill", {` | 1 |
| `assets.syncCatalog` | `tests/server/test_asset_hubs.py:532` — `catalog = call("assets.syncCatalog", {` | 8 |
| `assets.unbind` | `tests/server/test_asset_hubs.py:511` — `unbound = call("assets.unbind", {` | 1 |
| `config.describe` | `tests/server/test_wire_v1.py:448` — `descriptor = api.ok("config.describe", {` | 5 |
| `config.resolve` | `tests/server/test_wire_v1.py:587` — `resolved = api.ok("config.resolve", {` | 3 |
| `executions.list` | `tests/server/test_execution_inventory.py:128` — `result = client.post("/wire/v1/executions.list", headers={` | 6 |
| `history.snapshot` | `tests/server/test_harness_sidecar.py:2209` — `frames = _wire_post(client, runtime.token, "history.snapshot", {` | 28 |
| `hooks.create` | `tests/server/test_hook_models.py:235` — `created = call("hooks.create", {` | 2 |
| `hooks.delete` | `tests/server/test_hook_models.py:273` — `removed = call("hooks.delete", {` | 1 |
| `hooks.list` | `tests/server/test_hook_models.py:261` — `listed = call("hooks.list", {"requestId": "hook-list-1"})["result"]["h` | 1 |
| `hooks.setEnabled` | `tests/server/test_hook_models.py:257` — `enabled = call("hooks.setEnabled", {` | 1 |
| `hooks.triggers` | `tests/server/test_hook_models.py:268` — `triggers = call("hooks.triggers", {` | 1 |
| `hooks.update` | `tests/server/test_hook_models.py:250` — `illegal = call("hooks.update", {` | 1 |
| `profiles.archive` | `tests/server/test_wire_v1.py:561` — `archived_profile = api.ok("profiles.archive", {` | 1 |
| `profiles.clone` | `tests/server/test_profile_permissions.py:345` — `cloned = client.post("/wire/v1/profiles.clone", headers={` | 6 |
| `profiles.create` | `tests/server/test_asset_surface_refusals_147.py:203` — `profile = api.ok("profiles.create", {` | 9 |
| `profiles.grantSubagent` | `tests/server/test_delegation.py:402` — `granted = call("profiles.grantSubagent", {` | 3 |
| `profiles.list` | `tests/server/test_asset_surface_refusals_147.py:220` — `listed = api.ok("profiles.list", {"includeArchived": False})` | 12 |
| `profiles.memory` | `tests/server/test_profile_memory.py:93` — `before = call("profiles.memory", {` | 3 |
| `profiles.revokeSubagent` | `tests/server/test_delegation.py:419` — `revoked = call("profiles.revokeSubagent", {` | 1 |
| `profiles.setPermissions` | `tests/server/test_profile_permissions.py:430` — `written = client.post("/wire/v1/profiles.setPermissions", headers={` | 4 |
| `profiles.subagentGrants` | `tests/server/test_delegation.py:399` — `empty = call("profiles.subagentGrants", {"profileId": parent["profile_` | 4 |
| `profiles.update` | `tests/server/test_wire_v1.py:521` — `renamed = api.ok("profiles.update", {` | 2 |
| `profiles.updateConfig` | `tests/server/test_asset_surface_refusals_147.py:206` — `api.ok("profiles.updateConfig", {` | 6 |
| `providerArtifacts.install` | `tests/server/test_wire_error_family_101.py:146` — `response = post(client, headers, "providerArtifacts.install",` | 4 |
| `providerArtifacts.list` | `tests/server/test_wire_error_family_101.py:78` — `artifacts = post(client, headers, "providerArtifacts.list",` | 11 |
| `providerArtifacts.rollback` | `tests/server/test_wire_error_family_101.py:132` — `response = post(client, headers, "providerArtifacts.rollback",` | 2 |
| `providerModels.archive` | `tests/server/test_wire_v1.py:554` — `referenced = api.err("providerModels.archive", {` | 2 |
| `providerModels.create` | `tests/server/test_asset_surface_refusals_147.py:196` — `created = api.ok("providerModels.create", {` | 9 |
| `providerModels.list` | `tests/server/test_provenance_wire_098.py:87` — `listed = api.ok("providerModels.list", {"includeArchived": False})` | 2 |
| `providerModels.probeConnection` | `tests/server/test_usage_parsing.py:700` — `checked = wire("providerModels.probeConnection", {` | 3 |
| `providerModels.probeModels` | `tests/server/test_provenance_wire_098.py:144` — `status, body = api.call("providerModels.probeModels", {` | 2 |
| `providerModels.update` | `tests/server/test_harness_sidecar.py:1206` — `updated = _wire_post(client, runtime.token, "providerModels.update", {` | 3 |
| `queue.get` | `tests/server/test_wire_v1.py:742` — `queue = api.ok("queue.get", {"sessionId": session_id})` | 3 |
| `queue.withdraw` | `tests/server/test_wire_v1.py:752` — `stale = api.err("queue.withdraw", {` | 2 |
| `runs.stop` | `tests/server/test_harness_sidecar.py:676` — `stopped = client.post("/wire/v1/runs.stop", headers=headers, json={` | 5 |
| `sendOutcome.query` | `tests/server/test_wire_v1.py:799` — `assert api.ok("sendOutcome.query", {"requestId": "never-sent"}) == {"o` | 2 |
| `server.hello` | `tests/server/test_hello_harnesses_105.py:65` — `response = self.client.post("/wire/v1/server.hello", headers=self.head` | 14 |
| `sessions.archive` | `tests/server/test_wire_v1.py:953` — `archived = api.ok("sessions.archive", {` | 1 |
| `sessions.createAndSend` | `tests/server/test_accounts.py:254` — `sent = client.post("/wire/v1/sessions.createAndSend", headers={` | 50 |
| `sessions.list` | `tests/server/test_profile_permissions.py:187` — `listed = client.post("/wire/v1/sessions.list", headers={` | 9 |
| `sessions.send` | `tests/server/test_asset_hubs.py:386` — `refused = client.post("/wire/v1/sessions.send", headers={` | 15 |
| `sessions.switchProfile` | `tests/server/test_shared_session_store.py:443` — `switched = _wire(client, token, "sessions.switchProfile", {` | 6 |
| `sessions.update` | `tests/server/test_wire_v1.py:922` — `renamed = api.ok("sessions.update", {` | 3 |
| `usage.aggregate` | `tests/server/test_wire_error_family_101.py:77` — `usage = post(client, headers, "usage.aggregate", PARAMS["usage.aggrega` | 2 |
| `usage.export` | `tests/server/test_wire_error_family_101.py:117` — `exported = post(client, headers, "usage.export", {"sessions": []}).jso` | 1 |
| `workspaces.archive` | `tests/server/test_wire_v1.py:396` — `archived = api.ok("workspaces.archive", {` | 2 |
| `workspaces.browse` | `tests/server/test_wire_v1.py:291` — `invalid = api.client.post("/wire/v1/workspaces.browse", headers=api.he` | 4 |
| `workspaces.gitStatus` | `tests/server/test_git_status.py:143` — `result = client.post("/wire/v1/workspaces.gitStatus", headers={` | 6 |
| `workspaces.list` | `tests/server/test_wire_v1.py:278` — `"jsonrpc": "2.0", "id": "1", "method": "workspaces.list", "params": {}` | 3 |
| `workspaces.open` | `tests/server/test_accounts.py:248` — `opened = client.post("/wire/v1/workspaces.open", headers={` | 43 |

## 这张表**没有**说明什么

* 它说"至少有一条测试把这个名字发到 `/wire/v1/`"，**不说**断言强度——
  101 的五个方法当年若有一条"发出去、拿回 500 也算通了"的用例，这里同样会是绿的；
  真正咬住那件事的是 101/103 各自的门，不是这张表。
* 它不覆盖**事件流**与 SSE 面（`/events` 不在这 64 个方法里）。
* 它不按组合分账（哪些方法只在注入某服务时才有意义）——那是 §Spend 与各单的门负责的事。
