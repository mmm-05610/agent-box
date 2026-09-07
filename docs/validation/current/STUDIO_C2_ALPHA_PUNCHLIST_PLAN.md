# Studio C2 Alpha Punch-List — 实施文档（子代理执行版）

日期：2026-09-07
执行者：一个实施子代理（本工作区 `/home/maoqh/projects/agent-box-studio-codex-vertical`）
状态：APPROVED FOR IMPLEMENTATION（基于 2026-09-07 主会话实地审计）

## 0. 基线（先读，不要重测架构）

- 分支 `feat/studio-codex-product-vertical`，dirty worktree，**禁止任何 git 写操作**。
- venv：`.venv/bin/python`；pytest 带 `pytest-timeout`，长测试一律加 `--timeout=120`。
- 测试基线：
  - `plugins/agent-box-harnesses/tests`：**500 passed / 4 skipped**（勿回归）；
  - `plugins/agent-box-studio/tests`：**173 passed / 1 failed**（唯一 failed 是本文件 Slice 1 修的竞态 flake）；
  - `plugins/agent-box-workspace-wsl` 已 editable 安装；`agent-box-runtime-wsl` 已安装。
- 关键事实：Rust HostBridge handler（对端 wire 权威）只实现了 `connectionResolve` 和
  `workerEnsure`；其余 16 个 op 返回 `INVALID_OPERATION`。Python 侧一切远程执行
  attempt 只能诚实 fail-closed（`ExecutionStartRejected`），**绝不伪造成功**。

## 1. 纪律（违反任何一条 = 立即停止并报告）

1. 禁止：`git add/commit/push/merge/reset/checkout/clean/stash`；运行任何 cargo 命令；
   触碰任何 Rust 文件或 target；修改核心 `src/agent_box/**`；修改
   `plugins/agent-box-harnesses/**`、`plugins/agent-box-session/**`。
2. 允许修改的文件（所有权账本）：
   - `plugins/agent-box-studio/src/agent_box_studio/{service.py, cli.py, schemas.py}`
   - `plugins/agent-box-studio/src/agent_box_studio/server/app.py`
   - `plugins/agent-box-workspace-wsl/src/agent_box_workspace_wsl/provider.py`
   - `plugins/agent-box-studio/tests/**`（可新增测试文件）
   - `plugins/agent-box-workspace-wsl/tests/**`
3. Test-first：每个切片先写 RED（记录失败输出与原因），再最小实现，再 GREEN。
   不得删除/弱化既有断言；不得给生产路径加 fake 或 skip。
4. 秘密边界：不读/打印/哈希任何 credential 内容；不发任何真实模型请求。
5. 构造 workspace-wsl provider 手工注册的测试，必须用
   `build_extension_environment(..., entry_points=production_entry_points(exclude=frozenset({"workspace-wsl"})))`
   （conftest.py 已有该 helper），并注册**同一个生产类**，不是测试替身。
6. 单个切片超过 20 分钟没有 RED/接口/生产链路进展：停下，写清楚卡点并退出。

## 2. Slice 1 — cancel 终态 evidence 同步（先做，它是套件唯一的红）

### 已确诊的根因（不要再重新诊断）

`service.py` `_observe_until_terminal` 的 terminal 块：

```python
evidence["outcome"] = terminal_outcome.value          # ← 先写 "failed"
if run.cancel_requested:
    if terminal_outcome is not TerminalOutcome.SUCCEEDED:
        terminal_outcome = TerminalOutcome.CANCELLED  # ← 后转化成 cancelled
        evidence["cancel_reason"] = run.cancel_reason or "requested"
        # evidence["outcome"] 仍是 "failed" —— 不同步
self._store.record_execution_terminal(turn_id, outcome=terminal_outcome, evidence=evidence, ...)
```

随后 `_finalize_and_commit` 用 `recovery_facts.get("outcome")` 作为提交终态权威，
于是取消的 Turn 有 ~1/16 概率被提交成 `failed`。实测证据（recovery_facts 快照）：
`{'exit_code': '-15', 'exit_source': 'process-poll', 'outcome': 'failed', 'run_outcome': 'cancelled'}`。

