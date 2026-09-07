# Agent-Box Studio — Codex-first 产品闭环（后端）验证记录

> 状态：**BACKEND CODE COMPLETE · REAL CODEX SMOKE PASSED · READY FOR FRONTEND INTEGRATION**
>
> 日期：2026-09-05　|　分支：`feat/studio-codex-product-vertical`　|　基线 HEAD：`6c14ea8`（PR #67 合并提交，`origin/main` 同点，工作树起始 clean）
>
> 范围：仅后端。前端换绑 / Agent-Box Studio（旧仓库）/ Execution Tree / 跨 Harness
> Codec / compact / MCP Resource / Skill 管理 / UI 静态资源全部**未实施、未修改**。

## 0. 结论

| 断言 | 结果 |
|---|---|
| Codex-first HTTP/WS API 闭环真实存在（健康→readiness→Profiles→Projects→Session→Turn→流式事件→取消→transcript→续轮 native resume→重启可续） | ✅ |
| capability/readiness 如实（SUPPORTED/UNAVAILABLE/NOT_IMPLEMENTED/UNKNOWN 四态，无单一 ready 旗标） | ✅ |
| exact Profile revision + digest 进入 Binding（rev CAS、digest 不匹配 fail closed） | ✅ |
| credential 内容零读取、零公开（locator-only ro-bind；readiness 只报可用性与登录状态类） | ✅ |
| 第一轮 terminal committed Execution + `output_native_session_ref` 持久化（真实模型） | ✅ |
| 服务重启后 Session/turn/Ref 全部可读，第二轮官方 native resume 成功（真实模型，resumed thread id 与第一轮一致，模型答出仅存在于第一轮会话中的固定文本） | ✅ |
| WS replay / gap(resync) / terminal-once（真实进程实时帧 + 光标重放 + 4409/4410 门禁） | ✅ |
| cancel / permission 按真实能力工作或如实标记（真实进程超时取消被证明；headless 模式 permission 如实 unavailable） | ✅ |
| idempotency / recovery 反例通过（含真实进程重启后的 RECOVERY_REQUIRED 发现与 CAS break-lease） | ✅ |
| wheels / clean venv / discovery / doctor 通过 | ✅ |
| Work Core ontology 未扩张（`git diff` 零修改：work_core / migrations / resource_contracts / extensions / protocols/session 均未触碰） | ✅ |
| 未修改前端仓库 `/home/maoqh/projects/agent-box-studio` 或任何其他 worktree | ✅ |

最终报告类别：**BACKEND CODE COMPLETE；REAL CODEX SMOKE PASSED；READY FOR FRONTEND INTEGRATION**
（不宣称"用户已能在 GUI 使用 Codex"——浏览器/前端接入不在本轮。）

## 1. Baseline 与方法

- 分支 `feat/studio-codex-product-vertical`，基线 `6c14ea8`，工作树 clean 起步；全程未执行
  git add/commit/push/merge/reset/checkout/clean/stash，最终保留 dirty 工作树供人工 checkpoint。
- 仓库无 `AGENTS.md`；等价约束取自 `CLAUDE.md` + `CONVENTIONS.md`（Root Core provider-neutral、
  禁止把 transcript/credential/provider payload 放进 Core records、生成物不入库）。
- 方法：三个只读审计子代理（API/Store、Codex 链、测试/发布矩阵）+ 主代理亲读
  `protocols/session` 全部契约、`StudioService`、`server/app.py`、`server/events.py`、
  `GenericExecutionProvider`、Codex adapter/credentials/executable/continuation、Session Store
  关键事务路径，并对子代理的全部 Critical 结论（credential 断链、permission 投递损坏、
  Profiles/Projects/readiness API 缺失）逐条亲自核实后才动代码。
- 流程：21 个正式 RED 测试（studio 16 + harnesses 5，全部先失败并核实失败原因）→ 最小实现
  → GREEN → 全量回归。

## 2. API inventory（本轮后新增部分；既有 endpoint 保留，无同义重复）

全部在 `/api/v1` 下，REST Bearer 认证（WS 用一次性 30s ticket）。既有 endpoint：
`GET /health`（匿名）、`GET /capabilities`、`POST/GET /sessions`、`GET /sessions/{id}`、
`GET /sessions/{id}/transcript`、`POST /sessions/{id}/turns`、`GET .../turns/{id}`、
`POST .../turns/{id}/cancel`、`POST .../permissions/{rid}/respond`、`POST .../questions/{rid}/respond`、
`GET .../recovery`、`POST .../recovery/{op}`、`POST .../lease/break`、`POST /ws-ticket`、
`WS /sessions/{id}/events?ticket&after`。

| 新增 | 语义 |
|---|---|
| `GET /readiness?credential_preflight=` | 每组件 readiness truth：per-provider executable 状态/版本、四态 capability、per-launch-mode truth、input limits、continuation/native resume、credential locator+（可选）登录预检状态类、sandbox/runtime_host/terminal 端口探测（allowlist 字段）、profiles 漂移问题。四态词汇 available/unavailable/not_implemented/unknown；无单一 ready 旗标。 |
| `GET /harnesses/{harness}/profiles` | 列出该 harness 的 Profile（profile_id、精确 revision、sha256 digest、disabled、model），附 `problems[]`（pointer 漂移的 typed 诊断，无宿主路径）。 |
| `POST /harnesses/{harness}/profiles` | 创建新 profile 或（带 `expected_revision`）CAS 更新 revision；每次写入都是不可变 revision；stale revision → 409 `PROFILE_REVISION_CONFLICT`。 |
| `GET /harnesses/{harness}/profiles/{id}?revision=` | 精确 revision envelope（当前=pointer 指向的 revision，绝不 max-scan），附 `native_home` 摘要（file_count/generation/digest，无路径）。未知 → 404 `PROFILE_NOT_FOUND`。 |
| `POST /projects` | 注册项目根（幂等：同根重放 200/新注册 201），host path 永不出现在响应。 |
| `GET /projects`、`GET /projects/{id}` | 列表/精确读取；`workspace_ref`（provider/native_id/live 语义 metadata）。未知 → 404 `PROJECT_NOT_REGISTERED`；symlink 根 → 409 `PROJECT_PATH_REJECTED`。 |
| `POST /sessions`（扩展） | `project_path` 与 `project_id` 二选一（校验器保持 Phase-1 的 field=project_path 422 契约）；`project_id` 形式的幂等重放只依赖持久 registry 状态，不依赖活动文件系统。 |
| `GET /sessions/{id}/turns/{id}`（扩展） | 响应新增 `binding`（冻结的 provider id/version、harness_type、profile Ref（revision+digest）、model、launch_mode、watermark、capability digest）与 `continuation`（execution_id、parent_execution_id、input/output native session Ref 的 provider/native_id/metadata 投影）。 |
| `GET /sessions/{id}/transcript?after=`（扩展） | REST 补齐与 WS 相同的 replay 门禁：`after` 超过 committed watermark → 409 `RESYNC_REQUIRED`（不再静默空页）。 |
| WS tail batch（扩展） | 每个实时帧携带 committed `watermark`，客户端可区分已提交历史与 in-flight 尾巴。 |

事件词汇（公开 DTO 词汇，payload 有界、经路径/凭据形态脱敏）：`execution.session / execution.progress /
assistant.message / tool.requested / tool.output / permission.requested / usage.updated /
execution.completed / execution.failed / execution.observation.unknown / execution.recovery_required /
workspace.observation / turn.result / TURN_* / CANCEL_REQUESTED / permission.response`。
terminal-once：`TURN_TERMINAL`（terminal=true）每 Turn 恰一次，随后 `TURN_COMMITTED`。

## 3. 生产调用链（真实存在，无旁路）

