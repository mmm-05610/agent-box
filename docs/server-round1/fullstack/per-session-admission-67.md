# 工单 67 收口报告 —— 并发准入按会话（45-G3 成真）

执行：2026-09-18，env-provider 工作树。终态：**PER_SESSION_ADMISSION_DONE**。

## 1. 索引迁移 diff

- `_SCHEMA` 删除 `server_one_active_turn_per_profile`（保留 per-session 索引）；
  `_migrate_1_to_2` 删除补建段；新增 `_migrate_9_to_10` = `DROP INDEX IF EXISTS
  server_one_active_turn_per_profile`（幂等、只前向）；`PRODUCT_SCHEMA_VERSION` 9→10。
- 迁移测试扩展：v1 库两次 `initialize()` 后断言 per-session 索引在、per-profile 索引不在
  （即"下次启动不会建回来"）且版本为 10。

## 2. 准入与文案

- 两处 409 文案改为只讲会话：`Session already has an active execution` /
  `Session already has an active Turn`；错误码 `TURN_CONCURRENCY_CONFLICT` 不变，
  wire family（CONFLICT_REQUEST）不变。
- 忙会话的第二条消息走**既有队列**（回执 `queueItemId`，非新执行）——这是产品路径；
  per-session 唯一索引仍是其下的硬兜底（定向测试直接打插入点验码）。

## 3. run_state 新定义 + `native_generation`

- `run_state='active'` 仍在接受时置位；四个结束/取消/失败/恢复路径改为
  `_settle_profile_after_turn`：**仅当该 profile 无其它活跃轮时**才置 idle（恢复路径同时写
  recovery_pending）；最后一个活跃轮收口。
- `native_generation`：完成时**无条件** +1（并发两会话完成都合法；旧乐观检查会拒绝第二个
  合法轮）。`PROFILE_GENERATION_CONFLICT` 再无抛出点（它从未有 wire 映射）。

## 4. 逐家 home 并发结论表（G3）

| 家 | 会话落点 | 库外/共享可变态 | 两进程并发判定 | 依据（第一手） |
| --- | --- | --- | --- | --- |
| pi | `sessions/pi/<b64>.json`、`pi/--ws--/<ts>_<uuid>.jsonl`（按会话分文件） | 45 门目录清单只见 marker + `sessions/**` | **shared**（disjoint 文件） | 45-G1 manifest + 67 pi 全链门 checkpoint（2 文件 2375B） |
| codex | `sessions/**/rollout-*.jsonl`（按会话分文件） | `auth.json`（有"failed to lock auth state"锁路径）、`history.jsonl`（共享锁，写者互斥）、`.tmp`/`shell_snapshots`（声明的 tmpfs 遮蔽） | **shared** | 钉住二进制 strings（0.147.0-linux-x64）+ 声明 |
| hermes | **整库** `state.db`（WAL） | 同库即全部 | **shared**（上游按多进程写：WAL + `timeout=1.0` + 应用层抖动重试 + `BEGIN IMMEDIATE`） | 钉住 0.19.0 闭包 `hermes_state.py` 1–40、1045–1075 行 |
| kilo | `kilo.db`（SQLite，按会话行） | 同库 | **shared**（上游含 busy_timeout/BEGIN IMMEDIATE/SQLITE_BUSY/wal_checkpoint；66 §1.7 第一手） | 66 报告（kilo 二进制） |
| opencode | `opencode.db`（SQLite，按会话行） | `auth.json`（明确**不共享**，66 §2.1） | **shared**（同 kilo 设计） | 66 §1.7 + 本机真库观测 |
| claude | `.claude/projects/*/<uuid>.jsonl`（按会话分文件） | `.claude.json`(44 处引用)/`todos`(28)/`shell-snapshots`(8)/`statsig`(3)：库外写入存在、锁语义**未判明** | **exclusive（收窄锁已实施）** | 钉住二进制 strings |
| dsh | `.dsh/sessions/**`（声明） | **无本地样本**（无门） | **exclusive（收窄锁已实施）** | 无第一手 ⇒ 按 §3 收窄 |
| qwen | `.qwen/projects/**`（声明） | **无本地样本** | **exclusive（收窄锁已实施）** | 同上 |

