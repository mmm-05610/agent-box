# Execution Contract v0.1

Execution 是一个具体、可追踪的 Work 推进实例：execution_id、work_id、provider descriptor、native refs、projection、input/output refs、provenance 与时间。

不拥有 transcript、checkpoint、workflow state、retry logic、process internals 或 scheduler state。Execution relation 不设 parent/child：LangGraph internal branch/retry 是 provider-native；只有未来真实跨-provider需求才可另行证据化。
