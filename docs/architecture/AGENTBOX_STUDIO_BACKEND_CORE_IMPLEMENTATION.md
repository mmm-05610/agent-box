# Agent-Box Studio 后端核心替换实施蓝图

> 状态：核心产品裁决已完成，READY FOR IMPLEMENTATION PRE-FLIGHT
>
> 关联设计：
> [`EXECUTION_TREE_AND_CROSS_HARNESS_SESSION.md`](./EXECUTION_TREE_AND_CROSS_HARNESS_SESSION.md)
>
> 注意：本文的 Phase 0/1 后端基础仍然有效；其中线性 Session、对称 Session Codec、
> 全局有效上下文和“分支属于延期能力”的描述，已由上述 canonical 设计更新。具体
> Session 执行语义以新文档为准。
>
> 目标：保留 Agent-Box Studio 前端产品，在不复制 Agent-Box 源码、不把厂商知识
> 放入 Studio、不扩张 Work Core 业务语义的前提下，用 Agent-Box 能力替换 Codeg
> Rust 业务后端。Tauri 可继续作为桌面 Host。

## 1. 已确认的核心裁决

1. 一个 Official Session 固定对应一个 Work；
2. 一个 Turn 表示一轮用户意图，可包含一个或多个 Execution；
3. 第一版一个 Turn 通常只有一个前台 Harness Execution；
4. 一个 Session 同时只有一个写入 Turn；
5. Session 不绑定 Harness，Harness/Profile/Model 是逐轮 Binding；
6. 第一阶段 Workspace 使用 `live` 模式，直接修改用户项目目录；
7. `managed` worktree 是后续显式模式，不阻塞首轮替换；
8. live 模式必须如实标记为 mutable/unfrozen，不能伪装成冻结工作区；
9. Unified Session、Native Original、Codec、compact 和 Loss Report 采用关联设计；
10. MCP 仓库、Automation、Backup 等不属于本轮核心闭环。

## 2. 当前原型为何不能继续堆叠

现有 `studio-backend` 原型有可复用的 HTTP/WS 壳和前端 Transport，但业务模型已经
过时：

- 后端分支基于 Extension/Native Profile 重构前的 Agent-Box；
- TurnOrchestrator 特判 Codex/Claude，其他 Harness 返回 pending；
- transcript、receipt、Work 映射保存在进程内；
- 跨 Harness 使用摘要 handoff；
- cancel、permission、附件、sandbox 和 model binding 没有闭环；
- 前端主工作区仍直接调用 Codeg Rust API；
- `BackendPorts` 只覆盖 session/projects/events，远未形成可替换边界。

因此不能把旧 orchestrator rebase 后继续修补。应从最新 Agent-Box main 建新分支，
选择性搬运网络壳、DTO 测试和无业务假设的前端 Transport。

## 3. 目标拓扑

```text
┌─ Agent-Box Studio 前端 ─────────────────────────────────────────────┐
│ React Features                                                     │
│     ↓                                                              │
│ Domain Ports                                                       │
│     ↓                                                              │
│ AgentBox HTTP/WS Adapters                                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ /api/v1 + resumable WS
┌─ agent-box-studio service ───▼──────────────────────────────────────┐
│ Auth / API / Session Application Service / Turn Orchestrator       │
│     ↓                       ↓                         ↓              │
│ Session Store             Catalog                 Work Core         │
│     ↓                       ↓                         ↓              │
│ Official Session Ref   Harness/Profile/Skill    Execution lifecycle │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ typed protocols/contributions
┌─ Agent-Box plugins ──────────▼──────────────────────────────────────┐
│ Harness Codecs │ Harness Drivers │ Live Workspace │ Git │ Terminal │
│ Skills         │ Runtime Host    │ Sandbox        │ Artifacts      │
└─────────────────────────────────────────────────────────────────────┘

┌─ Tauri Desktop Host（保留）─────────────────────────────────────────┐
│ window / picker / notification / updater / desktop lifecycle       │
└─────────────────────────────────────────────────────────────────────┘
```

前端不能直接 import Agent-Box，也不能把 Python 包复制进 Studio。Agent-Box service
作为独立进程或 sidecar 运行；桌面、服务器和 Docker 前端消费同一 HTTP/WS 契约。

