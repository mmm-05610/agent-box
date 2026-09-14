# Work Order 42 — 交付、等待与真实模型验收进度

日期：2026-09-14。本轮零泄漏：任何证据、日志、命令行参数均不含凭据内容；
已发生的1次可达性请求由后端受控进程读取仓库外 locator，未把内容写入仓库或输出。
授权真实 credential 的 SecretStore→Worker 投影尚未执行，不以测试值路径冒充付费验收事实。

## 2026-09-14 — Work Order 41 Windows r4 平台门通过

Windows 真机、`py.exe -3.12`、真实 `wsl.exe`、digest 固定的 release Worker、locked 28 方法 wire schema、
端口 18744、隔离 DataRoot `%LOCALAPPDATA%\AgentBox\acceptance-server-41-r4` 与 WSL workspace
`/tmp/agentbox-server-41-r4` 上单次执行 `accept-e.ps1 -Cleanup`，退出码 0：

```json
{"approval_execution":"execution_c619a5fb923647ec9f3750e6546ffbcc","attachment_execution":"execution_fb479cdd3aad47e9b050f3db51fc0248","cancelled_execution":"execution_cd35d32508544be2b469371af56c42ad","data_root":"C:\\Users\\maoqh\\AppData\\Local\\AgentBox\\acceptance-server-41-r4","distribution":"Ubuntu","fixture":"explicit no-model ACP peer","profile_id":"profile_489c3e31ec5d457081e5570e64d10a83","provider_model_id":"provider_f8738a7bbf3a45088040d5b8c5060871","r4":{"checkpoint_digest":"sha256:a6525f3b20a69c19abac3ce3834982696bb3eb2eb0423829e76a01b37da5a06d","checkpoint_files":["native-state.json","reopen-method.txt"],"checkpoint_native_id":"stateful-13","cleanup_guards":{"data_root_that_is_not_a_directory_refused":true,"data_root_with_mismatched_marker_refused":true,"data_root_with_owner_marker_accepted":true,"data_root_without_owner_marker_refused":true,"linked_data_root_target_refused":true,"marked_workspace_accepted":true,"workspace_without_owner_marker_refused":true},"completed_seq":12,"delta_seq":10,"first_execution":"execution_387c3382ee694dd4b088813f6c7763f0","first_round_reopen":["session/new"],"fixture":"tests/server/fixtures/stateful_acp_peer.mjs","harness":"hermes","lock_instance_after_final_stop":"server_79296dd8029948d0bf7c18bff0ae24cf","lock_instance_after_first_stop":"server_6dd995a9dfd14795b6ad975f249ae9e9","nonce":"STATEFUL-NONCE-R4-7F3A9C","second_execution":"execution_71d57937cc8346faa45fe9df22ad8bf6","second_round_reopen":["session/new","session/resume"],"server_id_after_restart":"server_639bc04679554c66ac6b1e77661e70f1","session_id":"session_88a29fa110254843a6ceee9a12545e43","state_projection":"/tmp/agentbox-home/sessions","stop_mode":"tree_terminate","timeout_ms":30000},"result":"BACKEND_41_E_WINDOWS_WSL_WIRE_OK","server_id":"server_639bc04679554c66ac6b1e77661e70f1","session_id":"session_97b27f612778411f92c9bb68e1ef9a13","windows_server":true,"wire_event_stream":"wire.eventStream/1","worker_digest":"sha256:bb90e346bbd857f02eba8d267f47c3ce793d30c9894ca823dc09c482d886f5eb","workspace":"/tmp/agentbox-server-41-r4","workspace_id":"ws_cb0eb4a7e01541b4a622935e606b6b5f"}
```

逐项证据：

- **重启**：第一轮完成后按 `tree_terminate` 停止 Server（py.exe 启动器持有 python.exe 子进程，树终止才是
  真正的停止），随后以同一 DataRoot 重启并恢复 live；`server.hello` 返回同一稳定 server_id
  `server_639bc04679554c66ac6b1e77661e70f1`，而 DataRoot 锁的持有实例由
  `server_381e665d…` 变为 `server_668faae8…`，即锁已释放并由新进程重新获取。锁文件在持有期间被
  Windows 字节区间锁保护、不可读，因此“停后仍可读”本身即释放证据。