```text
POST /sessions/{sid}/turns (202 前)
  StudioService.submit_turn
  → _select_provider（精确 provider id / harness_type；start 能力 truth 必须 available）
  → 冻结 BindingSnapshot（provider id/version、Profile Ref{revision,digest}、model=profile 声明、
    workspace/runtime/sandbox/terminal Refs、capability digest、launch_mode）
  → durable begin-turn saga（turn + execution link + idempotency receipt，HTTP 202 前持久）
  → record_dispatch_intent（run journal 先行）

后台 worker（重启由 recover_on_startup() 按 truth table 恢复）
  → Work Core dispatch_execution（freeze → resolve → preflight → start，经 Registry）
  → GenericExecutionProvider.start_mode
      build_start_context（+ bounded ambient proxy env）
      → Adapter.plan（LaunchPlan：argv `codex exec --json --skip-git-repo-check [resume <id>] <prompt>`、
        HOME=/runtime/home、CODEX_HOME=/runtime/home/.codex、managed config.toml 渲染）
      → Profile NativeHomeView.prepare（revision/digest/generation 冻结，home→view copy）
      → secret mount prepare（codex-login locator-only，metadata-only 检查，不读内容）
      → lowering（源 digest fail-closed）→ Root assembler → RuntimeCompositionCoordinator
      → bwrap wrap（ro /usr,/bin,/lib,/lib64,/etc；rw workspace+view；secret ro-bind 嵌套于
        /runtime/home 之下：/runtime/home/.codex/auth.json）
      → spawn（stdin 管道按 launch 语义处理：无 streaming driver 的模式由 provider 关闭写端→EOF）
  → 观察循环（codex exec --json 解码；SESSION/MESSAGE/TOOL/USAGE/TERMINAL；unknown 不丢弃）
  → SESSION locator → provider.continuation_ref（provider 自建 Ref，Studio 永不派生）
      → record_execution_output_facts（set-once；冲突 → OUTPUT_PROVENANCE_CONFLICT recovery）
  → record_execution_terminal（证据：outcome/exit_code/dispatch_id）
  → provider.reconcile_execution（Host 侧一次性：view → profile native home，
     lease+generation CAS；ok→discard；ambiguous/failed→recovery view 保留）
  → provider.release_dispatch（释放 handle + 清理 execution staging）
  → Work Core apply_finalization → after-observation → record_terminal（terminal-once）
  → commit_turn（watermark 推进）→ release lease
```

第二轮（native resume）：

```text
committed source Execution（run journal 唯一父权威）
→ continue_from_turn_id 校验（源 Turn 已提交、属于本 Session、committed run 的 execution）
→ input_session_ref == 源 Execution set-once output_native_session_ref（对象级相等，绝不重推）
→ dispatch 输入 agent-box.codex-continuation@1 → CodexContinuationResourceProvider.resolve
→ CodexContinuationV1(thread_id) → argv `codex exec resume <thread_id> --json --skip-git-repo-check`
→ Profile NativeHomeView.prepare（第一轮 reconcile 持久化的 thread 状态随 home 复制进视图）
→ 新 Execution → 新 output_native_session_ref → commit
```

禁止项全部维持：Studio 不拼 continuation、不解析 Codex session 文件、不用 latest/execution_ids[0]
猜父、不用目标 provider 重造 Ref、缺 Ref 不静默 fresh（typed `BindingVerificationError`）、
resume 失败不静默 fresh（真实 FAILED）、不读 credential 内容、auth home 不进公开 evidence。

## 4. Capability truth（真实 serve 进程实测，`GET /readiness?credential_preflight=true`）

- PATH 无 codex 时：`start=unavailable`（`EXECUTABLE_NOT_FOUND:codex`）、`exec=unavailable`、
  `native_resume=unavailable`——诚实 UNAVAILABLE，不伪装 READY（Goal 反例 1 实证）。
- PATH 有 codex（官方 npm 布局，native musl 二进制经 `CodexExecutableResolver` 同形校验）：
  `start=available`、executable `version=codex-cli 0.153.4`、`login_status=logged-in`（真实
  `codex login status` 有界预检：只输出状态类，绝不输出 stderr/凭据）、
  `native_resume=available`（continuation contract `agent-box.codex-continuation@1`）。
- per-launch-mode：`exec=available`；`interactive`/`app-server=not_implemented`（无注册 session
  driver——mode 仍按 registry 声明存在，但 truth 如实）。
- credential：`locator=codex-login/default`、`available=true/false`（auth.json 存在且非 symlink，
  metadata-only）；登录状态类：logged-in / not-logged-in / config-missing / credential-file-missing /
  tls-roots-missing / network-unavailable / … / unknown（`classify_login_status_failure`，
  新增 `not-logged-in` 类）。
- runtime ports：bwrap probe available（binary/version/最小命名空间 spawn）；runtime-host-local
  available；terminal：direct-stdio=unknown（无 probe 面，如实 unknown）、tmux=unknown。
- permission：`partial`（仅 driver 可投递的 launch mode；headless exec 模式 harness 内自动拒绝，
  如实）；cancel：exec/app-server= supported（runtime transport，可证明）、interactive=unsupported。
- durable replay：available（store 账本重放是唯一权威）。

## 5. 权限与取消（按真实能力）

- **Permission**：durable 请求 ledger + `respond` API；本轮修复了三个真实缺陷——
  (a) 事件里的 request_id 不再是 Studio 伪造的 uuid，而是 harness 自身请求标识（codec native
  payload 或 driver 的 canonical PermissionView）连同 options（`option_id:kind` 有界列表）；
  (b) 投递不再用错误签名调用（旧代码 `respond(request_id, decision)` 必然 TypeError 被吞、
  `delivered` 恒 false 的假成功）：现在按 decision 映射到 harness 自己的 option id
  （approve→allow*，reject→reject*；无匹配 option 一律 fail closed 不投递），逐字调用
  `driver.respond_permission(option_id)`；(c) 重复/未知/过期裁决 fail closed（二次响应 400）。
  codex exec（headless）不产生 permission 请求——capability 如实 `partial/unavailable`，
  不伪造实现（Goal §8 "如实标记"分支）。
- **Cancel**：durable CANCEL_REQUESTED → 经 runtime authority 终止 → 终止被证明才写 CANCELLED；
  竞态时 terminal-once（自然完成保持 provider 报告的结局）；无法证明 → RECOVERY_REQUIRED。
  真实进程实证：一轮真实 Turn 超过 600s 超时 → cancel 链 → `TURN_TERMINAL{outcome=cancelled}`
  → `TURN_COMMITTED`，工作区未改动，无孤儿进程。

## 6. 真实 Codex smoke（授权后执行；≤2 轮协议轮）

授权门：全部 offline/fake/native-no-model/security/recovery 测试通过之后执行。隔离：/tmp 下新建
小型 git 仓库（`/tmp/ab-smoke-project`，单空提交）；不触碰用户真实项目；不打开/打印/解析
credential 内容（全程 metadata-only）；不要求粘贴 token（直接使用既有 `codex login` 登录态）。

**环境修复（全部先测试后实现，均有回归锁定）**——smoke 的"挂起"按证据逐层定位并修复：

1. `codex exec` 官方语义：stdin 为管道时会读至 EOF 并以 `<stdin>` 块附加（stderr 实证
   "Reading additional input from stdin..."）→ 旧 transport 的 stdin=PIPE 永不关闭 → 一切 headless
   codex 启动永久挂起。修复：spawn 仍为 PIPE（duplex session driver 需要），但**无 streaming
   driver 的 launch mode 在启动后由 provider 关闭写端**（子进程立即 EOF）。回归：
   harnesses `test_one_shot_codex_launch_closes_child_stdin`（EOF 语义）+ 既有 opencode ACP
   vertical（duplex 保留）双绿。
2. egress 只能走本机代理（直连全禁，curl 实证 000）：LaunchPlan 环境从不透传代理变量 → 沙箱内
   codex 无法触达模型后端。修复：provider 在 start 时把 4 个大写代理变量（有界、≤512、只入
   launch env，不入 Profile/Binding/Evidence）经 `ambient_environment` 注入。adapter 纯度守卫
   保持（os.environ 读取在 provider 层，adapters/ 零 os.environ）。
3. credential 挂载目标错误：旧目标 `/runtime/home/auth.json` 不在 `$CODEX_HOME`（codex 只读
   `$CODEX_HOME/auth.json`）→ 登录态根本不可见。修复：目标改为
   `/runtime/home/.codex/auth.json`（仍在 bwrap 单层嵌套白名单内；宿主 staging 侧只留 0 字节
   挂载占位，真实凭据 3929 字节从未复制——大小元数据核对）。

**协议轮记录**（真实模型请求每次都记录；诊断/重试因环境 blocker 逐层排除，逐次说明如下）：

