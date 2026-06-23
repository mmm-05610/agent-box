# agent-box 发展路线

> 最后更新：2026-06-22

## 已完成

- [x] bwrap 内核级配置隔离（CC/Codex/Hermes/OpenCode）
- [x] 多 agent type launch + extra args 透传
- [x] Windows 桌面 GUI（CustomTkinter，模块化 `gui/` 包）
- [x] GUI 设计系统：cc-switch / shadcn-ui Zinc 色板，自动字体检测
- [x] GUI 页面：Home、Profiles、Sessions、Settings、Help、CreationWizard
- [x] Profile detail 页：按 agent type 动态 tab
- [x] 数据层分离（gui/data.py + gui/config.py）
- [x] 暗/亮主题切换
- [x] CreationWizard 接通 `agent-box create` CLI
- [x] Detail 页配置编辑（settings.json / config.toml / opencode.jsonc 等）
- [x] Profile 删除功能（GUI 内联 + CLI --force）
- [x] Preset 系统（blank / decision-maker / python-dev / spec-writer）
- [x] Session 追踪（CLI sessions 子命令 + GUI 启动历史）
- [x] 会话历史管理（`agent-box sessions`）
- [x] PyPI 发布（v0.4.0）
- [x] 替代 start_claude.sh、start_codex.sh、start_hermes.sh、start_opencode.sh

## 待做

### P1 — 多 Agent 协作

- [ ] `agent-box team` — tmux 布局启动多 Agent
- [ ] 替代 start_team.sh

### P1 — Provider 系统

- [ ] Provider 管理界面
- [ ] `apply_provider` — 根据 meta.provider 自动配置 settings.json

### P2 — 配置组件生态

- [ ] Hooks 预设入库（安全拦截、自动格式化、会话收割）
- [ ] 非 CC 的 preset 支持（Hermes SOUL.md 等）
- [ ] Plugin 组合预设

### P2 — 运维

- [ ] Profile 导入/导出
- [ ] Tab 补全
