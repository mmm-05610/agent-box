# Work Order 37 — Windows Server → HTTP → WSL Codex

**派工日期：**2026-09-13。**当前授权：**实施本轮，不接 Desktop，不整体恢复旧 Studio。
**基线：**`agent-box@80d2017e9a708421556914cd99d843573daf4c68`。
**蓝图：**[v2](../../agentbox-server-architecture-proposal.md)，§10 是最新裁决。
**调度：**[master-plan](../master-plan.md) / [status](../status.md) / [manifest](../manifest.json)。

## 1. 目标与真实现状

用户能在 Windows 起一个独立 AgentBox Server，用终端 HTTP 建会话、发送消息、看流式输出、
再发第二句；执行发生在 WSL/bwrap/Codex，Profile/Session/续接权威留在 Windows 本机。
重启服务、清空本次已回收的远端临时投影后，可以继续同一原生 Codex 会话。
不是另做一个 CLI 聊天产品；终端只是产品 HTTP API 的客户端。

现状来自前轮 scoped 审查，不是本轮重跑：Core 有 Work/Execution/Ref、派发幂等、
finalization/repository 和插件 catalog；DB 全局连接需窄改；runtime composition 有内存
attempt handles；基线无 WSL Worker/Session Server。旧 Rust Worker 在 Tauri 仓内，
仍 import codeg_lib/host_bridge。旧 native profile 报告已区分 revision/generation。
不把旧报告测试计数当新基线，不把旧 Studio 的状态文件当新链已通。

```text
before: 80d2017
├── work_core/                    保留：执行治理与资源合同
├── extensions/                   保留：插件组合
├── plugins/                      审后复用：native/bwrap/local 等
└── Windows 独立产品服务/Worker   缺口；不能用旧 Web plugin 顶替

after: 独立 backend worktree
├── src/agent_box/
│   ├── work_core/                窄改事务生命周期；不重做执行状态机
│   ├── storage/                  单库事务、不可变对象、SecretStore 接缝
│   └── server/
│       ├── composition/          显式插件启用、注入
│       ├── transport/            HTTP/OpenAPI/SSE/鉴权
│       ├── application/          Workspace/Profile/Session/Turn/恢复
│       ├── domain/ports/         小合同；不重复已有 SPI
│       └── persistence/          产品表仓储
├── plugins/…harnesses/            native 配置、状态分类、Codex resume
├── plugins/…runtime-wsl/          WSL 连接/引导/资源传输
├── workers/                      提取独立 Worker，不带 Tauri 产品
├── protocols/worker/             沿用可审合同，补正反 golden
├── tests/                        原 Core + 新服务/恢复/平台门
└── docs/server-round1/            领单快照、阶段报告、可复制验收步骤
```

## 2. 工作树、范围与保护

在 `/home/maoqh/projects/agent-box` 只读检查后用 git worktree 从精确 commit 建
`../agent-box-server-round1`，分支 `feature/server-http-codex-r1`。不从脏 HEAD 继承，
不改原工作树，不把 `.zcode/` 或未跟踪文档带入。目标已存在先核对，不覆盖。
允许路径见 manifest；原 Core/schema 的变更仅限事务注入、必要索引/持久化接缝，保持
已有领域合同、插件独立性和 Core 零第三方依赖。新增 HTTP 依赖放 Server extra。
允许在受限范围内调整拆文件和复用库；扩大 Core 领域/协议语义必须停止说明。

旧仓只读：`agent-box-studio-codex-vertical`（continuation/native policy/传输参考）、
`agent-box-studio-ui-reconstruction`（Rust Worker）。可定向提取有来源的代码，逐文件
记录源 commit 或 dirty 文件 digest、许可证和依赖；不整个 cherry-pick/import Studio/Tauri。
不读取/复制/暂存 Desktop 的 `src/agentbox/`、`src/plugins/agentbox-lab/` 及其他未跟踪产物。
不接现有 9127 网关、不改变用户 ~/.codex、~/.hermes、既有 Session/数据库/项目源码。

