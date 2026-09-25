# RA-003 — Lumino PluginRegistry + React 薄壳复核

状态：**READY_FOR_I**。2026-09-22 只读复核；本报告没有重跑测试、安装依赖或修改原型。范围是当前固定启动 manifest、可信内置扩展的底座选型，不是生产 Desktop 的验收结论。

## 选型结论与证据

**没有发现阻断这次复用选型的缺陷。** 原型实际依赖 [`@lumino/coreutils@2.2.3`、`@lumino/disposable@2.1.6`、`@lumino/signaling@2.1.6`、React/ReactDOM 19.1.0](../../../tools/lumino-host-probe/package.json)，没有依赖 `@lumino/application`、`@lumino/widgets`、JupyterLab 或 Theia。Lumino 官方文档确认 [`PluginRegistry` 可独立于 DOM、Application 和 Widgets 使用](https://lumino.readthedocs.io/en/latest/plugin-registry-server.html)。

[`runtime.ts`](../../../tools/lumino-host-probe/src/host/runtime.ts) 把插件注册、token 依赖解析、激活与连带停用交给 Lumino；本地 `scoped` 仅包装资源袋与激活失败回滚。[`contributions.ts`](../../../tools/lumino-host-probe/src/host/contributions.ts) 只管理有 ID 的 UI 项目及订阅通知；[`shell.tsx`](../../../tools/lumino-host-probe/src/host/shell.tsx) 从注册集合生成导航并按选择渲染页面。它们没有再次实现插件依赖调度器。Agent、Conversation、Models 的业务接口和实现位于 host 之外，见 [`main.tsx`](../../../tools/lumino-host-probe/src/main.tsx) 与 [`extensions/`](../../../tools/lumino-host-probe/src/extensions/)。

| 验证范围 | 当前证据 | 能支持的结论 |
| --- | --- | --- |
| registry 与资源所有权 | [`registry.test.ts`](../../../tools/lumino-host-probe/tests/registry.test.ts) 的 8 项真实 API 行为测试；I 记录 typecheck/build/test 通过 | 空 manifest、必需/可选 token、重复提供者预检、环拒绝、激活失败的已登记 UI 回滚、required 下游停用、缺 `deactivate` 的拒绝与并发激活去重已覆盖。 |
| 浏览器组合 | [`browser-results.json`](../../../tools/lumino-host-probe/evidence/browser-results.json) 的五组通过记录；[浏览器脚本](../../../tools/lumino-host-probe/scripts/browser-test.mjs) | 空壳、A/B fixture 替换、移除 Models、移除 Conversation；页面与组件贡献、视图关闭后业务继续、重开、Models 停用/重激活均在该原型流程通过。A/B 是同一 fixture 工厂的配置变化，不证明两个真实后端协议。 |
| Electron 桌面烟测 | [`electron-results.json`](../../../tools/lumino-host-probe/evidence/electron-results.json)、[烟测脚本](../../../tools/lumino-host-probe/scripts/electron-smoke.cjs)和[运行包装](../../../tools/lumino-host-probe/scripts/electron-test.mjs) | Electron 40.10.2 在独立 Xvfb、临时 userData、软件渲染下加载空壳与两视图；`contextIsolation` 为 true，renderer 无 Node `require`/`process`。烟测脚本在写出成功标记前还断言打开 Conversation 可见模型组件，停用 Models 后模型组件消失而 Conversation 仍在。结果 JSON 未单列这两个 DOM 断言，证据须与脚本及成功退出记录合看。测试用了 `--no-sandbox`，不证明生产 Chromium OS sandbox 或打包。 |

## 已确认的边界：后续产品化需解决

这些事项不阻断固定 manifest 的复用选型，但不可在产品中误称已解决。

1. **动态注册/替换。** [`runtime()` 的重复 ID/token 预检](../../../tools/lumino-host-probe/src/host/runtime.ts)只覆盖启动数组；返回的原始 `registry` 仍可绕开预检注册。产品应把注册入口收束到 manifest 管理层。Lumino 的 `deregisterPlugin(force)` 不是安全热卸载：当前 2.2.3 源码只删插件表项，服务 token 映射可残留，见[上游 `plugins.ts`](https://github.com/jupyterlab/lumino/blob/d9b39db2c6d609af334729eeba2ab9376a11c0a7/packages/coreutils/src/plugins.ts)。当前选择是更换 manifest 后重载 renderer。
2. **清理错误。** [`scoped()`](../../../tools/lumino-host-probe/src/host/runtime.ts)在 activation 抛错时 dispose 已加入的资源，测试证明普通 UI 注册被回滚；但 [`DisposableSet.dispose()`](../../../tools/lumino-host-probe/node_modules/@lumino/disposable/src/index.ts)遇到某个 disposer 抛错会中断后续项，还可能掩盖原始激活错误。产品需要尝试释放所有项并保留两类错误。
3. **可选依赖的生命周期。** Lumino 的 `optional` 是激活时可为 `null` 的服务，并会尝试激活现有提供者；提供者晚些恢复不会自动更新已激活消费者。连带停用图也计入 optional 下游。当前测试覆盖 optional 缺失，未单独断言“停用 Conversation 时 Models 也被连带停用”的 UI 结果。产品需决定动态贡献订阅、重激活或显式独立性。
4. **UI 与业务执行所有权。** [`Shell`](../../../tools/lumino-host-probe/src/host/shell.tsx)关闭 view 会卸载 React 组件，`scoped` 只释放显式加入资源袋的注册/订阅。它不会取消 Agent 业务执行；这是长任务离开页面后继续的合理边界。真实 IPC、流式状态、取消、断线重连及恢复仍需产品设计与验证。
5. **类型契约。** `Token<T>` 提供服务身份和 TypeScript 接口，但 `activate(...services)` 的位置参数在 Lumino `IPlugin` 中是 `any[]`，无法从 `requires`/`optional` 自动推断。原型显式标注各参数；产品应继续用类型检查和契约测试约束接线，并保证共享 token 对象为同一模块实例。

下一步由 I 用现有证据完成底座选型收口；如进入产品化，将以上事项列入实施与验证条件。本批研究与复核已按 I 指令收口，不继续扩大候选检索。
