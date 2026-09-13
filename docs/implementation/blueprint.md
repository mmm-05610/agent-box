# AgentBox 独立 Server / Worker / 数据体系设计草案

日期：2026-09-13。状态：**BLUEPRINT_V2_DISPATCHED**，不是产品通过证明。
用户确认连接/核心能力归 Server、角色记忆积累、关闭窗口不结束任务；2026-09-13 已授权
按本蓝图派实施。执行范围由 [37 号工单](work-orders/37-http-codex.md) 限定，
不是一次实现全树。调度见 [backend master plan](master-plan.md)。
本轮只读 Git 与代码、查官方资料并写派工文档；不启动模型，不修改后端，不继承旧 Studio 工作树。

## 1. 基线与结论

候选基线固定为 `80d2017e9a708421556914cd99d843573daf4c68`（agent-box）。
`986b221` 是用户使用过的旧产品行为对照，不作为新实现起点。后续 Studio 仅供有界参考，
不整体 cherry-pick、不 import 旧 `StudioService`、不把后续工作树的 GREEN 当基线证据。

建议：Python Server + 既有 Core/SPI + 按需审过的插件；单机模块化服务而非微服务群。
Server 属于 AgentBox 内部应用模块，不属于外部 plugin；Desktop 是客户端之一。
Core 的零第三方运行依赖应保持。HTTP/schema 依赖放 Server optional extra；起步部署
固定一份受测 Python（建议 3.12），不为 Server 单独抬高整个 Core 的 Python 下限。
插件启动时显式启用，无运行中安装/卸载；不新增一套插件框架。

### 已核实的代码，不是愿景

以下路径均以 `git show 80d2017:<path>` 读取，非当前工作树推测：

| 路径 | 事实与处置 |
| --- | --- |
| `src/agent_box/work_core/services.py` | `ExecutionService.dispatch_execution` 已有校验、资源解析、preflight/start、幂等派发；复用，Server 不重新造执行状态机 |
| `work_core/{models,projection,finalization,repository}.py`（同上前缀） | Work/Execution/Ref、投影、终态及持久事实存在；保留合同 |
| `src/agent_box/work_core/db.py` | 全局 SQLite connection + RLock；迁移/连接生命周期需窄改，不可宣称已适配多实例服务 |
| `src/agent_box/extensions/{api,loader,catalog,bootstrap}.py` | descriptor/build、entry-point 发现、不可变 catalog、插件失败隔离已有；复用 `build_extension_environment` |
| `src/agent_box/extensions/runtime_composition/` | RuntimeHost/Sandbox/TerminalSession 合同及组合协调已有；attempt/handle 部分是内存态，需恢复策略 |
| `src/agent_box/resource_contracts/` | Profile/Workspace/Credential/Skill 等 provider-neutral 合同已有 |
| `plugins/agent-box-web/.../server/host.py` | 旧 HTTP host 在 Web plugin 内，不能把它等同内部 Server |
| `pyproject.toml` | Core `dependencies=[]`；平台声明主要面向 Linux，Windows 仍需实际导入/持久化/服务验证 |

基线 plugins 是 artifacts/git/harnesses/runtime-local/sandbox-bwrap/skills/terminal-session/web；
WSL Runtime、Session 插件和 Studio 不是这个提交自带的能力。旧产品支持多 Harness 配置隔离，
不等于该基线已具备新的 Windows Server → Worker 对话链；二者不混淆。

插件审查的复用粒度：

| 能力 | 可保留的已有设计 | 不能直接承诺的部分 |
| --- | --- | --- |
| Harness/Profile | native 格式适配、版本快照、校验及 digest | 基线按扫描最大 revision 判当前版本；要接入新发布事务，不能继续和 Server 双写 |
| bwrap | 隔离 spec 降低、资源来源校验 | 是 Linux 隔离插件，不是 Windows 本机沙箱；执行回收仍需 Worker |
| runtime-local | RuntimeHost/单次启动接缝 | 不是 WSL 远程连接实现，不能靠改名称冒充 |
| Git | 固定 commit/tree、工作树归属、输出捕获与清理 | 不代表已接远端 Worker，也不纳入首条聊天路径 |
| Skills | 有界、可校验的不可变技能快照 | 不急着增加技能商城或第二套 registry |
| 后续 Studio/WSL | continuation、投递/取回、typed 错误的测试与算法 | dirty 工作树、独立 Session DB、巨型 service 不整体迁入 |

