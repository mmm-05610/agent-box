# RA-001 — React/Electron 可复用应用外壳初筛

检索日期：2026-09-22。依据为下列官方文档；本轮未安装依赖、未运行候选，故“可启动”指官方提供可执行的启动路径，**不是本机启动验证**。这里的“页面”包含工作台 view；若要求 URL 路由页面，需单独区分。对照目标见 [Agent Desktop 设计草案](../../product/agent-desktop-design-brief.md)，尤其 S03、S05、S08、S10、S12。

| 候选 | 空壳启动依据 | 页面/视图注册 | 类型化服务 | 自定义插槽 | 生命周期 | 初筛判断 |
| --- | --- | --- | --- | --- | --- | --- |
| **Eclipse Theia** | [应用组合文档](https://theia-ide.org/docs/composing_applications/)给出 Electron target、`yarn build:electron` / `yarn start:electron`；是带核心工作台的最小应用，并非零功能窗口 | [WidgetFactory + ViewContribution](https://theia-ide.org/docs/widgets/)按 ID 注册 view；扩展包作为应用依赖接入 | [Service interface + Inversify DI](https://theia-ide.org/docs/services_and_contributions/) | 扩展可定义自己的 typed contribution point；应用 shell 的区域由 widget 布局承载。普通 React 具名 slot 仍需应用定义 | [FrontendApplicationContribution](https://theia-ide.org/docs/frontend_application_contribution/)有布局初始化、start、stop 等钩子 | 五项机制最完整；强 IDE/workbench 模型，非 IDE 桌面应用的重量与概念适配待验证 |
| **OpenSumi** | [官方 Electron 示例](https://opensumi.com/en/docs/integrate/quick-start/electron/)给出 `ide-electron` 模板和启动命令；文档称其为快速测试桌面环境 | [ComponentContribution / view token](https://opensumi.com/en/docs/integrate/universal-integrate-case/custom-view/)注册 React view | [Token + Service](https://opensumi.com/en/docs/develop/how-to-design-module/)及[依赖注入](https://opensumi.com/en/docs/develop/basic-design/dependence-injector/) | [Layout Module](https://opensumi.com/en/docs/develop/module-apis/layout/)明确划分 slot，并支持注册 view；自定义区域能力仍需源码核验 | [ClientApp 生命周期](https://opensumi.com/en/docs/develop/basic-design/lifecycle/)含 initialize/onStart/onDidStart；停止与清理语义需继续查 | 视图 slot 与类型化模块契合；同样带 IDE 核心，文档版本与当前代码对应关系待核验 |
| **Backstage 新前端系统** | [createApp 最小 React 示例](https://backstage.io/docs/frontend-system/building-apps/index/)可建 Web app；无官方 Electron 启动路径 | [PageBlueprint](https://backstage.io/docs/frontend-system/building-plugins/common-extension-blueprints/)为路由贡献页面；[插件安装](https://backstage.io/docs/frontend-system/building-apps/installing-plugins/)支持自动发现/显式注册 | [createApiRef<T>](https://backstage.io/docs/frontend-system/utility-apis/creating/) | [typed extension inputs 与 attachment point](https://backstage.io/docs/next/frontend-system/architecture/extensions/)适合作自定义 slot | 现查文档未证明桌面进程及远端任务生命周期管理 | React 扩展契约参考价值高；作为 Electron 外壳需另加桌面层，且默认面向开发者门户 |
| **React Pluggable** | [官方入门](https://react-pluggable.github.io/docs/introduction)在现有 React App 安装 PluginStore；不提供 Electron 空壳 | 插件可安装功能，但官方入门未证明页面路由注册 | TypeScript `IPlugin` 有接口；示例以字符串键 `addFunction` / `executeFunction` 通信，跨插件服务类型契约不足 | 有 renderer/plugin 概念，但本轮未确认任意具名 slot 的稳定契约 | `init`、`activate`、`deactivate` 在[官方入门](https://react-pluggable.github.io/docs/introduction)明确 | 轻量 React 功能插件候选；五项中桌面启动、页面注册、类型化服务需宿主自行补齐 |
| **Electron Forge + React/TypeScript** | [Forge 模板](https://www.electronforge.io/templates/vite)可创建并 `npm start`；[React/TS 指南](https://www.electronforge.io/guides/framework-integration/react-with-typescript)说明接入 React | 无内置页面注册，需实现 | 无应用级类型化服务，需实现 | 无应用级 slot，需实现 | Electron 进程生命周期可用，但扩展生命周期需实现 | 最轻的桌面启动基座；适合作“自建宿主”对照组，不是现成扩展架构；官方 Vite 模板仍标 experimental |

## 给 I 的初步建议

若深挖“现成宿主”，先看 **Theia 与 OpenSumi**，重点做空功能模块启动、删去 IDE 领域模块、跨页面任务持续、扩展卸载清理的只读源码核验。若深挖“最小自建宿主”，以 **Forge 启动基座 + Backstage 的 typed extension input/API 契约** 为参考，但不要把两者拼接视为现成方案。上述判断是基于文档的推断，并非性能、可移植性或实际兼容性结论。

## 待决与下一步

1. I 指定深挖路线：Theia、OpenSumi、Backstage 式 Web 扩展契约，或 Forge 自建宿主对照。
2. 指定后只读核对当前源码版本、最小依赖闭包、注册 API、服务/事件作用域、扩展停用清理路径，以及与 S01–S12 的反例；不安装、不改产品。
3. “空壳可启动”目前只有文档步骤；实机验证需要另行授权安装/运行，本任务范围内不会做。
