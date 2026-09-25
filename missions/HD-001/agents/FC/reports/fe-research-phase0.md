# FC Phase 0 研究汇合 — 2026-09-23（基线 85cc3cd014，clean）

## 1. 参考产品核实结论
- 用户所称"最新开源 zcode Desktop"**未找到开源仓库**：本机 /opt/ZCode 为 deb 打包 Electron 应用，app-update.yml 指向 localhost（本地更新设施），app.asar 内 2000+ GitHub URL 全部是依赖仓库（opentelemetry/babel/tailwind 等），无产品自身仓库指针；网络公开资料（GitHub issue、官方站 zcode.z.ai、媒体）一致称 ZCode 3.0+ 为闭源桌面应用。
- 处置：按 PLAN 如实记录；ZCode 只作交互/布局风格参考（观察本机运行实例），不作为代码来源。风格借鉴的代码级参考落在 Codex（openai/codex，Apache-2.0）与已采用 MIT 库上。
- 证据：本报告 + agents/FC/reports/reuse.md"参考产品"行。

## 2. 本树现状（亲读关键源码）
- 底座：@lumino/coreutils 2.2.3 PluginRegistry（desktop-host runtime：requires/provides 解析、phase 状态机、OwnedResources 作用域释放）+ @ordessa/extension-api（Token/Contributions/ResourceScope）+ extension-loader（preload catalog）。
- 契约：foundation-contracts（Commands/Workbench/Settings，五区 Region、statusbar/navigation/toolbar 槽位、full-page 呈现）；agent-ui-contracts（AgentConnections/AgentSessions/AgentClient/InteractionAnswer、Availability、RunStatus 含 unknown/stop-requested）。
- 扩展：commands/workbench/settings（基础）+ agent-connections（连接器注册表）+ agent-sessions（client 持有/当前选择/重连）+ agent-pi、agent-codex（真实进程适配器，native 主进程）+ agent-conversation（assistant-ui）+ agent-interactions（审批/输入卡）。
- 构建：extensions/build.mjs 产出 11 个带 manifest 的包；product.json 默认只开基础四件，agent-preview.json 打开全部 agent 扩展（预览态）。
- 测试：vitest 串行（--maxWorkers=1）单测 + test-agent-{ui,shell,process} 脚本 + Electron smoke（隔离 userData，测试专用 --no-sandbox）。

## 3. 与章程的差距清单（FE 面）
1. Harness 二级选择：现有"连接列表+选择"在会话面板左栏，需按章程做成连接区的临时二级选择，且**运行/待审批时禁切**（以 AgentSnapshot.runs(starting/running/stop-requested) 与 interactions(pending/responding) 服务事实为闸，不由页面状态猜）。当前 selectConnection 无此闸。
2. 独立会话 vs 项目会话：契约与 UI 均无项目概念；需要轻量项目选择（目录权威在后端，FE 不自管目录），会话创建区分两类。
3. 同一 Harness 内多会话已支持（sessions 列表），但"切换≠取消"的展示语义需在 F3 统一（当前切会话只是换 key 重挂 Thread）。
4. 审批不强制占右栏：interactions 当前独立面板；落点（对话区内联/右栏/底部）由 F3 出方案，禁止为无业务区域扩 UI。
5. 隐藏 model/provider/思考强度入口：conversation 的 options 区当前直读 agent.options 全量渲染；需按能力/身份过滤（options 白名单或 availability 规则），不给模型/Provider/思考强度入口。
6. 断连语义已有契约基础（connection.status/error、RunStatus.unknown、断连提示文案），需 F3 验证旧事件隔离（切换/重连后不串会话事件）。

