# Work Order 39 — 中立 Server 业务边界：执行证据

状态：`SERVER_BOUNDARIES_READY_FOR_HARNESS`（阶段 A–D 完成；该状态不是后端全产品 GREEN）。
分支：`feature/server-harness-extension-v1`（自 219f8b9 创建，包含 b415eb2 历史；保留
`feature/server-http-codex-r1` 不动）。基线 b415eb2。

## A — 前置读取与版本记录

- 分支创建前确认工作树干净；历史分支未 reset。
- 只读消费的 Desktop 权威文档（发布源 `/home/maoqh/projects/agent-box-desktop-next/docs/desktop-product-delivery/`）：
  - `contracts/core-semantics-v1.md`（core-semantics/1，APPROVED_SEMANTICS 2026-09-14）
    sha256 `de67f3c6…721d21`
  - `contracts/index.md`（CORE_SEMANTICS_APPROVED_WIRE_PENDING）
    sha256 `7d96eb99…9736b4`
  - `handoff-policy.md`（APPROVED_HANDOFF_POLICY 2026-09-14）sha256 `f26102f3…3697d`
- 前端执行工作树实际状态（只读）：`/home/maoqh/projects/agent-box-desktop-next-wsl-round1`
  - `docs/desktop-product-delivery/status.md` sha256 `51ea73f4…47dd`：P07 检查点 1 完成，
    **wire 尚未产出**（`wire_version/schema_digest: 尚无`），frontend_implementation=IN_PROGRESS，
    writer_lease=ACTIVE。
  - `work-orders/P07-core-contract-and-handoff.md` sha256 `23073c52…5753`：检查点 2 才编制
    `contracts/wire-v1/` 候选。
- 结论：当前无可复用 P07 wire 候选。39 不私造产品协议；沿用 37 已有 HTTP 合同作为后端事实
  候选，等前端 P07 检查点 2 产出后在 41 做机械核对与锁定（本仓 41 将按工单在
  `protocols/desktop/` 编制候选并交换）。

## B — 幂等接受缺陷：反例→修复→回归

- 反例（先于重构，针对 39 前生产代码）：
  `scripts/server-round1/repro_39_duplicate_accept.py`，捕获输出
  `repro-duplicate-accept.txt`。两个并发同键请求都通过 pre-commit 幂等读（barrier 固定窗口）
  后，`application/service.py` 对两者都调用 `execution.accept`：

  ```text
  accept invocations: 2 for turns ['turn_1072528f246549eb9a4f2a17befde0f0']
  DEFECT CONFIRMED: one idempotency key dispatched the same Turn twice
  ```

  与 37 独立验收记录的"同键并发两次 accept 状态矛盾"一致。
- 修复：`sessions/repository.py::create_turn` 在**同一** `BEGIN IMMEDIATE` 事务内完成
  Turn 插入与幂等行插入，并返回 `claimed` 标志；只有赢得插入的请求者派发
  （`sessions/service.py::create_turn`），重放返回同一身份且不再派发。取消路径的
  `record_cancel_request` 事件先于端口调用落库；端口 cancel 本身幂等，同键并发取消
  至多产生重复的 cancel_requested 事件，不产生矛盾终态（已记录为已知边界）。
- 提交与派发之间的恢复证据：进程在"已提交、未派发"窗口死亡时，Turn 停留 `accepted`，
  重启由 `seal_interrupted_turns` 封为 `unknown`（`SERVER_RESTART_INTERRUPTED`），
  回归 `test_restart_seals_unfinished_turn_as_unknown_without_redispatch`（通过）；
  不重派发、不承诺外部副作用 exactly-once。
- 回归：`tests/server/test_server_boundaries.py::test_concurrent_same_key_turn_acceptance_dispatches_once`
  断言恰好 1 次派发、两回执同一身份、事后重放不再派发。

## C — 能力诚实性与中立边界

- 能力声明来源：`server/execution/__init__.py` 新增 `HarnessDescriptor` /
  `HarnessRegistry`。`readiness.capabilities.harnesses` 逐注册项给出
  `available / capability_claims / credential_registered / unavailable_reason`；
  未注册的 Harness 不出现，也不产生品牌 blocker。`EXECUTION_CAPABILITY_UNAVAILABLE`
  是唯一执行 blocker；能力映射里不再有 `codex` 常量。
- Profile 能力不再由存储层杜撰：旧 `server_profiles` 响应内嵌
  `{"native_memory": harness_type=="codex"}`（37 审计的不诚实点），现由注册描述符
  `capability_claims` 联接（`ProfileService`），存储层不存能力主张。
