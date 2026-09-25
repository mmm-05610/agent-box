# 基础扩展交付与审计结论

2026-09-22；desktop-minimal / work/desktop-minimal-0；前置基线 4405fb9986。
实施前审计见 foundation-preflight.md；本文件是工程结果，不是用户体验验收。
产品检查点：668aecff41，提交后产品工作树干净；control 报告单独保留，未夹带提交其他待处理材料。

## 结果

最小宿主已移除 pages 与内置工作台布局，只保留根界面与生命周期。实现独立 commands、workbench、settings 扩展和 foundation-contracts 工件。
五区域、整页、导航/工具栏/状态栏、设置分组/字段/自定义区块均从服务注册。forScope 自动归属调用者，失败与停用回收，迟到注册拒绝。
装配由 extensions/product.json 决定，经现有加载机制读入。用户配置完整覆盖默认值，空/坏配置不会回退启用。没有写用户本地配置。
API v2 显式拒绝旧 v1；所有仓内样例迁移且纳入类型检查。没有后端或 Agent 功能改动，没有新增运行时框架。

## 实测

| 验证 | 结果 |
|---|---|
| npm run typecheck | PASS，覆盖宿主、扩展、契约、示例 |
| npm test | 41 passed，3 files |
| npm run build / build:examples | PASS |
| test:extensions（真实 Electron） | 9 场景 PASS；宿主 dist 摘要安装前后不变 |
| test:foundations（真实 Electron） | 默认装配、全功能演示、显式空名单 3 组合 PASS |
| test:electron | 空宿主 PASS |
| git diff --check | PASS |

最终宿主 dist sha256：95d2fde73d047d32a6b35bad18a8a220fae5035b0b7d64c92dcf0be4640054ec。
基础扩展烟测逐项 true：背景 inert、返回按钮获焦、设置输入写入/回读、外部更新同步、失败提示、工作区计数状态保留、焦点恢复。
截图检查纠正了底栏超出窗口的问题；最终五区同屏、设置正文内部滚动，返回栏始终可达。
截图为临时测试工件：/tmp/ordessa-foundation-visual-1Npxa2/verified.png 及 verified.png.settings.png。
样例只放测试临时目录且完成后清除，不默认安装任何业务内容。

## 反例与修正

- 原始插件绕过 scoped：根贡献仍回收，坏根仍有诊断。
- 跨包贡献退出残留：四类服务登记均绑定调用者作用域，失败回滚由真实 runtime 驱动。
- 根抢占/重复 ID：明确拒绝，不覆盖原贡献。
- 设置读取乱序：代际令牌忽略旧结果；保存确认期间外部通知：补读，不吞掉更新。
- 保存失败：无成功提示，不自动重试；非法类型/非有限数/枚举越界：显式失败。
- 坏整页：内容报错不影响返回入口；删除整页贡献：自动退回保留的工作区。
- 慢扩展/坏模块/替换提供者：保留上一轮真实 Electron 回归并通过。

## 对“基础是否稳定”的回答

对已讨论的会话列表、对话、详情、日志、设置等用例，新增内容只消费基础契约，不需要修改宿主。
未来快捷键/命令面板可以消费 Commands；复杂业务渲染器可由业务服务提供注册表；调整布局属于 workbench，设置存储属于提供者。
这支持短期保持宿主边界稳定，不代表契约永久冻结或证明所有未来场景。

明确未交付：网络/文件原生桥、凭据、配置持久化、热卸载 UI、多实例/分屏/拖拽/布局存储、恶意代码隔离、在途执行取消。
普通区域关闭/切换会卸载；整页覆盖不卸载背景。设置外部更新会替换未保存草稿，不做自动冲突合并。烟测用测试专用 --no-sandbox，不能据此声称生产 OS 沙箱验收。

## 用户试用

在 worktrees/desktop-minimal 执行 npm start（已构建）即可查看空工作台和设置页。
按 README 可选安装 foundation-demo，验证五区域与设置控件；不要把内存演示当持久化功能。
本轮仅本地检查点，无 push、无发布 main 合并、无真实服务启停、未动凭据或其他工作树。
