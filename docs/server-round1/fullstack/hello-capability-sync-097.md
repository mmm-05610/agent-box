# 097 — `server.hello` 的能力表与派发表对齐（证据）

基线 `169685a`。§1–§3 是**阶段 1（观测）**，§4 是阶段 2 的两个显式决定，
§5–§7 属阶段 3（门与反例），§8 属阶段 4（真机复跑与账）。
凡标 **实测** 的都是本单一手跑出来的；**引用** 的给了出处；没有一处拿推断冒充观测。

## 1 实测：一次真 hello 与派发表的差集

观测形态 = **真 Server 真监听**（不是 `TestClient`）：`build_runtime()` 组一份真运行时 →
`create_app(runtime)` → `uvicorn` 线程真 bind `127.0.0.1` 随机端口 → 用 `urllib` 发
Validation 里那条 `POST /wire/v1/server.hello`（`Authorization: Bearer <runtime.token>`，
`params.clientVersions=["0.17.2"]`、`clientPresentationSupports=["text"]`）。
派发表侧读的是同一个进程里 `WireService._handlers` 的键（`handlers.py:317`）——
"服务端真实存在哪些方法"这句话的主语就是这张表，没有第二个候选。

| 项 | 实测值 | 与工单 §Current state 的对照 |
| --- | --- | --- |
| hello 声明的方法数 | **27**（无重复） | 一致 |
| `CAPABILITY_IDS` 常量长度 | **27**（`handlers.py:34`） | 一致——表就是这常量逐条遍历出来的（`def hello` 在 `:405`，循环在 `:415`） |
| 派发表 `_handlers` 键数 | **64**（无重复） | 一致 |
| **差集（派发有、hello 没声明）** | **37** | 一致，且**逐条同名**（见 §2） |
| **反方向差集（hello 声明、派发不出）** | **0** | 一致 |
| `protocolVersion` | `wire/1` | — |
| `auth` | `{"required": true, "schemes": ["session_token"]}` | 本单必须保持不变 |
| 响应顶层键 | `auth` / `capabilities` / `protocolVersion` / `serverId` | 形状不变 |
| 条目形状 | `{"id", "supported"}`，`supported=false` 时才带 `reason` | 形状不变（`hello()` 里就是这个条件式） |

## 2 实测：那 37 个方法（逐条，按名字排序）

`accounts.bind` `accounts.create` `accounts.importAsset` `accounts.list` ·
`assets.bind` `assets.bindings` `assets.catalog` `assets.installFromCatalog` `assets.list`
`assets.probe` `assets.publishMcp` `assets.publishPlugin` `assets.publishSkill`
`assets.syncCatalog` `assets.unbind` · `executions.list` ·
`hooks.create` `hooks.delete` `hooks.list` `hooks.setEnabled` `hooks.triggers` `hooks.update` ·
`profiles.clone` `profiles.grantSubagent` `profiles.memory` `profiles.revokeSubagent`
`profiles.setPermissions` `profiles.subagentGrants` ·
`providerArtifacts.install` `providerArtifacts.list` `providerArtifacts.rollback` ·
**`providerModels.probeConnection` `providerModels.probeModels`** · `server.hello` ·
`usage.aggregate` `usage.export` · `workspaces.gitStatus`

**37 = 4 + 11 + 1 + 6 + 6 + 3 + 2 + 1 + 2 + 1**，与工单 §Current state 那条差集**同名同数**，
不是"我复算了一遍工单"，是两边各自从真响应/真源码独立得到同一个集合。

## 3 实测：工单没写、但直接影响 G2/G3 的两条

1. **本次这 27 条里有 11 条是 `supported: false`**，reason 只有两种：
   四个 `workspaces.*` ⇒ `LOCAL_SANDBOX_UNAVAILABLE`，六个 `sessions.*` 加 `sendOutcome.query`
   ⇒ `EXECUTION_CAPABILITY_UNAVAILABLE`。这就是 G3 要比对的**同一部署基线**：
   `build_runtime()` 默认 `execution=None`（其 docstring 明写"生产默认保持 None，好让能力回答诚实"），
   所以这 11 条的 false + 文案必须**逐字**不变——它们是真话，不是陈旧表的产物。
   **推论（写下来是为了让阶段 3 的门不骗自己）**：新声明的 37 条走 `_capability()` 的
   `return True, None` 兜底或 `profiles.`/`providerModels.` 前缀分支 ⇒ **一律 `supported: true`**。
   于是"表变长"这件事在这份部署里**只增加真话**，不会把 37 个假 `true` 混进来——
   除非某个新族自己该有 blocker 判定，那是**另一件事**，本单不发明（见 §7 未做）。
