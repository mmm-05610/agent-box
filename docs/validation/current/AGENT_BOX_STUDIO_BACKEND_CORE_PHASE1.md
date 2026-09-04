# Agent-Box Studio Backend Core — Phase 1 验证记录

> 状态：READY FOR PHASE 2（fake/offline vertical 范围内）
>
> 日期：2026-09-04　|　分支：`feat/studio-backend-core`
>
> 依据：`SESSION_HARNESS_SEPARATION.md`（Unified Session 设计）与
> `AGENTBOX_STUDIO_BACKEND_CORE_IMPLEMENTATION.md`（实施蓝图）Phase 0 + Phase 1 范围。

## 1. Baseline / branch / HEAD

- 仓库：`/home/maoqh/projects/agent-box`（worktree：`/home/maoqh/projects/agent-box-studio-backend-core`）
- 分支：`feat/studio-backend-core`（新建，追踪 `origin/main`）
- HEAD：`532cc993bcc95e4dae96176893f73bb95b68b2c7`
  （PR #66 merge commit，`git merge-base --is-ancestor` 已验证）
- 未执行任何 git add / commit / push / merge；工作区保持 dirty 等待人工 checkpoint。

## 2. 最终模块树

```text
src/agent_box/protocols/session/          # A: Root Session Protocol Pack（纯协议）
├── __init__.py                           #   公开导出 + SESSION_PROTOCOL_VERSION=1
├── contracts.py                          #   OfficialSessionV1/SessionRefFacts/CanonicalRecord/
│                                         #   TurnState/TurnExecutionLink/BindingSnapshot/
│                                         #   TurnWatermark/SessionEvent/TerminalOutcome/
│                                         #   SessionTurnInputV1(contract agent-box.session-turn-input@1)
├── failures.py                           #   typed 失败词汇（WriterConflict/RecoveryRequired/
│                                         #   ResyncRequired/IdempotencyConflict/...）
├── loss.py                               #   LossSeverity/TranslationLoss/LossReport
├── capabilities.py                       #   CapabilityState(READY/UNAVAILABLE/NOT_IMPLEMENTED)
├── codec.py                              #   HarnessSessionCodec SPI 骨架（probe/analyze/
│                                         #   materialize/read_incremental/decode/validate/compact）
└── store.py                              #   SessionStore SPI + DTO + typed contribution wrapper
                                          #   （kind agent-box.session.store@1）
tests/test_session_protocol.py            #   15 个纯度/词汇/包装器/目录查询测试

plugins/agent-box-session/                # B: Official Session Store plugin（API v2）
├── pyproject.toml / README.md
├── src/agent_box_session/
│   ├── schema.py                         #   store DDL（sessions/turns/events/leases/sagas/...）
│   ├── store.py                          #   SQLiteSessionStore + durable saga + recovery
│   ├── provider.py                       #   SessionInputResourceProvider（dispatch 输入面）
│   └── plugin.py                         #   descriptor + 注册（contract/provider/contribution）
└── tests/test_session_store.py           #   33 个测试

plugins/agent-box-workspace-local/        # C: Local Live Workspace plugin（API v2）
├── pyproject.toml / README.md
├── src/agent_box_workspace_local/
│   ├── provider.py                       #   local-live-workspace provider（live/unfrozen 语义）
│   └── plugin.py
└── tests/test_workspace_local.py         #   19 个测试

plugins/agent-box-studio/                 # D: fresh Studio service（API v2 shell）
├── pyproject.toml / README.md
├── src/agent_box_studio/
│   ├── config.py / auth.py / refs.py
│   ├── service.py                        #   StudioService（fake vertical 编排，brand-free）
│   ├── testing.py                        #   FakeTurnExecutionProvider（仅测试/offline 用）
│   ├── plugin.py / cli.py / __main__.py
│   └── server/（app.py, events.py）
└── tests/（conftest + 3 个测试文件）      #   30 个测试
```

## 3. Session Protocol 边界（Root）

- 纯协议：零 FastAPI/uvicorn/sqlite/pydantic/starlette import；零文件系统/数据库访问；
  零 concrete plugin import（subprocess 纯导入测试锁定）。