## 4. 统一状态方案（初稿，覆盖 PLAN 要求的 7 态）
- 未连接：主区占位（现有 Choose a connection），左栏连接器列表空态给出"在本地扩展列表启用适配器"指引。
- 选Harness：连接区二级选择器（连接器身份≠连接实例）；选择即 connect；run/pending 闸禁用并说明原因；connectingId 显示过渡态。
- 独立会话：New session 直建，执行目录=默认明确目录（与 BC 对齐后端权威值）。
- 项目会话：先选项目（后端权威列表/目录）再建会话；会话条目带项目 detail。
- 运行：会话头运行状态徽标（starting/running/stop-requested/unknown 如实显示），流式文本/思考(可折叠)/工具卡（按 toolCallId 合并——已修复语义）；停止按钮区分"请求停止"与"已确认取消"。
- 审批：交互卡（approval/choice/confirm/input/editor，pending 才可操作，responding/expired/unknown 状态如实）；落点由 F3 提案，不强制右栏。
- 断连：连接横幅+"运行结果未知"提示；重连保留同连接实例身份，不静默新建会话；跨会话事件隔离测试纳入 CP4。

## 5. FE-PREP 迁移映射建议（F0 核对后报 C 批）
- apps/desktop/src → apps/desktop/renderer；electron/* 保留 apps/desktop/electron。
- packages/extension-api → platform/extension-api；extension-loader → platform/extension-loader；desktop-host+electron 侧 extension-protocol/extensions 装载 → platform/extension-host；electron/native-bridge → platform/native-bridge。
- foundation-contracts 拆 → contracts/{workbench,commands,settings}；agent-ui-contracts 拆 → contracts/{connections,agent}。
- extensions/{commands,workbench,settings} → plugins/foundations/*；agent-connections → plugins/connections/{service,status}；agent-{sessions,conversation,interactions} → plugins/agent/*；agent-{codex,pi} → plugins/connectors/*。
- extensions/{product.json,agent-preview.json} → products/agent-desktop/（新增 extensions.lock.json 由构建生成）；extensions/build.mjs+apps/desktop/scripts → tooling/；extensions/shared → plugins 间共享小件（随 F0 定夺，不进宿主）。
- 旧测试按所有者迁回各包；保留应用级集成门（host/foundation/loader 测试 + smoke-electron）。
- assistant-ui 从 devDep 转正式依赖（conversation 运行时实际使用）。

## 6. 跨包请求（待 BC/C）
- 后端权威项目目录接口事实（F2×S 接缝，F1 已被 COORDINATION 允许与 S 直连技术消息并 CC FC/BC）。
- Harness 切换闸的权威事实源（runs/interactions 来自 AgentSnapshot，需 BC 确认后端不产生跨 Harness 混排事件）。
- Codex/Pi 版本升级策略不在本轮范围；generated 快照换版须重生成复查（已在复用账注明）。

## 7. FC 亲读补充：Harness 切换闸的服务事实核查（2026-09-23）
- extensions/agent-pi/src/client.ts 与 extensions/agent-codex/src/client.ts 均在快照中按 run id 维护 `runs`、按 interaction id 维护 `interactions`，且 run/interaction 均带 `sessionId`；Codex 打开历史时按 thread.turns 回填各 turn 的 run 状态。
- 断连语义两实现一致：pending/responding 交互置 `unknown`，stop 请求不推定取消（RunStatus.stop-requested 独立存在）。
- 结论：切换闸谓词可纯由 AgentSnapshot 计算——`任一 run.status ∈ {starting, running, stop-requested} 或任一 interaction.state ∈ {pending, responding}` 即锁定 Harness 切换；注意必须扫描全部 run（conversation 视图当前只取当前会话最后一个 run 作展示，不能直接复用为闸谓词）。已写入 FC-0003 供 F1 核实。

## 8. 验证方式
- 静态：vitest 串行全绿 + tsc --noEmit；构建三链（foundations/examples/desktop）。
- 集成门：smoke-electron 隔离 userData。
- 真实链路：CP1–CP4（C 预算闸开后才做 M 级真实调用），FE 侧以成套 SHA+契约版本交付。
