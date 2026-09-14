# Desktop产品交付状态（执行工作树维护）

调度：ACTIVE_EXECUTOR_INCREMENT_AVAILABLE。本文件是产品工作树的执行事实；
发布源初始表不代表实时状态。消费文档更新时保留执行状态行，只合入规则/新订单。

## 执行快照（handoff-policy 每阶段必填）— 接管施工中

- updated_at: 2026-09-14 18:10 (+08:00)
- 执行者: Zcode 前端产品 goal（新一轮会话，串行施工）；**已从 Codex 前端产品 goal 接管**
- 工作树/分支: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product
- 接管核验（历史，Zcode→Codex 交接）: 用户指定交接 HEAD `5c0fbfe` 与实际 HEAD
  `5c0fbfe119de5c2fe979e3964ad59223767398d7` 一致；接管前 `writer_lease=RELEASED`；
  未发现该工作树、Windows 构建树的 Electron/Vite/Vitest/Playwright/验收驱动进程；
  dirty 集合仅为下列 4 项已授权交接改动。发布源规则文件与本执行树逐文件 SHA-256 一致，
  保留本文件实时进度，不复制发布源初始状态。
- 本阶段起点核验: HEAD `8973bae878253504a324a3512f9c666e7e13e8f6`、分支
  feature/agentbox-desktop-product、工作树 clean，无同工作树并发写入者；writer lease 仍为同一
  前端 goal 的 ACTIVE lease，本阶段串行施工（用户增量允许两个并行子代理，但两个候选写集在增量到达时
  均已被主代理修改，按增量规则不再委派、改为串行完成），完成后停止写入并回报，不提前 RELEASE。
- 代码检查点（已提交 HEAD）: `86911029`（P05 返修：sessions.update 侧栏投影的服务状态边界）
  链: ebb1233（P00）→ 8d4b3df/47b5b47/dbb902f（P01 代码与几何修复）→ 26b32fc（P01 GREEN 证据）
  → 468e6ac/d7e9a57（发布源 d3c0196+ffbcfaf 导入）→ 893d560（P07 检查点2 wire-v1）
  → 957a523（P02A 盘点）→ 07f5386（P02A slice 1：失败面非阻塞）→ 3a25edc（P02A slice 2）
  → df84838（P02A GREEN）→ 91305d8（P02B1）→ 2a5b65d（P02B2）→ a132a49（wire 回应）
  → 0b3a341（wire client/replay/fixture）→ e4337c8（P02C1）→ fffbf443（P02C2）
  → 22125f3（P02D/B3）→ 57ceae6（P03 持久幂等 send）→ d179dba（P03 服务投影）
  → 9881bb8（P07 核心维护覆盖增量）
  → 3f3bbb9（P04 隔离 host transport）→ b10e455（P07 检查点5）
  → ff05157（P03 Composer send seam）→ 2c3aa7f（P03 主 route 生产挂载）
  → b9b816d（P04 event subscription seam）→ 292d351（P04 状态记录）
  → 3aba5c5（P07 queue 终态机械对齐）→ 7b38cf5（P04 WorkCore supervisor）
  → 34d9e48（P04 状态记录）→ 9d9adc0（renderer legacy autostart 退役）
  → 72b0371（P04 状态记录）→ 342b9df（Electron window autostart 退役）
  → 08a116d（wire-v1 双端锁定登记）→ 00d8862（main-only WS event transport）
  → 35659c5（Session/cursor IPC + renderer replay 接线）→ 1513ff2（P04 event 证据）
  → 5f8b2a5（AgentBox service composition）→ 405f6be（main 注册与退出 cleanup）
  → e1adda9（P04 状态记录）→ f8807b1（AgentBox 模型控件中立化）
  → 0db8bc7（中立模型控件状态）→ 1331a1d（Profile/ProviderModel 维护端口）
  → d6ec993（服务模型目录与临时槽）→ 2991bff（中立 Provider/Model 设置）
  → 1cbc4f58（Provider 模型检查点）→ dfcd7027（Profile 默认配置编辑与串行 CAS）
  → 88f3d934（enum/boolean 编辑覆盖）→ af0c08e3（返修：服务权威名称回写）
  → 矩阵审计文档检查点（evidence/P05-client-matrix.md）→ 940c9df4（config.resolve 生产接线）
  → b6d0bc6f（返修：旧 pending 发送优先恢复）→ 3e207376（workspaces.open 生产接线）
  → 072c7eac（返修：Workspace 身份完整三元组匹配）→ f6b457b5（workspaces.archive 生产接线）
  → a8142125（workspaces.browse 生产接线）→ 4a057609（返修：远端保存迟到响应收口；
  WORKSPACES_BROWSE_CLIENT_READY 以该次提交为最终依据）
  → **8cdd1381（sessions.update 生产接线：统一侧栏服务 Session 投影 + 改名/置顶 CAS + 当前会话置顶命令；
  SESSIONS_UPDATE_CLIENT_READY 原以本次提交为依据）**
  → **86911029（P05 返修：侧栏服务投影的服务状态边界 —— 归属与可调用性分离、缓存权威跨 loading/unavailable
  保持、维护与归档 fail closed；SESSIONS_UPDATE_CLIENT_READY 以本次返修提交为最终依据）**
