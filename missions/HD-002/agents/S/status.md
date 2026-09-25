# S status — HD-002

- role: S（Service/Server 实现者，BE 树 `work/hd002-s` @ `b3d862fa`（BC-0033 包提交，基线 60d868ef），clean，仅未跟踪 `.qoder/`）
- owner_generation: HD002-2（自 S-0005；BC 为唯一上级收件方）
- updated: 2026-09-23 07:06Z 前后（第 186 轮实质同步：门线全貌=**真实门四连**——C-0048 配对门 FAIL（Electron 子进程 443 提前外联）→C-0056 新批 BLOCKED（监督时序误判）→C-0057/0058 修后第三批再 **FAIL**（同 443 外联，`--disable-background-networking` 实证不充分，BC-0070/FC-0077 合账：Server 侧 NO-SEND 全绿、方法账与 F1-0031 连接器签名逐项吻合）→C-0059 只读归因（FC-0078：首连者=非 main 子进程 PID 112，角色 UNKNOWN，应用源码无远端 URL 嫌疑）→C-0060 注入预检 **BLOCKED**（FC-0079：strace 无法按地址族放行 AF_UNIX 而 Electron 需 11 次 Unix 前置连接）→**C-0061 现行**：FC 单次空宿主诊断 live 门（≤25s、无 Server/凭据、接受可能真实外联即停如实报，回执在途）。S 全程仅知悉级（本窗口零 S 头收件；S-0020 后无 S 交付义务）；S 树 @`b3d862fa` clean 停写。候：FC 诊断回执与 C 归因裁定、Pi settings 线（INCONCLUSIVE 未变）、query 字段裁定、I-DEC-0002 用户答复。**下一扫描标记=编号差集至 BC-0070/C-0061/F1-0032/F3-0024/FC-0079/PROFILE-0009/I-SESSION-FIRST-SEND-001**（主扫描=按编号序列 diff 游标，第 184 轮起含 `agents/I/outbox`；全盘 mtime 会被刷新，时间窗两条均不可靠；每 ~2–3 静默轮跑一次全量 S 头补扫兜底，第 179 轮跑过=无漏收）。145–186 轮收件明细见游标逐轮条。S-0020 为文档交付非代码包。）

## 原生资源实况（如实）

- 会话可收件；PID 514369（父 514078）启动 09:55:00 +0800；session UUID 未知。
- goal active；上限曾为 `maxTurns=100` 平台硬上限，第 100 轮到限自动暂停一次，用户 `/goal resume` 后续计至 200；100000 未生效（多次如实报）。到限强制暂停→恢复点=本文件。
- 无控制器/守护进程；低频原生收件；零真实调用、零预算动作、无重门占用（轻量定向测试合规）。

## 已交付（不重做）

- outbox：S-0001 TAKEOVER、S-0002 RECEIPT、S-0003 提案（部分撤销）、S-0004 开关闸事实、S-0005 管理 ACK、S-0006 基线收口收讫、S-0007 处置收讫+证据报交、S-0008 项目必选 ACK+**首门运行证据**、S-0009 local 链运行实证、S-0010 覆盖盘点+**G1-G3 缺口与 test-only 写域申请**、S-0011 G1–G3 草稿预验证形状事实（补 S-0010）、S-0012 **BC-0029 原生路径只读核答复（三问全答，提案非施工）**、S-0013 对 BC-0030 的 S 域校正确认（采纳启动形态 `--execution-mode`，独写面收缩为 local_environment.py+provider tests）+BC-0031 收讫、S-0014 原生 seam 运行级预验证（/tmp 草稿 5 passed：旧拒绝形状逐字钉住、native 不削合法性、**service.py 零改动实证**→S 包面收缩为 local_environment.py 单文件+定向测试）、S-0015 **BC-0033 包完成 HANDOFF**（HEAD b3d862fa、门与反例全列、S 停写）、S-0016 与 BC-0035 交错确认（包已完成后确认参数名/注入形状，维持停写）、S-0017 包补件（全树 collect 1527/0 errors 计数归账+uv path 环境注记）、S-0018 C-0028 发送期重验行号随伴（不改 BC 写域）、S-0019 BC 集成只读核注（HEAD blob 逐字一致+合同按形消费+中间提交 `445f9c7e` native 启动 TypeError 窗事实注记）、S-0020 **答 F1-0016 三小点+自我更正**（READ_ONLY_FACT_ANSWER→F1、cc FC/C/BC/F2/F3：accepted 响应不携 workspace、`workspace_id` DDL NOT NULL+全程零 UPDATE=服务端不可漂移、createAndSend 直收携全 session_record（含 workspaceId）vs query 兜底固定子集不对称=F1-0013 反例根因、executions.list 实含 workspaceId/placement（更正 f1-seam-server-facts §一.2 过窄）；补救选型归 C/FC/BC 裁，无 S 写域）。
- reports：`f1-seam-server-facts.md`（§四 循环导入脆弱性）、`p2-3b-be-package-proposal.md`（历史）、`cp-session-first-send-exec-dir-facts.md`（其「默认工作区归 H」一句已被 I-PROJECT-REQUIRED-001 作废，其余有效）。

## 关键运行证据（本轮新增）

- **BC-0033 包门（第 52 轮，提交 `b3d862fa`）**：新测试+`test_environment_providers.py` **31 passed / GREEN_NO_SKIPS**；六文件回归配对（wire_v1/wire_seq_128/hello_capability_sync_097/workspace_connection_reserved_145/stage_a_server/delegation）**84 passed/3 failed**，三红以 `git show HEAD~1` 原文件 importlib 预注入同释器**逐一复现=环境先存**（capabilities 测试依赖 host bwrap 探针=工具沙箱内 unavailable〔BC-0023 线〕；两 delegation 桥测试需 ABSENT 工件）。uv 门命令注意：`plugins/agent-box-runtime-wsl/src` 须上 path（生产 import 形状，非本包引入）。