## 4. 核心领域映射

```text
Studio Project
└── LiveWorkspaceRef

Official Session
├── work_id                         # 固定，一对一
├── project_ref / workspace_mode
├── append-only canonical ledger
├── effective-context checkpoint
└── turns[]
    ├── turn_id
    ├── frozen binding
    ├── execution_ids[]             # 1..N
    ├── native originals/envelope
    └── terminal outcome
```

### 4.1 Session = Work

创建 Session 时，在同一个应用事务中：

1. 创建 Work；
2. 创建 Session row；
3. 保存 `session_id ↔ work_id`；
4. 绑定 Project/Workspace mode；
5. 写入 `SESSION_CREATED` ledger record。

Work 在 Session 的整个活动期保持 open。普通 Turn 完成只完成其 Execution；只有
显式 Finish/Archive Session 才改变 Work 的最终状态。

禁止依靠进程内 `dict` 保存 Work ID、idempotency receipt 或 transcript。

### 4.2 Turn = intent，Execution = attempt

```python
@dataclass(frozen=True)
class TurnRequest:
    session_id: str
    idempotency_key: str
    input: ComposerInput
    harness_id: str
    profile_ref: Ref
    model_selection: ModelSelection | None
    sandbox_ref: Ref | None
    runtime_host_ref: Ref
```

Turn 首次派发创建一个 Execution。重试、恢复、委托或未来多 Agent 协作可以追加
Execution，但不能改写原 Execution 事实。

### 4.3 Binding 必须冻结

每个 Turn 保存完整 Binding Snapshot：

- Harness provider/version/mode；
- exact Profile Ref/revision/digest；
- Model/Provider selection；
- Workspace Ref 与 `workspace_mode`；
- Runtime Host、Sandbox、Terminal；
- Credential locator（不含值）；
- Official Session watermark；
- Session Codec/version/native schema；
- 输入 Resource Refs；
- capability negotiation digest。

前端可以提供默认值，但后端必须返回最终解析结果。不能让 UI label 直接冒充 Ref。

## 5. Live Workspace 第一阶段

### 5.1 新能力

现有 `git-workspace` provider 只生成 detached managed worktree，不适用于本阶段。
新增独立的 `local-live-workspace` Resource Provider：

```text
provider_id: local-live-workspace
contract: agent-box.workspace@1
mode: live
mutability: externally_mutable
```

它可以位于新的 `agent-box-workspace-local` 插件。不要放入 Work Core、Harness 插件
或 Studio 前端。

### 5.2 诚实语义

live Workspace：

- path 是用户选择并注册的真实目录；
- Harness、文件编辑器、Git 面板和 terminal 看见同一目录；
- 不复制、不创建 detached worktree；
- 不承诺 execution 输入被冻结；
- Turn 开始记录 baseline，结束记录 observation；
- 执行期间外部修改被视为共享 live 状态，而不是自动归因给 Harness；
- 无法证明修改来源时 Evidence 必须标记 `source=shared_live_workspace`。

Git 项目的 baseline 至少记录 HEAD、index digest、working-tree status digest；非 Git
目录记录有界 tree manifest/digest 和明确的 partial/over-limit 状态。

### 5.3 安全

- Project root 必须显式注册并 canonicalize；
- 所有文件、Git 和 terminal cwd 必须位于注册 root；
- symlink escape、`..` traversal 和跨 root 操作 fail closed；
- destructive 文件操作走 preview/confirm 或 trash；
- bwrap 模式对 live root 使用显式 rw bind；
- direct 模式也必须在 Binding 中明确记录，不能用字段缺席表示。

### 5.4 后续 managed 模式

未来增加：

```text
workspace_mode = live | managed
```

`managed` 复用 `git-workspace` 的 exact commit/tree、detached worktree、capture 和
finalization。Session API、Turn API 和前端 WorkspacePort 不改变，只替换 Workspace
Ref/provider。创建 Session 后不能静默切换 mode。

## 6. 前端可替换边界

`BackendPorts` 必须从当前三个端口扩展成当前保留 UI 真正消费的领域端口：