## 2. 目标代码树（职责目录，按切片创建，不先造空壳）

```text
agent-box/
├── src/agent_box/
│   ├── work_core/                        保留：通用执行治理，不认识 Server/具体插件
│   ├── resource_contracts/               保留：资源值合同，不装产品路由
│   ├── extensions/                       保留：SPI、catalog、loader、运行时组合
│   ├── storage/                          新增窄基础设施：连接/UoW/对象存储合同与实现
│   │   ├── database.py                   本机 SQLite 生命周期、短事务
│   │   ├── objects.py                    不可变对象发布、读取、校验
│   │   └── backup.py                     一致性备份；非独立数据库服务
│   ├── server/                           新增：独立可运行的应用模块
│   │   ├── __main__.py                   固定入口，独立于 Electron
│   │   ├── composition/                  唯一集中认识具体插件的地方
│   │   │   ├── bootstrap.py              启用列表、版本、依赖注入、启动/关闭
│   │   │   └── capabilities.py           从 catalog 投影可用能力，不重复维护名单
│   │   ├── transport/                    HTTP/事件、鉴权、schema、错误映射
│   │   │   ├── http/                     workspace/profile/session/turn 路由
│   │   │   └── events.py                 读取已持久事件并推送，不作事实权威
│   │   ├── application/                  按用例调用合同和 Core
│   │   │   ├── workspaces.py             打开/重连/归档、私有连接归属
│   │   │   ├── profiles.py               角色版本和本次覆盖的协调
│   │   │   ├── sessions.py               会话身份、工作区绑定、历史
│   │   │   ├── turns.py                  提交/取消/交互响应；不拼 argv
│   │   │   └── recovery.py               提交/回传/清理等应用操作的恢复
│   │   ├── domain/                       小型产品模型：Workspace/Session/Turn
│   │   ├── ports/                        仅确实缺少的应用合同；不复制 Core SPI
│   │   └── persistence/                  产品表仓储/迁移；不写 Core 内部表
│   └── cli/                              保留；服务化产品写入走 Server，避免双写
├── protocols/worker/                     版本化 wire schema + 正反 golden
├── workers/                              独立 Worker 构建单元，语言见 §5
├── plugins/
│   ├── agent-box-harnesses/              审后复用：Profile native 格式、启动/输出适配
│   ├── agent-box-runtime-local/          本地执行环境，不迁进 Server
│   ├── agent-box-runtime-wsl/            新增/定向提取：WSL 连接和远端 Runtime
│   ├── agent-box-sandbox-bwrap/          Linux 隔离策略及投影校验
│   ├── agent-box-terminal-session/       IO/终端合同；不以终端窗口冒充会话流
│   └── skills/git/artifacts/...          有用时启用，不全部纳入首轮
├── tests/                                Core/SPI 的原有行为测试继续保留
└── tests/server/                         API、事务崩溃、插件组合、Windows/WSL 用户链
```

`storage/` 不是第二个 Core，也不包含 Session 规则。将 db 的生命周期依赖下沉是明确新增
范围；Core 自有 repository/migrations 仍由 Core 拥有，Server 只注入连接或事务工厂。
Session 是应用领域，不要求先建一个 Session plugin 才能存聊天；未来替换存储靠 Repository
合同，不靠整个产品域变热插拔。Profile 原生格式知识仍归 Harness 插件。

依赖方向：transport → application → Core/ports；composition → 插件实现 + Core。
plugins → Core/SPI；Core → 中立合同/通用 storage。Core 不 import server/plugins。
Server 用例不 import `codex.py/hermes.py`，不解析原生配置、bwrap 参数或 stdout。
插件不是各开一个 HTTP 服务；插件 route injection 暂不开放，避免污染统一产品 API。

## 3. 两个进程边界与独立服务

```text
Windows：Desktop ── 受鉴权的本机产品 API ── AgentBox Server
           │                                  │
           └── OS 对话框、窗口、通知            └── Core + 插件 + 本机持久化
                                                   │
                                      WSL connector / Worker 控制协议
                                                   │
WSL：项目源码（持久） ← bwrap 中 Harness ← 受限 Worker（临时执行环境）
```