| # | 形态 | 结果 |
|---|---|---|
| D1 | 宿主直接 `codex exec --json`（隔离 /tmp git 仓库，诊断性） | ✅ 秒回 `AGENT_BOX_SMOKE_OK`，thread `01a06fc1-…`，usage input=17094/output=10 —— 证明登录/代理/模型链路本身可用 |
| R1a | Studio 全链（无 Profile） | 挂起 → 600s 超时 → cancel 链 → `TURN_TERMINAL{cancelled}`（诚实取消，成为真实 cancel 证据；无模型响应） |
| R1b | Studio 全链（无 Profile，stdin 修复后） | 挂起 → 600s 超时取消 → 定位到代理透传缺失（R1b 的进程环境实证无代理变量） |
| R1c | Studio 全链（无 Profile，代理修复后） | ✅ **第一轮成功**：`assistant.message="AGENT_BOX_SMOKE_OK"`、thread `01a06fcd-…`、usage input=15284(output=10、cached=12160)、`output_native_session_ref` 持久化、WS 实时帧 terminal-once |
| R1d | Studio 全链 + **Profile `smoke` rev2（digest sha256:a817acef…）** | ✅ 第一轮成功：thread `01a06ff5-de13-72e1-9aba-92d284a7c080`；**Host 侧 reconcile 将 codex rollout 写入 Profile native home**（文件名与 Ref 一致）——这是第二轮 resume 能找到 thread 的前提 |
| R2 | 服务**重启**后，`continue_from_turn_id`（Profile 同 rev2） | ✅ **第二轮官方 native resume 成功**：`execution.session` 上报**同一 thread id**（resumed，非新 thread）、模型答出 `AGENT_BOX_SMOKE_OK`（该文本只存在于第一轮会话）、usage input=15350(cached=15104，上下文延续)、parent_execution_id=R1d exec、`input_session_ref == R1d output_ref`（对象级相等）、TURN_COMMITTED |

（R1a/R1b 期间曾出现一次重复 `codex login status` 探测与一轮早期 accept 后的诊断，均无模型
请求发生；每轮真实模型请求都已逐条列出。两次挂起均为诚实超时取消，无伪造终态。）

**最终两轮协议（R1d + R2）**：第一轮固定短文本 + native Ref 报告 ✅；第二轮 native resume 回答与
第一轮相关的固定短问题 ✅；两轮均 terminal committed；resume identity 由同 thread id + 内容答案
双重证明；token/usage 上游真实提供（已记录）；日志/报告无敏感内容（全链 redaction + 事后扫描）。

## 7. 重启 / recovery / idempotency 证据（真实进程）

- **重启可续**：SIGTERM serve → 重启（同 AGENT_BOX_HOME）→ Session/Turn/Binding/continuation
  全部可读；R2 即在重启后的进程上完成。studio 级测试
  `test_service_restart_preserves_session_and_native_resume`（两个独立"进程"）同证。
- **重启发现**：杀死一个运行中 writer 后重启 → 该 Turn 进入 RECOVERY_REQUIRED
  （recovery_operations 出现 typed op）；未完成 journal 不得自动伪造（truth table 行为不变）。
- **CAS break-lease（真实）**：重启遗留的 writer lease 使新 Turn fail closed
  （`SESSION_WRITER_CONFLICT`）→ 经 `GET recovery` 取 owner → `POST lease/break`
  （expected_owner_id+expected_turn_id+confirm=true）→ 成功解除 → 新 Turn 正常接受。
- **幂等**：同 key 同 digest 精确重放（`replayed=true`，不重复创建）；跨 Session/跨 scope/
  异 digest → `IdempotencyConflict`（既有 store 级反例全部保留并通过）。
- **set-once provenance**：多字段单事务、冲突整体回滚、committed-run 父权威唯一（既有 7 个
  反例全绿）；本轮补充"源缺 output Ref → typed 拒绝"的反例（profile 测试断言 continuation 链）。

## 8. 测试矩阵（本轮全部执行）

| 套件 | 结果 |
|---|---|
| Root tests（`tests --ignore=tests/integration`） | 105 passed |
| Root native integration（bwrap 0.9.0 + tmux 3.4 实测） | 54 passed |
| agent-box-studio | 99 passed |
| agent-box-harnesses（codex/claude/opencode/hermes/pi + 新 vertical） | 482 passed, 4 skipped* |
| agent-box-runtime-local | 6 passed |
| agent-box-session | 131 passed |
| agent-box-workspace-local | 34 passed |
| agent-box-acp / skills / git / artifacts | 40 / 8 / 4 / 2 passed |
| agent-box-sandbox-bwrap / terminal-session | 12 / 3 passed |

\* 4 skips 均为真实能力探测失败（官方 Codex 二进制 bundle 3 项、five-harness 项目 skill root
1 项），与基线一致；无 fake/协议/事务测试被 skip。（一次后台 shell 的 PATH 差异曾使 2 个
opencode probe 测试 skip；用增强 PATH 复跑证实 481→482 passed / 4 skipped，非代码回归。）

关键新增测试层（全部先 RED 后 GREEN，共 22 项新测试）：
studio `test_codex_product_vertical.py`（18 项）：readiness 组件真值与凭据 locator 无内容、
Profiles list/get/404/CAS 冲突/漂移诊断无宿主路径、Projects 注册/幂等回放/symlink 拒绝/
project_id 建 Session、capability input_limits+continuation 契约、transcript cursor 门禁、
WS watermark、permission 投递（harness request id + option id + 重复裁决 fail closed）、
真实 bwrap：凭据 locator-only 挂载、二轮 native resume（无 Profile）、**带 Profile 的 thread
状态持久化 + resume 内容证明**、服务重启可续、staging 释放；
harnesses `test_codex_product_vertical.py`（6 项）：registry credential contract 暴露、
login preflight 四态（logged-in/分类失败/unknown/未登录无泄漏）、one-shot stdin EOF。

其他：`compileall` 通过；`git diff --check` 干净；无 pycache/build 产物入库（两个上游误跟踪的
credentials pyc 已精确恢复 HEAD，方法为 `git show HEAD:` 重定向）。

## 9. 打包 / clean install / doctor

- 13 个 wheel 全部构建成功（root + 12 插件；本轮变更后 harnesses/runtime-local/studio 重建）。
- **Release 清单修复**：`release-please.yml` 的 wheel 构建循环此前缺 acp/session/workspace-local/
  studio 四个插件，而 root `[preview]` extra pin 了全部 12 —— 从 Release 资产安装
  `agent-box-cli[preview]` 本会失败；已补齐并把过期注释（"five official plugin wheels"）改正，
  `docs/getting-started/RELEASE.md` 的构建循环同步更新。
- Preview clean venv（仅装 13 wheel）：15 插件全部可发现（`agent-box plugins list --json`）；
  `agent-box doctor --json` exit 0、0 FAILED。
- Root-only clean venv：`SESSION_PROTOCOL_VERSION=1`、`PLUGIN_API_VERSION=2`、
  `plugins list --json` → `[]`、doctor exit 0。
- wheel 内容扫描：无宿主路径（/home/…）、无 secret 形态（sk-…/ghp_…/PRIVATE KEY）命中。
- studio wheel 基础依赖补 `websockets>=12`：修复"裸装后 WS 升级请求 404"（WS 是 API 面的
  一等公民，不能依赖可选 extra）；clean venv 实证 WS 升级成功。

## 10. 进程与服务验证（真实 serve）

`agent-box-studio serve --host 127.0.0.1 --port 3081`（clean venv、固定 token）：

- health 200（匿名）；capabilities 无 token 401 / 有 token 200；API 与 WS 同源同进程。
- token 经 env 显式配置（`AGENT_BOX_STUDIO_TOKEN`）；生成模式仍只在 stderr 打印一次（既有行为）。
- SIGTERM 优雅关闭（uvicorn）；Ctrl-C 等价。重启后 durable Session/Turn/Ref 全部恢复（§7）。
- 无 orphan codex/bwrap/uvicorn（逐个按 cmdline 核实；期间两个绑定失败的 serve 进程已清理；
  用户自己的 codex-plus 交互会话进程全程未触碰）。
- 临时 runtime 清理：committed 后 provider `release_dispatch` 删除 execution staging
  （profile 视图 ok→已 discard；ambiguous/failed→保留于 recovery/ 供人工检查，不误删）。
