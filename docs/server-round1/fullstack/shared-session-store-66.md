# 工单 66 阶段 A —— 声明与绑定（whole-db 共享会话库）

执行：2026-09-18，env-provider 工作树。范围：把 kilo/opencode 的会话库声明为
`sessionStore.kind = "whole-db"`，把共享集收窄到"会话真正落的地方"，并把共享集绑到
按家族共享的公共库。阶段 B–E（物化与切换 / 守卫与审计 / 门 / 收口）不在本文。

## 1. 声明 diff（部署模板）

| 家族 | 之前 | 现在 |
| --- | --- | --- |
| kilo | `profile-home`（缺省） | `whole-db`：`kilo.db`(file)、`kilo.db-wal`(file)、`kilo.db-shm`(file)、`storage/session_diff`(dir)、`kilo`(dir) |
| opencode | `profile-home`（缺省） | `whole-db`：`opencode.db`(file)、`-wal`(file)、`-shm`(file)、`snapshot`(dir) |

- **明确不共享**：`log/`、`repos/`、`telemetry-id`（kilo）、`opencode` 的 `auth.json`
  （凭据载体，留在 profile home）——与工单 §2.1 一致。
- 条目带 `kind`（file/directory）：房间绑定的目标必须由库侧"播种"出正确的类型，
  否则 bwrap 会在错误类型上建挂载点。

## 2. 绑定实现（四层）

1. **中立 seam**（`runtime_composition/sandbox_port.py`）：`SidecarRoomRequest.state_overlays`
   ——`(host_source, guest_target)` 列表，语义为"在 state home 之后叠加，深的胜"。
2. **bwrap 编译器**（`provider.py` / `sidecar_room.py`）：新增 `state_overlay_mounts`；
   每个目标用同一套 home 语法校验，且**必须严格落在已声明的可写 state 目标之内**
   （越界 = `ProjectionRejected`）；以与 state home 同级的可写类发出，靠既有
   `(depth, class, …)` 排序让它晚于 state home 绑定。实测（本机）：
   `bwrap --bind src.txt dst.txt`（dst 不存在、父可写）**会自行创建挂载点**，
   目录绑定的中间目录同样自动创建——所以 profile home 里不需要预置占位文件。
3. **Worker 通道**（`sidecar.py`）：whole-db 时先 `home.prepare(kind="session-store",
   entries=[…])` 取得公共库并**播种**；窗口仍绑 profile 自己的数据目录
   （`<role dir>/<state 相对路径>`），再把库里的每个共享名以 overlay 绑到 state 目标之下。
4. **本机通道**（`local_channel.py`）：同一语义的 Python 实现（`_seed_store_entries`）。
5. **装配解析**（`runtime.py`）：`shared` 逐条 = `{name, kind}`（键集严格、名字走同一套
   沙箱语法、≤16 条、重名拒绝）；`whole-db` 要求 stateProjection（与 sessions-subtree 同）。
   `homeConcurrency` 与 `sessionStore` 正交（kilo/opencode 仍是 shared）。

**为什么必须播种**：房间只能绑"存在的名字"。库是产品自己的目录，播种=创建空挂载点
（0 字节文件 / 空目录），**不搬任何数据**；已存在的名字必须是声明的类型（符号链接或
异类一律类型化拒绝，不跟随、不覆盖）。Worker 侧同一规则（`home.prepare` 的 `entries`），
新增单测覆盖：播种幂等、`kilo.db` 播种为空文件、同名符号链接被拒。

## 3. 第一手证据（本机，真 bwrap + 真节点桥）

新测试 `tests/server/test_shared_session_store.py`（3 条，全绿）：

- **编译器叠加**：whole-db 房间的 argv 里，`--bind <库>/kilo.db <state>/kilo.db`
  **晚于** state home 的 `--bind`（深的胜）；越界目标（`/runtime/home/.config/kilo/x`
  落在声明 state 之外）被 `ProjectionRejected` 拒绝。
- **共享名落公共库**（参数化 case 1）：夹具把它的状态目录指向 `<state>/kilo`
  （声明中的 dir 共享名）。整轮（workspaces.open → createAndSend → 终态）完成后：
  `profiles/_sessions/kilo/kilo/native-state.json` **存在**，
  `profiles/<role>/.local/share/kilo/kilo/native-state.json` **不存在**。
- **非共享名留 profile home**（参数化 case 2）：同一轮把状态目录指向 `<state>/log`
  （未声明共享）：`profiles/<role>/.local/share/kilo/log/native-state.json` 存在，
  公共库里**没有**该文件。

## 4. 顺带修复（本机通道的既有断口，均为 kilo/opencode 本机轮必需）