- **同 native id resume**：第二轮 checkpoint 的 `nativeSessionId` 与第一轮相同（`stateful-13`），
  `sessions.get` 的 `checkpoint.native_id` 未变；fixture 在第二轮只接受
  `session/load`/`session/resume`，遇到 `session/new` 会以 `-32011` 拒绝，而捕获到的
  `reopen-method.txt` 记录第二轮实际发送的是 `session/resume`（首轮为 `session/new`），且第二轮
  返回了首轮 nonce `STATEFUL-NONCE-R4-7F3A9C`。
- **终止前 delta**：第二轮 `message.delta` 序号 10 早于 completed 状态帧序号 12，两者同一持久事件流。
- **ObjectStore checkpoint**：从 Windows DataRoot `objects/sha256/…` 直接读取 Server 返回的 checkpoint，
  重算内容摘要与 Server 给出的 digest 一致（未伪造、未改写）；`schema_version==2`、`resumable==true`、
  `harnessType=="hermes"` 与 Profile 一致、`files` 非空且每个 `path`/`size`/`digest` 合法并能在
  ObjectStore 中按 size 命中；`sourceExecutionId` 绑定该轮 Core execution。
- **清理**：退出后 DataRoot 按 marker 删除（删除前重新校验 owner marker/非 reparse/非普通文件）、
  WSL workspace 删除且 `test -e` 断言其确实不存在、端口 18744 无监听、无本轮 Server/Worker/sidecar
  残留进程、Worker `views`/`secrets` 无残留。随后以独立进程再跑 `-PostCheck`（退出码 0）：

```json
{"check":"BACKEND_41_E_WINDOWS_POSTCHECK","data_root_absent":true,"workspace_absent":true,"port_listening":false,"residual_processes":[],"residue_scope":"instance","worker_view_residue":[],"result":"BACKEND_41_E_WINDOWS_POSTCHECK_CLEAN"}
```

- **恢复/清理反例**：无 owner marker、marker 不匹配、DataRoot 为 junction（reparse）、DataRoot 为普通文件、
  WSL workspace 缺 marker 均被拒绝清理；正例（marker 正确、workspace 有 marker）被接受。
  checkpoint 不可用时（schema 版本错、`resumable` 非真、native id 不符、checkpoint 对象缺失、
  state 文件对象缺失）第二 turn 必须以失败告终、不得静默成功或新造 native 会话：
  `tests/server/test_harness_sidecar.py::test_unusable_checkpoint_fails_the_turn_without_inventing_a_session`
  的 5 个参数化用例断言 turn=`failed`、Session 的 checkpoint digest/native id 保持原值、无该 turn 的
  delta，且 Core 账本记录唯一的 ambiguous dispatch 携带原因 `SIDECAR_CHECKPOINT_INVALID`，同时
  全 Session 只有首轮一次 dispatch accepted。

上方 JSON 取自提交检查点上的独立复跑（同一脚本、同一锁定工件、退出码 0），此前一次同结构运行亦
exit 0；两次的实例/会话标识不同，结构与断言语义一致，记录值即复跑值。

环境与工件（本轮实测）：Windows 10.0.26200.9445、PowerShell 5.1.26100.9444、
Windows Python 3.12.10（`C:\WINDOWS\py.exe -3.12`）、WSL `Ubuntu`、Node v22.23.2、`/usr/bin/bwrap`；
Worker `sha256:bb90e346bbd857f02eba8d267f47c3ce793d30c9894ca823dc09c482d886f5eb`
（workerVersion 0.1.0 / wireVersion 1）；wire 生成工件
`sha256:5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`（28 方法，脚本启动前校验；
前端 TS 权威 `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`，未改动前端）。

`accept-e.ps1` 本轮修复的自身缺陷（首次失败的精确现象保留在下节）：

