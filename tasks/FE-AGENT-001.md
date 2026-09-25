# FE-AGENT-001 — Native agent desktop extensions

状态：方案与用户启动交接；尚未启动执行者。2026-09-22。

## 目标与授权

用户批准：在现有最小 Desktop 上实现第一批服务级扩展，直接接 Codex 和 Pi，完全不使用 Ordessa 后端。同一套上层 UI，通过切换连接使用两者。先完善局部方案，再实施，不重复进行长轮架构研究。

唯一产品写入树：`/home/maoqh/projects/ordessa/worktrees/desktop-minimal`。
分支 `work/desktop-minimal-0`，起点 `3f8b0647e4c4c665cdd9bcdf7105901398d62739`。
启动时重新核对 HEAD、dirty、写入者；若有新变化先识别，不 reset/清理/覆盖。
本任务由用户新开的一个会话独占实施，I 不并写产品。无需再造工作树或调度器。
报告唯一目录：`/home/maoqh/projects/ordessa/control/reports/FE-AGENT-001/`。

允许范围内代码、测试、文档、显式路径本地提交；不 push、不改 publishing main、不动后端和其他工作树。不得启停用户已有服务或现有 Agent 会话。

## 第一硬门：不得从零实现已有轮子

每个组件/子系统必须先完成复用调查，再实施。优先级：
1. 使用本仓已有接口/组件或成熟库；
2. 采用官方 SDK、生成类型、官方示例；
3. 移植或改造许可证兼容的开源实现，并保留归属、来源、版本和修改说明。

不得在没有调查的情况下自己写一个，再补一个链接称为“参考”。不得仅模仿截图冒充代码复用。必要的注册、类型转换、数据绑定、测试属于胶水，但必须说明为什么现成实现不能直接覆盖，并依托已记录的实现模式；不能把完整新子系统叫作胶水。

先写 `reuse-map.md`：组件 → 来源 URL/本地路径 → 固定版本或 commit → 许可证 → 直接依赖/移植/参考实现 → 保留/修改内容 → 验证方式。不能找到合适复用或参考来源的组件，记录具体缺口并反馈 I；继续其他可做项，不能擅自从零造。
不得自研聊天 runtime、Markdown/高亮引擎、RPC 框架、进程管理平台、通用表单库、插件调度器、Agent loop。

## 已有证据与必须阅读材料

- 工作树 AGENTS.md、README.md。
- `control/reports/FE-BASE-REUSE-001/agent-ui-reuse-probe.md`。
- `examples/agent-ui-probe/README.md` 及源代码/测试；其状态是验证夹具，不能当生产适配器。
- `extensions/{commands,workbench,settings}`、`packages/foundation-contracts` 的真实接口。

已验证 assistant-ui 0.15.21 的 ExternalStoreRuntime 与本宿主可独立加载，45 单测/9 Electron 检查通过。它是对话扩展私有依赖，不进入共享 Agent 契约；夹具“切会话取消运行”“同步确认取消”不准照搬到产品。

2026-09-22 已打开的官方来源：
- Codex App Server：https://learn.chatgpt.com/docs/app-server
  默认 stdio；官方页将 TCP WebSocket 标为 experimental/unsupported。可从安装版本生成 TypeScript/JSON Schema。执行者须复核本机版本支持面，不能照最新文档猜协议。
- Pi RPC：https://pi.dev/docs/latest/rpc
  文档链接 `src/modes/rpc/rpc-client.ts`、`test/rpc-example.ts`、`examples/rpc-extension-ui.ts`；优先实际阅读/复用。SDK 嵌入是备选，不能为使用 SDK 顺手重建 harness。按本机版本固定仓库与包名，不把 latest 的包迁移假定为本机事实。
- assistant-ui：https://www.assistant-ui.com/docs/runtimes/custom/external-store

上述来源不是许可移植的自动批准：具体文件许可证、版本与兼容性必须核实。

## 目录与边界（完善时可小幅调整并说明理由）

```text
packages/
  agent-ui-contracts/       共享最小语义与服务 Token，不引用 assistant-ui/Codex/Pi
  agent-client-state/       如现有库不足才抽取的共享投影/订阅胶水；不得复制双份
  agent-native-bridge/      受限原生传输，依官方客户端/示例，不含会话业务
extensions/
  agent-connections/       接入实例登记/选择、连接状态、非秘密连接设置
  agent-sessions/          会话列表、新建、打开、切换、恢复
  agent-conversation/      assistant-ui 消息/输入/工具呈现、会话选项
  agent-interactions/      待处理确认/审批/补充输入，复用现有 UI 原语
  agent-codex/             Codex 协议转换、能力声明、版本兼容
  agent-pi/                Pi 协议转换、能力声明、版本兼容
```

目录不是强制空包指标。`agent-client-state` 能直接用现有状态库组合就不自造状态机框架。
原生侧与渲染侧必须有独立入口；不能把 Node/进程客户端打进 renderer。
两适配器注册同一个连接服务，允许同时登记；不得争抢同一个单提供者 Token。
复用 Lumino/ResourceScope 的生命周期与贡献机制，不新增一套插件系统。
不改 app.tsx 引入业务；通过清单加载。新增第三个接入只需加适配器及启用配置，不改共用 UI。

