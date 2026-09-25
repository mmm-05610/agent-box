# LNX-001 · 四条主实现线的差异、重叠与整合顺序

任务：LNX-001（只读调查）。采样 2026-09-21 15:1x–15:4x +08:00，起止各核一次源 HEAD，**四线零漂移**。
标注约定：**〔证实〕** = 本调查用只读命令复核过；**〔建议〕** = 由证据推出的做法，需 I 定；
**〔不可静态判定〕** = 只能靠运行/实跑证明。逐条能力清单见 `parts/backend-lines.md`、
`parts/desktop-lines.md`；合同面实测见 `parts/wire-face.md`；输入快照见 `sources.tsv`。

四条线（下称 service / runtime / chat / settings）：

| 线 | repo | 分支 @ HEAD | 独有提交 | 其中触碰产品代码 | 独占产品文件 |
| --- | --- | --- | --- | --- | --- |
| service | backend | `feature/env-provider-v1` @ `003b52b2b18a` | 103 | **36**〔证实〕 | 37 |
| runtime | backend | `feature/env-provider-runtime` @ `a7b7b6ff15ab` | 138 | **45**〔证实〕 | 77 |
| chat | desktop | `feature/agentbox-desktop-product` @ `08b4eac7fe10` | 87 | 36〔证实，同法〕 | 41 |
| settings | desktop | `feature/agentbox-desktop-settings` @ `01083212aaad` | 117 | 43〔证实，同法〕 | 79 |

〔证实〕提交数按 `git log --format='%h' <mb>..<ref> -- src tests scripts workers protocols plugins pyproject.toml | wc -l`；
独占文件按两侧 `diff --name-only <mb>..<ref>` 求差集后剔除 `docs/`、`.agents/`。
桌面两线的**共用产品文件只有 14 个**——即真正的接缝很窄，其余是两线各自新增。

**读表要点**：独有提交的大头（后端 67/93）只改历史调度文档，不是产品演进〔证实〕。
判断功能存在与否一律看代码与门测试，不看工单 DONE、不看分支名、不看提交数。

---

## 1 两对线各自的"分工形状"不同，不能用同一手法合

### 1.1 后端：分工几乎正交，但存储与合同各有唯一 owner 〔证实〕

- **runtime 线对 `src/agent_box/server/wire/handlers.py` 相对共同祖先是 0 行改动**
  （`git diff a4f82566..feature/env-provider-runtime -- src/agent_box/server/wire/handlers.py | wc -l` = 0）。
  ⇒ 全部 wire 面行为（错误族四道墙、`server.hello` 发布 harnesses、`profiles.list` 可发送性投影、
  `config.describe` 逐槽、129 幂等 requestId、149 凭据身份入口）**只在 service 线存在**。
- 反之 runtime 线独占：执行链可靠性与失败原因类型化（106/109/142/150/135/120）、放置/沙箱解析（090）、
  原生配置物化族（093/096/108/111/114）、委派六单（136–141/146）、控制面同步（091）、
  Worker 三元门与 golden（102）、**以及 schema 18→19→20 的全部迁移**。
- 三个共同源码文件的实际形态不对称〔证实〕：
  - `model_configs/repository.py`：runtime ⊇ service —— runtime 的 `KEEP` 哨兵就是从 service 112 移植的，
    其 `_Keep` docstring 逐字写 "Order 112 (union with 092, via 126)"
    （`feature/env-provider-runtime:src/agent_box/server/model_configs/repository.py:12`）。残余差仅 15 行。
  - `model_configs/service.py`：update() 语义等价，但 config 对象发布**只有 runtime 版带 protocols/endpoints**；
    取 runtime 版即含 service 语义 ⇒ 这是"二选一"而非"两合"。
  - `sessions/repository.py`：改动区域不相交（文件头常量区 vs `:750+`/`:1020+`），**必须同时保留**：
    service 128 给 `WIRE_VISIBLE_EVENT_KINDS` 补的四个 kind 在 runtime 树仍然缺失〔证实：runtime `:28` 处该集合只有 10 项，无 `usage.updated/thought.delta/plan.updated/mode.updated`〕，
    runtime 134 的 `terminal_reason` 条件写与 146 的 `turn_message_deltas` 在 service 树完全不存在。

