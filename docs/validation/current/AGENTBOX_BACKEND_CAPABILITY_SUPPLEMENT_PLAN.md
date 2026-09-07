# AgentBox 后端能力补充方案（Backend Capability Supplement Plan）

日期：2026-09-07
状态：**BACKEND SUPPLEMENT PLAN APPROVED**（2026-09-07——随权威收口，
v2：并入前两轮全部修正 + C2 远程垂直接线 + fixture 自库化 + 回归清单）
执行者：后端实施智能体（两阶段：Phase 1 = 本方案 P0–P8；Phase 2 =
`AGENTBOX_C2_REMOTE_CODEX_VERTICAL_PLAN.md` V1–V7）
前置依赖声明：Rust R3 以本方案 **P0** 完成并通过 pytest 为联合门前置。

## 0. 基线与纪律

- 测试基线：studio 185 / harnesses 500+4 / wsl 32（2026-09-07 复核）；
  每门不得回归；
- 禁 git 写操作；`pytest --timeout=120`；每切片 RED→GREEN；禁止弱化断言；
- 协议/wire contract 矛盾 → 停止回报（合同 FROZEN）；
- 秘密边界：不读/打印/哈希 credential；不发真实模型请求。

## 1. 文件所有权（精确；含范围豁免）

```
常规可写：
  plugins/agent-box-studio/src/agent_box_studio/{cli.py, host_bridge.py,
    schemas.py, server/app.py, service.py}
  plugins/agent-box-studio/tests/**（含 fixtures/，见 P1）
范围豁免 A（launch_defaults，增量 schema 兼容）：
  plugins/agent-box-harnesses/src/agent_box_harnesses/generic/
    profile_store.py, profile_envelope.py
范围豁免 B（C2 远程垂直，方案见 AGENTBOX_C2_REMOTE_CODEX_VERTICAL_PLAN.md）：
  plugins/agent-box-harnesses/src/agent_box_harnesses/generic/
    execution_provider.py（provider_transport 分支）, remote_attempt.py（新）
  plugins/agent-box-harnesses/src/agent_box_harnesses/codex/continuation.py
范围豁免 C（saga/accounts）：
  plugins/agent-box-model-providers/src/agent_box_model_providers/
    accounts.py（get/update）, setups.py（新）, validation.py（locator 迁移）
  对应各插件 tests/**
禁改：src/agent_box/**（核心）、codex 适配器其余文件、runtime-wsl/
workspace-wsl provider（已就绪）、Rust、前端
回归门：model-providers / agent-box-session / agent-box-workspace-wsl /
agent-box-harnesses / 根 tests 全部不回归
```

## 2. 切片

### P0 — SidecarControlBootstrap 消费端（**Rust R3 联合门前置**）

**第 0 步（Phase 2 开工前执行一次）**：同步冻结执行包到本仓
`docs/validation/current/frozen/`（从桌面仓 docs/design/ 复制：C2 远程垂
直方案、凭据冻结、wire contract v0.4、接口协议）+ 生成 `frozen/MANIFEST
.json`（逐文件 sha256）；**Phase 2 运行中只读本仓副本**；主会话更新桌面
仓文档时在检查点重新同步并核对 digest（不一致 → 停止重同步）。

`cli.py serve --sidecar`（合同 = Rust 方案 §2，含管道纪律七条）：
1. stdin 顺序两帧：frame① `agent-box.sidecar-control@1`（bearer+dataDir，
   4 字节大端长度+JSON，≤4 KiB）→ frame② HostBridge bootstrap（现有
   `read_host_bridge_bootstrap` 原样复用）；
2. **先读两帧，再绑定并开始接受 HTTP**；绑 `127.0.0.1:0`；
3. bearer 仅内存（不落盘/不打印/不进异常消息）；路由照常 require_token；
4. **stdout 专用** ready/error 帧（`sidecar-ready@1`/`sidecar-error@1`，
   schema 见 Rust §2）；ready 后 stdout 永久静默；日志全走 stderr；
5. 独立任务监视 **stdin EOF → 自行退出**；
6. Harness 子进程不继承控制 stdin/stdout。

测试：`plugins/agent-box-studio/tests/test_sidecar_control_bootstrap.py`
（两帧消费、bind :0、ready 帧、无 token 401、bearer readiness 200、stdin
EOF 自退、截断帧拒启、frame① 损坏拒启）。

### P1 — golden vectors（自库化；**移除手写临时 fixture**）

- fixture 权威 = Rust R1 创建并**入库桌面仓**
  `src-tauri/tests/fixtures/host_bridge_golden_vectors.json`；后端智能体
  将其**复制入本仓** `plugins/agent-box-studio/tests/fixtures/
  host_bridge_golden_vectors.json`（随本仓提交）；
- **同步核对测试**：fixture 顶部 `{"schema": "agent-box.host-bridge-golden@1",
  "version": N, "sha256": <对载荷体的 sha256>}`——测试断言 schema/version
  匹配且 sha256 一致；不一致 → fail（防漂移）；
- **禁止手写临时 fixture**：Rust fixture 就绪前，本切片以
  `[pending-shared]` 标记跳过（不是手写样例冒充）；
- 测试：`plugins/agent-box-studio/tests/test_host_bridge_golden.py`
  （`HostBridgeClient` 每 op 请求编码/响应解码与 fixture 字节级一致）。

