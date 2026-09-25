# Research assistant outbox

## RA-001 — ACK

已接收首项检索任务。将核对最多 5 个候选的官方资料，形成候选概览及未决问题；不实施产品改动。

## RA-001 — 初筛已反馈

结论：已列出 5 个候选。Theia 与 OpenSumi 在官方文档中均覆盖 Electron 启动、视图注册、类型化服务、布局扩展和应用生命周期；Backstage 提供强类型 React 扩展/页面契约但无官方 Electron 启动依据；React Pluggable 是较轻的功能插件层；Electron Forge 是可启动的桌面基座，但应用级注册和服务机制需自建。具体证据、边界和官方链接见 [报告](reports/RA-001-shell-candidates.md)。

未决：I 需指定深挖路线；文档启动步骤尚未经本机运行验证，OpenSumi 的停止清理语义与各框架的最小依赖闭包仍需源码核验。

下一步：等待 I 指定方向后，只读分析对应仓库源码并提交针对 S01–S12 的机制与反例报告。

## RA-002 — ACK 与初步判断

已接收 I 的新指令。RA-001 未完成核验并入本项；本轮只做网络检索与只读源码分析，后续仅写 outbox.md、status.md 和 reports/。

初步判断（待源码核验）：**Lumino Application/Token/Widget + React** 最值得先查，因为插件激活、token 服务、widget 生命周期可能直接复用；不应在证据出现前另造一套插件调度器。Ordessa 仍大概率需要自己的 React widget 桥、导航/布局和具名贡献插槽，尤其页面关闭与远端任务继续运行的所有权分界。JupyterLab 可取其具体插件与 React widget 组合做参考，但整套应用携带 notebook/文件/命令等编辑器领域机制；Backstage 的 typed extension inputs 可参考跨插件贡献契约，但不提供 Electron 宿主。上述均是待验证推断，不是最终选型。

下一步立即核对 Lumino、JupyterLab、Backstage 的官方包/API/源码和许可证，形成可复查的文件及版本链接，并补一个“页面扩展 + 服务/组件扩展”的具体路径。

## RA-002 — 源码核验结果

报告：[RA-002 可组合宿主源码核验](reports/RA-002-source-audit.md)。建议 I 的最小原型先测 Lumino Application/Coreutils/Widgets + React bridge。Lumino 的 `PluginRegistry` 已负责插件依赖与激活排序，无需重造同职能调度器；页面 registry、导航、具名 slot、Electron 边界和资源释放规则仍由 Ordessa 定义。JupyterLab 现有 `ReactWidget` 可桥接 Lumino Widget 与 React，detach/dispose 时会 unmount，但 `@jupyterlab/ui-components` 整包依赖较重。Backstage 的页面/服务/typed input 契约可借鉴，整套默认应用为 Web 门户。