### 1.2 桌面：分工重叠在少数公共组件上，且**只有一处是真正的同题异解**〔证实〕

- chat 线独占：服务侧 Workspace 第三类行（含 WSL `distribution:rootPath` 去重）、模型控制冷启动、
  发送路径诚实化、转录 markdown 信任边界、语言热切换、文案/截断门族、**Windows-DWM 重挂 backdrop**（平台专属）。
- settings 线独占：`thought.delta` 入转录并按服务事件序渲染、子代理可见性、AgentBox 工具卡与 changed-files diff、
  harness 目录/三态/provider facts、i18n 目录完整性族、原生 `title=` 禁令、reduced-motion、
  `apps/shared` 测试 runner，以及**唯一演进过的 wire 契约源** `src/types/wire/wire-v1.ts`〔证实：chat 线该文件对基点零改动〕。
- 唯一"同一逻辑两个答案"：远程媒体去 token（AUD-F-030）。chat P54 = token-free URL + `x-hermes-session-token`
  header + blob；settings P55 = `hermes-media://remote/...` 受管协议。两解写进**同一个被逐字重写的 base 函数**，
  且 `apps/desktop/src/lib/media.remote.test.ts` 对同一 base 测试名写了互斥断言〔证实：直接 diff 两侧该文件〕。
  合并后同一实现只能绿一侧。两树当时的裁定单要求"优先 hermes-media，否则 blob 且**两树同形**"，实际各取一边。

---

## 2 跨仓库接缝：合同面是三份互不相同的字节身份 〔证实〕

| 工件 | 摘要（sha256 前 8） | 方法数 | 挂在 |
| --- | --- | --- | --- |
| `contract/wire-v1.schema.registered-c4255b31.json` | `c4255b31` | 64 | service 线 |
| `generated/wire-v1.schema.snapshot-33methods-stale.json` | `a1bd52a4` | **33（自称 stale）** | runtime 线 |
| `contracts/wire-v1/generated/wire-v1.schema.json` | `1a3604ee` | 64 | chat 线 |
| 同上（settings 线） | `2dd26561` | 64 | settings 线 |

- 方法**词汇表**四条线完全一致：两后端 `handlers.py` 提取出同一组 64 个方法名（双向差集为空），
  两条桌面对这 64 个方法全部有引用点（未引用数 0）。
- 差异只落在**两个功能面**：`server.hello#result`（chat 面缺 `harnesses`）与
  `providerModels.*#result`（settings 面多出 092 的 `compatibility/protocols/protocolsDeclared/endpoints/models[].capabilities`，
  且 `harness` 由 `string(minLength 1)` 变 `string|null`）。叶子级差计数：hello 1 处、list#result 9 处；
  `providerModels.{create,update,archive}#params` 条目级报差但叶子级 0 差（键序噪声，**不算语义差**）。
- 后端自己的账也这么说：service `df115c7`（2026-09-19，工单 113）提交信息自述**"未做项：与桌面树现物字节对表
  （跨树读取被本环境拦下）"**，并点名两条 provenance 漂移交回工单 102 重锁。
- `releases/candidate/manifest.md` 与 `control/current-state.md` §2 引用的 2026-09-15 锁定位
  （TS `11e3b3e7…`／生成工件 `5d4fa3bf…`）在当前树里**已无命中**，且 P26 提交记录了新对 `1019b38b/1a3604ee`
  ——其中 `1a3604ee` 与 chat 面实测 sha256 吻合〔证实〕。⇒ 锁定位自那以后至少两度被重锁取代；
  **不推断**当年那份对是否曾为真。

## 3 公共存储：数据目录不兼容是**单向**的 〔证实〕

| | service | runtime |
| --- | --- | --- |
| `PRODUCT_SCHEMA_VERSION`（`src/agent_box/storage/database.py:11`） | **18**（对祖先该文件零改动） | **20** |
| 新迁移 | 无 | `18→19` 加 `server_queue_items.pause_reason`；`19→20` 重建 `server_provider_models` 使 `harness_type` 可空（docstring 自述**前向-only**） |
| 打开 schema 20 的库 | `FutureSchemaError`（`feature/env-provider-v1:src/agent_box/storage/database.py:625-627`） | 可开 18 库并前向迁移 |

