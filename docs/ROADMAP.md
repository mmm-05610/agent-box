# agent-box 发展路线

> 最后更新：2026-06-21

## 已完成

- [x] bwrap 内核级配置隔离（CC/Codex/Hermes/OpenCode）
- [x] 多 agent type launch + extra args 透传
- [x] Windows 桌面 GUI（CustomTkinter，模块化 `gui/` 包）
- [x] GUI 设计系统：cc-switch / shadcn-ui Zinc 色板，自动字体检测
- [x] GUI 页面：Home、Profiles、Sessions、Settings、Help、CreationWizard
- [x] Profile detail 页：按 agent type 动态 tab
- [x] 数据层分离（gui/data.py + gui/config.py）
- [x] 暗/亮主题切换
- [x] 替代 start_claude.sh、start_codex.sh、start_hermes.sh、start_opencode.sh
- [x] frontend-designer CC profile（MiMo v2.5-pro）

## 待做

### P1 — GUI 功能完善

- [ ] CreationWizard 接通 `agent-box create` CLI
- [ ] Detail 页配置编辑（settings.json / config.toml / opencode.jsonc 等）
- [ ] Profile 删除功能
- [ ] Provider 管理界面

### P1 — 多 Agent 协作

- [ ] `agent-box team` — tmux 布局启动多 Agent
- [ ] 替代 start_team.sh

### P2 — 配置组件生态

- [ ] Hooks 预设入库（安全拦截、自动格式化、会话收割）
- [ ] CLAUDE.md 模板入库（decision-maker、DW-executor、spec-writer、frontend-designer）
- [ ] Plugin 组合预设（python-dev、superpowers、minimal）

### P2 — 运维

- [ ] 会话历史管理
- [ ] Profile 导入/导出
- [ ] PyPI 发布
- [ ] Tab 补全