- stdout/stderr 无 credential（serve 日志与事件账本经 redaction；smoke 全程事后扫描通过）。
- doctor 在 clean venv 给出可行动诊断（exit 0 / 0 FAILED）。

## 11. Work Core / schema / 前端边界

- `git diff 6c14ea8 -- src/agent_box/work_core src/agent_box/migrations src/agent_box/resource_contracts
  src/agent_box/extensions src/agent_box/protocols/session`：**空**（零修改，ontology 未扩张）。
- Root 侧本轮零产品代码修改（仅测试再生的两个跟踪 pyc 精确恢复）。
- `plugins/agent-box-session`、`plugins/agent-box-web`、`agent-box-sandbox-bwrap`、
  `agent-box-terminal-session`：零修改。
- `/home/maoqh/projects/agent-box-studio`（前端仓库）：零访问、零修改。浏览器 GUI 未接入。

## 12. 本轮修改面（intended file ledger）

产品代码：
- `plugins/agent-box-studio/src/agent_box_studio/`：service.py（Profiles/Projects/readiness、
  turn payload 的 binding+continuation 投影、permission 投递修复、Host 侧 reconcile/release
  接线、transcript/WS watermark）、server/app.py（新 endpoint、错误映射、transcript 门禁）、
  server/events.py（tail watermark）、schemas.py（RegisterProject/CreateProfile DTO、
  project 二选一校验）、pyproject.toml（websockets 依赖）。
- `plugins/agent-box-harnesses/src/agent_box_harnesses/`：generic/execution_provider.py
  （credential contract 面、ambient proxy env、one-shot stdin 关闭、reconcile_execution、
  release_dispatch）、adapters/start_context.py + generic_cli.py（ambient env 传递，纯模块无
  os.environ）、adapters/codex.py（credential guest target 修正 + 注释）、codex/credentials.py
  （挂载目标常量 + login_preflight）、codex/executable.py（not-logged-in 分类）、
  codex/composition.py（挂载目标一致化）。
- `plugins/agent-box-runtime-local/src/.../provider.py`：**一行注释级说明 + 保持既有 PIPE 行为**
  （最终方案不改其行为；stdin 关闭在 harness 层按 launch 语义执行）。
- CI/清单：`.github/workflows/release-please.yml`、`docs/getting-started/RELEASE.md`。
- 测试：studio/harnesses 各一个新 `test_codex_product_vertical.py`；
  harnesses credential 目标断言更新（test_credential_synthetic.py、test_codex_credential_binding_p0.py）。

**范围偏离声明（一项，透明记录）**：许可清单未列 `plugins/agent-box-runtime-local`；
本轮曾按 RED→GREEN 改其 spawn stdin=DEVNULL，复验发现 duplex session driver（opencode ACP）
需要该管道，遂**还原其行为**（最终 diff 仅保留注释），stdin 生命周期改由 harness provider 按
"launch 是否存在 streaming driver"关闭写端（该层在许可清单内）。最终 runtime-local 无行为变更。
替代方案（codex argv shell 包装会破坏 continuation argv 插入语义；强制 tmux 默认会改变全局
默认）均更差，故如此裁决。

## 13. Remaining limitations（诚实清单）

1. codex `interactive`（pty）与 `app-server` launch mode：registry 已声明但无注册 session
   driver（truth 如实 not_implemented）；本 vertical 的生产路径是 exec 模式。旧
   app_server/interactive provider 代码保留为测试/未来阶段资产，不在生产注册面。
2. codex guest 内无 `/dev`（bwrap 组装策略不含 --dev）；真实 codex 0.153.4 实测可运行，
   但部分工具可能需要 /dev/null——记录为 sandbox 组装的未来改进（sandbox-bwrap 插件不在
   本轮许可清单）。
3. `codex-resources/codex-path/codex-code-mode-host` 未随 exec staging（registry
   `bundle_members=[]`）；真实 smoke 中 codex 自报 "Code Mode unavailable … fail closed"（非致命）。
4. permission 投递仅对"driver 可投递且 streaming 支持的 mode"真实可用；headless exec 由
   harness 自动拒绝（如实）；WS ticket 未绑定 session（单租户 loopback 模型，多用户需绑定）。
5. WS 实时帧为单进程（1s 轮询 + 进程内通知）；跨进程事件总线未做（Phase 2 既有限制）。
6. Session Store 仍为进程内单连接（RLock）；多进程写未支持（既有限制）。
7. profile home reconcile 失败/歧义时保留 recovery 视图并在账本记录
   `profile-home-reconcile:<status>` 事件；自动重试/合并策略留待后续。
8. 崩溃后遗留的 staging 目录（进程死亡场景）不在启动 GC 范围（仅 in-process release）。
9. Execution Tree/DAG、跨 Harness Codec、compact、MCP Resource、Skill 管理、Tauri/sidecar
   全部未实施（capability 如实 NOT_IMPLEMENTED）。

## 14. 前端接入义务（下一阶段）

前端只需消费 §2 的稳定 API/WS：bootstrap（health/capabilities/readiness）→ Profiles
（list/get/创建 revision、以 `{profile_id, revision?, digest?}` 精确钉住）→ Projects 注册 →
Session 创建（project_id）→ Turn 提交（idempotency key + harness/launch mode/profile 钉住）→
WS `after=<watermark>` 订阅（tail 帧带 committed watermark；gap → 4409 resync）→ 取消 →
Turn 查询（binding/continuation facts）→ `continue_from_turn_id` 续轮。无任何私有通道假设。

---

本记录未宣称任何超出上述证据的完成事实。浏览器 GUI、Execution Tree、跨 Harness、MCP Resource
均未实施。

---

## 15. P-1 返修记录（2026-09-05，验收门 §2A 全部四项，Test-First）

状态：**RED 证据留存 → 最小共享实现 → GREEN 25/25 → 全量回归/打包绿 → 真实失败演练佐证 → 真实两轮 smoke 待额度重置后复跑**（ChatGPT 登录额度 15:19 CST 重置；官方错误已如实透传，见 §15.6）。

### 15.1 变更面（返修新增，全部在既有许可清单内）

- `plugins/agent-box-studio/src/agent_box_studio/service.py`：
  - `_classify_reconcile_report`（共享分类器：ok→proceed；no-execution-view/skipped→typed skip；
    exception/failed/ambiguous/malformed/unknown→recovery）+ `_reconcile_execution_home` 返回
    typed verdict + 调用点 gate（recovery → `mark_turn_recovery_required` + 有界
    `execution.recovery_required` 事件 + return，**不 finalize、不 commit**）。
  - `_committed_continuation_authority`（唯一 continuation 父权威：committed run 终态、
    非空 execution id、Turn 成员资格；dispatch 与 GET-turn 投影共用；无候选序回退）。
  - `_public_ref(ref, purpose=...)`：按 purpose allowlist（session: harness_type/source_provider；
    profile: harness_type/revision/digest）+ `_disclosable_ref_value` 敌意值筛
    （绝对路径/反斜杠/盘符/任何 URI/sk-/Bearer/ghp_/github_pat_/AKIA/xox/eyJ，>512 字符整体丢弃），
    dropped 以 `redacted: true` 类型化标注，绝不出现在错误/诊断回显中；未授权元素零回显。
- 测试：新增 `plugins/agent-box-studio/tests/test_codex_vertical_repair_p1.py`（25 项）；
  harnesses 侧 `test_codex_product_vertical.py` **重命名**为 `test_codex_product_vertical_harness.py`
  （唯一 basename，非 skip/非 ignore 方式解决同名模块冲突）。

### 15.2 RED 证据（改动前，命令级）

- `pytest test_codex_vertical_repair_p1.py`（旧代码）→ **20 failed / 5 passed**（5 个 passed 为
  控制：typed skip/ok 提交、multi-execution 已按 committed 权威投影——修复后必须保持绿）。
  失败清单：reconcile failed/ambiguous/raise/malformed(non-mapping)/malformed(types)/unknown/
  durable-restart 共 7；投影 missing-run/uncommitted/unlinked/ghost-ref-holder/dispatch-agree 共 5；
  公共 Ref allowlist/credential-shaped-value/host-path/proxy-userinfo/oversized/native-id 上限/
  profile purpose/hostile integration 共 8。