- 已消费发布文档提交: 86d5a7b、61c7ff7、d3c0196、ffbcfaf
- 当前检查点改动（sessions.update 侧栏投影服务状态边界返修）: 把 Workspace **归属**与**服务可调用性**分开——
  `agentBoxWorkspaceFor` 只按缓存 `$agentBoxWorkspaces` 与既有完整 `{kind,user,host}` + normalized path 匹配，
  不再要求 `phase === 'ready'`，因此 loading/unavailable 期间本地行不再回落 legacy `SessionInfo` 预览、WSL 行
  不再回落「sessions unavailable」、已建立的 AgentBox 权威不消失；`agentBoxArchiveFor` 单独继续要求 `ready` +
  hello 声明 `workspaces.archive` + 缓存匹配（旧 hello 不能让不可用服务继续提供无法执行的入口）。
  `AgentBoxSessionList` 先算缓存 records 再决定展示：有缓存时任何相位都显示服务行（unavailable 附紧凑状态与
  `service.detail` 纯文本、空则本地化 fallback；loading 或 catalog 未 ready 附紧凑 loading 标记），绝不回落
  legacy；改名/置顶只在 ready + `sessions.update` 已声明时可执行，其余状态行仍可打开（先选 shell 行再
  `sessionRoute(id)`）且零 wire 调用（跨服务下线的已打开改名对话框也不发送）；无缓存时 unavailable 显示
  unavailable（不是 spinner）、loading/idle 或 catalog 未 ready 显示 loading、仅 ready + catalog ready 显示
  空态。新增 i18n 键 `agentBoxSession.unavailable` / `unavailableReasonFallback`（type 与六语言同步）。
  矩阵仍 **27 reachable / 1 gap**，唯一剩余前端缺口仍为 sessions.archive；阶段状态 `SESSIONS_UPDATE_CLIENT_READY`
  以本次返修提交 `86911029` 为最终依据；P05 仍 IN_PROGRESS。本单只修 authority fallback，未开始 sessions.archive。
- 上一检查点改动（sessions.update 生产接线）: 统一侧栏在**服务 Workspace 匹配后**由其 AgentBox Session
  投影接管展开内容——新增纯投影（exact workspaceId、排除 archived、pinned-first、updatedAt 降序、id tie-break）
  与 `agentbox-sessions/` 行/列表；store 改为 version 单调采纳（旧 list/mutation 响应不覆盖更高 version，
  部分页不擦除其他 id）；改名与置顶走 `sessions.update` exact CAS（打开时捕获 id/version/displayName，不乐观、
  只采纳服务返回、conflict 保留草稿/对话框/投影、pending 连点单发、无能力零 wire 调用）；当前会话置顶命令经
  窄 seam 走同一 CAS，记录缺失/服务未 ready/能力未声明 fail closed 且不回落 legacy pin；未匹配 shell 行保持
  原行为，WSL 不再对已匹配 Workspace 显示 “sessions unavailable”。矩阵 **27 reachable / 1 gap**，唯一剩余
  前端缺口 sessions.archive（G5 拆为 G5a 已接 / G5b 待接）；阶段状态 `SESSIONS_UPDATE_CLIENT_READY`。
- 上一检查点改动（远端保存迟到响应返修）: 向导在关闭、Back、以及每次重新打开时使当前 save turn 失效，
  迟到保存成功不再 selectWorkspaceView/释放连接/关闭对话框（不会误关重新打开的新向导），当前保存语义不变、
  不伪称取消宿主保存；浏览组件在保存期间锁定 Back/Up/路径输入/Go/隐藏项/目录导航与 Enter，卸载后 choose 的
  成功/失败/throw 均不写 state 且无未处理 rejection；误命名常量改为 `BROWSE_CAPABILITY_UNSUPPORTED`（值不变）。
  矩阵仍 26 reachable / 2 gap。
- 上一检查点改动（workspaces.browse 接线）: WSL「Open remote folder」的目录枚举由宿主切到服务
  （`workspaces.browse`）：宿主只 discover/connect/验证 `{distribution,user,home}` 并保存 shell 记录，产品
  路径不再调用 `listWslDirectories` 且无兜底。浏览组件采用服务权威路径、latest-wins、失败保留上次清单、
  只读可进入可选、不可打开禁用并显示服务 reason、file/other 不导航、隐藏项仅本地过滤；能力缺失/服务未就绪
  时显示真实原因且零请求。确认目录后保存宿主记录并 `selectWorkspaceView`，由既有 workspaces.open 路径完成
  登记（浏览本身不建 Session/不启 Harness）。矩阵 `workspaces.browse` 改为 PRODUCTION_REACHABLE（EXT），
  汇总 **26 reachable / 2 gap**；G2 改写为接线记录。
- 上一检查点改动（workspaces.archive 接线）: 统一侧栏新增独立的「Archive in AgentBox」：只归档 AgentBox
  Server 的 WorkspaceRecord（不删文件、不隐藏本地行、不删 WSL 宿主记录、不级联 Session/历史、不停止运行中
  任务），与本地 Hide 与宿主 Remove 是三个不同条目。匹配沿用完整 identity + normalized path，且需 service
  ready + hello 声明该能力；应用的 `archiveAgentBoxWorkspace` 只发 exact CAS 请求并返回服务记录、不写 store。
  成功时**先清 neutral selection 再移除服务投影**（测试断言监听事件顺序），防止主聊天立即重新 open；冲突时
  对话框保持打开、投影与选择不变。矩阵 `workspaces.archive` 改为 PRODUCTION_REACHABLE（EXT），汇总
  **25 reachable / 3 gap**；G3 改写为接线记录。
