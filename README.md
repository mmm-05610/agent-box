# Ordessa Desktop — 最小骨架

这是全新的空白分支 `work/desktop-minimal-0`，不包含旧 Desktop、旧 SDK、业务扩展或迁移副本。
源自原 `work/desktop-modular-v1` 中已验证的 Lumino 空宿主；原树及历史完整保留。
当前没有任何业务插件、服务实现或网络桥。

## 目录

```text
apps/desktop/
  electron/main.ts          仅窗口与桌面生命周期，无 preload
  src/main.tsx             创建宿主、启动清单、挂载 React
  src/extensions.ts        空的静态插件清单
  src/app.tsx              只挂载通用 Shell
  src/host.css             空壳样式
  src/host.test.tsx        六项宿主行为测试
  scripts/                 构建、开发启动、Electron 烟测
packages/desktop-host/
  src/runtime.ts           Lumino 封装、清单校验、资源清理
  src/contributions.ts     贡献注册与订阅
  src/shell.tsx            注册驱动的侧栏、页面与错误边界
  src/index.ts             公开入口
```

`apps/desktop` 选择启用哪些插件；`desktop-host` 不知道 agent、session、model 或协议。
支持静态插件装配、Token 服务依赖和页面贡献；尚无命令、快捷键、平台能力或第三方热安装。
插件依赖解析与激活由 Lumino 完成。只面向可信插件，不是安全隔离环境。

## 命令（全部在根目录）

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run dev
# 无显示器的原生启动检查
xvfb-run -a npm run test:electron
```

测试使用软件渲染及测试专用 --no-sandbox，不能代替生产 OS 沙箱验证。
正常 dev 不添加该参数。Ubuntu 首次安装的 Electron chrome-sandbox
可能需要本机管理员按报错配置 root 所有权及 4755 权限；不要 sudo npm run dev，
也不要为本项目全局关闭 AppArmor。npm 重新安装后应重新检查。

## 边界

- 默认扩展清单为空，增加页面不改 App/Shell。
- 固定启动清单，不暴露原始注册器或 deregister/force 热卸载。
- optional 服务在激活时解析，亦可能形成连带停用关系。
- Token 由公共契约提供同一个对象，不能用同名新对象替代。
- 资源清理逆序进行，某个 disposer 失败仍清理其他项并保留错误。
- 当前只做最小宿主；不承诺远端任务取消、重连或状态恢复。
- 引入业务时使用独立扩展包；不要将业务逻辑加进宿主。

Lumino 依赖采用 BSD-3-Clause；React/Electron 采用 MIT。发布时须保留依赖许可证。
