# Core Contract v0.1 — Frozen Candidate

## Design Laws

1. Work 是有界工作的稳定 identity。
2. Work 独立于任何 Execution。
3. Execution 推进 Work，但不决定 Work closure。
4. Native runtime state 始终由 provider 权威持有。
5. 原生 identity 连续的 resume 不创建新 Execution。
6. Provider replacement 创建新 Execution，不创建新 Work。
7. Workflow 是 Execution strategy，不是 Core orchestration。
8. Core 记录跨系统事实，不复制 native runtime history。
9. 新 provider 不得要求 Core 特殊分支。
10. 外部资源只被 Ref 引用，不被 Core 拥有。

Domain Core：Work、Execution。Runtime：ExecutionProvider、ExecutionProjection、Ref、EventLedger、ExtensionRegistry。

Freeze gate：全部通过。没有 provider state 进入 Work；Codex/LangGraph resume identity 稳定；projection 覆盖三类 provider；Ref 非 payload bucket；ledger 非 telemetry mirror；没有 Workflow/Scheduler primitive。