```ts
interface BackendPorts {
  sessions: SessionsPort
  turns: TurnsPort
  projects: ProjectsPort
  workspace: WorkspacePort
  git: GitPort
  terminal: TerminalPort
  harnesses: HarnessCatalogPort
  profiles: ProfilesPort
  skills: SkillsPort
  attachments: AttachmentsPort
  events: EventChannel
  diagnostics: DiagnosticsPort
}

interface DesktopHostPorts {
  windows: WindowPort
  filePicker: FilePickerPort
  notifications: NotificationPort
  updater: UpdaterPort
  desktopSettings: DesktopSettingsPort
}
```

原则：

- 业务 Feature 只能依赖 Domain Port；
- Agent-Box/Codeg 方言只存在于 adapter；
- Tauri Host 能力不要求 Agent-Box service 复刻；
- 禁止 Feature 继续新增 `@/lib/api`、`invoke()` 或裸 `fetch()`；
- 迁移期间用 lint/boundary test 锁住调用面；
- 一个 Feature 换绑后删除其 Codeg fallback，不长期双写。

## 7. 核心 API 契约

下面是前端替换的核心 API，不复刻 Codeg command 名称。

### 7.1 Bootstrap/Catalog

```text
GET /api/v1/health
GET /api/v1/capabilities
GET /api/v1/harnesses
GET /api/v1/runtime-options
```

返回插件 READY/UNAVAILABLE、版本、launch modes、session codec truth、Profile、
Sandbox、Terminal 和 Live Workspace 能力。前端不得根据 Harness 名称猜功能。

### 7.2 Projects/Workspace

```text
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/{id}
PATCH  /api/v1/projects/{id}
DELETE /api/v1/projects/{id}

GET    /api/v1/projects/{id}/files
GET    /api/v1/projects/{id}/files/content
PUT    /api/v1/projects/{id}/files/content
POST   /api/v1/projects/{id}/files/move
DELETE /api/v1/projects/{id}/files
```

路径只使用 project-relative path。API 不接受客户端提交的任意宿主绝对路径作为文件
操作目标。

### 7.3 Sessions/Turns

```text
GET    /api/v1/sessions
POST   /api/v1/sessions
GET    /api/v1/sessions/{session_id}
PATCH  /api/v1/sessions/{session_id}
DELETE /api/v1/sessions/{session_id}

GET    /api/v1/sessions/{session_id}/transcript
POST   /api/v1/sessions/{session_id}/turns/preflight
POST   /api/v1/sessions/{session_id}/turns
GET    /api/v1/sessions/{session_id}/turns/{turn_id}
POST   /api/v1/sessions/{session_id}/turns/{turn_id}/cancel
POST   /api/v1/sessions/{session_id}/compact/preflight
POST   /api/v1/sessions/{session_id}/compact
GET    /api/v1/sessions/{session_id}/recovery
POST   /api/v1/sessions/{session_id}/recovery/{operation}
```

`preflight` 返回冻结 Binding Draft、Loss Report、上下文窗口状态和 confirm token。
真正派发必须携带该 token，并在 lease 内重新验证 watermark/CAS。

### 7.4 实时事件与交互

```text
WS   /api/v1/sessions/{session_id}/events?after={seq}
POST /api/v1/sessions/{session_id}/permissions/{request_id}/respond
POST /api/v1/sessions/{session_id}/questions/{request_id}/respond
POST /api/v1/sessions/{session_id}/approvals/{request_id}/respond
```

事件必须有单调 `seq`、event ID、Turn/Execution ID 和 terminal-once 语义。断线后从
`after` 重放；不能依赖进程内 ring buffer 作为唯一恢复来源。

### 7.5 Profiles/Skills

```text
GET/POST/PATCH/DELETE /api/v1/profiles/...
GET                    /api/v1/skills
POST                   /api/v1/skills/import
GET                    /api/v1/profiles/{profile}/skills
POST                   /api/v1/profiles/{profile}/skills/install
POST                   /api/v1/profiles/{profile}/skills/update
POST                   /api/v1/profiles/{profile}/skills/rollback
DELETE                 /api/v1/profiles/{profile}/skills/{skill}
```

