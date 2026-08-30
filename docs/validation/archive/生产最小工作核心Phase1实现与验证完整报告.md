# 生产最小工作核心 Phase 1 实现与验证完整报告
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

日期：2026-08-22
分支：`feature/work-core-v0.1`
状态：**Phase 1 vertical slice 已实现并完成一次真实 Codex 验证**

## 1. 执行结论

本轮按 `PHASE_1_IMPLEMENTATION_PLAN.md` 完成了一个 additive 的 Production Minimal Work Core Phase 1。唯一闭环已经真实走通：

```text
create Work
  → create Codex Execution
  → durable dispatch intent
  → 复用 Agent-Box codex-main profile 启动真实 Codex
  → 发现原生 Codex thread ID 并附加 SessionRef
  → 记录结构化 projection 与 material events
  → resume 同一 Execution / 同一 native thread
  → 附加 WorkspaceRef 与诊断 ArtifactRef
  → 用户显式 complete Work
```

真实运行证明：Codex 的同一 native thread 恢复没有创建新 Work 或新 Execution；Execution 成功也没有自动关闭 Work。此结果符合三轮 spike 冻结的 Work-first、execution-pluggable contract。

本轮没有迁移或修改 `agent_box.work`、GUI、旧 session 语义、旧 CLI 行为，也没有接入 LangGraph、Human、CI、scheduler 或 workflow engine。

## 2. 权威输入与范围

实现以 `docs/contracts/work-core/v0_1/` 的冻结契约为权威输入，尤其包括：

- `CORE_CONTRACT_V0_1.md`
- `WORK_CONTRACT_V0_1.md`
- `EXECUTION_CONTRACT_V0_1.md`
- `EXECUTION_IDENTITY_V0_1.md`
- `EXECUTION_PROJECTION_V0_1.md`
- `EXECUTION_PROVIDER_CONTRACT_V0_1.md`
- `REF_GOVERNANCE_V0_1.md`
- `EVENT_LEDGER_CONTRACT_V0_1.md`
- `OWNERSHIP_MATRIX_V0_1.md`

Phase 1 的范围被刻意限制为单一的 Codex vertical slice。它不是 Agent-Box 2.0，也不是对现有 `work/` 实现的替换或迁移。

## 3. 实现任务与验收结果

| Task | 交付 | 验收结果 |
| --- | --- | --- |
| 1 | 隔离的 typed core contracts：Work、Execution、Ref、Projection、Event、errors、registry | 通过；Core 无 Codex import，Work 无 provider 字段 |
| 2 | SQLite repository 与 `004_minimal_work_core.sql` | 通过；新增 `core_*` 表，未改 001–003 或 legacy table |
| 3 | WorkService / ExecutionService 与显式生命周期 | 通过；Execution terminal 不改变 Work lifecycle |
| 4 | Provider registry 与 capability-qualified dispatch | 通过；FakeProvider 可注册，无 Core provider switch |
| 5 | Codex launch compatibility facade | 通过；复用 `build_launch_plan()`，不调用 legacy `launch.launch()` |
| 6 | Codex JSONL parser/provider | 通过；支持 thread/turn material facts、malformed stream 与 ANSI/PTY 包装行 |
| 7 | 服务级 vertical slice 与 SQLite restart/reload 测试 | 通过；FakeCodex 验证同一 Execution resume、refs、显式 close |
| 8 | opt-in CLI 与真实 Codex smoke | 通过；真实 `codex-main` 启动、resume、关闭 Work 成功 |

当前 targeted suite：**19 passed in 0.09s**。

执行命令：

```bash
PYTHONPATH=src python3 -m pytest \
  tests/test_work_core_contracts.py \
  tests/test_work_core_repository.py \
  tests/test_work_core_services.py \
  tests/test_work_core_codex_launch.py \
  tests/test_work_core_codex_jsonl.py \
  tests/test_work_core_vertical_slice.py \
  tests/test_work_core_cli.py -q
```

未运行整个仓库的测试套件：工作树包含用户已有的、与本模块无关的未提交改动；为了不把那些改动的结果误归因于 Work Core，本轮仅运行新模块的明确相关测试。

## 4. 生产代码结构

新增的 production 代码集中在：

```text
src/agent_box/work_core/
  models.py             # Work、Execution、Ref value objects
  projection.py         # phase/outcome/resumable_now/freshness 校验
  events.py             # bounded material event types
  errors.py             # provider-neutral error categories
  registry.py           # extension/provider registration
  repository.py         # SQLite persistence、CAS、refs、event ledger
  services.py           # WorkService、ExecutionService
  cli.py                # 独立 opt-in CLI，不挂入 legacy cmd2 CLI
  providers/
    codex_launch.py     # profile-launch compatibility facade
    codex_jsonl.py      # native JSONL → Core observation
    codex.py            # CodexExecutionProvider

src/agent_box/migrations/
  004_minimal_work_core.sql
```