- 上一检查点改动（workspaces.open 接线）: 已有本地/WSL 侧栏选择经 `workspaces.open` 登记为服务权威
  Workspace，并进入服务 Workspace 的新会话草稿（**不建 Session、不启 Harness**）。身份 exact：本地
  `{local,null,null}` + `project.path`（严格取项目自身文件夹；null/空串=无路径项目，不产生 open），
  WSL `{wsl, actualUser, distribution}` + rootPath，path 不改写；匹配要求完整 `{kind,user,host}` +
  normalized path 全等（WSL 含 actualUser，local 必须 host/user 双 null）；
  唯一身份是服务返回的 `WorkspaceRecord.id`（shell row id 不参与命中，直查走显式 `serviceWorkspaceId`）。
  同一 target 单飞、迟到只入服务缓存不切回界面/草稿/选择；provisional shell 草稿经既有
  `migrateSessionDraft` 迁移到服务 scope（目标非空则不覆盖、两边不删除）；能力未声明不发请求并呈现 hello
  reason，失败保留选择与草稿且不无限重试；服务 Workspace 未到前 `sendAvailable=false`。矩阵
  `workspaces.open` 改为 PRODUCTION_REACHABLE（EXT），汇总 **24 reachable / 4 gap**；G1 改写为接线记录。
- 上一检查点改动（pending 恢复顺序返修）: 发送边界顺序修正——已产生 `requestId` 的旧 pending 优先级
  最高，只以原 requestId 调 `sendOutcome.query`；当前草稿的配置 rejected/unavailable、Profile/Workspace
  缺失、附件未 stage、文本不同都不得阻断该恢复（`resolvePendingAgentBoxSend`，单一查询状态机，
  `sendAgentBoxMessage` 内部仍复检 pending 防并发）。生产能力门区分「恢复」与「新建」：有 pending 时
  `sendAvailable` 只要求可调用服务 + `sendOutcome.query` + draftScopeKey，不要求 `config.resolve`、发送
  动词或当前 Profile/Workspace，`onSubmit` 也不因 !workspace 提前返回。`config.resolve` 只在 scope 清空
  后执行——**不是跳过新发送的配置校验**，rejected/typed error 仍不发送。矩阵 23 reachable / 5 gap 不变。
- 上一检查点改动（config.resolve 接线）: 已锁定 `config.resolve` 接入产品路径——application 窄函数
  发 exact `{profileId, workspaceId, overrides}`；发送前强制服务校验（rejected→`invalidControls`
  且零 send，transport/typed 失败零 send）；Composer 预览按 scope/overrides latest-wins 且 hello
  未声明不发请求；`sendAvailable` 收紧为「hello 声明 `config.resolve` + 该路由的发送动词」。矩阵中
  `config.resolve` 由 FIXTURE_ONLY_FRONTEND_GAP 改为 PRODUCTION_REACHABLE（EXT），汇总 **23
  reachable / 5 gap**；G4 改写为接线记录（含原不变量与已执行验收）。
- 上一检查点改动（返修）: 保存成功后除 upsert store 外，`profiles.update` 与 `profiles.updateConfig`
  两次被采纳的服务返回都立即回写本地 `displayName`（服务规范化名称必须显示在输入框、成功后不得
  残留 dirty/Save）；名称输入在保存未决期间进入与配置控件、保存按钮一致的禁用态，避免产生当前
  请求无法携带的新意图。串行 CAS、部分成功保留草稿与「重试只发 updateConfig」语义不变。
- 上一检查点改动: Profiles 页从只读 `config.describe` 升级为可编辑的 Profile 默认配置，接到
  wire-v1 已锁定的 `profiles.updateConfig`（整份替换语义）。生产能力门要求
  `profiles.create`/`update`/`updateConfig`/`archive` 四条齐备，缺任一方法不渲染可保存控件；
  保存提交整份 `values`（未编辑与安全锁定值按服务当前值带回、显式恢复默认的控件省略、模型只发
  exact `{providerId, modelId}`）。改名与配置同时变化时按服务返回的新 version 串行 CAS，
  部分成功保留服务确认的名称/版本与草稿，重试不重发改名；成功后重读 describe 采用服务规范化结果。
- 当前阶段: P00 GREEN；P01 GREEN；**P07 检查点 1–6 完成且 wire 已锁定**；
  P02 A/B1/B2/C（角色页只读→默认配置编辑）/D 与 B3 服务投影已提交；P03 纵切 1–4 已提交；
  P04 切片1–8已提交；**P05 sessions.update 客户端接线已提交（`8cdd1381`）并经服务状态边界返修
  （`86911029`，SESSIONS_UPDATE_CLIENT_READY 以该返修提交为最终依据，P05 仍 IN_PROGRESS）**
- 完成范围: P00；P01 全部返修（真机 27 PASS）；P07 检查点 1（语义映射）、检查点 2
  （wire-v1 候选：17 方法 + schema 测试 + JSON Schema 工件；已消费后端机械反馈并回应）；
  P02A（失败面非阻塞+可关闭、Artifacts 页退役、失败终态竞态修复与真机门）
- 下一项: 按 evidence/P05-client-matrix.md §3-G5b 接 `sessions.archive`（目标文件与不变量已列出，串行扩展
  G5a 已建的行与投影），随后按 P06 收口无模型独立验收；Server lifecycle connection 合同到达后接生产接线。
  不再重新研究协议。
