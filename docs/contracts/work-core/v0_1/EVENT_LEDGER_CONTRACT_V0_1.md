# Event Ledger Contract v0.1

记录 WorkCreated、WorkUpdated（仅 material change）、WorkCompleted、WorkReopened；ExecutionCreated、DispatchRequested、NativeRefDiscovered、Started、material ProjectionChanged、Completed、Failed、Cancelled、Abandoned；以及 RefAttached。

不记录每次 poll/heartbeat，`ExecutionObserved` 仅在 projection、freshness、native ref 或 attached ref 发生 material change 时写入。Ledger 记录 Agent-Box 有权声明的跨系统事实，不是 event-sourcing engine，也不复制 Codex JSONL 或 LangGraph checkpoint history。
