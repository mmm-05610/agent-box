# Phase 1 Implementation Plan — Production Minimal Work Core v0.1

前置条件：评审并接受 `PRODUCTION_WORK_CORE_DESIGN_V0_1.md`。本计划不包含迁移现有 `agent_box.work`、GUI 或非 Codex provider。

## Task 1 — Establish isolated package and pure contracts

新增 `src/agent_box/work_core/{models,projection,events,errors,registry}.py`。

- 实现 Work/Execution/Ref/Event immutable/typed contracts；
- 实现 projection validator 与 bounded metadata；
- 添加 contract/domain tests；
- 添加 import-boundary test，确保 Core 不 import `work_core.providers.codex`。

Acceptance：Work 无 provider fields；terminal projection consistency 受测试保护。

## Task 2 — SQLite repository and migration

新增 `004_minimal_work_core.sql` 与 repository。

- 创建 `core_*` 表及 indexes/unique idempotency constraints；
- 使用 existing db lock 和 transactions；
- 实现 Work/Execution/ref/event reload；
- 加 version CAS、concurrency conflict 与 restart persistence tests。

Acceptance：migration 不变更 001–003 和 legacy tables；execution projection 与 events 原子持久化。

## Task 3 — Services and explicit lifecycle commands

新增 `WorkService`、`ExecutionService`。

- `create_work`、`complete_work`、`reopen_work`；
- `create_execution`、`dispatch_execution`、`observe_execution`、`resume_execution`；
- 添加 dispatch intent/outbox record 和 provider-neutral errors；
- 完成不自动 close Work 的 tests。

Acceptance：same Work 可有 multiple executions；succeeded/failed execution 均不改变 Work lifecycle。

## Task 4 — Provider registry and FakeProvider

实现 descriptor/capability registry 与 fake second provider test。

- duplicate/missing provider errors；
- capability-qualified resume dispatch；
- Core 不含 provider switch。

Acceptance：新增 fake provider 不改 Core source。

## Task 5 — Codex launch compatibility facade

新增 `work_core/providers/codex_launch.py`。

- 将 existing `build_launch_plan()` 适配为 managed `Popen` launch；
- 不调用 `launch.launch()`、不写 legacy session state；
- 设计 profile/cwd/request objects；
- unit test argv/env construction with mocked plan。

Acceptance：复用 profile isolation，Core 不依赖 profile implementation payload。

## Task 6 — Codex JSONL adapter

新增 parser/provider。

- 解析 thread.started、turn.started/completed/failed；
- SessionRef discovery、RunRef/ArtifactRef attachment、material projection mapping；
- malformed stream、exit code、unknown/unreachable handling；
- resume with stored SessionRef and same execution id。

Acceptance：不持久化 JSONL；all mappings have parser tests.

## Task 7 — End-to-end service persistence tests

以 FakeCodexProcess/fixtures 测试完整闭环：

```text
create Work → create Execution → dispatch intent → thread discovered
→ active → terminal/resumable → resume same execution → refs → explicit complete Work
```

覆盖 crash window/restart、concurrent observe conflict、resume/cancel conflict 和 fake provider extension。

## Task 8 — Optional, gated CLI vertical slice and real smoke

仅在 Tasks 1–7 通过后新增独立 CLI command（不替换 legacy `work` CLI）。提供 opt-in `codex-main` profile smoke 指引：安全 workspace、小改动、JSONL event observation、resume、explicit Work completion。不得让 CI 自动调用真实 Codex。

## Non-goals

LangGraph/Human/CI provider、workflow/scheduler、GUI、workspace/artifact manager rewrite、policy framework、remote execution、legacy `work/` migration 均不在 Phase 1。

## Delivery Gate

完成标准：Tasks 1–7 tests green，architecture boundary checks green，migration upgrade/restart verified，Codex adapter only consumes existing launch capability，且全部 frozen design laws retained。Task 8 需要用户确认 profile/成本/真实运行授权。