- 业务词汇边界：无 Codex/Claude/OpenCode/Hermes/Pi/Profile/Skill/MCP 字样
  （正则扫描测试锁定，与既有 runtime/credentials pack 同一规则）。
- 只定义：resolved session contract、Ref 语义、canonical record、turn 状态
  （仅 RUNNING/COMPLETED/FAILED/RECOVERY_REQUIRED，无投机状态机）、execution link、
  binding snapshot、watermark、event envelope、terminal outcome、Store/Codec SPI、
  Loss Report、capability truth、single-writer/recovery/idempotency 错误词汇、
  namespaced+versioned contribution kind 与 typed wrapper。
- Work Core 本轮零修改（见 §14）；protocols/session 只引用 Work Core 的中性 `Ref`。

## 4. Session Store authority（agent-box-session）

- 独立 SQLite 库（`<plugin_data_dir>/session-store.db`），WAL + synchronous=FULL；
  与 Work Core `agent-box.db` 是两个独立 authority，不做分布式 ACID 宣称。
- 持久化：sessions、session↔work_id（UNIQUE）、turns、turn↔execution_ids、
  binding snapshots（turns.binding_json）、canonical/event ledger（(session_id,seq) 主键 + event_id UNIQUE）、
  session watermark、idempotency receipts、writer leases、recovery operations、
  session saga ops、capability/diagnostic state。
- transcript 只存持久 ledger；进程重启后 session/turn/binding/events/receipt/watermark
  全部可恢复（测试锁定）。
- malformed/corrupt 状态 → `MalformedSessionState` typed fail，绝不当作空 Session（测试锁定）。
- 不用 `MAX(seq)` 猜权威：seq 由 sessions.event_seq_next 计数器在同一事务内分配；
  commit_turn 读取的是 terminal-once 约束下唯一的 terminal 事件存在性。
- diagnostics 只输出计数与 store_id/schema_version，不含宿主路径、prompt、credential、
  traceback（测试锁定）。
- Native Original/blob：fake vertical 不产生 native session 内容；协议保留
  `CanonicalRecord.native_original_ref` 与 Codec SPI 的 typed Ref 插槽；event payload
  只存有界字符串事实（如输入 sha256 digest），不塞原始内容。

## 5. Session = Work 映射

- `sessions.work_id` UNIQUE，`session_id_for_work`/`work_id_for` 双向精确读。
- durable saga（`create_session`）：INTENT（预生成并持久化 session_id+work_id+完整请求事实）
  → 创建/确认 Work（外部 authority，幂等）→ WORK_CREATED → 同一事务创建 Session row +
  SESSION_CREATED 事件 + receipt → COMPLETE；任一外部失败 → RECOVERY_REQUIRED
  （typed `RecoveryRequired` + recovery_operations 行）。
- 重试同 idempotency key 从最后持久状态前滚，绝不产生第二个 Work 或 Session（测试锁定）。

## 6. Turn = 1..N Execution 映射

- `turn_executions` (turn_id, execution_id) 主键，支持 1..N；本轮 fake vertical 每轮一个。
- `link_execution()` 公开 API 可为同一 Turn 追加 Execution（terminal 后拒绝）。
- begin-turn saga：INTENT（turn 事实+输入+binding 持久化）→ turn row + TURN_STARTED →
  TURN_CREATED → create/confirm Execution（幂等回调，execution_id 由 turn_id 确定性派生）→
  link + receipt → COMPLETE；execution 创建失败 → RECOVERY_REQUIRED，recover() 将 turn
  置 RECOVERY_REQUIRED，绝不伪造 terminal（fault-injection 测试锁定）。

## 7. 跨数据库 saga/recovery 语义

- 两个 authority 之间只有：幂等回调（work_exists / create_work / create_execution，
  均由 plugin 接线到真实 Work Core）+ 每步持久 saga 状态 + 恢复前滚/回滚。
- 崩溃窗口由测试 seam（fault_hook）注入验证：work 创建后崩溃 → 恢复后无重复 Work；
  execution 创建后崩溃 → recover() 前滚或 turn → RECOVERY_REQUIRED。
- 结果只有可证明的 COMPLETE / ROLLED_BACK / RECOVERY_REQUIRED，无 ambiguous 伪装。

## 8. Single-writer 结果

