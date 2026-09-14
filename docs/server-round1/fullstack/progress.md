# Work Order 42 — 交付、等待与真实模型验收进度

日期：2026-09-14。本轮零泄漏：任何证据、日志、命令行参数均不含凭据内容；
已发生的1次可达性请求由后端受控进程读取仓库外 locator，未把内容写入仓库或输出。
授权真实 credential 的 SecretStore→Worker 投影尚未执行，不以测试值路径冒充付费验收事实。

## 2026-09-14 — Pi gate 清理假绿返修（单点验收）

- **缺陷**：`pi-production-chain-gate.py` 首次提交用 `shutil.rmtree(temporary, ignore_errors=True)` 清理
  临时根；临时根内由 Pi 构建器发布的工件是 0555/0444，`rmtree` 没有目录写权限就无法 unlink 其条目，
  而 `ignore_errors=True` 把失败吞掉。结果：命令 **exit 0** 却在 `/tmp/agentbox-pi-gate-*/` 留下只读工件树；
  `run.removed` 当时已被如实算成 `false`，但没有机制因残留而失败，证据文档又引用了更早一次使用外部
  `--artifact` 的运行（临时根内无只读树、删除成功）而写成 `run.removed=true`。已复现（exit 0 + 残留）。
- **返修**：禁用 `ignore_errors`；删除前先做身份校验（必须是本次 `mkdtemp` 返回的完全相同路径、位于系统
  临时目录、属主为本用户、无组/其他权限、非符号链接）；对只读工件显式改写为可写后再删除，并复核路径
  确已消失；**任何残留使退出码非零**；`--keep` 报告保留路径且不声称 `removed=true`；外部 `--artifact`
  只读且绝不删除/改权限（复核摘要与模式，记 `preservedAfterCleanup=true`）；清理失败不覆盖主失败
  （主失败为主因 + 脱敏 `cleanupFailure`，仍非零）。
- **定向测试 12 项**：默认运行含 0555/0444 嵌套工件后无残留、`--keep` 确实保留、外部 `--artifact`
  未被删改、身份/边界不满足时拒绝危险清理（不同路径/符号链接/组可访问/前缀不符/非目录）、注入删除失败
  非零退出、主失败与清理失败并存时主失败证据不丢失、源码中不得再出现 `ignore_errors`。
  另外：测试套件自身运行前后不新增任何临时根。
- **残留清理**：报告指名的 `/tmp/agentbox-pi-gate-bvhe10su` 本次核查时**已不存在**；现场另有 6 个
  返修前的残留根，其中 5 个通过身份校验（前缀/位置/属主/权限/含 Pi 构建器 marker）后用修复后的
  gate 清理函数删除（`madeWritable` 分别 15461/9/11/15461/11），1 个不含 gate 内容（本会话调试用
  临时目录）被**拒绝**并改用非递归 `rmdir` 清除。现 `/tmp/agentbox-pi-gate-*` 为空。
- **修复后实测**：默认运行（自行构建工件）exit 0 + `run.removed=true` + `cleanup.madeWritable=15510`
  + 无残留；外部 `--artifact` 运行 exit 0 + `preservedAfterCleanup=true` + 工件摘要与 0555 模式不变 + 无残留。
- 模型调用 0、费用增量 ¥0；未读凭据、未改 Pi 生产配置、未动 ACP capability 修复与 Server/Core/Worker 合同。

## 2026-09-14 — 42-D Pi 生产封装与本地假端点全链

详细证据：[pi-production-packaging.md](pi-production-packaging.md)。终态 **PI_PRODUCTION_CHAIN_PREPARED**；
Pi 仍 **MODEL_NOT_VERIFIED**，`BACKEND_IMPLEMENTATION_READY` 未登记。

- 真实 Pi 全链打通：Server → Core → sidecar deployment → c4 release Worker(ABW1 interactive) → bwrap →
  **真实 `@automatalabs/pi-acp@0.5.0` + 真实 Pi 依赖闭包** → 本机 loopback 假 DeepSeek 兼容端点。
  门 `scripts/server-round1/pi-production-chain-gate.py` 退出码 0。