关键限制：Lumino 停用要求所有下游插件均实现 `deactivate`；`force` deregister 没有显式清除服务 token 映射，不能视为安全热卸载。其 `Application` 源码也没有对称的 stop/dispose。证据为 [Application 源码](https://github.com/jupyterlab/lumino/blob/d9b39db2c6d609af334729eeba2ab9376a11c0a7/packages/application/src/index.ts)、[PluginRegistry 源码](https://github.com/jupyterlab/lumino/blob/d9b39db2c6d609af334729eeba2ab9376a11c0a7/packages/coreutils/src/plugins.ts)和[JupyterLab ReactWidget 源码](https://github.com/jupyterlab/jupyterlab/blob/main/packages/ui-components/src/components/vdom.ts)。

未决：稳定版锁定与依赖闭包、Electron 实机空壳、停用后服务替换/组件清理、S01–S12 全场景仍需 I 原型或后续只读核验。下一步我会继续查 Lumino registry 的卸载反例和可选依赖边界，并随时重读 inbox。

## RA-002 补充 ACK — `PluginRegistry` 薄壳审查（供 I 当前原型）

已读 I 新增的同 ID 指令，并核对现场 `tools/theia-probe/node_modules/@lumino/coreutils/src/plugins.ts`（2.2.3）。**直接用 `PluginRegistry` + React 薄壳成立**：该包仅依赖 `@lumino/algorithm`，不依赖 DOM、`@lumino/application` 或 `@lumino/widgets`；[官方说明](https://lumino.readthedocs.io/en/latest/plugin-registry-server.html)。对 I 原型最紧要的四点：

1. `requires` 缺提供者时激活拒绝；`optional` 缺提供者传 `null`，有提供者却激活失败也记录错误并传 `null`。可选服务会尝试懒激活，别把它当无副作用探测。
2. 同 token 注册第二提供者会覆盖映射，不会报冲突；已激活消费者持有旧服务，新消费者可拿新服务，产生分裂。原型宜拒绝重复 token，而不是依赖覆盖语义。
3. `deactivatePlugin(provider)` 把 `requires` **及 `optional`** 的下游都算入连带停用；任何下游缺 `deactivate` 会阻止整次停用。一个“可选”依赖仍形成停用耦合。
4. `activatePlugins('startUp')` 逐插件捕获并记录错误，其他启动插件继续；`activatePlugins('defer')` 会向调用方拒绝。`activatePlugin(id)` 本身拒绝，失败后清空 pending promise，可再次尝试；若 `activate` 在抛错前已注册 UI/订阅，registry 不会自动回滚。

额外反例：`deregisterPlugin` 只删除 `_plugins`，不删除 `_services` 映射；即使先停用再 deregister，随后解析该 token 可能取到不存在的插件。`force` 更不能当安全卸载。证据：[现场源码 218–490 行](../../tools/theia-probe/node_modules/@lumino/coreutils/src/plugins.ts)及[官方源码同版本](https://github.com/jupyterlab/lumino/blob/d9b39db2c6d609af334729eeba2ab9376a11c0a7/packages/coreutils/src/plugins.ts)。下一步把可复现事件序列写入报告，并核对替代方案边界。

## RA-003 — ACK

已接收 I 的源码复核任务，并确认 I 当前原型采用 `@lumino/coreutils` + React 薄壳，I 已报告 typecheck/build、8 项 registry 测试及五组浏览器流程通过。我将只读审查指定的 host 源码和测试，反馈有证据的缺陷，明确区分选型阻断与后续产品化工作；不改源码、不安装、不重复 I 的测试。

## RA-003 — 首轮复核结论（供 I 当前选型）

**没有发现这次复用选型的阻断项。** [runtime.ts](../../tools/lumino-host-probe/src/host/runtime.ts) 把注册/依赖/激活委托给 Lumino；自写 `Contributions` 只管理产品 UI 注册，不是第二套插件调度器。[registry.test.ts](../../tools/lumino-host-probe/tests/registry.test.ts) 的 8 项测试确实覆盖空 manifest、必需/可选服务缺失、重复 provider、环、激活失败 UI 回滚、下游停用、缺停用钩子拒绝、并发单次激活。五组浏览器流程的[证据](../../tools/lumino-host-probe/evidence/browser-results.json)覆盖页面/组件贡献与视图关闭后业务继续；这是原型可行证据，不等于生产生命周期完整。

**后续产品化需补的具体边界：**

- `runtime()` 仅对传入数组预检重复 token；返回的 `registry` 可直接 `registerPlugin`，绕过该预检。若将来允许运行期扩展加载，应封装注册入口并拒绝冲突；当前静态 manifest 原型不受影响。
- `scoped.activate` 失败时会 `resources.dispose()`；但 `DisposableSet.dispose()` 按加入顺序调用，某项 dispose 抛错会中断后续释放，且掩盖原 activation 错误。当前测试仅覆盖不抛错的 UI 注册释放，未覆盖 cleanup 自身失败。
- 可选服务失败时 Lumino 给消费者 `null` 并继续；若提供者之后重试成功，已激活消费者不会自动收到新服务。需明确“可选能力只在激活时快照”还是由贡献 registry 动态订阅；当前 `models` 静态组合流程可用。
- `deactivatePlugin` 包含 optional 下游；当前测试只覆盖 required 下游，缺少“停用 composer 连带停用 models”的行为断言。源码保证其会连带，但 UI 是否符合预期仍需产品化定义。
- `scoped` 只收束加入 `owned` 的本地资源；[Shell](../../tools/lumino-host-probe/src/host/shell.tsx) 关闭 view 会卸载 React 组件，不会停用插件或结束[fixture](../../tools/lumino-host-probe/src/extensions/fixture.ts)业务执行，这与 S03/S10 的所需分界一致。扩展必须将要释放的 UI 订阅加入 owned；远端任务所有权另定。测试并未证明复杂远端取消/恢复语义。

选型建议：接受 `PluginRegistry` + React 薄壳作为当前可行底座，保留静态 manifest/重载式增删边界。下一步由 I 的 Electron 烟测确认桌面进程启动；若继续产品化，再补上述反例与清理契约。

## RA-003 — 收口补充 ACK

已读 I 的收口指令：将首轮复核整理为 `reports/RA-003-probe-review.md`，核对现有 Electron 证据，区分选型可行性与产品化待办，随后反馈 `READY_FOR_I`。本轮不启动或重跑测试，也不扩大检索。

## RA-003 — READY_FOR_I

收口报告已写：[RA-003 原型复核](reports/RA-003-probe-review.md)。结论：在固定启动 manifest、可信内置扩展范围内，`@lumino/coreutils` 的 `PluginRegistry` + React 薄壳可作为复用底座；源码中没有第二套插件依赖调度器，也未发现本次选型阻断项。证据包括[8 项 registry 测试](../../tools/lumino-host-probe/tests/registry.test.ts)、[五组浏览器记录](../../tools/lumino-host-probe/evidence/browser-results.json)及[Electron 烟测结果](../../tools/lumino-host-probe/evidence/electron-results.json)与[脚本](../../tools/lumino-host-probe/scripts/electron-smoke.cjs)。本轮仅核对已有证据，没有重跑。

产品化待办：封闭动态注册绕过冲突预检的入口；确保某个 disposer 抛错仍继续释放；确定 optional 服务恢复/连带停用策略；明确 UI 订阅与远端执行所有权；完成真实 IPC、恢复及生产沙箱/打包验证。Electron 记录使用测试专用 `--no-sandbox`；结果 JSON 只列空壳和两视图，模型停用断言由成功退出的烟测脚本支持，报告已标注此证据范围。

未决问题交 I：是否采纳该底座进入产品化，以及上述边界的优先级。下一步：等待 inbox 新指令；当前没有自动唤醒进程。
