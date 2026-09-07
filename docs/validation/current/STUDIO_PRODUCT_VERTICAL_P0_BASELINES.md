# P0 Baselines and Merge Seam — Windows→WSL Seven-Harness Daily Driver

Date: 2026-09-05. Authority: `WINDOWS_WSL_SEVEN_HARNESS_DAILY_DRIVER_PROGRAM.md` §6 P0.
Precondition: P-1 `READY FOR CHECKPOINT` (see §15 of `STUDIO_CODEX_PRODUCT_VERTICAL.md`).

## 1. Worktree records (before P0 product edits)

### Backend — AgentBox Studio

```text
path:   /home/maoqh/projects/agent-box-studio-codex-vertical
branch: feat/studio-codex-product-vertical
HEAD:   6c14ea8 (PR #67 merge commit; equals origin/main tip)
merge-base: 6c14ea8
```

Dirty state (all pre-existing from the Codex vertical + P-1 repair; preserved, no git
write operations):

```text
 M .github/workflows/release-please.yml
 M docs/getting-started/RELEASE.md
 M plugins/agent-box-harnesses/src/agent_box_harnesses/adapters/{codex,generic_cli,start_context}.py
 M plugins/agent-box-harnesses/src/agent_box_harnesses/codex/{composition,credentials,executable}.py
 M plugins/agent-box-harnesses/src/agent_box_harnesses/generic/execution_provider.py
 M plugins/agent-box-harnesses/tests/{test_codex_credential_binding_p0,test_credential_synthetic}.py
 M plugins/agent-box-runtime-local/src/agent_box_runtime_local/provider.py
 M plugins/agent-box-studio/pyproject.toml
 M plugins/agent-box-studio/src/agent_box_studio/{schemas.py,server/app.py,server/events.py,service.py}
?? docs/validation/current/STUDIO_CODEX_PRODUCT_VERTICAL.md
?? docs/validation/current/STUDIO_PRODUCT_VERTICAL_P0_BASELINES.md
?? plugins/agent-box-harnesses/tests/test_codex_product_vertical_harness.py   (renamed, unique basename)
?? plugins/agent-box-studio/tests/test_codex_product_vertical.py
?? plugins/agent-box-studio/tests/test_codex_vertical_repair_p1.py
```

Two tracked `src/agent_box/protocols/credentials/__pycache__/*.pyc` files: unchanged vs
HEAD (verified). `git diff --check` clean.

### Frontend — Studio product UI reconstruction

```text
path:   /home/maoqh/projects/agent-box-studio-ui-reconstruction
branch: feat/studio-product-ui-reconstruction
HEAD:   881c56be (docs: authorize Studio product UI reconstruction)
merge-base (vs origin/main): 93c3386
```

Dirty state (pre-existing UI reconstruction work, preserved):

```text
 M docs/design/frontend-reconstruction-spec/PHASE_FILE_LEDGER.md
 M docs/design/frontend-reconstruction-spec/phase2_visual_review.py        (untracked)
 M docs/design/implementation/ui-1/ui1_visual_fixture.py
 M src/components/layout/status-bar-alerts.tsx
 M src/components/message/{antigravity-tool-cards.test,completed-turn-content.test,content-parts-renderer,context-compaction-card}.tsx
?? src/components/message/content-parts-renderer.test.tsx
 M src/components/transcript/{work-event-frame.test,work-event-frame}.tsx
 M src/components/settings/{settings-shell-panels.ts,settings-shell.tsx}
 M src/components/terminal/terminal-tab-bar.tsx
 M src/core/registry/wiring.test.tsx
 M src/features/agentbox/components/{model-provider-capability,profiles-settings-section,session-view-agentbox}.tsx
?? src/features/agentbox/components/binding-selection.tsx
?? src/features/agentbox/components/binding-selection.test.tsx
 M src/i18n/messages/{en,zh-CN}.json
```

Frontend baseline test state (read-only run, pre-P0): vitest 377 files / 5090 tests all
passing. No Playwright dependency yet (browsers cached at ~/.cache/ms-playwright).

The two worktrees are worktrees of the SAME repository
(`https://github.com/mmm-05610/agent-box-studio.git`); the uncommitted cross-repository
state must NOT be confused with a released build. The Goal continues without a Git
merge; the human may checkpoint both dirty worktrees later.

## 2. Cross-repository API seam (the one versioned contract)

Backend authority: `plugins/agent-box-studio` HTTP+WS on `127.0.0.1:3081`
(`agent-box-studio serve`), REST base `/api/v1`, Bearer token
(`AGENT_BOX_STUDIO_TOKEN`), anonymous `/api/v1/health` only, WebSocket via one-time
ticket (`POST /api/v1/ws-ticket` → `single_use, expires_in=30`).

### 2.1 Contract differences found in the frontend (reconciliation targets)