推荐连接权威最终在 Server：独立 CLI 客户端不应必须启动 Electron 才能验证 WSL。
Electron 仍负责 OS 文件选择、启停自己启动的 Server；Server 连接插件负责 wsl.exe/SSH
引导 Worker。35/36 的 Electron Workspace 存储和发现能力作为迁移来源，不长期双写。
切换时先按旧 ID 幂等导入、验证数量和路径、备份，关闭旧 writer 再切客户端，不默默换身份。
旧 Tauri 的 HostBridge 回调链不能整体照搬成新 Server 对 Desktop 的强制反向依赖。

Server 首轮只监听 loopback，鉴权 token 通过受保护的启动/配对通道，不放 argv、URL、日志。
HTTP Origin/Host 策略显式验证，CORS 不等于鉴权。Desktop 关闭不等于全局 Server 必须死亡：
只停止自己拥有的实例，独立启动实例由其 owner 管；第一版不实现任意公网监听或多租户。
一个 data root 一个 Server owner、一个 ASGI worker；重复启动明确拒绝/连接已有实例，不
启用 Uvicorn 多 worker。UI 重开不等于重启执行；服务停机则走有界取消/保存/清理。

## 4. 数据体系：推荐“一库 + 不可变文件对象 + 私密凭据区”

这不是直接沿用 Profile 文件夹加零散 JSON。目标是可读、可备份、版本清楚、崩溃可恢复。

```text
Windows 本机 AgentBox data root（用户可选，本地文件系统）
├── state/agentbox.sqlite              关系、索引、提交和事件事实
├── objects/sha256/<prefix>/<digest>    Profile 快照、原生续接包、附件的不可变字节
├── profiles/<id>/draft/               可编辑配置草稿；不是运行时真相
├── staging/<operation-id>/            未发布的本机操作临时文件
├── secrets/                          加密密文/定位信息，绝不混入 objects
├── cache/                            可删除重建的数据
├── logs/                             有界诊断，不录凭据与原始敏感 stderr
└── backups/                          明确 manifest 的一致性导出，默认不含凭据
```

### 权威与表归属

| 数据 | 唯一权威 | 生命周期 |
| --- | --- | --- |
| Workspace + 私有 Connection | 产品 repository | 路径在远端，元数据本机；移除侧栏是归档，不删源码/历史 |
| Profile 身份/当前 revision | repository 索引 | 提交时 CAS expected_revision，冲突不静默覆盖 |
| Profile 内容 | revision 指向的不可变 manifest/objects | 插件解释原生格式；草稿外部修改不自动改变运行中 revision |
| Session/Turn/绑定 | 产品 repository | Session 可改变未来工作区绑定，已提交 Turn 冻结当时绑定 |
| Execution/dispatch/终态 | Core repository | 产品 Turn 引用 Execution，不复制一个可独立修改的执行状态机 |
| 会话事件 | SQLite 内有序、可重放记录 | 实时通道只是投影；session seq + event id 去重 |
| Native continuation | 本机对象 + 兼容性元数据 | Harness 类型/版本、执行来源、digest 等；不是只有 thread id |
| 凭据 | 本机 SecretStore | DB 只存定位/非秘密元数据；Worker 只获必要临时投递 |
| Worker 缓存/临时执行 | 远端 attempt 范围 | 不作为 Profile/Session/续接唯一持久副本 |

Profile revision = 基础 native 配置快照 + 外部资源绑定。执行时冻结 revision、资源版本和
本次覆盖；运行写回的角色 memory 按插件状态分类自动累积，推进独立 native generation，
**不修改基础配置 revision**。原生 Session
数据单独保存，不随 Profile 发布；执行目录是两者加凭据的临时投影。不会要求把所有原生
配置强行转换成一种通用 JSON；使用已有 NativeHome/格式适配器。

草稿的可编辑文件是草稿内容的唯一权威，数据库只索引其归属和发布关系，不再存第二份
可独立编辑的正文。发布先取得稳定快照并检测并发修改，不能边扫描变化目录边算作提交。
旧 Harness 插件的 current-revision 写入入口须收敛为这个发布用例；格式解释和快照校验
可复用，产品版本指针只留一个写者。每次执行产生的续接包不可变，Session 只引用已接受
的 checkpoint，不把一个可任意改写的 native thread id 当作全部历史。