1. 工作令指定的固定 bundle `workers/agent-box-worker/.acceptance-bundle-c2`（
   `sha256:08e4e057aef068997eb4efaa3717096a4f3fad54fd182a568853d8ed97a803c2`，2026-09-13 20:45）
   **早于 interactive channel 协议升级**（`05053f9`/`72d6258`），当前客户端发送的 bootstrap 带
   `protocolVersion`/`executables`，旧 Worker 因 `deny_unknown_fields` 拒绝为 `invalid bootstrap`，
   `workspaces.open` 直接 `WORKER_UNREACHABLE`。已按 `scripts/server-round1/build-worker.sh` 从当前
   源码重建为 `.acceptance-bundle-c3`（cargo 已是最新，未触发重编译），digest `bb90e346…`，与 r3
   证据中的 Worker digest 一致；c2 保持原样不再使用。
2. 广覆盖 fixture `fake_acp_peer.mjs` 未声明任何 model 目录，而 sidecar 现已按 adapter 实际提供的
   `configOptions` 校验模型，导致配置了 `fixture-model` 的 Profile 在 `create` 阶段被拒
   （`SIDECAR_OP_FAILED: Harness model is not available: fixture-model`）。fixture 现在声明它唯一接受的
   `fixture-model`，模型门因此在 Windows 真机链路上被真实走通，而不是把 Profile 的模型配置删掉绕过。
3. `test -e -- <path>` 在 GNU test 下对存在与不存在都返回 2，使 workspace 残留断言**恒真**；
   已改为读取退出码并把“无法求值”也算失败。这是 r3 记录中唯一被削弱的断言，现修复。
4. 清理期的断言会把真正的失败替换掉（finally 抛错覆盖主异常）；现改为收集清理问题并与主失败
   一起报告，且失败时保留 Server stdout/stderr 以便定位。
5. `session/resume` 归属：带权威 journal 的 `pi` 档案重开走 `session/load`，本次 r4 的有状态 fixture
   绑定无 journal 的 `hermes` 注册键才真正走 `session/resume`；两者现已分别断言，此前把 pi 的无模型
   双轮门记作 `session/resume` 的说法按此更正。

本阶段模型调用 **0**、费用增量 **¥0**；42 累计仍为 1 次/12 tokens/`<¥0.01`（上限 ¥10）。未读取任何密钥、
未发模型请求、未改前端、未读 WO42 locator。

41 平台门记为 `BACKEND_WINDOWS_R4_READY`。**不**登记整体 `BACKEND_IMPLEMENTATION_READY`：
Pi/Hermes/OpenCode 生产封装与四家真实模型门仍未完成，前端也未满足双门，故仍未进入全栈联调。

### 精确命令与结果

```text
powershell.exe -NoProfile -Command "[Parser]::ParseFile(accept-e.ps1)"        → PARSE_OK（语法/静态解析）
git diff --check                                                              → 通过
python -m pytest -q tests plugins/agent-box-harnesses/tests \
  plugins/agent-box-runtime-wsl/tests plugins/agent-box-sandbox-bwrap/tests \
  plugins/agent-box-runtime-local/tests
  → 348 passed, 4 skipped, 0 failed（PYTHONPATH 覆盖 src 与全部插件 src）
python -m pytest -q tests/server/test_harness_sidecar.py -k "state_projection|unusable_checkpoint"
  → 7 passed（2 个 resume 门 + 5 个不可用 checkpoint 反例）
node --test plugins/agent-box-harnesses/tests/harness_remote/*.test.mjs        → 25 passed, 0 failed
node --test scripts/server-round1/model-validation-42d.test.mjs                → 4 passed, 0 failed
cargo fmt --check && cargo test --locked --release（workers/agent-box-worker） → 4 passed, 0 failed
powershell.exe -File accept-e.ps1 … -Port 18744 -Cleanup                       → exit 0（上方 JSON）
powershell.exe -File accept-e.ps1 … -Port 18744 -PostCheck -InstanceId <两实例>  → exit 0（上方 JSON）
```

4 个 skip 为既有平台/显式环境条件项，未扩大。

### 本轮首次失败记录（均已修复后重跑）

1. `accept-e.ps1`（改后首跑）exit 1，原因是被断言掩盖：
   `Residual Server/Worker/sidecar processes remain: wsl:254523 … agent-box-worker --cleanup-manifest
   /tmp/pytest-of-maoqh/…`。定性：进程扫描过宽，匹配到同仓 pytest 留下的 `--delay-seconds 300`
   清理助手以及脚本自身命令行；**不是**残留 Server/Worker。
