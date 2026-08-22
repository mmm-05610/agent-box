# Work Contract v0.1

Work 拥有 stable id、objective/intended outcome、最小 lifecycle（`open`、`completed`、可选 `abandoned`）、显式 closure boundary、reopen 及与 Executions 的 relation。

Work 永不拥有 native session、transcript、workflow graph/checkpoint/retry/DAG、scheduler、provider process/PID/credential、workspace/artifact bytes 或详细 permission policy。

Execution failed/cancelled/succeeded 都不自动改变 Work。只有 host、user 或显式 policy extension 可关闭/reopen Work。