同一物理 SQLite 文件有 Core 表和产品表两个逻辑 owner，通过注入事务上下文协调；禁止
Server 直接 UPDATE Core 表。若现有 repository 自行 commit，则先增加有测试的事务接缝，
不能声称共享文件就自动获得跨层原子性。不为每个插件建一份需要分布式事务的权威库。
可重建插件缓存可独立。首轮保持 stdlib sqlite3 + 明确 SQL migrations，不同时引入 ORM
重写 Core。单写者/短事务，忙时有界等待；网络和模型调用绝不在 DB 事务中等待。

### 文件与数据库不假装是一个原子事务

1. 写 staging、校验目录路径/大小/文件集合/内容 digest，拒绝 traversal/symlink 逃逸。
2. 发布不可变对象到最终路径并完成平台要求的同步；已有相同 digest 必须验证，不盲信。
3. DB 短事务写 revision/引用/事件/操作状态，再回复“已保存”。
4. 崩溃在第 2/3 步之间会产生孤儿对象，可延迟 GC；不能产生“DB 已承诺、文件尚未发布”。
5. 缺失/损坏对象 fail closed；跨 SQLite 与 FS 的掉电保证受平台影响，要用故障注入验证，
   不把 rename 当成跨设备事务。GC 保留宽限期、活动操作及备份引用，首轮不自动激进删除。

执行接受的记录与待派发操作同事务；dispatcher 由 Server lifespan 持有，不是 HTTP
BackgroundTasks fire-and-forget。Core 已有派发幂等继续用；“进程启动但确认丢失”标为未知并
查询 Worker，不重发新执行。Core 事件到产品事件按稳定 source event id 幂等投影；无需 Kafka。
具体事务边界：接受 Turn 时同时记录绑定、冻结选择与派发意图；接收结果时先发布对象，
再协调 Core finalization、checkpoint 引用和产品事件。异步投影允许有延迟，但必须可补放、
不可丢；session seq 在持久化事务中分配，不用时间戳或内存计数代替重放游标。

### 断连、续接、备份

- 分开 `execution outcome`、`capture status`、`cleanup status`，不是用一个 completed
  掩盖回传失败。输出已出现但续接未持久化时，不能承诺 cold resume。
- Worker 回传 → 本机校验发布并记账 → ack → 清理远端数据。失联时暂停派新任务，租约
  过期取消本 attempt；短期隔离保留尚未取回的非凭据结果，有界 TTL，恢复后补取/清理。
  凭据立即按终态/超时清理；**不是永久远端 Session 仓库**。
- 若远端在结果回传前彻底丢失，原生上下文可能无法恢复，必须报 data unavailable，不能
  靠聊天摘要伪装同 native session。已确认在本机保存的轮次应能从空远端临时目录恢复。
- SQLite WAL 仅放本机盘，不经 UNC/网络共享挂载；备份使用 SQLite backup API，冻结备份
  引用集并复制所需不可变对象，校验 manifest。不是运行中只复制 .sqlite 主文件。
- 数据版本分别管理：DB schema、对象 manifest、Profile schema、API、Worker wire。
  未来版本拒绝写入；升级前备份，逐迁移记录，恢复先校验再切换。
- 普通会话和产物也可能含用户秘密：本机 ACL、导出提示、日志最小化必须有；不声称简单
  正则能自动脱敏一切。凭据供应链禁止进入普通事件/blob，但无法保证模型不回显用户输入。
- 当前 WSL 内已有登录态的迁入必须另经用户授权；正常执行不依赖远端真实 `~/.codex`
  或 `~/.hermes`。投影目录与用户原生 home 分离，不扫描或覆盖用户正在使用的会话。

## 5. Worker：远端执行端，不是第二个 Server

首轮一条活跃逻辑 Connection 一个 Worker，多个 Workspace 不共享逻辑连接。先不做池、
daemon reconnect cluster 或任意插件远端安装。软件二进制缓存与 Profile/Session 数据分开。

Worker 最小职责：版本/能力握手、目录探测、有限分块投递、准备隔离 view、执行/取消/观察、
分块取回产物、清理。请求绑定 server instance/connection/execution/attempt；输出上限、
deadline、重复请求幂等、路径和进程归属检查必须存在。PID 不作为唯一身份。
第一版使用 wsl.exe 引导 + stdio framed 控制通道（stdout 严格协议，stderr 有界诊断），
不额外暴露 WSL HTTP 服务。控制操作与 Harness stdout/stderr 分离。尚不固定具体 wire
字段名；优先审查既有真实 Worker 的 schema/golden，而不是重新命名造“简洁协议”。