- `home_locator_segments` 的段数上限 2 → **6**：与 Worker 的规则对齐
  （Worker 注释即写明"role 段 + 可嵌套的 native home（`.config/opencode`）"）；
  否则 `.config/kilo` / `.config/opencode` 这类两段 native home 的**本机轮直接
  `HOME_LOCATOR_INVALID`**。
- 装配给本机 launcher **显式传 `native_home`**：此前它从 locator 末段推导，
  对 `.config/kilo` 会得到 `kilo`，房间会把 profile home 绑到错误的 guest 路径。

## 5. 审计范围的诚实记录（事实，非缺陷）

whole-db 下**审计树=公共库**（locator `_sessions/<family>`，整树，只读），与
sessions-subtree 同规；profile home 里未共享的文件（`log/`、`repos/`、`telemetry-id`、
`auth.json`）按绑定仍**按 profile 隔离**（工单 G3 的断言），但**不再落在本轮审计树内**
——这是 66 §2.1 收窄共享集的直接后果，记账于此，供阶段 C 的守卫设计与后续评估。

## 6. 回归计数

- Python 全量：**794 passed / 0 failed**（新增 3 条 whole-db 测试 + 5 条守卫测试；其余既有）。
- Worker（Rust）单测：**41 passed**（新增 1 条：播种与符号链接拒绝）；debug 与 release
  二进制均已重建（测试会断言二进制不陈旧）。
- c11 worker 二进制随 `home.prepare` 的 `entries` 扩展重建（`sha256:aa65e919…`），
  四家全链门以新二进制复验：**pi/codex/hermes exit 0**、opencode PREPARED（其过态）；
  pi 门记录 `checkpointNativeIdStable: true`、两轮 completed、delta 归属 1/1。

## 6b. 阶段 C 的第一块（已落地，供 C 接线）

`session_store_guard.py`（新模块，子代理实现，5 条测试）：只读打开共享库
（`mode=ro` + 短连接超时，**禁止 `immutable=1`**、禁止任何写与写锁），逐表 `COUNT(*)`，
`credential`/`account`/`control_account`/`account_state` 任一非空 → 类型化
`SESSION_STORE_CREDENTIALS_PRESENT`（只报表名，不读值）；结构未知/不可开 → fail-closed；
库不存在 = 正向通过。**WAL 反例已钉**：只在 WAL 里的行，`immutable=1` 读到 0 而守卫仍拒绝。

## 7. 未做项（阶段 B–E）

- B：切换（`sessions.switchProfile` 前置校验=同家族+两侧锁空闲+守卫通过）、按绑定物化。
- C：空凭据守卫（**读穿 WAL**、只读行数、fail-closed；禁止 `immutable=1` 与任何写锁）
  + 凭据处置改写（命中共享库=类型化失败+不删共享文件+记账）。
- D：G1–G5 真跑（含 66 修订后的冷启动竞态四条）。
- E：60 的 G6/E 修订落地、51 附带更正已做（见 `d1f7431`）、status 与收口报告。

## 8. 阶段 B —— 物化与切换（已完成）

**切换前置校验（`switch_profile`）**，四查依次：

1. **同家族**：目标 profile 的 `harness_type` 必须与当前绑定相同，否则
   `PROFILE_HARNESS_MISMATCH`（跨家族=克隆规则，60 G5）；
2. **两侧运行锁空闲**：本会话有活跃轮（既有 `rejected/execution_running`）+ 目标
   profile 有活跃轮（`TURN_CONCURRENCY_CONFLICT`，"target Profile already has an
   active execution"）；
3. **空凭据守卫**（见 §9）：本机放置直接只读检查公共库；**远端放置 fail-closed**
   （`SESSION_STORE_GUARD_UNAVAILABLE`——守卫读的是本机库，远程库不在这里，放行才是撒谎）；
4. **数据层零操作**：只改绑定指针 + 版本 + 既有 `config.changed(next_send)`。

**根因修复（本单实测发现，属 43 代门 HOME_MARKER_CONFLICT 债务的同类）**：会话在首轮把
`home_locator` 钉死；切换后新 profile 的轮次仍写旧 role 的 home ⇒ 标记校验
`HOME_MARKER_CONFLICT`（本轮 G1 第一枪即复现，`LocalChannelError: the home belongs to
another profile identity`）。按 66 §0"每次执行按当前绑定物化"，切换时**清空
`home_locator`**（下一轮按新 profile 重新派生；rename 不变性保留——派生规则本身与名字
无关地记录在会话上）。修复后 G1 直通。

## 9. 阶段 C —— 守卫与审计（已完成）

- **守卫接线**：装配边界为每个 whole-db 家族注册守卫（库内每个 `.db` 共享条目；
  本机 home root 下的 `_sessions/<family>/<name>`）；`switch_profile` 调用失败即
  fail-closed（`SESSION_STORE_CREDENTIALS_PRESENT` / `..._STRUCTURE`）。
