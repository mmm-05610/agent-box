# Ordessa Desktop — 可加载扩展的最小宿主

当前分支 work/desktop-minimal-0。没有 Agent 业务包、旧 SDK 或旧 Desktop。
业务扩展不再通过修改应用源码集成：放入已构建的包、明确启用、重启即可。
默认没有启用任何扩展。

## 目录

```text
apps/desktop/
  electron/main.ts               窗口、受限 catalog IPC、协议接线
  electron/extensions.ts         本地发现、清单/启用配置校验、路径约束
  electron/extension-protocol.ts  扩展文件服务、import map、CSP
  electron/preload.ts            只提供 extensionCatalog.read()
  src/main.tsx                   加载插件、启动宿主、显示错误
  src/extensions.ts              读取清单并交给加载器，不硬编码业务
  src/shared/                    宿主统一提供的 React/API 模块入口
  src/app.tsx                    只挂载 Shell
  src/host.css                   空壳样式
  src/*.test.*                   宿主和加载边界测试
  scripts/                       构建、启动、Electron 验收
packages/
  desktop-host/                  Lumino 运行环境与通用 Shell
  extension-api/                 共享插件契约、Token、贡献表、scoped 清理
  extension-loader/              manifest 类型、模块加载、工厂校验
examples/
  hello-extension/               使用 React Hook 的独立页面
  service-provider/              服务与共享契约模块
  service-consumer/              从提供者的契约模块导入同一个 Token
  build.mjs                      只构建示例，不重建桌面
```

## 日常命令

```sh
npm ci
npm run typecheck
npm test
npm run build
npm start                       # 仅启动已构建产物，不重新构建
npm run dev                     # 开发宿主时使用：构建后启动
npm run build:examples          # 独立构建示例到 examples/dist
xvfb-run -a npm run test:electron
xvfb-run -a npm run test:extensions
```

最后一项在临时目录实测七种组合，并断言宿主 dist 的 SHA-256 全程不变。
不会安装示例到你的正式数据目录。烟测使用软件渲染和测试专用 --no-sandbox，
不代表生产 OS 沙箱通过验证；普通 start/dev 不关闭沙箱。

Ubuntu 首次 Electron 安装可能要求管理员设置 chrome-sandbox 的 root 所有权和
4755 权限；不要 sudo npm start，也不要全局关闭 AppArmor。

## 放入并启用一个扩展

先执行 npm run build 和 npm run build:examples，然后：

```sh
mkdir -p .local-desktop/extensions
cp -r examples/dist/example.hello .local-desktop/extensions/
```

新建 .local-desktop/extensions.json，内容：

```json
{"enabled":["example.hello"]}
```

执行 npm start 即可看到 Hello 页面，点击 Count 按钮验证 Hook 工作。
以后只改扩展包及启用配置，关闭桌面后再 npm start，无需重建宿主。
将 enabled 改为 [] 后重启，恢复空壳。不要在运行期间替换扩展文件。

start/dev 默认使用项目下 .local-desktop 保存扩展与启用配置（被 Git 忽略）；
Electron 浏览器数据仍使用一次性临时目录。
可用 ORDESSA_EXTENSION_HOME 指定另一个扩展数据目录。
直接启动打包应用时默认使用 Electron userData；这些启动路径不应混淆。

## 扩展包格式与构建契约

```text
extension-folder/
  manifest.json
  entry.js
  其他已打包的 JS、CSS、图片或共享契约模块
```

```json
{"id":"example.hello","version":"0.1.0","hostApi":"1","entry":"entry.js"}
```

入口是浏览器 ESM，默认导出 createPlugin(api)，返回一个 Lumino 插件。
plugin.id 必须与 manifest.id 相同；一个扩展包返回一个插件。
api.scoped() 管理登记的本地资源。业务依赖仍用 provides/requires/optional，
不再维护一套清单层的插件依赖调度器。

构建扩展时将以下依赖 external：
react、react/*、react-dom、react-dom/*、@ordessa/extension-api、@extensions/*。
当前宿主共享映射提供 react、react/jsx-runtime、react-dom、react-dom/client
和 @ordessa/extension-api；不承诺任意子路径都可用。
示例使用 esbuild 的 automatic JSX runtime，而不是开发 jsx-dev-runtime。

私有依赖随扩展打包；不可保留其他裸 npm 导入或引入 Node/Electron。
不要把 React 或公共 API 打包进每个扩展。
共享服务契约使用固定模块地址，例如：
@extensions/example.provider/contract.js。
提供者内部也必须导入同一个独立构建的 contract.js，不能各自内联一份 Token。
示例的 multi-entry/splitting 构建演示了这一点。

新增领域能力不需要增加宿主的固定共享映射：
共享领域契约跟随对应扩展包，通过 @extensions/<id>/... 地址加载。
契约包必须已安装并启用。禁用提供者不会自动启用它来满足其他插件。

## 边界与错误处理

- 发现不是执行。无启用配置或配置无效时，不执行任何扩展。
- 启用前检查清单、版本、相对入口；拒绝目录符号链接与文件越界。
- 文件协议只服务当前已批准的扩展根和构建目录；仅 GET、限定文件类型。
- preload 无任意读写、任意 IPC、凭据或网络桥，且主进程校验请求窗口/主 frame。
- 共享模块由 import map 指向一次拆分构建，React Hook 与 Token 身份在 Electron 实测。
- 重复包 ID/提供者拒绝，不以目录顺序选择赢家；坏模块不影响无关插件。
- 启用变更需重启；无市场、远程下载、自动更新或热卸载。
- 仅支持可信本地代码，所有扩展同进程/同源，不是恶意代码安全沙箱。
- 工厂/activate 应迅速返回。恶意同步死循环或永不完成的 Promise 不受此机制隔离。
- 安装目录必须只由可信用户维护；不承诺抵御并发替换文件的恶意本地写入者。
- 页面关闭不意味着插件停用或远端任务取消。

## 依赖与出处

Lumino：BSD-3-Clause；React/Electron：MIT。发布时保留许可证。
协议与桥分别采用 Electron 官方机制：
https://www.electronjs.org/docs/latest/api/protocol
https://www.electronjs.org/docs/latest/api/context-bridge