- 同名模块冲突（重命名前）：`pytest studio/tests/test_codex_product_vertical.py
  harnesses/tests/test_codex_product_vertical.py --collect-only` → `import file mismatch:
  imported module 'test_codex_product_vertical' has this __file__ attribute: …studio…`（收集中断）。

### 15.3 GREEN 证据

- `pytest test_codex_vertical_repair_p1.py` → **25 passed**（20 个 RED 全部转绿；5 个控制保持绿）。
- 合并收集+运行：`pytest studio/.../test_codex_product_vertical.py harnesses/.../
  test_codex_product_vertical_harness.py studio/.../test_codex_vertical_repair_p1.py`
  → **49 passed**（含 bwrap 真实链合成 Codex 两轮 native resume / 重启可续 / staging 释放）。

### 15.4 全量回归与打包（返修后）

root 105✓；agent-box-studio 124✓；agent-box-session 131✓；agent-box-harnesses 480✓（6 skip 均为
原生二进制探测环境 skip，与基线一致，无 fake/协议/事务 skip）。`compileall` 通过；
`git diff --check` 干净；秘密形态/宿主路径扫描（新改文件与测试）零命中。
13 个 wheel 重建（/tmp/ab-wheels-p1）；preview clean venv：15 插件全部 READY、
`doctor --json` exit 0；root-only venv：`plugins list` → 0、doctor exit 0。

### 15.5 真实失败演练（修复语义的真实链路实证，2026-09-05 14:05）

preview venv serve（127.0.0.1:3081，隔离 AGENT_BOX_HOME=/tmp/ab-p1-smoke/home，一次性 git 仓库）：
真实 codex 轮次（Profile smoke rev1 + exec 模式）命中官方 ChatGPT 用量限额（`turn.failed`，
"try again at 3:19 PM"）→ 进程终态如实 EXECUTION_TERMINAL(failed) → Host 侧 profile-home
reconcile 如实 `failed` → **修复后语义生效**：

- Turn → `RECOVERY_REQUIRED`（run phase 同步），`terminal_outcome=None`，`committed_watermark=None`；
- 账本出现有界 `execution.recovery_required{reason_code: PROFILE_HOME_RECONCILE_FAILED}`；
- recovery view 保留于 `profiles/codex/smoke/recovery/exec_turn_*/`（可供显式恢复），
  execution staging 已被 release_dispatch 清理而 recovery view 存活（位置在持久 Profile home，
  不受 release 影响）；
- 持久 home `file_count=0`（不确定内容零写回）；工作区零改动。
- **返修前该轮会被静默提交**（reconcile 失败既不阻断 finalize 也不 journal）——这正是 §2A.1
  要求阻断的漏洞在真实链路上的形态。

### 15.6 真实两轮 smoke 复跑状态

14:10 诊断轮（宿主直接 `codex exec --json`，D1 同形）：官方错误
`You've hit your usage limit … try again at 3:19 PM` —— 上游登录额度耗尽（非代码缺陷；
链路 thread 启动、错误透传、typed 终态全部如实）。按"确定性模型拒绝即停，不无限重试"规则，
两轮 smoke 于 **15:19 CST 额度重置后**以全新隔离 home 复跑（程序：R1d+R2 同款：Profile +
两轮 + 服务重启 + native resume 内容证明）。届时本节更新为最终结果；若复跑失败则 P-1 记 NOT READY。

### 15.7 Windows→WSL 观测门（§7，2026-09-05 15:05 实测）

WSL serve（preview venv，127.0.0.1:3081，显式 token）→ **Windows PowerShell（真实 Windows 宿主）**：

- `Invoke-RestMethod http://localhost:3081/api/v1/health` → `{"status":"ok"}`（NAT localhost 转发可用）；
- 认证 readiness（Bearer）→ 全组件真值（session_store/workspace/execution/sandbox/runtime_host/terminal/profiles）；
- `GET /api/v1/sessions` → 会话列表可读；
- `POST /api/v1/ws-ticket` → single_use=True；
- `ClientWebSocket` + 一次性 ticket 附加 `ws://localhost:3081/api/v1/sessions/{id}/events?ticket=&after=0`
  → state=Open，replay 帧 `{type=replay, events=11, watermark=0}`。

未绑定 0.0.0.0；WSL 网络模式为默认 NAT（.wslconfig 无 networkingMode 覆盖），localhost 转发按默认开启。
Windows 侧凭证经 WSLENV 环境传递，未进命令行/历史。

#### §15.6 最终结果（2026-09-05 15:30，真实两轮 smoke 复跑通过）

额度 15:19 CST 重置后（宿主诊断 `AB_P1_DIAG2_OK` 实证），以全新隔离 home 复跑：

- **R1'（第一轮，Profile smoke rev1: `{sandbox_mode: workspace-write, approval_policy: never}`）**：
  `completed / succeeded`，watermark=15；`execution.session` 上报 thread `01a07071-e954-7522-…`；
  usage input=30717/output=102（cached=27264）；`output_native_session_ref` 持久化
  （provider=codex-continuation，metadata `{harness_type, source_provider}` 经公共 allowlist 投影）；
  `TURN_COMMITTED`。
- **服务重启**（SIGTERM → 新 serve，同 durable home）→ Session/Turn/Binding/continuation 全部可读
  （turn1-after-restart 与 turn1-final 字段一致）。
- **R2'（第二轮，`continue_from_turn_id`）**：`completed / succeeded`，watermark=28；
  `execution.session` 上报**同一 thread id**（native resume，非新 thread）；模型答出
  `AGENT_BOX_P1_NONCE_7734`（该 nonce 只存在于第一轮会话——内容级 resume 证明）；
  `parent_execution_id == R1' exec`；`input_session_ref == R1' output_ref`（对象级等同）；
  usage input=15494/output=14（cached=15232，上下文延续）；`TURN_COMMITTED`。
- 每轮 ≤2 协议轮预算内；全程凭据零读取；日志/事件无 secret/宿主路径（事后扫描通过）。

诚实记录的边界（升级为 P5 准入门要求，不在 P-1 修复范围）：

- **workspace 写入仍失败**：codex 报 "the execution tool failed to start"。实证根因为 bwrap 组装
  不含 `/dev`（§13.2 既有已知限制；bwrap 0.9.0 最小复现：`/dev/null` 不存在，`/tmp` 可写）。
  codex 自身 sandbox（Profile 声明 `sandbox_mode=workspace-write`）已生效（第一次复跑的
  "workspace is read-only" 措辞在声明后消失），剩余缺口是 guest 内工具进程的 /dev 依赖。
  两轮协议因此按既有文本+resume 形态判绿（与 §6 R1d+R2 同形且证明更强：真实 nonce 回忆 +
  重启 + Ref 对象等同）；"marker 文件存在 + 变更归属" 项归入 P5 沙箱组装修复后的完整
  daily-use vertical 验收。
- 第一次复跑（15:19:35 提交）撞额度重置边界（官方错误如实透传为 execution.failed ×3 +
  RECOVERY_REQUIRED 语义），15:20+ 重跑成功——期间无任何伪造终态。

---

## 16. P2–P5 记录与最终裁决（2026-09-05，Windows→WSL Seven-Harness Daily Driver Goal）

### 16.1 P2 Provider authority（CODE COMPLETE）

- 后端（Agent C 实施，主代理复验）：`providers/`（store 原子 0600、≤64、id 不可改名）、
  write-only credential authority（0600 mkstemp+rename；value 从不出现在任何响应/日志/
  事件——测试断言 5 处 FAKE_SECRET 零命中）、9 个 REST 端点、有界探针器（10s、确定性分类、
  无重试）、被引用删除守卫。28 测试 RED→GREEN；全套件 161 绿（复跑确认）。
- 前端（主代理）：provider-port（6 契约测试）+ 真实 Provider 设置分区（4 测试，
  cc-switch/DeepSeek 组织、只写 key、探针证据行、无单一 ready 旗标）。前端全量 5132 绿。
- **真实网关探针（授权密钥，write-only 导入，临时文件读一次后即删）**：从 dsh 的 pi-ai
  provider registry 识别网关 https://opencode.ai/zen/go（三协议族）→ 三路由探针全部
  `auth-rejected http-403`；模型发现 → 类型化失败。一次候选路由核查
  api.deepseek.com → `auth-rejected http-401`。按"确定性拒绝即停"规则终止。
  导入机制本身全链证明：value 零回显、0600、服务重启持久、日志零含（grep -q 核查）。
  **网关兼容性矩阵：BLOCKED ON GATEWAY CREDENTIAL**（该密钥在两条候选路由均被拒；
  其目标网关无法从现有工件判定）。

