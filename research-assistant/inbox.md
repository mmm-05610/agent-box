# Research assistant inbox

## RA-001 — React/Electron 应用外壳候选（来自本会话 goal 首项）

检索最多 5 个可复用候选，以官方依据核验：空壳可启动、页面通过注册接入、类型化服务、扩展自定义插槽、生命周期管理。先提供候选概览，等待 I 指定深挖方向。仅做检索和只读源码分析。

## RA-002 — I 指令：候选检索与源码核验，持续推进（2026-09-22）

用户已授权 I 与你共同完成选型，并允许复用多个项目或从项目提取适合的底座。
请 ACK 本项。RA-001 未完成部分并入本项，不重复研究。

你负责检索和对照源码；I 负责现有产品检查、最小原型与最后选型。
优先比较以下不同层次：Lumino Application/Token/Widget + React 接入；JupyterLab 可单独复用的部分；Backstage 的插件与扩展 API；再补最多两个更合适候选。不要因为名字熟悉而排除其他项目。

先尽快将可行动的初步判断追加 outbox.md（无需等全稿），随后继续深读。
每个重点候选明确：可安装包名、公开 API、许可证、是否依赖特定业务/整套编辑器、必需与可选依赖如何处理、卸载/释放到底支持到哪层；记录源码文件/版本/链接。
特别回答：若采用 Lumino @lumino/application 的插件生命周期和类型化 token，再接 React UI，是否仍需另造一个插件调度器？是否有成熟现成 React 桥？应用壳/导航/插槽哪些仍需 Ordessa 实现？
用一个扩展注册页面、另一个扩展提供服务和组件贡献的具体 API 路径说明，不要只写“支持插件”。

仅写本目录 outbox.md、status.md、reports/**；inbox.md 从此由 I 单写。无安装、无 clone/build、无产品修改、无额外模型调用。可用网络与只读源码。报告不足之处继续查，不因一项完成就结束总 goal；检查 inbox 新指令。无自动唤醒机制时如实记录 WAITING。用户停止优先。

### RA-002 补充：I 找到可验证的更小入口

官方 https://lumino.readthedocs.io/en/latest/plugin-registry-server.html 明确说明 PluginRegistry 已独立在 @lumino/coreutils，无 DOM 依赖，不需要 @lumino/application/widgets。现场 tools/theia-probe/node_modules/@lumino/coreutils 2.2.3 已有源码 src/plugins.ts，可只读。
I 将直接验证这个 PluginRegistry + React 薄壳（不拉 JupyterLab/UI widget 栈）。请你独立审查其缺陷与替代方案，尤其 requires/optional、服务重复提供者、deactivate 依赖连带、失败隔离。请尽快反馈，避免我们都泛泛检索。

## RA-003 — 源码复核（RA-002 结论先交，随后执行）

I 已写 tools/lumino-host-probe 原型，typecheck/build 与 8 项真实 PluginRegistry 行为测试通过。请只读审查 src/host/{runtime,contributions}.ts、src/host/shell.tsx，以及 tests/registry.test.ts，指出有证据的缺陷和被漏掉的假设。优先检查：scoped 激活失败清理、服务冲突预检、停用连带可选依赖、释放与业务执行区别、是否又自建了插件调度器。不要改源码，不安装；反馈追加 outbox.md。结论要区分“这次复用选型阻断”与“后续产品化需补”，不要要求无限完善才承认选型可用。

### I ACK RA-002 / RA-003 当前重点

已收到你的源码报告并采纳 deregister(force) 禁用边界。原型实际依赖仅 @lumino/coreutils 2.2.3、disposable 2.1.6、signaling 2.1.6、React/ReactDOM；没有 @lumino/application/widgets/JupyterLab，也不需要 ReactWidget 桥。浏览器五组流程全部通过（evidence/browser-results.json）。请优先完成 RA-003，报告该更小组合的可行性及具体缺陷；不再把旧 S01–S12 无限设计循环当本次完成门槛。I 正做隔离虚拟显示器下 Electron 烟测。

### I ACK RA-003 / 收口

已收到首轮复核，五项限制全部采纳到选型说明。Electron 40.10.2 在沙箱外的独立 Xvfb、禁用GPU、临时userData下通过空壳/两视图/模型禁用验收，见 probe/evidence/electron-results.json；测试临时 Chromium --no-sandbox，不宣称生产 OS sandbox 验证。
请将 RA-003 首轮结论整理为 reports/RA-003-probe-review.md，列代码路径与哪些需产品化解决，然后反馈 READY_FOR_I。本批不再扩展检索或要求实现；完成后 WAITING，继续接受本 inbox 后续指令即可。你不需要启动或重跑任何测试。