### P2 — launch-preview + submitTurn 扩展（协议 §2.1–§2.3）

统一 `LaunchSelection`（三段式 Ref + continue_from_turn_id + 非权威
assertions）；`POST /api/v1/sessions/{id}/launch-preview`（只读四不：
不建 Turn/不启 worker/不发模型请求/不落库）；blocker 词表 10 个；
**resolution_digest 冻结算法**（canonical JSON 黑白名单见协议 §2.2）；
submit 重算校验（不符 → 409 `LAUNCH_PREVIEW_STALE`）；submitTurn 增
`selection`+`resolution_digest`（可选）；**202 幂等 schema**
`{turn_id, execution_id, status, replayed}`（同 key 精确重放；异输入 →
409 `IDEMPOTENCY_INPUT_MISMATCH`）。
测试：`tests/test_launch_preview.py`（只读性/stale/幂等重放/断言不匹配）。

### P3 — Session 创建收敛（协议 §2.4）

请求仅 `{idempotency_key, title, project_id}`；workspace registry 解析
元组 + Host receipt（该 revision）验证；未注册/不一致 →
`SESSION_REFERENCE_CONFLICT`；现 connection_*/remote_path/project_identity
输入移除（→ 400）。
测试：`tests/test_remote_session_api.py` 扩展（伪 identity 拒/registry 驱
动成功）。

### P4 — `GET /api/v1/sessions?project_id=`

服务端过滤；测试并入 P3 文件。

### P5 — Profile launch_defaults（协议 §2.5；豁免 A）

顶层 `launch_defaults`（`preferred_provider_config_ref{id,revision,digest}`
+ `preferred_model`）；payload 字段名保留；四条校验（同 Harness →
`PROFILE_DEFAULT_MISMATCH` / eligibility / 不可变 revision / 稳定 fallback
=config_id 字典序第一）。
测试：`tests/test_profile_launch_defaults.py`。

### P6 — provider-setups durable saga（协议 §2.6；豁免 C）

POST + `GET /api/v1/provider-setups/{setup_id}`；状态机（含
`awaiting_credential` 恢复态、`SETUP_CREDENTIAL_ALREADY_SET` 不覆盖、
幂等摘要不含 credential、journal 零 material）；SQLite 持久化
（`setups.py`）。
测试：`plugins/agent-box-model-providers/tests/test_setup_saga.py` +
studio 路由测试。

### P7 — provider-accounts get/update + account 级凭据写入口

`GET|POST /api/v1/provider-accounts/{id}`；
`PUT /api/v1/provider-accounts/{id}/credential`（write-only，presence 回显）。
测试：`tests/test_provider_rest_facade.py` 扩展。

### P8 — 杂项对齐

REST transcript 事件补 `created_at`（与 WS 同形）；Permission respond 重
复 → `REQUEST_ALREADY_ANSWERED`（核对+RED）；readiness remote 节随 C2.1
分阶段（🔒 标记）。
测试：`tests/test_error_envelopes.py` / `test_transcript_turns_projection.py`
扩展。

### P9 — Golden/契约回归护栏（新增）

`tests/test_doc_contract_guards.py`：协议 §1.1 端点总账中"已实现"行的
路由存在性断言（防实现与合同漂移）——路由表内嵌于测试常量，注释指向
协议文档版本号。

## 3. C2 远程垂直（Phase 2）

**全部切片/测试名/所有权见
`AGENTBOX_C2_REMOTE_CODEX_VERTICAL_PLAN.md`（APPROVED）**：V1 20-op 客户
端 → V2 view 物化 → V3 凭据投影（凭据冻结 §7 反例）→ V4 remote attempt
provider（豁免 B 文件）→ V5 真 Codex 垂直 → V6 capture/resume（typed
incompatibility）→ V7 两轮 cold-resume（真机，派工单 G8）。
本方案 §1 豁免 B 即为其文件授权；**cold resume 所需后端切片**（output
set-once 持久化、T2 selection.continue_from_turn_id 解析）已含于 P2 与
V6。

## 4. 验收门

| 门 | 内容 | 命令 |
|---|---|---|
| M-P0 | SidecarControlBootstrap（R3 前置） | `pytest plugins/agent-box-studio/tests/test_sidecar_control_bootstrap.py` |
| M-P1 | golden（自库+同步核对） | `pytest plugins/agent-box-studio/tests/test_host_bridge_golden.py` |
| M-P2/P3 | preview/幂等/session 收敛 | `pytest plugins/agent-box-studio/tests/test_launch_preview.py plugins/agent-box-studio/tests/test_remote_session_api.py` |
| M-P5–P7 | defaults/saga/accounts | 各写死测试文件 |
| M-P9 | 合同护栏 | `pytest plugins/agent-box-studio/tests/test_doc_contract_guards.py` |
| 终检 | 全量 + 回归 + diff | `pytest plugins/agent-box-studio/tests -q --timeout=120`；`pytest plugins/agent-box-harnesses/tests -q --timeout=120`；`pytest plugins/agent-box-model-providers/tests plugins/agent-box-session/tests plugins/agent-box-workspace-wsl/tests plugins/agent-box-runtime-wsl/tests -q --timeout=120`；`pytest tests -q --timeout=120`（根）；`git diff --check` |