⇒ 同一个数据根下两线代码不能互换：只有 runtime 侧代码能活在 20 号库上。这条约束直接决定后端汇合的基座方向。
另：`pauseReason` 是**未登记进合同的载荷增补**〔证实：两份 wire-v1 工件里 `pauseReason` 计数都是 0〕。

## 4 用户实际报障的那条线，两侧都只做了一半 〔证实〕

静默截断（`ACC-R5-9` / `R-0081②`）的链路：Worker 结果带 `stopReason` → 服务端落 `terminal_reason` →
投影 `reason` → 桌面如实呈现。现状：

- 投影侧两线**都有**：`reason = row.get("terminal_reason") or row.get("error_code")`
  （service `wire/projection.py:207`、runtime `wire/projection.py:173`）。
- 写侧只有 runtime：134 条件写列 + `_terminal_reason_from_result` 从 result 取
  `stopReason`（`feature/env-provider-runtime:src/agent_box/server/execution/sidecar_backend.py:989`）。
- **来源侧两线皆无**：service 树 `stop_reason` 在 `src` 下 0 命中，其 tip `003b52b2` 本身就是
  工单 156 的**转单文档**（1 file changed, 134 insertions，全在 `docs/`）。
- ⇒ **〔证实〕`releases/candidate/manifest.md` 说 service HEAD "包含 order 156 的目标"是不成立的**；
  它包含的是 156 的工单卡。这条应作为证据校正记入 `control/decisions.md`（建议编号 E-002）。
- 凭据自助（151）同理：64 个 wire 方法里**没有**受控凭据录入口〔证实：方法名集合见 §2；151 的自述也是此口径〕，
  账上状态 `DISPATCHED`，`terminal` 码 `CREDENTIAL_ENTRY_SURFACE_DONE` **不是完成证据**（`control/backlog.md` 已声明 38 单如此）。

## 5 建议的整合顺序（每步给验证；顺序本身是〔建议〕，依据是上面各节的〔证实〕）

前置（不属于整合，属于冻结）：**先写版本清单**——四 SHA + 三份合同摘要 + 承重但 git-ignore 的
`.acceptance-bundle-*` 与 `apps/desktop/dist` 清单（见 `status.md` 事实 5）。四线 HEAD 是**输入快照**，
不能当输出。

| 步 | 做什么 | 为什么这个方向（依据） | 该步的验证入口（本任务未执行） |
| --- | --- | --- | --- |
| 1 | 后端汇合：**以 runtime 为存储/执行基座**，把 service 的 wire 面并入 | §3 单向不兼容；§1.1 runtime 从未碰 `handlers.py`（wire 面独占即 service 独占）；`repository.py` runtime ⊇ service | 复跑 service 的 112·28 门与 117 对表门（两文件在 runtime 树**互缺**〔证实〕）+ runtime 的 `test_union_semantics_126.py` + 128 集合等价门 + 101/115/123/147 错误族门 + `test_wire_seq_numbering_spaces_128.py` |
| 2 | 合同面**一次性重锁为并集**：`server.hello.harnesses` + `providerModels.*` 的 092 投影同窗登记，两仓同一窗口出新的摘要对 | §2 三份互不相同的字节身份；差异只在两个功能面，并集是明确可枚举的 5 个方法 | 后端 `python3 scripts/server-round1/wire_artifact.py --print-digest/--check/--compare`（声明入口）；桌面 `wire-v1.ts` 重生成 + `vitest run --project ui`；**并显式 `AGENT_BOX_WIRE_SCHEMA=`**（runtime `docs/server-round1/wire-review.md:596` 明令不得默认取本树快照） |
| 3 | 桌面汇合：按 i18n → activity-timer → chat-view → media 裁定的次序收 | §1.2 共用文件仅 14；i18n 是唯一"合流必判红"的静态事实：chat 新增 8 键只在 en/zh/zh-hant，settings 47 键六语齐且**门在 settings 手里**〔证实：逐 locale 命中数 chat 0/8 于 ja/ar/ru〕 | `vitest run --project ui`（含 `catalog-integrity.test.ts`）、`activity-timer.stamps.test.ts` vs `activity-timer.test.ts`、`media.remote.test.ts`、`npm run check` |
| 4 | 跨仓 Linux 联跑（桌面→本地服务→sidecar→harness→回复闭环），用**新建隔离数据根** | 见 `linux-readiness.md`；§3 决定新库必须从 schema 20 起建，且不得迁移用户数据 | 见 `parts/linux-chain.md` 的隔离验证路径；模拟与真实模型证据分开 |
| 5 | 把 §4 两个半成品接上：Worker `stopReason` 生产侧（137/156）与凭据自助面（151） | 这两项决定用户能不能感到"截断不再无声"和"自己加 Provider" | 需真机/真凭据的部分要先核对授权 |