- 阻断: 无真实阻断。剩余 P04 production lifecycle connection 与显式 legacy 消费者收口、
  P05 生产接线核查和 P06 独立验收待续；wire 摘要已锁定，真实全栈仍由后续集成人验证

- contract_semantics_version: core-semantics/1（APPROVED_SEMANTICS，2026-09-14）
- wire_version/schema_digest: wire-v1 WIRE_LOCKED_FOR_IMPLEMENTATION；当前权威
  sha256:11e3b3e70d332585，工件 sha256:5d4fa3bfeec6c327；后端 `c8d9d3c` 以该工件
  29 passed in 67.57s 并登记同一摘要；锁定不替代生产联调
- 合同测试: schema/client/fixture 3 files / 34 tests passed；queue 终态合并面 2 files / 31 tests、
  core fixture 1 file / 10 tests passed；core v1 §9 九组场景矩阵已完整执行；
  真实 wire event stream 与后端投影差异仍是联调项，不以 fixture 伪称服务通过
- UI_READY: 侧栏工作区列表（36R+P01）真机全绿；P02A 真机 8 PASS / 0 FAIL / 1 PENDING
- CONTRACT_CLIENT_READY: wire-v1 客户端/fixture 与 28 方法摘要 LOCKED；production request/event
  transport 已接线，`profiles.updateConfig` 客户端与 Profile 默认配置编辑已接（组件级验证）；
  Server lifecycle connection 来源待正式跨端合同
- REAL_FLOW_VERIFIED: 否（无真实 Server/Harness 链路证据）

- frontend_implementation: PARTIAL（P02A、P02B1、P02B2、P02C1、P02C2、P02D/B3、Profile 默认配置
  编辑、P03 主 route 服务投影与 P05 sessions.update 统一侧栏接线（含 `86911029` 服务状态边界返修）已完成；
  P04/P05/P06 待收口）
- writer_lease: **ACTIVE — Zcode frontend goal**（2026-09-14 接管自 Codex 前端产品 goal；本阶段
  起点 `8973bae8`、工作树 clean，本次返修起点 `de630b35`，完成后停止写入不 RELEASE；后端工作树只读，
  Windows 构建/验收资源串行）

## 测试与基线（接力会话实跑）

- 本地：P02A 相关组件/连接面 3 files / 22 tests passed；合并面 3 files / 31 tests passed；
  改动文件 ESLint 0 error / 0 warning；三项目 typecheck 通过；`git diff --check` 干净。
- Windows P02A：`docs/validation/windows-acceptance-p02a/runs/` 保留 p02a6/p02a7 两轮
  7 PASS / 1 FAIL / 1 PENDING 诊断证据；p02a8 最终 **8 PASS / 0 FAIL / 1 PENDING，exit 0**。
  PENDING 为无可达后端时的健康启动探针；所有失败态非阻塞必需门已执行并 PASS。
- P02B1：3 files / 56 tests passed；改动文件 ESLint 0/0；三项目 typecheck 通过；提交 `91305d8`。
- P02B2：5 files / 76 tests passed；改动文件 ESLint 0/0；三项目 typecheck 通过；
  `git diff --check` 干净。覆盖版本 CAS、v3 迁移、安全附件引用、Workspace 隔离及 WSL 草稿入口。
- P02C1：5 files / 41 tests passed（其中新纵切 3 files / 32 tests）；改动文件 ESLint 0/0；
  三项目 typecheck 通过；`git diff --check` 干净。覆盖不创建 Session、同 Harness 可选约束、
  rejected 保留旧 Profile、迟到描述丢弃、安全锁定控件、Workspace 最近角色与临时配置恢复。
- P02C2：Profiles 全组 3 files / 27 tests passed；与 C1/草稿合并面 4 files / 35 tests passed；
  改动文件 ESLint 0/0；三项目 typecheck 通过；`git diff --check` 干净。覆盖中立只读角色投影、
  Harness 只作数据、维护不可用诚实呈现、版本冲突保留旧投影，以及注入端口只采纳服务返回记录。
- P02D/B3：Settings 4 files / 20 tests、队列能力边界 4 files / 50 tests passed；改动文件
  ESLint 0/0；三项目 typecheck 通过；`git diff --check` 干净。覆盖五类产品设置、旧深链迁移、
  无外围合同时无假操作，以及 hello 单独存在不能重新激活 renderer 本地队列。
- P03 纵切 1：wire send + core fixture + capability 3 files / 17 tests passed；改动文件 ESLint 0/0；
  三项目 typecheck 通过。覆盖首发采纳服务 Session、传输模糊后同 requestId 查询、跨重试不重发、
  新草稿不得越过旧 unknown，以及明确拒绝才释放 pending identity。
- P03 纵切 2：session control + core fixture 2 files / 19 tests passed；改动文件 ESLint 0/0；
  三项目 typecheck 通过。覆盖服务队列替换、withdraw/too-late、stop requested/unconfirmed、approval
  等事件 settle、重复帧、序列缺口、tool 投影、过期 cursor 全量 resync 与持续不可补齐。
- P07 核心覆盖增量：wire/profile/client 4 files / 29 tests passed；改动文件 ESLint 0/0；三项目
  typecheck 通过。25 方法 schema、Profile wire 适配、不透明 Harness 候选与新生成工件已验证。
- P04 宿主纵切 1：Electron 2 files / 5 tests passed；改动文件 ESLint 0/0；三项目 typecheck
  通过。覆盖主进程独占 endpoint/token、IPC 目标约束、typed 401、危险 endpoint、空 slot 禁回落。
