# §10 无模型全栈联调——后端侧覆盖对照（只读准备，未执行联调）

用途：接管后按 `zcode-continuous-goal.md` §10 逐项联调时，本表说明**每一项后端侧已有什么证据**、
**还需要 UI 在环才能证明什么**。避免两件事：把后端证据当作 UI 证据（或反之），以及重复验证已证过的事实。
状态：**PRE_INTEGRATION**，本文件不构成任何联调证据。

约定：**B** = 后端侧已有可复跑证据；**U** = 只能由真实 Desktop UI 在环产生；**B+U** = 两侧各有独立证据、须分别记账。

| §10 项 | 后端侧证据 | UI 侧 |
| --- | --- | --- |
| `server.hello` | B：`test_hello_reports_capabilities_and_requires_auth`；r4 握手 | U：连接建立即调用 |
| Workspace open/list/browse/archive | B：`test_reopening_the_same_location_keeps_identity`、`test_same_path_under_a_different_environment_is_a_different_location`、`test_archive_keeps_the_record_and_guards_the_version`、`test_browse_reports_read_and_write_independently`（+ 拒绝不支持环境） | U：目录选择/浏览交互 |
| Profile list/create/update/archive/updateConfig | B：`test_profile_and_provider_model_maintenance_is_versioned_and_referential`、`test_profiles_list_exposes_harness_as_data_only`、配置描述/解析两项 | U：角色维护界面 |
| Provider/Model list/create/update/archive | B：同上（同一条 versioned+referential 用例覆盖 providerModels 四种） | U：模型目录界面 |
| config.describe / config.resolve | B：`test_config_describe_declares_controls_and_locks`、`test_config_resolve_computes_effective_values_and_rejects_bad_ones`；+ 本轮新增 `config.changed` 生产者（角色切换） | U：控件渲染与"下次发送生效"提示 |
| Session list/update/archive/switchProfile | B：`test_session_catalog_metadata_archive_and_pagination_are_server_owned`、`test_switching_role_is_refused_while_an_execution_runs`；+ 本轮"确认切换发 `config.changed`" | U：目录/切换交互 |
| createAndSend / send | B：`test_create_and_send_accepts_once_and_replays_the_same_execution`、`test_concurrent_same_request_id_accepts_exactly_one_execution` | U：首次发送/续发 |
| sendOutcome.query | B：`test_send_outcome_query_answers_unknown_rather_than_guessing`、`test_send_outcome_query_returns_the_frozen_acceptance_identity` | U：超时后的查询路径 |
| queue.get / queue.withdraw | B：`test_send_while_running_queues_and_withdrawal_reports_too_late` | U：队列条与撤回 |
| queue 终态/续派/暂停 | B：`test_queue_terminal_events_remove_dispatched_items_without_guessing`、`test_stop_or_failure_pauses_queued_turn` | U：终态消失与续派呈现 |
| runs.stop | B：`test_stop_reports_requested_then_already_finished`、`test_stop_on_an_unknown_execution_is_not_found`；**本轮修正**：停止请求帧发 `stopping`（前端 stop phase 由它驱动），终态 `stopped` 仍是唯一确认 | U：停止按钮相位 |
| approvals.decide | B：`test_approval_decisions_are_atomic_and_validate_scope`（幂等/矛盾/越界 scope 全部拒绝） | U：审批弹窗与"仅本次"授权 |
| history.snapshot | B：`test_history_snapshot_frames_use_cursors_and_resume_without_gaps`、`test_history_uses_distinct_backward_pages_and_live_resume_cursors`、`test_history_snapshot_requires_a_real_session` | U：历史渲染与向旧翻页 |
| 事件 subscribe / gap resync / 重订阅 / cleanup | B：`test_wire_event_stream_resumes_from_snapshot_cursor_without_sse`（真实 WS 帧、游标前进）；`history.snapshot` 的 `resync_required`（伪造游标 → `INVALID_REQUEST`） | U：断连重订阅与 gap 提示 |
| 附件授权/投递/回收 | B：`test_attachment_is_worker_authorized_captured_and_recoverable` | U：附件选择与回执 |
| 取消/断连 | B：r4 的 `cancelled_execution` + 停止用例；WS 断连后按游标续订（同上） | U：取消后界面终态 |
| Server/Worker 重启 | B：r4（`tree_terminate` 强制终止 → 同 DataRoot 重启 → 同 native id `session/resume` → 独立 `-PostCheck` CLEAN）；`seal_interrupted_turns` 的 unknown/recovery_required 语义有 wire 侧用例 | U：重启后 UI 恢复与"待核实"呈现 |
| 正常 Desktop/Server 退出 | B：`accept-e.ps1` 退出路径 + PostCheck；Server `stop()` 有界停止 | **U：真实 Electron 正常退出**（41 已明确把"正常生命周期退出"留作全栈验收项） |
| DataRoot/workspace 清理 | B：r4 7 项清理守卫 + `test_acceptance_cleanup_guards.py` 5 项（只删自有投影、标记不符拒绝等） | U：无（平台侧已覆盖） |
| 无服务诚实状态 | B：未启服务时无监听；四家门的"缺凭据 → 派发前拒绝"（`CREDENTIAL_REQUIRED`，`sessionsCreated=0`） | U：UI 在无服务时的诚实提示（前端 `WireUnavailableError`） |
| 零 legacy REST 回落 | B：28 方法 wire 面齐备（声明 28 = 分发 28，机械核对通过），REST 面按 41 设计保留但不为 UI 所需 | U：前端自身守卫门（其 r3 已含两道 legacy REST 门） |

## 需要 UI 在环才成立的关键项（不得用后端证据替代）

1. **真实 Electron 生命周期连接**：`{endpoint, sessionToken}` 安装、token 只在 main 进程、renderer 不可见。
2. **生产 WS 事件流在真实 UI 中的表现**：delta 呈现顺序、`stopping` 相位、`config.changed` 生效提示、
   审批弹窗与失效、队列条终态消失。
3. **正常退出**（41 明确留作全栈项）与 **Server/Worker 重启后的 UI 恢复呈现**。
4. **零 legacy REST 回落**：由前端自身门证明。

## 本轮为此新增/修正的后端事实（联调时直接依赖）

- 事件帧严格 schema 门（`test_every_projected_frame_matches_the_strict_frontend_event_schema`）：
  所有真实产出的帧都满足前端 `additionalProperties:false` 的 `EventFrame`。
- 停止请求帧 = `stopping`（此前是"被中断时的原状态"，UI 停止相位不会启动）。
- 角色确认切换发 `config.changed{effectiveFor:"next_send"}`（此前无生产者，UI 的 `configEffectiveFor` 永不更新）。
- 28 方法声明 = 分发 = 28（机械核对），错误家族 12 项与前端集合相等。
- 未闭合且**可能影响 UI**：`tool.update` 目前只有 harness 失败一条，端口词汇无工具进度映射；
  四家是否播发原生工具调用需一次强制工具调用的提示判定（不臆断）。
