# RA-002 — 可组合 React/Electron 宿主源码核验

日期：2026-09-22。只读官方源码与文档；未安装、clone、构建或启动。版本取所读 `package.json`，不是已在 Ordessa 验证的依赖锁。

## 判断

**优先原型方向：`@lumino/application` + `@lumino/coreutils` + `@lumino/widgets`，以 React 渲染页面。** 这套公开包已经承担插件注册、token 服务、依赖解析与激活/停用排序；Ordessa 无需再造同职能调度器。Ordessa 仍须定义自己的 shell 区域、导航/页面 registry、具名组件贡献点、扩展资源释放约定，以及 Electron 主/渲染进程边界。JupyterLab 和 Backstage 可借鉴具体桥及契约，不建议把它们的整个应用层误当“轻量空壳”。

## Lumino：实际可复用边界

| 维度 | 已核对事实 |
| --- | --- |
| 包、版本、许可 | [`@lumino/application` 2.4.10](https://github.com/jupyterlab/lumino/blob/d9b39db2c6d609af334729eeba2ab9376a11c0a7/packages/application/package.json)、[`@lumino/coreutils` 2.2.3](https://github.com/jupyterlab/lumino/blob/d9b39db2c6d609af334729eeba2ab9376a11c0a7/packages/coreutils/package.json)、[`@lumino/widgets` 2.9.0](https://github.com/jupyterlab/lumino/blob/d9b39db2c6d609af334729eeba2ab9376a11c0a7/packages/widgets/package.json)，均 BSD-3-Clause。`application` 直接依赖 `commands`、`coreutils`、`widgets`；`widgets` 还有 algorithm/disposable/domutils/dragdrop/keyboard/messaging/properties/signaling/virtualdom 等包。它们是独立发布包，不要求 JupyterLab notebook 或服务端。 |
| 公开 API | [`Application<T extends Widget>`](https://github.com/jupyterlab/lumino/blob/d9b39db2c6d609af334729eeba2ab9376a11c0a7/packages/application/src/index.ts) 接受一个由调用方创建的 `shell`，有 `registerPlugin(s)`、`start`、`activatePlugin`、`deactivatePlugin`、`deregisterPlugin`、`resolveRequiredService` / `resolveOptionalService`。`start` 激活启动插件、把 shell attach 到 DOM 并安装事件监听；没有内建页面/路由 API，也未见对称的 `stop` / `dispose`。 |
| 类型/依赖 | [`Token<T>`](https://github.com/jupyterlab/lumino/blob/d9b39db2c6d609af334729eeba2ab9376a11c0a7/packages/coreutils/src/token.ts)保留接口的编译期类型；[`IPlugin<T,U>` 与 `PluginRegistry`](https://github.com/jupyterlab/lumino/blob/d9b39db2c6d609af334729eeba2ab9376a11c0a7/packages/coreutils/src/plugins.ts)有 `provides`、`requires`、`optional`、`autoStart`、`activate`、可选 `deactivate`。必需 token 无提供者则拒绝激活，且提供者可被懒激活；可选 token 无提供者则传 `null`；注册时查环。相同 token 新提供者覆盖旧映射，不是多贡献列表。 |
| 停用/卸载 | `deactivatePlugin` 会找下游依赖并按序停用，但**本插件和每个下游插件都须有 `deactivate`**，否则抛错；它不自动销毁 widget、命令、订阅、远端任务。`deregisterPlugin` 默认拒绝移除活跃插件；`force` 可越过此门槛，但源码只从 `_plugins` 删除条目，未同步删除 `_services` token 映射，故不能当安全热卸载。资源 cleanup 必须由扩展自己在 `deactivate` 中执行；应用整体停止需另设计。 |

由此，**不需要第二个插件依赖/激活调度器**；如果 Ordessa 要支持运行时完整卸载、重装、版本迁移或跨 Electron 进程依赖，还需要在 Lumino 之上制定机制并验证上述边界，不能把 `deactivatePlugin` 等同于完整卸载。页面关闭应释放 React widget 的 UI 订阅，但不能由此自动取消 S03/S10 中继续运行的远端任务。

## React 桥与 JupyterLab 可单独取用的部分

JupyterLab 当前 main 的 [`@jupyterlab/ui-components` 4.7.0-alpha.2 package.json](https://github.com/jupyterlab/jupyterlab/blob/main/packages/ui-components/package.json) 标 BSD-3-Clause、依赖 React 18、ReactDOM、若干 JupyterLab 包、Lumino 包、`@jupyter/react-components` / `@jupyter/web-components` 和 RJSF。其公开导出的 [`ReactWidget`](https://github.com/jupyterlab/jupyterlab/blob/main/packages/ui-components/src/components/vdom.ts) 继承 Lumino `Widget`，用 React `createRoot`；attach 时 render、detach/dispose 时 unmount，另有 `UseSignal`。**成熟桥存在，但整包依赖并不小**；可独立评估该包，或仅以此源码作为 Ordessa 极薄桥实现的参考，不能把“复制一类”说成已集成。

[`@jupyterlab/application` 4.7.0-alpha.2](https://github.com/jupyterlab/jupyterlab/blob/main/packages/application/package.json) 直接依赖 `@jupyterlab/docregistry`、`rendermime`、`services`、`apputils`、`ui-components` 等，明显引入 Jupyter 编辑器/服务器领域，不适合作最小独立 Agent Desktop 内核。JupyterLab 扩展示例中的 [`provides` / `requires` / `optional` 和 shell view](https://github.com/jupyterlab/jupyterlab/blob/main/packages/console-extension/src/index.ts) 可以当真实组合范例，但整套 Lab app 并非必要依赖。这里的 main 是所读快照，包标 alpha；若 I 进入实施，应锁稳定发布版重新核对 API/依赖。

## Backstage：可借鉴但不直接承载 Electron

[`@backstage/frontend-plugin-api` 0.18.1](https://github.com/backstage/backstage/blob/90d861f4cea193c9c50899aa0b2673a5ff6e1865/packages/frontend-plugin-api/package.json)、[`@backstage/frontend-app-api` 0.16.8](https://github.com/backstage/backstage/blob/90d861f4cea193c9c50899aa0b2673a5ff6e1865/packages/frontend-app-api/package.json)、[`@backstage/frontend-defaults` 0.5.6](https://github.com/backstage/backstage/blob/90d861f4cea193c9c50899aa0b2673a5ff6e1865/packages/frontend-defaults/package.json) 均 Apache-2.0。公开文档给 [`createApp({features})`](https://backstage.io/docs/frontend-system/building-apps/index/)、[`PageBlueprint`](https://backstage.io/docs/frontend-system/building-plugins/common-extension-blueprints/)、[`createApiRef<T>`](https://backstage.io/docs/frontend-system/utility-apis/creating/) 和有类型的 [`createExtensionInput` / extension data ref / attachment point](https://backstage.io/docs/frontend-system/architecture/extensions/)。这些直接展示页面、服务和自定义插槽的声明式契约。

但 `frontend-plugin-api` 的 peer dependencies 含 React 17/18、ReactDOM 与 `react-router-dom` 6；`frontend-defaults` 又带 Backstage core components / plugin-app 等。框架默认是 Web 开发者门户，不含 Electron 主进程。文档中的 disabled/condition 是**应用树准备时**的静态控制，条件变化通常需要重备应用/重载；没有证据说明动态热卸载会自动释放订阅或远端任务。若只借 typed input 的设计形态，需明确这是设计借鉴，不是把 Backstage 几个 API 拆出来就能插进 Lumino。

## 两个扩展的具体 API 路径（Lumino 路线示意，非已运行代码）

宿主定义 `new Token<IViewRegistry>('ordessa.views')` 和一个 `IViewRegistry` 服务，接口至少有 `addPage({id, title, createWidget})`、`addComponent({slot, id, render})`，均返回 `IDisposable`；对应宿主插件 `provides: IViewRegistry`。这个 registry 是页面/插槽业务 API，**不是第二个插件调度器**。宿主自行把 registry 中的页面显示为导航条目，点击后把 widget 加进 shell。若用 `DockPanel`，它承载 tab/widget；路由、导航 UI、slot 的匹配/排序/冲突处理仍由 Ordessa 定义。

```ts
// 类型和调用路径示意；IViewRegistry/ITaskService 是 Ordessa 待定义的接口。
const IViews = new Token<IViewRegistry>('ordessa.views');
const ITaskService = new Token<ITaskService>('ordessa.tasks');
let componentRegistration: IDisposable | undefined;
let pageRegistration: IDisposable | undefined;

const taskExtension: IPlugin<OrdessaApp, ITaskService> = {
  id: 'tasks', provides: ITaskService, requires: [IViews],
  activate: (_app, views) => {
    componentRegistration = views.addComponent({ slot: 'task.summary', id: 'tasks.summary', render: TaskSummary });
    // 同一扩展返回提供给别的插件的强类型服务。
    return new TaskService();
  },
  deactivate: () => { componentRegistration?.dispose(); /* service 自身订阅也须释放 */ }
};

const pageExtension: IPlugin<OrdessaApp, void> = {
  id: 'overview.page', autoStart: true, requires: [IViews, ITaskService],
  activate: (_app, views, tasks) => {
    pageRegistration = views.addPage({
      id: 'overview', title: 'Overview',
      createWidget: () => ReactWidget.create(<Overview tasks={tasks} />)
    });
  },
  deactivate: () => { pageRegistration?.dispose(); /* 已打开 widget 由宿主策略处理 */ }
};

app.registerPlugins([viewRegistryPlugin, taskExtension, pageExtension]);
await app.start();
```

这里 `ReactWidget.create` 是 **JupyterLab 桥的 API**，不能从 Lumino 原生导入。若不用 `@jupyterlab/ui-components`，须实现基于 `Widget` + React `createRoot` 的桥。示意中的 `contribution` / `pageRegistration` 需要扩展实例范围保存并在停用时释放；实际代码还应处理失败激活、重复页面 ID、异步资源和 UI/远端任务所有权。Lumino `IPlugin` 的 `activate(...args)` 在源码为 `any[]`，token 服务类型的静态保证依赖扩展作者显式标注函数参数，并非 token 数组自动推断每个位置；应以 `tsc` 原型验证误接线能否被发现。

## 其余候选定位与下一步

Theia 和 OpenSumi 是更完整的 IDE 应用框架，先前初筛见 [RA-001](RA-001-shell-candidates.md)；两者可作为 Lumino 原语之上的强宿主对照。若选型标准强调最小可删减核心，Lumino/React 值得 I 的最小原型优先验证。尚欠：稳定版本锁定下 ReactWidget 依赖树、Lumino registry 动态替换/卸载反例、空壳实际启动、Electron preload 边界与 S01–S12 全覆盖。均不在本只读任务内宣称通过。

## RA-002 补充：更小的 `PluginRegistry` + React 薄壳

I 指向的[官方 server 示例](https://lumino.readthedocs.io/en/latest/plugin-registry-server.html)明确说 `PluginRegistry` 在 `@lumino/coreutils` 且没有 DOM 依赖；现场 `tools/theia-probe/node_modules/@lumino/coreutils` 为 2.2.3，仅运行依赖 `@lumino/algorithm`。这优于上文将 `@lumino/application`/widgets 作为启动基座的**最小依赖假设**：插件机制本身完全可以只用 coreutils，React 壳由 I 的原型负责。上文关于 Application/Widget 是可选的 UI 路线分析，不是插件调度的必需依赖。

对照现场 [`plugins.ts`](../../../tools/theia-probe/node_modules/@lumino/coreutils/src/plugins.ts) 和同版[官方源码](https://github.com/jupyterlab/lumino/blob/d9b39db2c6d609af334729eeba2ab9376a11c0a7/packages/coreutils/src/plugins.ts)，得到以下可复现事件序列；这是源码推导，非本轮执行的测试：

| 情形 | 事件序列 | 结果与原型含义 |
| --- | --- | --- |
| 必需服务缺失 | 只注册消费者 `requires:[T]`，再 `activatePlugin(consumer)` | `resolveRequiredService(T)` 抛 `No provider`；消费者不激活。`activatePlugins('startUp')` 捕获并仅记录该插件错误，调用本身继续完成，宿主若要给用户明确失败状态应另收集诊断。 |
| 可选服务失败 | 注册提供者 T，其 `activate` 抛错；消费者 `optional:[T]` 激活 | registry **会尝试激活提供者**；失败被 `resolveOptionalService` 记录后转为 `null`，消费者仍激活。无提供者也传 `null`。所以 optional 不能代表“从不启动这个模块”。 |
| 重复提供者 | 注册 P1 `provides:T`，激活消费者 C1；再注册 P2 `provides:T`，激活 C2 | `_services.set(T,P2)` 覆盖映射；C1 已持有 P1 的旧对象，C2 得 P2，服务权威分裂。`findDependents` 从当前映射重算关系，可能遗漏仍持有 P1 的 C1。宿主应在注册前拒绝重复服务 token；不能把覆盖当动态替换。 |
| 下游停用 | P 提供 T，C `requires:[T]` 或 `optional:[T]`，均已激活；调用 `deactivatePlugin(P)` | 两种依赖都进入 `findDependents` 图。若 C 无 `deactivate`，整次停用先行拒绝；都有时按下游优先顺序执行，清理内容由插件自己负责。 |
| 部分激活后失败 | P 的 `activate` 先注册页面/订阅，再抛异常 | registry 清空 pending promise、保持未激活，可重试；不会自动调用 P 的 `deactivate` 或回滚页面/订阅，第二次可能重复注册。插件需在 `activate` 内自行 try/catch 回滚。 |
| 停用后注销 | P 提供 T，成功停用 P，再 `deregisterPlugin(P)`，之后 `resolveRequiredService(T)` | `_plugins` 删除 P，`_services` 仍映射 T→P；`resolveRequiredService` 按该 ID 取插件并访问 `activated`，会因不存在而失败。这不是安全热卸载。`force` 注销活跃插件更会绕过 cleanup。 |

**替代边界**：若本轮只需启动时组合和页面/模块的逻辑启停，可用 coreutils `PluginRegistry`，并在宿主入口做重复 token/ID 校验、注册前能力清单、激活失败诊断和显式资源袋（每个扩展的 dispose 回调）。对动态真正卸载/替换，需先验证安全策略；可采用“运行期只禁用 UI，应用重载重建 registry”作为过渡。若不停机热替换和跨进程依赖是硬需求，就要在选型时评价专门机制；Theia/JupyterLab 基于同类 Lumino 插件机制，不能凭整套框架名称推定其解决上述边界；Backstage 的禁用/条件同样在应用树准备时决定。这个替代判断只读推导，尚需 I 的原型反例验证。