原生扩展入口是现有仅渲染扩展机制的真实缺口：先查成熟 Electron 受限桥实现，写清需要的最小 host 变更。允许为本任务增加窄的、可卸载的传输接口；不允许通用任意执行 IPC、任意文件读取、关闭 sandbox/contextIsolation 或把品牌进程管理硬塞入 main.ts。品牌参数与协议留适配器。

## 接入路线

Codex：优先原生 App Server；stdio 可由受限 Electron 原生桥持有本任务新起子进程。若用已有服务，明确连接与进程所有权，不结束外部服务。网络模式必须核实版本/风险并限定本地，不默认监听公网。
Pi：优先复用官方 RPC 客户端与协议；只有 stdio 时不承诺“网页直接连”，由同类原生桥承载。不得写自己的 Agent loop。无需创建 Ordessa Server，也不强制两家改成 ACP。
同一实例的请求响应、通知和服务端交互分别处理；固定关联 ID，处理超时/断开/重连，禁止对非幂等发送自动重试。

## 本批用户能力

1. 选择 Codex/Pi 连接；显示连接状态/错误，手动重连入口。
2. 会话列表、新建、打开、切换、恢复。以服务为权威；Pi 若缺历史枚举，先查官方 SessionManager 等实现，不能手写扫描器或把仅本应用已知会话伪称完整历史。
3. 连续对话、流式、服务实际公开的思考/推理内容、工具调用及结果、停止。
4. 对端支持的审批、确认、补充输入；保持交互语义与可选项，明确不支持。Pi 的扩展 UI 请求不等于工具审批；不能伪造统一权限控制。
5. 对端声明的模型/模式等会话选项；复用类型化控件，不做 Provider/凭据配置管理。
6. 明确展示空、错误、断连、未知和未确认，不把按钮请求成功当执行成功。

不做附件/图片、Profile、Provider 管理、MCP/Skill 管理、文件树、终端、Git 面板、对话分支或编辑重试。

## 语义与复用验收

- 会话切换不等于取消；停止请求发出不等于停止确认；断连不等于失败或成功。
- 连接/会话/轮次/工具调用/交互请求分别标识；重连与换会话不能混入迟到事件。
- 共享接口只定义所需状态/操作/订阅/能力声明。不含品牌字段分支，不直接暴露 assistant-ui types。
- 不支持/未知/暂不可用区分；不支持的动作不注册。未知协议事件可诊断，不偷偷吞掉终态/交互请求。
- 普通文本/JSON 是安全回退，不执行服务提供的 HTML/JS；交互响应一次性、与正确实例和请求绑定。
- 流式、工具、Markdown/代码等优先复用库及官方示例，组件呈现和服务权威状态分离。
- 两适配器跑同一份契约一致性测试；上层同一构建，切换连接而非改 UI 代码。

## 执行顺序，不停在方案交付

M0：核对现场/版本，完成 reuse-map 与能力矩阵、原生桥最小方案。范围内完善后直接实施；遇到复用无来源或需扩权才报 I。
M1：共用组件 + 第一个接入（建议 Codex），协议夹具验证到桌面；不为第一家定死公共协议。
M2：加入 Pi，用真实差异修正通用契约，禁止 UI 品牌 if；重跑两家同一测试矩阵。
M3：隔离 Electron 验证与启动说明；提供两端真实联调操作步骤，登记真实测试权限缺口。
每阶段更新 status.md：当前 SHA/改动、完成证据、下一步、真正阻塞。阶段提交是检查点，不自动结束任务；只剩需用户权限的事才明确交接，不假称后台等待。

## 安全与测试权限

当前直接授权是实现和离线/模拟协议测试。真实模型付费调用、使用用户登录态/凭据、访问真实项目数据不因本任务自动获批。准备好真实联调入口后通过 I 申请一次具体范围（Agent、目录、操作、调用上限），或由用户亲自验收。
不得读取/打印/复制凭据，日志脱敏。可检查 CLI 版本/help、生成协议类型；不要以握手探测为由静默读取用户会话历史或加载其不可信插件。测试子进程用隔离配置与临时数据，只清理自身明确创建的资源。
本任务范围内允许补充窄桥实现和测试，不得扩大到后端改造；不覆写 `.local-desktop/extensions.json`。提供可选择的独立产品配置/预览入口，不悄悄改变用户当前会话。
串行测试，禁止并行大构建。保留已知依赖漏洞记录，不擅自 force 升级。

## 完成交付

reports 下：`plan.md`（完善后的包边界）、`reuse-map.md`、`capability-matrix.md`、`verification.md`、`status.md`。
工作树内：实现、契约测试、真实 Electron 测试、来源/许可证、用户启动说明与两个接入步骤。
验收矩阵至少覆盖两轮对话、工具、终态、停止未确认/确认、运行中切会话、历史恢复、断连、迟到事件、交互重复/过期、卸载清理、无接入时宿主仍可用。
逐项区分官方文档/模拟/真实进程/真实模型实测。真实验证未做不能宣布双 Agent 闭环通过，也不能以夹具演示顶替。