### RED（确定性，不靠时序）

新测试加到 `plugins/agent-box-studio/tests/test_cancel_and_permissions.py`：
构造一个 provider：`observe()` 永远返回空、`dispatch_state` 永远返回
`{"state": "terminal", "exit_code": -15}`；submit 后、worker 观察到终态前，直接置
`service._runs[turn_id].cancel_requested = True; .cancel_reason = "test"`（inline worker 模式下
在 submit 返回后立即置位即可，轮询路径会先于 cancel 分支看到 process-poll 终态）。
断言 `turn.terminal_outcome.value == "cancelled"`。
当前代码该断言失败（显示 "failed"）→ RED 证据。

### GREEN

在 cancel 转化分支内补一行：`evidence["outcome"] = terminal_outcome.value`。
不改任何其他语义（SUCCEEDED 竞态保持原样的规则不动）。

### 验收

`pytest plugins/agent-box-studio/tests/test_cancel_and_permissions.py -q --timeout=120`
全绿；再把 studio 全量套件跑一遍，应为 **0 failed**（本切片后）。

## 3. Slice 2 — `--sidecar` 生产接线：裸 client → HostBridgeHostAuthority

### 现状

`cli.py` `main()` 在 `--sidecar` 时 `host_operations = HostBridgeClient(bootstrap)`，
直接传给 `create_app`。裸 client 没有 `transport_for_wsl`，所以 attempt transport
不可用（fail closed，但接缝断着）。

### RED

新测试（建议 `tests/test_sidecar_bootstrap_wiring.py`）：
从 `cli` 导入（或新增）一个纯函数 `sidecar_host_operations(stream)`：读 stdin 帧、
构造 `HostBridgeClient` 并包进 `HostBridgeHostAuthority`。断言返回对象的
`resolve_connection` 可用且 `transport_for_wsl` 可调用。对当前 `main()` 内联逻辑
该函数不存在/不满足 → RED。测试用 `io.BytesIO` 喂合法 bootstrap 帧
（参照 `test_host_bridge_bootstrap.py` 的 `_frame` helper）。

### GREEN

`cli.py`：抽出 `sidecar_host_operations(stream)` 函数并在 `main()` 使用：

```python
host_operations = sidecar_host_operations(sys.stdin.buffer) if args.sidecar else None
```

### 验收

新测试 GREEN；`test_host_bridge_bootstrap.py` 与 `test_c22_host_bridge_vertical.py`
仍全绿（不允许回归）。

## 4. Slice 3 — 远端 session 的 REST 路由（GUI 必需）

### 需求

GUI 已保存 WSL Project 后，需要经 REST 创建远端 Session。`service.create_remote_session`
已存在，缺的是 HTTP 面。

### RED

新测试 `tests/test_remote_session_api.py`（复用
`test_c22_host_bridge_vertical.py` 里的 `RustShapedBridge` 思路：可用 import 或复制精简版）：

1. `POST /api/v1/sessions`，body：
   `{"idempotency_key", "title", "connection_id": "conn-wsl-1", "connection_revision": 3,
     "project_identity": "project-wsl-1", "project_id": "project-wsl-1",
     "remote_path": "/home/dev/project"}` → **201**；
2. 响应含 `workspace_mode: "live"`、`workspace_provider: "wsl-live-workspace"`、
   `connection_id`、`connection_revision`；
3. `GET /api/v1/sessions` 列表含该 session 且带 `project_id`；
4. 本地路径行为不回归：只传 `project_path` 的旧请求仍 201；
   同时传 `project_path` 和远端字段 → 400 typed 错误。

### GREEN

- `schemas.py`：`CreateSessionRequest` 增加可选
  `connection_id/connection_revision/project_identity/remote_path`（`project_id` 已有）。
- `server/app.py` `create_session` 路由：远端字段齐备时调
  `service.create_remote_session(...)`，响应补
  `workspace_provider`/`connection_id`/`connection_revision`/`project_id`；
  校验互斥（本地 XOR 远端），违反 → 400（用 `_error_response`）。