语言裁决：Server/Core/插件沿用 Python；Worker 优先提取已有可独立构建的 Rust 实现，
不为统一语言重写进程/边界代码，也不把整个旧 Tauri Cargo 依赖树带来。若无法独立提取，
先以依赖图和具体阻塞裁决，不自动换 Go/Python。Python server 用 PyInstaller onedir
按 Windows 构建；Worker 按 Linux 构建并校验 manifest，不要求用户在 WSL 安装 AgentBox。

现有实现的实物位置是另一个旧桌面仓 `agent-box-studio-ui-reconstruction`：
`src-tauri/src/bin/agent_box_worker.rs` 与 `src-tauri/src/remote_worker/`。入口目前直接 import
`codeg_lib::commands::execution_target::run_bounded_command` 和 `codeg_lib::remote_worker`；
`process_table/secret/timeout` 还使用 `crate::host_bridge` 类型。因此“独立构建”是提取后的
验收门，不是现状。协议、process、view/materialization、artifact/spool 是审查候选；宿主侧
broker/bootstrap 不应无差别打进目标 Worker。现有 deadline/取消测试不等于已证明跨断连
租约清理和结果 TTL；后两项是明确补项，必须做故障测试。

## 6. 接口边界：先合同后路由，不继承旧 Studio 全部 endpoint

| 接口组 | 输入意图 | 返回及权威 |
| --- | --- | --- |
| service | connect/readiness/capabilities | 协议版本、就绪及 typed 缺能力，不暴露 secrets |
| workspace | discover/open/browse/rename/archive/reconnect | 本机持久身份；浏览可用临时连接，选定目录才正式保存 |
| profile | list/read/edit/publish | 角色 DTO、revision、校验错误；UI 不操作 raw Ref |
| session | create/list/open/rename/change-workspace intent | 会话记录；变更只对未来操作，执行中拒绝/排队需后续规则 |
| turn | preview/submit/cancel/respond | 本次有效选择、幂等接受结果、真实状态；非任意 argv |
| events | replay/subscribe | session seq、稳定 event id、明确缺口与恢复 |

推荐首轮 REST + 单向 SSE（Electron 主进程代理鉴权，renderer 不落盘 token）；控制操作仍
HTTP。断线依据游标读 DB 重放；未来需要双向终端时另用 WS，不先建通用多路 RPC 框架。
OpenAPI 是 DTO 生成来源；SSE event payload 显式纳入 schema，不能以生成工具代替运行时校验。
这是一项新 API 候选，需在实施前冻结最小六组中的首轮子集，不默默套用旧 Tauri 26-op 合同。

## 7. 成熟轮子：采用、候选、不采用

以下是 2026-09-13 阅读官方资料后的选择；未安装/基准测试，不宣称已验证本项目兼容性。

