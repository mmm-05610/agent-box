# 真实 UI 控件路径：探查结果（2026-09-15）

工具：`apps/desktop/e2e/p42-ui-recon.mjs`——启动构建产物（连着准备好的真实 Server），
可选按顺序点击若干按钮，然后转储界面上的角色/标签/可编辑区/输入件，用来"与人手路径对齐"。
**这是探查，不是门。**

## 已确证（`top-level.json`）

产品顶层控件：`Profiles`、**`Open folder`**、`Open remote folder`、`Settings`、`Choose a profile`、
`Gateway offline`。输入区是 `div[role=textbox][aria-label="Message"]`，且在未选工作区/角色时
`placeholder="Unavailable"`——**产品自己把"没有工作区/角色就不能发消息"表达在界面上**。

## 已确证（`settings.json`：`--click Settings`）

`#/settings` 打开成功，侧栏页签：`Models`、`Skills & MCP`、`Identities`、`Harnesses`、
`Data management`、`Appearance`、`Notifications`、`Keyboard Shortcuts`、`About`、`Search CtrlK`。

## 未确证（本轮到此为止）

- `--click 'Open folder'` 之后 **未出现**对话框（`dialogText`/`inputs` 皆空）；
- `--click Settings --click Models` 之后页面**未切换**（转储与仅点 Settings 相同）。

也就是说：**人手路径的入口存在且可达，但本轮没有走通它**。原因尚未诊断——可能是脚本点击落在
侧栏容器而非真正的触发器、或这些控件需要不同的交互（键盘/菜单语义）。**这不是产品缺陷的证据，
也不是产品可用的证据**；只是"我还没有把这条路径驱动起来"。

## 结论

真实 UI 控件路径**未验证**。已验证的是产品自己的传输路径（renderer bridge → IPC → main → Server）
与四家真实模型门、22 步无模型联调、重启门。两者不能互相替代。