- `test_wire_v1.py::test_create_and_send_accepts_once_and_replays_the_same_execution` @60d868ef：**1 passed / GREEN_NO_SKIPS**（uv 一次性隔离环境 + 预导入 `agent_box.service`；跑后树 clean）。补齐 BC-0015 因环境缺 pytest 未跑的最先离线门。
- **local open→首发→续聊绑定运行级核验（S-0009，BC-0016 所派）**：E0 无 sandbox 组合类型化 `LOCAL_SANDBOX_UNAVAILABLE`（印证 sandbox-bwrap 硬依赖）；E1 真实目录 open→workspaceId+realpath；E2 首发一次+重放同 session/execution；E3 open 第二项目后旧会话续聊仍绑原项目（DB 联结、send 入队语义）。**S 域无证实断裂、无修复包申请**；脚本/数据全在 /tmp。
- S-0007 的 `POST:/sessions` scope 索引错误已按 BC-0016 纠正：createAndSend 走 `sessions.send` scope；报告附记已标。
- **C-0019 两进程启动拓扑的 BE 现码核证（第 15 轮，只读，随点名供 BC）**：`server/__main__.py` 现有 CLI 即完全可表达该拓扑——`--data-root`（必填）、`--port`（默认 8732、1–65535 校验）、`--sidecar-deployment`＋`--plugin-root`（前者给出时后者强制）、可重复 `--mount TOKEN=PATH`；恒绑 `127.0.0.1`、单 ASGI worker 为不变式无多工作者旋钮（:58-59）。**零 BE 码改动即可发 CP 启动命令**；token 文件仍在 data-root `secrets/http-token`（BC-0024）。
- BC-0023「sandbox 探针环境差异」已回灌报告：E0 的 `LOCAL_SANDBOX_UNAVAILABLE` 是工具沙箱内读数（非特权 namespace 被拒），BC 沙箱外同探针得 available——E0 不得作 host 判死引用，已按此校正（第 13 轮）。
- **G1–G3 草稿已在真实码上预验证全绿（第 44 轮，仅 /tmp，树零触碰）**：`/tmp/hd002-s-g1g3/test_wire_v1_project_binding_hd002_draft.py` → **3 passed / 0.41s / 0 真实调用**（uv 一次性环境）。裁定获批即照此入树。预验证钉住的形状事实：① wire 外层码把 typed 名放 `details.internalCode`（`ENVIRONMENT_INVALID`→外 `INVALID_REQUEST`；`LOCAL_PATH_MISSING`→外 `NOT_FOUND`），断言取 internalCode；② REST profiles→**201**、REST turns→**202 同步返 turn_id**、REST 同会话并发 turn→**409 TURN_CONCURRENCY_CONFLICT（单飞行）**，而 wire `sessions.send` 排队——两种生产语义并存；③ `recover_interrupted_turns()` 把 turn 封成 `unknown` 后，profile 进入 `recovery_pending`，**后续 send 被 `PROFILE_RECOVERY_REQUIRED` 拒且现无 wire 解除面**（handlers.py:848-851 注释自证）——门须改用 WO-139 `_Completing` 桩形（accept 内 `set_turn_dispatch→complete_turn`，usage_source="fake"）驱动真终态；④ 绑定证据面 `runtime.repository.get_turn_context(turn_id)` 返回 `workspace_id/normalized_path/env_kind`（join@service/sessions/repository.py:687-706）。
- **原生 seam 运行级预验证（第 51 轮，仅 /tmp，树零触碰）**：`/tmp/hd002-s-native-seam/test_native_mode_seam_hd002_draft.py` → **5 passed / 0.02s**。事实：①旧隔离拒绝形状钉住（LOCAL_SANDBOX_UNAVAILABLE/503/retryable=True + readiness 列表形状，可作包回归断言）；②构造注入策略 provider 即满足 native 开，validate 五类 typed 拒绝（MISSING/INVALID/FORBIDDEN/NOT_DIRECTORY/相对路径）在 native 下逐条仍红——"注入只表明组合模式策略"边界真实可达；③`WorkspaceService(records, idem, local=<策略provider>)` 零 connector 完成 open+去重（created True→False 同 id），**service.py 零改动从"预计"升级为"实证"**，S 包面=local_environment.py 单文件+定向测试；④发送期目录消失的重验落点不在 S 两文件（get_turn_context 只读记录），已在 S-0014 划归 BC 执行接线。
- H-0003/H-0004 复跑纪律（第 38–39 轮核）：Pi/H 门复跑需 `AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap`（Server 沙箱端口注册解析契约）；缺该变量时 H 门**显式红**（`PI_REQUEST_BUDGET_SCENARIO_SHORT "charged 0, expected at least 2"`）而非静默绿——与 S 的「无 Worker 须 typed `GATE_WORKER_REQUIRED` 非零退出」纪律同形，互证。

## F1-0013 §4 预备事实（只读核毕 @bc-native `1d3a9575`，随命点可答，未发件）

- wire `sendOutcome.query` → `send_outcome_query`（`server/wire/handlers.py:2122-2124`）直通 `sessions.records.intent_outcome(requestId)`（`service/sessions/repository.py:540-558`）。
- **现 accepted 响应不携 workspace 归属**：出参固定挑为 `{outcome:"accepted", sessionId, executionId, configVersion, queueItemId}`（idempotency 存体的取子集，非透传）；无行→`{outcome:"unknown"}`。
- **服务器侧数据存在且一跳可达**：`server_sessions.workspace_id` 为会话行既有列（同文件 `_session_view` :561-572 已在输出 `workspaceId`）——若裁「加字段」，在 `intent_outcome` 内按 `body["sessionId"]` 补一次 session 行读取即可，改动落 BC 接线面（repository 出参形状），**不涉 S 两文件**。
- 与 S-0009 E3 运行级实证一致（续聊恒绑原项目=DB 联结），数据侧无缺口。

## 收件游标（最后全文已收）

第 191–196 轮（并记）：191–194 静默（194 跑周期 S 头补扫=无漏收）。195–196 收三件（头均无 S）：**FC-0080**（C-0061 空宿主单次诊断回执，候选新 SHA `90ca17b8` 仅增测试脚本）：`ORDESSA_EMPTY_HOST=1`、无 Server/插件/凭据条件下**仍有 1 次非 loopback connect 成功**→停机 SIGKILL 全组（`EGRESS_ATTEMPT_STOPPED`，不写成零外联）——**实证排除「外联须由 Ordessa connector 首连或业务插件引起」**，源在 Chromium/Electron 层；`strace execve` 见 `--type=utility network.mojom`（Network Service）子进程，成功外联 PID 与其亲缘未证（未采 clone）；NetLog 52 事件含 URL_REQUEST/一条 `other` 型 HTTPS GET，部分落盘不能逐条对账。**C-0062**（→FC）采纳第一建议=既有私有 NetLog 只读有限归因批。PROFILE-0010=Profile 插件线常规进度同步。**门线现状**：配对门仍锁（四批 FAIL/BLOCKED 不动），归因推进中，后续若裁「clone/getAppMetrics 追加诊断轮」再证亲缘。S 仍零写域动作。顶号：BC-0070/C-0062/F1-0033/F3-0024/FC-0080/PROFILE-0010/I-SESSION-FIRST-SEND-001。下一扫描标记=编号差集至同上。

第 187–190 轮（并记）：187–189 静默候 FC C-0061 诊断回执；190 收 **F1-0033**（→FC/C，cc F3/BC/F0）：F1 自我更正——它把 C-0058「十项皆 true」中三项算作 F1 面证据，其中一项实为**平凡真**（与 F3-0024 同类证据归属纠偏，双方均在自纠而非被纠）。头无 S，纯知悉。**暂停预案注**：本 goal 于 200 turn 自动暂停后候用户 `/goal resume`；恢复点=status.md 头部+本游标，重启即从「编号差集至下行顶号」续扫。顶号：BC-0070/C-0061/F1-0033/F3-0024/FC-0079/PROFILE-0009/I-SESSION-FIRST-SEND-001。下一扫描标记=编号差集至同上。

第 183–184 轮（并记）：C 于 FC-0079 BLOCKED 后**换道**——**C-0061**（→FC，cc I/F0）授权**单次无 Server/凭据空宿主 Electron 启动归因门**：全新 0700 根、≤25s、`ORDESSA_EMPTY_HOST=1`、不载业务插件/不给 origin/token/不开 Profile；`strace -ff execve,connect`+官方 `--log-net-log` 默认元数据；**接受该次可能真实外联**：出现任一非 loopback AF_INET/6 connect 即停全组标 `EGRESS_ATTEMPT_STOPPED` 并如实报成败（不声称保证零外联）；25s 无外联也仅得「空宿主条件未复现」不归责业务插件；静态预检/合成反例先行，C 只读核过 `unshare -Urn`/`bwrap --unshare-net` 本宿主均无权限失败。F3-0024：`ORDESSA_EMPTY_HOST=1` 真实存在但现有 runner 跑不了+一条「为错误理由变绿」布尔；并自我更正——C-0058「十项皆 true」中两项实由 F3 `view.tsx` 生产码 DOM 驱动的 e2e 证据。两件头均无 S。**注**：本轮起顶号扫描已加入 `agents/I/outbox`（历有全量 S 头补扫兜底无漏收）。顶号：BC-0070/C-0061/F1-0032/F3-0024/FC-0079/PROFILE-0009/I-SESSION-FIRST-SEND-001。下一扫描标记=编号差集至同上。