- 中立用例双 provider 证明：
  `test_two_neutral_providers_are_selectable_without_server_changes` 用两个非品牌
  描述符 `alpha`（有凭据种类 + streaming 声明）与 `beta`（无凭据 + 空声明）走同一
  Server/HTTP 路径成功创建 Profile/Session/Turn；未注册的 `gamma` 得 503
  `HARNESS_UNAVAILABLE`。Server 代码无任何品牌分支。
- 旧原生路径退出生产装配：`server/composition/codex.py` → `server/legacy_codex.py`
  （模块 docstring 声明非生产装配），`bootstrap` 生产装配不导入任何原生 Harness；
  生产默认 `execution=None`，Turn 返回 503 `EXECUTION_CAPABILITY_UNAVAILABLE`，
  37 阶段 C 回归测试改为**显式**构造 legacy 后端注入（测试文件内 `_runtime`）。
- readiness 契约变化：`capabilities.{codex,cold_resume}` 移除，新增
  `capabilities.{execution,harnesses}`；`CODEX_HARNESS_UNAVAILABLE` /
  `CREDENTIAL_SOURCE_NOT_AUTHORIZED` 品牌级 blocker 移除，后者变为注册项内的
  `unavailable_reason`。前端尚未消费该接口（wire 未锁定），无兼容负担。

## 结构（目标树落地部分）

```text
src/agent_box/server/
├── bootstrap/            装配根（DataRootOwner/token/runtime；唯一认识具体实现处）
├── transport/http/       路由调用中立用例
├── workspaces/           连接端口 + Workspace 用例/仓储
├── profiles/             Profile 用例（能力联接）/仓储
├── sessions/             Session/Turn 用例（接受 claim）/仓储（含事件、恢复封存）
├── execution/            TurnExecutionPort + HarnessDescriptor/HarnessRegistry 契约
├── events/               EventNotifier
├── credentials.py        凭据登记仓储（内容仍在 SecretStore）
├── idempotency.py        共享幂等记录（原子插入语义）
├── records.py / ids.py   规范编码、敏感键拒绝 / 稳定不透明 ID
├── services.py           中立用例门面（transport 唯一入口）
├── persistence.py        聚合仓储运行时视图（37 证据测试兼容名保留）
└── legacy_codex.py       37 历史路径，仅回归测试显式引用，生产不装配
```

删除：`server/application/`、`server/composition/`、`server/persistence/`（拆分为上表）。
跨仓储事务仍由单一仓储方法的一个事务拥有；显式 UoW 对象留待 41 随 wire 合同一起落地。

## 验证记录

```text
PYTHONPATH=src:plugins/agent-box-runtime-wsl/src:plugins/agent-box-sandbox-bwrap/src:\
plugins/agent-box-harnesses/src:plugins/agent-box-terminal-session/src \
python3 -m pytest -q tests/server tests/test_work_core_contracts.py \
  tests/test_work_core_repository.py tests/test_work_core_input_dispatch.py \
  tests/test_work_core_finalization.py tests/test_work_core_resource_observations.py \
  tests/test_work_core_responsibility.py tests/test_extensions.py \
  tests/test_resource_contracts.py tests/test_plugins_cli.py
→ 108 passed, 1 failed, 1 skipped

python3 -m pytest -q plugins/agent-box-harnesses/tests plugins/agent-box-runtime-wsl/tests
→ 40 passed, 3 skipped

git diff --check → 干净
```

- 37 遗留测试 `test_capture_failure_blocks_later_turn_and_never_acks` 经基线 b415eb2
  与本分支各三次重复运行均为 PASS：38 文档记录的该失败为**偶发（flaky）**而非确定性
  失败，单次运行结果不可作判定依据。39 阶段全量门（含该测试）全部通过。
- Windows 平台门未运行（本阶段无 Windows 构建；`test_stage_c_windows_wsl_offline.py`
  已改为显式 legacy 装配，待 41/42 真机段执行）。
- 平台 skip：POSIX token 位测试按原样保留。

## 留给 40 的接缝与待办

- `HarnessRegistry` 是 bootstrap 的装配输入；40 的固定闭包抽取以注册
  `HarnessDescriptor` + `TurnExecutionPort` 实现接入，不得在 Server 内加品牌分支。
- Worker 双向通道、bwrap 投影、harness-remote 闭包（v3.0.2 @ 21ce6db）、四家矩阵
  全部未开始（40 NOT_STARTED→本阶段后 IMPLEMENTING）。
- readiness/错误信封仍为 37 候选形状；41 锁 wire 时统一与前端核对。
- 37 的 `abandon` 已知失败与"取消事件重复"边界如上，不得在新证据中消失。