- P07 检查点 5：Session/history 合并面 7 files / 55 tests passed；合同核心 3 files / 34 tests；
  改动文件 ESLint 0/0；三项目 typecheck 通过。覆盖重启目录、消息角色/顺序、双 cursor、queue
  event、停止 transport unknown 与 send outcome queue 身份。
- P03 纵切 3：Composer/send 合并面 3 files / 38 tests passed；改动文件 ESLint 0/0；三项目
  typecheck 通过。AgentBox busy follow-up 不 steer/不进本地 queue，draftVersion 贯穿 CAS，
  未 stage 附件在 transport 前拒绝；route composition 与服务 transcript 仍待下一纵切。
- P03 纵切 4：主 route/Workspace/Session/投影合并面 11 files / 64 tests passed；改动文件
  ESLint 0/0；三项目 typecheck 通过。主 route 不装配 Hermes gateway；服务 queue 只 withdraw，
  approval 等事件 settle，旧壳 Workspace id 未经环境+路径证明不得作为 wire id。
- P04 宿主纵切 2：事件 IPC + route 投影 3 files / 18 tests passed；改动文件 ESLint 0/0；
  三项目 typecheck 通过。IPC/preload 保持帧不透明，renderer 先作 wire schema 校验；非法帧不入
  reducer，gap 请求 history resync，route 与 source 均有 cleanup。真实事件源仍待 lifecycle 接线。
- P07 检查点 6：queue 终态合并面 2 files / 31 tests、core fixture 1 file / 10 tests passed；
  renderer TypeScript、受影响文件 ESLint、schema 一致性与 diff check 通过。活动快照拒绝终态，
  终态事件移除活动投影；新摘要待后端登记。
- P04 宿主纵切 3：WorkCore 2 files / 13 tests passed；Electron typecheck、受影响文件 ESLint、
  Prettier 与 diff check 通过。supervisor 单飞协调六动词、null resolve 不 fallback、readiness 失败
  回收 owned process，shutdown/晚到启动不能发布 ready；production artifact/plan 仍待正式合同。
- P04 宿主纵切 4：gateway boot 1 file / 48 tests passed；三项目 typecheck、受影响文件 ESLint 与
  diff check 通过。产品 composition 在读取 Hermes bridge 前关闭 legacy autostart；gateway 不伪造
  open，旧 boot overlay 退出，AgentBox availability 保持独立。
- P04 宿主纵切 5：product runtime policy + main-window lifecycle 2 files / 7 tests passed；Electron
  typecheck、受影响文件 ESLint、Prettier 与 diff check 通过。正常 createWindow 对 AgentBox runtime
  调 legacy starter 0 次；仅显式 legacy 分支保留，不伪造 AgentBox ready。
- P04 宿主纵切 6：事件 IPC 1 file / 4 tests、AgentBox chat 1 file / 8 tests passed；三项目
  typecheck、ESLint（0 error，仅既有 formatting warnings）与 diff check 通过。订阅按 sender、Session、
  cursor 隔离；gap 先退订后补水，逐帧 cursor 不重连，源异常/销毁/同步 gap 均不会泄漏 cleanup。
- P04 宿主纵切 7：event transport 1 file / 11 tests passed；Electron typecheck、ESLint、Prettier 与
  diff check 通过。动态读取 main-only connection，Bearer 仅在 WS upgrade header，限制 loopback；
  不重连、不解释 frame、不回落 Hermes。production connection slot 仍待正式接线。
- P04 宿主纵切 8：composition 1 file / 4 tests；HTTP/WS/IPC 跨模块 4 files / 22 tests passed；Electron
  typecheck、接线文件 ESLint 0/0 与 diff check 通过。HTTP/event 共用动态 main-only slot，main 注册
  production seam 并在 will-quit 清理；slot 初始 null，不猜 Server 端口/argv、不回落 Hermes。
- P02/P05 模型控件中立化：AgentBox composer controls 1 file / 10 tests passed；desktop 三项目
  typecheck、改动文件 ESLint 0/0 与 diff check 通过。主聊天区不再显示 Hermes 模型 pill 或读取
  legacy model-loading 状态；动态 descriptor（含 model_slot）仍是产品配置权威，legacy route 不变。
- P05 Provider/Model：application 端口 2 files / 6 tests；目录/Composer/Settings 合并门 7 files /
  36 tests passed；desktop renderer/electron/e2e 三项目 typecheck 通过；全部受影响 TS/TSX ESLint
  0 error / 0 warning，diff check 干净。覆盖 capability 缺失、缓存保留/single-flight、带斜杠 id、
  opaque Harness 隔离、多 model_slot、服务当前值、模型多行增删、防双发、CAS/引用冲突与服务返回投影。
- Profile 默认配置编辑（dfcd7027）：定向门 4 files / **29 tests passed，exit 0**
  （`src/application/profile/profile-maintenance-port.test.ts` 3、
  `src/application/provider-model/wire-provider-model-catalog.test.ts` 3、
  `src/features/profiles/index.test.tsx` 13、`src/features/profiles/profile-config-editor.test.tsx` 10）；
  相关回归面 5 files / 23 tests passed（composer profile-controls、wire-composer-profile、
  agentbox-model-settings、settings 首页、composition surfaces）；`npm run typecheck` 三项目通过；
  改动 13 个文件 ESLint 0 error / 0 warning；`git diff --check` 干净。覆盖四方法能力门、
  描述式控件（enum/string/boolean/model_slot 均可编辑并按其值发送）、整份 values（保留未编辑/锁定、
  省略恢复默认、exact 模型引用与带斜杠 id）、
  双 model_slot 独立编辑、unavailable 禁选与目录外当前值、CAS 顺序 update(N)→updateConfig(N+1)、
  部分成功重试不重发改名、pending 连点单发、服务规范化后采用返回 descriptor、迟到 descriptor 不串写。
