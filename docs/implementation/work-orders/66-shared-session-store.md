# Work Order 66 — 共享会话库：kilo/opencode 按家族共享整库 + 空凭据守卫（切绑定，不搬会话）

状态：**READY_FOR_EXECUTION**（2026-09-18 用户拍板方向：搬会话不妥，改为"会话库共享 + 每次切换按绑定物化配置"）。
依赖：**45**（session-store 机制与逐家定性）、**55/58**（60 的前置，本单修订 60 的分档）；不碰 wire，不并入重锁。
配对：60 的 G4/G6/E（本单修订其中 kilo/opencode 两家的分档）、56（账号独立托管）、P17（前端"可调用/可切换"呈现）。

## §0 目标

让**同家族**（本单：kilo、opencode）的会话能被**不同 profile 继续推进**，做法是
**会话库按家族共享（数据层零搬迁）+ 每次执行按当前绑定物化配置/凭据/权限/模型**。

**为什么不是"搬会话"**：库级行搬迁要写别人的 SQLite、跨库无原子事务（崩溃即两份分叉）、
只搬不复制就得删别人的行，且要跟着上游迁移链走 —— 不可逆面太大，收益与 (b′) 相同。**不做。**

**为什么不需要"进程内改配置"**：`HOME`/`XDG_*` 与凭据 env 都是进程启动时读的，config 在
initialize 相位已缓存，进程内换不了；而本机通道**逐轮起进程**、续接靠 native reopen
（门里记的 `reopenMethod` 就是证据）⇒ 切换天然落在**进程边界**，下一轮的进程用新绑定的配置启动即可。

## §1 第一手事实（2026-09-18，只读；仅表名/列名/行数，未读任何行内容）

1. `kilo.db` **22 张表**。会话形状（外键指向 `session`）**8 张**：`session`、`message`、`part`、
   `session_message`、`session_input`、`session_context_epoch`、`todo`、`session_share`。
2. **凭据/账号 4 张**：`credential(label, value, integration_id, connector_id, method_id)`、
   `account(email, url, access_token, refresh_token, token_expiry)`、
   `control_account(同 account + active)`、`account_state(active_account_id, active_org_id)`。
   **两份真实库（产品门产出的 + 用户 1.x 迁来的）这四张全为 0 行**，逐表列结构两份一致。
3. **非会话但同库**：`project(worktree 绝对路径, vcs, name, sandboxes, commands)`、
   `project_directory(directory)`、`workspace(branch, directory)`、`permission(project_id, action, resource)`、
   `event_sequence`/`event(aggregate_id, seq, type, data)`、`kilo_board(objective)`/`kilo_board_message(body)`、
   `migration`/`data_migration`（42 条迁移）。
4. **库外会话状态**：`storage/session_diff/<ses_…>.json`、`kilo/<base64(会话id)>.json`（解码验证：文件名即
   base64 的会话 id）；二进制内含 `session_diff`/`session_diff_base`/`revert`/`/session/{id}/revert`
   ⇒ 这些文件是 **revert/diff 的落盘**，必须与库一起共享，否则"历史在、回退没了"。
5. 同目录另有 `log/`、`repos/`、`telemetry-id`(36B)。opencode 侧 `auth.json`(173B) 在**库外同目录**
   ⇒ provider 凭据的载体在库外。
6. **WAL 陷阱（本单实测）**：主库 checkpoint 过后、把一行只写进 WAL 时，
   `mode=ro&immutable=1` 读出 **0 行**、`mode=ro` 读出 **1 行**（极端情况下 `immutable=1` 整表都读不到）。
   ⇒ **守卫必须读穿 WAL**；用 `immutable=1` 的检查是**假绿**。阶段 A 文档的探测用的正是 `immutable=1`
   （[session-store-14-stage-a.md:47](../server-round1/fullstack/session-store-14-stage-a.md)）。
