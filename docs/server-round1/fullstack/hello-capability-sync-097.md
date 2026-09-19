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

   **这条推论在阶段 4 被自己钉错了（实测，见 §8）**：37 条改判后并非全为 `true`——
   `workspaces.gitStatus` 命中 `workspaces.` 前缀分支，在这份没有沙箱的部署里如实报
   `supported=false / LOCAL_SANDBOX_UNAVAILABLE`，所以 false 行是 **12 条**而非 11 条。
   这不是缺陷（它和另外四条 `workspaces.*` 是同一句话），但它说明本文件当时那句
   "只增加真话、不会有多余的 false" 说得太满：**派生会把既有 blocker 规则也一并带到新方法上**，
   而这是想要的行为——正因如此，G3 的比对范围**只钉既有 27 条**，不去断言新行的支持态
   （断言了新行就等于把"新族该不该有 blocker"这个 §7 未做的决定偷偷做掉）。
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

## 8 阶段 2–4：改了什么、门咬不咬、真机复跑、账

### 8.1 实现（阶段 2，实测）

* `hello()` 的循环改成 `for capability_id in self._handlers:`（`handlers.py:392`），
  理由写进循环上方注释（存在性只看派发表 / 顺序=字面插入序 / `server.hello` 自我声明）。
* **`CAPABILITY_IDS` 常量整条删除**，不是"留着不用"。删除后全仓 grep `CAPABILITY_IDS`
  只剩 `CANONICAL_CAPABILITY_IDS`（`resource_contracts/harness_capabilities.py`，Harness 声明词汇，
  与本单无关的另一套命名空间）⇒ **没有任何一侧还在读这张手工表**。
* `_capability()` 一字未改判定分支，只加了 docstring 说明"兜底答的是支持态、不是存在性"。

### 8.2 门（阶段 3）落在 `tests/server/test_hello_capability_sync_097.py`，7 条

| 门 | 用例 | 断言的实质 |
| --- | --- | --- |
| G1 | `test_the_table_is_the_dispatch_table_and_nothing_more` | 三份"存在"的说法（hello / `_handlers` / `_PARAM_SHAPES`）两两集合相等 + 无重复 + hello 顺序==派发表顺序 |
| G1 反例 | `test_a_method_dropped_from_dispatch_diverges_and_the_gate_bites` | 从派发表摘 `usage.export` ⇒ hello 诚实跟到 63，而形状表仍说 64 ⇒ 发散**可见** |
| 37 条 | `test_the_37_methods_missing_at_baseline_are_all_declared_now` | 按名字断言 `declared - 27 == 那 37 条`，不比计数 |
| 自我声明 | `test_hello_now_declares_its_own_discovery_method` | `server.hello` 逐字 `{"id", "supported": true}` |
| G2 | `test_the_two_probe_methods_are_declared_and_supported` | 两个探测方法在场且 `supported: true` 且不带 `reason` |
| G3 | `test_the_baseline_deployment_answers_the_pre_existing_27_verbatim` | 沙箱探针**两个分支都钉**：11 条 false 的 `{id, supported, reason}` 逐字，且 27 条里没有一条支持态移动、没有一条支持项长出 `reason` |
| 兜底 | `test_an_id_that_no_rule_covers_still_answers_supported` | `_capability("nothing.here") == (True, None)`，而**同一份部署**上真调用 `nothing.here` 得到 `INVALID_REQUEST` 且消息含方法名 |

G3 特意**只比既有 27 条**（§3 推论被钉错的理由见那里）。

### 8.3 反例真的咬（缺席跑，实测）

把"手工常量"放回去 = 进程内把 `WireService.hello` 换回遍历一份 27 条元组的旧形状
（**不动任何文件**，跑完 `RESTORED True` 核实还原），然后跑同一个测试文件：

```
FFFFF..   5 failed, 2 passed in 9.89s
```

红的是 G1、37 条、G1 反例、自我声明、**G2**（`providerModels.probeModels is not declared at all`）；
绿的是 G3 与兜底——**这正是分工**：落后于派发表时该红的就是"同步类"的门，
而 blocker 语义与兜底本来就跟这次改动无关。反例不是装饰：它一次点亮了工单点名的那两个前端按钮。

### 8.4 真机复跑（DoD 3，实测在 WSL 侧真监听）

同一形态复跑（`tempfile.mkdtemp(prefix="097-probe-")` → `build_runtime` → `create_app` →
`uvicorn` 线程真 bind `127.0.0.1:52067` → `urllib` 发 Validation 那条 `server.hello`，
两次调用）：

