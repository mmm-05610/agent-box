# Ordessa Desktop — 最小宿主与基础扩展

分支 `work/desktop-minimal-0`。没有 Agent、旧 Hermes SDK 或旧 Desktop 业务。
宿主 API v2 只负责扩展生命周期、资源作用域与一个根界面挂载点。
命令、工作台、设置由可信本地扩展提供，不通过修改 app.tsx 注册。

## 当前目录

```text
apps/desktop/
  electron/                    窗口、受限清单 IPC、文件协议、发现
  src/                         启动、最小诊断、React 入口、测试
  scripts/                     构建、启动、Electron 验收
packages/
  extension-api/               Token、PluginContext、资源作用域、根贡献
  extension-loader/            清单、模块/工厂加载、失败隔离
  desktop-host/                Lumino 生命周期、根挂载与根错误边界
  foundation-contracts/        独立 Commands/Workbench/Settings Token 契约
extensions/
  commands/src/entry.ts        命令服务（不是按钮）
  workbench/src/
    entry.tsx                  提供服务并挂载根界面
    model.ts                   注册表、视图打开/关闭状态
    shell.tsx                  五区域、整页、导航/工具/状态插槽
    styles.ts                  紧凑桌面布局、分隔线与拖放提示
  settings/src/
    entry.tsx                  注册命令、整页和导航入口
    model.ts                   设置分组与项目注册表
    page.tsx                   设置分类、字段与自定义区块
    field.tsx                  读写/订阅、校验、竞争保护
  shared/                      扩展内部小型辅助代码，不是宿主服务
  product.json                 产品默认启用名单
  build.mjs                   单独构建基础扩展及契约工件
examples/                      独立样例，不默认安装/启用
packages/agent-ui-contracts/   共享 Agent 语义契约与服务 Token
packages/foundation-contracts/ 独立 Commands/Workbench/Settings Token 契约
extensions/
  agent-connections/           接入登记与连接服务（两适配器注册同一服务）
  agent-sessions/              连接/会话所有权，独立于挂载视图
  agent-conversation/          assistant-ui 对话视图（Sessions/Conversation/Requests）
  agent-interactions/          待处理交互视图
  agent-codex/                 Codex 0.155.1 App Server 适配器
  agent-pi/                    Pi 0.86.1 RPC 适配器（每会话一个 RPC 进程）
  agent-preview.json           双 Agent 预览启用名单（显式选择，不是产品默认）
```

`foundation-contracts` 构建为 `ordessa.contracts` 扩展工件，消费者统一导入
`@extensions/ordessa.contracts/contract.js`，保证 Token 字节模块身份一致。
替换实现不需要保留旧实现包。当前契约在一个工件中，未把每个类型拆成独立 npm 包。

## 启动与验证

```sh
npm ci
npm run typecheck
npm test
npm run build                  # 构建宿主与基础扩展
npm start                      # 仅启动，不重建
npm run dev                    # 构建并启动
npm run build:foundations      # 只构建基础扩展，不重建宿主
npm run build:examples         # 只构建样例
node apps/desktop/scripts/test-agent-process.mjs   # 隔离真实 CLI 进程，无模型调用
xvfb-run -a npm run test:electron
xvfb-run -a npm run test:extensions
xvfb-run -a npm run test:foundations
xvfb-run -a npm run test:agent-shell
```

默认显示空工作台与“设置”入口，设置页默认没有业务设置。
默认启用名单来自 `extensions/product.json`，不是宿主里的具体插件导入。
构建工件在 `extensions/dist/`，分发时需与 `apps/desktop/dist/` 一起保留当前相对布局。

start/dev 的本地扩展目录默认 `.local-desktop`，可由 `ORDESSA_EXTENSION_HOME` 指定。
其 `extensions.json` 若存在，**完整替代**默认名单；`{"enabled":[]}` 明确回到无根界面的最小宿主。
配置损坏不会回退到自动启用。未找到用户配置时才采用产品默认名单。
用户扩展目录与随附工件一起查找；同 ID 冲突拒绝，不静默覆盖。运行中不要替换文件。
`ORDESSA_EMPTY_HOST=1` 只禁用随附工件来源，仍尊重明确指定的用户清单。

不会自动改写已有 `.local-desktop/extensions.json`。如果升级后仍使用旧配置，需明确保留基础扩展 ID。
Electron 浏览器数据当前仍使用启动器的临时目录，不宣称已经持久保存配置。
普通启动不关闭 OS 沙箱；Xvfb 烟测用隔离临时目录和测试专用 `--no-sandbox`。

## 怎么注册

插件上下文只有：

