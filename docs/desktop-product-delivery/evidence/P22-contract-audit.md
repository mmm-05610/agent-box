# P22 阶段 1 证据：五处写路径的合同签名与类型化码核对（2026-09-18）

工作树 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1`，基线 `8fc1a807`。
方法签名取自本树合同 `apps/desktop/src/types/wire/wire-v1.ts`（P21 已编入）；
内部码取自后端实现（`/home/maoqh/projects/agent-box-env-provider`，只读），**不是**从 wire-review 转述。

## 0 错误呈现的统一约定（本单新增一个纯函数承载）

后端把内部码收敛到 12 个错误族，精确内部码保留在 `details.internalCode`（`wire/errors.py:4`）。
前端 `WireRemoteError` 已经带 `code`/`message`/`details`（`api/wire-v1-client.ts:46-58`），
但**此前只有工作状态面板一个局部格式化函数**（P21 的 `readFailure`）。本单抽出
`lib/wire-error-text.ts`：`wireErrorText(error)` → `"<FAMILY>: <message>"`，
并在 `details.internalCode` 存在时附 `[<internalCode>]`；非 wire 错误回落 `Error.message`。
五处写面共用它，**不各自造格式**。

## 1 角色页：克隆 + 权限规则

| 方法 | 合同签名（params → result） | 内部码（来源） |
| --- | --- | --- |
| `profiles.clone` | `{requestId, profileId, displayName, harness?}` → `{profile, migration}`；`migration = {targetFamily, sourceFamily, sameFamily, items[{item, migrated, reason, detail?}], permissions:{preset, rules}\|null, reboundAssets[], migratedCount, refusedCount}` | `PROFILE_NOT_FOUND` / `RECORD_VERSION_CONFLICT` / `CREDENTIAL_NOT_FOUND`（`profiles/repository.py`）、`INVALID_REQUEST: the '<harness>' family is not registered`（`wire/handlers.py:1102`） |
| `profiles.setPermissions` | `{requestId, profileId, expectedVersion, preset, rules[{key, pattern\|null, action}]}` → `{profile}` | `PERMISSION_PRESET_UNSUPPORTED` / `PERMISSION_RULE_INVALID` / `PERMISSION_KEY_UNSUPPORTED` / `PERMISSION_ACTION_UNSUPPORTED`（`profiles/permissions.py`）、`RECORD_VERSION_CONFLICT` |

**产品面（本单要做）**：

- 克隆按钮（角色页头部，与重命名/归档并列）→ 对话框（新名 + 可选家族）→ 调 `profiles.clone`
  → **显示逐项迁移报告**（`items[].migrated/reason` 逐条、`migratedCount/refusedCount`、`reboundAssets`）
  → 新角色进入目录（`upsertAgentBoxProfile`）。
- 跨家族克隆被拒时显示类型化原因（如未注册家族），**不改本地目录**。
- 权限规则编辑：预设下拉 + 规则行（key/pattern/action）增删 → `profiles.setPermissions`
  带 `expectedVersion`（CAS）；冲突（`RECORD_VERSION_CONFLICT`）按类型化码显示并重读。
  规则集为空时保存是**合法**的（预设可能不声明显式规则），界面照样能提交。

## 2 资产 hub：绑定/解绑/发布

| 方法 | 合同签名 | 内部码（来源） |
| --- | --- | --- |
| `assets.list` | `{}` → `{assets[AssetView]}` | — |
| `assets.bind` | `{requestId, profileId, assetId, revision?, enabled?}` → `{binding}` | `ASSET_NOT_FOUND` / `ASSET_REVISION_UNKNOWN` / `ASSET_INVALID` / `PROFILE_NOT_FOUND`（`assets/records.py`） |
| `assets.unbind` | `{requestId, profileId, assetId}` → `{unbound:true}` | `ASSET_BINDING_NOT_FOUND`（同上） |
| `assets.publishSkill` | `{requestId, assetId, revision, sourcePath}` → `{asset}` | `SKILL_*`（8 个：`skills.py`） |
| `assets.publishMcp` | `{requestId, assetId, revision, definition}` → `{asset}` | `MCP_*`（6 个：`mcp.py`） |
| `assets.publishPlugin` | `{requestId, assetId, revision, sourcePath}` → `{asset, preview}` | `PLUGIN_*`（5 个：`plugins.py`） |

**产品面**：`product:resources` 从"字段计划"变成真列表（`assets.list` 的 kind/name/latestRevision/digest/source）
+ 每个资产对当前角色**绑定/解绑**（`assets.bindings` 读现状，`assets.bind/unbind` 写）
+ 发布入口（skill/plugin 用**主机路径**，MCP 用定义对象）。发布成功显示 provenance（`asset.source` 与 digest）。
`available:false`（服务说 `UNAVAILABLE: the asset stores are not composed`）⇒ 面**灰显并给原因**，不可提交。

## 3 订阅账号

| 方法 | 合同签名 | 内部码 |
| --- | --- | --- |
| `accounts.list` | `{}` → `{accounts[AccountView]}` | `UNAVAILABLE`（无 SecretStore：`need a platform secret store`） |
| `accounts.create` | `{requestId, harness, accountIdentifier}` → `{account}` | `ACCOUNT_INVALID` / `ACCOUNT_NOT_FOUND`（`accounts/records.py`） |
| `accounts.importAsset` | `{requestId, accountId, sourcePath}` → `{account}` | `ACCOUNT_ASSET_*`（`assets.py`：4 个）+ `the '<harness>' family declares no subscription login-state files` |
| `accounts.bind` | `{requestId, profileId, expectedVersion, accountId\|null}` → `{profile}` | `ACCOUNT_NOT_FOUND` / `RECORD_VERSION_CONFLICT` |

**产品面**：以服务账号为准的列表（`AccountView`：`hasAsset`/`lastVerifiedAt`/`state`，零 locator 零摘要）
+ 录入（harness + identifier）+ 导入登录态（主机路径）+ 绑定到**当前角色**（CAS）。
`UNAVAILABLE` ⇒ 整块灰显并显示服务给的原因（**不画假开关**）。

## 4 hook 管理

| 方法 | 合同签名 | 内部码 |
| --- | --- | --- |
| `hooks.list` | `{requestId, family?}` → `{hooks[HookView]}` | `UNAVAILABLE`（hook 账本未装配） |
| `hooks.create` | `{requestId, family, name, model, source?}` → `{hook}` | `HOOK_MODEL_INVALID` / `HOOK_EVENT_UNSUPPORTED` / `HOOK_HANDLER_UNSUPPORTED` / `HOOK_MATCHER_UNSUPPORTED` / `HOOK_TIMEOUT_INVALID` / `HOOK_FIELD_INVALID` / `HOOK_FAMILY_UNSUPPORTED` / `HOOK_REVISION*`（`hooks/model.py`） |
| `hooks.setEnabled` | `{requestId, hookId, enabled}` → `{hook}` | `HOOK_NOT_EXECUTABLE`（无命令处理器）/ `HOOK_NOT_FOUND` |
| `hooks.delete` | `{requestId, hookId}` → `{deleted, triggersRemoved}` | `HOOK_NOT_FOUND` |
| `hooks.triggers` | `{requestId, hookId?, limit?}` → `{triggers[TriggerView]}` | — |

**产品面**：`product:hooks` 从"逐家说明"变成真列表（`HookView`：family/name/enabled/commands 逐条可见）
+ 启停开关（`hooks.setEnabled`；`HOOK_NOT_EXECUTABLE` 时该开关**不可点**并说明原因）
+ 删除（显式提示会级联删掉触发历史，回执里的 `triggersRemoved` 如实显示）
+ 录入（family + name + event + 一条 command handler）→ 类型化拒绝按码显示
+ 触发历史（`hooks.triggers`，`blocking/effect` 如实呈现）。

## 5 每面的"不可用"行为（G2 的判定表，实现与测试都照此）

### 5.0 先钉一个事实：`server.hello` 的能力表**落后于**它自己的 `_handlers`

```python
# wire/handlers.py:34-62
CAPABILITY_IDS = (... 27 个 id ...)      # 不含 assets.* / hooks.* / accounts.* / profiles.clone|memory|setPermissions
# wire/handlers.py:414-420
for capability_id in CAPABILITY_IDS:     # hello 只报这张静态表
```

⇒ 后端**实现了**这些方法（`_handlers` 里有，P21 已逐条核对），但 `server.hello` **一行都没声明**。
按本树 `wireCapability()` 的既有纪律（"missing row fails closed"），若照能力表门控，本单五处写面会**永久灰显**，
而原因是后端的表陈旧、不是能力缺失。

**本单的取值（写进账，交回调度者转后端补表）**：

- 这些**增量面**不拿 `server.hello` 的能力行做开关；**可观测的门**是三件事：
  ① 服务可达（`$agentBoxService.phase === 'ready'`）；
  ② 该面的**读**成功（`assets.list` / `accounts.list` / `hooks.list` / profile 记录），读回的类型化错误决定"可用性"；
  ③ 每次写的**类型化回执**（被拒就显示码，不改本地状态）。
- 因此"不可用"= 读失败/服务离线 ⇒ 该面灰显 + 原因、**写控件不可提交**；
  而旧服务上真缺方法时会得到 `INVALID_REQUEST: <method> is not a wire/1 method` —— 作为类型化原因如实显示。
- 这条**不是放宽验收**：G2 的反例仍成立（不可用面必须点不出请求，见 §5 表与阶段 4 演练），
  变的只是"谁说了算"——从一张陈旧声明表改成服务对实际调用的回答。

| 面 | 触发条件 | 界面行为 |
| --- | --- | --- |
| 克隆 | 服务离线；或读取角色目录失败 | 按钮**灰显** + `title` 写原因；不可提交 |
| 权限保存 | 同上；或 CAS 冲突 | 同上；冲突按类型化码显示并刷新记录 |
| 资产发布/绑定 | `assets.list`/`bindings` 答 `UNAVAILABLE`（`the asset stores are not composed`）或服务离线 | 区块灰显 + 服务原话；**不**渲染可点控件 |
| 账号 | `accounts.list` 答 `UNAVAILABLE`（无 SecretStore：`need a platform secret store`） | 整块灰显 + 服务原话；录入/导入/绑定全不可提交 |
| hooks | `hooks.list` 答 `UNAVAILABLE`（账本未装配）或服务离线；或单行 `HOOK_NOT_EXECUTABLE` | 视图级灰显 + 原因；单行开关灰显并说明"没有命令处理器" |

**反例（阶段 4 演练）**：把服务置为不可用/读失败，点任何一个写控件都必须**没有请求发出**且界面给出原因
（测试用注入的假 client 断言 `call` 次数为 0）。