7. **并发可用性的两条事实**：① 二进制内含 `busy_timeout`(8 处)/`BEGIN IMMEDIATE`(2)/`SQLITE_BUSY`(6)/
   `wal_checkpoint`(5) ⇒ 上游本来就按**多进程访问同一库**写（Kilo/OpenCode 是 CLI，允许多开）；
   ② `project` 表的 `id` 是**字面量 `'global'`**（单例，不是路径哈希、不是 UUID），按目录的登记在
   `project_directory`（主键 = project_id + directory）。⇒ 本库本就是"一库一项目域"的设计，跨 profile
   共享**并没有逆着 schema 的纹理**；但**全新共享库里的首次并发运行**有"抢插同一行"的窗口（见 G5）。
8. 执行模型：本机通道**逐轮起进程**，续接靠 native reopen（同 native id）⇒ 切换落在进程边界。
9. 现状文字要改：60 的 G6/E 现在写"共享 DB 式如实重启"（[60:G6](60-profile-settings.md)、§4 E）——
   本单把这两处在 **kilo/opencode** 上改为"共享整库 + 空凭据守卫"，hermes 维持原样。

## §2 范围（改什么）

1. **注册表声明**：kilo/opencode 声明 `sessionStore = whole-db`（新枚举值），并把**共享集收窄到会话真正
   落的地方**：`kilo.db` + `kilo.db-wal` + `kilo.db-shm` + `storage/session_diff/` + `kilo/`；
   **`log/`、`repos/`、`telemetry-id` 仍留 profile home**；**opencode 的 `auth.json` 明确不共享**。
2. **房间/通道**：共享集绑到公共库 `sessions/<family>/…`（RW），其余仍绑 profile home（RW）。
3. **切换**：`sessions.switchProfile` 前置校验 = **同家族** + **两侧运行锁空闲** + **守卫通过**；
   数据层**零操作**（库是同一份），只改绑定指针并发既有 `config.changed`。
4. **守卫**：切换前与审计期做**空凭据断言**（fail-closed、读穿 WAL、只读行数、不读内容）。
5. **凭据处置改写**：共享库命中注入值 ⇒ **类型化失败 + 不删共享文件 + 记账**（45 的"删掉命中的那个
   文件"在共享库上会连带毁掉别的 profile 的会话，必须改写）。
6. **审计按会话归属**：公共库被多个 profile 的并行轮次写，事实按该轮/该会话归属，churn 按截断记账。
7. **文档**：把"库内**非会话**内容（project/worktree 路径、permission、event、board）对同族其它
   profile **可见**"作为**事实**写明 —— 不许写成"隔离未变"。

## §3 规则

- **不碰 wire**：`sessions.switchProfile` 已在既有 28 方法内，守卫失败走既有类型化错误面；确需新方法 ⇒ 停下记录。
- **绝不往别人的库里加表/改 schema；不搬行**；只读它的会话库做守卫统计。
- **守卫 fail-closed**：打不开、结构未知、查询失败一律拒绝；只统计行数，不读 `credential.value`/token 内容，
  命中即拒绝并记账（不打印内容）。
- **审计与守卫一律只读**：WAL 下只读不阻塞写者，但共享库上**禁止** `wal_checkpoint`／任何拿写锁的操作
  （包括"交接前先 checkpoint 再备份"这类搬会话方案里的步骤）——那会把别的 profile 正在跑的轮次挡住。
- **凭据仍只作 locator**；真机默认零真实模型调用（假端点；真召回用既有 loopback 门法）。
- **删 profile 不得删共享库**；克隆不迁移共享库（沿用 60 G5）。
- **并发语义**：**同会话**跨 profile 并发执行 ⇒ 类型化拒绝（一个 native session 不能有两个写入者）；
  **不同会话**跨 profile 并发写同一库 ⇒ 允许，并如实记录（含 churn 截断）。
- 不 reset/stash/clean、不 merge main、不 push；父工作树与前端仓只读。

## §4 阶段

