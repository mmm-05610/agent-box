# 既有红 ID 名册 @ 基线 92a2d2ba（E2b 配对，20 条，2026-09-23 入册）

来源：`control/reports/BE-LOOP-001/baseline/evidence/e2b-root-red-ids.txt`（旧循环 C 权威门证据，逐字节 FAILED-ID 名册）；本会话只读提取，未重跑根门（串行重门候 C 许可）。家族定性＝tool/model-absent 环境固有（旧账 current-state 语），**非回归**。HD-001 差量验收须与本名册逐字节配对，超出即新增失败。

**opencode gate cleanup（11）**
- tests/server/test_opencode_gate_cleanup.py:: {test_a_binary_that_changed_during_the_run_fails_the_gate, test_a_cleanup_failure_alone_is_the_primary_failure, test_an_external_binary_is_neither_deleted_nor_chmodded, test_an_injected_removal_failure_exits_nonzero, test_a_primary_failure_is_not_masked_by_a_cleanup_failure, test_a_token_that_reaches_tracked_content_fails_the_gate, test_default_run_removes_everything_it_created, test_each_run_generates_its_own_token, test_keep_retains_the_tree_and_never_claims_removal, test_the_dynamic_token_is_not_tracked_content, test_the_retry_bound_is_enforced_by_the_gate}

**pi gate cleanup（5）**
- tests/server/test_pi_gate_cleanup.py:: {test_an_external_artifact_is_neither_deleted_nor_chmodded, test_an_injected_removal_failure_exits_nonzero, test_a_primary_failure_is_not_masked_by_a_cleanup_failure, test_default_run_removes_a_read_only_nested_artifact, test_keep_retains_the_tree_and_never_claims_removal}

**单点（4）**
- tests/server/test_delegation.py::test_the_real_bridge_process_runs_a_child_turn_end_to_end
- tests/server/test_gate_worker_defaults.py::test_chain_gate_without_worker_fails_typed
- tests/server/test_hermes_production_chain.py::test_the_wire_model_is_the_product_id_and_is_asserted
- tests/server/test_sidecar_lease_keepalive.py::test_the_production_default_lease_is_five_seconds

环境性 skip（同配对基线，非红）：`tests/server/test_first_run_lock.py:453`（真实 opencode+bwrap）。
注：pi gate cleanup 5 条与 H 域 harness-pi 批**同族**——pi 接入批后该 5 条具备转绿条件（真实 pi 产物在场时）；届时差量账按"该 5 条转绿＝预期改善，其余 15 条须逐字节不变"记。


**修正注（2026-09-23 01:17 BC 实测，权威口径见 pi-batch-integration-checklist.md §3）**：上注「该 5 条具备转绿条件」不成立——红因实为 pi-production-chain-gate.py:434 的 PI_GATE_WORKER_MISSING 前置检（名册引用产物 workers/agent-box-worker/.acceptance-bundle-c4/agent-box-worker 不在场），pi/production.py 不在该测试回路（stub 链）；pi 批禁产 worker/cargo 产物，故配对预期修正为 **20 条全逐字节不变、0 预期转绿**；若 HANDOFF 后任何名册条目变绿，先查越界。原注保留为历史。