- Pi 运行时工件：`scripts/server-round1/build-pi-runtime-artifact.mjs`（只用现有 package-lock 与
  node_modules，不联网、不跑 npm），317 包 / 15458 条目 / 64.9 MiB / tree digest
  `sha256:afe238d3…`；双构建 digest 与 manifest 一致；输出只读、带 owner marker、原子发布，
  未标记的非空输出**拒绝且不删除**。
- 生产模板由插件拥有（`agent_box_harnesses.pi.production` + `deploy/pi/{models.json,settings.json}`），
  与 `bc7d95b` 的 42-D 准备配置**逐字段相等**（测试跑 `model-validation-42d.mjs --dry-run` 比对），
  官方根地址、`deepseek-flash`、64 tokens、thinking 禁用、agent/provider 重试双关；
  loopback 覆盖只改 `baseUrl` 一个字段且不落盘为生产配置。
- 两轮实测：provider 请求**恰 2 次**（`/chat/completions`，`model="deepseek-flash"`，`max_tokens=64`，
  `thinking.type=disabled`，Authorization 与注入的假 token 相符、0 未授权、0 超预算）；delta 序号
  4<7 与 11<14；第二轮请求含第一轮 user 与 assistant 内容；同一 Server Session 第二轮沿用同一
  native id；重开时 adapter **重放了已存储轮次** → 走的是重放语义的 `session/load`（**不是**
  `session/resume`），并已有直接观测证据。
- 发现并修复真实公共缺陷：ACP 用空对象播发 session 能力（`resume: {}`），Python 侧 `bool({})`
  把真实 Pi 判为不可续接，导致第二轮以 `SIDECAR_CHECKPOINT_INVALID` 失败；改为"存在且非 False
  即视为已播发"，参数化 7 例回归，端到端复核第二轮恢复成功。
- 未知模型在发 HTTP 前拒绝（0 新增请求，`Harness model is not available`）；缺凭据由 Server 以
  `CREDENTIAL_REQUIRED` 拒绝且不派发。假 token 经既有 SecretStore→secret frame→sidecar 注入，
  未出现在事件、checkpoint、报告或 Git；运行后 views/secrets/进程/临时目录全部清理。
- 验证：构建器 11/11；模板 12/12；Server sidecar 91 passed；全量 python 444 passed/4 skipped
  （上阶段基线 424/4，+20）；Node sidecar 25/25 与 42d 4/4；既有 runtime-artifact gate 仍 exit 0。
- 模型调用 0、费用增量 ¥0；累计仍 1 次 / 12 tokens / <¥0.01。c4 仍无 Windows 平台证据（本阶段未跑 r4）。
- 措辞修订：`runtime-artifact-gate.py` 与 `runtime-artifact-projection.md` 中原"本机无 wsl.exe"
  改为准确表述——该门有意直接启动 WSL 内 release Worker 并使用相同 ABW1 协议，未经过
  Windows Server→wsl.exe 路径，Windows c4 复验仍待后续。

## 2026-09-14 — 42-D 运行时工件投影底座（provider-neutral）

详细证据：[runtime-artifact-projection.md](runtime-artifact-projection.md)。终态
**RUNTIME_ARTIFACT_PROJECTION_READY**；`BACKEND_IMPLEMENTATION_READY` 仍未登记。

- 新增中立能力 `runtimeArtifactMounts`：部署声明「canonical WSL 源目录 + 受限 target
  `/runtime/artifacts/<stable-name>` + 稳定 tree digest」；Server 只做通用 schema 校验并透传，
  connector bootstrap 携带预期摘要，**Worker 在 WSL 内权威重算并比对**，bwrap 只对该已授权目录
  `--ro-bind`。Server/Core/Worker/bwrap 无品牌分支；Harness 专有路径/环境变量留给后续插件阶段。
- 跨语言 tree digest v1（Python `agent_box_sandbox_bwrap.artifacts` / Rust `artifacts.rs`），
  golden fixture 两侧逐字节一致（`protocols/worker/golden/runtime-artifact-tree-v1*.json`）。硬上限
  32768 条目 / 1 GiB 内容 / 4096 字节路径；拒绝 root 或内部 symlink、FIFO/socket/设备、非可打印
  ASCII 路径、重复或 ASCII 大小写冲突、越界、与 workspace/worker root 重叠。
