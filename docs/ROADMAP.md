# agent-box 发展路线

> 最后更新：2026-06-19

## 已完成

- [x] bwrap 内核级 CC 配置隔离（v2，替代 HOME 覆盖方案）
- [x] 54 内置 provider 模板 + 12 MCP server（从 cc-switch 移植）
- [x] 模板常量内置（去 init-template 依赖）
- [x] component 命令组（library.db + user_overrides）
- [x] `--provider` 热切换（apply_provider）
- [x] `--resume` 会话恢复
- [x] 从 cc-switch 导入 API key + 角色 CLAUDE.md
- [x] 去 `--cwd`，项目切换由 shell `cd` 负责
- [x] 替代 start_claude.sh（decision + dw 两个 profile）

## 待做

### P0 — 多框架启动器

- [ ] `agent-box codex <name>` — Codex bwrap 隔离启动
- [ ] `agent-box hermes <name>` — Hermes bwrap 隔离启动
- [ ] `agent-box opencode <name>` — OpenCode bwrap 隔离启动
- [ ] 替换 start_codex.sh、start_hermes.sh、start_opencode.sh

### P0 — 配置组件扩展

- [ ] Hooks 预设入库（安全拦截、自动格式化、会话收割）
- [ ] CLAUDE.md 模板入库（decision-maker、DW-executor、spec-writer）
- [ ] Plugin 组合预设（python-dev、superpowers、minimal）

### P1 — GUI

- [ ] NiceGUI 网页界面：provider 管理、profile 拼装、MCP 配置
- [ ] 对标 cc-switch 的图形化配置管理体验

### P1 — 多 Agent 协作

- [ ] `agent-box team` — tmux 布局启动多 Agent
- [ ] 替代 start_team.sh

### P2

- [ ] 会话历史管理
- [ ] Profile 导入/导出
- [ ] PyPI 发布
- [ ] Tab 补全