2. 修窄扫描后 exit 1：`workspaces.open failed: WORKER_UNREACHABLE`，Server 同期给出
   `Worker control stream closed … invalid bootstrap`。定性：c2 bundle 早于协议升级（见上）。
3. 换用重建 bundle 后 exit 1：`did not reach completed … state=failed error_code=EXECUTION_FAILED`。
   读 Windows DataRoot 的 Core 账本得
   `ExecutionDispatchAmbiguous error="SidecarError: SIDECAR_OP_FAILED: Harness model is not available:
   fixture-model"`。定性：fixture 未声明 model 目录（见上）。
4. 再次 exit 1：`First-round checkpoint is not bound to its own execution`。定性：断言比较对象写成
   Server turn id，而 checkpoint 的 `sourceExecutionId` 是 Core execution id（turn 行的 `execution_id`）。
5. 再次 exit 1：`另一个程序已锁定文件的一部分` + 清理期 `server.lock 正由另一进程使用`。定性：
   Server 持有 `server.lock` 的字节区间锁时 `Get-Content` 必然失败；同时 stop 走 `taskkill /T /F`
   树终止前不得读锁。改法见上（停止→读锁作为释放证据；清理问题不再掩盖主失败）。
6. 再次 exit 1：`Second round did not reopen … session/resume: System.Object[]`。定性：`Get-R4ReopenMethods`
   返回数组时被 `@()` 再包一层，比较的是内部数组而非最后一项；首轮只有一行故侥幸通过。

其中第 5 次失败在隔离 DataRoot 留下未完成的删除（仅剩 `server.lock`，owner marker 已被部分删除）。
已按“先核对再处理”的原则人工核对内容与路径后才删除该残留，另有一次 DataRoot 删除被 marker 守卫
正确拒绝（左侧文件被占用），均未绕过守卫。

## 2026-09-14 13:24 +08:00 — native state 双轮纵向检查点

- `3e4282b` 把部署声明的有界 native-state 子树从 Worker 回收到 Windows ObjectStore，并以 schema 2
  checkpoint 绑定 harness/native id 后投递到下一 turn。状态捕获限制 256 文件/8 MiB，验证路径、长度、
  offset、digest 并扫描本次凭据原文；只读配置投影与可写 state target 冲突时在启动前拒绝。
- 真实无模型门由两个全新的 sidecar 进程穿过 Server→Core→真实 Worker ABW1 interactive→bwrap：首轮
  写入 nonce，第二轮必须以 ACP `session/resume` 打开同一 native id 并回答该 nonce；第二轮 delta 先于
  completed，退出后 views/secrets 均不存在。
- 真实 `codex-acp 1.1.14`→Codex app-server `0.147.0` 另行完成隔离配置读取门，仅到 session create、
  无 prompt；使用测试 credential，未读取授权 locator、未发模型请求。wheel 已包含官方完整 models JSON
  和固定 sidecar TOML。
- 回归：Server `98 passed, 1 skipped`；WSL runtime+bwrap `43 passed`；本阶段定向 Python `71 passed`；
  Node `13 passed`。累计费用仍为 1 次/12 tokens/`<¥0.01`。Windows r4 尚未运行；该结论随后由本文件顶部
  的 r4 平台门小节取代（`BACKEND_WINDOWS_R4_READY`）。

## 2026-09-14 — Codex 官方 Responses 隔离投影检查点

- 只读取得 DeepSeek 官方 `codex-deepseek-setup.sh` 1.3.0，脚本 SHA-256
  `0a3a33704e1fb1579300d559f009279c7db8e06aa428a0cba07ac9e265a130ca`；未执行脚本、未修改用户
  `~/.codex`。仓内 `deepseek-models.json` 与官方 heredoc 原始字节完全一致，包含
  `deepseek-flash`、`deepseek-v4-pro` 各39字段；AgentBox运行白名单仍只有 `deepseek-flash`。
- `399d78d` 增加 Harness-owned 无密钥配置生成、实际wheel目录包含性、deployment内的adapter source/
  非敏感环境/配置文件、摘要固定外部可执行文件挂载，以及ACP `api-key`首选认证接缝。TOML固定
  `responses`、官方根URL、`high`、禁用搜索，catalog指向隔离内实际绝对路径；首次真实尝试只走
  Worker秘密帧注入的 `CODEX_API_KEY`，配置里没有 `experimental_bearer_token`。