本轮新增 Windows staging/data root 须先确认不存在，记录绝对路径和所有者 marker；
只清自己创建且确认可回收的临时产物，不删主目录/项目/共享缓存、不 cargo clean。
不在 UNC/WSL 挂载路径做 Windows 大构建。36 前端可并行；Windows 重构建和真实演练串行。

## 3. 不变量与首轮产品边界

- Server 负责核心数据和连接；Desktop 完全不在本轮链路里。HTTP 调用不能绕 Core 直 spawn。
- 一个 Workspace 独享逻辑 Connection；远端目录是源码，元数据本机。首轮只 WSL。
- Profile 是独立角色，harness 类型是配置，不是顶层 Server 用例分支。
- config revision、角色 native generation、Session checkpoint 分开；会话覆盖不改配置。
- 同角色/同会话活动 Turn 冲突 typed 拒绝；角色记忆按插件类别自动回传累积，不跨会话
  合并 transcript。首轮无并发自动合并；冲突/分类不明保留恢复证据并拒绝继续。
- 原生记忆的理解/召回算法归 Harness；未支持记忆不能假装支持。不得把全部 native home
  持久化到普通 blob，credential 和未知文件的分类必须在读内容/算 digest 前执行。
- Windows 一库、Core/产品仓储分权、短事务；不许插件另维护第二个当前版本指针。
- 结果先回传校验/发布本机再 ack 清理；执行完成、捕获完成、清理完成是不同事实。
- 断开 HTTP/SSE 不取消执行；Server 明确停机才取消/收回资源。断线/确认丢失是未知，
  不伪造失败/成功，也不无条件重发 spawn。Worker attempt 身份包含 generation，非裸 PID。
- bwrap 不降级；项目写入只在隔离演练目录；配置/秘密不进 argv、日志、事件。
- 首轮不做 Git 切分支、Skills 商城、协作、多 Harness、API 热插拔、安装器或 UI 迁移。

## 4. 首轮 HTTP 合同（实施此子集，不让执行者重新设计产品）

统一前缀 `/api/v1`；JSON 严格校验，额外字段拒绝；所有 ID 为服务端不透明 ID。
除最小 liveness 外均鉴权；localhost 不替代鉴权，Origin/Host 校验独立。token 用受保护
bootstrap 通道/文件，客户端从文件读取到内存 header，不写命令行、URL、shell history。
提供 OpenAPI 导出；HTTP DTO 不暴露后端 Ref、native auth 或任意 shell 参数。

| 路由 | 最小合同 |
| --- | --- |
| GET /readiness | service/protocol/storage 状态、capabilities 与 typed blockers；无模型探测 |
| GET /wsl/distributions | 宿主发现发行版，不虚构用户名/连接成功 |
| POST /connections/probe | `{kind:"wsl",distribution,user?}` → 有期限 probe_id、已验证身份；尚不创建 Workspace |
| POST /connections/browse | `{probe_id,path}` → 真实子目录；路径 argv 传递、有界；不创建持久项目 |
| POST /workspaces | `{probe_id,path}`，重新验证 → Workspace、独享 Connection；过期/漂移拒绝 |
| GET /workspaces | 本机记录；重新启动后未验证状态如实，不自动假绿 |
| POST /profiles | `{name,harness_type,configuration,credential_id}` → profile_id/revision；configuration 由 Harness 插件校验/渲染 |
| GET /profiles | 角色摘要、revision、运行状态代数、能力；不泄漏 native 内容/秘密 |
| POST /sessions | `{workspace_id,profile_id}` → session_id；首轮固定绑定，暂不实现切换 API |
| GET /sessions/{id} | 会话、有效绑定、持久历史、活动 Turn/capture 状态；分页/上限明确 |
| POST /sessions/{id}/turns | `{text,expected_profile_revision,overrides?}` → 202、turn_id；只开放 model 等插件认可覆盖，不接受 argv/env/path 注入 |
| GET /sessions/{id}/events?after=N | SSE：id 为持久 session seq，data 为版本化 typed event；重放+订阅原子衔接 |
| POST /turns/{id}/cancel | 幂等取消意图回执；不等于已取消，最终观察走事件/会话读取 |