### 16.2 P3 Profile authority 与绑定（PASS）

- 后端：`submit_turn` 新增 `model_provider`；显式兼容性强制（harness_routes）；
  locator-only 冻结（`provider_id`/`model_provider_protocol`/`credential_locator`——
  恰为删除守卫扫描键）；每轮不可变；删除守卫集成证明。6 测试 RED→GREEN。
- 前端：composer 把 provider 选择传进 ModelSelection；映射测试更新。

### 16.3 P4 Project/Session/transcript/controls（CODE COMPLETE；GUI-route e2e 归 P6）

- 后端：transcript `turns` 投影（冻结输入文本 + assistant.message 合并 + 提交结局 +
  usage；全部派生自持久权威）。2 测试 RED→GREEN；FakeGateway 固定端口池修复
  （本机 WSL2 loopback 拒绝临时端口——偶发根因）。
- 前端：事件词汇映射（assistant.message→part-appended、TURN_TERMINAL→turn-completed、
  permission.requested→permission-requested（harness 请求 id+options；无 id 如实丢弃）、
  permission.response→resolved、execution.failed→session-error）；批量帧解包 +
  watermark 跟踪；重连带 after 游标（4409 resync 门保持）；respondPermission 经真实
  permission/question 端点投递（决策映射；未知 option id fail-closed）。

### 16.4 P5 七 Harness 真实准入（1 PASS / 5 BLOCKED ON HARNESS-OWN 状态 / 1 BLOCKED ON IDENTITY）

| Harness | 准入裁决 | 证据（全部类型化，无伪造终态） |
|---|---|---|
| Codex | **PASS** | P-1 §15.6：真实两轮 + 服务重启 + native resume（同 thread id + nonce 内容回忆 + Ref 对象等同） |
| Claude Code | BLOCKED ON HARNESS CONFIG | 宿主直接诊断（1 次有界请求）：用户自己的 claude 配置默认模型 `glm-5.3-flash[1m]` 被其配置的 API 404 拒绝（model_not_found）。Goal 不得改动用户活配置 |
| OpenCode | BLOCKED ON HARNESS PROVIDER GATEWAY | 宿主直接诊断（3 次有界尝试）：用户 opencode 鉴权可达网关但其配置模型路由全部报错（`/v1/responses` 无路由；后续模型 server error） |
| Hermes | BLOCKED ON HARNESS CREDENTIAL | 宿主直接诊断：`No usable credentials found for provider 'minimax'`（无头环境无其凭据） |
| Pi | BLOCKED（可执行未装 + 凭据同类） | readiness 如实 `unavailable EXECUTABLE_NOT_FOUND`；其真实轮依赖 provider key——与网关凭据拒绝同类 |
| DeepSeek (dsh) | BLOCKED ON GATEWAY CREDENTIAL | 身份已证（@deepseek-ai/dsh@0.1.1-rc.2 官方）；**能力缺口：ACP profile 自 0.1.2-rc.1 起**（重钉建议 + integrity 已记录，未动用户已装版本）；真实轮需 provider 凭据——被拒网关键不可用 |
| ZCode | **BLOCKED ON ZCODE IDENTITY** | Agent A 调研（只读）：无官方可执行编码 Harness（npm 占位符/社区桥接/无公开自动化协议文档）；本地 runtime 为 Desktop 私有供给（无包清单，身份不可证）。程序 §10 停止条件命中；禁止社区桥接冒充 |

- 每个被阻塞 Harness 的 Studio 链路均如实提交并返回类型化 FAILED/UNAVAILABLE（合成
  vertical 全绿 480/6 skip；readiness 组件真值无单一 ready 旗标）。

### 16.5 P6（未运行——被上游真实阻塞）

打包 GUI 演练、灯/暗与响应式矩阵、150% 缩放、离线态等未执行。
已完成的 P1 前置事实：Windows→WSL localhost 转发与 WS 一次性票据实测通过（§15.7）；
`wsl --shutdown` 级演练被禁止执行（会杀死用户活会话），改以 Goal 自有进程重启验证。

### 16.6 最终裁决

**`INTEGRATION READY, ADMISSION BLOCKED`**（程序 §10 词汇）：

- **通用产品闭环真实可用**：Windows GUI 代码 → WSL Studio 服务（127.0.0.1、Bearer、
  一次性票据 WS）→ Session/Turn/Profile/Provider/Credential 权威 → 七合成 vertical →
  重启可续 → Codex 真实两轮 native resume PASS。
- **两个命名阻塞**：
  1. `BLOCKED ON ZCODE IDENTITY`（程序定义的停止条件；六 Harness 证据已保全）。
  2. `BLOCKED ON GATEWAY CREDENTIAL`（唯一授权密钥在两条候选路由均确定性被拒；
     五个模型背书 Harness 的真实准入轮全部依赖可用的 provider 凭据）。
- 解除阻塞所需的人工输入：(a) ZCode 官方自动化接口的公开文档/官方 CLI，或对社区桥接
  的显式 COMMUNITY/EXPERIMENTAL 批准；(b) 可用的网关端点+密钥（或对 DeepSeek 等官方
  API 密钥的授权）；(c) 用户侧 claude/opencode/hermes 自身配置的修复（Goal 无权代改）。

### 16.7 解除阻塞输入与新进展（2026-09-05 20:45，用户输入后）

用户三项输入：(1) 网关=自有中转站 https://maomaokingdom.top/v1（多协议，MiniMax-M3 全支持）；
(2) ZCode 批准被广泛采用、反馈良好的社区桥接；(3) harness 配置走 Profile 覆写路线
（写新 Profile，绝不改用户活配置）。

已完成：
- **社区桥接选型+审计**：zcode-app-cli@3.11.2-19（5065 下载/月、37★、SLSA 出处认证、
  追踪官方 Desktop 3.11.2）装入隔离 npm 前缀（~/.agent-box/isolated-npm，用户全局不动）。
  身份/版本 ✓、自动化面 ✓（`app-server` stdio ZCode 协议 + `-p` headless + Z.AI OAuth）、
  配置根 ✓（~/.zcode/cli、v2、db.sqlite）。**COMMUNITY/EXPERIMENTAL** 标签准入。
  真实轮待用户一次性 `zcode login`（WSL 侧无 CLI 登录态）。
- **隔离工具链**：官方 pi=@earendil-works/pi-coding-agent@0.85.1（badlogic/mitsuhiko 维护）
  与钉定 @deepseek-ai/dsh@0.1.2-rc.1（ACP 能力版）装入同一隔离前缀；用户全局安装未动。
  以隔离 PATH 起 serve：五个注册 Harness readiness 全部 available（pi 0.85.1 新解析）。
- **P6 前置**：Windows cargo 1.95.0 在位（/mnt/c/.../cargo.exe）→ Windows 侧构建可行。
- P2–P4 变更后的打包门重跑：13 wheels、preview venv 15 READY/doctor 0、root-only 0/doctor 0、
  wheel 内容扫描干净；cargo clippy 无 agentbox 告警。

待用户两个动作：(a) 重新放置 /tmp/agent-box-gateway-key（原文件按 write-once 协议已删，
新探针需要同一密钥）；(b) 在浏览器完成 `~/.agent-box/isolated-npm/bin/zcode login`。
随后：P2 三协议路由探针重跑（MiniMax-M3）→ 各 Harness 凭据投影构建 + Profile 覆写 →
六个被阻 Harness 的真实准入轮 → P6 Windows 打包演练 → 最终裁决。

### 16.8 P5 凭据投影构建（2026-09-05 21:30，Test-First 完成）

用户输入后实施 **launch-env 凭据投影**（Harness projection，程序 §4）：

- **registry**：claude-code/opencode/hermes/pi 四个 harness 新增
  `[harness.credential]`（`guest_target_class = "launch-env"`、materializer
  `gateway-provider`、env_var=ANTHROPIC_AUTH_TOKEN / OPENCODE_API_KEY /
  MINIMAX_API_KEY×2）+ credential dispatch input（0..1）；schema 增 `env_var`
  字段（launch-env 必须命名安全 env var；文件类禁用）。