第 181–182 轮（并记）：收 **FC-0079**（→C，cc I/F0，C-0060 合成预检结果=**BLOCKED_NO_ELECTRON**）：strace 6.19 注入命令实测生效（connect/sendto/sendmsg/sendmmsg 全 EPERM(INJECTED)、send 落 sendto 亦拦），**但** `inject=connect` 按 syscall 名匹配无法按 `sa_family` 区分——既有两批 Electron trace 在首条外连 TCP 前各有 **11 次 AF_UNIX connect**（系统总线/图形会话），此注入会连本地基础连接一起杀，「允许 Unix、禁外部 Inet」边界不可信成立→诊断价值门不成立，建议 C 记 BLOCKED 不给 live 槽；后续需按地址族可验证隔离机制或受权 netns 再议。无 S 头。门线现状=外联归因停在工装隔离能力边界，候 C 裁定（候选方向：换归因策略/受权隔离环境/或转用户裁决）。顶号：BC-0070/C-0060/F1-0032/F3-0023/FC-0079/PROFILE-0009。下一扫描标记=编号差集至同上。

第 178–180 轮（并记）：静默候 FC C-0060 静态设计回执。179 收 **F1-0032**（→FC/C，cc BC/F0/F3）：给外联诊断批两条不花槽可核的 FE 精确事实，其一为「全对却红」活陷阱且在 `main.ts`（F1 声明非其写域）——头无 S，纯知悉。**周期全量 S 头补扫**（第 179 轮跑）：命中集全部为旧世代已构件（FC-0005/0015/0023/0047/0053、H-0005..0007、I-* 等），无漏收。顶号：BC-0070/C-0060/F1-0032/F3-0023/FC-0078/PROFILE-0009。下一扫描标记=编号差集至同上。

第 177 轮：**C-0060**（→FC，cc I/F0）批准 FC-0078 方向的**静态诊断设计批**：为下轮空宿主（无 Server/凭据、`ORDESSA_EMPTY_HOST`）25s 单次诊断做设计+合成预检——优先 `strace -ff` 对 `connect/sendto/sendmsg/sendmmsg` 用 `-e inject=…:error=EPERM`  syscall 注入**保证不外联**（C 已核本机 strace 6.19 支持；无特权 netns 不可用），先以本地合成 socket 脚本证拦截有效；「被拦截」不得误报为「本来不会外联」；不启动 Electron/Server，可在 FC 测试脚本域交 clean SHA+合成自测回执，**C 看回执后另裁单次 live 槽**。F1-0031：BC-0070 ASGI 入站普查与 F1 连接器调用签名**逐方法逐计数吻合**（含唯一不可猜条）+「pre-hello 网络静默」收敛事实。两件头均无 S。顶号：BC-0070/C-0060/F1-0031/F3-0023/FC-0078/PROFILE-0009。下一扫描标记=编号差集至同上。

第 173–176 轮（并记）：173–175 静默；176 收 **FC-0078**（→C，cc F0/BC/I，C-0059 只读归因结果，PROPOSAL_ONLY）：两批 trace 各 7 connect，非 loopback 首连者=**PID 112（Electron 树内非 main 子进程，Renderer/Utility/Network Service 角色 UNKNOWN）**，旧 trace 无 execve/栈/URL 不能定请求语义；应用侧 main/preload/loader/bridge/启用插件源码扫描**未找到** autoUpdater/遥测/远端 URL（≠Chromium 内部不联网）；`--disable-background-networking` 不充分已实证。建议下一步=**空宿主诊断**：新私有 0700 根单次 25s、`ORDESSA_EMPTY_HOST=1` 不载业务插件、无 Server/凭据，仅测试 CLI 加官方 `--log-net-log`（默认元数据、私有 0600）+`strace -ff execve,connect`；阳性→缩到 Electron/Chromium/系统层，反例≠业务插件罪因；明确**不建议**用拒绝代理掩盖外联过关。无 S 头，候 C 裁定诊断槽。顶号：BC-0070/C-0059/F1-0030/F3-0023/FC-0078/PROFILE-0009。下一扫描标记=编号差集至同上。

第 172 轮：第三批合账闭合且**转入只读归因期**——FC-0077 停服合账（整轮 FAIL/no retry，`PAIR_DONE`≠PASS，Server 侧表全 0、方法账与 BC-0070 一致）；**C-0059**（→FC，cc F0/BC/I）新立**只读外联根因收敛批**：现存两批私有 strace/log PID 时序+启动命令+main/preload/插件网络依赖源码+Electron/Chromium 40 官方路径核证，禁读用户配置/凭据/外部地址，不再换根重跑同方案；F1-0030 自撤 F1-0028 §2.1/2.2 两条预检（读 FC runner 一手代码后确认已被挡）。三件头均无 S，无写域动作。顶号：BC-0070/C-0059/F1-0030/F3-0023/FC-0077/PROFILE-0009。下一扫描标记=编号差集至同上。

第 169–170 轮（并记）：C-0058 批第三批唯一 live 槽 → BC-0069 READY（根 `/tmp/hd002-c0053-pair-fo6yn_ar`/port 43891）→ **FC-0076 第三批 FE 门 FAIL（同 C-0048 首轮失败模式）**：Electron 子进程一次外部 TCP 443 成功 connect **早于**首条本批 loopback Server connect；唯一新变量 `--disable-background-networking` 未收敛该负例，FC 一判整轮 FAIL、不重试不加载第二开关；局部 UI 十项全 true（身份/profile/workspace 一致、未填 prompt 未 Send）不抵消外联。发起模块仍 UNKNOWN（F1-0025 已证 F1 连接器结构上不可能发 443，源在 Electron 内部）。F3-0023 自我更正+零动作。均无 S 头，候 C 对第二轮外联归因裁定（若需 Server 侧方法/连接事实 S 备查）。顶号：BC-0069/C-0058/F1-0029/F3-0023/FC-0076/PROFILE-0009。下一扫描标记=编号差集至同上。补（第 171 轮）：**BC-0070 第三批停服审计**——Server 侧 NO-SEND 全绿：tap 全入站 `server.hello=3/profiles.list=1/workspaces.list=2/workspaces.open=2`，`createAndSend/send/query/未知方法=0`；Server 进程树外联 0；SIGTERM 干净停服、port 释放、stderr 空；时序误判已消除（计数文件正常解析）。唯一负例仍=Electron 内部 443 提前 connect（发起模块 UNKNOWN），整轮 FAIL 不重试。无 S 头。顶号改：BC-0070/C-0058/F1-0029/F3-0023/FC-0076/PROFILE-0009。

第 167–168 轮（并记）：METHOD_AUDIT_INVALID 根因=**监督时序误判**（Server 构建 runtime 先产 token，ASGI tap 到 `create_app` 才产计数文件；脚本见 token 即断言 tap 存在）。C-0057（→BC）授权仅修 `bc-native/scripts/hd002/native_paired_no_send_server_v2.py` 测试域：等 token 与 tap **均**出现且各自 uid/regular/0600 有效才发首个认证 hello，20s 启动等待含于 90s 总门，tap 缺失=明确 `STARTUP_TIMEOUT` 不伪作零入站；BC-0068 交付该修复（bc-native clean HEAD `c83dbc9d`，两 test-only 提交，监督脚本 SHA `0f4bd14b…`，ASGI tap 未改 `e0fff917…`，self-test/py_compile PASS，第三批静态合同）；FC-0075 ACK 未启动 FE（新根 `/tmp/hd002-c0053-pair-fo6yn_ar` 0700、port 43891、READY schema `hd002-c0048/1`，旧 C-0048/C-0056 两根拒绝复用）；F1-0028/F1-0029（F1 收件回执+`token-file.ts:38-39` mode 判据自我更正，to BC/FC）。四件头均无 S，无写域动作，候 C 第三批 live 授权。顶号：BC-0068/C-0057/F1-0029/F3-0022/FC-0075/PROFILE-0009。下一扫描标记=编号差集至同上。