这些 API 只通过 Catalog contribution/Resource Library/Skill Installer 调用 Agent-Box
能力。Studio 不读写 Harness native home。

### 7.6 Git/Terminal

Git 首轮核心子集：

```text
status / diff / branches / checkout / stage / unstage / commit
```

Terminal 首轮核心子集：

```text
spawn / list / resize / write / terminate / byte-stream WS
```

二者均绑定 Project/Workspace Ref，不能接受越过 Project root 的 cwd。

### 7.7 Attachments

附件先进入受管 Artifact/Resource Store，再以 Ref 加入 Turn Binding。不得把 base64
大对象直接塞入 idempotency request 或 Session ledger；canonical record 保存 Ref、
media type、digest 和显示元数据。

## 8. Turn Orchestrator

```text
POST preflight
→ resolve Session/Work/Project
→ acquire read snapshot
→ resolve Harness/Profile/Model/Runtime/Workspace refs
→ probe Session Codec
→ freeze Official Session watermark
→ produce Binding Draft + Loss Report + confirm token

POST turns(confirm token)
→ acquire Session writer lease
→ revalidate watermark/binding/profile/workspace baseline
→ create Turn + Execution
→ materialize Native Session View
→ dispatch through Work Core
→ SessionDriver/ObservationHub → durable event stream
→ handle permission/question/cancel
→ terminal observation
→ import canonical + Native Original
→ apply Work Core finalization
→ commit Turn/session watermark
→ release lease
```

禁止在 Orchestrator 中出现 `if harness == "codex"` 一类执行分支。差异通过 Catalog
发现的 Execution Provider、Session Driver、Session Codec 和 Host Control 处理。

## 9. 持久化与恢复

至少需要以下逻辑表/authority：

```text
projects
sessions(session_id, work_id, project_id, workspace_mode, ...)
turns
turn_executions
binding_snapshots
session_records
native_original_refs
native_execution_envelopes
compaction_checkpoints
event_log(seq, event_id, session_id, turn_id, execution_id, ...)
idempotency_receipts
writer_leases
recovery_journals
```

约束：

- Session/Work 映射、receipt、transcript 不能只在内存；
- API 返回 202 后，客户端可以按 idempotency key/turn ID 查询确定结果；
- restart 后 transcript、pending/recovery 和 WS replay 仍可用；
- canonical/native envelope/terminal outcome 有明确事务提交点；
- 无法证明执行是否启动或导入是否完成时返回 ambiguous/recovery-required；
- 清理失败不改写已经提交的业务结果。

## 10. 认证和部署

当前前端发送 Bearer token，但旧 FastAPI 服务没有验证。新服务必须：

- loopback desktop sidecar 也使用启动时生成的短期 token；
- server/Docker 使用显式配置的长期 token或未来外部身份代理；
- REST 与 WS 使用同一授权策略；
- token 不写进 URL 日志；若浏览器 WS 只能使用 query token，必须使用短期 WS ticket；
- Project root、Profile、Session 和 terminal 全部经过相同主体授权；
- CORS 默认拒绝，按部署配置开放。

## 11. 不属于 Agent-Box 业务后端的能力

以下能力留在 `DesktopHostPorts`，不要求 Python service 复刻：

- Tauri window/dialog；
- 本地文件选择器；
- OS notification；
- 自动更新、重启和开机启动；
- 打开外部编辑器；
- 仅与当前桌面壳有关的渲染设置。

服务器模式需要时由 Web adapter 提供等价 UX，而不是伪造 Tauri command。

## 12. 本轮明确延期

- MCP Registry/Marketplace/Server 配置；
- Automation；
- Backup/Restore；
- Token usage 聚合报表；
- 多 Agent 并行、Session branch/merge；
- managed workspace；
- 远程 Workspace 上传同步；
- 插件安装市场和自动升级；
- 高级日志查看器。

这些能力不能阻塞核心换绑，但 Backend capability response 必须如实标记不存在，
前端隐藏或禁用对应入口。

## 13. 实施阶段

### Phase 0：建立新基线