- sessions.update 生产接线（8cdd1381）：验收 `npx vitest run --project ui
  src/application/session/wire-session-catalog.test.ts
  src/application/session/agentbox-session-projection.test.ts src/store/agentbox-service.test.ts
  src/features/chat/sidebar/agentbox-sessions/agentbox-session-list.test.tsx
  src/features/chat/sidebar/agentbox-sessions/agentbox-session-row.test.tsx
  src/features/chat/sidebar/unified-workspace-list.test.tsx
  src/features/chat/sidebar/workspace-list/workspace-row.test.tsx
  src/app/composition/wiring/agentbox-session-commands.test.ts` → **8 files / 76 tests passed，exit 0**；
  相关回归 5 files / 70 tests passed（agentbox-main-chat、agentbox-chat-view、sidebar workspace assembly、
  agentbox-composer、wire-send）；`npm run typecheck` 三项目通过；改动 24 个 TS/TSX 文件 ESLint 0 error /
  0 warning；`git diff --check` 干净。覆盖：投影隔离/排序、v7→v6 不覆盖、部分页保留、本地与 WSL 投影接管、
  空/loading 不回落 legacy、打开顺序与零 create/send/open 调用、改名 exact CAS/唯一 requestId/规范化回写/
  conflict 保留草稿/pending 连点单发、置顶 exact CAS/无 optimistic/成功排序/失败保持/高 version 采纳、
  命令 route 权威与 fail closed、非 Session route 行为不回归；测试内无 SessionRecord→SessionInfo 转换与
  源码文本断言。
- sessions.update 服务状态边界返修（86911029）：验收 `npx vitest run --project ui
  src/features/chat/sidebar/agentbox-sessions/agentbox-session-list.test.tsx
  src/features/chat/sidebar/unified-workspace-list.test.tsx` → **2 files / 46 tests passed，exit 0**
  （新增 12 例）；要求的相关回归 6 files / 40 tests passed（agentbox-session-row、workspace-row、
  project-menu、agentbox-session-commands、wire-session-catalog、agentbox-service）；扩大扫
  `src/features/chat/sidebar` + `src/i18n` 34 files / 252 tests passed；上一检查点同口径回归
  5 files / 70 tests passed；`npm run typecheck` 三项目通过；改动 11 个 TS/TSX 文件 ESLint 0 error /
  0 warning；`git diff --check` 干净。覆盖：本地/WSL 缓存行跨 ready→unavailable 保持归属、legacy 预览
  各相位均不出现、unavailable detail 纯文本与空值本地化 fallback、无缓存 unavailable 不显示 spinner、
  loading/catalog 未 ready 与缓存行并存、归档入口在旧 hello + unavailable 下消失且零 archive 调用、
  恢复 ready 后维护入口回归且无重复行、既有 CAS/conflict/pending 断言不降级；新增断言在修复前
  10 failed / 36 passed（临时以 `git show HEAD:` 还原组件复跑，未改仓库）。
- 远端保存迟到响应返修（4a057609）：验收 `npx vitest run --project ui
  src/features/workspace/agentbox-workspace-browser.test.tsx
  src/features/workspace/wsl-workspace-wizard.test.tsx` → **2 files / 33 tests passed，exit 0**；扩大门
  （+ wire-workspace-browser、latest-wins）**4 files / 40 tests passed，exit 0**；相关门（wire-workspace-catalog、
  agentbox-main-chat、unified workspace list）3 files / 63 tests passed；`src/features/workspace` +
  `src/features/chat` 96 files / 673 tests passed；`src/application/workspace` + `src/app/composition`
  12 files / 145 tests passed；`npm run typecheck` 三项目通过；改动 4 个 TS/TSX 文件 ESLint 0 error /
  0 warning；`git diff --check` 干净。
- workspaces.browse 生产接线（a8142125）：验收 `npx vitest run --project ui
  src/application/workspace/wire-workspace-browser.test.ts src/application/workspace/latest-wins.test.ts
  src/features/workspace/agentbox-workspace-browser.test.tsx
  src/features/workspace/wsl-workspace-wizard.test.tsx` → **4 files / 31 tests passed，exit 0**；
  相关回归 5 files / 90 tests passed（wire-workspace-catalog、wsl-workspace-usecases、agentbox-main-chat、
  unified workspace list、sidebar workspace assembly）；`src/features/chat` + `src/features/workspace`
  96 files / 664 tests passed；`npm run typecheck` 三项目通过；改动文件 ESLint 0 error / 0 warning；
  `git diff --check` 干净。
- workspaces.archive 生产接线（f6b457b5）：验收 `npx vitest run --project ui
  src/application/workspace/wire-workspace-catalog.test.ts
  src/features/chat/sidebar/unified-workspace-list.test.tsx
  src/features/chat/sidebar/workspace-list/workspace-row.test.tsx
  src/features/chat/sidebar/projects/project-menu.test.tsx` → **4 files / 45 tests passed，exit 0**；
  相关回归 5 files / 67 tests passed（agentbox-main-chat、agentbox-service、sidebar workspace assembly、
  workspace-view、wsl-workspace-usecases）；`src/features/chat` 全目录 94 files / 640 tests passed；
  `npm run typecheck` 三项目通过；改动文件 ESLint 0 error / 0 warning；`git diff --check` 干净。