**A 声明与绑定**：`whole-db` 枚举 + 收窄共享集 + 房间/通道接线。第一手：共享集真落在公共库、
profile home 里**不再有** `kilo.db`。
**B 物化与切换**：按绑定物化（复用既有路径）+ 三条前置校验 + `config.changed`；同家族约束的类型化拒绝。
**C 守卫与审计**：守卫实现（读穿 WAL）+ 凭据处置改写 + 审计按会话归属。
**D 门**：G1–G5 真跑（G1 可用假端点 + nonce）。
**E 收口**：文档（隔离事实 + 60 修订落地 + 51 附带更正）+ status + 报告。

## §5 门

| 门 | 断言 |
| --- | --- |
| **G1 跨 profile 真召回** | A 跑两轮 → `switchProfile` → B 跑第三轮，**真召回第一轮内容**（nonce）；**同 native id**；`config.changed` 有记录；转写里每轮 profile 归属可见 |
| **G2 空凭据守卫** | 三条反例：① 库里塞**合成**凭据行 → 切换被拒（类型化码）；② **WAL 变体**：塞行后不 checkpoint（只落在 WAL）→ **仍被拒**（证明读穿 WAL；禁止 `immutable=1`）；③ 库不可读/结构未知 → 拒绝（fail-closed）。正向：四张表全空时切换通过 |
| **G3 隔离事实与反例** | 第一手：`log/`、`telemetry-id`、opencode `auth.json` **仍按 profile 隔离**（B 家看不到）；库内**非会话**可见内容**逐项列出**并写进文档（当作事实，不当作缺陷） |
| **G4 凭据处置改写** | 共享库命中注入值 → 类型化失败 + **共享文件仍在** + **其他 profile 的会话仍可读**（各一条反例） |
| **G5 并发** | ① 不同会话跨 profile 并行写同一库 ⇒ 都完成、归属正确、无覆盖；② **全新共享库 + 两个 profile 同时首次运行**（`project` 单例行竞态）⇒ 都完成、库内 `project` **恰好一行**、`project_directory` 无重复；③ 并发期间**零 `SQLITE_BUSY` 上浮**（harness 自己的日志与我们的错误面都查）——若上浮则给出按共享库的**首次运行锁**方案并记账；④ 同会话跨 profile 并发 ⇒ 拒绝且码正确 |
| **G6 不退化** | 四家假端点门 + 全量套件不降；wire **28 方法语义与两个摘要不变**；45 的既有 G1/G2/G6/G8 不退化 |

G1–G5 必过；跑不了的按本单 §6 记账，不得写成通过。

## §6 DoD 与报告

实现 / 定向测试与反例（G1–G5 各一条以上，G2 三条）/ 真机证据（假端点跨 profile 续接 + 一条并发）/
回归计数与退出码 / status 分账 / 清理与费用账（默认零真实调用）。
报告含：**声明 diff**、**共享集清单**（哪些路径进了公共库、哪些留 profile home）、**守卫实现点与三条反例**、
**切换前置校验**、**并发事实**、**G3 的可见内容清单**、60 的修订落地、未做项。

终态：`SHARED_SESSION_STORE_DONE` / `SHARED_SESSION_STORE_PARTIAL`。

## §7 明确不做

- **库级行搬迁 / 写别人的 schema**（方案 (c)）——理由见 §0。
- **"进程内改配置"**——不可行也不需要（§0）。
- **hermes**：`state.db` 与 skills/缓存同库、目录迁移实测 ~114k 文件/2GB，影子最大，单独评估。
- **跨家族切换**：只能克隆（60 G5 不变）。
- **把共享库纳入 profile 删除范围**。

## §8 附带更正（doc-only，顺手做）

51 阶段 A 的观察表把 opencode/kilo 写成"**无 usage/token 专用列、需解析 blob**"
（[usage-context-observation-51.md:17-18](../server-round1/fullstack/usage-context-observation-51.md)）；
实测两份库的 `session` 表都有 `cost` 与 `tokens_input/output/reasoning/cache_read/cache_write`。
请在 51/53 的收口文档里更正这一行（**不改解析实现**，逐轮来源仍以各自载体为准）。