- 定向验证为 Python 53 passed、Node 25 passed，wheel确实包含完整目录；未读密钥、未发模型或网络请求，
  费用账不变。
- 该检查点的集成审阅当时发现并如实降级：每turn清理临时native home，只有native id、没有会话文件，
  尚不能证明第二轮上下文或原生resume。此历史缺口随后由 `3e4282b` 的通用有界捕获/Windows
  ObjectStore持久化/下一轮回投与真实无模型双轮门关闭；Server/Core仍未增加Codex分支。

## 2026-09-14 12:44 +08:00 — 模型冻结与秘密投影代码检查点

- `502f4b5` 将 Profile 的模型引用解析为包含 ProviderModel id/version、provider、model、credentialId
  和非敏感配置的不可变 execution 投影；排队项继续持有同一对象摘要，后续 ProviderModel 更新不会
  改写已接受工作。
- 生产 sidecar 装配在派发时才把 credentialId 解析到 SecretStore；内容只经 Worker `secret.put`
  进入一次性帧，并固定只读挂载到隔离内。adapter 只收到部署声明的环境名，模型进入原生
  `create`/`prompt`；正常关闭、启动拒绝和 Worker 终态均安排秘密清理。
- 定向验证：Server/wire 相关 45 passed，Worker/bwrap 32 passed，Node envelope 4 passed；其中新增
  5 个冻结、kind mismatch、argv 非泄漏和启动异常清理反例。没有读取真实 locator、没有模型或网络
  请求，累计费用仍为 1 次/12 tokens/<¥0.01。
- 此检查点只证明接线与组件生命周期。Pi/Hermes/OpenCode 的原生运行时工件/配置进入生产 bwrap
  以及逐家真实模型门仍需完成；Windows r4 平台门已通过，但后端状态不提前升级。

## 2026-09-14 12:15 +08:00 — 28 方法 wire 重锁

- 前端提交：`3aba5c5c8743401b964f80c88bd43e847fa3d5a8`；writer lease 仍 ACTIVE，未接管前端。
- 双方摘要：TS `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`；生成工件
  `5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`。
- 后端对该实际工件严格回归 `29 passed in 67.57s`，队列终态差异关闭，状态
  `WIRE_LOCKED_FOR_IMPLEMENTATION`。
- 尚未进入全栈联调；Windows r4 重确认已完成（见顶部）。真实模型调用数与费用无变化：累计1次、
  12 tokens、<¥0.01。

## A — 前端只读观察与 wire 增量协作

后端在41收口期间按42-A同等写权约束做只读检查（未写前端任何文件、未杀其进程、未发第二个 goal）：

- 工作树 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1`，2026-09-14 12:15 +08:00
  实际 HEAD `3aba5c5c8743401b964f80c88bd43e847fa3d5a8`；writer 正在 P04 下一切片，工作树非 clean。
- 其自身 status：`frontend_implementation=PARTIAL`（P00/P01 GREEN、P02 A/B1/B2/C/D、
  P03纵切1–2和 P07 28方法增量已提交；P03生产调用者及 P04–P06待续），
  `writer_lease=ACTIVE — Codex frontend goal`（09:20 接管），
  尚未达到 `DESKTOP_IMPLEMENTATION_READY`。
- 前端已消费核心维护与队列终态反馈，并在同一 wire 提交 Session/history 28方法增量及
  completed/failed/cancelled 编码。后端对实际生成工件 29/29 回归通过，双方摘要已锁定；
  无需用户逐字段批准。

## B — 双门判定（**均未满足，故未进入联调**）

| 门 | 判定 | 依据 |
| --- | --- | --- |
| BACKEND_IMPLEMENTATION_READY | **否（暂时）** | 28方法+队列终态已锁定并29/29；Windows r4 平台门已通过（含 native state 重启/`session/resume`/清理与独立 `-PostCheck`）；Pi/Hermes/OpenCode生产封装与逐家真实门待完成 |
| DESKTOP_IMPLEMENTATION_READY | **否** | 前端自报 PARTIAL，且 `writer_lease=ACTIVE`（未释放）；独立实现/验收门未完 |

因此仍**没有**记录 `FULLSTACK_INTEGRATION_OWNER`，**没有**接管前端工作树，
**没有**启动跨端链路。这是纪律要求，不是进度不足的借口。

## C — 无模型联调

未进入（依赖 B 的双门）。

## D — 真实模型授权与逐家验收（**进行中，四家待验**）

授权：仅 DeepSeek 官方 API，全轮累计 ≤ ¥10；凭据 locator 见工单 §D。

### 已完成

1. **凭据 locator 校验**：目录 0700 / 文件 0600、长度 35、`sk-` 前缀（只读元数据，
   未打印内容）。未读取其他凭据、未读取旧 37 密钥或任何登录态。
2. **官方 API 可达性（有界最小调用）**：`POST https://api.deepseek.com/chat/completions`，
   `model=deepseek-chat`，`max_tokens=8`。返回 HTTP 200，内容 `ok`，
   usage `{prompt_tokens: 11, completion_tokens: 1, total_tokens: 12}`。
   **这是 API 可达性证据，不是 Harness 验收**。