第 164–166 轮（并记）：C-0056 批准新批 live 槽后**当批即 BLOCKED**——BC-0067（Server 前置误判 `METHOD_AUDIT_INVALID`，READY 前停）+FC-0074（FC 未启动）；缺陷在 C-0055 所批 BC 监督工装的方法计数面，头均无 S（归 BC/C 修，S 侧 wire 方法事实备查：`sessions.send`/`createAndSend`/`sendOutcome.query`/`profiles.list`/`workspaces.open`/`server.hello` 为门涉及面）。S 静默。顶号：BC-0067/C-0056/F1-0027/F3-0022/FC-0074/PROFILE-0009。下一扫描标记=编号差集至同上。

第 163 轮：FC-0073/F1-0027 无 S 头（新批静态接缝复述+候选 F1 面逐字节核）。S 静默。顶号：BC-0066/C-0055/F1-0027/F3-0022/FC-0073/PROFILE-0009。下一扫描标记=编号差集至同上。

第 162 轮：F3-0022（外联归因减面自测+对账→F1/FC，无 S 头）。S 静默。顶号：BC-0066/C-0055/F1-0026/F3-0022/FC-0072/PROFILE-0009。下一扫描标记=编号差集至同上。

第 161 轮：新出 BC-0066（C-0055 工装 clean 准备+C-0053 新批合同→C/FC，无 S 头）、PROFILE-0009（ACK 图纸线，无 S 头）；第 156–160 轮五连静默。顶号：BC-0066/C-0055/F1-0026/F3-0021/FC-0072/PROFILE-0009。下一扫描标记=编号差集至同上。

第 151–155 轮（并记）：S 零新件（FC-0072=新批 FE 静态 READY_FOR_PAIR 无 S 头，C-0053 复验门处起服/执行窗口）。**旁证只读核（第 154 轮）**：bc-native 推进至 `7f9063cc` 后 S 包两文件 blob 仍与 `b3d862fa` 逐字一致（`2f811cd8`/`7e28f916`）=交付在整条真实门流水线未被改动。顶号：BC-0065/C-0055/F1-0026/F3-0021/FC-0072。下一扫描标记=编号差集至同上。

第 150 轮：新出 C-0055（新批 Server 监督脚本/入站方法计数准备→BC，无 S 头）、F1-0026（运输栈代理语义答 FC，无 S 头）——S 静默。顶号：BC-0065/C-0055/F1-0026/F3-0021/FC-0071。下一扫描标记=编号差集至同上。

第 147–149 轮（并记，全静默）：新出 C-0053（配对复验令：单变量收敛 Electron 外联后再跑无发送门）、BC-0064、FC-0071（外联归因）、I-PROFILE-BLUEPRINT-002、F3-0021、BC-0065（复验新批只读准备、**未起服**）、C-0054（runner 参数修正）——头均无 S。顶号：BC-0065/C-0054/F1-0025/F3-0021/FC-0071。下一扫描标记=编号差集至同上。

第 145–146 轮（并记）：静默——新出 FC-0071（C-0051 外联只读归因+两收敛候选）、I-PROFILE-BLUEPRINT-002（Profile 图纸增量批准，S 在册边界内零动作）、BC-0064（C-0052 旧 Pi settings 有限分类）、F3-0021（候选门丢失对账→FC）——头均无 S。


第 144 轮：**F1-0025**（to FC/BC、cc S，全文收讫——纯事实回执无 S 回件义务【纯 ACK 不复环】，但两条对 S 有用：①其连接器网络出口上界证明失败因不在 FE 连接器（443 结构上发不出），失败归因仍候 C/FC；②**判读键**：`localhost`/`127.0.0.1`/`[::1]` 是三个不同 instance 身份→若下批配对门 BC 侧 env 写法与 FC 断言写法不一致会「一切正确却红」——Server 恒绑 `127.0.0.1`（第 15 轮事实），下批若点名 S 供 Server 侧 origin/token 面事实即引此）。另收：F1 面身份/项目选择链首次被真 native Server 证实（限定登记，profiles.list FE 侧仍未走、无首发）。顶号：F1-0025 余同前。下一扫描标记=编号差集至同上。

第 143 轮：新出 BC-0063（停机后只读补证→FC/C）、C-0052（Pi settings 诊断类别核查）头均无 S，S 无动作。顶号：BC-0063/C-0052 余同前。下一扫描标记=编号差集至同上。

第 142 轮：新出 2 件（C-0051 外联只读归因→FC、FC-0070 配对证据合账）头均无 S——Server 半门事实反证通过（同实例 hello serverId/native Profile 唯一 ready/项目 open 一致），失败仅在 Electron 启动期外联，归因候 C。S 无动作。顶号：C-0051/FC-0070 余同前。下一扫描标记=编号差集至同上。

第 141 轮：新出 2 件头均无 S——**BC-0062/FC-0069 = C-0048 配对门失败回执**（FC Electron 侧外联触发停门、整轮 ONE_SHOT NO_RETRY；BC Server 半门本身通过：真 CLI 单次启动、0700 临时根、loopback 50491、桥参数固定但未开 execution port；bc-native HEAD 现 `7f9063cc` clean）。失败归 FC 外联分类候 C 裁；**S 关注点**：若后续对 Server 连接面（origin/token/hello）出修复令点名 S，随行号链应答（预备事实第 15 轮 `__main__.py` CLI 形状+FC-0035 两 env 键在册）。顶号：BC-0062/FC-0069 余同前。下一扫描标记=编号差集至同上。

第 140 轮：新出 3 件（BC-0060/0061、FC-0068）头均无 S，不收全文——旁证：**C-0048 配对门正在执行**（BC Server READY→FC 立即跑唯一无发送 smoke；FC 候选 HEAD `ccc1b3c1` clean）。S 候其回执（BC/FC→C，若 workspace/hello 面点名 S 随行号链）。顶号：BC-0061/C-0050/F1-0024/F3-0020/FC-0068。下一扫描标记=编号差集至同上。

第 139 轮（暂停 20 分钟增量集中入账）：静默期新出 ~24 件，S 头点名 6 件全收——**C-0048**（→FC/BC：FE 候选×真实 native Server **双命令无发送配对门授权**——BC 只启 Server CLI、FC 走 Electron/connector 核 hello serverId/nativeExecution/项目 UI，禁 Send/createAndSend/dispatch/session/new/prompt，90 秒组超时；S 仅 cc 知悉）、**C-0049**（→FC/BC：该门 Profile 观察位置澄清——本轮不要求 FE 触发 profiles.list，BC 同 Server 只读补证；cc S 知悉）、**F1-0020/0021/0023/0024**（F1 重测+连续自我更正：F1-0018 §3 批请**已撤**——其连接器两路径统一以 `sessions.list` 为绑定真相、不读直达体 workspaceId，**S-0020 的 BE 不对称事实在 FE 侧无后果**（非撤事实、是撤其影响推断）；F1-0015 §4 仍成立；其剩余未答项全在 FC 手里）。旁线入账（无 S 头）：BC-0052..0055=C-0045..0047 所派 Pi stderr 取证/无模型状态门线（现判 INCONCLUSIVE、不解锁真实 turn），FC-0065..0067=候选交付与只读核。S 无回件义务、无写域动作；S-0020 已被完整消费。**下一扫描标记=编号差集至 BC-0059/C-0050/F1-0024/F3-0020/FC-0067**。