- workspaces.open 生产接线（3e207376）：验收 `npx vitest run --project ui
  src/application/workspace/wire-workspace-catalog.test.ts src/store/agentbox-service.test.ts
  src/app/composition/wiring/agentbox-main-chat.test.tsx src/features/chat/agentbox-chat-view.test.ts`
  → **4 files / 55 tests passed，exit 0**；相关回归 4 files / 59 tests passed（agentbox-composer、
  wire-send、sidebar workspace assembly、composer store）；`src/features/chat` 全目录 94 files /
  627 tests passed；`npm run typecheck` 三项目通过；改动文件 ESLint 0 error / 0 warning；
  `git diff --check` 干净。覆盖本地/WSL exact payload、created=false 采纳服务 id、同 path 不同环境不互认、
  shell id 与无关 wire id 相同不误命中、服务已有记录不 open、单飞、迟到 A/B、capability/失败处理、
  provisional→authoritative 草稿迁移（含目标非空不覆盖）、无自身文件夹的项目（含其有 repo 路径者）与
  Home bucket/空路径均不 open、Session route 不 open；身份匹配返修后同 distro/path 的错 user 记录不误命中、
  只有错 user 时仍 open 且 payload user 精确、exact user 命中时 open 零调用。
- pending 恢复顺序返修（b6d0bc6f）：`npx vitest run --project ui
  src/application/session/wire-send.test.ts src/application/session/agentbox-composer.test.ts
  src/app/composition/wiring/agentbox-main-chat.test.tsx src/application/profile/wire-composer-profile.test.ts
  src/features/chat/composer/hooks/use-composer-profile.test.tsx
  src/features/chat/composer/profile-controls.test.tsx` → **6 files / 62 tests passed，exit 0**；
  回归面（composer 全目录 + legacy chat view + agentbox chat view）44 files / 265 tests passed；
  `npm run typecheck` 三项目通过；改动 6 个 TS/TSX 文件 ESLint 0 error / 0 warning；
  `git diff --check` 干净。覆盖 pending 优先于配置与草稿校验（调用序列严格 `['sendOutcome.query']`）、
  旧 accepted 不清新草稿、unknown 保持同一 requestId、rejected 清 pending 保留草稿、恢复/新建/缺 query
  三种能力门，以及无 pending 时 resolve→send、rejected、typed error 的回归。
- config.resolve 生产接线（940c9df4）：`npx vitest run --project ui
  src/application/profile/wire-composer-profile.test.ts src/application/session/agentbox-composer.test.ts
  src/features/chat/composer/profile-controls.test.tsx
  src/app/composition/wiring/agentbox-main-chat.test.tsx
  src/features/chat/composer/hooks/use-composer-profile.test.tsx` → **5 files / 47 tests passed，exit 0**；
  回归面（composer 全目录 + legacy chat view + agentbox chat view）44 files / 264 tests passed；
  `npm run typecheck` 三项目通过；实际改动 18 个 TS/TSX 文件 ESLint 0 error / 0 warning；
  `git diff --check` 干净。认证 resolve→send 顺序、同一 overrides 快照、rejected 全原因零 send、
  transport 失败零 send、latest-wins、切 scope 迟到保护、capability 零请求、预览 UI 四态。
- P05 客户端矩阵审计（只读，本阶段文档检查点）：`WireMethods` 键数 28；矩阵 28 行与
  `WireMethods` 排序逐项比较全等（无重复/遗漏/多余）；每行恰好一个合法状态，脚本计数
  22 `PRODUCTION_REACHABLE` + 6 `FIXTURE_ONLY_FRONTEND_GAP` = 28，与表格声明一致；摘要与后端登记
  一致（TS `11e3b3e7…c10035`、工件 `5d4fa3bf…5e4ed`）；`git diff --check` exit 0。本阶段无生产代码
  变化，未跑完整套件/Windows，未装依赖。前端缺口（只登记不修）：`workspaces.open`、
  `workspaces.browse`、`workspaces.archive`、`config.resolve`、`sessions.update`、`sessions.archive`。
- Profile 权威名称回写返修（af0c08e3）：`npx vitest run --project ui
  src/features/profiles/index.test.tsx src/features/profiles/profile-config-editor.test.tsx
  src/application/profile/profile-maintenance-port.test.ts` → **3 files / 27 tests passed，exit 0**
  （Profiles 页 14 + 编辑器 10 + 端口 3）；`npm run typecheck` 三项目通过；改动 2 个文件
  ESLint 0 error / 0 warning；`git diff --check` 干净。新增/加强 3 个行为测试：rename-only 服务
  规范化（store 与输入框均显示返回值、Save 消失、update 仅 1 次）、改名成功而配置失败（规范化
  名称 + 草稿保留、重试只发 updateConfig 且用 update 返回的 version、update 仍仅 1 次）、pending
  （Name/配置输入与保存按钮均禁用、连点只 1 次服务调用）。变异校验：移除回写后恰好这 3 个测试
  失败（11 passed / 3 failed），恢复后 14/14 通过。

## 测试与基线（上一执行者交接时点，历史）