- `writer_leases` 表 + 所有写操作 `_require_lease` fail-closed；第二 writer
  `SessionWriterConflict`；8 线程并发抢租约恰好 1 胜（测试锁定）。
- 不同 Session 并行写互不影响（测试锁定）；session 存在 RUNNING turn 时禁止新 turn。
- 崩溃遗留 lease 通过 `break_writer_lease`（recovery API）显式解除并记录。

## 9. Idempotency 结果

- create_session / begin_turn 均 receipt 持久（scope + 结果事实）。
- 同 key 重放返回相同 session/turn/execution（`replayed=True`），不重复创建；
  key 跨 session/操作复用 → `IdempotencyConflict`（测试锁定）。

## 10. Durable event log / watermark 结果

- ledger append-only；(session_id,seq) 主键 + event_id UNIQUE；seq 事务内单调分配。
- terminal-once：TURN_TERMINAL 每 turn 唯一，二次记录 → `TerminalAlreadyRecorded`。
- commit_turn 单事务完成：封存 turn + 追加 TURN_COMMITTED + watermark 推进到该事件 seq；
  commit 前 watermark 不动（测试锁定）；completed turn 永不回到 running。

## 11. WS replay / gap 结果

- `after=seq` 严格从持久 ledger 重放，无重复；`after` 超过 committed watermark →
  typed `resync_required`（WS 消息 + close 4409）；负 cursor → typed `invalid_cursor`。
- live tail 直读 ledger（允许观察 running turn 的 in-flight 事件）；若 turn 最终未提交，
  重连时严格门禁强制 resync —— ledger 始终是唯一权威，无内存 ring buffer 依赖。

## 12. Live Workspace provider 语义（agent-box-workspace-local）

- `provider_id=local-live-workspace`、`contract=agent-box.workspace@1`、`mode=live`、
  `mutability=externally_mutable/unfrozen`；与 `git-workspace`（detached/exact）完全独立，
  未复用其 id 或语义。
- register：canonicalize 真实用户目录，project_id=路径 sha256 前缀；resolve 返回真实目录
  （不复制、不建 worktree、Harness 修改立即落在用户目录 —— 测试锁定）。
- Ref metadata 与 source_digest（`live-unfrozen:` 前缀）显式携带 live/unfrozen 事实；
  冒充 frozen 的 Ref fail closed。
- baseline/after observation：Git 项目取 HEAD + status digest；非 Git 项目有界 tree
  inventory（files/depth/bytes/time 硬边界，超限 → coverage=partial，测试锁定）。
- 变更归因：live 模式一律 `source=shared_live_workspace`（测试锁定）。

## 13. Live Workspace security/confinement

- API 只接受注册 project_id，无任意路径文件操作入口（测试锁定）。
- root 移动/被 symlink 替换/删除 → `ProjectIdentityConflict` fail closed；
  注册目录内 symlink 只计数跳过不跟随；inventory 有 `..`/escape 防护；
  错误 project identity（未知/他 provider）→ typed fail（测试锁定）。
- 不读取 credential / native-home；注册表只存用户显式注册的路径。

## 14. Work Core / schema / migrations diff

- `git diff origin/main -- src/agent_box/work_core src/agent_box/migrations
  src/agent_box/resource_contracts src/agent_box/extensions` → **空**（零修改）。
- Root 侧新增仅：`src/agent_box/protocols/session/`（纯协议）与
  `tests/test_session_protocol.py`；`pyproject.toml` preview extra +3 行。
- Work Core ontology / 既有语义 / migrations 全部未触碰。

## 15. Fake transaction vertical（调用链）

`POST /api/v1/sessions/{id}/turns` → StudioService.run_turn：

```text
acquire writer lease
→ live workspace baseline observation
→ freeze BindingSnapshot（harness provider/version、workspace ref/mode、session watermark）
→ durable begin-turn saga（turn row + 幂等 execution 创建 + link）
→ Work Core dispatch_execution（freeze→resolve→preflight→start，经 Registry；
   输入 = SessionTurnInputV1 Ref + WorkspaceV1 Ref，经两个 ResourceProvider 解析）
→ FakeTurnExecutionProvider 确定性 observations → TURN_MESSAGE/WORKSPACE_FACT/TURN_RESULT
   durable events（TURN_INPUT 只记 sha256 digest，不落原文）
→ Work Core apply_finalization（terminal projection + workspace read-back observation，
   result=UNVERIFIABLE，detail 标注 source=shared_live_workspace）
→ live workspace after-observation → WORKSPACE_AFTER event（changed/source/digest）
→ record_terminal（terminal-once）→ commit_turn（封存 + watermark）→ release lease
→ REST exact read / WS cursor replay 全链可验证
```