- `list_sessions`/`get_session` 响应补 `project_id`
  （来源 `session.project_identity`，不新增秘密面）。

### 验收

新测试 GREEN；`test_provider_rest_facade.py`、`test_sessions_and_vertical.py`、
`test_error_envelopes.py` 全绿。

## 5. Slice 4 — 已保存 WSL Project 的枚举（GUI 项目选择器）

### RED

`plugins/agent-box-workspace-wsl/tests/test_workspace_wsl.py` 新增：
注册两个 project 后，`provider.list_remote_projects()` 返回
`[{"project_id", "connection_id", "connection_revision", "remote_path"}, ...]`（排序稳定）。
未注册 → 空列表。当前方法不存在 → RED。
studio 侧 `tests/test_remote_session_api.py` 加 REST 断言：
`GET /api/v1/remote-projects` → 200 且返回同一形状。

### GREEN

- `workspace-wsl/provider.py`：实现 `list_remote_projects()`
  （从 `self._projects` 派生，只含非秘密身份字段）。
- `service.py`：`list_remote_projects()` 委托 workspace provider（不是 wsl-live 提供方时
  返回 `{"remote_projects": []}`）。
- `server/app.py`：`GET /api/v1/remote-projects` 路由（鉴权同其他路由）。

### 验收

两个插件的相关测试全绿。

## 6. Slice 5 — readiness 增加 remote 组件真相（最小面）

### RED

`tests/test_remote_session_api.py` 追加：app 以 bridge authority 构建时，
`GET /api/v1/readiness` 响应含 `"remote"` 节，且
`remote["host_bridge"] == "available"`（host_operations 为
`HostBridgeHostAuthority` 时）；裸 client/无 host_operations 时为
`"unavailable"`。响应中不得出现 capability 值或 host 路径。

### GREEN

`service.readiness()` 增加一小节：`host_operations` 的类型判定
（`HostBridgeHostAuthority` → available；其他 → unavailable），纯类型事实，
不探测网络、不读路径。

## 7. 明确不做（超出本仓库当前可闭环范围 — 写下来防止子代理越界）

- 真实 Codex 经 WSL 启动（`process.spawn` 的 argv/cwd/env 字段、`view.prepare`
  manifest 字段、designated secret frame op、`events.read` 载荷定义 —— **Rust 侧缺失**，
  由另一会话裁决；Python 侧保持 typed `HOST_BRIDGE_PROCESS_SPAWN_FACTS_ABSENT`
  诚实失败）。
- C2.4 native resume 重启矩阵、C2.5 conformance、C3 GUI/打包。
- SSH/Docker/其他 harness/任何新通用框架。

## 8. Rust Build Owner 的移交信息（只读给 Rust 会话，本仓库不改）

缺口清单（对 `src-tauri/src/host_bridge.rs` 的 `HostBridgeOperation`）：

1. `ProcessSpawn { process_id }` 缺 spawn 事实字段（argv/cwd/declared-env/executable）；
2. `ViewPrepare {}` / `ViewPutChunk` 缺 manifest/chunk 载荷定义；
3. op 集缺 designated secret frame（执行范围 secret 一次性投递）；
4. `EventsRead` 缺事件载荷契约（观测帧如何编码 harness 事件）。

建议 Rust 验证命令（由 Rust Build Owner 执行）：
`cargo test -p <desktop-crate> host_bridge::` 与
`cargo test -p <desktop-crate> remote_worker::`（具体 crate 名以 Rust 工作区为准）。

## 9. 最终验收（子代理完成后的证据要求）

1. `pytest plugins/agent-box-studio/tests -q --timeout=120` → 全绿（预期 ≈180 passed）；
2. `pytest plugins/agent-box-harnesses/tests -q --timeout=120` → **500 passed / 4 skipped**（不回归）；
3. `pytest plugins/agent-box-workspace-wsl/tests plugins/agent-box-runtime-wsl/tests -q --timeout=120` → 全绿；
4. `git diff --check` 干净；
5. 报告：逐切片 RED 证据摘要、GREEN 计数、修改文件清单、未做事项（引用第 7 节）。