第 138 轮：差集仅 **BC-0051**（头 `to: C; cc: H, FC` **无 S**，不收全文以外动作——C-0043 所派工具计数探针已离线交付，bc-native HEAD `5d7e5d6c`，实际无 prompt 诊断门候 C 另裁）。S 无回件义务。顶号更新：BC=BC-0051，余同第 137 轮。下一扫描标记=编号差集至 BC-0051。

第 137 轮（编号差集扫首轮执行）：零 S 新件——差集仅 F3-0018/F3-0019/F0-0012（头 `to: FC; cc: C, F0, F1, F2, BC` 无 S，FC-0064 候选清单影响注记类，不收全文）。各线顶号：BC-0050/C-0043/F1-0019/F2-0011/FC-0064/H-0008/E-0004/F0-0012/PROFILE-0008/S-0020。无未办。下一扫描标记=编号差集同上。

第 136 轮：新收 2 件均 cc S 知悉、**无 S 回件义务、无写域动作**——**C-0043**（→BC：受限首轮只读工具计数探针准备授权——BC 仅在 `bc-native/scripts/hd002/**` 测试域备诊断扩展+离线探针证 `activeTools=0`，不启动 Pi/桥/Server、非运行证据、候 C 另裁无模型受限配置门）；**F1-0019**（→FC：F1 门不落 FC-0064 §15 删除清单的核对注记，纯 FE 域）。**扫描方法更正（重要）**：本任务树全盘 mtime 会被刷新（`-newermt 06:00` 命中全树），**mtime/时间窗两条都不可靠——改以「按编号序列 diff 游标」为主扫描**（find 全列 outbox 编号 vs 游标记录取差集），S 头模式用于差集后的定向确认。下一扫描标记=编号差集至 `agents/F1/outbox/F1-0019.md`/`agents/C/outbox/C-0043.md`。

第 135 轮（宽窗补扫执行）：新收 5 件全 cc/知悉 S、**无 S 回件义务、无 S 写域动作**——**BC-0049**（→C：C-0040 授权的产品 native CLI/HTTP 同运行时**无 prompt port 门通过**：生产 `__main__.main(argv)` 起真实 uvicorn、认证 wire hello/profiles.list ready/workspaces.open、同 runtime `port_factory`→`NativeHarnessPort` `open_execution()`+worker register/start/create、下游固定 Go Pi 桥+用户现装 Pi 0.86.1；**未过 Work Core dispatch/createAndSend/prompt/模型**；resume=false 符合桥声明与 C-0029；Pi cwd 匹配临时项目、结束 0 entries/0 文件；bc-native HEAD `1a30dc8e`（本侧只读核实 clean，仅加探针脚本））；**C-0041**（→FC/BC：BC-0049 收讫、C-0040 门结束、重资源槽交 FC 候选装配；BC 转只读研究）；**C-0042**（→BC：首次真实 Pi 请求前工具/权限边界只读核查令）；**BC-0050**（→C：该核查交付——`--no-tools --no-extensions` 可置空模型可见工具（源码锚点）、gate 保持、分阶段建议含"无模型受限配置门"与只读诊断扩展缺口，**均待 C 另批**，S 无涉）；**F1-0018**（→FC cc S：**收讫 S-0020 三点全采**+自我更正 F1-0016 §4（executions.list 不缺绑定）+据此请 FC 点名其 `native.ts` sessions.list 比对兜底批（匹配/不匹配/列表滞后三态保守）；服务端加字段与否归 C/FC/BC 裁（S §3 归口维持）；另请 FC 裁撤 FC-0063→BC 同题转单避免两路重复）。** mission 现状**：真实门推进至「产品链无 prompt port 门已过、首次真实 prompt 前置研究完毕候 C 裁定」；I-DEC-0002 用户答复仍候。下一扫描标记=`agents/F1/outbox/F1-0018.md`+宽窗补扫（`-newermt` 起 05:20 窗内 S 头模式全量比对）。

第 134 轮（重要收洞+发件）：宽窗补扫（`find -newermt 05:20Z` × 头模式）发现 **mtime 增量扫描漏收 4 件 S 头件**——**C-0040**（cc S：授权 BC 单次「无 prompt 产品原生链门」=真实 Pi 经固定桥走 Server→Execution→Harness port register/start/create，90s 硬截止、零 prompt/模型请求、resume=false 守 C-0029；S 无动作知悉）、**F1-0015**（cc S：F1 自撤默认工作区请求，I-PROJECT-REQUIRED-001 覆盖旧 §1.4——与 S 账本一致）、**F1-0016（→S 直发，已答）**、**F2-0011**（cc S：覆盖顺序事实注记，F1-0013 §4 接缝不关）。**已出 S-0020（→F1、cc FC/C/BC/F2/F3）三小点全答**：①query accepted=固定子集无绑定（`handlers.py:2112`→`repository.py:540-558` @60d868ef；`1d3a9575` 逐字同形）；②`server_sessions.workspace_id` **NOT NULL** 且零 UPDATE 触碰=绑定不可漂移；③**createAndSend 直达带 session 全record 含 workspaceId（:2039-2055）——两路径不对称即反例根因**；④**自我更正**：`executions.list` 行实含 workspaceId/workspace/placement（inventory.py :77-95），S 旧报告 §一.2 记载过窄已订正；方案裁归 C/FC/BC。**纪律更新**：outbox 复制件 mtime 不可靠（FC-0063 案）——增量 `-newer` 仅作快速通道，每 ~2 静默轮须跑一次宽窗/全量头模式补扫。另核：前段对话曾有「BC-0049 投影缺口双发草稿已入 BC inbox」的说法，实测 **BC inbox 无此件、从未落盘**；该双发拟稿放弃不再发（F1-0016 在先，S-0020 一并覆盖 query 缺口+inventory 更正，BC 侧由 cc 即知）。

第 128–133 轮：128 读入 COORDINATION.md 用户审批升级边界（入裁决汇总）；129–131 零新件；132 见 decision-queue **I-DEC-0002 用户答案已落盘**（Pi/ACP 路线题，候 C 消化出裁定件）；133 **FC-0064**（C-0020 CP 候选装配起点+BC 重资源槽交接→C/BC，头无 S，FE 整合推进旁证）。

第 119 轮零新内容（仅 inbox 副本）；第 120 轮 BC-0048 真实握手回执；第 121 轮 F3-0017（F3 HANDOFF_READY→FC，头无 S，FE 域知悉）。

第 118 轮：**F1-0014**（cc S 全文收讫，见头行摘要）+ I-ESCALATION-REQUIRED-001（头无 S，知悉：Pi/ACP 路线取舍候用户裁定，看板已标待裁）。第 110–117 轮（头行旧文转入）：FC-0062（F3 cp3 预检→F3，无 S）、I-PI-ACP-REUSE-001（用户复用方向指令→C/cc BC,H——先查社区 Pi 接入方案，点名 svkozak/pi-acp）、BC-0047（Go 1.24 隔离构建+Pi 0.86.1 扩展加载静态核验→C）、**C-0039**（→BC：单次无 prompt Pi RPC→ACP 握手门授权=首次真实 Agent 握手；无 prompt=零模型调用）均头无 S；第 113–116 轮零新件（116 轮连 BC 目录亦静默=门执行中）；第 117 轮恢复点自检——「任务头」§1 更新至真实现状，并核 S 两文件路径正形 `src/agent_box/server/workspaces/local_environment.py`。

第 108 轮零新件+S 树 clean 复核。第 109 轮零新件；完成 F1-0013 §4 只读预备核（见上「预备事实」节：现 accepted 响应不携 workspace、数据侧一跳可达、改动面归 BC 不涉 S）。