**收窄锁实现**：部署文档新字段 `homeConcurrency: "shared" | "exclusive"`（默认 shared，
其它值类型化拒绝）；装配边界把它作为映射注入 `SessionRecords`；两个插入点在该 profile
的 harness 声明 exclusive 且有其它活跃轮时，抛同一码 `TURN_CONCURRENCY_CONFLICT`、
文案点名资产（"this Harness's home permits one execution at a time"）。锁**按家显式声明**，
不猜默认。

## 5. 门（G1–G5）

- **G1 同 profile 两会话并行**（45-G3 原文）：**pass**。`native-home-gate.py` 的 G3 由占位
  改为真并发：echo 座 `delay-success` 的 500ms 确定性窗内两个会话同 profile 各跑一轮，
  **两轮都 completed**、`nativeIdsDiffer: true`、每会话 deltas 各 1 且按自身 turn_id 归属。
  整个门终态 `NATIVE_HOME_GATE_OK`（report: `native-home-gate.json`）。
- **G2 同会话排他**：① 同会话第二条消息=（复用 `sessions.send`）**入队**（`queue_0eec…`，
  非第二个执行）；硬兜底由定向测试以插入点 409 + `TURN_CONCURRENCY_CONFLICT` 钉住。
  ② 跨 profile：运行中 `switchProfile` ⇒ `rejected/execution_running`（门内实测 + 仓库测试）。
- **G3**：见 §4 表 + 收窄锁实施。
- **G4 不串号**：门内每会话 delta 按自身 turn_id 归属（deltasPerSession 1/1）；仓库测试断言
  两个并发轮各自的记录独立（不同 turn_id）、run_state 在最后一个轮收口前保持 active、
  `native_generation` 两轮各 +1（=2）。
- **G5 不退化**：全量套件 786 passed / 0 failed（见 §6）；四家假端点门：pi/codex/hermes
  `*_GATE_OK`、opencode `*_PREPARED`（其终态即过态）；**kilo 仍被既有
  HOME_MARKER_CONFLICT 维护债挡住**（与 49/54 记录一致，非本单回归）。wire 28 方法
  与两摘要不变（本单未加方法；新增部署字段与内部码文案，见 §7 记录）。

## 6. 回归计数

- 全量：`786 passed`（本单前 785；+1 收窄锁测试；迁移测试就地扩展）。
- 本机门：`NATIVE_HOME_GATE_OK`（G1/G2/G3/G4/G6/G8 全 pass，G3 从 blocked 转 pass）。
- 四家全链门（c11 worker `sha256:cae57696…`）：pi OK、codex OK、hermes OK、opencode PREPARED
  （终态语义）；kilo FAILED（既有 marker 债，非回归）。

## 7. 附带修复与记录

- **本地通道 usage_probe 断口（55 回归）**：运行时向 `LocalSidecarLauncher` 传
  `usage_probe=`，但该类不接受该参数 ⇒ **55 之后所有经真 runtime 的本机轮都会在构造处
  TypeError**（全量套件未覆盖此路径）。本单修复：launcher 接受并持有 `usage_probe`
  （后端从 port 读取），`_LocalChannels.read_usage` 按 Worker 同规实现（窗口内按后缀取最新
  文件、`LocalHome.read` 有界读、`parse_usage` 解析）。45 门因此在修复前后由
  EXECUTION_FAILED 转绿。
- **夹具**：echo peer 的 native id 由 `fake-native-<pid>-<n>` 改为附随机段——每个 bwrap 房间
  有自己的 PID 命名空间（两个并发房间都是 pid 13），原方案在并发下必然撞 id；前缀保留
  （所有依赖只钉前缀）。
- **wire-review 记录**：触发条件收窄（同会话文案）；`PROFILE_GENERATION_CONFLICT`
  不再有抛出点；新增部署字段 `homeConcurrency`（服务端装配面，非 wire 面）。

## 8. 未做项

- 会话 fork/克隆（§7 明确不做）；跨家族切换仍只能克隆（60-G5）。
- dsh/qwen 的并发判定待其本地门首跑后可从 exclusive 收紧回 shared（本单按 §3 保守处置）。
- kilo 门的 marker 债仍未定位根因（全库维护债，与本单无关）。