〔建议〕步 1–2 必须**同一窗口**做完：先 1 后 2 会让 runtime 的 stale 快照继续当默认取用点；
先 2 后 1 会锁到一份没有存储层支撑的合同。

## 6 必须由 I 决定的问题（本调查不替 I 决定）

1. **远程媒体取哪一形**（`hermes-media://` 受管协议 vs header+blob）：只有一个是最终形态，
   另一侧的 `media.remote.test.ts` 必改。这同时是对旧裁定单"两树同形"是否继续有效的表态。
2. **`model_configs/service.py` 的 config 发布取 runtime 版**会改变"声明过协议的历史记录"的
   `config_object_digest`，进而影响 profile freeze 引用。两树都没有 dump/重算迁移〔证实：无相关脚本〕
   ——要不要为既有数据做重算，属 I。
3. **新主线的 data root**：schema 20 前向-only。是新建空根起验（本调查理解 D-0016/D-0018 未授权迁移用户数据），
   还是别的安排。
4. **后端 `main` 的两个提交**（`532cc99` #66、`6c14ea8` #67，改 harness adapters / Studio backend core）
   与两条线**非 patch 等价**〔证实：`git cherry -v <线> main` 两行都是 `+`〕，但 `harnesses.toml` 在三条分支都存在
   （内容已演化）。要不要把 #66/#67 的具体决定纳入候选，需要一次针对性考古，本任务判为"需要进一步调查"。
5. **凭据自助（151）是否列为第一批**：当前 64 方法无入口，用户不能自服务；这决定 `configuration` 业务线能否真正验收。
6. **历史调度文档的去向**：`docs/implementation/**`（后端两线 81/90 个文件）、
   `docs/desktop-product-delivery/**`（两线 39+36 / 31+86 个文件）、`.agents/skills/incremental-work-order/**`
   在候选分支里保留、剔除还是移入 `archive/`。三处都各自声明"单执行者队列"，**恢复其调度权威已被 AGENTS.md 禁止**；
   但 `docs/server-round1/**` 里含**一手测量记录**（如 104 的 15 门咬旧码 9 红、089 的 socket-check 码表），
   与调度文档不同类，一刀切会不可逆地丢测量证据。
7. **electron live-loopback 预红家族（两线共登记 4–7 个，含 `wsl-path-bridge*.test.ts`）**在新主线上
   算既有债（带着红走）还是先修再走。
8. **`terminal_reason` 已就绪而来源未接**：是先立 Worker 合同的 137，还是先用可控假数据把消费侧验穿。

## 7 与旧记录不一致的地方（两边都留，不按时间戳裁决）

- `releases/candidate/manifest.md` 称 service HEAD 含 156 目标 → 与 §4 的实测冲突，以 §4 为准并建议记 E-002。
- 本调查对桌面 `main` 的"净新增 8 文件、0 个非 docs"与子报告 §6 的"181 文件 tree-diff 噪声"是**不同基点的两种问法**：
  以 `merge-base(main,chat)=b6932ea2` 为基是 8 文件全 docs；以 `merge-base(chat,settings)=b8c2e0b6` 为基会混入反向删除。
  两者不矛盾，结论一致：**main 不带任何两线之外的产品文件**〔证实：树级比较，main 有而两线并集没有的非 docs 文件数 = 0〕。