写接口使用 `Idempotency-Key`：同 key 同规范化 body 返回原结果，不重复副作用；不同 body
409 `IDEMPOTENCY_CONFLICT`。键按 route/resource scope，保存 body digest，不能仅内存去重。
失败信封 `{error:{code,message,retryable,request_id}}`，消息安全且简洁；400/422 输入，401/403
鉴权，404 未知对象，409 状态/版本冲突，503 能力不可用。保留更具体 typed code。
事件最小为 `turn.accepted`、`message.delta`、`turn.state`、`turn.capture`，带 session_id、
turn_id、seq、event_id、schema_version；delta 先持久化再推送。终态只接受一次，重复回传幂等。
cursor 越界/历史缺口必须明确回复，不静默漏历史；订阅重连先重放再跟随。
工具展示可作为插件规范化事件扩展，不要求首轮做完整工具 UI。权限请求不自动批准：
首轮使用不需交互的受限演练；若实际要求审批则 typed 停止并保留证据，交互 API 后续派。

Profile/credential 初始导入用一次性管理 CLI（不是聊天 CLI）：仅接受用户指定的导入源，
生成 credential_id，受保护存入 Windows SecretStore。配置 model 与来源需明确，缺失就
返回阻断；不得枚举用户账号、偷偷借用 WSL 登录态、读取历史真实会话。导入操作需再次
向用户确认具体源；预检不读内容。首轮不用提供完整 profile edit/backup UI。

## 5. 分阶段实施与提交

### A — 独立服务和存储

先复制领单/蓝图到后端 `docs/server-round1/` 并记录派工 commit，读目标 AGENTS。
记录 Core 关键行为基线与 Windows Python/SQLite 能力；不跑不相关插件全量。
实现 Windows 独立 Server、单数据根 owner、单 ASGI worker、鉴权/readiness、UoW 和
上述产品记录接口。Wsl/执行 capability 未接通时 typed unavailable，不让 fake 进入默认组合。
Server 发行先可用固定 Windows venv + 锁定依赖运行，不要求 PyInstaller/installer 阻塞对话。
Python 3.12 为首选，若宿主缺版本报告工具链而不是提权全局安装。

验收：Windows 终端启动服务，用提供的 PowerShell HTTP 步骤查询；无 token 被拒；
重启数据仍在；未来版本文件拒绝覆盖；实例/事务隔离测试；对象发布故障不留下悬空 DB 引用。
提交 A，状态 `SERVER_HTTP_R1_A_READY`，不声称 Codex 可用。

### B — 真实 Worker 和 WSL

从旧 Rust Worker 提取最小独立构建闭包，不带 codeg_lib/Tauri/UI；已有 wire 可用则保留。
可改独立类型归属/导入，不静默兼容两套 wire。缺少必要操作时先记录 schema/golden 增量，
只限目录探测、view/secret 分块、spawn/observe/cancel、结果取回/ack/cleanup 和租约。
引导本轮自己的 Linux Worker，校验 manifest/version/能力。Worker 只能访问已授权本次
workspace/view；控制帧和子进程输出分离，清理属于该 attempt；失联采用有界租约停止执行，
凭据回收，非秘密待回传结果短期隔离 TTL。具体默认超时/大小上限集中常量、文档化且可测。
若无法独立提取或跨宿主传输需新架构，停止 B 报告，不整个搬 Tauri、不绕过 bwrap。

验收：HTTP discover/probe/browse/open 真实 Ubuntu、中文空格目录；取消/未知目录零误保存；
真实 Worker 假任务在 bwrap 读到受控文件，输出取回、断连/超时、重复 ack、归属拒绝、清理
均有行为证据。此阶段零模型零真实凭据。提交 B，状态 `SERVER_WSL_R1_B_READY`。

### C — 两轮 Codex