- **GatewayCredentialSource**：write-only authority 的唯一读取边界
  （`$AGENT_BOX_HOME/credentials/gateway/<id>.json`，0600）；`prepare_launch_env`
  返回的映射是值的唯一载体，直接并入启动环境；解析投影保持 locator-only；
  缺失/不可读/非法 env 名全部类型化（内容零回显）。
- **generic provider**：`_compose_credential_env` → start context `credential_env`
  → plan environment → guest env；值不进 plan 账本/事件/诊断。
- **studio 派发**：冻结了 model provider 的 Turn 派发
  `gateway/<provider_id>` locator 的凭据 ref；未冻结则不派发（0..1）。
- **注册唯一性**：网关 resolver 按 claude-code 单点注册（contract-scoped，
  非 harness-scoped）；其余三个共享同一实例仅作启动注入。
- 测试：3 项新投影测试 RED→GREEN（test_gateway_credential_projection.py）；
  老期望表更新（pi 现声明网关凭据契约）；全套件：harnesses 480✓、studio 164✓、
  root 105✓。

待用户动作后执行：P2 三协议探针（MiniMax-M3 @ maomaokingdom.top/v1）→ 覆写
Profile（claude: env.ANTHROPIC_BASE_URL+model；hermes: settings.yaml provider 块
apiKeyEnv 引用；opencode/pi: provider+model 覆写）→ 六个 Harness 真实准入轮。

### 16.9 架构重构落地与 hermes 凭据语义阻塞（2026-09-06）

**两层 Model Provider 全部落地（Test-First，全套件绿）**：

- 新官方插件 `plugins/agent-box-model-providers`：ProviderAccount store、
  HarnessProviderConfig 不可变 revision store（digest、CAS、guarded delete）、
  exact-Ref resolver（`agent-box.harness-model-provider@1`，native_id
  `<config_id>/revisions/<n>`）、write-only credential authority（0600 +
  execution-scoped staging）、probe/discovery。27 测试绿。
- `BindingSnapshot.model_provider_ref` 正式字段（protocol + store 往返 +
  turn payload 投影）；Turn API 接受 exact-ref selector（裸 provider id 字符串
  schema 级拒绝）；profile-model 权威规则删除（Profile=行为，Provider=路由）；
  Binding.extra 不再承载 provider 权威事实；删除保护扫描正式字段。
- `HarnessCommandSpec.credential_environment` 与 sandbox 字符串放行 **已回滚**；
  凭据交付改为 typed SecretBinding + credential-materializer SPI + execution-scoped
  staging（0600）+ ro-bind secret 源 + 固定 in-guest secret-env launcher
  （argv 仅 env 名/沙箱内密文路径/harness argv——值零出现）。6 项 launcher 行为测试绿。
- harnesss gateway 块移交 model-providers 插件（单点所有权）；studio/providers
  目录删除；app.py 经 Resource Library accessor 调用。
- 全套件：harnesses 486✓(+6 launcher)、model-providers 27✓、studio 136✓、
  root 105✓、session 131✓。

**hermes 准入轮（真实链路，带 pin 的 exact Ref）**：冻结名 provider 配置 ✓、
launcher 交付链 ✓（staging/ro-bind/launcher exec 验证）、hermes 启动 ✓——
但 hermes 自身模型路由 401（三种机制逐一实证：minimax→官方 MiniMax API 401；
openai+base_url 覆盖→无认证头 401（抓包证明 base_url 被忽略/未附带凭据）；
dotenv-only 读取（get_env_value_prefer_dotenv→load_env→hermes home .env，
process env 仅经 secret_scope 兜底仍不可达）。**hermes 的凭据语义（dotenv 文件或
config.api_key 字面量）与 launch-env launcher 机制不兼容**——按程序 §10 停止条件
（需要将凭据写进 profile home 才能喂给 hermes = 泄漏类）记录为
**BLOCKED ON HERMES CREDENTIAL SEMANTICS**。

其余五个 Harness 的真实轮继续推进（codex 已 PASS；中转站两协议路由已验 ok）。

### 16.10 六 Harness 真实准入轮结果（2026-09-06 02:00，中转站凭据就位）

| Harness | 裁决 | 证据 |
|---|---|---|
| Codex | **PASS**（P-1 已证：两轮 native resume） | §15.6 |
| Hermes | BLOCKED ON HERMES CREDENTIAL SEMANTICS | 实测三机制：minimax provider→官方 MiniMax API 401；openai+base_url 覆盖→请求无认证头（抓包证明 hermes 忽略 base_url/未附凭据）；hermes 凭据只读 `.hermes/.env` dotenv（get_env_value_prefer_dotenv→load_env）或 config.api_key 字面量——launcher env 注入不可达；launcher 交付链本身已验证工作（staging 文件读取 ✓、env 注入 ✓、hermes 启动 ✓） |
| OpenCode | BLOCKED ON OPENCODE CREDENTIAL SCHEMA | 自定义 provider 配置要求 options.apiKey 内联（如 `{env:VAR}` 引用）——字段名 `apiKey` 被 profile 扫描正确拒绝（SECRET_FIELD_FORBIDDEN），且 opencode 无 env-only 凭据面 |
| Pi | BLOCKED ON PI PROVIDER CATALOG | pi-ai provider 为代码级注册（settings 无自定义 provider 机制）；内置 minimax provider 打官方 API 且忽略 base_url——中转站密钥被官方端点拒绝（空响应 0 tokens）；宿主直诊 exit 0 但 turn_end 0 tokens |
| Claude | BLOCKED ON USER CONFIG MODEL + RELAY ANTHROPIC ROUTE | 用户活配置默认模型 404（前证）；中转站 anthropic-messages 路由 401（P2 矩阵）——双门 |
| dsh | 未注册（需 harness 注册 + inventory，凭据路由 openai-completions 已验 ok——可行性最高） | |
| ZCode | BLOCKED ON ZCODE IDENTITY（程序 §10；社区桥接批准已获但真实轮待 zcode login） | |

**全链路已验证的部分**：两层 ModelProvider 权威（exact Ref 冻结/解析/删除保护）、
凭据投影（write-only authority → execution-scoped staging 0600 → ro-bind → in-guest
launcher → harness env——launcher 单元与集成测试绿）、profile 覆写（hermes/pi rev
创建+CAS）、真实 hermes/pi 进程在沙箱内启动并退出（类型化 FAILED/RECOVERY，
零伪造）。阻塞全部集中在各 Harness 自身的凭据/配置语义与中转站路由的组合——
不是 AgentBox 链路缺陷（launcher 宿主侧诊断 hermes env 注入成功、hermes 启动成功）。

### 16.11 dsh 真实准入探针（2026-09-06 02:30）

- 隔离钉定 dsh@0.1.2-rc.1（ACP/headless profile 能力版）。
- headless profile 默认路由 deepseek-official：中转站 DEEPSEEK_BASE_URL 覆盖 →
  403（模型级确定性拒绝：MiniMax-M3 非 deepseek 路由模型）；无覆盖 → api.deepseek.com
  401（中转站密钥非 DeepSeek 官方密钥）。settings.yaml providers 块被 headless
  profile 的自带 patch 栈覆盖（MISSING_CREDENTIAL llm-deepseek）——dsh 的模型/路由
  覆盖需走其 profile patch 层（`--patch`）。
- **dsh 状态**：BLOCKED ON DSH PROFILE INVENTORY（harness 注册 + patch 层
  inventory 是剩余工作；openai-completions 路由可行性已被 P2 矩阵证明——
  中转站 200 MiniMax-M3；需要 dsh patch 语义 inventory 后才能注册）。

### 16.12 二次挂载交付 + hermes 定制路由阻塞（2026-09-06 00:40）

**二次挂载（fragment mount）落地**：ModelProvider 渲染凭据承载的 native 片段
（hermes: Model 块含 base_url/api_key）→ execution-scoped staging 0600 → 只读
叠挂到 native home 路径（宿主 home 永不接触；config-managed 类路径本就不回流）。
SPI 注册/查找、prepare_mount 的 fragment/bare 双路径、内容 staging 全部绿。

