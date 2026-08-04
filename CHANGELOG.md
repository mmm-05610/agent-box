# Changelog

All notable changes to agent-box will be documented in this file.

## [1.0.0] — 2026-08-04

### Added

- **cmd2 上下文栈 REPL** — 替代 flat argparse。双入口：交互 `repl` + 脚本
  `exec "use x; apply provider y; launch"`（`;` 分隔、`#` 注释、piped
  stdin）。`use <profile>` 进入 `[name:type]>` profile 上下文；tab 补全、
  历史、自动建议。
- **分层架构** — `core/`（注册表/DB/io）+ `adapters/`（acs/models）+
  `resources/`（apply/CRUD）+ `cli/`。
- **声明式注册表 `core/agent_types.json`** — 前端/CLI 零 agent 知识：
  页面结构、tab、图标、默认值全部由后端注册表驱动。
- **Provider 系统** — strategy dispatch（json_merge / multi_file /
  yaml_custom / jsonc_provider）+ ACS 库集成（providers / mcp / skills /
  prompts 只读查询 + apply 写入）。
- **声明式数据表 `core/provider_endpoints.json`** — provider base_url →
  /models endpoint 映射；`adapters/models.py` `fetch_models`。
- **GUI 前端重构** — registry 动态 tab、库浏览（搜索/详情/apply）、
  provider 表单（models fetch、endpoint 测速）、permissions 结构化块、
  hooks / memories / instructions 编辑器、中/英 i18n、运行状态看板
  （footer 5s 轮询）。
- **后端化** — 版本号（`__version__`）、projects_dir（gui-settings.json
  持久化）、launch `--cwd` 后端解析、acs_binary（env → PyInstaller →
  submodule）、home_dir（`~/...` 显示）。

### Changed

- **CLI 重写** — argparse 平铺子命令 → cmd2 REPL；`cc/codex/hermes/
opencode` 快捷命令合并为 `launch`。
- **默认 projects_dir `~/projects` → `~/`**；路径显示 home-relative
  （`/home/<user>/...` → `~/...`）。
- **Session 时间按 UTC 存储/解析**（`datetime('now')` = UTC）。
- **bridge 双模式** — Windows 宿主经 `wsl.exe`（确定性路径转换），
  Linux/WSL 直接 import。
- **死测试清理** — `tests/test_wsl_io.py`（指向已删除的 `gui.wsl`，破坏
  pytest collection）移除；根 `.gitignore` 补 `node_modules/`。

### Fixed

- 冒烟测试（2026-08）~15 个 bug：会话时间 8h 偏移（UTC 解析）、detail 页
  React #310（条件 hook）、Windows GBK 解码、UNC 路径转换、MCP summary
  NameError、sidebar 运行计数陈旧、launch cwd 引号处理、MCP installed
  skills "expecting value" 等。

## [0.5.0] — 2026-06-27

### Added

- **New GUI frontend (gui-web)** — complete React + Vite + Tailwind CSS 4 + PyWebView rewrite replacing the old CustomTkinter desktop GUI.
  - 6 pages: Home, Profiles, Library, Sessions, Settings, Help.
  - Profile detail page with per-agent-type tabs (settings, hooks, auth, CLAUDE.md).
  - Profile launch with mode selector (new session / continue) and working directory input.
  - Library page with cc-switch style provider cards, category badges, and collapsible add panel.
  - Settings page with configurable projects directory.
  - Native folder browse dialog via PyWebView.
  - Last CWD per profile inferred from session history.
  - Bridge API connecting React frontend to WSL CLI via subprocess.
- **`--prod` / frozen detection** — bridge auto-serves built frontend in production mode; detects PyInstaller bundle via `sys.frozen`.

### Changed

- **Desktop packaging switched to gui-web** — PyInstaller spec now uses `gui-web/bridge.py` as entry point instead of `gui-redesign.py`.
- **Sidebar brand area** — replaced placeholder icon with actual Agent Box logo.

### Removed

- **Old CustomTkinter GUI** — `gui-redesign.py` and `gui/` package are superseded by gui-web. The old PyWebView-unaware implementation is no longer packaged.

### Fixed

- PyWebView bridge: WSL command quoting, async API polling, CLI syntax for sessions, snake_case conversion.
- Library: category inference from settings values, badge display, import paths.
- Detail page: hooks/plugins read from correct settings.json fields, sidebar nav closes detail page.

## [0.4.0] — 2026-06-22

### Added

- **Preset system** — shipped CC presets (`blank`, `decision-maker`, `python-dev`, `spec-writer`) with `--preset` flag. Presets bundle `CLAUDE.md`, `hooks.json`, and `settings.overlay.json`; the overlay is deep-merged onto the template's `settings.json`.
- **`agent-box sessions`** — launch history tracking with `--json`, `--active`, `--cleanup`, and `--exit` flags. Sessions are recorded automatically on each launch.
- **`--version` flag** — prints the installed version.
- **Windows desktop GUI** — modular CustomTkinter GUI (`gui/` package) with profile management, raw-config editing, creation wizard, session history, dark/light themes.
- **Detail page** — per-agent-type tabbed editor for settings, hooks, auth, CLAUDE.md with staleness detection and Ctrl+S save.
- **Profile metadata** — `meta.yaml` now carries optional `display_name`, `description`, `provider`, and `preset` fields (forward/back compatible).
- **zero Python runtime dependencies** for the CLI.

### Changed

- **Config isolation hardened** — corrected template files for `cc`, `codex`, and `hermes` agent types. Deep-merge now preserves sibling keys (e.g. preset's `permissions.allow` no longer erases template's `permissions.deny`).
- **Agent type registry** — `library.py` is now the single source of truth for config dirs, binaries, and data dirs. Removed duplicate fallback data from `config.py`.
- **Session tracking migrated** — from `gui/state.py` (Windows SQLite) to `src/agent_box/sessions.py` (WSL SQLite), with CLI `sessions` subcommand. GUI now calls `wsl.exe agent-box sessions` instead of managing its own database.
- **ROADMAP updated** — reflects v0.4.0 completion status.
- **Documentation** — README, README_CN, ARCHITECTURE, and CLAUDE.md updated for v0.4.0.

### Removed

- `gui-windows.py` — replaced by `gui-redesign.py` + `gui/` package.
- `launch-gui.bat` / `launch-gui.ps1` — replaced by desktop `AgentBox.bat`.
- `DW-PROMPT.md` — one-shot DW task description, executed and obsolete.
- Duplicate `config_dir` / `binary` / `data_dir` fallbacks in `config.py`.
- `gui/state.py` — replaced by `src/agent_box/sessions.py`.

### Fixed

- `__version__` now dynamically reads from `pyproject.toml` (was hardcoded `0.2.0`).
- `gui/wsl.py` — extracted `_wsl_run` / `_wsl_check_output` / `_wsl_try_output` helpers, eliminating 200+ lines of duplicated subprocess code.
- `gui/wsl.py` `create_profile` now passes `--preset` to CLI (was silently dropped).
- Type annotation: `load_meta` return type now accurately reflects optional fields (empty string sentinel instead of `None` to avoid `Optional[str]` drift).
- `gui/app.py` — removed duplicate error popup on launch failure; narrowed exception handling.
