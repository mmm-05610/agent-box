# 最小前端底座：第一轮有限优化

日期：2026-09-22。目标树：worktrees/desktop-minimal，分支 work/desktop-minimal-0。
用户范围：先优化，不注册第一组业务内容；未动后端、旧 Desktop、发布 main 或凭据。

## 落地

- 每次激活由宿主创建资源作用域，原始插件也自动回收页面。scoped 不再是正确清理的前提。
- 插件仅拿 pages.add/resources.add，不能经上下文清空全局贡献；失败和停用关闭作用域，迟到资源立即释放。
- Shell 先挂载，插件状态可订阅。无关 autoStart 并发启动，依赖仍由 Lumino 解析；慢激活显示启动中。
- 模块/工厂并发加载，默认 5 秒截止；迟到结果忽略，不冒充取消底层工作。
- 示例共享 Token 从提供者移入独立契约包。消费者不变，移除旧提供者后切换替代实现成功。

## 本轮验证

- npm run typecheck：通过。
- npm test：27/27（含原始插件失败回滚、独立清理、迟到注册、并行激活、工厂截止反例）。
- npm run build / npm run build:examples：通过。
- xvfb-run -a npm run test:extensions：9/9 真实 Electron 场景通过。
- 安装/替换测试前后宿主 dist SHA-256 不变：3d249ac3ff7e6baddd10aa21ea532a855d43ef15911075750b3f0d3ea63186e4。
- 最初沙箱内 Electron 无法连接 X server；经批准在沙箱外以临时 Xvfb/临时数据目录重跑通过。
- git diff --check：通过。示例仅在测试临时目录安装，测试结束清除；未安装业务扩展。

## 不宣称

这是可信同进程扩展底座，不是恶意代码沙箱。同步死循环、模块顶层副作用、未登记资源不受隔离/回收保证。
工厂应保持纯定义；超时不取消 Promise。依赖慢服务的消费者仍须等待。
未做在途激活取消、热卸载、网络桥或 Agent 业务接入。普通桌面启动没有关闭 OS 沙箱。
