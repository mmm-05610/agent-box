# FC 复用账 — HD-001 Phase 0（汇总入口，持续更新）

证据基线：本树 85cc3cd01497bb185be417a38dbeeeca4edb08e6（clean）。版本/许可证证据取自旧树 desktop-minimal 已安装依赖的 package.json（新树无 node_modules，属只读查证）。每个新增/重做可见组件须补行。

| 能力/组件 | 候选项目+版本/commit | 源码路径/官方链接 | 许可证 | 检查/实验结果 | 直接/适配/参考/不用 | 修改边界/拒绝原因 | 本地落点/升级方式 | owner |
|---|---|---|---|---|---|---|---|---|
| 插件注册/生命周期 | @lumino/coreutils 2.2.3（PluginRegistry） | github.com/jupyterlab/lumino | BSD-3-Clause | 亲读 packages/desktop-host/src/runtime.ts：PluginRegistry+Contributions 驱动 requires/provides 解析、phase 状态机、OwnedResources 作用域释放 | 直接复用 | 不换底座（CHARTER 明令）；仅在其上组合 | packages/desktop-host → platform/extension-host | FC/F0 |
| 扩展 API（Token/Scope/Disposable） | 本仓 @ordessa/extension-api 0.1.0 | 本树 packages/extension-api/src（47+38 行，亲读） | 仓库私有 | Token 唯一运行时身份、ResourceScope 自动释放；被 foundation/agent 契约共同依赖 | 直接复用 | 不扩配置能力；契约仅按明确需求演进 | → platform/extension-api | F0 |
| 扩展加载 | 本仓 @ordessa/extension-loader 0.1.0 | 本树 packages/extension-loader/src（亲读 index/manifest） | 仓库私有 | 从 preload catalog 读 manifest 并加载，无第二调度器 | 直接复用 | 宿主不枚举业务包 | → platform/extension-loader | F0 |
| 工作台布局 | react-resizable-panels 4.13.2 | github.com/bvaughn/react-resizable-panels | MIT | 亲读 extensions/workbench/src/shell.tsx：五区布局/折叠/拖拽/全页呈现均基于其 Panel/Separator/Group；构建脚本随包分发 LICENSE | 直接复用 | 样式与交互文案统一时不动其用法 | extensions/workbench → plugins/foundations/workbench | F3/F0 |
| 对话/消息流 UI 原语 | @assistant-ui/react 0.15.21 | github.com/assistant-ui/assistant-ui | MIT | 亲读 extensions/agent-conversation/src/view.tsx：ThreadPrimitive/MessagePrimitive/Reasoning/ToolCall fallback/Composer/useExternalStoreRuntime 已接 Agent 快照；许可文件随构建分发 | 直接复用（当前 devDep，迁移批应转正式依赖） | 不引入其云端/托管部件；只用地原语 | extensions/agent-conversation → plugins/agent/conversation | F3 |
| Pi 连接器 | @earendil-works/pi-coding-agent 0.86.1 | github.com/earendil-works/pi | MIT | 亲读 extensions/agent-pi/src/{client,native,entry}.ts：native 主进程进程适配、client 外部化保持运行时解析 | 直接复用 | Pi 原样配置，不改模型/认证/默认配置（CHARTER） | extensions/agent-pi → plugins/connectors/pi | F1 |
| Codex 协议类型 | codex-cli 0.155.1 生成快照（2026-09-22） | extensions/agent-codex/src/generated/SOURCE.md（亲读）；github.com/openai/codex | Apache-2.0 | 生成物不加改；换 Codex 版本须重生成复查 | 直接复用（生成物） | 不得手改 generated；不猜测协议 | extensions/agent-codex → plugins/connectors/codex | F1 |
| 参考产品：zcode Desktop | 闭源（本机 /opt/ZCode deb 打包，app-update.yml 指 localhost，app.asar 内无公开仓库指针） | 官方站点 zcode.z.ai；公开报道均称 3.0+ 闭源 Electron 应用 | 无（不可复制代码） | 本地 strings 证据 + 网络检索均无开源仓库；本机运行实例可作交互/布局风格观察 | 参考（仅风格） | 无源码可复用；不截图冒充源码事实；不逆向 | 仅人因参考，不进依赖 | FC |
| Electron 桌面壳 | electron 40.10.2 | github.com/electron/electron | MIT | 现有 smoke-electron 隔离 userData + --no-sandbox 仅测试链路 | 直接复用 | 正常开发不禁用 sandbox（AGENTS.md） | apps/desktop → apps/desktop/{electron,renderer} | F0 |
| 视图拖拽/区域迁移 | 本仓 workbench shell 实现 | 本树 extensions/workbench/src/shell.tsx（亲读） | 仓库私有 | 既有可拖拽五区+状态栏槽位，满足"右/下无业务不展开" | 直接复用 | 交互统一时只改样式/文案层 | 随 workbench 插件迁移 | F3 |

备注：
- "至少2候选且至少1读源码"：已采用库均给出精确版本+许可证+本地源码亲读记录；zcode Desktop 作为参考候选如实记录为闭源不可复用。
- 后端候选与旧成果复用由 BC/S/H/E 各自 reports/reuse.md 覆盖，本账不代写。
- FC 汇总口径：新可见组件无账行不予集成；从零组件必须有 C 批准 ID。