2. **命名空间隔离的用例读的是源码、不是这张表**：`tests/server/test_capability_namespace_boundary.py:72-76`
   用正则从 `handlers.py` 文本里抽 `"a.b"` 形式的 id，断言与 Work Core 操作、与
   `caps.CANONICAL_CAPABILITY_IDS` **两两不相交**。它覆盖的是**全部 64 条**，
   所以本单把 37 条补进 hello 表**不会**把第三套词汇混进前两套——但这条断言的**存在**要在阶段 3 点名，
   否则"发散门"会看起来像唯一的一道防线。

## 4 阶段 2 的两个显式决定（工单要求写明理由）

* **`server.hello` 自身声明为能力条目**（差集里唯一一条"用来读这张表的方法"）。理由：
  这张表是**服务端事实**的清单，而"我没有 hello"是假话——客户端正是靠它才拿到这张表；
  把它摘掉等于"发现入口对自己隐身"，而工单 §Scope 的建议与此一致。
  反例可跑：若哪天有人把 `server.hello` 从派发表删掉，表必须跟着少一条（集合相等门 ⇒ 红）。
* **派生顺序 = 派发表的字面插入序**（`_handlers` 是 dict，Python 保序），不是字母序。
  理由：今天这份手工常量**本来就按族分组**（workspaces → profiles → providerModels → config →
  sessions → queue → runs → approvals），字母序会把一个良性事实（表变全）伪装成一次
  顺序大改，而工单 §"必须保持不变" 点名的正是**顺序稳定性（客户端可缓存）**。
  字母序的"稳定"和插入序的"稳定"都满足"两次调用逐字节相同"；插入序还额外满足"与今天同族相邻"。
  门的断言是**集合相等 + 无重复 + 两次调用逐字节相同**，不锁具体顺序（现有 wire 用例全部用
  `{item["id"] for …}` 取集合，锁顺序反而会与它们冲突）。

## 5 阶段 3 的门怎么落

| 门 | 落成什么断言 | 反例（必须咬） |
| --- | --- | --- |
| G1 集合相等 | `set(capabilities[].id) == set(_handlers)`，且 `len(list) == len(set)`（无重复），且两次 `hello()` 的 id 序列**逐字节相同** | 从派发表摘一条 ⇒ hello 少一项即红；**加一条不更表**同样红——因为表是从它派生的，所以反例只能是"绕过派生"（把 `CAPABILITY_IDS` 常量留在原地不用），这才是"以后不会再悄悄落后"的真含义 |
| G2 试用可见 | `providerModels.probeModels` / `probeConnection` 出现在表里，且在该部署（模型配置服务就绪）下 `supported: true` | 仍缺这两项 ⇒ 红 |
| G3 语义不回归 | **同一份部署**上，`workspaces.*` 四条与 `sessions.*`+`sendOutcome.query` 七条的 `supported=false` 与 `reason` **逐字**等于 §1 实测值 | 改任一 reason 文案 ⇒ 红 |
| G4 回归 | `tests/server -q`、根套件计数入账 | 任一项红 ⇒ 本单不收 |

`_capability("未知 id")` 的兜底（`True, None`）按工单要求**钉住但不改**：它现在不再是
"表外方法无人认领"的口子，而是派生表的默认支持态来源；这条要写进注释与测试，
因为它同时是**这张表不能用来回答"这个方法存在吗"**的理由（存在性看派发表，支持态看 `_capability`）。

## 6 账务（截至阶段 1）

真实模型调用 **0 次 / ¥0**：观测只发了一次 `server.hello`（本地发现方法，不碰任何 Provider）。
凭据 locator **未访问**；`auth.required=true` 用的令牌是 `build_runtime` 自己在数据根里生成的
会话令牌，不是任何外部凭据。临时数据根在 `tempfile.mkdtemp(prefix="097-probe-")` 下，
§8 收口前删除并核实缺席。

## 7 未做 / 不做（登记）

* **不给新族发明 blocker 判定**：`assets.*` / `hooks.*` / `accounts.*` 在没有相应收纳库/目录的部署里
  是否该报 `supported=false`，是**语义设计**，不是本单的"对齐"。本单只把它们**如实声明为存在**。
  若调度者要真话到支持态层面，那是新单（要逐族定 blocker）。
* **不做按客户端版本裁剪**（工单 §明确不做）。
* 表与前端合同（59 方法）仍然**不是同一张表**，本单不产工件、不动重锁（B4 的事另计）。
* Windows 侧真机 hello 若本宿主不可达，§8 如实写成"在 WSL 侧真监听复跑"，不冒充 Windows 侧。
