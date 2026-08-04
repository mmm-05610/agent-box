# agent-box 发展路线

> 最后更新：2026-08-04

## 产品定位

多 agent 配置管理器：为 claude / codex / hermes / opencode 提供**隔离的
profile 配置** + bwrap 启动隔离，通过 ACS 库（cc-switch fork）管理
provider / mcp / skills / prompts，双端使用：

- **CLI**（cmd2 上下文栈 REPL）— 主循环 / 一流工具：launch、list、
  apply、sessions。脚本化（`exec`）、`--json`、tab 补全。
- **GUI**（PyWebView + React）— 可视化配置 + 仪表盘：provider 表单、
  permissions 块、库浏览、运行状态看板。

**分工原则**：operate（launch/status/list/apply/sessions）做进 CLI；
config（结构化表单/库浏览/看板）做进 GUI。GUI 不抢 operate，CLI 不复刻
结构化表单。

## 已完成（截至 1.0）

### 核心

- [x] bwrap 内核级配置隔离（claude/codex/hermes/opencode，整目录覆盖）
- [x] 多 agent type launch + extra args 透传 + `--cwd` 后端解析
- [x] 替代 start_claude.sh / start_codex.sh / start_hermes.sh / start_opencode.sh

### 架构

- [x] 分层架构：`core/`（注册表/DB/io）+ `adapters/`（acs/models）+
      `resources/`（apply/CRUD）+ `cli/`
- [x] 声明式注册表 `core/agent_types.json` — **前端/CLI 零 agent 知识**
- [x] 声明式数据表 `core/provider_endpoints.json`（models endpoint 映射）
- [x] ACS 集成：库读取（providers/mcp/skills/prompts）+ apply 写入
- [x] Provider strategy dispatch（json_merge / multi_file / yaml_custom /
      jsonc_provider）

### CLI（cmd2 上下文栈 REPL）

- [x] `repl` / `exec` 双入口（脚本化：`;` 分隔、`#` 注释、piped stdin）
- [x] 全局命令：list / create / delete / show / configure / use / launch /
      sessions
- [x] profile 上下文：options / apply / remove / hooks / back
- [x] tab 补全、历史、`--json`（list/show/hooks）

### GUI（PyWebView + React）

- [x] 双模式 bridge（Windows 宿主 → WSL；Linux → 直接 import）
- [x] 页面：home 仪表盘 / profiles / detail（registry 动态 tab）/
      sessions / settings / help
- [x] 库浏览：provider / mcp / skills / prompts（搜索、详情、apply）
- [x] 资源编辑：provider 表单（models fetch、endpoint 测速）、permissions
      结构化块、Monaco JSON/YAML、hooks、memories、instructions
- [x] 版本号 / projects_dir / launch cwd 后端化
- [x] 运行状态：footer `● N running`（5s 轮询）+ 会话徽标
- [x] 中/英 i18n、暗/亮主题

### 质量

- [x] 冒烟测试（2026-08）挖出并修复 ~15 个 bug（UTC 时区、React #310、
      GBK 解码、UNC 路径、MCP NameError、sidebar 陈旧计数等）
- [x] 后端 129 tests + 前端 35 tests 全绿

## 待做

### P1 — CLI operate loop（"一流工具"）

- [ ] **工具质感**：全命令 `--json`；exec 模式无交互陷阱（`delete` 确认在
      exec 里不可答）；exit code 语义完整
- [ ] `status` 命令（running 计数、per-profile 上次启动）；`list sessions`
      补 PID/cwd/mode + RUNNING/EXITED 徽标
- [ ] ANSI 颜色/图标（纯 stdlib，非 TTY 自动禁用）
- [ ] 库浏览：`list providers/skills/prompts/mcp`（全局=库，profile=已应用）
- [ ] `list models` / `test <endpoint>`（复用 `fetch_models`/`test_endpoint`）

### P1 — 多 Agent 协作

- [ ] `agent-box team` — tmux 布局启动多 Agent
- [ ] 替代 start_team.sh

### P2 — 配置组件生态

- [ ] Profile import/export（tarball）
- [ ] plugins / permissions / rules / memories / instructions 的 CLI 视图
- [ ] Hooks 预设入库（安全拦截、自动格式化、会话收割）
- [ ] 非 claude 的 preset 支持（hermes SOUL.md 等）
- [ ] Plugin 组合预设
- [ ] Profile rename / duplicate / 批量操作
- [ ] 多级上下文栈（或 context 记忆）