- 本地（WSL，`3a25edc` + 未提交改动）:
  - `npx vitest run --project ui src/components/boot-failure-overlay.test.tsx
    src/components/desktop-install-overlay.test.tsx src/components/onboarding src/store/boot.ts`
    → 3 files / 29 tests passed，exit 0
  - `npx vitest run --project ui src/components/boot-failure-overlay.test.tsx` → 11/11
  - `npm run typecheck`（renderer+electron+e2e 三项目）→ 0 error
  - `npx eslint`（本轮改动文件）→ 0 error / 0 warning
  - `git diff --check` → 干净
  - 更早基线：P01 期间 sidebar 全量 241 项、store 全量 1465 项、app+lib 1886 项通过；
    层序守卫 15/16，唯一失败 = 已知环境基线（`leaves no in-flight exclusion stale`，
    IN_FLIGHT 含 agentbox 而干净树无 `src/agentbox/`；未复制 POC、未删守卫、账本 md5 不变）
- Windows 真机:
  - P01：`docs/validation/windows-acceptance-round36r-p01/`，executed 27 →
    PASS 27 / FAIL 0 / SKIP 2 / PENDING 1，exit 0
  - P02A（切片 1–2 + 部分 3）：`docs/validation/windows-acceptance-p02a/`（p02a4），
    executed 9 → PASS 7 / FAIL 2，**2 项 FAIL 均为驱动断言问题，非产品缺陷**：
    ① 面板断言依赖本地化文案（已改稳定钩子，未重跑）；② 无后端沙箱下 healthy 探针被
    boot 连接遮罩挡住（已改为等遮罩清空或如实 PENDING，未重跑）
  - Windows 构建树 `C:\Users\maoqh\agentbox-wsl-round1` 已同步切片 3 的源码
    （onboarding 门控修复 + 面板/关闭钩子 + 新驱动，三文件 md5 与 WSL 一致），
    dist 已于源码之后重建（index.html mtime 09:14:17 > 源码 09:13:49）；
    **驱动重跑被暂停中止**（p02a5 acceptance-out 为空，未入库）→ 接手者只需跑驱动，不必重建
- 中间产物（本轮可证归属，保留备查不对外引用）：`C:\Users\maoqh\agentbox-wsl-p02a{,2,3,4,5}-sandbox`
、`/home/maoqh/p01r{4,5,6,7}-run.log`、`apps/desktop/test-results/`（gitignored）
- 网关状态: 隔离网关 `127.0.0.1:9127` 当前**未运行**（curl 连接被拒）；需要健康启动真机证据时
  按 36R 文档启动 `"$HOME/wsl-round1-gateway-home/start-gateway.sh"`（不碰用户真实配置）

## 工单状态（实际进度）

调度维护：已消除P06“等用户体验才交接”的歧义；核心wire通过contracts/index规定的后端
wire-review.md通道自39阶段协调。执行者下个检查点消费这些规则，不覆盖本端已有进度。

| 工单 | 状态 | 前置 |
| --- | --- | --- |
| P00 接管与基线 | GREEN | 旧Desktop会话无并发写入（evidence/P00.md） |
| P01 36R收口 | GREEN | 真机 27 PASS/2 SKIP/1 PENDING（evidence/P01.md；本地打开 PENDING 转 P05） |
| P02 上层产品 | IN_PROGRESS（A/B/C/D 主面与服务投影完成；Profile 默认配置编辑、Workspace 选择登记与统一侧栏服务 Session 投影/改名/置顶已接（含 `86911029` 服务状态边界返修：缓存归属跨 loading/unavailable 保持）；矩阵 27 生产可达 / 1 前端缺口） | P01 已满足 |
| P03 用例状态与API | IN_PROGRESS（主 route 生产调用者与 event reducer 接入已完成；真实 Server 源待 P04） | 与 P02 穿插 |
| P04 宿主与遗留退役 | IN_PROGRESS（production request/Session-event transport + IPC + supervisor；正常冷启动 Hermes 自动门已退役，Server connection合同待后端） | 与 P03 穿插 |
| P05 正式合同接入 | IN_PROGRESS（SESSIONS_UPDATE_CLIENT_READY，以返修提交 `86911029` 为最终依据；28 方法矩阵：27 生产可达 / 1 前端缺口；`config.resolve`、`workspaces.open`、`workspaces.archive`、`workspaces.browse`、`sessions.update` 已接；唯一剩余前端缺口 sessions.archive；lifecycle 外部缺口待续） | wire 双端锁定 |
| P06 前端验收与交接 | IMPLEMENTATION_HANDOFF_GATE | 本端独立范围完成；真实全栈门由后续集成人负责 |
| P07 核心合同与状态交接 | 检查点1–6已提交；WIRE_LOCKED | 28 方法双端摘要一致；fixture/客户端已锁定 |

## 测试与证据基线（本轮实跑）

- 本地：sidebar 全量 241 项通过（含 3 条 P01 装配反例）；三项目 typecheck exit 0；
  改动文件 eslint 0/0；层序账本 md5 57011a54… 逐字节不变；层序守卫 15/16，
  唯一失败=已知环境基线（IN_FLIGHT 含 agentbox，干净树无 src/agentbox/），未复制 POC。
- Windows：`docs/validation/windows-acceptance-round36r-p01/`（p01r7，exit=0，
  24 截图+log）；36R postfix 旧证据原样保留；r1–r6 迭代失败史见 evidence/P01.md §3。

初始36R基线39291df，整体PARTIAL。38研究READY_FOR_DECISION，不是Harness生产依赖批准。
不继承旧GREEN，不因工单文件存在宣称功能已交付。
