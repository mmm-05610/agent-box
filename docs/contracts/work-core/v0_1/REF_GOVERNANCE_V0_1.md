# Ref Governance v0.1

统一 Ref 加 registered semantic type，而非 Core subclass registry：SessionRef、WorkflowInstanceRef、RunRef、WorkspaceRef、ArtifactRef。字段只允许 `type`、`provider`、`native_id`、可选 `uri`、小型 `str→str` metadata。

禁止 transcript、checkpoint blob、workflow graph、artifact bytes、command output 与任意嵌套 provider payload。Codex thread 是 SessionRef；LangGraph `thread_id` 是 WorkflowInstanceRef；PID 是 RunRef；checkpoint ID 永远 native-only。stale/unreachable 通过 projection 表达，不重写 ref。