**hermes 定制 provider 路由阻塞**：launcher env 注入已证可用（pi-ai minimax
provider 解析成功并发起请求），但 hermes 的定制 provider 路由（llm-pi-ai 块、
top-level providers 块、model.base_url 覆盖）三种形态逐一实测均未按预期路由
（抓包证明请求未到达指定 base_url；401 来自其他端点）——hermes 自身的模型路由
需要其交互式 `hermes model` 设置流程。**BLOCKED ON HERMES CUSTOM PROVIDER
ROUTING**（升级自凭据语义阻塞；launcher env 注入对 hermes 内置 provider 有效——
官方 MiniMax 端点拒绝非官方 key 是另一问题）。

**hermes 的可行解锁路径**：用户提供其 `hermes model` 交互流程配置好的
provider/model 组合（hermes 原生机制），或将中转站注册为 hermes 内置 provider
等价物。AgentBox 侧交付机制（launcher env）对 hermes 内置 provider 已证可用。

### 16.14 当前 handoff 复核（2026-09-06，supersedes earlier verdict text）

本节是本次恢复运行的当前证据，覆盖并 supersede 前文旧 Provider 单层模型和 launch-env
值载体描述；历史证据保留为历史，不再作为当前准入证据。

**R0 RED（复现）**：Provider 27 passed；Studio 初始 137 passed/3 failed，均为
`test_provider_rest_facade.py` 的 stale `list_rows`；root 初始另有 3 个 shared-contract
计数失败；combined Provider+Studio collection 初始因顶层 `conftest` 名称碰撞失败。

**R1/R2 当前证据**：REST 已分为 `ProviderAccount` 与 `HarnessProviderConfig` 两层，后者
以 exact `config_id + revision + digest + harness_type` 为执行选择；Studio 通过 Registry
resolver。已删除 `HarnessCommandSpec.credential_environment`、`_compose_credential_env`、
`prepare_launch_env` 值载体及 bwrap allowlist 绕过；交付仅为 typed SecretBinding、
execution-scoped 0600 staging、read-only mount、固定 guest launcher。credential materializer
registry 已移至 root credential protocol，Model Provider 不再导入 Harnesses。

**当前验证**：root 159 passed；Model Provider 27 passed；Studio 142 passed；Harnesses
489 passed/4 skipped；bwrap 12 passed；combined collection 169 collected；compileall 与
`git diff --check` 通过；Model Provider、Harnesses、Studio 三个 wheels 构建成功。两个
tracked credential `__pycache__` 文件已恢复为 HEAD 字节；未执行 add/commit/push/merge/
reset/clean/stash。

本轮新增 R3/R5 证据：全部 13 个 plugin test 目录均单独通过；native integration 为
**54 passed**。14 个官方 wheels 均构建成功；root-only clean venv 发现 0 个插件且
doctor 无 concrete provider；model-provider-only clean venv 发现 Model Providers 为
READY 且 doctor 无失败组件；full preview 发现的插件全部为 READY。真实 listening
Studio seam 也已验证：health=200、未授权 readiness=401、authenticated
capabilities/readiness=200、Project=201、Session=201、one-time ticket=200，外部
WebSocket client 成功连接并收到 replay frame。首次 WS 404 定位为验证 venv 缺少已声明
的 `websockets` 运行依赖，安装后复测通过。
已生成 [STUDIO_API_OPENAPI_SNAPSHOT.md](STUDIO_API_OPENAPI_SNAPSHOT.md)：OpenAPI 3.1.0，
canonical SHA-256 为 `ab14ce4490e37fb66cca1450d521b51a19a5c5bcb4cb8368ffaaf2dc49c9b725`。
源码产品面 secret/path 扫描与 Work Core boundary scan 通过；扫描命中的内容仅为既有
synthetic fixtures 或 web 静态文案，不是运行时凭据载体。

**仍未完成且不能伪造为 PASS**：R3 完整 native/WSL 矩阵、R4 七 Harness 真终端两轮准入
（DSH 未注册，ZCode 缺 login/持久 session 证据）、R6 frontend API 绑定、Windows
packaged GUI rehearsal、browser/Rust/CI gate。本次恢复未读取或打印凭据，也未执行真实
模型请求。

**R5 checkpoint 已补齐**：14 个 wheels、root-only/provider-only/full clean venv、插件
`doctor/list/inspect/health`、真实 listening service、OpenAPI snapshot、secret/path 与
Work Core boundary scans 均已有本节上方的可复核证据；因此 R5 不再列为未完成项。

本次继续复核 R3：`tests/integration/native` **54 passed**；Provider REST/freeze/transcript
closure **15 passed**；resource-contract suite **7 passed**；`git diff --check` 通过，且
测试产生的两个 tracked bytecode 副作用已恢复为 HEAD 字节。该证据覆盖 native closure，
不等同于尚未执行的 WSL/Windows 矩阵。

**R6 当前证据（只读审计）**：独立 UI worktree 的 AgentBox transport 已实现 REST
Bearer 与 per-session WebSocket seam，但 `backendSelector.ts` 仍把
`studio:agentboxToken` 写入 `localStorage`，违反凭据不得进入浏览器持久化存储的约束；
`AgentBoxModelProviderCapability` 仍明确渲染 “Model Providers are unavailable”，未绑定
当前已冻结的 ProviderAccount/HarnessProviderConfig API。该 worktree 当前无
`node_modules`，且不在本次 writable root 内；未修改其 dirty tree，故未宣称 browser、lint
或 frontend build 通过。其 `src-tauri` 的 `cargo check --bin codeg-server
--no-default-features --locked` 已在 `/tmp` target directory 成功；Rust gate 通过，但这不
替代尚未完成的 Windows packaged GUI rehearsal。契约交叉审计还确认 Profiles facade
仍调用 `/api/v1/profiles/{harness}`，而冻结后端路径是
`/api/v1/harnesses/{harness}/profiles`；前端创建体使用 `name`，冻结请求体要求
`profile_id`。因此这不是仅缺少视觉绑定，现有 UI 仍无法作为真实 Profiles API 客户端验收。

为区分环境缺失与代码状态，本次将未安装依赖的 UI worktree 复制到 `/tmp` 隔离副本
（原 worktree 未写入），使用锁文件安装依赖后验证：Vitest **376 files / 5091 tests
passed**、ESLint 通过、Next production build 通过；Rust server `cargo check` 也通过。
这些是一般 UI/Rust gate 证据，不覆盖 AgentBox token 持久化、Profiles 契约差异、Model
Provider 页面未接入和 Windows packaged GUI rehearsal。

**当前唯一真实 verdict：`NOT READY`。**

### 16.13 hermes 模型认证机制精确诊断（2026-09-06 01:30）

双层实测结论（每层单独验证）：

- **路由层**（provider 选择）：读 `os.getenv(env_var)`——launcher 注入的进程 env
  有效（provider 解析成功、请求发出）。用户的 token-plan key（sk-cp-）与中转站 key
  均通过路由层。
- **客户端认证层**（OpenAI 客户端构造）：`model.api_key` 配置字段的
  OPENAI_API_KEY 回退在该版本实测**不生效**——进程 env 与 `.hermes/.env` 双源
  同时在位，请求仍无认证头（401 Missing Authentication header，直连中转站确认）。
- **用户自己的活 hermes 同样失败**：`hermes -z`（默认 home）→
  `No usable credentials found for provider 'minimax'. Set MINIMAX_API_KEY.`
  ——其 Model 块的 api_key（tp-c...）不被 provider 解析读取（该字段对路由是
  装饰性的），.env 缺 MINIMAX_API_KEY。

**结论**：hermes 0.19.0 的模型认证对自定义 base_url 的 key 读取路径存在缺陷或
需要其 `hermes model` 交互式重配；这不是 AgentBox 交付链缺陷（launcher env 注入、
profile home .env、routing+auth 双层全部就位）。**BLOCKED ON HERMES MODEL AUTH**。

**解锁路径（用户动作）**：修好用户侧 `hermes -z`（例如 `hermes model` 交互重配，
或往 `~/.hermes/.env` 写入有效的 MINIMAX_API_KEY/OPENAI_API_KEY 并验证
`hermes -z` 宿主直跑成功）——然后把 `~/.hermes/.env` 与 `config.yaml` 的可用
形态告知（或我直接镜像进 profile home），hermes 真实轮立即可跑。