接 Core/插件真实生产路径；原生 config、secret 投递、launch/decoder/resume 都在 Harness
插件，不下放给 HTTP 路由。用户提供确切 model/credential 后有界真实演练：最多 4 次真实
模型请求总预算，单请求输入≤4KiB、输出目标≤2000 tokens、最长120s；不支持硬 token cap
要声明，仍限 bytes/time。禁止为凑 GREEN 循环重试、枚举模型或放大权限。
前两次：T1 让 Codex 记住一次性 nonce 并回答；T2 不携带 nonce、在同 Session 提问验证
native resume；必须有真实官方 resume 调用与同 native identity，摘要拼 prompt 不算。
更早预检调用也计入4次总预算。没有具体凭据来源授权停 C，A/B 可继续完成。

验收：手动 HTTP 提交/读 SSE/读历史，第二句能续接；断开订阅仍执行、恢复订阅无缺口；
typed 模型/凭据失败不假绿。取消用确定性的测试子进程验证真实 Worker seam，若测真实
Codex 取消占用剩余一次调用，不另加预算。提交 C，状态 `SERVER_CODEX_R1_C_READY`。

### D — 持久化与续接

在 C 捕获确认后正常停止 Server，验证 Worker 清理；仅删除已归属本轮且可回收的远端
投影目录，重启同一 Windows data root，以本机 checkpoint 重建新 view，T3 继续原生
会话回忆。T4 留给至多一次有明确修复原因的重验/真实取消，不要求花满。
不需要中断运行中的 Codex 来证明 cold resume。Server 意外终止/确认丢失/活跃 lease
重启恢复用假进程和故障注入测试，不能伪造 native cold-resume 证据。
角色可写状态用受控 fixture 证明 generation 前进且配置 revision 不变、另一 Session
不获得 transcript；Codex memory 特性未启用时只声称机制测试，不造“真实记忆通过”。
同 Profile 并发拒绝、generation 冲突、state/capture失败阻止下次启动需测试。

提交 D；最终提供启动/停止/HTTP请求脚本、步骤与结果、安全扫描和残留报告。
每步脚本只承担请求/展示，不夹带后端业务；用户不需读内部 Ref 和 Worker 帧。

## 6. 测试纪律与用户验收物

按阶段跑相关 tests：root Core 关键行为、修改的 harness/runtime/sandbox、server API/
事务/恢复、独立 Worker 测试、Windows 平台验收。具体命令以基线 pyproject 和实际新增
路径为准，记录完整命令/退出码/计数。Python 测试用 pytest，禁止读源码正则证明架构；
WSL 子进程测试不能用假 platform 冒充 Windows。无模型测试不冒充真实 turn。
每阶段整合完再跑相关门，编译错误先修首因，不反复全量重建；临结束跑一次受影响合集。
明确区分基线失败/新失败/未执行/skip，红了不得删测试改 GREEN。`git diff --check` 必过。

`docs/server-round1/acceptance.md` 必须包含四条可亲手走的路径（A/B/C/D）、实际 URL 和
非秘密文件位置、启动/停止、请求示例、版本/hash、失败证据、真实调用计数。客户端凭据
从受保护文件进内存，不在示例内打印；不得把 Authorization/raw stderr/原生 home dump
到报告。附回传 bytes/digest/capture receipt、相同 native identity 的非秘密证据。

## 7. 停止条件与终态

必须停止相关阶段：基线不匹配、路径已被占用且无法隔离、需改 Desktop/旧仓、插件状态
分类不能安全决定、需绕过 Core/bwrap、Worker 无法独立构建、模型/账号/凭据来源未明确、
预算耗尽、环境确定性失败、需要扩大产品权限。保留首因，不重复等待几十分钟。
失败不自动销毁未回传结果；隔离并记录可恢复状态与明确 TTL，不留下无界凭据。

GREEN：`SERVER_HTTP_CODEX_R1_GREEN`，仅 A/B/C/D 都有实际证据。
否则：`SERVER_HTTP_CODEX_R1_PARTIAL`，逐项写清已过/未过/外部阻断；基线承诺不变。
不自动 merge main，不 push，不接 Desktop、不启动第二家。提交仅本工作树范围，
显式 pathspec，禁止 git add -A/stash/reset，保留用户所有未提交工作。