### 4.1 Domain 与 runtime 边界

`Work` 只保存稳定 identity、objective、`open/completed/abandoned` lifecycle、closure reason、时间和受限 metadata。它不保存 profile、thread、transcript、workflow、checkpoint、PID、workspace bytes 或 provider state。

`Execution` 只保存 Work relation、provider ID、当前 projection、provenance、时间与 version。native/input/output resource 由关系表中的 typed `Ref` 表达，不作为嵌套 provider payload 写入 Execution。

`ExecutionProjection` 是冻结后的四元组：

```text
phase          = active | terminal | unknown
outcome        = succeeded | failed | cancelled | abandoned | null
resumable_now  = true | false | null
freshness      = observed | stale | unreachable
```

`waiting`、`queued`、`retrying`、`paused`、Codex turn detail 都没有进入 Core status vocabulary。

### 4.2 Persistence、并发和幂等

增量 migration 创建五张新表：

| 表 | 责任 |
| --- | --- |
| `core_works` | Work current state、bounded metadata、optimistic version |
| `core_executions` | Execution current projection、时间、provider、optimistic version |
| `core_execution_refs` | native/input/output typed refs |
| `core_events` | append-only material cross-system facts |
| `core_dispatches` | durable dispatch intent 与 idempotency key |

repository 使用现有 SQLite connection / write lock，并以 version compare-and-swap 防止静默覆盖。当前 start 的最小 idempotency 边界是：先持久化 Execution 与 dispatch intent，再发出 provider 调用。若两者之间发生崩溃，Execution 仍为 `unknown/stale`，不会猜测成功或盲目重发。

## 5. Codex 适配边界

适配路径是：

```text
Work Core service
  → ExtensionRegistry["codex-cli"]
  → CodexExecutionProvider
  → CodexLaunchFacade
  → existing launch.build_launch_plan()
  → existing bwrap/profile isolation
  → Codex CLI exec --json / exec resume --json THREAD_ID
```

Core 不读取 profile payload，不管理 bwrap，不使用 legacy session repository，也不存 Codex JSONL 或 transcript。

真实运行表明，对当前 `codex-main` profile，非交互 Codex 需要 controlling PTY 才能稳定产出 JSONL。Facade 因而通过系统 `script(1)`（util-linux）包裹既有 launch plan。原始 JSONL 由 provider 写至 `~/.agent-box/work-core-diagnostics/`，Core 只保存其 `ArtifactRef` URI。这是一个有意隔离的 compatibility facade，不是 Work Core 的 runtime 职责。

## 6. 真实 Codex Smoke 记录

本次真实 smoke 使用隔离 workspace：

```text
spikes/minimal_work_core/real_providers/codex_workspace
```

提示词只读取 `example.py`，不允许编辑文件。真实流程结果：

| 项 | 值 |
| --- | --- |
| Work ID | `work_386d1c9e185f493283f05ab932392ea8` |
| Execution ID | `exec_e110a4cac4da44b8af80d9e323d48d9b` |
| Provider | `codex-cli` / profile `codex-main` |
| native SessionRef | `01a02515-ae4f-7051-8b5a-f29d2a5248e9` |
| start result | 成功，CLI 输出同一 Execution ID |
| resume result | 成功，CLI 再次输出同一 Execution ID |
| final projection | `terminal / succeeded / resumable_now=true / observed` |
| Work final lifecycle | `completed`，原因是用户显式接受结果 |

数据库核验还确认：

- start 与 resume 产生不同 provider process 的 `RunRef`，但共用同一个 `SessionRef`；
- execution 的 `work_id` 未变化；
- WorkspaceRef 与每次 provider-owned diagnostic log 的 ArtifactRef 以 output relation 附加；
- Work 的关闭由 `complete-work` 命令记录为 `WorkCompleted`，而不是由 `ExecutionTerminal` 自动触发。

这直接验证了：**Codex client process / turn boundary 不等于 Execution identity boundary；连续的 native thread resume 属于同一 Execution。**

## 7. Event ledger 修复与验证

真实 smoke 的持久化检查曾暴露一个实现问题：重复读取同一段 provider log 时，`NativeRefDiscovered` 与 `ExecutionProjectionChanged` 会被重复追加。虽然 ref row 本身有唯一约束，但 event ledger 因此可能退化为 telemetry 副本，这违反冻结的 Event Ledger contract。

修复方式：