- Fake provider 只存在于 `agent_box_studio.testing`，生产 entry point 不注册；
  生产 capabilities 如实报告 `execution: UNAVAILABLE`（真实 serve 进程验证）。
- provider start 抛错 → turn 以 FAILED terminal 封存（不伪造成功）、lease 释放、
  session 可继续接新 turn（测试锁定）。
- 编排器通过 capability `session_turn_execution` 发现 provider，无任何品牌分支。

## 16. API / capability surface / auth result

- 已实现：`GET /api/v1/health`（匿名，仅 liveness —— 显式决定并测试）、
  `GET /api/v1/capabilities`、`POST/GET /api/v1/sessions`、`GET /api/v1/sessions/{id}`、
  `GET /api/v1/sessions/{id}/transcript`、`POST /api/v1/sessions/{id}/turns`、
  `GET /api/v1/sessions/{id}/turns/{turn_id}`、`WS /api/v1/sessions/{id}/events?after={seq}`、
  `GET /api/v1/sessions/{id}/recovery`、`POST /api/v1/ws-ticket`。
- capability truth：permissions / cancel / compact = `NOT_IMPLEMENTED`（不伪装 READY、
  不吞错空实现）；无 fake provider 时 execution = `UNAVAILABLE` 且 turns fail closed（409）。
- auth：REST Bearer（`secrets.compare_digest` 恒时比较）；WS 短期一次性 ticket
  （30s TTL，经认证 REST 签发；单次使用/过期/伪造均拒绝）；loopback 亦强制 token
  （真实进程 curl 验证 401）；CORS 默认无中间件（浏览器默认同源拒绝），仅显式配置放行；
  token 仅启动时 stderr 打印一次（生成模式），不入日志/错误响应（测试锁定）。
- 未实现账号系统 / RBAC / OAuth（按边界要求）。

## 17. Catalog / API v2 discovery

- `PLUGIN_API_VERSION` 保持 2；三个新插件均以 API v2 entry point 注册
  （`session` / `workspace-local` / `studio`）。
- Session Store 以 generic contribution `agent-box.session.store@1` /
  `official-session-store` 进入 Catalog；Catalog 只按 kind/component_id 查询
  （无业务字段 —— 测试锁定）；typed wrapper `session_store_contribution()`。
- clean Preview venv：15 个插件全部 READY；Session Store / Live Workspace /
  Session-inputs provider 全部可发现；contract `agent-box.session-turn-input@1` 注册成功。

## 18. Tests（本轮全部执行）

| 套件 | 结果 |
|---|---|
| Root tests（含 tests/integration/native，54 项） | 159 passed |
| 新增 Root protocol 测试 | 15 passed |
| agent-box-session | 33 passed |
| agent-box-workspace-local | 19 passed |
| agent-box-studio（auth/capabilities、sessions+vertical、WS replay） | 30 passed |
| harnesses 420 / acp 40 / runtime-local 6 / sandbox-bwrap 12 / terminal-session 3 / skills 8 | all passed |

关键锁定项：session↔harness 解耦、work_id 稳定、幂等重试、并发单写者、
terminal-once、watermark 事务性、重启恢复、WS replay/gap、traversal/symlink/
identity fail-closed、live mutation 可见性、崩溃窗口无 dangling mapping、
capability truth、Root-only 纯净性。

其他：`compileall` 通过；`git diff --check` 干净；tests/integration/native
在 bwrap/tmux 能力缺失环境下按既有规则通过（skip 语义）。

## 19. Wheels / clean install / discovery / doctor

- 全部 12 个 wheel 构建成功：root + 9 个既有官方插件 + 新增
  `agent-box-session` / `agent-box-workspace-local` / `agent-box-studio`
  （沿用官方插件命名/版本约定 `2.0.0a1`，无偏离）。