- Worker control protocol **2 → 3**（bootstrap 结构变化），双向拒绝均有测试；其中「新客户端 + 旧
  Worker」用真实历史二进制 `.acceptance-bundle-c3` 复现。bootstrap 拒绝改为类型化 `WORKER_ERROR`
  帧，Server 侧重抛为带 code 的 `SidecarError`，原因进入持久 dispatch 账本。
- 新 acceptance bundle `.acceptance-bundle-c4`：
  `sha256:31e92959b06b3ee9f30ebfb9ce6b2bee74af847e4a147bba906bff7ecf681fa6`；c2/c3 未覆盖未删除。
  **本阶段不运行 Windows r4**：c3 的 r4 仍为历史有效证据，c4 尚无 Windows 平台证据。
- 真实 release Worker(c4)+bwrap 无网络无模型门 exit 0：
  `python3 scripts/server-round1/runtime-artifact-gate.py --worker <.acceptance-bundle-c4/agent-box-worker>`
  → fixture 从 `/runtime/artifacts/fixture-dep` 加载依赖返回固定值、guest 写入被拒、宿主树未变、
  摘要不符时 turn 失败且无伪造 session、无残留 view/secret。只登记**运行工件投影门**，
  **不登记任何 Harness/model 通过**。
- 缺陷核查：工作令所述 sidecar bundle「重复嵌套分块上传」在 HEAD `989c9f2` 上**未复现**（单个
  (path, offset) 唯一一次 `view.put`）；已补行为测试并按工作令形态做临时反证（测试随即失败）后
  还原，未做无谓“修复”、未降低 view digest 或完整性断言。细节见证据文档 §7。
- Python 全套 `424 passed, 4 skipped, 0 failed`（41 记录基线 348/4；本阶段收集 +76 项）；Node 25/25
  与 42d 4/4；Rust `cargo fmt --check` 干净、`cargo test --locked --release` 10 passed（基线 4）。
- 模型调用 0、费用增量 ¥0；累计仍 1 次 / 12 tokens / <¥0.01；未读凭据内容。
- 前端只读观察（14:54 +08:00）：HEAD `6a29fd7043fc2c1af34eb478eaaa08564763c986`、工作树 clean、
  `writer_lease=ACTIVE`、`frontend_implementation=PARTIAL`；TS/生成工件摘要就地重算未变（未重锁）。
- 下一阶段：在同一底座上分别封装 Pi（Node 模块目录）、Hermes（隔离 Python 包闭包）、
  OpenCode（单文件二进制沿用 existing executableMounts，不退化），随后进入 42-D 逐家真实门。

## 2026-09-14 — Work Order 41 Windows r4 平台门通过

Windows 真机、`py.exe -3.12`、真实 `wsl.exe`、digest 固定的 release Worker、locked 28 方法 wire schema、
端口 18744、隔离 DataRoot `%LOCALAPPDATA%\AgentBox\acceptance-server-41-r4` 与 WSL workspace
`/tmp/agentbox-server-41-r4` 上单次执行 `accept-e.ps1 -Cleanup`，退出码 0：