| 组件 | 决策与依据 |
| --- | --- |
| [FastAPI](https://fastapi.tiangolo.com/features/) + Uvicorn | Server extra 使用：schema 校验、OpenAPI、HTTP；不进入 Core，不用其 DI 取代插件 registry |
| [Starlette lifespan](https://starlette.dev/lifespan/) | 启停资源与任务 ownership；不用 scattered background tasks |
| [AnyIO](https://anyio.readthedocs.io/en/stable/subprocesses.html) | 可用于结构化任务和有界 IO；不把库取消等同跨 OS 整树终止，WSL 内执行清理由 Worker 负责 |
| [SQLite WAL](https://www.sqlite.org/wal.html) / [backup](https://www.sqlite.org/backup.html) / [sqlite3](https://docs.python.org/3/library/sqlite3.html) | 本机事务与备份，复用已有 SQL；不要 network filesystem，不另起数据库服务 |
| [openapi-typescript/openapi-fetch](https://github.com/openapi-ts/openapi-typescript) | 生成 Desktop DTO/调用类型，减少手写双份协议；需锁版本并验证事件 schema |
| [keyring](https://keyring.readthedocs.io/en/latest/) / [DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata) | SecretStore 的 Windows 适配候选；明确受保护 backend，禁 plaintext fallback。大型 native auth 内容用 DPAPI 文件或受保护密钥加密，不假定 keyring 无尺寸限制 |
| [PyInstaller onedir](https://pyinstaller.org/en/stable/operating-mode.html) | 首选 Server 发布形态：可检查文件、无每次 onefile 解压；各 OS 单独构建，包含显式 plugin metadata/hidden imports |
| [python-build-standalone](https://github.com/astral-sh/python-build-standalone/blob/main/docs/running.rst) | 打包备选：内置解释器+固定 wheels；不同时维护两条首轮发行链 |
| [AsyncSSH](https://asyncssh.readthedocs.io/en/stable/) | 后续 SSH connector 候选，支持进程/SFTP；开启 host-key 验证，不设 known_hosts=None；本轮不引入 |
| [Pluggy](https://github.com/pytest-dev/pluggy/blob/main/docs/index.rst) | 不引入：已有 provider contracts/catalog，不需要再叠一套 hooks/plugin truth |
| [WaveTerm wsh RPC](https://github.com/wavetermdev/waveterm/blob/main/pkg/wshrpc/wshrpctypes.go) | 借鉴远端 helper/typed命令/生成绑定；该文件也耦合UI、配置等类型，不是直接可搬的 Worker SDK，不复制其完整 RPC 面 |

不引入 Redis/Celery/Kafka、Temporal、LangGraph 等执行编排器替换 Work Core；目前是单机
本机服务，不先支付分布式系统成本。DPAPI 的跨机可迁移性和备份分开处理，默认备份不含
可直接使用的凭据，换机器需重新授权；不声称加密等同防御同用户所有恶意进程。

## 8. 最小实施顺序（37 号已派，后续未派）

1. 从 80d2017 新独立分支建立可重复基线；Core 关键合同测试 + Windows 导入/SQLite
   实证。不恢复旧 Studio，不去修改正在施工的 Desktop 分支。
2. 单进程 Server + 本机 data root + 固定插件组合 + readiness；Core DB 连接/UoW窄接缝，
   版本保护/崩溃测试先行。用户可用 CLI 请求，不依赖 Desktop 或 Hermes 网关。
3. WSL connector/Worker + 已有一个 Profile → 一次 Codex 执行，结果持久回传；明确授权
   后才用真实凭据/模型。Desktop WSL 记录导入另作客户端接线，不双写。
4. 同一会话流式输出、取消、正常退出重开与 native resume；远端临时目录清空后重建。
5. Pi 第二家验证 Server 用例无需修改；再 Hermes/OpenCode/DeepSeek Harness。

授权子代理未来作为 application/delegation 用例：权限、预算、深度、父子取消、结果回传；
执行仍走 Core。同 Harness continuation 与 parent-child delegation 分开关系，不能拿已有
parent_execution_id 冒充跨角色编排。Git/Skills 通过已有资源合同后续插入，不污染首轮。

## 9. 需要审阅的决定与残余债务

| 方向/决定 | 当前处置 |
| --- | --- |
| Core → Server/具体插件 | 目标禁止；基线有通用合同注册依赖，不是插件实现依赖 |
| Server application → 具体 Harness | 目标禁止；具体选择集中 composition/catalog |
| 单库跨 Core/产品事务 | 要改全局连接和隐式 commit 的接缝，不能只改目录名 |
| 独立 Server ↔ Electron WSL 权威 | 推荐 Server 接管，35/36 数据一次性迁移；这是需明确接受的归属变化 |
| Worker 提取 | 后续代码证据按独立构建/协议审查，不直接信任旧整机验收标签 |
| 数据体系 | Profile 草稿/不可变版本、Session/native分离、单库+对象的明确提交过程 |

以上三项已确认；蓝图 v2 的具体约束见下节。首轮只派 37，不恢复旧 Desktop/Studio 任务。

## 10. 蓝图 v2：本轮裁决及旧设计对照

### 宿主操作与执行决策分开

Electron 可保留本机文件浏览、独立 Git diff、系统选择器等便利能力；不是强制全部绕 Server。
远端文件/Git 走 Server 的 Connection/Worker。影响执行的目录、分支、worktree 选择必须交
Server 解析、核验并冻结为后续 Turn 的资源，UI 选中不等于运行中的执行已经切换。
项目源码仍是文件系统权威，Server 不声称可阻止用户外部 Git 工具修改；有风险时检测漂移，
首轮不实现切分支/worktree API。各 Workspace 独享逻辑 Connection，进程和软件缓存不是业务身份。

### 角色状态不是另一份配置

已读旧仓 `agent-box-studio-codex-vertical/docs/validation/current/` 两份报告：
`NATIVE_PROFILE_HOME_AND_CENTRAL_SKILL_CLOSURE.md` §3–5 和
`NATIVE_PROFILE_TRANSACTION_FINAL_DURABILITY_CLOSURE.md` §5–9/21。
前者区分 revision/native_state_generation，后者记录冻结校验、事务恢复及 Windows 耐久性限制。
这些是历史设计/测试汇报，不是本轮重跑证明，也不在 80d2017 基线内。

```text
Profile（用户眼中的独立角色）
├── config_revision          基础配置版本；会话覆盖不回写
├── native_generation        可积累的角色状态；原生记忆算法仍归 Harness
└── 外部资源绑定             以后接 Skills 等，不首轮重建其管理平台
Session
└── checkpoint              本会话的原生续接材料；不传播到其他 Session
Execution 临时 home
└── config + role-state + session-checkpoint + 临时凭据
```

插件提供路径/文件类别与可捕获状态合同：配置、角色状态、会话状态、凭据、缓存/临时、
未分类。Server 不硬编码 `.codex`/`.hermes` 路径，不发明通用记忆召回器。
角色状态和 Session checkpoint 先发布本机不可变对象，再用 generation/CAS 接受结果。
config、凭据、技能受管文件不得混入运行状态写回。未知安全文件保留到本次恢复材料，
不自动提升为跨会话共享记忆；无法安全区分必要的原生状态时 typed 阻塞，不猜分类。
这是对旧设计 SESSION/UNKNOWN 整体 reconcile 的有意收窄，避免会话资料串入其他会话。

首轮同一 Profile 仅一个活动 Turn，冲突立即 `PROFILE_BUSY`；不同角色的调度不必绑成
全局锁。同一 Session 也只允许一个活动 Turn。Profile 状态有待恢复时禁止下一次启动；
没有证据证明旧 Worker 已停，不因 Server 重启就直接释放占用。首轮不做并发记忆合并。
有角色状态产物就自动持久化并供下次使用；Harness 未提供原生记忆则诚实声明，不造假。
配置回滚不隐式回滚记忆；无需首轮实现状态回滚 UI。

### 独立服务生命周期

客户端断开/SSE 关闭不取消任务；关闭 Desktop 不杀 Server。只允许显式 stop/control 进入
有界取消、捕获、清理；独立 Server 需脱离窗口进程的退出联动，Electron 启停接线后续验证。
首轮以独立终端启动 Windows Server 证明它不依赖 Electron，不声称已验收窗口退出行为。
Server 重启后有界 reconcile 未决 attempt；无法查询到最终结果则保留未知状态，禁止自动重跑。

## 11. Harness 扩展插槽裁决（2026-09-13，优先于旧接入实现设想）

Harness 接入体系是系统的扩展范围，不再定位为内置若干品牌适配器的插件集合。
AgentBox 定义系统扩展插槽；现成第三方多 Harness 接入实现装入插槽，且可被替换。
agent-box-harnesses 名称可保留，但其最终包归属/布局待 38 选型后裁决，不在研究中迁移。

系统仅拥有必要的边界胶水、资源治理与本机持久化；严禁自写完整多 Harness 接入框架。
候选必须同时保留公共操作和各家的原生专有能力，不强制所有 Harness 完全同构。
ACP 是可选下层协议，不是预定唯一实现；现成 codex-acp 只是单家组件，不能替代多家接入
项目选型。Codex app-server 接入须优先查现成实现，不在 Server 内重新解释其协议。

专有功能应有受控的能力声明、版本/参数验证、事件和错误扩展通道；不能只给任意 JSON
或 shell 透传来宣称可扩展，更不能让 Server/Core 用品牌分支补齐。能力不支持必须明确。
Core 的执行治理、Worker/bwrap 的隔离和 Windows Profile/Session 权威不让渡给第三方。
38 只比较与验证候选；无合格者如实报告，不自行降低要求或转手写。最终选型及生产实施
需要下一次用户裁决。详见 [38](work-orders/38-harness-extension-selection.md)。