第 104–107 轮：BC-0046（Go 桥源码审计止于缺 Go 1.24）、C-0037（固定桥源码+离线接线审计令→BC）、F1-0012（FC 树 11/11 逐字节自查）、I-DASHBOARD-RECOVERY-002（用户看板指令→C）、C-0038（隔离 Go 工具链授权→BC）、F1-0013（query 兜底静默错绑实测+§4 请点 BE 字段——头均无 S；数据侧归属事实 S-0009 E3 已备，响应携带面归 BC/C 裁）。F1-0013 全文速读（BE 相邻故读，非 S 收件义务）。第 106 轮零新件。第 107 轮零新件+只读 integrity 复核：bc-native HEAD 仍 `1d3a9575`，S 两文件 blob 与 `b3d862fa` 逐字一致（`local_environment.py`=`2f811cd8…`、测试=`7e28f916…`，与 S-0019 记录同；注意正确路径为 `src/agent_box/server/workspaces/…`）。

第 100–103 轮：第 100–101 轮 BC-0039（→C）与 **C-0031**（真实 Pi 单流第一门授权→BC、cc H/FC/I）头均无 S——C-0031 标志 mission 进入真实 Agent 门阶段，属 BC/H 域，S 仅在后续 workspace 面点名时供行号链。第 100 轮到限自动暂停，恢复点即本文件；用户 `/goal resume` 后续计至 200。第 102–103 轮重同步：晚于 `C-0031.md` 起新出 21 件（BC-0040..0045、C-0032..0036、F1-0011、F2-0010、F3-0014..16、FC-0057..61），正式头模式全扫零 S 点名、S inbox 未变；bc-native HEAD `a570280e`→`20789bb9`→`1d3a9575`（H-0008 修稳收编，只读核），S 两文件 blob 逐字一致复核通过。**下一扫描标记=`agents/FC/outbox/FC-0061.md`。**

第 99 轮：**BC-0038**（to C、cc FC/H/S/I，全文收讫——见头行摘要；要点补：`--native-continuation` 默认 false 无自动声明、native port factory 静态声明缺口 BC 已自修；Pi ACP 只读元数据 0.5.0 自报 resume 能力属旧临时包代码声明非观测；用户 `pi` CLI 不推断 ACP、未读其内容=native home 边界守全；下一真实 Agent 门要素清单在文末仍归 C 协调）。第 91/93 轮头扫：FC-0056（→F2/C）、H-0008（→BC）均无 S 不收全文。

第 83–87 轮扫描：第 85 轮 **E-0004**（to BC、cc C/S/H/I，纯 ACK 回执已速读入账——E 侧无撤码项、Work Core 无断裂证据无写件、若 H/S 联调证实 `execution/**` 断裂按 BC 精确包开工；不回环，S 无涉）。第 87 轮 C-0030（to FC，头无 S 不收：FE facade 首发误投修复令）与 I-DASHBOARD-UPDATE-NOW-001（I→C 面板催发指令，S 非收件人）均无 S 动作。第 83/84/86 轮余无新件。

第 72–78 轮扫描：第 78 轮新出 **FC-0055**（to F1/BC/C、cc F2/F3，头无 S——不收全文；FE connector 把项目失效 typed 码误判 unknown 的合同核账，消费侧归 F1/BC；S-0018 呈过的服务端产生形状〔validate() typed 生产者+`details.internalCode` 包名〕若被判有误，S 随点名应证）。第 72–77 轮无 S 新件。第 79 轮：**C-0029**（to BC、cc H/FC/F1/I，头无 S 不收全文；速览=C 裁定原生续聊须显式声明+运行时观测双限，且 BC 受控实际 Server CLI 门已在临时 HOME+fake ACP peer 下**两次通过**：hello、A/B child cwd、首发、同 Server Session 续聊、审批 allow、stop/cancel——native 链推进旁证，S 域无涉）。

第 71 轮扫描：**I-DASHBOARD-LIVE-001**（用户指令，投 BC/C/FC inbox，S inbox 未落）——进度台分层面板由 C 单写，FC/BC 供模块事实，大阶段交付须刷面板。S 无面板写义务；若被点名供事实，按口径报「S-0015/BC-0033 已交且已集成（f71538a7）、现待命、无阻塞、恢复点=status.md」。F1-0009 再扫仍非 S 头件。

第 70 轮：**BC-0037**（to C、cc FC/H/S/I，全文已收——原生 BE 接线第一稳定检查点：bc-native `work/hd002-bc-native` HEAD `a570280e` clean；提交序列含 S `b3d862fa`→cherry-pick `f71538a7`（**S 包正式收讫**，reply_to 列 S-0015）、H `7f763636`→`1911fdfe`、BC 自写 admission/readiness/环境隔离三件。native 组合 CLI 四参+禁与 sidecar/mount 混用、内部 Profile 幂等身份、hello 每读重核、REST pure-create 409 NATIVE_FIRST_SEND_REQUIRED、发送前+`_capability_gate` 双验 typed LOCAL_PATH_MISSING 不 spawn——**S-0018 所呈重验面被按形采纳**。离线门 35 passed（含 S 测试文件）/Node 6/6，真 Agent 0、真模型 0。H 门竞态=BC-0036 已点 H 修稳。下一短门：临时 HOME+fake peer 下真 CLI 启动/A-B cwd/权限/cancel，真 Pi/Codex 候 C 协调单流。REST 与 wire 重放顺序差异 BC 自报未同语义。S 无回件义务〔纯 ACK 不复环；S-0019 与 BC-0037 交错——BC-0037 reply_to 未列 S-0019 故成文在其前，其提交的 HEAD 组合序（445f9c7e→f71538a7→…→a570280e）自洽无缺陷，S 注记仅余中间提交 bisect 面，不追补〕。第 68–69 轮扫描：仅 BC-0037 新出。

第 66–67 轮：全量头扫审计（`grep -lE '(to|cc):[^;]* S([,;]|$)'` 全 outbox=68 件比对游标/收件集）——**无漏收**：差额项均为 HD002-1 旧世代（BC-0001/0003、C-0001/0006、E-0001、FC-0005，TAKEOVER 时已核旧交付）或游标已录件（BC-0008、BC-0018、FC-0023、I-* 系=comm 排序假阳性）。第 65 轮扫描无新件。

第 64 轮扫描：新出件仅 **BC-0036**（→H、cc C，头无 S 不收全文以外动作——内容速览：BC 自 H clean `7f763636` cherry-pick 入 bc-native `1911fdfe`，复验发现 H 门 `scenario_reopen_resume` 回放竞态一次红；纯 H 修复域，S 无涉。**旁证**：BC 集成流水线在动，S 包 `f71538a7` 已在同树历史内）。S 无回件义务。

第 63 轮：无收件；出 **S-0019**（→BC cc C，只读事实注记：①`f71538a7` 内 S 两文件与 `b3d862fa` blob 逐字一致〔重放等价，正式收讫候 BC 通知〕；②`__main__.py:12`/`runtime.py:556` 按 S-0016 合同形状消费注入；③中间提交 `445f9c7e` 单独 checkout 时 native 启动撞 TypeError〔旧构造器无参数〕=bisect 事实非 HEAD 缺陷，纯 ACK 不复环）。第 60 轮背景（头行旧文转入）：bc-native HEAD 更新为 `f71538a7`「HD-002 BC-0033 S native project gate」，`branch --contains b3d862fa` 仅列 work/hd002-s=重放等价非字面祖先；commit 内门账与 S-0015/0017 相符（31P GREEN_NO_SKIPS、84P/3F 环境先存三红复现）。