1. `attach_ref()` 只在 `INSERT OR IGNORE` 实际插入 Ref 时追加 discovery/attach event；
2. projection 对比忽略 `observed_at`，只要 `phase/outcome/resumable_now/freshness` 未发生语义变化，就不更新 version、不写事件；
3. 新增回归测试，确认重复 observation 不产生重复投影事件、Ref event 或 ref row。

修复后 targeted suite 从 18 增至 **19 passed**。该修复没有改变 frozen contract，只是使实现重新满足“ledger 记录 material fact，而非 provider poll”的已有规则。

## 8. Frozen Contract Compliance

| Frozen design law | Phase 1 结果 |
| --- | --- |
| Work 是有界工作的稳定 identity | 满足：Work ID 不随 provider/start/resume 改变 |
| Work 独立于 Execution | 满足：Execution terminal 不自动改变 Work |
| Execution 推进 Work，但不决定 closure | 满足：仅 `complete-work` 显式关闭 |
| Native runtime state 属于 provider | 满足：thread/transcript/PTY/log 均在 Codex facade/provider 一侧 |
| 连续 native identity 的 resume 不新建 Execution | 满足：真实 Codex thread resume 保持 execution ID |
| Provider replacement 新建 Execution、不新建 Work | 模型与 FakeProvider 测试支持；真实 replacement 留后续 provider 阶段 |
| Workflow 不是 Core orchestration | 满足：本阶段没有 workflow/DAG/scheduler |
| Ledger 只记录 cross-system material facts | 满足：重复观测去重已测试 |
| 新 Provider 不要求 Core 特殊分支 | 满足：registry/FakeProvider 测试；Core 不含 `if provider == "codex"` |
| 外部资源被引用、不被 Core 拥有 | 满足：Session/Run/Workspace/Artifact 均为 typed Ref |

## 9. 与既有 Agent-Box 的兼容性

复用的既有能力：

- `launch.build_launch_plan()`：生成 profile、bwrap、argv、env、cwd；
- profile/config isolation：继续由既有 Agent-Box 负责；
- `core.db`、migration discovery 与 SQLite write lock；
- `config.agent_box_home()`：确定 diagnostics 与数据库根目录。

刻意未动、未依赖或未替换的能力：

- `src/agent_box/work/` 及其 migration `003_work_core.sql`；
- legacy work CLI 与 `src/agent_box/cli/shell.py`；
- GUI/TUI；
- legacy launch session audit / session persistence；
- workspace manager、artifact store、scheduler、workflow runtime、permission system。

因此本阶段可以与已有系统双轨运行。独立入口是：

```bash
PYTHONPATH=src python3 -m agent_box.work_core.cli ...
```

它没有注册到旧 CLI，避免改变既有用户行为。

## 10. 仍存限制与后续工作

这些限制不是 frozen contract 的失败，但应在进入更广泛正式 rollout 前处理：

1. **Dispatch crash window**：若 Codex 已收到启动请求而 thread ID 尚未被发现，重启后的最安全行为是 `unknown/stale` 和人工/host reconciliation；Phase 1 不会猜测或盲重发。
2. **Codex standalone observe**：当前 Codex CLI 没有已验证的非交互“按 thread ID 查询”接口；没有 live stream 时 provider 必须报告 unknown/unreachable。
3. **PTY compatibility dependency**：当前 facade 依赖 Linux 的 util-linux `script(1)`，适合现有 bwrap/Linux profile 路径，但需要在未来跨平台 provider strategy 中明确替代方案。
4. **自动化覆盖边界**：19 个 targeted tests 覆盖 contracts、SQLite reload、idempotency、parser、registry、resume 与 CLI，但不模拟真实网络中断、真实多进程 CAS 竞争或 cancel/resume 同时到达；这些应作为 Phase 1 hardening / Phase 2 的明确测试项，而不是暗中假定已解决。
5. **Provider 扩展**：LangGraph、Human、CI、第二个真实 provider 仍按已冻结的后续 compatibility 阶段接入；不得为它们回填 Workflow/Scheduler primitive 到 Core。
6. **诊断日志治理**：日志是 provider-owned artifact；retention、访问控制和清理策略不应被引入 Core，但上线前需要由 host/operations 确定。

## 11. 推荐结论

**推荐：继续以 additive migration 推进 Phase 1 hardening，而不是开始大规模重构。**

当前证据已足以确认 Codex vertical slice 的核心边界可实现，且真实 native session resume 没有击穿 execution identity 原则。下一项应是有限的可靠性加固（dispatch reconciliation、并发/中断测试、diagnostic retention），随后再单独授权接入第二个 provider。不要在此阶段迁移 legacy `agent_box.work`、改 GUI 或引入 workflow/scheduler。