1. fetch 最新 Agent-Box main；
2. 从包含 PR #66 的 main 创建新分支；
3. 选择性搬运旧 `plugins/agent-box-studio` 的 FastAPI app factory、Transport DTO 和
   无状态测试；
4. 不搬运旧 TurnOrchestrator、Stage/handoff、内存 transcript；
5. 把当前旧分支标成 prototype archive。

### Phase 1：底层协议与 authority

1. `agent_box.protocols.session`；
2. Official Session Store 插件；
3. `local-live-workspace` provider；
4. Session=Work 持久映射；
5. durable event log、lease、idempotency、recovery；
6. root-only/preview clean-wheel discovery。

### Phase 2：单 Harness 证明

1. 用 Pi/offline fixture 证明 Codec 协议闭环；
2. 用 Codex 做首个生产 Harness；
3. 完成 preflight→dispatch→stream→permission→cancel→finish→import；
4. 证明服务重启和 WS cursor replay；
5. 证明 live workspace 修改在用户目录立即可见。

### Phase 3：核心服务 API

1. Projects/Workspace Files；
2. Sessions/Turns/Transcript；
3. Harness Catalog/Profile/Skill；
4. Git；
5. Terminal；
6. Attachments；
7. Auth/capability/diagnostics。

### Phase 4：前端端口化和切换

1. 建立完整 Domain Ports；
2. 将当前保留 Feature 从 `lib/api`/Tauri 业务 command 迁出；
3. 保留 DesktopHostPorts；
4. 逐 Feature 接 AgentBox adapter；
5. 主 Conversation 页面接入 AgentBox SessionRuntime；
6. 删除占位 `SessionViewAgentBox`；
7. 删除已迁移能力的 Codeg backend fallback。

### Phase 5：Unified Session 跨 Harness

1. Claude Codec；
2. Codex→Claude→Codex；
3. OpenCode/Hermes/Pi 独立 admission；
4. Loss Report；
5. 显式 native compact；
6. 五家 capability truth 与 UI 门控。

### Phase 6：收口

1. 当前保留 UI 的接口覆盖矩阵 100%；
2. 删除不可达旧 Codeg 业务路径；
3. desktop/server/Docker 三形态验证；
4. wheel/clean install/discovery/doctor；
5. real Harness 测试只在明确授权的 credential 环境执行。

## 14. 首轮实现范围

为了避免再次做出“大而假的完成报告”，第一次实施只做：

```text
Phase 0
+ Phase 1 的 Session Protocol/Store/Live Workspace 骨架
+ 一条完全 fake/offline 的 Turn transaction vertical
```

首轮不宣称：

- 前端已经换绑；
- 五家 Harness 已支持；
- native Session 写入已准入；
- Git/Terminal/Files API 已完成；
- Codeg 后端可删除。

## 15. 首轮验收标准

1. 新分支确实基于最新 main；
2. Work Core/schema 业务语义零修改；
3. `Session = Work` 映射持久且重启可恢复；
4. Turn 可关联 1..N Execution；
5. Session single-writer 在并发测试中 fail closed；
6. Official ledger、event log、receipt、watermark 持久；
7. live Workspace Ref 明确标记 mutable/unfrozen；
8. fake Harness 完成 prepare→execute→event→terminal→commit；
9. crash/fault injection 不生成重复 Turn 或假 terminal；
10. 未实现能力通过 capability truth 返回 unavailable；
11. root-only wheel 不携带 concrete Studio/Session Store/Workspace provider；
12. clean Preview 能发现新增插件/contribution；
13. git diff --check、compileall、相关 Python tests 通过；
14. 未读取 credential，未执行真实模型请求；
15. 不修改 Agent-Box Studio 前端产品代码。

## 16. 开始实施前的仓库动作

实施应在 Agent-Box 仓库的新 worktree 中进行，而不是当前旧 `studio-backend` 分支：

```text
latest origin/main
└── feat/studio-backend-core
```

当前 Studio 仓库只保存 canonical 设计和未来前端 adapter；首轮实现不应在这里复制
Agent-Box package。完成后先提交 Agent-Box backend checkpoint，再开始前端换绑，
从而保持两边问题可独立定位。