- Root-only clean venv（仅装 root wheel）：import OK；`SESSION_PROTOCOL_VERSION=1`；
  `PLUGIN_API_VERSION=2`；`agent-box plugins list --json` → `[]`；doctor exit 0
  无 traceback；root wheel 内容扫描确认无 concrete Session Store/Studio/Workspace 实现。
- Preview clean venv（装全部 12 wheel）：15 插件全 READY；doctor exit 0 无 FAILED；
  三个新插件 + 全部 entry points 可发现；`agent-box-studio serve` 真实进程启动，
  `GET /health` 200、无 token 访问 capabilities 得 401、带 token 得诚实 capability JSON。
- CI：`.github/workflows/ci.yml` plugins 矩阵新增 session / workspace-local / studio
  （studio 依赖 `[test]` extra 提供 TestClient 运行时）；wheels job 构建清单已加入
  三个新插件。

## 20. Secret / path / boundary scans

- 新代码（session / workspace-local / studio / protocols/session）扫描：
  无 credential/API-key/secret 常量；无宿主绝对路径（如 /home/...）硬编码；
  无 vendor API 品牌词；token 相关引用仅存在于 auth 模块与其测试。
- 本轮未读取 credential、未执行真实模型请求。

## 21. Exact git status（未 add/commit）

```text
 M .github/workflows/ci.yml
 M pyproject.toml
 M src/agent_box/protocols/credentials/__pycache__/__init__.cpython-312.pyc  # 运行测试再生的 .pyc（上游误跟踪）
 M src/agent_box/protocols/credentials/__pycache__/protocol.cpython-312.pyc  # 同上
?? docs/validation/current/AGENT_BOX_STUDIO_BACKEND_CORE_PHASE1.md
?? plugins/agent-box-session/
?? plugins/agent-box-studio/
?? plugins/agent-box-workspace-local/
?? src/agent_box/protocols/session/
?? tests/test_session_protocol.py
```

（`.pyc` 为上游仓库误跟踪的编译产物，运行测试后自动再生；非本实现的产品文件。）

## 22. Remaining limitations（诚实清单）

1. 本轮仅 fake/offline vertical：无任何真实 Harness Session Codec、无 native session
   读写、无 preflight/Loss Report 消费路径（SPI 已就位）。
2. permission / cancel / compact / Git / Terminal / Files / Profiles / Skills /
   Attachments API 均未实现，capabilities 如实报 NOT_IMPLEMENTED。
3. Native Original blob 加密存储未实现（fake vertical 无 native 内容）；schema 与
   协议保留 typed Ref 插槽。
4. Workspace 仅 live 模式；managed worktree、project CRUD API、文件操作 API 未做。
5. Studio 前端换绑、Domain Ports、Tauri 集成完全未动（仍在 Studio 仓库后续阶段）。
6. WS live tail 采用 1s 轮询 + 进程内通知；跨进程事件总线未做。
7. Session Store 为进程内单连接（RLock 串行）；多进程写同一 store 未支持。
8. 未实现 Session 级 compaction checkpoint（协议类型已定义）。
9. doctor 对 studio 插件 descriptor 版本与 distribution 版本一致（无 WARNING），
   但既有插件的历史 WARNING 维持原状。

## 23. READY / NOT READY

**READY FOR PHASE 2**（单 Harness 证明阶段）——在上述限制内，Phase 1 验收标准
（蓝图 §15）1–15 逐条满足；未宣称任何超出本轮范围的完成事实。

---

## 24. 由 Phase 1 closure 修正（2026-09-04，Phase 2 记录追加）

Phase 2 对本报告的 A10 审计项做了事实修正：`httpx2>=2.0` 并非依赖笔误。
当前 starlette 1.6 的 TestClient 明确 import 并要求 `httpx2` 包；Phase 2 将
约束收窄为 `httpx2>=2.0,<3`，并在 httpx2 2.12.0 上通过全部 studio 测试。
本报告其余结论以 Phase 2 记录
（`AGENT_BOX_STUDIO_FIVE_HARNESS_BACKEND_PHASE2.md`）的 Gate A 闭合清单为准。