3. **Codex 家：保留错误配置失败，撤回协议不兼容结论。** 先前 Provider 配置
   （`$CODEX_HOME/config.toml` 定义 `model_providers.deepseek`，`base_url` 指向
   DeepSeek 官方、`env_key=DEEPSEEK_API_KEY`）驱动内嵌 Codex 0.147.0：

   ```text
   session/new → error -32603 "Internal error"
   data: "failed to reload config: .../config.toml:8:12: `wire_api = \"chat\"` is no longer
   supported. How to fix: set `wire_api = \"responses\"` in your provider config."
   ```

   这只能证明 Codex 0.147.0 拒绝过时的 `wire_api="chat"`，不能证明 DeepSeek 官方服务不支持
   Responses。用户提供的 DeepSeek 官方 `codex-deepseek-setup.sh` 1.3.0（2026-09-14 只读取得
   SHA-256 `0a3a33704e1fb1579300d559f009279c7db8e06aa428a0cba07ac9e265a130ca`）明确配置
   `base_url="https://api.deepseek.com/"` 与 `wire_api="responses"`，并提供完整模型目录。
因此撤回“协议不兼容/证伪”结论；原错误与零模型调用事实保留。`399d78d` 已完成官方 Responses
非敏感配置和完整目录投影，但尚未发真实模型请求；不会执行该脚本、修改用户真实 `~/.codex` 或建设协议代理。

### 未完成

- Pi / Hermes / OpenCode 三家的真实模型验收：无模型配置与有界 runner 已在 `bc7d95b` 完成，
  `502f4b5` 完成生产 sidecar 的冻结/秘密投影基础；原生运行时封装及付费验证尚未完成。本轮仍未执行、
  未用组件结果冒充。
- 42-D 的「UI 选择角色 → 首次发送 → 终止前内容 → 继续一轮 → 关闭重开恢复历史」
  完整链路依赖 42-B 双门，未执行。

### 费用账（累计）

| 项 | 调用数 | 用量 | 估算费用 |
| --- | --- | --- | --- |
| DeepSeek 官方 API 可达性检查 | 1 | 12 tokens（11 in / 1 out） | < ¥0.01 |
| Codex 错误 chat 配置尝试 | 0 次模型调用 | 0（在 `session/new` 阶段即失败，未发起模型请求） | ¥0 |
| **合计** | **1** | 12 tokens | **< ¥0.01 / 上限 ¥10** |

未预留、未充值。若后续继续，建议按 8 元停止新增测试留结算余量（工单建议）。

## E — 最终验收与提交

未执行（依赖双门与真实门）。41 的25方法/Windows基线检查点为 `72d6258`；当前28方法收口已由 r4
记录（见顶部），跨仓联调仍待双门。
更早检查点见 status：
`b84dc87`(39) → `38b28d6`(40-A) → `05053f9`(40-B) → `340fcad`(40-C) → `b70cd3f`(40-D)
→ `7e9ffd8`(41) → `8eeb422`(42-A 观察) → `978918d`(sidecar 桥)。
未 push、未 merge、未 force、未改动发布源或用户真实数据。
