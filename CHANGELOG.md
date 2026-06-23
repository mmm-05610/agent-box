# Changelog

All notable changes to agent-box will be documented in this file.

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