- **凭据处置改写**（66 §2.5）：审计命中时按树定分——**共享库**（`port.shared_store`，
  由 launcher 的 `session_store_harness` 判定）⇒ 类型化失败 + **不删文件** + 警告记账；
  profile 级树 ⇒ 旧规则（删除命中文件）。抽成 `_credential_hit_disposition` 以便直测。
- 守卫本身：`session_store_guard.py`（只读、读穿 WAL、fail-closed；见 §6b）。

## 10. 门（G1–G5）

| 门 | 结果 | 第一手 |
| --- | --- | --- |
| **G1 跨 profile 真召回** | ✅ | 会话在 role-a 跑一轮（写入共享 `state.json` + nonce）→ `switchProfile`（confirmed）→ role-b 第二轮**真召回 nonce**、`native_id` 不变、`config.changed` 在、两轮的 `profile_id` 归属分别为 role-a/role-b（从账本直读）；共享文件落在 `_sessions/kilo/state.json` |
| **G2 空凭据守卫** | ✅（三条反例 + 正向） | ① 合成 `credential` 行（已提交）→ 切换被拒 `SESSION_STORE_CREDENTIALS_PRESENT`（wire family CONFLICT_REQUEST）；② **WAL 变体**：行只活在 `-wal`（读快照下）→ **仍被拒**；同文件 `immutable=1` 视图落后于 live 计数（`seen_immutable < seen_live`，实测 1<2）证明"读穿 WAL"不是巧合；③ 结构未知（非数据库字节）→ fail-closed；正向：播种后的空库（0 字节）切换通过 |
| **G3 隔离事实** | ⚠️ 部分（已证 + 待列） | 已证：`log/`（未共享名）的写入留在 profile home、公共库无该文件；`log/`/`repos/`/`telemetry-id`/`auth.json` 由**绑定**保证按 profile 隔离（B 家的 role 目录里没有 A 家的文件——由 66 §2.1 的收窄共享集 + 阶段 A 的绑定规则推得，逐项清单待 E 收口时并入文档） |
| **G4 凭据处置** | ✅（规则级） | `_credential_hit_disposition` 直测：共享库命中=keep-shared（不删）、profile 树=delete、非命中=none；共享库的"文件仍在 + 他 profile 会话仍可读"由规则本身保证（不删即仍在），端到端注入留待 D 的后续轮 |
| **G5 并发** | ⏳ 未跑 | 修订后的四条（跨 profile 并行、冷启动单例行竞态、零 SQLITE_BUSY 上浮、同会话拒绝）需要真并发轮次；67 的 G1/G2 已覆盖"同会话拒绝"的机制面（per-session 索引 + 运行中 switch 拒绝），冷启动/并行两条待下一轮 |

## 11. 阶段 B/C 的回归与清理

- 新增测试 7 条（`test_shared_session_store.py`），全绿；全量计数见提交时的套件结果。
- 新增夹具 `tests/server/fixtures/shared_store_acp_peer.mjs`：模型"播种文件存在但为空=
  尚无状态"（与真实家族的空 SQLite 库同形；`stateful_acp_peer.mjs` 的"存在即已持久化"
  语义与播种不兼容，故**不改既有门依赖的夹具**）。

## 12. 阶段 E —— 收口

- **对 60 的修订（落地方案，父仓工单文本属调度方，本文记录应改的语义）**：60 的 G6/E
  现写"共享 DB 式如实重启"；在 **kilo/opencode** 上应改为"**共享整库 + 空凭据守卫**"
  （本单已实现：库按家族共享、切换前置只读守卫、命中不删；"重启"语义仅剩 profile home
  的非共享面），**hermes 维持原样**（66 §7：state.db 与 skills/缓存同库，单独评估）。
- **doc-only 附带更正**：51/52 的观察表行已按 66 §8 更正（提交 `d1f7431`）；解析实现未动。
- **status 分账**：66 记为"完成中的工单——A–C 与 G1/G2/G4/G5(夹具级)已落地；
  G5 的 SQLite 级断言（冷启动单例行、零 SQLITE_BUSY）挂到真实家族的 c11 门"。
- **未做项**：G5 的真 SQLite 竞态断言（需真 kilo/opencode runtime 在 c11 的并发轮）与
  远端守卫（Worker 侧读库）——两者都在本单 §6 记账，不写成通过。

## 13. 完整测试面（本单新增，9 条全绿）

`tests/server/test_shared_session_store.py`：编译器叠加与越界拒绝 / 共享名落公共库 /
非共享名留 profile home / 切换前置四查 / 命中处置 / **G1 跨 profile 真召回** /
**G2 守卫三反例+正向** / **G5 并发两 profile 同库 + 运行中切换拒绝** /
**G3 隔离事实与公共库可见内容清单**。