| 项 | 复跑实测 |
| --- | --- |
| 声明数 / 去重后 | **64 / 64**（与派发表键数 64 相同） |
| 与派发表的对称差 | **`[]`** |
| 两次调用的 id 序列 | **逐字节相同** |
| `protocolVersion` / `auth` / 顶层键 | `wire/1` / `{"required": true, "schemes": ["session_token"]}` / `auth,capabilities,protocolVersion,serverId` —— 与 §1 基线一致 |
| `providerModels.probeModels` | `{"id": …, "supported": true}` ✔ |
| `providerModels.probeConnection` | `{"id": …, "supported": true}` ✔ |
| `server.hello` | `{"id": "server.hello", "supported": true}` ✔ |
| false 行 | **12**（基线 11 + `workspaces.gitStatus`）⇒ 见 §3 那条被钉错的推论 |
| true 行 | 52 |
| 临时数据根 | `TEMP_ROOT_ABSENT True` |

**Windows 侧不可达（如实）**：`curl -m 4 POST http://127.0.0.1:18770/wire/v1/server.hello`
⇒ `http=000` / curl **exit 7（connection refused）**，本宿主此刻连不上那台在跑的 Server。
所以 DoD 3 的"真机"是**在 WSL 侧真监听复跑**，不冒充 Windows 侧；顺带一条事实要交回：
**运行中的 Windows Server 不吃本改动，直到它从本树重新构建部署**（源码单改不了已跑起来的进程）。

### 8.5 回归计数（G4）

* `python3 -m pytest -q tests/server/test_hello_capability_sync_097.py` ⇒ **7 passed**
 （首跑 15.16s，最终源码上复跑 3.83s——差的是首次 SQLite 迁移，不是用例）
* 计数**在最终提交源码上复跑一遍**（`a8b93f3`），而不是拿阶段 2 提交前那一版数字凑：
 `python3 -m pytest tests/server -q` 与 `python3 -m pytest tests/ -q` ⇒ 见 §8.6 的"最终计数"行。
* `validate_order.py docs/implementation/work-orders --strict` ⇒ **30 OK / 31 FAIL**，
  FAIL 的编号集合**恰为 37…67**（先于 v2 格式的历史单，非本单引入）；068–105 全 OK，含本单。
* `git diff --check` ⇒ 干净（本文件所在树；`status.md` 的 EOF 空行按 §提交前自查 处理）。

### 8.6 账务与清理

真实模型调用 **0 次 / ¥0**：本单四个阶段全部是本地发现方法 + 本地 SQLite，没有碰任何 Provider，
凭据 locator **未访问**。§8.3 的缺席跑是**进程内 monkeypatch**（不改文件、跑完核实还原），
所以"反例可跑"这件事没有留下任何工作树痕迹；§9 第一条的探针同样只在临时数据根里跑，
跑完 `TEMP_ABSENT True`。§8.4 的临时数据根已删并核实缺席（`TEMP_ROOT_ABSENT True`）。

**最终计数（在 `a8b93f3` 上复跑，见 §8.5 的理由）**：`tests/server -q` = **661 passed in 323.31s**；
`tests/ -q` = **961 passed in 374.66s**。两条都 0 失败 0 跳过，且**与先前一轮逐字相同**
（阶段 2 提交前的源码只差 `_capability` 的 docstring 散文，测得 661 passed in 331.10s /
961 passed in 303.07s）⇒ 复跑不是为了换个数字，是为了让这两个计数**归属于最终提交的那份源码**；
两次一致本身就是"docstring 不动行为"的实测证据。
**961 = 086 收口时的 954 ＋ 本单新增 7**，一条未掉 ⇒
零回归这件事由计数本身说明，不是由"我看了下应该没事"。

## 9 交回（不阻塞本单终态）

* **派生把 101 的缺陷也照亮了（实测，本单一手）**：这五张刚被如实声明为存在的方法里，
  `usage.aggregate` / `usage.export` / `providerArtifacts.list` 在**无服务的生产组合**上从
  `WireService.dispatch` 直接抛 **`ValueError: unknown wire error family: USAGE_AGGREGATOR_UNAVAILABLE`
  / `ARTIFACT_STORE_UNAVAILABLE`**（⇒ HTTP 500）；`providerArtifacts.install` / `rollback`
  这一次被 `requestId` 校验先挡住（占位参数不够真），其家族位误用点是 101 点名的同一形状。
  于是 hello 现在对这五条说 `supported: true` 是**"方法存在"为真、"叫得通"为假**。
  本单按 §7 不发明 blocker（那是逐族语义设计），但**这条交回要跟着 101 一起看**：
  101 落地后两者自然一致；101 未落地前，任何人拿 hello 当"可用清单"都会在这五条上被骗一次。
* **是否需要重锁**：105 的写法是"可与 097 合并为一次重锁"。本单**没改形状**（条目仍是
  `{id, supported, reason?}`），改的是这张表的**内容**。本树内**没有**生成的 wire 工件可核
  （实测：`docs/contracts/` 只有 Work Core；`find` 无 `contracts/wire-v1`），
  所以"前端那份 TS/工件里是否嵌了 capability id 清单"我在这一侧**无法第一手判定** ⇒ 交回调度者：
  若嵌了，重锁由 105 一并做掉；没嵌，本单不产生新的一对摘要。
* **Windows 侧复跑**：需要一个真在跑的 Windows Server（本机此刻 18770 拒连），以及重新部署才生效这件事。