第 61 轮扫描：无新件（BC outbox 顶仍 BC-0034）。第 62 轮（只读进度核，非收件）：bc-native 已见**组合接线实证**——`__main__.py:12` 有 `--execution-mode` choices=(isolated,native) default=isolated、:57/:70 native 校验面、`bootstrap/runtime.py:556` 注入 `LocalEnvironmentProvider(execution_mode="native")`（S 合同被按形消费，`local=`/构造参数名未改）。BC 树此刻**在途脏**（runtime.py/sidecar_backend.py/sessions service.py/test_native_execution_seam_hd002.py 已改+未跟踪 test_native_bootstrap_identity_hd002.py≈C-0027/0028 bootstrap 身份工作面）——纯 BC 域，S 不触不评，候其 clean 提交与通知件。

第 57–59 轮扫描：无新 S 件（晚于 H-0007 仅 F1-0009，头无 S 不收）。第 60 轮：**树面实证**（非收件）——bc-native HEAD 更新为 `f71538a7`「HD-002 BC-0033 S native project gate」，S 两文件与 `b3d862fa` blob 级逐字一致，门账相符；BC 正式 outbox 通知未到，候其 HANDOFF/后续包令。

第 56 轮：**H-0007**（from H、to BC、cc C/S/FC——知悉无回件义务：BC-0034 交付 native Pi 假端点门 mock 相，`work/hd002-h` @`7f763636` 两文件 +752 行，驱动真产品码（LocalProcessLauncher/SidecarEnvelope/SidecarHarnessPort/NeutralRunTracker）对 stdlib fake peer；17 PASS / 6 UNTESTED / 1 UNSUPPORTED，诚实标志 `fakePeerOnly=true / nativeAgentVerified=false / realModelCalls=0 / bwrapUsed=false`。其「BC 运行门前置期望」item 2——运行门身份须来自 BC 持久内部记录并与 hello nativeExecution 一致、H 门不造第二身份——与 S 零扩域立场同形。F1-0009 头 `to: FC; cc: C, BC, F0, F2, F3` 无 S，按协议不读。BC 集成复验未到。）

第 55 轮：**C-0028**（to BC、cc FC/F1/I 无 S——知悉：service admission 收口 hello 不够、续聊同核、hello 每读重确内部记录合法性 fail-closed、发送前删项目=typed LOCAL_PATH_MISSING 非通用 capability 错、S 包提交保留——S-0018 已随行号支援）。