- `context.root.mount({id, component})`：提供根界面，已有根时拒绝第二个。
- `context.resources`：自动清理作用域；关闭后拒绝登记。

业务或基础能力通过 Token 注入，不能访问全局注册表：

```tsx
import { CommandsToken, WorkbenchToken } from '@extensions/ordessa.contracts/contract.js'

export default () => ({
  id: 'example.page', autoStart: true,
  requires: [CommandsToken, WorkbenchToken],
  activate(context, commands, workbench) {
    const ui = workbench.forScope(context.resources)
    ui.addView({
      id: 'example.page.view', title: '示例',
      presentation: 'region', region: 'main', component: Example,
    })
    commands.forScope(context.resources).add({
      id: 'example.page.open', title: '打开示例',
      execute: () => workbench.open('example.page.view'),
    })
    ui.addUI({
      id: 'example.page.entry', kind: 'command',
      slot: 'navigation', command: 'example.page.open',
    })
  },
})
```

所有服务注册都经 `forScope` 绑定调用方：返回可释放句柄且自动登记；无需再次 resources.add。
重复 ID 拒绝。退出/激活失败清理自己的贡献，不清其他插件。
服务提供者退出时清空自身服务；真实服务依赖仍由 Lumino 管理。
同类型贡献按 order 再按 ID 排序。

### 工作台

工作台复用 MIT 许可的 [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) 4.13.2，作为扩展私有依赖打包，不进入宿主 API。
左侧窄导航栏、底部工具入口、顶部紧凑工具栏；Electron 默认菜单隐藏（Alt 可显示）。

- 拖动区域之间的分隔线调整宽高；分隔线可通过 Tab 聚焦，再用方向键调整。
- 顶部布局按钮或区域内“−”收起侧栏/上下方面板，再点顶部按钮展开并恢复原尺寸。
- 双击分隔线恢复该区域默认比例。
- 拖动视图标题到左/右/上/下/主区，也可用标题栏“移动…”选择目标；整页视图不参与区域移动。
- “↺”重置布局，恢复扩展声明的位置和默认尺寸。
- 折叠、移动和整页覆盖保留组件实例；**关闭视图**仍卸载。切换同一区域活动视图仍按既有规则卸载前一个。
- 布局仅在本窗口内记忆，不承诺重启持久化；没有注册视图的区域不占空间，展开按钮禁用。

- 区域：`left / right / bottom / main / top`，每区域一个活动视图。
- 整页：`presentation: 'full-page'`，同时一个；统一返回入口，无页面栈。
- `open(id)` / `close(id)`：整页期间保留后台工作台组件，隐藏/inert 防止焦点进入；返回恢复焦点。
- 普通区域关闭或切换会卸载对应视图；需长期保留的数据属于扩展服务。
- UI 插槽：`navigation / toolbar` 只允许命令；`statusbar` 允许命令或组件。命令贡献可选 `icon`；导航可选 `section: 'utility'` 放到左下角，不在 workbench 写死设置 ID。
- 缺失命令禁用并显示原因；失败不自动重试。渲染错误按视图/组件隔离。
- 注册区域视图会出现在该区域切换栏；不会自动生成全局导航入口。

### 设置

消费 `SettingsToken`，通过 `settings.forScope(context.resources)` 调用 `addGroup`、`addItem`。
项目 kind：`boolean / text / number / enum / custom`；custom 提供 React component。
普通字段提供 binding：`read`、可选 `write`、可选 `subscribe`、可选 `validate`。
未提供 write 时只读。保存后重新读取权威值；失败不冒充成功；陈旧读取结果不会覆盖新值。
外部通知刷新值（也会替换未保存草稿）；第一版不做草稿冲突合并，复杂编辑可用 custom。
分组尚未注册的项目保留在注册表并显示诊断，不随加载顺序丢弃。
settings 不保存配置，不接触凭据，也不替业务提供者决定数据根。

## Agent 接入（Codex 与 Pi，同一套 UI）

两个适配器注册到同一个 scoped 连接服务，同一界面内切换连接，不改 UI 代码，不依赖 Ordessa 后端。
`extensions/agent-preview.json` 是显式预览名单，包含两个适配器；产品默认名单 `product.json` 不含它们。

启用预览（不会改写已有配置，`extensions.json` 是完整覆盖）：

```sh
mkdir -p .local-desktop && cp extensions/agent-preview.json .local-desktop/extensions.json
npm run dev
```

两个适配器的原生传输都要求设置绝对工作区路径（子进程的 cwd，也是会话归属目录）：

```sh
ORDESSA_AGENT_CWD=$HOME/projects/some-workspace npm run dev
```