| # | Topic | Frontend today | Backend authority | P0 action |
|---|---|---|---|---|
| 1 | Profiles list/create | `GET/POST /api/v1/profiles/{harness}` | `GET/POST /api/v1/harnesses/{harness_type}/profiles` | RED test → align client |
| 2 | Profile get/update/delete | `GET/PUT/DELETE /api/v1/profiles/{h}/{id}` | `GET /api/v1/harnesses/{h}/profiles/{id}?revision=N`（PUT/DELETE 待核实：后端本轮只有 list/get/create/CAS-create） | RED test → align list/get；PUT/DELETE 若后端缺失→typed 不可用，不得伪造 |
| 3 | WS auth | raw `?token=` query | one-time `?ticket=`（30s，single-use） | RED test → ticket flow in transport |
| 4 | WS cursor | no `after` cursor | `?after=<committed watermark>`；gap → 4409 resync | RED test（transport 支持 after；UI 消费可分阶段） |
| 5 | Turn create DTO | `{input_text, harness_type, idem_key, profile_ref, model_overlay, handoff_from}` | `{idempotency_key, input, harness_type, execution_provider_id, profile{profile_id,revision,digest}, model{model_id,provider}, launch_mode, continue_from_turn_id}`（extra=forbid） | RED test → align request body |
| 6 | Session create DTO | `{...project fields}` → `StudioSessionDto{id, project_path, title}` | `{idempotency_key, title, project_path|project_id}` → `{session:{session_id,...}}` | RED test → align |
| 7 | Turn receipt reading | `TurnReceiptDto{turn_id,state,idem_key}` | accepted payload `{turn_id, execution_ids, state, run_phase, binding...}` | RED test → align |
| 8 | Permission | throws UNSUPPORTED | `POST .../permissions/{rid}/respond {decision: approve|reject}`；`permission.requested` 事件带 harness request id + options | P4 phase work（P0 只冻结契约测试） |
| 9 | Provider authority | `ModelProvidersPort` 无后端（UI 显式 unavailable 卡片，不伪造） | P2 新增 generic API v2 contribution | P2 phase work |

### 2.2 Mock/readiness claims

- 前端合成 ports（`synthetic-profile-provider-ports.ts`）已为 test-only（仅测试文件引用），
  readiness 恒 `unknown`、`test()` 明确拒绝——无 mock readiness 声明需要移除。保持不变。
- `ModelProviderSettings` 在 agentbox 模式下显式渲染 "unavailable for this connection"
  卡片（诚实不可用），保留至 P2。

### 2.3 Port facts

- 前端 dev 3000（Next.js static export + Tauri）；legacy codeg 后端 3080（默认 transport）。
- AgentBox URL 由用户配置（`studio:agentboxUrl`，无默认值）；本 Goal 统一使用 3081。
- WSL/Windows 事实：默认 NAT 模式，localhost 转发可用（P-1 §15.7 已实测）；保持 `127.0.0.1` 绑定。

## 3. P0 exit criteria

- 前端对唯一版本化 API 契约编译（TS 类型 + 客户端对齐上表 1–7）；
- 每个受影响 endpoint/renderer 状态的 RED 契约测试先于产品编辑（缺失行为真实失败）；
- 合成 ports 保持 test-only；
- 全部 vitest（既有 5090 + 新增）绿；
- 后端无行为变更（P0 允许的最小 schema/app 改动仅当契约缺口确属后端缺型，且同样 test-first）。

## 4. P0 exit evidence (2026-09-05 16:05)

- RED first（对齐前真实失败）：
  - 前端新契约测试 `src/core/ports/agentbox-wire-contract.test.ts` 12/12 失败
    （WS 票据缺失、`?token=` 直传、无 after 游标、replay 不放行、profiles 路径/请求体、
    session/turn DTO 形状、删除未 fail-closed）；既有 20 个测试钉住旧线协议同样失败
    ——两组共同构成 RED 证据。
  - 后端 B1（get profile 投影缺 native_payload）
    `test_profile_get_projection_carries_bounded_native_payload` 失败。
- GREEN：
  - transport：一次性票据握手（每次连接重取）、`?ticket=`、`after` 游标、
    首个 replay 批即就绪并作为数据帧分发；reconnect 重新握手。
  - profiles 门面：`harnesses/{h}/profiles` 权威面；CAS create 承担 update；
    delete fail-closed UNSUPPORTED；get 读取 `{profile:{...}}` 信封。
  - session/turn DTO：`{idempotency_key,title,project_path}` → `session.session_id`；
    turn 请求体按 TurnCreateRequest（profile/model/launch_mode/continue_from_turn_id）。
  - ProjectsPort：`GET /api/v1/projects` 权威投影（受限身份，无宿主路径）。
  - 后端 get profile 投影携带 bounded `native_payload`（list 保持无 payload）。
- 全量：前端 vitest 378 文件全绿（含新增 12 契约测试）；`tsc --noEmit` 干净；
  触达文件 ESLint 干净（1 个良性 unused-param 警告）；后端 studio 套件 125 全绿。
- 合成 ports 保持 test-only（未触碰）；无 mock readiness 声明。
- 前端工作树 P0 变更面已按其自身约定记录于
  `docs/design/frontend-reconstruction-spec/PHASE_FILE_LEDGER.md`（P0 节）。

**P0 EXIT：PASS** — 前端对唯一版本化 API 契约编译；缺失行为以 RED 测试证明后才动产品代码。