```json
{"approval_execution":"execution_c619a5fb923647ec9f3750e6546ffbcc","attachment_execution":"execution_fb479cdd3aad47e9b050f3db51fc0248","cancelled_execution":"execution_cd35d32508544be2b469371af56c42ad","data_root":"C:\\Users\\maoqh\\AppData\\Local\\AgentBox\\acceptance-server-41-r4","distribution":"Ubuntu","fixture":"explicit no-model ACP peer","profile_id":"profile_489c3e31ec5d457081e5570e64d10a83","provider_model_id":"provider_f8738a7bbf3a45088040d5b8c5060871","r4":{"checkpoint_digest":"sha256:a6525f3b20a69c19abac3ce3834982696bb3eb2eb0423829e76a01b37da5a06d","checkpoint_files":["native-state.json","reopen-method.txt"],"checkpoint_native_id":"stateful-13","cleanup_guards":{"data_root_that_is_not_a_directory_refused":true,"data_root_with_mismatched_marker_refused":true,"data_root_with_owner_marker_accepted":true,"data_root_without_owner_marker_refused":true,"linked_data_root_target_refused":true,"marked_workspace_accepted":true,"workspace_without_owner_marker_refused":true},"completed_seq":12,"delta_seq":10,"first_execution":"execution_387c3382ee694dd4b088813f6c7763f0","first_round_reopen":["session/new"],"fixture":"tests/server/fixtures/stateful_acp_peer.mjs","harness":"hermes","lock_instance_after_final_stop":"server_79296dd8029948d0bf7c18bff0ae24cf","lock_instance_after_first_stop":"server_6dd995a9dfd14795b6ad975f249ae9e9","nonce":"STATEFUL-NONCE-R4-7F3A9C","second_execution":"execution_71d57937cc8346faa45fe9df22ad8bf6","second_round_reopen":["session/new","session/resume"],"server_id_after_restart":"server_639bc04679554c66ac6b1e77661e70f1","session_id":"session_88a29fa110254843a6ceee9a12545e43","state_projection":"/tmp/agentbox-home/sessions","stop_mode":"tree_terminate","timeout_ms":30000},"result":"BACKEND_41_E_WINDOWS_WSL_WIRE_OK","server_id":"server_639bc04679554c66ac6b1e77661e70f1","session_id":"session_97b27f612778411f92c9bb68e1ef9a13","windows_server":true,"wire_event_stream":"wire.eventStream/1","worker_digest":"sha256:bb90e346bbd857f02eba8d267f47c3ce793d30c9894ca823dc09c482d886f5eb","workspace":"/tmp/agentbox-server-41-r4","workspace_id":"ws_cb0eb4a7e01541b4a622935e606b6b5f"}
```

逐项证据：

- **崩溃式重启（`stop_mode=tree_terminate`）**：第一轮完成后，脚本以 `taskkill /T /F` 做**有界进程树
  强制终止**才真正结束 Server（py.exe 启动器持有 python.exe 子进程），随后以同一 DataRoot 重启并
  恢复 live；`server.hello` 返回同一稳定 server_id `server_639bc04679554c66ac6b1e77661e70f1`。
  DataRoot 锁（`server.lock`）的持有实例在第一次停止后为
  `server_6dd995a9dfd14795b6ad975f249ae9e9`，最终停止后为 `server_79296dd8029948d0bf7c18bff0ae24cf`；
  两者不同，即锁已由前一实例释放并被重启后的实例重新获取（脚本把两者相等直接判为清理问题）。锁文件
  在持有期间被 Windows 字节区间锁保护、不可读，因此“停后仍可读”本身即释放证据。
  该路径是**强制终止后的恢复门**，**不是**正常/graceful 关闭：Server 的完整生命周期退出与最终清理
  仍留作全栈最终验收项，本轮未覆盖。
- **同 native id resume**：第二轮 checkpoint 的 `nativeSessionId` 与第一轮相同（`stateful-13`），
  Server 的 Session REST read projection（`GET /api/v1/sessions/{id}`；wire 里没有，也不存在
  `sessions.get` 方法）返回的 `checkpoint.native_id` 亦未变；fixture 在第二轮只接受
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
exit 0；两次的实例/会话标识不同，结构与断言语义一致，记录值即复跑值——本节的锁实例、稳定
server_id、checkpoint digest 与其他标识一律以上方 JSON 为准，不引用首跑的旧值。

检查点区分（三个不可互相替代）：native-state 实现基础为 `3e4282b`，r4 验收脚本/测试代码检查点为
`713b2e3`，本节证据是**已提交脚本上的 r4 复跑结果**，记录检查点为 `87b17a3`。`3e4282b` 只是
native-state 的实现基础，不是 r4 后端检查点。

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
Pi 生产封装已完成（PI_PRODUCTION_CHAIN_PREPARED，仍 MODEL_NOT_VERIFIED）；Hermes/OpenCode 生产封装与
**四家（Codex/Pi/Hermes/OpenCode）真实模型门**仍未完成，前端也未满足双门，故仍未进入全栈联调。
r4 证明的是 `tree_terminate` 有界强制树终止后的崩溃式重启、DataRoot 锁释放/重新获取与 native
`session/resume`；正常 Desktop/Server 生命周期退出与最终清理仍是后续全栈最终验收项，本轮不宣称
已覆盖。`workbench_model_verified_count` 仍为 **0**；费用账仍为累计 1 次/12 tokens/`<¥0.01`
（上限 ¥10），本阶段增量 ¥0。goal 未完成，也未进入全栈联调。

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