### 接入 Codex（0.155.1）

1. 本机安装 `codex` CLI 0.155.1 并在 PATH 上（`codex --version` 核对）。
2. 启动后进入 Agents → Conversation，选择 Codex 连接。
   适配器以 stdio 启动 `codex app-server --stdio`，使用你本机 Codex 的默认 `CODEX_HOME` 状态。
3. 会话历史来自服务端 `thread/list`/`thread/resume`；停止走 `turn/interrupt`，终态以 `turn/completed` 为准。

### 接入 Pi（@earendil-works/pi-coding-agent 0.86.1）

1. 无需单独安装 CLI：适配器通过仓库固定依赖 0.86.1 的官方 RPC 客户端派生 `node cli.js --mode rpc` 子进程。
2. 选择 Pi 连接后，每个打开的会话各持一个独立 RPC 进程，并行会话互不取消
   （该安装版本的 `switch_session` 会中止活动会话，因此不复用单进程切换）。
3. 历史来自官方 `SessionManager.list`（默认在 `~/.pi/agent`，可用 `PI_CODING_AGENT_DIR` 覆盖）；
   注意 Pi 只有在出现首条 assistant 消息后才落盘会话文件，空会话不出现在历史里。
4. 停止走 `abort`（等待空闲才返回）。`agent_settled` 只表示运行结束，不构成结论：
   终态仅依据最终 assistant 消息的 `stopReason`（stop/aborted/error 分别映射完成/取消/失败，
   其中明确 `aborted` 是唯一可判取消的核实依据）；未知 `stopReason` 或没有最终消息时保持
   unknown，不推断成功或取消——已请求停止也不例外，此时诊断会提示"已请求停止但结果未确认"。
   轮次状态不跨轮携带：新轮次、断连或重开会话都会清理上一轮的判定与流式状态。

### 边界与未验证项

- 语义区分：切换会话≠取消；停止请求≠停止确认；断连后运行结果为 unknown，不伪造成功/失败。
- Pi 扩展 UI 对话（select/confirm/input/editor）按交互请求呈现，与工具审批语义分开；响应一次性绑定会话与请求 ID。
- 真实模型对话（两轮、流式、工具、审批的真实模型链路）未在本任务验证，需要另行授权后才进行；
  已验证范围见 `control/reports/FE-AGENT-001/verification.md`。
- 原生桥只开放 open/send/close/事件订阅，传输实现限定在适配器的 `native.js`，由清单校验后加载。

## 安装示例（可选，不是产品默认内容）

先构建，然后把 `examples/dist/example.foundation` 复制到 `.local-desktop/extensions/`。
使用以下完整启用配置，重启即可，不需要重建宿主：

```json
{"enabled":["ordessa.contracts","ordessa.commands","ordessa.workbench","ordessa.settings","example.foundation"]}
```

该样例包含五区域、计数器、基本设置控件、自定义区块、外部更新、只读和保存失败场景。
数据只在内存，重启还原。其他 Hello/服务替换样例也已迁移至 v2。

## 加载与兼容边界

扩展工件：manifest.json + 浏览器 ESM entry.js；默认导出工厂，返回一个插件。
清单：`{"id":"example.page","version":"0.1.0","hostApi":"2","entry":"entry.js"}`。
v1 的 pages 接口已移除，v1 manifest 明确拒绝，不伪称兼容。
外部扩展构建须 external：React、React DOM、@ordessa/extension-api、@extensions/*。
宿主共享映射支持 react、react/jsx-runtime、react-dom、react-dom/client、@ordessa/extension-api。
不要把 Token 契约模块或 React 各自内联，否则会产生不同实例。

- 默认 5 秒模块/工厂加载截止，迟到结果不采用；不是底层任务取消。
- 无关插件并行激活，待完成状态可见；依赖慢服务的消费者仍需等待。
- 工厂只构造定义，副作用在 activate 中创建并登记清理。
- 仅可信同进程/同源扩展；不隔离恶意同步死循环或未登记副作用。
- 未做多实例、浮动窗口/跨窗口停靠、布局持久化、快捷键体系、热卸载 UI、通知系统、网络/凭据桥。
- 页面关闭不取消后台执行。组件隐藏不意味着服务暂停。

## 依赖

Lumino BSD-3-Clause；React/Electron/react-resizable-panels MIT。面板库的许可证随工作台工件一同复制。
本轮 npm audit 报告原有 Electron/extract-zip、Vitest/mocker 依赖链 4 项告警（2 high / 2 moderate）；面板库未被列入。未自动强制升级，发布前仍需单独处理。