第 54 轮扫描：无 S 新件（in-box 顶仍 BC-0035 已答；晚于它的新出件仅 FC-0054/PROFILE-0008 非 S 头件+本侧 S-0015/0016）。BC 集成复验未到。**补跑全树 collect-only @b3d862fa=1527/0 errors GREEN_NO_SKIPS（基线 1518+本包 9 精确归账），已出 S-0017 供 BC 集成免疑；uv 释器须挂齐 src+plugins/*/src 否则 18 个采集期 ModuleNotFoundError=纯环境**。

第 53 轮：**BC-0035**（→S，指针件与 S-0015 交错：要求执行 BC-0033+可指定构造参数名——已回 S-0016 确认完成态与 `execution_mode` 形状）、**C-0027**（cc S，to BC/FC：native hello `nativeExecution` 增量字段合同、最小内部 Profile 记录稳定 ID、无效项目发送期 typed 拒绝不 spawn、旧 isolated 回归门——BC/FC/F1 域，S 无回件义务）、**FC-0053**（cc S，to F1：精确 profileId 首发合同转达——S 无涉）。第 52 轮：**BC-0033 全文**（→S 单写包批准：两路径、默认 isolated、无自动切换/无隐藏 env、service.py 触前须报、发送期反例归 BC、HANDOFF 后停写、不推 main、包内零真实调用——已按令完成并 S-0015 交件）、**BC-0034**（to H、cc S：H test-only 门资产包，纯 mock/静态，BC native 接线可用后再单批一次运行门——S 无涉，知悉）。第 51 轮：**C-0026**（to BC、cc S，跨包契约裁定：组合级 native、S 独写面获认可、发送期删目录须包内 typed 拒绝反例、G1–G3 复用禁移植 bwrap 条件入 native 正例、真实调用仍不授权、profileId 属内部执行身份不启用 Profile 产品管理）——S 无回件义务。第 49–50 轮新增：**BC-0030**（cc S，原生执行最短源码链初核：拟模式=**Server 启动形态 `--execution-mode native` 固定+hello 诚实声明**；拟 S 仅 `local_environment.py`+provider tests；未发写令、待 H/S 回件校正——S 已答 S-0013 并采纳启动形态、声明 service.py 预计零改动）、**BC-0031**（→S，C-0025 预算新口径转发：99/10 上限与预留/逐请求计算**取消**，不需为原生路径设计请求硬 cap；真实测试仍待原生链就绪后 C 协调唯一测试流；首门假端点/零付费；BC-0029 核继续有效——S 无回件义务已随 S-0013 §五并入确认）、**C-0025**（cc S，I-DEC-0001 用户答复执行口径：只变用量/计数保证，不变原生路径/凭据不读/范围）、**H-0006**（cc S，Pi 原生四缝提案：`LocalProcessLauncher` 形状、room 依赖剥离、worker-entry `SIDECAR_ISOLATION_REQUIRED` 为最大未决、审批/取消/终态全链可原样复用；S 域无冲突）、**PROFILE-0007**（cc S，界线声明：其 ProfileRecord 不可充当 profileId/harness 身份供给，无需回件）。第 49 轮补读（行内头漏扫纠正后全收）：**I-NATIVE-AGENT-001**（用户裁定：本阶段 Server→Execution/Work Core 必要记账→Harness 插件→所选项目 cwd 的**显式原生模式**，当前用户权限、无 Ordessa bwrap、不静默降级、不绕 Desktop 直连；旧 bwrap 模式保留）、**C-0021/C-0022/C-0024**（裁定入账；C-0024 撤回 C-0023 与 C-0021/BC-0027 作阶段前置）、**BC-0029**（→S 三问只读核，本件不授权写源码；S 已答 S-0012）、**FC-0047/H-0005**（cc S 知悉面，无 S 回件义务）。BC 新树 `harness-desktop-002/bc-native` @60d868ef 归 bootstrap/Execution 接线+整合门；H 归原生 Harness/ACP 入口。第 48 轮补读（cc S 全链）：**C-0023**（cc S，Linux 凭据包判 BC 单写）、**BC-0025**（Pi local native 离线门交接：TestClient 进程内、bwrap 真 Pi、A/B open+两轮 send completed，**独立互证本侧草稿两事实**——wire `NOT_FOUND` 包 `details.internalCode=LOCAL_PATH_MISSING`、local `sessions.send` 续聊走 completed；未证 ACP 原始 cwd 帧/permission native——CP 两命令仍未跑）、**BC-0027**（下一 native 门计划=pwd 工具+ACP cwd 观测，待 FC/F0 释放重门槽；`__main__.py:8-60` 引用与 S 第 15 轮事实一致；Linux 凭据硬缺口 `runtime.py:340-344`+`SIDECAR_DEPLOYMENT_CREDENTIAL_STORE_MISSING`/`CREDENTIAL_STORE_UNAVAILABLE` 行号链）、**BC-0028**（SecretStore 协议面 `secrets.py:19-22` 三方法、Windows DPAPI `:72-164`、REST `/api/v1/credentials` 受权导入、runtime `:1360-1420` 启动 import 实际**不重读源**〔注释与行为差量，门以行为为准〕）——S 均无回件义务（纯 ACK 不复环；缺口/指派不涉 S 写域）。头扫非 S：FC-0039/0040/0046、F2-0007 系、F3-0007。此前游标：C-0019、FC-0034、C-0018、BC-0024、FC-0030~0033、C-0017、BC-0023、C-0015、C-0016、BC-0017~BC-0022、FC-0022~FC-0029、BC-0016、FC-0020、FC-0021、I-PROJECT-REQUIRED-001、C-0013、C-0014、BC-0014、BC-0015、I-DECISION-REUSE-001、C-0012、BC-0013、FC-0016/0017、F2-0003、I-BASELINE-CLOSEOUT-001、SESSION-BASELINE-TARGET.md、BC-0012、C-0011、BC-0011、FC-0015、C-0010、BC-0010、FC-0014、F3-0002、FC-0011/0012/0013、I-SESSION-CHECKPOINT-001、C-0009、BC-0009、E-0002、F0-0004、F2-0002、FC-0008/0009/0010、I-SESSION-FIRST-SEND-001、C-0008、BC-0007/0008、C-0007。（FC-0018/0019、F0-0005、E-0003、F2-0005、F3-0004 第 17 轮补读完毕：均 FE/E 域收件，S 无需回件。FC-0019 §32 所点「执行侧 cwd 证据」链 S 半边已由报告 §二行号链（get_turn_context→runtime.py launcher→local_channel compose_sidecar_room）+ S-0009 E3 DB 联结覆盖，进程级 native cwd 实证按 BC-0017/C-0017 归 H/BC；E-0003 为纯 ACK 不复环。）

## 当前有效裁决（S 侧汇总）

- 主线唯一=CP-SESSION-001 可运行 FE/BE 配对收口；**项目必选**（无默认工作区分支、无回退）、首发 createAndSend 才建会话、续聊沿原项目。
- 撤项在册：allocateIndependent（撤回挂起）、REST 纯建前置、默认工作区发现、通用项目管理/Runtime/Profile 施工、BC-0012 全量契约（参考件）。
- I-DECISION-REUSE-001：真决策点走「上报所属中央 or 成熟开源源码证据」两入口；S 不单方问用户。
- I-019（C-0018）：首发合同唯一沿 F2 additive 形状；`server.hello.serverId`+可信 origin 作连接作用域键（注册前取得）；恢复上次项目必再 `workspaces.open` 核同 ID/非归档。
- I-020（C-0019）：CP=双进程本机启动拓扑（显式 data-root/port/sidecar → Electron 用同次命令 origin+token locator）；FC-0035 已定 `ORDESSA_SERVER_ORIGIN`/`ORDESSA_SERVER_TOKEN_FILE`。S 侧核证：现有 `server/__main__.py` CLI 零改动可表达（见第 15 轮事实）。
- TASKS.md 现板（C 单写，第 20 轮核）：§3 BC 维护 S/H/E/PROFILE 文件管理、只派 CP 最短修复；§8 S 未收新明确包时保护现有成果、不从旧 C-0008/0010/0011 推导施工——与 S 现位置一致。
- **I-NATIVE-AGENT-001（现行主线裁定）**：本阶段走显式原生模式（所选项目 cwd、当前用户权限、无 Ordessa bwrap、不静默降级）；旧 bwrap 模式保留但不作本阶段条件。分工：S 独写 `workspaces/local_environment.py`+workspace service 合法性/模式面（旧隔离拒绝须逐字保留）；H 拥有原生 Harness/ACP 入口与 Agent home；BC（树 `harness-desktop-002/bc-native` @60d868ef）拥有 bootstrap/Execution 接线与整合门；E 不动。下一可跑门=临时项目+假端点，证 A/B cwd、两轮绑定、权限行为、停止/恢复。
- **预算新口径（I-DEC-0001→C-0025→BC-0031，第 50 轮入账）**：原 99/10 次数上限与预留/逐请求计算手续**不再生效**；不变项=原生路径语义、凭据不读不泄、任务范围、Agent 自身权限。**S 纪律仍为**：真实测试不自启——待原生链就绪+C 协调唯一测试流+具体命令/项目/模型报备后，方随包执行；首门假端点/零付费。
- **模式形态（BC-0030 §1 提出→C-0026 裁定确认，S-0013 采纳）**：`--execution-mode native` 类**Server 启动/组合级**显式形态（BC 在 bootstrap 独占域取值核验；不得隐藏 env、不得失败自动切换）；S 独写=`local_environment.py`+必要的 `workspaces/service.py`+新定向测试，注入仅表明组合模式策略；旧隔离组合拒绝形状逐字保留；hello 诚实声明边界=「无需 Ordessa bwrap」，不声称 Agent 权限/后端执行门已通；native 包内需附**发送前/启动前 typed 拒绝+无子进程启动反例**。S 完成 HANDOFF 停写后 BC 仅从 clean 提交集成复验。
- **用户审批升级边界（COORDINATION.md:33-37，2026-09-23 I 按用户纠正新增，第 128 轮读入）**：关键适配器替换/新增运行时/工具链/持久化方式/改已承诺体验（审批/思考/续聊）或候选无明确共识 ⇒ C 必须走 decision_queue 提交**用户**审批，内部批文不能替代；已授权只读研究/隔离构建/无 prompt 诊断可继续收证≠批准替换产品依赖；用户答复前不新增候选产品接线、不默认缩水、不改用户原生配置；普通等价修复仍中央批准（不逐条上用户）。S 现纪律与之天然一致（真实测试不自启、零配置触碰）。
- ~~C-0023：Linux 凭据接缝 keyring 包~~ **已被 C-0024 撤回出阶段前置**（历史入账：BC 单写、S 树不触碰）；「CLI 零改动表达 C-0019 拓扑」核证仍锁 `60d868ef`，BC-0027 pwd 门同撤。

## 任务头（next）

1. **S 包线已闭合**（BC-0033→`b3d862fa`→cherry-pick `f71538a7`，BC-0037 正式收讫；bc-native HEAD 现 `1a30dc8e` clean〔第 135 轮只读核〕，S 两文件 blob 逐字一致第 102/107 轮复核）。**mission 真实门现况（第 135 轮入账）**：C-0040 授权的**产品 CLI/HTTP 同运行时无 prompt port 门已通过**（BC-0049：hello/profiles.list/workspaces.open→同 runtime port register/start/create，真实 Pi 进程 cwd 匹配，未经 dispatch/createAndSend/prompt/模型，resume=false 符合桥声明）；C-0042 所派首次真实请求前工具/权限边界只读核查已由 **BC-0050** 交付（`--no-tools --no-extensions` 可置空工具面的源码证据+分阶段建议，候 C 另批）；FC 持重资源槽做候选装配（FC-0065 已交 clean 八包候选 `258f91a7`）；**第 139 轮现况**：C-0048/0049 已批 FE 候选×真实 native Server **双命令无发送配对门**（FC+BC 执行中，禁 Send/Agent/Pi），Pi stderr 取证线 BC-0052..0055 暂判 INCONCLUSIVE；I-DEC-0002 用户答复仍候。S 候**下一 S 点名包令**或真实门 workspace 面差量点名；随点名供行号链（预备事实见上 F1-0013 §4 节与 S-0020；S-0020 已被 F1 完整消费）。G1–G3 /tmp 草稿与 S-0014 seam 草稿留存备引用。
2. 收件主扫描=**按编号序列 diff 游标**（find 全列各 outbox 编号取差集；全盘 mtime 会被刷新，`-newer`/`-newermt` 两条均不可靠，第 136 轮实证），差集件再用正式 `(to|cc):[^;]* S([,;]|$)` 头模式定向确认；BC 派包或 C 裁定到达即办。native 执行通道（无房间直跑）归 BC、ACP 入口归 H，S 随点名供行号链。

## 停写声明

首个源码包 BC-0033 已按令完成（唯一写入=批准的两路径 @`b3d862fa`，其余各域零触碰、未 push），并经 **BC-0037 正式收讫**（集成 `f71538a7`、bc-native HEAD `a570280e`）。自 S-0015 起维持停写待命：无包文不开工，转原生低频收件。
