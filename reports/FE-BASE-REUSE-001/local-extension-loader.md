# 本地扩展加载 — 2026-09-22

用户批准将静态源码装配改为本地扩展加载。实现位于 desktop-minimal，
分支 work/desktop-minimal-0，提交 f387187c2e，提交后工作树干净；未推送。

新增 extension-api 与 extension-loader；Electron 扫描与约束路径，
preload 仅提供 catalog.read，受控 ordessa 协议提供模块和 import map。
React/API 使用共享拆分构建；示例以独立 ESM 构建，未作为应用依赖。
默认不启用扩展，配置明确列出 enabled；当前通过配置文件而非管理 UI 启用。
新增 npm start，只启动已构建产物。

## 验证

- typecheck、22 项单元/行为测试、build、build:examples、diff --check 通过。
- Electron 7 场景通过：空目录、未批准不执行、独立 Hook 页面、跨包 Token
  服务连接、重启后禁用、坏模块隔离、重复身份拒绝且无关服务仍可运行。
- 每个场景重启 Electron 并校验宿主 dist 摘要不变：
  11c7a33806a76b5f8acedc29a409347fb02febc10e50da15ca209e499439b38c。
- 页面 Hook 计数实际从 0 变为 1；独立服务消费者显示 Shared token connected。
- 所有场景 renderer 无 Node；桥只有 read。
- 首轮真实启动暴露 CommonJS export-star 未产生 ESM 具名导出，修为显式导出，
  最终构建重跑全部 Electron 场景通过。没有以类型检查代替加载验收。

测试在临时目录，Xvfb/软件渲染/测试专用 --no-sandbox。
仅适用于可信本地扩展：同源、同进程；不防恶意插件、挂死激活或安装目录的
恶意并发写入。无热安装、市场、自动更新；无业务后端和凭据访问。

用户操作入口：worktrees/desktop-minimal/README.md。
旧工作树不变。测试未将示例安装到用户的默认扩展目录。