后端在41收口期间按42-A同等写权约束做只读检查（未写前端任何文件、未杀其进程、未发第二个 goal）。

### 2026-09-14 14:24 +08:00 — 最新只读观察（本文件引用前端事实以此为准）

- 工作树 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1`，分支
  `feature/agentbox-desktop-product`，实际 HEAD `b02093ce9ee60dfaea7867afefe3500262ec8cc0`
  （`docs(desktop): audit the 28-method client matrix`，提交于 2026-09-14 14:11:55 +08:00）。
  工作树 **dirty**：17 个已修改文件（composer/Profile/i18n 等生产与测试文件）+ 1 个未跟踪测试文件，
  属正在施工；后端不取写权。
- 其 `docs/desktop-product-delivery/status.md`：`frontend_implementation=PARTIAL`
  （当前阶段为 P05 客户端矩阵只读审计：22 PRODUCTION_REACHABLE、6 FIXTURE_ONLY_FRONTEND_GAP、
  0 CLIENT_READY_NO_SURFACE、1 EXTERNAL_LIFECYCLE_BLOCKED；P04 production lifecycle connection 与
  P06 无模型独立验收待续，`REAL_FLOW_VERIFIED=否`），
  `writer_lease=ACTIVE — Codex frontend goal`（09:20 接管；声明完成后停止写入并回报，不提前 RELEASE），
  尚未达到 `DESKTOP_IMPLEMENTATION_READY`。该文件自述 `updated_at: 2026-09-14 14:32 (+08:00)`，
  晚于其文件 mtime（14:11:24）与 HEAD 提交时间（14:11:55）；按只读观察如实记录并报告，不改前端。
- wire 摘要未变：就地重算 `apps/desktop/src/types/wire/wire-v1.ts` =
  `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`、
  `docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json` =
  `5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`，生成工件内仍为 28 个方法，
  与后端锁定值一致，故锁保持 `WIRE_LOCKED_FOR_IMPLEMENTATION`：未重锁、未改合同。
- 前端 ACTIVE/dirty 不是阻断，不构成接管条件；后端未写前端任何文件、未杀其进程。

### 2026-09-14 12:15 +08:00 — 上一轮观察（历史）

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
| BACKEND_IMPLEMENTATION_READY | **否（暂时）** | 28方法+队列终态已锁定并29/29；Windows r4 平台门已通过（`stop_mode=tree_terminate` 有界强制树终止后的崩溃式重启、DataRoot 锁释放/重新获取、同 native id `session/resume`、终止前 delta、ObjectStore checkpoint、清理与独立 `-PostCheck`；正常生命周期退出未覆盖）；Pi/Hermes/OpenCode生产封装与逐家真实门待完成 |
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

- Pi / Hermes / OpenCode（并入 Codex 后为四家）的真实模型验收：无模型配置与有界 runner 已在 `bc7d95b` 完成，
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

未执行（依赖双门与真实门）。41 的25方法/Windows基线检查点为 `72d6258`；r4 相关检查点为 native-state
实现基础 `3e4282b`、r4 验收脚本/测试代码 `713b2e3`、已提交脚本上的 r4 复跑证据 `87b17a3`（见顶部），
跨仓联调仍待双门。
更早检查点见 status：
`b84dc87`(39) → `38b28d6`(40-A) → `05053f9`(40-B) → `340fcad`(40-C) → `b70cd3f`(40-D)
→ `7e9ffd8`(41) → `8eeb422`(42-A 观察) → `978918d`(sidecar 桥)。
未 push、未 merge、未 force、未改动发布源或用户真实数据。
